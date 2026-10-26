import { BookingButton } from "./BookingButton";
import { routeMetrics } from "@/lib/booking-rules";
import type { Guest, Journey, Quote, RouteDetails, Vehicle } from "@/lib/booking-types";
export function ItineraryReview({ journey, vehicle, guest, quote, route, onEdit }: { journey: Journey; vehicle: Vehicle | null; guest: Guest; quote: Quote | null; route: RouteDetails | null; onEdit?: (step: number) => void }) {
  const rows = [
    { label: "Journey", value: `${journey.pickup?.name ?? "—"} → ${journey.destination?.name ?? "—"}`, step: 0 },
    { label: "Date & time", value: `${journey.date} · ${journey.time}`, step: 0 },
    { label: "Passengers", value: String(journey.passengers), step: 0 },
    { label: "Vehicle", value: vehicle?.name ?? "—", step: 1 },
    { label: "Guest", value: `${guest.fullName} · ${guest.email} · ${guest.phone}`, step: 3 },
    ...(guest.companyName ? [{ label: "Company", value: guest.companyName, step: 3 }] : []),
    ...(guest.instructions ? [{ label: "Special instructions", value: guest.instructions, step: 3 }] : []),
    { label: "Fare", value: quote?.pricing.components?.totalAmount != null ? `${quote.pricing.currency ?? ""} ${Number(quote.pricing.components.totalAmount).toFixed(2)}` : "Awaiting a confirmed quote", step: 2 },
  ];
  return <div><dl className="divide-y divide-border border-y border-border">{rows.map(row => <div key={row.label} className="flex items-start justify-between gap-5 py-5"><div className="min-w-0"><dt className="eyebrow">{row.label}</dt><dd className="mt-2 break-words text-sm leading-relaxed">{row.value}</dd></div>{onEdit && <BookingButton variant="link" className="min-h-0 shrink-0 px-0 py-0" onClick={() => onEdit(row.step)}>Edit</BookingButton>}</div>)}</dl>{route && <p className="mt-4 text-sm text-primary-tint">{routeMetrics(route)}</p>}</div>;
}