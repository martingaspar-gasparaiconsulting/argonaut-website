// ============================================================================
// ARGONAUT OS · lib/dsgvoAuskunft.ts — die Auskunft nach Art. 15 DSGVO
//
// Eine Auskunft muss zwei Dinge zugleich sein, die sich normalerweise
// widersprechen:
//   · VERSTAENDLICH (Art. 15) — ein Mensch muss lesen koennen, was gespeichert
//     ist. Eine JSON-Datei erfuellt das nicht.
//   · MASCHINENLESBAR (Art. 20) — die Person darf ihre Daten mitnehmen, in
//     einem "strukturierten, gaengigen, maschinenlesbaren Format".
//
// GELOEST OHNE ZIP-BIBLIOTHEK: Es entsteht EINE HTML-Datei. Sie zeigt alles
// lesbar an UND traegt die Rohdaten als eingebettetes JSON mit sich, das per
// Knopf herausgeloest werden kann. Eine Datei, die man per Mail schicken,
// ausdrucken und weiterverarbeiten kann — ohne dass der Betrieb eine neue
// Abhaengigkeit ins Projekt holt.
//
// WAS EBENSO WICHTIG IST WIE DIE DATEN: der Abschnitt "Was bleibt und warum".
// Wer Auskunft verlangt, verlangt meist als Naechstes Loeschung. Dass
// Rechnungen zehn Jahre bleiben MUESSEN, erfaehrt er besser hier als im Streit.
//
// Keine Imports, keine Hooks — node-testbar.
// ============================================================================

export type AuskunftBereich = {
  tabelle: string;
  label: string;
  zeilen: Array<Record<string, unknown>>;
  hinweis?: string;
};

export type AuskunftDaten = {
  person: string;
  betrieb: string;
  erstellt_am: string;
  bereiche: AuskunftBereich[];
  behalten: Array<{ label: string; begruendung: string }>;
};

// ---------------------------------------------------------------------------
// Aufbereitung
// ---------------------------------------------------------------------------

/** Spalten, die niemanden interessieren und die Auskunft nur zumuellen. */
const TECHNISCH = new Set([
  'owner_user_id', 'created_at', 'updated_at', 'aktualisiert_am',
  'token', 'abmelde_token', 'standort_id', 'firma_id', 'ki_batch_id',
  'suchtext', 'volltext',
]);

/** Feldnamen in etwas verwandeln, das man vorlesen kann. */
export function feldName(schluessel: string): string {
  const bekannt: Record<string, string> = {
    id: 'Kennung', kontakt_id: 'Kontakt', erstellt_am: 'Angelegt am',
    vorname: 'Vorname', nachname: 'Nachname', firma: 'Firma', email: 'E-Mail',
    telefon: 'Telefon', status: 'Status', notizen: 'Notizen', notiz: 'Notiz',
    betrag: 'Betrag', brutto_summe: 'Betrag (brutto)', netto_summe: 'Betrag (netto)',
    datum: 'Datum', titel: 'Titel', bezeichnung: 'Bezeichnung', text: 'Text',
    rechnungsnummer: 'Rechnungsnummer', faelligkeitsdatum: 'Fällig am',
    zahlungsstatus: 'Zahlungsstatus', quelle: 'Quelle', position: 'Position',
  };
  if (bekannt[schluessel]) return bekannt[schluessel];
  return schluessel
    .replace(/_/g, ' ')
    .replace(/\b([a-zäöü])/g, (m) => m.toUpperCase())
    .replace(/\bAm\b/g, 'am').replace(/\bUm\b/g, 'um');
}

/** Werte lesbar machen — Datumsangaben, Ja/Nein, Listen, Leeres. */
export function wertText(wert: unknown): string {
  if (wert === null || wert === undefined || wert === '') return '—';
  if (typeof wert === 'boolean') return wert ? 'ja' : 'nein';
  if (Array.isArray(wert)) return wert.length === 0 ? '—' : wert.map((w) => wertText(w)).join(', ');
  if (typeof wert === 'object') {
    try { return JSON.stringify(wert); } catch { return '—'; }
  }
  const s = String(wert);
  // ISO-Datum -> deutsches Datum
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (iso) {
    const tag = `${iso[3]}.${iso[2]}.${iso[1]}`;
    return iso[4] ? `${tag} um ${iso[4]}:${iso[5]} Uhr` : tag;
  }
  return s;
}

