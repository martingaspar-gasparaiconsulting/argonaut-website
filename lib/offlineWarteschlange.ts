// ============================================================================
// ARGONAUT OS · lib/offlineWarteschlange.ts
//
// Was der Monteur ohne Netz eingibt, darf nicht verloren gehen. Diese Datei
// ist die Warteschlange dafuer: Eingaben werden lokal abgelegt und in genau
// der Reihenfolge nachgereicht, in der sie entstanden sind — sobald wieder
// Verbindung da ist.
//
// GRUNDSAETZE
//  · REIHENFOLGE: strikt FIFO. Ein "Gehen" darf nie vor dem zugehoerigen
//    "Kommen" ankommen. Solange der vorderste Auftrag klemmt, wartet der Rest.
//  · EIGENE ID: Neue Datensaetze bekommen ihre id schon beim Erfassen (nicht
//    erst von der Datenbank). Nur so laesst sich ein Eintrag, der noch in der
//    Warteschlange steht, spaeter aendern — offline gibt es keine Server-ID.
//  · EINGEFRORENE ZEIT: Zeitstempel entstehen beim ERFASSEN, nie beim Senden.
//    Sonst bucht ein Monteur, der um 7:12 im Funkloch stempelt und um 9:40
//    wieder Empfang hat, seinen Arbeitsbeginn auf 9:40.
//  · AUFGEBEN STATT SCHLEIFE: nach MAX_VERSUCHE oder MAX_ALTER_TAGE wird ein
//    Auftrag als "aufgegeben" markiert und dem Nutzer gezeigt — er verschwindet
//    nie stillschweigend.
//
// Keine Imports, keine Hooks, kein Browser-Zwang: der Speicher wird von aussen
// hereingereicht. Dadurch ist alles hier mit node testbar.
// ============================================================================

export type AuftragArt = 'insert' | 'update';

export type Auftrag = {
  /** Eindeutige ID des Auftrags selbst (nicht des Datensatzes). */
  id: string;
  art: AuftragArt;
  tabelle: string;
  werte: Record<string, unknown>;
  /** Bei 'update': welcher Datensatz geaendert wird. */
  zielId?: string;
  /** Klartext fuer die Anzeige, z.B. "Kommen 07:12". */
  beschreibung: string;
  erstellt_am: string;
  versuche: number;
  letzter_versuch_am?: string;
  letzter_fehler?: string;
  aufgegeben?: boolean;
};

export type Speicher = {
  lesen: () => string | null;
  schreiben: (inhalt: string) => void;
};

export const SPEICHER_KEY = 'argonaut-warteschlange-v1';

const MAX_AUFTRAEGE = 300;
const MAX_VERSUCHE = 8;
const MAX_ALTER_TAGE = 14;

// ---------------------------------------------------------------------------
// Speicher
// ---------------------------------------------------------------------------

/** Der echte Speicher im Browser. Faellt auf einen Blindspeicher zurueck, wenn
 *  localStorage gesperrt ist (privater Modus) — dann geht nur Offline nicht. */
export function browserSpeicher(): Speicher {
  return {
    lesen: () => {
      try { return window.localStorage.getItem(SPEICHER_KEY); } catch { return null; }
    },
    schreiben: (inhalt: string) => {
      try { window.localStorage.setItem(SPEICHER_KEY, inhalt); } catch { /* nicht speicherbar */ }
    },
  };
}

/** Speicher fuer Tests und den Notfall — haelt alles nur im Arbeitsspeicher. */
export function gedaechtnisSpeicher(start = ''): Speicher {
  let inhalt = start;
  return { lesen: () => inhalt || null, schreiben: (neu: string) => { inhalt = neu; } };
}

// ---------------------------------------------------------------------------
// Lesen und Schreiben
// ---------------------------------------------------------------------------

export function alleAuftraege(sp: Speicher): Auftrag[] {
  const roh = sp.lesen();
  if (!roh) return [];
  try {
    const daten = JSON.parse(roh);
    if (!Array.isArray(daten)) return [];
    return daten.filter((a): a is Auftrag =>
      !!a && typeof a.id === 'string' && typeof a.tabelle === 'string' && (a.art === 'insert' || a.art === 'update'));
  } catch {
    return [];   // kaputter Speicher blockiert nie die App
  }
}

function sichern(sp: Speicher, liste: Auftrag[]): void {
  sp.schreiben(JSON.stringify(liste.slice(-MAX_AUFTRAEGE)));
}

