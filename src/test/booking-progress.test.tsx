import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BookingProgress } from "@/components/booking/BookingProgress";

describe("booking progress navigation", () => {
  it("lets the customer go back while disabling steps that are not ready", () => {
    const onStep = vi.fn();
    render(<BookingProgress step={1} onStep={onStep} canNavigateToStep={(index) => index <= 1} />);

    const routeStep = screen.getByRole("button", { name: /route & schedule/i });
    const vehicleStep = screen.getByRole("button", { name: /vehicle/i });
    const fareStep = screen.getByRole("button", { name: /fare/i });
    expect(routeStep).not.toBeDisabled();
    expect(vehicleStep).not.toBeDisabled();
    expect(fareStep).toBeDisabled();

    fireEvent.click(routeStep);
    expect(onStep).toHaveBeenCalledWith(0);
  });
});
