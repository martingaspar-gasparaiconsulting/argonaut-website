// ============================================================================
// ARGONAUT OS · lib/personalDokumente.ts — Personal-Dokumente (Paket PF · B10)
//
//   · Nachweis der Arbeitsbedingungen (NachwG): Pflichtangaben mit Fristen
//   · Warnungen: Probezeit läuft aus, Befristung endet / ist unzulässig lang
//   · Arbeitszeugnis: Entwurf in Zeugnissprache nach vorgegebener Note
//   · Stellenanzeige: Entwurf + AGG-Prüfung (Diskriminierungsrisiken)
//   · Beschäftigungsbestätigung: fester Text aus den Stammdaten
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE Hooks.
// Node-getestet in tests/personalDokumenteP75.test.mjs.
//
// ▄▄▄ KEINE RECHTSBERATUNG (Anwalt-Punkt R16, neu) ▄▄▄
// Die Pflichtangaben folgen § 2 NachwG in der Fassung seit 01.08.2022, die
// Befristungsregeln § 14 TzBfG, die Probezeit § 622 Abs. 3 BGB / § 1 KSchG.
// Der Arbeitsvertrag selbst wird hier NICHT erzeugt — nur die Checkliste, was
// drinstehen muss. Arbeitsverträge und Zeugnisse bitte vor der ersten Nutzung
// vom Anwalt absegnen lassen.
//
// ▄▄▄ WAS DIE KI HIER BEWUSST NICHT DARF ▄▄▄
// Die KI BEWERTET keine Person (Anwalt-Punkt R06, Hochrisiko-KI). Beim Zeugnis
// gibt der MENSCH die Note vor; die KI formuliert nur. Bei der Stellenanzeige
// gibt es keine Auswahl und keine Einschätzung von Bewerbern.
// ============================================================================

// ---------------------------------------------------------------------------
// Datum (reine Kalendertage)
// ---------------------------------------------------------------------------

function zwei(n: number): string { return n < 10 ? `0${n}` : String(n); }

