import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export type BookingDatabase = SupabaseClient;

const uuid = z.string().uuid();
const packageTiers = [
  "4hr_40km",
  "8hr_80km",
  "12hr_120km",
  "outstation",
  "airport_transfer",
  "point_to_point",
  "custom",
] as const;
const tripTypes = ["local", "outstation", "airport_transfer", "point_to_point", "tour"] as const;

const QuoteRequestSchema = z
  .object({
    tripType: z.enum(tripTypes),
    packageTier: z.enum(packageTiers),
    originLocationId: uuid,
    destinationCityId: uuid.optional(),
    destinationLocationId: uuid.optional(),
    pickupAt: z.string().datetime({ offset: true }),
    vehicleCategoryId: uuid,
    passengerCount: z.number().int().min(1).max(50),
    tripDays: z.number().int().min(1).max(30).default(1),
    estimatedDistanceKm: z.number().finite().min(0).max(10_000).optional(),
    estimatedDurationHours: z.number().finite().min(0).max(720).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const validPackageByTrip: Record<(typeof tripTypes)[number], readonly string[]> = {
      local: ["4hr_40km", "8hr_80km", "12hr_120km", "custom"],
      outstation: ["outstation", "custom"],
      airport_transfer: ["airport_transfer", "custom"],
      point_to_point: ["point_to_point", "custom"],
      tour: ["custom"],
    };
    if (!validPackageByTrip[value.tripType].includes(value.packageTier)) {
      ctx.addIssue({
        code: "custom",
        path: ["packageTier"],
        message: "Package tier does not match trip type",
      });
    }
    const pickupAt = Date.parse(value.pickupAt);
    if (pickupAt <= Date.now() || pickupAt > Date.now() + 366 * 24 * 60 * 60 * 1000) {
      ctx.addIssue({
        code: "custom",
        path: ["pickupAt"],
        message: "Pickup must be within the next 366 days",
      });
    }
  });

const BookingRequestSchema = z
  .object({
    quoteId: uuid,
    customer: z
      .object({
        fullName: z.string().trim().min(1).max(120),
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((value) => value.toLowerCase()),
        phone: z
          .string()
          .trim()
          .min(7)
          .max(32)
          .regex(/^[+0-9().\-\s]+$/)
          .refine((value) => value.replace(/\D/g, "").length >= 7),
        countryCode: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{2}$/)
          .optional(),
        companyName: z.string().trim().min(1).max(160).optional(),
      })
      .strict(),
    specialInstructions: z.string().trim().max(1000).optional(),
  })
  .strict();

type ApiErrorCode =
  | "invalid_request"
  | "invalid_location"
  | "vehicle_unavailable"
  | "online_pricing_unavailable"
  | "quote_expired"
  | "quote_already_claimed"
  | "quote_not_found"
  | "idempotency_conflict"
  | "internal_server_error";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function error(code: ApiErrorCode, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

function databaseFailure(): Response {
  return error("internal_server_error", "The request could not be completed.", 500);
}

export function rejectCrossOriginRequest(request: Request): Response | null {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  const origin = request.headers.get("origin");
  if (fetchSite === "cross-site") {
    return error("invalid_request", "Cross-origin requests are not allowed.", 403);
  }
  if (origin !== null) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return error("invalid_request", "Cross-origin requests are not allowed.", 403);
      }
    } catch {
      return error("invalid_request", "Cross-origin requests are not allowed.", 403);
    }
  }
  return null;
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new RequestValidationError();
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 12_000) throw new RequestValidationError();
  const text = await request.text();
  if (text.length > 12_000) throw new RequestValidationError();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestValidationError();
  }
}

class RequestValidationError extends Error {}

