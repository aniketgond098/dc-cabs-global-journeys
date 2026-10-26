import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("BookingRouteMap optional coordinates", () => {
  it("keeps a catalog location selected and shows unavailable preview without inventing coordinates", async () => {
    vi.stubEnv("VITE_MAPBOX_ACCESS_TOKEN", "pk.test-token");
    vi.resetModules();
    const { BookingRouteMap } = await import("@/components/booking/BookingRouteMap");
    const onRoute = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BookingRouteMap
        pickup={{
          id: "location-1",
          cityId: "city-1",
          label: "Mumbai Airport Terminal 2",
          context: "DC Cabs bookable location",
          coordinates: null,
          bookable: true,
        }}
        destination={null}
        onRoute={onRoute}
      />,
    );

    expect(
      await screen.findByText(
        /Route preview unavailable because a selected catalog location has no coordinates/i,
      ),
    ).toBeInTheDocument();
    expect(onRoute).toHaveBeenCalledWith(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