export function istIso(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [j, m, t] = s.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

export function plusTage(iso: string, n: number): string {
  const [j, m, t] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + n));
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())}`;
}

/** Monate addieren, Monatsende festgehalten (31.01. + 1 = 28.02.). */
export function plusMonate(iso: string, monate: number): string {
  const [j, m, t] = iso.split('-').map(Number);
  const g = (m - 1) + Math.round(monate);
  const zj = j + Math.floor(g / 12);
  const zm = ((g % 12) + 12) % 12;
  const letzter = new Date(Date.UTC(zj, zm + 1, 0)).getUTCDate();
  return `${zj}-${zwei(zm + 1)}-${zwei(Math.min(t, letzter))}`;
}

export function tageBis(von: string, bis: string): number {
  const [a, b, c] = von.split('-').map(Number);
  const [d, e, f] = bis.split('-').map(Number);
  return Math.round((Date.UTC(d, e - 1, f) - Date.UTC(a, b - 1, c)) / 86_400_000);
}

export function datumDe(iso: string | null | undefined): string {
  if (!iso || !istIso(iso)) return '—';
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}

/**
 * Ende einer in Monaten bemessenen Frist, die an einem Tag beginnt:
 * Beginn 01.03. + 6 Monate -> Ende 31.08. (§§ 187 Abs. 2, 188 Abs. 2 BGB).
 */
export function fristEnde(beginn: string, monate: number): string {
  return plusTage(plusMonate(beginn, monate), -1);
}

// ---------------------------------------------------------------------------
// Nachweisgesetz
// ---------------------------------------------------------------------------

export type NachweisFrist = 'tag1' | 'tag7' | 'monat1';

export const NACHWEIS_PUNKTE: { key: string; text: string; frist: NachweisFrist; nurWenn?: 'befristet' | 'abruf' | 'altersversorgung' }[] = [
  { key: 'parteien', text: 'Name und Anschrift beider Vertragsparteien', frist: 'tag1' },
  { key: 'entgelt', text: 'Zusammensetzung und Höhe des Arbeitsentgelts (inkl. Überstunden, Zuschläge, Zulagen, Prämien, Sonderzahlungen), Fälligkeit und Art der Auszahlung', frist: 'tag1' },
  { key: 'arbeitszeit', text: 'Vereinbarte Arbeitszeit, Ruhepausen und Ruhezeiten; bei Schichtarbeit Schichtsystem und -rhythmus', frist: 'tag1' },
  { key: 'beginn', text: 'Beginn des Arbeitsverhältnisses', frist: 'tag7' },
  { key: 'befristung', text: 'Enddatum bzw. vorhersehbare Dauer der Befristung', frist: 'tag7', nurWenn: 'befristet' },
  { key: 'arbeitsort', text: 'Arbeitsort (oder Hinweis auf wechselnde Arbeitsorte bzw. freie Wahl)', frist: 'tag7' },
  { key: 'taetigkeit', text: 'Kurze Beschreibung der Tätigkeit', frist: 'tag7' },
  { key: 'probezeit', text: 'Dauer der Probezeit, falls vereinbart', frist: 'tag7' },
  { key: 'abruf', text: 'Bei Arbeit auf Abruf: Mindeststunden, Referenzzeitraum, Ankündigungsfrist', frist: 'tag7', nurWenn: 'abruf' },
  { key: 'ueberstunden', text: 'Möglichkeit der Anordnung von Überstunden und deren Voraussetzungen', frist: 'tag7' },
  { key: 'urlaub', text: 'Dauer des jährlichen Erholungsurlaubs', frist: 'monat1' },
  { key: 'fortbildung', text: 'Anspruch auf vom Arbeitgeber bereitgestellte Fortbildung, falls vorhanden', frist: 'monat1' },
  { key: 'altersversorgung', text: 'Name und Anschrift des Versorgungsträgers der betrieblichen Altersversorgung', frist: 'monat1', nurWenn: 'altersversorgung' },
  { key: 'kuendigung', text: 'Kündigungsverfahren: Schriftform, Kündigungsfristen und Frist zur Kündigungsschutzklage (3 Wochen)', frist: 'monat1' },
  { key: 'tarif', text: 'Hinweis auf anwendbare Tarifverträge, Betriebs- oder Dienstvereinbarungen', frist: 'monat1' },
];

export const FRIST_TEXT: Record<NachweisFrist, string> = {
  tag1: 'am ersten Arbeitstag',
  tag7: 'bis zum 7. Kalendertag',
  monat1: 'innerhalb eines Monats',
};

function fristDatum(beginn: string, f: NachweisFrist): string {
  if (f === 'tag1') return beginn;
  if (f === 'tag7') return plusTage(beginn, 6);
  return plusMonate(beginn, 1);
}

export type Vertrag = {
  beginn?: string | null;
  probezeit_monate?: number | null;
  befristet?: boolean | null;
  befristet_bis?: string | null;
  sachgrund?: string | null;
  erstbefristung_beginn?: string | null;
  verlaengerungen?: number | null;
  abruf?: boolean | null;
  altersversorgung?: boolean | null;
  nachweis_punkte?: string[] | null;
};

/** Welche Pflichtangaben fehlen noch, und welche davon sind schon überfällig? */
export function nachweisStand(v: Vertrag, heute: string) {
  const erledigt = new Set(v.nachweis_punkte ?? []);
  const relevant = NACHWEIS_PUNKTE.filter((p) =>
    !p.nurWenn || (p.nurWenn === 'befristet' ? !!v.befristet : p.nurWenn === 'abruf' ? !!v.abruf : !!v.altersversorgung));
  const offen = relevant.filter((p) => !erledigt.has(p.key));
  const beginn = v.beginn && istIso(v.beginn) ? v.beginn : null;
  const ueberfaellig = beginn ? offen.filter((p) => fristDatum(beginn, p.frist) < heute) : [];
  return { gesamt: relevant.length, erledigt: relevant.length - offen.length, offen, ueberfaellig };
}

// ---------------------------------------------------------------------------
// Probezeit und Befristung
// ---------------------------------------------------------------------------

export type Warnung = { stufe: 'rot' | 'gelb' | 'info'; text: string };

export const MAX_PROBEZEIT_MONATE = 6;
export const MAX_SACHGRUNDLOS_MONATE = 24;
export const MAX_VERLAENGERUNGEN = 3;
export const VORWARN_TAGE = 30;

export function warnungen(v: Vertrag, heute: string): Warnung[] {
  const w: Warnung[] = [];
  const beginn = v.beginn && istIso(v.beginn) ? v.beginn : null;
  if (!beginn) return [{ stufe: 'gelb', text: 'Kein Eintrittsdatum hinterlegt — Probezeit und Fristen lassen sich nicht berechnen.' }];

  // Probezeit / Wartezeit
  const pz = Number(v.probezeit_monate) || 0;
  if (pz > MAX_PROBEZEIT_MONATE) {
    w.push({ stufe: 'rot', text: `Probezeit von ${pz} Monaten: Die verkürzte Kündigungsfrist gilt höchstens 6 Monate (§ 622 Abs. 3 BGB).` });
  }
  if (pz > 0) {
    const ende = fristEnde(beginn, Math.min(pz, MAX_PROBEZEIT_MONATE));
    const rest = tageBis(heute, ende);
    if (rest >= 0 && rest <= VORWARN_TAGE) {
      w.push({ stufe: 'gelb', text: `Probezeit endet am ${datumDe(ende)} (in ${rest} Tagen). Entscheidung treffen — eine Kündigung mit kurzer Frist muss bis dahin ZUGEGANGEN sein.` });
    }
  }
  // Nach 6 Monaten greift der Kündigungsschutz (Betriebe mit mehr als 10 Beschäftigten)
  const wartezeit = fristEnde(beginn, 6);
  const restW = tageBis(heute, wartezeit);
  if (restW >= 0 && restW <= VORWARN_TAGE) {
    w.push({ stufe: 'info', text: `Ab dem ${datumDe(plusTage(wartezeit, 1))} gilt das Kündigungsschutzgesetz (sechs Monate Wartezeit, § 1 KSchG — in Betrieben mit mehr als 10 Beschäftigten).` });
  }

  // Befristung
  if (v.befristet) {
    const bis = v.befristet_bis && istIso(v.befristet_bis) ? v.befristet_bis : null;
    if (!bis) {
      w.push({ stufe: 'rot', text: 'Befristet, aber kein Enddatum hinterlegt.' });
    } else {
      const rest = tageBis(heute, bis);
      if (rest < 0) {
        w.push({ stufe: 'rot', text: `Die Befristung ist am ${datumDe(bis)} abgelaufen. Wird weitergearbeitet, gilt das Arbeitsverhältnis als unbefristet (§ 15 Abs. 6 TzBfG).` });
      } else if (rest <= VORWARN_TAGE) {
        w.push({ stufe: 'gelb', text: `Befristung endet am ${datumDe(bis)} (in ${rest} Tagen). Verlängern, entfristen oder rechtzeitig mitteilen.` });
      }
      const sachgrundlos = !String(v.sachgrund ?? '').trim();
      if (sachgrundlos) {
        const start = v.erstbefristung_beginn && istIso(v.erstbefristung_beginn) ? v.erstbefristung_beginn : beginn;
        const grenze = fristEnde(start, MAX_SACHGRUNDLOS_MONATE);
        if (bis > grenze) {
          w.push({ stufe: 'rot', text: `Ohne Sachgrund höchstens 2 Jahre (bis ${datumDe(grenze)}). Das eingetragene Ende ${datumDe(bis)} liegt darüber (§ 14 Abs. 2 TzBfG).` });
        }
        const vl = Number(v.verlaengerungen) || 0;
        if (vl > MAX_VERLAENGERUNGEN) {
          w.push({ stufe: 'rot', text: `${vl} Verlängerungen — ohne Sachgrund sind höchstens drei erlaubt (§ 14 Abs. 2 TzBfG).` });
        }
      }
      w.push({ stufe: 'info', text: 'Die Befristung braucht die Schriftform mit eigenhändiger Unterschrift beider Seiten VOR Arbeitsbeginn (§ 14 Abs. 4 TzBfG).' });
    }
  }
  return w;
}

// ---------------------------------------------------------------------------
// Beschäftigungsbestätigung (kein KI-Aufruf)
// ---------------------------------------------------------------------------

export function beschaeftigungsbestaetigung(d: {
  firma: string; ort: string; heute: string;
  name: string; geburtsdatum?: string | null; position?: string | null; beginn?: string | null;
  befristet?: boolean | null; befristet_bis?: string | null; wochenstunden?: number | null; gekuendigt?: boolean;
}): string {
  const zeilen = [
    `${d.ort || '[Ort]'}, ${datumDe(d.heute)}`,
    '',
    'Beschäftigungsbestätigung',
    '',
    `Hiermit bestätigen wir, dass ${d.name}${d.geburtsdatum && istIso(d.geburtsdatum) ? `, geboren am ${datumDe(d.geburtsdatum)},` : ''} seit dem ${datumDe(d.beginn)} bei ${d.firma || '[Firmenname]'} beschäftigt ist${d.position ? `, derzeit als ${d.position}` : ''}.`,
    '',
    d.befristet
      ? `Das Arbeitsverhältnis ist befristet bis zum ${datumDe(d.befristet_bis)}.`
      : 'Das Arbeitsverhältnis ist unbefristet.',
    d.wochenstunden ? `Die vereinbarte wöchentliche Arbeitszeit beträgt ${String(d.wochenstunden).replace('.', ',')} Stunden.` : '',
    d.gekuendigt === false ? 'Das Arbeitsverhältnis ist ungekündigt.' : '',
    '',
    'Diese Bestätigung wird auf Wunsch des Mitarbeiters ausgestellt.',
    '',
    '',
    '______________________________',
    d.firma || '[Firmenname]',
  ];
  return zeilen.filter((z, i, a) => !(z === '' && a[i - 1] === '')).join('\n').trim();
}

// ---------------------------------------------------------------------------
// Arbeitszeugnis
// ---------------------------------------------------------------------------

export const NOTEN: { note: number; label: string; formel: string }[] = [
  { note: 1, label: 'sehr gut', formel: 'stets zu unserer vollsten Zufriedenheit' },
  { note: 2, label: 'gut', formel: 'stets zu unserer vollen Zufriedenheit' },
  { note: 3, label: 'befriedigend', formel: 'zu unserer vollen Zufriedenheit' },
  { note: 4, label: 'ausreichend', formel: 'zu unserer Zufriedenheit' },
  { note: 5, label: 'mangelhaft', formel: 'im Großen und Ganzen zu unserer Zufriedenheit' },
];

export type ZeugnisEingabe = {
  art: 'end' | 'zwischen';
  qualifiziert: boolean;
  note: number;
  name: string;
  geschlecht: 'm' | 'w' | 'd';
  position: string;
  beginn: string;
  ende?: string | null;
  aufgaben: string;
  staerken?: string;
  austrittsgrund?: 'eigener_wunsch' | 'arbeitgeber' | 'einvernehmlich' | 'befristung' | 'keine_angabe';
  firma: string;
};

export function pruefeZeugnis(e: Partial<ZeugnisEingabe>): { ok: true } | { ok: false; fehler: string } {
  if (!String(e.name ?? '').trim()) return { ok: false, fehler: 'Name fehlt.' };
  if (!String(e.position ?? '').trim()) return { ok: false, fehler: 'Position fehlt.' };
  if (!e.beginn || !istIso(e.beginn)) return { ok: false, fehler: 'Eintrittsdatum fehlt.' };
  if (e.art === 'end' && (!e.ende || !istIso(e.ende))) return { ok: false, fehler: 'Für ein Endzeugnis bitte das Austrittsdatum angeben.' };
  if (e.qualifiziert && !NOTEN.some((n) => n.note === e.note)) return { ok: false, fehler: 'Bitte eine Note von 1 bis 5 wählen.' };
  if (e.qualifiziert && String(e.aufgaben ?? '').trim().length < 10) return { ok: false, fehler: 'Bitte die Aufgaben kurz beschreiben.' };
  return { ok: true };
}

export function zeugnisPrompt(e: ZeugnisEingabe): { system: string; nutzer: string } {
  const n = NOTEN.find((x) => x.note === e.note) ?? NOTEN[1];
  const anrede = e.geschlecht === 'w' ? 'Frau' : e.geschlecht === 'm' ? 'Herr' : '';
  return {
    system: `Sie schreiben deutsche Arbeitszeugnisse in der üblichen Zeugnissprache. Das Zeugnis muss wohlwollend und wahr sein (§ 109 GewO).
