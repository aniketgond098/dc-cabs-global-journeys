import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const catalogLocation = {
  id: "location-1",
  city_id: "city-1",
  name: "Mumbai Airport",
  address: "Terminal 2, Mumbai",
  latitude: 19.0896,
  longitude: 72.8656,
};

const suggestion = {
  mapbox_id: "mapbox-location-1",
  name: "Mumbai Airport",
  full_address: "Terminal 2, Mumbai",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function loadSearch() {
  vi.stubEnv("VITE_MAPBOX_ACCESS_TOKEN", "pk.test-token");
  vi.resetModules();
  const { LocationSearch } = await import("@/components/booking/LocationSearch");
  return LocationSearch;
}

async function startSearch() {
  const LocationSearch = await loadSearch();
  const onChange = vi.fn();
  render(<LocationSearch label="From" value={null} onChange={onChange} />);
  fireEvent.change(screen.getByRole("combobox", { name: "From" }), {
    target: { value: "Mumbai" },
  });
  return onChange;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("LocationSearch catalog validation", () => {
  it("selects a matching active catalog location as bookable", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/catalog/locations"))
        return jsonResponse({ data: [catalogLocation] });
      if (url.includes("/suggest")) return jsonResponse({ suggestions: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const onChange = await startSearch();
    const option = await screen.findByRole("option", { name: /Mumbai Airport/ });
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "location-1", cityId: "city-1", bookable: true }),
    );
  });

  it("keeps a successful catalog lookup with no match unsupported", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/catalog/locations")) return jsonResponse({ data: [] });
      if (url.includes("/suggest")) return jsonResponse({ suggestions: [suggestion] });
      if (url.includes("/retrieve/"))
        return jsonResponse({ features: [{ geometry: { coordinates: [72.8656, 19.0896] } }] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const onChange = await startSearch();
    fireEvent.click(await screen.findByRole("option", { name: /Mumbai Airport/ }));

    expect(
      await screen.findByText(/outside the current online booking catalog/i),
    ).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ bookable: false }));
    expect(onChange.mock.lastCall?.[0]).not.toHaveProperty("id");
  });

  it.each(["http", "malformed", "network"])(
    "keeps the temporary catalog error visible when Mapbox suggestions succeed (%s failure)",
    async (failure) => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/catalog/locations")) {
          if (failure === "http") return jsonResponse({ error: "unavailable" }, 503);
          if (failure === "malformed") return jsonResponse({ data: { locations: [] } });
          throw new TypeError("fetch failed");
        }
        if (url.includes("/suggest")) return jsonResponse({ suggestions: [suggestion] });
        if (url.includes("/retrieve/"))
          return jsonResponse({ features: [{ geometry: { coordinates: [72.8656, 19.0896] } }] });
        throw new Error(`Unexpected request: ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const onChange = await startSearch();
      fireEvent.click(await screen.findByRole("option", { name: /Mumbai Airport/ }));

      expect(
        await screen.findByText(/DC Cabs locations are temporarily unavailable/i),
      ).toBeInTheDocument();
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(null);
      expect(
        screen.queryByText(/outside the current online booking catalog/i),
      ).not.toBeInTheDocument();
    },
  );
});