/** Technische Spalten raus, damit die Auskunft lesbar bleibt. */
export function saeubereZeile(zeile: Record<string, unknown>): Record<string, unknown> {
  const sauber: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(zeile)) {
    if (TECHNISCH.has(k)) continue;
    if (v === null || v === undefined || v === '') continue;
    sauber[k] = v;
  }
  return sauber;
}

export function zaehleZeilen(bereiche: AuskunftBereich[]): number {
  return bereiche.reduce((s, b) => s + b.zeilen.length, 0);
}

/** Nur Bereiche mit Inhalt — leere Überschriften helfen niemandem. */
export function nurGefuellte(bereiche: AuskunftBereich[]): AuskunftBereich[] {
  return bereiche.filter((b) => b.zeilen.length > 0);
}

// ---------------------------------------------------------------------------
// Das Dokument
// ---------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function tabelleHtml(b: AuskunftBereich): string {
  const zeilen = b.zeilen.map(saeubereZeile).filter((z) => Object.keys(z).length > 0);
  if (zeilen.length === 0) return '';

  const bloecke = zeilen.map((z, i) => {
    const felder = Object.entries(z)
      .map(([k, v]) => `<div class="feld"><span class="k">${escapeHtml(feldName(k))}</span><span class="v">${escapeHtml(wertText(v))}</span></div>`)
      .join('');
    return `<div class="satz"><div class="nr">${i + 1}</div>${felder}</div>`;
  }).join('');

  return `
  <section>
    <h2>${escapeHtml(b.label)} <span class="anzahl">${zeilen.length}</span></h2>
    ${b.hinweis ? `<p class="hinweis">${escapeHtml(b.hinweis)}</p>` : ''}
    ${bloecke}
  </section>`;
}

/**
 * Baut die vollstaendige Auskunft als eine einzelne HTML-Datei.
 * Die Rohdaten stecken als JSON mit drin und lassen sich per Knopf sichern.
 */
