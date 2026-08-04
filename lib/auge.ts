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

/** Varianten & Matrix: fehlende Matrix-Zellen (Lücken) + Varianten unter Mindestbestand. */
export function augeVarianten(d: { luecken: number; unterMindest: number; varianten: number; gruppen: number }): AugeErgebnis {
  if (d.gruppen === 0 && d.varianten === 0) {
    return { klartext: 'Noch keine Varianten-Matrix angelegt — Größen und Farben als Achsen definieren, dann alle Varianten auf einen Schlag erzeugen.', punkte: [], stimmung: 'neutral' };
  }
  if (d.luecken > 0) {
    return {
      klartext: `${d.luecken} Matrix-Kombination${d.luecken === 1 ? '' : 'en'} ${d.luecken === 1 ? 'fehlt' : 'fehlen'} noch — mit „Matrix erzeugen" bekommt jede Größe/Farbe ihre eigene SKU mit Bestand.`,
      punkte: d.unterMindest > 0 ? [`${d.unterMindest} Variante${d.unterMindest === 1 ? '' : 'n'} zusätzlich leer oder unter Mindestbestand`] : [],
      stimmung: 'achtung',
    };
  }
  if (d.unterMindest > 0) {
    return {
      klartext: `${d.unterMindest} Variante${d.unterMindest === 1 ? '' : 'n'} ${d.unterMindest === 1 ? 'ist' : 'sind'} leer oder unter Mindestbestand — hier gezielt nachbestellen.`,
      punkte: [`${d.varianten} Varianten in ${d.gruppen} Matri${d.gruppen === 1 ? 'x' : 'zen'} gepflegt`],
      stimmung: d.unterMindest >= 5 ? 'achtung' : 'neutral',
    };
  }
  return { klartext: `Alle Varianten angelegt und bevorratet — die Matrix ist vollständig.`, punkte: [`${d.varianten} Varianten in ${d.gruppen} Matri${d.gruppen === 1 ? 'x' : 'zen'}`], stimmung: 'gut' };
}

/** Etiketten & LMIV: unvollständige Pflichtangaben (abmahnfähig) + fehlende Nährwerttabellen. */
export function augeEtiketten(d: { unvollstaendig: number; ohneNaehrwert: number; gesamt: number }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch keine Etiketten erfasst — Produkt anlegen, Allergene ankreuzen und Nährwerte je 100 g eintragen, dann das LMIV-Etikett drucken.', punkte: [], stimmung: 'neutral' };
  }
  if (d.unvollstaendig > 0) {
    return {
      klartext: `${d.unvollstaendig} Etikett${d.unvollstaendig === 1 ? '' : 'en'} ${d.unvollstaendig === 1 ? 'ist' : 'sind'} unvollständig — LMIV-Pflichtangaben fehlen, das ist abmahnfähig. Vor dem Verkauf schließen.`,
      punkte: d.ohneNaehrwert > 0 ? [`${d.ohneNaehrwert} davon ohne vollständige Nährwertdeklaration`] : [],
      stimmung: 'achtung',
    };
  }
  return { klartext: `Alle ${d.gesamt} Etiketten sind LMIV-vollständig — Zutaten, Allergene und Nährwerte sauber gepflegt.`, punkte: [], stimmung: 'gut' };
}

/** Chargen & Prüfplan: gesperrte/n.i.O. Chargen (Auslieferstopp), MHD-Ablauf, ungeprüfte Chargen. */
export function augeChargen(d: { gesperrt: number; abgelaufen: number; nio: number; ungeprueft: number; gesamt: number }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch keine Chargen erfasst — Charge/Serie anlegen, Rückverfolgbarkeit (Ein-/Ausgänge) pflegen und den Prüfplan mit Soll/Toleranz abhaken.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [];
  if (d.abgelaufen > 0) punkte.push(`${d.abgelaufen} Charge${d.abgelaufen === 1 ? '' : 'n'} über MHD/Verfall`);
  if (d.ungeprueft > 0) punkte.push(`${d.ungeprueft} Charge${d.ungeprueft === 1 ? '' : 'n'} noch ungeprüft`);
  const sperrig = d.gesperrt + d.nio;
  if (sperrig > 0) {
    return {
      klartext: `${sperrig} Charge${sperrig === 1 ? '' : 'n'} ${sperrig === 1 ? 'ist' : 'sind'} gesperrt oder n.i.O. — nicht ausliefern, bis Freigabe oder Nacharbeit steht.`,
      punkte, stimmung: 'achtung',
    };
  }
  if (d.abgelaufen > 0) {
    return { klartext: `${d.abgelaufen} Charge${d.abgelaufen === 1 ? '' : 'n'} ${d.abgelaufen === 1 ? 'hat' : 'haben'} das MHD überschritten — prüfen und sperren.`, punkte: d.ungeprueft > 0 ? [`${d.ungeprueft} noch ungeprüft`] : [], stimmung: 'achtung' };
  }
  if (d.ungeprueft > 0) {
    return { klartext: `${d.ungeprueft} Charge${d.ungeprueft === 1 ? '' : 'n'} ${d.ungeprueft === 1 ? 'ist' : 'sind'} noch ungeprüft — Prüfplan abarbeiten, bevor freigegeben wird.`, punkte: [], stimmung: 'neutral' };
  }
  return { klartext: `Alle ${d.gesamt} Chargen freigegeben, geprüft und rückverfolgbar — sauber.`, punkte: [], stimmung: 'gut' };
}

