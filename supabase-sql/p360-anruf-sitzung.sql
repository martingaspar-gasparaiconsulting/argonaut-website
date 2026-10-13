-- ============================================================
-- ARGONAUT OS · Paket 360 (13.10.2026) · VK4 Anruf-Sitzung, Teil 1
-- Jeder Anruf aus der Anruf-Sitzung wird mit Ergebnis gespeichert —
-- an einem Lead oder einem Kontakt. Daraus rechnet die Datenbank je Lead:
-- erster Anruf, Zahl der Versuche, letztes Ergebnis und wann er wieder dran ist.
-- Das Akquise-Cockpit zählt die Anrufe automatisch mit.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- vk_anruf:  Ergebnis nicht_erreicht | mailbox | besetzt | falsche_nummer |
--            rueckruf (mit Rückruf-Zeit) | gespraech | kein_interesse | termin.
--            Wer angerufen hat und wann, setzt der Server. Eintrag ist danach
--            fest; die eigene Person darf 15 Minuten lang zurücknehmen
--            (Vertipper), die Geschäftsleitung immer.
-- leads:     neue Spalten erster_anruf_am, letzter_anruf_am, anruf_versuche,
--            letzter_anruf_ergebnis, naechster_anruf_am (rechnet der Wächter).
-- kontakte:  letzter_kontakt_am / naechster_kontakt_am werden bei Anrufen
--            nachgezogen (vorhandene Spalten).
-- Wieder dran: Rückruf zur vereinbarten Zeit; nicht erreicht / Mailbox /
--            besetzt nach 2 Stunden, ab dem 3. Versuch am nächsten Tag.
--
-- Kein Aussperr-Risiko: an leads, kontakte und vertrieb_aktivitaet ändern
-- sich keine Regeln. Freie Setter sehen nur ihre eigenen Anrufe.
-- Voraussetzung: leads, kontakte, mitarbeiter, mein_chef_id(), p353_name()
-- (Paket 353), p358_frei() (Paket 358).
-- ============================================================

-- TEIL 1 von 5: Tabelle
create table if not exists public.vk_anruf (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  lead_id         uuid references public.leads(id) on delete cascade,
  kontakt_id      uuid references public.kontakte(id) on delete cascade,
  user_id         uuid default auth.uid(),
  anrufer_name    text,
  ergebnis        text not null check (ergebnis in ('nicht_erreicht', 'mailbox', 'besetzt', 'falsche_nummer', 'rueckruf', 'gespraech', 'kein_interesse', 'termin')),
  rueckruf_am     timestamptz,
  notiz           text check (notiz is null or char_length(notiz) <= 2000),
  aktivitaet_id   uuid,
  erstellt_am     timestamptz not null default now(),
  constraint vk_anruf_bezug check (lead_id is not null or kontakt_id is not null),
  constraint vk_anruf_rueckruf check ((ergebnis = 'rueckruf') = (rueckruf_am is not null))
);
create index if not exists vk_anruf_lead_idx on public.vk_anruf (lead_id, erstellt_am) where lead_id is not null;
create index if not exists vk_anruf_kontakt_idx on public.vk_anruf (kontakt_id, erstellt_am) where kontakt_id is not null;
create index if not exists vk_anruf_owner_tag_idx on public.vk_anruf (owner_user_id, erstellt_am);

-- TEIL 2 von 5: Spalten am Lead (rechnet der Wächter, nicht der Browser)
alter table public.leads add column if not exists erster_anruf_am timestamptz;
alter table public.leads add column if not exists letzter_anruf_am timestamptz;
alter table public.leads add column if not exists anruf_versuche integer not null default 0;
alter table public.leads add column if not exists letzter_anruf_ergebnis text;
alter table public.leads add column if not exists naechster_anruf_am timestamptz;
create index if not exists leads_naechster_anruf_idx on public.leads (owner_user_id, naechster_anruf_am);

