import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { LocationSearch } from "./LocationSearch";
import { PassengerControl } from "./PassengerControl";
import { BookingButton } from "./BookingButton";
import type { JourneyLocation } from "@/lib/booking-types";
export function QuickBookingBar() {
  const [pickup, setPickup] = useState<JourneyLocation | null>(null);
  const [destination, setDestination] = useState<JourneyLocation | null>(null);
  const [date, setDate] = useState("");
  const [passengers, setPassengers] = useState(1);
  return <div className="relative mt-10 grid gap-5 border-t border-hairline pt-6 md:grid-cols-2 xl:grid-cols-[1.3fr_1.3fr_0.8fr_0.6fr_auto] xl:items-end">
    <LocationSearch label="From" value={pickup} onChange={setPickup} />
    <LocationSearch label="To" value={destination} onChange={setDestination} />
    <label className="min-w-0"><span className="eyebrow">Date</span><input type="date" aria-label="Journey date" className="h-12 w-full min-w-0 border-b border-hairline bg-transparent text-sm outline-none focus:border-primary [color-scheme:dark]" value={date} onChange={e => setDate(e.target.value)} /></label>
    <div><span className="eyebrow">Passengers</span><PassengerControl value={passengers} onChange={setPassengers} /></div>
    <BookingButton asChild className="md:col-span-2 xl:col-span-1"><Link to="/book" search={{ pickup: pickup ? JSON.stringify(pickup) : undefined, destination: destination ? JSON.stringify(destination) : undefined, date, passengers }}>Check fare <ArrowRight /></Link></BookingButton>
  </div>;
}