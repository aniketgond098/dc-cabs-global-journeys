export type TripType = "local" | "outstation" | "airport_transfer";
export type JourneyLocation = {
  id: string;
  name: string;
  detail: string;
  coordinates?: [number, number];
  source: "preview" | "mapbox" | "catalog";
  catalogLocationId?: string;
  catalogCityId?: string;
};
export type Vehicle = { id: string; name: string; image: string; models?: string[]; passengerCapacity?: number; luggageCapacity?: number; preview?: boolean };
export type Journey = {
  tripType: TripType;
  pickup: JourneyLocation | null;
  destination: JourneyLocation | null;
  date: string;
  time: string;
  passengers: number;
  packageTier: string;
  tripDays: number;
};
export type Guest = { fullName: string; email: string; phone: string; companyName: string; instructions: string };
export type RouteDetails = { geometry: GeoJSON.LineString; distanceMeters: number; durationSeconds: number };
export type Quote = {
  quoteId: string;
  expiresAt: string;
  pricing: { currency?: string; components?: Record<string, number | string | null>; inputs?: Record<string, number | null> };
};
export type QuoteRequest = {
  tripType: TripType; packageTier: string; originLocationId: string;
  destinationLocationId?: string; destinationCityId?: string;
  pickupAt: string; vehicleCategoryId: string; passengerCount: number;
  tripDays: number; estimatedDistanceKm?: number; estimatedDurationHours?: number;
};
export type BookingPayment = {
  id: string; bookingReference: string; currency: string; total: number;
  paymentAccessToken: string; customer?: { fullName?: string; email?: string; phone?: string };
};
export type GatewayOrder = { keyId: string; orderId: string; amount: number; currency: string; bookingReference: string };
export type BookingConfirmation = {
  booking_reference: string; status: string; payment_status: string; currency_code: string;
  total_amount: number | string; pickup_at: string; trip_type: string; package_tier: string;
  passenger_count: number; customer?: { full_name?: string } | null;
  origin_city?: { name?: string } | null; destination_city?: { name?: string } | null;
  origin_location?: { name?: string } | null; destination_location?: { name?: string } | null;
  vehicle_category?: { name?: string } | null;
};