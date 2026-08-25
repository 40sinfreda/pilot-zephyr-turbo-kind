import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { COUNTRIES, isWhatsappUrl, slugify } from "./place";
import { MATCH_KM, haversineKm, nearestByKm } from "./geo";
import { parseMapsPin } from "./maps-pin";
import type {
  Club,
  ClubMember,
  Dispatch,
  FeedItem,
  Gathering,
  MyStats,
  Profile,
  Report,
  Spot,
  Stats,
  Swim,
  WatchImportResult,
  WatchLink,
  SyncEvent,
} from "./types";

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v !== "") return Number(v);
  return 0;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = num(v);
  return Number.isFinite(n) ? n : null;
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return "";
}

const placeFilterSchema = z.object({
  country: z.string().optional(),
  region: z.string().optional(),
});

type PlaceFilter = z.infer<typeof placeFilterSchema>;

type SpotRow = {
  id: number;
  slug: string;
  name: string;
  city: string;
  country: string;
  region: string;
  lat: unknown;
  lng: unknown;
  water_type: string;
  difficulty: string;
  typical_temp_c: number | null;
  typical_km: unknown;
  hazards: string;
  best_season: string;
  description: string;
  swim_count: unknown;
  created_by: string | null;
};

function mapSpot(row: SpotRow): Spot {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    country: row.country,
    region: row.region,
    lat: num(row.lat),
    lng: num(row.lng),
    waterType: row.water_type,
    difficulty: row.difficulty,
    typicalTempC: row.typical_temp_c,
    typicalKm: numOrNull(row.typical_km),
    hazards: row.hazards,
    bestSeason: row.best_season,
    description: row.description,
    swimCount: num(row.swim_count),
    createdBy: row.created_by,
  };
}

const SPOT_SELECT = `
  s.id, s.slug, s.name, s.city, s.country, s.region, s.lat, s.lng,
  s.water_type, s.difficulty, s.typical_temp_c, s.typical_km,
  s.hazards, s.best_season, s.description, s.created_by,
  (select count(*)::int from swims w where w.spot_id = s.id) as swim_count
`;

async function loadSpots(filter: PlaceFilter = {}): Promise<Spot[]> {
  const sql = await getSql();
  const country = filter.country ?? null;
  const region = filter.region ?? null;
  const rows = await sql<SpotRow>`
    select
      s.id, s.slug, s.name, s.city, s.country, s.region, s.lat, s.lng,
      s.water_type, s.difficulty, s.typical_temp_c, s.typical_km,
      s.hazards, s.best_season, s.description, s.created_by,
      (select count(*)::int from swims w where w.spot_id = s.id) as swim_count
    from spots s
    where (${country}::text is null or s.country = ${country})
      and (${region}::text is null or s.region = ${region})
    order by s.name asc
  `;
  return rows.map(mapSpot);
}

async function ensureProfile(userId: string, fallbackName = "Swimmer") {
  const sql = await getSql();
  const name = fallbackName.trim() || "Swimmer";
  await sql`
    insert into profiles (user_id, display_name)
    values (${userId}, ${name})
    on conflict (user_id) do nothing
  `;
}

export const listSpots = createServerFn({ method: "GET" })
  .validator((input: unknown) => placeFilterSchema.parse(input ?? {}))
  .handler(async ({ data }) => loadSpots(data));

export const getSpot = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const sql = await getSql();
    const rows = await sql.query<SpotRow>(
      `select ${SPOT_SELECT} from spots s where s.slug = $1 limit 1`,
      [slug],
    );
    return rows[0] ? mapSpot(rows[0]) : null;
  });

export const getHomeStats = createServerFn({ method: "GET" })
  .validator((input: unknown) => placeFilterSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const country = data.country ?? null;
    const region = data.region ?? null;
    const rows = await sql<{
      spots: unknown;
      gatherings: unknown;
      groups: unknown;
      stories: unknown;
    }>`
      select
        (select count(*)::int from spots s
          where (${country}::text is null or s.country = ${country})
            and (${region}::text is null or s.region = ${region})) as spots,
        (select count(*)::int from events e
          join spots s on s.id = e.spot_id
          where e.starts_at > now()
            and (${country}::text is null or s.country = ${country})
            and (${region}::text is null or s.region = ${region})) as gatherings,
        (select count(*)::int from clubs c
          where (${country}::text is null or c.country = ${country})
            and (${region}::text is null or c.region = ${region})) as groups,
        (select count(*)::int from dispatches d
          left join spots s on s.id = d.spot_id
          where (${country}::text is null or s.country = ${country})
            and (${region}::text is null or s.region = ${region})) as stories
    `;
    const row = rows[0];
    const stats: Stats = {
      spots: num(row?.spots),
      gatherings: num(row?.gatherings),
      groups: num(row?.groups),
      stories: num(row?.stories),
    };
    return stats;
  });

