import { describe, expect, it } from "vitest";
import { buildQuoteRequestPayload, hasUnsupportedIntermediateStops } from "@/lib/booking-request";

describe("frontend booking request safeguards", () => {
  it("does not send browser route estimates to the fare API", () => {
    const payload = buildQuoteRequestPayload({
      tripType: "airport_transfer",
      packageTier: "airport_transfer",
      originCityId: "catalog-origin-city-id",
      originAddress: "Airport Terminal 1, Mumbai",
      originLocationId: "catalog-origin-id",
      destinationCityId: "catalog-city-id",
      destinationAddress: "Business District, Mumbai",
      destinationLocationId: "catalog-destination-id",
      pickupAt: "2026-12-01T05:30:00.000Z",
      vehicleCategoryId: "catalog-vehicle-id",
      passengerCount: 2,
      tripDays: 1,
    });

    expect(payload).toEqual({
      tripType: "airport_transfer",
      packageTier: "airport_transfer",
      originCityId: "catalog-origin-city-id",
      originAddress: "Airport Terminal 1, Mumbai",
      originLocationId: "catalog-origin-id",
      destinationCityId: "catalog-city-id",
      destinationAddress: "Business District, Mumbai",
      destinationLocationId: "catalog-destination-id",
      pickupAt: "2026-12-01T05:30:00.000Z",
      vehicleCategoryId: "catalog-vehicle-id",
      passengerCount: 2,
      tripDays: 1,
    });
    expect(payload).not.toHaveProperty("estimatedDistanceKm");
    expect(payload).not.toHaveProperty("estimatedDurationHours");
  });

  it("rejects any intermediate stops until the backend persists them", () => {
    expect(hasUnsupportedIntermediateStops([])).toBe(false);
    expect(hasUnsupportedIntermediateStops([{ id: "catalog-stop", bookable: true }])).toBe(true);
    expect(hasUnsupportedIntermediateStops([{ label: "Draft stop", bookable: false }])).toBe(true);
  });
});
