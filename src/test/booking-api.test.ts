import { afterEach, describe, expect, it, vi } from "vitest";

import {
  handleCatalog,
  handleCreateBooking,
  handleCreateQuote,
  rejectCrossOriginRequest,
  type BookingDatabase,
} from "@/lib/booking-api";
import { createBookingPaymentToken } from "@/lib/razorpay";

function queryBuilder(result: { data: unknown; error: unknown }, calls: unknown[] = []) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "or", "order", "ilike", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder["maybeSingle"] = async () => result;
  builder["then"] = (resolve: (value: typeof result) => unknown) =>
    Promise.resolve(result).then(resolve);
  return builder;
}

function makeDatabase(
  options: {
    tableResults?: Record<string, { data: unknown; error: unknown }>;
    rpc?: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  } = {},
) {
  const calls: { from: string; operations: unknown[] }[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const database = {
    from(table: string) {
      const operations: unknown[] = [];
      calls.push({ from: table, operations });
      const result = options.tableResults?.[table] ?? { data: [], error: null };
      return queryBuilder(result, operations);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return options.rpc ? options.rpc(name, args) : { data: [], error: null };
    },
  };
  return { database: database as unknown as BookingDatabase, calls, rpcCalls };
}

const quotePayload = {
  tripType: "local",
  packageTier: "4hr_40km",
  originCityId: "00000000-0000-4000-8000-000000000004",
  originAddress: "Mumbai Airport Terminal 1, Mumbai",
  originLocationId: "00000000-0000-4000-8000-000000000001",
  destinationCityId: "00000000-0000-4000-8000-000000000004",
  destinationAddress: "BKC, Mumbai",
  destinationLocationId: "00000000-0000-4000-8000-000000000005",
  pickupAt: new Date(Date.now() + 86_400_000).toISOString(),
  vehicleCategoryId: "00000000-0000-4000-8000-000000000002",
  passengerCount: 2,
};

const bookingPayload = {
  quoteId: "00000000-0000-4000-8000-000000000003",
  customer: {
    fullName: "Guest Customer",
    email: "GUEST@example.com",
    phone: "+91 98765 43210",
    countryCode: "in",
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("catalog endpoints", () => {
  it("returns active catalog records and applies active filtering", async () => {
    const { database, calls } = makeDatabase({
      tableResults: { countries: { data: [{ id: "country-1", name: "India" }], error: null } },
    });
    const response = await handleCatalog(
      new Request("https://site.test/api/v1/catalog/countries"),
      "countries",
      database,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ id: "country-1", name: "India" }] });
    expect(calls[0]?.operations).toContainEqual(["eq", "is_active", true]);
  });

  it("does not query child records for an inactive country", async () => {
    const { database, calls } = makeDatabase({
      tableResults: { countries: { data: null, error: null } },
    });
    const response = await handleCatalog(
      new Request(
        "https://site.test/api/v1/catalog/regions?country_id=00000000-0000-4000-8000-000000000001",
      ),
      "regions",
      database,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_location" } });
    expect(calls.map((call) => call.from)).toEqual(["countries"]);
  });

  it("does not expose arbitrary protected table lookups", async () => {
    const { database, calls } = makeDatabase();
    const response = await handleCatalog(
      new Request("https://site.test/api/v1/catalog/customers"),
      "customers",
      database,
    );
    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("searches only active bookable locations and bounds the result count", async () => {
    const { database, calls } = makeDatabase({
      tableResults: {
        locations: { data: [{ id: "location-1", name: "Mumbai Airport T2" }], error: null },
      },
    });
    const response = await handleCatalog(
      new Request("https://site.test/api/v1/catalog/locations?search=Mumbai%20Airport"),
      "locations",
      database,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [{ id: "location-1", name: "Mumbai Airport T2" }],
    });
    expect(calls[0]?.operations).toContainEqual(["eq", "is_active", true]);
    expect(calls[0]?.operations).toContainEqual(["eq", "cities.is_active", true]);
    expect(calls[0]?.operations).toContainEqual(["eq", "cities.countries.is_active", true]);
    expect(calls[0]?.operations).toContainEqual(["ilike", "name", "%Mumbai Airport%"]);
    expect(calls[0]?.operations).toContainEqual(["limit", 10]);
  });

  it("reads pricing classification from the active vehicle catalog", async () => {
    const cityId = "00000000-0000-4000-8000-000000000001";
    const { database, calls } = makeDatabase({
      tableResults: {
        cities: { data: { id: cityId }, error: null },
        city_vehicle_categories: {
          data: [
            {
              vehicle_category_id: "00000000-0000-4000-8000-000000000002",
              vehicle_categories: {
                id: "00000000-0000-4000-8000-000000000002",
                pricing_type: "unclassified",
              },
            },
          ],
          error: null,
        },
      },
    });

    const response = await handleCatalog(
      new Request(
        `https://site.test/api/v1/catalog/vehicle-categories?city_id=${cityId}&pickup_at=${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`,
      ),
      "vehicle-categories",
      database,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ vehicle_categories: { pricing_type: "unclassified" } }],
    });
    const vehicleQuery = calls.find((call) => call.from === "city_vehicle_categories");
    const includesPricingType = vehicleQuery?.operations.some(
      (operation) =>
        Array.isArray(operation) &&
        operation[0] === "select" &&
        typeof operation[1] === "string" &&
        operation[1].includes("pricing_type"),
    );
    expect(includesPricingType).toBe(true);
  });

  it("logs redacted Supabase diagnostics while returning a generic database error", async () => {
    const supabaseUrl = "https://example.supabase.co";
    const configuredSupabaseUrl = ` ${supabaseUrl}/ `;
    const secretCanary = "diagnostic-canary-value-not-for-logs";
    vi.stubEnv("SUPABASE_URL", configuredSupabaseUrl);
    vi.stubEnv("SUPABASE_SECRET_KEY", secretCanary);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-key-canary-value");
    vi.stubEnv("NETLIFY", "true");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const { database } = makeDatabase({
      tableResults: {
        countries: {
          data: null,
          error: {
            code: "PGRST301",
            message: `Request to ${configuredSupabaseUrl}: Authorization: Bearer ${secretCanary}`,
          },
        },
      },
    });

    const response = await handleCatalog(
      new Request("https://site.test/api/v1/catalog/countries"),
      "countries",
      database,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "internal_server_error", message: "The request could not be completed." },
    });
    expect(errorLog).toHaveBeenCalledOnce();
    const diagnostic = JSON.parse(String(errorLog.mock.calls[0]?.[1])) as Record<string, unknown>;
    expect(diagnostic).toMatchObject({
      area: "catalog.countries",
      platform: "netlify",
      supabase_url_configured: true,
      supabase_url_matches_expected: false,
      supabase_url_length: configuredSupabaseUrl.length,
      supabase_url_has_leading_whitespace: true,
      supabase_url_has_trailing_whitespace: true,
      supabase_url_has_trailing_slash: true,
      supabase_url_protocol: "https:",
      supabase_url_hostname: "example.supabase.co",
      supabase_url_pathname: "/",
      supabase_url_trimmed_matches_expected: false,
      supabase_key_configured: true,
      selected_key_type: "SUPABASE_SECRET_KEY",
      supabase_error_code: "PGRST301",
    });
    const serializedDiagnostic = JSON.stringify(diagnostic);
    expect(serializedDiagnostic).toContain("[REDACTED]");
    expect(serializedDiagnostic).not.toContain(supabaseUrl);
    expect(serializedDiagnostic).not.toContain(secretCanary);
    expect(serializedDiagnostic).not.toContain("legacy-key-canary-value");
    expect(serializedDiagnostic).not.toContain(configuredSupabaseUrl);
  });

  it("logs fetch cause fields and probes Supabase without credentials", async () => {
    const supabaseUrl = "https://example.supabase.co";
    const serviceKeyCanary = "service-role-canary-never-log";
    vi.stubEnv("SUPABASE_URL", supabaseUrl);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", serviceKeyCanary);
    vi.stubEnv("NETLIFY", "true");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const probe = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.supabase.co/rest/v1/");
      expect(init?.headers).toBeUndefined();
      return new Response(null, { status: 401 });
    });
    vi.stubGlobal("fetch", probe);
    const { database } = makeDatabase({
      tableResults: {
        countries: {
          data: null,
          error: {
            name: "TypeError",
            message: "fetch failed",
            cause: {
              name: "Error",
              code: "EAI_AGAIN",
              message: "getaddrinfo EAI_AGAIN example.supabase.co",
              errno: -3001,
              syscall: "getaddrinfo",
              hostname: "example.supabase.co",
            },
          },
        },
      },
    });

    const response = await handleCatalog(
      new Request("https://site.test/api/v1/catalog/countries"),
      "countries",
      database,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "internal_server_error", message: "The request could not be completed." },
    });
    expect(probe).toHaveBeenCalledOnce();
    const diagnostic = JSON.parse(String(errorLog.mock.calls[0]?.[1])) as Record<string, unknown>;
    expect(diagnostic).toMatchObject({
      supabase_url_matches_expected: false,
      selected_key_type: "SUPABASE_SERVICE_ROLE_KEY",
      supabase_error_name: "TypeError",
      supabase_error_cause_name: "Error",
      supabase_error_cause_code: "EAI_AGAIN",
      supabase_error_cause_errno: -3001,
      supabase_error_cause_syscall: "getaddrinfo",
      supabase_error_cause_hostname: "example.supabase.co",
      supabase_transport_classification: "dns_resolution_failure",
      supabase_connectivity_probe: { result: "http_response_received", status: 401 },
    });
    const serializedDiagnostic = JSON.stringify(diagnostic);
    expect(serializedDiagnostic).not.toContain(supabaseUrl);
    expect(serializedDiagnostic).not.toContain(serviceKeyCanary);
  });

  it("does not expose locations beneath a city with an inactive country", async () => {
    const { database, calls } = makeDatabase({
      tableResults: {
        cities: { data: { id: "city-1", country_id: "country-1", region_id: null }, error: null },
        countries: { data: null, error: null },
      },
    });
    const response = await handleCatalog(
      new Request(
        "https://site.test/api/v1/catalog/locations?city_id=00000000-0000-4000-8000-000000000001",
      ),
      "locations",
      database,
    );
    expect(response.status).toBe(404);
    expect(calls.map((call) => call.from)).toEqual(["cities", "countries"]);
  });
});

