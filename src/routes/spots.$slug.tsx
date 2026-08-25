import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Page } from "@/components/shell";
import { Atlas } from "@/components/atlas";
import { GatheringCard } from "@/components/gathering-card";
import { ClubCard } from "@/components/club-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  createReport,
  getSpot,
  listReports,
  listSpotClubs,
  listSpotGatherings,
  listSpots,
  toggleRsvp,
} from "@/lib/tideline/api";
import { useLoad, isUnauthorized } from "@/lib/tideline/use-load";
import { useFavorites } from "@/lib/tideline/use-favorites";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  difficultyLabel,
  formatDateTime,
  formatKm,
  formatTemp,
  localizedSpot,
  placeLine,
  waterLabel,
} from "@/lib/tideline/format";
import { usePlaceStore, useT } from "@/lib/tideline/place-store";
import { cn } from "@/lib/utils";
import { regionLabel } from "@/lib/i18n";
import { spotPhoto } from "@/lib/tideline/sea";
import { SeaPhoto } from "@/components/sea-photo";

export const Route = createFileRoute("/spots/$slug")({
  loader: async ({ params }) => {
    const spot = await getSpot({ data: params.slug });
    if (!spot) {
      return {
        spot: null,
        spots: [] as Awaited<ReturnType<typeof listSpots>>,
        gatherings: [] as Awaited<ReturnType<typeof listSpotGatherings>>,
        reports: [] as Awaited<ReturnType<typeof listReports>>,
        clubs: [] as Awaited<ReturnType<typeof listSpotClubs>>,
      };
    }
    const [spots, gatherings, reports, clubs] = await Promise.all([
      listSpots({ data: { country: spot.country } }),
      listSpotGatherings({ data: spot.id }),
      listReports({ data: spot.id }),
      listSpotClubs({ data: spot.id }),
    ]);
    return { spot, spots, gatherings, reports, clubs };
  },
  component: SpotPage,
});

