// ============================================================
// ARGONAUT OS · W2 · webRecht.ts — Automatische Rechtstexte + Seiten-Fuß
//
// Erzeugt aus dem CI-Speicher (web_ci) rechtssichere Grundtexte:
//   • impressumText   — Impressum nach § 5 DDG (aus den Firmendaten)
//   • datenschutzText — Datenschutz-Grundgerüst (DSGVO), klar als prüfpflichtig markiert
//   • agbText         — AGB-Hinweis (individuell, Pflicht erst beim Verkauf)
//   • fussHtml        — der FIXE Seiten-Fuß, der auf JEDER Seite gleich sitzt
//
// Reine Funktionen — KEINE Supabase-Aufrufe, KEINE React-Hooks. Damit von der
// Editor-Oberfläche, vom KI-Generator UND vom Seiten-Renderer (W3/W7) nutzbar.
// ============================================================

export interface CiRecht {
  firma?: string | null;
  impressum_inhaber?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  telefon?: string | null;
  email?: string | null;
  impressum_ustid?: string | null;
  impressum_register?: string | null;
  impressum_aufsicht?: string | null;
}

function z(v?: string | null): string {
  return (v ?? '').trim();
}

function ortZeile(ci: CiRecht): string {
  return [z(ci.plz), z(ci.ort)].filter(Boolean).join(' ');
}

// --- Impressum nach § 5 DDG -------------------------------------------------
export function impressumText(ci: CiRecht): string {
  const firma = z(ci.firma) || 'Ihr Firmenname';
  const inhaber = z(ci.impressum_inhaber);
  const strasse = z(ci.strasse);
  const ort = ortZeile(ci);
  const tel = z(ci.telefon);
  const mail = z(ci.email);
  const ustid = z(ci.impressum_ustid);
  const register = z(ci.impressum_register);
  const aufsicht = z(ci.impressum_aufsicht);

  const t: string[] = [];
  t.push('Angaben gemäß § 5 DDG');
  t.push('');
  t.push(firma);
  if (inhaber) t.push('Vertreten durch: ' + inhaber);
  if (strasse) t.push(strasse);
  if (ort) t.push(ort);
  t.push('');
  t.push('Kontakt');
  if (tel) t.push('Telefon: ' + tel);
  if (mail) t.push('E-Mail: ' + mail);
  if (register) { t.push(''); t.push('Registereintrag'); t.push(register); }
  if (ustid) { t.push(''); t.push('Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG'); t.push(ustid); }
  if (aufsicht) { t.push(''); t.push('Zuständige Kammer / Aufsichtsbehörde'); t.push(aufsicht); }
  t.push('');
  t.push('Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV');
  t.push([inhaber || firma, strasse, ort].filter(Boolean).join(', '));
  return t.join('\n');
}

// --- Datenschutz-Grundgerüst (DSGVO) ----------------------------------------
// Paket 178: beschreibt die Dienste, die ARGONAUT auf der Seite WIRKLICH
// einsetzt — immer Bereitstellung + cookiefreie Messung, dazu je eingebautem
// Baustein (Formular, Newsletter, Termine, Shop, KI-Berater, Video, Karte,
// WhatsApp). Ohne Angaben (Editor-Vorschau) kommen alle Abschnitte mit dem
// Zusatz „falls auf Ihrer Seite eingebaut". Bleibt ein prüfpflichtiges Gerüst.
export interface WebDienste {
  kontakt?: boolean;
  newsletter?: boolean;
  termine?: boolean;
  shop?: boolean;
  chatbot?: boolean;
  video?: boolean;
  karte?: boolean;
  whatsapp?: boolean;
}

