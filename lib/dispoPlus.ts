// ============================================================================
// ARGONAUT OS · lib/dispoPlus.ts — Dispo mit Route und Qualifikation (Paket PO, B29)
//
// Reine Logik, node-getestet (tests/dispoPlusP89.test.mjs).
// Keine Imports aus Next oder Supabase, keine Uhrzeit von selbst.
//
//   QUALIFIKATIONEN     Katalog der Nachweise, die ein Einsatz verlangen kann
//   gueltigAm           welche Qualifikationen eines Monteurs an einem Tag gelten
//   pruefeZuweisung     fehlt etwas / ist etwas abgelaufen?
//   ueberschneidungen   Zeitkonflikte am selben Tag
//   engePuffer          zu wenig Zeit zwischen zwei Einsätzen an verschiedenen Orten
//   vorschlaege         wer passt am besten: qualifiziert, frei, wenig ausgelastet
//   ablaufWarnungen     Qualifikationen, die bald ablaufen (für die Übersicht)
//
// Die Route selbst plant /api/tour-planen (existiert seit Bündel 1) — das
// Dispo-Board ruft sie nur je Monteur und Tag auf.
// ANDOCKPUNKTE: Fahrzeit aus dem Kartendienst statt fester Puffer; Qualifikation
// aus der Nachweis-Mappe (PE) übernehmen; Schichtplan-Abwesenheiten einbeziehen.
// ============================================================================

export type Quali = { key: string; label: string; hinweis?: string };

/** Häufige Befähigungen im Handwerk/Service. Hinweise sind Richtwerte, keine Rechtsberatung. */
export const QUALIFIKATIONEN: Quali[] = [
  { key: 'elektrofachkraft', label: 'Elektrofachkraft', hinweis: 'DGUV V3 / VDE 1000-10' },
  { key: 'eup', label: 'Elektrotechnisch unterwiesene Person' },
  { key: 'gas', label: 'Gas-Arbeiten (Eintrag Installateurverzeichnis)' },
  { key: 'kaeltemittel', label: 'Kältemittel-Sachkunde (Kat. I)', hinweis: 'ChemKlimaschutzV' },
  { key: 'trinkwasser', label: 'Trinkwasser-Hygieneschulung', hinweis: 'VDI/DVGW 6023' },
  { key: 'stapler', label: 'Staplerschein + Beauftragung', hinweis: 'DGUV G 308-001' },
  { key: 'hubarbeitsbuehne', label: 'Hubarbeitsbühne', hinweis: 'DGUV G 308-008' },
  { key: 'psa_absturz', label: 'PSA gegen Absturz', hinweis: 'DGUV R 112-198' },
  { key: 'geruest', label: 'Gerüstbau-Befähigung' },
  { key: 'schweissen', label: 'Schweißer-Prüfung' },
  { key: 'asbest', label: 'Asbest-Sachkunde', hinweis: 'TRGS 519' },
  { key: 'fuehrerschein_c', label: 'Führerschein C/C1/CE' },
  { key: 'erste_hilfe', label: 'Ersthelfer', hinweis: 'Fortbildung alle 2 Jahre' },
  { key: 'brandschutzhelfer', label: 'Brandschutzhelfer' },
];

export function qualiLabel(key: string): string {
  return QUALIFIKATIONEN.find((q) => q.key === key)?.label ?? key;
}

/** Nur bekannte Schlüssel, ohne Doppelte, in Katalog-Reihenfolge. */
export function saubereAnforderungen(roh: unknown): string[] {
  const liste = Array.isArray(roh) ? roh.map(String) : [];
  return QUALIFIKATIONEN.map((q) => q.key).filter((k) => liste.includes(k));
}

export type MaQuali = { mitarbeiter_id: string; art: string; gueltig_bis?: string | null };

/** Gilt am Tag `datum` (YYYY-MM-DD)? Ohne Ablaufdatum = unbefristet; am Ablauftag noch gültig. */
export function giltAm(q: { gueltig_bis?: string | null }, datum: string): boolean {
  const b = (q.gueltig_bis ?? '').slice(0, 10);
  if (!b) return true;
  return b >= datum;
}

