// ============================================================================
// ARGONAUT OS · lib/guideWissen.ts — Wissensbasis des Assistenten (Paket A2)
//
// WARUM
// Der Guide hatte fuer 24 Seiten einen Text, fuer alle anderen denselben
// Einheitssatz. Diese Datei haelt fuer JEDE Seite fest, was der Assistent
// sagen darf — und nur das. Jeder Eintrag wurde am echten Seiten-Code
// geprueft (Knoepfe, Tabellen, Zugriffsregeln). Die KI erfindet nichts dazu:
// Guide und Chat lesen ausschliesslich von hier.
//
// FESTE REGEL: Der Assistent SAGT nur. Er traegt nie selbst etwas ein, legt
// nichts an und loescht nichts. Deshalb steht hier nirgends eine Aktion,
// nur Text und Links zum Hinfuehren.
//
// AUFBAU JE SEITE
//   zweck      — wofuer die Seite da ist (1–2 Saetze)
//   wer        — wer hier eintraegt: 'chef' | 'mitarbeiter' | 'beide' | 'lesen'
//   werText    — derselbe Punkt ausgeschrieben, inkl. wer loeschen darf
//   schritte   — Schritt fuer Schritt, so dass keine Frage offen bleibt
//   probe      — wie man einen Probe-Eintrag anlegt und wieder los wird
//   landetIn   — wohin die Daten weiterlaufen (mit Link zum Hinfuehren)
//   vorher     — was vorher erledigt sein muss
//
// Reine Daten + Nachschlage-Logik. KEINE Hooks, KEIN Supabase.
// Getestet in tests/guideWissenA2.test.mjs (u. a.: jeder Link zeigt auf eine
// echte Menue-Seite, Sie-Form, kein „Agent").
// „Sie" durchgehend. Nie „KI-Agenten" — es heisst Baustein.
// ============================================================================

export type Wer = 'chef' | 'mitarbeiter' | 'beide' | 'lesen';

export type Verweis = { text: string; href?: string };

export type SeitenWissen = {
  zweck: string;
  wer: Wer;
  werText: string;
  schritte: string[];
  probe?: { anlegen: string; loeschen: string };
  landetIn?: Verweis[];
  vorher?: Verweis[];
};

export const WER_TEXT: Record<Wer, string> = {
  chef: 'Trägt der Chef ein',
  mitarbeiter: 'Trägt jeder Mitarbeiter selbst ein',
  beide: 'Chef und Mitarbeiter tragen ein',
  lesen: 'Zum Nachsehen — hier wird nichts eingetragen',
};

/** Die Uebungswelt: der sichere Weg fuer Probe-Eintraege im ganzen System. */
export const UEBUNGSWELT_HINWEIS =
  'Gefahrlos ausprobieren: Unter „Erste Schritte" lädt der Chef mit „🎁 Übungswelt laden" Beispieldaten in alle Bereiche — ein Klick auf „Übungswelt entfernen" nimmt sie restlos wieder heraus. Echte Daten werden dabei nicht angefasst.';

// ---------------------------------------------------------------------------
// Wo fange ich an? — feste Startreihenfolge
// ---------------------------------------------------------------------------

export type StartSchritt = { text: string; href: string; warum: string };

export const START_CHEF: StartSchritt[] = [
  { text: 'Firmendaten, Logo und Branche hinterlegen', href: '/dashboard/onboarding', warum: 'Davon hängen Rechnungen, Briefköpfe und die branchentypischen Bausteine ab.' },
  { text: 'Übungswelt laden und sich einmal durchklicken', href: '/dashboard/onboarding', warum: 'So sehen Sie, wo was ankommt — und entfernen alles mit einem Klick.' },
  { text: 'Mitarbeiter anlegen und die Personalakte vervollständigen', href: '/dashboard/personal', warum: 'Die Ampel in jeder Personalakte zeigt, was noch fehlt: Vertrag, Arbeitszeit, Steuer-ID, Unterweisung.' },
  { text: 'Festlegen, wer was sieht', href: '/dashboard/rechte', warum: 'Erst die Rechte, dann die Einladung — sonst sieht jemand zu viel oder zu wenig.' },
  { text: 'Mitarbeiter zu „Mein Bereich" einladen', href: '/dashboard/personal', warum: 'Knopf „Zum Self-Service einladen" in den Stammdaten der Person.' },
  { text: 'Kunden anlegen oder importieren', href: '/dashboard/crm', warum: 'Jeder Kunde steht danach in Terminen, Angeboten und Rechnungen zur Auswahl.' },
];