export function createBookingDatabase(
  env: Record<string, string | undefined> = process.env,
): BookingDatabase {
  const url = env["SUPABASE_URL"];
  const key = env["SUPABASE_SECRET_KEY"] ?? env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Supabase server credentials are not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function activeParent(
  database: BookingDatabase,
  table: "countries" | "cities",
  id: string,
): Promise<boolean> {
  const columns = table === "cities" ? "id,country_id,region_id" : "id";
  const { data, error: dbError } = await database
    .from(table)
    .select(columns)
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (dbError) throw dbError;
  if (!data) return false;
  if (table === "countries") return true;

  const city = data as unknown as { country_id: string; region_id: string | null };
  if (!(await activeParent(database, "countries", city.country_id))) return false;
  if (!city.region_id) return true;
  const { data: region, error: regionError } = await database
    .from("regions")
    .select("id")
    .eq("id", city.region_id)
    .eq("country_id", city.country_id)
    .eq("is_active", true)
    .maybeSingle();
  if (regionError) throw regionError;
  return Boolean(region);
}

function parseUuidParam(value: string | null): string | null {
  return value && uuid.safeParse(value).success ? value : null;
}

export async function handleCatalog(
  request: Request,
  resource: string,
  database: BookingDatabase,
): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    if (resource === "countries") {
      const { data, error: dbError } = await database
        .from("countries")
        .select("id,iso2,iso3,name,currency_code")
        .eq("is_active", true)
        .order("name");
      if (dbError) throw dbError;
      return json({ data: data ?? [] });
    }

    if (resource === "regions") {
      const countryId = parseUuidParam(params.get("country_id"));
      if (!countryId) return error("invalid_request", "A valid country_id is required.", 400);
      if (!(await activeParent(database, "countries", countryId)))
        return error("invalid_location", "The selected country is unavailable.", 404);
      const { data, error: dbError } = await database
        .from("regions")
        .select("id,country_id,kind,code,name")
        .eq("country_id", countryId)
        .eq("is_active", true)
        .order("name");
      if (dbError) throw dbError;
      return json({ data: data ?? [] });
    }

    if (resource === "cities") {
      const countryId = parseUuidParam(params.get("country_id"));
      const regionValue = params.get("region_id");
      if (!countryId || (regionValue && !parseUuidParam(regionValue))) {
        return error("invalid_request", "Valid country_id and region_id values are required.", 400);
      }
      if (!(await activeParent(database, "countries", countryId)))
        return error("invalid_location", "The selected country is unavailable.", 404);
      let query = database
        .from("cities")
        .select("id,country_id,region_id,name,slug,timezone")
        .eq("country_id", countryId)
        .eq("is_active", true);
      if (regionValue) {
        const { data: region, error: regionError } = await database
          .from("regions")
          .select("id")
          .eq("id", regionValue)
          .eq("country_id", countryId)
          .eq("is_active", true)
          .maybeSingle();
        if (regionError) throw regionError;
        if (!region) return error("invalid_location", "The selected region is unavailable.", 404);
        query = query.eq("region_id", regionValue);
      } else {
        const { data: regions, error: regionsError } = await database
          .from("regions")
          .select("id")
          .eq("country_id", countryId)
          .eq("is_active", true);
        if (regionsError) throw regionsError;
        const activeRegionIds = (regions ?? []).map((region) => region.id as string);
        const activeRegionFilter = activeRegionIds.length
          ? `region_id.is.null,region_id.in.(${activeRegionIds.join(",")})`
          : "region_id.is.null";
        query = query.or(activeRegionFilter);
      }
      const { data, error: dbError } = await query.order("name");
      if (dbError) throw dbError;
      return json({ data: data ?? [] });
    }

    if (resource === "locations") {
      const cityId = parseUuidParam(params.get("city_id"));
      if (!cityId) return error("invalid_request", "A valid city_id is required.", 400);
      if (!(await activeParent(database, "cities", cityId)))
        return error("invalid_location", "The selected city is unavailable.", 404);
      const { data, error: dbError } = await database
        .from("locations")
        .select("id,city_id,kind,name,address,latitude,longitude")
        .eq("city_id", cityId)
        .eq("is_active", true)
        .order("name");
      if (dbError) throw dbError;
      return json({ data: data ?? [] });
    }

    if (resource === "vehicle-categories") {
      const cityId = parseUuidParam(params.get("city_id"));
      if (!cityId) return error("invalid_request", "A valid city_id is required.", 400);
      if (!(await activeParent(database, "cities", cityId)))
        return error("invalid_location", "The selected city is unavailable.", 404);
      const pickupAtParam = params.get("pickup_at");
      const pickupAt = pickupAtParam ? Date.parse(pickupAtParam) : Date.now();
      if (
        !Number.isFinite(pickupAt) ||
        pickupAt < Date.now() ||
        pickupAt > Date.now() + 366 * 24 * 60 * 60 * 1000
      ) {
        return error(
          "invalid_request",
          "pickup_at must be a valid future date within 366 days.",
          400,
        );
      }
      const availabilityAt = new Date(pickupAt).toISOString();
      const { data, error: dbError } = await database
        .from("city_vehicle_categories")
        .select(
          "city_id,vehicle_category_id,is_available,valid_from,valid_until,vehicle_categories!inner(id,code,name,passenger_capacity,luggage_capacity,display_order)",
        )
        .eq("city_id", cityId)
        .eq("is_available", true)
        .eq("vehicle_categories.is_active", true)
        .or(`valid_from.is.null,valid_from.lte.${availabilityAt}`)
        .or(`valid_until.is.null,valid_until.gt.${availabilityAt}`)
        .order("display_order", { referencedTable: "vehicle_categories" });
      if (dbError) throw dbError;
      return json({ data: data ?? [] });
    }

    return error("invalid_request", "Unknown catalog resource.", 404);
  } catch {
    return databaseFailure();
  }
}

