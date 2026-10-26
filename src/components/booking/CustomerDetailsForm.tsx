import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { BookingButton } from "./BookingButton";
import { guestSchema } from "@/lib/booking-rules";
import type { Guest } from "@/lib/booking-types";
export const bookingInput = "mt-2 h-12 w-full min-w-0 border-b border-hairline bg-transparent px-0 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary [color-scheme:dark]";
export function CustomerDetailsForm({ guest, onChange, onContinue }: { guest: Guest; onChange: (guest: Guest) => void; onContinue: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields = [{ key: "fullName", label: "Full name", type: "text", auto: "name" }, { key: "email", label: "Email", type: "email", auto: "email" }, { key: "phone", label: "Phone", type: "tel", auto: "tel" }, { key: "companyName", label: "Company (optional)", type: "text", auto: "organization" }] as const;
  return <form noValidate onSubmit={e => { e.preventDefault(); const result = guestSchema.safeParse(guest); if (!result.success) { setErrors(Object.fromEntries(result.error.issues.map(issue => [issue.path[0], issue.message]))); return; } setErrors({}); onChange(result.data); onContinue(); }} className="grid gap-6 sm:grid-cols-2">
    {fields.map(field => <label key={field.key} className="min-w-0"><span className="eyebrow">{field.label}</span><input className={bookingInput} type={field.type} autoComplete={field.auto} value={guest[field.key]} maxLength={field.key === "email" ? 254 : field.key === "phone" ? 32 : 160} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `guest-${field.key}-error` : undefined} onChange={e => onChange({ ...guest, [field.key]: e.target.value })} />{errors[field.key] && <span id={`guest-${field.key}-error`} role="alert" className="mt-2 block text-xs text-primary-tint">{errors[field.key]}</span>}</label>)}
    <label className="sm:col-span-2"><span className="eyebrow">Special instructions (optional)</span><textarea className={`${bookingInput} h-auto py-3`} rows={3} maxLength={1500} value={guest.instructions} onChange={e => onChange({ ...guest, instructions: e.target.value })} /></label>
    <div className="sm:col-span-2"><BookingButton type="submit">Review journey <ArrowRight /></BookingButton></div>
  </form>;
}