-- TEIL 3 von 5: Wächter und Nachrechnen
-- Lead-Felder immer aus ALLEN Anrufen des Leads neu rechnen (auch nach Zurücknehmen).
create or replace function public.p360_lead_rechnen(p_lead uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_anzahl integer; v_erster timestamptz; v_letzter timestamptz; v_erg text; v_rueck timestamptz; v_naechst timestamptz;
begin
  if p_lead is null then return; end if;
  select count(*), min(a.erstellt_am), max(a.erstellt_am) into v_anzahl, v_erster, v_letzter
    from public.vk_anruf a where a.lead_id = p_lead;
  select a.ergebnis, a.rueckruf_am into v_erg, v_rueck
    from public.vk_anruf a where a.lead_id = p_lead order by a.erstellt_am desc, a.id desc limit 1;
  v_naechst := case
    when v_erg = 'rueckruf' then v_rueck
    when v_erg in ('nicht_erreicht', 'mailbox', 'besetzt') then v_letzter + case when v_anzahl >= 3 then interval '20 hours' else interval '2 hours' end
    else null end;
  update public.leads l set
    erster_anruf_am = v_erster, letzter_anruf_am = v_letzter, anruf_versuche = coalesce(v_anzahl, 0),
    letzter_anruf_ergebnis = v_erg, naechster_anruf_am = v_naechst
  where l.id = p_lead;
end;
$$;
revoke all on function public.p360_lead_rechnen(uuid) from public, anon, authenticated;

create or replace function public.p360_anruf_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_owner uuid; v_ma uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Ein gespeicherter Anruf bleibt, wie er ist. Bei einem Vertipper bitte zurücknehmen und neu erfassen.';
  end if;
  if tg_op = 'DELETE' then
    if auth.uid() is not null and auth.uid() <> old.owner_user_id
       and not (old.user_id = auth.uid() and old.erstellt_am > now() - interval '15 minutes') then
      raise exception 'Zurücknehmen geht nur 15 Minuten lang und nur für eigene Anrufe.';
    end if;
    return old;
  end if;
  -- INSERT: Bezug muss zum Betrieb gehören; Zeit und Person setzt der Server.
  if new.lead_id is not null then
    select l.owner_user_id into v_owner from public.leads l where l.id = new.lead_id;
    if v_owner is null or v_owner <> new.owner_user_id then raise exception 'Der Lead gehört nicht zu Ihrem Betrieb.'; end if;
  end if;
  if new.kontakt_id is not null then
    v_owner := null;
    select k.owner_user_id into v_owner from public.kontakte k where k.id = new.kontakt_id;
    if v_owner is null or v_owner <> new.owner_user_id then raise exception 'Der Kontakt gehört nicht zu Ihrem Betrieb.'; end if;
  end if;
  new.erstellt_am := now();
  if auth.uid() is not null then new.user_id := auth.uid(); end if;
  new.anrufer_name := public.p353_name(new.owner_user_id);
  if new.ergebnis = 'rueckruf' and (new.rueckruf_am < now() - interval '5 minutes' or new.rueckruf_am > now() + interval '366 days') then
    raise exception 'Die Rückruf-Zeit muss in der Zukunft liegen (höchstens ein Jahr).';
  end if;
  if new.ergebnis <> 'rueckruf' then new.rueckruf_am := null; end if;
  -- Akquise-Cockpit zählt mit. Beiwerk: schlägt es fehl, wird der Anruf trotzdem gespeichert.
  new.aktivitaet_id := null;
  begin
    select m.id into v_ma from public.mitarbeiter m where m.auth_user_id = new.user_id and m.owner_user_id = new.owner_user_id limit 1;
    insert into public.vertrieb_aktivitaet (owner_user_id, mitarbeiter_id, art, ergebnis, notiz)
      values (new.owner_user_id, v_ma, 'anruf',
        case new.ergebnis when 'termin' then 'termin' when 'kein_interesse' then 'absage'
          when 'gespraech' then 'gesprochen' when 'rueckruf' then 'gesprochen' else 'kein_kontakt' end,
        'Anruf-Sitzung')
      returning id into new.aktivitaet_id;
  exception when others then new.aktivitaet_id := null;
  end;
  return new;
end;
$$;

-- Nach dem Speichern bzw. Zurücknehmen: Lead nachrechnen, Kontakt nachziehen, Cockpit-Zeile mit entfernen.
create or replace function public.p360_anruf_danach()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    perform public.p360_lead_rechnen(old.lead_id);
    if old.aktivitaet_id is not null then
      begin delete from public.vertrieb_aktivitaet v where v.id = old.aktivitaet_id; exception when others then null; end;
    end if;
    return old;
  end if;
  perform public.p360_lead_rechnen(new.lead_id);
  if new.kontakt_id is not null then
    begin
      update public.kontakte k set
        letzter_kontakt_am = case when new.ergebnis in ('gespraech', 'rueckruf', 'kein_interesse', 'termin') then new.erstellt_am else k.letzter_kontakt_am end,
        naechster_kontakt_am = case when new.ergebnis = 'rueckruf' then new.rueckruf_am else k.naechster_kontakt_am end
      where k.id = new.kontakt_id;
    exception when others then null;
    end;
  end if;
  return new;
end;
$$;

do $$
begin
  drop trigger if exists p360_waechter on public.vk_anruf;
  create trigger p360_waechter before insert or update or delete on public.vk_anruf for each row execute function public.p360_anruf_waechter();
  drop trigger if exists p360_danach on public.vk_anruf;
  create trigger p360_danach after insert or delete on public.vk_anruf for each row execute function public.p360_anruf_danach();
end $$;

-- TEIL 4 von 5: Regeln. Team liest und erfasst eigene Anrufe; freie Setter sehen nur eigene.
alter table public.vk_anruf enable row level security;
revoke all on public.vk_anruf from anon;
drop policy if exists p360_owner_all on public.vk_anruf;
create policy p360_owner_all on public.vk_anruf for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p360_ma_select on public.vk_anruf;
create policy p360_ma_select on public.vk_anruf for select to authenticated using (owner_user_id = public.mein_chef_id());
drop policy if exists p360_ma_insert on public.vk_anruf;
create policy p360_ma_insert on public.vk_anruf for insert to authenticated with check (owner_user_id = public.mein_chef_id() and user_id = auth.uid());
drop policy if exists p360_ma_delete on public.vk_anruf;
create policy p360_ma_delete on public.vk_anruf for delete to authenticated using (owner_user_id = public.mein_chef_id() and user_id = auth.uid() and erstellt_am > now() - interval '15 minutes');
drop policy if exists p360_frei on public.vk_anruf;
create policy p360_frei on public.vk_anruf as restrictive for all to authenticated
  using (not public.p358_frei() or user_id = auth.uid()) with check (not public.p358_frei() or user_id = auth.uid());

-- TEIL 5 von 5: KONTROLLE — Erwartung: tabelle = 1 | spalten = 5 | regeln = 5 | ausloeser = 2
-- (regeln = 6 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel aus Paket 164)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'vk_anruf') as tabelle,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name in ('erster_anruf_am', 'letzter_anruf_am', 'anruf_versuche', 'letzter_anruf_ergebnis', 'naechster_anruf_am')) as spalten,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'vk_anruf') as regeln,
  (select count(*) from pg_trigger where tgname in ('p360_waechter', 'p360_danach') and not tgisinternal) as ausloeser;
