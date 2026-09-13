-- ============================================================
-- ARGONAUT OS · Empfängergruppen (Segmente) · 3.15 Teil 1
-- Additiv · idempotent · NICHT destruktiv
--
-- WARUM
-- Werbepost ging bisher an alle oder an niemanden. Eine Gruppe wie „Kunden
-- aus dem Handwerk im Umkreis 70xxx, die seit 90 Tagen nichts gekauft haben"
-- liess sich nicht bilden.
--
-- WAS HIER NICHT GESPEICHERT WIRD
-- Die Regeln greifen ausschliesslich auf Stammdaten und ERKLAERTE Handlungen
-- zu (angefordert, gekauft, angemeldet) — nie auf beobachtetes Verhalten wie
-- „hat geoeffnet" oder „hat geklickt". Das waere Profilbildung und nach DSGVO
-- eigenstaendig einwilligungsbeduerftig; lib/mailMessung.ts haelt aus genau
-- diesem Grund nur Summen je Versand fest und kennt keine Person.
-- Die Sperrliste dazu steht in lib/segmente.ts (GESPERRTE_MERKMALE) und ist
-- dort node-getestet.
--
-- Die Regeln liegen als jsonb, weil sie eine Liste veraenderlicher Laenge sind
-- und ausschliesslich von lib/segmente.ts ausgewertet werden — die Datenbank
-- filtert damit nicht.
-- ============================================================

create table if not exists public.marketing_segment (
  id             uuid        primary key default gen_random_uuid(),
  owner_user_id  uuid        not null default auth.uid(),
  name           text        not null,
  /** kontakte | newsletter | leads — woher die Empfaenger kommen. */
  quelle         text        not null default 'kontakte',
  /** und | oder */
  verknuepfung   text        not null default 'und',
  /** [{ merkmal, operator, wert }, …] — Auswertung in lib/segmente.ts */
  regeln         jsonb       not null default '[]'::jsonb,
  notiz          text,
  erstellt_am    timestamptz not null default now(),
  geaendert_am   timestamptz not null default now()
);

comment on table public.marketing_segment is
  'Gespeicherte Empfaengergruppen fuer Werbepost. Regeln nur auf Stammdaten und '
  'erklaerte Handlungen — nie auf beobachtetes Oeffnungs- oder Klickverhalten.';

create unique index if not exists marketing_segment_name_idx
  on public.marketing_segment (owner_user_id, lower(name));

alter table public.marketing_segment enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketing_segment' and policyname='marketing_segment_select') then
    create policy marketing_segment_select on public.marketing_segment
      for select to authenticated using (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketing_segment' and policyname='marketing_segment_insert') then
    create policy marketing_segment_insert on public.marketing_segment
      for insert to authenticated with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketing_segment' and policyname='marketing_segment_update') then
    create policy marketing_segment_update on public.marketing_segment
      for update to authenticated using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketing_segment' and policyname='marketing_segment_delete') then
    create policy marketing_segment_delete on public.marketing_segment
      for delete to authenticated using (owner_user_id = auth.uid());
  end if;
end $$;


-- ------------------------------------------------------------------
-- KONTROLLE + die Spalten, aus denen die Merkmale gespeist werden.
-- EINE Abfrage, der Editor zeigt sonst nur die letzte.
-- ------------------------------------------------------------------
select 1 as rang, 'segment-tabelle: spalten' as was, count(*)::text as wert
  from information_schema.columns
 where table_schema='public' and table_name='marketing_segment'
union all
select 1, 'segment-tabelle: regeln', count(*)::text
  from pg_policies where schemaname='public' and tablename='marketing_segment'
union all
select 2, 'kontakte.' || column_name, data_type
  from information_schema.columns
 where table_schema='public' and table_name='kontakte'
union all
select 3, 'newsletter_abonnenten.' || column_name, data_type
  from information_schema.columns
 where table_schema='public' and table_name='newsletter_abonnenten'
 order by rang, was;
