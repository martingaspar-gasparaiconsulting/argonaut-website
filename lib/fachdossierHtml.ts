// ============================================================================
// ARGONAUT OS · lib/fachdossierHtml.ts — Paket 214 (05.10.2026) · Stufe 3 B11a
// HTML des Fachdossiers im Design des Elektro-Richtwerts (A4, Titelseite
// Navy, Innenseiten hell, Gold-Akzente). Gotenberg macht daraus das PDF
// (lib/dossierPdf, printBackground). SERVER-ONLY wegen des QR-Codes.
//
// Wasserzeichen „ENTWURF – nicht zur Weitergabe" nur noch, solange FREIGABE_ERTEILT = false
// ist oder die Branche keinen geprüften Branchentext hat (Paket 217).
// ============================================================================

import QRCode from 'qrcode';
import type { Dossier } from './fachdossier';
import { DM_SANS_400, DM_SANS_700 } from './dossierSchrift';

/**
 * Paket 217 (06.10.2026): Martin gibt die Dossiers mit geprüften Branchentexten frei,
 * ohne auf den Anwalt zu warten (Entscheidung 06.10.2026). Dossiers OHNE geprüften
 * Branchentext tragen weiter das Wasserzeichen (d.entwurf).
 */
export const FREIGABE_ERTEILT = true;

export const KONTAKT = {
  name: 'Martin Gaspar, Gründer und Inhaber',
  firma: 'Gaspar AI Consulting · Inhaber Martin Gaspar · Tübinger Straße 50 · 71032 Böblingen · USt-IdNr. DE326706056',
  wege: '+49 178 9888683 · info@argonaut-os.com · argonaut-os.com',
};

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function mitWasserzeichen(d: Pick<Dossier, 'entwurf'> & { gesperrt?: string | null }): boolean {
  return d.entwurf || !!d.gesperrt || !FREIGABE_ERTEILT;
}

async function qrSvg(url: string): Promise<string> {
  try {
    return await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0A1628', light: '#FFFFFF' } });
  } catch {
    return '';
  }
}

