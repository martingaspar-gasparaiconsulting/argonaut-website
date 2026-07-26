// ============================================================================
// ARGONAUT OS · lib/auge.ts — Regel-Ebene für das KI-Auge (Ebene 1)
//
// Rechnet die "Was heißt das für mich?"-Antwort LOKAL aus strukturierten Zahlen
// (0 €, sofort, nie falsch). Das Ergebnis wird 1:1 in das gewohnte, pulsierende
// Auge gefüttert — nach außen bleibt alles „die KI". Nur wo wirklich frei
// formuliert werden muss, ruft das Modul weiterhin die echte KI-Route.
//
// Rückgabe passt exakt zum KiAuge-Bauteil: { klartext, punkte, stimmung }.
// ============================================================================

import { SCHWELLEN } from './schwellen';

export type Stimmung = 'gut' | 'neutral' | 'achtung';
export type AugeErgebnis = { klartext: string; punkte: string[]; stimmung: Stimmung };

function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

/** Rechnungs-Übersicht: offene/überfällige Forderungen + DSO. */
export function augeRechnungen(d: {
  offenBetrag: number;
  ueberfaelligBetrag: number;
  ueberfaelligAnzahl: number;
  dso: number | null;
  topUeberfaellig?: Array<{ empf: string; tageUeber: number; offenerBetrag: number }>;
}): AugeErgebnis {
  const gesamtOffen = (Number(d.offenBetrag) || 0) + (Number(d.ueberfaelligBetrag) || 0);
  const punkte: string[] = [];
  let stimmung: Stimmung;
  let klartext: string;

  if (d.ueberfaelligBetrag > 0) {
    stimmung = 'achtung';
    klartext = `${eur(d.ueberfaelligBetrag)} sind überfällig (${d.ueberfaelligAnzahl} Rechnung${d.ueberfaelligAnzahl === 1 ? '' : 'en'}) — die solltest du jetzt eintreiben.`;
    (d.topUeberfaellig || []).slice(0, 3).forEach((u) => punkte.push(`${u.empf}: ${eur(u.offenerBetrag)} offen, ${u.tageUeber} Tage über Ziel`));
  } else if (gesamtOffen > 0) {
    stimmung = 'neutral';
    klartext = `${eur(gesamtOffen)} sind offen, aber nichts ist überfällig — alles im Rahmen.`;
  } else {
    stimmung = 'gut';
    klartext = `Keine offenen Forderungen — alles bezahlt. Sauber.`;
  }

  if (d.dso != null) {
    const t = Math.round(d.dso);
    punkte.push(`Kunden zahlen im Schnitt nach ${t} Tagen (DSO)${t > SCHWELLEN.rechnung.dsoWarnTage ? ' — das ist eher lang.' : '.'}`);
  }
  return { klartext, punkte, stimmung };
}

/** „Heute"-Zentrale: gebündelte Fristen (überfällig / diese Woche / später). */
export function augeHeute(d: { ueberfaellig: number; dieseWoche: number; spaeter: number }): AugeErgebnis {
  if (d.ueberfaellig > 0) {
    return {
      klartext: `${d.ueberfaellig} Sache${d.ueberfaellig === 1 ? '' : 'n'} ${d.ueberfaellig === 1 ? 'ist' : 'sind'} überfällig — die zuerst.`,
      punkte: d.dieseWoche > 0 ? [`${d.dieseWoche} weitere${d.dieseWoche === 1 ? 's' : ''} diese Woche fällig`] : [],
      stimmung: 'achtung',
    };
  }
  if (d.dieseWoche > 0) {
    return { klartext: `Nichts überfällig, aber ${d.dieseWoche} Sache${d.dieseWoche === 1 ? '' : 'n'} diese Woche fällig.`, punkte: [], stimmung: 'neutral' };
  }
  return { klartext: `Nichts Dringendes — alles im grünen Bereich.`, punkte: [], stimmung: 'gut' };
}

