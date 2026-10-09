// ============================================================================
// ARGONAUT OS · lib/fuehrerscheinKontrolle.ts — F1a Führerscheinkontrolle (Paket 289)
//
// Wer Mitarbeitern Firmenfahrzeuge überlässt, kontrolliert regelmäßig, ob sie
// eine gültige Fahrerlaubnis haben. Hier: Prüfvermerk je Kontrolle (wer, wann,
// Klassen, Ablauf des Kartendokuments, Ergebnis) und die nächste Fälligkeit.
// Festgehalten wird NUR der Vermerk — keine Führerscheinnummer, keine Kopie.
// Die Funktion ist gesperrt, bis die Geschäftsleitung die Rechts-Freigabe
// „Führerscheinkontrolle" bestätigt hat (Paket 287/288; die Datenbank prüft mit).
//
// Rein, ohne Importe, node-getestet (tests/fuehrerscheinP289). Datum immer als
// YYYY-MM-DD, „heute" kommt als Parameter.
// ============================================================================

export const FS_MODUL = 'fuhrpark-pflichten';
export const INTERVALL_STANDARD = 6;   // Monate
export const INTERVALL_MIN = 1;
export const INTERVALL_MAX = 12;
export const BALD_TAGE = 30;
export const KLASSEN = ['AM', 'A1', 'A2', 'A', 'B', 'BE', 'B96', 'C1', 'C1E', 'C', 'CE', 'D1', 'D1E', 'D', 'DE', 'L', 'T'] as const;

export function istIso(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [j, m, t] = x.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

/** Monate addieren, Monatsende abgeschnitten (31.08. + 6 = 28./29.02.). */
export function plusMonate(iso: string, monate: number): string {
  const [j, m, t] = iso.split('-').map(Number);
  const ziel = new Date(Date.UTC(j, m - 1 + monate, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(t, letzter));
  return ziel.toISOString().slice(0, 10);
}

export function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(bis + 'T00:00:00Z') - Date.parse(von + 'T00:00:00Z')) / 86_400_000);
}

