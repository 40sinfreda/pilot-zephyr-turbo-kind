import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Waves } from "lucide-react";
import type { FeedItem } from "@/lib/tideline/types";
import {
  dispatchKindLabel,
  formatDate,
  formatDateTime,
  formatDuration,
  formatKm,
  formatTemp,
  initials,
  placeLine,
  conditionLabel,
  feelingLabel,
  sourceLabel,
} from "@/lib/tideline/format";
import { Card } from "@/components/ui/card";
import { usePlaceStore, useT } from "@/lib/tideline/place-store";
import {
  localizeDispatchField,
  localizeSpotField,
} from "@/lib/i18n/spot-copy";

export function FeedList({ items }: { items: FeedItem[] }) {
  const t = useT();
  if (items.length === 0) {
    return (
      <Card className="py-12 text-center">
        <Waves className="mx-auto size-6 text-accent" />
        <p className="mt-3 font-display text-lg text-fg">{t("feed.quiet")}</p>
        <p className="mt-1 text-sm text-muted">{t("feed.quietLead")}</p>
        <Link
          to="/groups"
          className="mt-4 inline-flex h-11 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          {t("nav.groups")}
        </Link>
      </Card>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {items.map((item) =>
        item.kind === "swim" ? (
          <li key={`swim-${item.swim.id}`}>
            <SwimCard item={item} />
          </li>
        ) : (
          <li key={`dispatch-${item.dispatch.id}`}>
            <DispatchCard item={item} />
          </li>
        ),
      )}
    </ol>
  );
}

function SwimCard({ item }: { item: Extract<FeedItem, { kind: "swim" }> }) {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const swim = item.swim;
  const spotName = localizeSpotField(locale, swim.spotSlug, "name", swim.spotName);
  return (
    <article className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raised text-xs font-medium text-accent">
          {initials(swim.swimmerName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-fg">
            <span className="font-medium">{swim.swimmerName}</span>
            <span className="text-muted"> {t("feed.swam")} </span>
            <Link
              to="/spots/$slug"
              params={{ slug: swim.spotSlug }}
              className="font-medium text-accent hover:underline"
            >
              {spotName}
            </Link>
          </p>
          <p className="mt-0.5 text-xs text-faint">
            {placeLine(swim.city, swim.country, locale)} · {formatDate(swim.swamOn, locale)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Meta>{formatKm(swim.distanceKm, locale)}</Meta>
            {swim.durationMin != null ? (
              <Meta>{formatDuration(swim.durationMin, locale)}</Meta>
            ) : null}
            {swim.waterTempC != null ? <Meta>{formatTemp(swim.waterTempC)}</Meta> : null}
            {swim.conditions ? <Meta>{conditionLabel(swim.conditions, locale)}</Meta> : null}
            {swim.feeling ? <Meta>{feelingLabel(swim.feeling, locale)}</Meta> : null}
            {swim.source && swim.source !== "manual" ? (
              <Meta>{sourceLabel(swim.source, locale)}</Meta>
            ) : null}
          </div>
          {swim.notes ? (
            <p className="mt-3 text-sm leading-relaxed text-muted">{swim.notes}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function DispatchCard({
  item,
}: {
  item: Extract<FeedItem, { kind: "dispatch" }>;
}) {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const d = item.dispatch;
  const spotName = d.spotSlug
    ? localizeSpotField(locale, d.spotSlug, "name", d.spotName ?? "")
    : d.spotName;
  const title = localizeDispatchField(locale, d.title, "title", d.title);
  const body = localizeDispatchField(locale, d.title, "body", d.body);
  const location =
    localizeDispatchField(locale, d.title, "location", d.locationLabel ?? "") ||
    spotName;
  return (
    <article className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
      <p className="text-xs font-medium uppercase tracking-widest text-accent">
        {t("feed.dispatch")} · {dispatchKindLabel(d.kind, locale)}
      </p>
      <h3 className="mt-1 font-display text-lg font-medium text-fg">{title}</h3>
      <p className="mt-1 text-xs text-faint">
        {location} · {formatDateTime(d.publishedAt, locale)}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
      {d.spotSlug ? (
        <Link
          to="/spots/$slug"
          params={{ slug: d.spotSlug }}
          className="mt-3 inline-block text-sm text-accent hover:underline"
        >
          {t("feed.open", { name: spotName ?? "" })}
        </Link>
      ) : null}
    </article>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-raised px-2.5 py-1 text-xs text-muted">
      {children}
    </span>
  );
}
