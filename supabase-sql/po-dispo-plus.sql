-- ============================================================
-- ARGONAUT OS · Paket PO · Dispo mit Route und Qualifikation (B29) — Stand 24.09.2026
--   mitarbeiter_qualifikation   Befaehigungen je Mitarbeiter (mit "gueltig bis")
--   einsaetze.anforderungen     welche Befaehigungen ein Einsatz verlangt
--
-- ADDITIV UND IDEMPOTENT: eine neue Tabelle, eine neue Spalte mit Standard
-- (leere Liste) -> bestehende Einsaetze verhalten sich wie bisher.
-- RLS: Chef alles; Mitarbeiter lesen die Qualifikationen des Betriebs
-- (fuer die Dispo-Ansicht), aendern nichts.
-- ============================================================

alter table public.einsaetze add column if not exists anforderungen text[] not null default '{}';

create table if not exists public.mitarbeiter_qualifikation (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null default coalesce(mein_chef_id(), auth.uid()),
  mitarbeiter_id uuid not null,
  art            text not null,
  gueltig_bis    date,
  nachweis       text,
  erstellt_am    timestamptz not null default now()
);
create unique index if not exists mitarbeiter_qualifikation_uidx on public.mitarbeiter_qualifikation (mitarbeiter_id, art);
create index if not exists mitarbeiter_qualifikation_owner_idx on public.mitarbeiter_qualifikation (owner_user_id);

-- Fremdschluessel nur, wenn mitarbeiter.id wirklich uuid ist (wie in PJ).
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='mitarbeiter' and column_name='id' and data_type='uuid')
     and not exists (select 1 from pg_constraint where conname='mitarbeiter_qualifikation_ma_fk') then
    alter table public.mitarbeiter_qualifikation
      add constraint mitarbeiter_qualifikation_ma_fk foreign key (mitarbeiter_id) references public.mitarbeiter(id) on delete cascade;
  end if;
end $$;

alter table public.mitarbeiter_qualifikation enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mitarbeiter_qualifikation' and policyname='ma_quali_chef') then
    create policy ma_quali_chef on public.mitarbeiter_qualifikation for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mitarbeiter_qualifikation' and policyname='ma_quali_ma_select') then
    create policy ma_quali_ma_select on public.mitarbeiter_qualifikation for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
end $$;

select 'einsaetze.anforderungen' as was, data_type as info
  from information_schema.columns where table_schema='public' and table_name='einsaetze' and column_name='anforderungen'
union all
select 'Fremdschluessel', case when exists (select 1 from pg_constraint where conname='mitarbeiter_qualifikation_ma_fk') then 'gesetzt' else 'nicht gesetzt (mitarbeiter.id ist kein uuid)' end
union all
select 'Regeln mitarbeiter_qualifikation', count(*)::text from pg_policies where schemaname='public' and tablename='mitarbeiter_qualifikation';
