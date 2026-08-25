import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Page } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { COUNTRIES } from "@/lib/tideline/place";
import { MapsPinField } from "@/components/maps-pin-field";
import { mapsLinkFromPin, type MapsPin } from "@/lib/tideline/maps-pin";
import { DIFFICULTIES, WATER_TYPES } from "@/lib/tideline/types";
import { countryLabel } from "@/lib/i18n";
import { localizeSpotField } from "@/lib/i18n/spot-copy";
import { formatDate, formatDateTime, formatKm, waterLabel, difficultyLabel } from "@/lib/tideline/format";
import { isUnauthorized, useLoad } from "@/lib/tideline/use-load";
import { usePlaceStore, useT } from "@/lib/tideline/place-store";
import { cn } from "@/lib/utils";
import {
  claimOffice,
  getOfficeAccess,
  officeCreateClub,
  officeCreateGathering,
  officeCreateSpot,
  officeCreateStory,
  officeDeleteClub,
  officeDeleteGathering,
  officeDeletePerson,
  officeDeleteReport,
  officeDeleteSpot,
  officeDeleteStory,
  officeDeleteSwim,
  officeListClubMembers,
  officeListClubs,
  officeListGatherings,
  officeListPeople,
  officeListReports,
  officeListSpots,
  officeListStories,
  officeListSwims,
  officeRemoveClubMember,
  officeStats,
  officeUpdateClub,
  officeUpdateGathering,
  officeUpdatePerson,
  officeUpdateSpot,
  officeUpdateStory,
  officeUpdateSwim,
  type OfficeAccess,
  type OfficeClub,
  type OfficePerson,
} from "@/lib/tideline/office";
import { getStravaAppSettings, saveStravaApp, STRAVA_CLIENT_ID } from "@/lib/tideline/strava";
import type { Gathering, Spot, Swim } from "@/lib/tideline/types";

export const Route = createFileRoute("/office")({
  component: OfficePage,
});

type Tab =
  | "home"
  | "spots"
  | "groups"
  | "gatherings"
  | "stories"
  | "reports"
  | "people"
  | "apps";

const TABS: { key: Tab; label: "office.tab.home" | "office.tab.spots" | "office.tab.groups" | "office.tab.gatherings" | "office.tab.stories" | "office.tab.reports" | "office.tab.people" | "office.tab.apps" }[] = [
  { key: "home", label: "office.tab.home" },
  { key: "spots", label: "office.tab.spots" },
  { key: "groups", label: "office.tab.groups" },
  { key: "gatherings", label: "office.tab.gatherings" },
  { key: "stories", label: "office.tab.stories" },
  { key: "reports", label: "office.tab.reports" },
  { key: "people", label: "office.tab.people" },
  { key: "apps", label: "office.tab.apps" },
];

