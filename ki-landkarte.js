/* ============================================================================
 * ARGONAUT OS · ki-landkarte.js  (Q7a · Bestandsaufnahme, 15.07.2026)
 * ----------------------------------------------------------------------------
 * NUR LESEN. Aendert nichts.
 *
 * BEANTWORTET DIE FRAGE: "Was kostet mich ein Seitenwechsel?"
 *
 * Sucht jeden Aufruf einer KI-Route in app/ und prueft, WANN er feuert:
 *   🔴 AUTO   = steht in einem useEffect -> feuert beim SEITENAUFRUF.
 *               Kostet Geld, ohne dass der Kunde etwas will. Das ist Q7.
 *   ✅ KLICK  = haengt an onClick/onSubmit -> feuert nur auf Wunsch. So soll es sein.
 *   ⚪ ?      = konnte nicht sicher zugeordnet werden -> von Hand nachschauen.
 *
 * ERKENNUNG: Fuer jeden Treffer wird geprueft, ob seine Position innerhalb
 * eines useEffect-Blocks liegt (Klammern werden mitgezaehlt, Strings/Kommentare
 * grob uebersprungen). Heuristik — kein Compiler. Bei ⚪ bitte selbst reinschauen.
 *
 * AUFRUF (im Repo-Wurzelverzeichnis):  node ki-landkarte.js
 * ========================================================================== */

const fs = require('fs');
const path = require('path');

const WURZEL = process.cwd();
const APP = path.join(WURZEL, 'app');

if (!fs.existsSync(APP)) {
  console.error('ABBRUCH: app/ nicht gefunden. Bitte im Repo-Wurzelverzeichnis ausfuehren.');
  process.exit(1);
}

// Die 26 KI-Routen (alles, was api.anthropic.com ruft) + der Direktaufruf.
const KI_ROUTEN = [
  'auftrag-ki-positionen', 'chat', 'cockpit-chat', 'crm-briefing', 'crm-followup',
  'crm-nba', 'crm-visitenkarte', 'crm-voice', 'dashboard-chat', 'erp-bestellvorschlag',
  'hr/ki-auswertung', 'ki-auge', 'ki-klartext', 'korrespondenz-ki', 'leads/angebot',
  'lieferanten-import', 'mahnung-ki', 'marketing-content', 'marketing-stratege',
  'mitarbeiter-chat', 'preis-import', 'projekt-ki-setup', 'projekt-statusbericht',
  'team-chat-ki', 'ticket-antwort', 'vertrag-kuendigung',
];

function dateienSammeln(ordner, treffer = []) {
  for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
    const p = path.join(ordner, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '_backups' || e.name === 'api') continue;
      dateienSammeln(p, treffer);
    } else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
      treffer.push(p);
    }
  }
  return treffer;
}

/** Alle useEffect-Bloecke als [start, ende] finden (per Klammer-Zaehlung). */
function useEffectBloecke(text) {
  const bloecke = [];
  const re = /useEffect\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let i = m.index + m[0].length - 1; // auf die oeffnende Klammer
    let tiefe = 0;
    const start = m.index;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '(') tiefe++;
      else if (c === ')') {
        tiefe--;
        if (tiefe === 0) { bloecke.push([start, i]); break; }
      }
    }
  }
  return bloecke;
}

const dateien = dateienSammeln(APP);
const funde = [];

for (const datei of dateien) {
  const text = fs.readFileSync(datei, 'utf8');
  const rel = path.relative(WURZEL, datei).replace(/\\/g, '/');
  const bloecke = useEffectBloecke(text);

  for (const route of KI_ROUTEN) {
    const muster = new RegExp(`['"\`]/api/${route.replace(/\//g, '\\/')}['"\`/?]`, 'g');
    let m;
    while ((m = muster.exec(text)) !== null) {
      const pos = m.index;
      const inEffect = bloecke.some(([a, b]) => pos > a && pos < b);
      // Kontext davor anschauen (500 Zeichen) — Klick-Hinweise?
      const davor = text.slice(Math.max(0, pos - 900), pos);
      const klick = /on(Click|Submit|Change)\s*=|async function (lade|hole|starte|erzeuge|frage)/i.test(davor)
                    && !inEffect;
      const zeile = text.slice(0, pos).split('\n').length;
      funde.push({
        route: '/api/' + route,
        datei: rel,
        zeile,
        wann: inEffect ? 'AUTO' : (klick ? 'KLICK' : '?'),
      });
    }
  }

  // Direkter Anthropic-Aufruf aus dem Browser?
  if (/['"]https:\/\/api\.anthropic\.com/.test(text) && /^['"]use client['"]/m.test(text)) {
    funde.push({
      route: '!! DIREKT an api.anthropic.com',
      datei: rel,
      zeile: text.slice(0, text.indexOf('https://api.anthropic.com')).split('\n').length,
      wann: 'BROWSER',
    });
  }
}

// --- Bericht ---------------------------------------------------------------
const auto = funde.filter((f) => f.wann === 'AUTO');
const klick = funde.filter((f) => f.wann === 'KLICK');
const unklar = funde.filter((f) => f.wann === '?');
const browser = funde.filter((f) => f.wann === 'BROWSER');

function block(titel, liste) {
  if (!liste.length) return;
  console.log('');
  console.log('════ ' + titel + ' (' + liste.length + ') ' + '═'.repeat(Math.max(0, 50 - titel.length)));
  for (const f of liste.sort((a, b) => a.route.localeCompare(b.route))) {
    console.log('  ' + f.route.padEnd(30) + ' ' + f.datei + ':' + f.zeile);
  }
}

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  ARGONAUT · KI-LANDKARTE — wo wird Geld verbrannt?           ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

block('🔴 AUTO — feuert beim SEITENAUFRUF, kostet ungefragt', auto);
block('⚪ UNKLAR — bitte von Hand nachschauen', unklar);
block('✅ KLICK — feuert nur auf Wunsch (so soll es sein)', klick);
block('‼️ AUS DEM BROWSER DIREKT AN ANTHROPIC', browser);

console.log('');
console.log('════ BILANZ ══════════════════════════════════════════════════');
console.log('  🔴 Auto-Laden:   ' + auto.length + '   <- Ziel: 0');
console.log('  ⚪ Unklar:       ' + unklar.length);
console.log('  ✅ Auf Klick:    ' + klick.length);
console.log('  ‼️ Browser:      ' + browser.length + '   <- Ziel: 0');
console.log('  ── Aufruf-Stellen gesamt: ' + funde.length);
console.log('');