type SwimRow = {
  id: number;
  user_id: string;
  swimmer_name: string | null;
  spot_id: number;
  spot_name: string;
  spot_slug: string;
  city: string;
  country: string;
  swam_on: unknown;
  distance_km: unknown;
  duration_min: number | null;
  water_temp_c: unknown;
  conditions: string | null;
  feeling: string | null;
  notes: string | null;
  created_at: unknown;
  source?: string | null;
};

function mapSwim(row: SwimRow): Swim {
  return {
    id: row.id,
    userId: row.user_id,
    swimmerName: row.swimmer_name?.trim() || "Swimmer",
    spotId: row.spot_id,
    spotName: row.spot_name,
    spotSlug: row.spot_slug,
    city: row.city,
    country: row.country,
    swamOn: iso(row.swam_on).slice(0, 10),
    distanceKm: num(row.distance_km),
    durationMin: row.duration_min,
    waterTempC: numOrNull(row.water_temp_c),
    conditions: row.conditions,
    feeling: row.feeling,
    notes: row.notes,
    createdAt: iso(row.created_at),
    source: row.source ?? "manual",
  };
}

export const listFeed = createServerFn({ method: "GET" })
  .validator((input: unknown) => placeFilterSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const country = data.country ?? null;
    const region = data.region ?? null;
    const dispatchRows = await sql<{
      id: number;
      title: string;
      body: string;
      kind: string;
      location_label: string | null;
      spot_slug: string | null;
      spot_name: string | null;
      published_at: unknown;
    }>`
      select
        d.id, d.title, d.body, d.kind, d.location_label,
        s.slug as spot_slug, s.name as spot_name, d.published_at
      from dispatches d
      left join spots s on s.id = d.spot_id
      where (${country}::text is null or s.country = ${country})
        and (${region}::text is null or s.region = ${region})
      order by d.published_at desc
      limit 12
    `;

    const items: FeedItem[] = dispatchRows.map((row) => {
        const dispatch: Dispatch = {
          id: row.id,
          title: row.title,
          body: row.body,
          kind: row.kind,
          locationLabel: row.location_label,
          spotSlug: row.spot_slug,
          spotName: row.spot_name,
          publishedAt: iso(row.published_at),
        };
        return { kind: "dispatch" as const, dispatch };
      });

    return items;
  });

export const listSpotSwims = createServerFn({ method: "GET" })
  .validator((spotId: number) => spotId)
  .handler(async ({ data: spotId }) => {
    const sql = await getSql();
    const rows = await sql<SwimRow>`
      select
        w.id, w.user_id, p.display_name as swimmer_name, w.spot_id,
        s.name as spot_name, s.slug as spot_slug, s.city, s.country,
        w.swam_on, w.distance_km, w.duration_min, w.water_temp_c,
        w.conditions, w.feeling, w.notes, w.created_at, w.source
      from swims w
      join spots s on s.id = w.spot_id
      left join profiles p on p.user_id = w.user_id
      where w.spot_id = ${spotId}
      order by w.swam_on desc, w.created_at desc
      limit 20
    `;
    return rows.map(mapSwim);
  });

type EventRow = {
  id: number;
  spot_id: number;
  spot_name: string;
  spot_slug: string;
  city: string;
  country: string;
  title: string;
  starts_at: unknown;
  distance_km: unknown;
  organizer: string;
  notes: string | null;
  rsvp_count: unknown;
};

function mapEvent(row: EventRow, goingIds: number[]): Gathering {
  return {
    id: row.id,
    spotId: row.spot_id,
    spotName: row.spot_name,
    spotSlug: row.spot_slug,
    city: row.city,
    country: row.country,
    title: row.title,
    startsAt: iso(row.starts_at),
    distanceKm: numOrNull(row.distance_km),
    organizer: row.organizer,
    notes: row.notes,
    rsvpCount: num(row.rsvp_count),
    going: goingIds.includes(row.id),
  };
}

export const listGatherings = createServerFn({ method: "GET" })
  .validator((input: unknown) => placeFilterSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const country = data.country ?? null;
    const region = data.region ?? null;
    const rows = await sql<EventRow>`
      select
        e.id, e.spot_id, s.name as spot_name, s.slug as spot_slug,
        s.city, s.country, e.title, e.starts_at, e.distance_km,
        e.organizer, e.notes,
        (select count(*)::int from rsvps r where r.event_id = e.id) as rsvp_count
      from events e
      join spots s on s.id = e.spot_id
      where e.starts_at > now() - interval '1 day'
        and (${country}::text is null or s.country = ${country})
        and (${region}::text is null or s.region = ${region})
      order by e.starts_at asc
    `;
    return rows.map((row) => mapEvent(row, []));
  });

export const listSpotGatherings = createServerFn({ method: "GET" })
  .validator((spotId: number) => spotId)
  .handler(async ({ data: spotId }) => {
    const sql = await getSql();
    const rows = await sql<EventRow>`
      select
        e.id, e.spot_id, s.name as spot_name, s.slug as spot_slug,
        s.city, s.country, e.title, e.starts_at, e.distance_km,
        e.organizer, e.notes,
        (select count(*)::int from rsvps r where r.event_id = e.id) as rsvp_count
      from events e
      join spots s on s.id = e.spot_id
      where e.spot_id = ${spotId}
        and e.starts_at > now() - interval '1 day'
      order by e.starts_at asc
    `;
    return rows.map((row) => mapEvent(row, []));
  });

