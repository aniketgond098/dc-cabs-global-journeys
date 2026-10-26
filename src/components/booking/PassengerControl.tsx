import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
export function PassengerControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="flex h-12 items-center justify-between gap-3 border-b border-hairline">
    <Button type="button" variant="ghost" size="icon" aria-label="Fewer passengers" title="Fewer passengers" disabled={value <= 1} onClick={() => onChange(value - 1)}><Minus /></Button>
    <output aria-label="Passenger count" className="min-w-8 text-center tabular-nums">{value}</output>
    <Button type="button" variant="ghost" size="icon" aria-label="More passengers" title="More passengers" onClick={() => onChange(value + 1)}><Plus /></Button>
  </div>;
}