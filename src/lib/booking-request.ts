export type ServerQuoteRequest = {
  tripType: string;
  packageTier: string;
  originCityId: string;
  originAddress: string;
  originLocationId?: string;
  destinationCityId: string;
  destinationAddress: string;
  destinationLocationId?: string;
  pickupAt: string;
  vehicleCategoryId: string;
  passengerCount: number;
  tripDays: number;
};

/** Browser coordinates and route estimates are deliberately excluded. */
export function buildQuoteRequestPayload(input: ServerQuoteRequest): ServerQuoteRequest {
  return { ...input };
}

/** The booking API has no intermediate-stop persistence contract. */
export function hasUnsupportedIntermediateStops(stops: readonly unknown[]): boolean {
  return stops.length > 0;
}
