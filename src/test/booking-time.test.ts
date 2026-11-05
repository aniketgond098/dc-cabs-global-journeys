import { describe, expect, it } from "vitest";
import { dateInTimeZone, pickupDateTimeToIso } from "@/lib/booking-time";

describe("catalog-city booking time conversion", () => {
  it("converts the selected city's wall clock to the correct UTC instant", () => {
    expect(pickupDateTimeToIso("2026-12-01", "11:00", "Asia/Kolkata")).toBe(
      "2026-12-01T05:30:00.000Z",
    );
  });

  it("uses the catalog city's current calendar date rather than the browser timezone", () => {
    expect(dateInTimeZone(new Date("2026-12-01T20:00:00.000Z"), "Asia/Kolkata")).toBe("2026-12-02");
  });

  it("rejects malformed local date/time and unknown time zones", () => {
    expect(pickupDateTimeToIso("2026-02-31", "11:00", "Asia/Kolkata")).toBe("");
    expect(pickupDateTimeToIso("2026-12-01", "11:00", "not-a-timezone")).toBe("");
  });
});
