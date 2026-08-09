-- ============================================================
-- ARGONAUT OS · Multistandort · Personal-Entsendung (Block D)
-- Eine Person zeitlich begrenzt (Stunden/Tag/Monat/offen) in eine ANDERE
-- Filiale schicken, damit Arbeitszeit & Kosten für den Zeitraum dort landen
-- statt dauerhaft auf der Heimat-Kostenstelle.
--
-- Heimat-Filiale bleibt mitarbeiter.standort_id (unverändert). Diese Tabelle
-- ist rein additiv: KEIN Bestand wird umgeschrieben, nichts verschwindet.
-- Der Filialvergleich/das Controlling wertet personal_entsendung über den
-- Zeitraum aus und rechnet die Person der Ziel-Filiale zu (Andockpunkt).
--
-- Additiv · idempotent · NICHT destruktiv. RLS spiegelt das Bestandsmuster
-- (standorte): Chef pflegt eigene, Mitarbeiter liest die des Chefs (mein_chef_id()).
-- ============================================================

create table if not exists public.personal_entsendung (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null,
  mitarbeiter_id   uuid not null references public.mitarbeiter(id) on delete cascade,
  ziel_standort_id uuid not null references public.standorte(id)   on delete cascade,
  von_datum        date not null,
  bis_datum        date,               -- NULL = offen / unbefristet
  grund            text,
  erstellt_am      timestamptz not null default now()
);

create index if not exists personal_entsendung_owner_idx
  on public.personal_entsendung (owner_user_id);
create index if not exists personal_entsendung_ma_idx
  on public.personal_entsendung (mitarbeiter_id);
-- Für die Gast-Abfrage der Ziel-Filiale (ziel + laufender Zeitraum):
create index if not exists personal_entsendung_ziel_zeit_idx
  on public.personal_entsendung (ziel_standort_id, von_datum);

alter table public.personal_entsendung enable row level security;

-- Chef sieht/pflegt seine eigenen Entsendungen.
drop policy if exists personal_entsendung_select on public.personal_entsendung;
create policy personal_entsendung_select on public.personal_entsendung
  as PERMISSIVE for SELECT to public
  using ((auth.uid() = owner_user_id));

-- Mitarbeiter sieht die Entsendungen seines Chefs.
drop policy if exists personal_entsendung_select_ma on public.personal_entsendung;
create policy personal_entsendung_select_ma on public.personal_entsendung
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

drop policy if exists personal_entsendung_insert on public.personal_entsendung;
create policy personal_entsendung_insert on public.personal_entsendung
  as PERMISSIVE for INSERT to public
  with check ((auth.uid() = owner_user_id));

drop policy if exists personal_entsendung_update on public.personal_entsendung;
create policy personal_entsendung_update on public.personal_entsendung
  as PERMISSIVE for UPDATE to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

drop policy if exists personal_entsendung_delete on public.personal_entsendung;
create policy personal_entsendung_delete on public.personal_entsendung
  as PERMISSIVE for DELETE to public
  using ((auth.uid() = owner_user_id));
