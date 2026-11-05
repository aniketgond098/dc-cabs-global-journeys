import { describe, expect, it } from "vitest";
import { canContinueJourney } from "@/lib/booking-journey";

const activePickup = { id: "pickup-1", cityId: "city-1", label: "Pickup", bookable: true };
const activeDestination = {
  id: "destination-1",
  cityId: "city-1",
  label: "Destination",
  bookable: true,
};

describe("booking journey readiness", () => {
  it.each(["map preview unavailable", "routing service failed"])(
    "allows a valid catalog journey to continue when %s",
    () => {
      const pickupAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      expect(
        canContinueJourney({
          pickup: activePickup,
          destination: activeDestination,
          pickupAt,
          categoriesError: "",
        }),
      ).toBe(true);
    },
  );

  it("allows custom addresses in the selected supported city without catalog IDs", () => {
    const pickupAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    expect(
      canContinueJourney({
        pickup: activePickup,
        destination: {
          cityId: "city-1",
          label: "Custom destination",
          bookable: false,
          source: "custom_address",
        },
        pickupAt,
        categoriesError: "",
      }),
    ).toBe(true);
  });

  it("requires city identity and address text for each endpoint", () => {
    const pickupAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(
      canContinueJourney({
        pickup: { id: "id-without-city", label: "Pickup", bookable: true },
        destination: activeDestination,
        pickupAt,
        categoriesError: "",
      }),
    ).toBe(false);
  });
});
