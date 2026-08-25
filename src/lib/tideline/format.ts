import { format, parseISO } from "date-fns";
import { enUS, he as heLocale } from "date-fns/locale";
import type { Locale } from "@/lib/i18n";
import { countryLabel, t } from "@/lib/i18n";
import { localizeCity, localizeSpotField } from "@/lib/i18n/spot-copy";
import type { Spot } from "./types";

export function formatKm(km: number, locale: Locale = "en"): string {
  const n = km >= 10 ? km.toFixed(0) : String(Math.round(km * 10) / 10);
  return t(locale, "common.km", { n });
}

export function formatTemp(c: number): string {
  return `${Math.round(c)}°C`;
}

export function formatDate(iso: string, locale: Locale = "en"): string {
  try {
    const d = iso.length <= 10 ? parseISO(`${iso}T12:00:00`) : parseISO(iso);
    return format(d, "d MMM yyyy", { locale: locale === "he" ? heLocale : enUS });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string, locale: Locale = "en"): string {
  try {
    return format(parseISO(iso), "d MMM · HH:mm", {
      locale: locale === "he" ? heLocale : enUS,
    });
  } catch {
    return iso;
  }
}

export function formatDuration(min: number, locale: Locale = "en"): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return t(locale, "dur.min", { n: m });
  if (m === 0) return t(locale, "dur.hours", { n: h });
  return t(locale, "dur.hoursMin", { h, m });
}

export function difficultyLabel(value: string, locale: Locale = "en"): string {
  const key = `grade.${value}` as const;
  if (key === "grade.gentle" || key === "grade.moderate" || key === "grade.challenging" || key === "grade.extreme") {
    return t(locale, key);
  }
  return value;
}

export function waterLabel(value: string, locale: Locale = "en"): string {
  const key = `water.${value}` as const;
  if (key === "water.sea" || key === "water.ocean" || key === "water.lake" || key === "water.river") {
    return t(locale, key);
  }
  return value;
}

export function dispatchKindLabel(kind: string, locale: Locale): string {
  if (kind === "conditions") return t(locale, "kind.conditions");
  if (kind === "crossing") return t(locale, "kind.crossing");
  if (kind === "gathering") return t(locale, "kind.gathering");
  if (kind === "notice") return t(locale, "kind.notice");
  return kind;
}

export function conditionLabel(value: string, locale: Locale): string {
  if (value === "glass" || value === "chop" || value === "swell" || value === "wind") {
    return t(locale, `cond.${value}`);
  }
  return value;
}

export function feelingLabel(value: string, locale: Locale): string {
  if (value === "euphoric" || value === "solid" || value === "worked" || value === "epic") {
    return t(locale, `feel.${value}`);
  }
  return value;
}

export function sourceLabel(source: string | undefined, locale: Locale): string {
  if (source === "garmin") return t(locale, "source.garmin");
  if (source === "suunto") return t(locale, "source.suunto");
  if (source === "samsung") return t(locale, "source.samsung");
  if (source === "apple") return t(locale, "source.apple");
  if (source === "strava") return t(locale, "source.strava");
  return t(locale, "source.manual");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "S";
}

export function placeLine(city: string, country: string, locale: Locale): string {
  return `${localizeCity(locale, city)}, ${countryLabel(locale, country)}`;
}

export function localizedSpot(spot: Spot, locale: Locale): Spot {
  return {
    ...spot,
    name: localizeSpotField(locale, spot.slug, "name", spot.name),
    city: localizeSpotField(locale, spot.slug, "city", localizeCity(locale, spot.city)),
    description: localizeSpotField(locale, spot.slug, "description", spot.description),
    hazards: localizeSpotField(locale, spot.slug, "hazards", spot.hazards),
    bestSeason: localizeSpotField(locale, spot.slug, "bestSeason", spot.bestSeason),
  };
}