export function gueltigAm(qualis: MaQuali[], mitarbeiterId: string, datum: string): Set<string> {
  const s = new Set<string>();
  for (const q of qualis) if (q.mitarbeiter_id === mitarbeiterId && giltAm(q, datum)) s.add(q.art);
  return s;
}

/** Was fehlt dem Monteur für diesen Einsatz? `abgelaufen` = vorhanden, aber am Tag nicht mehr gültig. */
export function pruefeZuweisung(
  anforderungen: string[], qualis: MaQuali[], mitarbeiterId: string, datum: string,
): { fehlt: string[]; abgelaufen: string[] } {
  const gilt = gueltigAm(qualis, mitarbeiterId, datum);
  const hatUeberhaupt = new Set(qualis.filter((q) => q.mitarbeiter_id === mitarbeiterId).map((q) => q.art));
  const fehlt: string[] = [];
  const abgelaufen: string[] = [];
  for (const a of anforderungen) {
    if (gilt.has(a)) continue;
    if (hatUeberhaupt.has(a)) abgelaufen.push(a); else fehlt.push(a);
  }
  return { fehlt, abgelaufen };
}

// ---------------------------------------------------------------------------
// Zeit
// ---------------------------------------------------------------------------

export type Einsatz = {
  id?: string; mitarbeiter_id?: string | null; beginn_am: string | null; ende_am: string | null;
  status?: string | null; einsatzort?: string | null; titel?: string | null;
};

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}
function zaehlt(e: Einsatz): boolean {
  return (e.status ?? '') !== 'abgesagt';
}

/** Einsätze aus `liste`, die sich mit [beginn, ende) überschneiden (ohne `ohneId`). */
export function ueberschneidungen(liste: Einsatz[], beginn: string, ende: string, ohneId?: string | null): Einsatz[] {
  const b = ms(beginn); const e = ms(ende);
  if (b === null || e === null || e <= b) return [];
  return liste.filter((x) => {
    if (!zaehlt(x) || (ohneId && x.id === ohneId)) return false;
    const xb = ms(x.beginn_am); const xe = ms(x.ende_am);
    if (xb === null || xe === null) return false;
    return xb < e && b < xe;
  });
}

export const PUFFER_MINUTEN = 20;