/** Mahnwesen: überfällige Rechnungen nach Mahn-Stand. */
export function augeMahnwesen(d: { anzahl: number; offenerBetrag: number; nichtGemahnt: number; inMahnung: number }): AugeErgebnis {
  if (d.anzahl === 0) return { klartext: 'Keine überfälligen Rechnungen — alles im Zahlungsziel. Sauber.', punkte: [], stimmung: 'gut' };
  const punkte: string[] = [];
  if (d.nichtGemahnt > 0) punkte.push(`${d.nichtGemahnt} noch nicht gemahnt — hier zuerst die 1. Mahnung raus.`);
  if (d.inMahnung > 0) punkte.push(`${d.inMahnung} bereits in Mahnung — Fristen im Blick behalten.`);
  return {
    klartext: `${eur(d.offenerBetrag)} sind überfällig (${d.anzahl} Rechnung${d.anzahl === 1 ? '' : 'en'}) — die solltest du jetzt eintreiben.`,
    punkte, stimmung: 'achtung',
  };
}

/** Lager/ERP: Artikel unter Mindestbestand. */
export function augeLager(d: { kritisch: number; niedrig: number; gesamt?: number }): AugeErgebnis {
  if (d.kritisch > 0) return { klartext: `${d.kritisch} Artikel unter Mindestbestand — die drohen auszugehen, jetzt nachbestellen.`, punkte: d.niedrig > 0 ? [`${d.niedrig} weitere werden knapp`] : [], stimmung: 'achtung' };
  if (d.niedrig > 0) return { klartext: `Nichts kritisch, aber ${d.niedrig} Artikel werden knapp — bald nachbestellen.`, punkte: [], stimmung: 'neutral' };
  return { klartext: `Alle Bestände im grünen Bereich — nichts droht auszugehen.`, punkte: [], stimmung: 'gut' };
}

/** CRM: Kontakte über ihrem Betreuungs-Takt (Nachfass-Bedarf) + fällige Wiedervorlagen. */
export function augeCrm(d: { ueberfaellig: number; wiedervorlage: number; gesamt: number }): AugeErgebnis {
  if (d.gesamt === 0) return { klartext: 'Noch keine Kontakte erfasst — Zeit, die Pipeline zu füllen.', punkte: [], stimmung: 'neutral' };
  const punkte: string[] = [];
  if (d.wiedervorlage > 0) punkte.push(`${d.wiedervorlage} Wiedervorlage${d.wiedervorlage === 1 ? '' : 'n'} heute oder überfällig`);
  punkte.push(`${d.gesamt} Kontakte gesamt in der Pipeline`);
  if (d.ueberfaellig > 0) return {
    klartext: `${d.ueberfaellig} Kontakt${d.ueberfaellig === 1 ? '' : 'e'} sind über ihrem Betreuungs-Takt — hier lohnt ein Nachfassen, bevor sie einschlafen.`,
    punkte, stimmung: d.ueberfaellig >= 5 ? 'achtung' : 'neutral',
  };
  if (d.wiedervorlage > 0) return { klartext: `${d.wiedervorlage} Wiedervorlage${d.wiedervorlage === 1 ? '' : 'n'} anstehend — sonst ist alles im Takt.`, punkte: [`${d.gesamt} Kontakte gesamt`], stimmung: 'neutral' };
  return { klartext: `Alle Kontakte sind frisch betreut — nichts liegt liegen.`, punkte: [`${d.gesamt} Kontakte gesamt`], stimmung: 'gut' };
}

/** Generisch: Bestände/Fristen mit Ampel-Zählern (überfällig/bald/ok). */
export function augeAmpel(bezeichnung: string, d: { rot: number; gelb: number }): AugeErgebnis {
  if (d.rot > 0) return { klartext: `${d.rot} ${bezeichnung} überfällig — die brauchen jetzt Aufmerksamkeit.`, punkte: d.gelb > 0 ? [`${d.gelb} weitere werden bald fällig`] : [], stimmung: 'achtung' };
  if (d.gelb > 0) return { klartext: `Nichts überfällig, aber ${d.gelb} ${bezeichnung} werden bald fällig.`, punkte: [], stimmung: 'neutral' };
  return { klartext: `Alles im grünen Bereich — nichts ${bezeichnung} überfällig.`, punkte: [], stimmung: 'gut' };
}
