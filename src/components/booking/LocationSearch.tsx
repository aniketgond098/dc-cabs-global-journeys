import { useEffect, useId, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mapboxToken, searchMapbox } from "@/lib/booking-client";
import { previewLocations } from "@/lib/booking-preview";
import type { JourneyLocation } from "@/lib/booking-types";

export function LocationSearch({ label, value, onChange, error }: { label: string; value: JourneyLocation | null; onChange: (value: JourneyLocation | null) => void; error?: string }) {
  const id = useId();
  const [text, setText] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<JourneyLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [active, setActive] = useState(-1);
  const [retry, setRetry] = useState(0);
  useEffect(() => { setText(value?.name ?? ""); }, [value]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setActive(-1); setFailure("");
    if (!mapboxToken() || text.trim().length < 3) {
      setItems(previewLocations.filter(item => `${item.name} ${item.detail}`.toLowerCase().includes(text.toLowerCase())));
      setBusy(false);
      return () => controller.abort();
    }
    setBusy(true); setItems([]);
    const timer = setTimeout(() => {
      void searchMapbox(text, controller.signal).then(setItems).catch((cause: unknown) => {
        if (!controller.signal.aborted) setFailure(cause instanceof Error ? cause.message : "Search unavailable.");
      }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, text, retry]);
  function select(item: JourneyLocation) { onChange(item); setText(item.name); setOpen(false); }
  return <div className="relative min-w-0" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id} className="eyebrow block">{label}</label>
    <div className="flex min-h-12 items-center gap-2 border-b border-hairline focus-within:border-primary">
      <Search className="size-4 shrink-0 text-primary-tint" />
      <input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} autoComplete="off" placeholder={label === "From" || label === "Pickup" ? "Search pickup location…" : "Search destination…"} value={text} className="w-full min-w-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground" onFocus={() => setOpen(true)} onChange={e => { setText(e.target.value); onChange(null); setOpen(true); }} onKeyDown={e => {
        if (e.key === "Escape") setOpen(false);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setActive(i => e.key === "ArrowDown" ? Math.min(i + 1, items.length - 1) : Math.max(i - 1, 0)); }
        if (e.key === "Enter" && open) { e.preventDefault(); const item = items[active]; if (item) select(item); }
      }} />
      {text && <Button type="button" size="icon" variant="ghost" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => { onChange(null); setText(""); setOpen(true); }}><X /></Button>}
    </div>
    {error && <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-primary-tint">{error}</p>}
    {open && <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto border border-hairline bg-popover shadow-lg">
      <p className="border-b border-border px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{mapboxToken() && text.length >= 3 ? "Search results · availability to be confirmed" : "Preview locations · availability not confirmed"}</p>
      {busy && <p role="status" className="flex items-center gap-2 p-4 text-sm"><Loader2 className="size-4 animate-spin" /> Searching…</p>}
      {failure && <div role="alert" className="p-4 text-sm">{failure}<Button type="button" variant="link" onClick={() => setRetry(i => i + 1)}>Retry</Button></div>}
      {!busy && !failure && !items.length && <p role="status" className="p-4 text-sm text-muted-foreground">No locations found. Try another location or request a custom quote.</p>}
      <ul id={`${id}-list`} role="listbox" aria-label={`${label} results`}>
        {items.map((item, i) => <li key={item.id} id={`${id}-${i}`} role="option" aria-selected={value?.id === item.id} className={active === i ? "bg-secondary" : ""}>
          <Button type="button" variant="ghost" className="h-auto w-full justify-start whitespace-normal rounded-none px-4 py-3 text-left hover:bg-secondary hover:text-foreground" onMouseDown={e => e.preventDefault()} onClick={() => select(item)}><MapPin className="text-primary-tint" /><span className="min-w-0"><span className="block text-sm">{item.name}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{item.detail}</span></span></Button>
        </li>)}
      </ul>
    </div>}
  </div>;
}