/** Housekeeping: offene Abreise-Zimmer (zuerst reinigen) + Zimmer noch nicht sauber. */
export function augeHousekeeping(d: { schmutzig: number; inReinigung: number; abreisenOffen: number; gesamt: number }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch keine Zimmer/Einheiten angelegt — anlegen und den Reinigungsstatus je Zimmer pflegen.', punkte: [], stimmung: 'neutral' };
  }
  if (d.abreisenOffen > 0) {
    return {
      klartext: `${d.abreisenOffen} Abreise-Zimmer ${d.abreisenOffen === 1 ? 'ist' : 'sind'} noch nicht sauber — die zuerst, bevor die nächsten Gäste anreisen.`,
      punkte: (d.schmutzig + d.inReinigung) > 0 ? [`${d.schmutzig + d.inReinigung} Zimmer insgesamt offen`] : [],
      stimmung: 'achtung',
    };
  }
  const offen = d.schmutzig + d.inReinigung;
  if (offen > 0) {
    return { klartext: `${offen} Zimmer noch in Reinigung — keine dringenden Abreisen, aber dranbleiben.`, punkte: [], stimmung: 'neutral' };
  }
  return { klartext: 'Alle Zimmer sauber — nichts Dringendes im Housekeeping.', punkte: [], stimmung: 'gut' };
}

/** IT-Assets/Lizenzen/SLA: abgelaufene oder überbuchte Lizenzen, gerissene SLA, bald fällige. */
export function augeItAssets(d: { lizenzenAbgelaufen: number; ueberbucht: number; slaAbgelaufen: number; lizenzenBald: number; ohneGarantie: number; gesamt: number }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch nichts erfasst — Assets, Lizenzen (mit Plätzen & Ablauf) und SLA je Kunde anlegen, dann behältst du Ablauf und Compliance im Blick.', punkte: [], stimmung: 'neutral' };
  }
  const kritisch = d.lizenzenAbgelaufen + d.ueberbucht + d.slaAbgelaufen;
  const punkte: string[] = [];
  if (d.lizenzenAbgelaufen > 0) punkte.push(`${d.lizenzenAbgelaufen} Lizenz${d.lizenzenAbgelaufen === 1 ? '' : 'en'} abgelaufen`);
  if (d.ueberbucht > 0) punkte.push(`${d.ueberbucht} Lizenz${d.ueberbucht === 1 ? '' : 'en'} überbucht (mehr belegt als lizenziert)`);
  if (d.slaAbgelaufen > 0) punkte.push(`${d.slaAbgelaufen} SLA abgelaufen`);
  if (d.ohneGarantie > 0) punkte.push(`${d.ohneGarantie} Asset${d.ohneGarantie === 1 ? '' : 's'} ohne Garantie`);
  if (kritisch > 0) {
    return { klartext: `${kritisch} Compliance-Punkt${kritisch === 1 ? '' : 'e'} offen — abgelaufene oder überbuchte Lizenzen bzw. gerissene SLA. Das jetzt bereinigen (Kosten- und Vertragsrisiko).`, punkte, stimmung: 'achtung' };
  }
  if (d.lizenzenBald > 0) {
    return { klartext: `${d.lizenzenBald} Lizenz${d.lizenzenBald === 1 ? '' : 'en'} ${d.lizenzenBald === 1 ? 'läuft' : 'laufen'} in den nächsten 60 Tagen aus — rechtzeitig verlängern.`, punkte, stimmung: 'neutral' };
  }
  return { klartext: 'Assets, Lizenzen und SLA sind aktuell — nichts abgelaufen, nichts überbucht.', punkte: d.ohneGarantie > 0 ? punkte : [], stimmung: 'gut' };
}

/** Ernte & Direktvermarktung: gelagerte Ernte (verkaufsbereit) + Markttag-Umsatz. */
export function augeErnte(d: { gelagert: number; umsatzBrutto: number; markttage: number; erntePosten: number; produkte: number; gesamt: number }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch nichts erfasst — Ernte anlegen, Produkte für den Marktstand pflegen und Verkäufe je Markttag buchen.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [];
  if (d.umsatzBrutto > 0) punkte.push(`${eur(d.umsatzBrutto)} Umsatz aus ${d.markttage} Markttag${d.markttage === 1 ? '' : 'en'}`);
  if (d.gelagert > 0) {
    return { klartext: `${d.gelagert} Ernte-Posten ${d.gelagert === 1 ? 'liegt' : 'liegen'} auf Lager — bereit für Verkauf/Markt, bevor die Ware an Frische verliert.`, punkte, stimmung: 'neutral' };
  }
  if (d.umsatzBrutto > 0) {
    return { klartext: `${eur(d.umsatzBrutto)} Umsatz aus der Direktvermarktung erfasst — läuft.`, punkte: [`${d.markttage} Markttag${d.markttage === 1 ? '' : 'e'} · ${d.produkte} Produkte im Katalog`], stimmung: 'gut' };
  }
  return { klartext: `${d.produkte} Produkte im Marktstand-Katalog — bereit für den ersten Markttag.`, punkte: [], stimmung: 'neutral' };
}

/** Räume & Ressourcen: Belegungen heute + kommende Buchungen. */
export function augeRaeume(d: { belegungenHeute: number; belegungenKommend: number; ressourcen: number; gesamt: number }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch keine Räume/Ressourcen — Räume und Ausstattung anlegen, dann im Belegungsplan buchen (mit Doppelbuchungs-Schutz).', punkte: [], stimmung: 'neutral' };
  }
  if (d.belegungenHeute > 0) {
    return { klartext: `${d.belegungenHeute} Belegung${d.belegungenHeute === 1 ? '' : 'en'} heute — der Tagesplan steht.`, punkte: d.belegungenKommend > d.belegungenHeute ? [`${d.belegungenKommend} Belegungen ab heute insgesamt`] : [], stimmung: 'neutral' };
  }
  if (d.belegungenKommend > 0) {
    return { klartext: `Heute nichts gebucht, aber ${d.belegungenKommend} kommende Belegung${d.belegungenKommend === 1 ? '' : 'en'} im Plan.`, punkte: [], stimmung: 'neutral' };
  }
  return { klartext: `${d.ressourcen} Räume/Ressourcen frei — nichts gebucht.`, punkte: [], stimmung: 'gut' };
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

