-- ARGONAUT OS · p408 · VK2 Qualifizierung und Uebergabe Setter -> Closer (16.10.2026) · additiv, mehrfach ausfuehrbar
-- Voraussetzung: p358 (vk_funktion, p358_im_team, Zustaendige an leads), mein_chef_id(), benachrichtigungen.
-- Leserechte folgen den Leads: wer einen Lead nicht sehen darf (z. B. freier Setter), sieht auch Bogen-Antworten und Uebergaben dazu nicht.

-- 1) Qualifizierungsboegen je Angebot (nur die Geschaeftsleitung legt an, das Team liest)
create table if not exists public.vk_bogen (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  name text not null check (length(trim(name)) between 1 and 120),
  angebot text,
  mit_standard boolean not null default true,
  fragen jsonb not null default '[]'::jsonb check (jsonb_typeof(fragen) = 'array'),
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists vk_bogen_owner_idx on public.vk_bogen (owner_user_id);
alter table public.vk_bogen enable row level security;
revoke all on public.vk_bogen from anon;
drop policy if exists p408_bogen_owner on public.vk_bogen;
create policy p408_bogen_owner on public.vk_bogen for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p408_bogen_ma on public.vk_bogen;
create policy p408_bogen_ma on public.vk_bogen for select to authenticated using (owner_user_id = public.mein_chef_id());

-- 2) Qualifizierung je Lead (eine Zeile je Lead)
create table if not exists public.lead_qualifizierung (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  lead_id uuid not null unique,
  bogen_id uuid,
  antworten jsonb not null default '{}'::jsonb check (jsonb_typeof(antworten) = 'object'),
  ergebnis text not null default 'offen' check (ergebnis in ('offen','passt','passt_nicht')),
  grund text check (grund is null or grund in ('kein_budget','kein_bedarf','nicht_entscheider','zeitpunkt','gebiet','leistung','versorgt','nicht_erreichbar','sonstiges')),
  grund_text text,
  erfasst_von uuid default auth.uid(),
  geaendert_von uuid default auth.uid(),
  erstellt_am timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  constraint lead_quali_grund_chk check ((ergebnis = 'passt_nicht') = (grund is not null))
);
create index if not exists lead_quali_owner_idx on public.lead_qualifizierung (owner_user_id, aktualisiert_am desc);

-- 3) Uebergaben an den Closer (Protokoll, nur anhaengen)
create table if not exists public.vk_uebergabe (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  lead_id uuid not null,
  von_user_id uuid default auth.uid(),
  an_user_id uuid not null,
  notiz text check (notiz is null or length(notiz) <= 2000),
  erstellt_am timestamptz not null default now()
);
create index if not exists vk_uebergabe_lead_idx on public.vk_uebergabe (lead_id, erstellt_am desc);
create index if not exists vk_uebergabe_an_idx on public.vk_uebergabe (owner_user_id, an_user_id, erstellt_am desc);

-- Waechter: Lead gehoert zum Betrieb, Empfaenger zum Team, Besitzer und Erfasser sind fest
create or replace function public.p408_waechter() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_owner uuid;
begin
  if tg_op = 'UPDATE' then
    new.owner_user_id := old.owner_user_id; new.lead_id := old.lead_id;
    new.erstellt_am := old.erstellt_am; new.erfasst_von := old.erfasst_von;
  end if;
  select l.owner_user_id into v_owner from public.leads l where l.id = new.lead_id;
  if v_owner is null or v_owner <> new.owner_user_id then raise exception 'Der Lead gehört nicht zu Ihrem Betrieb.'; end if;
  if tg_table_name = 'lead_qualifizierung' then
    new.geaendert_von := auth.uid();
    new.aktualisiert_am := now();
    if new.ergebnis <> 'passt_nicht' then new.grund := null; new.grund_text := null; end if;
  else
    new.von_user_id := auth.uid();
    if not public.p358_im_team(new.owner_user_id, new.an_user_id) then raise exception 'Der Closer gehört nicht zu Ihrem Betrieb.'; end if;
  end if;
  return new;
end $$;

