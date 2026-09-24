-- ============================================================
-- ARGONAUT OS · Paket PF · Personal-Dokumente — Stand 24.09.2026
--   personal_vertrag   Vertragsdaten je Mitarbeiter: Probezeit, Befristung,
--                      Nachweis nach NachwG (welche Pflichtangaben erteilt)
--
-- ADDITIV UND IDEMPOTENT: eine neue Tabelle, nichts Bestehendes angefasst.
-- Die Tabelle mitarbeiter bleibt unveraendert.
-- RLS: NUR der Chef (owner_user_id = auth.uid()). Mitarbeiter sehen nichts —
-- Vertragsdaten sind Personalakte.
-- ============================================================

create table if not exists public.personal_vertrag (
  id                     uuid primary key default gen_random_uuid(),
  owner_user_id          uuid not null,
  mitarbeiter_id         uuid not null,
  beginn                 date,
  probezeit_monate       integer check (probezeit_monate is null or probezeit_monate between 0 and 12),
  befristet              boolean not null default false,
  befristet_bis          date,
  sachgrund              text,
  erstbefristung_beginn  date,
  verlaengerungen        integer not null default 0 check (verlaengerungen between 0 and 20),
  abruf                  boolean not null default false,
  altersversorgung       boolean not null default false,
  nachweis_punkte        jsonb not null default '[]'::jsonb,
  nachweis_erteilt_am    date,
  notiz                  text,
  erstellt_am            timestamptz not null default now(),
  aktualisiert_am        timestamptz not null default now()
);
create unique index if not exists personal_vertrag_ma_uidx on public.personal_vertrag (owner_user_id, mitarbeiter_id);

alter table public.personal_vertrag enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='personal_vertrag' and policyname='personal_vertrag_chef') then
    create policy personal_vertrag_chef on public.personal_vertrag for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
end $$;

select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'personal_vertrag';
