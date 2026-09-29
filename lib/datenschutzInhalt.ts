// ============================================================================
// ARGONAUT OS · lib/datenschutzInhalt.ts — Inhalt der Datenschutzerklaerung
// (Paket 178, 29.09.2026)
//
// Warum eine eigene Datei: Die Erklaerung muss zum CODE passen. Der Test
// tests/datenschutzP178.test.mjs prueft deshalb, dass jeder tatsaechlich
// genutzte Dienst hier steht und dass keine falsche Zusicherung zurueckkommt
// (z. B. „Anthropic anonymisiert", „Voyage entfernt Personenbezug").
// Die Seite app/datenschutz/page.tsx zeigt nur an, was hier steht.
//
// Befunde, die zur Neufassung gefuehrt haben (Pruefung 29.09.2026):
//   • An Anthropic und Voyage gehen Inhalte NICHT anonymisiert.
//   • Voyage nutzt Inhalte laut eigenen Bedingungen zum Training, solange der
//     Kunde nicht widerspricht (Opt-out) -> Martin widerspricht vor dem Push.
//   • Es fehlten: Resend (E-Mail), Ersatz-KI, PDF-Server, cookiefreie Messung,
//     KI-Berater auf der Website, Werbe-Einwilligungen, Kundenwebsites, die
//     Rolle als Auftragsverarbeiter und die Gesundheitsangaben (Praxis-Paket).
//   • Aufbewahrung Buchungsbelege: 8 statt 10 Jahre (seit 01.01.2025).
//   • Die Server-Funktionen laufen seit Paket 178 fest in Frankfurt (vercel.json).
//
// Stand vor Anwalt (Checkliste R38). Keine Namen von Mitbewerbern.
// ============================================================================

export const DSE_STAND = 'September 2026';

export type DseTabelle = { kopf: string[]; zeilen: string[][] };
export type DseTeil = string | { tabelle: DseTabelle } | { hinweis: string };
export type DseAbschnitt = { id: string; titel: string; teile: DseTeil[] };

/** Empfaenger und Dienstleister — genau die, die der Code heute anspricht. */
export const DSE_EMPFAENGER: DseTabelle = {
  kopf: ['Empfänger', 'Aufgabe', 'Ort der Verarbeitung / Grundlage der Übermittlung'],
  zeilen: [
    ['Supabase Inc.', 'Datenbank, Anmeldung, Dateispeicher', 'Rechenzentrum in der EU (Stockholm, Schweden); Unternehmen in den USA – Standardvertragsklauseln'],
    ['Vercel Inc.', 'Auslieferung der Website und Server-Funktionen', 'Server-Funktionen in Frankfurt am Main; weltweites Auslieferungsnetz; Unternehmen in den USA – Standardvertragsklauseln bzw. EU-US Data Privacy Framework'],
    ['Hostinger International Ltd.', 'Erzeugung von PDF-Dokumenten (Rechnungen, Angebote, Dossiers)', 'Server in der EU'],
    ['Plus Five Five, Inc. („Resend“)', 'Versand von E-Mails (Bestätigungen, Benachrichtigungen, Newsletter)', 'USA – Standardvertragsklauseln'],
    ['Anthropic PBC', 'KI-Funktionen (Texte, Auswertungen, KI-Berater)', 'USA – Standardvertragsklauseln'],
    ['Voyage AI Innovations, Inc. (gehört zu MongoDB, Inc.)', 'Dokumentensuche: Umwandlung von Textabschnitten in Suchvektoren', 'USA – Standardvertragsklauseln'],
    ['Ersatz-KI-Anbieter (nur falls eingerichtet)', 'Übernimmt KI-Anfragen ohne Werkzeuge, wenn der Hauptanbieter ausfällt', 'Europäischer Anbieter mit Sitz in der EU'],
    ['360dialog GmbH / Meta Platforms Ireland Ltd.', 'WhatsApp-Nachrichten – nur wenn ein Betrieb WhatsApp verbindet', 'Deutschland / Irland'],
    ['Unsere Hausbank', 'Einzug der vereinbarten Entgelte per SEPA-Lastschrift', 'Deutschland'],
  ],
};

