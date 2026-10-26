import type { BookingConfirmation, BookingPayment, GatewayOrder, Guest, JourneyLocation, Quote, QuoteRequest, RouteDetails } from "./booking-types";

export class BookingClientError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, options);
  const body = await response.json() as T & { error?: { message?: string; code?: string } };
  if (!response.ok) throw new BookingClientError(body.error?.message ?? "This request could not be completed. Please try again.", body.error?.code);
  return body;
}
const post = <T,>(path: string, body: unknown, headers?: HeadersInit) => request<T>(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

// Existing REST contracts only. Preview UI never calls transactional methods.
export const bookingClient = {
  catalog: <T,>(resource: "countries" | "regions" | "cities" | "locations" | "vehicle-categories", params: Record<string, string> = {}) => request<{ data: T[] }>(`catalog/${resource}?${new URLSearchParams(params)}`),
  quote: (body: QuoteRequest) => post<Quote>("quotes", body),
  createBooking: (quoteId: string, customer: Guest, idempotencyKey: string) => post<{ booking: BookingPayment }>("bookings", { quoteId, customer: { fullName: customer.fullName, email: customer.email, phone: customer.phone, ...(customer.companyName ? { companyName: customer.companyName } : {}) } }, { "Idempotency-Key": idempotencyKey }),
  createOrder: (booking: BookingPayment) => post<GatewayOrder>("payments/create-order", { bookingId: booking.id, paymentAccessToken: booking.paymentAccessToken }),
  verifyPayment: (booking: BookingPayment, checkout: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string }) => post<unknown>("payments/verify", { bookingId: booking.id, paymentAccessToken: booking.paymentAccessToken, orderId: checkout.razorpay_order_id, paymentId: checkout.razorpay_payment_id, signature: checkout.razorpay_signature }),
  paymentStatus: (id: string, token: string, signal?: AbortSignal) => request<{ booking: BookingConfirmation }>(`payments/status?booking_id=${encodeURIComponent(id)}`, { headers: { "x-booking-payment-token": token }, signal }),
};

export const mapboxToken = () => import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;
export async function searchMapbox(query: string, signal: AbortSignal): Promise<JourneyLocation[]> {
  const token = mapboxToken();
  if (!token) return [];
  const params = new URLSearchParams({ access_token: token, limit: "6", autocomplete: "true" });
  const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`, { signal });
  if (!response.ok) throw new Error("Location search is unavailable. Please try again.");
  const result = await response.json() as { features: { id: string; text: string; place_name: string; center: [number, number] }[] };
  return result.features.map(f => ({ id: f.id, name: f.text, detail: f.place_name, coordinates: f.center, source: "mapbox" }));
}
export async function getMapboxRoute(from: [number, number], to: [number, number], signal: AbortSignal): Promise<RouteDetails> {
  const token = mapboxToken();
  if (!token) throw new Error("Journey map is not configured yet.");
  const params = new URLSearchParams({ access_token: token, geometries: "geojson", overview: "full" });
  const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${from.join(",")};${to.join(",")}?${params}`, { signal });
  if (!response.ok) throw new Error("The route could not be loaded. Please try again.");
  const body = await response.json() as { routes?: { geometry: GeoJSON.LineString; distance: number; duration: number }[] };
  const route = body.routes?.[0];
  if (!route) throw new Error("No driving route was found for these locations.");
  return { geometry: route.geometry, distanceMeters: route.distance, durationSeconds: route.duration };
}