import { importWatchWorkouts } from "./api";
import type { ParsedWorkout } from "./workout-file";
import type { WatchImportResult } from "./types";

export function toImportPayload(w: ParsedWorkout, spotId: number | null = null) {
  return {
    source: w.source,
    key: w.key,
    title: w.title,
    swamOn: w.swamOn,
    distanceKm: w.distanceKm,
    durationMin: w.durationMin,
    waterTempC: w.waterTempC,
    lat: w.lat,
    lng: w.lng,
    poolLike: w.poolLike,
    spotId,
  };
}

export async function commitWorkouts(
  workouts: Array<ParsedWorkout & { spotId?: number | null }>,
): Promise<WatchImportResult[]> {
  const ready = workouts.filter((w) => !w.poolLike).slice(0, 40);
  if (!ready.length) return [];
  return importWatchWorkouts({
    data: {
      workouts: ready.map((w) => toImportPayload(w, w.spotId ?? null)),
    },
  });
}