/** Personal-Cockpit: Team-Stärke, heutige Abwesenheiten, ablaufende Zertifikate, offene Bewerbungen. */
export function augePersonal(d: {
  mitarbeiterGesamt: number;
  mitarbeiterAktiv: number;
  abwesendHeute: number;
  krankHeute: number;
  schulungAbgelaufen: number;
  schulungBald: number;
  offeneBewerber: number;
}): AugeErgebnis {
  if (d.mitarbeiterGesamt === 0) {
    return { klartext: 'Noch keine Mitarbeiter erfasst — leg dein Team an, dann behalte ich Abwesenheiten, Zertifikate und Bewerbungen für dich im Blick.', punkte: [], stimmung: 'neutral' };
  }

  const punkte: string[] = [`${d.mitarbeiterGesamt} Mitarbeiter im Team (${d.mitarbeiterAktiv} aktiv).`];
  if (d.abwesendHeute > 0) {
    const quote = d.mitarbeiterAktiv > 0 ? Math.round((d.abwesendHeute / d.mitarbeiterAktiv) * 100) : 0;
    punkte.push(`Heute abwesend: ${d.abwesendHeute}${d.krankHeute > 0 ? ` (davon ${d.krankHeute} krankgemeldet)` : ''}${quote > 0 ? ` — rund ${quote}% des aktiven Teams` : ''}.`);
  }
  if (d.schulungBald > 0) punkte.push(`${d.schulungBald} Zertifikat${d.schulungBald === 1 ? '' : 'e'} ${d.schulungBald === 1 ? 'läuft' : 'laufen'} in den nächsten 30 Tagen ab.`);
  if (d.offeneBewerber > 0) punkte.push(`${d.offeneBewerber} offene Bewerbung${d.offeneBewerber === 1 ? '' : 'en'} ${d.offeneBewerber === 1 ? 'wartet' : 'warten'} auf Rückmeldung.`);

  if (d.schulungAbgelaufen > 0) {
    return {
      klartext: `${d.schulungAbgelaufen} Zertifikat${d.schulungAbgelaufen === 1 ? ' ist' : 'e sind'} abgelaufen — hier drohen Arbeitsschutz-Lücken und Haftung, das zuerst nachziehen.`,
      punkte, stimmung: 'achtung',
    };
  }
  if (d.abwesendHeute > 0) {
    const quoteAnteil = d.mitarbeiterAktiv > 0 ? d.abwesendHeute / d.mitarbeiterAktiv : 0;
    return {
      klartext: `Heute ${d.abwesendHeute} Mitarbeiter abwesend${d.krankHeute > 0 ? `, davon ${d.krankHeute} krankgemeldet` : ''} — plan die offenen Aufgaben entsprechend um.`,
      punkte, stimmung: quoteAnteil >= 0.3 ? 'achtung' : 'neutral',
    };
  }
  if (d.schulungBald > 0) {
    return { klartext: `Nichts überfällig, aber ${d.schulungBald} Zertifikat${d.schulungBald === 1 ? '' : 'e'} ${d.schulungBald === 1 ? 'läuft' : 'laufen'} bald ab — rechtzeitig auffrischen.`, punkte, stimmung: 'neutral' };
  }
  if (d.offeneBewerber > 0) {
    return { klartext: `${d.offeneBewerber} offene Bewerbung${d.offeneBewerber === 1 ? '' : 'en'} ${d.offeneBewerber === 1 ? 'wartet' : 'warten'} auf Rückmeldung — dranbleiben, bevor gute Leute abspringen.`, punkte, stimmung: 'neutral' };
  }
  return { klartext: 'Team vollständig da, alle Zertifikate gültig — nichts Dringendes im Personal.', punkte, stimmung: 'gut' };
}

