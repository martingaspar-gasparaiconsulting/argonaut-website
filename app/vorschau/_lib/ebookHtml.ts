// ============================================================================
// ARGONAUT OS · app/vorschau/_lib/ebookHtml.ts
//
// Baut aus den freigegebenen Kapiteln der Inhalts-Werkstatt das Branchen-
// HANDBUCH — ein PDF-taugliches HTML im selben dunklen Design wie das Dossier.
//
// DER UNTERSCHIED ZUM DOSSIER
// Das Dossier ist der Prospekt: acht Seiten, alles steht im Code. Das Handbuch
// ist das Buch dahinter: fünfzig Kapitel, die Texte kommen aus der Datenbank
// und sind einzeln freigegeben. Deshalb ist diese Datei REIN — sie bekommt die
// Bausteine übergeben und lädt nichts selbst. Wer sie aufruft, hat vorher
// entschieden, welche Kapitel er sieht.
//
// WAS NICHT IM BUCH LANDET
// Alles ohne Haken und alles ohne Text. Diese Entscheidung trifft nicht diese
// Datei, sondern ebookInhalt() in lib/inhaltBaustein.ts — dieselbe Regel, die
// auch der Control-Room anzeigt. Zwei getrennte Regeln wären eine zu viel.
//
// Die Branchen-Auflösung kommt bewusst aus dossierHtml.ts statt aus einer
// eigenen Kopie: sonst fänden Dossier und Handbuch bei derselben Eingabe
// womöglich verschiedene Branchen.
// ============================================================================

import { brancheAufloesen } from './dossierHtml';
import {
  ebookBauplan, ebookInhalt, ABSCHNITT_UEBERSCHRIFT,
  type AbschnittArt, type BausteinZeile,
} from '@/lib/inhaltBaustein';
import { markdownZuHtml, esc, seiten } from '@/lib/markdownEinfach';

const NAVY = '#0A1628';
const GOLD = '#C9A84C';
const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

/** Reihenfolge und Beschriftung der Buch-Teile. */
const TEIL_FOLGE: AbschnittArt[] = ['vorwort', 'kategorie', 'kern', 'branche', 'extra'];

const TEIL_KICKER: Record<AbschnittArt, string> = {
  vorwort: 'Zum Anfang',
  kategorie: 'Ihre Branche',
  kern: 'Teil I',
  branche: 'Teil II',
  extra: 'Teil III',
};

/**
 * Ist überhaupt genug da für ein Buch? Dieselbe Frage beantwortet
 * ebookStand().bereit — hier nur als schnelle Vorabprüfung für die Route.
 */
export function ebookMoeglich(brancheInput: string, bausteine: BausteinZeile[]): boolean {
  const b = brancheAufloesen(brancheInput);
  if (!b) return false;
  const bauplan = ebookBauplan(b.kategorie, b.slug);
  const inhalt = ebookInhalt(bauplan, bausteine);
  return inhalt.some((e) => e.abschnitt.art === 'vorwort') && inhalt.some((e) => e.abschnitt.art === 'kern');
}

