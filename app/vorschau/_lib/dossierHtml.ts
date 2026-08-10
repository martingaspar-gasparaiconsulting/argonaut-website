// app/vorschau/_lib/dossierHtml.ts
// Dossier-/E-Book-Generator: baut je Branche ein PDF-taugliches HTML aus den
// AKTUELLEN Dossier-Daten (Schmerzen, Ergebnisse, Module + branchenspez. Extras,
// Warum-Punkte, FAQ) im freigegebenen E-Book-Design. Eine Schrift (DM Sans),
// keine KI-Agenten. „Was kann das System / Was müssen Sie tun" pro Bereich.
// Rein — kein Fetch. Wird über den Gotenberg-Renderer aboRechnungPdf(html) zu PDF.

import { websiteBranchen, websiteBrancheBySlug, type WebBranche } from './branchen-web';
import { baukastenFor, KERN, type Baustein } from './branchen-bausteine';
import { verkaufPack, fuelleText } from './branchen-verkauf';
import { seoBySlug } from './branchen-seo';
import { STUFEN, euro } from '@/lib/tarif';

const NAVY = '#0A1628';
const GOLD = '#C9A84C';
const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

function esc(s: string): string {
  return (s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}
function slugify(s: string): string {
  return (s || '').toLowerCase().trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Freien Text (Slug ODER Name) auf eine Branche abbilden. null = keine. */
export function brancheAufloesen(input: string): WebBranche | null {
  const s = (input || '').trim();
  if (!s) return null;
  const bySlug = websiteBrancheBySlug(slugify(s));
  if (bySlug) return bySlug;
  const alle = websiteBranchen();
  const lower = s.toLowerCase();
  return (
    alle.find((b) => b.name.toLowerCase() === lower) ||
    alle.find((b) => b.name.toLowerCase().includes(lower) || lower.includes(b.name.toLowerCase())) ||
    null
  );
}

/** Datei-/Cache-Schlüssel im Storage (Branche-Slug oder 'allgemein'). */
export function dossierKey(input: string): string {
  const b = brancheAufloesen(input);
  return b ? b.slug : 'allgemein';
}

// „Was kann das System / Was müssen Sie tun" — pro Bereich (Website-Kategorie).
// Entwürfe (Martin nickt ab). Fallback = DEFAULT.
type SysSie = { system: string[]; du: string[] };
export const DEFAULT_SYSSIE: SysSie = {
  system: [
    'Führt Kunden, Aufträge und Termine an einem Ort zusammen',
    'Erstellt Angebote, Rechnungen und E-Rechnung automatisch und mahnt bei Verzug',
    'Hält Kunden ohne Ihr Zutun über Termine und Status auf dem Laufenden',
    'Plant wiederkehrende Aufgaben und Termine selbstständig ein',
    'Wertet Ihre Zahlen in Echtzeit aus',
  ],
  du: [
    'Vorgang einmal anlegen — Sie geben nichts doppelt ein',
    'Mit einem Klick freigeben oder senden',
    'Als erledigt markieren, wenn es fertig ist',
  ],
};
export const SYSSIE: Record<string, SysSie> = {
  'Handwerk & Bau': {
    system: ['Rechnet Ihr Angebot direkt aus dem Aufmaß auf der Baustelle', 'Schreibt Material und Stunden je Auftrag automatisch mit', 'Erstellt Rechnung + E-Rechnung und mahnt bei Verzug von selbst', 'Hält den Kunden ohne Ihr Zutun über Termine auf dem Laufenden', 'Plant wiederkehrende Wartungs- und Serviceaufträge selbstständig ein'],
    du: ['Vor Ort messen und ein paar Fotos machen — per App', 'Einmal auf „Angebot senden" tippen', 'Den Auftrag als erledigt markieren, wenn er fertig ist'],
  },
  'Industrie & Produktion': {
    system: ['Führt Aufträge, Stücklisten und Termine zentral', 'Behält Material und Bestände automatisch im Blick', 'Erstellt Angebote, Auftragsbestätigungen und Rechnungen', 'Meldet Liefertermine und Verzüge frühzeitig', 'Wertet Auslastung und Kennzahlen in Echtzeit aus'],
    du: ['Auftrag und Menge einmal anlegen', 'Fortschritt kurz bestätigen', 'Freigeben und ausliefern — die Rechnung entsteht von selbst'],
  },
  'Handel & E-Commerce': {
    system: ['Führt Artikel, Preise und Bestände an einem Ort', 'Schreibt Bestellungen, Lieferscheine und Rechnungen automatisch', 'Meldet niedrige Bestände und schlägt Nachbestellungen vor', 'Hält Kunden über den Lieferstatus auf dem Laufenden', 'Wertet Umsatz sowie Renner und Ladenhüter automatisch aus'],
    du: ['Artikel und Preise einmal pflegen', 'Bestellung mit einem Klick freigeben', 'Ware annehmen — der Bestand bucht sich selbst'],
  },
  'Fahrzeuge & Mobilität': {
    system: ['Plant Werkstatt- und Servicetermine samt Auslastung', 'Erstellt Kostenvoranschläge und Rechnungen automatisch', 'Schreibt Teile und Arbeitszeiten je Auftrag mit', 'Erinnert Kunden an Termine, HU und Service', 'Behält den Ersatzteil-Bestand im Blick'],
    du: ['Fahrzeug und Auftrag aufnehmen', 'Kostenvoranschlag mit einem Klick senden', 'Auftrag abschließen — die Rechnung entsteht von selbst'],
  },
  'Gastronomie, Hotellerie & Tourismus': {
    system: ['Nimmt Reservierungen und Buchungen online entgegen', 'Füllt Kalender, Tische und Zimmer automatisch', 'Sendet Bestätigungen und Erinnerungen gegen No-Shows', 'Verbucht Kasse und Umsatz sauber', 'Pflegt Stammgäste und holt sie zurück'],
    du: ['Verfügbarkeiten einmal hinterlegen', 'Gäste empfangen', 'Am Ende des Tages: ein Klick Tagesabschluss'],
  },
  'Lebensmittel & Nahversorgung': {
    system: ['Führt Sortiment, Preise und Chargen zentral', 'Schreibt Bestellungen und Lieferscheine automatisch', 'Behält Haltbarkeiten und Bestände im Blick', 'Erstellt Rechnungen und Kassenbelege', 'Wertet Verkäufe und Renner automatisch aus'],
    du: ['Sortiment einmal anlegen', 'Wareneingang kurz bestätigen', 'Am Tresen kassieren — der Rest läuft mit'],
  },
  'Logistik & Transport': {
    system: ['Plant Touren, Fahrer und Fahrzeuge', 'Erstellt Aufträge, Lieferscheine und Rechnungen', 'Meldet Status und Zustellnachweise automatisch', 'Erinnert an Wartung, Fristen und Prüfungen', 'Wertet Auslastung und Kosten je Tour aus'],
    du: ['Auftrag und Ziel eingeben', 'Tour freigeben', 'Zustellung per App bestätigen'],
  },
  'IT & Technologie': {
    system: ['Führt Kunden, Projekte und Tickets an einem Ort', 'Erfasst Zeiten je Projekt automatisch für die Rechnung', 'Erstellt Angebote, Verträge und wiederkehrende Rechnungen', 'Erinnert an SLAs, Fristen und Verlängerungen', 'Wertet Auslastung und Deckungsbeitrag aus'],
    du: ['Ticket oder Projekt anlegen', 'Zeit mit einem Klick erfassen', 'Rechnung bestätigen — Verträge laufen automatisch'],
  },
  'Energie & Umwelt': {
    system: ['Verwaltet Projekte, Anlagen und Wartungsverträge', 'Plant Termine, Einsätze und Prüfungen', 'Erstellt Angebote, Nachweise und Rechnungen', 'Erinnert an wiederkehrende Wartung und Fristen', 'Wertet Erträge und Kennzahlen aus'],
    du: ['Projekt oder Anlage anlegen', 'Einsatz per App dokumentieren', 'Abrechnung freigeben'],
  },
  'Immobilien & Verwaltung': {
    system: ['Führt Objekte, Einheiten und Mieter zentral', 'Erstellt Abrechnungen, Verträge und Rechnungen', 'Verwaltet Dokumente und Fristen sicher', 'Meldet Zahlungseingänge und Rückstände', 'Hält Interessenten und Anfragen im Blick'],
    du: ['Objekt und Einheit anlegen', 'Anfrage kurz bearbeiten', 'Abrechnung freigeben'],
  },
  'Marketing, Medien & Kreativ': {
    system: ['Führt Kunden, Projekte und Angebote an einem Ort', 'Erfasst Aufwände je Projekt für die Rechnung', 'Erstellt Angebote, Verträge und Rechnungen', 'Erinnert an Deadlines und Freigaben', 'Wertet Projekte und Rentabilität aus'],
    du: ['Projekt und Angebot anlegen', 'Aufwand erfassen', 'Rechnung freigeben'],
  },
  'Recht, Steuern & Finanzen': {
    system: ['Sortiert eingehende Dokumente an die richtige Mandanten-/Fallakte', 'Überwacht Fristen und Wiedervorlagen und erinnert rechtzeitig', 'Führt erfasste Leistungen direkt in die Honorarrechnung', 'Informiert Mandanten automatisch über den Stand ihrer Sache', 'Fordert fehlende Unterlagen sicher und nachverfolgbar an'],
    du: ['Fachlich prüfen und mit einem Klick freigeben', 'Einmal „Rechnung erstellen" bestätigen', 'Den Mandanten sprechen — den Rest hat das System vorbereitet'],
  },
  'Bildung & Wissenschaft': {
    system: ['Verwaltet Kurse, Teilnehmer und Termine', 'Nimmt Anmeldungen online entgegen', 'Erstellt Rechnungen und Teilnahmebescheinigungen', 'Erinnert an Termine, Zahlungen und Verlängerungen', 'Wertet Auslastung und Erfolg aus'],
    du: ['Kurs und Termin anlegen', 'Teilnehmer aufnehmen', 'Abschluss bestätigen'],
  },
  'Gesundheit & Wellness': {
    system: ['Nimmt Termine online entgegen und füllt den Kalender', 'Sendet Erinnerungen gegen Ausfälle', 'Führt Kundenkartei und Verlauf sicher (DSGVO)', 'Erstellt Rechnungen und Belege', 'Pflegt Stammkunden und holt sie zurück'],
    du: ['Verfügbarkeiten hinterlegen', 'Kunden empfangen', 'Leistung kurz erfassen'],
  },
  'Sport, Beauty & Lifestyle': {
    system: ['Rechnet wiederkehrende Beiträge und Abos termingerecht ab', 'Macht Termine und Kurse online buchbar und füllt den Kalender', 'Sendet Erinnerungen und senkt so Ausfälle spürbar', 'Überwacht Verträge, Laufzeiten, Kündigungen und Verlängerungen', 'Erkennt abwanderungsgefährdete Kunden und meldet sich bei ihnen'],
    du: ['Angebote und Kurse einmal anlegen', 'Neue Kunden über ein kurzes Formular aufnehmen', 'Am Tresen mit einem Klick kassieren — Beiträge laufen allein'],
  },
  'Tiere': {
    system: ['Nimmt Termine und Buchungen online entgegen', 'Führt Tier- und Kundenkartei mit Verlauf', 'Sendet Erinnerungen an Termine und Pflege', 'Erstellt Rechnungen und Belege', 'Pflegt Stammkunden automatisch'],
    du: ['Verfügbarkeiten hinterlegen', 'Kunde und Tier aufnehmen', 'Leistung kurz erfassen'],
  },
  'Landwirtschaft, Garten & Forst': {
    system: ['Plant Aufträge, Flächen und Einsätze', 'Erfasst Material, Stunden und Maschinen je Auftrag', 'Erstellt Angebote, Nachweise und Rechnungen', 'Erinnert an Saison- und Wartungstermine', 'Wertet Erträge und Kosten aus'],
    du: ['Auftrag oder Fläche anlegen', 'Einsatz per App dokumentieren', 'Abrechnung freigeben'],
  },
  'Dienstleistungen': {
    system: ['Führt Kunden, Aufträge und Termine an einem Ort', 'Plant Einsätze und Personal', 'Erstellt Angebote und Rechnungen automatisch', 'Erinnert an wiederkehrende Aufträge und Termine', 'Wertet Auslastung und Umsatz aus'],
    du: ['Auftrag und Termin anlegen', 'Einsatz per App bestätigen', 'Rechnung freigeben'],
  },
  'Kultur, Soziales & Öffentliches': {
    system: ['Verwaltet Mitglieder, Kontakte und Termine zentral', 'Nimmt Anmeldungen und Beiträge entgegen', 'Erstellt Rechnungen, Bescheinigungen und Nachweise', 'Erinnert an Termine, Beiträge und Fristen', 'Wertet Aktivität und Zahlen aus'],
    du: ['Mitglied oder Termin anlegen', 'Anmeldung bearbeiten', 'Abrechnung freigeben'],
  },
};

function tileHtml(m: Baustein, extra = false): string {
  return `<div class="tile${extra ? ' tile-x' : ''}"><div class="tt"><span class="ti">${m.icon}</span><span class="tn">${esc(m.name)}</span>${m.tag ? `<span class="tg">${esc(m.tag)}</span>` : ''}</div><div class="ts">${esc(m.sub)}</div></div>`;
}

export function dossierHtml(input: string): string {
  const b = brancheAufloesen(input);
  const titel = b ? b.name : 'Ihr Betrieb';
  const kat = b ? b.kategorie : '';
  const slug = b ? b.slug : '';
  const bau = b ? baukastenFor(kat) : { stack: KERN, spezial: [] as Baustein[], rollen: { voll: '', std: '', self: '' } };
  const stack = bau.stack.filter((m) => !/KI[- ]?Crew|Agent/i.test(m.name));
  const spezial = bau.spezial;
  const schmerzen = b?.schmerzen ?? [];
  const ergebnisse = b?.ergebnisse ?? [];
  const vk = kat ? verkaufPack(kat) : null;
  const beweis = vk ? (vk.beweis || []).map((x: { titel: string; text: string; icon: string }) => ({ icon: x.icon, titel: fuelleText(x.titel, titel, kat), text: fuelleText(x.text, titel, kat) })) : [];
  const heroSub = vk ? fuelleText(vk.heroSub, titel, kat) : 'Alles, was Ihr Betrieb täglich braucht — in einem System, ein Login.';
  const seo = slug ? seoBySlug(slug) : undefined;
  const intro = seo?.intro || `ARGONAUT OS führt Kunden, Angebote, Rechnungen, Termine und Personal für ${titel} in einem System statt zwölf zusammen — DSGVO-konform auf EU-Servern.`;
  const faq = seo?.faq || [];
  const ss = SYSSIE[kat] || DEFAULT_SYSSIE;
  const solo = STUFEN[0];

  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
  @page{margin:0}
  *{box-sizing:border-box;font-family:'DM Sans',Arial,Helvetica,sans-serif}
  body{margin:0;background:${NAVY};color:#EAF1F6;font-weight:300;line-height:1.55;font-size:13px}
  .wrap{max-width:820px;margin:0 auto;padding:0 34px}
  .sec{padding:30px 0;border-top:1px solid rgba(122,163,179,.12)}
  .kick{color:${GOLD};letter-spacing:.18em;text-transform:uppercase;font-size:10px;font-weight:700;margin-bottom:9px}
  h1{font-weight:700;font-size:30px;line-height:1.08;margin:6px 0 10px}
  h2{font-weight:700;font-size:19px;line-height:1.2;margin:0 0 10px}
  h3{font-weight:700;font-size:14px;margin:0 0 8px}
  .g{color:${GOLD}}
  p{color:#c4d3db;margin:0 0 6px}
  .lead{font-size:14px;color:#b9cdd6}
  .cover{padding:56px 0 30px;text-align:center;background:radial-gradient(700px 360px at 50% -12%,rgba(201,168,76,.16),transparent 60%)}
  .cover .sub{color:#b9cdd6;max-width:60ch;margin:8px auto 0}
  .badge{display:inline-block;margin-top:16px;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.3);color:${GOLD};border-radius:999px;padding:6px 15px;font-size:11px;font-weight:600}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:10px}
  .card{border-radius:11px;padding:12px 14px}
  .pain{background:rgba(122,163,179,.05);border:1px solid rgba(122,163,179,.14);color:#c4d3db}
  .win{background:rgba(201,168,76,.06);border:1px solid rgba(201,168,76,.22);color:#EAF1F6}
  .x{color:#8fa9b6;margin-right:6px}.v{color:${GOLD};font-weight:700;margin-right:6px}
  .sub2{display:flex;align-items:center;gap:9px;margin:20px 0 10px}.sub2 .t{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${GOLD}}.sub2 .l{flex:1;height:1px;background:rgba(201,168,76,.2)}
  .tiles{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-top:4px}
  .tile{background:rgba(122,163,179,.05);border:1px solid rgba(122,163,179,.14);border-radius:11px;padding:11px 12px}
  .tile-x{background:rgba(201,168,76,.06);border-color:rgba(201,168,76,.26)}
  .tt{display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap}.ti{font-size:15px}.tn{font-weight:700;font-size:12px;color:#EAF1F6}
  .tg{font-size:9px;font-weight:700;color:${GOLD};background:rgba(201,168,76,.12);border-radius:999px;padding:1px 6px}
  .ts{font-size:11px;color:#9fb3bd;line-height:1.4}
  .summary{margin-top:16px;background:linear-gradient(160deg,rgba(201,168,76,.08),rgba(122,163,179,.05));border:1px solid rgba(201,168,76,.28);border-radius:12px;padding:14px 18px;color:#EAF1F6}
  .split{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:8px}
  .col{border-radius:13px;padding:16px}
  .col-sys{background:linear-gradient(160deg,rgba(76,175,125,.08),rgba(10,22,40,.6));border:1px solid rgba(76,175,125,.28)}
  .col-du{background:linear-gradient(160deg,rgba(201,168,76,.09),rgba(10,22,40,.6));border:1px solid rgba(201,168,76,.28)}
  .col-sys h3{color:#4CAF7D}.col-du h3{color:${GOLD}}
  .col ul{margin:0;padding:0;list-style:none}
  .col li{position:relative;padding:6px 0 6px 20px;color:#d4e0e7;font-size:12px;border-top:1px solid rgba(122,163,179,.1)}
  .col li:first-child{border-top:none}
  .col li::before{position:absolute;left:0;top:6px;content:'›';font-weight:700}
  .col-sys li::before{color:#4CAF7D}.col-du li::before{color:${GOLD}}
  .why{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-top:6px}
  .whyc{background:rgba(201,168,76,.06);border:1px solid rgba(201,168,76,.24);border-radius:12px;padding:13px}
  .whyi{font-size:18px}.whyt{font-weight:700;margin:6px 0 4px;color:#EAF1F6;font-size:13px}.whyx{font-size:11px;color:#b9cdd6;line-height:1.45}
  .faq{background:rgba(122,163,179,.05);border:1px solid rgba(122,163,179,.14);border-radius:10px;padding:12px 15px;margin-top:8px}
  .faq b{display:block;color:#EAF1F6;margin-bottom:3px;font-weight:700}.faq span{color:#b9cdd6;font-size:12px}
  .wege{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:6px}
  .weg{border-radius:13px;padding:18px;background:linear-gradient(160deg,rgba(18,32,54,.9),rgba(10,22,40,.9));border:1px solid rgba(201,168,76,.22)}
  .weg .wt{font-weight:700;font-size:14px;margin-bottom:5px}.weg p{font-size:12px;margin:0 0 12px}
  .cta{display:inline-block;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:9px;font-size:12px}
  .cta-gold{background:${GOLD};color:${NAVY}}.cta-line{background:transparent;color:${GOLD};border:1px solid rgba(201,168,76,.55)}
  .assure{margin-top:14px;color:#8fa9b6;font-size:11px;text-align:center}
  .foot{padding:20px 0 34px;text-align:center;color:#7f97a4;font-size:11px}
</style></head>
<body>
<div class="cover"><div class="wrap">
  <div style="font-size:26px">🔱</div>
  <div class="kick" style="margin-top:8px">ARGONAUT OS · Branchen-Dossier</div>
  <h1>${esc(titel)}<br><span class="g">in einem System.</span></h1>
  <p class="sub">${esc(heroSub)}</p>
  <div class="badge">Kostenlos · für ${esc(titel)} gemacht · DSGVO-konform aus der EU</div>
</div></div>

<div class="wrap">

<div class="sec">
  <div class="kick">ARGONAUT für ${esc(titel)}</div>
  <h2>Ein System <span class="g">statt zwölf</span>.</h2>
  <p class="lead">${esc(intro)}</p>
</div>

${schmerzen.length ? `<div class="sec">
  <div class="kick">Kennen Sie das?</div>
  <h2>Der Alltag, den keiner <span class="g">gewählt</span> hat.</h2>
  <div class="row">${schmerzen.map((s) => `<div class="card pain"><span class="x">✕</span>${esc(s)}</div>`).join('')}</div>
</div>` : ''}

${ergebnisse.length ? `<div class="sec">
  <div class="kick">Mit ARGONAUT</div>
  <h2>So läuft das ab morgen — <span class="g">von selbst</span>.</h2>
  <div class="row">${ergebnisse.map((e) => `<div class="card win"><span class="v">✓</span>${esc(e)}</div>`).join('')}</div>
</div>` : ''}

<div class="sec">
  <div class="kick">Das ist Ihr System</div>
  <h2>Alles verzahnt — <span class="g">ein Login</span>.</h2>
  <p>Diese Programme bekommt <strong style="color:#EAF1F6">jeder Betrieb</strong> ab Tag 1 — statt zwölf Einzel-Tools, die nicht miteinander reden.</p>
  <div class="tiles">${stack.map((m) => tileHtml(m)).join('')}</div>
  ${spezial.length ? `<div class="sub2"><span class="t">Speziell für ${esc(titel)}</span><span class="l"></span></div>
  <div class="tiles">${spezial.map((m) => tileHtml(m, true)).join('')}</div>` : ''}
  <p class="summary">Kurz gesagt: Ihr komplettes <strong class="g">CRM, ERP, Warenwirtschaft und DMS</strong> — in einem System, ein Login. Statt fünf Programme, die nicht miteinander reden.</p>
</div>

<div class="sec">
  <div class="kick">Was kann das System · Was müssen Sie tun</div>
  <h2>Die ehrliche <span class="g">Arbeitsteilung</span>.</h2>
  <div class="split">
    <div class="col col-sys"><h3>ARGONAUT übernimmt</h3><ul>${ss.system.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
    <div class="col col-du"><h3>Sie tun nur noch</h3><ul>${ss.du.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
  </div>
</div>

${beweis.length ? `<div class="sec">
  <div class="kick">Warum ARGONAUT</div>
  <h2>Was den <span class="g">Unterschied</span> macht.</h2>
  <div class="why">${beweis.map((x) => `<div class="whyc"><div class="whyi">${x.icon}</div><div class="whyt">${esc(x.titel)}</div><div class="whyx">${esc(x.text)}</div></div>`).join('')}</div>
</div>` : ''}

${faq.length ? `<div class="sec">
  <div class="kick">Häufige Fragen</div>
  <h2>Kurz beantwortet.</h2>
  ${faq.map((f: { q: string; a: string }) => `<div class="faq"><b>${esc(f.q)}</b><span>${esc(f.a)}</span></div>`).join('')}
</div>` : ''}

<div class="sec">
  <div class="kick">Zwei Wege — Sie entscheiden</div>
  <h2>ARGONAUT <span class="g">kennenlernen</span>.</h2>
  <div class="wege">
    <div class="weg"><div class="wt">📅 Termin vereinbaren</div><p>Fragen, oder es am eigenen Betrieb sehen? Wir zeigen es Ihnen persönlich — kostenlos und unverbindlich.</p><a class="cta cta-gold" href="${BASIS_URL}/branchen/${esc(slug)}#demo">Erstgespräch buchen →</a></div>
    <div class="weg"><div class="wt">🧪 7 Tage kostenlos testen</div><p>Lieber gleich ausprobieren? Voller Zugang, kein Zahlungsmittel — der Test endet nach 7 Tagen von selbst.</p><a class="cta cta-line" href="${BASIS_URL}/testen">Kostenlos starten →</a></div>
  </div>
  <p class="assure">Ein System statt zwölf · DSGVO-konform auf EU-Servern · Einrichtung in wenigen Tagen · ab ${euro(solo.grundgebuehr)}/Monat (SOLO, all-in)</p>
</div>

</div>
<div class="foot">🔱 ARGONAUT OS — das KI-Betriebssystem für den deutschen Mittelstand · ${BASIS_URL.replace('https://', '')}${slug ? '/branchen/' + esc(slug) : ''}</div>
</body></html>`;
}
