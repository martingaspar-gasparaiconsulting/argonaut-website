// ============================================================================
// ARGONAUT OS · lib/fachdossierHtml.ts — Paket 214 (05.10.2026) · Stufe 3 B11a
// HTML des Fachdossiers im Design des Elektro-Richtwerts (A4, Titelseite
// Navy, Innenseiten hell, Gold-Akzente). Gotenberg macht daraus das PDF
// (lib/dossierPdf, printBackground). SERVER-ONLY wegen des QR-Codes.
//
// Solange FREIGABE_ERTEILT = false (vor der Abnahme durch den Anwalt), trägt
// JEDES Dossier das Wasserzeichen „ENTWURF – nicht zur Weitergabe".
// ============================================================================

import QRCode from 'qrcode';
import type { Dossier } from './fachdossier';

/** Erst nach der Abnahme durch den Anwalt auf true setzen (B11b). */
export const FREIGABE_ERTEILT = false;

export const KONTAKT = {
  name: 'Martin Gaspar, Gründer',
  firma: 'Gaspar AI Consulting · Tübinger Straße 50 · 71032 Böblingen',
  wege: '+49 178 9888683 · info@argonaut-os.com · argonaut-os.com',
};

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function mitWasserzeichen(d: Pick<Dossier, 'entwurf'>): boolean {
  return d.entwurf || !FREIGABE_ERTEILT;
}

async function qrSvg(url: string): Promise<string> {
  try {
    return await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0A1628', light: '#FFFFFF' } });
  } catch {
    return '';
  }
}

const CSS = `
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:#0A1628;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.seite{width:210mm;height:297mm;padding:18mm 17mm 14mm;position:relative;overflow:hidden;page-break-after:always;background:#fff}
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
.sub{font-size:10.5pt;line-height:1.55;color:#4a5568;margin:0 0 7mm;max-width:165mm}
.karten{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.karte{border:1px solid #e3e6ec;border-top:3px solid #B23A3A;border-radius:3mm;padding:4mm 5mm;font-size:9.5pt;line-height:1.5}
.karte b{display:block;color:#B23A3A;margin-bottom:1.5mm;font-size:10pt}
.idee{margin-top:7mm;background:#0A1628;color:#E8EDF4;border-radius:3mm;padding:5mm 6mm;font-size:9.5pt;line-height:1.55}
.idee b{color:#C9A84C;display:block;margin-bottom:1.5mm}
.schritte{display:grid;gap:4mm}
.schritt{display:grid;grid-template-columns:9mm 1fr;gap:3mm;font-size:9.8pt;line-height:1.5}
.schritt i{font-style:normal;width:7mm;height:7mm;border:1px solid #C9A84C;border-radius:50%;display:grid;place-items:center;color:#9a7a26;font-weight:700;font-size:8.5pt}
.schritt b{display:block}
table{width:100%;border-collapse:collapse;font-size:8.8pt;line-height:1.45}
th{text-align:left;font-size:7.5pt;letter-spacing:.12em;text-transform:uppercase;color:#6b7688;border-bottom:1.5px solid #0A1628;padding:2mm 2mm}
td{border-bottom:1px solid #e3e6ec;padding:2.2mm 2mm;vertical-align:top}
td:first-child{font-weight:700;width:38mm}
h3{font-size:12.5pt;margin:8mm 0 2mm}
.gruppe{border:1px solid #e3e6ec;border-radius:3mm;padding:4mm 5mm;margin-bottom:4mm}
.gruppe.gold{border-color:#C9A84C;background:#fbf7ec}
.gruppe h4{margin:0 0 1mm;font-size:11pt}
.gruppe small{display:block;font-size:7pt;letter-spacing:.15em;text-transform:uppercase;color:#9a7a26;margin-bottom:3mm}
.spalten{columns:2;column-gap:8mm}
.block{break-inside:avoid;margin-bottom:3mm}
.block em{display:block;font-style:normal;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:#6b7688;margin-bottom:1.5mm}
.chip{display:inline-block;border:1px solid #d6dbe4;border-radius:2mm;padding:.8mm 2.2mm;margin:0 1.2mm 1.4mm 0;font-size:8pt;background:#fff}
.einstieg{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;font-size:9pt;line-height:1.5}
.einstieg div b{display:block;font-size:10pt;margin:1mm 0}
.einstieg div i{font-style:normal;color:#9a7a26;font-weight:700;font-size:14pt}
.kontakt{margin-top:12mm;display:grid;grid-template-columns:1fr 38mm;gap:8mm;background:#0A1628;color:#E8EDF4;border-radius:3mm;padding:7mm}
.kontakt h3{color:#fff;margin:1mm 0 3mm;font-size:15pt}
.kontakt p{margin:0 0 2mm;font-size:9.5pt;line-height:1.5;color:#C9D3E2}
.qr{background:#fff;padding:3mm;border-radius:2mm}
.qr svg{width:100%;height:auto;display:block}
.fusszeile{position:absolute;left:17mm;right:17mm;bottom:8mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#8a94a6;border-top:1px solid #e3e6ec;padding-top:2mm}
.fusszeile b{color:#0A1628;letter-spacing:.12em}
.luecke{border:2px dashed #E0A24C;border-radius:3mm;padding:6mm;color:#8a5a00;background:#fff8ea;font-size:10pt;line-height:1.55}
.wz{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5}
.wz span{transform:rotate(-32deg);font-size:32pt;font-weight:700;color:rgba(178,58,58,.13);letter-spacing:.08em;white-space:nowrap}
.titel .wz span{color:rgba(255,255,255,.08)}
`;

function wasserzeichen(an: boolean): string {
  return an ? '<div class="wz"><span>ENTWURF – nicht zur Weitergabe</span></div>' : '';
}

