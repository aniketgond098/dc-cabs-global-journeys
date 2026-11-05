import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactForm } from "@/components/site/ContactForm";

describe("contact form handoff", () => {
  afterEach(() => vi.restoreAllMocks());

  it("clearly says an enquiry is not submitted until the customer sends it", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <ContactForm
        defaultType="Other"
        defaultRoute="Airport → Hotel"
        defaultMessage="Price-on-request vehicle enquiry"
      />,
    );
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Asha Rao" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "asha@example.in" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "+91 98765 43210" } });
    fireEvent.click(screen.getByRole("button", { name: /send enquiry/i }));

    expect(open).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: /ready to send/i })).toBeInTheDocument();
    expect(screen.getByText(/has not been sent/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /thank you/i })).not.toBeInTheDocument();
  });
});
