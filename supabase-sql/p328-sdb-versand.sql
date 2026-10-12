-- ============================================================================
-- ARGONAUT OS · Paket 328 (12.10.2026) · S5 SDB mit der Bestellbestätigung
--
--   sdb_versand   Nachweis je gesendetem Sicherheitsdatenblatt: Artikel,
--                 Fassung, Empfänger, Bestellung, Anlass (Bestellung oder
--                 Nachversand einer neuen Fassung), Status, versendet am.
--
-- Unveränderbar: Angemeldete dürfen nur LESEN (Geschäftsleitung, Mitarbeiter
-- mit Recht „Shop"). Geschrieben wird nur vom Server (Bestellung, Nachversand).
-- Wächter: Artikel und Fassung gehören zum Betrieb.
-- Wirkt erst nach der Freigabe durch den Anwalt (lib/startSperre „sdbVersand", R49).
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — nur eine neue Tabelle.
-- RÜCKWEG (nur im Notfall): drop table public.sdb_versand;
-- ============================================================================

begin;

create table if not exists public.sdb_versand (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null,
  artikel_id       uuid not null references public.artikel(id) on delete cascade,
  dokument_id      uuid references public.produkt_dokument(id) on delete set null,
  dokument_version text,
  sprache          text not null default 'de',
  empfaenger_email text,
  empfaenger_name  text,
  bestellung_id    uuid references public.shop_bestellungen(id) on delete set null,
  anlass           text not null default 'bestellung',
  status           text not null default 'versendet',
  versendet_am     timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p328_versand_check' and conrelid = 'public.sdb_versand'::regclass) then
    alter table public.sdb_versand add constraint p328_versand_check check (
      anlass in ('bestellung', 'nachversand')
      and status in ('versendet', 'fehler', 'zu_gross', 'ohne_mail')
      and sprache ~ '^[a-z]{2}$'
      and (empfaenger_email is null or char_length(empfaenger_email) <= 200)
      and (empfaenger_name is null or char_length(empfaenger_name) <= 200)
      and (dokument_version is null or char_length(dokument_version) <= 40)
      and (status = 'ohne_mail' or empfaenger_email is not null)
    );
  end if;
end $$;

create index if not exists sdb_versand_artikel_idx on public.sdb_versand (owner_user_id, artikel_id, versendet_am desc);
create index if not exists sdb_versand_mail_idx on public.sdb_versand (owner_user_id, empfaenger_email);

comment on table public.sdb_versand is 'Paket 328: Nachweis Versand Sicherheitsdatenblatt (REACH Art. 31 Abs. 8/9). Nur lesen fuer Angemeldete, schreiben nur Server.';

create or replace function public.p328_versand_waechter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_artikel uuid;
begin
  select owner_user_id into v_owner from public.artikel where id = new.artikel_id;
  if v_owner is null or v_owner <> new.owner_user_id then
    raise exception 'Der Artikel gehoert nicht zu diesem Betrieb.' using errcode = '42501';
  end if;
  if new.dokument_id is not null then
    select owner_user_id, artikel_id into v_owner, v_artikel from public.produkt_dokument where id = new.dokument_id;
    if v_owner is null or v_owner <> new.owner_user_id or v_artikel <> new.artikel_id then
      raise exception 'Das Sicherheitsdatenblatt gehoert nicht zu diesem Artikel.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists p328_versand_trg on public.sdb_versand;
create trigger p328_versand_trg before insert on public.sdb_versand
  for each row execute function public.p328_versand_waechter();

alter table public.sdb_versand enable row level security;
revoke insert, update, delete on public.sdb_versand from anon, authenticated;
grant select on public.sdb_versand to authenticated;

drop policy if exists p328_versand_chef on public.sdb_versand;
create policy p328_versand_chef on public.sdb_versand for select to authenticated
  using (owner_user_id = auth.uid() and public.mein_chef_id() is null);
drop policy if exists p328_versand_ma on public.sdb_versand;
create policy p328_versand_ma on public.sdb_versand for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('shop') or public.darf_ich_modul_aendern('shop')));

commit;

-- KONTROLLE (nur lesen) — Erwartung: 1 | 2 | 1 | false
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'sdb_versand') as tabelle,
       (select count(*) from pg_policies where schemaname = 'public' and policyname like 'p328_%') as regeln,
       (select count(*) from pg_trigger where tgname = 'p328_versand_trg') as waechter,
       has_table_privilege('authenticated', 'public.sdb_versand', 'INSERT') as authenticated_darf_schreiben;
