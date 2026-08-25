import { unzipSync, gunzipSync } from "fflate";
import { haversineKm } from "./geo";

export const WATCH_SOURCES = ["garmin", "suunto", "samsung", "apple", "strava"] as const;
export type WatchSource = (typeof WATCH_SOURCES)[number];

export type ParsedWorkout = {
  fileName: string;
  source: WatchSource;
  key: string;
  title: string;
  swamOn: string;
  startedAt: string;
  distanceKm: number;
  durationMin: number;
  waterTempC: number | null;
  lat: number | null;
  lng: number | null;
  pointCount: number;
  sport: string;
  openWater: boolean;
  poolLike: boolean;
};

const FIT_EPOCH = Date.UTC(1989, 11, 31);

function sourceFromName(name: string, fallback: WatchSource): WatchSource {
  const n = name.toLowerCase();
  if (/(strava)/.test(n)) return "strava";
  if (/(garmin|fenix|forerunner|instinct|enduro|connect)/.test(n)) return "garmin";
  if (/(suunto|ambit|spartan|vertical|ocean)/.test(n)) return "suunto";
  if (/(samsung|galaxy|shealth|health-connect)/.test(n)) return "samsung";
  if (/(apple|iphone|watch-os|healthfit|workoutdoors|fitness)/.test(n)) return "apple";
  return fallback;
}

