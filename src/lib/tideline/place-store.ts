import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import {
  type Place,
  type PlaceFilter,
  filterFromPlace,
  localeForCountry,
} from "./place";
import { applyLook, isLook, type Look } from "./look";

type PlaceState = {
  hydrated: boolean;
  editing: boolean;
  setupStarted: boolean;
  place: Place | null;
  locale: Locale;
  localeLocked: boolean;
  look: Look;
  setHydrated: () => void;
  setEditing: (v: boolean) => void;
  setSetupStarted: () => void;
  setPlace: (place: Place, opts?: { lockLocale?: boolean }) => void;
  setLocale: (locale: Locale) => void;
  setLook: (look: Look) => void;
  applyFromProfile: (row: {
    country: string | null;
    locale: string | null;
    placeScope: string | null;
    region?: string | null;
  }) => void;
};

export const usePlaceStore = create<PlaceState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      editing: false,
      setupStarted: false,
      place: null,
      locale: "he",
      localeLocked: false,
      look: "night",
      setHydrated: () => set({ hydrated: true }),
      setEditing: (editing) => set({ editing }),
      setSetupStarted: () => set({ setupStarted: true }),
      setPlace: (place, opts) => {
        const next: Partial<PlaceState> = { place, editing: false, setupStarted: true };
        if (!get().localeLocked && !opts?.lockLocale) {
          next.locale = localeForCountry(place.country);
        }
        set(next);
      },
      setLocale: (locale) => set({ locale, localeLocked: true }),
      setLook: (look) => {
        applyLook(look);
        set({ look });
      },
      applyFromProfile: (row) => {
        if (!row.country) return;
        const scope: Place["scope"] =
          row.placeScope === "region" ? "region" : "country";
        const region = row.region ?? get().place?.region ?? "Europe";
        const locale: Locale = row.locale === "he" ? "he" : "en";
        set({
          place: { country: row.country, region, scope },
          locale,
          localeLocked: Boolean(row.locale),
        });
      },
    }),
    {
      name: "tideline-place",
      skipHydration: true,
      partialize: (s) => ({
        place: s.place,
        locale: s.locale,
        localeLocked: s.localeLocked,
        look: s.look,
        setupStarted: s.setupStarted,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PlaceState>;
        const look = isLook(saved.look) ? saved.look : current.look;
        return { ...current, ...saved, look };
      },
      onRehydrateStorage: () => (state) => {
        if (state?.look) applyLook(state.look);
        state?.setHydrated();
      },
    },
  ),
);

export function useT() {
  const locale = usePlaceStore((s) => s.locale);
  return (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) =>
    t(locale, key, vars);
}

export function usePlaceFilter(): PlaceFilter {
  const place = usePlaceStore((s) => s.place);
  return filterFromPlace(place);
}
