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

/** Wiederkehr-Cockpit: MRR, fällige/bald fällige Wiederkehr, laufende Ausgaben. */
export function augeWiederkehr(d: {
  mrr: number;
  faellig: number;
  bald: number;
  ausgaben: number;
  aktiveEinnahmen: number;
}): AugeErgebnis {
  const punkte: string[] = [];
  if (d.mrr > 0) punkte.push(`${eur(d.mrr)} wiederkehrender Umsatz pro Monat (MRR) aus ${d.aktiveEinnahmen} aktiven Quelle${d.aktiveEinnahmen === 1 ? '' : 'n'}.`);
  if (d.ausgaben > 0) punkte.push(`${eur(d.ausgaben)} laufende Vertragskosten pro Monat stehen dem gegenüber.`);

  if (d.faellig > 0) {
    return {
      klartext: `${d.faellig} Wiederkehr${d.faellig === 1 ? '' : 'en'} ${d.faellig === 1 ? 'ist' : 'sind'} jetzt fällig — daraus solltest du zeitnah Rechnungen erzeugen, bevor Umsatz liegen bleibt.`,
      punkte: [...punkte, ...(d.bald > 0 ? [`${d.bald} weitere werden in den nächsten 14 Tagen fällig.`] : [])],
      stimmung: 'achtung',
    };
  }
  if (d.bald > 0) {
    return {
      klartext: `Nichts überfällig, aber ${d.bald} Wiederkehr${d.bald === 1 ? '' : 'en'} ${d.bald === 1 ? 'wird' : 'werden'} in den nächsten 14 Tagen fällig — plan sie rechtzeitig ein.`,
      punkte, stimmung: 'neutral',
    };
  }
  if (d.aktiveEinnahmen === 0) {
    return { klartext: 'Noch keine wiederkehrenden Einnahmen erfasst — Wartungsverträge, Abos oder Retainer bringen planbaren Monatsumsatz.', punkte, stimmung: 'neutral' };
  }
  return { klartext: `Alles im Takt — ${eur(d.mrr)} planbarer Monatsumsatz, nichts überfällig.`, punkte, stimmung: 'gut' };
}

/** Objekt-/Asset-Register: fällige Kontrollen + Zustand (kritisch/beobachten). */
export function augeObjekte(d: {
  gesamt: number; faellig: number; bald: number; kritisch: number; beobachten: number;
}): AugeErgebnis {
  if (d.gesamt === 0) return { klartext: 'Noch keine Objekte erfasst — leg dein Register an, dann behältst du Kontrollen und Zustand automatisch im Blick.', punkte: [], stimmung: 'neutral' };
  const punkte: string[] = [];
  if (d.kritisch > 0) punkte.push(`${d.kritisch} Objekt(e) im Zustand „kritisch" — instand setzen oder ersetzen.`);
  if (d.beobachten > 0) punkte.push(`${d.beobachten} Objekt(e) unter Beobachtung.`);
  if (d.faellig > 0) {
    return {
      klartext: `${d.faellig} Kontrolle${d.faellig === 1 ? '' : 'n'} überfällig — die zuerst, sonst drohen Ausfall oder Haftung.`,
      punkte: [...punkte, ...(d.bald > 0 ? [`${d.bald} weitere in den nächsten 30 Tagen fällig.`] : [])],
      stimmung: 'achtung',
    };
  }
  if (d.kritisch > 0) return { klartext: `Kontrollen im Plan, aber ${d.kritisch} Objekt(e) im Zustand „kritisch" — hier zuerst ran.`, punkte, stimmung: 'achtung' };
  if (d.bald > 0) return { klartext: `Nichts überfällig, aber ${d.bald} Kontrolle${d.bald === 1 ? '' : 'n'} in den nächsten 30 Tagen fällig — einplanen.`, punkte, stimmung: 'neutral' };
  return { klartext: `${d.gesamt} Objekt(e) im Register — Kontrollen im Plan, Zustand unauffällig.`, punkte, stimmung: 'gut' };
}

