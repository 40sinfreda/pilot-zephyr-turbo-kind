import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { MATCH_KM, nearestByKm } from "./geo";

export const STRAVA_CLIENT_ID = "274558";

type IntegrationRow = {
  client_id: string;
  client_secret: string;
};

type LinkRow = {
  user_id: string;
  athlete_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: unknown;
};

type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  start_date: string;
  start_date_local: string;
  start_latlng?: [number, number] | null;
};

async function requireOwner(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    select user_id from app_owners where id = 1 limit 1
  `;
  if (!rows[0] || rows[0].user_id !== userId) throw new Error("Forbidden");
  return sql;
}

export async function loadStravaApp() {
  const sql = await getSql();
  const rows = await sql<IntegrationRow>`
    select client_id, client_secret from app_integrations where provider = 'strava' limit 1
  `;
  const stored = rows[0];
  if (stored?.client_id && stored.client_secret) return stored;

  let fallbackSecret = "";
  try {
    const creds = await import("./strava-credentials.server");
    fallbackSecret = creds.STRAVA_CLIENT_SECRET;
  } catch {
    fallbackSecret = "";
  }
  const clientId = stored?.client_id || STRAVA_CLIENT_ID;
  const secret = stored?.client_secret || fallbackSecret;
  if (!clientId || !secret) {
    return clientId ? { client_id: clientId, client_secret: secret } : stored ?? null;
  }
  await sql`
    insert into app_integrations (provider, client_id, client_secret)
    values ('strava', ${clientId}, ${secret})
    on conflict (provider) do update set
      client_id = excluded.client_id,
      client_secret = excluded.client_secret,
      updated_at = now()
  `;
  return { client_id: clientId, client_secret: secret };
}

export async function loadStravaLink(userId: string) {
  const sql = await getSql();
  const rows = await sql<LinkRow>`
    select user_id, athlete_id, access_token, refresh_token, expires_at
    from strava_links where user_id = ${userId} limit 1
  `;
  return rows[0] ?? null;
}

export const getStravaStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const app = await loadStravaApp();
    const link = await loadStravaLink(context.userId);
    return {
      configured: Boolean(app?.client_id && app?.client_secret),
      connected: Boolean(link),
    };
  });

export const getStravaAppSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireOwner(context.userId);
    const app = await loadStravaApp();
    return {
      clientId: app?.client_id || STRAVA_CLIENT_ID,
      hasSecret: Boolean(app?.client_secret),
    };
  });

export const saveStravaApp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({
      clientId: z.string().trim().min(1).max(40),
      clientSecret: z.string().trim().max(80),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const sql = await requireOwner(context.userId);
    const existing = await loadStravaApp();
    const secret = data.clientSecret || existing?.client_secret;
    if (!secret) throw new Error("Need secret");
    await sql`
      insert into app_integrations (provider, client_id, client_secret)
      values ('strava', ${data.clientId}, ${secret})
      on conflict (provider) do update set
        client_id = excluded.client_id,
        client_secret = excluded.client_secret,
        updated_at = now()
    `;
    return { ok: true };
  });

export async function createOauthState(userId: string) {
  const sql = await getSql();
  const state = crypto.randomUUID();
  await sql`
    insert into strava_oauth_states (state, user_id)
    values (${state}, ${userId})
  `;
  return state;
}

export async function takeOauthState(state: string) {
  const sql = await getSql();
  const rows = await sql<{ user_id: string; created_at: unknown }>`
    select user_id, created_at from strava_oauth_states where state = ${state} limit 1
  `;
  await sql`delete from strava_oauth_states where state = ${state}`;
  const row = rows[0];
  if (!row) return null;
  const created = row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at));
  if (Number.isNaN(created.getTime()) || Date.now() - created.getTime() > 15 * 60 * 1000) return null;
  return row.user_id;
}

export async function exchangeStravaCode(code: string, redirectUri: string) {
  const app = await loadStravaApp();
  if (!app) throw new Error("not-configured");
  const body = new URLSearchParams({
    client_id: app.client_id,
    client_secret: app.client_secret,
    code,
    grant_type: "authorization_code",
  });
  // Strava also accepts redirect_uri on the token call
  body.set("redirect_uri", redirectUri);
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("token");
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete?: { id: number };
  };
}

async function accessTokenFor(userId: string): Promise<string | null> {
  const app = await loadStravaApp();
  const link = await loadStravaLink(userId);
  if (!app || !link) return null;
  const expires = link.expires_at instanceof Date ? link.expires_at : new Date(String(link.expires_at));
  if (expires.getTime() - 60_000 > Date.now()) return link.access_token;

  const body = new URLSearchParams({
    client_id: app.client_id,
    client_secret: app.client_secret,
    grant_type: "refresh_token",
    refresh_token: link.refresh_token,
  });
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  const sql = await getSql();
  await sql`
    update strava_links
    set access_token = ${json.access_token},
        refresh_token = ${json.refresh_token},
        expires_at = ${new Date(json.expires_at * 1000).toISOString()}
    where user_id = ${userId}
  `;
  return json.access_token;
}

export async function saveStravaLink(
  userId: string,
  token: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete?: { id: number };
  },
) {
  const sql = await getSql();
  const athleteId = String(token.athlete?.id ?? "0");
  await sql`
    insert into strava_links (user_id, athlete_id, access_token, refresh_token, expires_at)
    values (
      ${userId}, ${athleteId}, ${token.access_token}, ${token.refresh_token},
      ${new Date(token.expires_at * 1000).toISOString()}
    )
    on conflict (user_id) do update set
      athlete_id = excluded.athlete_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at
  `;
  await sql`
    insert into watch_links (user_id, source)
    values (${userId}, 'strava')
    on conflict (user_id, source) do nothing
  `;
}

function isOpenWater(a: StravaActivity) {
  const sport = `${a.sport_type ?? ""} ${a.type ?? ""}`.toLowerCase();
  if (sport.includes("openwaterswim") || sport.includes("open_water") || sport.includes("open water")) {
    return true;
  }
  if (!sport.includes("swim")) return false;
  return Array.isArray(a.start_latlng) && a.start_latlng.length === 2;
}

function ymd(iso: string) {
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date(iso).toISOString().slice(0, 10);
}

async function loadAllSpots() {
  const sql = await getSql();
  return sql<{ id: number; slug: string; name: string; lat: number; lng: number }>`
    select id, slug, name, lat, lng from spots
  `;
}

export async function importStravaActivities(userId: string): Promise<{ ok: number; skipped: number }> {
  const token = await accessTokenFor(userId);
  if (!token) return { ok: 0, skipped: 0 };
  const res = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=50", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("activities");
  const activities = (await res.json()) as StravaActivity[];
  const swims = activities.filter(isOpenWater).slice(0, 40);
  const spots = await loadAllSpots();
  const sql = await getSql();
  let ok = 0;
  let skipped = 0;

  for (const a of swims) {
    const key = `strava:${a.id}`;
    const dup = await sql<{ id: number }>`
      select id from swims
      where user_id = ${userId} and source = 'strava' and source_key = ${key}
      limit 1
    `;
    if (dup[0]) {
      skipped += 1;
      continue;
    }
    const lat = a.start_latlng?.[0] ?? null;
    const lng = a.start_latlng?.[1] ?? null;
    let chosen: { id: number; slug: string; name: string; lat: number; lng: number } | undefined;
    if (lat != null && lng != null) {
      const near = nearestByKm(spots, lat, lng);
      if (near && near.km <= MATCH_KM) chosen = near.item;
    }
    if (!chosen) {
      skipped += 1;
      await sql`
        insert into sync_events (user_id, source, title, status, swim_id)
        values (${userId}, 'strava', ${a.name || "Strava swim"}, 'needSpot', null)
      `;
      continue;
    }
    const distanceKm = Math.round((a.distance / 1000) * 1000) / 1000;
    if (distanceKm < 0.1) {
      skipped += 1;
      continue;
    }
    const durationMin = Math.max(1, Math.round((a.moving_time || a.elapsed_time || 0) / 60));
    const swamOn = ymd(a.start_date_local || a.start_date);
    const rows = await sql<{ id: number }>`
      insert into swims (
        user_id, spot_id, swam_on, distance_km, duration_min,
        water_temp_c, conditions, feeling, notes, source, source_key
      ) values (
        ${userId}, ${chosen.id}, ${swamOn}, ${distanceKm},
        ${durationMin}, null, null, null, null, 'strava', ${key}
      )
      returning id
    `;
    await sql`
      insert into sync_events (user_id, source, title, status, swim_id)
      values (${userId}, 'strava', ${a.name || chosen.name}, 'ok', ${rows[0]?.id ?? null})
    `;
    ok += 1;
  }

  await sql`
    update watch_links
    set last_import_at = now(), import_count = import_count + ${ok}
    where user_id = ${userId} and source = 'strava'
  `;
  return { ok, skipped };
}

export const pullStravaSwims = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => importStravaActivities(context.userId));

export const disconnectStrava = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`delete from strava_links where user_id = ${context.userId}`;
    await sql`delete from watch_links where user_id = ${context.userId} and source = 'strava'`;
    return { ok: true };
  });

export function publicOrigin(request: Request) {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}