export function ebookHtml(brancheInput: string, bausteine: BausteinZeile[]): string {
  const b = brancheAufloesen(brancheInput);
  const titel = b ? b.name : 'Ihr Betrieb';
  const kategorie = b ? b.kategorie : '';
  const slug = b ? b.slug : '';

  const bauplan = ebookBauplan(kategorie, slug);
  const inhalt = ebookInhalt(bauplan, bausteine);

  // Nach Buch-Teilen gruppieren, in fester Lese-Reihenfolge.
  const teile = TEIL_FOLGE
    .map((art) => ({ art, stuecke: inhalt.filter((e) => e.abschnitt.art === art) }))
    .filter((t) => t.stuecke.length > 0);

  const gesamtSeiten = inhalt.reduce((s, e) => s + seiten(e.baustein.text ?? ''), 0) + 2;

  // ---- Inhaltsverzeichnis --------------------------------------------------
  const verzeichnis = teile
    .filter((t) => t.art !== 'vorwort')
    .map((t) => {
      const zeilen = t.stuecke
        .map((e) => {
          const name = e.baustein.titel || e.abschnitt.ueberschrift;
          return `<li><span class="vzi">${e.abschnitt.icon || '·'}</span><span class="vzt">${esc(name)}</span></li>`;
        })
        .join('');
      return `<div class="vzblock">
        <div class="vzkopf">${esc(ABSCHNITT_UEBERSCHRIFT[t.art])}<span class="vzn">${t.stuecke.length}</span></div>
        <ul class="vzliste">${zeilen}</ul>
      </div>`;
    })
    .join('');

  // ---- Die Kapitel ---------------------------------------------------------
  const kapitelHtml = teile
    .map((t) => {
      const kopf =
        t.art === 'vorwort'
          ? ''
          : `<div class="teil">
               <div class="kick">${esc(TEIL_KICKER[t.art])}</div>
               <h2>${esc(ABSCHNITT_UEBERSCHRIFT[t.art])}</h2>
             </div>`;

      const stuecke = t.stuecke
        .map((e) => {
          const name = e.baustein.titel || e.abschnitt.ueberschrift;
          const koerper = markdownZuHtml(e.baustein.text ?? '', 'kt');
          const icon = e.abschnitt.icon ? `<span class="ki">${e.abschnitt.icon}</span>` : '';
          return `<div class="kap">
            <div class="kapkopf">${icon}<h3 class="kaptitel">${esc(name)}</h3></div>
            <div class="kaptext">${koerper}</div>
          </div>`;
        })
        .join('');

      return kopf + stuecke;
    })
    .join('');

  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
  @page{margin:0}
  *{box-sizing:border-box;font-family:'DM Sans',Arial,Helvetica,sans-serif}
  body{margin:0;background:${NAVY};color:#EAF1F6;font-weight:300;line-height:1.6;font-size:13px}
  .wrap{max-width:820px;margin:0 auto;padding:0 40px}
  .kick{color:${GOLD};letter-spacing:.18em;text-transform:uppercase;font-size:10px;font-weight:700;margin-bottom:9px}
  .g{color:${GOLD}}
  h1{font-weight:700;font-size:32px;line-height:1.08;margin:6px 0 10px}
  h2{font-weight:700;font-size:22px;line-height:1.2;margin:0}
  p{color:#c4d3db;margin:0 0 9px}

  /* --- Deckblatt --- */
  .cover{padding:120px 0 90px;text-align:center;background:radial-gradient(700px 380px at 50% -8%,rgba(201,168,76,.16),transparent 62%);page-break-after:always}
  .cover .sub{color:#b9cdd6;max-width:56ch;margin:10px auto 0;font-size:15px}
  .badge{display:inline-block;margin-top:22px;background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.3);color:${GOLD};border-radius:999px;padding:7px 17px;font-size:11px;font-weight:600}

  /* --- Inhaltsverzeichnis --- */
  .vz{padding:44px 0 20px;page-break-after:always}
  .vzblock{margin-top:18px;page-break-inside:avoid;break-inside:avoid}
  .vzkopf{display:flex;align-items:center;gap:9px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${GOLD};border-bottom:1px solid rgba(201,168,76,.22);padding-bottom:6px}
  .vzn{margin-left:auto;color:#7f97a4;font-weight:400;letter-spacing:0;text-transform:none}
  .vzliste{margin:8px 0 0;padding:0;list-style:none;column-count:2;column-gap:26px}
  .vzliste li{display:flex;gap:7px;align-items:baseline;padding:3px 0;font-size:12px;color:#c4d3db;break-inside:avoid}
  .vzi{width:15px;flex-shrink:0}
  .vzt{flex:1}

  /* --- Teil-Trenner --- */
  .teil{padding:38px 0 14px;border-top:1px solid rgba(201,168,76,.22);margin-top:26px;page-break-before:always;page-break-after:avoid;break-after:avoid}

  /* --- Kapitel --- */
  .kap{padding:22px 0;border-top:1px solid rgba(122,163,179,.12)}
  .kapkopf{display:flex;align-items:baseline;gap:9px;margin-bottom:9px;page-break-after:avoid;break-after:avoid}
  .ki{font-size:16px;flex-shrink:0}
  .kaptitel{font-weight:700;font-size:16px;margin:0;color:#EAF1F6}
  .kaptext .kh{font-weight:700;font-size:13px;margin:14px 0 6px;color:${GOLD};page-break-after:avoid;break-after:avoid}
  .kaptext .kt{color:#c4d3db;margin:0 0 9px}
  .kaptext .kliste{margin:6px 0 11px;padding:0;list-style:none}
  .kaptext .kliste li{position:relative;padding:4px 0 4px 18px;color:#d4e0e7;font-size:12.5px}
  .kaptext .kliste li::before{position:absolute;left:0;top:4px;content:'›';color:${GOLD};font-weight:700}
  .kaptext strong{color:#EAF1F6;font-weight:700}

  /* --- Schluss --- */
  .ende{padding:40px 0;border-top:1px solid rgba(201,168,76,.22);margin-top:30px;page-break-before:always}
  .wege{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:10px}
  .weg{border-radius:13px;padding:18px;background:linear-gradient(160deg,rgba(18,32,54,.9),rgba(10,22,40,.9));border:1px solid rgba(201,168,76,.22);page-break-inside:avoid}
  .weg .wt{font-weight:700;font-size:14px;margin-bottom:5px}.weg p{font-size:12px;margin:0 0 12px}
  .cta{display:inline-block;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:9px;font-size:12px}
  .cta-gold{background:${GOLD};color:${NAVY}}.cta-line{background:transparent;color:${GOLD};border:1px solid rgba(201,168,76,.55)}
  .assure{margin-top:16px;color:#8fa9b6;font-size:11px;text-align:center}
  .foot{padding:22px 0 36px;text-align:center;color:#7f97a4;font-size:11px}

  /* --- Druck --- */
  h1,h2,h3{page-break-after:avoid;break-after:avoid}
  p{orphans:3;widows:3}
  .kliste li{page-break-inside:avoid}
</style></head>
<body>

<div class="cover"><div class="wrap">
  <div style="font-size:30px">🔱</div>
  <div class="kick" style="margin-top:10px">ARGONAUT OS · Das Handbuch</div>
  <h1>${esc(titel)}<br><span class="g">in einem System.</span></h1>
  <p class="sub">Was ARGONAUT OS für Ihren Betrieb übernimmt — Baustein für Baustein erklärt, ohne Fachchinesisch.</p>
  <div class="badge">${inhalt.length} Kapitel · rund ${gesamtSeiten} Seiten · DSGVO-konform aus der EU</div>
</div></div>

<div class="wrap">

<div class="vz">
  <div class="kick">Inhalt</div>
  <h2>Was Sie auf den nächsten Seiten <span class="g">finden</span>.</h2>
  ${verzeichnis}
</div>

${kapitelHtml}

<div class="ende">
  <div class="kick">Zwei Wege — Sie entscheiden</div>
  <h2>ARGONAUT <span class="g">kennenlernen</span>.</h2>
  <div class="wege">
    <div class="weg"><div class="wt">📅 Termin vereinbaren</div><p>Fragen, oder es am eigenen Betrieb sehen? Wir zeigen es Ihnen persönlich — kostenlos und unverbindlich.</p><a class="cta cta-gold" href="${BASIS_URL}/branchen/${esc(slug)}#demo">Erstgespräch buchen →</a></div>
    <div class="weg"><div class="wt">🧪 7 Tage kostenlos testen</div><p>Lieber gleich ausprobieren? Voller Zugang, kein Zahlungsmittel — der Test endet nach 7 Tagen von selbst.</p><a class="cta cta-line" href="${BASIS_URL}/testen">Kostenlos starten →</a></div>
  </div>
  <p class="assure">Ein System statt zwölf · DSGVO-konform auf EU-Servern · Einrichtung in wenigen Tagen</p>
</div>

</div>
<div class="foot">🔱 ARGONAUT OS — das KI-Betriebssystem für den deutschen Mittelstand · ${BASIS_URL.replace('https://', '')}${slug ? '/branchen/' + esc(slug) : ''}</div>
</body></html>`;
}
