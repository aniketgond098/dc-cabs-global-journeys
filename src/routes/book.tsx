import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CarFront, Check, LockKeyhole, Plane, Route, ShieldCheck, Loader2 } from "lucide-react";
import { z } from "zod";
import { BookingButton } from "@/components/booking/BookingButton";
import { BookingProgress, bookingSteps } from "@/components/booking/BookingProgress";
import { BookingRouteMap } from "@/components/booking/BookingRouteMap";
import { LocationSearch } from "@/components/booking/LocationSearch";
import { PassengerControl } from "@/components/booking/PassengerControl";
import { VehicleCategoryCard } from "@/components/booking/VehicleCategoryCard";
import { QuoteBreakdownCard } from "@/components/booking/QuoteBreakdownCard";
import { CustomerDetailsForm, bookingInput } from "@/components/booking/CustomerDetailsForm";
import { ItineraryReview } from "@/components/booking/ItineraryReview";
import { previewVehicles } from "@/lib/booking-preview";
import { journeyErrors } from "@/lib/booking-rules";
import type { Guest, Journey, JourneyLocation, Quote, RouteDetails, TripType } from "@/lib/booking-types";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ pickup: z.string().optional(), destination: z.string().optional(), date: z.string().optional(), passengers: z.coerce.number().int().positive().catch(1).optional() });
const locationSchema = z.object({ id: z.string(), name: z.string(), detail: z.string(), coordinates: z.tuple([z.number(), z.number()]).optional(), source: z.enum(["preview", "mapbox"]) });
function readLocation(raw?: string): JourneyLocation | null {
  if (!raw) return null;
  try { const result = locationSchema.safeParse(JSON.parse(raw)); return result.success ? result.data : null; } catch { return null; }
}
export const Route = createFileRoute("/book")({
  validateSearch: searchSchema,
  head: () => ({ meta: [
    { title: "Book a Ride — Your Chauffeur Journey | DC Cabs" },
    { name: "description", content: "Plan your DC Cabs journey with pickup and destination search, vehicle selection and an executive itinerary review." },
    { property: "og:title", content: "Book a Ride | DC Cabs" },
    { property: "og:description", content: "Chauffeur-driven local rides, outstation journeys and airport transfers." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: BookingPage,
});
const trips: { id: TripType; title: string; icon: typeof CarFront }[] = [{ id: "local", title: "Local ride", icon: CarFront }, { id: "outstation", title: "Outstation", icon: Route }, { id: "airport_transfer", title: "Airport transfer", icon: Plane }];
function BookingPage() {
  const search = Route.useSearch();
  const [journey, setJourney] = useState<Journey>(() => ({ tripType: "local", pickup: readLocation(search.pickup), destination: readLocation(search.destination), date: search.date ?? "", time: "", passengers: search.passengers ?? 1, packageTier: "4hr_40km", tripDays: 1 }));
  const [step, setStep] = useState(0);
  const [vehicleId, setVehicleId] = useState("");
  const [route, setRoute] = useState<RouteDetails | null>(null);
  const [quote] = useState<Quote | null>(null);
  const [guest, setGuest] = useState<Guest>({ fullName: "", email: "", phone: "", companyName: "", instructions: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [paymentState, setPaymentState] = useState<"idle" | "loading" | "unavailable">("idle");
  const heading = useRef<HTMLHeadingElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vehicle = previewVehicles.find(v => v.id === vehicleId) ?? null;
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  function go(next: number) { setStep(next); setErrors({}); window.setTimeout(() => heading.current?.focus(), 0); }
  function update(patch: Partial<Journey>) { setJourney(previous => ({ ...previous, ...patch })); setErrors({}); }
  function loadFare() {
    if (busy) return;
    setBusy(true);
    // Presentation-only loading state: no request, quote, or fake amount is generated.
    timeout.current = setTimeout(() => { setBusy(false); go(2); }, 400);
  }
  function paymentPreview() {
    setPaymentState("loading");
    timeout.current = setTimeout(() => setPaymentState("unavailable"), 500);
  }
  const enquiry = { route: `${journey.pickup?.name ?? ""} → ${journey.destination?.name ?? ""}`, date: journey.date, travelers: String(journey.passengers), vehicle: vehicle?.name };
  return <section className="container-x pb-20 pt-32 md:pb-28 md:pt-40">
    <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
      <div><p className="eyebrow text-primary-tint">DC Cabs / Private mobility</p><h1 className="mt-4 font-display text-4xl font-bold uppercase leading-tight sm:text-6xl">Your journey.<br /><span className="text-muted-foreground">Considered.</span></h1></div>
      <div className="flex items-center gap-2 border-l border-primary pl-4 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary-tint" /> Online booking preview</div>
    </div>
    <BookingProgress step={step} onStep={go} />
    <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)] lg:gap-14">
      <div className="min-w-0">
        <p className="eyebrow">Step 0{step + 1} / 06</p>
        <h2 ref={heading} tabIndex={-1} className="mb-8 mt-3 font-display text-3xl font-bold uppercase leading-tight outline-none sm:text-4xl">{bookingSteps[step]}</h2>
        {step === 0 && <form noValidate onSubmit={event => { event.preventDefault(); const found = journeyErrors(journey); setErrors(found); if (!Object.keys(found).length) go(1); }}>
          <div className="mb-8 grid grid-cols-3 gap-2" role="group" aria-label="Trip type">{trips.map(trip => <BookingButton key={trip.id} variant="outline" aria-pressed={journey.tripType === trip.id} className={cn("min-w-0 flex-col gap-2 px-2 text-[10px] sm:text-xs", journey.tripType === trip.id && "border-primary bg-charcoal")} onClick={() => update({ tripType: trip.id, packageTier: trip.id === "local" ? "4hr_40km" : trip.id })}><trip.icon className="size-5 text-primary-tint" />{trip.title}</BookingButton>)}</div>
          <div className="grid gap-7 sm:grid-cols-2">
            <LocationSearch label="Pickup" value={journey.pickup} onChange={pickup => update({ pickup })} error={errors.pickup} />
            <LocationSearch label="Drop-off" value={journey.destination} onChange={destination => update({ destination })} error={errors.destination} />
            <label className="min-w-0"><span className="eyebrow">Date</span><input type="date" className={bookingInput} value={journey.date} aria-invalid={Boolean(errors.date)} onChange={e => update({ date: e.target.value })} />{errors.date && <span role="alert" className="mt-2 block text-xs text-primary-tint">{errors.date}</span>}</label>
            <label className="min-w-0"><span className="eyebrow">Pickup time</span><input type="time" className={bookingInput} value={journey.time} aria-invalid={Boolean(errors.time)} onChange={e => update({ time: e.target.value })} />{errors.time && <span role="alert" className="mt-2 block text-xs text-primary-tint">{errors.time}</span>}</label>
            <div><span className="eyebrow">Passengers</span><PassengerControl value={journey.passengers} onChange={passengers => update({ passengers })} /></div>
            {journey.tripType === "outstation" && <label><span className="eyebrow">Trip days</span><input type="number" min={1} className={bookingInput} value={journey.tripDays} onChange={e => update({ tripDays: Math.max(1, Number(e.target.value)) })} /></label>}
          </div>
          {journey.tripType === "local" && <fieldset className="mt-8"><legend className="eyebrow mb-3">Journey package</legend><div className="flex gap-3">{[["4hr_40km", "4 hours / 40 km"], ["8hr_80km", "8 hours / 80 km"]].map(([id, label]) => <BookingButton key={id} variant="outline" aria-pressed={journey.packageTier === id} className={cn("flex-1 px-2", journey.packageTier === id && "border-primary")} onClick={() => update({ packageTier: id })}>{label}</BookingButton>)}</div></fieldset>}
          <div className="mt-9 border-t border-border pt-6"><BookingButton type="submit" className="w-full sm:w-auto">Choose your vehicle <ArrowRight /></BookingButton></div>
        </form>}
        {step === 1 && <div>
          <p className="mb-6 text-xs leading-relaxed text-muted-foreground">Collection preview. Availability and passenger/luggage capacity will be confirmed for your journey.</p>
          <div className="grid gap-4 sm:grid-cols-2">{previewVehicles.map(item => <VehicleCategoryCard key={item.id} vehicle={item} selected={vehicleId === item.id} onSelect={() => setVehicleId(item.id)} />)}</div>
          <BookingButton disabled={!vehicle || busy} onClick={loadFare} className="mt-8 w-full sm:w-auto">{busy ? <><Loader2 className="animate-spin" /> Checking fare availability…</> : <>Check fare <ArrowRight /></>}</BookingButton>
        </div>}
        {step === 2 && <QuoteBreakdownCard quote={quote} journey={journey} onRefresh={loadFare} onContinue={() => go(3)} />}
        {step === 3 && <CustomerDetailsForm guest={guest} onChange={setGuest} onContinue={() => go(4)} />}
        {step === 4 && <div><ItineraryReview journey={journey} vehicle={vehicle} guest={guest} quote={quote} route={route} onEdit={go} /><p className="mt-5 flex gap-2 text-xs text-muted-foreground"><Check className="size-4 shrink-0 text-primary-tint" /> Itinerary preview only. This is not a confirmed booking.</p><BookingButton className="mt-8 w-full sm:w-auto" onClick={() => go(5)}>Confirm & continue to payment <ArrowRight /></BookingButton></div>}
        {step === 5 && <div>
          <div className="flex items-center gap-3 border-b border-border pb-6"><LockKeyhole className="size-7 text-primary-tint" /><div><h3 className="text-lg font-semibold">Secure payment</h3><p className="mt-1 text-xs text-muted-foreground">A confirmed quote is required before payment.</p></div></div>
          <ItineraryReview journey={journey} vehicle={vehicle} guest={guest} quote={quote} route={route} />
          {paymentState === "unavailable" && <p role="alert" className="mt-5 border-l-2 border-primary pl-4 text-sm text-muted-foreground">Online payment is not available for this itinerary preview. No booking was created and no payment was taken. Contact DC Cabs to confirm your journey.</p>}
          <BookingButton className="mt-7 w-full sm:w-auto" disabled={paymentState === "loading"} onClick={paymentPreview}>{paymentState === "loading" ? <><Loader2 className="animate-spin" /> Checking payment availability…</> : paymentState === "unavailable" ? "Retry payment availability" : "Pay now"}</BookingButton>
          <BookingButton asChild variant="outline" className="mt-3 w-full sm:ml-3 sm:w-auto"><Link to="/contact" search={enquiry}>Contact DC Cabs</Link></BookingButton>
        </div>}
        {step > 0 && <BookingButton variant="ghost" className="mt-8 px-0 hover:bg-transparent hover:text-primary-tint" onClick={() => go(step - 1)}><ArrowLeft /> Back</BookingButton>}
      </div>
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <BookingRouteMap pickup={journey.pickup} destination={journey.destination} onRoute={setRoute} />
        <div className="mt-6 flex items-start gap-3 border-b border-border pb-6"><CarFront className="size-5 shrink-0 text-primary-tint" /><div><p className="text-sm">{vehicle?.name ?? "A vehicle for every journey"}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{journey.passengers} {journey.passengers === 1 ? "guest" : "guests"}{journey.date ? ` · ${journey.date}` : ""}{journey.time ? ` · ${journey.time}` : ""}</p></div></div>
        <BookingButton asChild variant="link" className="mt-3 px-0"><Link to="/contact" search={enquiry}>Prefer to speak with our team? <ArrowRight /></Link></BookingButton>
      </aside>
    </div>
  </section>;
}
