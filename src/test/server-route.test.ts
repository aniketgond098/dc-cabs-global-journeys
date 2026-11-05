import { describe, expect, it, vi } from "vitest";
import { resolveServerRoute } from "@/lib/server-route";
import type { BookingDatabase } from "@/lib/booking-api";

const city = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Mumbai",
  country_id: "00000000-0000-4000-8000-000000000010",
  countries: { iso2: "IN", is_active: true },
};

function cityDatabase(data: unknown = city) {
  const calls: string[] = [];
  const database = {
    from(table: string) {
      calls.push(table);
      const builder: Record<string, unknown> = {};
      builder["select"] = () => builder;
      builder["eq"] = () => builder;
      builder["maybeSingle"] = async () => ({ data, error: null });
      return builder;
    },
  };
  return { database: database as unknown as BookingDatabase, calls };
}

const input = {
  originCityId: city.id,
  originAddress: "Mumbai Airport Terminal 1",
  destinationCityId: city.id,
  destinationAddress: "BKC, Mumbai",
};

function geocodeBody(longitude: number) {
  return {
    features: [
      {
        properties: { city: "Mumbai", country: "India" },
        geometry: { coordinates: [longitude, 19.1] },
      },
    ],
  };
}

describe("server-side address routing", () => {
  it("geocodes addresses in the active selected city and builds route metrics server-side", async () => {
    const { database } = cityDatabase();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(geocodeBody(72.85))))
      .mockResolvedValueOnce(new Response(JSON.stringify(geocodeBody(72.87))))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 12400, duration: 2200 }] })),
      );

    const result = await resolveServerRoute(input, database, fetcher);

    expect(result).toEqual({ distanceKm: 12.4, durationHours: 2200 / 3600 });
    const originQuery = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(originQuery.searchParams.get("q")).toBe("Mumbai Airport Terminal 1, Mumbai, India");
    const routeUrl = new URL(String(fetcher.mock.calls[2]?.[0]));
    expect(routeUrl.pathname).toContain("72.85,19.1;72.87,19.1");
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeDefined();
  });

  it("rejects a geocoder result outside the selected city without requesting a route", async () => {
    const { database } = cityDatabase();
    const wrongCity = new Response(
      JSON.stringify({
        features: [
          {
            properties: { city: "Pune", country: "India" },
            geometry: { coordinates: [73.85, 18.52] },
          },
        ],
      }),
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(wrongCity.clone())
      .mockResolvedValueOnce(wrongCity.clone());

    await expect(resolveServerRoute(input, database, fetcher)).rejects.toThrow(
      "Address could not be confirmed within the selected service city",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects inactive or non-Indian service cities before geocoding", async () => {
    const { database } = cityDatabase({ ...city, countries: { iso2: "US", is_active: true } });
    const fetcher = vi.fn<typeof fetch>();

    await expect(resolveServerRoute(input, database, fetcher)).rejects.toThrow(
      "Selected city is not an active Indian service city",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
