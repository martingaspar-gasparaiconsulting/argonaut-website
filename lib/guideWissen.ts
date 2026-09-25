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
// Teil A2b: Vertrieb und Lager.
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

  // --- Vertrieb (Teil A2b) -------------------------------------------------
  '/dashboard/leads': {
    zweck: 'Alle Anfragen an einem Ort: von der Website, aus Freebies, Webinaren oder von Hand erfasst — mit Stufe (neu, qualifiziert … verloren) und Herkunft.',
    wer: 'beide',
    werText: 'Website-Anfragen kommen von selbst. Von Hand erfasst jeder, der das Modul hat.',
    schritte: ['Oben nach Herkunft (neu/Bestand) und Stufe filtern', '„Kontakt manuell anlegen" für Anrufe oder Messe-Kontakte', 'Lead öffnen, Stufe weiterschalten, Notiz ergänzen', 'Passt er, wird aus dem Lead ein Kontakt im CRM und eine Chance in der Pipeline'],
    probe: { anlegen: 'Einen Kontakt „Test Anfrage" manuell anlegen.', loeschen: 'Stufe auf „verloren" setzen — so bleibt die Auswertung sauber.' },
    landetIn: [{ text: 'Vertrieb/CRM', href: '/dashboard/crm' }, { text: 'Deal-Pipeline', href: '/dashboard/pipeline' }],
  },
  '/dashboard/akquise': {
    zweck: 'Das Akquise-Cockpit zählt den Einsatz vor dem Ergebnis: Anrufe, Besuche, Mails — mit zwei Fingertipps je Handgriff (Art, dann Ergebnis) und einem Tagesziel.',
    wer: 'beide',
    werText: 'Jeder erfasst seine eigenen Aktivitäten; sie laufen im Betrieb des Chefs zusammen. Das Tagesziel setzt der Chef.',
    schritte: ['Art antippen (z. B. Anruf), dann das Ergebnis', 'Notiz ist freiwillig und kommt nach dem Speichern', 'Verklickt? „Rückgängig" direkt danach', 'Chef: Tagesziel festlegen'],
    probe: { anlegen: 'Eine Aktivität „Anruf" erfassen.', loeschen: 'Sofort „Rückgängig".' },
  },
  '/dashboard/marketing': {
    zweck: 'Ihre Kampagnen mit Kanälen, Laufzeit, Budget und Ampel — und wie viele Leads jede Kampagne gebracht hat.',
    wer: 'chef',
    werText: 'Wer das Modul hat, legt Kampagnen an. Kampagnen werden archiviert, nicht gelöscht.',
    schritte: ['„+ Neue Kampagne": Name, Kanäle, Zeitraum, Budget', 'Kampagne öffnen für Details und Inhalte', 'Die Ampel zeigt, ob eine Kampagne liefert', 'Freebies, Zielgruppen und Texte finden Sie in den Unterpunkten'],
    probe: { anlegen: 'Kampagne „Test" anlegen.', loeschen: '„Archivieren".' },
    landetIn: [{ text: 'Leads', href: '/dashboard/leads' }],
  },
  '/dashboard/marketing/freebies': {
    zweck: 'Einen Ratgeber als PDF zum Herunterladen anbieten: Thema anlegen, PDF hochladen, fünf E-Mails anpassen — fertig ist die Seite mit Bestätigungs-Mail (Double-Opt-in) und Nachfass-Strecke.',
    wer: 'chef',
    werText: 'Der Chef legt Freebies an. Wer sich einträgt, landet als Lead bei Ihnen.',
    schritte: ['Thema anlegen', 'PDF hochladen (auch große Dateien)', 'Die fünf Mails lesen und anpassen', 'Aktiv schalten und den Link teilen'],
    probe: { anlegen: 'Freebie „Test" ohne Aktivschalten anlegen.', loeschen: '„Freebie löschen".' },
    landetIn: [{ text: 'Leads', href: '/dashboard/leads' }],
  },
  '/dashboard/marketing/zielgruppen': {
    zweck: 'Zielgruppen aus Ihrer Kundenkartei bilden. Die Seite trennt zwei Fragen: Wer passt? (Regeln links) und Wem dürfen Sie schreiben? (Einwilligungs-Ampel rechts). Nur wer beides erfüllt, kommt in die Versandliste.',
    wer: 'chef',
    werText: 'Wer das Marketing-Modul hat. Einwilligung und Widerspruch werden je Kontakt vermerkt.',
    schritte: ['Regeln wählen (z. B. Ort, Tag, letzter Kauf)', 'Rechts sehen, wer angeschrieben werden darf — und warum jemand nicht', 'Einwilligung oder Widerspruch direkt beim Kontakt vermerken', 'Gruppe speichern und in den Versand übernehmen'],
    landetIn: [{ text: 'Vertrieb/CRM (Einwilligung am Kontakt)', href: '/dashboard/crm' }],
    vorher: [{ text: 'Kontakte im CRM', href: '/dashboard/crm' }],
  },
  '/dashboard/marketing/texte': {
    zweck: 'Die Text-Werkstatt für E-Book, Ratgeber-Artikel, Pressemitteilung und Strategie. Alles ist Entwurf — vor dem Veröffentlichen bestätigen Sie, dass Sie den Text geprüft haben.',
    wer: 'chef',
    werText: 'Wer das Marketing-Modul hat. Veröffentlichen erst nach Ihrer Prüfung.',
    schritte: ['Textart wählen, Thema diktieren oder eintippen', 'E-Book: erst Gliederung, dann Kapitel für Kapitel', '„💾 Speichern", „📄 PDF"', 'Ratgeber: „als Webseite" und nach Prüfung „🚀 Veröffentlichen"'],
    probe: { anlegen: 'Einen Ratgeber-Entwurf speichern.', loeschen: 'Unter „Gespeicherte Texte" auf „Löschen".' },
    landetIn: [{ text: 'Freebie-Baukasten (E-Book als Freebie)', href: '/dashboard/marketing/freebies' }, { text: 'Webseiten', href: '/dashboard/webseiten' }],
  },
  '/dashboard/freigaben': {
    zweck: 'Entwürfe, Fotos oder Layouts mit Versionen verwalten und vom Kunden freigeben lassen — mit Feedback je Version und PDF.',
    wer: 'chef',
    werText: 'Wer das Modul hat.',
    schritte: ['„＋ Asset" anlegen', 'Version hochladen', 'Feedback des Kunden je Version eintragen', 'Freigabe als PDF festhalten'],
    probe: { anlegen: 'Asset „Test" mit einer Version.', loeschen: '„✕ Asset".' },
  },
  '/dashboard/bewertungen': {
    zweck: 'Kunden per E-Mail um eine Bewertung bitten, Ergebnisse sammeln und auf Ihrer Seite zeigen. Für Google & Co. entwirft das System eine Antwort — veröffentlicht wird von Hand.',
    wer: 'chef',
    werText: 'Nur der Chef trägt hier ein.',
    schritte: ['„Kunde um Bewertung bitten": Name und E-Mail', 'Abgegebene Bewertungen prüfen und veröffentlichen', '„Antwort entwerfen" — Text prüfen, kopieren, selbst einstellen', 'Bewertung von Google einfügen und beantworten lassen'],
    probe: { anlegen: 'Eine Anfrage an Ihre eigene E-Mail schicken.', loeschen: 'Anfrage löschen.' },
  },
  '/dashboard/crm': {
    zweck: 'Ihre Kundenkartei: Kontakte mit Tags, Visitenkarte per Foto auslesen, CSV-Import, Wochenfokus, Firmen und Pipeline.',
    wer: 'beide',
    werText: 'Wer das Modul hat, legt Kontakte an. Löschen ist möglich — bei Kunden mit Rechnungen lieber nicht.',
    schritte: ['„+ Neuer Kontakt" — Name und E-Mail genügen', '„📇 Visitenkarte" fotografieren, die Felder werden ausgefüllt', '„📥 Import" für eine Excel/CSV-Liste — Dubletten werden gemeldet', 'Tags vergeben, um später Zielgruppen zu bilden'],
    probe: { anlegen: 'Kontakt „Test Kunde" anlegen.', loeschen: 'Kontakt öffnen → „Löschen".' },
    landetIn: [{ text: 'Angebote', href: '/dashboard/angebote' }, { text: 'Termine', href: '/dashboard/termine' }, { text: 'Kunden-Akte', href: '/dashboard/kunde-akte' }],
  },
  '/dashboard/crm/gespraeche': {
    zweck: 'Ein Gespräch diktieren — heraus kommt ein Protokoll: wer macht was bis wann, dazu Nachfass-Termin und Nachfass-Mail zum Selbstverschicken.',
    wer: 'beide',
    werText: 'Wer das CRM hat. Die Mail verschickt der Mensch, nicht das System.',
    schritte: ['„🎙 Neues Gespräch protokollieren"', 'Kontakt wählen, diktieren, Protokoll prüfen', 'Eigene Aufgaben ins Cockpit, Nachfass-Termin setzen', 'Nach dem Nachfassen „✓ Nachgefasst"'],
    landetIn: [{ text: 'Kontakt-Chronik im CRM', href: '/dashboard/crm' }],
  },
  '/dashboard/ausschreibungen': {
    zweck: 'Öffentliche Ausschreibungen finden (EU-Amtsblatt TED), Ausschreibungstexte prüfen lassen (Fristen, Leistung, Eignung) und mit Ihren Nachweisen abgleichen.',
    wer: 'chef',
    werText: 'Suchprofil nur der Chef.',
    schritte: ['„📡 Radar einrichten": Suchbegriffe und Branchen-Codes', 'Treffer „☆ Merken"', '„🔍 Ausschreibungstext prüfen": Text einfügen, Fristen und Eignung sehen', 'Fehlende Nachweise stehen rot — in Nachweise & Fristen ergänzen'],
    landetIn: [{ text: 'Nachweise & Fristen', href: '/dashboard/nachweise' }],
  },
  '/dashboard/pipeline': {
    zweck: 'Verkaufschancen als Karten über Stufen: Lead → Qualifiziert → Angebot → Verhandlung → Gewonnen/Verloren, mit Pipeline-Wert, gewichteter Prognose und Abschlussquote.',
    wer: 'beide',
    werText: 'Chef und Mitarbeiter mit Freigabe.',
    schritte: ['„＋ Deal anlegen": Kontakt, Wert, Wahrscheinlichkeit', 'Deal in die nächste Stufe setzen, wenn es vorangeht', 'Gewonnene Deals erscheinen in Provisionen'],
    probe: { anlegen: 'Deal „Test" mit 1 € anlegen.', loeschen: '✕ an der Karte (mit Rückfrage).' },
    landetIn: [{ text: 'Provisionen', href: '/dashboard/provisionen' }, { text: 'Aufträge', href: '/dashboard/auftraege' }],
  },
  '/dashboard/provisionen': {
    zweck: 'Verkaufsprovisionen der eigenen Leute aus gewonnenen Deals: Satz und Empfänger je Deal, Betrag automatisch, offen und ausgezahlt getrennt.',
    wer: 'chef',
    werText: 'Nur mit Freigabe (sensibel).',
    schritte: ['Gewonnenen Deal wählen, Satz und Empfänger eintragen, speichern', 'Nach der Auszahlung „Als ausgezahlt"', 'Unten die Summe je Empfänger'],
    vorher: [{ text: 'Deal auf „Gewonnen" in der Pipeline', href: '/dashboard/pipeline' }],
  },
  '/dashboard/partner': {
    zweck: 'Externe Partner und Multiplikatoren mit Konditionen — und eine Ampel für den Fall, dass ein Zugang läuft, die versprochene Gegenleistung aber fehlt.',
    wer: 'chef',
    werText: 'Nur mit Freigabe (sensibel).',
    schritte: ['„Neuer Partner" mit Konditionen', 'Gegenleistungen (Vertrag, Logo, Zitat) abhaken', 'Oben „⚠️ Zugang läuft, Gegenleistung fehlt" regelmäßig ansehen'],
    probe: { anlegen: 'Partner „Test".', loeschen: '„Löschen" beim Partner.' },
  },
  '/dashboard/kunde-akte': {
    zweck: 'Alles zu einem Kunden auf einer Seite: Umsatz, offene Posten, Rechnungen, Angebote und Termine.',
    wer: 'lesen',
    werText: 'Nur zum Nachsehen — die Einträge entstehen in CRM, Angeboten, Rechnungen und Terminen.',
    schritte: ['Oben den Kunden suchen', 'Offene Posten zuerst prüfen', 'Von hier in Angebot oder Rechnung springen'],
  },
  '/dashboard/aktivitaet': {
    zweck: 'Die Chronik je Kunde: Angebote, Rechnungen, Termine und Signaturen in zeitlicher Reihenfolge — nachvollziehbar für Rückfragen und Prüfungen.',
    wer: 'lesen',
    werText: 'Nur zum Nachsehen.',
    schritte: ['Kunden wählen', 'Von oben (neu) nach unten (alt) lesen', 'Einträge führen zum Original'],
  },
  '/dashboard/angebote': {
    zweck: 'Angebote schreiben, als Link zur Zusage schicken und nach der Annahme mit einem Klick in eine Rechnung umwandeln. Positionen auch per Sprache oder Foto.',
    wer: 'beide',
    werText: 'Wer das Modul hat. Positionen ohne Preis blockieren das Speichern.',
    schritte: ['Kunde wählen, Positionen eintragen (oder per Sprache/Foto vorschlagen lassen)', 'Speichern — das PDF trägt Ihr Logo', '„🔗 Link" an den Kunden oder „✍️ Unterschrift"', '„✓ angenommen", dann „→ Rechnung"'],
    probe: { anlegen: 'Ein Angebot an „Test Kunde".', loeschen: '🗑 beim Angebot — Achtung: Es wird sofort und ohne Rückfrage gelöscht.' },
    landetIn: [{ text: 'Rechnungen', href: '/dashboard/rechnungen' }, { text: 'Signaturen', href: '/dashboard/signaturen' }],
    vorher: [{ text: 'Kunde im CRM', href: '/dashboard/crm' }, { text: 'Leistungskatalog mit Preisen', href: '/dashboard/leistungskatalog' }],
  },
  '/dashboard/signaturen': {
    zweck: 'Dokumente digital unterschreiben lassen: anlegen, Link teilen, Status verfolgen, unterschriebenes PDF laden.',
    wer: 'chef',
    werText: 'Nur mit Freigabe (sensibel).',
    schritte: ['Dokument zur Unterschrift anlegen', '„📋 Link kopieren" und an den Kunden schicken', 'Status verfolgen, signiertes PDF laden', 'Nicht mehr nötig? „Stornieren"'],
    probe: { anlegen: 'Eine Anfrage an sich selbst.', loeschen: '„Stornieren" oder „Löschen".' },
  },
  '/dashboard/auftraege': {
    zweck: 'Beauftragte Arbeiten mit Status. Ein Auftrag entsteht neu oder „Aus Verkaufschance" und verbindet Angebot, Termine, Einsätze und Rechnung.',
    wer: 'beide',
    werText: 'Wer das Modul hat.',
    schritte: ['„📥 Aus Verkaufschance" oder neuen Auftrag anlegen', 'Status pflegen', 'Einsätze im Dispo-Board planen', 'Zum Schluss abrechnen'],
    probe: { anlegen: 'Auftrag „Test".', loeschen: 'Löschen-Knopf am Auftrag (mit Rückfrage).' },
    landetIn: [{ text: 'Dispo-Board', href: '/dashboard/dispo' }, { text: 'Rechnungen', href: '/dashboard/rechnungen' }],
  },
  '/dashboard/versand': {
    zweck: 'Sendungen erfassen (Empfänger, Gewicht, Dienstleister), Adress-Etikett drucken, Status und Sendungsnummer verfolgen.',
    wer: 'beide',
    werText: 'Wer das Modul hat. Frankieren über einen Versanddienst erst nach „Verbinden".',
    schritte: ['„＋ Sendung anlegen"', 'Etikett drucken', 'Sendungsnummer eintragen oder „📮 Buchen", wenn verbunden'],
    probe: { anlegen: 'Sendung an „Test".', loeschen: '🗑 an der Sendung.' },
  },
  '/dashboard/marktplaetze': {
    zweck: 'Ihre Zugänge zu Amazon, eBay, Kaufland und OTTO verschlüsselt hinterlegen. Der Abgleich von Bestellungen und Beständen ist noch im Aufbau.',
    wer: 'chef',
    werText: 'Nur der Chef trägt hier ein.',
    schritte: ['Marktplatz aufklappen', 'Zugangsdaten eintragen, „🔗 Speichern"', '„Trennen" entfernt den Zugang wieder'],
  },
  '/dashboard/projekte': {
    zweck: 'Projekte mit Budget, Aufgaben und Ampel — neu, aus einer Vorlage oder per KI-Vorschlag angelegt.',
    wer: 'beide',
    werText: 'Wer das Modul hat. Projekte werden archiviert, nicht gelöscht.',
    schritte: ['„+ Neues Projekt" oder „📋 Aus Vorlage erstellen"', 'Aufgaben mit Fälligkeit anlegen', 'Zeiten und Leistungen laufend erfassen', 'Abgeschlossen? Archivieren'],
    probe: { anlegen: 'Projekt „Test".', loeschen: 'Archivieren.' },
    landetIn: [{ text: 'Projekt-Abrechnung', href: '/dashboard/projekt-abrechnung' }, { text: 'Nachkalkulation', href: '/dashboard/nachkalkulation' }, { text: 'Chef-Blick → Frühwarnung', href: '/dashboard/chef-blick' }],
  },
  '/dashboard/projekt-abrechnung': {
    zweck: 'Abrechenbare Zeiten und Leistungen je Projekt erfassen und daraus mit einem Klick eine Rechnung erzeugen.',
    wer: 'beide',
    werText: 'Nur mit Freigabe (sensibel). Abgerechnete Leistungen bleiben stehen.',
    schritte: ['Projekt wählen, Zeit oder Leistung erfassen (Stundensatz ist vorbelegt)', 'Unter „Offene Leistungen" prüfen', 'Rechnung erzeugen'],
    probe: { anlegen: 'Eine Leistung über 0,5 Stunden.', loeschen: 'Löschen-Knopf in „Offene Leistungen".' },
    landetIn: [{ text: 'Rechnungen', href: '/dashboard/rechnungen' }, { text: 'Aufwand-Cockpit', href: '/dashboard/aufwand' }],
    vorher: [{ text: 'Projekt anlegen', href: '/dashboard/projekte' }],
  },
  '/dashboard/aufwand': {
    zweck: 'Alle abrechenbaren Aufwände (Projektleistungen und Objektzeiten) auf einen Blick: offen gegen abgerechnet, Stunden und Betrag, mit Abrechnen-Knopf.',
    wer: 'lesen',
    werText: 'Eingetragen wird in Projekt-Abrechnung und Objektzeiten; hier wird nur abgerechnet.',
    schritte: ['Offene Posten je Projekt/Objekt ansehen', '„abrechnen" springt in die passende Rechnung', 'Neu laden, wenn gerade erfasst wurde'],
    landetIn: [{ text: 'Rechnungen', href: '/dashboard/rechnungen' }],
  },
  '/dashboard/portal': {
    zweck: 'Je Kunde einen Portal-Link ohne Passwort: Der Kunde sieht darüber nur seine eigenen Rechnungen und Termine. „Portal plus" ergänzt Baufortschritt, Fotos, Dokumente und Freigaben.',
    wer: 'chef',
    werText: 'Wer das Modul hat. Deaktivieren sperrt den Link sofort.',
    schritte: ['Kunde wählen, „Link erstellen"', 'Link kopieren und schicken', 'Nicht mehr gewünscht? Deaktivieren', 'Für Baufortschritt und Fotos: „Portal plus"'],
    probe: { anlegen: 'Link für „Test Kunde" erstellen und selbst öffnen.', loeschen: 'Deaktivieren.' },
  },
  '/dashboard/gutscheine': {
    zweck: 'Wertgutscheine, Zehnerkarten und Leistungsgutscheine — Restwert wird aus den Einlösungen live gerechnet, Verjährung und Umsatzsteuer sind hinterlegt.',
    wer: 'beide',
    werText: 'Nur mit Freigabe (sensibel). Gutscheine werden storniert, nicht gelöscht.',
    schritte: ['Art wählen und Gutschein anlegen', '„📄 PDF" zum Ausdrucken oder Mailen', 'Beim Einlösen: „Einlösen" → „✓ Einlösung buchen"'],
    probe: { anlegen: 'Gutschein über 1 €.', loeschen: '„Stornieren".' },
  },
  '/dashboard/einkauf': {
    zweck: 'Lieferanten, Bestellungen mit Wareneingang, Reklamationen je Position und Nachkalkulation. Oben stehen die Material-Abrufe Ihrer Monteure.',
    wer: 'chef',
    werText: 'Nur mit Freigabe (sensibel). Bestellungen werden storniert, nicht gelöscht.',
    schritte: ['Reiter „🏭 Lieferanten": einmal anlegen', '„＋ Bestellung anlegen", „📄 Bestellung" drucken oder mailen', 'Bei Lieferung: Wareneingang speichern — der Lagerbestand steigt', '„🧮 Nachkalkulation" zeigt Aufschlag und Spanne'],
    probe: { anlegen: 'Bestellung über 1 Stück.', loeschen: '„Stornieren".' },
    landetIn: [{ text: 'ERP/Lager', href: '/dashboard/erp' }],
  },

  // --- Lager (Teil A2b) ------------------------------------------------------
  '/dashboard/erp': {
    zweck: 'Ihre Artikel mit Bestand und Mindestbestand-Ampel (rot leer, gelb knapp, grün ok). Oben warnt eine Box vor Chargen mit ablaufendem Haltbarkeitsdatum.',
    wer: 'beide',
    werText: 'Wer das Modul hat.',
    schritte: ['„+ Artikel anlegen": Name, Preis, Bestand, Mindestbestand', 'Rote und gelbe Artikel nachbestellen', 'Artikel öffnen für Details und Akte'],
    probe: { anlegen: 'Artikel „Test".', loeschen: 'Löschen-Knopf am Artikel.' },
    landetIn: [{ text: 'Kasse', href: '/dashboard/kasse' }, { text: 'Einkauf', href: '/dashboard/einkauf' }],
  },
  '/dashboard/erp/lager': {
    zweck: 'Bestand je Filiale: Zugänge und Abgänge buchen, zwischen Filialen umlagern, jeder Schritt steht im Verlauf. Der Gesamtbestand ist die Summe der Filialen.',
    wer: 'beide',
    werText: 'Wer das Lager-Modul hat. Jede Buchung wird festgehalten.',
    schritte: ['„＋ Zu-/Abgang" mit Grund buchen', '„↔ Umlagern" zwischen Filialen', 'Reiter „Zu-/Abgänge" und „Umlagerungen" zeigen, wer wann was gebucht hat'],
    probe: { anlegen: 'Zugang von 1 Stück buchen.', loeschen: 'Gegenbuchung als Abgang von 1 Stück — Buchungen selbst bleiben im Verlauf.' },
  },
  '/dashboard/varianten': {
    zweck: 'Eine Matrix (z. B. Größe × Farbe) erzeugt auf einen Schlag alle Varianten mit eigenem Bestand, EAN und Aufpreis.',
    wer: 'chef',
    werText: 'Wer das Modul hat.',
    schritte: ['„+ Matrix anlegen" mit zwei Achsen', '„⚡ Matrix erzeugen"', 'Varianten als Lagerartikel übernehmen', '„📄 PDF" als Übersicht'],
    probe: { anlegen: 'Matrix „Test" mit 2×2.', loeschen: '„Löschen" bei der Matrix.' },
    landetIn: [{ text: 'ERP/Lager', href: '/dashboard/erp' }],
  },
  '/dashboard/lager-scanner': {
    zweck: 'Artikel per Barcode buchen — mit Handscanner oder Handy-Kamera. Drei Modi: Wareneingang (+), Warenausgang (−), Inventur (zählen). Gebucht wird je Filiale.',
    wer: 'beide',
    werText: 'Wer das Modul hat. Unbekannte Codes lassen sich direkt als Artikel anlegen.',
    schritte: ['Modus wählen', 'Code scannen oder eintippen + Enter', 'Menge bestätigen', 'Inventur: die gezählte Menge dieser Filiale eintragen'],
    probe: { anlegen: 'Wareneingang 1 Stück.', loeschen: 'Warenausgang 1 Stück als Gegenbuchung.' },
    landetIn: [{ text: 'Lager je Filiale', href: '/dashboard/erp/lager' }],
  },
  '/dashboard/kasse': {
    zweck: 'Die Kasse: Artikel wählen, Warenkorb, kassieren. Der Beleg wird über die TSE signiert, der Bestand abgebucht, Bon als PDF, DSFinV-K-Export.',
    wer: 'beide',
    werText: 'Nur mit Freigabe (sensibel). Ein gebuchter Beleg bleibt gespeichert (Kassenpflicht) — zum Üben daher die Übungswelt nutzen.',
    schritte: ['Artikel antippen oder „＋ Freie Position"', 'Zahlart wählen', 'Kassieren — Bon als PDF', 'Neue Kasse? Unter „Kassen-Meldung" ans Finanzamt melden'],
    landetIn: [{ text: 'Kassen-Meldung', href: '/dashboard/kasse/meldung' }, { text: 'ERP/Lager (Bestand)', href: '/dashboard/erp' }],
    vorher: [{ text: 'Artikel im Lager', href: '/dashboard/erp' }],
  },
  '/dashboard/kasse/meldung': {
    zweck: 'Verzeichnis aller Kassen mit TSE je Betriebsstätte, Meldefristen nach § 146a AO und Ausfüllhilfe für „Mein ELSTER". ARGONAUT meldet nicht selbst.',
    wer: 'chef',
    werText: 'Nur der Chef trägt hier ein.',
    schritte: ['Gerät mit TSE-Seriennummer erfassen', 'Rot = Meldung überfällig, gelb = bald fällig', '„Ausfüllhilfe ELSTER" öffnen und dort übertragen', 'Danach „Vermerken"'],
  },
  '/dashboard/shop': {
    zweck: 'Bestellungen aus Ihrem Shop sammeln — per CSV, von Hand oder später per Schnittstelle — mit Status neu → in Bearbeitung → versendet.',
    wer: 'beide',
    werText: 'Wer das Modul hat.',
    schritte: ['Bestellungen per CSV einlesen oder von Hand anlegen', 'Je Bestellung: Kunde ins CRM, Lager abbuchen, Rechnung erstellen', 'Status weiterschalten', 'Retouren unter „Retouren & Widerruf"'],
    landetIn: [{ text: 'Rechnungen', href: '/dashboard/rechnungen' }, { text: 'Vertrieb/CRM', href: '/dashboard/crm' }, { text: 'Retouren & Widerruf', href: '/dashboard/shop/retouren' }],
  },
  '/dashboard/shop/retouren': {
    zweck: 'Widerruf, Reklamation oder Kulanz zu einer Bestellung erfassen: Frist prüfen, Erstattung rechnen, Ware zurück ins Lager, Kundentexte zum Kopieren. Gutschriften machen Sie in Rechnungen.',
    wer: 'beide',
    werText: 'Wer den Shop hat.',
    schritte: ['„Neue Retoure erfassen": Bestellung und Positionen wählen', 'Ampel zeigt, ob der Widerruf in der Frist ist', '„📦 Zurück ins Lager" bei einwandfreier Ware', '„✓ Erstattet" setzen und Text an den Kunden kopieren'],
    landetIn: [{ text: 'Rechnungen (Gutschrift)', href: '/dashboard/rechnungen' }, { text: 'ERP/Lager', href: '/dashboard/erp' }],
  },
  // --- Finanzen (Teil A2c) -------------------------------------------------
  '/dashboard/rechnungen': {
    zweck: 'Übersicht aller Ausgangsrechnungen mit Kennzahlen (Offen, Überfällig, Bezahlt, Umsatz, Ø Zahlungsdauer), Suche, Status-Filter und Fälligkeits-Ampel. In der einzelnen Rechnung pflegen Sie Positionen, buchen Zahlungseingänge, laden das PDF herunter oder stornieren.',
    wer: 'beide',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Eine Rechnung lässt sich nicht löschen, nur stornieren. Erfasste Zahlungen lassen sich mit Rückfrage löschen.',
    schritte: [
      'Auf dieser Seite gibt es keinen Knopf für eine neue Rechnung. Rechnungen entstehen aus einem Angebot („→ Rechnung“), einem Auftrag oder unter „Wiederkehrende Rechnungen“',
      'Oben suchen („Suche nach Nummer, Titel, Kontakt, Firma…“) oder filtern: „Alle“, „Offen“, „Überfällig“, „Teilbezahlt“, „Bezahlt“, „Storniert“',
      'Eine Zeile anklicken, dann öffnet sich die Rechnung. Unter „Rechnungsdaten“ Titel, Rechnungsdatum und „Zahlungsziel (Tage)“ pflegen, mit „+ Position“ Zeilen ergänzen, dann „💾 Speichern“',
      '„📄 Rechnung als PDF“ lädt die Rechnung herunter. Sind noch Änderungen ungespeichert, kommt vorher eine Rückfrage',
      'Geld eingegangen? Unter „Neue Zahlung erfassen“ Betrag, Zahlungsdatum und Zahlungsart eintragen, dann „＋ Zahlung buchen“. Der Status (Offen, Teilbezahlt, Bezahlt) rechnet sich von selbst',
      'Bezahlte und stornierte Rechnungen sind schreibgeschützt. Für Änderungen „Stornieren“ und eine neue Rechnung erstellen',
    ],
    probe: {
      anlegen: 'Hier entsteht keine neue Rechnung. Zum Ausprobieren in der Übungswelt eine Beispiel-Rechnung öffnen und unter „Neue Zahlung erfassen“ einen kleinen Betrag mit „＋ Zahlung buchen“ erfassen.',
      loeschen: 'Die Zahlung mit 🗑 entfernen — dabei kommt eine Rückfrage. Eine Rechnung selbst lässt sich nicht löschen, nur mit „Stornieren“ auf storniert setzen. Achtung: Das geschieht sofort und ohne Rückfrage. „Reaktivieren“ macht es rückgängig.',
    },
    landetIn: [{ text: 'Mahnwesen (überfällige Rechnungen)', href: '/dashboard/mahnwesen' }, { text: 'EÜR (Einnahmen und Umsatzsteuer)', href: '/dashboard/euer' }, { text: 'Finanzen', href: '/dashboard/finanzen' }],
    vorher: [{ text: 'Angebot angenommen und in eine Rechnung umgewandelt', href: '/dashboard/angebote' }, { text: 'Oder ein Auftrag', href: '/dashboard/auftraege' }, { text: 'Oder eine wiederkehrende Rechnung', href: '/dashboard/abo-rechnungen' }, { text: 'Firmendaten und Bankverbindung für das PDF', href: '/dashboard/einstellungen' }],
  },
  '/dashboard/erechnung-import': {
    zweck: 'Eine eingehende E-Rechnung (XRechnung, ZUGFeRD-CII oder UBL als XML, oder ein ZUGFeRD-PDF) hochladen. ARGONAUT liest sie lesbar aus (Lieferant, Empfänger, Positionen, Summen) und archiviert das Original automatisch GoBD-konform. Dieselbe Datei wird nicht zweimal abgelegt.',
    wer: 'beide',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Archivierte Rechnungen bleiben unveränderbar liegen. Löschen ist hier nicht möglich.',
    schritte: [
      'Die Datei in das Feld „E-Rechnung hierher ziehen oder klicken“ ziehen oder anklicken und auswählen (.xml oder .pdf)',
      'Warten, bis „Rechnung wird ausgelesen…“ verschwindet. Oben erscheint dann „✓ GoBD-Archiv: revisionssicher archiviert“ oder, bei einer schon bekannten Datei, „bereits archiviert am …“',
      'Die Angaben prüfen: „Lieferant (Rechnungssteller)“, „Empfänger“, die Eckdaten, „POSITIONEN“ und die Summen. Auf gelbe „⚠ Hinweise“ achten',
      'Wichtig: Hier wird nur ausgelesen und archiviert. Für Buchhaltung und Vorsteuer die Rechnung zusätzlich in der Beleg-Inbox erfassen',
      'Mit „Weitere Rechnung einlesen“ die nächste Datei holen',
    ],
    probe: {
      anlegen: 'Keine Probedatei hochladen: Jede Datei wird sofort und dauerhaft im GoBD-Archiv abgelegt.',
      loeschen: 'Nicht möglich. Das Archiv ist unveränderbar, und auf dieser Seite gibt es keinen Löschweg.',
    },
    landetIn: [{ text: 'Für die Buchhaltung zusätzlich in die Beleg-Inbox', href: '/dashboard/eingangsbelege' }],
  },
  '/dashboard/eingangsbelege': {
    zweck: 'Eingangsrechnungen als Foto oder PDF hochladen. ARGONAUT liest Lieferant, Datum, Beträge und Umsatzsteuer aus, schlägt ein DATEV-Konto (SKR03/SKR04) vor, warnt vor Rechenfehlern und möglichen Dubletten und gleicht mit Bestellungen ab. Danach prüfen, speichern und als CSV an den Steuerberater geben.',
    wer: 'beide',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Löschen mit 🗑 nach einer Rückfrage.',
    schritte: [
      '„📎 Foto/PDF auswählen — Kamera oder Datei“ anklicken. ARGONAUT liest den Beleg und füllt die Felder aus',
      'Lieferant, Belegnummer, Belegdatum, Kategorie, „Netto €“, „USt-Satz %“, „USt-Betrag €“ und „Brutto €“ prüfen. Bei der gelben Warnung ggf. „Brutto auf … setzen“',
      'Unter „📊 DATEV-Konto“ SKR03 oder SKR04 wählen und den Vorschlag mit „übernehmen“ übernehmen oder ein Konto aus der Liste wählen',
      'Hinweise wie „Mögliche Dublette“ ernst nehmen, dann „💾 Beleg speichern“',
      'In der Liste „Belege“ mit „Bearbeiten“ korrigieren. „⬇ CSV-Export (DATEV/Steuerberater)“ lädt alle Belege herunter',
    ],
    probe: {
      anlegen: 'Ohne Datei die Felder von Hand ausfüllen, z. B. Lieferant „Test“, und „💾 Beleg speichern“.',
      loeschen: '🗑 in der Zeile des Belegs, dann die Rückfrage „Diesen Beleg löschen?“ bestätigen.',
    },
    landetIn: [{ text: 'EÜR (Ausgaben und Vorsteuer)', href: '/dashboard/euer' }, { text: 'Zahlungen → Ausgänge (als bezahlt abhaken)', href: '/dashboard/zahlungen' }, { text: 'DATEV-Export', href: '/dashboard/datev' }],
  },
  '/dashboard/reisekosten': {
    zweck: 'Dienstreisen erfassen. ARGONAUT rechnet Verpflegungspauschale (mit Kürzung für gestellte Mahlzeiten), Kilometergeld (PKW 0,30 €/km, Motorrad 0,20 €/km) und die Gesamt-Erstattung live nach den Sätzen 2026. Offene und erstattete Reisen werden getrennt geführt.',
    wer: 'beide',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Löschen mit 🗑 nach einer Rückfrage.',
    schritte: [
      'Unter „➕ Neue Dienstreise“ Reisender, „Anlass / Zweck“, Ziel, Abreise und Rückkehr (Datum und Uhrzeit) eintragen',
      'Fahrzeug wählen, „Gefahrene km“, „Übernachtung €“ und „Sonstiges € (Bahn, Parken …)“ ergänzen',
      'Gestellte Mahlzeiten bei Frühstück, Mittag und Abend zählen. Die Box darunter zeigt sofort die „Gesamt-Erstattung“',
      '„💾 Reise speichern“',
      'In der Liste „Reisen“ auf „offen“ klicken, sobald ausgezahlt ist. Dann steht dort „✓ erstattet“. „⬇ CSV-Export“ für die Buchhaltung',
    ],
    probe: {
      anlegen: 'Reise mit Reisender „Test“, Abreise und Rückkehr heute, dann „💾 Reise speichern“.',
      loeschen: '🗑 in der Zeile der Reise, dann die Rückfrage „Diese Reise löschen?“ bestätigen.',
    },
    landetIn: [{ text: 'EÜR (Ausgaben)', href: '/dashboard/euer' }],
  },
  '/dashboard/anlagen': {
    zweck: 'Anlagegüter erfassen. ARGONAUT erkennt geringwertige Wirtschaftsgüter (Sofortabschreibung) und rechnet sonst die lineare AfA monatsgenau. Angezeigt werden AfA des Jahres, Restbuchwert und der Abschreibungsplan. Das Anlagenverzeichnis gibt es als CSV.',
    wer: 'beide',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Löschen mit 🗑 nach einer Rückfrage.',
    schritte: [
      'Unter „➕ Neues Anlagegut“ Bezeichnung, Kategorie, Anschaffungsdatum und „Anschaffungskosten € (netto)“ eintragen',
      '„Nutzungsdauer (Jahre)“ eintragen oder einen Knopf bei „Übliche Nutzungsdauer:“ antippen, z. B. „PKW · 6 J.“',
      'Die Box zeigt „GWG · Sofortabschreibung“ oder „Lineare AfA“. Mit „▸ Abschreibungsplan anzeigen“ sehen Sie jedes Jahr',
      '„💾 Anlagegut speichern“. Wird etwas verkauft oder ausgemustert, das Anlagegut über „Bearbeiten“ öffnen und den Status ändern',
      '„⬇ CSV-Export“ für das Anlagenverzeichnis',
    ],
    probe: {
      anlegen: 'Anlagegut „Test“ mit Anschaffungsdatum und Kosten, dann „💾 Anlagegut speichern“.',
      loeschen: '🗑 in der Zeile, dann die Rückfrage „Dieses Anlagegut löschen?“ bestätigen.',
    },
    landetIn: [{ text: 'EÜR (Abschreibungen)', href: '/dashboard/euer' }],
  },
  '/dashboard/controlling': {
    zweck: 'Rechner für betriebswirtschaftliche Kennzahlen mit Ampel: Ergebnis und Marge, Break-even mit Sicherheitsabstand, Liquidität 1. bis 3. Grades, kalkulatorischer Stundensatz und Eigenkapitalquote. Nichts wird gespeichert.',
    wer: 'lesen',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Hier wird nur gerechnet, nichts gespeichert. Nach dem Neuladen sind die Felder leer.',
    schritte: [
      'Unter „💶 Ergebnis & Marge“ Umsatz, Wareneinsatz, Personalkosten und sonstige Kosten eintragen. Rohertrag, Betriebsergebnis und Umsatzrendite erscheinen sofort',
      'Unter „🎯 Break-even“ „Fixkosten / Jahr €“ und „Deckungsbeitrags-Marge %“ eintragen. Das ergibt den Break-even-Umsatz',
      'Unter „💧 Liquidität“ liquide Mittel, Forderungen, Vorräte und kurzfristige Verbindlichkeiten eintragen',
      'Unter „🛠 Kalkulatorischer Stundensatz“ Gesamtkosten, produktive Stunden und Gewinnaufschlag eintragen. Das ergibt den „Mindest-Stundensatz“',
      'Die Ampel („gut“, „solide“, „schwach“) ordnet die Werte ein. Für Bilanz- und Steuerfragen den Steuerberater fragen',
    ],
    landetIn: [{ text: 'Plan gegen Ist je Projekt: Nachkalkulation', href: '/dashboard/nachkalkulation' }],
  },
  '/dashboard/euer': {
    zweck: 'Einnahmen-Überschuss-Rechnung nach § 4 Abs. 3 EStG für ein Jahr. Sie führt Einnahmen aus Rechnungen und Ausgaben aus Belegen, Reisekosten und AfA automatisch zusammen und zeigt Gewinn oder Verlust sowie die Umsatzsteuer-Übersicht.',
    wer: 'lesen',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Die Seite liest nur zusammen. Die Zahlen entstehen in Rechnungen, Beleg-Inbox, Reisekosten und Anlagen.',
    schritte: [
      'Oben das Jahr wählen',
      'Die Basis wählen: „Zufluss (bezahlt)“ zählt nur tatsächlich bezahlte Rechnungen, „Rechnungsdatum“ zählt nach Rechnungsdatum',
      'Bei Bedarf „Sonstige Einnahmen (manuell)“ und „Sonstige Ausgaben (manuell)“ eintragen. Diese Werte werden nicht gespeichert',
      'Gewinn oder Verlust und die „Umsatzsteuer-Übersicht“ ablesen, dann „⬇ CSV-Export“ für den Steuerberater',
    ],
    vorher: [{ text: 'Rechnungen mit erfassten Zahlungen', href: '/dashboard/rechnungen' }, { text: 'Belege in der Beleg-Inbox', href: '/dashboard/eingangsbelege' }, { text: 'Reisekosten', href: '/dashboard/reisekosten' }, { text: 'Anlagegüter', href: '/dashboard/anlagen' }],
  },
  '/dashboard/spenden': {
    zweck: 'Geld- und Sachspenden sowie Aufwandsverzicht erfassen, den Betrag in Worten anzeigen und die Zuwendungsbestätigung nach amtlichem Muster (§ 50 EStDV) als PDF erstellen. Die Vereinsdaten werden einmal hinterlegt.',
    wer: 'beide',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Erfasste Zuwendungen lassen sich hier weder bearbeiten noch löschen.',
    schritte: [
      'Zuerst im Reiter „🏛 Vereinsdaten“ mindestens den „Name der Körperschaft“, dazu Finanzamt, Steuernummer und Freistellungsbescheid eintragen, dann „Speichern“',
      'Im Reiter „❤️ Zuwendungen“ Datum, Spender, Art und „Betrag / Wert (€)“ eintragen. Bei einer Sachzuwendung die „Sachwert-Beschreibung“ ergänzen',
      'Die Vorschau zeigt den Betrag in Worten und ob der „vereinfachte Nachweis möglich“ ist. Betrag in Worten genau prüfen, dann „＋ Erfassen“',
      'In der Liste „📄 Bestätigung“ klicken. Das PDF entsteht, und die Zuwendung gilt ab dann als „bestätigt“. Mit „📄 erneut“ lässt es sich noch einmal erstellen',
    ],
    probe: {
      anlegen: 'Bitte keinen Probe-Eintrag anlegen: Eine hier erfasste Zuwendung lässt sich nicht wieder entfernen, und die Übungswelt enthält keine Spenden.',
      loeschen: 'Auf dieser Seite nicht möglich. Es gibt keinen Lösch- und keinen Bearbeiten-Knopf.',
    },
  },
  '/dashboard/mahnwesen': {
    zweck: 'Das Mahn-Cockpit für überfällige Rechnungen (fällig, noch Geld offen, weder bezahlt noch storniert), die längste Verspätung oben. Hier sehen Sie die Mahnstufe von „Überfällig“ bis „Letzte Mahnung“, stufen einzeln oder alle auf einmal hoch und kommen zum Mahnschreiben.',
    wer: 'beide',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Hier wird nichts angelegt oder gelöscht, nur die Mahnstufe an der Rechnung geändert.',
    schritte: [
      'Oben die Kennzahlen lesen: „Überfällige Rechnungen“, „Offener Betrag“, „Noch nicht gemahnt“, „In Mahnung“',
      'In der Tabelle je Rechnung Nummer, Empfänger, Verzug in Tagen, offenen Betrag und aktuelle Mahnstufe prüfen',
      '„✉️ Mahnung erstellen“ öffnet den Mahn-Assistenten zur Rechnung (Text + PDF)',
      '„⏫“ stuft direkt eine Stufe hoch, ohne ein Schreiben zu erstellen. „↺“ setzt die Stufe auf „Überfällig“ zurück. Achtung: Beides geschieht sofort und ohne Rückfrage',
      'Sammel-Mahnlauf: „⏫ Alle fälligen hochstufen (…)“ und dann „Ja, hochstufen“. Alle überfälligen Rechnungen unter „Letzte Mahnung“ steigen um eine Stufe und werden mit Zinsen, Pauschale bzw. Gebühr in der Mahn-Historie festgehalten. Ein PDF entsteht dabei nicht',
    ],
    landetIn: [{ text: 'Mahnstufe und Datum der letzten Mahnung an der Rechnung', href: '/dashboard/rechnungen' }],
    vorher: [{ text: 'Rechnung mit Fälligkeitsdatum und offenem Betrag', href: '/dashboard/rechnungen' }],
  },
  '/dashboard/zahlungen': {
    zweck: 'Alles Geld an einem Ort: Unter „⬇ Eingänge“ bestätigen Sie Zahlungen, die Kunden im Portal gemeldet haben, und sehen die erhaltenen Zahlungen. Unter „⬆ Ausgänge“ haken Sie Eingangsbelege als bezahlt ab und sehen die monatliche Summe laufender Verträge und Abos.',
    wer: 'beide',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Hier wird nur der Zahlungsstatus gesetzt, anlegen oder löschen ist nicht möglich.',
    schritte: [
      'Reiter „⬇ Eingänge“: Unter „💬 Vom Kunden gemeldet — bitte bestätigen“ stehen Rechnungen, bei denen der Kunde im Portal „Ich habe bezahlt“ geklickt hat',
      'Erst den Geldeingang auf dem Konto prüfen, dann „✓ Als bezahlt bestätigen“. Achtung: Das geschieht sofort und ohne Rückfrage, die Rechnung gilt dann als voll bezahlt',
      '„✅ Erhaltene Zahlungen“ zeigt die bezahlten Rechnungen mit Datum',
      'Reiter „⬆ Ausgänge“: Unter „🧾 Belege / Eingangsrechnungen“ setzt das Häkchen den Beleg auf bezahlt (mit heutigem Datum). Häkchen entfernen nimmt das zurück',
      '„🔁 Laufende Verträge & Abos“ rechnet aktive Verträge auf Kosten je Monat um, mit Summe unten',
    ],
    landetIn: [
      { text: 'Rechnung steht auf „bezahlt“', href: '/dashboard/rechnungen' },
      { text: 'Bezahlte Rechnungen fallen aus dem Mahnwesen heraus', href: '/dashboard/mahnwesen' },
      { text: 'Einnahmen im Finanz-Überblick', href: '/dashboard/finanzen' },
    ],
    vorher: [
      { text: 'Rechnungen', href: '/dashboard/rechnungen' },
      { text: 'Belege in der Beleg-Inbox', href: '/dashboard/eingangsbelege' },
      { text: 'Laufende Kosten unter Verträge', href: '/dashboard/vertraege' },
      { text: 'Meldung „Ich habe bezahlt“ im Kunden-Portal', href: '/dashboard/portal' },
    ],
  },
  '/dashboard/finanzen': {
    zweck: 'Das Finanz-Cockpit des laufenden Jahres: Einnahmen und Ausgaben netto, Gewinn oder Verlust, offene Forderungen mit Anzahl der überfälligen. Dazu Kacheln zu Ausgaben, EÜR, BWA, Export, Cashflow und SEPA-Überweisung.',
    wer: 'lesen',
    werText: 'Zum Nachsehen für Chef oder Mitarbeiter mit Freigabe (sensibel). Auf dieser Seite selbst wird nichts eingetragen.',
    schritte: [
      'Oben die vier Zahlen lesen: „Einnahmen … (netto)“ aus bezahlten Rechnungen, „Ausgaben … (netto)“ aus der Beleg-Inbox, „Gewinn“ bzw. „Verlust“ und „Offene Forderungen“',
      'Unter „Offene Forderungen“ steht, wie viele Rechnungen überfällig sind',
      'Unter „Werkzeuge“ die passende Kachel mit „Öffnen →“ wählen: „Ausgaben“, „EÜR“, „BWA“, „Export“ (CSV für den Steuerberater), „Cashflow“ (12 Wochen Vorschau) oder „SEPA-Überweisung“',
    ],
    vorher: [
      { text: 'Rechnungen, die als bezahlt markiert sind', href: '/dashboard/rechnungen' },
      { text: 'Belege in der Beleg-Inbox', href: '/dashboard/eingangsbelege' },
    ],
  },
  '/dashboard/vertraege': {
    zweck: 'Alle eigenen Verträge (Miete, Leasing, Versicherung, Wartung, Abo/Lizenz, Lieferant) mit Laufzeit, Kosten und Kündigungsfrist. Eine Ampel zeigt, wie viele Tage bis zum letzten Kündigungstag bleiben. Pro Vertrag gibt es einen Unterschrifts-Link und einen Entwurf für das Kündigungsschreiben.',
    wer: 'beide',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Wer hier Zugriff hat, kann anlegen, bearbeiten und nach einer Rückfrage löschen.',
    schritte: [
      '„+ Vertrag anlegen“: „Bezeichnung *“ ist Pflicht, dazu Kategorie, Vertragspartner, Status, Beginn, „Ende (leer = unbefristet)“, „Kündigungsfrist (Tage vor Ende)“, „Kosten (€)“ und „Zahlungsintervall“, dann „Speichern“',
      'Verlängert sich der Vertrag von selbst, „Verlängert sich automatisch“ anhaken und die Monate eintragen. In der Liste steht dann „↻ auto“',
      'Spalte „Kündigen bis“ lesen: Grün heißt mehr als 60 Tage, Gelb bis 60 Tage, Rot 14 Tage oder weniger bzw. „Frist verpasst“. Mit „Nur fristkritische“ bleiben nur die knappen Fälle stehen',
      '„📄 Kündigungsschreiben“ erstellt einen Entwurf. Mit „In Zwischenablage kopieren“ übernehmen, Platzhalter [ ] ausfüllen und vor dem Versand prüfen',
      '„✍️ Unterschrift“ erstellt einen Unterschrifts-Link zum Kopieren oder Öffnen. „Bearbeiten“ ändert einen Vertrag, auch den Status auf „Gekündigt“ oder „Beendet“',
    ],
    probe: { anlegen: 'Mit „+ Vertrag anlegen“ einen Vertrag mit der Bezeichnung „Test“ speichern.', loeschen: '„Löschen“ in der Zeile des Vertrags, danach fragt die Seite noch einmal nach.' },
    landetIn: [
      { text: 'Zahlungen → Laufende Verträge & Abos', href: '/dashboard/zahlungen' },
      { text: 'Aktive Verträge zur Auswahl unter Vertrag kündigen', href: '/dashboard/vertrag-kuendigen' },
      { text: 'Ausgaben im Wiederkehr-Cockpit', href: '/dashboard/wiederkehr' },
    ],
  },
  '/dashboard/vertrag-kuendigen': {
    zweck: 'Einen aktiven Vertrag verbindlich kündigen: Vertrag wählen, Grund angeben, bestätigen. Der Vertrag steht danach auf „gekündigt“, und eine Bestätigung geht per E-Mail an Sie.',
    wer: 'beide',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Hier wird nichts angelegt oder gelöscht, nur der Vertrag auf „gekündigt“ gesetzt.',
    schritte: [
      'Unter „Vertrag wählen“ einen aktiven Vertrag aussuchen',
      'Die Angaben prüfen: Vertragspartner, Vertragsnummer, Vertragsende, Kündigungsfrist und „Spätester Kündigungstermin“',
      'Bei Bedarf „Kündigungsgrund (optional)“ ausfüllen',
      'Auf „Vertrag kündigen“ klicken, die Rückfrage lesen und mit „Ja, verbindlich kündigen“ bestätigen oder „Abbrechen“',
      'Nach „Kündigung erfasst“ zeigt die Seite, an welche Adresse die Bestätigung ging. Rückgängig machen lässt sich das hier nicht — den Status ändern Sie unter „Verträge“ mit „Bearbeiten“',
    ],
    landetIn: [{ text: 'Vertrag steht unter Verträge auf „Gekündigt“', href: '/dashboard/vertraege' }],
    vorher: [{ text: 'Aktiver Vertrag unter Verträge', href: '/dashboard/vertraege' }],
  },
  '/dashboard/mitglieder': {
    zweck: 'Mitglieder und Abos mit Beitrag, Intervall, Status und SEPA-Mandat. Daraus entsteht eine SEPA-Lastschrift-Datei zum Hochladen ins Online-Banking. ARGONAUT selbst zieht kein Geld ein.',
    wer: 'beide',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Mitglieder anlegen, bearbeiten und löschen (mit Rückfrage) können alle, die Zugriff haben.',
    schritte: [
      'Einmal unter „🏦 Ihre SEPA-Gläubigerdaten“ Gläubiger-ID, Kontoinhaber, IBAN (Empfänger) und BIC eintragen und „Gläubigerdaten speichern“',
      '„+ Neues Mitglied“: „Name *“, E-Mail, „Beitrag (€)“ (z. B. 29,90), Intervall, Status und Beginn, dazu unter „SEPA-Mandat“ IBAN, Mandatsreferenz und „Mandat unterschrieben am“, dann „Anlegen“',
      'In der Liste zeigt „✓ Mandat“, wer bereit ist. Bei „fehlt“ fehlen IBAN, Mandatsreferenz oder Mandatsdatum',
      'Unter „💶 SEPA-Lastschrift erzeugen“ den „Fälligkeitstag (Ausführung)“ wählen und „⭱ SEPA-Datei erzeugen (…)“ klicken. Aufgenommen werden nur aktive Mitglieder mit Mandat, gültiger IBAN und Betrag über 0',
      'Die heruntergeladene Datei im Online-Banking hochladen. Vorher braucht jedes Mitglied eine Vorabinformation über den Einzug',
    ],
    probe: { anlegen: 'Mit „+ Neues Mitglied“ ein Mitglied „Test“ ohne IBAN anlegen — so kommt es in keine SEPA-Datei.', loeschen: 'In der Zeile „Bearbeiten“ und dann im Dialog „Löschen“, danach fragt die Seite noch einmal nach.' },
    landetIn: [
      { text: 'Verträge & Kündigung je Mitglied', href: '/dashboard/mitglieder/vertraege' },
      { text: 'Check-in am Tresen', href: '/dashboard/mitglieder/checkin' },
      { text: 'Beiträge im Wiederkehr-Cockpit', href: '/dashboard/wiederkehr' },
    ],
  },
  '/dashboard/mitglieder/vertraege': {
    zweck: 'Vertragsdaten je Mitglied pflegen (Studio/Abo oder Verein mit Laufzeit, Frist und Satzung). Geht eine Kündigung ein, berechnet die Seite das früheste Vertragsende und erstellt den Text der Bestätigung. Eine Übersicht zeigt, wer in den nächsten 31 Tagen ausläuft.',
    wer: 'chef',
    werText: 'Einsehen: Chef oder Mitarbeiter mit Freigabe (sensibel). Vertragsdaten speichern und Kündigungen eintragen darf nur der Chef. Löschen ist hier nicht möglich.',
    schritte: [
      'Links unter „Name oder Mitgliedsnummer“ suchen und das Mitglied anklicken',
      'Unter „Vertragsdaten“ die „Art“ wählen. Für Studio / Abo: „Abgeschlossen am“, „Erstlaufzeit (Monate)“, „Kündigungsfrist (Monate)“, bei Altverträgen „Verlängerung (nur Altvertrag)“. Für Verein: „Satzungsfrist (Monate)“ und „zum“. Dann „💾 Speichern“',
      'Unter „Kündigung erfassen“ das Datum bei „Eingegangen am“ setzen. Die Seite zeigt „Frühestes Ende“ mit Begründung',
      '„✍️ Kündigung eintragen“ und die Rückfrage bestätigen. Das Mitglied steht dann auf „gekündigt“ mit Enddatum. Zurücknehmen lässt sich das hier nicht',
      'Die Bestätigung erscheint unten als Text. Mit „📋 Kopieren“ übernehmen und an das Mitglied schicken',
    ],
    landetIn: [
      { text: 'Status „Gekündigt“ unter Mitglieder & Abos', href: '/dashboard/mitglieder' },
      { text: 'Ampel beim Check-in', href: '/dashboard/mitglieder/checkin' },
    ],
    vorher: [{ text: 'Mitglied angelegt', href: '/dashboard/mitglieder' }],
  },
  '/dashboard/mitglieder/checkin': {
    zweck: 'Check-in am Tresen: Mitglied suchen, die Ampel zeigt, ob es hereindarf, dann einchecken — höchstens einmal pro Tag. Dazu „Heute da“, die Auslastung je Stunde der letzten 4 Wochen und wer seit 30 Tagen nicht mehr da war.',
    wer: 'beide',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel) checkt ein. Einen Check-in löschen kann man auf dieser Seite nicht.',
    schritte: [
      'Ins Feld „Name oder Mitgliedsnummer eingeben …“ tippen. Gibt es genau einen Treffer, checkt Enter direkt ein',
      'Die Ampel neben dem Namen lesen. Bei Rot fragt die Seite nach: „Trotzdem einchecken?“',
      '„Einchecken“ klicken. Wer heute schon da war, hat den Vermerk „heute schon da“',
      '„Heute da“ und „Auslastung je Stunde (Ø letzte 4 Wochen)“ ansehen',
      '„Seit 30 Tagen nicht mehr da“ zeigt aktive, ungekündigte Mitglieder, die lange nicht da waren',
    ],
    probe: { anlegen: 'Ein Test-Mitglied suchen und „Einchecken“.', loeschen: 'Auf dieser Seite nicht möglich — ein Check-in lässt sich hier nicht entfernen.' },
    vorher: [
      { text: 'Mitglied angelegt', href: '/dashboard/mitglieder' },
      { text: 'Vertragsdaten und Kündigungen', href: '/dashboard/mitglieder/vertraege' },
    ],
  },
  '/dashboard/sepa-einzug': {
    zweck: 'SEPA-Lastschrift für offene Rechnungen: Sie hinterlegen einmal Ihre Gläubigerdaten und je Kontakt ein Mandat. Danach erzeugt die Seite aus den ausgewählten Rechnungen eine Sammellastschrift-Datei (XML) für Ihr Online-Banking. Das Geld zieht Ihre Bank ein, ARGONAUT erstellt nur die Datei.',
    wer: 'chef',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Mandate lassen sich hier nur bearbeiten, nicht löschen.',
    schritte: [
      'Unter „🏦 Ihre SEPA-Gläubigerdaten“ die Felder „Gläubiger-ID“, „Kontoinhaber“, „IBAN (Empfänger)“ und bei Bedarf „BIC (optional)“ ausfüllen, dann „Gläubigerdaten speichern“. Die Gläubiger-ID gibt es kostenlos bei der Deutschen Bundesbank',
      'Unter „📝 Mandat je Kontakt“ einen „Kontakt“ wählen und „IBAN“, „Mandatsreferenz“ sowie „Mandat unterschrieben am“ eintragen, dann „💾 Mandat speichern“. Eine IBAN mit falscher Prüfsumme wird abgelehnt',
      'Bei Bedarf in der Mandatsliste „✍️ unterschreiben“: Der Unterschrifts-Link wird erstellt und in die Zwischenablage kopiert',
      'Unter „💶 Offene Rechnungen einziehen“ den „Fälligkeitstag (Ausführung)“ wählen und Rechnungen einzeln anhaken oder „Alle wählen“',
      '„⭱ SEPA-Datei erzeugen“ und die Datei im Online-Banking unter Sammellastschrift bzw. SEPA-Datei-Import hochladen. Die Rechnungen bleiben danach offen, bis der Eingang verbucht ist — also nicht zweimal einziehen',
    ],
    probe: { anlegen: 'Ein Mandat für einen Test-Kontakt mit einer gültigen Test-IBAN speichern.', loeschen: 'Hier nicht möglich: Ein Mandat kann auf dieser Seite nur über „Bearbeiten“ geändert werden. Es gibt keinen Knopf zum Löschen und keinen zum Abschalten.' },
    landetIn: [{ text: 'Signaturen (Mandat unterschreiben lassen)', href: '/dashboard/signaturen' }],
    vorher: [{ text: 'Kontakt im CRM', href: '/dashboard/crm' }, { text: 'Offene Rechnung für diesen Kontakt', href: '/dashboard/rechnungen' }],
  },
  '/dashboard/abo-rechnungen': {
    zweck: 'Vorlagen für wiederkehrende Rechnungen wie Wartung, Retainer, Miete oder Abo: Empfänger, Positionen und Intervall einmal festlegen. Daraus entsteht per Klick oder bei Fälligkeit die nächste echte Rechnung.',
    wer: 'chef',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Eine Vorlage wird mit Rückfrage gelöscht.',
    schritte: [
      'Unter „➕ Neue Vorlage“ einen „Titel *“ eintragen. „Kontakt (optional)“ wählen oder den „Empfänger-Name“ selbst eintragen, dann „Intervall“ (monatlich, vierteljährlich, jährlich) und „Nächste Fälligkeit“ festlegen',
      'Positionen mit Bezeichnung, Menge, Einheit, „€ netto“ und „MwSt %“ erfassen. Mit „＋ Position“ kommt eine Zeile dazu, mit „✕“ fällt eine weg. Netto und Brutto stehen darunter',
      '„💾 Vorlage anlegen“. Ohne Titel oder ohne Position mit Preis wird nicht gespeichert',
      'In der Liste „→ Rechnung“ erzeugt sofort eine Rechnung, oben „⚡ Alle fälligen jetzt erzeugen“ alle, die heute oder früher fällig sind. Achtung: Beides erzeugt die Rechnung ohne Rückfrage',
      'Mit „Bearbeiten“ eine Vorlage ändern. „Pausieren“ bzw. „Aktivieren“ schaltet sie ab oder wieder ein',
    ],
    probe: { anlegen: 'Eine Vorlage „Test“ mit einer Position anlegen, dabei aber nicht „→ Rechnung“ klicken.', loeschen: '„Löschen“ bei der Vorlage (mit Rückfrage). Eine bereits erzeugte Rechnung bleibt unter Rechnungen bestehen.' },
    landetIn: [{ text: 'Rechnungen', href: '/dashboard/rechnungen' }, { text: 'Wiederkehr-Cockpit', href: '/dashboard/wiederkehr' }],
  },
  '/dashboard/wiederkehr': {
    zweck: 'Die Sammelübersicht für alles Wiederkehrende: Wartungsverträge, Abo-Rechnungen, Mitglieder-Beiträge und eigene Verträge in einer Liste, dazu der monatliche Umsatz (MRR), die Ausgaben pro Monat und die Fälligkeiten. Mit einem Knopf rechnen Sie alle fälligen Wartungen und Abos ab.',
    wer: 'chef',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Hier wird nichts direkt angelegt oder gelöscht, das geschieht im jeweiligen Baustein.',
    schritte: [
      'Oben die Kacheln lesen: „Umsatz / Monat (MRR, netto)“, „Jetzt fällig“, „Bald fällig (≤ 14 T.)“, „Aktive Einnahmequellen“ und „Ausgaben / Monat (Verträge)“',
      'Die Liste über die Filter „Alle“, „🔧 Wartung“, „🔁 Abo-Rechnung“, „👥 Mitglied / Abo“ oder „📑 Vertrag“ eingrenzen. Ein Klick auf die Quelle öffnet den Baustein, aus dem der Eintrag stammt',
      '„⚡ Alle fälligen abrechnen“: Zuerst erscheint eine Rückfrage mit der Anzahl der Wartungsverträge und Abo-Rechnungen und der Summe netto. Erst nach der Bestätigung entstehen echte Rechnungen. Mitglieder-Beiträge laufen weiter über die SEPA-Datei unter Mitglieder',
      'Mit „↻ Aktualisieren“ die Zahlen neu laden',
    ],
    landetIn: [{ text: 'Rechnungen', href: '/dashboard/rechnungen' }],
    vorher: [{ text: 'Wartungsverträge', href: '/dashboard/wartung' }, { text: 'Wiederkehrende Rechnungen', href: '/dashboard/abo-rechnungen' }, { text: 'Mitglieder & Abos', href: '/dashboard/mitglieder' }, { text: 'Verträge', href: '/dashboard/vertraege' }],
  },
  '/dashboard/analytics': {
    zweck: 'Die Startseite für alle Auswertungen: sechs Kacheln führen zu den Reports Umsatz, Vertrieb, Projekt & Auftrag, Lager & ERP, Service und HR.',
    wer: 'lesen',
    werText: 'Zum Nachsehen für den Chef oder Mitarbeiter mit Freigabe (sensibel). Hier wird nichts eingetragen.',
    schritte: [
      'Die passende Kachel wählen, zum Beispiel „Umsatz-Report“, „Vertriebs-Report“, „Projekt & Auftrag“, „Lager & ERP“, „Service“ oder „HR“',
      'Auf „Report öffnen →“ klicken',
      'Für eine eigene Auswertung mit selbst gewählter Kennzahl ist der Report-Baukasten da',
    ],
    landetIn: [{ text: 'Eigene Auswertungen: Report-Baukasten', href: '/dashboard/reports' }],
  },
  '/dashboard/reports': {
    zweck: 'Eigene Auswertungen selbst bauen: Quelle, Kennzahl, Gruppierung und Zeitraum wählen. Die Seite zeigt Tabelle und Anteile, lädt das Ergebnis als CSV herunter und speichert die Einstellung auf Wunsch unter einem Namen, bei Bedarf mit regelmäßigem Versand.',
    wer: 'chef',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Gespeicherte Auswertungen werden mit Rückfrage gelöscht.',
    schritte: [
      '„Quelle“ und „Kennzahl“ wählen („Anzahl“ oder „Summe von …“). Bei einer Summe zusätzlich das „Summen-Feld“ festlegen',
      '„Gruppieren nach“ wählen oder „— ohne (Gesamt) —“ lassen. Den „Zeitraum“ als Schnellwahl nehmen oder „Von“ und „Bis“ selbst setzen',
      '„📊 Auswerten“. Das Ergebnis lässt sich mit „⬇ CSV“ herunterladen',
      'Einen Namen eintragen, auf Wunsch einen Versandplan und „Empfänger, mehrere mit Komma“, dann „💾 Merken“. Gespeichert wird die Einstellung, nicht das Ergebnis — selbst gesetzte Von/Bis-Daten werden dabei nicht mitgespeichert',
      'Unter „Gespeicherte Auswertungen“ den Namen anklicken und danach „📊 Auswerten“',
    ],
    probe: { anlegen: 'Eine Auswertung unter dem Namen „Test“ mit „💾 Merken“ speichern, ohne Versandplan.', loeschen: '„✕“ neben der gespeicherten Auswertung (mit Rückfrage).' },
    vorher: [{ text: 'Rechnungen (die Standard-Quelle)', href: '/dashboard/rechnungen' }],
  },
  '/dashboard/nachkalkulation': {
    zweck: 'Plan gegen Ist je Projekt: Budget, erbrachte Leistung, bereits abgerechnet und noch offen, dazu eine Budget-Ampel. Mit hinterlegtem Selbstkostensatz und erfassten Material- und Fremdkosten zeigt die Seite den echten Deckungsbeitrag.',
    wer: 'chef',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Erfasste Kostenposten lassen sich hier weder ansehen noch löschen.',
    schritte: [
      'Oben die Kacheln lesen: „Budget gesamt“, „Erbracht (Ist)“, „Material/Kosten“, „Deckungsbeitrag“ (ohne Selbstkostensatz steht dort „Umsatz minus Material“), „Offen zum Abrechnen“ und „Über Budget“',
      'Nur in der Ansicht „Voll“: Unter „Selbstkostensatz je Stunde“ einen Wert wie „42,50“ eintragen und „Speichern“',
      'Nur in der Ansicht „Voll“: Unter „Material-/Fremdkosten erfassen“ ein Projekt wählen, dazu Material, Fremdleistung oder Sonstiges sowie Bezeichnung und „Betrag €“, dann „＋ Erfassen“. Beträge ohne Tausenderpunkt eingeben (1234,50)',
      'In der Tabelle je Projekt den Status prüfen: „✓ im Budget“, „⚠ knapp“, „✕ über Budget“ oder „– kein Budget“',
      'Mit „↻ Aktualisieren“ neu laden',
    ],
    probe: { anlegen: 'Einen Kostenposten „Test“ über 1 € für ein Übungsprojekt erfassen.', loeschen: 'Auf dieser Seite nicht möglich: Es gibt keine Liste der Kostenposten und keinen Knopf zum Löschen. Deshalb nur in einem Übungsprojekt ausprobieren.' },
    vorher: [{ text: 'Projekt mit Budget', href: '/dashboard/projekte' }, { text: 'Gebuchte Leistungen (Stunden × Satz)', href: '/dashboard/projekt-abrechnung' }],
  },
  '/dashboard/banking': {
    zweck: 'Einen Umsatz-Export Ihrer Bank (CAMT.053, MT940 oder CSV) gegen die offenen Rechnungen abgleichen und Zahlungseingänge per Klick als bezahlt markieren. Die automatische Bankanbindung ist nur geplant: Zugänge lassen sich hinterlegen, ein Abruf findet aber nicht statt.',
    wer: 'chef',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Hinterlegte Bank-Zugänge werden mit Rückfrage entfernt. „✓ als bezahlt“ wirkt sofort und ohne Rückfrage.',
    schritte: [
      'Im Online-Banking die Umsätze exportieren, am besten als CAMT.053 oder MT940. Bei CSV bitte mit Kopfzeile',
      'Den Inhalt in das Textfeld einfügen oder „📁 Datei wählen“. Das erkannte Format steht daneben',
      '„🔍 Abgleichen“ und die Kacheln „Sicher zugeordnet“, „Wahrscheinlich“ und „Ohne Treffer“ prüfen',
      'Bei jedem Treffer Rechnungsnummer und Hinweis „sicher“ oder „wahrscheinlich“ prüfen, dann „✓ als bezahlt“. Achtung: sofort und ohne Rückfrage, auch bei „wahrscheinlich“ — und es wird immer der volle Betrag als bezahlt gesetzt',
      'Optional „＋ Bank hinzufügen“ mit Bank-Name, Client-ID und Secret, dann „🔗 Bank speichern“. Damit wird nur gespeichert, ein automatischer Abruf findet derzeit nicht statt',
    ],
    probe: { anlegen: 'Die Beispielzeile aus dem Textfeld einfügen und „🔍 Abgleichen“. Das speichert nichts, solange Sie nicht „✓ als bezahlt“ klicken.', loeschen: 'Ein Abgleich ohne „✓ als bezahlt“ hinterlässt nichts. Einen hinterlegten Bank-Zugang entfernt „Entfernen“ (mit Rückfrage). „Als bezahlt“ lässt sich auf dieser Seite nicht zurücknehmen.' },
    landetIn: [{ text: 'Rechnungen (Status „bezahlt“)', href: '/dashboard/rechnungen' }, { text: 'USt-Voranmeldung (zählt bezahlte Rechnungen)', href: '/dashboard/elster' }],
    vorher: [{ text: 'Offene Rechnungen', href: '/dashboard/rechnungen' }],
  },
  '/dashboard/elster': {
    zweck: 'Die Umsatzsteuer-Voranmeldung für einen Zeitraum vorbereiten: Aus bezahlten Rechnungen und der Vorsteuer der Eingangsbelege entstehen die Kennziffern und die Zahllast bzw. Erstattung, als PDF oder CSV zum Abtippen in ELSTER-Online. Die direkte Übermittlung ist noch nicht freigeschaltet.',
    wer: 'chef',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Ein hinterlegter ELSTER-Zugang lässt sich hier nur ändern, nicht entfernen.',
    schritte: [
      '„Von“ und „Bis“ setzen oder „Letzter Monat“ bzw. „Dieser Monat“ wählen, danach „🧮 Berechnen“ — nach jedem Wechsel des Zeitraums erneut',
      'Die Zahllast bzw. Erstattung und die Kennziffern-Tabelle prüfen und die Hinweise darüber lesen',
      '„⬇ Als PDF“ oder „⬇ Als CSV“ herunterladen und die Werte in ELSTER-Online übertragen. Der Knopf „📤 An ELSTER übermitteln“ ist noch gesperrt',
      'Optional „ELSTER verbinden“, „Steuernummer“ und „ELSTER-Zertifikat-Passwort“ eintragen und „🔗 Zugang speichern“',
      'Das Ergebnis dient nur der Vorbereitung. Die verbindliche Voranmeldung prüft Ihr Steuerberater',
    ],
    vorher: [{ text: 'Bezahlte Rechnungen', href: '/dashboard/rechnungen' }, { text: 'Eingangsbelege mit USt-Betrag', href: '/dashboard/eingangsbelege' }],
  },
  '/dashboard/arbeitszeit-nachweis': {
    zweck: 'Arbeitszeit-Nachweis je Mitarbeiter und Monat, geprüft nach dem Arbeitszeitgesetz: Tagesblatt mit Kommen–Gehen, Arbeit und Pause sowie eine Ampel für Höchstarbeitszeit, Pausen, Ruhezeit und Sonntagsarbeit, auch als PDF.',
    wer: 'lesen',
    werText: 'Für den Chef zum Nachsehen (sensibel). Hier wird nichts eingetragen oder gelöscht, die Seite liest nur die gestempelten Zeiten. Korrekturen macht der Chef unter Personal.',
    schritte: [
      'Oben unter „Mitarbeiter“ die Person wählen',
      'Mit „‹“ und „›“ den Monat wechseln',
      'Unter „Betrieb:“ die passenden Schalter setzen: „Sonntagsarbeit erlaubt (z. B. Gastro/Tankstelle)“, „Ruhezeit 10 h (erlaubte Branchen)“, „Hinweis über 8 h“. Sie gelten nur für diese Ansicht und werden nicht gespeichert',
      'Die Karten „Arbeitszeit gesamt“, „Pausen gesamt“, „Verstöße“ und „Status“ (In Ordnung / Prüfen / Verstoß) ansehen',
      'Im „Tagesnachweis“ steht jeder Verstoß direkt unter dem betroffenen Tag. „● läuft“ bedeutet: noch nicht ausgestempelt',
      '„📄 Als PDF“ lädt den Nachweis herunter. Der Knopf geht nur, wenn der Monat Buchungen hat',
    ],
    vorher: [{ text: 'Gestempelte Zeiten aus der Zeiterfassung', href: '/dashboard/zeiterfassung' }, { text: 'Mitarbeiter unter Personal angelegt', href: '/dashboard/personal' }],
  },
  '/dashboard/gobd': {
    zweck: 'Die GoBD-Verfahrensdokumentation für die Betriebsprüfung: Firmenkopf, Verantwortung, Systeme und Abläufe mit vorbelegten Standardtexten ausfüllen, als PDF erstellen und als unveränderliche Version mit Datum festschreiben.',
    wer: 'chef',
    werText: 'Trägt der Chef ein (sensibel). Löschen ist nicht vorgesehen: Der Entwurf wird nur überschrieben, festgeschriebene Versionen bleiben dauerhaft in der Historie.',
    schritte: [
      '„1. Allgemeine Angaben (Firmenkopf)“ prüfen. Beim ersten Öffnen ist er aus dem Betriebsprofil vorbelegt',
      '„2. Verantwortung & Steuerberater“ ergänzen: „Steuerberater / Kanzlei“, optional „DATEV-Beraternummer (optional)“, „Aufbewahrungsort der Unterlagen“',
      '„3. Eingesetzte Systeme (DV-System)“ um weitere Software ergänzen, z. B. DATEV, Online-Banking, Kassensystem',
      '„4. Abläufe & internes Kontrollsystem“: die vorbelegten Texte an den eigenen Betrieb anpassen',
      '„💾 Entwurf speichern“. „📄 PDF erstellen“ speichert vorher selbst — prüfen Sie, dass „gespeichert“ erscheint',
      '„✓ Finale Version festschreiben“ (mit Rückfrage). Die Fassung steht danach unter „Finale Version & Historie“ mit Datum und eigenem „📄 PDF“',
    ],
    probe: { anlegen: 'Ein Feld ändern und „💾 Entwurf speichern“. Dabei NICHT festschreiben.', loeschen: 'Löschen ist nicht möglich: Das Feld zurückändern und erneut „💾 Entwurf speichern“. Eine festgeschriebene Version bleibt dauerhaft in der Historie.' },
    vorher: [{ text: 'Firmendaten im Betriebsprofil unter Einstellungen', href: '/dashboard/einstellungen' }],
  },
  '/dashboard/compliance': {
    zweck: 'Pflichten mit echten Folgen im Blick: Sofortmeldungen neuer Beschäftigter, § 48b-Freistellungsbescheinigungen (eigene und von Subunternehmern) und wiederkehrende Prüffristen wie Führerscheinkontrolle, UVV/DGUV V3 und TÜV, jeweils mit Ampel.',
    wer: 'chef',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Gelöscht wird mit 🗑 am Eintrag, jeweils mit Rückfrage.',
    schritte: [
      '„🧑‍🏭 Sofortmeldung (gegen Schwarzarbeit)“: „Name *“, „SV-Nummer“, „Geburtsdatum“, „Betriebsnummer“ und „Beschäftigt ab“ eintragen, dann „＋ Erfassen“',
      '„📋 Meldedaten“ kopiert die Angaben zum Einfügen in sv.net. Die Meldung selbst läuft über sv.net oder die Lohnsoftware. Danach „Als gemeldet“ (rückgängig mit „Zurücksetzen“)',
      '„🏗 §48b Freistellungsbescheinigung“: „Art“ (Eigene oder Subunternehmer), „Inhaber / Unternehmen *“, „Finanzamt“, „Sicherheitsnummer“, „Gültig von“ und „Gültig bis“, dann „＋ Bescheinigung speichern“. 30 Tage vor Ablauf wird die Anzeige gelb',
      '„🪪 Prüffristen“: „Art“, „Bezeichnung *“, „Verantwortlich / Fahrzeug“, „Letzte Prüfung“ und „Intervall (Monate)“, dann „＋ Prüffrist“. Die nächste Fälligkeit wird berechnet',
      'Nach einer Prüfung „✓ geprüft“: Das setzt die letzte Prüfung auf heute und rechnet die nächste Fälligkeit neu',
      'Unterweisungen, Gefährdungsbeurteilung, Versicherungen und Subunternehmer-Nachweise stehen unter „🗂 Nachweise & Fristen“',
    ],
    probe: { anlegen: 'Eine Prüffrist „Test“ mit der Art „📋 Sonstige“.', loeschen: '🗑 am Eintrag, dann die Rückfrage „Eintrag löschen?“ bestätigen.' },
    landetIn: [{ text: 'Weitere Nachweise und Fristen', href: '/dashboard/nachweise' }],
  },
  '/dashboard/dsgvo': {
    zweck: 'Das DSGVO-Center: Betroffenenanfragen mit Ein-Monats-Frist und Ampel, Auskunft (Art. 15) und Löschung (Art. 17) für einen Kontakt samt Löschnachweis und Änderungsprotokoll sowie das Verzeichnis der Verarbeitungstätigkeiten (Art. 30) als PDF.',
    wer: 'chef',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Anfragen und Verarbeitungstätigkeiten werden mit ✕ gelöscht — Achtung: sofort und ohne Rückfrage. Die Löschung einer Person verlangt das Freigabewort „LOESCHEN“. Das Löschprotokoll lässt sich weder bearbeiten noch entfernen.',
    schritte: [
      '„📨 Betroffenenanfragen (DSAR)“: Name, optional E-Mail, die Art (z. B. „Auskunft (Art. 15)“) und das Eingangsdatum, dann „+ Eintragen“. Die Frist wird auf einen Monat ab Eingang gesetzt — bitte gegen den Kalender prüfen',
      'Die Ampel zeigt „in … T“, „heute fällig“ oder „… T überfällig“ (gelb ab 7 Tagen vor der Frist). Ist die Anfrage beantwortet, „Erledigt“. Sie verschwindet dann aus der Liste',
      '„⚖️ Auskunft und Löschung durchführen“: die betroffene Person nach Name, Firma oder E-Mail suchen, „Suchen“ und dann „Auswählen“',
      '„📄 Auskunft erstellen (Art. 15)“ lädt eine Datei mit allen gespeicherten Daten herunter, die man so weitergeben kann',
      '„🗑 Löschung vorbereiten (Art. 17)“ zeigt, was gelöscht, was anonymisiert und was wegen der Aufbewahrungspflicht behalten wird. Zum Ausführen „LOESCHEN“ eintippen und „Endgültig löschen“. Das lässt sich nicht rückgängig machen. Danach steht ein Antworttext bereit („Text kopieren“)',
      'Für Prüfungen: „🧾 Nachweis: durchgeführte Löschungen“ und „Protokoll anzeigen“ (Änderungsprotokoll, nur Feldnamen, keine Werte)',
      '„📋 Verzeichnis der Verarbeitungstätigkeiten (Art. 30)“: den Datenschutzbeauftragten eintragen und „Speichern“. Dann die Vorschläge übernehmen und anpassen oder eine eigene mit „+ Verarbeitungstätigkeit hinzufügen“ anlegen',
      '„⭳ Verzeichnis als PDF (Stand heute)“ erzeugt den Ausdruck, den die Aufsichtsbehörde auf Anfrage verlangt',
    ],
    probe: { anlegen: 'Eine Anfrage für „Test Person“ mit „+ Eintragen“.', loeschen: '✕ an der Anfrage — Achtung: sofort und ohne Rückfrage. Die Löschung nach Art. 17 nie mit einem echten Kontakt ausprobieren.' },
    vorher: [{ text: 'Firmenname und Anschrift im Betriebsprofil unter Einstellungen (Kopf des Verzeichnisses)', href: '/dashboard/einstellungen' }, { text: 'Kontakt im CRM (für Auskunft und Löschung)', href: '/dashboard/crm' }],
  },
  '/dashboard/datev': {
    zweck: 'Export für den Steuerberater: Ausgangsrechnungen und erfasste Eingangsbelege eines Zeitraums als DATEV-EXTF-Buchungsstapel, mit Vorabprüfung und einer Vorschau der Umsatzsteuer aus den Ausgangsrechnungen.',
    wer: 'lesen',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Hier wird nichts eingetragen oder gelöscht: nur den Zeitraum wählen und herunterladen.',
    schritte: [
      '„Von“ und „Bis“ wählen (vorbelegt: Monatsanfang bis heute)',
      'Die Hinweise unter „Vor dem Export prüfen“ lesen. Dort steht, was den DATEV-Import stören würde',
      '„⬇ DATEV-EXTF-Buchungsstapel“ lädt die Datei herunter. Sie geht an die Kanzlei',
      '„USt-Voranmeldung · Vorschau“: Rechnungen, Netto-Umsatz, Umsatzsteuer und Brutto des Zeitraums, ohne stornierte Rechnungen und OHNE Vorsteuer. Die Zahllast mit Vorsteuer steht unter USt-Voranmeldung',
      'Erscheint der Tipp zu „🔌 Schnittstellen → DATEV“, dort Kontenrahmen und Beraternummern hinterlegen. Ohne sie entsteht ein neutraler Stapel',
    ],
    vorher: [{ text: 'Ausgangsrechnungen', href: '/dashboard/rechnungen' }, { text: 'Erfasste Eingangsbelege', href: '/dashboard/eingangsbelege' }, { text: 'DATEV-Angaben unter Schnittstellen', href: '/dashboard/schnittstellen' }],
    landetIn: [{ text: 'Zahllast mit Vorsteuer: USt-Voranmeldung', href: '/dashboard/elster' }],
  },
  '/dashboard/foerdermittel': {
    zweck: 'Fördermittel-Assistent: Ein Fragebogen zu Vorhaben, Phase und Förderart zeigt passende Programme von Bund und Land aus einem gepflegten Katalog. Vorhaben kommen auf eine Merkliste, dort werden Status, Fristen, Bewilligung und Verwendungsnachweis verfolgt.',
    wer: 'chef',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). „🗑 Entfernen“ löscht ein Vorhaben — Achtung: sofort und ohne Rückfrage.',
    schritte: [
      'Den Fragebogen ausfüllen: bei „1 · Was möchten Sie fördern lassen?“ Themen antippen, dann „2 · In welcher Phase ist Ihr Betrieb?“, optional „3 · Bevorzugte Förderart“. „4 · Bundesland“ blendet einen Hinweis zu Landesprogrammen ein',
      'Unter „Passende Programme“ auf jeder Karte Träger, „Für wen“ und „Höhe“ lesen. „Zum Programm ↗“ führt zur offiziellen Quelle',
      '„＋ Verfolgen“ setzt das Programm auf die Merkliste „📌 Meine Vorhaben“',
      'Dort „Status“ (Interessiert, Beantragt, Bewilligt, Abgelehnt, Abgeschlossen) und „Frist“ pflegen. Das wird sofort gespeichert, die Notiz beim Verlassen des Feldes',
      'Ab Status „Bewilligt“: „Bewilligt (€)“, „Verwendet (€)“, „Nachweis-Frist“ und „Nachweis“ (offen, eingereicht, anerkannt). „🧾 Belegliste & Soll/Ist öffnen →“ führt zum Verwendungsnachweis',
      'Den „Katalog-Stand“ oben rechts beachten. Verbindlich sind immer die Bedingungen des Trägers',
    ],
    probe: { anlegen: '„＋ Verfolgen“ bei einem beliebigen Programm.', loeschen: '„🗑 Entfernen“ am Vorhaben — Achtung: sofort und ohne Rückfrage.' },
    landetIn: [{ text: 'Verwendungsnachweis', href: '/dashboard/foerdermittel/nachweis' }],
  },
  '/dashboard/foerdermittel/nachweis': {
    zweck: 'Verwendungsnachweis je Fördervorhaben: Finanzierungsplan laut Bescheid, Belegliste je Position, Soll/Ist mit Abweichungs-Ampel, Warnung bei Belegen außerhalb des Bewilligungszeitraums, Sachbericht-Vorlage und Druck.',
    wer: 'chef',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). Belege werden mit ✕ in der Belegzeile entfernt, mit Rückfrage.',
    schritte: [
      'Oben unter „Vorhaben“ das Vorhaben wählen',
      '„Finanzierungsplan (laut Bescheid)“: „Bewilligt von“ und „bis“ eintragen, mit „＋ Position“ die Positionen samt „Plan €“ anlegen, dann „Speichern“',
      '„Belege“: Position wählen, „Betrag €“, Datum, „Beleg-Nr.“ und „Empfänger“, dann „＋ Beleg“. Ein rotes Datum liegt außerhalb des Bewilligungszeitraums, „fehlt“ heißt: keine Belegnummer',
      '„Soll / Ist“ prüfen. „Summe als „verwendet“ übernehmen“ schreibt die Ist-Summe in die Fördermittel-Übersicht',
      '„Sachbericht“: „Vorlage einsetzen“, die Platzhalter ausfüllen, dann „Speichern“',
      '„🖨 Nachweis drucken / PDF“ lässt sich erst drücken, wenn im Sachbericht kein Platzhalter mehr offen ist',
    ],
    probe: { anlegen: 'Einen Beleg über 1 € mit der Beleg-Nr. „TEST“ erfassen.', loeschen: '✕ in der Belegzeile, dann die Rückfrage „Beleg aus der Liste entfernen?“ bestätigen. Wurde die Summe schon als „verwendet“ übernommen, sie danach erneut übernehmen.' },
    landetIn: [{ text: 'Fördermittel → Meine Vorhaben („Verwendet (€)“)', href: '/dashboard/foerdermittel' }],
    vorher: [{ text: 'Vorhaben im Fördermittel-Assistenten verfolgt und bewilligt', href: '/dashboard/foerdermittel' }],
  },
  '/dashboard/foerder-angebot': {
    zweck: 'Ein förder-taugliches Angebot (Kostenvoranschlag) für einen Kunden erstellen: eigene Positionen oder ein fertiges Paket, eine angenommene Förderquote mit Live-Schätzung von Zuschuss und Eigenanteil, gespeichert und als PDF herunterladbar.',
    wer: 'chef',
    werText: 'Chef oder Mitarbeiter mit Freigabe (sensibel). 🗑 löscht ein gespeichertes Angebot — Achtung: sofort und ohne Rückfrage.',
    schritte: [
      '„Kunde“ eintragen (vorhandene Kontakte werden beim Tippen vorgeschlagen) und den „Titel des Pakets“ prüfen',
      'Unter „Fertiges Paket laden:“ ein Paket wählen oder die Positionen selbst eintragen. „＋ Position hinzufügen“ fügt eine Zeile an, ✕ entfernt eine',
      '„Angenommene Förderquote“ wählen (30, 40, 50 oder 80 %), optional eine „Anmerkung (optional)“',
      'Die Schätzung zeigt „Netto-Kosten“, „Voraussichtl. Zuschuss“ und „Eigenanteil (netto)“',
      '„💾 Angebot speichern“, danach unter „Gespeicherte Angebote“ auf „⬇ PDF“',
      'Wichtig für den Kunden: Der Förderantrag muss gestellt und bewilligt sein, bevor der Auftrag erteilt wird',
    ],
    probe: { anlegen: 'Ein Angebot für „Test Kunde“ mit einem der fertigen Pakete speichern.', loeschen: '🗑 beim Angebot — Achtung: sofort und ohne Rückfrage.' },
    vorher: [{ text: 'Kunde im CRM (freiwillig, erscheint dann als Vorschlag)', href: '/dashboard/crm' }],
  },
  // --- Verwaltung (Teil A2d) -----------------------------------------------
  '/dashboard/webauftritt': {
    zweck: 'Die Firmen-Grundlage für alle Webseiten: Firmenname, Claim, Kurz-Story, Kernsätze, drei Farben, Schriftart, Logo-Adresse, Kontakt und Impressum-Angaben — mit Live-Vorschau und automatisch erzeugten Texten für Impressum, Datenschutz und AGB.',
    wer: 'chef',
    werText: 'Nur der Chef. Je Betrieb gibt es genau einen Firmen-Auftritt. Er wird überschrieben und lässt sich nicht löschen.',
    schritte: [
      'Unter „1 · Firma & Auftritt“ mindestens den „Firmenname *“ eintragen — ohne ihn wird nicht gespeichert',
      'Unter „2 · Look & Farben“ „Hauptfarbe“, „Zweitfarbe“, „Akzent (Knöpfe)“ und die „Schriftart“ wählen. Das Logo kommt als Web-Adresse zum Bild hinein, die Live-Vorschau oben zeigt die Wirkung',
      '„3 · Kontakt“ und „4 · Impressum & Rechtliches“ ausfüllen (Inhaber, USt-IdNr., Handelsregister, Kammer)',
      'Unter „5 · Ihre Rechtstexte“ die Reiter „Impressum“, „Datenschutz“ und „AGB“ ansehen und bei Bedarf „📋 Text kopieren“',
      '„💾 Firmen-Auftritt speichern“, danach „🖥️ Weiter zum Website-Bauer →“',
    ],
    landetIn: [{ text: 'Website-Bauer (baut die Seiten aus diesen Angaben)', href: '/dashboard/webseiten' }, { text: 'Barrierefreiheit (prüft die Farben)', href: '/dashboard/webseiten/barrierefreiheit' }],
  },
  '/dashboard/webseiten': {
    zweck: 'Baut aus dem Firmen-Auftritt eine fertige Webseite mit Impressum, Datenschutz und AGB im Fuß — per Vorlage, per KI oder im Baustein-Editor. Mit Vorschau für Desktop, Tablet und Handy, Veröffentlichen, eigener Domain und einem Berater zum Einbetten auf fremden Websites.',
    wer: 'chef',
    werText: 'Nur der Chef. Je Zweck gibt es genau eine Seite. Löschen kann man eine Seite hier nicht, nur offline nehmen.',
    schritte: [
      'Vorher unter „🌐 Webauftritt“ mindestens den Firmennamen speichern, sonst erscheint hier nur ein Hinweis',
      'Unter „1 · Wofür ist die Seite?“ den Zweck wählen: „Visitenkarte“, „Voll-Webseite“, „Verkaufsseite (Funnel)“, „Produkt- / Aktionsseite“ oder „Event / Anmeldung“',
      'Unter „2 · Wie soll gebaut werden?“: „Komplett mit KI“ (Story eintragen, dann „✨ KI baut die Seite“), „Feste Vorlage“ oder „KI + selbst justieren“ (Bausteine mit ↑ ↓ ⧉ ✕ bearbeiten, Bilder über „🖼️ Titelbild wählen“)',
      'In „3 · Vorschau“ Desktop, Tablet und Handy prüfen, dann „💾 Als meine Seite speichern“ — die Seite ist damit Entwurf, noch nicht online',
      'Unter „5 · Veröffentlichen“ „🌐 Jetzt veröffentlichen“. Danach steht dort „✅ Live:“ mit der Adresse. Offline nehmen: denselben Zweck wählen, „⏸ Offline nehmen“',
      'Achtung: „💾 Als meine Seite speichern“, „Domain speichern“ und „Freigabe speichern“ nehmen eine veröffentlichte Seite wieder offline — danach erneut „🌐 Jetzt veröffentlichen“',
      'Achtung: Ein Wechsel des Zwecks verwirft den ungespeicherten Stand ohne Rückfrage',
      'Optional „6 · Eigene Domain“ (danach DNS-Einträge beim Domain-Anbieter setzen) und „7 · Berater auf Ihrer eigenen Website“ (nur bei veröffentlichter Seite, „📋 Schnipsel kopieren“)',
    ],
    probe: { anlegen: 'Zweck „Event / Anmeldung“ wählen, „Feste Vorlage“ nehmen, dann „💾 Als meine Seite speichern“.', loeschen: 'Löschen ist hier nicht möglich. Eine veröffentlichte Seite nimmt man mit „⏸ Offline nehmen“ vom Netz, der Entwurf bleibt gespeichert.' },
    landetIn: [{ text: 'Leads (Anfragen aus dem Kontaktformular der veröffentlichten Seite)', href: '/dashboard/leads' }, { text: 'Barrierefreiheit (prüft die gespeicherten Seiten)', href: '/dashboard/webseiten/barrierefreiheit' }],
    vorher: [{ text: 'Firmen-Auftritt mit Firmennamen', href: '/dashboard/webauftritt' }],
  },
  '/dashboard/webseiten/barrierefreiheit': {
    zweck: 'Selbstprüfung nach dem Barrierefreiheitsstärkungsgesetz: Ist der Betrieb betroffen? Wie ist der Kontrast der eigenen Farben? Was fällt an den gespeicherten Seiten automatisch auf? Dazu die Liste für die Prüfung von Hand und die Pflicht-Erklärung für alle Seiten.',
    wer: 'chef',
    werText: 'Nur der Chef. Der Farb-Vorschlag ändert den Firmen-Auftritt erst nach einer Rückfrage. Die Erklärung lässt sich jederzeit wieder von den Seiten nehmen.',
    schritte: [
      '„1 · Bin ich betroffen?“: Privatkunden, Vertrag auf der Website, Beschäftigte und Umsatz eintragen, dann „Speichern“. Darunter steht das Ergebnis',
      '„2 · Farben Ihres Auftritts“: Bei ✗ „Vorschlag … übernehmen“. Nach der Rückfrage gilt die Farbe auf allen Seiten',
      '„3 · Ihre Seiten automatisch geprüft“: bei einer Seite „… Befund(e) ansehen“ öffnen',
      '„4 · Von Hand prüfen“: die Liste einmal im Jahr und nach größeren Änderungen durchgehen',
      '„5 · Informationen zur Barrierefreiheit“ ausfüllen, „Vorschau der Erklärung“ lesen, dann „Erklärung auf alle Seiten stellen“. Entfernen mit „Von den Seiten nehmen“',
    ],
    landetIn: [{ text: 'Website-Bauer (Erklärung im Fuß jeder Seite)', href: '/dashboard/webseiten' }, { text: 'Webauftritt (übernommene Farben)', href: '/dashboard/webauftritt' }],
    vorher: [{ text: 'Firmen-Auftritt', href: '/dashboard/webauftritt' }, { text: 'Gespeicherte Seiten im Website-Bauer', href: '/dashboard/webseiten' }],
  },
  '/dashboard/rechte': {
    zweck: 'Legt für jeden Mitarbeiter fest, welche Bereiche er sieht und wo er zusätzlich speichern und löschen darf („✏️ darf ändern“) — mit Vorlagen per Klick und der Verteil-Vollmacht für Administratoren. Der Chef sieht immer alles, „Übersicht“ und „Mein Bereich“ sieht jeder.',
    wer: 'chef',
    werText: 'Nur der Chef — und Mitarbeiter mit Verteil-Vollmacht (Administrator), die aber nur Module weitergeben, die sie selbst haben. Administratoren ernennt nur der Eigentümer.',
    schritte: [
      'Mitarbeiter zuerst unter „Personal“ anlegen. Ohne Mitarbeiter zeigt die Seite „Noch keine Mitarbeiter“',
      'Beim Mitarbeiter eine Vorlage wählen („Lager“, „Produktion“, „Büro“, „Vertrieb“, „Alle“, „Keine“) und danach einzelne Häkchen anpassen',
      'Bereich freigeben: Das Häkchen beim Modul erlaubt das Ansehen. Soll er dort auch speichern und löschen, zusätzlich „✏️ darf ändern“ anhaken (erscheint erst mit dem Sicht-Häkchen)',
      'Bereiche mit „🔒 sensibel“ sind rechtlich oder kaufmännisch heikel (Geld, Personal, Daten). Beim Anhaken fragt die Seite nach, bestätigt wird mit „Ja, freigeben“',
      '„💾 Rechte speichern“ — bei sensiblen Bereichen erst die Zusammenfassung mit „Speichern bestätigen“. Erst mit „✓ Gespeichert“ gilt die Freigabe',
      'Achtung: Eine Vorlage setzt alle „✏️ darf ändern“ zurück. Wer unter „Nutzer & Tarif“ „Standard-Nutzer“ ist, sieht sensible Bereiche trotz Häkchen nicht; „Self-Service“ sieht nur Mein Bereich und Stempeluhr',
    ],
    landetIn: [{ text: 'Wer sieht was (Übersicht der Freigaben)', href: '/dashboard/wer-sieht-was' }],
    vorher: [{ text: 'Mitarbeiter im Personal', href: '/dashboard/personal' }, { text: 'Sitz-Typ unter Nutzer & Tarif', href: '/dashboard/nutzer-tarif' }],
  },
  '/dashboard/nutzer-tarif': {
    zweck: 'Legt für jeden Mitarbeiter den Sitz-Typ fest: „Voll-Nutzer“, „Standard-Nutzer“ (ohne sensible Bereiche) oder „Self-Service“ (nur Mein Bereich und Stempeluhr). Oben stehen die Zahlen je Typ, der Inhaber zählt immer als Voll-Nutzer.',
    wer: 'chef',
    werText: 'Nur der Chef. Die Änderung wird sofort beim Auswählen gespeichert, ohne eigenen Speichern-Knopf.',
    schritte: [
      'Mitarbeiter in der Liste suchen („noch kein Login“ heißt: noch nicht eingeladen)',
      'Rechts „Voll-Nutzer“, „Standard-Nutzer“ oder „Self-Service“ wählen — die Meldung „… gespeichert“ bestätigt',
      'Welche Bereiche jemand im Einzelnen sieht, stellen Sie unter „Rechte“ ein. Der Sitz-Typ grenzt das zusätzlich ein',
    ],
    landetIn: [{ text: 'Wer sieht was', href: '/dashboard/wer-sieht-was' }],
    vorher: [{ text: 'Mitarbeiter im Personal', href: '/dashboard/personal' }],
  },
  '/dashboard/standorte': {
    zweck: 'Die Standorte des Betriebs verwalten: genau ein Hauptsitz und beliebig viele Filialen, jeweils mit Adresse und Telefon, aktiv oder inaktiv. Darauf bauen Filialleitung, Filial-Module und Filialvergleich auf.',
    wer: 'chef',
    werText: 'Nur der Chef. Gelöscht wird erst nach „Wirklich löschen“; statt Löschen geht auch „Deaktivieren“.',
    schritte: [
      'Unter „Neuen Standort anlegen“ den „Name *“, Adresse und Telefon eintragen, dann „+ Standort anlegen“',
      'Für den Hauptsitz „Als Hauptsitz festlegen“ anhaken oder in der Liste „Als Hauptsitz“ — der bisherige wird automatisch Filiale',
      'In der Liste „Bearbeiten“ und „Änderungen speichern“ oder „Deaktivieren“ bzw. „Aktivieren“',
      'Oben prüfen, ob beim Hauptsitz „gesetzt“ steht und nicht „fehlt“',
    ],
    probe: { anlegen: 'Standort „Test“ mit „+ Standort anlegen“.', loeschen: '„Löschen“ beim Standort, dann „Wirklich löschen“.' },
    landetIn: [{ text: 'Filialleitung & Rollen', href: '/dashboard/filialleitung' }, { text: 'Filial-Module', href: '/dashboard/filial-module' }, { text: 'Filialvergleich', href: '/dashboard/filialvergleich' }],
  },
  '/dashboard/filialleitung': {
    zweck: 'Gibt jedem Mitarbeiter einen Leitungs-Titel (Gebiet, Betrieb/Team/Schicht oder einen eigenen) und ordnet ihn einem oder mehreren Standorten zu — eine eigene Ebene neben den Zugriffsrechten.',
    wer: 'chef',
    werText: 'Nur der Chef. Titel und Standort-Häkchen werden sofort gespeichert. Eigene Titel verschwinden mit × ohne Rückfrage.',
    schritte: [
      'Vorher unter „Standorte & Filialen“ Standorte anlegen',
      'Für Sonderfälle unter „Eigene Titel (Spezialfälle)“ einen Titel eintragen und „+ Titel speichern“',
      'Beim Mitarbeiter einen Titel wählen oder „— keine Leitungsrolle —“',
      '„🏢 Standorte (…)“ aufklappen und anhaken — jedes Häkchen wird sofort gespeichert. Zugriffsrechte stellen Sie weiterhin unter „Rechte“ ein',
    ],
    probe: { anlegen: 'Eigenen Titel „Test“ mit „+ Titel speichern“.', loeschen: '× am Titel — Achtung: sofort und ohne Rückfrage.' },
    landetIn: [{ text: 'Filialvergleich', href: '/dashboard/filialvergleich' }],
    vorher: [{ text: 'Standorte anlegen', href: '/dashboard/standorte' }, { text: 'Mitarbeiter im Personal', href: '/dashboard/personal' }],
  },
  '/dashboard/filial-module': {
    zweck: 'Schaltet je Standort einzelne Module ab, die eine Filiale nicht braucht. Solange nichts abgeschaltet ist, sind an jeder Filiale alle gebuchten Module aktiv.',
    wer: 'chef',
    werText: 'Nur der Chef. Jeder Klick auf ein Modul wird sofort gespeichert, ohne Rückfrage.',
    schritte: [
      'Unter „Standort wählen“ die Filiale auswählen',
      'Ein Modul anklicken, um es zwischen „aktiv“ und „aus“ umzuschalten. Rechts oben steht, wie viele „Abgeschaltet“ sind',
      'Danach im Menü dieser Filiale kontrollieren, ob die richtigen Bereiche sichtbar sind',
    ],
    landetIn: [{ text: 'Filialvergleich', href: '/dashboard/filialvergleich' }, { text: 'Wer sieht was', href: '/dashboard/wer-sieht-was' }],
    vorher: [{ text: 'Standorte anlegen', href: '/dashboard/standorte' }],
  },
  '/dashboard/filialvergleich': {
    zweck: 'Stellt die Filialen nebeneinander: Umsatz aus Rechnungen, offene Posten, Kassen-Umsatz, Aufträge, Team vor Ort (mit Entsandten), Leitung und abgeschaltete Module je Standort. Vorgänge ohne Filiale stehen gesondert.',
    wer: 'lesen',
    werText: 'Nur der Chef. Hier wird nichts eingetragen oder gelöscht — die Zahlen kommen aus Rechnungen, Kasse, Aufträgen, Personal und den Filial-Einstellungen.',
    schritte: [
      'Oben die Kennzahlen „Umsatz (Rechnungen)“, „Kassen-Umsatz“, „Offene Posten“ und „Team vor Ort“ lesen',
      '„🏆 Stärkste Filiale nach Umsatz“ nennt die Filiale mit dem höchsten Umsatz aus Rechnungen und Kasse',
      'In der Tabelle je Standort „Umsatz“, „Offen“, „Kasse“, „Aufträge“, „Team“ und „Mod. aus“ vergleichen. „+ Zahl“ bei Team = hierher entsandte Mitarbeiter',
      'Stornierte Rechnungen und Kassenbelege zählen nicht. Der Umsatz umfasst alle Rechnungen seit Beginn, ohne Zeitraum-Filter',
    ],
    vorher: [{ text: 'Standorte angelegt', href: '/dashboard/standorte' }, { text: 'Leitungsrollen vergeben', href: '/dashboard/filialleitung' }],
  },
  '/dashboard/wer-sieht-was': {
    zweck: 'Zeigt für jeden Mitarbeiter, wie viele und welche Module er sieht — berechnet aus den gebuchten Modulen, seinen Rechten und seinem Sitz-Typ (Voll, Standard, Self-Service).',
    wer: 'lesen',
    werText: 'Nur der Chef, nur zum Nachsehen. Rechte ändert der Chef unter „Rechte“, Module je Filiale unter „Filial-Module“.',
    schritte: [
      'Oben stehen die Zahl der Mitarbeiter, die verfügbaren Module und wie viele einen Vollzugang haben',
      'Eine Person anklicken (▼): Ihre sichtbaren Module erscheinen nach Bereichen gruppiert, rechts „Anzahl / Gesamt“',
      'Steht dort 0, ist noch nichts freigegeben. Ändern über „🔑 Rechte je Mitarbeiter“ oder „🧩 Module je Filiale“',
    ],
    vorher: [{ text: 'Rechte je Mitarbeiter vergeben', href: '/dashboard/rechte' }, { text: 'Sitz-Typ festgelegt', href: '/dashboard/nutzer-tarif' }],
  },
  '/dashboard/schnittstellen': {
    zweck: 'Die Zentrale für externe Anbindungen, sortiert nach Geldfluss & Steuern, Marketing & Kanäle sowie Betrieb & Waren. Für Bezahllink, DATEV, Kasse/TSE, Shop, Versand und Marktplätze wählen Sie hier Anbieter und Zugangsdaten; die übrigen führen mit Anleitung ins eigene Modul.',
    wer: 'chef',
    werText: 'Nur der Chef. Geheime Felder werden verschlüsselt gespeichert und nie wieder angezeigt. Eine Anbindung lässt sich hier nicht löschen, nur umstellen.',
    schritte: [
      'Oben zeigt der „Verbindungs-Überblick“, wie viele Anbindungen live sind',
      'Karte mit „○ Demo-Modus“ öffnen, bei „Anbieter“ den Dienst wählen und die Felder ausfüllen (bei DATEV z. B. Kontenrahmen, Beraternummer, Mandantennummer)',
      'Häkchen „Anbieter aktiv schalten (live)“ setzen und „💾 Speichern“ — die Karte zeigt dann „● Live“',
      'Ein gespeichertes Geheimnis erscheint als „✓ gespeichert – zum Ändern neu eingeben“. Nur bei einer Änderung neu eintippen',
      'Karten mit „↗ separat“ (z. B. Bankkonto, ELSTER, Mail & Kalender) haben eine ①②③-Anleitung und „→ Hier einrichten“',
    ],
    probe: { anlegen: 'Bei einer Karte einen Anbieter wählen und OHNE das Häkchen „aktiv“ speichern.', loeschen: 'Löschen ist hier nicht möglich: Anbieter wieder auf Demo bzw. Manuell stellen oder das Häkchen „aktiv“ entfernen und speichern. Die Zugangsdaten bleiben dabei gespeichert.' },
    landetIn: [{ text: 'DATEV-Export', href: '/dashboard/datev' }, { text: 'Rechnungen (Bezahllink)', href: '/dashboard/rechnungen' }, { text: 'Kasse (TSE)', href: '/dashboard/kasse' }, { text: 'Versand', href: '/dashboard/versand' }, { text: 'Marktplätze', href: '/dashboard/marktplaetze' }],
  },
  '/dashboard/datensicherung': {
    zweck: 'Lädt eine Sicherung Ihrer Daten herunter: als Excel-Datei mit je einem Tabellenblatt für Kunden, Anfragen, Angebote, Aufträge, Rechnungen, Ausgaben, Projekte und Termine, oder als JSON-Datei.',
    wer: 'lesen',
    werText: 'Nur der Chef. Hier wird nichts eingetragen oder gelöscht, nur heruntergeladen — und nur die eigenen Daten.',
    schritte: [
      'Unter „Enthaltene Bereiche“ prüfen, was in der Sicherung steckt — Personal, Artikel, Kasse und Zahlungen sind derzeit NICHT dabei',
      '„⬇ Komplett-Backup als Excel“ klicken und warten, die Seite zeigt den gerade geladenen Bereich',
      'Für die maschinenlesbare Fassung „⬇ Als JSON“ (nur in der Ansicht „Voll“)',
      'Die Meldung „✓ … Datensätze aus 8 Bereichen“ bestätigt den Download. Die Datei an einen sicheren Ort legen, z. B. eine externe Festplatte',
    ],
  },
  '/dashboard/import': {
    zweck: 'Bringt bestehende Daten aus einer Excel- oder CSV-Datei in ARGONAUT, in vier Stufen: Ziel wählen, Datei laden, Spalten zuordnen, prüfen und importieren. Direkt hier: Kunden & Kontakte, Artikel & Preise, Lieferanten und Offene Posten; für weitere Bereiche Vorlagen und der Sprung ins jeweilige Modul.',
    wer: 'beide',
    werText: 'Wer das Modul „Import-Center“ hat, darf importieren. Einen Import rückgängig machen kann das Import-Center nicht — importierte Datensätze entfernen Sie im jeweiligen Zielbereich.',
    schritte: [
      '„1 · Was möchten Sie importieren?“: Kunden & Kontakte, Artikel & Preise, Lieferanten oder Offene Posten anklicken',
      '„2 · Datei auswählen“: Excel oder CSV mit Überschriften in der ersten Zeile. Ohne passende Datei zuerst „⬇ Mustervorlage“ laden',
      '„3 · Spalten zuordnen“: je Spalte das Feld wählen oder „— nicht importieren“ (Pflichtfelder mit *), dann „Prüfen — was käme an?“',
      '„4 · Prüfergebnis“ lesen. Bei vorhandenen Einträgen „Überspringen“ oder „Aktualisieren — Vorhandenes wird überschrieben“ wählen',
      '„… Datensätze jetzt importieren“ und die Rückfrage bestätigen. „Ergebnis ansehen ›“ führt zum Zielbereich',
      '„Diese Spalten-Zuordnung merken“ übernimmt die Zuordnung beim nächsten Import mit gleichem Datei-Aufbau',
    ],
    probe: { anlegen: 'Eine kleine Datei mit ein bis zwei Zeilen importieren, z. B. die „⬇ Mustervorlage“ für „Lieferanten“.', loeschen: 'Kein Knopf zum Rückgängigmachen. Jeden Datensatz im Zielbereich entfernen: Kontakte unter Vertrieb/CRM, Artikel unter ERP/Lager, Lieferanten unter ERP → Lieferanten. Offene Posten lassen sich unter Rechnungen nur stornieren.' },
    landetIn: [{ text: 'Vertrieb/CRM (Kontakte)', href: '/dashboard/crm' }, { text: 'ERP/Lager (Artikel)', href: '/dashboard/erp' }, { text: 'Rechnungen (offene Posten)', href: '/dashboard/rechnungen' }],
  },
  '/dashboard/automationen': {
    zweck: 'Baukasten für Regeln nach dem Muster Wenn – Und nur wenn – Wartezeit – Dann: z. B. bei überfälliger Rechnung eine E-Mail senden, eine Aufgabe anlegen, den Status ändern, die Mahnstufe erhöhen oder eine Notiz anhängen. Einmal täglich wird geprüft, was fällig ist; jede Ausführung steht im Protokoll.',
    wer: 'chef',
    werText: 'Nur der Chef legt Regeln an, pausiert und löscht sie. Gelöscht wird mit Rückfrage, das Protokoll der Regel verschwindet mit.',
    schritte: [
      'Unter „Fertige Vorlagen“ eine Vorlage anklicken (z. B. „Freundliche Zahlungserinnerung“) oder „＋ Leere Automation“',
      '„Name der Automation“ eintragen, bei „1 · Wenn das passiert“ den Auslöser wählen; in „Voll“ bei „2 · Und nur wenn“ mit „＋ Bedingung“ eingrenzen',
      '„3 · Erst nach dieser Wartezeit“ Tage eintragen, „4 · Dann tu das“ die Aktion wählen. Platzhalter wie {{name}}, {{betrag}}, {{nummer}} werden ersetzt',
      '„So liest sich Ihre Regel“ gegenlesen, dann „Automation anlegen“ — die Regel ist SOFORT aktiv',
      '„🔍 Probelauf — was würde jetzt passieren?“ rechnet nur und führt nichts aus. „Pausieren“, „Bearbeiten“, „Löschen“ stehen an jeder Regel',
    ],
    probe: { anlegen: 'Eine Vorlage übernehmen, „Automation anlegen“ und die Regel sofort „Pausieren“ — sie ist gleich nach dem Speichern aktiv. Dann „🔍 Probelauf“.', loeschen: '„Löschen“ an der Regel, mit Rückfrage.' },
    landetIn: [{ text: 'Rechnungen', href: '/dashboard/rechnungen' }, { text: 'Mahnwesen (Mahnstufe)', href: '/dashboard/mahnwesen' }, { text: 'Vertrieb/CRM', href: '/dashboard/crm' }],
  },
  '/dashboard/einstellungen': {
    zweck: 'Firmenprofil und Grundeinstellungen: Anschrift, Kontakt, Registerdaten, Steuer, Bankverbindung, Kleinunternehmer-Regel und Akzentfarbe für Dokumente — dazu Anfahrt und Fahrtkosten, API-Schlüssel, Modul-Auswahl fürs Menü und das eigene Passwort.',
    wer: 'chef',
    werText: 'Alle sehen die Seite, aber nur der Chef pflegt das Firmenprofil. Ein Mitarbeiter sieht hier nur „Mein Konto“ mit Name und Anmelde-Adresse.',
    schritte: [
      '„Firmendaten prüfen“ ganz oben öffnen: Die Ampel zeigt fehlende oder falsche Angaben (PLZ, USt-IdNr., IBAN)',
      'Ausfüllen: „Firma & Anschrift“, „Kontakt“, „Steuer“, „Bankverbindung“ und „Registerdaten“ (Rechtsform, Geschäftsführer, Registergericht, HRB — nur in der Ansicht „Voll“ sichtbar)',
      '„Ich bin Kleinunternehmer (§ 19 UStG)“ nur anhaken, wenn es zutrifft — dann ohne Umsatzsteuer mit gesetzlichem Hinweis. Danach „Firmenprofil speichern“',
      'Auf der Rechnung stehen Firmenname, Anschrift, Telefon, E-Mail, USt-IdNr./Steuernummer und Bankverbindung; das Angebots-PDF zeigt zusätzlich Website, Rechtsform, Geschäftsführer, Registergericht, HRB und die Akzentfarbe',
      '„Anfahrt & Entfernungen“: Betriebsstandort anlegen, Schlüssel mit „Prüfen und speichern“ hinterlegen, Fahrtkosten-Stufen eintragen und „Einstellungen speichern“',
      '„Automatisierung“: „+ Schlüssel erzeugen“ (höchstens fünf) — er wird nur einmal angezeigt, gleich „📋 Kopieren“',
      '„🧩 Module & Ansicht“: nicht benötigte Bereiche ausschalten und „Speichern“ — nur das Menü wird kleiner, die Daten bleiben',
      '„🔑 Passwort ändern“: aktuelles und zweimal das neue Passwort (mind. 8 Zeichen); danach werden andere Geräte abgemeldet',
    ],
    probe: { anlegen: 'Einen API-Schlüssel „Test“ über „+ Schlüssel erzeugen“ anlegen.', loeschen: '„Widerrufen“ am Schlüssel, mit Rückfrage.' },
    landetIn: [{ text: 'Rechnungen (Absender, Steuer, Bank)', href: '/dashboard/rechnungen' }, { text: 'Angebote (Briefkopf und Fußzeile)', href: '/dashboard/angebote' }],
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
