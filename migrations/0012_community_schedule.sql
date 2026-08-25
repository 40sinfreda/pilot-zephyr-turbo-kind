-- Group weekly schedule, multi-beach links, covers, gathering notes

alter table spots add column if not exists cover_image text;
alter table clubs add column if not exists cover_image text;
alter table clubs add column if not exists schedule_note text;

alter table events add column if not exists club_id integer references clubs(id) on delete set null;
alter table events add column if not exists cover_image text;
create index if not exists events_club_id_idx on events (club_id);

create table if not exists club_spots (
  club_id integer not null references clubs(id) on delete cascade,
  spot_id integer not null references spots(id) on delete cascade,
  primary key (club_id, spot_id)
);

create table if not exists club_schedules (
  id serial primary key,
  club_id integer not null references clubs(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time text not null,
  end_time text not null,
  unique (club_id, day_of_week, start_time, end_time)
);
create index if not exists club_schedules_club_id_idx on club_schedules (club_id);

create table if not exists gathering_notes (
  id serial primary key,
  event_id integer not null references events(id) on delete cascade,
  user_id text not null,
  body text not null,
  image_url text,
  created_at timestamptz not null default now()
);
create index if not exists gathering_notes_event_id_idx on gathering_notes (event_id);

insert into club_spots (club_id, spot_id)
select id, spot_id from clubs where spot_id is not null
on conflict do nothing;
