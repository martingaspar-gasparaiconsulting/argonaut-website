-- ============================================================
-- ARGONAUT OS · A/B-Test für Betreffzeilen · 3.15 Teil 2
-- Additiv · idempotent · NICHT destruktiv
--
-- WARUM
-- lib/mailMessung.ts vergleicht seit dem 08.09.2026 zwei Versendungen und
-- nennt bewusst keinen Sieger, wenn die Grundlage zu duenn ist. Was fehlte,
-- war das Aussteuern davor: zwei Betreffzeilen an je einen Teil der Liste,
-- warten, und den Rest mit dem besseren Betreff bedienen.
--
-- WIE ES ZUSAMMENHAENGT
-- Jede Variante ist eine eigene Zeile in public.newsletter_versand — dort
-- werden Oeffnungen und Klicks ohnehin je Versand gezaehlt. Diese Tabelle
-- haelt nur die KLAMMER: welche zwei Versendungen gehoeren zusammen, wann
-- wurde gestartet, und ob der Rest schon raus ist.
--
-- KEIN PERSONENBEZUG: Es wird nicht gespeichert, WER in welcher Gruppe war.
-- Die Aufteilung entsteht bei Bedarf neu aus der Streuzahl der Adresse
-- (lib/abTest.ts, deterministisch und node-getestet) — dieselbe Liste ergibt
-- dieselben Gruppen, ohne dass jemand eine Zuordnung ablegen muss.
-- ============================================================

create table if not exists public.newsletter_ab_test (
  id                uuid        primary key default gen_random_uuid(),
  owner_user_id     uuid        not null default auth.uid(),

  betreff_a         text        not null,
  betreff_b         text        not null,
  inhalt            text        not null,

  /** Anteil je Variante in Prozent (1..50). */
  anteil            integer     not null default 20,
  /** Mischwort, damit ein zweiter Test derselben Liste andere Gruppen ergibt. */
  streuwort         text        not null default '',

  /** Die beiden Protokollzeilen aus newsletter_versand. */
  versand_a_id      uuid,
  versand_b_id      uuid,
  /** Die dritte Zeile: der Rest mit dem Sieger-Betreff. */
  versand_rest_id   uuid,

  gestartet_am      timestamptz,
  rest_gesendet_am  timestamptz,
  /** 'a' | 'b' — was tatsaechlich an den Rest ging. */
  genommen          text,
  /** true, wenn der Unterschied belastbar war; false = bewusste Setzung. */
  war_belastbar     boolean,

  notiz             text,
  erstellt_am       timestamptz not null default now()
);

comment on table public.newsletter_ab_test is
  'Klammer um zwei Newsletter-Versendungen mit verschiedenen Betreffzeilen. '
  'Ohne Personenbezug — die Gruppenaufteilung entsteht rechnerisch in lib/abTest.ts.';

create index if not exists newsletter_ab_test_zeit_idx
  on public.newsletter_ab_test (owner_user_id, erstellt_am desc);

alter table public.newsletter_ab_test enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='newsletter_ab_test' and policyname='newsletter_ab_test_select') then
    create policy newsletter_ab_test_select on public.newsletter_ab_test
      for select to authenticated using (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='newsletter_ab_test' and policyname='newsletter_ab_test_insert') then
    create policy newsletter_ab_test_insert on public.newsletter_ab_test
      for insert to authenticated with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='newsletter_ab_test' and policyname='newsletter_ab_test_update') then
    create policy newsletter_ab_test_update on public.newsletter_ab_test
      for update to authenticated using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='newsletter_ab_test' and policyname='newsletter_ab_test_delete') then
    create policy newsletter_ab_test_delete on public.newsletter_ab_test
      for delete to authenticated using (owner_user_id = auth.uid());
  end if;
end $$;


-- ------------------------------------------------------------------
-- KONTROLLE + die Spalten von newsletter_versand, an die angedockt wird.
-- EINE Abfrage — der Editor zeigt sonst nur die letzte.
-- ------------------------------------------------------------------
select 1 as rang, 'ab-test: spalten' as was, count(*)::text as wert
  from information_schema.columns
 where table_schema='public' and table_name='newsletter_ab_test'
union all
select 1, 'ab-test: regeln', count(*)::text
  from pg_policies where schemaname='public' and tablename='newsletter_ab_test'
union all
select 2, 'newsletter_versand.' || column_name, data_type
  from information_schema.columns
 where table_schema='public' and table_name='newsletter_versand'
 order by rang, was;
