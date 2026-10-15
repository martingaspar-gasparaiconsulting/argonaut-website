// ============================================================================
// ARGONAUT OS · lib/bauAbnahme.ts — HW-14 Abnahme vollständig (15.10.2026)
//
// ▄▄▄ DIE LÜCKEN (Claude-Befund aus dem Handwerk-Durchgang) ▄▄▄
//  1. Das Abnahmeprotokoll (bau-lv, Reiter „Abnahme") wurde ohne lv_id und
//     ohne projekt_id gespeichert. Die Spalten gab es, sie blieben leer —
//     die Gewährleistung wusste nie, zu welchem LV/Projekt die Abnahme gehört.
//  2. „Aus Abnahmeprotokoll übernehmen" bot auch VERWEIGERTE Abnahmen an.
//     Ohne Abnahme beginnt keine Gewährleistungsfrist (§ 634a Abs. 2 BGB).
//  3. Eine verweigerte Abnahme oder eine unter Vorbehalt liess sich ohne einen
//     einzigen Mangel speichern — das Protokoll sagte nicht, warum.
//  4. Es gab kein Protokoll zum Drucken/Unterschreiben, und Mängel liessen
//     sich nie als behoben abhaken.
//
// ▄▄▄ DIE LÖSUNG ▄▄▄
//  · lvZuAbnahme(): LV wählen -> lv_id, projekt_id, Titel, Ort vorbelegt.
//  · pruefeAbnahme(): Datum Pflicht (nicht in der Zukunft), bekannte Art,
//    Vorbehalt/Verweigerung nur mit mindestens einem Mangel, Mangel-Frist
//    nicht vor dem Abnahmetag.
//  · startetGewaehrleistung() / gewaehrleistungsKandidaten(): verweigert nie.
//  · mangelUmschalten(), maengelStand(): Mängel abhaken (nur der Chef, RLS).
//  · abnahmeProtokollHtml(): druckfertiges Protokoll, alles maskiert.
//    Wortlaut der Hinweise: ANWALT (R64).
//
// Reine Funktionen. Node-getestet: tests/bauAbnahmeHW14.test.mjs
// ============================================================================

export type AbnahmeArt = 'voll' | 'unter_vorbehalt' | 'verweigert';

export const ABNAHME_ARTEN: readonly { wert: AbnahmeArt; label: string; erklaerung: string }[] = [
  { wert: 'voll', label: 'Abnahme ohne Vorbehalt', erklaerung: 'Die Leistung wird abgenommen. Ab heute läuft die Gewährleistung.' },
  { wert: 'unter_vorbehalt', label: 'Abnahme unter Vorbehalt', erklaerung: 'Abgenommen — die aufgeführten Mängel sind vorbehalten. Die Gewährleistung läuft ab heute.' },
  { wert: 'verweigert', label: 'Abnahme verweigert', erklaerung: 'Nicht abgenommen. Die Gewährleistung beginnt NICHT. Bitte die Mängel als Grund aufführen.' },
];

export type Mangel = { beschreibung: string; frist: string; behoben: boolean; behoben_am?: string | null };

export type AbnahmeEingabe = {
  datum: string;
  art: string;
  maengel: readonly Mangel[];
};

