// ============================================================================
// ARGONAUT OS · lib/socialProtokoll.ts  (Social P8 · Versandprotokoll)
//
// WARUM ES DIESE DATEI GIBT
// Die Tabelle social_versand wird seit Paket 3 bei JEDEM Sendeversuch
// beschrieben — Kanal, Erfolg, externe Id, Fehlertext. Gelesen wurde sie
// bisher nirgends. Ein geplanter Beitrag konnte also nachts um drei
// scheitern, und in der Oberflaeche stand nur ein graues „fehler" ohne Grund.
//
// Hier steht die reine Logik dafuer: Zeitpunkt finden, sortieren,
// zusammenfassen und aus rohen API-Meldungen einen Satz machen, den ein
// Handwerksmeister versteht. KEINE Netzwerk- oder Supabase-Aufrufe.
// ============================================================================

export type ProtokollZeile = {
  id?: string | null;
  beitrag_id?: string | null;
  plattform?: string | null;
  status?: string | null;
  extern_id?: string | null;
  fehler_text?: string | null;
  [feld: string]: unknown;
};

/**
 * Moegliche Namen der Zeitspalte.
 *
 * ABSICHTLICH MEHRERE: Die Tabelle stammt aus Paket 3 und ihr genauer Aufbau
 * ist im Code nirgends festgeschrieben. Statt auf einen Namen zu wetten und
 * bei der falschen Wette eine leere Liste zu zeigen, wird der erste Treffer
 * genommen. Faellt alles aus, bleibt die Reihenfolge wie geliefert.
 */
export const ZEIT_FELDER = ['created_at', 'gesendet_am', 'zeitpunkt', 'angelegt_am', 'erstellt_am'];

/** Der Zeitpunkt einer Protokollzeile — oder null, wenn die Tabelle keinen hat. */
export function zeitpunktVon(zeile: ProtokollZeile | null | undefined): string | null {
  if (!zeile) return null;
  for (const feld of ZEIT_FELDER) {
    const wert = zeile[feld];
    if (typeof wert === 'string' && wert.trim()) return wert;
  }
  return null;
}

/** Neueste zuerst. Zeilen ohne Zeitpunkt rutschen ans Ende, statt zu verschwinden. */
export function sortiereNeuesteZuerst(zeilen: ProtokollZeile[] | null | undefined): ProtokollZeile[] {
  const liste = Array.isArray(zeilen) ? zeilen.slice() : [];
  return liste.sort((a, b) => {
    const za = zeitpunktVon(a);
    const zb = zeitpunktVon(b);
    if (!za && !zb) return 0;
    if (!za) return 1;
    if (!zb) return -1;
    return new Date(zb).getTime() - new Date(za).getTime();
  });
}

/** Alle Protokollzeilen zu EINEM Beitrag, neueste zuerst. */
export function protokollFuerBeitrag(zeilen: ProtokollZeile[] | null | undefined, beitragId: string): ProtokollZeile[] {
  const liste = Array.isArray(zeilen) ? zeilen : [];
  return sortiereNeuesteZuerst(liste.filter((z) => z?.beitrag_id === beitragId));
}

/**
 * Je Kanal nur der JUENGSTE Versuch.
 *
 * Sonst steht nach drei Anlaeufen dreimal derselbe Kanal untereinander und
 * der aelteste Fehlschlag sieht aus, als gaebe es ihn noch — obwohl der
 * letzte Versuch laengst geklappt hat.
 */
export function letzterVersuchJeKanal(zeilen: ProtokollZeile[] | null | undefined): ProtokollZeile[] {
  const sortiert = sortiereNeuesteZuerst(zeilen);
  const gesehen = new Set<string>();
  const raus: ProtokollZeile[] = [];
  for (const z of sortiert) {
    const k = String(z?.plattform ?? '');
    if (!k || gesehen.has(k)) continue;
    gesehen.add(k);
    raus.push(z);
  }
  return raus;
}

export type Bilanz = { gesamt: number; gesendet: number; fehler: number };

