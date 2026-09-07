# Team-Chat — Untersuchungsnotiz (bekanntes Problem)

Status: **am Code nachgeprüft am 07.09.2026 — die ursprüngliche Verdachtsliste war
falsch.** Die Notiz stand seit dem 25.07. unverändert; seither wurde der Chat am
02./04.08. überarbeitet. Wer die alte Liste abarbeitet, sucht an der falschen
Stelle und baut im schlimmsten Fall die Rechte um, die heute korrekt sind.

Betroffen: `app/dashboard/team-chat/page.tsx` und `app/api/team-chat-ki`.

## Was der Code heute wirklich macht

Der Team-Chat ist **nicht** nach `owner_user_id` getrennt, sondern nach
**Kanal-Mitgliedschaft**. Drei Tabellen: `chat_kanaele`, `chat_mitglieder`,
`chat_nachrichten`.

| Punkt | Stand |
|---|---|
| SELECT auf `chat_nachrichten` | `ist_chat_mitglied(kanal_id, auth.uid())` — greift für Chef **und** Mitarbeiter gleich |
| INSERT | `ist_chat_mitglied(...)` **und** (`absender_id = auth.uid()` oder `ist_ki = true`) |
| Betriebsgrenze beim Einladen | seit 04.08. in `chat_betrieb_von()`, siehe `supabase-sql/team-chat-mandantentrennung.sql` |
| Realtime | `supabase.channel('teamchat-<kanal>')` mit `postgres_changes`-Abo auf INSERT, gefiltert auf `kanal_id` |
| Ausfallsicherung | zusätzlich ein 8-Sekunden-Takt, der nachlädt, falls die Live-Verbindung nicht steht |

## Damit sind die alten Verdachtspunkte 1 bis 4 erledigt

Sie gingen alle von einem Mandantenmodell über `owner_user_id` /
`mein_chef_id()` aus. Dieses Modell benutzt der Chat nicht.
**Nicht danach umbauen.**

## Was als Erklärung übrig bleibt

**Der Mitarbeiter ist kein Mitglied des Kanals.** Wer nicht in
`chat_mitglieder` steht, sieht den Kanal nicht und keine einzige Nachricht darin
— völlig korrekt nach der Policy, aber von außen sieht es aus wie ein Fehler.
Genau das passt zum beobachteten Bild.

Das ist keine Code-Frage, sondern eine Datenfrage. Sie lässt sich nur mit zwei
echten Logins beantworten — **gehört damit in den Testtag (M18)**, nicht in
einen Push.

## Prüfschritte am Testtag

1. Als Chef einen Kanal anlegen, Mitarbeiter über „Kollegen einladen" hinzufügen.
2. Als Mitarbeiter (zweiter Login) einloggen: erscheint der Kanal in der Liste?
   - **Nein** → er steht nicht in `chat_mitglieder`. Der Einlade-Weg ist die
     Ursache, nicht die Anzeige.
   - **Ja, aber leer** → dann und nur dann ist es die Policy.
3. Beide Fenster nebeneinander, eine Nachricht schreiben: kommt sie beim anderen
   binnen 8 Sekunden an? Wenn ja, arbeitet der Nachlade-Takt und die
   Live-Verbindung steht nicht — kein Datenverlust, nur Verzögerung.
4. Browser-Konsole offen lassen und auf `42501` (RLS), 401 oder 403 achten.

## Nicht die Ursache

Die KI-Absicherung (`lib/ki.ts`, Rate-Limit) betrifft nur `/api/team-chat-ki`,
also den Assistenten im Chat. Ein KI-Fehler legt das Senden und Empfangen nicht
lahm.