/** Auftrags-Cockpit: offene Aufträge, überfällige (Lieferdatum), abgeschlossen-ohne-Rechnung, ohne Liefertermin. */
export function augeAuftraege(d: {
  offeneAnzahl: number;
  offenerWert: number;
  ueberfaelligAnzahl: number;
  ueberfaelligWert: number;
  topUeberfaellig?: Array<{ label: string; tageUeber: number; wert: number }>;
  nichtAbgerechnetAnzahl: number;
  nichtAbgerechnetWert: number;
  ohneTerminAnzahl: number;
}): AugeErgebnis {
  if (d.offeneAnzahl === 0 && d.nichtAbgerechnetAnzahl === 0) {
    return { klartext: 'Keine offenen Aufträge — alles abgeschlossen. Sauber.', punkte: [], stimmung: 'gut' };
  }

  const punkte: string[] = [];
  if (d.offeneAnzahl > 0) punkte.push(`${d.offeneAnzahl} ${d.offeneAnzahl === 1 ? 'offener Auftrag' : 'offene Aufträge'} im Wert von ${eur(d.offenerWert)}.`);
  (d.topUeberfaellig || []).slice(0, 3).forEach((u) => punkte.push(`${u.label}: ${u.tageUeber} Tag${u.tageUeber === 1 ? '' : 'e'} über Lieferdatum (${eur(u.wert)})`));
  if (d.nichtAbgerechnetAnzahl > 0 && d.ueberfaelligAnzahl > 0) punkte.push(`${d.nichtAbgerechnetAnzahl} ${d.nichtAbgerechnetAnzahl === 1 ? 'abgeschlossener Auftrag' : 'abgeschlossene Aufträge'} noch ohne Rechnung (${eur(d.nichtAbgerechnetWert)}).`);
  if (d.ohneTerminAnzahl > 0) punkte.push(`${d.ohneTerminAnzahl} ${d.ohneTerminAnzahl === 1 ? 'beauftragter Auftrag' : 'beauftragte Aufträge'} ohne Liefertermin — hier fehlt die Terminzusage.`);

  if (d.ueberfaelligAnzahl > 0) {
    return { klartext: `${d.ueberfaelligAnzahl} ${d.ueberfaelligAnzahl === 1 ? 'Auftrag ist' : 'Aufträge sind'} über dem Lieferdatum (${eur(d.ueberfaelligWert)}) — die zuerst nachziehen.`, punkte, stimmung: 'achtung' };
  }
  if (d.nichtAbgerechnetAnzahl > 0) {
    return { klartext: `${d.nichtAbgerechnetAnzahl} ${d.nichtAbgerechnetAnzahl === 1 ? 'abgeschlossener Auftrag ist' : 'abgeschlossene Aufträge sind'} noch nicht abgerechnet (${eur(d.nichtAbgerechnetWert)}) — hier wartet bereits verdientes Geld auf die Rechnung.`, punkte, stimmung: 'achtung' };
  }
  if (d.ohneTerminAnzahl > 0) {
    return { klartext: `Nichts überfällig, aber ${d.ohneTerminAnzahl} ${d.ohneTerminAnzahl === 1 ? 'beauftragter Auftrag hat' : 'beauftragte Aufträge haben'} noch keinen Liefertermin — Termin setzen, damit nichts durchrutscht.`, punkte, stimmung: 'neutral' };
  }
  return { klartext: `${d.offeneAnzahl} offene Aufträge — alle mit Termin und im Zeitplan, nichts überfällig.`, punkte, stimmung: 'gut' };
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

/** Einkauf & Beschaffung: Retouren, offener Wareneingang, gebundener Bestellwert. */
export function augeEinkauf(k: {
  offeneBestellungen: number;
  wareneingangOffen: number;
  retourenOffen: number;
  bestellwertOffen: number;
  lieferantenAktiv: number;
}): AugeErgebnis {
  if (k.retourenOffen > 0) {
    return {
      klartext: `${k.retourenOffen} Position(en) mit Retoure/Reklamation — mit dem Lieferanten klären und Gutschrift/Ersatz nachhalten.`,
      punkte: k.wareneingangOffen > 0 ? [`${k.wareneingangOffen} Bestellung(en) warten noch auf Wareneingang.`] : [],
      stimmung: 'achtung',
    };
  }
  if (k.offeneBestellungen === 0) {
    return { klartext: k.lieferantenAktiv === 0 ? 'Noch keine Lieferanten/Bestellungen — leg deinen ersten Lieferanten an.' : 'Keine offenen Bestellungen — alles geliefert.', punkte: [], stimmung: k.lieferantenAktiv === 0 ? 'neutral' : 'gut' };
  }
  return {
    klartext: `${k.offeneBestellungen} offene Bestellung(en), ${eur(k.bestellwertOffen)} noch nicht geliefert.`,
    punkte: k.wareneingangOffen > 0 ? [`${k.wareneingangOffen} davon mit offenem Wareneingang.`] : [],
    stimmung: 'neutral',
  };
}

/** Exposé & Vermarktung: GEG-Pflichtlücken, aktive Objekte, Volumen. */
export function augeExpose(k: {
  aktiv: number;
  reserviert: number;
  abgeschlossen: number;
  volumenAktiv: number;
  pflichtLuecken: number;
}): AugeErgebnis {
  if (k.pflichtLuecken > 0) {
    return {
      klartext: `${k.pflichtLuecken} aktive(s) Exposé(s) ohne vollständige GEG-§87-Pflichtangaben (Ausweis-Art, Kennwert, Energieträger, Baujahr) — das ist abmahnfähig, bitte ergänzen.`,
      punkte: [], stimmung: 'achtung',
    };
  }
  if (k.aktiv === 0 && k.reserviert === 0) {
    return { klartext: 'Nichts aktiv in der Vermarktung — leg ein Exposé an und schalte es aktiv.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [];
  if (k.reserviert > 0) punkte.push(`${k.reserviert} reserviert.`);
  if (k.abgeschlossen > 0) punkte.push(`${k.abgeschlossen} abgeschlossen.`);
  return { klartext: `${k.aktiv} Objekt(e) aktiv vermarktet${k.volumenAktiv > 0 ? `, Volumen ${eur(k.volumenAktiv)}` : ''} — GEG-Angaben vollständig.`, punkte, stimmung: 'gut' };
}

/** Betriebskostenabrechnung: HeizkostenV-Fehler, Einheiten, Nachzahler. */
export function augeBk(k: {
  einheiten: number;
  kostenGesamt: number;
  vorauszahlungGesamt: number;
  saldoGesamt: number;
  nachzahler: number;
  heizLuecken: number;
}): AugeErgebnis {
  if (k.heizLuecken > 0) {
    return {
      klartext: `${k.heizLuecken} Heizkosten-Position(en) mit Verbrauchsanteil außerhalb 50–70 % — das verstößt gegen die HeizkostenV; der Mieter darf dann um 15 % kürzen (§ 12 HeizkostenV).`,
      punkte: [], stimmung: 'achtung',
    };
  }
  if (k.einheiten === 0) {
    return { klartext: 'Leg die Einheiten/Mieter an — dann verteilt sich die Abrechnung automatisch nach Schlüssel.', punkte: [], stimmung: 'neutral' };
  }
  if (k.kostenGesamt === 0) {
    return { klartext: `${k.einheiten} Einheit(en) erfasst — jetzt die Kostenarten nach § 2 BetrKV eintragen.`, punkte: [], stimmung: 'neutral' };
  }
  return {
    klartext: `${k.einheiten} Einheit(en), ${eur(k.kostenGesamt)} Kosten verteilt${k.nachzahler > 0 ? ` — ${k.nachzahler} Nachzahler` : ' — alles im Guthaben'}.`,
    punkte: [`Saldo gesamt ${eur(k.saldoGesamt)} (Nachforderung minus Guthaben).`], stimmung: 'gut',
  };
}

/** BDE/MDE: OEE-Ampel + schwächster Hebel (Verfügbarkeit/Leistung/Qualität) + Top-Störgrund. */
export function augeBde(k: {
  maschinenAktiv: number;
  buchungen: number;
  offene: number;
  oee: number; verfuegbarkeit: number; leistung: number; qualitaet: number;
  laufzeitStd: number; stoerzeitStd: number;
  mengeGesamt: number; ausschuss: number;
  topStoerLabel: string | null; topStoerMin: number;
}): AugeErgebnis {
  const p = (n: number) => (Math.round((Number(n) || 0) * 1000) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';
  if (k.buchungen === 0) {
    return { klartext: 'Noch keine BDE-Buchungen — leg eine Maschine an und buche die erste Schicht, dann rechne ich die OEE aus.', punkte: [], stimmung: 'neutral' };
  }
  // Schwächster der drei Faktoren = größter Hebel.
  const faktoren = [
    { name: 'Verfügbarkeit', wert: k.verfuegbarkeit, tipp: k.topStoerLabel ? `größter Störblock: ${k.topStoerLabel} (${Math.round(k.topStoerMin)} min)` : 'Störzeiten senken' },
    { name: 'Leistung', wert: k.leistung, tipp: 'Taktverluste/Leerlauf reduzieren' },
    { name: 'Qualität', wert: k.qualitaet, tipp: `Ausschuss senken${k.ausschuss ? ` (${k.ausschuss} Stk)` : ''}` },
  ].sort((a, b) => a.wert - b.wert);
  const schwach = faktoren[0];
  const punkte: string[] = [`Schwächster Hebel: ${schwach.name} ${p(schwach.wert)} — ${schwach.tipp}.`];
  if (k.stoerzeitStd > 0) punkte.push(`${k.stoerzeitStd.toLocaleString('de-DE')} h Störzeit gegenüber ${k.laufzeitStd.toLocaleString('de-DE')} h Laufzeit.`);

  if (k.oee < 0.6) {
    return { klartext: `OEE ${p(k.oee)} — deutlich Luft nach oben. Setz zuerst bei der ${schwach.name} an.`, punkte, stimmung: 'achtung' };
  }
  if (k.oee < 0.85) {
    return { klartext: `OEE ${p(k.oee)} — solide, aber noch nicht Weltklasse (85 %). Größter Hebel: ${schwach.name}.`, punkte, stimmung: 'neutral' };
  }
  return { klartext: `OEE ${p(k.oee)} — Weltklasse-Niveau (≥ 85 %). Sauber.`, punkte, stimmung: 'gut' };
}

/** Erträge/Monitoring (Energie): Soll-Erreichung, Anlagen unter Soll, Verfügbarkeit, Erlös. */
export function augeErtraege(k: {
  anlagenAktiv: number;
  ablesungen: number;
  ertragKwh: number;
  sollErreichung: number;
  verfuegbarkeit: number;
  eigenverbrauchsquote: number;
  erloesGesamt: number;
  schwacheAnlagen: number;
  schwaechsteAnlage: string | null;
}): AugeErgebnis {
  const p = (n: number) => (Math.round((Number(n) || 0) * 1000) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';
  if (k.ablesungen === 0) {
    return { klartext: 'Noch keine Ablesungen — leg eine Anlage an und erfasse die erste Ablesung, dann rechne ich Soll/Ist, Verfügbarkeit und Erlös.', punkte: [], stimmung: 'neutral' };
  }
  if (k.schwacheAnlagen > 0) {
    return {
      klartext: `${k.schwacheAnlagen} Anlage(n) unter 90 % Soll-Erreichung${k.schwaechsteAnlage ? ` (schwächste: ${k.schwaechsteAnlage})` : ''} — Ertrag prüfen: Verschattung, Verschmutzung, Wechselrichter-Ausfall oder Defekt.`,
      punkte: [`Verfügbarkeit gesamt ${p(k.verfuegbarkeit)}, Erlös ${eur(k.erloesGesamt)}.`], stimmung: 'achtung',
    };
  }
  if (k.verfuegbarkeit < 0.95) {
    return {
      klartext: `Soll erreicht (${p(k.sollErreichung)}), aber Verfügbarkeit nur ${p(k.verfuegbarkeit)} — Ausfallzeiten prüfen.`,
      punkte: [`${k.ertragKwh.toLocaleString('de-DE', { maximumFractionDigits: 0 })} kWh Ertrag, Erlös ${eur(k.erloesGesamt)}.`], stimmung: 'neutral',
    };
  }
  return {
    klartext: `Soll-Erreichung ${p(k.sollErreichung)} bei ${p(k.verfuegbarkeit)} Verfügbarkeit — läuft rund.`,
    punkte: [`${k.ertragKwh.toLocaleString('de-DE', { maximumFractionDigits: 0 })} kWh Ertrag, Eigenverbrauch ${p(k.eigenverbrauchsquote)}, Erlös ${eur(k.erloesGesamt)}.`], stimmung: 'gut',
  };
}

/** Freigaben/Proofing: offene Änderungen, laufende Prüfungen, Freigabequote. */
export function augeProofing(k: {
  assets: number;
  inPruefung: number;
  offeneAenderungen: number;
  freigegeben: number;
  abgelehnt: number;
  inArbeit: number;
  freigabeQuote: number;
  schnittSchleifen: number;
  versionenGesamt: number;
}): AugeErgebnis {
  const p = (n: number) => (Math.round((Number(n) || 0) * 1000) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';
  if (k.assets === 0) {
    return { klartext: 'Noch keine Assets — leg das erste an und reiche eine Version zur Freigabe ein.', punkte: [], stimmung: 'neutral' };
  }
  if (k.offeneAenderungen > 0) {
    return {
      klartext: `${k.offeneAenderungen} Asset(s) mit Änderungswunsch — nacharbeiten und die nächste Version einreichen.`,
      punkte: k.inPruefung > 0 ? [`${k.inPruefung} weitere(s) in Prüfung beim Kunden.`] : [], stimmung: 'achtung',
    };
  }
  if (k.inPruefung > 0) {
    return {
      klartext: `${k.inPruefung} Asset(s) in Prüfung — warten auf Kundenfreigabe.`,
      punkte: k.freigegeben > 0 ? [`${k.freigegeben} bereits freigegeben (Quote ${p(k.freigabeQuote)}).`] : [], stimmung: 'neutral',
    };
  }
  if (k.freigegeben > 0) {
    return {
      klartext: `${k.freigegeben} Asset(s) freigegeben — Freigabequote ${p(k.freigabeQuote)}.`,
      punkte: [`Ø ${k.schnittSchleifen.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Versionsschleifen bis zur Freigabe.`], stimmung: 'gut',
    };
  }
  return { klartext: `${k.assets} Asset(s) in Arbeit — reiche eine Version zur Freigabe ein.`, punkte: [], stimmung: 'neutral' };
}

/** Veranstaltungen: Auslastung, ausverkauft + Warteliste, offene Einnahmen. */
export function augeEvents(k: {
  veranstaltungen: number;
  aktive: number;
  gesamtPlaetze: number;
  belegtePlaetze: number;
  auslastung: number;
  wartelisteGesamt: number;
  ausverkaufte: number;
  einnahmenBezahlt: number;
  einnahmenOffen: number;
}): AugeErgebnis {
  const p = (n: number) => (Math.round((Number(n) || 0) * 1000) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';
  if (k.veranstaltungen === 0) {
    return { klartext: 'Noch keine Veranstaltungen — leg die erste an, dann rechne ich Auslastung, freie Plätze und Einnahmen.', punkte: [], stimmung: 'neutral' };
  }
  if (k.ausverkaufte > 0 && k.wartelisteGesamt > 0) {
    return {
      klartext: `${k.ausverkaufte} Veranstaltung(en) ausverkauft, ${k.wartelisteGesamt} Platz/Plätze auf der Warteliste — Kapazität erhöhen oder Nachrücker bestätigen.`,
      punkte: k.einnahmenOffen > 0 ? [`${eur(k.einnahmenOffen)} noch nicht bezahlt.`] : [], stimmung: 'achtung',
    };
  }
  if (k.einnahmenOffen > 0) {
    return {
      klartext: `Auslastung ${p(k.auslastung)} (${k.belegtePlaetze}/${k.gesamtPlaetze} Plätze) — aber ${eur(k.einnahmenOffen)} sind noch offen.`,
      punkte: [`${eur(k.einnahmenBezahlt)} bereits bezahlt.`], stimmung: 'neutral',
    };
  }
  return {
    klartext: `Auslastung ${p(k.auslastung)} über ${k.aktive} aktive Veranstaltung(en) — Einnahmen ${eur(k.einnahmenBezahlt)}, alles bezahlt.`,
    punkte: k.wartelisteGesamt > 0 ? [`${k.wartelisteGesamt} auf der Warteliste.`] : [], stimmung: 'gut',
  };
}

// ===================================================================
// Punkt 17 · KI-Augen → Regel (kostenlos, gleiche Aussage aus vorhandenen Zahlen)
// ===================================================================

/** Aufmaß: Anzahl + Entwürfe + aktuell geöffnetes Aufmaß. */
export function augeAufmass(d: { gesamt: number; entwuerfe: number; offenTitel?: string | null; positionen: number }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch kein Aufmaß erfasst — Aufmaß anlegen, Positionen aufnehmen und daraus Angebot oder Rechnung erzeugen.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [];
  if (d.offenTitel && d.offenTitel.trim()) punkte.push(`Geöffnet: „${d.offenTitel.trim()}" mit ${d.positionen} Position${d.positionen === 1 ? '' : 'en'}.`);
  if (d.entwuerfe > 0) {
    return { klartext: `${d.entwuerfe} von ${d.gesamt} Aufmaß${d.gesamt === 1 ? '' : 'en'} noch im Entwurf — fertigstellen und ins Angebot/die Rechnung überführen.`, punkte, stimmung: 'achtung' };
  }
  return { klartext: `${d.gesamt} Aufmaß${d.gesamt === 1 ? '' : 'e'} erfasst — bereit zur Weiterverarbeitung.`, punkte, stimmung: 'gut' };
}

/** Wartungsverträge: Fälligkeits-Ampel (rot/gelb/grün). */
export function augeWartung(d: { gesamt: number; rot: number; gelb: number; gruen: number }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch keine Wartungsverträge — Vertrag anlegen; Fälligkeiten und Erinnerungs-Ampel rechnet die Anlage automatisch.', punkte: [], stimmung: 'neutral' };
  }
  if (d.rot > 0) {
    return { klartext: `${d.rot} Wartung${d.rot === 1 ? '' : 'en'} überfällig oder in ≤7 Tagen fällig — jetzt terminieren.`, punkte: d.gelb > 0 ? [`${d.gelb} weitere im Erinnerungsfenster.`] : [], stimmung: 'achtung' };
  }
  if (d.gelb > 0) {
    return { klartext: `${d.gelb} Wartung${d.gelb === 1 ? '' : 'en'} bald fällig — im Blick behalten und rechtzeitig planen.`, punkte: [`${d.gesamt} aktive Verträge gesamt.`], stimmung: 'neutral' };
  }
  return { klartext: `Alle ${d.gesamt} Wartungsverträge unkritisch — nichts fällig, alles im grünen Bereich.`, punkte: [], stimmung: 'gut' };
}

/** Werkstatt-Durchlauf: offen / in Arbeit + Ø Durchlaufzeit. */
export function augeWerkstatt(d: { gesamt: number; offen: number; inArbeit: number; oDurchlauf?: string | null }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch keine Werkstatt-Aufträge — Auftrag annehmen, Positionen erfassen und den Durchlauf verfolgen.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [];
  const od = (d.oDurchlauf ?? '').toString().trim();
  if (od && od !== '—') punkte.push(`Ø Durchlaufzeit: ${od}.`);
  if (d.offen > 0) {
    return { klartext: `${d.offen} Auftrag${d.offen === 1 ? '' : 'e'} offen und ${d.inArbeit} in Arbeit — offene zuerst einplanen, damit nichts liegen bleibt.`, punkte, stimmung: 'achtung' };
  }
  if (d.inArbeit > 0) {
    return { klartext: `${d.inArbeit} Auftrag${d.inArbeit === 1 ? '' : 'e'} in Arbeit, nichts Unbearbeitetes offen — sauberer Durchlauf.`, punkte, stimmung: 'gut' };
  }
  return { klartext: `${d.gesamt} Werkstatt-Auftrag${d.gesamt === 1 ? '' : 'e'} — nichts offen, nichts in Arbeit.`, punkte, stimmung: 'gut' };
}

/** Fahrzeugakte: HU-Fälligkeit + Werkstattbesuche. */
export function augeFahrzeugakte(d: { huTage: number | null; besuche: number; fahrzeugName?: string | null }): AugeErgebnis {
  const name = (d.fahrzeugName && d.fahrzeugName.trim()) || 'das Fahrzeug';
  const besuchText = `${d.besuche} Werkstattbesuch${d.besuche === 1 ? '' : 'e'} dokumentiert.`;
  if (d.huTage != null && d.huTage < 0) {
    return { klartext: `HU von ${name} ist ${Math.abs(d.huTage)} Tag${Math.abs(d.huTage) === 1 ? '' : 'e'} überfällig — sofort einen TÜV-Termin vereinbaren.`, punkte: [besuchText], stimmung: 'achtung' };
  }
  if (d.huTage != null && d.huTage <= 30) {
    return { klartext: `HU von ${name} in ${d.huTage} Tag${d.huTage === 1 ? '' : 'en'} fällig — Termin rechtzeitig einplanen.`, punkte: [besuchText], stimmung: 'neutral' };
  }
  return { klartext: `Lebensakte von ${name} gepflegt${d.huTage != null ? ` — HU in ${d.huTage} Tagen unkritisch` : ''}.`, punkte: [besuchText], stimmung: 'gut' };
}

/** Brennholz-Sortiment: Varianten, Trocknung, Preise. */
export function augeHolz(d: { gesamt: number; aktive: number; nichtBrennfertig: number; feuchteGrenze: number; ohnePreis: number; rabatte: number }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch kein Brennholz-Sortiment — Varianten (Holzart, Länge, Feuchte) anlegen und Preise setzen.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [];
  if (d.rabatte > 0) punkte.push(`${d.rabatte} Rabattstaffel${d.rabatte === 1 ? '' : 'n'} hinterlegt.`);
  if (d.ohnePreis > 0) {
    return { klartext: `${d.ohnePreis} aktive Variante${d.ohnePreis === 1 ? '' : 'n'} ohne Preis — Preise ergänzen, sonst nicht verkaufsfertig.`, punkte, stimmung: 'achtung' };
  }
  if (d.nichtBrennfertig > 0) {
    return { klartext: `${d.nichtBrennfertig} Variante${d.nichtBrennfertig === 1 ? '' : 'n'} über ${d.feuchteGrenze} % Restfeuchte — noch nicht brennfertig, weiter trocknen.`, punkte, stimmung: 'neutral' };
  }
  return { klartext: `${d.aktive} von ${d.gesamt} Variante${d.gesamt === 1 ? '' : 'n'} im Verkauf — brennfertig und bepreist.`, punkte, stimmung: 'gut' };
}

/** Leistungskatalog: aktive Leistungen je Kategorie. */
export function augeLeistungskatalog(d: { gesamt: number; aktiv: number; kategorien: number }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch kein Leistungskatalog — Leistungen mit Preisen anlegen; sie stehen dann in Angeboten und Rechnungen zur Auswahl.', punkte: [], stimmung: 'neutral' };
  }
  if (d.aktiv < d.gesamt) {
    return { klartext: `${d.aktiv} von ${d.gesamt} Leistung${d.gesamt === 1 ? '' : 'en'} aktiv in ${d.kategorien} Kategorie${d.kategorien === 1 ? '' : 'n'} — inaktive prüfen und bei Bedarf reaktivieren.`, punkte: [], stimmung: 'neutral' };
  }
  return { klartext: `${d.gesamt} Leistung${d.gesamt === 1 ? '' : 'en'} in ${d.kategorien} Kategorie${d.kategorien === 1 ? '' : 'n'} — vollständig aktiv, bereit für Angebote.`, punkte: [], stimmung: 'gut' };
}

/** Termin-/Ressourcenbuchung: heutige Buchungen + laufende. */
export function augeBuchungen(d: { gesamt: number; ressourcen: number; heuteAktiv: number; laufen: number; tagName?: string | null }): AugeErgebnis {
  if (d.gesamt === 0) {
    return { klartext: 'Noch keine Buchungen — Ressourcen anlegen und Termine buchen; Doppelbuchungen werden automatisch verhindert.', punkte: [], stimmung: 'neutral' };
  }
  const tag = (d.tagName && d.tagName.trim()) || 'heute';
  const punkte: string[] = [`${d.ressourcen} Ressource${d.ressourcen === 1 ? '' : 'n'} im Plan.`];
  if (d.laufen > 0) {
    return { klartext: `Am ${tag}: ${d.laufen} Buchung${d.laufen === 1 ? '' : 'en'} ${d.laufen === 1 ? 'läuft' : 'laufen'} gerade — Ressourcen aktuell im Einsatz.`, punkte, stimmung: 'gut' };
  }
  if (d.heuteAktiv > 0) {
    return { klartext: `Am ${tag}: ${d.heuteAktiv} Buchung${d.heuteAktiv === 1 ? '' : 'en'} geplant — nichts läuft gerade.`, punkte, stimmung: 'neutral' };
  }
  return { klartext: `Am ${tag} keine aktive Buchung — Ressourcen frei.`, punkte, stimmung: 'neutral' };
}

/** Objektzeiten: gebuchte Stunden je Monat, abrechenbarer Anteil. */
export function augeObjektzeiten(d: { objekte: number; minutenGesamt: number; minutenAbrechenbar: number; kostenAbrechenbar?: number | null; monatsName?: string | null }): AugeErgebnis {
  const h = (m: number) => (Math.round(((Number(m) || 0) / 60) * 10) / 10).toLocaleString('de-DE') + ' h';
  if (d.objekte === 0 || (Number(d.minutenGesamt) || 0) === 0) {
    return { klartext: 'Noch keine Objektzeiten erfasst — Zeiten auf Objekte buchen; abrechenbare Stunden fließen in die Abrechnung.', punkte: [], stimmung: 'neutral' };
  }
  const monat = (d.monatsName && d.monatsName.trim()) || 'diesen Monat';
  const punkte: string[] = [];
  if (d.kostenAbrechenbar != null) punkte.push(`${eur(d.kostenAbrechenbar)} netto abrechenbar.`);
  if ((Number(d.minutenAbrechenbar) || 0) < (Number(d.minutenGesamt) || 0)) punkte.push('Ein Teil ist nicht abrechenbar — Stundensätze/Kennzeichnung prüfen.');
  return { klartext: `Im ${monat}: ${h(d.minutenGesamt)} auf ${d.objekte} Objekt${d.objekte === 1 ? '' : 'e'} gebucht, davon ${h(d.minutenAbrechenbar)} abrechenbar.`, punkte, stimmung: 'gut' };
}

/** Deal-Pipeline: offene Chancen, gewichteter Forecast, überfällige Abschlüsse. */
export function augePipeline(d: {
  offen: number; pipelineWert: number; gewichtet: number; winRate: number;
  gewonnen: number; verloren: number;
  topTitel?: string | null; topScore?: number | null; ueberfaellig?: number;
}): AugeErgebnis {
  const ueberfaellig = Number(d.ueberfaellig) || 0;
  if ((Number(d.offen) || 0) === 0) {
    return { klartext: 'Noch keine offenen Deals — leg deine erste Vertriebschance an.', punkte: [], stimmung: 'neutral' };
  }
  const punkte: string[] = [];
  punkte.push(`Pipeline-Wert offen: ${eur(d.pipelineWert)} · gewichteter Forecast: ${eur(d.gewichtet)}`);
  if (d.topTitel) punkte.push(`Heißester Deal: „${d.topTitel}"${d.topScore != null ? ` (Score ${Math.round(Number(d.topScore))})` : ''} — hier zuerst dran.`);
  if ((d.gewonnen + d.verloren) > 0) punkte.push(`Win-Rate: ${Math.round(Number(d.winRate) || 0)} % (${d.gewonnen} gewonnen)`);

  if (ueberfaellig > 0) {
    return {
      klartext: `${ueberfaellig} Deal${ueberfaellig === 1 ? '' : 's'} mit überfälligem Abschlusstermin — da solltest du jetzt nachfassen.`,
      punkte, stimmung: 'achtung',
    };
  }
  return {
    klartext: `${d.offen} offene Deal${d.offen === 1 ? '' : 's'} · gewichteter Forecast ${eur(d.gewichtet)}.`,
    punkte, stimmung: 'gut',
  };
}

/** Provisionen: offene vs. ausgezahlte Verkaufsprovisionen aus gewonnenen Deals. */
export function augeProvisionen(d: {
  offen: number; ausgezahlt: number; gesamt: number; anzahlDeals: number; anzahlEmpfaenger: number;
}): AugeErgebnis {
  if ((Number(d.anzahlDeals) || 0) === 0) {
    return { klartext: 'Noch keine Provisionen erfasst — trag bei einem gewonnenen Deal einen Satz ein.', punkte: [], stimmung: 'neutral' };
  }
  const punkte = [
    `Gesamt fällig: ${eur(d.gesamt)} über ${d.anzahlDeals} Deal${d.anzahlDeals === 1 ? '' : 's'}`,
    `Ausgezahlt: ${eur(d.ausgezahlt)} · ${d.anzahlEmpfaenger} Empfänger`,
  ];
  if ((Number(d.offen) || 0) > 0) {
    return { klartext: `${eur(d.offen)} Provision offen zum Auszahlen.`, punkte, stimmung: 'achtung' };
  }
  return { klartext: `Alle Provisionen ausgezahlt — nichts offen. Sauber.`, punkte, stimmung: 'gut' };
}

/**
 * GESAMT-AUGE (Aggregator fürs Tagescockpit „Heute"): bündelt die Auge-Ergebnisse
 * mehrerer Module zu EINER priorisierten Antwort. Schlimmste Stimmung gewinnt;
 * die „achtung"-Bereiche zuerst. Reine Zusammenführung — 0 €.
 */
export function augeGesamt(
  module: Array<{ modul: string; ergebnis: AugeErgebnis }>,
  maxPunkte: number = 5,
): AugeErgebnis {
  const liste = (module || []).filter((m) => m && m.ergebnis);
  const achtung = liste.filter((m) => m.ergebnis.stimmung === 'achtung');
  const neutral = liste.filter((m) => m.ergebnis.stimmung === 'neutral');

  if (achtung.length > 0) {
    return {
      klartext: `${achtung.length} Bereich${achtung.length === 1 ? '' : 'e'} ${achtung.length === 1 ? 'braucht' : 'brauchen'} jetzt deine Aufmerksamkeit.`,
      punkte: achtung.slice(0, maxPunkte).map((m) => `${m.modul}: ${m.ergebnis.klartext}`),
      stimmung: 'achtung',
    };
  }
  if (neutral.length > 0) {
    return {
      klartext: `Nichts Dringendes — ${neutral.length} Bereich${neutral.length === 1 ? '' : 'e'} im Blick behalten.`,
      punkte: neutral.slice(0, maxPunkte).map((m) => `${m.modul}: ${m.ergebnis.klartext}`),
      stimmung: 'neutral',
    };
  }
  return { klartext: 'Alles im grünen Bereich — nichts Dringendes. Sauber.', punkte: [], stimmung: 'gut' };
}
