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
export function datenschutzText(ci: CiRecht): string {
  const firma = z(ci.firma) || 'Ihr Firmenname';
  const verantwortlich = [z(ci.impressum_inhaber) || firma, z(ci.strasse), ortZeile(ci)].filter(Boolean).join(', ');
  const mail = z(ci.email);

  return [
    'Datenschutzerklärung',
    '',
    '1. Verantwortlicher',
    'Verantwortlich für die Datenverarbeitung auf dieser Website ist:',
    verantwortlich + (mail ? ', E-Mail: ' + mail : ''),
    '',
    '2. Erhebung und Verarbeitung personenbezogener Daten',
    'Nutzen Sie unser Kontaktformular, verarbeiten wir die angegebenen Daten (z. B. Name, E-Mail-Adresse, Nachricht) ausschließlich zur Bearbeitung Ihrer Anfrage. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b bzw. f DSGVO.',
    '',
    '3. Hosting',
    'Diese Website wird auf Servern innerhalb der Europäischen Union gehostet. Beim Aufruf werden technisch notwendige Daten (z. B. IP-Adresse, Datum und Uhrzeit) verarbeitet, um die Auslieferung der Seite sicherzustellen.',
    '',
    '4. Ihre Rechte',
    'Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit sowie Widerspruch. Wenden Sie sich hierzu an die oben genannte verantwortliche Stelle.',
    '',
    '5. Beschwerderecht',
    'Ihnen steht ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde zu.',
    '',
    'Hinweis: Dies ist ein Grundgerüst. Ergänzen Sie es um die tatsächlich eingesetzten Dienste (z. B. Analyse, Karten, Zahlungsanbieter) und lassen Sie es vor der Veröffentlichung prüfen.',
  ].join('\n');
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

export function fussHtml(ci: CiRecht, jahr: number): string {
  const firma = esc(z(ci.firma) || 'Ihr Firmenname');
  return [
    '<footer class="ao-fuss">',
    '  <div class="ao-fuss-inner">',
    '    <span>© ' + jahr + ' ' + firma + '</span>',
    '    <nav class="ao-fuss-links">',
    '      <a href="#impressum">Impressum</a>',
    '      <a href="#datenschutz">Datenschutz</a>',
    '      <a href="#agb">AGB</a>',
    '    </nav>',
    '  </div>',
    '</footer>',
  ].join('\n');
}

// Praktische Kurzform für die Oberfläche: alle drei Texte auf einmal.
export function alleRechtstexte(ci: CiRecht): { impressum: string; datenschutz: string; agb: string } {
  return { impressum: impressumText(ci), datenschutz: datenschutzText(ci), agb: agbText(ci) };
}
