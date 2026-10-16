-- ============================================================
-- ARGONAUT OS · Paket 390 · MO1 Teil 3 Protokoll-Motor: echte Sperre nach Abschluss
--
-- ACHTUNG (vorher lesen): Nach diesem SQL kann ein ABGESCHLOSSENES Formular
-- von NIEMANDEM mehr geaendert oder geloescht werden — auch nicht vom Chef.
-- Korrekturen gehen nur noch als NACHTRAG (wird angehaengt, nie geaendert).
-- Entwuerfe bleiben frei aenderbar und loeschbar wie bisher.
--
-- ADDITIV UND IDEMPOTENT: eine neue Tabelle formular_nachtrag, zwei Waechter-
-- Trigger. Keine Daten geaendert, nichts geloescht.
-- Rueckweg falls noetig (nur nach Absprache):
--   drop trigger if exists p390_eintrag_fest on public.formular_eintrag;
-- ============================================================

-- 1) Abgeschlossen = fest (Update und Loeschen)
create or replace function public.p390_eintrag_fest() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'abgeschlossen' then
      raise exception 'Abgeschlossene Formulare koennen nicht geloescht werden. Bitte einen Nachtrag anlegen.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'abgeschlossen' then
    -- Ausnahme: geloeschte Vorlage/Projekt setzt den Verweis auf leer (on delete set null) —
    -- sonst liesse sich ein Projekt mit abgeschlossenen Formularen nie mehr loeschen.
    if (to_jsonb(new) - 'vorlage_id' - 'projekt_id') = (to_jsonb(old) - 'vorlage_id' - 'projekt_id')
       and (new.vorlage_id is null or new.vorlage_id is not distinct from old.vorlage_id)
       and (new.projekt_id is null or new.projekt_id is not distinct from old.projekt_id) then
      return new;
    end if;
    raise exception 'Abgeschlossene Formulare koennen nicht geaendert werden. Bitte einen Nachtrag anlegen.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists p390_eintrag_fest on public.formular_eintrag;
create trigger p390_eintrag_fest before update or delete on public.formular_eintrag
  for each row execute function public.p390_eintrag_fest();

-- 2) Nachtraege: nur anhaengen
create table if not exists public.formular_nachtrag (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default coalesce(mein_chef_id(), auth.uid()),
  eintrag_id        uuid not null references public.formular_eintrag(id) on delete restrict,
  text              text not null check (char_length(btrim(text)) between 3 and 4000),
  erstellt_von      uuid default auth.uid(),
  erstellt_von_name text,
  erstellt_am       timestamptz not null default now()
);
create index if not exists formular_nachtrag_eintrag_idx on public.formular_nachtrag (eintrag_id, erstellt_am);

create or replace function public.p390_nachtrag_pruefen() returns trigger
language plpgsql as $$
declare st text; own uuid;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Nachtraege koennen nicht geaendert oder geloescht werden.' using errcode = 'P0001';
  end if;
  select status, owner_user_id into st, own from public.formular_eintrag where id = new.eintrag_id;
  if st is distinct from 'abgeschlossen' then
    raise exception 'Nachtraege gibt es nur zu abgeschlossenen Formularen.' using errcode = 'P0001';
  end if;
  if own is distinct from new.owner_user_id then
    raise exception 'Nachtrag gehoert nicht zu diesem Betrieb.' using errcode = 'P0001';
  end if;
  new.erstellt_am := now();
  new.erstellt_von := auth.uid();
  return new;
end $$;

drop trigger if exists p390_nachtrag_pruefen on public.formular_nachtrag;
create trigger p390_nachtrag_pruefen before insert or update or delete on public.formular_nachtrag
  for each row execute function public.p390_nachtrag_pruefen();

alter table public.formular_nachtrag enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='formular_nachtrag' and policyname='formular_nachtrag_select') then
    create policy formular_nachtrag_select on public.formular_nachtrag for select to authenticated
      using (owner_user_id = auth.uid() or owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='formular_nachtrag' and policyname='formular_nachtrag_insert') then
    create policy formular_nachtrag_insert on public.formular_nachtrag for insert to authenticated
      with check (owner_user_id = coalesce(mein_chef_id(), auth.uid()));
  end if;
end $$;

select (select count(*) from pg_trigger where tgname in ('p390_eintrag_fest', 'p390_nachtrag_pruefen'))
       || '|' || (select count(*) from pg_policies where tablename = 'formular_nachtrag') as kontrolle_2_2;
