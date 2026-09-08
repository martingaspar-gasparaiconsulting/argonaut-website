// ============================================================================
// ARGONAUT OS · lib/aktivitaeten.ts — das Akquise-Cockpit (D2)
//
// Der eine Bildschirm, den ARGONAUT bisher nicht hatte: nicht das Ergebnis,
// sondern der EINSATZ davor. Wieviele Anrufe, Nachrichten und Besuche waren
// es heute? Wieviele Gespraeche wurden daraus, wieviele Termine?
//
// Erst mit beidem entsteht die Rechnung „X Aktivitaeten rein, Y Termine raus".
// Und genau die ist es, die man spaeter uebergeben kann: was in Zahlen laeuft,
// kann ein Mitarbeiter fahren — was im Kopf des Chefs laeuft, nicht.
//
// Die drei Quoten hier passen zu denen im Termin-Wert-Rechner: dort steht,
// was ein Termin wert ist, hier steht, wieviel Arbeit einer kostet.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — pure, node-testbar.
// ============================================================================

export type Art = 'anruf' | 'nachricht' | 'besuch' | 'mail';
export type Ergebnis = 'kein_kontakt' | 'gesprochen' | 'termin' | 'absage';

export const ARTEN: { schluessel: Art; label: string; icon: string }[] = [
  { schluessel: 'anruf', label: 'Anruf', icon: '📞' },
  { schluessel: 'nachricht', label: 'Nachricht', icon: '💬' },
  { schluessel: 'besuch', label: 'Besuch', icon: '🚗' },
  { schluessel: 'mail', label: 'E-Mail', icon: '✉️' },
];

export const ERGEBNISSE: { schluessel: Ergebnis; label: string; farbe: string }[] = [
  { schluessel: 'kein_kontakt', label: 'Niemand erreicht', farbe: '#8FA3BE' },
  { schluessel: 'gesprochen', label: 'Gesprochen', farbe: '#00e5ff' },
  { schluessel: 'termin', label: 'Termin vereinbart', farbe: '#4CAF7D' },
  { schluessel: 'absage', label: 'Absage', farbe: '#E06666' },
];

export function istArt(v: unknown): v is Art {
  return typeof v === 'string' && ARTEN.some((a) => a.schluessel === v);
}
export function istErgebnis(v: unknown): v is Ergebnis {
  return typeof v === 'string' && ERGEBNISSE.some((e) => e.schluessel === v);
}
export function artLabel(v: unknown): string {
  return ARTEN.find((a) => a.schluessel === v)?.label ?? 'Aktivität';
}
export function ergebnisInfo(v: unknown): { label: string; farbe: string } {
  const e = ERGEBNISSE.find((x) => x.schluessel === v);
  return e ? { label: e.label, farbe: e.farbe } : { label: 'Unbekannt', farbe: '#8FA3BE' };
}

const TAG_MS = 86_400_000;