function packageTierCompatible(tripType: string, packageTier: string): boolean {
  const mapping: Record<string, readonly string[]> = {
    local: ["4hr_40km", "8hr_80km", "12hr_120km", "custom"],
    outstation: ["outstation", "custom"],
    airport_transfer: ["airport_transfer", "custom"],
    point_to_point: ["point_to_point", "custom"],
    tour: ["custom"],
  };
  return mapping[tripType]?.includes(packageTier) ?? false;
}

export async function handleCreateQuote(
  request: Request,
  database: BookingDatabase,
): Promise<Response> {
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return error("invalid_request", "Request body must be valid JSON under 12 KB.", 400);
  }
  const parsed = QuoteRequestSchema.safeParse(body);
  if (
    !parsed.success ||
    !packageTierCompatible(parsed.data?.tripType ?? "", parsed.data?.packageTier ?? "")
  ) {
    return error(
      "invalid_request",
      "The quote request contains invalid or unsupported fields.",
      400,
    );
  }
  const input = parsed.data;
  try {
    const { data, error: dbError } = await database.rpc("create_booking_quote", {
      p_trip_type: input.tripType,
      p_package_tier: input.packageTier,
      p_origin_location_id: input.originLocationId,
      p_destination_city_id: input.destinationCityId ?? null,
      p_destination_location_id: input.destinationLocationId ?? null,
      p_pickup_at: input.pickupAt,
      p_vehicle_category_id: input.vehicleCategoryId,
      p_passenger_count: input.passengerCount,
      p_trip_days: input.tripDays,
      p_estimated_distance_km: input.estimatedDistanceKm ?? null,
      p_estimated_duration_hours: input.estimatedDurationHours ?? null,
    });
    if (dbError) throw dbError;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) return databaseFailure();
    if (result.result_status !== "CREATED") {
      const responses: Record<string, { code: ApiErrorCode; message: string; status: number }> = {
        INVALID_REQUEST: {
          code: "invalid_request",
          message: "The quote request is invalid.",
          status: 400,
        },
        INVALID_LOCATION: {
          code: "invalid_location",
          message: "A selected location is unavailable.",
          status: 404,
        },
        VEHICLE_UNAVAILABLE: {
          code: "vehicle_unavailable",
          message: "That vehicle category is unavailable for this city and date.",
          status: 409,
        },
        ONLINE_PRICING_UNAVAILABLE: {
          code: "online_pricing_unavailable",
          message: "Online pricing is unavailable for this trip.",
          status: 422,
        },
        DISTANCE_REQUIRED: {
          code: "invalid_request",
          message: "Estimated distance is required for this rate.",
          status: 400,
        },
        DURATION_REQUIRED: {
          code: "invalid_request",
          message: "Estimated duration is required for this rate.",
          status: 400,
        },
      };
      const mapped = responses[result.result_status] ?? {
        code: "internal_server_error",
        message: "The request could not be completed.",
        status: 500,
      };
      return error(mapped.code, mapped.message, mapped.status);
    }
    const { data: quote, error: quoteError } = await database
      .from("quotes")
      .select("created_at,expires_at")
      .eq("id", result.quote_id)
      .maybeSingle();
    if (quoteError || !quote) throw quoteError ?? new Error("Quote could not be retrieved");
    return json(
      {
        quoteId: result.quote_id,
        createdAt: quote.created_at,
        expiresAt: quote.expires_at,
        pricing: result.pricing,
      },
      201,
    );
  } catch {
    return databaseFailure();
  }
}

