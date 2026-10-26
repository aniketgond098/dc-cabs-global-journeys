import { useEffect, useRef, useState } from "react";

export type JourneyLocation = {
  id?: string;
  cityId?: string;
  label: string;
  context: string;
  coordinates: [number, number];
  bookable: boolean;
};

type CatalogLocation = {
  id: string;
  city_id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

type MapboxSuggestion = {
  mapbox_id: string;
  name: string;
  full_address?: string;
  place_formatted?: string;
};

const MAPBOX_TOKEN = import.meta.env["VITE_MAPBOX_ACCESS_TOKEN"];

function distanceKm(a: [number, number], b: [number, number]) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const [lonA, latA] = a;
  const [lonB, latB] = b;
  const dLat = radians(latB - latA);
  const dLon = radians(lonB - lonA);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function findCatalogMatch(query: string, point: [number, number]) {
  const params = new URLSearchParams({ search: query });
  const response = await fetch(`/api/v1/catalog/locations?${params}`);
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: CatalogLocation[] };
  const candidates = (body.data ?? []).filter(
    (entry) => entry.latitude !== null && entry.longitude !== null,
  );
  const closest = candidates
    .map((entry) => ({
      entry,
      distance: distanceKm(point, [Number(entry.longitude), Number(entry.latitude)]),
    }))
    .sort((a, b) => a.distance - b.distance)[0];
  return closest && closest.distance <= 0.1 ? closest.entry : null;
}

export function LocationSearch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: JourneyLocation | null;
  onChange: (location: JourneyLocation | null) => void;
}) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [catalogLocations, setCatalogLocations] = useState<CatalogLocation[]>([]);
  const [suggestions, setSuggestions] = useState<MapboxSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const sessionToken = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setQuery(value?.label ?? "");
  }, [value?.id, value?.label]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setCatalogLocations([]);
      setSuggestions([]);
      setError("");
      return;
    }
    setCatalogLocations([]);
    setSuggestions([]);
    setError("");
    let active = true;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ search: query.trim() });
      void fetch(`/api/v1/catalog/locations?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Bookable locations could not be searched.");
          const body = (await response.json()) as { data?: CatalogLocation[] };
          if (active) setCatalogLocations(body.data ?? []);
        })
        .catch(() => {
          if (active && !controller.signal.aborted) setError("DC Cabs locations are unavailable.");
        });

      if (!MAPBOX_TOKEN) {
        setSuggestions([]);
        return;
      }
      sessionToken.current ||= crypto.randomUUID();
      const mapboxParams = new URLSearchParams({
        q: query.trim(),
        language: "en",
        limit: "6",
        session_token: sessionToken.current,
        access_token: MAPBOX_TOKEN,
      });
      void fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?${mapboxParams}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Location search is temporarily unavailable.");
          const body = (await response.json()) as { suggestions?: MapboxSuggestion[] };
          if (active) {
            setSuggestions(body.suggestions ?? []);
            setError("");
          }
        })
        .catch(() => {
          if (active && !controller.signal.aborted) setError("Map location search is unavailable.");
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, retryCount]);

  function selectCatalog(entry: CatalogLocation) {
    if (entry.latitude === null || entry.longitude === null) {
      setError("This DC Cabs location needs map coordinates before it can be booked online.");
      return;
    }
    const location: JourneyLocation = {
      id: entry.id,
      cityId: entry.city_id,
      label: entry.name,
      context: entry.address ?? "DC Cabs bookable location",
      coordinates: [Number(entry.longitude), Number(entry.latitude)],
      bookable: true,
    };
    setQuery(location.label);
    onChange(location);
    setOpen(false);
    setError("");
  }

  async function selectMapbox(suggestion: MapboxSuggestion) {
    if (!MAPBOX_TOKEN) return;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        session_token: sessionToken.current,
        access_token: MAPBOX_TOKEN,
      });
      const response = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(suggestion.mapbox_id)}?${params}`,
      );
      if (!response.ok) throw new Error("That location could not be loaded. Try another result.");
      const body = (await response.json()) as {
        features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
      };
      const coordinates = body.features?.[0]?.geometry?.coordinates;
      if (!coordinates) throw new Error("That location did not include map coordinates.");
      const catalogMatch =
        (await findCatalogMatch(suggestion.name, coordinates)) ??
        (suggestion.full_address
          ? await findCatalogMatch(suggestion.full_address, coordinates)
          : null);
      const chosen: JourneyLocation = {
        ...(catalogMatch ? { id: catalogMatch.id, cityId: catalogMatch.city_id } : {}),
        label: catalogMatch?.name ?? suggestion.name,
        context: catalogMatch
          ? "Matched to an active DC Cabs location"
          : (suggestion.full_address ?? suggestion.place_formatted ?? "Mapbox location"),
        coordinates,
        bookable: Boolean(catalogMatch),
      };
      setQuery(chosen.label);
      onChange(chosen);
      setOpen(false);
      sessionToken.current = crypto.randomUUID();
      if (!catalogMatch)
        setError(
          "This place is outside the current online booking catalog. Contact our team to arrange it.",
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Location search is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <label className="eyebrow block text-foreground/60" htmlFor={`location-${label}`}>
        {label}
      </label>
      <input
        id={`location-${label}`}
        className="mt-2 w-full border border-border bg-background px-4 py-4 text-base text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
        autoComplete="off"
        value={query}
        placeholder="Search an airport, address, hotel or landmark"
        aria-expanded={open}
        aria-controls={`location-options-${label}`}
        role="combobox"
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(null);
          setError("");
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && query.trim().length >= 2 ? (
        <div
          id={`location-options-${label}`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto border border-border bg-charcoal shadow-2xl"
        >
          {catalogLocations.map((entry) => (
            <button
              type="button"
              role="option"
              aria-selected={false}
              key={entry.id}
              onClick={() => selectCatalog(entry)}
              className="block w-full border-b border-border px-4 py-3 text-left transition hover:bg-surface focus:bg-surface focus:outline-none"
            >
              <span className="block text-sm font-semibold">{entry.name}</span>
              <span className="mt-1 block text-xs text-primary-tint">DC Cabs location</span>
            </button>
          ))}
          {suggestions.map((suggestion) => (
            <button
              type="button"
              role="option"
              aria-selected={false}
              key={suggestion.mapbox_id}
              disabled={busy}
              onClick={() => void selectMapbox(suggestion)}
              className="block w-full border-b border-border px-4 py-3 text-left transition hover:bg-surface focus:bg-surface focus:outline-none disabled:opacity-50"
            >
              <span className="block text-sm font-semibold">{suggestion.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {suggestion.full_address ??
                  suggestion.place_formatted ??
                  "Mapbox result · verify bookability"}
              </span>
            </button>
          ))}
          {!catalogLocations.length && !suggestions.length ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {busy
                ? "Searching…"
                : MAPBOX_TOKEN
                  ? "No matching places found."
                  : "No catalog match. Mapbox is not configured."}
            </p>
          ) : null}
        </div>
      ) : null}
      {value ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {value.bookable
            ? "Available for online booking"
            : "Map preview only · not in the booking catalog"}
        </p>
      ) : null}
      {error ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {error}{" "}
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="underline underline-offset-2"
          >
            Try again
          </button>
        </p>
      ) : null}
      {!MAPBOX_TOKEN ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Mapbox search is unavailable until VITE_MAPBOX_ACCESS_TOKEN is configured.
        </p>
      ) : null}
    </div>
  );
}