const createGatheringSchema = z.object({
  spotId: z.number().int().positive(),
  title: z.string().trim().min(2).max(120),
  startsAt: z.string().min(8),
  distanceKm: z.number().positive().max(200).nullable(),
  notes: z.string().trim().max(400),
});

export const createGathering = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => createGatheringSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureProfile(context.userId);
    const starts = new Date(data.startsAt);
    if (Number.isNaN(starts.getTime())) throw new Error("Invalid time");
    if (starts.getTime() < Date.now() - 60_000) throw new Error("Time is in the past");
    const sql = await getSql();
    const spot = await sql<{ id: number }>`
      select id from spots where id = ${data.spotId} limit 1
    `;
    if (!spot[0]) throw new Error("Spot not found");
    const profile = await sql<{ display_name: string }>`
      select display_name from profiles where user_id = ${context.userId} limit 1
    `;
    const organizer = profile[0]?.display_name?.trim() || "Swimmer";
    const rows = await sql<{ id: number }>`
      insert into events (spot_id, title, starts_at, distance_km, organizer, notes)
      values (
        ${data.spotId}, ${data.title}, ${starts.toISOString()},
        ${data.distanceKm}, ${organizer}, ${data.notes || null}
      )
      returning id
    `;
    const id = rows[0]?.id;
    if (id) {
      await sql`
        insert into rsvps (user_id, event_id)
        values (${context.userId}, ${id})
        on conflict (user_id, event_id) do nothing
      `;
    }
    return { id };
  });

export const listReports = createServerFn({ method: "GET" })
  .validator((spotId: number) => spotId)
  .handler(async ({ data: spotId }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      swimmer_name: string | null;
      water_temp_c: unknown;
      visibility: string | null;
      wildlife: string | null;
      notes: string;
      created_at: unknown;
    }>`
      select
        r.id, p.display_name as swimmer_name, r.water_temp_c,
        r.visibility, r.wildlife, r.notes, r.created_at
      from reports r
      left join profiles p on p.user_id = r.user_id
      where r.spot_id = ${spotId}
      order by r.created_at desc
      limit 12
    `;
    return rows.map(
      (row): Report => ({
        id: row.id,
        swimmerName: row.swimmer_name?.trim() || "Swimmer",
        waterTempC: numOrNull(row.water_temp_c),
        visibility: row.visibility,
        wildlife: row.wildlife,
        notes: row.notes,
        createdAt: iso(row.created_at),
      }),
    );
  });

const logSwimSchema = z.object({
  spotId: z.number().int().positive(),
  swamOn: z.string().min(8),
  distanceKm: z.number().positive().max(200),
  durationMin: z.number().int().positive().max(6000).nullable(),
  waterTempC: z.number().min(-2).max(40).nullable(),
  conditions: z.string().max(40).nullable(),
  feeling: z.string().max(40).nullable(),
  notes: z.string().max(600).nullable(),
  displayName: z.string().max(80).optional(),
});