export const START_MITARBEITER: StartSchritt[] = [
  { text: '„Mein Bereich" öffnen und prüfen, ob Ihre Daten stimmen', href: '/dashboard/mein-bereich', warum: 'Ihre Stammdaten und Ihren Urlaubsanspruch trägt der Chef ein — Fehler bitte ihm melden.' },
  { text: 'Zeiterfassung: zu Arbeitsbeginn „Kommen" drücken', href: '/dashboard/zeiterfassung', warum: 'Das ist Ihre gesetzliche Arbeitszeitaufzeichnung — auch ohne Netz.' },
  { text: '„Meine Einsätze" ansehen', href: '/dashboard/meine-einsaetze', warum: 'Hier stehen die Aufträge, die der Chef Ihnen im Dispo-Board zugeteilt hat.' },
  { text: 'Formulare & Checklisten ausfüllen, wenn der Chef welche vorgibt', href: '/dashboard/formulare', warum: 'Übergabe, Abnahme, Tagescheck — mit Foto und Unterschrift.' },
  { text: 'Team-Chat für Absprachen nutzen', href: '/dashboard/team-chat', warum: 'Statt privater Messenger: alles bleibt im Betrieb.' },
  { text: 'Academy: die Schulungen durcharbeiten', href: '/dashboard/academy', warum: 'Jeder abgeschlossene Kurs bringt Sie einen Rang weiter.' },
];

// ---------------------------------------------------------------------------
// Die Seiten. Schluessel = Pfad aus lib/rechte.ts NAV_LINKS.
// Teil A2a: Start, Mein Bereich, Kommunikation & Wissen, Termine & Planung.
// ---------------------------------------------------------------------------

