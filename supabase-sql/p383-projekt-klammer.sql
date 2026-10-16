-- ============================================================
-- ARGONAUT OS · Paket 383 · HW-16 Projekt als Klammer (16.10.2026)
-- Auftrag, Einsatz und Aufmass bekommen ein Projekt.
-- Einsatz mit Auftrag uebernimmt das Projekt des Auftrags (Trigger).
-- ADDITIV UND IDEMPOTENT: drei Spalten, drei Indexe, ein Trigger.
-- ============================================================

alter table public.auftraege
  add column if not exists projekt_id uuid
  references public.projekte(id) on delete set null;
alter table public.einsaetze
  add column if not exists projekt_id uuid
  references public.projekte(id) on delete set null;
alter table public.aufmasse
  add column if not exists projekt_id uuid
  references public.projekte(id) on delete set null;

create index if not exists auftraege_projekt_idx
  on public.auftraege (projekt_id) where projekt_id is not null;
create index if not exists einsaetze_projekt_idx
  on public.einsaetze (projekt_id) where projekt_id is not null;
create index if not exists aufmasse_projekt_idx
  on public.aufmasse (projekt_id) where projekt_id is not null;

create or replace function public.p383_einsatz_projekt()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.projekt_id is null and new.auftrag_id is not null then
    select a.projekt_id into new.projekt_id
    from public.auftraege a
    where a.id = new.auftrag_id
      and a.owner_user_id = new.owner_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists p383_einsatz_projekt on public.einsaetze;
create trigger p383_einsatz_projekt
  before insert or update of auftrag_id, projekt_id on public.einsaetze
  for each row execute function public.p383_einsatz_projekt();

-- Kontrolle: erwartet 3 | 1
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and column_name = 'projekt_id'
      and table_name in ('auftraege', 'einsaetze', 'aufmasse')) as spalten,
  (select count(*) from pg_trigger
    where tgname = 'p383_einsatz_projekt') as trigger;
