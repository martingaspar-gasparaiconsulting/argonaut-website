-- ============================================================
-- ARGONAUT OS · Paket PA · KI-Sachbearbeiter — Tabelle post_vorgang
-- Stand: 24.09.2026
--
-- Merkt sich ausgewertete Schreiben (E-Mail oder Brief) als Vorgang mit
-- Frist. Gespeichert wird NUR die Auswertung, nie das Original.
--
-- ADDITIV UND IDEMPOTENT: legt eine neue Tabelle an, fasst nichts
-- Bestehendes an. Beliebig oft ausfuehrbar.
--
-- RLS: jeder Nutzer sieht und aendert NUR seine eigenen Vorgaenge
-- (owner_user_id = auth.uid()) — wie mail_zugang, von dem die Mails kommen.
-- ============================================================

create table if not exists public.post_vorgang (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null references auth.users(id) on delete cascade,
  quelle           text not null check (quelle in ('mail', 'brief')),
  art              text not null default 'sonstiges',
  betreff          text,
  absender         text,
  zusammenfassung  text,
  was_tun          text,
  frist            date,
  frist_text       text,
  betrag           numeric(12,2),
  aktenzeichen     text,
  dringlichkeit    text not null default 'normal' check (dringlichkeit in ('hoch', 'mittel', 'normal')),
  status           text not null default 'offen' check (status in ('offen', 'erledigt')),
  aufgabe_angelegt boolean not null default false,
  mail_uid         bigint,
  mail_ordner      text,
  erstellt_am      timestamptz not null default now(),
  erledigt_am      timestamptz
);

create index if not exists post_vorgang_owner_status_idx
  on public.post_vorgang (owner_user_id, status, frist);

alter table public.post_vorgang enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_vorgang' and policyname = 'post_vorgang_select') then
    create policy post_vorgang_select on public.post_vorgang
      for select to authenticated using (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_vorgang' and policyname = 'post_vorgang_insert') then
    create policy post_vorgang_insert on public.post_vorgang
      for insert to authenticated with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_vorgang' and policyname = 'post_vorgang_update') then
    create policy post_vorgang_update on public.post_vorgang
      for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_vorgang' and policyname = 'post_vorgang_delete') then
    create policy post_vorgang_delete on public.post_vorgang
      for delete to authenticated using (owner_user_id = auth.uid());
  end if;
end $$;

-- Kontrolle: muss eine Zeile mit rowsecurity = true liefern
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'post_vorgang';
