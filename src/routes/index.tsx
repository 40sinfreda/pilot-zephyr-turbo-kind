import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Page } from "@/components/shell";
import { TideRule } from "@/components/tide-rule";
import { Atlas } from "@/components/atlas";
import { SpotCard } from "@/components/spot-card";
import { FeedList } from "@/components/feed";
import { GatheringCard } from "@/components/gathering-card";
import { ClubCard } from "@/components/club-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SeaBackdrop } from "@/components/sea-photo";
import {
  getHomeStats,
  listClubs,
  listFeed,
  listGatherings,
  listSpots,
} from "@/lib/tideline/api";
import { usePlaceFilter, useT } from "@/lib/tideline/place-store";
import { useFavorites } from "@/lib/tideline/use-favorites";
import { useLoad } from "@/lib/tideline/use-load";
import { SEA } from "@/lib/tideline/sea";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const t = useT();
  const filter = usePlaceFilter();
  const key = `${filter.country ?? ""}:${filter.region ?? ""}`;
  const spots = useLoad(() => listSpots({ data: filter }), [key]);
  const feed = useLoad(() => listFeed({ data: filter }), [key]);
  const gatherings = useLoad(() => listGatherings({ data: filter }), [key]);
  const clubs = useLoad(() => listClubs({ data: filter }), [key]);
  const stats = useLoad(() => getHomeStats({ data: filter }), [key]);
  const fav = useFavorites();

  const featured = (spots.data ?? []).slice(0, 4);
  const upcoming = (gatherings.data ?? []).slice(0, 3);
  const clubPreview = (clubs.data ?? []).slice(0, 3);

  return (
    <div>
      <SeaBackdrop src={SEA.hero} className="min-h-[32rem] border-b border-line sm:min-h-[36rem]" priority>
        <div className="mx-auto flex min-h-[32rem] max-w-6xl flex-col justify-end px-4 pb-12 pt-10 sm:min-h-[36rem] sm:px-6 sm:pb-16 sm:pt-16">
          <p className="rise-in text-xs font-medium tracking-wide text-accent">
            {t("home.kicker")}
          </p>
          <h1 className="rise-in mt-4 max-w-3xl font-display text-2xl font-semibold leading-snug tracking-tight text-fg sm:text-4xl">
            {t("home.title")}
          </h1>
          <div className="rise-in mt-4 max-w-xs">
            <TideRule />
          </div>
          <div className="rise-in mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/spots">
                {t("home.explore")}
                <ArrowRight className="size-4 rtl:rotate-180" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="bg-bg/40 backdrop-blur-sm">
              <Link to="/groups">{t("home.groupsTitle")}</Link>
            </Button>
          </div>
          <dl className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t("home.statSpots")} value={String(stats.data?.spots ?? 0)} />
            <Stat
              label={t("home.statGatherings")}
              value={String(stats.data?.gatherings ?? 0)}
            />
            <Stat label={t("home.statGroups")} value={String(stats.data?.groups ?? 0)} />
            <Stat label={t("home.statStories")} value={String(stats.data?.stories ?? 0)} />
          </dl>
        </div>
      </SeaBackdrop>

      <Page>
        <div className="space-y-14">
          <section>
            <SectionHead
              kicker={t("home.atlasKicker")}
              title={t("home.atlasTitle")}
              to="/spots"
              action={t("home.allSpots")}
            />
            <div className="mt-6">
              {spots.loading && !spots.data ? (
                <Skeleton className="aspect-[2/1] w-full rounded-xl" />
              ) : (
                <Atlas spots={spots.data ?? []} />
              )}
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {featured.map((spot) => (
                <SpotCard
                  key={spot.id}
                  spot={spot}
                  featured
                  saved={fav.isSpotSaved(spot.id)}
                  onToggleSave={(id) => void fav.toggleSpot(id)}
                />
              ))}
            </div>
          </section>

          <section className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <SectionHead kicker={t("home.tideKicker")} title={t("home.tideTitle")} />
              <div className="mt-6">
                {feed.loading && !feed.data ? (
                  <Skeleton className="h-40 rounded-xl" />
                ) : (
                  <FeedList items={feed.data ?? []} />
                )}
              </div>
            </div>
            <div className="space-y-10">
              <div>
                <SectionHead
                  kicker={t("home.gatherKicker")}
                  title={t("home.gatherTitle")}
                  to="/events"
                  action={t("home.allGatherings")}
                />
                <div className="mt-6 flex flex-col gap-3">
                  {upcoming.map((event) => (
                    <GatheringCard key={event.id} event={event} />
                  ))}
                </div>
              </div>
              <div>
                <SectionHead
                  kicker={t("home.groupsKicker")}
                  title={t("home.groupsTitle")}
                  to="/groups"
                  action={t("home.allGroups")}
                />
                <div className="mt-6 flex flex-col gap-3">
                  {clubPreview.map((club) => (
                    <ClubCard
                      key={club.id}
                      club={club}
                      saved={fav.isClubSaved(club.id)}
                      onToggleSave={(id) => void fav.toggleClub(id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </Page>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg/55 px-4 py-3 backdrop-blur-sm">
      <dt className="text-xs uppercase tracking-widest text-fg/70">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold text-fg tabular-nums">{value}</dd>
    </div>
  );
}

function SectionHead({
  kicker,
  title,
  to,
  action,
}: {
  kicker: string;
  title: string;
  to?: "/spots" | "/events" | "/groups";
  action?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-accent">
          {kicker}
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
          {title}
        </h2>
      </div>
      {to && action ? (
        <Link to={to} className="hidden text-sm text-muted hover:text-fg sm:inline">
          {action}
        </Link>
      ) : null}
    </div>
  );
}
