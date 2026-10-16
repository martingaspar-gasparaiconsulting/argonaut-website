-- ARGONAUT OS · p414 · VK6 Gespraechsergebnis nach dem Verkaufsgespraech (16.10.2026) · additiv, mehrfach ausfuehrbar
-- Eine Zeile je Gespraech am Lead: Ergebnis, angeboten, vereinbart/Anzahlung (Cent), Haupteinwand, naechster Schritt.
-- Leserechte folgen den Leads (freie Setter sehen nur Gespraeche zu ihren Leads). Aendern: wer es erfasst hat oder die Geschaeftsleitung.
create table if not exists public.vk_gespraech (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  lead_id uuid not null,
  termin_id uuid,
  closer_user_id uuid default auth.uid(),
  gespraech_am timestamptz not null default now(),
  ergebnis text not null check (ergebnis in ('abgeschlossen','offen','verloren','nicht_erschienen')),
  angeboten boolean not null default false,
  vereinbart_cent bigint check (vereinbart_cent is null or vereinbart_cent >= 0),
  anzahlung_cent bigint check (anzahlung_cent is null or anzahlung_cent >= 0),
  einwand text check (einwand is null or einwand in ('preis','zeitpunkt','partner','vergleich','vertrauen','bedarf','finanzierung','sonstiges')),
  einwand_text text check (einwand_text is null or length(einwand_text) <= 500),
  naechster_schritt text check (naechster_schritt is null or length(naechster_schritt) <= 500),
  folgetermin_am timestamptz,
  notiz text check (notiz is null or length(notiz) <= 2000),
  angebot_id uuid,
  auftrag_id uuid,
  projekt_id uuid,
  portal_mail_am timestamptz,
  erstellt_am timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  constraint vk_gespraech_anzahlung_chk check (anzahlung_cent is null or vereinbart_cent is null or anzahlung_cent <= vereinbart_cent),
  constraint vk_gespraech_abschluss_chk check (ergebnis <> 'abgeschlossen' or coalesce(vereinbart_cent, 0) > 0),
  constraint vk_gespraech_verloren_chk check (ergebnis <> 'verloren' or einwand is not null),
  constraint vk_gespraech_nicht_chk check (ergebnis <> 'nicht_erschienen' or (vereinbart_cent is null and anzahlung_cent is null and not angeboten))
);
create index if not exists vk_gespraech_lead_idx on public.vk_gespraech (lead_id, gespraech_am desc);
create index if not exists vk_gespraech_owner_idx on public.vk_gespraech (owner_user_id, gespraech_am desc);

-- Waechter: Lead gehoert zum Betrieb; Besitzer, Lead, Erfasser und Anlagezeit sind fest; Zeitpunkt nicht in der Zukunft
create or replace function public.p414_waechter() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_owner uuid;
begin
  if tg_op = 'UPDATE' then
    new.owner_user_id := old.owner_user_id; new.lead_id := old.lead_id;
    new.closer_user_id := old.closer_user_id; new.erstellt_am := old.erstellt_am;
  else
    new.closer_user_id := coalesce(auth.uid(), new.closer_user_id);
  end if;
  select l.owner_user_id into v_owner from public.leads l where l.id = new.lead_id;
  if v_owner is null or v_owner <> new.owner_user_id then raise exception 'Der Lead gehört nicht zu Ihrem Betrieb.'; end if;
  if new.gespraech_am > now() + interval '1 hour' then raise exception 'Das Gespräch liegt in der Zukunft.'; end if;
  new.aktualisiert_am := now();
  return new;
end $$;

do $$
begin
  drop trigger if exists p414_waechter on public.vk_gespraech;
  create trigger p414_waechter before insert or update on public.vk_gespraech for each row execute function public.p414_waechter();
end $$;

alter table public.vk_gespraech enable row level security;
revoke all on public.vk_gespraech from anon;
drop policy if exists p414_lesen on public.vk_gespraech;
create policy p414_lesen on public.vk_gespraech for select to authenticated
  using (owner_user_id = coalesce(public.mein_chef_id(), auth.uid()) and exists (select 1 from public.leads l where l.id = lead_id));
drop policy if exists p414_neu on public.vk_gespraech;
create policy p414_neu on public.vk_gespraech for insert to authenticated
  with check (owner_user_id = coalesce(public.mein_chef_id(), auth.uid()) and exists (select 1 from public.leads l where l.id = lead_id));
drop policy if exists p414_aendern on public.vk_gespraech;
create policy p414_aendern on public.vk_gespraech for update to authenticated
  using (owner_user_id = coalesce(public.mein_chef_id(), auth.uid()) and (auth.uid() = owner_user_id or closer_user_id = auth.uid())
         and exists (select 1 from public.leads l where l.id = lead_id))
  with check (owner_user_id = coalesce(public.mein_chef_id(), auth.uid()));
drop policy if exists p414_loeschen on public.vk_gespraech;
create policy p414_loeschen on public.vk_gespraech for delete to authenticated using (auth.uid() = owner_user_id);

-- Kontrolle: erwartet 1|4|1
select (select count(*) from information_schema.tables where table_schema='public' and table_name='vk_gespraech')
  || '|' || (select count(*) from pg_policies where schemaname='public' and tablename='vk_gespraech')
  || '|' || (select count(*) from pg_trigger where tgname='p414_waechter') as kontrolle;