export function datenschutzText(ci: CiRecht, dienste?: WebDienste): string {
  const firma = z(ci.firma) || 'Ihr Firmenname';
  const verantwortlich = [z(ci.impressum_inhaber) || firma, z(ci.strasse), ortZeile(ci)].filter(Boolean).join(', ');
  const mail = z(ci.email);
  const alle = !dienste;
  const d = dienste || {};
  const falls = alle ? ' (falls auf dieser Website eingebaut)' : '';

  const t: string[] = [];
  let nr = 0;
  const abschnitt = (titel: string, ...absaetze: string[]) => {
    nr += 1;
    t.push('', nr + '. ' + titel, ...absaetze);
  };

  t.push('Datenschutzerklärung');
  abschnitt('Verantwortlicher',
    'Verantwortlich für die Datenverarbeitung auf dieser Website ist:',
    verantwortlich + (mail ? ', E-Mail: ' + mail : ''));
  abschnitt('Bereitstellung der Website',
    'Diese Website wird mit ARGONAUT OS (Gaspar AI Consulting, Martin Gaspar, Böblingen) bereitgestellt, das für uns als Auftragsverarbeiter nach Art. 28 DSGVO tätig ist. Die Seiten werden über Vercel Inc. (USA) ausgeliefert, die Daten werden bei Supabase in einem Rechenzentrum in der EU gespeichert.',
    'Beim Aufruf verarbeitet der Server technisch notwendige Daten (IP-Adresse, Datum und Uhrzeit, aufgerufene Seite, Browser-Angaben), um die Seite auszuliefern und vor Missbrauch zu schützen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Für Übermittlungen in die USA gelten die EU-Standardvertragsklauseln bzw. der EU-US Data Privacy Framework.');
  abschnitt('Cookiefreie Reichweitenmessung',
    'Wir messen, welche Seiten aufgerufen werden, woher Besucher kommen, welche Links angeklickt werden und wie lange eine Seite sichtbar war. Dafür werden keine Cookies gesetzt und nichts auf Ihrem Gerät gespeichert. Ihre IP-Adresse wird nicht gespeichert; zur Zählung dient ein Schlüssel, der aus Datum, IP-Adresse und Browser-Angaben berechnet wird und täglich wechselt. Ein Wiedererkennen über mehrere Tage ist damit nicht möglich. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (Verbesserung unseres Angebots).');
  if (alle || d.kontakt) {
    abschnitt('Kontakt- und Anfrageformular' + falls,
      'Nutzen Sie unser Formular, verarbeiten wir Ihre Angaben (z. B. Name, E-Mail-Adresse, Telefonnummer, Nachricht) zur Bearbeitung Ihrer Anfrage und speichern sie in unserer Kundenverwaltung. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Anfrage vor Vertragsschluss) bzw. lit. f DSGVO. Werbung senden wir Ihnen nur, wenn Sie dem gesondert zugestimmt haben.');
  }
  if (alle || d.newsletter) {
    abschnitt('Newsletter' + falls,
      'Für den Newsletter nutzen wir das Double-Opt-in-Verfahren: Sie erhalten zuerst eine E-Mail, in der Sie die Anmeldung bestätigen. Wir speichern Zeitpunkt und Herkunft der Anmeldung als Nachweis. Rechtsgrundlage ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Sie können sich jederzeit über den Link in jeder E-Mail abmelden. Wir werten nur Gesamtzahlen von Öffnungen und Klicks aus, nicht je Empfänger. Der Versand erfolgt über Resend (Plus Five Five, Inc., USA).');
  }
  if (alle || d.termine) {
    abschnitt('Terminbuchung' + falls,
      'Buchen Sie einen Termin, verarbeiten wir Name, Kontaktdaten, Wunschtermin und Ihre Nachricht, um den Termin zu vereinbaren und Sie daran zu erinnern. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.');
  }
  if (alle || d.shop) {
    abschnitt('Bestellungen im Shop' + falls,
      'Für Bestellungen verarbeiten wir Name, Anschrift, E-Mail-Adresse, bestellte Artikel und Zahlungsangaben zur Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) und bewahren Rechnungen nach den steuerlichen Fristen auf (Art. 6 Abs. 1 lit. c DSGVO). Bei Zahlung über einen Zahlungsdienst gelten zusätzlich dessen Datenschutzhinweise. Einen Widerruf können Sie über das Widerrufsformular auf dieser Seite erklären.');
  }
  if (alle || d.chatbot) {
    abschnitt('KI-Berater im Chat' + falls,
      'Der Chat-Berater ist eine künstliche Intelligenz und als solche gekennzeichnet. Ihre Fragen werden zur Beantwortung an Anthropic PBC (USA) übermittelt, das die Inhalte nach seinen Vertragsbedingungen nicht zum Training seiner Modelle verwendet. Wir speichern die Fragen nicht dauerhaft. Geben Sie im Chat freiwillig Kontaktdaten an, damit wir uns melden, speichern wir diese als Anfrage. Bitte geben Sie keine sensiblen Daten (z. B. Gesundheitsangaben) ein. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f bzw. lit. b DSGVO.');
  }
  if (alle || d.video) {
    abschnitt('Videos von YouTube und Vimeo' + falls,
      'Eingebundene Videos werden erst geladen, wenn Sie auf „Video abspielen" klicken. Erst dann werden Daten wie Ihre IP-Adresse an den Anbieter übertragen (YouTube: Google Ireland Limited; Vimeo: Vimeo.com, Inc., USA). YouTube-Videos binden wir im erweiterten Datenschutzmodus ein. Rechtsgrundlage ist Ihre Einwilligung durch den Klick (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG).');
  }
  if (alle || d.karte) {
    abschnitt('Karte und Routenplanung' + falls,
      'Die Karte von Google Maps (Google Ireland Limited) wird erst nach Klick auf „Karte anzeigen" geladen; „Route planen" öffnet Google Maps in einem neuen Fenster. Erst dann werden Daten wie Ihre IP-Adresse an Google übertragen. Rechtsgrundlage ist Ihre Einwilligung durch den Klick (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG).');
  }
  if (alle || d.whatsapp) {
    abschnitt('Kontakt über WhatsApp' + falls,
      'Der WhatsApp-Knopf öffnet WhatsApp (WhatsApp Ireland Limited). Schreiben Sie uns dort, gelten zusätzlich die Datenschutzhinweise von WhatsApp. Auf unserer Seite selbst werden dabei keine Daten an WhatsApp übertragen.');
  }
  abschnitt('Speicherdauer',
    'Wir speichern Ihre Daten nur so lange, wie es für den jeweiligen Zweck nötig ist oder gesetzliche Aufbewahrungsfristen bestehen (z. B. 8 Jahre für Buchungsbelege und Rechnungen, 6 Jahre für Geschäftsbriefe).');
  abschnitt('Ihre Rechte',
    'Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Einer Verarbeitung für Werbung können Sie jederzeit ohne Begründung widersprechen. Eine Einwilligung können Sie jederzeit für die Zukunft widerrufen (Art. 7 Abs. 3). Wenden Sie sich dazu an die oben genannte verantwortliche Stelle.');
  abschnitt('Beschwerderecht',
    'Ihnen steht ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde zu, insbesondere in dem Bundesland Ihres Wohnsitzes oder unseres Sitzes.');
  t.push('', 'Hinweis: Dies ist ein Grundgerüst aus ARGONAUT OS. Ergänzen Sie weitere Dienste, die Sie selbst einsetzen (z. B. Zahlungsanbieter, eigene Werbe- oder Social-Media-Einbindungen), und lassen Sie den Text vor der Veröffentlichung prüfen.');
  return t.join('\n');
}