export function baueAuskunft(d: AuskunftDaten): string {
  const gefuellt = nurGefuellte(d.bereiche);
  const gesamt = zaehleZeilen(gefuellt);

  const behaltenHtml = d.behalten.length === 0 ? '' : `
  <section class="bleibt">
    <h2>Was aufbewahrt bleibt — und warum</h2>
    <p class="hinweis">
      Auf Wunsch werden personenbezogene Daten gelöscht. Für die folgenden Bereiche gilt das nicht:
      hier bestehen gesetzliche Aufbewahrungspflichten. Artikel 17 Absatz 3 Buchstabe b der
      Datenschutz-Grundverordnung nimmt diesen Fall ausdrücklich von der Löschpflicht aus.
    </p>
    ${d.behalten.map((b) => `<div class="satz"><div class="feld"><span class="k">${escapeHtml(b.label)}</span><span class="v">${escapeHtml(b.begruendung)}</span></div></div>`).join('')}
  </section>`;

  const rohdaten = JSON.stringify({
    person: d.person, betrieb: d.betrieb, erstellt_am: d.erstellt_am,
    bereiche: gefuellt.map((b) => ({ bereich: b.label, tabelle: b.tabelle, zeilen: b.zeilen })),
  }, null, 2);

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Datenauskunft — ${escapeHtml(d.person)}</title>
<style>
  :root { --navy:#0A1628; --gold:#C9A84C; --line:#e2e5ea; --dim:#5a6675; }
  * { box-sizing: border-box; }
  body { margin:0; background:#f6f7f9; color:#1a2332;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
         line-height:1.55; }
  .blatt { max-width: 900px; margin: 0 auto; background:#fff; min-height:100vh;
           box-shadow: 0 0 40px rgba(0,0,0,0.06); }
  header { background: var(--navy); color:#fff; padding: 32px 40px; }
  header .marke { color: var(--gold); font-size: 12px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; }
  header h1 { margin: 8px 0 4px; font-size: 26px; }
  header .zeile { color: rgba(255,255,255,0.65); font-size: 14px; }
  main { padding: 28px 40px 60px; }
  .kopfnotiz { background:#f0f4f8; border-left: 3px solid var(--gold); padding: 14px 16px;
               font-size: 14px; margin-bottom: 26px; }
  section { margin-bottom: 30px; }
  h2 { font-size: 17px; margin: 0 0 10px; padding-bottom: 7px; border-bottom: 2px solid var(--navy);
       display: flex; justify-content: space-between; align-items: baseline; }
  .anzahl { font-size: 13px; font-weight: 400; color: var(--dim); }
  .hinweis { font-size: 13px; color: var(--dim); margin: 0 0 12px; }
  .satz { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; position: relative; }
  .nr { position: absolute; right: 12px; top: 10px; font-size: 11px; color: var(--dim); }
  .feld { display: flex; gap: 12px; padding: 3px 0; font-size: 14px; }
  .k { flex: 0 0 190px; color: var(--dim); }
  .v { flex: 1; word-break: break-word; }
  .bleibt h2 { border-bottom-color: var(--gold); }
  .knopf { display:inline-block; background: var(--navy); color:#fff; border:none; border-radius:8px;
           padding: 11px 18px; font-size:14px; font-weight:600; cursor:pointer; font-family: inherit; }
  footer { padding: 20px 40px 40px; color: var(--dim); font-size: 12.5px; border-top: 1px solid var(--line); }
  @media print {
    body { background:#fff; } .blatt { box-shadow:none; max-width:none; }
    .knopf, .keindruck { display:none; } section { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="blatt">
  <header>
    <div class="marke">Datenauskunft nach Artikel 15 DSGVO</div>
    <h1>${escapeHtml(d.person)}</h1>
    <div class="zeile">${escapeHtml(d.betrieb)} · erstellt am ${escapeHtml(wertText(d.erstellt_am))}</div>
  </header>

  <main>
    <div class="kopfnotiz">
      Diese Übersicht enthält alle personenbezogenen Daten, die zu Ihnen gespeichert sind —
      <strong>${gesamt} ${gesamt === 1 ? 'Eintrag' : 'Einträge'}</strong> in
      ${gefuellt.length} ${gefuellt.length === 1 ? 'Bereich' : 'Bereichen'}.
      Rein technische Angaben (interne Kennungen, Änderungszeitpunkte) sind der Lesbarkeit halber
      weggelassen; sie stecken vollständig in den Rohdaten am Ende dieser Datei.
    </div>

    ${gefuellt.map(tabelleHtml).join('')}
    ${gesamt === 0 ? '<section><p class="hinweis">Zu Ihrer Person sind derzeit keine Daten gespeichert.</p></section>' : ''}
    ${behaltenHtml}

    <section class="keindruck">
      <h2>Ihre Daten mitnehmen</h2>
      <p class="hinweis">
        Artikel 20 DSGVO gibt Ihnen das Recht, Ihre Daten in einem maschinenlesbaren Format zu erhalten.
        Der folgende Knopf speichert sie als JSON-Datei — damit kann jedes andere System sie einlesen.
      </p>
      <button class="knopf" onclick="sichern()">Rohdaten als JSON speichern</button>
    </section>
  </main>

  <footer>
    Erstellt mit ARGONAUT OS. Diese Auskunft gibt den Stand zum Zeitpunkt der Erstellung wieder.
    Bei Fragen wenden Sie sich an ${escapeHtml(d.betrieb)}.
  </footer>
</div>

<script type="application/json" id="rohdaten">${rohdaten.replace(/</g, '\\u003c')}</script>
<script>
function sichern() {
  var roh = document.getElementById('rohdaten').textContent;
  var blob = new Blob([roh], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'datenauskunft.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>
</body>
</html>`;
}

/** Dateiname ohne Sonderzeichen, mit Datum. */
export function dateiName(person: string, datum: Date): string {
  const rein = String(person || 'auskunft')
    .replace(/ä/gi, 'ae').replace(/ö/gi, 'oe').replace(/ü/gi, 'ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40);
  const tag = `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`;
  return `datenauskunft-${rein || 'person'}-${tag}.html`;
}