export const logSwim = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => logSwimSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureProfile(context.userId, data.displayName);
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      insert into swims (
        user_id, spot_id, swam_on, distance_km, duration_min,
        water_temp_c, conditions, feeling, notes
      ) values (
        ${context.userId}, ${data.spotId}, ${data.swamOn}, ${data.distanceKm},
        ${data.durationMin}, ${data.waterTempC}, ${data.conditions},
        ${data.feeling}, ${data.notes}
      )
      returning id
    `;
    return { id: rows[0]?.id ?? 0 };
  });

export const deleteSwim = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => id)
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`
      delete from swims
      where id = ${id} and user_id = ${context.userId}
    `;
    return { ok: true };
  });

export const listMySwims = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<SwimRow>`
      select
        w.id, w.user_id, p.display_name as swimmer_name, w.spot_id,
        s.name as spot_name, s.slug as spot_slug, s.city, s.country,
        w.swam_on, w.distance_km, w.duration_min, w.water_temp_c,
        w.conditions, w.feeling, w.notes, w.created_at, w.source
      from swims w
      join spots s on s.id = w.spot_id
      left join profiles p on p.user_id = w.user_id
      where w.user_id = ${context.userId}
      order by w.swam_on desc, w.created_at desc
      limit 50
    `;
    return rows.map(mapSwim);
  });

export const getMyStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      swim_count: unknown;
      total_km: unknown;
      unique_spots: unknown;
      longest_km: unknown;
    }>`
      select
        count(*)::int as swim_count,
        coalesce(sum(distance_km), 0) as total_km,
        count(distinct spot_id)::int as unique_spots,
        coalesce(max(distance_km), 0) as longest_km
      from swims
      where user_id = ${context.userId}
    `;
    const row = rows[0];
    const stats: MyStats = {
      swimCount: num(row?.swim_count),
      totalKm: num(row?.total_km),
      uniqueSpots: num(row?.unique_spots),
      longestKm: num(row?.longest_km),
    };
    return stats;
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureProfile(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      user_id: string;
      display_name: string;
      home_water: string | null;
      bio: string | null;
      stroke: string | null;
      country: string | null;
      locale: string | null;
      place_scope: string | null;
    }>`
      select user_id, display_name, home_water, bio, stroke, country, locale, place_scope
      from profiles
      where user_id = ${context.userId}
      limit 1
    `;
    const row = rows[0];
    const profile: Profile = {
      userId: context.userId,
      displayName: row?.display_name ?? "Swimmer",
      homeWater: row?.home_water ?? null,
      bio: row?.bio ?? null,
      stroke: row?.stroke ?? null,
      country: row?.country ?? null,
      locale: row?.locale ?? null,
      placeScope: row?.place_scope ?? null,
    };
    return profile;
  });

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  homeWater: z.string().trim().max(80),
  bio: z.string().trim().max(280),
  stroke: z.string().trim().max(40),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, display_name, home_water, bio, stroke, updated_at)
      values (
        ${context.userId}, ${data.displayName},
        ${data.homeWater || null}, ${data.bio || null}, ${data.stroke || null},
        now()
      )
      on conflict (user_id) do update set
        display_name = excluded.display_name,
        home_water = excluded.home_water,
        bio = excluded.bio,
        stroke = excluded.stroke,
        updated_at = now()
    `;
    return { ok: true };
  });

const placeSaveSchema = z.object({
  country: z.string().min(1).max(80),
  region: z.string().min(1).max(80),
  scope: z.enum(["country", "region"]),
  locale: z.enum(["he", "en"]),
});

export const saveMyPlace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => placeSaveSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureProfile(context.userId);
    const sql = await getSql();
    await sql`
      update profiles set
        country = ${data.country},
        locale = ${data.locale},
        place_scope = ${data.scope},
        updated_at = now()
      where user_id = ${context.userId}
    `;
    return { ok: true };
  });

export const toggleSaveSpot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((spotId: number) => spotId)
  .handler(async ({ context, data: spotId }) => {
    const sql = await getSql();
    const existing = await sql<{ user_id: string }>`
      select user_id from saved_spots
      where user_id = ${context.userId} and spot_id = ${spotId}
      limit 1
    `;
    if (existing[0]) {
      await sql`
        delete from saved_spots
        where user_id = ${context.userId} and spot_id = ${spotId}
      `;
      return { saved: false };
    }
    await sql`
      insert into saved_spots (user_id, spot_id)
      values (${context.userId}, ${spotId})
    `;
    return { saved: true };
  });

export const listSavedSpotIds = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ spot_id: number }>`
      select spot_id from saved_spots where user_id = ${context.userId}
    `;
    return rows.map((r) => r.spot_id);
  });

export const listSavedSpots = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql.query<SpotRow>(
      `select ${SPOT_SELECT}
       from saved_spots sv
       join spots s on s.id = sv.spot_id
       where sv.user_id = $1
       order by sv.created_at desc`,
      [context.userId],
    );
    return rows.map(mapSpot);
  });

export const toggleSaveClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((clubId: number) => clubId)
  .handler(async ({ context, data: clubId }) => {
    const sql = await getSql();
    const existing = await sql<{ user_id: string }>`
      select user_id from saved_clubs
      where user_id = ${context.userId} and club_id = ${clubId}
      limit 1
    `;
    if (existing[0]) {
      await sql`
        delete from saved_clubs
        where user_id = ${context.userId} and club_id = ${clubId}
      `;
      return { saved: false };
    }
    await sql`
      insert into saved_clubs (user_id, club_id)
      values (${context.userId}, ${clubId})
    `;
    return { saved: true };
  });

export const listSavedClubIds = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ club_id: number }>`
      select club_id from saved_clubs where user_id = ${context.userId}
    `;
    return rows.map((r) => r.club_id);
  });

export const listSavedClubs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql.query<ClubRow>(
      `select ${CLUB_SELECT}
       from saved_clubs sv
       join clubs c on c.id = sv.club_id
       left join spots s on s.id = c.spot_id
       left join profiles p on p.user_id = c.admin_user_id
       where sv.user_id = $1
       order by sv.created_at desc`,
      [context.userId],
    );
    return rows.map((row) => mapClub(row, { userId: context.userId }));
  });

export const toggleRsvp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((eventId: number) => eventId)
  .handler(async ({ context, data: eventId }) => {
    await ensureProfile(context.userId);
    const sql = await getSql();
    const existing = await sql<{ id: number }>`
      select id from rsvps
      where user_id = ${context.userId} and event_id = ${eventId}
      limit 1
    `;
    if (existing[0]) {
      await sql`
        delete from rsvps
        where user_id = ${context.userId} and event_id = ${eventId}
      `;
      return { going: false };
    }
    await sql`
      insert into rsvps (user_id, event_id)
      values (${context.userId}, ${eventId})
    `;
    return { going: true };
  });

