import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { JourneyLocation } from "./LocationSearch";

const MAPBOX_TOKEN = import.meta.env["VITE_MAPBOX_ACCESS_TOKEN"];

export type RouteEstimate = { distanceKm: number; durationHours: number };

export function BookingRouteMap({
  pickup,
  destination,
  onRoute,
}: {
  pickup: JourneyLocation | null;
  destination: JourneyLocation | null;
  onRoute: (estimate: RouteEstimate | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    let disposed = false;
    let map: import("mapbox-gl").Map | null = null;
    let pickupMarker: import("mapbox-gl").Marker | null = null;
    let destinationMarker: import("mapbox-gl").Marker | null = null;
    onRoute(null);

    void import("mapbox-gl")
      .then((module) => {
        if (disposed || !containerRef.current) return;
        const mapboxgl = module.default;
        mapboxgl.accessToken = MAPBOX_TOKEN;
        const center = pickup?.coordinates ?? [72.8777, 19.076];
        map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/dark-v11",
          center,
          zoom: pickup ? 11 : 9,
          attributionControl: true,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        pickupMarker = new mapboxgl.Marker({ color: "#d12b36" });
        destinationMarker = new mapboxgl.Marker({ color: "#f2eee8" });
        map.on("error", () =>
          setMapError(
            "The map could not be loaded. Check Mapbox configuration and network access.",
          ),
        );
        map.once("load", () => {
          if (disposed || !map) return;
          setMapError("");
          if (pickup) pickupMarker?.setLngLat(pickup.coordinates).addTo(map);
          if (destination) destinationMarker?.setLngLat(destination.coordinates).addTo(map);
          if (pickup && destination) {
            const coordinates = `${pickup.coordinates.join(",")};${destination.coordinates.join(",")}`;
            const params = new URLSearchParams({
              geometries: "geojson",
              overview: "full",
              steps: "false",
              access_token: MAPBOX_TOKEN,
            });
            void fetch(
              `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?${params}`,
            )
              .then(async (response) => {
                if (!response.ok)
                  throw new Error("A route preview is unavailable for this journey.");
                const body = (await response.json()) as {
                  routes?: {
                    distance: number;
                    duration: number;
                    geometry: { type: "LineString"; coordinates: [number, number][] };
                  }[];
                };
                const route = body.routes?.[0];
                if (!route || disposed || !map)
                  throw new Error("A driving route could not be found.");
                map.addSource("dc-route", { type: "geojson", data: route.geometry });
                map.addLayer({
                  id: "dc-route-line",
                  type: "line",
                  source: "dc-route",
                  layout: { "line-join": "round", "line-cap": "round" },
                  paint: { "line-color": "#d12b36", "line-width": 5, "line-opacity": 0.92 },
                });
                const bounds = route.geometry.coordinates.reduce(
                  (bounds, point) => bounds.extend(point as [number, number]),
                  new mapboxgl.LngLatBounds(
                    route.geometry.coordinates[0] as [number, number],
                    route.geometry.coordinates[0] as [number, number],
                  ),
                );
                map.fitBounds(bounds, { padding: 58, maxZoom: 13, duration: 700 });
                onRoute({
                  distanceKm: route.distance / 1000,
                  durationHours: route.duration / 3600,
                });
              })
              .catch((cause: unknown) => {
                if (!disposed) {
                  setMapError(
                    cause instanceof Error ? cause.message : "A route preview is unavailable.",
                  );
                  onRoute(null);
                }
              });
          } else if (pickup) {
            map.flyTo({ center: pickup.coordinates, zoom: 13, duration: 600 });
          }
        });
      })
      .catch(() => {
        if (!disposed) setMapError("The interactive map could not be started.");
      });

    return () => {
      disposed = true;
      pickupMarker?.remove();
      destinationMarker?.remove();
      map?.remove();
    };
  }, [pickup, destination, onRoute, retryCount]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex min-h-[300px] items-center justify-center border border-border bg-[radial-gradient(ellipse_at_center,_#242326_0%,_#131315_70%)] p-8 text-center md:min-h-[360px]">
        <div>
          <p className="eyebrow text-primary">Journey preview</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Select your pickup and destination to preview your journey. The interactive map needs
            VITE_MAPBOX_ACCESS_TOKEN.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[300px] overflow-hidden border border-border bg-charcoal md:min-h-[360px]">
      <div ref={containerRef} className="absolute inset-0" aria-label="Interactive route map" />
      {!pickup ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-background/55 p-8 text-center">
          <p className="max-w-sm text-sm text-foreground/80">
            Select your pickup and destination to preview your journey.
          </p>
        </div>
      ) : null}
      {mapError ? (
        <p
          role="status"
          className="absolute bottom-3 left-3 max-w-[80%] bg-background/90 px-3 py-2 text-xs text-foreground"
        >
          {mapError}{" "}
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="ml-2 underline underline-offset-2"
          >
            Retry
          </button>
        </p>
      ) : null}
    </div>
  );
}
