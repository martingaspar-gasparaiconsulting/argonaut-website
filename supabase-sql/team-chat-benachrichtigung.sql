-- ============================================================================
-- ARGONAUT OS · Team-Chat · Benachrichtigung bei neuer Nachricht
-- Erstellt: 04.08.2026
--
-- DAS PROBLEM
--
-- Im Laden ist Betrieb. Niemand geht ans Telefon, niemand klickt in den
-- Team-Chat. Der fuellt sich, und keiner sieht es. Damit ist ein Chat, den
-- niemand oeffnet, wertlos — egal wie gut er funktioniert.
--
-- DIE LOESUNG
--
-- Es gibt bereits eine fertige Benachrichtigungs-Anlage:
--   · Tabelle  public.benachrichtigungen
--   · Funktion public.benachrichtigung_erstellen(...)
--   · Glocke   app/dashboard/Glocke.tsx  (steht im Kopf JEDER Dashboard-Seite)
--
-- Benutzt hat sie bisher genau EIN Ausloeser: ueberfaellige Rechnungen. Der
-- Team-Chat schreibt nichts hinein. Diese Datei haengt ihn an.
--
-- ENTSCHEIDUNG ZUR MENGE
--
-- Nicht eine Meldung je Nachricht — bei 40 Nachrichten am Vormittag waere die
-- Glocke unbrauchbar. Stattdessen: EINE ungelesene Meldung je Kanal. Solange
-- sie ungelesen ist, kommt keine zweite dazu; ihr Text wird nur aktualisiert
-- ("3 neue Nachrichten"). Sobald der Nutzer sie gelesen hat, loest die naechste
-- Nachricht wieder eine neue Meldung aus.
--
-- AUSFUEHREN: Supabase -> SQL Editor -> alles einfuegen -> Run.
-- Gefahrlos wiederholbar.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Der Ausloeser
--
-- Laeuft nach jedem INSERT in chat_nachrichten und legt fuer jedes Mitglied
-- des Kanals AUSSER dem Absender eine Meldung an.
--
-- SECURITY DEFINER, weil die Funktion in die Zeilen anderer Nutzer schreibt —
-- das duerfte der Absender ueber seine eigenen Rechte nie.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_nachricht_benachrichtigen()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
declare
  v_kanal   text;
  v_mitglied record;
  v_offen   uuid;
  v_anzahl  int;
  v_auszug  text;
begin
  select name into v_kanal from public.chat_kanaele where id = new.kanal_id;
  v_kanal := coalesce(v_kanal, 'Team-Chat');

  -- Kurzer Auszug fuer die Vorschau. Dateien haben keinen Text.
  v_auszug := nullif(trim(coalesce(new.text, '')), '');
  if v_auszug is null then
    v_auszug := coalesce('📎 ' || new.datei_name, 'Neue Nachricht');
  end if;
  if length(v_auszug) > 90 then
    v_auszug := left(v_auszug, 87) || '…';
  end if;

  for v_mitglied in
    select cm.user_id
      from public.chat_mitglieder cm
     where cm.kanal_id = new.kanal_id
       and cm.user_id is distinct from new.absender_id
  loop
    -- Gibt es fuer diesen Kanal schon eine UNGELESENE Meldung?
    select b.id into v_offen
      from public.benachrichtigungen b
     where b.owner_user_id = v_mitglied.user_id
       and b.typ = 'team_chat'
       and b.ref_id = new.kanal_id::text
       and b.gelesen = false
     limit 1;

    if v_offen is not null then
      -- Ja -> nur mitzaehlen, keine zweite Zeile in der Glocke.
      select coalesce(nullif(regexp_replace(split_part(titel, ' ', 1), '\D', '', 'g'), '')::int, 1)
        into v_anzahl
        from public.benachrichtigungen where id = v_offen;

      update public.benachrichtigungen
         set titel      = (v_anzahl + 1) || ' neue Nachrichten in „' || v_kanal || '"',
             nachricht  = new.absender_name || ': ' || v_auszug,
             gelesen    = false,
             created_at = now()
       where id = v_offen;
    else
      -- Nein -> neue Meldung anlegen.
      insert into public.benachrichtigungen
        (owner_user_id, typ, titel, nachricht, link, ref_tabelle, ref_id, gelesen)
      values
        (v_mitglied.user_id,
         'team_chat',
         '1 neue Nachricht in „' || v_kanal || '"',
         new.absender_name || ': ' || v_auszug,
         '/dashboard/team-chat',
         'chat_nachrichten',
         new.kanal_id::text,
         false);
    end if;
  end loop;

  return new;
exception when others then
  -- Eine fehlgeschlagene Meldung darf NIE das Senden der Nachricht verhindern.
  -- Lieber keine Glocke als ein Chat, der nicht mehr schreibt.
  return new;
end;
$function$;

drop trigger if exists trg_chat_nachricht_benachrichtigen on public.chat_nachrichten;
CREATE TRIGGER trg_chat_nachricht_benachrichtigen
  AFTER INSERT ON public.chat_nachrichten
  FOR EACH ROW EXECUTE FUNCTION public.chat_nachricht_benachrichtigen();


-- ---------------------------------------------------------------------------
-- 2. Beim Oeffnen eines Kanals dessen Meldungen als gelesen markieren
--
-- Wird von der Team-Chat-Seite aufgerufen, sobald ein Kanal angezeigt wird.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_kanal_gelesen(p_kanal uuid)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  update public.benachrichtigungen
     set gelesen = true
   where owner_user_id = auth.uid()
     and typ = 'team_chat'
     and ref_id = p_kanal::text
     and gelesen = false;
$function$;


-- ---------------------------------------------------------------------------
-- 3. Zaehler fuer den roten Punkt am Menue-Knopf
--
-- Eine Zahl, ein Aufruf — nicht die ganze Liste laden, nur um zu wissen,
-- ob ein Punkt leuchten soll.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_ungelesen_anzahl()
  RETURNS integer
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  select coalesce(count(*), 0)::int
    from public.benachrichtigungen
   where owner_user_id = auth.uid()
     and typ = 'team_chat'
     and gelesen = false;
$function$;


-- ---------------------------------------------------------------------------
-- 4. Gegenprobe
--
-- Nach dem Ausfuehren im zweiten Fenster eine Nachricht schreiben. Dann hier:
-- ---------------------------------------------------------------------------
-- select titel, nachricht, gelesen, created_at
--   from public.benachrichtigungen
--  where typ = 'team_chat'
--  order by created_at desc limit 10;