// --- AGB-Hinweis ------------------------------------------------------------
export function agbText(ci: CiRecht): string {
  const firma = z(ci.firma) || 'Ihr Firmenname';
  return [
    'Allgemeine Geschäftsbedingungen (AGB)',
    '',
    'Für Verträge, die über diese Website zustande kommen, gelten die Allgemeinen Geschäftsbedingungen von ' + firma + '.',
    '',
    'Hinweis: AGB sind individuell. Für einen reinen Internetauftritt ohne Verkauf sind sie in der Regel nicht erforderlich. Sobald Sie online verkaufen (Shop), sind AGB und eine Widerrufsbelehrung Pflicht — diese ergänzen wir automatisch, wenn Sie den Shop aktivieren.',
  ].join('\n');
}

// --- Fixer Seiten-Fuß (auf JEDER Seite gleich) ------------------------------
// Escaped den Firmennamen, damit kein HTML durchschlägt. `jahr` wird vom
// Aufrufer übergeben (z. B. new Date().getFullYear()), damit die Funktion rein
// und testbar bleibt.
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fussHtml(ci: CiRecht, jahr: number, opts: { widerruf?: boolean; barrierefreiheit?: boolean } = {}): string {
  const firma = esc(z(ci.firma) || 'Ihr Firmenname');
  return [
    '<footer class="ao-fuss">',
    '  <div class="ao-fuss-inner">',
    '    <span>© ' + jahr + ' ' + firma + '</span>',
    '    <nav class="ao-fuss-links">',
    '      <a href="#impressum">Impressum</a>',
    '      <a href="#datenschutz">Datenschutz</a>',
    '      <a href="#agb">AGB</a>',
    opts.widerruf ? '      <a href="#widerruf" class="ao-fuss-widerruf"><b>Vertrag widerrufen</b></a>' : '',
    opts.barrierefreiheit ? '      <a href="#barrierefreiheit">Barrierefreiheit</a>' : '',
    '    </nav>',
    // Paket 273: offener Hinweis auf ARGONAUT — nur die Marke, keine Suchbegriffe im Linktext.
    '    <a class="ao-fuss-ao" href="https://argonaut-os.com" rel="noopener">Präsentiert mit ARGONAUT OS</a>',
    '  </div>',
    '</footer>',
  ].filter(Boolean).join('\n');
}

// Praktische Kurzform für die Oberfläche: alle drei Texte auf einmal.
export function alleRechtstexte(ci: CiRecht): { impressum: string; datenschutz: string; agb: string } {
  return { impressum: impressumText(ci), datenschutz: datenschutzText(ci), agb: agbText(ci) };
}