-- Nach der Uebergabe: Glocke beim Closer, Closer am Lead eintragen, wenn noch keiner steht
create or replace function public.p408_uebergabe_danach() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_name text;
begin
  select coalesce(nullif(trim(l.name), ''), 'Lead') into v_name from public.leads l where l.id = new.lead_id;
  if new.an_user_id is distinct from new.von_user_id then
    begin
      insert into public.benachrichtigungen (owner_user_id, typ, titel, nachricht, link, ref_tabelle, ref_id, gelesen)
      values (new.an_user_id, 'verkauf', left('Übergabe: ' || v_name, 200),
              left(coalesce(nullif(trim(new.notiz), ''), 'Qualifiziert und an Sie übergeben.'), 300),
              '/dashboard/leads/' || new.lead_id || '/spickzettel', 'vk_uebergabe', new.id::text, false);
    exception when others then null; -- Glocke darf die Uebergabe nie verhindern
    end;
  end if;
  begin
    update public.leads set closer_user_id = new.an_user_id where id = new.lead_id and closer_user_id is null;
  exception when others then null; -- freie Setter duerfen Zustaendige nicht aendern (p358) — Uebergabe gilt trotzdem
  end;
  return null;
end $$;

do $$
begin
  drop trigger if exists p408_waechter on public.lead_qualifizierung;
  create trigger p408_waechter before insert or update on public.lead_qualifizierung for each row execute function public.p408_waechter();
  drop trigger if exists p408_waechter on public.vk_uebergabe;
  create trigger p408_waechter before insert on public.vk_uebergabe for each row execute function public.p408_waechter();
  drop trigger if exists p408_danach on public.vk_uebergabe;
  create trigger p408_danach after insert on public.vk_uebergabe for each row execute function public.p408_uebergabe_danach();
end $$;

-- Regeln: Betrieb + Lead sichtbar (Leads-Regeln inkl. freier Setter gelten mit)
alter table public.lead_qualifizierung enable row level security;
revoke all on public.lead_qualifizierung from anon;
drop policy if exists p408_quali_lesen on public.lead_qualifizierung;
create policy p408_quali_lesen on public.lead_qualifizierung for select to authenticated
  using (owner_user_id = coalesce(public.mein_chef_id(), auth.uid()) and exists (select 1 from public.leads l where l.id = lead_id));
drop policy if exists p408_quali_neu on public.lead_qualifizierung;
create policy p408_quali_neu on public.lead_qualifizierung for insert to authenticated
  with check (owner_user_id = coalesce(public.mein_chef_id(), auth.uid()) and exists (select 1 from public.leads l where l.id = lead_id));
drop policy if exists p408_quali_aendern on public.lead_qualifizierung;
create policy p408_quali_aendern on public.lead_qualifizierung for update to authenticated
  using (owner_user_id = coalesce(public.mein_chef_id(), auth.uid()) and exists (select 1 from public.leads l where l.id = lead_id))
  with check (owner_user_id = coalesce(public.mein_chef_id(), auth.uid()));
drop policy if exists p408_quali_loeschen on public.lead_qualifizierung;
create policy p408_quali_loeschen on public.lead_qualifizierung for delete to authenticated using (auth.uid() = owner_user_id);

alter table public.vk_uebergabe enable row level security;
revoke all on public.vk_uebergabe from anon;
drop policy if exists p408_ueb_lesen on public.vk_uebergabe;
create policy p408_ueb_lesen on public.vk_uebergabe for select to authenticated
  using (owner_user_id = coalesce(public.mein_chef_id(), auth.uid()) and (an_user_id = auth.uid() or exists (select 1 from public.leads l where l.id = lead_id)));
drop policy if exists p408_ueb_neu on public.vk_uebergabe;
create policy p408_ueb_neu on public.vk_uebergabe for insert to authenticated
  with check (owner_user_id = coalesce(public.mein_chef_id(), auth.uid()) and exists (select 1 from public.leads l where l.id = lead_id));

-- Kontrolle: erwartet 3|8|3
select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('vk_bogen','lead_qualifizierung','vk_uebergabe'))
  || '|' || (select count(*) from pg_policies where schemaname='public' and tablename in ('vk_bogen','lead_qualifizierung','vk_uebergabe'))
  || '|' || (select count(*) from pg_trigger where tgname in ('p408_waechter','p408_danach') and not tgisinternal) as kontrolle;