Regeln:
- Die Gesamtnote gibt der Arbeitgeber vor: „${n.label}". Die Leistungsbeurteilung lautet GENAU: „${n.formel}". Das Verhalten wird passend zur selben Note formuliert.
- Keine versteckten Negativ-Codes, keine Hinweise auf Krankheit, Schwangerschaft, Betriebsratstätigkeit, Religion, Herkunft, Alter oder Gewerkschaft.
- Keine erfundenen Aufgaben oder Erfolge: nur verwenden, was angegeben ist. Fehlt etwas, Platzhalter in eckigen Klammern.
- ${e.qualifiziert ? 'Qualifiziertes Zeugnis: Firmenvorstellung (ein Satz), Beschäftigungsdauer und Position, Aufgaben (als Liste), Fachwissen, Arbeitsweise, Leistungsbeurteilung, Verhalten gegenüber Vorgesetzten, Kollegen und Kunden, Schlussformel.' : 'Einfaches Zeugnis: NUR Art und Dauer der Beschäftigung und die Aufgaben — KEINE Beurteilung von Leistung oder Verhalten.'}
- ${e.art === 'zwischen' ? 'Zwischenzeugnis: Präsens, Anlass „auf Wunsch" bzw. „[Anlass]", Schluss mit Dank und Freude auf weitere Zusammenarbeit.' : 'Endzeugnis: Vergangenheitsform. Schlussformel mit Bedauern, Dank und guten Wünschen passend zur Note.'}
- Nur der Zeugnistext, ohne Briefkopf und ohne Unterschriftszeile, ohne Markdown außer "- " für die Aufgabenliste.`,
    nutzer: [
      `Firma: ${e.firma || '[Firmenname]'}`,
      `Person: ${anrede} ${e.name}`.trim(),
      `Position: ${e.position}`,
      `Beschäftigt seit: ${datumDe(e.beginn)}${e.art === 'end' ? ` bis ${datumDe(e.ende ?? null)}` : ''}`,
      `Aufgaben: ${e.aufgaben}`,
      e.staerken ? `Besondere Stärken/Erfolge (vom Arbeitgeber): ${e.staerken}` : '',
      e.art === 'end' ? `Austrittsgrund: ${{ eigener_wunsch: 'auf eigenen Wunsch', arbeitgeber: 'keine Angabe im Zeugnis', einvernehmlich: 'im gegenseitigen Einvernehmen', befristung: 'mit Ablauf der Befristung', keine_angabe: 'keine Angabe im Zeugnis' }[e.austrittsgrund ?? 'keine_angabe']}` : '',
    ].filter(Boolean).join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Stellenanzeige + AGG-Prüfung
// ---------------------------------------------------------------------------

/** Formulierungen, die nach dem AGG Ärger machen können — mit Begründung. */
export const AGG_MUSTER: { re: RegExp; grund: string }[] = [
  { re: /\bjung(e|en|er|es)?\b|\bjünger/i, grund: 'Altersbezug („jung") — kann als Altersdiskriminierung gelten.' },
  { re: /\bberufsanfänger|\bmax(imal|\.)?\s*\d{2}\s*jahre\s*alt|\bbis\s*\d{2}\s*jahre\b|\bunter\s*\d{2}\s*jahre/i, grund: 'Altersgrenze oder Altersgruppe genannt.' },
  { re: /muttersprach/i, grund: '„Muttersprache" knüpft an die Herkunft an — besser „sehr gute Deutschkenntnisse".' },
  { re: /\b(deutsche?r?\s+staatsangehörigkeit|nur\s+deutsche)\b/i, grund: 'Staatsangehörigkeit als Bedingung — nur zulässig, wenn gesetzlich vorgeschrieben.' },
  { re: /\bbelastbar(keit)?\b/i, grund: '„Belastbar" kann Menschen mit Behinderung ausschließen — lieber konkret beschreiben, was gefordert ist.' },
  { re: /\b(christlich|konfession)/i, grund: 'Religionsbezug — nur bei kirchlichen Arbeitgebern unter engen Voraussetzungen zulässig.' },
  { re: /\bgut(es)?\s*aussehen|\bgepflegte?s?\s*erscheinung/i, grund: 'Äußeres Erscheinungsbild als Anforderung — riskant.' },
  { re: /\b(verheiratet|ledig|kinderlos|ohne\s+kinder)\b/i, grund: 'Familienstand gehört nicht in eine Stellenanzeige.' },
];

export function aggPruefung(text: string): string[] {
  const t = String(text ?? '');
  const funde: string[] = [];
  for (const m of AGG_MUSTER) if (m.re.test(t)) funde.push(m.grund);
  // Geschlechtsneutrale Ausschreibung: (m/w/d), (w/m/d), (m/w/x) o. ä. im Titel oder Text
  if (!/\(\s*[mwdx]\s*\/\s*[mwdx]\s*\/\s*[mwdx]\s*\)/i.test(t) && !/\balle geschlechter\b/i.test(t)) {
    funde.push('Kein geschlechtsneutraler Zusatz wie „(m/w/d)" — bitte im Stellentitel ergänzen (§ 11 AGG).');
  }
  return funde;
}

export type StellenEingabe = { titel: string; firma: string; ort: string; aufgaben: string; anforderungen: string; angebot: string; umfang: string };

export function stellenPrompt(e: StellenEingabe): { system: string; nutzer: string } {
  return {
    system: `Sie schreiben Stellenanzeigen für kleine und mittlere Betriebe — klar, ehrlich, ohne Floskeln.