export const listMyRsvpIds = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ event_id: number }>`
      select event_id from rsvps where user_id = ${context.userId}
    `;
    return rows.map((r) => r.event_id);
  });

const reportSchema = z.object({
  spotId: z.number().int().positive(),
  waterTempC: z.number().min(-2).max(40).nullable(),
  visibility: z.string().max(40).nullable(),
  wildlife: z.string().max(80).nullable(),
  notes: z.string().trim().min(1).max(400),
  displayName: z.string().max(80).optional(),
});

export const createReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => reportSchema.parse(input))
  .handler(async ({ context, data }) => {
    await ensureProfile(context.userId, data.displayName);
    const sql = await getSql();
    await sql`
      insert into reports (user_id, spot_id, water_temp_c, visibility, wildlife, notes)
      values (
        ${context.userId}, ${data.spotId}, ${data.waterTempC},
        ${data.visibility}, ${data.wildlife}, ${data.notes}
      )
    `;
    return { ok: true };
  });

export const resolveMapsPin = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.string().trim().min(4).max(2000).parse(input))
  .handler(async ({ data }) => {
    const direct = parseMapsPin(data);
    if (direct) return direct;
    if (!/^https?:\/\//i.test(data)) return null;
    try {
      const res = await fetch(data, {
        method: "GET",
        redirect: "follow",
        headers: { Accept: "text/html", "User-Agent": "Tideline/1.0" },
      });
      const finalUrl = res.url || data;
      const fromFinal = parseMapsPin(finalUrl);
      if (fromFinal) return fromFinal;
      const html = await res.text();
      const canonical = html.match(
        /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
      );
      if (canonical?.[1]) {
        const fromCanon = parseMapsPin(canonical[1]);
        if (fromCanon) return fromCanon;
      }
      return parseMapsPin(html.slice(0, 8000));
    } catch {
      return null;
    }
  });

const createSpotSchema = z.object({
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(1).max(80),
  country: z.string().trim().min(1).max(80),
  waterType: z.enum(["sea", "ocean", "lake", "river"]),
  difficulty: z.enum(["gentle", "moderate", "challenging", "extreme"]),
  typicalKm: z.number().positive().max(200).nullable(),
  typicalTempC: z.number().min(-2).max(40).nullable(),
  bestSeason: z.string().trim().max(80),
  hazards: z.string().trim().max(200),
  description: z.string().trim().min(8).max(800),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});

export const createSpot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => createSpotSchema.parse(input))
  .handler(async ({ context, data }) => {
    const lowered = `${data.name} ${data.description}`.toLowerCase();
    if (/\bpool\b/.test(lowered) || lowered.includes("בריכה") || lowered.includes("בריכת")) {
      throw new Error("Pools are not open water");
    }
    const def = COUNTRIES.find((c) => c.name === data.country);
    const region = def?.region ?? "Europe";
    const lat = data.lat ?? def?.lat ?? 0;
    const lng = data.lng ?? def?.lng ?? 0;
    let slug = slugify(data.name);
    const sql = await getSql();
    for (let i = 0; i < 8; i++) {
      const existing = await sql<{ slug: string }>`
        select slug from spots where slug = ${slug} limit 1
      `;
      if (!existing[0]) break;
      slug = `${slugify(data.name)}-${i + 2}`;
    }
    const rows = await sql<{ slug: string }>`
      insert into spots (
        slug, name, city, country, region, lat, lng, water_type, difficulty,
        typical_temp_c, typical_km, hazards, best_season, description, created_by
      ) values (
        ${slug}, ${data.name}, ${data.city}, ${data.country}, ${region},
        ${lat}, ${lng}, ${data.waterType}, ${data.difficulty},
        ${data.typicalTempC}, ${data.typicalKm}, ${data.hazards},
        ${data.bestSeason}, ${data.description}, ${context.userId}
      )
      returning slug
    `;
    return { slug: rows[0]?.slug ?? slug };
  });

type ClubRow = {
  id: number;
  slug: string;
  name: string;
  country: string;
  region: string;
  spot_id: number | null;
  spot_name: string | null;
  spot_slug: string | null;
  description: string;
  whatsapp_url: string | null;
  admin_user_id: string;
  admin_name: string | null;
  member_count: unknown;
};

function mapClub(
  row: ClubRow,
  opts: { userId?: string; memberIds?: string[] },
): Club {
  const isAdmin = opts.userId ? row.admin_user_id === opts.userId : false;
  const isMember = opts.userId
    ? Boolean(opts.memberIds?.includes(opts.userId)) || isAdmin
    : false;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    country: row.country,
    region: row.region,
    spotId: row.spot_id,
    spotName: row.spot_name,
    spotSlug: row.spot_slug,
    description: row.description,
    memberCount: num(row.member_count),
    isMember,
    isAdmin,
    whatsappUrl: isMember ? row.whatsapp_url : null,
    adminName: row.admin_name?.trim() || "Swimmer",
  };
}