export const WISSEN: Record<string, SeitenWissen> = {
  // --- Start ---------------------------------------------------------------
  '/dashboard': {
    zweck: 'Die Übersicht holt Live-Zahlen aus allen freigeschalteten Bausteinen: offene Rechnungen, Aufträge, Leads, Projekte und was in den letzten 24 Stunden passiert ist. Mitarbeiter sehen eine schlanke Fassung ohne Geldzahlen.',
    wer: 'lesen',
    werText: 'Hier wird nichts eingetragen. Die Zahlen entstehen dort, wo gearbeitet wird.',
    schritte: [
      'Jede Kachel ist klickbar und führt in den Bereich, aus dem die Zahl kommt',
      'Unter „Letzte 24 Stunden" sehen Sie, was sich zuletzt getan hat',
      'Für die Tagesarbeit lieber „Heute" öffnen — dort steht, was fällig ist',
    ],
    landetIn: [{ text: 'Heute', href: '/dashboard/heute' }],
  },
  '/dashboard/heute': {
    zweck: 'Alle Ampeln aus allen Bausteinen an einem Ort, nach Dringlichkeit sortiert: fällige Rechnungen, Wartungen, HU/AU, Fristen, MHD, ablaufende Angebote, offene Signaturen.',
    wer: 'lesen',
    werText: 'Hier wird nichts eingetragen — erledigt wird am Ursprungsort, dann verschwindet der Eintrag hier von selbst.',
    schritte: [
      'Oben stehen die dringendsten Punkte — von oben nach unten abarbeiten',
      'Ein Klick auf einen Eintrag führt direkt an die Stelle, wo er erledigt wird',
      'Fehlt ein Bereich, ist er für Sie nicht freigeschaltet oder noch leer',
    ],
  },
  '/dashboard/chef-blick': {
    zweck: 'Ihr Morgen-Briefing zum Vorlesen, die Auslastung Ihrer Monteure für acht Wochen, Frühwarnungen je Projekt und eine druckfertige Bank-Mappe (Umsatz, Forderungen, Zahlungsdauer).',
    wer: 'lesen',
    werText: 'Nur für den Chef. Die Zahlen kommen aus Dispo, Projekten, Mängeln, Nachträgen und Rechnungen.',
    schritte: [
      'Morgen-Briefing vorlesen lassen — ein Satz mit dem Wichtigsten des Tages',
      'Auslastung: gelb ab 80 %, rot über 100 % — Soll kommt aus den Wochenstunden in der Personalakte',
      'Frühwarnung anklicken, um das Projekt zu öffnen',
      'Bank-Mappe mit „🖨 Drucken / als PDF speichern" für Bankgespräche',
    ],
    vorher: [{ text: 'Wochenstunden je Mitarbeiter in der Personalakte', href: '/dashboard/personal' }, { text: 'Einsätze im Dispo-Board', href: '/dashboard/dispo' }],
  },
  '/dashboard/suche': {
    zweck: 'Ein Suchfeld für Kunden, Rechnungen, Angebote, Aufträge, Projekte und Leads gleichzeitig. Jeder findet nur, was er sehen darf.',
    wer: 'lesen',
    werText: 'Nur suchen, nichts eintragen.',
    schritte: ['Name, Nummer oder Stichwort eintippen', 'Treffer sind nach Bereich gruppiert', 'Ein Klick öffnet den Eintrag an seinem Platz'],
  },
  '/dashboard/onboarding': {
    zweck: 'Die geführte Startstrecke: Grundschritte für jeden Betrieb plus Schritte passend zu Ihrer Branche, jeweils mit „So geht\'s"-Anleitung. Hier liegt auch die Übungswelt.',
    wer: 'chef',
    werText: 'Der Chef richtet ein. Erledigte Schritte erkennt das System teils selbst (Firmendaten, IBAN, erste Rechnung).',
    schritte: [
      'Oben „🎁 Übungswelt laden", um alles gefahrlos mit Beispieldaten auszuprobieren',
      'Dann die Schritte von oben nach unten: zuerst Firmendaten und Logo unter Einstellungen',
      'Bei jedem Schritt „So geht\'s" aufklappen — dort steht, wo genau Sie klicken',
      'Vorhandene Daten (Kunden, Artikel) lieber importieren als abtippen',
      'Zum Schluss „Übungswelt entfernen" — dann bleiben nur Ihre echten Daten',
    ],
    probe: { anlegen: 'Die Übungswelt ist der Probe-Eintrag für das ganze System.', loeschen: '„Übungswelt entfernen" nimmt alle Beispieldaten auf einmal heraus.' },
    landetIn: [{ text: 'Einstellungen', href: '/dashboard/einstellungen' }, { text: 'Import', href: '/dashboard/import' }],
  },

  // --- Mein Bereich --------------------------------------------------------
  '/dashboard/mein-bereich': {
    zweck: 'Der persönliche Bereich jedes Mitarbeiters: Stammdaten, Resturlaub, Arbeitszeit, Schichten, Urlaubsantrag, Krankmeldung, Schulungen, Checklisten und „Meine Unterlagen".',
    wer: 'beide',
    werText: 'Stammdaten, Urlaubsanspruch und Unterlagen trägt der CHEF unter Personal ein. Der MITARBEITER beantragt hier Urlaub, meldet sich krank und bestätigt Checklisten. Löschen kann der Mitarbeiter hier nichts.',
    schritte: [
      'Oben prüfen: Stimmen Name, Eintritt und Urlaubsanspruch? Wenn nicht, dem Chef Bescheid geben',
      '„Urlaub beantragen": Von/Bis wählen — der Antrag erscheint beim Chef unter Personal → Person → Abwesenheiten mit dem Knopf „Genehmigen"',
      '„Krankmeldung": sich am ersten Tag sofort krank melden. Die Krankschreibung ruft Ihr Betrieb seit 2023 elektronisch bei Ihrer Krankenkasse ab — die Datei hochzuladen ist freiwillig, nur als zusätzlicher Nachweis (bei Privatversicherten oder Ärzten ohne elektronische Meldung bitte hochladen)',
      '„Meine Unterlagen": Vertrag, Lohnabrechnungen und Zeugnisse, sobald der Chef sie freigibt',
      '„Meine Checkliste": Punkte des Einstiegs lesen und am Ende selbst bestätigen',
    ],
    probe: { anlegen: 'Einen Urlaubsantrag für einen Tag weit in der Zukunft stellen.', loeschen: 'Der Chef lehnt ihn unter Personal → Person → Abwesenheiten ab oder löscht ihn dort — der Mitarbeiter selbst kann nicht löschen.' },
    landetIn: [{ text: 'Personal → Abwesenheiten (beim Chef)', href: '/dashboard/personal' }, { text: 'Zeiterfassung', href: '/dashboard/zeiterfassung' }],
    vorher: [{ text: 'Chef hat die Person angelegt und eingeladen', href: '/dashboard/personal' }],
  },
  '/dashboard/zeiterfassung': {
    zweck: 'Die Stempeluhr: Kommen, Pause, Gehen. Jeder stempelt seine eigene Zeit, auch im Funkloch — die Buchung geht raus, sobald wieder Netz da ist, mit der echten Uhrzeit.',
    wer: 'mitarbeiter',
    werText: 'Jeder Mitarbeiter stempelt für sich selbst. Nach „Gehen" ist der Tag für den Mitarbeiter gesperrt — Korrekturen macht der Chef unter Personal → Person → Zeiterfassung, jede Änderung wird protokolliert.',
    schritte: [
      'Zu Arbeitsbeginn „▶ Kommen"',
      'Pause: „❚❚ Pause", danach „▶ Pause beenden"',
      'Feierabend: „■ Gehen" — danach ist der Tag abgeschlossen',
      'Vergessen zu stempeln? Dem Chef Bescheid geben, er trägt es nach',
    ],
    probe: { anlegen: 'Kommen und direkt Gehen drücken.', loeschen: 'Nur der Chef kann den Eintrag unter Personal → Person → Zeiterfassung korrigieren oder entfernen; die Korrektur bleibt protokolliert.' },
    landetIn: [{ text: 'Mein Bereich → Meine Arbeitszeit', href: '/dashboard/mein-bereich' }, { text: 'Personal → Zeiterfassung (Chef)', href: '/dashboard/personal' }],
    vorher: [{ text: 'Chef hat Sie als Mitarbeiter angelegt und eingeladen', href: '/dashboard/personal' }],
  },
  '/dashboard/meine-einsaetze': {
    zweck: 'Das Monteur-Handy: Ihre Einsätze des Tages als große Karten mit Anruf-Knopf und Route. Status weiterschalten, Fotos, Leistungen, Unterschrift des Kunden, Bericht.',
    wer: 'mitarbeiter',
    werText: 'Einsätze plant der CHEF im Dispo-Board. Der MONTEUR schaltet hier den Status weiter und erfasst Fotos, Leistungen und Unterschrift.',
    schritte: [
      'Tag mit ‹ › wählen, „← Zurück zu heute" springt zurück',
      'Status weiterschalten: Geplant → Unterwegs → Vor Ort → Erledigt (Standort nur, wenn Sie es erlauben)',
      'Leistungen und Material eintragen, Fotos machen',
      'Kunde unterschreibt auf dem Handy, dann „Bericht erstellen"',
      '„🗺 Meine Tour" zeigt die Reihenfolge des Tages auf der Karte',
    ],
    landetIn: [{ text: 'Dispo-Board (Chef sieht den Status live)', href: '/dashboard/dispo' }, { text: 'Rechnungen (Chef rechnet aus dem Einsatz ab)', href: '/dashboard/rechnungen' }],
    vorher: [{ text: 'Chef hat Ihnen im Dispo-Board einen Einsatz zugeteilt', href: '/dashboard/dispo' }],
  },

  // --- Personal (aus Paket A1, hier vorgezogen, weil alles damit anfaengt) ---
  '/dashboard/personal': {
    zweck: 'Hier legt der Chef seine Mitarbeiter an und führt die komplette Personalakte: Stammdaten, Arbeitszeit, Dokumente (Vertrag, Lohnabrechnungen, Zeugnisse), Abwesenheiten, Schulungen, Zeiterfassung und Checklisten.',
    wer: 'chef',
    werText: 'Nur der Chef (oder wer die Personal-Freigabe hat). Der Mitarbeiter legt sich nie selbst an — er sieht seine Daten in „Mein Bereich".',
    schritte: [
      '„+ Mitarbeiter anlegen" mit Vor- und Nachname, dann die Person anklicken',
      'Oben in „Stammdaten" zeigt die Personalakte-Ampel, was fehlt — von oben nach unten abarbeiten, dann „Speichern"',
      '„Dokumente": Vertrag, Lohnabrechnungen, Zeugnisse mit Kategorie hochladen; „👁 Freigeben" macht eine Datei für den Mitarbeiter sichtbar',
      '„Schulungen": Arbeitsschutz-Unterweisung mit Datum und „gültig bis" eintragen',
      '„Abwesenheiten": Urlaubsanträge genehmigen; bei Krankheit die AU elektronisch bei der Krankenkasse abrufen (Lohnprogramm/Steuerbüro) und „AU liegt vor" setzen',
      'Zum Schluss „Zum Self-Service einladen" — der Mitarbeiter bekommt seinen Zugang',
    ],
    probe: { anlegen: 'Einen Mitarbeiter „Test Person" anlegen.', loeschen: 'Nur der Chef kann ihn wieder löschen; lieber den Status auf „Inaktiv" setzen, wenn schon Zeiten oder Dokumente daran hängen.' },
    landetIn: [{ text: 'Mein Bereich des Mitarbeiters', href: '/dashboard/mein-bereich' }, { text: 'Dispo-Board und Schichtplan', href: '/dashboard/dispo' }, { text: 'Wer sieht was', href: '/dashboard/wer-sieht-was' }],
    vorher: [{ text: 'Firmendaten unter Erste Schritte', href: '/dashboard/onboarding' }],
  },
  '/dashboard/personal/dokumente': {
    zweck: 'Je Mitarbeiter die Pflichtangaben nach dem Nachweisgesetz abhaken, Fristen für Probezeit und Befristung sehen, Zeugnis-Entwurf nach vorgegebener Note, Stellenanzeige mit AGG-Prüfung.',
    wer: 'chef',
    werText: 'Nur der Chef. Der Vertrag selbst wird hier nicht erzeugt — die unterschriebene Datei gehört unter Personal → Person → Dokumente.',
    schritte: [
      'Mitarbeiter wählen, Beginn, Probezeit und ggf. Befristung eintragen',
      'Alle Pflichtpunkte abhaken und speichern — dann gilt der Nachweis als erteilt und die Ampel in der Personalakte wird grün',
      'Zeugnis: Die Note geben Sie vor, der Text wird nur formuliert — vor der Verwendung prüfen',
    ],
    landetIn: [{ text: 'Personalakte-Ampel', href: '/dashboard/personal' }],
  },

  // --- Kommunikation & Wissen ---------------------------------------------
  '/dashboard/academy': {
    zweck: 'Schulungen und Erklärvideos mit Player, Fortschritt und Medaillen. Der Chef kann eigene Kurse und Videos ergänzen und sieht, wer was abgeschlossen hat.',
    wer: 'beide',
    werText: 'Mitarbeiter schauen und schließen ab. Eigene Kurse legt der Chef an.',
    schritte: ['Kurs wählen und ansehen — Sie steigen später an derselben Stelle wieder ein', 'Abschluss bringt eine Medaille', 'Chef: Team-Übersicht zeigt, wer welchen Kurs fertig hat'],
  },
  '/dashboard/chat': {
    zweck: 'Der Wissens-Chat: Fragen zu Ihrem Betrieb stellen — er antwortet aus den Dokumenten, die der Chef unter „Firmen-Wissen" freigegeben hat, und kann Dokumente entwerfen.',
    wer: 'beide',
    werText: 'Jeder darf fragen. Was der Chat wissen darf, entscheidet der Chef unter Firmen-Wissen.',
    schritte: ['Frage eintippen und „Senden"', 'Findet er nichts, ist das Dokument nicht freigegeben — dann den Chef fragen', 'Entworfene Dokumente vor dem Speichern prüfen und anpassen'],
    vorher: [{ text: 'Firmen-Wissen freigeben (Chef)', href: '/dashboard/documents/wissen' }],
  },
  '/dashboard/team-chat': {
    zweck: 'Der interne Chat Ihres Betriebs mit Kanälen, Dateien und Übersetzung in die eigene Sprache — statt privater Messenger.',
    wer: 'beide',
    werText: 'Jeder schreibt. Neue Kanäle und Einladungen per Namen sind möglich; Nachrichten werden nicht gelöscht.',
    schritte: ['Links einen Kanal wählen oder „+" für einen neuen', 'Kollegen per Namen einladen', 'Dateien lassen sich an eine Nachricht anhängen', 'Wer nicht Deutsch schreibt: „+ Deutsch" mitsenden; 🌍 übersetzt fremde Nachrichten'],
    vorher: [{ text: 'Eigene Sprache wählen', href: '/dashboard/mehrsprachig' }],
  },
  '/dashboard/documents': {
    zweck: 'Die Dokumentenablage des Betriebs, bei mehreren Filialen je Standort zugeordnet.',
    wer: 'chef',
    werText: 'Der Chef legt ab. Was Mitarbeiter im Wissens-Chat finden dürfen, steuert er unter Firmen-Wissen.',
    schritte: ['Dokument hochladen', 'Bei mehreren Filialen: Standort zuordnen — ohne Zuordnung ist es überall sichtbar', 'Für den Wissens-Chat unter „Firmen-Wissen" freigeben'],
    landetIn: [{ text: 'Firmen-Wissen', href: '/dashboard/documents/wissen' }],
  },
  '/dashboard/documents/wissen': {
    zweck: 'Hier entscheiden Sie pro Dokument, was Ihre Mitarbeiter im Wissens-Chat finden. Standard: nichts ist freigegeben. Vertraulich klingende Dateien (Vertrag, Lohn, Bank) brauchen eine zweite Bestätigung.',
    wer: 'chef',
    werText: 'Nur der Chef gibt frei. Mitarbeiter können freigegebene Dokumente nur lesen.',
    schritte: ['Dokument suchen, „Fürs Team freigeben"', 'Bei Rückfrage nur „Trotzdem freigeben", wenn es wirklich jeder sehen darf', '„✍️ Neue Wissens-Notiz" für Abläufe („So machen wir das")', 'Zurücknehmen jederzeit mit „✓ Freigegeben — zurücknehmen"'],
    probe: { anlegen: 'Eine kurze Wissens-Notiz anlegen und freigeben.', loeschen: 'Freigabe zurücknehmen; die Notiz selbst unter Dokumente löschen.' },
    landetIn: [{ text: 'Wissens-Chat der Mitarbeiter', href: '/dashboard/chat' }],
  },
  '/dashboard/korrespondenz': {
    zweck: 'Geschäftsbriefe mit fortlaufender Nummer (BR-Jahr-Nummer), Brief-Art und Status.',
    wer: 'chef',
    werText: 'Wer das Modul freigeschaltet hat, schreibt Briefe.',
    schritte: ['„Neuer Brief": Art, Empfänger, Betreff', 'Nach dem Speichern öffnet sich der Brief-Editor', 'Status pflegen (Entwurf, versendet …)'],
  },
  '/dashboard/vorlagen': {
    zweck: 'Der zentrale Vorlagen-Pool: Vorlagen, aus denen jede Filiale zieht, empfohlene sind markiert.',
    wer: 'beide',
    werText: 'Chef und Filialleitung verwalten; alle Mitarbeiter nutzen und kopieren.',
    schritte: ['Vorlage suchen und kopieren', 'Chef: „＋ Neue Vorlage" oder „⇩ Aus Modulen importieren"', 'Chef/Leitung: Vorlagen als „empfohlen" kennzeichnen, damit alle sie zuerst sehen'],
    probe: { anlegen: '„＋ Neue Vorlage" mit Titel „Test".', loeschen: '🗑️ an der Vorlage (Chef oder Filialleitung).' },
  },
  '/dashboard/formulare': {
    zweck: 'Eigene Formulare und Checklisten bauen (Text, Zahl, Datum, Prüfpunkt i.O./n.i.O., Foto, Unterschrift …) und auf dem Handy ausfüllen, mit PDF.',
    wer: 'beide',
    werText: 'Vorlagen baut nur der CHEF („Vorlagen verwalten"). Ausfüllen dürfen alle. Ein abgeschlossenes Formular ist nicht mehr änderbar.',
    schritte: [
      'Chef: „Vorlagen verwalten" → Startvorlage übernehmen (Übergabe, Abnahme, Fahrzeug …) oder „＋ Leere Vorlage"',
      'Felder mit ▲▼ sortieren, „💾 Vorlage speichern"',
      'Ausfüllen: bei der Vorlage „＋", Punkte abhaken, Foto, Unterschrift mit dem Finger',
      '„💾 Entwurf speichern" zum Zwischenspeichern, „✔ Abschließen" wenn fertig',
      '„📄 PDF" für Kunde oder Akte',
    ],
    probe: { anlegen: 'Ein Formular starten und als Entwurf speichern.', loeschen: '🗑 am Formular — solange es noch nicht abgeschlossen ist.' },
  },
  '/dashboard/mehrsprachig': {
    zweck: 'Anweisungen und Unterweisungen auf Deutsch schreiben, in die Sprachen des Teams übersetzen, gegenlesen, freigeben. Mitarbeiter lesen sie in ihrer Sprache und bestätigen.',
    wer: 'beide',
    werText: 'Anlegen und Freigeben nur der CHEF. MITARBEITER wählen ihre Sprache, lesen und bestätigen „Gelesen und verstanden".',
    schritte: [
      'Jeder wählt oben seine Sprache (gilt auch für den Team-Chat)',
      'Chef: „+ Neue Anweisung" auf Deutsch, „🌍 Übersetzen"',
      'Rückübersetzung und gelbe Hinweise prüfen, Haken setzen, „✓ Freigeben"',
      'Mitarbeiter: Anweisung öffnen, vorlesen lassen, bestätigen',
      'Chef sieht, wer bestätigt hat — Druck zweisprachig mit Unterschriftszeile',
    ],
    probe: { anlegen: 'Eine Anweisung als Entwurf speichern.', loeschen: '„Archivieren" (Chef).' },
  },
  '/dashboard/mail-sync': {
    zweck: 'Ihr eigenes Postfach und Ihren Kalender verbinden (Outlook, Google, IMAP, CalDAV). Zugangsdaten werden verschlüsselt gespeichert.',
    wer: 'beide',
    werText: 'Jeder verbindet sein eigenes Postfach.',
    schritte: ['Anbieter aufklappen, Zugangsdaten eintragen', 'Bei IMAP den Server-Host angeben, sonst kein Posteingang', '„🔗 Speichern", danach im Posteingang prüfen'],
    landetIn: [{ text: 'Posteingang', href: '/dashboard/posteingang' }],
  },
  '/dashboard/posteingang': {
    zweck: 'Mails aus Ihrem eigenen Postfach lesen und beantworten — die Antwort geht über Ihr Postfach und steht dort unter „Gesendet".',
    wer: 'beide',
    werText: 'Jeder sieht sein eigenes Postfach.',
    schritte: ['Ordner wählen, Mail öffnen', 'Antworten oder „✎ Neue Nachricht"', 'Behördenbrief? Mit dem Sachbearbeiter auswerten lassen — Frist und Betrag werden herausgelesen'],
    landetIn: [{ text: 'Sachbearbeiter → Vorgänge', href: '/dashboard/sachbearbeiter' }],
    vorher: [{ text: 'Postfach verbinden', href: '/dashboard/mail-sync' }],
  },
  '/dashboard/sachbearbeiter': {
    zweck: 'Ein Schreiben lesen lassen (Foto, PDF oder Text): heraus kommen Klartext, Frist, Betrag, Aktenzeichen und ein Aufgaben-Vorschlag. Das Original wird nicht gespeichert.',
    wer: 'beide',
    werText: 'Jeder sieht nur seine eigenen Vorgänge.',
    schritte: ['Foto, PDF oder Text einfügen und auswerten lassen', 'Ergebnis prüfen — die KI kann sich irren, maßgeblich ist das Original', '„Als Vorgang merken"', 'Unten die Vorgänge: dringendste zuerst, erledigt wird von Hand'],
  },
  '/dashboard/nachweise': {
    zweck: 'Fünf Mappen mit Ampel: Arbeitsschutz, Pflichten Ihrer Branche mit Gesetzes-Radar, Subunternehmer, Versicherungen, Entsorgung. Unterweisungen mit Unterschrift der Beschäftigten.',
    wer: 'chef',
    werText: 'Der Chef pflegt die Nachweise. Mitarbeiter unterschreiben Unterweisungen.',
    schritte: ['„✨ … Pflichten anlegen" übernimmt die typischen Punkte Ihrer Branche', '„＋ Nachweis" für Eigenes, mit Intervall', 'Unterweisung: „✍ Unterschriften" — jeder Beschäftigte unterschreibt mit dem Finger', '„✓ Heute erledigt" setzt die nächste Frist'],
    probe: { anlegen: '„＋ Nachweis" mit Titel „Test".', loeschen: '✕ am Nachweis (Chef).' },
    landetIn: [{ text: 'Heute (fällige Fristen)', href: '/dashboard/heute' }, { text: 'Gefahrstoffe', href: '/dashboard/nachweise/gefahrstoffe' }],
  },
  '/dashboard/nachweise/gefahrstoffe': {
    zweck: 'Das Gefahrstoffverzeichnis nach § 6 GefStoffV: je Stoff Einstufung, Menge, Arbeitsbereich, Sicherheitsdatenblatt, Betriebsanweisung. CMR-Stoffe werden erkannt.',
    wer: 'chef',
    werText: 'Der Chef pflegt das Verzeichnis.',
    schritte: ['Stoff anlegen: Name, H-Sätze, Piktogramme, Menge', 'Sicherheitsdatenblatt mit Fassung hinterlegen', 'Rot = Pflichtangabe fehlt, zum Beispiel die Betriebsanweisung', '„⬇ CSV" oder „🖨 Drucken" für die Akte'],
    probe: { anlegen: 'Stoff „Test" anlegen.', loeschen: '✕ am Stoff.' },
  },

  // --- Termine & Planung ---------------------------------------------------
  '/dashboard/termine': {
    zweck: 'Ihr Terminkalender. Einfach-Ansicht: Wer, Wann, Titel. Voll-Ansicht: Ende, Ort, Erinnerung, Ressource, Notiz. Ein Termin kann an einem Kunden aus dem CRM hängen.',
    wer: 'beide',
    werText: 'Wer das Modul freigeschaltet hat, legt Termine an.',
    schritte: ['„Neuer Termin": Titel, Beginn, optional Kunde', 'Mit Kunde verknüpft erscheint er in dessen Akte', 'Aus einem Termin kann ein Einsatz im Dispo-Board werden'],
    probe: { anlegen: 'Termin „Test" morgen anlegen.', loeschen: 'Löschen-Knopf an der Terminkarte.' },
    landetIn: [{ text: 'Kunden-Akte', href: '/dashboard/kunde-akte' }, { text: 'Dispo-Board', href: '/dashboard/dispo' }],
  },
  '/dashboard/online-buchung': {
    zweck: 'Ihr öffentlicher Buchungs-Link: Kunden buchen selbst. Welche Zeiten buchbar sind, kommt aus Termine (Öffnungszeiten und Terminarten).',
    wer: 'chef',
    werText: 'Nur der Chef stellt ein.',
    schritte: ['Link-Namen festlegen', 'Seite freischalten', 'Link kopieren und auf Website, Google-Profil oder in die Mail-Signatur setzen'],
    landetIn: [{ text: 'Termine (gebuchte Termine erscheinen dort)', href: '/dashboard/termine' }],
    vorher: [{ text: 'Öffnungszeiten und Terminarten in Termine', href: '/dashboard/termine' }],
  },
  '/dashboard/dispo': {
    zweck: 'Das Dispo-Board: Monteure als Zeilen, Wochentage als Spalten, Einsätze als Kacheln — mit Befähigungs-Warnung, Kapazitäts-Ampel und Route je Tag.',
    wer: 'chef',
    werText: 'Der Chef (bzw. wer disponieren darf) plant. Der Monteur sieht seine Einsätze in „Meine Einsätze". „Absagen" setzt nur den Status, gelöscht wird nichts.',
    schritte: [
      '„Neuer Einsatz" oder „+" in der Zelle eines Monteurs',
      'Befähigung wählen (z. B. Elektrofachkraft) — der Vorschlag zeigt, wer passt',
      'Einsätze ohne Monteur stehen links unter „Unzugeordnet" — anklicken, zuweisen',
      '🗺 öffnet die Route des Tages',
      'Erledigte Einsätze direkt abrechnen',
    ],
    probe: { anlegen: 'Einen Einsatz ohne Monteur anlegen.', loeschen: 'Einsatz öffnen → „Absagen" (bleibt als abgesagt stehen).' },
    landetIn: [{ text: 'Meine Einsätze (Monteur)', href: '/dashboard/meine-einsaetze' }, { text: 'Rechnungen', href: '/dashboard/rechnungen' }, { text: 'Chef-Blick → Auslastung', href: '/dashboard/chef-blick' }],
    vorher: [{ text: 'Mitarbeiter mit Wochenstunden anlegen', href: '/dashboard/personal' }],
  },
  '/dashboard/schichtplan': {
    zweck: 'Wochenraster Montag bis Sonntag je Mitarbeiter, mit Schichtarten, Feiertagen, Minijob-Grenze, Tauschanfragen und KI-Vorschlag.',
    wer: 'chef',
    werText: 'Der Chef plant. Mitarbeiter sehen ihre Schichten in „Mein Bereich", bestätigen sie und können Tausch anfragen.',
    schritte: ['„⚙ Schichtarten" einmal anlegen (Früh, Spät …)', 'In eine Zelle klicken oder Schichtart hineinziehen', '„📋 Auf ganze Woche" oder „⧉ Duplizieren" spart Tipparbeit', 'Tauschanfragen oben genehmigen oder ablehnen', '„✨ KI-Schichtplan" macht einen Vorschlag — erst prüfen, dann übernehmen'],
    probe: { anlegen: 'Eine Schicht nächste Woche eintragen.', loeschen: 'Schicht öffnen → „Löschen".' },
    landetIn: [{ text: 'Mein Bereich → Meine Schichten', href: '/dashboard/mein-bereich' }],
  },
  '/dashboard/buchungen': {
    zweck: 'Termin- und Ressourcenbuchung für Räume, Geräte, Fahrzeuge oder Mitarbeiter — mit Konfliktprüfung vor dem Speichern und Tages-Timeline.',
    wer: 'beide',
    werText: 'Wer das Modul hat, bucht. Ressourcen anlegen und archivieren macht der Chef.',
    schritte: ['„+ Ressource" einmal anlegen', 'Buchung anlegen — Überschneidungen werden sofort gemeldet', 'Timeline zeigt die Belegung des Tages'],
    probe: { anlegen: 'Eine Ressource „Test" und eine Buchung anlegen.', loeschen: 'Ressource archivieren.' },
  },
  '/dashboard/veranstaltungen': {
    zweck: 'Veranstaltungen mit Anmeldungen, Tickets, Auslastung, Warteliste und Einnahmen.',
    wer: 'chef',
    werText: 'Wer das Modul hat, legt an.',
    schritte: ['„＋ Veranstaltung"', 'Anmeldungen erfassen, bezahlt abhaken', 'Aus einer Anmeldung direkt eine Rechnung erstellen', 'Teilnehmerliste als PDF'],
    probe: { anlegen: 'Veranstaltung „Test" mit einer Anmeldung.', loeschen: '„✕ Veranstaltung" bzw. ✕ an der Anmeldung.' },
    landetIn: [{ text: 'Rechnungen', href: '/dashboard/rechnungen' }],
  },
  '/dashboard/erinnerungen': {
    zweck: 'Die Arbeitsliste fälliger Erinnerungen je Kanal gegen Nichterscheinen. Aus Reservierungen, Nachkauf- und Impf-Erinnerungen landen die Einträge hier.',
    wer: 'beide',
    werText: 'Wer das Modul hat, legt an und versendet. Werbliche Erinnerungen (Nachkauf, Impfung) nur mit Einwilligung des Kunden.',
    schritte: ['„＋ Erinnerung anlegen" oder aus einer Reservierung übernehmen', '„✉ Senden" verschickt die Mail', '„✓ Erinnert" oder „Entfällt" setzen'],
    probe: { anlegen: 'Eine Erinnerung ohne Versand anlegen.', loeschen: 'Auf „Entfällt" setzen.' },
  },
};

