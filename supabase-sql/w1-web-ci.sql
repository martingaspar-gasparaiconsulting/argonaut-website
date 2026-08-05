-- ============================================================
-- ARGONAUT OS · W1 · Webauftritt · CI-Speicher
-- EINE Zeile je Betrieb: Look (Farben/Schrift/Logo), Texte
-- (Firma/Claim/Story/Kernsätze), Kontakt und Pflicht-Impressum.
-- Grundstein für Website-Bauer (KI / KI+Editor / selbst) + Funnel.
-- Additiv · idempotent · NICHT destruktiv. RLS: nur der Eigentümer.
-- ============================================================

create table if not exists public.web_ci (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null unique,
  firma              text,
  slogan             text,
  ueber_uns          text,
  kernsaetze         text,
  logo_url           text,
  farbe_primaer      text,
  farbe_sekundaer    text,
  farbe_akzent       text,
  schrift            text,
  telefon            text,
  email              text,
  web                text,
  strasse            text,
  plz                text,
  ort                text,
  oeffnungszeiten    text,
  impressum_inhaber  text,
  impressum_ustid    text,
  impressum_register text,
  impressum_aufsicht text,
  erstellt_am        timestamptz not null default now(),
  aktualisiert_am    timestamptz not null default now()
);

create index if not exists web_ci_owner_idx on public.web_ci (owner_user_id);

alter table public.web_ci enable row level security;

-- RLS: nur der Chef sieht/pflegt seinen eigenen Auftritt.
drop policy if exists web_ci_select on public.web_ci;
create policy web_ci_select on public.web_ci
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

drop policy if exists web_ci_insert on public.web_ci;
create policy web_ci_insert on public.web_ci
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists web_ci_update on public.web_ci;
create policy web_ci_update on public.web_ci
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists web_ci_delete on public.web_ci;
create policy web_ci_delete on public.web_ci
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));