/** Neue ID — mit Rueckfall, falls crypto.randomUUID fehlt (aeltere Browser). */
export function neueId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* Rueckfall unten */ }
  const zufall = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${zufall()}${zufall()}-${zufall()}-4${zufall().slice(1)}-a${zufall().slice(1)}-${zufall()}${zufall()}${zufall()}`;
}

export type NeuerAuftrag = {
  art: AuftragArt;
  tabelle: string;
  werte: Record<string, unknown>;
  zielId?: string;
  beschreibung: string;
  /** Zeitpunkt der Erfassung — wird eingefroren. */
  jetzt: Date;
};

/** Haengt einen Auftrag hinten an. Liefert den fertigen Auftrag zurueck. */
export function einreihen(sp: Speicher, neu: NeuerAuftrag): Auftrag {
  const auftrag: Auftrag = {
    id: neueId(),
    art: neu.art,
    tabelle: neu.tabelle,
    werte: { ...neu.werte },
    zielId: neu.zielId,
    beschreibung: neu.beschreibung,
    erstellt_am: neu.jetzt.toISOString(),
    versuche: 0,
  };
  const liste = alleAuftraege(sp);
  liste.push(auftrag);
  sichern(sp, liste);
  return auftrag;
}

export function entfernen(sp: Speicher, auftragId: string): void {
  sichern(sp, alleAuftraege(sp).filter((a) => a.id !== auftragId));
}

export function leeren(sp: Speicher): void {
  sp.schreiben('[]');
}

/** Aendert einen Auftrag (Versuche zaehlen, Fehler merken, aufgeben). */
export function aktualisieren(sp: Speicher, auftragId: string, teil: Partial<Auftrag>): void {
  sichern(sp, alleAuftraege(sp).map((a) => (a.id === auftragId ? { ...a, ...teil } : a)));
}

// ---------------------------------------------------------------------------
// Wann wird was versucht
// ---------------------------------------------------------------------------

/** Wartezeit bis zum naechsten Versuch in Millisekunden — wachsend, gedeckelt. */
export function wartezeitMs(versuche: number): number {
  if (versuche <= 0) return 0;
  const stufen = [5000, 15000, 45000, 120000, 300000, 600000, 900000];
  return stufen[Math.min(versuche - 1, stufen.length - 1)] ?? 900000;
}

export function istBereit(a: Auftrag, jetzt: Date): boolean {
  if (a.aufgegeben) return false;
  if (!a.letzter_versuch_am) return true;
  const letzter = new Date(a.letzter_versuch_am).getTime();
  if (isNaN(letzter)) return true;
  return jetzt.getTime() - letzter >= wartezeitMs(a.versuche);
}

/** Zu alt oder zu oft gescheitert? Dann nicht ewig weiterprobieren. */
export function sollAufgeben(a: Auftrag, jetzt: Date): boolean {
  if (a.versuche >= MAX_VERSUCHE) return true;
  const alter = jetzt.getTime() - new Date(a.erstellt_am).getTime();
  return !isNaN(alter) && alter > MAX_ALTER_TAGE * 86400000;
}

/**
 * Der naechste Auftrag, der dran ist — oder null.
 * WICHTIG: Es wird immer nur der VORDERSTE offene Auftrag betrachtet. Wuerde
 * man ihn ueberspringen, koennte ein 'update' vor seinem 'insert' losgehen.
 * Nur aufgegebene Auftraege werden uebersprungen; sie blockieren nicht mehr.
 */
export function naechster(sp: Speicher, jetzt: Date): Auftrag | null {
  for (const a of alleAuftraege(sp)) {
    if (a.aufgegeben) continue;
    return istBereit(a, jetzt) ? a : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Zaehlen und Anzeigen
// ---------------------------------------------------------------------------

export type Stand = {
  offen: number;
  aufgegeben: number;
  gesamt: number;
  aeltester?: string;
};

export function stand(sp: Speicher): Stand {
  const liste = alleAuftraege(sp);
  const offen = liste.filter((a) => !a.aufgegeben);
  return {
    offen: offen.length,
    aufgegeben: liste.length - offen.length,
    gesamt: liste.length,
    aeltester: offen[0]?.erstellt_am,
  };
}

/** Ein Satz fuer die Statusanzeige — bewusst ohne Fachjargon. */
export function standText(s: Stand): string {
  if (s.gesamt === 0) return 'Alles übertragen';
  const teile: string[] = [];
  if (s.offen === 1) teile.push('1 Eingabe wartet auf Verbindung');
  else if (s.offen > 1) teile.push(`${s.offen} Eingaben warten auf Verbindung`);
  if (s.aufgegeben === 1) teile.push('1 Eingabe konnte nicht übertragen werden');
  else if (s.aufgegeben > 1) teile.push(`${s.aufgegeben} Eingaben konnten nicht übertragen werden`);
  return teile.join(' · ');
}

/** Fehlermeldung in etwas verwandeln, das ein Handwerker versteht. */
export function fehlerText(roh: string): string {
  const t = (roh || '').toLowerCase();
  if (t.includes('failed to fetch') || t.includes('networkerror') || t.includes('load failed')) {
    return 'Keine Verbindung — wird später erneut versucht.';
  }
  if (t.includes('duplicate key') || t.includes('unique')) {
    return 'Dieser Eintrag ist bereits vorhanden.';
  }
  if (t.includes('row-level security') || t.includes('permission') || t.includes('not authorized')) {
    return 'Keine Berechtigung dafür. Bitte an den Betrieb wenden.';
  }
  if (t.includes('jwt') || t.includes('token') || t.includes('session')) {
    return 'Die Anmeldung ist abgelaufen. Bitte neu anmelden — die Eingabe bleibt gespeichert.';
  }
  return roh || 'Unbekannter Fehler';
}
