// ============================================================================
// ARGONAUT OS · lib/wiederkehr.ts — Wiederkehr-Formeln (Baustein 1)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks. Von Client-Seiten
// (Wartungs-Cockpit) UND Server-Routen (/api/rechnung-aus-wartung) nutzbar.
//
// Aufgabe in Block A: aus einem Wartungsvertrag die Rechnungs-Positionen und
// den Abrechnungs-Schutz (keine Doppel-Abrechnung im selben Intervall) rein
// rechnerisch ableiten. In Block B wird diese Datei um die Cockpit-Kennzahlen
// (MRR ueber alle vier Wiederkehr-Quellen) erweitert.
//
// Zeitzonen-Regel (ARGONAUT): Datum IMMER lokal bilden, NIE toISOString() fuer
// die Datumsbildung — wir arbeiten konsequent auf reinen "YYYY-MM-DD"-Strings.
// ============================================================================

export interface WartungAbrechenbar {
  titel?: string | null;
  kunde_name?: string | null;
  vertragsnummer?: string | null;
  betrag_netto?: number | null;
  mwst_satz?: number | null;
  intervall_monate?: number | null;
  letzte_abrechnung_am?: string | null; // "YYYY-MM-DD"
  status?: string | null;
}

export interface WiederkehrPosition {
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  mwst_satz: number;
}

/** Standard-MwSt, wenn am Vertrag nichts Gueltiges hinterlegt ist. */
const MWST_STD = 19;

/**
 * Monate additionssicher auf ein "YYYY-MM-DD" addieren — Monatsende-sicher.
 * Beispiel: 31.01. + 1 Monat -> 28.02. (nicht 03.03.), weil der Februar
 * keinen 31. hat. Rein rechnerisch, kein UTC-Versatz.
 */
export function datumPlusMonate(iso: string, monate: number): string {
  const teile = (iso || '').slice(0, 10).split('-');
  const j = parseInt(teile[0], 10);
  const m = parseInt(teile[1], 10);
  const t = parseInt(teile[2], 10);
  if (!j || !m || !t) return (iso || '').slice(0, 10);

  const zielMonatIndex = (m - 1) + monate;              // 0-basiert
  const jahr = j + Math.floor(zielMonatIndex / 12);     // Ueberlauf ins Folgejahr
  const monat = ((zielMonatIndex % 12) + 12) % 12;      // 0..11, immer positiv
  const letzterTag = new Date(jahr, monat + 1, 0).getDate(); // letzter Tag des Zielmonats
  const tag = Math.min(t, letzterTag);

  const mm = String(monat + 1).padStart(2, '0');
  const tt = String(tag).padStart(2, '0');
  return `${jahr}-${mm}-${tt}`;
}

/** Ist der Vertrag grundsaetzlich abrechenbar (aktiv + positiver Betrag)? */
export function istAbrechenbar(v: WartungAbrechenbar): boolean {
  const aktiv = !v.status || v.status === 'aktiv';
  return aktiv && (Number(v.betrag_netto) || 0) > 0;
}

/**
 * Die Rechnungs-Position(en) fuer einen Wartungsvertrag. Aktuell genau eine
 * Pauschal-Position aus betrag_netto + mwst_satz. Gibt [] zurueck, wenn kein
 * abrechenbarer Betrag hinterlegt ist.
 */
export function wartungPositionen(v: WartungAbrechenbar): WiederkehrPosition[] {
  const betrag = Number(v.betrag_netto) || 0;
  if (betrag <= 0) return [];

  const satzRoh = Number(v.mwst_satz);
  const satz = Number.isFinite(satzRoh) && satzRoh >= 0 ? satzRoh : MWST_STD;

  const titel = (v.titel && v.titel.trim()) || 'Wartung';
  const bezeichnung =
    'Wartung: ' + titel + (v.vertragsnummer ? ` (Nr. ${v.vertragsnummer})` : '');

  return [{ bezeichnung, menge: 1, einheit: 'Pauschal', einzelpreis: betrag, mwst_satz: satz }];
}

export interface AbrechnungsPruefung {
  darf: boolean;
  grund: string;
  sperrBis?: string; // "YYYY-MM-DD", ab wann wieder abgerechnet werden darf
}

/**
 * Doppel-Abrechnungs-Schutz: innerhalb EINES Intervalls ab der letzten
 * Abrechnung wird nicht erneut abgerechnet. Reiner Hinweis — die Route kann
 * bewusst ueberstimmen; die UI warnt. So kann man einen Vertrag nicht aus
 * Versehen zweimal im selben Monat/Jahr fakturieren.
 */
export function darfAbrechnen(v: WartungAbrechenbar, heuteIso: string): AbrechnungsPruefung {
  const aktiv = !v.status || v.status === 'aktiv';
  if (!aktiv) return { darf: false, grund: 'Vertrag ist nicht aktiv.' };
  if ((Number(v.betrag_netto) || 0) <= 0) return { darf: false, grund: 'Kein Betrag hinterlegt.' };

  const letzte = v.letzte_abrechnung_am ? v.letzte_abrechnung_am.slice(0, 10) : null;
  if (!letzte) return { darf: true, grund: 'Noch nie abgerechnet.' };

  const intervall = Number(v.intervall_monate) > 0 ? Number(v.intervall_monate) : 12;
  const sperrBis = datumPlusMonate(letzte, intervall);

  if (heuteIso.slice(0, 10) < sperrBis) {
    return { darf: false, grund: `Bereits abgerechnet — naechste Abrechnung ab ${sperrBis}.`, sperrBis };
  }
  return { darf: true, grund: 'Faellig zur Abrechnung.', sperrBis };
}

/** Netto-Summe der Positionen (reine Rechnung, ohne Rundungslogik der Route). */
export function positionenNetto(pos: WiederkehrPosition[]): number {
  return pos.reduce((s, p) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0), 0);
}
