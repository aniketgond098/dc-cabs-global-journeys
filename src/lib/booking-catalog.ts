import type { CatalogLocation } from "@/components/booking/catalog-location-match";

export type SupportedCity = { id: string; name: string; timezone: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function loadSupportedCities(fetcher: typeof fetch = fetch): Promise<SupportedCity[]> {
  const countriesResponse = await fetcher("/api/v1/catalog/countries");
  const countriesBody: unknown = await countriesResponse.json();
  if (!countriesResponse.ok || !isRecord(countriesBody) || !Array.isArray(countriesBody["data"])) {
    throw new Error("Supported cities could not be loaded from the DC Cabs catalog.");
  }
  const countryRows = countriesBody["data"];
  if (
    !countryRows.every(
      (country) =>
        isRecord(country) &&
        typeof country["id"] === "string" &&
        typeof country["iso2"] === "string" &&
        typeof country["name"] === "string",
    )
  ) {
    throw new Error("Supported cities could not be loaded from the DC Cabs catalog.");
  }
  const india = countryRows.find(
    (country): country is Record<string, unknown> =>
      isRecord(country) && typeof country["id"] === "string" && country["iso2"] === "IN",
  );
  if (!india) return [];

  const params = new URLSearchParams({ country_id: india["id"] as string });
  const citiesResponse = await fetcher(`/api/v1/catalog/cities?${params}`);
  const citiesBody: unknown = await citiesResponse.json();
  if (!citiesResponse.ok || !isRecord(citiesBody) || !Array.isArray(citiesBody["data"])) {
    throw new Error("Supported cities could not be loaded from the DC Cabs catalog.");
  }
  const cityRows = citiesBody["data"];
  if (
    !cityRows.every(
      (city) =>
        isRecord(city) &&
        typeof city["id"] === "string" &&
        typeof city["name"] === "string" &&
        typeof city["timezone"] === "string",
    )
  ) {
    throw new Error("Supported cities could not be loaded from the DC Cabs catalog.");
  }
  return cityRows.map((city) => {
    const row = city as Record<string, unknown>;
    return {
      id: row["id"] as string,
      name: row["name"] as string,
      timezone: row["timezone"] as string,
    };
  });
}

export async function loadCityLocations(
  cityId: string,
  fetcher: typeof fetch = fetch,
): Promise<CatalogLocation[]> {
  const params = new URLSearchParams({ city_id: cityId });
  const response = await fetcher(`/api/v1/catalog/locations?${params}`);
  const body: unknown = await response.json();
  if (!response.ok || !isRecord(body) || !Array.isArray(body["data"])) {
    throw new Error("DC Cabs locations could not be loaded from the catalog.");
  }
  const locations = body["data"];
  const isCatalogLocation = (location: unknown): location is CatalogLocation =>
    isRecord(location) &&
    typeof location["id"] === "string" &&
    typeof location["city_id"] === "string" &&
    typeof location["name"] === "string" &&
    (typeof location["address"] === "string" || location["address"] === null) &&
    (typeof location["latitude"] === "number" || location["latitude"] === null) &&
    (typeof location["longitude"] === "number" || location["longitude"] === null);
  if (!locations.every(isCatalogLocation)) {
    throw new Error("DC Cabs locations could not be loaded from the catalog.");
  }
  return locations;
}