/** Einstellung lesen: Intervall in Monaten (1–12, sonst Standard 6) und Fahrerliste (Mitarbeiter-IDs). */
export function einstellungLesen(roh: unknown): { intervall: number; fahrer: string[] } {
  const e = (roh && typeof roh === 'object' ? roh : {}) as { fsIntervall?: unknown; fahrer?: unknown };
  const n = typeof e.fsIntervall === 'number' && Number.isInteger(e.fsIntervall) ? e.fsIntervall : INTERVALL_STANDARD;
  const intervall = n >= INTERVALL_MIN && n <= INTERVALL_MAX ? n : INTERVALL_STANDARD;
  const fahrer = Array.isArray(e.fahrer) ? [...new Set(e.fahrer.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 500) : [];
  return { intervall, fahrer };
}

/** Klassen säubern: „b,be  c1" → „B, BE, C1". Unbekanntes → Fehler. */
export function klassenLesen(roh: unknown): { ok: true; wert: string | null } | { ok: false; grund: string } {
  const t = String(roh ?? '').toUpperCase().split(/[\s,;/]+/).filter(Boolean);
  if (t.length === 0) return { ok: true, wert: null };
  const bekannt = new Set<string>(KLASSEN);
  const falsch = t.filter((k) => !bekannt.has(k));
  if (falsch.length) return { ok: false, grund: `Unbekannte Klasse: ${falsch.join(', ')}. Erlaubt: ${KLASSEN.join(', ')}.` };
  const sortiert = KLASSEN.filter((k) => t.includes(k));
  return { ok: true, wert: sortiert.join(', ') };
}

/** Sieht aus wie eine Führerscheinnummer (11 Zeichen Buchstaben/Ziffern mit Ziffer)? Die soll nicht gespeichert werden. */
export function siehtAusWieNummer(text: string): boolean {
  return /\b(?=[A-Z0-9]*\d)[A-Z0-9]{11}\b/i.test(text);
}

/** Nächste Kontrolle: nach dem Intervall — früher, wenn das Kartendokument vorher abläuft; bei Mangel sofort. */
export function naechsteAm(geprueftAm: string, intervall: number, dokumentBis: string | null, ergebnis: 'gueltig' | 'mangel'): string {
  if (ergebnis === 'mangel') return geprueftAm;
  const regel = plusMonate(geprueftAm, intervall);
  if (dokumentBis && istIso(dokumentBis) && dokumentBis < regel) return dokumentBis < geprueftAm ? geprueftAm : dokumentBis;
  return regel;
}

export type KontrollEingabe = {
  mitarbeiter_id: string | null; person_name: string; klassen: string | null; dokument_gueltig_bis: string | null;
  geprueft_am: string; ergebnis: 'gueltig' | 'mangel'; bemerkung: string | null; naechste_am: string;
};

export function eingabePruefen(o: {
  mitarbeiterId?: unknown; name: unknown; klassen?: unknown; dokumentBis?: unknown; geprueftAm: unknown;
  ergebnis?: unknown; bemerkung?: unknown; intervall: number; heute: string;
}): { ok: true; zeile: KontrollEingabe } | { ok: false; grund: string } {
  const name = String(o.name ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 120) return { ok: false, grund: 'Bitte den Namen der Fahrerin bzw. des Fahrers angeben.' };
  if (!istIso(o.geprueftAm)) return { ok: false, grund: 'Bitte das Datum der Kontrolle angeben.' };
  if (o.geprueftAm > o.heute) return { ok: false, grund: 'Eine Kontrolle kann nicht in der Zukunft liegen.' };
  const kl = klassenLesen(o.klassen);
  if (!kl.ok) return { ok: false, grund: kl.grund };
  const dokRoh = String(o.dokumentBis ?? '').trim();
  if (dokRoh && !istIso(dokRoh)) return { ok: false, grund: 'Das Ablaufdatum des Führerscheins ist kein gültiges Datum.' };
  const ergebnis = o.ergebnis === 'mangel' ? 'mangel' : 'gueltig';
  const bemerkung = String(o.bemerkung ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) || null;
  if (bemerkung && siehtAusWieNummer(bemerkung)) return { ok: false, grund: 'Bitte keine Führerscheinnummer eintragen — festgehalten wird nur der Prüfvermerk.' };
  if (dokRoh && dokRoh < o.geprueftAm && ergebnis === 'gueltig') return { ok: false, grund: 'Der Führerschein war am Prüftag schon abgelaufen — bitte „Mangel" wählen.' };
  const mid = typeof o.mitarbeiterId === 'string' && /^[0-9a-f-]{36}$/i.test(o.mitarbeiterId) ? o.mitarbeiterId : null;
  return {
    ok: true,
    zeile: {
      mitarbeiter_id: mid, person_name: name, klassen: kl.wert, dokument_gueltig_bis: dokRoh || null,
      geprueft_am: o.geprueftAm, ergebnis, bemerkung,
      naechste_am: naechsteAm(o.geprueftAm, o.intervall, dokRoh || null, ergebnis),
    },
  };
}

export type Kontrolle = {
  id?: string; mitarbeiter_id?: string | null; person_name: string; klassen?: string | null;
  dokument_gueltig_bis?: string | null; geprueft_am: string; geprueft_name?: string | null;
  ergebnis: string; bemerkung?: string | null; naechste_am: string;
};
export type Stufe = 'fehlt' | 'mangel' | 'ueberfaellig' | 'bald' | 'ok';
export type FahrerZeile = { schluessel: string; mitarbeiterId: string | null; name: string; letzte: Kontrolle | null; stufe: Stufe; tage: number | null; anzahl: number };

function schluesselVon(mid: string | null | undefined, name: string): string {
  return mid ? 'm:' + mid : 'n:' + name.trim().toLowerCase();
}

/** Stand je Fahrer: letzte Kontrolle und Ampel. Fahrer = Liste aus der Einstellung + alle mit Kontrolle. */
export function fahrerUebersicht(fahrer: { id: string; name: string }[], kontrollen: Kontrolle[], heute: string): FahrerZeile[] {
  const zeilen = new Map<string, FahrerZeile>();
  const namen = new Map<string, string>();
  for (const f of fahrer) { namen.set(f.id, f.name); zeilen.set(schluesselVon(f.id, f.name), { schluessel: schluesselVon(f.id, f.name), mitarbeiterId: f.id, name: f.name, letzte: null, stufe: 'fehlt', tage: null, anzahl: 0 }); }
  const sortiert = [...kontrollen].sort((a, b) => (b.geprueft_am + (b.id ?? '')).localeCompare(a.geprueft_am + (a.id ?? '')));
  for (const k of sortiert) {
    const key = schluesselVon(k.mitarbeiter_id ?? null, k.person_name);
    let z = zeilen.get(key);
    if (!z) { z = { schluessel: key, mitarbeiterId: k.mitarbeiter_id ?? null, name: (k.mitarbeiter_id && namen.get(k.mitarbeiter_id)) || k.person_name, letzte: null, stufe: 'fehlt', tage: null, anzahl: 0 }; zeilen.set(key, z); }
    z.anzahl++;
    if (!z.letzte) z.letzte = k;
  }
  for (const z of zeilen.values()) {
    if (!z.letzte) continue;
    const tage = tageZwischen(heute, z.letzte.naechste_am);
    z.tage = tage;
    z.stufe = z.letzte.ergebnis === 'mangel' ? 'mangel' : tage < 0 ? 'ueberfaellig' : tage <= BALD_TAGE ? 'bald' : 'ok';
  }
  const rang: Record<Stufe, number> = { mangel: 0, ueberfaellig: 1, fehlt: 2, bald: 3, ok: 4 };
  return [...zeilen.values()].sort((a, b) => rang[a.stufe] - rang[b.stufe] || a.name.localeCompare(b.name, 'de'));
}

export function stufeText(z: FahrerZeile): string {
  if (z.stufe === 'fehlt') return 'Noch keine Kontrolle';
  if (z.stufe === 'mangel') return 'Mangel festgestellt — nicht fahren lassen, bis geklärt';
  if (z.stufe === 'ueberfaellig') return `Überfällig seit ${-(z.tage ?? 0)} Tag${z.tage === -1 ? '' : 'en'}`;
  if (z.stufe === 'bald') return z.tage === 0 ? 'Heute fällig' : `Fällig in ${z.tage} Tag${z.tage === 1 ? '' : 'en'}`;
  return `Nächste Kontrolle in ${z.tage} Tagen`;
}

export function zaehlen(liste: FahrerZeile[]): Record<Stufe, number> {
  const r: Record<Stufe, number> = { fehlt: 0, mangel: 0, ueberfaellig: 0, bald: 0, ok: 0 };
  for (const z of liste) r[z.stufe]++;
  return r;
}