function SpotPage() {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const loaded = Route.useLoaderData();
  const { user, isPending } = useCurrentUserState();
  const gatherings = useLoad(
    () =>
      loaded.spot
        ? listSpotGatherings({ data: loaded.spot.id })
        : Promise.resolve([]),
    [loaded.spot?.id],
  );
  const reports = useLoad(
    () =>
      loaded.spot
        ? listReports({ data: loaded.spot.id })
        : Promise.resolve([]),
    [loaded.spot?.id],
  );
  const clubs = useLoad(
    () =>
      loaded.spot
        ? listSpotClubs({ data: loaded.spot.id })
        : Promise.resolve([]),
    [loaded.spot?.id],
  );
  const fav = useFavorites();
  const isSaved = Boolean(loaded.spot && fav.isSpotSaved(loaded.spot.id));

  if (!loaded.spot) {
    return (
      <Page>
        <h1 className="font-display text-3xl text-fg">{t("spot.notFound")}</h1>
        <Link to="/spots" className="mt-4 inline-block text-accent">
          {t("spot.back")}
        </Link>
      </Page>
    );
  }

  const s = localizedSpot(loaded.spot, locale);
  const photo = spotPhoto(s.slug, s.waterType);

  return (
    <Page>
      <div className="overflow-hidden rounded-xl">
        <div className="relative aspect-[16/7] min-h-48 sm:aspect-[21/8]">
          <SeaPhoto src={photo} alt={s.name} className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/20 to-transparent" />
        </div>
      </div>
      <p className="mt-6 text-xs font-medium uppercase tracking-widest text-accent">
        {regionLabel(locale, s.region)} · {waterLabel(s.waterType, locale)}
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight text-fg">
            {s.name}
          </h1>
          <p className="mt-2 flex items-center gap-1.5 text-muted">
            <MapPin className="size-4" />
            {placeLine(loaded.spot.city, loaded.spot.country, locale)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (loaded.spot) void fav.toggleSpot(loaded.spot.id);
            }}
          >
            <Heart className={cn("size-4", isSaved && "fill-current")} />
            {isSaved ? t("fav.added") : t("fav.add")}
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Badge>{difficultyLabel(s.difficulty, locale)}</Badge>
        {s.typicalKm != null ? (
          <Badge>{t("spot.typical", { km: formatKm(s.typicalKm, locale) })}</Badge>
        ) : null}
        {s.typicalTempC != null ? <Badge>{formatTemp(s.typicalTempC)}</Badge> : null}
        <Badge>{s.bestSeason}</Badge>
      </div>

      <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">
        {s.description}
      </p>
      {s.hazards ? (
        <p className="mt-3 max-w-2xl text-sm text-faint">
          {t("spot.watch", { hazards: s.hazards })}
        </p>
      ) : null}

      {loaded.spots.length ? (
        <div className="mt-8">
          <Atlas spots={loaded.spots} activeSlug={s.slug} />
        </div>
      ) : null}

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section className="space-y-10">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl text-fg">{t("spot.gatherings")}</h2>
              <Link
                to="/events/new"
                search={{ spotId: s.id }}
                className="text-sm text-accent hover:text-fg"
              >
                {t("events.create")}
              </Link>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {(gatherings.data ?? loaded.gatherings).length === 0 &&
              !gatherings.loading ? (
                <p className="text-sm text-muted">{t("spot.noneGather")}</p>
              ) : (
                (gatherings.data ?? loaded.gatherings).map((event) => (
                  <GatheringCard
                    key={event.id}
                    event={event}
                    onToggle={async (id) => {
                      try {
                        await toggleRsvp({ data: id });
                        gatherings.reload();
                      } catch (err) {
                        if (isUnauthorized(err)) window.location.href = "/login";
                      }
                    }}
                  />
                ))
              )}
            </div>
          </div>
          <div>
            <h2 className="font-display text-2xl text-fg">{t("spot.groups")}</h2>
            <div className="mt-4 flex flex-col gap-3">
              {(clubs.data ?? loaded.clubs).map((club) => (
                <ClubCard
                  key={club.id}
                  club={club}
                  saved={fav.isClubSaved(club.id)}
                  onToggleSave={(id) => void fav.toggleClub(id)}
                />
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-display text-2xl text-fg">{t("spot.conditions")}</h2>
            <ConditionForm
              spotId={s.id}
              displayName={user?.displayName ?? undefined}
              signedIn={Boolean(user)}
              onPosted={reports.reload}
            />
            <ul className="mt-4 space-y-3">
              {(reports.data ?? loaded.reports).map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]"
                >
                  <p className="text-sm text-fg">{r.swimmerName}</p>
                  <p className="text-xs text-faint">{formatDateTime(r.createdAt, locale)}</p>
                  <p className="mt-2 text-sm text-muted">{r.notes}</p>
                  <p className="mt-2 text-xs text-faint">
                    {[
                      r.waterTempC != null ? formatTemp(r.waterTempC) : null,
                      r.visibility,
                      r.wildlife,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </Page>
  );
}

function ConditionForm({
  spotId,
  displayName,
  signedIn,
  onPosted,
}: {
  spotId: number;
  displayName?: string;
  signedIn: boolean;
  onPosted: () => void;
}) {
  const t = useT();
  const [notes, setNotes] = useState("");
  const [temp, setTemp] = useState("");
  const [visibility, setVisibility] = useState("");
  const [wildlife, setWildlife] = useState("");
  const [busy, setBusy] = useState(false);

  if (!signedIn) {
    return (
      <p className="mt-3 text-sm text-muted">
        <Link to="/login" className="text-accent hover:underline">
          {t("spot.signInReport")}
        </Link>
      </p>
    );
  }

  return (
    <form
      className="mt-4 space-y-3 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await createReport({
            data: {
              spotId,
              notes,
              waterTempC: temp ? Number(temp) : null,
              visibility: visibility || null,
              wildlife: wildlife || null,
              displayName,
            },
          });
          setNotes("");
          setTemp("");
          setVisibility("");
          setWildlife("");
          toast(t("toast.report"));
          onPosted();
        } catch (err) {
          if (isUnauthorized(err)) window.location.href = "/login";
          else toast.error(t("toast.reportFail"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block space-y-1.5">
        <Label>{t("spot.reportLabel")}</Label>
        <Textarea
          required
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("spot.reportPh")}
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <Input
          type="number"
          step="0.5"
          placeholder="°C"
          value={temp}
          onChange={(e) => setTemp(e.target.value)}
        />
        <Select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
        >
          <option value="">{t("spot.visibility")}</option>
          <option value="clear">{t("spot.clear")}</option>
          <option value="green">{t("spot.green")}</option>
          <option value="murky">{t("spot.murky")}</option>
        </Select>
        <Input
          placeholder={t("spot.wildlife")}
          value={wildlife}
          onChange={(e) => setWildlife(e.target.value)}
        />
      </div>
      <Button type="submit" size="sm" disabled={busy || !notes.trim()}>
        {busy ? t("spot.filing") : t("spot.file")}
      </Button>
    </form>
  );
}
