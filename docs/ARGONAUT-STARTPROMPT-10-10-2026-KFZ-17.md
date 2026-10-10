# ARGONAUT · Startprompt KFZ-17 (10.10.2026, spaetnachmittags)

Neuer Chat. Zuerst Skill „argonaut-chatstart" (beide Ordner freigeben), dann diese Datei lesen, dann loslegen.
Alle Regeln gelten unverändert: Deutsch, nur CMD, „Sie" in Kundentexten, „Bausteine" (nie „KI-Agenten"),
_pNNN.bat nie überschreiben und jede nur EINMAL starten, Prüf-Kette mit Gegenproben, gezielter git add,
SQL immer vollständig im Chat, Aussperr-Risiken vorher nennen und getrennt liefern, nur bei „Feierabend" stoppen.
Während Martin eine _pNNN.bat laufen lässt, NIE Dateien aufs Gerät schreiben. Vorher origin pullen und Gerät = HEAD per md5 prüfen.
Vor jedem Bauliste-Publish das Artifact lesen und vergleichen. Baulog: /areas/argonaut-bauliste-1009.md.
NICHT pushen aus dem Klon (Änderungen dort per git stash weglegen). Wächter: kein eigener Zahlen-Leser, kein Math.round(x * 100) / 100.
Bei zwei Pushes in einer Lieferung ausdrücklich sagen „_p2 erst starten, wenn _p1 ‚ist gepusht' meldet".

## Stand
- Live 10.10.: P302 J1 Jobticket, Dienstrad, Mobilitaet (b9f90d7, SQL 1|4|1) — /dashboard/personal/mobilitaet, lib/mobilitaet.ts.
- P303 N1a Betriebs-Netzwerk fuer alle Branchen: auf dem Geraet (_p303.bat), SQL supabase-sql/p303-netzwerk-alle.sql
  (Kontrolle: arten t | titel_spalte 1 | hilfen 5 | regeln 6/2/2/2 | hilfen_fuer_angemeldete f).
  Erst pruefen, ob P303 live ist (git log origin/main), sonst Martin fragen.
  Inhalt: partner_auftrag.bezug_typ + projekt|auftrag|objekt, bezug_titel; p303_modul (projekt->projekte, auftrag->auftraege,
  objekt->objektzeiten, Tabelle objekte), p303_bezug (Zeile als JSON, owner-Pruefung), p303_darf_auftrag (Auftraggeber: Modul des Bezugs;
  Partner: kfz bzw. eines von projekte/auftraege/objektzeiten), p303_darf_uebernehmen, p303_link; p278/p279-Funktionen mit gleicher
  Schnittstelle ersetzt; Fahrzeugkosten nur bei Kfz; Zugriffsregeln je Art. UI: app/dashboard/netzwerk/PartnerHub.tsx (gemeinsam fuer
  /dashboard/kfz/partner ort=kfz und /dashboard/netzwerk), PartnerAuftraege.tsx (KfzPartner ist jetzt Wrapper), /dashboard/netzwerk/bezug
  (Auswahl + Panel), GastAnsicht zeigt Bezug statt „Fahrzeug". NAV „🤝 Betriebs-Netzwerk" (Gruppe betrieb, ohne Modul-Schluessel:
  Chef immer, Mitarbeiter sehen es nicht im Menue). Test-PG: 39 Faelle ok. tests/netzwerkP303 (5), 16 Gegenproben rot.
- Bauliste: 140 von 184 nach P303 (Zeile 303 live, N1b naechster). Artifact X2y63fejjA6Qi6pSyxZP8T erst nach Live neu veroeffentlichen
  (gen.py-Kopf im Repo „_p303 unterwegs"; fuer das Artifact Kopf „P303 live · naechster N1b" lokal setzen, nicht committen).

## Naechstes Paket: P304 N1b Netzwerk-Knoepfe (1 Push, kein SQL noetig)
Knopf „🤝 An Partner geben" + Zaehler laufender Partner-Auftraege in /dashboard/projekte/[id], /dashboard/auftraege/[id] und
/dashboard/objektzeiten (je Objekt) -> /dashboard/netzwerk/bezug?typ=…&id=…. Optional: Mitarbeiter-Menue fuer Netzwerk
(heute nur Chef; Idee: Eintrag mit modul 'projekte' doppeln oder „immer" mit Rechte-Hinweis) — Martin fragen.
Danach: SP1 „Was ARGONAUT Ihnen gespart hat" (1), dann D1, C1, BV2, PS-1, BV2b, BV3.

## Arbeitsumgebung (kein device_bash)
- Klon: `env -u GH_TOKEN git clone https://github.com/martingaspar-gasparaiconsulting/argonaut-website.git klon`, `npm ci`.
  Font-Mock: docs\intern\dossier-werkzeug\fontmock.js nach /home/claude/fontmock/mock.js stagen.
- Build: `NODE_OPTIONS=--max-old-space-size=6144 NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/home/claude/fontmock/mock.js NEXT_PUBLIC_SUPABASE_URL=https://platzhalter.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=platzhalter SUPABASE_URL=https://platzhalter.supabase.co SUPABASE_SERVICE_ROLE_KEY=platzhalter
  NEXT_PUBLIC_SITE_URL=https://argonaut-os.com npx next build --webpack` (ohne NODE_OPTIONS einmal SIGKILL). tsc mit timeout 590.
- Test-PG: Postgres 16 (/usr/lib/postgresql/16/bin; initdb -D /tmp/pgdata als postgres, -p 5499 -k /tmp/pg), Stubs: Rollen
  anon/authenticated/service_role, Schemas auth/storage, auth.uid() aus request.jwt.claim.sub, mitarbeiter, ma_recht, mein_chef_id,
  darf_ich_modul_aendern/sehen, darf_ich_abrechnen; fuer Netzwerk zusaetzlich profiles, kfz_bestand(+medien,+kosten), eingangsbelege,
  benachrichtigungen, projekte, auftraege, objekte, storage.buckets/objects, p181_besitzer (aus p181-besitzer-betrieb-3.sql).
- npm test: 1 bekannter Container-Fehler (Windows-1252). _pNNN.bat aus der vorigen ableiten (CRLF, nur ASCII, GIT_LITERAL_PATHSPECS=1).
- Device-Schreiben: nach /mnt/user-data/outputs/pNNN/... kopieren, dann device_commit_files (expectedMtimeMs bei bestehenden Dateien).
- Neuer rechnung-aus-*-Weg: Zaehler (jetzt 22) in tests/darfAbrechnen + tests/b1b2GeldKontakte erhoehen.