// ---------------------------------------------------------------------------
// Nachschlagen
// ---------------------------------------------------------------------------

/** Wissen zu einem Pfad: exakt, sonst die laengste passende Elternseite. */
export function wissenFuer(pfad: string | null | undefined): { href: string; wissen: SeitenWissen } | null {
  let p = String(pfad ?? '').trim();
  if (!p) return null;
  const schnitt = p.search(/[?#]/);
  if (schnitt >= 0) p = p.slice(0, schnitt);
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (WISSEN[p]) return { href: p, wissen: WISSEN[p] };
  let treffer: string | null = null;
  for (const href of Object.keys(WISSEN)) {
    if (href === '/dashboard') continue;
    if (p.startsWith(href + '/') && (!treffer || href.length > treffer.length)) treffer = href;
  }
  return treffer ? { href: treffer, wissen: WISSEN[treffer] } : null;
}

/** Alle Links, die in der Wissensbasis vorkommen — fuer den Test gegen das Menue. */
export function alleVerweise(): string[] {
  const aus = new Set<string>();
  for (const w of Object.values(WISSEN)) {
    for (const v of [...(w.landetIn ?? []), ...(w.vorher ?? [])]) if (v.href) aus.add(v.href);
  }
  for (const s of [...START_CHEF, ...START_MITARBEITER]) aus.add(s.href);
  return [...aus].sort();
}
