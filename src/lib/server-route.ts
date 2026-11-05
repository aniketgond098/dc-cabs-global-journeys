import type { BookingDatabase } from "@/lib/booking-api";

type CityRow = {
  id: string;
  name: string;
  country_id: string;
  countries: { iso2: string; is_active: boolean } | { iso2: string; is_active: boolean }[];
};
type LocationRow = {
  id: string;
  city_id: string;
  name: string;
  address: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};
type Coordinate = [number, number];
export type ServerRouteMetrics = { distanceKm: number; durationHours: number };
export type RouteResolutionInput = {
  originCityId: string;
  originLocationId?: string;
  originAddress: string;
  destinationCityId: string;
  destinationLocationId?: string;
  destinationAddress: string;
};

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function loadActiveCity(database: BookingDatabase, cityId: string): Promise<CityRow> {
  const { data, error } = await database
    .from("cities")
    .select("id,name,country_id,countries!inner(iso2,is_active)")
    .eq("id", cityId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  const city = data as unknown as CityRow | null;
  const country = Array.isArray(city?.countries) ? city.countries[0] : city?.countries;
  if (!city || !country?.is_active || country.iso2 !== "IN") {
    throw new Error("Selected city is not an active Indian service city");
  }
  return city;
}

async function geocodeAddress(
  address: string,
  city: CityRow,
  fetcher: typeof fetch,
): Promise<Coordinate> {
  const query = `${address}, ${city.name}, India`;
  const url = new URL("https://photon.komoot.io/api/");
  url.search = new URLSearchParams({ q: query, limit: "3", lang: "en" }).toString();
  const response = await fetcher(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error("Address lookup is temporarily unavailable");
  const body = (await response.json()) as {
    features?: {
      properties?: { city?: string; district?: string; country?: string };
      geometry?: { coordinates?: number[] };
    }[];
  };
  const cityName = normalize(city.name);
  const match = body.features?.find((feature) => {
    const props = feature.properties;
    const coordinate = feature.geometry?.coordinates;
    const returnedCity = normalize([props?.city, props?.district].filter(Boolean).join(" "));
    return (
      returnedCity.length > 0 &&
      normalize(props?.country ?? "") === "india" &&
      (returnedCity === cityName ||
        returnedCity.includes(cityName) ||
        cityName.includes(returnedCity)) &&
      Array.isArray(coordinate) &&
      coordinate.length === 2 &&
      coordinate.every(Number.isFinite)
    );
  });
  const coordinates = match?.geometry?.coordinates;
  if (!coordinates)
    throw new Error("Address could not be confirmed within the selected service city");
  return [coordinates[0]!, coordinates[1]!];
}

async function resolveEndpoint(
  database: BookingDatabase,
  city: CityRow,
  address: string,
  locationId: string | undefined,
  fetcher: typeof fetch,
): Promise<Coordinate> {
  if (locationId) {
    const { data, error } = await database
      .from("locations")
      .select("id,city_id,name,address,latitude,longitude")
      .eq("id", locationId)
      .eq("city_id", city.id)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    const location = data as unknown as LocationRow | null;
    if (!location) throw new Error("Selected catalog location is unavailable");
    if (location.longitude !== null && location.latitude !== null) {
      const longitude = Number(location.longitude);
      const latitude = Number(location.latitude);
      if (Number.isFinite(longitude) && Number.isFinite(latitude)) return [longitude, latitude];
    }
    return geocodeAddress(
      [location.name, location.address].filter(Boolean).join(", "),
      city,
      fetcher,
    );
  }
  return geocodeAddress(address, city, fetcher);
}

export async function resolveServerRoute(
  input: RouteResolutionInput,
  database: BookingDatabase,
  fetcher: typeof fetch = fetch,
): Promise<ServerRouteMetrics> {
  if (input.originAddress.length > 500 || input.destinationAddress.length > 500) {
    throw new Error("Address exceeds the maximum supported length");
  }
  const [originCity, destinationCity] = await Promise.all([
    loadActiveCity(database, input.originCityId),
    loadActiveCity(database, input.destinationCityId),
  ]);
  const [origin, destination] = await Promise.all([
    resolveEndpoint(database, originCity, input.originAddress, input.originLocationId, fetcher),
    resolveEndpoint(
      database,
      destinationCity,
      input.destinationAddress,
      input.destinationLocationId,
      fetcher,
    ),
  ]);
  const routeUrl = `https://router.project-osrm.org/route/v1/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
  const url = new URL(routeUrl);
  url.search = new URLSearchParams({ overview: "false", steps: "false" }).toString();
  const response = await fetcher(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Route calculation is temporarily unavailable");
  const body = (await response.json()) as {
    code?: string;
    routes?: { distance?: number; duration?: number }[];
  };
  const route = body.routes?.[0];
  if (
    body.code !== "Ok" ||
    !route ||
    !Number.isFinite(route.distance) ||
    !Number.isFinite(route.duration) ||
    route.distance! < 0 ||
    route.duration! < 0
  ) {
    throw new Error("No validated road route is available for these addresses");
  }
  return { distanceKm: route.distance! / 1000, durationHours: route.duration! / 3600 };
}