export async function handleCreateBooking(
  request: Request,
  database: BookingDatabase,
): Promise<Response> {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 255) {
    return error("invalid_request", "A valid Idempotency-Key header is required.", 400);
  }
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return error("invalid_request", "Request body must be valid JSON under 12 KB.", 400);
  }
  const parsed = BookingRequestSchema.safeParse(body);
  if (!parsed.success)
    return error(
      "invalid_request",
      "Booking details are invalid or contain unsupported fields.",
      400,
    );
  const input = parsed.data;
  const hashBytes = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(input)),
  );
  const requestHash = [...new Uint8Array(hashBytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  try {
    const { data, error: dbError } = await database.rpc("create_booking_from_quote", {
      p_quote_id: input.quoteId,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
      p_full_name: input.customer.fullName,
      p_email: input.customer.email,
      p_phone: input.customer.phone,
      p_country_code: input.customer.countryCode ?? null,
      p_company_name: input.customer.companyName ?? null,
      p_special_instructions: input.specialInstructions ?? null,
    });
    if (dbError) throw dbError;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) return databaseFailure();
    if (result.result_status === "CREATED")
      return json({ booking: result.booking, replayed: false }, 201);
    if (result.result_status === "REPLAYED")
      return json({ booking: result.booking, replayed: true }, 200);
    const responses: Record<string, { code: ApiErrorCode; message: string; status: number }> = {
      INVALID_REQUEST: {
        code: "invalid_request",
        message: "Booking details are invalid.",
        status: 400,
      },
      QUOTE_EXPIRED: {
        code: "quote_expired",
        message: "This quote has expired. Request a new quote.",
        status: 409,
      },
      QUOTE_ALREADY_CLAIMED: {
        code: "quote_already_claimed",
        message: "This quote can no longer be used.",
        status: 409,
      },
      QUOTE_NOT_FOUND: {
        code: "quote_not_found",
        message: "The selected quote was not found.",
        status: 404,
      },
      IDEMPOTENCY_CONFLICT: {
        code: "idempotency_conflict",
        message: "This Idempotency-Key was already used for a different request.",
        status: 409,
      },
      IN_PROGRESS: {
        code: "internal_server_error",
        message: "The request could not be completed. Retry with the same Idempotency-Key.",
        status: 503,
      },
    };
    const mapped = responses[result.result_status] ?? {
      code: "internal_server_error",
      message: "The request could not be completed.",
      status: 500,
    };
    return error(mapped.code, mapped.message, mapped.status);
  } catch {
    return databaseFailure();
  }
}

export function createServerDatabaseForRequest(): BookingDatabase {
  let database: BookingDatabase | undefined;
  return new Proxy({} as BookingDatabase, {
    get(_target, property) {
      database ??= createBookingDatabase(process.env);
      const value: unknown = Reflect.get(database, property, database);
      return typeof value === "function" ? value.bind(database) : value;
    },
  });
}
