import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import { ArrowDown, MapPin, Navigation, Loader2 } from "lucide-react";
import { BookingButton } from "./BookingButton";
import { getMapboxRoute, mapboxToken } from "@/lib/booking-client";
import { routeMetrics } from "@/lib/booking-rules";
import type { JourneyLocation, RouteDetails } from "@/lib/booking-types";

export function BookingRouteMap({ pickup, destination, onRoute }: { pickup: JourneyLocation | null; destination: JourneyLocation | null; onRoute: (route: RouteDetails | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<RouteDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [retry, setRetry] = useState(0);
  const token = mapboxToken();
  useEffect(() => {
    if (!token || !container.current) return;
    let disposed = false;
    setMapError(""); setReady(false);
    void Promise.all([import("mapbox-gl"), import("mapbox-gl/dist/mapbox-gl.css")]).then(([module]) => {
      if (disposed || !container.current) return;
      const instance = new module.default.Map({ container: container.current, accessToken: token, style: "mapbox://styles/mapbox/dark-v11", center: [72.87, 19.07], zoom: 10, attributionControl: true });
      map.current = instance;
      instance.addControl(new module.default.NavigationControl({ showCompass: false }), "top-right");
      instance.on("load", () => { if (!disposed) setReady(true); });
      instance.on("error", () => { if (!disposed) setMapError("Journey map could not be loaded. Your selections are saved."); });
    }).catch(() => { if (!disposed) setMapError("Journey map is unavailable in this browser."); });
    return () => { disposed = true; map.current?.remove(); map.current = null; };
  }, [token, retry]);
  useEffect(() => {
    setRoute(null); onRoute(null); setError("");
    if (!token || !pickup?.coordinates || !destination?.coordinates) { setBusy(false); return; }
    const controller = new AbortController(); setBusy(true);
    void getMapboxRoute(pickup.coordinates, destination.coordinates, controller.signal).then(data => {
      if (!controller.signal.aborted) { setRoute(data); onRoute(data); }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Route unavailable."); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [pickup, destination, token, retry, onRoute]);
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    const routeId = "dc-route";
    const markersId = "dc-stops";
    for (const id of [routeId, markersId]) { if (instance.getLayer(id)) instance.removeLayer(id); if (instance.getSource(id)) instance.removeSource(id); }
    const color = getComputedStyle(document.documentElement).getPropertyValue("--primary-tint").trim();
    // Mapbox needs an sRGB color; resolve the site's semantic token through canvas.
    const canvas = document.createElement("canvas"); const context = canvas.getContext("2d");
    let accent = color;
    if (context) { context.fillStyle = color; accent = context.fillStyle; }
    if (route) {
      instance.addSource(routeId, { type: "geojson", data: { type: "Feature", properties: {}, geometry: route.geometry } });
      instance.addLayer({ id: routeId, type: "line", source: routeId, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": accent, "line-width": 4 } });
    }
    const stops = [pickup, destination].flatMap(location => location?.coordinates ? [location.coordinates] : []);
    if (stops.length) {
      instance.addSource(markersId, { type: "geojson", data: { type: "FeatureCollection", features: stops.map(coordinates => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates } })) } });
      instance.addLayer({ id: markersId, type: "circle", source: markersId, paint: { "circle-radius": 7, "circle-color": accent, "circle-stroke-width": 3, "circle-stroke-color": accent, "circle-stroke-opacity": 0.3 } });
      const allPoints = route?.geometry.coordinates ?? stops;
      const xs = allPoints.map(p => p[0]); const ys = allPoints.map(p => p[1]);
      if (stops.length === 1) instance.flyTo({ center: stops[0], zoom: 13, essential: false });
      else instance.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 55, maxZoom: 14, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700 });
    }
  }, [pickup, destination, route, ready]);
  return <div className="overflow-hidden border border-border bg-charcoal">
    <div className="relative h-[320px] lg:h-[400px]">
      {token && <div ref={container} aria-label="Journey route map" className="absolute inset-0" />}
      {(!token || mapError || !ready) && <div className="map-placeholder absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <Navigation className="size-8 text-primary-tint" />
        <p className="max-w-xs text-sm text-muted-foreground">{mapError || (token ? "Loading journey map…" : pickup && destination ? "Journey selected. Live route preview will be available once the map is connected." : "Select your pickup and destination to preview your journey.")}</p>
        {!token && <span className="eyebrow">Map preview unavailable</span>}
        {mapError && <BookingButton variant="outline" onClick={() => setRetry(i => i + 1)}>Retry map</BookingButton>}
      </div>}
    </div>
    <div className="space-y-3 border-t border-border p-5">
      <div className="flex items-start gap-3"><MapPin className="mt-1 size-4 shrink-0 text-primary-tint" /><div><p className="eyebrow">From</p><p className="mt-1 text-sm">{pickup?.name ?? "Pickup location"}</p></div></div>
      <ArrowDown className="ml-0.5 size-3 text-muted-foreground" />
      <div className="flex items-start gap-3"><MapPin className="mt-1 size-4 shrink-0 text-primary-tint" /><div><p className="eyebrow">To</p><p className="mt-1 text-sm">{destination?.name ?? "Destination"}</p></div></div>
      {busy && <p role="status" className="flex gap-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Finding your route…</p>}
      {route && <p className="border-t border-border pt-3 text-sm text-primary-tint">{routeMetrics(route)}</p>}
      {error && <p role="alert" className="text-sm text-muted-foreground">{error} <BookingButton variant="link" onClick={() => setRetry(i => i + 1)}>Retry route</BookingButton></p>}
    </div>
  </div>;
}