const CLUB_SELECT = `
  c.id, c.slug, c.name, c.country, c.region, c.spot_id,
  s.name as spot_name, s.slug as spot_slug, c.description, c.whatsapp_url,
  c.admin_user_id, p.display_name as admin_name,
  (select count(*)::int from club_members m where m.club_id = c.id) as member_count
`;

export const listClubs = createServerFn({ method: "GET" })
  .validator((input: unknown) => placeFilterSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const country = data.country ?? null;
    const region = data.region ?? null;
    const rows = await sql<ClubRow>`
      select
        c.id, c.slug, c.name, c.country, c.region, c.spot_id,
        s.name as spot_name, s.slug as spot_slug, c.description, c.whatsapp_url,
        c.admin_user_id, p.display_name as admin_name,
        (select count(*)::int from club_members m where m.club_id = c.id) as member_count
      from clubs c
      left join spots s on s.id = c.spot_id
      left join profiles p on p.user_id = c.admin_user_id
      where (${country}::text is null or c.country = ${country})
        and (${region}::text is null or c.region = ${region})
      order by c.created_at desc
    `;
    return rows.map((row) => mapClub(row, {}));
  });

export const getClub = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const sql = await getSql();
    const rows = await sql.query<ClubRow>(
      `select ${CLUB_SELECT}
       from clubs c
       left join spots s on s.id = c.spot_id
       left join profiles p on p.user_id = c.admin_user_id
       where c.slug = $1
       limit 1`,
      [slug],
    );
    return rows[0] ? mapClub(rows[0], {}) : null;
  });

export const getMyClubAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((slug: string) => slug)
  .handler(async ({ context, data: slug }) => {
    const sql = await getSql();
    const rows = await sql.query<ClubRow>(
      `select ${CLUB_SELECT}
       from clubs c
       left join spots s on s.id = c.spot_id
       left join profiles p on p.user_id = c.admin_user_id
       where c.slug = $1
       limit 1`,
      [slug],
    );
    const row = rows[0];
    if (!row) return null;
    const members = await sql<{ user_id: string }>`
      select user_id from club_members where club_id = ${row.id}
    `;
    return mapClub(row, {
      userId: context.userId,
      memberIds: members.map((m) => m.user_id),
    });
  });

export const listMyClubSlugs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ slug: string }>`
      select c.slug
      from club_members m
      join clubs c on c.id = m.club_id
      where m.user_id = ${context.userId}
    `;
    return rows.map((r) => r.slug);
  });

const createClubSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400),
  country: z.string().trim().min(1).max(80),
  spotId: z.number().int().positive().nullable(),
  whatsappUrl: z.string().trim().max(300),
});

export const createClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => createClubSchema.parse(input))
  .handler(async ({ context, data }) => {
    if (data.whatsappUrl && !isWhatsappUrl(data.whatsappUrl)) {
      throw new Error("Invalid WhatsApp link");
    }
    await ensureProfile(context.userId);
    const region = COUNTRIES.find((c) => c.name === data.country)?.region ?? "Europe";
    let slug = slugify(data.name);
    const sql = await getSql();
    for (let i = 0; i < 8; i++) {
      const existing = await sql<{ slug: string }>`
        select slug from clubs where slug = ${slug} limit 1
      `;
      if (!existing[0]) break;
      slug = `${slugify(data.name)}-${i + 2}`;
    }
    const rows = await sql<{ slug: string; id: number }>`
      insert into clubs (
        slug, name, country, region, spot_id, description, whatsapp_url, admin_user_id
      ) values (
        ${slug}, ${data.name}, ${data.country}, ${region},
        ${data.spotId}, ${data.description},
        ${data.whatsappUrl || null}, ${context.userId}
      )
      returning slug, id
    `;
    const id = rows[0]?.id;
    if (id) {
      await sql`
        insert into club_members (club_id, user_id)
        values (${id}, ${context.userId})
        on conflict (club_id, user_id) do nothing
      `;
    }
    return { slug: rows[0]?.slug ?? slug };
  });

export const joinClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((clubId: number) => clubId)
  .handler(async ({ context, data: clubId }) => {
    await ensureProfile(context.userId);
    const sql = await getSql();
    await sql`
      insert into club_members (club_id, user_id)
      values (${clubId}, ${context.userId})
      on conflict (club_id, user_id) do nothing
    `;
    return { ok: true };
  });

export const leaveClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((clubId: number) => clubId)
  .handler(async ({ context, data: clubId }) => {
    const sql = await getSql();
    const club = await sql<{ admin_user_id: string }>`
      select admin_user_id from clubs where id = ${clubId} limit 1
    `;
    if (club[0]?.admin_user_id === context.userId) {
      throw new Error("Admin cannot leave");
    }
    await sql`
      delete from club_members
      where club_id = ${clubId} and user_id = ${context.userId}
    `;
    return { ok: true };
  });