function OfficePage() {
  const t = useT();
  const { user, isPending } = useCurrentUserState();
  const access = useLoad(async () => {
    if (isPending || !user) return null;
    return getOfficeAccess();
  }, [user?.id, isPending]);
  const [tab, setTab] = useState<Tab>("home");
  const [busy, setBusy] = useState(false);

  if (isPending || access.loading) {
    return (
      <Page>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="mt-6 h-64 w-full rounded-xl" />
      </Page>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (isUnauthorized(access.error) || access.error === "Unauthorized") {
    return <RedirectToSignIn />;
  }

  const status: OfficeAccess["status"] | undefined = access.data?.status;

  async function take() {
    setBusy(true);
    try {
      const next = await claimOffice();
      access.setData(next);
      if (next.status !== "owner") toast.error(t("office.locked"));
    } catch (err) {
      if (isUnauthorized(err)) window.location.href = "/login";
      else toast.error(t("office.fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page className="max-w-6xl">
      <p className="text-xs font-medium tracking-wide text-accent">{t("office.kicker")}</p>
      <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-fg">
        {t("office.title")}
      </h1>
      <p className="mt-2 max-w-xl text-muted">{t("office.lead")}</p>

      {status === "locked" ? (
        <div className="mt-10 rounded-xl bg-surface p-6 shadow-[var(--shadow-border)]">
          <p className="text-fg">{t("office.locked")}</p>
        </div>
      ) : status === "open" ? (
        <div className="mt-10 max-w-lg rounded-xl bg-surface p-6 shadow-[var(--shadow-border)]">
          <p className="text-sm leading-relaxed text-muted">{t("office.takeLead")}</p>
          <Button className="mt-5" onClick={() => void take()} disabled={busy}>
            {busy ? t("office.saving") : t("office.take")}
          </Button>
        </div>
      ) : status === "owner" ? (
        <>
          <p className="mt-3 text-sm text-accent">{t("office.owned")}</p>
          <div className="mt-6 -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  "h-11 shrink-0 rounded-md px-3 text-sm",
                  tab === item.key ? "bg-raised text-fg" : "text-muted hover:text-fg",
                )}
              >
                {t(item.label)}
              </button>
            ))}
          </div>
          {tab === "home" ? <Overview /> : null}
          {tab === "spots" ? <SpotsPanel /> : null}
          {tab === "groups" ? <GroupsPanel /> : null}
          {tab === "gatherings" ? <GatheringsPanel /> : null}
          {tab === "stories" ? <StoriesPanel /> : null}
          {tab === "reports" ? <ReportsPanel /> : null}
          {tab === "people" ? <PeoplePanel /> : null}
          {tab === "apps" ? <StravaPanel /> : null}
        </>
      ) : (
        <p className="mt-8 text-muted">{t("office.forbidden")}</p>
      )}
    </Page>
  );
}

