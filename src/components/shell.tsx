import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { BrandMark, Logo } from "@/components/logo";
import { AuthSlot } from "@/components/auth-slot";
import { SettingsMenu } from "@/components/settings-panel";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/tideline/place-store";

export function Header() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const t = useT();

  const nav = [
    { to: "/", label: t("nav.tide") },
    { to: "/spots", label: t("nav.spots") },
    { to: "/groups", label: t("nav.groups") },
    { to: "/favorites", label: t("nav.favorites") },
    { to: "/events", label: t("nav.gatherings") },
  ] as const;

  return (
    <header className="fixed inset-x-0 top-0 z-[5000] border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => {
            const active =
              item.to === "/"
                ? pathname === "/"
                : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-md px-3 py-2 text-sm transition-colors duration-150",
                  active ? "text-fg" : "text-muted hover:text-fg",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <SettingsMenu />
          <div className="hidden md:block">
            <AuthSlot />
          </div>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-md text-fg lg:hidden"
            aria-label={open ? t("nav.close") : t("nav.menu")}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-line bg-bg px-4 py-4 lg:hidden">
          <nav className="flex flex-col gap-1">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 text-base text-fg hover:bg-raised"
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/profile"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-base text-fg hover:bg-raised"
            >
              {t("nav.profile")}
            </Link>
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-md px-3 py-3 text-base hover:bg-raised",
                pathname.startsWith("/settings") ? "text-accent" : "text-fg",
              )}
            >
              {t("nav.settings")}
            </Link>
          </nav>
          <div className="mt-3 border-t border-line pt-3">
            <AuthSlot />
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function Footer() {
  const t = useT();
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-raised shadow-[var(--shadow-border)]">
            <BrandMark className="size-8" />
          </span>
          <div>
            <p className="font-display text-lg font-semibold text-fg">Tideline</p>
            <p className="mt-0.5 max-w-sm text-sm text-muted">{t("footer.tag")}</p>
          </div>
        </div>
        <p className="text-xs text-faint">{t("footer.line")}</p>
      </div>
    </footer>
  );
}

export function Page({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12", className)}>
      {children}
    </main>
  );
}
