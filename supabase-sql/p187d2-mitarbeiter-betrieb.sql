-- ============================================================
-- ARGONAUT OS · Paket 187d Teil 2 (02.10.2026) · Tabelle „mitarbeiter"
--
-- Befund: Legt eine Büroleitung (Mitarbeiter mit Personal-Recht) einen neuen
-- Mitarbeiter an, durfte sie nur ihre EIGENE Kennung als Besitzer eintragen
-- (Regel mitarbeiter_insert_own). mein_chef_id() liest genau dieses Feld —
-- der neue Mitarbeiter hing an der Büroleitung statt am Betrieb.
-- Live-Prüfung 02.10.2026: 0 falsch angehängte Mitarbeiter, 0 Personen mit
-- Personal nur zum Ansehen, 5 Zeilen / 3 mit Login.
--
-- WAS HIER PASSIERT (additiv, keine bestehende Regel wird geändert, keine
-- Zeile wird verändert):
--  1. Trigger p181_besitzer auch auf mitarbeiter: Anlegen durch einen
--     Mitarbeiter -> Besitzer = sein Betrieb. Ändern -> der Besitzer bleibt,
--     wer er war (niemand kann versehentlich umgehängt werden).
--  2. Schutz-Trigger p187d_ma_rechte_schuetzen: Ein Mitarbeiter kann über die
--     Personal-Seite NIE Rechte vergeben — „Darf abrechnen", Leitungsrolle und
--     Nutzer-Typ bleiben beim Ändern unverändert und starten beim Anlegen leer;
--     am EIGENEN Eintrag bleiben zusätzlich Status und Austrittsdatum.
--     (Login-Verknüpfung schützt seit Paket 169 der Trigger p169.)
--  3. Regeln: ANLEGEN/ÄNDERN mit Personal-Schreibrecht im eigenen Betrieb.
--     LESEN gibt es schon (mitarbeiter_select_personal). LÖSCHEN bleibt beim Chef.
--
-- Chef, Einladung über den Server (Dienstschlüssel) und SQL-Editor: unverändert.
-- Rückweg (NOTFALL, nur bei Problemen, entfernt nur diese Teile):
--   drop trigger if exists p181_besitzer on public.mitarbeiter;
--   drop trigger if exists p187d_ma_rechte_schuetzen on public.mitarbeiter;
--   drop policy if exists p187d_ma_insert on public.mitarbeiter;
--   drop policy if exists p187d_ma_update on public.mitarbeiter;
-- Mehrfach ausführbar.
-- ============================================================

create or replace function public.p187d_ma_rechte_schuetzen()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chef uuid;
  v_alt jsonb;
  v_fest jsonb;
begin
  begin
    v_chef := public.mein_chef_id();
  exception when others then
    v_chef := null;
  end;
  if v_chef is null then
    return new;   -- Chef, Server, SQL-Editor: unverändert
  end if;
  if tg_op = 'INSERT' then
    -- Rechte-Felder starten leer bzw. aus (fehlende Spalten werden übergangen)
    new := jsonb_populate_record(new, jsonb_build_object('darf_abrechnen', false, 'leitungsrolle', null));
    return new;
  end if;
  v_alt := to_jsonb(old);
  -- nur Spalten, die es gibt; der alte Wert gilt auch, wenn er leer war
  select coalesce(jsonb_object_agg(k, v_alt -> k), '{}'::jsonb) into v_fest
    from unnest(array['darf_abrechnen', 'leitungsrolle', 'nutzer_typ']) as k
   where v_alt ? k;
  if old.auth_user_id is not null and old.auth_user_id = auth.uid() then
    select v_fest || coalesce(jsonb_object_agg(k, v_alt -> k), '{}'::jsonb) into v_fest
      from unnest(array['status', 'austrittsdatum']) as k
     where v_alt ? k;
  end if;
  new := jsonb_populate_record(new, v_fest);
  return new;
end;
$$;

drop trigger if exists p181_besitzer on public.mitarbeiter;
create trigger p181_besitzer before insert or update on public.mitarbeiter
  for each row execute function public.p181_besitzer();

drop trigger if exists p187d_ma_rechte_schuetzen on public.mitarbeiter;
create trigger p187d_ma_rechte_schuetzen before insert or update on public.mitarbeiter
  for each row execute function public.p187d_ma_rechte_schuetzen();

drop policy if exists p187d_ma_insert on public.mitarbeiter;
create policy p187d_ma_insert on public.mitarbeiter for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('personal'));
drop policy if exists p187d_ma_update on public.mitarbeiter;
create policy p187d_ma_update on public.mitarbeiter for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('personal'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('personal'));

-- KONTROLLE — Erwartung: trigger = 3 (p169, p181, p187d), regeln = 2,
-- loeschregel = 0, falsch_angehaengt = 0, rls_an = true.
select
  (select count(*) from pg_trigger g join pg_class c on c.oid = g.tgrelid
    where c.relname = 'mitarbeiter' and g.tgname in ('p169_auth_user_id_schuetzen','p181_besitzer','p187d_ma_rechte_schuetzen')) as trigger,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'mitarbeiter' and policyname like 'p187d_ma_%') as regeln,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'mitarbeiter' and policyname like 'p187d_ma_%' and cmd = 'DELETE') as loeschregel,
  (select count(*) from public.mitarbeiter m join public.mitarbeiter b on b.auth_user_id = m.owner_user_id) as falsch_angehaengt,
  (select relrowsecurity from pg_class where oid = 'public.mitarbeiter'::regclass) as rls_an;
