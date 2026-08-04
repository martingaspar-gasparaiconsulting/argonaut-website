-- ============================================================================
-- ARGONAUT OS · Team-Chat · Mandantentrennung und Aufraeumrecht
-- Erstellt: 04.08.2026
--
-- WARUM DIESE DATEI EXISTIERT
--
-- Beide Einladen-Funktionen laufen mit SECURITY DEFINER — sie umgehen also
-- bewusst alle Zugriffsregeln. Sie pruefen bisher nur EINES: ob der Aufrufer
-- den Kanal erstellt hat. Sie pruefen NICHT, ob die eingeladene Person
-- ueberhaupt zum selben Betrieb gehoert.
--
--   chat_mitglied_per_email  sucht in ALLEN auth.users nach der Adresse
--   chat_mitglied_hinzufuegen nimmt JEDE beliebige Nutzer-ID entgegen
--
-- Damit kann ein Kunde eine Person aus einem fremden Betrieb in seinen Kanal
-- holen. Ab diesem Moment liest sie dort jede Nachricht mit. Die Oberflaeche
-- bietet zwar nur eigene Kollegen an — aber die Funktion ist ueber die
-- oeffentliche API direkt aufrufbar, die Oberflaeche schuetzt also nichts.
--
-- Diese Datei zieht die Betriebsgrenze dort ein, wo sie hingehoert: in die
-- Funktion selbst.
--
-- AUSFUEHREN: Supabase -> SQL Editor -> alles einfuegen -> Run.
-- Gefahrlos wiederholbar (CREATE OR REPLACE / DROP IF EXISTS).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Helfer: zu welchem Betrieb gehoert ein Nutzer?
--
-- Chef        -> hat keine Zeile in `mitarbeiter`, sein Betrieb ist er selbst
-- Mitarbeiter -> Betrieb ist owner_user_id seiner mitarbeiter-Zeile
--
-- Dieselbe Logik steckte bisher kopiert in chat_team_kollegen. Einmal zentral
-- ist besser: wenn sich das Modell aendert, aendert es sich an einer Stelle.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_betrieb_von(p_user uuid)
  RETURNS uuid
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  select coalesce(
    (select m.owner_user_id from public.mitarbeiter m
      where m.auth_user_id = p_user limit 1),
    p_user
  );
$function$;


-- ---------------------------------------------------------------------------
-- 2. Kollege per Klick einladen — jetzt mit Betriebsgrenze
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_mitglied_hinzufuegen(p_kanal uuid, p_user uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
declare
  v_ersteller uuid;
  v_anzeige   text;
begin
  select erstellt_von into v_ersteller from public.chat_kanaele where id = p_kanal;
  if v_ersteller is null then
    return 'Kanal nicht gefunden.';
  end if;

  if v_ersteller <> auth.uid() then
    return 'Nur der Moderator des Kanals darf Kollegen einladen.';
  end if;

  -- NEU: beide muessen zum selben Betrieb gehoeren.
  if public.chat_betrieb_von(p_user) is distinct from public.chat_betrieb_von(auth.uid()) then
    return 'Diese Person gehoert nicht zu deinem Betrieb.';
  end if;

  select trim(coalesce(vorname,'') || ' ' || coalesce(nachname,''))
    into v_anzeige from public.mitarbeiter where auth_user_id = p_user limit 1;

  insert into public.chat_mitglieder (kanal_id, user_id, anzeigename)
  values (p_kanal, p_user, nullif(v_anzeige, ''))
  on conflict (kanal_id, user_id) do nothing;

  return 'ok';
end;
$function$;


-- ---------------------------------------------------------------------------
-- 3. Einladen per E-Mail — jetzt mit Betriebsgrenze
--
-- Zusaetzlich gehaertet: die Antwort unterscheidet nicht mehr zwischen
-- „Adresse gibt es nicht" und „Adresse gehoert zu einem anderen Betrieb".
-- Sonst waere die Funktion ein bequemes Werkzeug, um herauszufinden, welche
-- Firmen ARGONAUT einsetzen.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_mitglied_per_email(p_kanal uuid, p_email text)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
declare
  v_user      uuid;
  v_ersteller uuid;
begin
  select erstellt_von into v_ersteller from public.chat_kanaele where id = p_kanal;
  if v_ersteller is null then
    return 'Kanal nicht gefunden.';
  end if;

  if v_ersteller <> auth.uid() then
    return 'Nur der Ersteller des Kanals darf Kollegen einladen.';
  end if;

  select id into v_user from auth.users
   where lower(email) = lower(trim(p_email));

  -- NEU: unbekannt UND fremder Betrieb geben dieselbe Antwort.
  if v_user is null
     or public.chat_betrieb_von(v_user) is distinct from public.chat_betrieb_von(auth.uid()) then
    return 'Kein Kollege mit dieser E-Mail in deinem Betrieb gefunden.';
  end if;

  insert into public.chat_mitglieder (kanal_id, user_id)
  values (p_kanal, v_user)
  on conflict (kanal_id, user_id) do nothing;

  return 'ok';
end;
$function$;


-- ---------------------------------------------------------------------------
-- 4. KI-Nachrichten loeschbar machen
--
-- Bisher: `absender_id = auth.uid()`. ARGONAUT-Antworten haben absender_id NULL
-- und liessen sich deshalb von niemandem entfernen — sie standen fuer immer im
-- Kanal. Neu darf zusaetzlich der Ersteller des Kanals aufraeumen.
-- ---------------------------------------------------------------------------
drop policy if exists nachrichten_delete on public.chat_nachrichten;
create policy nachrichten_delete on public.chat_nachrichten
  as PERMISSIVE for DELETE to public
  using (
    absender_id = auth.uid()
    or exists (
      select 1 from public.chat_kanaele k
       where k.id = chat_nachrichten.kanal_id
         and k.erstellt_von = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 5. Gegenprobe — nach dem Ausfuehren einmal laufen lassen
--
-- Erwartet: drei Zeilen, alle mit prosecdef = true.
-- ---------------------------------------------------------------------------
-- select proname, prosecdef
--   from pg_proc
--  where proname in ('chat_betrieb_von','chat_mitglied_hinzufuegen','chat_mitglied_per_email')
--  order by proname;
