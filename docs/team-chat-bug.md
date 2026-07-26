# Team-Chat — Untersuchungsnotiz (bekanntes Problem)

Status: **dokumentiert, noch nicht behoben.** Bewusste Entscheidung: nicht blind
fixen, sondern erst am laufenden System reproduzieren, weil ein Blind-Fix an
RLS/Realtime mehr kaputt machen als heilen kann.

Betroffen: `app/dashboard/team-chat/page.tsx` und `app/api/team-chat-ki`.

## So reproduzieren

1. Als Chef eine Nachricht schreiben → erscheint sie sofort?
2. Als eingeladener Mitarbeiter (zweiter Login, gleicher Betrieb) dieselbe
   Unterhaltung öffnen → sieht er die Nachricht des Chefs? Und umgekehrt?
3. Browser-Konsole (F12) offen lassen und auf rote Fehler / 401 / 403 / 42501
   (RLS) achten. Diese Meldung an die Entwicklung geben — sie zeigt die Ursache.

## Wahrscheinlichste Ursachen (in dieser Reihenfolge prüfen)

1. **RLS trennt Chef und Mitarbeiter falsch.**
   Der Team-Chat muss für *alle* im selben Betrieb sichtbar sein. Prüfen, ob die
   `select`-Policy der Chat-Tabelle auf `owner_user_id = mein_chef_id()` läuft
   (Tenant), NICHT auf `auth.uid() = owner_user_id` (dann sieht nur der Chef
   seine eigenen Zeilen und der Mitarbeiter gar nichts).
   → Gegenprobe: kurz RLS testweise in einer Kopie lockern; erscheinen dann alle
   Nachrichten, ist es zu 90 % die Policy.

2. **`mein_chef_id()` liefert für den Chef nicht seine eigene ID.**
   Beim Chef muss der Helfer die *eigene* User-ID zurückgeben, beim Mitarbeiter
   die ID seines Chefs. Gibt er beim Chef `null` zurück, matcht keine Zeile.

3. **Insert schreibt ein falsches/leeres `owner_user_id`.**
   Schreibt ein Mitarbeiter, muss `owner_user_id` = Chef-ID gesetzt werden (nicht
   die eigene), sonst landet die Nachricht in einem „fremden" Tenant und ist für
   die anderen unsichtbar. Insert-Payload prüfen.

4. **Realtime-Subscription ohne Tenant-Filter oder gar nicht abonniert.**
   Wenn Nachrichten erst nach manuellem Neuladen erscheinen, fehlt das
   `supabase.channel(...).on('postgres_changes', …)`-Abo oder es filtert nicht
   auf den Betrieb. Neu eintreffende Zeilen kommen dann nicht live an.

5. **Sender-Name/-Zuordnung leer.** Wenn Nachrichten da sind, aber „Unbekannt"
   als Absender zeigen, fehlt das Auflösen der Absender-ID auf den Namen
   (Kontakt-/Mitarbeiter-Map), analog zu CRM/Mahnwesen.

## Nicht die Ursache (bereits ausgeschlossen bzw. unwahrscheinlich)

- Die zentrale KI-Absicherung (`lib/ki.ts`, Rate-Limit) betrifft nur
  `/api/team-chat-ki` (den KI-Assistenten im Chat), nicht das reine
  Senden/Empfangen von Nachrichten. Ein KI-Fehler legt den Chat selbst nicht lahm.

## Nächster Schritt

Am Live-System Schritt 1–3 durchspielen, die konkrete Konsolen-/DB-Fehlermeldung
festhalten, dann gezielt die passende Ursache oben beheben und mit zwei echten
Logins (Chef + Mitarbeiter) gegenprüfen.
