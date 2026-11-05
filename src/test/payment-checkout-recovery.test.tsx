import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentCheckout } from "@/components/booking/PaymentCheckout";

describe("payment checkout recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (window as Window & { Razorpay?: unknown }).Razorpay;
  });

  it("keeps the retry path available and exposes secure status lookup after verification network failure", async () => {
    let options: Record<string, unknown> | undefined;
    class MockRazorpay {
      constructor(receivedOptions: Record<string, unknown>) {
        options = receivedOptions;
      }
      open() {}
      on() {}
    }
    (window as Window & { Razorpay?: unknown }).Razorpay = MockRazorpay;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          keyId: "rzp_test_public",
          orderId: "order_test",
          amount: 10000,
          currency: "INR",
          bookingReference: "DC-TEST",
        }),
      )
      .mockRejectedValueOnce(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PaymentCheckout
        booking={{
          id: "00000000-0000-4000-8000-000000000001",
          bookingReference: "DC-TEST",
          currency: "INR",
          subtotal: 100,
          tax: 5,
          total: 105,
          paymentAccessToken: "test-payment-token",
        }}
      />,
    );
    expect(screen.getByText("Fare subtotal")).toBeInTheDocument();
    expect(screen.getByText("GST")).toBeInTheDocument();
    expect(screen.getByText("Total payable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /pay securely/i }));
    await waitFor(() => expect(options).toBeDefined());

    const handler = options?.["handler"] as (response: Record<string, string>) => Promise<void>;
    await handler({
      razorpay_order_id: "order_test",
      razorpay_payment_id: "pay_test",
      razorpay_signature: "signature-test",
    });

    expect(
      await screen.findByText(/could not reach the verification service/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /check secure booking status/i })).toHaveAttribute(
      "href",
      "/booking-confirmation?booking_id=00000000-0000-4000-8000-000000000001",
    );
    expect(screen.getByRole("button", { name: /pay securely/i })).toBeEnabled();
  });
});
