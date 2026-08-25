import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { Settings, X } from "lucide-react";
import { LookChips } from "@/components/look-picker";
import { Button } from "@/components/ui/button";
import { getOfficeAccess } from "@/lib/tideline/office";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { countryLabel, regionLabel } from "@/lib/i18n";
import { usePlaceStore, useT } from "@/lib/tideline/place-store";
import { isUnauthorized, useLoad } from "@/lib/tideline/use-load";
import { cn } from "@/lib/utils";

export function SettingsBody({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const place = usePlaceStore((s) => s.place);
  const setEditing = usePlaceStore((s) => s.setEditing);
  const setLocale = usePlaceStore((s) => s.setLocale);
  const { user } = useCurrentUserState();
  const office = useLoad(async () => {
    if (!user) return null;
    try {
      return await getOfficeAccess();
    } catch (err) {
      if (isUnauthorized(err)) return null;
      return null;
    }
  }, [user?.id]);
  const showOffice = office.data?.status === "owner" || office.data?.status === "open";

  const placeLabel = place
    ? place.scope === "region"
      ? regionLabel(locale, place.region)
      : countryLabel(locale, place.country)
    : t("place.change");

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-faint">{t("settings.place")}</p>
        <p className="text-sm text-fg">{placeLabel}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            onNavigate?.();
            setEditing(true);
          }}
        >
          {t("place.change")}
        </Button>
      </section>

      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-faint">{t("lang.label")}</p>
        <div className="flex flex-wrap gap-2">
          {(["he", "en"] as const).map((code) => (
            <Chip key={code} on={locale === code} onClick={() => setLocale(code)}>
              {t(code === "he" ? "lang.he" : "lang.en")}
            </Chip>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <LookChips />
      </section>

      {showOffice ? (
        <section className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-faint">{t("nav.office")}</p>
          {!compact ? <p className="text-sm text-muted">{t("settings.officeLead")}</p> : null}
          <Button asChild size="sm">
            <Link to="/office" onClick={onNavigate}>
              {t("settings.openOffice")}
            </Link>
          </Button>
        </section>
      ) : null}
    </div>
  );
}

export function SettingsMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative z-[1] inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm transition-colors",
          open ? "bg-raised text-fg" : "text-muted hover:bg-raised hover:text-fg",
        )}
      >
        <Settings className="size-4" />
        <span className="hidden lg:inline">{t("nav.settings")}</span>
      </button>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-[6000] flex items-start justify-center p-3 pt-20 sm:justify-end sm:p-6 sm:pt-20">
              <button
                type="button"
                className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
                aria-label={t("nav.close")}
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={t("nav.settings")}
                className="relative z-10 max-h-[min(42rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="font-display text-lg font-semibold text-fg">{t("nav.settings")}</p>
                  <button
                    type="button"
                    className="grid size-11 place-items-center rounded-md text-muted hover:bg-raised hover:text-fg"
                    aria-label={t("nav.close")}
                    onClick={() => setOpen(false)}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <SettingsBody compact onNavigate={() => setOpen(false)} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function Chip({
  on,
  children,
  onClick,
}: {
  on: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-11 rounded-full px-4 text-sm transition-colors duration-150",
        on ? "bg-accent text-accent-fg" : "bg-raised text-fg hover:bg-surface",
      )}
    >
      {children}
    </button>
  );
}
