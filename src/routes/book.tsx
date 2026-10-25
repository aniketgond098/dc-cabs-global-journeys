import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { PaymentCheckout } from "@/components/booking/PaymentCheckout";

type Country = { id: string; name: string; iso2: string; currency_code: string | null };
type Region = { id: string; name: string; country_id: string };
type City = { id: string; name: string; country_id: string; region_id: string | null };
type Location = { id: string; name: string; city_id: string; kind: string };
type VehicleCategory = {
  city_id: string;
  vehicle_categories: {
    id: string;
    code: string;
    name: string;
    passenger_capacity: number;
    luggage_capacity: number;
  };
};
type Quote = {
  quoteId: string;
  expiresAt: string;
  pricing: {
    currency?: string;
    components?: Record<string, number | string | null>;
    inputs?: Record<string, number | null>;
  };
};
type Booking = {
  id: string;
  bookingReference: string;
  currency: string;
  total: number;
  paymentAccessToken: string;
  customer: { fullName: string; email: string; phone: string };
};

const inputClass =
  "mt-2 w-full border border-border bg-background px-4 py-3 text-sm text-foreground";
const tripOptions = [
  ["local", "Local"],
  ["outstation", "Outstation"],
  ["airport_transfer", "Airport transfer"],
  ["point_to_point", "Point to point"],
  ["tour", "Tour"],
] as const;
const packageOptions: Record<string, readonly [string, string][]> = {
  local: [
    ["4hr_40km", "4 hours · 40 km"],
    ["8hr_80km", "8 hours · 80 km"],
    ["12hr_120km", "12 hours · 120 km"],
    ["custom", "Custom"],
  ],
  outstation: [
    ["outstation", "Outstation"],
    ["custom", "Custom"],
  ],
  airport_transfer: [
    ["airport_transfer", "Airport transfer"],
    ["custom", "Custom"],
  ],
  point_to_point: [
    ["point_to_point", "Point to point"],
    ["custom", "Custom"],
  ],
  tour: [["custom", "Custom"]],
};