export const DSE_ABSCHNITTE: DseAbschnitt[] = [
  {
    id: 'verantwortlicher',
    titel: '§ 1 Verantwortlicher und Kontakt',
    teile: [
      'Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist Gaspar AI Consulting, Martin Gaspar, Böblingen, Baden-Württemberg, Deutschland. E-Mail: info@argonaut-os.com, Web: argonaut-os.com.',
      'Bei allen Fragen zum Datenschutz erreichen Sie uns unter info@argonaut-os.com. Ein Datenschutzbeauftragter ist nicht bestellt, weil die gesetzlichen Voraussetzungen dafür (§ 38 BDSG) nicht vorliegen.',
    ],
  },
  {
    id: 'rollen',
    titel: '§ 2 Für wen diese Erklärung gilt',
    teile: [
      '2.1 Als Verantwortliche verarbeiten wir Daten der Besucher dieser Website, von Interessenten (z. B. Anfragen, Test- und Demo-Anmeldungen, Newsletter) und von unseren Kunden und deren Nutzern, soweit es um das Kundenkonto und den Vertrag mit uns geht.',
      '2.2 Betriebe verwalten in ARGONAUT OS außerdem eigene Daten – etwa über ihre Kunden, Mitarbeiter und Lieferanten – und erstellen eigene Websites, Shops und Landingpages. Diese Daten verarbeiten wir ausschließlich im Auftrag des jeweiligen Betriebs (Auftragsverarbeitung nach Art. 28 DSGVO). Verantwortlich ist dann der Betrieb; es gilt dessen Datenschutzerklärung. Wenden Sie sich mit Anliegen zu diesen Daten bitte an den Betrieb. Anfragen, die uns erreichen, leiten wir an ihn weiter.',
    ],
  },
  {
    id: 'besuch',
    titel: '§ 3 Besuch der Website',
    teile: [
      '3.1 Beim Aufruf verarbeitet der Server technisch notwendige Daten: IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, zuvor besuchte Seite und Browser-Angaben. Das ist nötig, um die Seite auszuliefern, Fehler zu finden und Angriffe abzuwehren. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren Betrieb).',
      '3.2 Zum Schutz vor Missbrauch begrenzen wir, wie oft Formulare und öffentliche Schnittstellen in kurzer Zeit genutzt werden können. Dafür zählen wir Aufrufe unter einem Schlüssel, der aus der IP-Adresse und einem geheimen Wert berechnet wird; die IP-Adresse selbst wird dabei nicht gespeichert. Der Zähler gilt nur für ein kurzes Zeitfenster (höchstens einen Tag). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.',
      '3.3 Schriften werden von unserem eigenen Server ausgeliefert; beim Seitenaufruf wird keine Verbindung zu Schriften-Anbietern aufgebaut.',
    ],
  },
  {
    id: 'messung',
    titel: '§ 4 Cookiefreie Reichweitenmessung',
    teile: [
      '4.1 Um unser Angebot zu verbessern, messen wir mit einem eigenen Verfahren, welche Seiten aufgerufen werden, über welche Herkunft (z. B. Suchmaschine, Kampagnen-Kennzeichen) Besucher kommen, welche Links angeklickt werden und wie lange eine Seite sichtbar war. Aus der IP-Adresse wird nur das Land abgeleitet.',
      '4.2 Es werden keine Cookies gesetzt und keine Daten auf Ihrem Gerät gespeichert. Ihre IP-Adresse wird nicht gespeichert. Zur Zählung dient ein Schlüssel, der aus Datum, IP-Adresse, Browser-Angaben und einem geheimen Wert berechnet wird und täglich wechselt; ein Wiedererkennen über mehrere Tage ist damit nicht möglich. Die Daten werden nicht an Dritte weitergegeben.',
      '4.3 Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer datensparsamen Auswertung). Sie können der Messung jederzeit per E-Mail widersprechen oder sie verhindern, indem Sie JavaScript in Ihrem Browser für diese Seite ausschalten.',
    ],
  },
  {
    id: 'cookies',
    titel: '§ 5 Cookies und lokaler Speicher',
    teile: [
      '5.1 Wir setzen nur technisch notwendige Speicherungen ein: Anmelde-Cookies im Kundenbereich, damit Sie angemeldet bleiben, und im lokalen Speicher Ihres Browsers Ihre Entscheidung zum Cookie-Hinweis. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG sowie Art. 6 Abs. 1 lit. b bzw. f DSGVO.',
      '5.2 Werbe- oder Analyse-Cookies und Werkzeuge fremder Anbieter zur Nachverfolgung (z. B. Werbe-Pixel) setzen wir nicht ein. Sollte sich das ändern, geschieht es nur mit Ihrer vorherigen Einwilligung.',
    ],
  },
  {
    id: 'anfragen',
    titel: '§ 6 Anfragen, Test- und Demo-Anmeldungen, Terminbuchung',
    teile: [
      '6.1 Wenn Sie uns über ein Formular, per E-Mail oder über die Terminbuchung kontaktieren, verarbeiten wir Ihre Angaben (z. B. Name, Firma, Branche, E-Mail-Adresse, Telefonnummer, Nachricht, Wunschtermin), um Ihre Anfrage zu bearbeiten, einen Termin zu vereinbaren oder einen Testzugang einzurichten. Wir speichern sie in unserer Kundenverwaltung und bestätigen den Eingang per E-Mail.',
      '6.2 Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Maßnahmen vor Vertragsschluss) bzw. Art. 6 Abs. 1 lit. f DSGVO (Beantwortung allgemeiner Anfragen). Werbung senden wir Ihnen nur, wenn Sie dem gesondert zugestimmt haben (§ 7).',
    ],
  },
  {
    id: 'werbung',
    titel: '§ 7 Newsletter, Dossiers, E-Books und Webinare',
    teile: [
      '7.1 Werbe-E-Mails senden wir nur mit Ihrer Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Wir nutzen das Double-Opt-in-Verfahren: Nach der Anmeldung erhalten Sie eine E-Mail, in der Sie die Anmeldung bestätigen. Zeitpunkt und Herkunft der Anmeldung und der Bestätigung speichern wir als Nachweis.',
      '7.2 Jede Werbe-E-Mail enthält einen Abmeldelink; die Abmeldung ist auch mit einem Klick direkt im E-Mail-Programm möglich. Eine Abmeldung oder ein Widerspruch gilt für alle unsere Werbe-E-Mails. Damit wir sie dauerhaft beachten können, führen wir Ihre E-Mail-Adresse danach in einer Sperrliste.',
      '7.3 Wir werten nur Gesamtzahlen aus, wie viele E-Mails geöffnet und wie viele Links angeklickt wurden. Wer eine E-Mail geöffnet oder angeklickt hat, speichern wir nicht.',
      '7.4 Der Versand erfolgt über Resend (Plus Five Five, Inc., USA), das für uns als Auftragsverarbeiter tätig ist.',
    ],
  },
  {
    id: 'ki-berater',
    titel: '§ 8 KI-Berater auf dieser Website',
    teile: [
      '8.1 Auf einigen Seiten beantwortet ein KI-Berater Fragen zu ARGONAUT OS. Er ist als künstliche Intelligenz gekennzeichnet. Ihre Frage und der bisherige Gesprächsverlauf werden zur Beantwortung an Anthropic PBC (USA) übermittelt. Wir speichern die Fragen nicht; protokolliert wird nur der technische Verbrauch.',
      '8.2 Bitte geben Sie im Chat keine personenbezogenen oder sensiblen Daten ein. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse, Fragen schnell zu beantworten).',
    ],
  },
  {
    id: 'konto',
    titel: '§ 9 Kundenkonto, Vertrag und Zahlung',
    teile: [
      '9.1 Für Vertrag und Kundenkonto verarbeiten wir Stammdaten (Name, Firma, Anschrift, E-Mail-Adresse), Zugangsdaten, Angaben zur Zwei-Faktor-Anmeldung, Rollen und Rechte der Nutzer sowie Vertrags- und Abrechnungsdaten. Passwörter werden nur als verschlüsselter Prüfwert (Hash) gespeichert, nie im Klartext.',
      '9.2 Wir erfassen Nutzungs- und Verbrauchsdaten (z. B. Anmeldezeiten, gebuchte Nutzer-Plätze, belegter Speicher, Umfang der KI-Nutzung) sowie Sicherheits- und Zugriffsprotokolle, um die Leistung zu erbringen, abzurechnen, Missbrauch zu erkennen und Ihnen Ihren Verbrauch im Dashboard anzuzeigen.',
      '9.3 Die Zahlung erfolgt per SEPA-Lastschrift. Kontoinhaber und IBAN verwenden wir ausschließlich zum Einzug der vereinbarten Entgelte und übermitteln sie dafür an unsere Hausbank.',
      '9.4 Nach Vertragsende sperren wir den Zugang des Betriebs für alle seine Nutzer. Die Daten bleiben bis zur Löschung erhalten, damit Sie sie auf Wunsch noch erhalten können.',
      '9.5 Rechtsgrundlagen sind Art. 6 Abs. 1 lit. b DSGVO (Vertrag), Art. 6 Abs. 1 lit. c DSGVO (steuer- und handelsrechtliche Pflichten) und Art. 6 Abs. 1 lit. f DSGVO (Sicherheit und Missbrauchsschutz).',
    ],
  },
  {
    id: 'ki',
    titel: '§ 10 KI-Funktionen in ARGONAUT OS',
    teile: [
      { hinweis: 'Inhalte, die Sie an eine KI-Funktion geben, werden nicht anonymisiert. Sie gehen so an den KI-Anbieter, wie sie für die jeweilige Aufgabe gebraucht werden. Geben Sie deshalb nur ein, was für die Aufgabe nötig ist.' },
      '10.1 Wenn Sie eine KI-Funktion nutzen (z. B. Texte entwerfen, Dokumente auswerten, Fragen an den Assistenten), werden die dafür nötigen Inhalte an Anthropic PBC (USA) übermittelt. Anthropic verwendet diese Inhalte nach seinen Vertragsbedingungen für geschäftliche Kunden nicht zum Training seiner Modelle.',
      '10.2 Für die Suche in hochgeladenen Dokumenten werden Textabschnitte an Voyage AI (USA) übermittelt, das daraus Suchvektoren berechnet. Der Nutzung dieser Inhalte zum Training haben wir widersprochen; Voyage AI löscht die Inhalte nach der Verarbeitung.',
      '10.3 Fällt der Hauptanbieter aus, kann eine Anfrage ohne Werkzeuge – falls eingerichtet – von einem europäischen Ersatz-Anbieter beantwortet werden.',
      '10.4 Grundsätze: Die KI entscheidet nichts allein – Ergebnisse sind Vorschläge, die ein Mensch prüft und freigibt. KI-Texte an Kunden werden gekennzeichnet. Preise erfindet die KI nicht; fehlt eine Quelle, steht „Preis bitte ergänzen“. Angaben zu Krankheit und Gesundheit von Mitarbeitern oder Kunden werden nicht an die KI gegeben.',
      '10.5 Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertrag). Soweit die Inhalte Daten der Kunden eines Betriebs betreffen, verarbeiten wir sie in dessen Auftrag (§ 2.2).',
    ],
  },
  {
    id: 'gesundheit',
    titel: '§ 11 Gesundheitsangaben im Praxis-Bereich',
    teile: [
      '11.1 Praxen und andere Betriebe können in ARGONAUT OS Gesundheitsangaben ihrer Kunden erfassen (besondere Kategorien nach Art. 9 DSGVO). Das geschieht im Auftrag des Betriebs, der dafür die Einwilligung seiner Kunden bzw. eine andere Rechtsgrundlage benötigt.',
      '11.2 Diese Angaben werden zusätzlich zur Verschlüsselung der Datenbank einzeln verschlüsselt (AES-256). Lesbar werden sie nur über den Server, und jeder Lesezugriff wird vorher protokolliert. Erinnerungs-E-Mails enthalten keine Angaben zur Behandlung. Gesundheitsangaben gehen nicht an KI-Anbieter.',
    ],
  },
  {
    id: 'empfaenger',
    titel: '§ 12 Empfänger und Übermittlung in Drittländer',
    teile: [
      '12.1 Wir setzen folgende Dienstleister ein. Alle sind vertraglich zur Einhaltung der DSGVO verpflichtet; mit jedem besteht ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO bzw. der Anbieter handelt für die Zahlungsabwicklung eigenständig (Hausbank).',
      { tabelle: DSE_EMPFAENGER },
      '12.2 Bei Anbietern mit Sitz in den USA erfolgt die Übermittlung auf Grundlage der EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO) bzw., soweit der Anbieter zertifiziert ist, des Angemessenheitsbeschlusses zum EU-US Data Privacy Framework (Art. 45 DSGVO).',
      '12.3 Verbindet ein Betrieb weitere Dienste mit seinem eigenen Konto (z. B. Zahlungsanbieter, Shop-Systeme, Versanddienstleister, soziale Netzwerke, Werbeplattformen, WhatsApp), werden die dafür nötigen Daten in seinem Auftrag an diese Dienste übermittelt. Eine Weitergabe zu eigenen Werbezwecken an Dritte oder ein Verkauf von Daten findet nicht statt.',
    ],
  },
  {
    id: 'speicherdauer',
    titel: '§ 13 Speicherdauer',
    teile: [
      '13.1 Wir speichern personenbezogene Daten nur so lange, wie es für den jeweiligen Zweck nötig ist oder gesetzliche Aufbewahrungsfristen bestehen.',
      '13.2 Gesetzliche Fristen: Buchungsbelege und Rechnungen 8 Jahre, Handelsbücher und Jahresabschlüsse 10 Jahre, Handels- und Geschäftsbriefe 6 Jahre (§ 147 AO, § 257 HGB).',
      '13.3 Nachweise zu Werbe-Einwilligungen bewahren wir auf, solange die Einwilligung gilt, und danach bis zu drei Jahre, um sie belegen zu können. Die Sperrliste nach § 7.2 führen wir dauerhaft, weil nur so Ihr Widerspruch beachtet werden kann.',
      '13.4 Nach Vertragsende löschen wir die Daten Ihres Betriebs auf Anfrage innerhalb von 30 Tagen, soweit keine Aufbewahrungspflicht entgegensteht. Daten mit Aufbewahrungspflicht sperren wir bis zum Fristende.',
    ],
  },
  {
    id: 'rechte',
    titel: '§ 14 Ihre Rechte',
    teile: [
      { tabelle: {
        kopf: ['Recht', 'Was es bedeutet'],
        zeilen: [
          ['Auskunft (Art. 15 DSGVO)', 'Sie können Auskunft über die zu Ihrer Person gespeicherten Daten verlangen.'],
          ['Berichtigung (Art. 16 DSGVO)', 'Sie können die Berichtigung unrichtiger Daten verlangen.'],
          ['Löschung (Art. 17 DSGVO)', 'Sie können die Löschung verlangen, soweit keine Aufbewahrungspflicht entgegensteht.'],
          ['Einschränkung (Art. 18 DSGVO)', 'Sie können verlangen, dass Ihre Daten nur noch eingeschränkt verarbeitet werden.'],
          ['Datenübertragbarkeit (Art. 20 DSGVO)', 'Sie können Ihre Daten in einem gängigen, maschinenlesbaren Format erhalten.'],
          ['Widerspruch (Art. 21 DSGVO)', 'Sie können einer Verarbeitung auf Grundlage berechtigter Interessen widersprechen. Einer Verarbeitung für Werbung können Sie jederzeit ohne Begründung widersprechen.'],
          ['Widerruf (Art. 7 Abs. 3 DSGVO)', 'Sie können eine Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen.'],
          ['Beschwerde (Art. 77 DSGVO)', 'Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren, z. B. beim Landesbeauftragten für den Datenschutz und die Informationsfreiheit Baden-Württemberg.'],
        ],
      } },
      '14.1 Zur Ausübung Ihrer Rechte genügt eine E-Mail an info@argonaut-os.com.',
      '14.2 Eine ausschließlich automatisierte Entscheidung, die Ihnen gegenüber rechtliche Wirkung entfaltet (Art. 22 DSGVO), findet nicht statt.',
      '14.3 Die Angabe von Daten ist für Anfragen und den Vertrag nötig, soweit sie als Pflichtangabe gekennzeichnet ist; ohne sie können wir die Anfrage bzw. den Vertrag nicht bearbeiten.',
    ],
  },
  {
    id: 'sicherheit',
    titel: '§ 15 Datensicherheit',
    teile: [
      '15.1 Alle Verbindungen sind verschlüsselt (TLS). Die Datenbank ist verschlüsselt gespeichert; jeder Betrieb sieht nur seine eigenen Daten, Mitarbeiter nur die Bereiche, für die sie freigeschaltet sind.',
      '15.2 Die Anmeldung kann mit einem zweiten Faktor (Zwei-Faktor-Anmeldung) abgesichert werden; für die Verwaltung durch den Betreiber ist sie Pflicht.',
      '15.3 Bei einer Verletzung des Schutzes personenbezogener Daten melden wir diese innerhalb von 72 Stunden der zuständigen Aufsichtsbehörde (Art. 33 DSGVO) und benachrichtigen Betroffene, wenn ein hohes Risiko besteht (Art. 34 DSGVO). Betrifft der Vorfall Daten, die wir im Auftrag eines Betriebs verarbeiten, informieren wir den Betrieb unverzüglich.',
    ],
  },
  {
    id: 'aenderungen',
    titel: '§ 16 Änderungen dieser Datenschutzerklärung',
    teile: [
      '16.1 Wir passen diese Erklärung an, wenn sich unsere Dienste oder die Rechtslage ändern. Die aktuelle Fassung finden Sie stets unter argonaut-os.com/datenschutz.',
      '16.2 Über wesentliche Änderungen informieren wir unsere Kunden per E-Mail.',
    ],
  },
];