const updateClubSchema = z.object({
  clubId: z.number().int().positive(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400),
  spotId: z.number().int().positive().nullable(),
  whatsappUrl: z.string().trim().max(300),
});

export const updateClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => updateClubSchema.parse(input))
  .handler(async ({ context, data }) => {
    if (data.whatsappUrl && !isWhatsappUrl(data.whatsappUrl)) {
      throw new Error("Invalid WhatsApp link");
    }
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      update clubs set
        name = ${data.name},
        description = ${data.description},
        spot_id = ${data.spotId},
        whatsapp_url = ${data.whatsappUrl || null}
      where id = ${data.clubId} and admin_user_id = ${context.userId}
      returning id
    `;
    if (!rows[0]) throw new Error("Forbidden");
    return { ok: true };
  });

export const deleteClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((clubId: number) => clubId)
  .handler(async ({ context, data: clubId }) => {
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      delete from clubs
      where id = ${clubId} and admin_user_id = ${context.userId}
      returning id
    `;
    if (!rows[0]) throw new Error("Forbidden");
    return { ok: true };
  });

export const listClubMembers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((clubId: number) => clubId)
  .handler(async ({ context, data: clubId }) => {
    const sql = await getSql();
    const club = await sql<{ admin_user_id: string }>`
      select admin_user_id from clubs where id = ${clubId} limit 1
    `;
    if (!club[0]) throw new Error("Not found");
    const member = await sql<{ user_id: string }>`
      select user_id from club_members
      where club_id = ${clubId} and user_id = ${context.userId}
      limit 1
    `;
    if (!member[0] && club[0].admin_user_id !== context.userId) {
      throw new Error("Forbidden");
    }
    const adminId = club[0].admin_user_id;
    const rows = await sql<{
      user_id: string;
      display_name: string | null;
      joined_at: unknown;
    }>`
      select m.user_id, p.display_name, m.joined_at
      from club_members m
      left join profiles p on p.user_id = m.user_id
      where m.club_id = ${clubId}
      order by m.joined_at asc
    `;
    return rows.map(
      (row): ClubMember => ({
        userId: row.user_id,
        displayName: row.display_name?.trim() || "Swimmer",
        joinedAt: iso(row.joined_at),
        isAdmin: row.user_id === adminId,
      }),
    );
  });

export const removeClubMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ clubId: z.number(), userId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    if (data.userId === context.userId) throw new Error("Forbidden");
    const sql = await getSql();
    const club = await sql<{ admin_user_id: string }>`
      select admin_user_id from clubs where id = ${data.clubId} limit 1
    `;
    if (!club[0] || club[0].admin_user_id !== context.userId) {
      throw new Error("Forbidden");
    }
    await sql`
      delete from club_members
      where club_id = ${data.clubId} and user_id = ${data.userId}
    `;
    return { ok: true };
  });

export const listSpotClubs = createServerFn({ method: "GET" })
  .validator((spotId: number) => spotId)
  .handler(async ({ data: spotId }) => {
    const sql = await getSql();
    const rows = await sql.query<ClubRow>(
      `select ${CLUB_SELECT}
       from clubs c
       left join spots s on s.id = c.spot_id
       left join profiles p on p.user_id = c.admin_user_id
       where c.spot_id = $1
       order by c.created_at desc`,
      [spotId],
    );
    return rows.map((row) => mapClub(row, {}));
  });

const watchSourceSchema = z.enum(["garmin", "suunto", "samsung", "apple", "strava"]);

const importWorkoutSchema = z.object({
  source: watchSourceSchema,
  key: z.string().min(1).max(80),
  title: z.string().max(160),
  swamOn: z.string().min(8).max(12),
  distanceKm: z.number().positive().max(200),
  durationMin: z.number().positive().max(6000),
  waterTempC: z.number().min(-2).max(40).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  poolLike: z.boolean().optional(),
  spotId: z.number().int().positive().nullable().optional(),
});

type WatchLinkRow = {
  source: string;
  linked_at: unknown;
  last_import_at: unknown;
  import_count: unknown;
};

function mapWatchLink(row: WatchLinkRow): WatchLink {
  return {
    source: row.source,
    linkedAt: iso(row.linked_at),
    lastImportAt: row.last_import_at ? iso(row.last_import_at) : null,
    importCount: num(row.import_count),
  };
}

async function ensureWatchLink(userId: string, source: string) {
  const sql = await getSql();
  await sql`
    insert into watch_links (user_id, source)
    values (${userId}, ${source})
    on conflict (user_id, source) do nothing
  `;
}

async function bumpWatchLink(userId: string, source: string, added: number) {
  await ensureWatchLink(userId, source);
  if (added <= 0) return;
  const sql = await getSql();
  await sql`
    update watch_links
    set last_import_at = now(),
        import_count = import_count + ${added}
    where user_id = ${userId} and source = ${source}
  `;
}

