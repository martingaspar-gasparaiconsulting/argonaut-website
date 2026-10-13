-- ============================================================
-- ARGONAUT OS · Paket 347 (13.10.2026) · A1 Teil 1 Vorlagen-Prinzip
-- „Meine Rechtstexte": Der Betrieb hinterlegt seine eigenen, von seinem
-- Anwalt geprüften Texte (Verwahrbedingungen, Kaufvertrag, Einwilligungen …).
-- ARGONAUT liefert dafür nur leere Gerüste (Überschriften), keinen Wortlaut.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- rechtstext:         je Betrieb und Schlüssel (z. B. „verwahrung.bedingungen")
--                     die gültige Fassung. Ändern legt automatisch eine neue
--                     Fassungsnummer an.
-- rechtstext_fassung: jede frühere Fassung, automatisch geschrieben,
--                     unveränderbar — so ist belegbar, welcher Text wann galt.
--
-- Rechte: Schreiben nur die Geschäftsleitung. Mitarbeiter des Betriebs lesen
-- (sie drucken z. B. das Verwahrprotokoll mit dem Text des Betriebs).
-- ============================================================

-- TEIL 1 von 3: Tabellen, Rechte
create table if not exists public.rechtstext (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  schluessel        text not null check (schluessel ~ '^[a-z]+\.[a-z_]+$' and char_length(schluessel) <= 60),
  text              text not null check (char_length(btrim(text)) between 50 and 30000),
  geprueft_vermerk  text check (geprueft_vermerk is null or char_length(geprueft_vermerk) <= 300),
  fassung           integer not null default 1 check (fassung >= 1),
  geaendert_von     uuid default auth.uid(),
  geaendert_am      timestamptz not null default now(),
  unique (owner_user_id, schluessel)
);

create table if not exists public.rechtstext_fassung (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  schluessel     text not null,
  fassung        integer not null,
  text           text not null,
  geprueft_vermerk text,
  gueltig_ab     timestamptz not null,
  gueltig_bis    timestamptz not null default now(),
  geaendert_von  uuid
);
create index if not exists rechtstext_fassung_idx on public.rechtstext_fassung (owner_user_id, schluessel, fassung desc);

alter table public.rechtstext enable row level security;
alter table public.rechtstext_fassung enable row level security;
revoke all on public.rechtstext_fassung from anon;
revoke all on public.rechtstext from anon;

drop policy if exists p347_owner_all on public.rechtstext;
create policy p347_owner_all on public.rechtstext for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p347_ma_select on public.rechtstext;
create policy p347_ma_select on public.rechtstext for select to authenticated
  using (owner_user_id = public.mein_chef_id());
drop policy if exists p347_fassung_owner on public.rechtstext_fassung;
create policy p347_fassung_owner on public.rechtstext_fassung for select to authenticated
  using (auth.uid() = owner_user_id);
drop policy if exists p347_fassung_ma on public.rechtstext_fassung;
create policy p347_fassung_ma on public.rechtstext_fassung for select to authenticated
  using (owner_user_id = public.mein_chef_id());

-- TEIL 2 von 3: Fassungen automatisch, Fassungen unveränderbar
create or replace function public.p347_rechtstext_fassen()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    -- Nach „Entfernen" zählt ein neuer Text weiter (nie zweimal „Fassung 1").
    select coalesce(max(f.fassung), 0) + 1 into new.fassung from public.rechtstext_fassung f
      where f.owner_user_id = new.owner_user_id and f.schluessel = new.schluessel;
    new.geaendert_am := now();
    new.geaendert_von := auth.uid();
    return new;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id or new.schluessel is distinct from old.schluessel then
    raise exception 'Betrieb und Schlüssel eines Rechtstexts bleiben fest.';
  end if;
  if new.text is distinct from old.text then
    insert into public.rechtstext_fassung (owner_user_id, schluessel, fassung, text, geprueft_vermerk, gueltig_ab, geaendert_von)
      values (old.owner_user_id, old.schluessel, old.fassung, old.text, old.geprueft_vermerk, old.geaendert_am, old.geaendert_von);
    new.fassung := old.fassung + 1;
  else
    new.fassung := old.fassung;
  end if;
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  return new;
end;
$$;

create or replace function public.p347_rechtstext_weg()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- Entfernen ist erlaubt (dann gilt wieder „kein eigener Text"), die letzte Fassung bleibt belegbar.
  insert into public.rechtstext_fassung (owner_user_id, schluessel, fassung, text, geprueft_vermerk, gueltig_ab, geaendert_von)
    values (old.owner_user_id, old.schluessel, old.fassung, old.text, old.geprueft_vermerk, old.geaendert_am, old.geaendert_von);
  return old;
end;
$$;

create or replace function public.p347_fassung_fest()
returns trigger language plpgsql as $$
begin
  raise exception 'Frühere Fassungen eines Rechtstexts werden nicht geändert oder gelöscht.';
end;
$$;

drop trigger if exists p347_fassen on public.rechtstext;
create trigger p347_fassen before insert or update on public.rechtstext
  for each row execute function public.p347_rechtstext_fassen();
drop trigger if exists p347_weg on public.rechtstext;
create trigger p347_weg before delete on public.rechtstext
  for each row execute function public.p347_rechtstext_weg();
drop trigger if exists p347_fest on public.rechtstext_fassung;
create trigger p347_fest before update or delete on public.rechtstext_fassung
  for each row execute function public.p347_fassung_fest();

-- TEIL 3 von 3: KONTROLLE — Erwartung: tabellen = 2 | ausloeser = 3 | rls_an = 2 | regeln = 4
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('rechtstext', 'rechtstext_fassung')) as tabellen,
  (select count(*) from pg_trigger where tgrelid in ('public.rechtstext'::regclass, 'public.rechtstext_fassung'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('rechtstext', 'rechtstext_fassung') and relrowsecurity) as rls_an,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('rechtstext', 'rechtstext_fassung') and policyname like 'p347_%') as regeln;