Regeln:
- Titel mit „(m/w/d)".
- Aufbau: kurzer Einstieg über den Betrieb, „Ihre Aufgaben", „Das bringen Sie mit", „Das bieten wir", Kontakt/Bewerbung.
- AGG beachten: keine Angaben zu Alter, Geschlecht, Herkunft, Religion, Behinderung, Familienstand; nicht „jung", nicht „Muttersprache", nicht „belastbar".
- Keine erfundenen Leistungen, Gehälter oder Zahlen — fehlt etwas, Platzhalter in eckigen Klammern.
- Bewerber werden mit „Sie" angesprochen.
- Nur der Anzeigentext, Zwischenüberschriften mit "## ", Listen mit "- ".`,
    nutzer: [
      `Stelle: ${e.titel}`, `Betrieb: ${e.firma || '[Firmenname]'}`, e.ort ? `Ort: ${e.ort}` : '',
      e.umfang ? `Umfang: ${e.umfang}` : '', `Aufgaben: ${e.aufgaben}`, `Anforderungen: ${e.anforderungen}`,
      e.angebot ? `Was wir bieten: ${e.angebot}` : '',
    ].filter(Boolean).join('\n'),
  };
}

/** Markdown-Zäune und Vorrede vom KI-Text entfernen. */
export function saeubere(roh: unknown): string {
  return String(roh ?? '').replace(/\r\n/g, '\n').trim()
    .replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '')
    .replace(/^\s*(hier ist|gerne)[^\n]*\n+/i, '')
    .trim();
}
