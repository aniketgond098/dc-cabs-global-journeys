import { z } from "zod";
import type { Journey, JourneyLocation, Quote, RouteDetails } from "./booking-types";

export const guestSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your full name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  phone: z.string().trim().refine(v => /^[+\d\s().-]+$/.test(v) && v.replace(/\D/g, "").length >= 6, "Enter a valid phone number.").max(32),
  companyName: z.string().trim().max(160), instructions: z.string().trim().max(1500),
});
export function isBookable(location: JourneyLocation | null) {
  return Boolean(location?.source === "catalog" && location.catalogLocationId && location.catalogCityId);
}
export function quoteRemainingSeconds(quote: Quote, now = Date.now()) {
  const expiry = Date.parse(quote.expiresAt);
  return Number.isFinite(expiry) ? Math.max(0, Math.ceil((expiry - now) / 1000)) : 0;
}
export function routeMetrics(route: RouteDetails | null) {
  if (!route) return null;
  return `${(route.distanceMeters / 1000).toFixed(1)} km · ${Math.ceil(route.durationSeconds / 60)} min`;
}
export function journeyErrors(journey: Journey, now = Date.now()) {
  const errors: Record<string, string> = {};
  if (!journey.pickup) errors.pickup = "Select your pickup location.";
  if (!journey.destination) errors.destination = "Select your destination.";
  if (journey.pickup && journey.pickup.id === journey.destination?.id) errors.destination = "Choose a destination different from your pickup.";
  const pickupAt = new Date(`${journey.date}T${journey.time}`).getTime();
  if (!journey.date) errors.date = "Select a pickup date.";
  if (!journey.time) errors.time = "Select a pickup time.";
  if (journey.date && journey.time && (!Number.isFinite(pickupAt) || pickupAt <= now)) errors.date = "Choose a future pickup date and time.";
  return errors;
}