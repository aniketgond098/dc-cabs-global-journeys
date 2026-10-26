import { fleet } from "@/content/site";
import type { JourneyLocation, Vehicle } from "./booking-types";

// Search demonstrations, never catalog records or assertions of bookability.
export const previewLocations: JourneyLocation[] = [
  { id: "preview-bom-t1", name: "Mumbai Airport Terminal 1", detail: "Mumbai · Airport · Preview", coordinates: [72.8517, 19.0938], source: "preview" },
  { id: "preview-bom-t2", name: "Mumbai Airport Terminal 2", detail: "Mumbai · Airport · Preview", coordinates: [72.8749, 19.0896], source: "preview" },
  { id: "preview-central", name: "Mumbai Central", detail: "Mumbai · Railway station · Preview", coordinates: [72.8195, 18.969], source: "preview" },
  { id: "preview-bandra", name: "Bandra Terminus", detail: "Mumbai · Railway station · Preview", coordinates: [72.8408, 19.0624], source: "preview" },
  { id: "preview-bkc", name: "Bandra Kurla Complex", detail: "Mumbai · Business district · Preview", coordinates: [72.8691, 19.0606], source: "preview" },
  { id: "preview-colaba", name: "Colaba", detail: "Mumbai · Neighbourhood · Preview", coordinates: [72.814, 18.9067], source: "preview" },
  { id: "preview-pune", name: "Pune Airport", detail: "Pune · Airport · Preview", coordinates: [73.9197, 18.5793], source: "preview" },
];
export const previewVehicles: Vehicle[] = fleet.map(item => ({ id: item.id, name: item.name, image: item.image, models: item.models, preview: true }));