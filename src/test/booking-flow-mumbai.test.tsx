import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VehicleCategoryCard } from "@/components/booking/VehicleCategoryCard";
import {
  canUseOnlineCheckout,
  categoryImage,
  type Category,
} from "@/components/booking/vehicle-category";

const MUMBAI_VEHICLE_CATEGORIES: Category[] = [
  {
    id: "sedan",
    code: "MUMBAI_SEDAN",
    name: "Sedan",
    passenger_capacity: 4,
    luggage_capacity: 2,
    models: ["Maruti Dzire", "Alma"],
    pricing_type: "fixed",
  },
  {
    id: "suv",
    code: "MUMBAI_SUV",
    name: "SUV",
    passenger_capacity: 6,
    luggage_capacity: 4,
    models: ["Maruti Ertiga", "Toyota Rumion", "Kia Carens", "Honda City", "Maruti Ciaz"],
    pricing_type: "fixed",
  },
  {
    id: "premium-sedan",
    code: "MUMBAI_PREMIUM_SEDAN",
    name: "Premium Sedan",
    passenger_capacity: 4,
    luggage_capacity: 3,
    models: ["Toyota Camry"],
    pricing_type: "price_on_request",
  },
  {
    id: "premium-suv",
    code: "MUMBAI_PREMIUM_SUV",
    name: "Premium SUV",
    passenger_capacity: 7,
    luggage_capacity: 4,
    models: ["Toyota Innova Crysta"],
    pricing_type: "fixed",
  },
  {
    id: "hycross",
    code: "MUMBAI_HYCROSS_INVICTO",
    name: "Innova Hycross / Maruti Suzuki Invicto",
    passenger_capacity: 7,
    luggage_capacity: 4,
    models: ["Toyota Innova Hycross", "Maruti Suzuki Invicto"],
    pricing_type: "price_on_request",
  },
  {
    id: "exclusive-suv",
    code: "MUMBAI_EXCLUSIVE_SUV",
    name: "Exclusive SUV",
    passenger_capacity: 7,
    luggage_capacity: 4,
    models: ["Toyota Fortuner", "Kia Carnival"],
    pricing_type: "price_on_request",
  },
  {
    id: "luxury-sedan",
    code: "MUMBAI_LUXURY_SEDAN",
    name: "Luxury Sedan",
    passenger_capacity: 4,
    luggage_capacity: 3,
    models: ["BMW 5 Series", "Audi A6", "Mercedes E-Class", "Mercedes S-Class", "BMW 7 Series"],
    pricing_type: "price_on_request",
  },
  {
    id: "luxury-van",
    code: "MUMBAI_LUXURY_VAN",
    name: "Luxury Van",
    passenger_capacity: 7,
    luggage_capacity: 6,
    models: ["Mercedes GLE 350", "Toyota Vellfire", "Mercedes V-Class"],
    pricing_type: "price_on_request",
  },
  {
    id: "coach",
    code: "MUMBAI_GROUP_COACH",
    name: "Group / Coach",
    passenger_capacity: 45,
    luggage_capacity: 45,
    models: [
      "Urbania 9 Seater",
      "Urbania 16 Seater",
      "35 Seater BharatBenz",
      "45 Seater BharatBenz",
      "45 Seater Volvo",
    ],
    pricing_type: "price_on_request",
  },
];

describe("VehicleCategoryCard with Mumbai categories", () => {
  it("renders Sedan with models and fixed rate card badge", () => {
    const sedan = MUMBAI_VEHICLE_CATEGORIES[0]!;
    render(<VehicleCategoryCard category={sedan} selected={false} onSelect={() => {}} />);

    expect(screen.getByText("Sedan")).toBeDefined();
    expect(screen.getByText("Maruti Dzire · Alma")).toBeDefined();
    expect(screen.getByText(/Up to 4 passengers/)).toBeDefined();
    expect(screen.getByText("Fixed Rate Card")).toBeDefined();
  });

  it("renders Luxury Van with models and Price on Request badges", () => {
    const luxuryVan = MUMBAI_VEHICLE_CATEGORIES[7]!;
    render(<VehicleCategoryCard category={luxuryVan} selected={false} onSelect={() => {}} />);

    expect(screen.getByText("Luxury Van")).toBeDefined();
    expect(screen.getByText("Mercedes GLE 350 · Toyota Vellfire · Mercedes V-Class")).toBeDefined();
    expect(screen.getByText(/Up to 7 passengers/)).toBeDefined();
    expect(screen.getByText("Price on Request")).toBeDefined();
    expect(screen.getByText("Custom Quote")).toBeDefined();
    expect(screen.getByText("Select for quotation")).toBeDefined();
  });

  it("renders Group / Coach with models and Price on Request badges", () => {
    const coach = MUMBAI_VEHICLE_CATEGORIES[8]!;
    render(<VehicleCategoryCard category={coach} selected={false} onSelect={() => {}} />);

    expect(screen.getByText("Group / Coach")).toBeDefined();
    expect(
      screen.getByText(
        "Urbania 9 Seater · Urbania 16 Seater · 35 Seater BharatBenz · 45 Seater BharatBenz · 45 Seater Volvo",
      ),
    ).toBeDefined();
    expect(screen.getByText(/Up to 45 passengers/)).toBeDefined();
    expect(screen.getByText("Price on Request")).toBeDefined();
  });

  it("provides distinct non-repetitive vehicle images for all 9 Mumbai categories", async () => {
    const images = MUMBAI_VEHICLE_CATEGORIES.map((category) => categoryImage(category));

    // Every category must have a defined image
    for (const img of images) {
      expect(img).toBeDefined();
      expect(typeof img).toBe("string");
      expect(img.length).toBeGreaterThan(0);
    }

    // Every category has its own distinct car image (no repetitive car picture across the 9 categories)
    const uniqueImages = new Set(images);
    expect(uniqueImages.size).toBe(9);
  });

  it("allows online checkout only when the catalog explicitly marks fixed pricing", () => {
    expect(canUseOnlineCheckout(MUMBAI_VEHICLE_CATEGORIES[0])).toBe(true);
    expect(canUseOnlineCheckout(MUMBAI_VEHICLE_CATEGORIES[7])).toBe(false);
    expect(canUseOnlineCheckout({ pricing_type: "unclassified" })).toBe(false);
    expect(canUseOnlineCheckout(undefined)).toBe(false);
  });

  it("labels an unclassified category without inferring pricing from its name or image", () => {
    const unclassified: Category = {
      id: "pending",
      code: "MUMBAI_LUXURY_SEDAN",
      name: "Luxury Sedan",
      passenger_capacity: 4,
      luggage_capacity: null,
      models: ["Mercedes"],
      pricing_type: "unclassified",
    };
    render(<VehicleCategoryCard category={unclassified} selected={false} onSelect={() => {}} />);

    expect(screen.getByText("Pricing classification pending")).toBeDefined();
    expect(screen.queryByText("Price on Request")).toBeNull();
    expect(screen.queryByText("Fixed Rate Card")).toBeNull();
  });
});
