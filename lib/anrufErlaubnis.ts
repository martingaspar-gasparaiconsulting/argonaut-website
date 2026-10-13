// ARGONAUT OS · lib/anrufErlaubnis.ts — Paket 362 (13.10.2026)
// VK11 Anruf-Sperrliste und Erlaubnis-Ampel.
//
// Reine Logik (node-getestet in tests/anrufErlaubnisP362). Dieselben Regeln wie
// supabase-sql/p362-anruf-erlaubnis.sql:
//   · § 7 Abs. 2 Nr. 1 UWG: Werbeanrufe bei Verbrauchern nur mit vorheriger
//     ausdrücklicher Einwilligung, bei Firmen bei zumindest mutmaßlicher Einwilligung.
//   · Auch Bestandskunden, die Verbraucher sind, brauchen eine Einwilligung
//     (anders als bei E-Mail gibt es beim Telefon keine Bestandskunden-Ausnahme).
//   · Ein Lead hat selbst angefragt: Rückruf auf die eigene Anfrage ist erlaubt.
//   · Kein Werbeanruf (z. B. Rückfrage zum laufenden Auftrag) braucht einen Grund.
//   · Gesperrte Nummern (Widerspruch) nie anrufen.
// Die Hinweis-Texte prüft der Anwalt (R61).
//
// Keine Supabase-, React- oder Next-Abhängigkeit.
// ============================================================================

export const GRUND_MIN = 10;

/** Nummer einheitlich wie p362_nummer: +49… ; ohne Vorwahl oder zu kurz → null. */
export function nummerNorm(t: string | null | undefined): string | null {
  // „+49 (0)7031 …“: die (0) gehört nicht zur Nummer
  const s = String(t ?? '').replace(/\(0\)/g, '').replace(/[^0-9+]/g, '');
  if (!s) return null;
  let z: string;
  if (s.startsWith('+')) z = s.slice(1).replace(/\D/g, '');
  else if (s.startsWith('00')) z = s.slice(2);
  else if (s.startsWith('0')) z = '49' + s.slice(1);
  else return null;
  if (z.length < 6 || z.length > 16) return null;
  return '+' + z;
}

export type Erlaubnis = 'eigene_anfrage' | 'einwilligung' | 'mutmasslich' | 'kein_werbeanruf';
export const ERLAUBNIS_TEXT: Record<Erlaubnis, string> = {
  eigene_anfrage: 'Rückruf auf eigene Anfrage',
  einwilligung: 'Einwilligung liegt vor',
  mutmasslich: 'Firma – mutmaßliches Interesse',
  kein_werbeanruf: 'Kein Werbeanruf',
};

export type SperreRoh = { nummer: string; quelle?: string | null; grund?: string | null; gesperrt_am?: string | null; entsperrt_am?: string | null };
export type EinwilligungRoh = { id?: string; nummer: string; kontakt_id?: string | null; lead_id?: string | null; quelle?: string | null; erteilt_am?: string | null; nachweis?: string | null; widerrufen_am?: string | null };

/** Aktive Sperren als Nummer → Sperre. */
export function sperrMap(sperren: readonly SperreRoh[]): Map<string, SperreRoh> {
  const m = new Map<string, SperreRoh>();
  for (const s of sperren) if (!s.entsperrt_am) { const n = nummerNorm(s.nummer) ?? s.nummer; m.set(n, s); }
  return m;
}

/** Gültige (nicht widerrufene) Einwilligung für Nummer, Kontakt oder Lead. */
export function einwilligungFuer(liste: readonly EinwilligungRoh[], nummer: string | null, kontaktId?: string | null, leadId?: string | null): EinwilligungRoh | null {
  return liste.find((e) => !e.widerrufen_am && ((nummer && (nummerNorm(e.nummer) ?? e.nummer) === nummer)
    || (kontaktId && e.kontakt_id === kontaktId) || (leadId && e.lead_id === leadId))) ?? null;
}

export type Fall = {
  typ: 'lead' | 'kontakt'; id: string; telefon: string | null;
  istVerbraucher: boolean | null; bestandskunde?: boolean;
};
export type Ampel = {
  farbe: 'gruen' | 'gelb' | 'rot' | 'grau';
  titel: string; text: string;
  erlaubnis: Erlaubnis | null;         // was beim Speichern mitgeht, wenn nichts mehr fehlt
  braucht: 'nichts' | 'grund' | 'einordnung' | 'gesperrt';
  grundVorschlag?: string;
  /** Ausweg bei Rot: „kein Werbeanruf" mit Grund (nicht bei Sperre). */
  ausweg: boolean;
};

