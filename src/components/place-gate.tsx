import { useEffect, useMemo, useState } from "react";
import { BrandMark, Logo } from "@/components/logo";
import { TideRule } from "@/components/tide-rule";
import { Button } from "@/components/ui/button";
import { SeaBackdrop } from "@/components/sea-photo";
import { COUNTRIES, REGIONS, localeForCountry, type PlaceScope } from "@/lib/tideline/place";
import { SEA } from "@/lib/tideline/sea";
import { usePlaceStore, useT } from "@/lib/tideline/place-store";
import { countryLabel, regionLabel } from "@/lib/i18n";
import { saveMyPlace } from "@/lib/tideline/api";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { LookChips } from "@/components/look-picker";
import { cn } from "@/lib/utils";

export function PlaceGate() {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const current = usePlaceStore((s) => s.place);
  const hydrated = usePlaceStore((s) => s.hydrated);
  const editing = usePlaceStore((s) => s.editing);
  const setupStarted = usePlaceStore((s) => s.setupStarted);
  const setPlace = usePlaceStore((s) => s.setPlace);
  const setLocale = usePlaceStore((s) => s.setLocale);
  const setSetupStarted = usePlaceStore((s) => s.setSetupStarted);
  const { user } = useCurrentUserState();
  const showWelcome = hydrated && !current && !editing && !setupStarted;

  const [country, setCountry] = useState(current?.country ?? "Israel");
  const [scope, setScope] = useState<PlaceScope>(current?.scope ?? "country");
  const [region, setRegion] = useState(
    current?.region ?? COUNTRIES.find((c) => c.name === (current?.country ?? "Israel"))?.region ?? "Middle East",
  );

  useEffect(() => {
    if (!hydrated) return;
    const locked = usePlaceStore.getState().localeLocked;
    if (!current && !locked) {
      usePlaceStore.setState({ locale: localeForCountry(country) });
    }
  }, [country, current, hydrated]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof COUNTRIES>();
    for (const c of COUNTRIES) {
      const list = map.get(c.region) ?? [];
      list.push(c);
      map.set(c.region, list);
    }
    return REGIONS.map((r) => ({ region: r, countries: map.get(r) ?? [] })).filter(
      (g) => g.countries.length,
    );
  }, []);

  async function confirm() {
    const def = COUNTRIES.find((c) => c.name === country);
    const nextRegion = scope === "region" ? region : (def?.region ?? region);
    const nextCountry = scope === "region"
      ? (COUNTRIES.find((c) => c.region === nextRegion)?.name ?? country)
      : country;
    const place = { country: nextCountry, region: nextRegion, scope };
    setPlace(place);
    if (user) {
      try {
        await saveMyPlace({
          data: {
            country: place.country,
            region: place.region,
            scope: place.scope,
            locale: usePlaceStore.getState().locale,
          },
        });
      } catch {
        /* guest path still works */
      }
    }
  }

  const chip = (on: boolean) =>
    cn(
      "h-11 rounded-full px-4 text-sm transition-colors duration-150",
      on
        ? "bg-accent text-accent-fg"
        : "bg-bg/55 text-fg backdrop-blur-sm hover:bg-bg/75",
    );

  if (showWelcome) {
    return (
      <SeaBackdrop src={SEA.swimmers} className="min-h-dvh" priority>
        <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4 py-12 sm:px-6">
          <span className="grid size-16 place-items-center rounded-2xl bg-raised/80 shadow-[var(--shadow-border)] backdrop-blur-sm">
            <BrandMark className="size-12" />
          </span>
          <p className="mt-5 font-display text-sm font-semibold uppercase tracking-[0.38em] text-fg">
            Tideline
          </p>
          <h1 className="mt-10 font-display text-5xl font-semibold tracking-tight text-fg sm:text-7xl">
            {t("welcome.title")}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-fg/90 sm:text-lg">
            {t("welcome.lead")}
          </p>
          <div className="mt-5 max-w-xs">
            <TideRule />
          </div>
          <Button className="mt-12 w-fit" size="lg" onClick={() => setSetupStarted()}>
            {t("welcome.start")}
          </Button>
        </div>
      </SeaBackdrop>
    );
  }

  return (
    <SeaBackdrop src={SEA.swimmers} className="min-h-dvh" priority>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <Logo />
        <p className="mt-10 text-xs font-medium uppercase tracking-widest text-accent">
          {t("place.kicker")}
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
          {t("place.title")}
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-fg/90">
          {t("place.lead")}
        </p>
        <div className="mt-4 max-w-xs">
          <TideRule />
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <span className="self-center text-xs uppercase tracking-widest text-fg/70">
            {t("place.language")}
          </span>
          {(["he", "en"] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              className={chip(locale === code)}
            >
              {t(code === "he" ? "lang.he" : "lang.en")}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <LookChips />
        </div>

        <div className="mt-10">
          <p className="text-xs uppercase tracking-widest text-fg/70">{t("place.countries")}</p>
          <div className="mt-3 space-y-6">
            {grouped.map((g) => (
              <div key={g.region}>
                <p className="mb-2 text-sm text-fg/80">{regionLabel(locale, g.region)}</p>
                <div className="flex flex-wrap gap-2">
                  {g.countries.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => {
                        setCountry(c.name);
                        setRegion(c.region);
                        setScope("country");
                      }}
                      className={chip(scope === "country" && country === c.name)}
                    >
                      {countryLabel(locale, c.name)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <p className="text-xs uppercase tracking-widest text-fg/70">{t("place.regions")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {REGIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setScope("region");
                  setRegion(r);
                  const first = COUNTRIES.find((c) => c.region === r);
                  if (first) setCountry(first.name);
                }}
                className={chip(scope === "region" && region === r)}
              >
                {regionLabel(locale, r)}
              </button>
            ))}
          </div>
        </div>

        <Button className="mt-10" size="lg" onClick={() => void confirm()}>
          {t("place.continue")}
        </Button>
      </div>
    </SeaBackdrop>
  );
}
