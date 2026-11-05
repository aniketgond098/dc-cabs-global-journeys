import { ArrowUpRight, Briefcase, Check, Users } from "lucide-react";
import { categoryImage, type Category } from "./vehicle-category";

export function VehicleCategoryCard({
  category,
  selected,
  onSelect,
}: {
  category: Category;
  selected: boolean;
  onSelect: () => void;
}) {
  const isPriceOnRequest = category.pricing_type === "price_on_request";
  const isFixedPrice = category.pricing_type === "fixed";

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`group flex h-full w-full flex-col overflow-hidden border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary bg-surface" : "border-border bg-charcoal hover:border-foreground/40"}`}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        <img
          src={categoryImage(category)}
          alt={category.name}
          referrerPolicy="no-referrer"
          className="size-full object-cover opacity-85 transition duration-700 group-hover:scale-105 group-hover:opacity-100"
          loading="lazy"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
        <span className="eyebrow absolute bottom-4 left-4 text-foreground/90">
          Chauffeur category
        </span>
        {isPriceOnRequest ? (
          <span className="absolute top-3 left-3 border border-primary/60 bg-background/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            Price on Request
          </span>
        ) : null}
        <span
          className="absolute right-3 top-3 grid size-8 place-items-center border border-hairline bg-background"
          aria-hidden="true"
        >
          {selected ? (
            <Check className="size-4 text-primary-tint" />
          ) : (
            <ArrowUpRight className="size-4" />
          )}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-2xl font-bold uppercase">{category.name}</h3>
        {category.models && category.models.length > 0 ? (
          <p className="mt-1.5 text-xs font-medium text-foreground/90">
            {category.models.join(" · ")}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="size-4" /> Up to {category.passenger_capacity} passengers
          </span>
          {category.luggage_capacity !== null && (
            <span className="inline-flex items-center gap-1">
              <Briefcase className="size-4" /> {category.luggage_capacity} luggage
            </span>
          )}
          {isPriceOnRequest ? (
            <span className="border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-tint">
              Custom Quote
            </span>
          ) : isFixedPrice ? (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Fixed Rate Card
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Pricing classification pending
            </span>
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {isPriceOnRequest
            ? "Specialized high-capacity or luxury vehicle with tailored quotation from DC Cabs."
            : isFixedPrice
              ? "Chauffeur-driven category with pricing confirmed by the DC Cabs fare service."
              : "Online quotes are unavailable until DC Cabs verifies this category’s pricing classification."}
        </p>
        <span className="mt-auto pt-5 text-xs font-semibold">
          {selected ? "Selected" : isPriceOnRequest ? "Select for quotation" : "Select category"}
        </span>
      </div>
    </button>
  );
}
