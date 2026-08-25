export const REGIONS = [
  "Europe",
  "Americas",
  "Asia-Pacific",
  "Middle East",
  "Africa",
] as const;

export const WATER_TYPES = ["sea", "ocean", "lake", "river"] as const;
export const DIFFICULTIES = ["gentle", "moderate", "challenging", "extreme"] as const;
export const CONDITIONS = ["glass", "chop", "swell", "wind"] as const;
export const FEELINGS = ["euphoric", "solid", "worked", "epic"] as const;

export type Region = (typeof REGIONS)[number];
export type WaterType = (typeof WATER_TYPES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];

export type Spot = {
  id: number;
  slug: string;
  name: string;
  city: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  waterType: string;
  difficulty: string;
  typicalTempC: number | null;
  typicalKm: number | null;
  hazards: string;
  bestSeason: string;
  description: string;
  swimCount: number;
  createdBy?: string | null;
  saved?: boolean;
};

export type Swim = {
  id: number;
  userId: string;
  swimmerName: string;
  spotId: number;
  spotName: string;
  spotSlug: string;
  city: string;
  country: string;
  swamOn: string;
  distanceKm: number;
  durationMin: number | null;
  waterTempC: number | null;
  conditions: string | null;
  feeling: string | null;
  notes: string | null;
  createdAt: string;
  source?: string;
};

export type Dispatch = {
  id: number;
  title: string;
  body: string;
  kind: string;
  locationLabel: string | null;
  spotSlug: string | null;
  spotName: string | null;
  publishedAt: string;
};

export type Gathering = {
  id: number;
  spotId: number;
  spotName: string;
  spotSlug: string;
  city: string;
  country: string;
  title: string;
  startsAt: string;
  distanceKm: number | null;
  organizer: string;
  notes: string | null;
  rsvpCount: number;
  going: boolean;
};

export type Report = {
  id: number;
  swimmerName: string;
  waterTempC: number | null;
  visibility: string | null;
  wildlife: string | null;
  notes: string;
  createdAt: string;
};

export type Profile = {
  userId: string;
  displayName: string;
  homeWater: string | null;
  bio: string | null;
  stroke: string | null;
  country: string | null;
  locale: string | null;
  placeScope: string | null;
};

export type Stats = {
  spots: number;
  gatherings: number;
  groups: number;
  stories: number;
};

export type FeedItem =
  | { kind: "swim"; swim: Swim }
  | { kind: "dispatch"; dispatch: Dispatch };

export type MyStats = {
  swimCount: number;
  totalKm: number;
  uniqueSpots: number;
  longestKm: number;
};

export type Club = {
  id: number;
  slug: string;
  name: string;
  country: string;
  region: string;
  spotId: number | null;
  spotName: string | null;
  spotSlug: string | null;
  description: string;
  memberCount: number;
  isMember: boolean;
  isAdmin: boolean;
  whatsappUrl: string | null;
  adminName: string;
};

export type ClubMember = {
  userId: string;
  displayName: string;
  joinedAt: string;
  isAdmin: boolean;
};

export type WatchLink = {
  source: string;
  linkedAt: string;
  lastImportAt: string | null;
  importCount: number;
};

export type WatchImportResult = {
  key: string;
  status: "ok" | "duplicate" | "pool" | "needSpot";
  swimId?: number;
  spotId?: number | null;
  spotName?: string | null;
  spotSlug?: string | null;
  kmAway?: number | null;
};

export type SyncEvent = {
  id: number;
  source: string;
  title: string;
  status: string;
  spotName: string | null;
  createdAt: string;
};

