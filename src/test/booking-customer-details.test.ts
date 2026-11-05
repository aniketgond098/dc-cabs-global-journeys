import { describe, expect, it } from "vitest";
import { validateCustomerDetails } from "@/lib/booking-customer-details";

describe("customer booking details", () => {
  it("accepts contact details supported by the booking API", () => {
    expect(
      validateCustomerDetails({
        name: "  Asha Rao  ",
        email: "asha@example.in",
        phone: "+91 98765 43210",
      }),
    ).toEqual({});
  });

  it("returns field-specific errors before review for invalid details", () => {
    expect(validateCustomerDetails({ name: " ", email: "asha@", phone: "12345" })).toEqual({
      name: "Enter the passenger’s full name.",
      email: "Enter a valid email address.",
      phone: "Enter a valid phone number with at least 7 digits.",
    });
  });
});