export const listWatchLinks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<WatchLinkRow>`
      select source, linked_at, last_import_at, import_count
      from watch_links
      where user_id = ${context.userId}
      order by linked_at asc
    `;
    return rows.map(mapWatchLink);
  });

export const linkWatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => watchSourceSchema.parse(input))
  .handler(async ({ context, data: source }) => {
    await ensureWatchLink(context.userId, source);
    return { ok: true };
  });

export const unlinkWatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => watchSourceSchema.parse(input))
  .handler(async ({ context, data: source }) => {
    const sql = await getSql();
    await sql`
      delete from watch_links
      where user_id = ${context.userId} and source = ${source}
    `;
    if (source === "strava") {
      await sql`delete from strava_links where user_id = ${context.userId}`;
    }
    return { ok: true };
  });

export const importWatchWorkouts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ workouts: z.array(importWorkoutSchema).min(1).max(25) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await ensureProfile(context.userId);
    const spots = await loadSpots({});
    const sql = await getSql();
    const results: WatchImportResult[] = [];
    const addedBySource = new Map<string, number>();

    for (const w of data.workouts) {
      if (w.poolLike) {
        results.push({ key: w.key, status: "pool" });
        await logSyncEvent(context.userId, w.source, w.title, "pool", null);
        continue;
      }

      const dup = await sql<{ id: number }>`
        select id from swims
        where user_id = ${context.userId}
          and source = ${w.source}
          and source_key = ${w.key}
        limit 1
      `;
      if (dup[0]) {
        results.push({
          key: w.key,
          status: "duplicate",
          swimId: dup[0].id,
        });
        await logSyncEvent(context.userId, w.source, w.title, "duplicate", dup[0].id);
        continue;
      }

      let chosen = w.spotId ? spots.find((s) => s.id === w.spotId) : undefined;
      let kmAway: number | null = null;

      if (!chosen && w.lat != null && w.lng != null) {
        const near = nearestByKm(spots, w.lat, w.lng);
        if (near) {
          kmAway = Math.round(near.km * 10) / 10;
          if (near.km <= MATCH_KM) chosen = near.item;
        }
      }

      if (!chosen) {
        results.push({
          key: w.key,
          status: "needSpot",
          kmAway,
          spotName: null,
          spotSlug: null,
          spotId: null,
        });
        await logSyncEvent(context.userId, w.source, w.title, "needSpot", null);
        continue;
      }

      if (w.lat != null && w.lng != null) {
        kmAway = Math.round(haversineKm(chosen.lat, chosen.lng, w.lat, w.lng) * 10) / 10;
      }

      const durationMin = Math.max(1, Math.round(w.durationMin));
      const rows = await sql<{ id: number }>`
        insert into swims (
          user_id, spot_id, swam_on, distance_km, duration_min,
          water_temp_c, conditions, feeling, notes, source, source_key
        ) values (
          ${context.userId}, ${chosen.id}, ${w.swamOn}, ${w.distanceKm},
          ${durationMin}, ${w.waterTempC}, null, null, null,
          ${w.source}, ${w.key}
        )
        returning id
      `;
      results.push({
        key: w.key,
        status: "ok",
        swimId: rows[0]?.id ?? 0,
        spotId: chosen.id,
        spotName: chosen.name,
        spotSlug: chosen.slug,
        kmAway,
      });
      addedBySource.set(w.source, (addedBySource.get(w.source) ?? 0) + 1);
      await logSyncEvent(context.userId, w.source, w.title, "ok", rows[0]?.id ?? null);
    }

    const seen = new Set(data.workouts.map((w) => w.source));
    for (const source of seen) {
      await bumpWatchLink(context.userId, source, addedBySource.get(source) ?? 0);
    }

    return results;
  });

async function logSyncEvent(
  userId: string,
  source: string,
  title: string,
  status: string,
  swimId: number | null,
) {
  try {
    const sql = await getSql();
    await sql`
      insert into sync_events (user_id, source, title, status, swim_id)
      values (${userId}, ${source}, ${title}, ${status}, ${swimId})
    `;
  } catch {
    /* table may not exist until migrations catch up */
  }
}

export const listSyncEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    try {
      const sql = await getSql();
      const rows = await sql<{
        id: number;
        source: string;
        title: string;
        status: string;
        spot_name: string | null;
        created_at: unknown;
      }>`
      select
        e.id, e.source, e.title, e.status, e.created_at,
        s.name as spot_name
      from sync_events e
      left join swims w on w.id = e.swim_id
      left join spots s on s.id = w.spot_id
      where e.user_id = ${context.userId}
      order by e.created_at desc
      limit 40
    `;
      return rows.map(
        (row): SyncEvent => ({
          id: row.id,
          source: row.source,
          title: row.title,
          status: row.status,
          spotName: row.spot_name,
          createdAt: iso(row.created_at),
        }),
      );
    } catch {
      return [];
    }
  });