/** Wie viele Versuche gingen durch, wie viele nicht. */
export function bilanz(zeilen: ProtokollZeile[] | null | undefined): Bilanz {
  const liste = Array.isArray(zeilen) ? zeilen : [];
  let gesendet = 0;
  let fehler = 0;
  for (const z of liste) {
    if (z?.status === 'gesendet') gesendet++;
    else if (z?.status === 'fehler') fehler++;
  }
  return { gesamt: liste.length, gesendet, fehler };
}

/**
 * Aus einer rohen API-Meldung einen Satz machen, mit dem jemand etwas
 * anfangen kann. „OAuthException: Error validating access token: Session has
 * expired" hilft niemandem — „Der Zugang ist abgelaufen" schon.
 *
 * Unbekannte Meldungen werden NICHT verschluckt, sondern gekuerzt
 * durchgereicht. Lieber eine kryptische Zeile als gar keine Spur.
 */
export function klartext(roh: string | null | undefined): string {
  const t = String(roh ?? '').trim();
  if (!t) return '';

  // Unsere eigenen Meldungen sind schon deutsch — die bleiben, wie sie sind.
  if (/^(Hinweis:|Instagram braucht|Facebook:|Google Unternehmensprofil braucht|LinkedIn braucht|Mastodon|Bluesky|Kanal nicht verbunden|Die Adresse der|Der Bluesky-Handle|Diese Plattform|Plattform nicht)/.test(t)) {
    return t;
  }
  if (/Text zu lang|braucht ein|nicht verbunden/i.test(t)) return t;

  if (/expired|invalid.*(access )?token|oauth|unauthorized|401|not authorized|authentication/i.test(t)) {
    return 'Der Zugang zu diesem Kanal ist abgelaufen oder wurde entzogen. Bitte den Kanal oben neu verbinden.';
  }
  if (/rate.?limit|too many|429|throttl/i.test(t)) {
    return 'Der Kanal hat vorübergehend gebremst (zu viele Anfragen). Ein neuer Versuch später geht meist durch.';
  }
  if (/permission|scope|insufficient|forbidden|403/i.test(t)) {
    return 'Dem Zugang fehlt eine Berechtigung für diesen Kanal. Bitte den Zugang mit den nötigen Rechten neu erzeugen.';
  }
  if (/not found|404|no such|unknown (path|repo)/i.test(t)) {
    return 'Das Ziel wurde nicht gefunden. Bitte die eingetragene Ziel-Adresse prüfen.';
  }
  if (/netzwerkfehler|fetch failed|enotfound|econnrefused|etimedout|timeout|network/i.test(t)) {
    return 'Der Kanal war nicht erreichbar. Das ist meist vorübergehend.';
  }
  if (/duplicate|already (posted|exists)/i.test(t)) {
    return 'Dieser Beitrag wurde dort bereits veröffentlicht.';
  }

  return kuerze(t, 240);
}

/** Text auf eine Höchstlänge bringen, mit „…" statt hartem Abschnitt. */
export function kuerze(text: string | null | undefined, max: number): string {
  const t = String(text ?? '').trim();
  if (max <= 1 || t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Darf dieser Beitrag noch einmal losgeschickt werden?
 *
 * NUR bei 'fehler'. Ein gesendeter Beitrag duerfte sonst versehentlich ein
 * zweites Mal in der Welt landen, und ein Entwurf gehoert erst eingeplant.
 */
export function darfWiederholen(status: string | null | undefined): boolean {
  return String(status ?? '') === 'fehler';
}

/** Ueberschriften der Beitrag-Status inklusive 'fehler'. */
export const STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf',
  geplant: 'Geplant',
  gesendet: 'Gesendet',
  fehler: 'Nicht gesendet',
};

/**
 * Beschriftung eines Beitrag-Status.
 *
 * WICHTIG: Vor dieser Datei fiel 'fehler' durch das Raster und wurde als
 * „Entwurf" angezeigt — ein misslungener Beitrag sah also aus wie einer, den
 * man nie abgeschickt hat.
 */
export function statusLabel(status: string | null | undefined): string {
  return STATUS_LABEL[String(status ?? '')] ?? 'Entwurf';
}
