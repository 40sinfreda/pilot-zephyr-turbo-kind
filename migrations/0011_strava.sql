-- Strava OAuth for one-click swim import

create table if not exists app_integrations (
  provider text primary key,
  client_id text not null,
  client_secret text not null,
  updated_at timestamptz not null default now()
);

create table if not exists strava_links (
  user_id text primary key,
  athlete_id text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now()
);

create table if not exists strava_oauth_states (
  state text primary key,
  user_id text not null,
  created_at timestamptz not null default now()
);