function fusszeile(d: Dossier, nr: number): string {
  return `<div class="fusszeile"><b>ARGONAUT OS</b><span>Fachdossier ${esc(d.zielgruppe)} · ${nr}</span></div>`;
}

function luecke(was: string): string {
  return `<div class="luecke"><b>Entwurf:</b> ${esc(was)} folgt mit den geprüften Branchentexten (B11b). Diese Seite wird erst danach weitergegeben.</div>`;
}

/** Das komplette Dossier als HTML-Dokument. */
export async function fachdossierHtml(d: Dossier): Promise<string> {
  const wz = wasserzeichen(mitWasserzeichen(d));
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
    ${fusszeile(d, nr)}</section>`);

  // 4 · Schwerpunkt der Branche (nur mit geprüftem Text)
  if (t?.schwerpunkt) {
    nr++;
    seiten.push(`<section class="seite">${wz}
      <div class="eyebrow">Ihr Schwerpunkt</div>
      <h2>${esc(t.schwerpunkt.titel)}</h2>
      <p class="sub">${esc(t.schwerpunkt.text)}</p>
      <div class="schritte">${t.schwerpunkt.punkte.map((p, i) => `<div class="schritt"><i>${i + 1}</i><div><b>${esc(p.titel)}</b>${esc(p.text)}</div></div>`).join('')}</div>
      ${fusszeile(d, nr)}</section>`);
  }

  // 5 · Sicherheit + In Vorbereitung
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
    <h3>Was wir gerade noch bauen – und warum</h3>
    <p class="sub" style="margin-bottom:3mm">Wir versprechen nur, was heute läuft. Diese Punkte sind in Arbeit und kommen per Update in Ihr System:</p>
    <table><thead><tr><th>Was</th><th>Heute</th><th>Warum noch nicht</th></tr></thead><tbody>
      ${d.vorbereitung.map((v) => `<tr><td>${esc(v.was)}</td><td style="width:42mm">${esc(v.heute)}</td><td>${esc(v.warum)}</td></tr>`).join('')}
    </tbody></table>
    ${fusszeile(d, nr)}</section>`);

  // 6 · Alles inklusive
  nr++;
  const block = (titel: string, module: { name: string }[]) =>
    `<div class="block"><em>${esc(titel)}</em>${module.map((m) => `<span class="chip">${esc(m.name)}</span>`).join('')}</div>`;
  seiten.push(`<section class="seite">${wz}
    <div class="eyebrow">Alles in einem System</div>
    <h2>Alles drin. Alles inklusive.</h2>
    <p class="sub">Grundausstattung für jeden Betrieb, dazu das Paket für Ihre Branche. <b>Kein Modul kostet extra.</b> Webseite, Werbung und Bewertungen kosten bei Agenturen ${esc(d.agenturKosten)} im Monat — in ARGONAUT OS sind sie Bausteine desselben Systems.</p>
    <div class="gruppe"><h4>Grundausstattung</h4><small>Für jeden Betrieb</small>
      <div class="spalten">${d.kern.map((g) => block(g.titel, g.module)).join('')}</div></div>
    ${d.paket.length ? `<div class="gruppe gold"><h4>Paket ${esc(d.kategorie)}</h4><small>Speziell für ${esc(d.zielgruppe)}</small>${block('Fachmodule', d.paket)}</div>` : ''}
    ${fusszeile(d, nr)}</section>`);

  // 7 · Einstieg + Kontakt
  nr++;
  const qr = await qrSvg(d.qrUrl);
  seiten.push(`<section class="seite">${wz}
    <div class="eyebrow">Der Einstieg</div>
    <h2>In vier Schritten umgezogen.</h2>
    <p class="sub">Sie müssen nicht von vorn anfangen. Ihre Kunden, Artikel und Termine ziehen mit, und eine geführte Startstrecke bringt Sie zum ersten Angebot aus dem neuen System.</p>
    <div class="einstieg">
      <div><i>1</i><b>Gespräch</b>Wir schauen uns Ihren Betrieb an: Größe, Abläufe, bisherige Programme.</div>
      <div><i>2</i><b>Datenumzug</b>Excel, CSV, Kontakte, Termine, Kontoauszüge — mit Anleitung für führende Programme.</div>
      <div><i>3</i><b>Startstrecke</b>Firmendaten, Leistungen, erste Vorgänge. Schritt für Schritt.</div>
      <div><i>4</i><b>Ausprobieren</b>Die Übungswelt füllt das System mit Beispieldaten. Ein Klick entfernt sie wieder.</div>
    </div>
    <div class="kontakt"><div>
      <div class="eyebrow" style="color:#C9A84C">Lernen Sie ARGONAUT OS kennen</div>
      <h3>Vereinbaren Sie ein unverbindliches Gespräch</h3>
      <p>Wir zeigen Ihnen das System an den Abläufen Ihres Betriebs. Zum QR-Code gehört die Seite für ${esc(d.zielgruppe)} mit Preisrechner und Terminbuchung.</p>
      <p style="color:#fff"><b>${esc(KONTAKT.name)}</b><br>${esc(KONTAKT.firma)}<br>${esc(KONTAKT.wege)}</p>
    </div><div class="qr">${qr}</div></div>
    <div class="fusszeile"><b>ARGONAUT OS</b><span>Stand ${esc(d.stand)} · Alle beschriebenen Funktionen sind gebaut, sofern nicht als „in Vorbereitung" gekennzeichnet.</span></div>
  </section>`);

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>ARGONAUT OS · Fachdossier ${esc(d.zielgruppe)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>${seiten.join('\n')}</body></html>`;
}