/** Die Ampel vor jedem Anruf. */
export function ampel(f: Fall, sperren: ReadonlyMap<string, SperreRoh>, einw: readonly EinwilligungRoh[]): Ampel {
  const nr = nummerNorm(f.telefon);
  const sp = nr ? sperren.get(nr) : undefined;
  if (sp) return { farbe: 'rot', titel: 'Gesperrt', text: `Diese Nummer ist gesperrt${sp.quelle === 'widerspruch' ? ' (Widerspruch)' : sp.quelle === 'falsche_nummer' ? ' (falsche Nummer)' : ''}. Bitte nicht anrufen.`, erlaubnis: null, braucht: 'gesperrt', ausweg: false };
  if (f.typ === 'lead') return { farbe: 'gruen', titel: 'Erlaubt', text: 'Rückruf auf die eigene Anfrage.', erlaubnis: 'eigene_anfrage', braucht: 'nichts', ausweg: false };
  if (einwilligungFuer(einw, nr, f.id)) return { farbe: 'gruen', titel: 'Erlaubt', text: 'Einwilligung in Anrufe liegt vor.', erlaubnis: 'einwilligung', braucht: 'nichts', ausweg: false };
  if (f.istVerbraucher === true) {
    return { farbe: 'rot', titel: 'Kein Werbeanruf', text: 'Verbraucher ohne ausdrückliche Einwilligung: Werbeanrufe sind nicht erlaubt – auch nicht bei Bestandskunden. Erlaubt ist nur ein Anruf ohne Werbung, z. B. eine Rückfrage zu einem laufenden Auftrag.', erlaubnis: null, braucht: 'grund', ausweg: true };
  }
  if (f.istVerbraucher === false) {
    return { farbe: 'gelb', titel: 'Firma', text: 'Bei Firmen ist ein Anruf erlaubt, wenn ein mutmaßliches Interesse besteht. Bitte den Grund festhalten – er wird mit dem Anruf gespeichert.', erlaubnis: 'mutmasslich', braucht: 'grund', grundVorschlag: f.bestandskunde ? 'Bestandskunde – ' : '', ausweg: true };
  }
  return { farbe: 'grau', titel: 'Bitte einordnen', text: 'Verbraucher oder Firma? Davon hängt ab, ob der Anruf erlaubt ist.', erlaubnis: null, braucht: 'einordnung', ausweg: true };
}

/** Darf jetzt gewählt/gespeichert werden? Liefert die Erlaubnis oder den Hinderungsgrund. */
export function freigabe(a: Ampel, wahl: { keinWerbeanruf: boolean; grund: string }): { ok: true; erlaubnis: Erlaubnis; grund: string | null } | { ok: false; fehler: string } {
  const g = wahl.grund.trim();
  if (a.braucht === 'gesperrt') return { ok: false, fehler: 'Diese Nummer ist gesperrt.' };
  if (wahl.keinWerbeanruf) {
    if (!a.ausweg) return a.erlaubnis ? { ok: true, erlaubnis: a.erlaubnis, grund: null } : { ok: false, fehler: 'Nicht möglich.' };
    return g.length >= GRUND_MIN ? { ok: true, erlaubnis: 'kein_werbeanruf', grund: g } : { ok: false, fehler: `Bitte den Anlass angeben (mindestens ${GRUND_MIN} Zeichen).` };
  }
  if (a.braucht === 'nichts' && a.erlaubnis) return { ok: true, erlaubnis: a.erlaubnis, grund: null };
  if (a.braucht === 'einordnung') return { ok: false, fehler: 'Bitte zuerst „Verbraucher" oder „Firma" wählen.' };
  if (a.erlaubnis === 'mutmasslich') return g.length >= GRUND_MIN ? { ok: true, erlaubnis: 'mutmasslich', grund: g } : { ok: false, fehler: `Bitte den Grund für das mutmaßliche Interesse angeben (mindestens ${GRUND_MIN} Zeichen).` };
  return { ok: false, fehler: 'Werbeanruf nicht erlaubt.' };
}

export const QUELLEN = Object.freeze([
  { key: 'schriftlich', name: 'Schriftlich (unterschrieben)' },
  { key: 'online_formular', name: 'Online-Formular mit Haken' },
  { key: 'mail', name: 'Per E-Mail bestätigt' },
  { key: 'muendlich', name: 'Mündlich (schwer nachweisbar)' },
] as const);

export function einwilligungPruefen(e: { nummer: string; quelle: string; erteilt_am: string; nachweis: string }, heute: string): string[] {
  const f: string[] = [];
  if (!nummerNorm(e.nummer)) f.push('Bitte eine Telefonnummer mit Vorwahl angeben.');
  if (!QUELLEN.some((q) => q.key === e.quelle)) f.push('Bitte angeben, wie die Einwilligung erteilt wurde.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.erteilt_am)) f.push('Bitte das Datum der Einwilligung angeben.');
  else if (e.erteilt_am > heute) f.push('Das Datum der Einwilligung liegt in der Zukunft.');
  const n = e.nachweis.trim();
  if (n.length < 10) f.push('Bitte festhalten, wo der Nachweis liegt (mindestens 10 Zeichen).');
  if (n.length > 1000) f.push('Der Nachweis darf höchstens 1.000 Zeichen haben.');
  return f;
}

export function sperrePruefen(nummer: string): string[] {
  return nummerNorm(nummer) ? [] : ['Bitte eine Telefonnummer mit Vorwahl angeben (z. B. 07031 123456 oder +49 7031 123456).'];
}

/** „+497031123456" → „+49 7031123456" (nur Lesbarkeit). */
export function nummerText(n: string): string {
  return /^\+49\d+$/.test(n) ? `+49 ${n.slice(3)}` : n;
}
