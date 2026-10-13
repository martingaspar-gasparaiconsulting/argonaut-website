-- ARGONAUT Pruef-Datenbank: Platzhalter fuer Supabase (nur fuer Tests im Claude-Container, nie live einspielen)
-- Rollen legt claude-start.sh einmal je Cluster an.
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create table public.ma_stub(user_id uuid primary key, chef uuid, sehen text[] default '{}', aendern text[] default '{}');
grant select on public.ma_stub to authenticated, anon;
create function public.mein_chef_id() returns uuid language sql stable security definer as $$ select chef from public.ma_stub where user_id = auth.uid() $$;
create function public.darf_ich_modul_sehen(m text) returns boolean language sql stable security definer as $$ select coalesce((select m = any(sehen) from public.ma_stub where user_id = auth.uid()), false) $$;
create function public.darf_ich_modul_aendern(m text) returns boolean language sql stable security definer as $$ select coalesce((select m = any(aendern) from public.ma_stub where user_id = auth.uid()), false) $$;
create table public.mitarbeiter(id uuid primary key default gen_random_uuid(), owner_user_id uuid, auth_user_id uuid, vorname text, nachname text, status text);
create table public.leads(id uuid primary key default gen_random_uuid(), owner_user_id uuid not null, name text);
create table public.crm_deal(id uuid primary key default gen_random_uuid(), owner_user_id uuid not null, titel text, stufe text, wert_netto numeric, wahrscheinlichkeit numeric, erstellt_am timestamptz default now(), provision_prozent numeric);
alter table public.crm_deal enable row level security;
create policy owner_all on public.crm_deal for all to authenticated using (auth.uid()=owner_user_id) with check (auth.uid()=owner_user_id);
create policy ma_all on public.crm_deal for all to authenticated using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('pipeline')) with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('pipeline'));
alter table public.leads add column if not exists telefon text, add column if not exists created_at timestamptz default now(), add column if not exists stufe text, add column if not exists status text;
create table public.kontakte(id uuid primary key default gen_random_uuid(), owner_user_id uuid not null, vorname text, telefon text, letzter_kontakt_am timestamptz, naechster_kontakt_am timestamptz);
create table public.vertrieb_aktivitaet(id uuid primary key default gen_random_uuid(), owner_user_id uuid, mitarbeiter_id uuid, art text, ergebnis text, notiz text, standort_id uuid, erstellt_am timestamptz default now());
