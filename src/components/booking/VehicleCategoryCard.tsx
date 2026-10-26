import { Check, Users, Briefcase, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Vehicle } from "@/lib/booking-types";
import { cn } from "@/lib/utils";
export function VehicleCategoryCard({ vehicle, selected, onSelect }: { vehicle: Vehicle; selected: boolean; onSelect: () => void }) {
  return <Button type="button" variant="outline" aria-pressed={selected} onClick={onSelect} className={cn("group h-full w-full flex-col items-stretch gap-0 overflow-hidden whitespace-normal rounded-sm p-0 text-left hover:bg-charcoal hover:text-foreground", selected && "border-primary bg-charcoal")}>
    <div className="relative aspect-[16/9] w-full overflow-hidden"><img src={vehicle.image} alt={vehicle.name} className="size-full object-cover transition-transform duration-500 group-hover:scale-105" /><span className="absolute right-3 top-3 grid size-7 place-items-center border border-hairline bg-background">{selected ? <Check className="text-primary-tint" /> : <ArrowUpRight />}</span></div>
    <div className="flex flex-1 flex-col p-5"><p className="eyebrow text-primary-tint">{vehicle.preview ? "Collection preview" : "Available category"}</p><h3 className="mt-3 font-display text-xl font-bold uppercase leading-tight">{vehicle.name}</h3>
      {vehicle.models && <p className="mt-3 text-xs font-normal leading-relaxed text-muted-foreground">{vehicle.models.join(" · ")}</p>}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">{vehicle.passengerCapacity != null && <span className="flex gap-1"><Users /> {vehicle.passengerCapacity} passengers</span>}{vehicle.luggageCapacity != null && <span className="flex gap-1"><Briefcase /> {vehicle.luggageCapacity} bags</span>}</div>
      <span className="mt-auto pt-5 text-xs">{selected ? "Selected" : "Select category"}</span>
    </div>
  </Button>;
}