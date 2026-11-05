export type ServerQuoteRequest = {
  tripType: string;
  packageTier: string;
  originLocationId: string;
  destinationCityId?: string;
  destinationLocationId: string;
  pickupAt: string;
  vehicleCategoryId: string;
  passengerCount: number;
  tripDays: number;
};

/** Keep route-provider estimates out of the server pricing request. */
export function buildQuoteRequestPayload(input: ServerQuoteRequest): ServerQuoteRequest {
  return { ...input };
}

/** The booking API has no intermediate-stop persistence contract. */
export function hasUnsupportedIntermediateStops(stops: readonly unknown[]): boolean {
  return stops.length > 0;
}
