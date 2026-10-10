// ============================================================================
// ARGONAUT OS · lib/netzwerk.ts — N1 Betriebs-Netzwerk für alle Branchen (Paket 303)
//
// Das Partner-Netzwerk (Paket 278/279, bisher nur am Fahrzeug) gilt auch für
// Projekte, Aufträge und Objekte. Hier: Arten des Bezugs, Rechte-Modul je Art,
// Links (Auftraggeber-Akte / Partner-Eingang), Texte. Die Rechte selbst prüft
// die Datenbank (p303_darf_auftrag, Zugriffsregeln je Art).
//
// Rein, node-getestet (tests/netzwerkP303).
// ============================================================================

export type BezugTyp = 'kfz_bestand' | 'projekt' | 'auftrag' | 'objekt';

export const BEZUG_ARTEN: { key: Exclude<BezugTyp, 'kfz_bestand'>; name: string; mehrzahl: string; modul: string; tabelle: string; icon: string; akte: (id: string) => string }[] = [
  { key: 'projekt', name: 'Projekt', mehrzahl: 'Projekte', modul: 'projekte', tabelle: 'projekte', icon: '📁', akte: (id) => `/dashboard/projekte/${id}` },
  { key: 'auftrag', name: 'Auftrag', mehrzahl: 'Aufträge', modul: 'auftraege', tabelle: 'auftraege', icon: '📋', akte: (id) => `/dashboard/auftraege/${id}` },
  { key: 'objekt', name: 'Objekt', mehrzahl: 'Objekte', modul: 'objektzeiten', tabelle: 'objekte', icon: '🏢', akte: () => '/dashboard/objektzeiten' },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function istUuid(x: unknown): x is string { return typeof x === 'string' && UUID.test(x); }

export function istBezugTyp(x: unknown): x is BezugTyp {
  return x === 'kfz_bestand' || BEZUG_ARTEN.some((a) => a.key === x);
}

/** Rechte-Modul der Auftraggeber-Seite (wie p303_modul in der Datenbank). */
export function modulFuer(typ: unknown): string | null {
  if (typ === 'kfz_bestand') return 'kfz';
  return BEZUG_ARTEN.find((a) => a.key === typ)?.modul ?? null;
}

export function artName(typ: unknown): string {
  if (typ === 'kfz_bestand') return 'Fahrzeug';
  return BEZUG_ARTEN.find((a) => a.key === typ)?.name ?? 'Bezug';
}

/** Wo der Auftraggeber die Partner-Aufträge eines Bezugs verwaltet (wie p303_link). */
export function akteLink(typ: unknown, bezugId: string): string {
  if (typ === 'kfz_bestand') return `/dashboard/kfz/bestand/${bezugId}?reiter=partner`;
  return `/dashboard/netzwerk/bezug?typ=${typ}&id=${bezugId}`;
}

/** Wo der Partner den Auftrag findet. */
export function eingangLink(typ: unknown, auftragId: string): string {
  return typ === 'kfz_bestand' ? `/dashboard/kfz/partner?auftrag=${auftragId}` : `/dashboard/netzwerk?auftrag=${auftragId}`;
}

/** Adresse ?typ=…&id=… lesen (Kfz läuft über die Handelsakte, nicht hier). */
export function bezugAusAdresse(q: { get(k: string): string | null }): { typ: Exclude<BezugTyp, 'kfz_bestand'>; id: string } | null {
  const typ = q.get('typ');
  const id = q.get('id');
  const art = BEZUG_ARTEN.find((a) => a.key === typ);
  return art && istUuid(id) ? { typ: art.key, id } : null;
}

/** Anzeigename eines Bezugs aus seiner Zeile (gleiche Regeln wie p303_bezug). */
export function bezugTitel(typ: unknown, z: Record<string, unknown> | null | undefined): string {
  const t = (k: string) => (typeof z?.[k] === 'string' ? (z[k] as string).trim() : '');
  if (!z) return artName(typ);
  if (typ === 'projekt') return t('name') || t('titel') || 'Projekt';
  if (typ === 'auftrag') return [t('auftragsnummer'), t('titel') || 'Auftrag'].filter(Boolean).join(' · ');
  if (typ === 'objekt') return t('bezeichnung') || t('name') || 'Objekt';
  return [t('marke'), t('modell'), t('variante')].filter(Boolean).join(' ') || 'Fahrzeug';
}

/** Was der Partner bei Projekt/Auftrag/Objekt sieht — und was nie. */
export function partnerSiehtAllgemein(typ: unknown): { sieht: string[]; nie: string[] } {
  return {
    sieht: [`Name des ${typ === 'auftrag' ? 'Auftrags' : typ === 'objekt' ? 'Objekts' : 'Projekts'}`, 'Ihre Aufgabe und Beschreibung', 'Termin „fertig bis“', 'Einträge und Fotos zu diesem Partner-Auftrag'],
    nie: ['Kunde und Adresse', 'Preise, Angebote, Rechnungen', 'Positionen und Notizen', 'andere Partner-Aufträge'],
  };
}

/** Texte je Ort der Netzwerk-Seite (Kfz-Handel oder alle Branchen). */
export function hubTexte(ort: 'kfz' | 'netzwerk'): { leerEingang: string; leerAusgang: string; trennenFolge: string } {
  if (ort === 'kfz') {
    return {
      leerEingang: 'Wenn ein verbundener Betrieb Ihnen einen Auftrag an einem Fahrzeug gibt, erscheint er hier — mit Glocke.',
      leerAusgang: 'Noch keine Aufträge an Partner. Aufträge vergeben Sie in der Handelsakte eines Fahrzeugs, Reiter „Partner".',
      trennenFolge: 'der Partner sieht keine Fahrzeugdaten mehr',
    };
  }
  return {
    leerEingang: 'Wenn ein verbundener Betrieb Ihnen einen Auftrag an einem Projekt, Auftrag, Objekt oder Fahrzeug gibt, erscheint er hier — mit Glocke.',
    leerAusgang: 'Noch keine Aufträge an Partner. Mit „＋ Auftrag an Partner vergeben“ wählen Sie ein Projekt, einen Auftrag oder ein Objekt.',
    trennenFolge: 'der Partner sieht danach nichts mehr von Ihnen',
  };
}

// ---------------------------------------------------------------------------
// Paket 304 · N1b — Knopf „An Partner geben" in Projekt, Auftrag und Objektzeiten
// ---------------------------------------------------------------------------

/** Laufende Partner-Aufträge (wie LAUFEND in lib/partnerNetzwerk): offen, angenommen, fertig. */
export const LAUFEND_STATUS = ['offen', 'angenommen', 'fertig'] as const;

/** Zählt laufende Partner-Aufträge je Bezug (nur Zeilen dieser Art, nur laufende). */
export function laufendJeBezug(
  zeilen: readonly { bezug_typ?: unknown; bezug_id?: unknown; status?: unknown }[] | null | undefined,
  typ: Exclude<BezugTyp, 'kfz_bestand'>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const z of zeilen ?? []) {
    if (z.bezug_typ !== typ || !istUuid(z.bezug_id)) continue;
    if (!(LAUFEND_STATUS as readonly unknown[]).includes(z.status)) continue;
    out[z.bezug_id] = (out[z.bezug_id] ?? 0) + 1;
  }
  return out;
}

/** Beschriftung des Knopfs; ohne laufende Aufträge nur „An Partner geben". */
export function knopfText(anzahl: unknown, kurz = false): string {
  const n = typeof anzahl === 'number' && Number.isInteger(anzahl) ? anzahl : 0;
  const basis = kurz ? '🤝 Partner' : '🤝 An Partner geben';
  return n > 0 ? `${basis} · ${n} laufend` : basis;
}

/** Ziel des Knopfs (Auswahl entfällt, Bezug steht schon fest). */
export function knopfLink(typ: Exclude<BezugTyp, 'kfz_bestand'>, id: string): string | null {
  return BEZUG_ARTEN.some((a) => a.key === typ) && istUuid(id) ? akteLink(typ, id) : null;
}