/** Paket 217: DM Sans eingebettet (lib/dossierSchrift.ts) — kein Google Fonts, kein Netz nötig. */
export function schriften(): string {
  const f = (w: number, b64: string) => `@font-face{font-family:'DM Sans';font-style:normal;font-weight:${w};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
  return f(400, DM_SANS_400) + f(700, DM_SANS_700);
}

const CSS = `
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:#0A1628;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.seite{width:210mm;height:297mm;padding:18mm 17mm 24mm;position:relative;overflow:hidden;page-break-after:always;background:#fff;display:flex;flex-direction:column}
.seite.titel{padding-bottom:14mm}
.seite:last-child{page-break-after:auto}
.titel{background:#0A1628;color:#E8EDF4;display:flex;flex-direction:column}
.marke{font-weight:700;letter-spacing:.18em;font-size:11pt;color:#C9A84C}
.titel h1{font-size:34pt;line-height:1.08;margin:60mm 0 6mm;color:#fff}
.titel h1 span{color:#C9A84C}
.titel .lead{font-size:12.5pt;line-height:1.55;color:#C9D3E2;max-width:150mm}
.vorteile{display:grid;grid-template-columns:1fr 1fr;gap:4mm 10mm;margin-top:18mm;font-size:10pt}
.vorteile div:before{content:'◆';color:#C9A84C;margin-right:3mm}
.titel .fuss{margin-top:auto;display:flex;justify-content:space-between;font-size:8.5pt;color:#8FA3BE}
.eyebrow{font-size:8pt;letter-spacing:.2em;text-transform:uppercase;color:#9a7a26;font-weight:700}
h2{font-size:21pt;line-height:1.15;margin:3mm 0 3mm}
.sub{font-size:10.5pt;line-height:1.55;color:#4a5568;margin:0 0 8mm;max-width:165mm}
.karten{display:grid;grid-template-columns:1fr 1fr;gap:5mm;flex:1;align-content:space-evenly;margin-bottom:6mm}
.karte{border:1px solid #e3e6ec;border-top:3px solid #B23A3A;border-radius:3mm;padding:5mm 6mm;font-size:9.8pt;line-height:1.6}
.karte b{display:block;color:#B23A3A;margin-bottom:1.5mm;font-size:10pt}
.idee{margin-top:auto;background:#0A1628;color:#E8EDF4;border-radius:3mm;padding:5mm 6mm;font-size:9.5pt;line-height:1.55}
.idee b{color:#C9A84C;display:block;margin-bottom:1.5mm}
.schritte{display:grid;gap:6mm;flex:1;align-content:space-evenly}
.schritt{display:grid;grid-template-columns:9mm 1fr;gap:3mm;font-size:10.2pt;line-height:1.55}
.schritt i{font-style:normal;width:7mm;height:7mm;border:1px solid #C9A84C;border-radius:50%;display:grid;place-items:center;color:#9a7a26;font-weight:700;font-size:8.5pt}
.schritt b{display:block}
table{width:100%;border-collapse:collapse;font-size:8.8pt;line-height:1.45}
th{text-align:left;font-size:7.5pt;letter-spacing:.12em;text-transform:uppercase;color:#6b7688;border-bottom:1.5px solid #0A1628;padding:2mm 2mm}
td{border-bottom:1px solid #e3e6ec;padding:2.2mm 2mm;vertical-align:top}
td:first-child{font-weight:700;width:38mm}
h3{font-size:12.5pt;margin:10mm 0 3mm}
.gruppe{border:1px solid #e3e6ec;border-radius:3mm;padding:4mm 5mm;margin-bottom:4mm}
.gruppe.gold{border-color:#C9A84C;background:#fbf7ec}
.gruppe h4{margin:0 0 1mm;font-size:11pt}
.gruppe small{display:block;font-size:7pt;letter-spacing:.15em;text-transform:uppercase;color:#9a7a26;margin-bottom:3mm}
.spalten{columns:2;column-gap:8mm}
.block{break-inside:avoid;margin-bottom:2.2mm}
.block em{display:block;font-style:normal;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:#6b7688;margin-bottom:1.5mm}
.chip{display:inline-block;border:1px solid #d6dbe4;border-radius:2mm;padding:.8mm 2.2mm;margin:0 1.2mm 1.4mm 0;font-size:8pt;background:#fff}
.einstieg{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;font-size:9pt;line-height:1.5}
.einstieg div b{display:block;font-size:10pt;margin:1mm 0}
.einstieg div i{font-style:normal;color:#9a7a26;font-weight:700;font-size:14pt}
.kontakt{margin-top:auto;display:grid;grid-template-columns:1fr 38mm;gap:8mm;background:#0A1628;color:#E8EDF4;border-radius:3mm;padding:7mm}
.kontakt h3{color:#fff;margin:1mm 0 3mm;font-size:15pt}
.kontakt p{margin:0 0 2mm;font-size:9.5pt;line-height:1.5;color:#C9D3E2}
.qr{background:#fff;padding:3mm;border-radius:2mm}
.qr svg{width:100%;height:auto;display:block}
.fusszeile{position:absolute;left:17mm;right:17mm;bottom:8mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#8a94a6;border-top:1px solid #e3e6ec;padding-top:2mm}
.fusszeile b{color:#0A1628;letter-spacing:.12em}
/* Paket 217: Platz nutzen — Dreier-Kacheln und Fragen/Antworten */
.drei{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
.drei div{border:1px solid #e3e6ec;border-top:3px solid #C9A84C;border-radius:3mm;padding:4.5mm;font-size:9.5pt;line-height:1.55;background:#fff}
.drei div b{display:block;margin-bottom:1.5mm;font-size:10pt}
.drei div small{display:block;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:#9a7a26;font-weight:700;margin-bottom:1mm}
.faq{display:grid;grid-template-columns:1fr 1fr;column-gap:9mm;flex:1;align-content:space-evenly;margin-bottom:6mm}
.faq div{break-inside:avoid;margin-bottom:0;font-size:9.6pt;line-height:1.55}
.faq div b{display:block;font-size:10pt;margin-bottom:1mm}
.faq div b:before{content:'?';display:inline-grid;place-items:center;width:5mm;height:5mm;border-radius:50%;background:#0A1628;color:#C9A84C;font-size:7.5pt;margin-right:2mm;vertical-align:1px}
.luft{flex:1 1 0;min-height:4mm}
.band{margin-top:6mm;background:#0A1628;color:#E8EDF4;border-radius:3mm;padding:5mm 6mm;font-size:9.5pt;line-height:1.55}
.band b{color:#C9A84C;display:block;margin-bottom:1.5mm;font-size:10.5pt}
.fach{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin:2mm 0 5mm}
.fach div{border:1px solid #e3e6ec;border-top:3px solid #C9A84C;border-radius:3mm;padding:4mm 5mm;font-size:8.8pt;line-height:1.5}
.fach div b{display:block;margin-bottom:1.5mm;font-size:10pt}
.fach ul{margin:0;padding-left:4mm}.fach li{margin-bottom:1mm}
.luecke{border:2px dashed #E0A24C;border-radius:3mm;padding:6mm;color:#8a5a00;background:#fff8ea;font-size:10pt;line-height:1.55}
.wz{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5}
.wz span{transform:rotate(-32deg);font-size:32pt;font-weight:700;color:rgba(178,58,58,.13);letter-spacing:.08em;white-space:nowrap}
.titel .wz span{color:rgba(255,255,255,.08)}
`;

function wasserzeichen(an: boolean, text = 'ENTWURF – nicht zur Weitergabe'): string {
  return an ? `<div class="wz"><span>${esc(text)}</span></div>` : '';
}

function fusszeile(d: Dossier, nr: number): string {
  return `<div class="fusszeile"><b>ARGONAUT OS</b><span>Fachdossier ${esc(d.zielgruppe)} · ${nr}</span></div>`;
}

function luecke(was: string): string {
  return `<div class="luecke"><b>Entwurf:</b> ${esc(was)} folgt mit den geprüften Branchentexten (B11b). Diese Seite wird erst danach weitergegeben.</div>`;
}

// ---- Paket 217: feste Inhalte für alle Branchen. NUR, was gebaut ist. --------
// Paket 222: branchenneutral formuliert (nicht nur Handwerk: „Unterwegs", „Außendienst").
export const KUNDE_MERKT: { titel: string; text: string }[] = [
  { titel: 'Schnelle Antwort', text: 'Keine Anfrage geht unter. Eine Ampel zeigt Ihnen, was wartet.' },
  { titel: 'Klare Angebote', text: 'Der Kunde nimmt per Link an. Kein Ausdrucken, Unterschreiben und Zurückschicken.' },
  { titel: 'Saubere Rechnung', text: 'Mit allen Positionen aus dem Angebot, als E-Rechnung per Mail.' },
];
export const TEAM: { wer: string; titel: string; text: string }[] = [
  { wer: 'Unterwegs', titel: 'Alles auf dem Handy', text: 'Einsätze mit Adresse und Route, Stempeluhr, Fotos und die Unterschrift des Kunden.' },
  { wer: 'Im Büro', titel: 'Nichts mehr abtippen', text: 'Aus dem Angebot wird der Auftrag, daraus die Rechnung. Zahlungen werden zugeordnet.' },
  { wer: 'Für den Chef', titel: 'Der Überblick', text: 'Offene Rechnungen, Auslastung und Marge. Das wachende Auge sagt in einem Satz, was die Zahlen bedeuten.' },
];
export const RECHTE: { titel: string; text: string }[] = [
  { titel: 'Rechte je Bereich', text: 'Für jeden Mitarbeiter legen Sie fest, was er sehen und was er ändern darf.' },
  { titel: 'Abrechnen mit Freigabe', text: 'Rechnungen schreibt nur, wem Sie das ausdrücklich erlauben.' },
  { titel: 'Festgeschriebene Rechnungen', text: 'Eine festgeschriebene Rechnung bleibt unverändert, wie es die GoBD verlangen.' },
];
export const FRAGEN: { frage: string; antwort: string }[] = [
  { frage: 'Wie aufwendig ist der Umzug?', antwort: 'Kunden, Artikel und Termine lesen Sie als Excel- oder CSV-Datei ein. Für führende Programme gibt es Anleitungen, und die Startstrecke führt Sie bis zum ersten Angebot.' },
  { frage: 'Muss ich alles auf einmal umstellen?', antwort: 'Nein. Sie beginnen mit dem, was am meisten drückt, zum Beispiel Angebote und Rechnungen. Weitere Bereiche nehmen Sie dazu, wenn Sie so weit sind.' },
  { frage: 'Läuft das auf dem Handy meiner Mitarbeiter?', antwort: 'Ja. ARGONAUT OS läuft im Browser auf Handy, Tablet und Computer. Eine Installation ist nicht nötig.' },
  { frage: 'Brauchen meine Mitarbeiter eine Schulung?', antwort: 'Mitarbeiter im Außendienst brauchen meist nur ihre Einsätze, die Stempeluhr und die Kamera. Die Übungswelt füllt das System mit Beispieldaten zum Ausprobieren, und in der Academy legen Sie eigene Schulungen für Ihr Team an.' },
  { frage: 'Kann ich festlegen, wer was sieht?', antwort: 'Ja. Rechte vergeben Sie je Mitarbeiter und Bereich. Abrechnen darf nur, wem Sie es erlauben.' },
  { frage: 'Kann ich die Preislisten meiner Lieferanten nutzen?', antwort: 'Ja. Artikel und Preise lesen Sie als Datei ein, auch im DATANORM- und BMEcat-Format.' },
  { frage: 'Wie kommen die Zahlen zu meinem Steuerberater?', antwort: 'Als DATEV-Export. Die Werte für die Umsatzsteuer-Voranmeldung rechnet das System vor.' },
  { frage: 'Was ist mit der E-Rechnung?', antwort: 'Sie schreiben Rechnungen als XRechnung und ZUGFeRD. Eingehende E-Rechnungen liest das System ein.' },
  { frage: 'Was macht die KI?', antwort: 'KI-Bausteine schreiben Entwürfe, zum Beispiel für Angebotstexte und Mails. Sie lesen und geben frei.' },
  { frage: 'Was passiert mit meinen Daten, wenn ich gehe?', antwort: 'Sie laden alle Daten jederzeit als Excel- und JSON-Datei herunter und nehmen sie mit.' },
];

/** Das komplette Dossier als HTML-Dokument. */
export async function fachdossierHtml(d: Dossier): Promise<string> {
  // Paket 221: gesperrte Branchen tragen „IN RECHTLICHER VORBEREITUNG" statt „ENTWURF".
  const wz = wasserzeichen(mitWasserzeichen(d), d.gesperrt ? 'IN RECHTLICHER VORBEREITUNG' : undefined);
  const t = d.text;
  const seiten: string[] = [];
  let nr = 1;

  // 1 · Titel
  const [kopf, rest] = (() => {
    const s = t?.titel ?? `${d.name}. Ein System.`;
    const i = s.indexOf('. ');
    return i > 0 ? [s.slice(0, i + 1), s.slice(i + 2)] : [s, ''];
  })();
  const vorteile = t?.vorteile ?? d.paket.slice(0, 6).map((m) => m.name);
  seiten.push(`<section class="seite titel">${wz}
    <div class="marke">ARGONAUT OS</div>
    <h1>${esc(kopf)}${rest ? `<br><span>${esc(rest)}</span>` : ''}</h1>
    <div class="lead">${esc(t?.lead ?? 'Anfrage, Angebot, Auftrag, Rechnung und Zahlung laufen in einer Software zusammen.')}</div>
    <div class="vorteile">${vorteile.map((v) => `<div>${esc(v)}</div>`).join('')}</div>
    <div class="fuss"><span><b style="color:#E8EDF4">Fachdossier für ${esc(d.zielgruppe)}</b><br>Stand ${esc(d.stand)}</span><span style="text-align:right">Gaspar AI Consulting · Böblingen<br>argonaut-os.com</span></div>
  </section>`);

  // 2 · Alltag
  nr++;
  seiten.push(`<section class="seite">${wz}
    <div class="eyebrow">Der Alltag heute</div>
    <h2>${esc(t?.rolle ?? 'Sie führen einen Betrieb. Nicht ein Büro voller Programme.')}</h2>
    ${t ? `<p class="sub">Die Arbeit hinter dem Betrieb verteilt sich auf viele Stellen, die nicht miteinander reden.</p>
    <div class="karten">${t.alltag.map((a) => `<div class="karte"><b>${esc(a.titel)}</b>${esc(a.text)}</div>`).join('')}</div>` : luecke('Der Alltag Ihrer Branche')}
    <div class="idee"><b>Die Idee hinter ARGONAUT OS</b>Jede Information wird einmal erfasst und fließt dann weiter: aus der Anfrage wird das Angebot, daraus der Auftrag, der Einsatz, die Rechnung und die Zahlung. Sie arbeiten in einem System statt in zehn.</div>
    ${fusszeile(d, nr)}</section>`);

  // 3 · Ablauf eines Auftrags
  nr++;
  seiten.push(`<section class="seite">${wz}
    <div class="eyebrow">So läuft ein Auftrag</div>
    <h2>Einmal erfasst.<br>Bis zum Geldeingang durchgereicht.</h2>
    ${t ? `<p class="sub">Ein Beispiel aus dem Alltag: ${esc(t.ablaufTitel)}</p>
    <div class="schritte">${t.ablauf.map((s, i) => `<div class="schritt"><i>${i + 1}</i><div><b>${esc(s.titel)}</b>${esc(s.text)}</div></div>`).join('')}</div>` : luecke('Der Ablauf eines typischen Auftrags')}
    ${t ? `<h3>Was Ihr Kunde davon merkt</h3>
    <div class="drei">${KUNDE_MERKT.map((k) => `<div><b>${esc(k.titel)}</b>${esc(k.text)}</div>`).join('')}</div>` : ''}
    <div class="band"><b>Einmal eingeben. Überall richtig.</b>Kundendaten, Positionen und Preise tippen Sie einmal ein. Angebot, Auftrag, Einsatz und Rechnung greifen auf denselben Datensatz zu.</div>
    ${fusszeile(d, nr)}</section>`);

  // 4 · Schwerpunkt der Branche (nur mit geprüftem Text)
  if (t?.schwerpunkt) {
    nr++;
    seiten.push(`<section class="seite">${wz}
      <div class="eyebrow">Ihr Schwerpunkt</div>
      <h2>${esc(t.schwerpunkt.titel)}</h2>
      <p class="sub">${esc(t.schwerpunkt.text)}</p>
      <div class="schritte">${t.schwerpunkt.punkte.map((p, i) => `<div class="schritt"><i>${i + 1}</i><div><b>${esc(p.titel)}</b>${esc(p.text)}</div></div>`).join('')}</div>
      <h3>Was Ihr Team davon hat</h3>
      <div class="drei">${TEAM.map((k) => `<div><small>${esc(k.wer)}</small><b>${esc(k.titel)}</b>${esc(k.text)}</div>`).join('')}</div>
      <div class="band"><b>Ihr Wissen bleibt im Betrieb.</b>Kundengeschichte, Anlagen, Fotos und Protokolle hängen am Kunden. Wer neu im Team ist, findet alles an einer Stelle.</div>
      ${fusszeile(d, nr)}</section>`);
  }

  // 4b · Paket 286: Fachpaket im Detail (nur Pilot-Branchen mit fachseite) — nur Gebautes und Partner über das eigene Konto
  if (t?.fachseite) {
    const f = t.fachseite;
    nr++;
    seiten.push(`<section class="seite">${wz}
      <div class="eyebrow">Ihr Fachpaket</div>
      <h2>${esc(f.titel)}</h2>
      <p class="sub">${esc(f.text)}</p>
      <div class="fach">${f.gruppen.map((g) => `<div><b>${esc(g.titel)}</b><ul>${g.punkte.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}</div>
      ${f.partner.length ? `<h3 style="margin-top:0">Partner über Ihr eigenes Konto</h3>
      <div class="drei">${f.partner.map((p) => `<div><b>${esc(p.name)}</b>${esc(p.text)}</div>`).join('')}</div>` : ''}
      <div class="band"><b>${esc(f.band.titel)}</b>${esc(f.band.text)}</div>
      ${fusszeile(d, nr)}</section>`);
  }

  // 5 · Sicherheit (Paket 217: die Bau-Tabelle entfällt — im Dossier steht nur, was es gibt)
  nr++;
  seiten.push(`<section class="seite">${wz}
    <div class="eyebrow">Sicherheit und Offenheit</div>
    <h2>Ihre Daten bleiben Ihre Daten.</h2>
    <p class="sub">Kundendaten, Preise und Personalakten gehören zu den wertvollsten Dingen Ihres Betriebs. So gehen wir damit um.</p>
    <table><thead><tr><th>Was</th><th>Wie</th></tr></thead><tbody>
      <tr><td>Serverstandort</td><td>Datenbank und Dateien in einem Rechenzentrum in der EU (Stockholm), Programm-Server in Frankfurt. Für E-Mail-Versand und KI-Bausteine nutzen wir Anbieter mit Standardvertragsklauseln der EU.</td></tr>
      <tr><td>Trennung der Betriebe</td><td>Jeder Betrieb sieht nur seine eigenen Daten. Die Trennung ist in der Datenbank selbst verankert, nicht nur in der Oberfläche.</td></tr>
      <tr><td>Anmeldung</td><td>Zwei-Faktor-Anmeldung mit Authenticator-App und Notfall-Codes. Verliert ein Mitarbeiter sein Handy, setzen Sie den Zugang selbst zurück.</td></tr>
      <tr><td>KI mit Regeln</td><td>KI-Bausteine schreiben Entwürfe, Sie geben frei. Sie schätzen keine Preise und bekommen keine Krankheitsdaten Ihrer Mitarbeiter.</td></tr>
      <tr><td>Ihre Daten zum Mitnehmen</td><td>Alle Daten jederzeit als Excel- und JSON-Datei herunterladen. Kein Einsperren.</td></tr>
    </tbody></table>
    <div class="luft"></div>
    <h3 style="margin-top:0">Wer was sehen darf</h3>
    <div class="drei">${RECHTE.map((k) => `<div><b>${esc(k.titel)}</b>${esc(k.text)}</div>`).join('')}</div>
    <div class="luft"></div>
    <div class="band"><b>Entwickelt in Böblingen. Gespeichert in der EU.</b>ARGONAUT OS wird in Böblingen entwickelt. Ihre Daten liegen in Rechenzentren in der EU.</div>
    ${fusszeile(d, nr)}</section>`);

  // 6 · Ihre Fragen, unsere Antworten (Paket 217)
  nr++;
  seiten.push(`<section class="seite">${wz}
    <div class="eyebrow">Ihre Fragen</div>
    <h2>Ihre Fragen, unsere Antworten.</h2>
    <p class="sub">Was Betriebe uns vor dem Umstieg am häufigsten fragen.</p>
    <div class="faq">${FRAGEN.map((f) => `<div><b>${esc(f.frage)}</b>${esc(f.antwort)}</div>`).join('')}</div>
    <div class="band"><b>Ihre Frage war nicht dabei?</b>Rufen Sie an oder schreiben Sie uns: ${esc(KONTAKT.wege)}</div>
    ${fusszeile(d, nr)}</section>`);

  // 6 · Was Sie bekommen (Grundausstattung + Branchenpaket)
  nr++;
  const block = (titel: string, module: { name: string }[]) =>
    `<div class="block"><em>${esc(titel)}</em>${module.map((m) => `<span class="chip">${esc(m.name)}</span>`).join('')}</div>`;
  seiten.push(`<section class="seite">${wz}
    <div class="eyebrow">Was Sie bekommen</div>
    <h2>Ein System für Ihren ganzen Betrieb.</h2>
    <p class="sub">Grundausstattung für jeden Betrieb, dazu das Paket für Ihre Branche.</p>
    <div class="gruppe"><h4>Grundausstattung</h4><small>Für jeden Betrieb</small>
      <div class="spalten">${d.kern.map((g) => block(g.titel, g.module)).join('')}</div></div>
    ${d.paket.length ? `<div class="gruppe gold"><h4>Paket ${esc(d.kategorie)}</h4><small>Speziell für ${esc(d.zielgruppe)}</small>${block('Fachmodule', d.paket)}</div>` : ''}
    <div class="luft"></div>
    <div class="band"><b>Alles greift ineinander.</b>Grundausstattung und Branchenpaket arbeiten mit denselben Daten. Eine Anmeldung, eine Kundenliste, eine Rechnung von uns.</div>
    ${fusszeile(d, nr)}</section>`);

  // 7 · Einstieg + Kontakt
  nr++;
  const qr = await qrSvg(d.qrUrl);
  seiten.push(`<section class="seite">${wz}
    <div class="eyebrow">Der Einstieg</div>
    <h2>In vier Schritten umgezogen.</h2>
    <p class="sub">Sie müssen nicht von vorn anfangen. Ihre Kunden, Artikel und Termine ziehen mit, und eine geführte Startstrecke bringt Sie zum ersten Angebot aus dem neuen System.</p>
    <div class="luft"></div>
    <div class="einstieg">
      <div><i>1</i><b>Gespräch</b>Wir schauen uns Ihren Betrieb an: Größe, Abläufe, bisherige Programme.</div>
      <div><i>2</i><b>Datenumzug</b>Excel, CSV, Kontakte, Termine, Kontoauszüge — mit Anleitung für führende Programme.</div>
      <div><i>3</i><b>Startstrecke</b>Firmendaten, Leistungen, erste Vorgänge. Schritt für Schritt.</div>
      <div><i>4</i><b>Ausprobieren</b>Die Übungswelt füllt das System mit Beispieldaten. Ein Klick entfernt sie wieder.</div>
    </div>
    <div class="luft"></div>
    <div class="kontakt"><div>
      <div class="eyebrow" style="color:#C9A84C">Lernen Sie ARGONAUT OS kennen</div>
      <h3>Vereinbaren Sie ein unverbindliches Gespräch</h3>
      <p>Wir zeigen Ihnen das System an den Abläufen Ihres Betriebs. Zum QR-Code gehört die Seite für ${esc(d.zielgruppe)} mit Preisrechner und Terminbuchung.</p>
      <p style="color:#fff"><b>${esc(KONTAKT.name)}</b><br>${esc(KONTAKT.firma)}<br>${esc(KONTAKT.wege)}</p>
    </div><div class="qr">${qr}</div></div>
    <div class="fusszeile"><b>ARGONAUT OS</b><span>Stand ${esc(d.stand)} · Alle beschriebenen Funktionen sind gebaut.</span></div>
  </section>`);

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>ARGONAUT OS · Fachdossier ${esc(d.zielgruppe)}</title>
<style>${schriften()}${CSS}</style></head><body>${seiten.join('\n')}</body></html>`;
}
