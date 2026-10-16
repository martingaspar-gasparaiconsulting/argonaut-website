-- ============================================================
-- ARGONAUT OS · Paket 388 · MO1 Teil 2 Protokoll-Motor: Bezug + Intervall/Frist
--   formular_vorlage.intervall_monate   z. B. 12 = jaehrlich (leer = anlassbezogen)
--   formular_eintrag.bezug_typ/bezug_id  Anlage, Objekt, Fahrzeug, Tier, Kunde, Baustelle
--   formular_eintrag.naechste_faellig   beim Abschluss gesetzt (Abschlusstag + Intervall)
--
-- ADDITIV UND IDEMPOTENT: nur neue Spalten, Pruefregeln und ein Index.
-- Nichts geloescht, keine Daten geaendert, RLS unveraendert.
-- Der Code laeuft auch schon vor diesem SQL (die Felder erscheinen danach).
-- ============================================================

alter table public.formular_vorlage add column if not exists intervall_monate integer;
alter table public.formular_eintrag add column if not exists bezug_typ text;
alter table public.formular_eintrag add column if not exists bezug_id uuid;
alter table public.formular_eintrag add column if not exists naechste_faellig date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'formular_vorlage_intervall_chk') then
    alter table public.formular_vorlage add constraint formular_vorlage_intervall_chk
      check (intervall_monate is null or intervall_monate between 1 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'formular_eintrag_bezug_chk') then
    alter table public.formular_eintrag add constraint formular_eintrag_bezug_chk
      check ((bezug_typ is null and bezug_id is null)
          or (bezug_typ in ('anlage','objekt','fahrzeug','tier','kunde','baustelle') and bezug_id is not null));
  end if;
end $$;

create index if not exists formular_eintrag_bezug_idx
  on public.formular_eintrag (owner_user_id, bezug_typ, bezug_id);

select count(*) as kontrolle_4
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'formular_vorlage' and column_name = 'intervall_monate')
     or (table_name = 'formular_eintrag' and column_name in ('bezug_typ', 'bezug_id', 'naechste_faellig')));
