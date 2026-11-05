import fallbackSedan from "@/assets/fleet-sedan.jpg";
import fallbackSuv from "@/assets/fleet-suv.jpg";
import fallbackLuxury from "@/assets/fleet-luxury.jpg";
import fallbackCoach from "@/assets/fleet-coach.jpg";
import dzireImg from "@/assets/images/mumbai_sedan_dzire_1793629725655.jpg";
import ertigaImg from "@/assets/images/mumbai_suv_ertiga_1793629726349.jpg";
import crystaImg from "@/assets/images/mumbai_innova_crysta_1793629725904.jpg";
import hycrossImg from "@/assets/images/mumbai_innova_hycross_1793629726794.jpg";
import fortunerImg from "@/assets/images/mumbai_exclusive_fortuner_1793629727557.jpg";
import camryImg from "@/assets/images/mumbai_camry_sedan_1793629728073.jpg";
import mercedesImg from "@/assets/images/mumbai_luxury_mercedes_1793629728611.jpg";
import vellfireImg from "@/assets/images/mumbai_luxury_vellfire_1793629728585.jpg";
import urbaniaImg from "@/assets/images/mumbai_urbania_coach_1793629729539.jpg";

export type Category = {
  id: string;
  code: string;
  name: string;
  passenger_capacity: number;
  luggage_capacity: number | null;
  models?: string[];
  pricing_type: "fixed" | "price_on_request" | "unclassified";
  display_order?: number;
  is_active?: boolean;
};

export function canUseOnlineCheckout(category: Pick<Category, "pricing_type"> | null | undefined) {
  return category?.pricing_type === "fixed";
}

export function categoryImage(category: Category): string {
  const code = (category.code || "").toUpperCase();
  const name = category.name.toLowerCase();
  const models = (category.models || []).join(" ").toLowerCase();
  const text = `${name} ${models}`;

  if (code === "MUMBAI_HYCROSS_INVICTO" || /hycross|invicto/.test(text)) {
    return hycrossImg;
  }
  if (code === "MUMBAI_PREMIUM_SUV" || /crysta/.test(text)) {
    return crystaImg;
  }
  if (code === "MUMBAI_EXCLUSIVE_SUV" || /fortuner|carnival/.test(text)) {
    return fortunerImg;
  }
  if (code === "MUMBAI_LUXURY_VAN" || /vellfire|v-class|gle 350|luxury van/.test(text)) {
    return vellfireImg;
  }
  if (code === "MUMBAI_PREMIUM_SEDAN" || /camry/.test(text)) {
    return camryImg;
  }
  if (code === "MUMBAI_LUXURY_SEDAN" || /bmw|audi|mercedes|luxury sedan/.test(text)) {
    return mercedesImg;
  }
  if (code === "MUMBAI_GROUP_COACH" || /urbania|bharatbenz|volvo|coach|bus|group/.test(text)) {
    return urbaniaImg;
  }
  if (code === "MUMBAI_SUV" || /ertiga|rumion/.test(text)) {
    return ertigaImg;
  }
  if (code === "MUMBAI_SEDAN" || /dzire|alma/.test(text)) {
    return dzireImg;
  }

  if (/coach|bus|group/.test(text)) return fallbackCoach;
  if (/luxury|premium|executive/.test(text)) return fallbackLuxury;
  if (/suv|muv/.test(text)) return fallbackSuv;
  return fallbackSedan;
}
