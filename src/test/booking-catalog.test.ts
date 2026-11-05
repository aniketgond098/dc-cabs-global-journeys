import { describe, expect, it, vi } from "vitest";
import { loadCityLocations, loadSupportedCities } from "@/lib/booking-catalog";

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("booking catalog loaders", () => {
  it("loads only cities returned by the active country and city catalog endpoints", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ data: [{ id: "india-country", iso2: "IN", name: "India" }] }),
      )
      .mockResolvedValueOnce(response({ data: [{ id: "mumbai-city", name: "Mumbai" }] }));

    await expect(loadSupportedCities(fetcher)).resolves.toEqual([
      { id: "mumbai-city", name: "Mumbai" },
    ]);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/v1/catalog/countries",
      "/api/v1/catalog/cities?country_id=india-country",
    ]);
  });

  it("returns no cities when India has no active catalog entry", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ data: [] }));
    await expect(loadSupportedCities(fetcher)).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("treats malformed country catalog data as an error", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ data: [{ id: "not-a-country" }] }));
    await expect(loadSupportedCities(fetcher)).rejects.toThrow(/catalog/i);
  });

  it.each([503, 200])(
    "surfaces city catalog failure or malformed response (status %s)",
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          status === 503
            ? response({ error: { message: "Unavailable" } }, status)
            : response({ data: null }),
        );
      await expect(loadSupportedCities(fetcher)).rejects.toThrow(/catalog/i);
    },
  );

  it("does not fall back to locations when the city location catalog fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ error: { message: "Unavailable" } }, 503));
    await expect(loadCityLocations("city-id", fetcher)).rejects.toThrow(/catalog/i);
  });
});
