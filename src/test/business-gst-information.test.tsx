import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BusinessGstInformation } from "@/components/site/BusinessGstInformation";

describe("business and GST information", () => {
  it("shows the certificate-backed registration identity in the global section", () => {
    render(<BusinessGstInformation />);

    expect(screen.getByRole("heading", { name: "Business & GST Information" })).toBeInTheDocument();
    expect(screen.getByText("DC CABS", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/PUNITA RAM SURESH MAHTO/)).toBeInTheDocument();
    expect(screen.getByText(/27CVLPM5705J1Z6/)).toBeInTheDocument();
    expect(screen.getByText("GST Registered Business")).toBeInTheDocument();
  });

  it("links the original certificate to a new tab in compact booking/payment context", () => {
    render(<BusinessGstInformation compact />);

    const link = screen.getByRole("link", { name: "View GST Registration Certificate" });
    expect(link).toHaveAttribute("href", "/legal/dc-cabs-gst-registration-certificate.pdf");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByText(/DC CABS · GSTIN 27CVLPM5705J1Z6/)).toBeInTheDocument();
  });
});