function ortNorm(o: string | null | undefined): string {
  return String(o ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Zu knapp hintereinander an VERSCHIEDENEN Orten: weniger als `puffer` Minuten
 * zwischen Ende des einen und Beginn des nächsten. Gleicher Ort = kein Problem.
 */
export function engePuffer(liste: Einsatz[], neu: Einsatz, puffer = PUFFER_MINUTEN): { einsatz: Einsatz; minuten: number }[] {
  const nb = ms(neu.beginn_am); const ne = ms(neu.ende_am);
  if (nb === null || ne === null) return [];
  const aus: { einsatz: Einsatz; minuten: number }[] = [];
  for (const x of liste) {
    if (!zaehlt(x) || (neu.id && x.id === neu.id)) continue;
    if (ortNorm(x.einsatzort) && ortNorm(x.einsatzort) === ortNorm(neu.einsatzort)) continue;
    const xb = ms(x.beginn_am); const xe = ms(x.ende_am);
    if (xb === null || xe === null) continue;
    let luecke: number | null = null;
    if (xe <= nb) luecke = (nb - xe) / 60000;
    else if (ne <= xb) luecke = (xb - ne) / 60000;
    if (luecke !== null && luecke < puffer) aus.push({ einsatz: x, minuten: Math.round(luecke) });
  }
  return aus;
}

/** Stunden, die ein Monteur an einem Tag schon verplant hat. */
export function tagesStunden(liste: Einsatz[], ohneId?: string | null): number {
  let s = 0;
  for (const x of liste) {
    if (!zaehlt(x) || (ohneId && x.id === ohneId)) continue;
    const b = ms(x.beginn_am); const e = ms(x.ende_am);
    if (b !== null && e !== null && e > b) s += (e - b) / 3600000;
  }
  return Math.round(s * 10) / 10;
}

// ---------------------------------------------------------------------------
// Vorschläge
// ---------------------------------------------------------------------------

export type Monteur = { id: string; name: string; wochenstunden?: number | null };
export type Vorschlag = {
  id: string; name: string; passt: boolean; stunden: number; tagesziel: number | null;
  gruende: string[];
};

/**
 * Rangliste für einen Einsatz. Wer qualifiziert UND frei ist, steht oben,
 * dann nach Tagesauslastung (Anteil am Tagesziel, sonst Stunden), dann Name.
 * `einsaetzeJeMonteur` enthält die Einsätze desselben Tages.
 */
export function vorschlaege(o: {
  anforderungen: string[]; beginn: string; ende: string; datum: string; einsatzort?: string | null; einsatzId?: string | null;
  monteure: Monteur[]; qualis: MaQuali[]; einsaetzeJeMonteur: Record<string, Einsatz[]>;
}): Vorschlag[] {
  const liste = o.monteure.map((m) => {
    const tag = o.einsaetzeJeMonteur[m.id] ?? [];
    const pz = pruefeZuweisung(o.anforderungen, o.qualis, m.id, o.datum);
    const konflikt = ueberschneidungen(tag, o.beginn, o.ende, o.einsatzId);
    const knapp = engePuffer(tag, { id: o.einsatzId ?? undefined, beginn_am: o.beginn, ende_am: o.ende, einsatzort: o.einsatzort ?? null });
    const stunden = tagesStunden(tag, o.einsatzId);
    const tagesziel = m.wochenstunden && m.wochenstunden > 0 ? Math.round((m.wochenstunden / 5) * 10) / 10 : null;
    const gruende: string[] = [];
    if (pz.fehlt.length) gruende.push('fehlt: ' + pz.fehlt.map(qualiLabel).join(', '));
    if (pz.abgelaufen.length) gruende.push('abgelaufen: ' + pz.abgelaufen.map(qualiLabel).join(', '));
    if (konflikt.length) gruende.push(`Überschneidung mit ${konflikt.length} Einsatz${konflikt.length > 1 ? 'en' : ''}`);
    if (knapp.length) gruende.push(`knapp: nur ${Math.min(...knapp.map((k) => k.minuten))} Min. Puffer`);
    const passt = !pz.fehlt.length && !pz.abgelaufen.length && !konflikt.length;
    return { id: m.id, name: m.name, passt, stunden, tagesziel, gruende, knapp: knapp.length > 0 };
  });
  const last = (v: { stunden: number; tagesziel: number | null }) => (v.tagesziel ? v.stunden / v.tagesziel : v.stunden / 8);
  liste.sort((a, b) =>
    Number(b.passt) - Number(a.passt)
    || Number(a.knapp) - Number(b.knapp)
    || last(a) - last(b)
    || a.name.localeCompare(b.name, 'de'));
  return liste.map(({ knapp: _k, ...v }) => { void _k; return v; });
}

// ---------------------------------------------------------------------------
// Übersicht Qualifikationen
// ---------------------------------------------------------------------------

/** Tage zwischen zwei ISO-Daten (b − a), ohne Zeitzonen-Effekte. */
export function tageZwischen(a: string, b: string): number {
  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((tb - ta) / 86400000);
}

export function qualiAmpel(gueltigBis: string | null | undefined, heute: string, vorlaufTage = 60): 'gruen' | 'gelb' | 'rot' | 'unbefristet' {
  const b = (gueltigBis ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) return 'unbefristet';
  if (b < heute) return 'rot';
  return tageZwischen(heute, b) <= vorlaufTage ? 'gelb' : 'gruen';
}

/** Abgelaufene und bald ablaufende Qualifikationen, dringendste zuerst. */
export function ablaufWarnungen(qualis: (MaQuali & { name?: string })[], heute: string, vorlaufTage = 60): (MaQuali & { name?: string; ampel: 'gelb' | 'rot'; tage: number })[] {
  return qualis
    .map((q) => ({ ...q, ampel: qualiAmpel(q.gueltig_bis, heute, vorlaufTage) }))
    .filter((q): q is MaQuali & { name?: string; ampel: 'gelb' | 'rot' } => q.ampel === 'gelb' || q.ampel === 'rot')
    .map((q) => ({ ...q, tage: tageZwischen(heute, String(q.gueltig_bis).slice(0, 10)) }))
    .sort((a, b) => a.tage - b.tage);
}
