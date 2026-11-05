import { businessRegistration } from "@/content/business";

type BusinessGstInformationProps = {
  compact?: boolean;
};

export function BusinessGstInformation({ compact = false }: BusinessGstInformationProps) {
  if (compact) {
    return (
      <div className="mt-5 border-t border-border/70 pt-4 text-xs text-muted-foreground">
        <p>
          {businessRegistration.tradeName} · GSTIN {businessRegistration.gstin}
        </p>
        <a
          href={businessRegistration.certificateHref}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block underline underline-offset-4 hover:text-foreground"
        >
          View GST Registration Certificate
        </a>
      </div>
    );
  }

  return (
    <section aria-labelledby="business-gst-heading" className="border-t border-border py-8">
      <div className="container-x grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h2 id="business-gst-heading" className="eyebrow">
            Business &amp; GST Information
          </h2>
          <p className="mt-3 text-sm font-medium text-foreground">
            {businessRegistration.tradeName}
            <span className="ml-2 inline-flex items-center border border-border px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              GST Registered Business
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Legal name: {businessRegistration.legalName} · GSTIN: {businessRegistration.gstin}
          </p>
        </div>
        <a
          href={businessRegistration.certificateHref}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-foreground/75 underline underline-offset-4 transition-colors hover:text-primary"
        >
          View GST Registration Certificate
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </section>
  );
}
