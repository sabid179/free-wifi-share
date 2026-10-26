create extension if not exists pgcrypto;

create table if not exists public.wifis (
  id          uuid primary key default gen_random_uuid(),
  ssid        text not null check (char_length(ssid) between 1 and 60),
  password    text not null check (char_length(password) between 1 and 80),
  place       text not null check (char_length(place) between 1 and 80),
  address     text check (address is null or char_length(address) <= 200),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  works       integer not null default 0,
  fails       integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists wifis_geo_idx on public.wifis (lat, lng);

alter table public.wifis enable row level security;

drop policy if exists "wifis_read" on public.wifis;
create policy "wifis_read" on public.wifis for select using (true);

drop policy if exists "wifis_insert" on public.wifis;
create policy "wifis_insert" on public.wifis for insert
  with check (works = 0 and fails = 0);


create or replace function public.vote_wifi(p_id uuid, p_ok boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ok then
    update public.wifis set works = works + 1 where id = p_id;
  else
    update public.wifis set fails = fails + 1 where id = p_id;
  end if;
end;
$$;

revoke all on function public.vote_wifi(uuid, boolean) from public;
grant execute on function public.vote_wifi(uuid, boolean) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.wifis;
exception when duplicate_object then null;
end $$;
