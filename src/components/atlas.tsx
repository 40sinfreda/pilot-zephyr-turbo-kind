import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Spot } from "@/lib/tideline/types";
import { difficultyLabel, localizedSpot, placeLine } from "@/lib/tideline/format";
import { usePlaceStore, useT } from "@/lib/tideline/place-store";
import { regionLabel } from "@/lib/i18n";

const TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export function Atlas({
  spots,
  activeSlug,
}: {
  spots: Spot[];
  activeSlug?: string;
}) {
  const navigate = useNavigate();
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomSnap: 0.25,
    });
    el.tabIndex = -1;
    L.tileLayer(TILES, {
      attribution: "Esri",
      maxZoom: 18,
    }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;

    const ro = new ResizeObserver(() => {
      const x = window.scrollX;
      const y = window.scrollY;
      map.invalidateSize({ animate: false, pan: false });
      window.scrollTo(x, y);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const markers: L.CircleMarker[] = [];

    for (const raw of spots) {
      const spot = localizedSpot(raw, locale);
      const marker = L.circleMarker([spot.lat, spot.lng], {
        radius: spot.slug === activeSlug ? 10 : 7,
        color: "var(--color-fg)",
        weight: 2,
        fillColor: "var(--color-accent)",
        fillOpacity: 1,
        opacity: 1,
      });
      marker.on("mouseover", () => {
        setHover(spot.slug);
        marker.setRadius(10);
        marker.bringToFront();
      });
      marker.on("mouseout", () => {
        setHover((current) => (current === spot.slug ? null : current));
        marker.setRadius(7);
      });
      marker.on("click", () => {
        void navigate({ to: "/spots/$slug", params: { slug: spot.slug } });
      });
      marker.addTo(layer);
      markers.push(marker);
    }

    const x = window.scrollX;
    const y = window.scrollY;
    map.invalidateSize({ animate: false, pan: false });
    if (markers.length === 0) {
      map.setView([31.5, 34.85], 7, { animate: false });
    } else if (markers.length === 1) {
      map.setView(markers[0].getLatLng(), 13, { animate: false });
    } else {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds(), { padding: [36, 36], maxZoom: 12, animate: false });
    }
    window.scrollTo(x, y);
  }, [spots, locale, navigate, activeSlug]);

  const focused = spots
    .map((spot) => localizedSpot(spot, locale))
    .find((spot) => spot.slug === (hover ?? activeSlug));

  return (
    <div className="relative z-0 isolate overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
      <div className="relative aspect-[2/1] w-full overflow-hidden">
        <div
          ref={hostRef}
          className="atlas-map absolute inset-0"
          role="img"
          aria-label={t("atlas.label")}
        />
        {focused ? (
          <div className="pointer-events-none absolute bottom-3 start-3 end-3 z-20 sm:start-auto sm:end-3 sm:w-72">
            <div className="rounded-lg bg-bg/90 p-3 shadow-[var(--shadow-border)] backdrop-blur-sm">
              <p className="text-xs uppercase tracking-widest text-accent">
                {regionLabel(locale, focused.region)} ·{" "}
                {difficultyLabel(focused.difficulty, locale)}
              </p>
              <p className="font-display text-lg text-fg">{focused.name}</p>
              <p className="text-xs text-muted">
                {placeLine(focused.city, focused.country, locale)}
              </p>
            </div>
          </div>
        ) : (
          <p className="pointer-events-none absolute bottom-3 start-3 z-20 text-xs uppercase tracking-widest text-fg/80">
            {t("atlas.hint", { n: spots.length })}
          </p>
        )}
      </div>
    </div>
  );
}
