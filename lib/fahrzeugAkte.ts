// ============================================================================
// ARGONAUT OS · lib/fahrzeugAkte.ts   (Punkt 3.7)
//
// Die reine Logik hinter der schreibfaehigen Fahrzeugakte. Bewusst OHNE
// Datenbank und ohne React: so laesst sich jede Regel mit `node --test`
// nachrechnen, bevor sie irgendwo eine Zeile veraendert.
//
// Zwei Dinge stehen hier:
//   1) Stammdaten pruefen und in eine Update-Nutzlast giessen.
//   2) Den Halterwechsel PLANEN — also ausrechnen, was passieren muesste,
//      ohne es zu tun. Die Seite fuehrt den Plan danach aus.
//
// WARUM EIN PLAN STATT EINES DIREKTEN SCHREIBENS:
// Ein Halterwechsel beruehrt drei Stellen (alten Eintrag schliessen, neuen
// anlegen, Fahrzeug aktualisieren). Wer das verteilt im Klickpfad macht,
// bekommt Zwischenzustaende. Hier entsteht erst der vollstaendige Plan, und
// die Seite bricht ab, sobald ein Schritt scheitert.
//
// NICHTS HIER LOESCHT ETWAS. Der alte Halter-Eintrag wird mit `bis_datum`
// abgeschlossen, nie entfernt — die Akte soll die Geschichte behalten.
// ============================================================================

export type StammEingabe = {
  kennzeichen: string;
  hersteller: string;
  modell: string;
  erstzulassung: string;
  farbe: string;
  kraftstoff: string;
  naechste_hu: string;
  notiz: string;
};

export type HalterEintrag = {
  id: string;
  halter_name: string | null;
  von_datum: string | null;
  bis_datum: string | null;
};

export type HalterPlan = {
  fehler: string | null;
  /** Der bisher offene Eintrag, der abgeschlossen wird — oder null. */
  schliessen: { id: string; bis_datum: string } | null;
  /** Der neue Eintrag — oder null, wenn der Plan nicht gilt. */
  neu: { halter_name: string; von_datum: string } | null;
};

/** Leer ist erlaubt. Sonst muss es ein echtes Datum in der Form JJJJ-MM-TT sein. */
export function istDatum(wert: string): boolean {
  const s = (wert || '').trim();
  if (!s) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  // Fängt den 31.02. ab: das Datum muss sich unverändert zurückschreiben lassen.
  const zurueck = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return zurueck === s;
}

function leerZuNull(wert: string): string | null {
  const s = (wert || '').trim();
  return s === '' ? null : s;
}

/**
 * Prueft die Stammdaten-Eingabe. Gibt eine Liste von Klartext-Meldungen
 * zurueck — leer heisst: in Ordnung. Die FIN steht bewusst NICHT darin:
 * sie ist der Schluessel der Akte und wird hier nie geaendert.
 */
export function pruefeStammdaten(e: StammEingabe, heuteIso?: string): string[] {
  const f: string[] = [];
  const heute = (heuteIso || new Date().toISOString().slice(0, 10));

  if (!istDatum(e.erstzulassung)) f.push('Erstzulassung: bitte ein Datum in der Form JJJJ-MM-TT.');
  if (!istDatum(e.naechste_hu)) f.push('Nächste HU: bitte ein Datum in der Form JJJJ-MM-TT.');

  const ez = (e.erstzulassung || '').trim();
  const hu = (e.naechste_hu || '').trim();
  if (ez && istDatum(ez) && ez > heute) f.push('Die Erstzulassung kann nicht in der Zukunft liegen.');
  if (ez && hu && istDatum(ez) && istDatum(hu) && hu < ez) {
    f.push('Die nächste HU kann nicht vor der Erstzulassung liegen.');
  }

  if ((e.kennzeichen || '').trim().length > 20) f.push('Kennzeichen: höchstens 20 Zeichen.');
  if ((e.hersteller || '').trim().length > 80) f.push('Hersteller: höchstens 80 Zeichen.');
  if ((e.modell || '').trim().length > 80) f.push('Modell: höchstens 80 Zeichen.');
  if ((e.farbe || '').trim().length > 40) f.push('Farbe: höchstens 40 Zeichen.');
  if ((e.kraftstoff || '').trim().length > 40) f.push('Kraftstoff: höchstens 40 Zeichen.');

  return f;
}

/**
 * Baut die Update-Nutzlast. Leere Felder werden zu null — nicht zu leeren
 * Zeichenketten, damit die Anzeige weiter sauber „—" schreibt.
 * `aktualisiert_am` wird immer mitgesetzt.
 */
export function stammdatenNutzlast(e: StammEingabe, jetztIso?: string): Record<string, string | null> {
  return {
    kennzeichen: leerZuNull(e.kennzeichen),
    hersteller: leerZuNull(e.hersteller),
    modell: leerZuNull(e.modell),
    erstzulassung: leerZuNull(e.erstzulassung),
    farbe: leerZuNull(e.farbe),
    kraftstoff: leerZuNull(e.kraftstoff),
    naechste_hu: leerZuNull(e.naechste_hu),
    notiz: leerZuNull(e.notiz),
    aktualisiert_am: jetztIso || new Date().toISOString(),
  };
}

/** Der offene Halter-Eintrag ist der ohne bis_datum. Es sollte genau einer sein. */
export function offenerHalter(log: HalterEintrag[]): HalterEintrag | null {
  for (const h of log) if (!h.bis_datum) return h;
  return null;
}

/**
 * Rechnet aus, was ein Halterwechsel bedeuten wuerde — ohne etwas zu tun.
 * Schlaegt fehl (und plant NICHTS), wenn:
 *   - kein Name eingetragen ist
 *   - das Datum keines ist
 *   - das Datum vor dem Beginn des aktuellen Halters liegt
 *   - derselbe Halter schon offen eingetragen ist
 */
export function halterWechselPlan(
  log: HalterEintrag[],
  neuerHalter: string,
  abDatum: string,
): HalterPlan {
  const leer: HalterPlan = { fehler: null, schliessen: null, neu: null };
  const name = (neuerHalter || '').trim();
  const ab = (abDatum || '').trim();

  if (!name) return { ...leer, fehler: 'Bitte den Namen des neuen Halters eintragen.' };
  if (name.length > 120) return { ...leer, fehler: 'Halter-Name: höchstens 120 Zeichen.' };
  if (!ab) return { ...leer, fehler: 'Bitte ein Datum eintragen, ab dem der neue Halter gilt.' };
  if (!istDatum(ab)) return { ...leer, fehler: 'Datum: bitte in der Form JJJJ-MM-TT.' };

  const offen = offenerHalter(log);

  if (offen) {
    const bisher = (offen.halter_name || '').trim();
    if (bisher && bisher.toLowerCase() === name.toLowerCase()) {
      return { ...leer, fehler: 'Dieser Halter ist bereits als aktueller Halter eingetragen.' };
    }
    const von = (offen.von_datum || '').trim();
    if (von && istDatum(von) && ab < von) {
      return { ...leer, fehler: `Das Datum liegt vor dem Beginn des aktuellen Halters (${von}).` };
    }
    return { fehler: null, schliessen: { id: offen.id, bis_datum: ab }, neu: { halter_name: name, von_datum: ab } };
  }

  // Noch kein Halter in der Akte — dann wird nur der neue angelegt.
  return { fehler: null, schliessen: null, neu: { halter_name: name, von_datum: ab } };
}
