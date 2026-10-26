import { useEffect, useState } from "react";
import { Clock, ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { BookingButton } from "./BookingButton";
import { quoteRemainingSeconds } from "@/lib/booking-rules";
import type { Journey, Quote } from "@/lib/booking-types";

const labels: Record<string, string> = { baseFare: "Base fare", extraKmAmount: "Extra distance", extraHoursAmount: "Extra hours", driverAllowance: "Driver allowance", nightSurcharge: "Night surcharge", taxAmount: "Taxes", tolls: "Tolls", parking: "Parking", totalAmount: "Total" };
export function QuoteBreakdownCard({ quote, journey, onRefresh, onContinue }: { quote: Quote | null; journey: Journey; onRefresh: () => void; onContinue: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!quote) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [quote]);
  if (!quote) return <div className="border-y border-border py-10">
    <p className="eyebrow text-primary-tint">Fare by request</p><h3 className="mt-4 font-display text-3xl font-bold uppercase leading-tight">Online fare unavailable</h3>
    <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">We don't currently have an online fare configured for this route.</p>
    <BookingButton asChild className="mt-6"><Link to="/contact" search={{ route: `${journey.pickup?.name ?? ""} → ${journey.destination?.name ?? ""}`, date: journey.date, travelers: String(journey.passengers) }}>Request a quote <ArrowUpRight /></Link></BookingButton>
    <p className="mt-5 text-xs text-muted-foreground">Online booking preview · no fare or booking has been created.</p>
    <BookingButton variant="outline" className="mt-6" onClick={onContinue}>Continue itinerary preview</BookingButton>
  </div>;
  const seconds = quoteRemainingSeconds(quote, now);
  const components = Object.entries(quote.pricing.components ?? {}).filter(([key]) => !["taxRatePercent", "totalAmount"].includes(key));
  return <div className="border-y border-border py-8">
    <p role="status" className="flex items-center gap-2 text-sm text-primary-tint"><Clock className="size-4" />{seconds ? `Quote valid for ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Quote expired"}</p>
    <dl className="mt-6 space-y-3 text-sm">{components.map(([key, value]) => <div key={key} className="flex justify-between gap-4 border-b border-border pb-3"><dt>{labels[key] ?? key.replace(/([A-Z])/g, " $1")}</dt><dd>{value == null ? "—" : `${quote.pricing.currency ?? ""} ${Number(value).toFixed(2)}`}</dd></div>)}
      {Object.entries(quote.pricing.inputs ?? {}).filter(([key]) => ["includedKm", "includedHours"].includes(key)).map(([key, value]) => <div key={key} className="flex justify-between"><dt>{key === "includedKm" ? "Included distance" : "Included hours"}</dt><dd>{value ?? "—"} {key === "includedKm" ? "km" : "hours"}</dd></div>)}
      <div className="flex justify-between border-t border-border pt-6 text-xl"><dt>Total</dt><dd>{quote.pricing.currency} {quote.pricing.components?.totalAmount == null ? "—" : Number(quote.pricing.components.totalAmount).toFixed(2)}</dd></div>
    </dl>
    <BookingButton className="mt-8" onClick={seconds ? onContinue : onRefresh}>{seconds ? "Continue to guest details" : "Refresh quote"}</BookingButton>
  </div>;
}