function isSwimType(value: string): boolean {
  const v = value.toLowerCase();
  if (!v) return false;
  if (/pool|lap/.test(v) && !/open/.test(v)) return false;
  return /swim|open.?water|openwater/.test(v);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function workoutKey(source: WatchSource, swamOn: string, km: number, min: number, name: string) {
  const raw = `${source}|${swamOn}|${km.toFixed(3)}|${min}|${name}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function pathStats(points: { lat: number; lng: number }[]) {
  if (!points.length) {
    return { km: 0, lat: null as number | null, lng: null as number | null, boxM: 0 };
  }
  let km = 0;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (let i = 1; i < points.length; i++) {
    km += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    minLat = Math.min(minLat, points[i].lat);
    maxLat = Math.max(maxLat, points[i].lat);
    minLng = Math.min(minLng, points[i].lng);
    maxLng = Math.max(maxLng, points[i].lng);
  }
  const boxM = haversineKm(minLat, minLng, maxLat, maxLng) * 1000;
  return { km, lat: points[0].lat, lng: points[0].lng, boxM };
}

function finish(partial: {
  fileName: string;
  source: WatchSource;
  startedAt: Date;
  distanceKm: number;
  durationMin: number;
  waterTempC: number | null;
  points: { lat: number; lng: number }[];
  sport: string;
  subSport?: string;
  title?: string;
}): ParsedWorkout {
  const stats = pathStats(partial.points);
  const distanceKm = partial.distanceKm > 0.05 ? partial.distanceKm : stats.km;
  const durationMin = Math.max(1, Math.round(partial.durationMin));
  const sport = (partial.sport || "swim").toLowerCase();
  const sub = (partial.subSport || "").toLowerCase();
  const poolLike =
    sub.includes("lap") ||
    sub.includes("pool") ||
    /\bpool\b|בריכה/.test(partial.fileName.toLowerCase()) ||
    (stats.boxM > 0 && stats.boxM < 80 && distanceKm > 0.4);
  const openWater =
    !poolLike &&
    (sub.includes("open") ||
      sport.includes("swim") ||
      sport === "open_water" ||
      sport === "generic" ||
      sport === "" ||
      distanceKm >= 0.3);
  return {
    fileName: partial.fileName,
    source: partial.source,
    key: workoutKey(partial.source, ymd(partial.startedAt), distanceKm, durationMin, partial.fileName),
    title:
      (partial.title || "").trim() ||
      partial.fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "),
    swamOn: ymd(partial.startedAt),
    startedAt: partial.startedAt.toISOString(),
    distanceKm: Math.round(distanceKm * 1000) / 1000,
    durationMin,
    waterTempC: partial.waterTempC,
    lat: stats.lat,
    lng: stats.lng,
    pointCount: partial.points.length,
    sport: sport || "swim",
    openWater,
    poolLike,
  };
}

function parseGpx(text: string, fileName: string, source: WatchSource): ParsedWorkout[] {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("bad-gpx");
  const trkpts = [
    ...xml.getElementsByTagName("trkpt"),
    ...xml.getElementsByTagName("wpt"),
  ];
  const points: { lat: number; lng: number; t?: Date }[] = [];
  for (const el of trkpts) {
    const lat = Number(el.getAttribute("lat"));
    const lng = Number(el.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const timeEl = el.getElementsByTagName("time")[0];
    const t = timeEl?.textContent ? new Date(timeEl.textContent) : undefined;
    points.push({ lat, lng, t });
  }
  if (points.length < 2) throw new Error("empty");
  const times = points.map((p) => p.t).filter((t): t is Date => Boolean(t && !Number.isNaN(t.getTime())));
  const start = times[0] ?? new Date();
  const end = times[times.length - 1] ?? start;
  const durationMin = Math.max(1, (end.getTime() - start.getTime()) / 60000);
  const nameEl =
    xml.querySelector("metadata > name") ||
    xml.querySelector("trk > name") ||
    xml.getElementsByTagName("name")[0];
  return [
    finish({
      fileName,
      source,
      startedAt: start,
      distanceKm: 0,
      durationMin,
      waterTempC: null,
      points,
      sport: "swim",
      subSport: "open_water",
      title: nameEl?.textContent ?? undefined,
    }),
  ];
}

function parseTcx(text: string, fileName: string, source: WatchSource): ParsedWorkout[] {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("bad-tcx");
  const activities = [...xml.getElementsByTagName("Activity")];
  const out: ParsedWorkout[] = [];
  const blocks = activities.length ? activities : [xml.documentElement];
  for (const act of blocks) {
    const sport = act.getAttribute?.("Sport") || "Swim";
    const points: { lat: number; lng: number }[] = [];
    const lats = act.getElementsByTagName("LatitudeDegrees");
    const lngs = act.getElementsByTagName("LongitudeDegrees");
    const n = Math.min(lats.length, lngs.length);
    for (let i = 0; i < n; i++) {
      const lat = Number(lats[i].textContent);
      const lng = Number(lngs[i].textContent);
      if (Number.isFinite(lat) && Number.isFinite(lng)) points.push({ lat, lng });
    }
    const idEl = act.getElementsByTagName("Id")[0] || act.getElementsByTagName("StartTime")[0];
    const start = idEl?.textContent ? new Date(idEl.textContent) : new Date();
    const distEl = act.getElementsByTagName("DistanceMeters")[0];
    const timeEl = act.getElementsByTagName("TotalTimeSeconds")[0];
    const distM = distEl ? Number(distEl.textContent) : 0;
    const sec = timeEl ? Number(timeEl.textContent) : 0;
    out.push(
      finish({
        fileName,
        source,
        startedAt: Number.isNaN(start.getTime()) ? new Date() : start,
        distanceKm: Number.isFinite(distM) ? distM / 1000 : 0,
        durationMin: Number.isFinite(sec) ? sec / 60 : 0,
        waterTempC: null,
        points,
        sport,
        subSport: /pool/i.test(sport) ? "lap_swimming" : "open_water",
      }),
    );
  }
  if (!out.length) throw new Error("empty");
  return out;
}

function readUInt(view: DataView, offset: number, size: number, little: boolean) {
  if (size === 1) return view.getUint8(offset);
  if (size === 2) return little ? view.getUint16(offset, true) : view.getUint16(offset, false);
  if (size === 4) return little ? view.getUint32(offset, true) : view.getUint32(offset, false);
  return 0;
}

function readInt(view: DataView, offset: number, size: number, little: boolean) {
  if (size === 1) return view.getInt8(offset);
  if (size === 2) return little ? view.getInt16(offset, true) : view.getInt16(offset, false);
  if (size === 4) return little ? view.getInt32(offset, true) : view.getInt32(offset, false);
  return 0;
}

function semicirclesToDeg(n: number) {
  return n * (180 / 2147483648);
}

function fitDate(seconds: number) {
  return new Date(FIT_EPOCH + seconds * 1000);
}

const SPORT_NAME: Record<number, string> = {
  0: "generic",
  5: "swim",
  15: "fitness",
};
const SUB_SPORT_NAME: Record<number, string> = {
  0: "generic",
  17: "lap_swimming",
  18: "open_water",
};

function parseFit(buf: ArrayBuffer, fileName: string, source: WatchSource): ParsedWorkout[] {
  const view = new DataView(buf);
  if (view.byteLength < 14) throw new Error("bad-fit");
  const headerSize = view.getUint8(0);
  const dataSize = view.getUint32(4, true);
  const tag = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (tag !== ".FIT") throw new Error("bad-fit");
  const start = headerSize;
  const end = Math.min(view.byteLength - 2, start + dataSize);
  type Field = { num: number; size: number; base: number };
  type Def = { little: boolean; global: number; fields: Field[] };
  const defs = new Map<number, Def>();
  let offset = start;
  let sport = "swim";
  let subSport = "open_water";
  let startTime: Date | null = null;
  let totalDistanceM = 0;
  let totalTimerS = 0;
  let temp: number | null = null;
  const points: { lat: number; lng: number }[] = [];

  while (offset < end) {
    const header = view.getUint8(offset);
    offset += 1;
    if (header & 0x80) continue;
    const local = header & 0x0f;
    if (header & 0x40) {
      if (offset + 5 > end) break;
      offset += 1;
      const little = view.getUint8(offset) === 0;
      offset += 1;
      const global = readUInt(view, offset, 2, little);
      offset += 2;
      const fieldCount = view.getUint8(offset);
      offset += 1;
      const fields: Field[] = [];
      for (let i = 0; i < fieldCount; i++) {
        if (offset + 3 > end) break;
        fields.push({
          num: view.getUint8(offset),
          size: view.getUint8(offset + 1),
          base: view.getUint8(offset + 2),
        });
        offset += 3;
      }
      if (header & 0x20) {
        if (offset >= end) break;
        const devCount = view.getUint8(offset);
        offset += 1;
        offset += devCount * 3;
      }
      defs.set(local, { little, global, fields });
      continue;
    }
    const def = defs.get(local);
    if (!def) break;
    const rec: Record<number, number> = {};
    let recOk = true;
    for (const f of def.fields) {
      if (offset + f.size > end) {
        recOk = false;
        break;
      }
      const unsigned = (f.base & 0x07) === 0x02 || (f.base & 0x07) === 0x04 || f.base === 0x86 || f.base === 0x84;
      const val = unsigned
        ? readUInt(view, offset, Math.min(f.size, 4), def.little)
        : readInt(view, offset, Math.min(f.size, 4), def.little);
      rec[f.num] = val;
      offset += f.size;
    }
    if (!recOk) break;
    if (def.global === 18 || def.global === 19) {
      if (typeof rec[5] === "number" && rec[5] !== 0xff) sport = SPORT_NAME[rec[5]] ?? sport;
      if (typeof rec[6] === "number" && rec[6] !== 0xff) subSport = SUB_SPORT_NAME[rec[6]] ?? subSport;
      if (typeof rec[253] === "number" && rec[253] !== 0xffffffff) startTime = fitDate(rec[253]);
      if (typeof rec[9] === "number" && rec[9] !== 0xffffffff) totalDistanceM = rec[9] / 100;
      if (typeof rec[8] === "number" && rec[8] !== 0xffffffff) totalTimerS = rec[8] / 1000;
      if (typeof rec[14] === "number" && rec[14] !== 0x7f) temp = rec[14];
      if (typeof rec[3] === "number" && rec[3] !== 0x7fffffff) {
        const lat = semicirclesToDeg(rec[3]);
        const lng = typeof rec[4] === "number" ? semicirclesToDeg(rec[4]) : 0;
        if (Math.abs(lat) <= 90) points.unshift({ lat, lng });
      }
    }
    if (def.global === 20) {
      if (typeof rec[0] === "number" && rec[0] !== 0x7fffffff && typeof rec[1] === "number") {
        const lat = semicirclesToDeg(rec[0]);
        const lng = semicirclesToDeg(rec[1]);
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) points.push({ lat, lng });
      }
      if (temp == null && typeof rec[13] === "number" && rec[13] !== 0x7f) temp = rec[13];
    }
  }

  if (!startTime) startTime = new Date();
  if (totalDistanceM <= 0 && points.length < 2) throw new Error("empty");
  return [
    finish({
      fileName,
      source,
      startedAt: startTime,
      distanceKm: totalDistanceM / 1000,
      durationMin: totalTimerS / 60,
      waterTempC: temp,
      points,
      sport,
      subSport,
    }),
  ];
}

function parseJson(text: string, fileName: string, source: WatchSource): ParsedWorkout[] {
  const data = JSON.parse(text) as Record<string, unknown> | unknown[];
  const rows = Array.isArray(data) ? data : [data];
  const out: ParsedWorkout[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const type = String(
      row.workoutActivityType ?? row.exerciseType ?? row.sport ?? row.type ?? "swim",
    ).toLowerCase();
    if (type && !/swim|open.?water|surfing|unknown/.test(type) && type !== "other") continue;
    const startRaw = row.startDate ?? row.startTime ?? row.start_time ?? row.beginDate;
    const start =
      typeof startRaw === "number"
        ? new Date(startRaw > 10_000_000_000 ? startRaw : startRaw * 1000)
        : startRaw
          ? new Date(String(startRaw))
          : new Date();
    const distRaw = Number(row.totalDistance ?? row.distance ?? row.distanceMeter ?? row.distance_m ?? 0);
    const distanceKm = distRaw > 100 ? distRaw / 1000 : distRaw;
    const durRaw = Number(row.duration ?? row.durationMin ?? row.elapsed ?? 0);
    const durationMin = durRaw > 200 ? durRaw / 60000 : durRaw > 50 ? durRaw / 60 : durRaw;
    const lat = Number(row.latitude ?? row.lat ?? row.startLatitude);
    const lng = Number(row.longitude ?? row.lng ?? row.startLongitude);
    const points =
      Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng }] : [];
    out.push(
      finish({
        fileName,
        source,
        startedAt: Number.isNaN(start.getTime()) ? new Date() : start,
        distanceKm,
        durationMin,
        waterTempC: null,
        points,
        sport: type,
        subSport: /pool/.test(type) ? "lap_swimming" : "open_water",
      }),
    );
  }
  if (!out.length) throw new Error("empty");
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (c === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(text: string, fileName: string, source: WatchSource): ParsedWorkout[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("empty");
  const head = splitCsvLine(lines[0]).map((s) => s.trim().toLowerCase());
  const typeI = head.findIndex((h) => h === "activity type" || h === "type" || h === "sport");
  const nameI = head.findIndex((h) => h === "activity name" || h === "name" || h === "title");
  const distI = head.findIndex((h) => h.includes("distance"));
  const timeI = head.findIndex((h) => h === "elapsed time" || h.includes("duration") || h.includes("time"));
  const dateI = head.findIndex((h) => h.includes("date") || h.includes("start"));
  const fileI = head.findIndex((h) => h === "filename" || h === "file name");
  if (distI < 0) throw new Error("empty");
  const out: ParsedWorkout[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const type = typeI >= 0 ? cols[typeI] ?? "" : "swim";
    if (typeI >= 0 && !isSwimType(type)) continue;
    const dist = Number((cols[distI] ?? "").replace(/[^\d.]/g, ""));
    const durRaw = timeI >= 0 ? Number((cols[timeI] ?? "").replace(/[^\d.]/g, "")) : 40;
    const start = dateI >= 0 ? new Date(cols[dateI] ?? "") : new Date();
    if (!Number.isFinite(dist) || dist <= 0) continue;
    const durationMin = durRaw > 200 ? durRaw / 60 : durRaw;
    const title = nameI >= 0 ? cols[nameI] : undefined;
    const track = fileI >= 0 ? cols[fileI] : "";
    out.push(
      finish({
        fileName: track || fileName,
        source,
        startedAt: Number.isNaN(start.getTime()) ? new Date() : start,
        distanceKm: dist > 100 ? dist / 1000 : dist,
        durationMin,
        waterTempC: null,
        points: [],
        sport: type || "swim",
        subSport: /open/.test(type.toLowerCase()) ? "open_water" : type.toLowerCase().includes("pool") ? "lap_swimming" : "open_water",
        title,
      }),
    );
  }
  if (!out.length) throw new Error("empty");
  return out;
}

function asFile(name: string, bytes: Uint8Array): File {
  const leaf = name.split("/").pop() ?? name;
  return new File([bytes as BlobPart], leaf);
}

function maybeGunzip(name: string, bytes: Uint8Array): { name: string; bytes: Uint8Array } {
  if (!name.toLowerCase().endsWith(".gz")) return { name, bytes };
  return {
    name: name.slice(0, -3),
    bytes: gunzipSync(bytes),
  };
}

async function parseZipArchive(file: File, preferred: WatchSource): Promise<ParsedWorkout[]> {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const names = Object.keys(entries).filter((n) => !n.startsWith("__MACOSX") && !n.endsWith("/"));
  const looksStrava =
    preferred === "strava" ||
    /strava/i.test(file.name) ||
    names.some((n) => /(^|\/)activities\.csv$/i.test(n));
  const source: WatchSource = looksStrava ? "strava" : sourceFromName(file.name, preferred);

  const csvName = names.find((n) => /(^|\/)activities\.csv$/i.test(n));
  const swimFiles = new Set<string>();
  if (csvName) {
    const csvText = new TextDecoder().decode(entries[csvName]);
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length >= 2) {
      const head = splitCsvLine(lines[0]).map((s) => s.trim().toLowerCase());
      const typeI = head.findIndex((h) => h === "activity type" || h === "type");
      const fileI = head.findIndex((h) => h === "filename" || h === "file name");
      if (typeI >= 0 && fileI >= 0) {
        for (const line of lines.slice(1)) {
          const cols = splitCsvLine(line);
          if (!isSwimType(cols[typeI] ?? "")) continue;
          const rel = (cols[fileI] ?? "").replace(/^\.\//, "");
          if (rel) {
            swimFiles.add(rel);
            swimFiles.add(rel.replace(/\.gz$/i, ""));
          }
        }
      }
    }
  }

  const out: ParsedWorkout[] = [];
  const trackNames = names.filter((n) => /\.(gpx|tcx|fit)(\.gz)?$/i.test(n));
  for (const n of trackNames) {
    const leaf = n.split("/").pop() ?? n;
    const wanted =
      swimFiles.size > 0
        ? [...swimFiles].some((f) => n.endsWith(f) || f.endsWith(leaf) || n.includes(f))
        : !looksStrava || /swim|open.?water|owsw/i.test(n);
    if (swimFiles.size && !wanted) continue;
    try {
      const unpacked = maybeGunzip(n, entries[n]);
      out.push(...(await parseBytes(unpacked.name, unpacked.bytes, source)));
    } catch {
      /* skip non-swims */
    }
  }
  if (!out.length && csvName) {
    try {
      out.push(...parseCsv(new TextDecoder().decode(entries[csvName]), csvName, source));
    } catch {
      /* empty csv */
    }
  }
  if (!out.length) throw new Error("empty");
  return out;
}

async function parseBytes(name: string, bytes: Uint8Array, source: WatchSource): Promise<ParsedWorkout[]> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".fit")) {
    const copy = bytes.slice();
    return parseFit(copy.buffer as ArrayBuffer, name, source);
  }
  const text = new TextDecoder().decode(bytes);
  return parseText(name, text, source);
}

async function parseText(name: string, text: string, source: WatchSource): Promise<ParsedWorkout[]> {
  const lower = name.toLowerCase();
  const trimmed = text.trim();
  if (lower.endsWith(".gpx") || trimmed.startsWith("<gpx") || trimmed.includes("<gpx")) {
    return parseGpx(text, name, source);
  }
  if (lower.endsWith(".tcx") || trimmed.includes("TrainingCenterDatabase")) {
    return parseTcx(text, name, source);
  }
  if (lower.endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJson(text, name, source);
  }
  if (lower.endsWith(".csv")) {
    return parseCsv(text, name, source);
  }
  if (trimmed.startsWith("<")) {
    try {
      return parseGpx(text, name, source);
    } catch {
      return parseTcx(text, name, source);
    }
  }
  throw new Error("unsupported");
}

export async function parseWorkoutFile(
  file: File,
  preferred: WatchSource,
): Promise<ParsedWorkout[]> {
  const source = sourceFromName(file.name, preferred);
  const name = file.name;
  const lower = name.toLowerCase();
  if (lower.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
    return parseZipArchive(file, preferred);
  }
  if (lower.endsWith(".gz")) {
    const unpacked = maybeGunzip(name, new Uint8Array(await file.arrayBuffer()));
    return parseBytes(unpacked.name, unpacked.bytes, source);
  }
  if (lower.endsWith(".fit")) {
    return parseFit(await file.arrayBuffer(), name, source);
  }
  return parseText(name, await file.text(), source);
}