function zeit(v: unknown): number {
  const t = new Date(String(v ?? '')).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Kalendertag in Europe/Berlin — der Tag, den der Mensch meint. */
export function berlinTag(iso: unknown): string {
  const d = new Date(String(iso ?? ''));
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export type AktivitaetRoh = { art?: unknown; ergebnis?: unknown; erstellt_am?: unknown };

export type Zaehlung = {
  gesamt: number;
  gespraeche: number;   // gesprochen + Termin + Absage = jemand war dran
  termine: number;
  absagen: number;
};

/** Zaehlt eine beliebige Menge Aktivitaeten aus. */
export function zaehle(aktivitaeten: AktivitaetRoh[] | null | undefined): Zaehlung {
  const rows = aktivitaeten || [];
  let gespraeche = 0, termine = 0, absagen = 0;
  for (const a of rows) {
    const e = a?.ergebnis;
    if (e === 'termin') { termine++; gespraeche++; continue; }
    if (e === 'absage') { absagen++; gespraeche++; continue; }
    if (e === 'gesprochen') gespraeche++;
  }
  return { gesamt: rows.length, gespraeche, termine, absagen };
}

/** Nur die Aktivitaeten eines bestimmten Berliner Kalendertages. */
export function vomTag(aktivitaeten: AktivitaetRoh[] | null | undefined, tag: string): AktivitaetRoh[] {
  return (aktivitaeten || []).filter((a) => berlinTag(a?.erstellt_am) === tag);
}

/** Die letzten `tage` Tage, aeltester zuerst — fuer die Balkenreihe. */
export function tagesreihe(
  aktivitaeten: AktivitaetRoh[] | null | undefined,
  jetztIso: string,
  tage = 14,
): { tag: string; label: string; gesamt: number; termine: number }[] {
  const n = Math.max(1, Math.min(90, Math.floor(tage)));
  const heute = berlinTag(jetztIso) || new Date().toISOString().slice(0, 10);
  const anker = new Date(`${heute}T12:00:00Z`).getTime();

  const raus: { tag: string; label: string; gesamt: number; termine: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const tagIso = new Date(anker - i * TAG_MS).toISOString().slice(0, 10);
    const z = zaehle(vomTag(aktivitaeten, tagIso));
    const [, monat, tagZahl] = tagIso.split('-');
    raus.push({ tag: tagIso, label: `${tagZahl}.${monat}.`, gesamt: z.gesamt, termine: z.termine });
  }
  return raus;
}

export type Quoten = {
  /** Von allen Versuchen: wie oft war jemand dran? (%) */
  erreichbarkeit: number | null;
  /** Von den Gespraechen: wie oft entstand ein Termin? (%) */
  terminquote: number | null;
  /** Wieviele Aktivitaeten kostet ein Termin? */
  aktivitaetenJeTermin: number | null;
};

function prozent(z: number, n: number): number | null {
  if (n <= 0) return null;
  return Math.round((z / n) * 1000) / 10;
}

/**
 * Die drei Zahlen, aus denen Planbarkeit wird. Fehlt die Grundlage, bleibt
 * die Quote null — es wird nichts geschaetzt.
 */
export function quoten(z: Zaehlung): Quoten {
  return {
    erreichbarkeit: prozent(z.gespraeche, z.gesamt),
    terminquote: prozent(z.termine, z.gespraeche),
    aktivitaetenJeTermin: z.termine > 0 ? Math.round((z.gesamt / z.termine) * 10) / 10 : null,
  };
}

export type ZielAmpel = 'kein_ziel' | 'offen' | 'fast' | 'erreicht';

/**
 * Der Stand gegen das Tagesziel. Ohne gesetztes Ziel (0) gibt es KEINE Ampel —
 * eine erfundene Vorgabe waere schlimmer als gar keine.
 */
export function zielStand(heute: number, ziel: unknown): { ampel: ZielAmpel; prozent: number; offen: number } {
  const z = Math.floor(Number(ziel));
  const ist = Math.max(0, Math.floor(Number(heute)) || 0);
  if (!Number.isFinite(z) || z <= 0) return { ampel: 'kein_ziel', prozent: 0, offen: 0 };
  const p = Math.min(100, Math.round((ist / z) * 100));
  const offen = Math.max(0, z - ist);
  if (ist >= z) return { ampel: 'erreicht', prozent: 100, offen: 0 };
  if (p >= 70) return { ampel: 'fast', prozent: p, offen };
  return { ampel: 'offen', prozent: p, offen };
}

/**
 * Ein Satz, der sagt, wo man steht. Bewusst ohne Anfeuerung und ohne Tadel —
 * die Zahl spricht fuer sich.
 */
export function tagesSatz(heute: number, ziel: unknown): string {
  const stand = zielStand(heute, ziel);
  if (stand.ampel === 'kein_ziel') {
    return heute > 0
      ? `${heute} Aktivitäten heute. Setzen Sie ein Tagesziel, dann sehen Sie den Stand auf einen Blick.`
      : 'Noch nichts erfasst heute.';
  }
  if (stand.ampel === 'erreicht') return `Tagesziel erreicht: ${heute} Aktivitäten.`;
  return `${heute} von ${Math.floor(Number(ziel))} — noch ${stand.offen} bis zum Tagesziel.`;
}

/**
 * Wieviele Aktivitaeten braucht es fuer eine Anzahl Termine? Die Bruecke zum
 * Termin-Wert-Rechner: dort das Geld, hier die Arbeit.
 */
export function aufwandFuerTermine(termineZiel: unknown, q: Quoten): number | null {
  const ziel = Number(termineZiel);
  if (!Number.isFinite(ziel) || ziel <= 0) return null;
  if (q.aktivitaetenJeTermin == null) return null;
  return Math.ceil(ziel * q.aktivitaetenJeTermin);
}
