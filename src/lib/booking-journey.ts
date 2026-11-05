export type BookableJourneyLocation = {
  id?: string;
  cityId?: string;
  label?: string;
  bookable: boolean;
  source?: "catalog" | "geocoding" | "custom_address";
};

export function canContinueJourney({
  pickup,
  destination,
  pickupAt,
  categoriesError,
}: {
  pickup: BookableJourneyLocation | null;
  destination: BookableJourneyLocation | null;
  pickupAt: string;
  categoriesError: string;
}): boolean {
  return Boolean(
    pickup?.cityId &&
    pickup.label?.trim() &&
    destination?.cityId &&
    destination.label?.trim() &&
    pickupAt &&
    Date.parse(pickupAt) > Date.now() &&
    !categoriesError,
  );
}
