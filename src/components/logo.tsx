import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/tideline/place-store";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <circle cx="16" cy="16" r="14.2" className="stroke-accent/35" strokeWidth="1.1" />
      <path d="M10.2 9.2h11.6" className="stroke-fg" strokeWidth="2.15" strokeLinecap="round" />
      <path d="M16 9.2v9.3" className="stroke-fg" strokeWidth="2.15" strokeLinecap="round" />
      <path
        d="M6 21.7c3.4-4.6 6.6 3.2 10 0s6.6 4.6 10 0"
        className="stroke-accent"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <path
        d="M6 25.5c3.4-3.3 6.6 2.4 10 0s6.6 3.3 10 0"
        className="stroke-accent/45"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  const t = useT();
  return (
    <Link
      to="/"
      className={cn("group flex items-center gap-2.5 text-fg", className)}
      aria-label={t("brand.home")}
    >
      <span className="grid size-10 place-items-center rounded-xl bg-raised shadow-[var(--shadow-border)] transition-transform duration-150 group-hover:scale-[1.04]">
        <BrandMark className="size-8" />
      </span>
      <span className="font-display text-xl font-semibold tracking-tight">
        Tideline
      </span>
    </Link>
  );
}