async function catalog<T>(resource: string, params: Record<string, string> = {}): Promise<T[]> {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/v1/catalog/${resource}${query.size ? `?${query}` : ""}`);
  const result = (await response.json()) as { data?: T[]; error?: { message?: string } };
  if (!response.ok || !Array.isArray(result.data))
    throw new Error(result.error?.message ?? "Booking options could not be loaded.");
  return result.data;
}

function useCatalog<T>(resource: string, params: Record<string, string>, enabled: boolean) {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState("");
  const signature = JSON.stringify(params);
  useEffect(() => {
    let current = true;
    setItems([]);
    setError("");
    if (enabled) {
      void catalog<T>(resource, JSON.parse(signature) as Record<string, string>)
        .then((data) => {
          if (current) setItems(data);
        })
        .catch((cause: unknown) => {
          if (current)
            setError(
              cause instanceof Error ? cause.message : "Booking options could not be loaded.",
            );
        });
    }
    return () => {
      current = false;
    };
  }, [resource, signature, enabled]);
  return { items, error };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      {label}
      {children}
    </label>
  );
}

function Select<T extends { id: string; name: string }>(props: {
  label: string;
  value: string;
  items: T[];
  disabled?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={props.label}>
      <select
        className={inputClass}
        value={props.value}
        disabled={props.disabled}
        required={props.required}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">Choose {props.label.toLowerCase()}</option>
        {props.items.map((item) => (
          <option value={item.id} key={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

export const Route = createFileRoute("/book")({ component: BookingPage });

function BookingPage() {
  const [tripType, setTripType] = useState("local");
  const [packageTier, setPackageTier] = useState("4hr_40km");
  const [originCountry, setOriginCountry] = useState("");
  const [originRegion, setOriginRegion] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [originLocation, setOriginLocation] = useState("");
  const [destinationCountry, setDestinationCountry] = useState("");
  const [destinationRegion, setDestinationRegion] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [destinationLocation, setDestinationLocation] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [estimatedDistanceKm, setEstimatedDistanceKm] = useState("");
  const [estimatedDurationHours, setEstimatedDurationHours] = useState("");
  const [tripDays, setTripDays] = useState("1");
  const [passengers, setPassengers] = useState("1");
  const [vehicleId, setVehicleId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  useEffect(() => {
    let current = true;
    void catalog<Country>("countries")
      .then((data) => {
        if (current) setCountries(data);
      })
      .catch((cause: unknown) => {
        if (current)
          setCatalogError(
            cause instanceof Error ? cause.message : "Booking options could not be loaded.",
          );
      });
    return () => {
      current = false;
    };
  }, []);

  const originRegions = useCatalog<Region>(
    "regions",
    { country_id: originCountry },
    Boolean(originCountry),
  );
  const originCities = useCatalog<City>(
    "cities",
    { country_id: originCountry, ...(originRegion ? { region_id: originRegion } : {}) },
    Boolean(originCountry),
  );
  const originLocations = useCatalog<Location>(
    "locations",
    { city_id: originCity },
    Boolean(originCity),
  );
  const destinationRegions = useCatalog<Region>(
    "regions",
    { country_id: destinationCountry },
    Boolean(destinationCountry),
  );
  const destinationCities = useCatalog<City>(
    "cities",
    {
      country_id: destinationCountry,
      ...(destinationRegion ? { region_id: destinationRegion } : {}),
    },
    Boolean(destinationCountry),
  );
  const destinationLocations = useCatalog<Location>(
    "locations",
    { city_id: destinationCity },
    Boolean(destinationCity),
  );
  const pickupAt = useMemo(() => {
    if (!pickupDate || !pickupTime) return "";
    const date = new Date(`${pickupDate}T${pickupTime}`);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }, [pickupDate, pickupTime]);
  const categories = useCatalog<VehicleCategory>(
    "vehicle-categories",
    { city_id: originCity, pickup_at: pickupAt },
    Boolean(originCity && pickupAt),
  );
  const selectableCategories = categories.items
    .map((entry) => entry.vehicle_categories)
    .filter(Boolean);
  const anyCatalogError =
    catalogError ||
    originRegions.error ||
    originCities.error ||
    originLocations.error ||
    destinationRegions.error ||
    destinationCities.error ||
    destinationLocations.error ||
    categories.error;
  const pricingLines = quote?.pricing.components
    ? Object.entries(quote.pricing.components).filter(([key]) => key !== "taxRatePercent")
    : [];
  const includedPackage = {
    "4hr_40km": "4 hours and 40 km",
    "8hr_80km": "8 hours and 80 km",
    "12hr_120km": "12 hours and 120 km",
  }[packageTier];

  function clearQuote() {
    setQuote(null);
    setBooking(null);
    setIdempotencyKey("");
    setMessage("");
  }

  async function requestQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearQuote();
    if (!pickupAt) {
      setMessage("Choose a valid pickup date and time.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/v1/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tripType,
          packageTier,
          originLocationId: originLocation,
          ...(destinationCity ? { destinationCityId: destinationCity } : {}),
          ...(destinationLocation ? { destinationLocationId: destinationLocation } : {}),
          pickupAt,
          vehicleCategoryId: vehicleId,
          passengerCount: Number(passengers),
          tripDays: Number(tripDays),
          ...(estimatedDistanceKm !== ""
            ? { estimatedDistanceKm: Number(estimatedDistanceKm) }
            : {}),
          ...(estimatedDurationHours !== ""
            ? { estimatedDurationHours: Number(estimatedDurationHours) }
            : {}),
        }),
      });
      const result = (await response.json()) as
        Quote | { error?: { code?: string; message?: string } };
      if (!response.ok || !("quoteId" in result)) {
        const apiError = "error" in result ? result.error : undefined;
        if (apiError?.code === "online_pricing_unavailable") {
          setMessage(
            "Online pricing is unavailable for this journey yet. Request a quote from our team.",
          );
        } else
          setMessage(
            apiError?.message ?? "A quote could not be created. Check your journey details.",
          );
        return;
      }
      setQuote(result);
    } catch {
      setMessage("A quote could not be created. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmBooking() {
    if (!quote || busy) return;
    const key = idempotencyKey || crypto.randomUUID();
    setIdempotencyKey(key);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/bookings", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          customer: {
            fullName: name,
            email,
            phone,
            ...(company.trim() ? { companyName: company.trim() } : {}),
          },
        }),
      });
      const result = (await response.json()) as {
        booking?: Booking;
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !result.booking)
        throw new Error(result.error?.message ?? "The booking could not be created.");
      if (!result.booking.paymentAccessToken)
        throw new Error(
          "Secure online payment is not configured yet. Contact our team to complete this booking.",
        );
      setBooking({
        ...result.booking,
        customer: { fullName: name, email, phone },
      });
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "The booking could not be created. Retry safely.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!countries.length && !catalogError) {
    return (
      <section className="container-x min-h-[70vh] py-28">
        <p className="eyebrow text-primary">DC Cabs · Booking</p>
        <h1 className="mt-5 max-w-3xl font-display text-5xl font-bold uppercase">
          Plan your journey
        </h1>
        <p className="mt-6 max-w-2xl text-muted-foreground">
          Online booking locations are not available yet. Our team can still help plan your journey.
        </p>
        <Link
          to="/contact"
          className="mt-8 inline-block bg-primary px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground"
        >
          Request a quote
        </Link>
      </section>
    );
  }

  return (
    <section className="container-x min-h-[70vh] py-24 md:py-28">
      <p className="eyebrow text-primary">DC Cabs · Booking</p>
      <h1 className="mt-5 max-w-3xl font-display text-5xl font-bold uppercase">
        Plan your journey
      </h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Choose your route and travel details. The fare comes from our booking service after you
        request a quote.
      </p>
      {anyCatalogError ? (
        <p role="alert" className="mt-6 border border-destructive/50 p-4 text-sm">
          {anyCatalogError}
        </p>
      ) : null}
      {booking ? (
        <div className="mt-10 max-w-xl">
          <PaymentCheckout booking={booking} />
        </div>
      ) : (
        <form
          className="mt-10 grid max-w-5xl gap-10"
          onSubmit={(event) => void requestQuote(event)}
        >
          <fieldset className="grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
            <legend className="eyebrow pr-4 text-primary">Trip</legend>
            <Field label="Trip type">
              <select
                className={inputClass}
                value={tripType}
                onChange={(event) => {
                  setTripType(event.target.value);
                  const next = packageOptions[event.target.value]?.[0]?.[0] ?? "custom";
                  setPackageTier(next);
                  clearQuote();
                }}
              >
                {tripOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Trip package">
              <select
                className={inputClass}
                value={packageTier}
                onChange={(event) => {
                  setPackageTier(event.target.value);
                  clearQuote();
                }}
              >
                {(packageOptions[tripType] ?? []).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Select
              label="Origin country"
              value={originCountry}
              items={countries}
              required
              onChange={(value) => {
                setOriginCountry(value);
                setOriginRegion("");
                setOriginCity("");
                setOriginLocation("");
                setVehicleId("");
                clearQuote();
              }}
            />
            <Select
              label="Origin region / state (optional)"
              value={originRegion}
              items={originRegions.items}
              disabled={!originCountry || !originRegions.items.length}
              onChange={(value) => {
                setOriginRegion(value);
                setOriginCity("");
                setOriginLocation("");
                setVehicleId("");
                clearQuote();
              }}
            />
            <Select
              label="Origin city"
              value={originCity}
              items={originCities.items}
              disabled={!originCountry}
              required
              onChange={(value) => {
                setOriginCity(value);
                setOriginLocation("");
                setVehicleId("");
                clearQuote();
              }}
            />
            <Select
              label="Origin location"
              value={originLocation}
              items={originLocations.items}
              disabled={!originCity}
              required
              onChange={(value) => {
                setOriginLocation(value);
                clearQuote();
              }}
            />
            <Select
              label="Destination country"
              value={destinationCountry}
              items={countries}
              required
              onChange={(value) => {
                setDestinationCountry(value);
                setDestinationRegion("");
                setDestinationCity("");
                setDestinationLocation("");
                clearQuote();
              }}
            />
            <Select
              label="Destination region / state (optional)"
              value={destinationRegion}
              items={destinationRegions.items}
              disabled={!destinationCountry || !destinationRegions.items.length}
              onChange={(value) => {
                setDestinationRegion(value);
                setDestinationCity("");
                setDestinationLocation("");
                clearQuote();
              }}
            />
            <Select
              label="Destination city"
              value={destinationCity}
              items={destinationCities.items}
              disabled={!destinationCountry}
              required
              onChange={(value) => {
                setDestinationCity(value);
                setDestinationLocation("");
                clearQuote();
              }}
            />
            <Select
              label="Destination location (optional)"
              value={destinationLocation}
              items={destinationLocations.items}
              disabled={!destinationCity}
              onChange={(value) => {
                setDestinationLocation(value);
                clearQuote();
              }}
            />
            <Field label="Pickup date">
              <input
                className={inputClass}
                type="date"
                required
                min={new Date().toISOString().slice(0, 10)}
                value={pickupDate}
                onChange={(event) => {
                  setPickupDate(event.target.value);
                  setVehicleId("");
                  clearQuote();
                }}
              />
            </Field>
            <Field label="Pickup time">
              <input
                className={inputClass}
                type="time"
                required
                value={pickupTime}
                onChange={(event) => {
                  setPickupTime(event.target.value);
                  setVehicleId("");
                  clearQuote();
                }}
              />
            </Field>
            <Field label="Passengers">
              <input
                className={inputClass}
                type="number"
                min="1"
                max="50"
                required
                value={passengers}
                onChange={(event) => {
                  setPassengers(event.target.value);
                  clearQuote();
                }}
              />
            </Field>
            {tripType === "outstation" || tripType === "tour" ? (
              <Field label="Trip days">
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  max="30"
                  required
                  value={tripDays}
                  onChange={(event) => {
                    setTripDays(event.target.value);
                    clearQuote();
                  }}
                />
              </Field>
            ) : null}
            <Field label="Estimated distance (km)">
              <input
                className={inputClass}
                type="number"
                min="0"
                step="0.1"
                required={tripType === "local" || tripType === "outstation"}
                value={estimatedDistanceKm}
                onChange={(event) => {
                  setEstimatedDistanceKm(event.target.value);
                  clearQuote();
                }}
              />
            </Field>
            {tripType === "local" ? (
              <Field label="Estimated duration (hours)">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.1"
                  required
                  value={estimatedDurationHours}
                  onChange={(event) => {
                    setEstimatedDurationHours(event.target.value);
                    clearQuote();
                  }}
                />
              </Field>
            ) : null}
            <Field label="Vehicle category">
              <select
                className={inputClass}
                required
                value={vehicleId}
                disabled={!selectableCategories.length}
                onChange={(event) => {
                  setVehicleId(event.target.value);
                  clearQuote();
                }}
              >
                <option value="">
                  {originCity && pickupAt
                    ? "Choose vehicle category"
                    : "Choose origin and pickup time first"}
                </option>
                {selectableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} · up to {category.passenger_capacity} passengers
                  </option>
                ))}
              </select>
            </Field>
          </fieldset>
          <fieldset className="grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
            <legend className="eyebrow pr-4 text-primary">Customer</legend>
            <Field label="Full name">
              <input
                className={inputClass}
                autoComplete="name"
                maxLength={120}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                type="tel"
                autoComplete="tel"
                maxLength={32}
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
            <Field label="Company (optional)">
              <input
                className={inputClass}
                autoComplete="organization"
                maxLength={160}
                value={company}
                onChange={(event) => setCompany(event.target.value)}
              />
            </Field>
          </fieldset>
          {!quote ? (
            <button
              type="submit"
              disabled={busy || Boolean(anyCatalogError)}
              className="w-fit bg-primary px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Requesting quote…" : "Get a quote"}
            </button>
          ) : (
            <div className="border border-border bg-charcoal p-6">
              <p className="eyebrow text-primary">
                Server quote · expires {new Date(quote.expiresAt).toLocaleString()}
              </p>
              {includedPackage ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Package includes {includedPackage}.
                </p>
              ) : null}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {pricingLines.map(([key, value]) => (
                  <p
                    key={key}
                    className="flex justify-between gap-4 border-b border-border/60 py-2 text-sm"
                  >
                    <span>
                      {key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (letter) => letter.toUpperCase())}
                    </span>
                    <span>
                      {value == null
                        ? "—"
                        : `${quote.pricing.currency ?? ""} ${Number(value).toFixed(2)}`}
                    </span>
                  </p>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void confirmBooking()}
                disabled={busy}
                className="mt-6 bg-primary px-6 py-4 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Creating booking…" : "Confirm booking and continue to payment"}
              </button>
            </div>
          )}
          {message ? (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
              {message.includes("Request a quote") ? (
                <>
                  {" "}
                  <Link to="/contact" className="underline">
                    Contact our team
                  </Link>
                  .
                </>
              ) : null}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