export type LvKurz = { id: string; titel: string; kunde_name?: string | null; projekt_id?: string | null };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function gueltigesDatum(s: string): boolean {
  if (!ISO.test(s)) return false;
  const [j, m, t] = s.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

export function artLabel(art: string): string {
  return ABNAHME_ARTEN.find((a) => a.wert === art)?.label ?? art;
}

/** Beginnt mit dieser Abnahme die Gewährleistung? Verweigert (oder unbekannt) nie. */
export function startetGewaehrleistung(art: string | null | undefined): boolean {
  return art === 'voll' || art === 'unter_vorbehalt';
}

/** LV gewählt -> Felder der Abnahme vorbelegen (Projekt kommt aus dem LV). */
export function lvZuAbnahme(lv: LvKurz | null | undefined): { lv_id: string; projekt_id: string; titel: string; ort: string } {
  if (!lv) return { lv_id: '', projekt_id: '', titel: 'Abnahme', ort: '' };
  const titel = String(lv.titel ?? '').trim();
  return {
    lv_id: lv.id,
    projekt_id: String(lv.projekt_id ?? ''),
    titel: titel ? `Abnahme ${titel}`.slice(0, 200) : 'Abnahme',
    ort: titel.slice(0, 200),
  };
}

export type AbnahmePruefung = { ok: true } | { ok: false; fehler: string };

/** Vor dem Speichern prüfen. heute = JJJJ-MM-TT (Europe/Berlin). */
export function pruefeAbnahme(e: AbnahmeEingabe, heute: string): AbnahmePruefung {
  const datum = String(e.datum ?? '').trim();
  if (!gueltigesDatum(datum)) return { ok: false, fehler: 'Bitte das Datum der Abnahme eintragen.' };
  if (gueltigesDatum(heute) && datum > heute) return { ok: false, fehler: 'Das Abnahmedatum liegt in der Zukunft — protokolliert wird erst am Tag der Abnahme.' };
  if (!ABNAHME_ARTEN.some((a) => a.wert === e.art)) return { ok: false, fehler: 'Bitte die Art der Abnahme wählen.' };
  const maengel = e.maengel ?? [];
  if (maengel.some((m) => !String(m.beschreibung ?? '').trim())) return { ok: false, fehler: 'Ein Mangel hat keine Beschreibung.' };
  if (e.art === 'verweigert' && maengel.length === 0) return { ok: false, fehler: 'Eine verweigerte Abnahme braucht mindestens einen Mangel als Grund.' };
  if (e.art === 'unter_vorbehalt' && maengel.length === 0) return { ok: false, fehler: 'Unter Vorbehalt heißt: Mängel werden vorbehalten — bitte mindestens einen Mangel aufführen.' };
  for (const m of maengel) {
    const f = String(m.frist ?? '').trim();
    if (!f) continue;
    if (!gueltigesDatum(f)) return { ok: false, fehler: `Die Frist bei „${m.beschreibung}" ist kein gültiges Datum.` };
    if (f < datum) return { ok: false, fehler: `Die Frist bei „${m.beschreibung}" liegt vor dem Abnahmetag.` };
  }
  return { ok: true };
}

/** Abnahmen, aus denen eine Gewährleistung entstehen kann: nicht verweigert, noch nicht übernommen. */
export function gewaehrleistungsKandidaten<T extends { id: string; art?: string | null }>(
  abnahmen: readonly T[],
  gewaehrleistungen: readonly { abnahme_id?: string | null }[],
): T[] {
  const vergeben = new Set(gewaehrleistungen.map((g) => g.abnahme_id).filter(Boolean));
  return abnahmen.filter((a) => startetGewaehrleistung(a.art) && !vergeben.has(a.id));
}

/** Mangel i als behoben markieren bzw. wieder öffnen — gibt eine neue Liste zurück. */
export function mangelUmschalten(maengel: readonly Mangel[], i: number, heute: string): Mangel[] {
  return maengel.map((m, k) => {
    if (k !== i) return { ...m };
    const behoben = !m.behoben;
    return { ...m, behoben, behoben_am: behoben ? heute : null };
  });
}

/** Wie viele Mängel offen, wie viele behoben, wie viele über der Frist? */
export function maengelStand(maengel: readonly Mangel[] | null | undefined, heute: string): { gesamt: number; offen: number; behoben: number; ueberfaellig: number } {
  const l = maengel ?? [];
  const offen = l.filter((m) => !m.behoben);
  return {
    gesamt: l.length,
    offen: offen.length,
    behoben: l.length - offen.length,
    ueberfaellig: offen.filter((m) => m.frist && gueltigesDatum(m.frist) && m.frist < heute).length,
  };
}

// --- Druck --------------------------------------------------------------------

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function datumDe(iso: unknown): string {
  const s = String(iso ?? '');
  return gueltigesDatum(s) ? s.split('-').reverse().join('.') : '—';
}

export type ProtokollDaten = {
  titel: string; datum: string; ort?: string | null; teilnehmer?: string | null; art: string;
  maengel: readonly Mangel[]; unterschrift_name?: string | null; notiz?: string | null;
};
export type ProtokollKopf = { firma: string; lvTitel?: string | null; kunde?: string | null; projekt?: string | null };

export function abnahmeProtokollHtml(a: ProtokollDaten, k: ProtokollKopf): string {
  const maengel = a.maengel ?? [];
  const startet = startetGewaehrleistung(a.art);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Abnahmeprotokoll ${esc(a.titel)}</title>
<style>body{font:12px/1.5 Helvetica,Arial,sans-serif;color:#111;margin:28px}h1{font-size:19px;margin:0 0 4px}h2{font-size:14px;margin:16px 0 4px}table{width:100%;border-collapse:collapse;margin:8px 0 12px}th,td{border:1px solid #bbb;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f1f1f1;width:22%}.k{color:#555}.art{font-weight:bold;font-size:14px}.sig{display:flex;gap:40px;margin-top:48px}.sig div{flex:1;border-top:1px solid #111;padding-top:4px}</style></head><body>
<div class="k">${esc(k.firma)}</div>
<h1>Abnahmeprotokoll</h1>
<table>
<tr><th>Bauvorhaben</th><td>${esc(a.titel)}</td></tr>
${k.lvTitel ? `<tr><th>Leistungsverzeichnis</th><td>${esc(k.lvTitel)}</td></tr>` : ''}
${k.projekt ? `<tr><th>Projekt</th><td>${esc(k.projekt)}</td></tr>` : ''}
${k.kunde ? `<tr><th>Auftraggeber</th><td>${esc(k.kunde)}</td></tr>` : ''}
<tr><th>Datum</th><td>${datumDe(a.datum)}</td></tr>
<tr><th>Ort</th><td>${esc(a.ort || '—')}</td></tr>
<tr><th>Teilnehmer</th><td>${esc(a.teilnehmer || '—')}</td></tr>
</table>
<p class="art">Ergebnis: ${esc(artLabel(a.art))}</p>
<p>${startet ? `Die Gewährleistungsfrist beginnt mit dem ${datumDe(a.datum)}.` : 'Die Leistung wurde nicht abgenommen; die Gewährleistungsfrist beginnt nicht.'}</p>
<h2>${a.art === 'verweigert' ? 'Mängel (Grund der Verweigerung)' : a.art === 'unter_vorbehalt' ? 'Vorbehaltene Mängel' : 'Festgestellte Mängel'}</h2>
<table><tr><th style="width:6%">Nr.</th><th style="width:auto">Beschreibung</th><th style="width:16%">Frist zur Beseitigung</th><th style="width:16%">Erledigt</th></tr>
${maengel.length ? maengel.map((m, i) => `<tr><td>${i + 1}</td><td>${esc(m.beschreibung)}</td><td>${m.frist ? datumDe(m.frist) : '—'}</td><td>${m.behoben ? `behoben${m.behoben_am ? ` am ${datumDe(m.behoben_am)}` : ''}` : ''}</td></tr>`).join('') : '<tr><td colspan="4">Keine Mängel festgestellt.</td></tr>'}
</table>
${a.notiz ? `<h2>Bemerkungen</h2><p>${esc(a.notiz)}</p>` : ''}
<div class="sig"><div>Auftraggeber${a.unterschrift_name ? `: ${esc(a.unterschrift_name)}` : ''}</div><div>Auftragnehmer: ${esc(k.firma)}</div></div>
</body></html>`;
}