function Overview() {
  const t = useT();
  const stats = useLoad(() => officeStats(), []);
  if (stats.loading) return <Skeleton className="mt-8 h-40 rounded-xl" />;
  const s = stats.data;
  if (!s) return null;
  const cards: { label: (typeof TABS)[number]["label"]; value: number }[] = [
    { label: "office.tab.spots", value: s.spots },
    { label: "office.tab.groups", value: s.groups },
    { label: "office.tab.gatherings", value: s.gatherings },
    { label: "office.tab.stories", value: s.stories },
    { label: "office.tab.reports", value: s.reports },
    { label: "office.tab.people", value: s.people },
  ];
  return (
    <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
          <dt className="text-xs text-muted">{t(c.label)}</dt>
          <dd className="mt-1 font-display text-2xl text-fg">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function useSpotsCatalog() {
  return useLoad(() => officeListSpots(), []);
}

function SpotsPanel() {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const list = useSpotsCatalog();
  const [selected, setSelected] = useState<number | "new" | null>(null);
  const current = useMemo(
    () => (typeof selected === "number" ? list.data?.find((s) => s.id === selected) : null),
    [list.data, selected],
  );

  return (
    <Split
      list={
        <RowList
          loading={list.loading}
          empty={t("office.empty")}
          onNew={() => setSelected("new")}
          newLabel={t("office.new")}
          items={(list.data ?? []).map((s) => ({
            id: s.id,
            title: localizeSpotField(locale, s.slug, "name", s.name),
            meta: `${s.city} · ${countryLabel(locale, s.country)}`,
            active: selected === s.id,
            onClick: () => setSelected(s.id),
          }))}
        />
      }
      form={
        selected === null ? (
          <Hint />
        ) : (
          <SpotForm
            key={selected === "new" ? "new" : selected}
            spot={current ?? null}
            onDone={() => {
              void list.reload();
            }}
            onDeleted={() => {
              setSelected(null);
              void list.reload();
            }}
          />
        )
      }
    />
  );
}

function SpotForm({
  spot,
  onDone,
  onDeleted,
}: {
  spot: Spot | null;
  onDone: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const [name, setName] = useState(spot?.name ?? "");
  const [city, setCity] = useState(spot?.city ?? "");
  const [country, setCountry] = useState(spot?.country ?? "Israel");
  const [waterType, setWaterType] = useState(spot?.waterType ?? "sea");
  const [difficulty, setDifficulty] = useState(spot?.difficulty ?? "gentle");
  const [typicalKm, setTypicalKm] = useState(spot?.typicalKm != null ? String(spot.typicalKm) : "");
  const [typicalTempC, setTypicalTempC] = useState(
    spot?.typicalTempC != null ? String(spot.typicalTempC) : "",
  );
  const [bestSeason, setBestSeason] = useState(spot?.bestSeason ?? "");
  const [hazards, setHazards] = useState(spot?.hazards ?? "");
  const [description, setDescription] = useState(spot?.description ?? "");
  const [mapsLink, setMapsLink] = useState(
    spot ? mapsLinkFromPin({ lat: spot.lat, lng: spot.lng }) : "",
  );
  const [pin, setPin] = useState<MapsPin | null>(
    spot ? { lat: spot.lat, lng: spot.lng } : null,
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pin) {
      toast.error(t("spotNew.mapsBad"));
      return;
    }
    const payload = {
      name,
      city,
      country,
      waterType: waterType as "sea" | "ocean" | "lake" | "river",
      difficulty: difficulty as "gentle" | "moderate" | "challenging" | "extreme",
      typicalKm: typicalKm ? Number(typicalKm) : null,
      typicalTempC: typicalTempC ? Number(typicalTempC) : null,
      bestSeason,
      hazards,
      description,
      lat: pin.lat,
      lng: pin.lng,
    };
    setBusy(true);
    try {
      if (spot) await officeUpdateSpot({ data: { id: spot.id, ...payload } });
      else await officeCreateSpot({ data: payload });
      toast.success(t("office.saved"));
      onDone();
    } catch (err) {
      handleErr(err, t("spotNew.poolErr"), t("office.fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
      <Field label={t("spotNew.name")}>
        <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("spotNew.city")}>
          <Input required value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label={t("spotNew.country")}>
          <Select value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.name} value={c.name}>
                {countryLabel(locale, c.name)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("spotNew.water")}>
          <Select value={waterType} onChange={(e) => setWaterType(e.target.value)}>
            {WATER_TYPES.map((w) => (
              <option key={w} value={w}>
                {waterLabel(w, locale)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("spotNew.grade")}>
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {difficultyLabel(d, locale)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("spotNew.km")}>
          <Input type="number" min={0.1} step={0.1} value={typicalKm} onChange={(e) => setTypicalKm(e.target.value)} />
        </Field>
        <Field label={t("spotNew.temp")}>
          <Input type="number" step={0.5} value={typicalTempC} onChange={(e) => setTypicalTempC(e.target.value)} />
        </Field>
      </div>
      <Field label={t("spotNew.season")}>
        <Input value={bestSeason} onChange={(e) => setBestSeason(e.target.value)} />
      </Field>
      <Field label={t("spotNew.hazards")}>
        <Input value={hazards} onChange={(e) => setHazards(e.target.value)} />
      </Field>
      <Field label={t("spotNew.desc")}>
        <Textarea required minLength={8} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <MapsPinField link={mapsLink} onLink={setMapsLink} pin={pin} onPin={setPin} />
      <FormActions
        busy={busy}
        canDelete={Boolean(spot)}
        onDelete={async () => {
          if (!spot) return;
          await officeDeleteSpot({ data: spot.id });
          toast.success(t("office.deleted"));
          onDeleted();
        }}
      />
    </form>
  );
}

function GroupsPanel() {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const list = useLoad(() => officeListClubs(), []);
  const spots = useSpotsCatalog();
  const [selected, setSelected] = useState<number | "new" | null>(null);
  const current = useMemo(
    () => (typeof selected === "number" ? list.data?.find((c) => c.id === selected) : null),
    [list.data, selected],
  );

  return (
    <Split
      list={
        <RowList
          loading={list.loading}
          empty={t("office.empty")}
          onNew={() => setSelected("new")}
          newLabel={t("office.new")}
          items={(list.data ?? []).map((c) => ({
            id: c.id,
            title: c.name,
            meta: `${c.spotName ?? t("group.spotNone")} · ${countryLabel(locale, c.country)}`,
            active: selected === c.id,
            onClick: () => setSelected(c.id),
          }))}
        />
      }
      form={
        selected === null ? (
          <Hint />
        ) : (
          <GroupForm
            key={selected === "new" ? "new" : selected}
            club={current ?? null}
            spots={spots.data ?? []}
            onDone={() => void list.reload()}
            onDeleted={() => {
              setSelected(null);
              void list.reload();
            }}
          />
        )
      }
    />
  );
}

function GroupForm({
  club,
  spots,
  onDone,
  onDeleted,
}: {
  club: OfficeClub | null;
  spots: Spot[];
  onDone: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const [name, setName] = useState(club?.name ?? "");
  const [description, setDescription] = useState(club?.description ?? "");
  const [country, setCountry] = useState(club?.country ?? "Israel");
  const [spotId, setSpotId] = useState(club?.spotId ? String(club.spotId) : "");
  const [whatsappUrl, setWhatsappUrl] = useState(club?.whatsappUrl ?? "");
  const [busy, setBusy] = useState(false);
  const members = useLoad(async () => {
    if (!club) return [];
    return officeListClubMembers({ data: club.id });
  }, [club?.id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name,
      description,
      country,
      spotId: spotId ? Number(spotId) : null,
      whatsappUrl,
    };
    setBusy(true);
    try {
      if (club) await officeUpdateClub({ data: { id: club.id, ...payload } });
      else await officeCreateClub({ data: payload });
      toast.success(t("office.saved"));
      onDone();
    } catch (err) {
      handleErr(err, t("groupNew.badWa"), t("office.fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
      <Field label={t("group.name")}>
        <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("spotNew.country")}>
        <Select value={country} onChange={(e) => setCountry(e.target.value)}>
          {COUNTRIES.map((c) => (
            <option key={c.name} value={c.name}>
              {countryLabel(locale, c.name)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("group.spot")}>
        <Select value={spotId} onChange={(e) => setSpotId(e.target.value)}>
          <option value="">{t("group.spotNone")}</option>
          {spots.map((s) => (
            <option key={s.id} value={s.id}>
              {localizeSpotField(locale, s.slug, "name", s.name)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("group.desc")}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label={t("group.whatsapp")}>
        <Input value={whatsappUrl} onChange={(e) => setWhatsappUrl(e.target.value)} placeholder={t("group.whatsappPh")} />
      </Field>
      {club ? (
        <div>
          <p className="text-xs font-medium tracking-wide text-muted">{t("group.members")}</p>
          <ul className="mt-2 space-y-1">
            {(members.data ?? []).map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-fg">
                  {m.displayName}
                  {m.isAdmin ? ` · ${t("groups.admin")}` : ""}
                </span>
                {m.isAdmin ? null : (
                  <button
                    type="button"
                    className="h-11 px-2 text-muted hover:text-danger"
                    onClick={async () => {
                      try {
                        await officeRemoveClubMember({
                          data: { clubId: club.id, userId: m.userId },
                        });
                        void members.reload();
                      } catch (err) {
                        handleErr(err, t("office.fail"), t("office.fail"));
                      }
                    }}
                  >
                    {t("group.remove")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <FormActions
        busy={busy}
        canDelete={Boolean(club)}
        onDelete={async () => {
          if (!club) return;
          await officeDeleteClub({ data: club.id });
          toast.success(t("office.deleted"));
          onDeleted();
        }}
      />
    </form>
  );
}

function GatheringsPanel() {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const list = useLoad(() => officeListGatherings(), []);
  const spots = useSpotsCatalog();
  const [selected, setSelected] = useState<number | "new" | null>(null);
  const current = useMemo(
    () => (typeof selected === "number" ? list.data?.find((g) => g.id === selected) : null),
    [list.data, selected],
  );

  return (
    <Split
      list={
        <RowList
          loading={list.loading}
          empty={t("office.empty")}
          onNew={() => setSelected("new")}
          newLabel={t("office.new")}
          items={(list.data ?? []).map((g) => ({
            id: g.id,
            title: g.title,
            meta: `${g.spotName} · ${formatDateTime(g.startsAt, locale)}`,
            active: selected === g.id,
            onClick: () => setSelected(g.id),
          }))}
        />
      }
      form={
        selected === null ? (
          <Hint />
        ) : (
          <GatheringForm
            key={selected === "new" ? "new" : selected}
            gathering={current ?? null}
            spots={spots.data ?? []}
            onDone={() => void list.reload()}
            onDeleted={() => {
              setSelected(null);
              void list.reload();
            }}
          />
        )
      }
    />
  );
}

function GatheringForm({
  gathering,
  spots,
  onDone,
  onDeleted,
}: {
  gathering: Gathering | null;
  spots: Spot[];
  onDone: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const [title, setTitle] = useState(gathering?.title ?? "");
  const [spotId, setSpotId] = useState(gathering ? String(gathering.spotId) : "");
  const [startsAt, setStartsAt] = useState(gathering ? toLocalInput(gathering.startsAt) : "");
  const [distanceKm, setDistanceKm] = useState(
    gathering?.distanceKm != null ? String(gathering.distanceKm) : "",
  );
  const [organizer, setOrganizer] = useState(gathering?.organizer ?? "");
  const [notes, setNotes] = useState(gathering?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!spotId) return;
    const payload = {
      title,
      spotId: Number(spotId),
      startsAt: fromLocalInput(startsAt),
      distanceKm: distanceKm ? Number(distanceKm) : null,
      organizer,
      notes,
    };
    setBusy(true);
    try {
      if (gathering) await officeUpdateGathering({ data: { id: gathering.id, ...payload } });
      else await officeCreateGathering({ data: payload });
      toast.success(t("office.saved"));
      onDone();
    } catch (err) {
      handleErr(err, t("office.fail"), t("office.fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
      <Field label={t("spotNew.name")}>
        <Input required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={t("log.spot")}>
        <Select required value={spotId} onChange={(e) => setSpotId(e.target.value)}>
          <option value="">{t("log.choose")}</option>
          {spots.map((s) => (
            <option key={s.id} value={s.id}>
              {localizeSpotField(locale, s.slug, "name", s.name)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("office.starts")}>
        <Input required type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("log.km")}>
          <Input type="number" min={0.1} step={0.1} value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
        </Field>
        <Field label={t("office.organizer")}>
          <Input required value={organizer} onChange={(e) => setOrganizer(e.target.value)} />
        </Field>
      </div>
      <Field label={t("office.notes")}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <FormActions
        busy={busy}
        canDelete={Boolean(gathering)}
        onDelete={async () => {
          if (!gathering) return;
          await officeDeleteGathering({ data: gathering.id });
          toast.success(t("office.deleted"));
          onDeleted();
        }}
      />
    </form>
  );
}

function StoriesPanel() {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const list = useLoad(() => officeListStories(), []);
  const spots = useSpotsCatalog();
  const [selected, setSelected] = useState<number | "new" | null>(null);
  const current = useMemo(
    () => (typeof selected === "number" ? list.data?.find((s) => s.id === selected) : null),
    [list.data, selected],
  );

  return (
    <Split
      list={
        <RowList
          loading={list.loading}
          empty={t("office.empty")}
          onNew={() => setSelected("new")}
          newLabel={t("office.new")}
          items={(list.data ?? []).map((s) => ({
            id: s.id,
            title: s.title,
            meta: s.locationLabel || s.spotName || s.kind,
            active: selected === s.id,
            onClick: () => setSelected(s.id),
          }))}
        />
      }
      form={
        selected === null ? (
          <Hint />
        ) : (
          <StoryForm
            key={selected === "new" ? "new" : selected}
            story={current ?? null}
            spots={spots.data ?? []}
            onDone={() => void list.reload()}
            onDeleted={() => {
              setSelected(null);
              void list.reload();
            }}
          />
        )
      }
    />
  );
}

type StoryRow = Awaited<ReturnType<typeof officeListStories>>[number];

function StoryForm({
  story,
  spots,
  onDone,
  onDeleted,
}: {
  story: StoryRow | null;
  spots: Spot[];
  onDone: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const [title, setTitle] = useState(story?.title ?? "");
  const [body, setBody] = useState(story?.body ?? "");
  const [kind, setKind] = useState(story?.kind ?? "notice");
  const [locationLabel, setLocationLabel] = useState(story?.locationLabel ?? "");
  const [spotId, setSpotId] = useState(story?.spotId ? String(story.spotId) : "");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      title,
      body,
      kind: kind as "conditions" | "crossing" | "gathering" | "notice",
      locationLabel,
      spotId: spotId ? Number(spotId) : null,
    };
    setBusy(true);
    try {
      if (story) await officeUpdateStory({ data: { id: story.id, ...payload } });
      else await officeCreateStory({ data: payload });
      toast.success(t("office.saved"));
      onDone();
    } catch (err) {
      handleErr(err, t("office.fail"), t("office.fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
      <Field label={t("spotNew.name")}>
        <Input required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={t("office.kind")}>
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          {(["conditions", "crossing", "gathering", "notice"] as const).map((k) => (
            <option key={k} value={k}>
              {t(
                k === "conditions"
                  ? "kind.conditions"
                  : k === "crossing"
                    ? "kind.crossing"
                    : k === "gathering"
                      ? "kind.gathering"
                      : "kind.notice",
              )}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("office.location")}>
        <Input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} />
      </Field>
      <Field label={t("log.spot")}>
        <Select value={spotId} onChange={(e) => setSpotId(e.target.value)}>
          <option value="">{t("group.spotNone")}</option>
          {spots.map((s) => (
            <option key={s.id} value={s.id}>
              {localizeSpotField(locale, s.slug, "name", s.name)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("office.body")}>
        <Textarea required minLength={8} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <FormActions
        busy={busy}
        canDelete={Boolean(story)}
        onDelete={async () => {
          if (!story) return;
          await officeDeleteStory({ data: story.id });
          toast.success(t("office.deleted"));
          onDeleted();
        }}
      />
    </form>
  );
}

function ReportsPanel() {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const list = useLoad(() => officeListReports(), []);

  return (
    <div className="mt-6 space-y-3">
      {list.loading ? <Skeleton className="h-40 rounded-xl" /> : null}
      {!list.loading && (list.data ?? []).length === 0 ? (
        <p className="rounded-xl bg-surface p-6 text-sm text-muted shadow-[var(--shadow-border)]">
          {t("office.empty")}
        </p>
      ) : null}
      {(list.data ?? []).map((r) => (
        <div key={r.id} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-fg">
                {r.spotName} · {r.swimmerName}
              </p>
              <p className="mt-1 text-xs text-muted">{formatDate(r.createdAt, locale)}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{r.notes}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={async () => {
                if (!window.confirm(t("office.confirmDelete"))) return;
                try {
                  await officeDeleteReport({ data: r.id });
                  toast.success(t("office.deleted"));
                  void list.reload();
                } catch (err) {
                  handleErr(err, t("office.fail"), t("office.fail"));
                }
              }}
            >
              {t("office.delete")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SwimsPanel() {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const list = useLoad(() => officeListSwims(), []);
  const spots = useSpotsCatalog();
  const [selected, setSelected] = useState<number | null>(null);
  const current = useMemo(
    () => (selected ? list.data?.find((s) => s.id === selected) : null),
    [list.data, selected],
  );

  return (
    <Split
      list={
        <RowList
          loading={list.loading}
          empty={t("office.empty")}
          items={(list.data ?? []).map((s) => ({
            id: s.id,
            title: `${s.swimmerName} · ${formatKm(s.distanceKm, locale)}`,
            meta: `${s.spotName} · ${formatDate(s.swamOn, locale)}`,
            active: selected === s.id,
            onClick: () => setSelected(s.id),
          }))}
        />
      }
      form={
        current ? (
          <SwimForm
            key={current.id}
            swim={current}
            spots={spots.data ?? []}
            onDone={() => void list.reload()}
            onDeleted={() => {
              setSelected(null);
              void list.reload();
            }}
          />
        ) : (
          <Hint />
        )
      }
    />
  );
}

function SwimForm({
  swim,
  spots,
  onDone,
  onDeleted,
}: {
  swim: Swim;
  spots: Spot[];
  onDone: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const [spotId, setSpotId] = useState(String(swim.spotId));
  const [swamOn, setSwamOn] = useState(swim.swamOn);
  const [distanceKm, setDistanceKm] = useState(String(swim.distanceKm));
  const [durationMin, setDurationMin] = useState(swim.durationMin != null ? String(swim.durationMin) : "");
  const [waterTempC, setWaterTempC] = useState(swim.waterTempC != null ? String(swim.waterTempC) : "");
  const [notes, setNotes] = useState(swim.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await officeUpdateSwim({
        data: {
          id: swim.id,
          spotId: Number(spotId),
          swamOn,
          distanceKm: Number(distanceKm),
          durationMin: durationMin ? Number(durationMin) : null,
          waterTempC: waterTempC ? Number(waterTempC) : null,
          notes: notes || null,
        },
      });
      toast.success(t("office.saved"));
      onDone();
    } catch (err) {
      handleErr(err, t("office.fail"), t("office.fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
      <p className="text-sm text-muted">{swim.swimmerName}</p>
      <Field label={t("log.spot")}>
        <Select value={spotId} onChange={(e) => setSpotId(e.target.value)}>
          {spots.map((s) => (
            <option key={s.id} value={s.id}>
              {localizeSpotField(locale, s.slug, "name", s.name)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("log.date")}>
        <Input type="date" required value={swamOn} onChange={(e) => setSwamOn(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("log.km")}>
          <Input type="number" min={0.1} step={0.1} required value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
        </Field>
        <Field label={t("log.time")}>
          <Input type="number" min={1} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
        </Field>
      </div>
      <Field label={t("log.temp")}>
        <Input type="number" step={0.5} value={waterTempC} onChange={(e) => setWaterTempC(e.target.value)} />
      </Field>
      <Field label={t("office.notes")}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <FormActions
        busy={busy}
        canDelete
        onDelete={async () => {
          await officeDeleteSwim({ data: swim.id });
          toast.success(t("office.deleted"));
          onDeleted();
        }}
      />
    </form>
  );
}

function PeoplePanel() {
  const t = useT();
  const list = useLoad(() => officeListPeople(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const current = useMemo(
    () => (selected ? list.data?.find((p) => p.userId === selected) : null),
    [list.data, selected],
  );

  return (
    <Split
      list={
        <RowList
          loading={list.loading}
          empty={t("office.empty")}
          items={(list.data ?? []).map((p) => ({
            id: p.userId,
            title: p.displayName,
            meta: p.isOwner ? t("office.ownerBadge") : `${p.swimCount}`,
            active: selected === p.userId,
            onClick: () => setSelected(p.userId),
          }))}
        />
      }
      form={
        current ? (
          <PersonForm
            key={current.userId}
            person={current}
            onDone={() => void list.reload()}
            onDeleted={() => {
              setSelected(null);
              void list.reload();
            }}
          />
        ) : (
          <Hint />
        )
      }
    />
  );
}

function PersonForm({
  person,
  onDone,
  onDeleted,
}: {
  person: OfficePerson;
  onDone: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const locale = usePlaceStore((s) => s.locale);
  const [displayName, setDisplayName] = useState(person.displayName);
  const [homeWater, setHomeWater] = useState(person.homeWater ?? "");
  const [stroke, setStroke] = useState(person.stroke ?? "");
  const [bio, setBio] = useState(person.bio ?? "");
  const [country, setCountry] = useState(person.country ?? "");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await officeUpdatePerson({
        data: {
          userId: person.userId,
          displayName,
          homeWater,
          stroke,
          bio,
          country,
        },
      });
      toast.success(t("office.saved"));
      onDone();
    } catch (err) {
      handleErr(err, t("office.fail"), t("office.fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
      {person.isOwner ? (
        <p className="text-sm text-accent">{t("office.ownerBadge")}</p>
      ) : null}
      <Field label={t("profile.name")}>
        <Input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
      <Field label={t("profile.homeWater")}>
        <Input value={homeWater} onChange={(e) => setHomeWater(e.target.value)} />
      </Field>
      <Field label={t("spotNew.country")}>
        <Select value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">{t("group.spotNone")}</option>
          {COUNTRIES.map((c) => (
            <option key={c.name} value={c.name}>
              {countryLabel(locale, c.name)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("profile.stroke")}>
        <Input value={stroke} onChange={(e) => setStroke(e.target.value)} />
      </Field>
      <Field label={t("profile.bio")}>
        <Textarea value={bio} onChange={(e) => setBio(e.target.value)} />
      </Field>
      <FormActions
        busy={busy}
        canDelete={!person.isOwner}
        deleteLabel={t("office.removePerson")}
        onDelete={async () => {
          await officeDeletePerson({ data: person.userId });
          toast.success(t("office.deleted"));
          onDeleted();
        }}
      />
      {person.isOwner ? <p className="text-xs text-faint">{t("office.cannotOwner")}</p> : null}
    </form>
  );
}

function StravaPanel() {
  const t = useT();
  const loaded = useLoad(() => getStravaAppSettings(), []);
  const [clientId, setClientId] = useState(STRAVA_CLIENT_ID);
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const host = typeof window !== "undefined" ? window.location.host : "pilot-zephyr-turbo-kind.grok.me";

  if (loaded.loading) return <Skeleton className="mt-8 h-48 rounded-xl" />;

  return (
    <form
      className="mt-8 max-w-lg space-y-4 rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await saveStravaApp({
            data: {
              clientId: clientId || loaded.data?.clientId || "",
              clientSecret,
            },
          });
          toast.success(t("office.stravaSaved"));
          setClientSecret("");
          void loaded.reload();
        } catch (err) {
          if (isUnauthorized(err)) window.location.href = "/login";
          else toast.error(t("office.fail"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-display text-2xl text-fg">{t("office.stravaTitle")}</h2>
      <p className="text-sm leading-relaxed text-muted">{t("office.stravaLead")}</p>
      <p className="text-xs leading-relaxed text-faint">{t("office.stravaDomain", { host })}</p>
      <Field label={t("office.stravaId")}>
        <Input
          required
          defaultValue={loaded.data?.clientId || STRAVA_CLIENT_ID}
          onChange={(e) => setClientId(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field label={t("office.stravaSecret")}>
        <Input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={loaded.data?.hasSecret ? "••••••••" : ""}
          autoComplete="off"
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? t("office.saving") : t("office.save")}
      </Button>
    </form>
  );
}

function Split({ list, form }: { list: ReactNode; form: ReactNode }) {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>{list}</div>
      <div className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">{form}</div>
    </div>
  );
}

function Hint() {
  const t = useT();
  return <p className="text-sm leading-relaxed text-muted">{t("office.pick")}</p>;
}

function RowList({
  loading,
  empty,
  items,
  onNew,
  newLabel,
}: {
  loading: boolean;
  empty: string;
  items: { id: string | number; title: string; meta: string; active: boolean; onClick: () => void }[];
  onNew?: () => void;
  newLabel?: string;
}) {
  return (
    <div>
      {onNew ? (
        <Button type="button" size="sm" variant="outline" className="mb-3" onClick={onNew}>
          {newLabel}
        </Button>
      ) : null}
      {loading ? <Skeleton className="h-40 rounded-xl" /> : null}
      {!loading && items.length === 0 ? (
        <p className="rounded-xl bg-surface p-6 text-sm text-muted shadow-[var(--shadow-border)]">
          {empty}
        </p>
      ) : null}
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={item.onClick}
              className={cn(
                "flex min-h-11 w-full flex-col items-start rounded-md px-3 py-2 text-start",
                item.active ? "bg-raised text-fg" : "text-fg hover:bg-raised/60",
              )}
            >
              <span className="text-sm">{item.title}</span>
              <span className="text-xs text-muted">{item.meta}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormActions({
  busy,
  canDelete,
  onDelete,
  deleteLabel,
}: {
  busy: boolean;
  canDelete: boolean;
  onDelete: () => Promise<void>;
  deleteLabel?: string;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <Button type="submit" disabled={busy}>
        {busy ? t("office.saving") : t("office.save")}
      </Button>
      {canDelete ? (
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(t("office.confirmDelete"))) return;
            try {
              await onDelete();
            } catch (err) {
              handleErr(err, t("office.fail"), t("office.fail"));
            }
          }}
        >
          {deleteLabel ?? t("office.delete")}
        </Button>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function handleErr(err: unknown, special: string, fallback: string) {
  if (isUnauthorized(err)) {
    window.location.href = "/login";
    return;
  }
  const msg = err instanceof Error ? err.message : "";
  if (/pool/i.test(msg) || msg.includes("בריכ")) toast.error(special);
  else if (/whatsapp/i.test(msg)) toast.error(special);
  else if (msg === "Forbidden") toast.error(fallback);
  else toast.error(fallback);
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string) {
  const d = new Date(value);
  return d.toISOString();
}