describe("quote endpoint", () => {
  const routeResolver = vi.fn().mockResolvedValue({ distanceKm: 12.4, durationHours: 0.6 });
  it("allows same-origin POSTs and rejects cross-origin browser requests", async () => {
    const sameOrigin = new Request("https://site.test/api/v1/quotes", {
      method: "POST",
      headers: { origin: "https://site.test", "content-type": "application/json" },
      body: JSON.stringify(quotePayload),
    });
    expect(rejectCrossOriginRequest(sameOrigin)).toBeNull();

    const crossOrigin = new Request("https://site.test/api/v1/quotes", {
      method: "POST",
      headers: {
        origin: "https://attacker.test",
        "sec-fetch-site": "cross-site",
        "content-type": "application/json",
      },
      body: JSON.stringify(quotePayload),
    });
    const response = rejectCrossOriginRequest(crossOrigin);
    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({ error: { code: "invalid_request" } });
  });

  it("returns the database-calculated quote and never accepts a client price", async () => {
    const { database, rpcCalls } = makeDatabase({
      tableResults: {
        quotes: {
          data: { created_at: "2026-10-25T10:00:00Z", expires_at: "2026-10-25T10:15:00Z" },
          error: null,
        },
      },
      rpc: async () => ({
        data: [
          {
            result_status: "CREATED",
            quote_id: "quote-1",
            pricing: { components: { subtotal: 1000, tax: 180, total: 1180 } },
          },
        ],
        error: null,
      }),
    });
    const response = await handleCreateQuote(
      new Request("https://site.test/api/v1/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(quotePayload),
      }),
      database,
      routeResolver,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      quoteId: "quote-1",
      pricing: { components: { total: 1180 } },
    });
    expect(rpcCalls[0]?.name).toBe("create_booking_quote_from_addresses");
    expect(rpcCalls[0]?.args).not.toHaveProperty("p_total_amount");
    expect(rpcCalls[0]?.args).toMatchObject({
      p_origin_city_id: quotePayload.originCityId,
      p_origin_address: quotePayload.originAddress,
      p_route_distance_km: null,
      p_route_estimated_duration_hours: 0.6,
    });

    const manipulated = await handleCreateQuote(
      new Request("https://site.test/api/v1/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...quotePayload, totalAmount: 1 }),
      }),
      database,
      routeResolver,
    );
    expect(manipulated.status).toBe(400);
    expect(rpcCalls).toHaveLength(1);

    const suppliedRouteMetrics = await handleCreateQuote(
      new Request("https://site.test/api/v1/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...quotePayload,
          estimatedDistanceKm: 9000,
          estimatedDurationHours: 700,
        }),
      }),
      database,
      routeResolver,
    );
    expect(suppliedRouteMetrics.status).toBe(400);
    expect(rpcCalls).toHaveLength(1);
  });

  it("maps unavailable online pricing to its stable error code", async () => {
    const { database, calls, rpcCalls } = makeDatabase({
      rpc: async () => ({ data: [{ result_status: "ONLINE_PRICING_UNAVAILABLE" }], error: null }),
    });
    const response = await handleCreateQuote(
      new Request("https://site.test/api/v1/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(quotePayload),
      }),
      database,
      routeResolver,
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "online_pricing_unavailable" } });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.name).toBe("create_booking_quote_from_addresses");
    expect(calls.some((call) => call.from === "quotes")).toBe(false);
  });

  it("does not trust browser coordinates or route metrics and only passes server route metrics", async () => {
    const resolver = vi.fn().mockResolvedValue({ distanceKm: 31.25, durationHours: 1.2 });
    const { database, rpcCalls } = makeDatabase({
      rpc: async () => ({ data: [{ result_status: "ONLINE_PRICING_UNAVAILABLE" }], error: null }),
    });
    const response = await handleCreateQuote(
      new Request("https://site.test/api/v1/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...quotePayload,
          tripType: "outstation",
          packageTier: "outstation",
        }),
      }),
      database,
      resolver,
    );
    expect(response.status).toBe(422);
    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({ originAddress: quotePayload.originAddress }),
      database,
    );
    expect(rpcCalls[0]?.args).toMatchObject({
      p_route_distance_km: 31.25,
      p_route_estimated_duration_hours: 1.2,
    });
    expect(rpcCalls[0]?.args).not.toHaveProperty("p_estimated_duration_hours");
  });

  it("fails closed when a custom address cannot be validated without creating a quote", async () => {
    const resolver = vi.fn().mockRejectedValue(new Error("private provider detail"));
    const { database, calls, rpcCalls } = makeDatabase();
    const response = await handleCreateQuote(
      new Request("https://site.test/api/v1/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...quotePayload,
          originLocationId: undefined,
          destinationLocationId: undefined,
        }),
      }),
      database,
      resolver,
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: "invalid_location" } });
    expect(JSON.stringify(body)).not.toContain("private provider detail");
    expect(rpcCalls).toHaveLength(0);
    expect(calls.some((call) => call.from === "quotes")).toBe(false);
  });

  it("keeps catalog bookings compatible until the additive address migration is installed", async () => {
    const { database, rpcCalls } = makeDatabase({
      rpc: async (name) =>
        name === "create_booking_quote_from_addresses"
          ? {
              data: null,
              error: { code: "PGRST202", message: "Function not found in schema cache" },
            }
          : {
              data: [{ result_status: "ONLINE_PRICING_UNAVAILABLE" }],
              error: null,
            },
    });
    const response = await handleCreateQuote(
      new Request("https://site.test/api/v1/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(quotePayload),
      }),
      database,
      routeResolver,
    );

    expect(response.status).toBe(422);
    expect(rpcCalls.map((call) => call.name)).toEqual([
      "create_booking_quote_from_addresses",
      "create_booking_quote",
    ]);
    expect(rpcCalls[1]?.args).toMatchObject({
      p_estimated_distance_km: null,
      p_estimated_duration_hours: null,
    });
  });

  it("does not claim custom-address quote success before the migration is installed", async () => {
    const { database, rpcCalls } = makeDatabase({
      rpc: async () => ({
        data: null,
        error: { code: "PGRST202", message: "Function not found in schema cache" },
      }),
    });
    const response = await handleCreateQuote(
      new Request("https://site.test/api/v1/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...quotePayload,
          originLocationId: undefined,
          destinationLocationId: undefined,
        }),
      }),
      database,
      routeResolver,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "online_pricing_unavailable" },
    });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.name).toBe("create_booking_quote_from_addresses");
  });
});