/** Aufwand-Cockpit: offener abrechenbarer Aufwand (Projekte + Objektzeiten). */
export function augeAufwand(d: { betragOffen: number; anzahlOffen: number; stundenOffen: number; betragAbg: number }): AugeErgebnis {
  if (d.anzahlOffen === 0 && d.betragAbg === 0) {
    return { klartext: 'Noch kein abrechenbarer Aufwand erfasst — buch Zeiten auf Projekte oder Objekte, dann siehst du hier, was zu fakturieren ist.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [];
  if (d.betragAbg > 0) punkte.push(`${eur(d.betragAbg)} sind bereits abgerechnet.`);
  if (d.betragOffen > 0) {
    return {
      klartext: `${eur(d.betragOffen)} abrechenbarer Aufwand ist noch offen (${d.anzahlOffen} Posten) — hier wartet bereits verdientes Geld auf die Rechnung.`,
      punkte, stimmung: 'achtung',
    };
  }
  return { klartext: 'Kein offener Aufwand — alles fakturiert. Sauber.', punkte, stimmung: 'gut' };
}

/** Rezeptur: Wareneinsatz, Kosten je Portion, fairer Verkaufspreis (Food-Cost). */
export function augeRezeptur(d: { we: number; kostenPortion: number | null; foodcostZiel: number | null; vk: number | null; hatZutaten: boolean }): AugeErgebnis {
  if (!d.hatZutaten || d.we <= 0) {
    return { klartext: 'Erfasse Zutaten mit Preisen — dann rechne ich dir Wareneinsatz, Kosten je Portion und einen fairen Verkaufspreis aus.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [`Wareneinsatz gesamt: ${eur(d.we)}.`];
  if (d.kostenPortion != null) punkte.push(`Kosten je Portion: ${eur(d.kostenPortion)}.`);
  if (d.vk != null && d.foodcostZiel != null) {
    return { klartext: `Für ${d.foodcostZiel}% Food-Cost solltest du je Portion mindestens ${eur(d.vk)} netto verlangen.`, punkte, stimmung: 'gut' };
  }
  return { klartext: 'Wareneinsatz steht — hinterlege Portionen + Ziel-Food-Cost, dann bekommst du einen Verkaufspreis-Vorschlag.', punkte, stimmung: 'neutral' };
}

/** Chargen/HACCP: abgelaufene/bald ablaufende Chargen, gesperrte, fällige Kontrollen. */
export function augeHaccp(d: { abgelaufen: number; bald: number; gesperrt: number; kontrollenFaellig: number }): AugeErgebnis {
  const punkte: string[] = [];
  if (d.gesperrt > 0) punkte.push(`${d.gesperrt} Charge(n) gesperrt.`);
  if (d.abgelaufen > 0 || d.kontrollenFaellig > 0) {
    const teile: string[] = [];
    if (d.abgelaufen > 0) teile.push(`${d.abgelaufen} Charge(n) über MHD`);
    if (d.kontrollenFaellig > 0) teile.push(`${d.kontrollenFaellig} HACCP-Kontrolle(n) fällig`);
    return {
      klartext: `${teile.join(' und ')} — jetzt handeln, bevor es teuer oder unsicher wird.`,
      punkte: [...punkte, ...(d.bald > 0 ? [`${d.bald} Charge(n) laufen in Kürze ab.`] : [])],
      stimmung: 'achtung',
    };
  }
  if (d.bald > 0) return { klartext: `Nichts überfällig, aber ${d.bald} Charge(n) laufen bald ab — einplanen oder verbrauchen.`, punkte, stimmung: 'neutral' };
  return { klartext: 'Chargen frisch, Kontrollen im Plan — sauber.', punkte, stimmung: 'gut' };
}

/** Fördermittel: bewilligte Summe, offene Antrags-/Nachweisfristen, offene Nachweise. */
export function augeFoerder(d: { bewilligt: number; summeBewilligt: number; fristenOffen: number; nachweiseOffen: number }): AugeErgebnis {
  const punkte: string[] = [];
  if (d.bewilligt > 0) punkte.push(`${d.bewilligt} bewilligte(s) Vorhaben (${eur(d.summeBewilligt)} Fördersumme).`);
  if (d.fristenOffen > 0) {
    return {
      klartext: `${d.fristenOffen} Frist(en) laufen ab oder sind überfällig — Antrag oder Verwendungsnachweis nicht verpassen, sonst droht Rückforderung.`,
      punkte: [...punkte, ...(d.nachweiseOffen > 0 ? [`${d.nachweiseOffen} Verwendungsnachweis(e) noch offen.`] : [])],
      stimmung: 'achtung',
    };
  }
  if (d.nachweiseOffen > 0) return { klartext: `Keine Frist akut, aber ${d.nachweiseOffen} Verwendungsnachweis(e) noch offen — rechtzeitig einreichen.`, punkte, stimmung: 'neutral' };
  if (d.bewilligt > 0) return { klartext: `${d.bewilligt} bewilligte(s) Vorhaben, alle Nachweise erbracht — sauber.`, punkte, stimmung: 'gut' };
  return { klartext: 'Noch keine bewilligten Vorhaben — verfolge oben passende Programme und setz dir die Fristen.', punkte, stimmung: 'neutral' };
}

/** Verleih: ausgegebene/reservierte Gegenstände + überfällige Rückgaben. */
export function augeVerleih(d: { ausgegeben: number; reserviert: number; ueberfaellig: number }): AugeErgebnis {
  if (d.ausgegeben === 0 && d.reserviert === 0) {
    return { klartext: 'Aktuell ist nichts verliehen — leg Mietgegenstände an und erfasse die erste Ausleihe.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [];
  if (d.reserviert > 0) punkte.push(`${d.reserviert} Reservierung(en) offen.`);
  if (d.ueberfaellig > 0) {
    return {
      klartext: `${d.ueberfaellig} Ausleihe(n) überfällig — Rückgabe anmahnen, sonst blockieren die Geräte und Umsatz geht verloren.`,
      punkte: [`${d.ausgegeben} aktuell ausgegeben.`, ...punkte],
      stimmung: 'achtung',
    };
  }
  return { klartext: `${d.ausgegeben} Gegenstand/Gegenstände ausgegeben, alles im Zeitplan.`, punkte, stimmung: 'gut' };
}

/** Belegung: Auslastung, An-/Abreisen heute und offene Reservierungen. */
export function augeBelegung(d: { aktiveEinheiten: number; belegtJetzt: number; freiJetzt: number; anreisenHeute: number; abreisenHeute: number; reservierungenOffen: number }): AugeErgebnis {
  if (d.aktiveEinheiten === 0) {
    return { klartext: 'Noch keine Einheiten — leg deine erste buchbare Einheit an (Ferienwohnung, Stellplatz, Halle …) und erfasse die erste Belegung.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [`${d.belegtJetzt} von ${d.aktiveEinheiten} Einheiten aktuell belegt.`];
  if (d.reservierungenOffen > 0) punkte.push(`${d.reservierungenOffen} Reservierung(en) noch unbestätigt.`);
  if (d.anreisenHeute > 0 || d.abreisenHeute > 0) {
    return {
      klartext: `Heute stehen ${d.anreisenHeute} An- und ${d.abreisenHeute} Abreise(n) an — Check-in/Check-out vorbereiten.`,
      punkte,
      stimmung: 'achtung',
    };
  }
  return { klartext: `${d.belegtJetzt} von ${d.aktiveEinheiten} Einheiten belegt, ${d.freiJetzt} frei — alles im Griff.`, punkte, stimmung: 'gut' };
}

/** Schlagkartei: Nachweispflicht Düngung/Pflanzenschutz + fehlende Bedarfsermittlung. */
export function augeSchlagkartei(d: { anzahlSchlaege: number; flaecheGesamt: number; duengungenJahr: number; psmJahr: number; spaetDoku: number; schlaegeOhneBedarf: number }): AugeErgebnis {
  if (d.anzahlSchlaege === 0) {
    return { klartext: 'Noch keine Schläge — leg dein erstes Feldstück an und dokumentiere Düngung und Pflanzenschutz gesetzeskonform.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [`${d.anzahlSchlaege} Schläge · ${d.flaecheGesamt} ha · ${d.duengungenJahr} Düngungen / ${d.psmJahr} PSM-Anwendungen dieses Jahr.`];
  if (d.spaetDoku > 0 || d.schlaegeOhneBedarf > 0) {
    const probleme: string[] = [];
    if (d.schlaegeOhneBedarf > 0) probleme.push(`${d.schlaegeOhneBedarf} gedüngte(r) Schlag/Schläge ohne Düngebedarfsermittlung`);
    if (d.spaetDoku > 0) probleme.push(`${d.spaetDoku} Eintrag/Einträge außerhalb der Doku-Frist`);
    return {
      klartext: `Achtung bei der Nachweispflicht: ${probleme.join(' und ')} — bei einer Kontrolle drohen sonst Beanstandungen.`,
      punkte,
      stimmung: 'achtung',
    };
  }
  return { klartext: `Dokumentation vollständig und fristgerecht — ${d.flaecheGesamt} ha sauber erfasst.`, punkte, stimmung: 'gut' };
}

/** Tierbestand: offene und überfällige HIT-Meldungen. */
export function augeTierbestand(d: { anzahlGruppen: number; tiereGesamt: number; offeneMeldungen: number; ueberfaellig: number }): AugeErgebnis {
  if (d.anzahlGruppen === 0) {
    return { klartext: 'Noch kein Bestand — leg deine erste Tiergruppe mit VVVO-Nummer an und dokumentiere Zu- und Abgänge.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [`${d.tiereGesamt} Tiere in ${d.anzahlGruppen} Gruppe(n).`];
  if (d.ueberfaellig > 0) {
    return {
      klartext: `${d.ueberfaellig} HIT-Meldung(en) überfällig (älter als die 7-Tage-Frist) — umgehend an HI-Tier melden, sonst drohen Sanktionen.`,
      punkte: [...punkte, `${d.offeneMeldungen} offene Meldung(en) gesamt.`],
      stimmung: 'achtung',
    };
  }
  if (d.offeneMeldungen > 0) {
    return { klartext: `${d.offeneMeldungen} Bewegung(en) noch nicht an HIT gemeldet — innerhalb der 7-Tage-Frist erledigen.`, punkte, stimmung: 'achtung' };
  }
  return { klartext: 'Alle Bewegungen gemeldet — Bestand HIT-konform.', punkte, stimmung: 'gut' };
}

/** Kanzlei: offene, überfällige und in der Vorfrist stehende Fristen. */
export function augeKanzlei(d: { akten: number; offen: number; ueberfaellig: number; vorfrist: number }): AugeErgebnis {
  if (d.akten === 0) {
    return { klartext: 'Noch keine Akten — leg dein erstes Mandat an und trag die Fristen mit Vorfrist ein.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [`${d.akten} Akte(n) · ${d.offen} offene Frist(en).`];
  if (d.ueberfaellig > 0) {
    return { klartext: `${d.ueberfaellig} Frist(en) ÜBERFÄLLIG — sofort prüfen, ein Fristversäumnis kann Haftung auslösen.`, punkte, stimmung: 'achtung' };
  }
  if (d.vorfrist > 0) {
    return { klartext: `${d.vorfrist} Frist(en) in der Vorfrist — jetzt bearbeiten, damit es nicht knapp wird.`, punkte, stimmung: 'achtung' };
  }
  return { klartext: 'Alle Fristen im grünen Bereich — keine Vorfrist erreicht.', punkte, stimmung: 'gut' };
}

/** Zuschnitt: Anzahl Projekte und Teilepositionen. */
export function augeZuschnitt(d: { projekte: number; teile: number }): AugeErgebnis {
  if (d.projekte === 0) {
    return { klartext: 'Noch keine Zuschnitt-Projekte — leg eins an, trag die Teile ein, und die Optimierung zeigt dir Stangenbedarf und Verschnitt in Prozent.', punkte: [], stimmung: 'neutral' };
  }
  return { klartext: `${d.projekte} Projekt(e) · ${d.teile} Teileposition(en) — die Optimierung minimiert den Verschnitt automatisch.`, punkte: [], stimmung: 'gut' };
}

/** Spenden: Summe des Jahres und noch offene Zuwendungsbestätigungen. */
export function augeSpenden(d: { anzahlJahr: number; summeJahr: number; offeneBestaetigungen: number }): AugeErgebnis {
  if (d.anzahlJahr === 0 && d.offeneBestaetigungen === 0) {
    return { klartext: 'Noch keine Zuwendungen erfasst — trag die erste Spende ein und hinterlege einmal die Vereinsdaten für die Bestätigungen.', punkte: [], stimmung: 'neutral' };
  }
  const summe = d.summeJahr.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const punkte: string[] = [`${d.anzahlJahr} Zuwendung(en) dieses Jahr · ${summe}.`];
  if (d.offeneBestaetigungen > 0) {
    return { klartext: `${d.offeneBestaetigungen} Zuwendung(en) ohne erstellte Bestätigung — ab 300 € ist die Zuwendungsbestätigung nach amtlichem Muster nötig.`, punkte, stimmung: 'achtung' };
  }
  return { klartext: 'Alle erfassten Zuwendungen sind bestätigt.', punkte, stimmung: 'gut' };
}

/** Tour/Dispo: offene Stopps und Zustellfortschritt. */
export function augeTour(d: { touren: number; offeneTouren: number; offeneStopps: number; zugestelltGesamt: number }): AugeErgebnis {
  if (d.touren === 0) {
    return { klartext: 'Noch keine Touren — leg eine Tour an, füge die Stopps hinzu und quittiere jede Zustellung mit Unterschrift.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [`${d.offeneTouren} offene Tour(en) · ${d.zugestelltGesamt} zugestellt gesamt.`];
  if (d.offeneStopps > 0) {
    return { klartext: `${d.offeneStopps} Stopp(s) noch offen — abarbeiten und den Abliefernachweis je Stopp erfassen.`, punkte, stimmung: 'achtung' };
  }
  return { klartext: 'Alle Stopps bearbeitet — Touren sauber quittiert.', punkte, stimmung: 'gut' };
}

/** Gutachten: Entwürfe vs. fertige Gutachten. */
export function augeGutachten(d: { gesamt: number; entwurf: number; fertig: number }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch keine Gutachten — leg dein erstes an, gliedere es in Befund und Bewertung und rechne das Honorar nach JVEG.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [`${d.fertig} fertig · ${d.entwurf} in Arbeit.`];
  if (d.entwurf > 0) {
    return { klartext: `${d.entwurf} Gutachten noch im Entwurf — fertigstellen und als PDF ausgeben.`, punkte, stimmung: 'achtung' };
  }
  return { klartext: `Alle ${d.gesamt} Gutachten fertiggestellt.`, punkte, stimmung: 'gut' };
}

/** Hilfsmittel-Versorgung: offene Fälle und Genehmigungsstatus. */
export function augeHilfsmittel(d: { gesamt: number; offen: number; wartetGenehmigung: number; abgerechnet: number }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch keine Versorgungen — erfasse die erste Verordnung und die Hilfsmittel-Positionen mit HMV-Nummer.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [`${d.offen} offene Versorgung(en) · ${d.abgerechnet} abgerechnet.`];
  if (d.wartetGenehmigung > 0) {
    return { klartext: `${d.wartetGenehmigung} Kostenvoranschlag/-schläge warten auf Genehmigung der Krankenkasse — dranbleiben.`, punkte, stimmung: 'achtung' };
  }
  return { klartext: `${d.offen} Versorgung(en) in Bearbeitung — alles im Fluss.`, punkte, stimmung: 'gut' };
}

/** Kurse: Teilnehmer, freie Plätze und Warteliste über alle Kurse. */
export function augeKurse(d: { kurse: number; teilnehmer: number; warteliste: number; freiePlaetze: number }): AugeErgebnis {
  if (d.kurse === 0) {
    return { klartext: 'Noch keine Kurse — leg deinen ersten Kurs an und trag die Teilnehmer ein.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [`${d.teilnehmer} Teilnehmer in ${d.kurse} Kurs(en).`];
  if (d.warteliste > 0) {
    return {
      klartext: `${d.warteliste} Interessent(en) auf der Warteliste — prüfe, ob du nachrücken lassen oder einen Zusatztermin öffnen kannst.`,
      punkte: [...punkte, `${d.freiePlaetze} Platz/Plätze aktuell frei.`],
      stimmung: 'achtung',
    };
  }
  return { klartext: `${d.teilnehmer} Teilnehmer, ${d.freiePlaetze} Platz/Plätze frei — alles im grünen Bereich.`, punkte, stimmung: 'gut' };
}

/** Prüfprotokolle: Fälligkeit + Mängel über alle dokumentierten Prüfungen. */
export function augePruef(d: { gesamt: number; maengel: number; ueberfaellig: number; bald: number }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch keine Prüfungen dokumentiert — leg das erste Prüfprotokoll an.', punkte: [], stimmung: 'neutral' };
  }
  if (d.ueberfaellig > 0) {
    const punkte: string[] = [];
    if (d.maengel > 0) punkte.push(`${d.maengel} Protokoll(e) mit Mängeln.`);
    if (d.bald > 0) punkte.push(`${d.bald} weitere werden bald fällig.`);
    return { klartext: `${d.ueberfaellig} Prüfung(en) überfällig — Termin einplanen, sonst drohen Haftungs- und Versicherungsrisiken.`, punkte, stimmung: 'achtung' };
  }
  if (d.maengel > 0) {
    return { klartext: `${d.maengel} Prüfung(en) mit festgestellten Mängeln — Nachbesserung veranlassen und nachprüfen.`, punkte: d.bald > 0 ? [`${d.bald} werden bald fällig.`] : [], stimmung: 'achtung' };
  }
  if (d.bald > 0) {
    return { klartext: `Nichts überfällig, aber ${d.bald} Prüfung(en) werden in den nächsten 30 Tagen fällig.`, punkte: [], stimmung: 'neutral' };
  }
  return { klartext: 'Alle dokumentierten Prüfungen sind gültig und ohne offene Mängel.', punkte: [], stimmung: 'gut' };
}

/** Generisch: Bestände/Fristen mit Ampel-Zählern (überfällig/bald/ok). */
export function augeAmpel(bezeichnung: string, d: { rot: number; gelb: number }): AugeErgebnis {
  if (d.rot > 0) return { klartext: `${d.rot} ${bezeichnung} überfällig — die brauchen jetzt Aufmerksamkeit.`, punkte: d.gelb > 0 ? [`${d.gelb} weitere werden bald fällig`] : [], stimmung: 'achtung' };
  if (d.gelb > 0) return { klartext: `Nichts überfällig, aber ${d.gelb} ${bezeichnung} werden bald fällig.`, punkte: [], stimmung: 'neutral' };
  return { klartext: `Alles im grünen Bereich — nichts ${bezeichnung} überfällig.`, punkte: [], stimmung: 'gut' };
}

/** Reservierung & Platz: Verwertungsfristen, Abholungen, No-Shows, Tische heute. */
export function augeReservierung(k: {
  aktivePlaetze: number;
  tischHeute: number;
  noShowGesamt: number;
  eingelagertAktiv: number;
  verwertungFaellig: number;
  vorbestellungOffen: number;
  abholUeberfaellig: number;
}): AugeErgebnis {
  const punkte: string[] = [];
  if (k.verwertungFaellig > 0) {
    if (k.abholUeberfaellig > 0) punkte.push(`${k.abholUeberfaellig} Vorbestellung(en) zur Abholung überfällig.`);
    return {
      klartext: `${k.verwertungFaellig} Einlagerung(en) über die Laufzeit + 14-Tage-Frist hinaus — erst nach schriftlicher Ankündigung darfst du verwerten. Kunden anschreiben.`,
      punkte, stimmung: 'achtung',
    };
  }
  if (k.abholUeberfaellig > 0) {
    return {
      klartext: `${k.abholUeberfaellig} Vorbestellung(en) sind zur Abholung überfällig — kurz beim Kunden nachfassen.`,
      punkte: k.eingelagertAktiv > 0 ? [`${k.eingelagertAktiv} laufende Einlagerung(en).`] : [],
      stimmung: 'achtung',
    };
  }
  if (k.tischHeute === 0 && k.eingelagertAktiv === 0 && k.vorbestellungOffen === 0) {
    return { klartext: 'Noch nichts offen — leg deinen ersten Vorgang an (Tischreservierung, Einlagerung oder Vorbestellung).', punkte: [], stimmung: 'neutral' };
  }
  if (k.tischHeute > 0) punkte.push(`${k.tischHeute} Tischreservierung(en) für heute.`);
  if (k.eingelagertAktiv > 0) punkte.push(`${k.eingelagertAktiv} laufende Einlagerung(en).`);
  if (k.vorbestellungOffen > 0) punkte.push(`${k.vorbestellungOffen} offene Vorbestellung(en).`);
  if (k.noShowGesamt > 0) punkte.push(`${k.noShowGesamt} No-Show(s) insgesamt erfasst.`);
  return { klartext: 'Alles im Griff — nichts ist überfällig.', punkte, stimmung: 'gut' };
}

/** Gutscheine & Pakete: offener Restwert (Verbindlichkeit), Verfall, Karten. */
export function augeGutscheine(k: {
  aktive: number;
  offenerRestwert: number;
  kartenOffen: number;
  baldVerfallend: number;
  verfallen: number;
  eingeloestBetrag: number;
}): AugeErgebnis {
  if (k.aktive === 0 && k.kartenOffen === 0) {
    return { klartext: 'Noch keine aktiven Gutscheine — stell deinen ersten aus (Wertgutschein, Mehrfachkarte oder Leistungsgutschein).', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [];
  if (k.offenerRestwert > 0) punkte.push(`${eur(k.offenerRestwert)} offener Restwert — als Verbindlichkeit im Blick behalten.`);
  if (k.kartenOffen > 0) punkte.push(`${k.kartenOffen} Mehrfachkarte(n) mit offenen Nutzungen.`);
  if (k.verfallen > 0) punkte.push(`${k.verfallen} verfallen (Anspruch erloschen).`);
  if (k.baldVerfallend > 0) {
    return {
      klartext: `${k.baldVerfallend} Gutschein(e) laufen in den nächsten 90 Tagen ab — eine kurze Erinnerung an die Kunden erhöht die Einlösung (und den Zusatzumsatz).`,
      punkte, stimmung: 'achtung',
    };
  }
  return { klartext: `${k.aktive} aktive Gutschein(e) im Umlauf${k.offenerRestwert > 0 ? `, ${eur(k.offenerRestwert)} offener Restwert` : ''}.`, punkte, stimmung: 'gut' };
}

/** Erinnerungen: was jetzt fällig ist + No-Show-Prävention. */
export function augeErinnerungen(k: {
  offen: number;
  faelligJetzt: number;
  heute: number;
  dieseWoche: number;
  erledigt: number;
  entfallen: number;
}): AugeErgebnis {
  if (k.faelligJetzt > 0) {
    const punkte: string[] = [];
    if (k.heute > 0) punkte.push(`${k.heute} weitere heute fällig.`);
    if (k.dieseWoche > 0) punkte.push(`${k.dieseWoche} diese Woche.`);
    return {
      klartext: `${k.faelligJetzt} Erinnerung(en) sind jetzt fällig — kurz abarbeiten hält die No-Show-Quote niedrig.`,
      punkte, stimmung: 'achtung',
    };
  }
  if (k.offen === 0) {
    return { klartext: 'Keine offenen Erinnerungen — alles erledigt.', punkte: [], stimmung: 'gut' };
  }
  if (k.heute > 0) {
    return { klartext: `${k.heute} Erinnerung(en) heute fällig, aber noch nichts überfällig.`, punkte: k.dieseWoche > 0 ? [`${k.dieseWoche} weitere diese Woche.`] : [], stimmung: 'neutral' };
  }
  return { klartext: `${k.offen} Erinnerung(en) geplant, nichts jetzt fällig.`, punkte: k.dieseWoche > 0 ? [`${k.dieseWoche} diese Woche fällig.`] : [], stimmung: 'gut' };
}