describe("booking endpoint", () => {
  it("creates a pending booking from a quote and reuses the same idempotent result", async () => {
    const paymentSecret = "booking-token-test-secret";
    vi.stubEnv("RAZORPAY_KEY_SECRET", paymentSecret);
    const { database, rpcCalls } = makeDatabase({
      rpc: async () => ({
        data: [
          {
            result_status: "CREATED",
            booking: {
              id: "booking-1",
              status: "payment_pending",
              paymentStatus: "pending",
              total: 1180,
            },
          },
        ],
        error: null,
      }),
    });
    const response = await handleCreateBooking(
      new Request("https://site.test/api/v1/bookings", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "retry-key-123" },
        body: JSON.stringify(bookingPayload),
      }),
      database,
    );
    expect(response.status).toBe(201);
    const createdBody = (await response.json()) as { booking: { paymentAccessToken: string } };
    expect(createdBody).toMatchObject({
      replayed: false,
      booking: { status: "payment_pending", paymentStatus: "pending", total: 1180 },
    });
    expect(createdBody.booking.paymentAccessToken).toBe(
      createBookingPaymentToken("booking-1", paymentSecret),
    );
    expect(JSON.stringify(createdBody)).not.toContain(paymentSecret);
    expect(rpcCalls[0]?.name).toBe("create_booking_from_quote");
    expect(rpcCalls[0]?.args).not.toHaveProperty("amount");
    expect(rpcCalls[0]?.args["p_email"]).toBe("guest@example.com");

    const replayDatabase = makeDatabase({
      rpc: async () => ({
        data: [
          { result_status: "REPLAYED", booking: { id: "booking-1", status: "payment_pending" } },
        ],
        error: null,
      }),
    });
    const replay = await handleCreateBooking(
      new Request("https://site.test/api/v1/bookings", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "retry-key-123" },
        body: JSON.stringify(bookingPayload),
      }),
      replayDatabase.database,
    );
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as { booking: { paymentAccessToken: string } };
    expect(replayBody).toMatchObject({ replayed: true, booking: { id: "booking-1" } });
    expect(replayBody.booking.paymentAccessToken).toBe(createdBody.booking.paymentAccessToken);
  });

  it("rejects caller-supplied pricing and maps expired quote responses", async () => {
    const database = makeDatabase({
      rpc: async () => ({ data: [{ result_status: "QUOTE_EXPIRED" }], error: null }),
    });
    const manipulated = await handleCreateBooking(
      new Request("https://site.test/api/v1/bookings", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "retry-key-123" },
        body: JSON.stringify({ ...bookingPayload, totalAmount: 1 }),
      }),
      database.database,
    );
    expect(manipulated.status).toBe(400);
    expect(database.rpcCalls).toHaveLength(0);

    const expired = await handleCreateBooking(
      new Request("https://site.test/api/v1/bookings", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "retry-key-123" },
        body: JSON.stringify(bookingPayload),
      }),
      database.database,
    );
    expect(expired.status).toBe(409);
    expect(await expired.json()).toMatchObject({ error: { code: "quote_expired" } });
  });

  it("rejects a reused key with a different request", async () => {
    const { database } = makeDatabase({
      rpc: async () => ({ data: [{ result_status: "IDEMPOTENCY_CONFLICT" }], error: null }),
    });
    const response = await handleCreateBooking(
      new Request("https://site.test/api/v1/bookings", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "retry-key-123" },
        body: JSON.stringify(bookingPayload),
      }),
      database,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "idempotency_conflict" } });
  });
});
