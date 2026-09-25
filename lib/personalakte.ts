// ============================================================================
// ARGONAUT OS · lib/personalakte.ts — Personalakte vollstaendig? (Paket A1)
//
// WOFUER
// Der Chef legt einen Mitarbeiter an und weiss danach nicht, was noch fehlt.
// Diese Datei beantwortet genau das: eine feste Liste, was zu einer
// vollstaendigen Personalakte gehoert, je Punkt "erledigt / fehlt", WO man es
// eintraegt (Reiter im Personal-Drawer oder eigene Seite) und ein Satz, warum.
// Der KI-Guide liest dieselbe Liste — er erfindet nichts dazu.
//
// WER TRAEGT EIN
// Alles hier traegt der CHEF ein (bzw. wer die Personal-Freigabe hat). Der
// Mitarbeiter sieht in "Mein Bereich" nur, was der Chef ausdruecklich
// freigibt (hr_dokumente.fuer_mitarbeiter).
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE Hooks. Getestet in
// tests/personalakteA1.test.mjs.
//
// KEINE RECHTSBERATUNG: Die Liste ist eine Arbeitshilfe (NachwG, § 12 ArbSchG,
// Lohnunterlagen). Sie ersetzt nicht Steuerbuero oder Anwalt (Anwalt-Punkt R24).
// ============================================================================

/** Wo im System der Punkt erledigt wird. */
import { leseZahlOder } from './zahlen';
export type AkteOrt = 'stamm' | 'docs' | 'schul' | 'nachweis' | 'zugang';

export type AktePunkt = {
  key: string;
  gruppe: 'pflicht' | 'empfohlen';
  text: string;
  ort: AkteOrt;
  /** Ein Satz: warum der Punkt dazugehoert. */
  warum: string;
};

export const AKTE_PUNKTE: AktePunkt[] = [
  { key: 'geburtsdatum', gruppe: 'pflicht', text: 'Geburtsdatum', ort: 'stamm', warum: 'Braucht das Steuerbüro für die Lohnabrechnung und die Sozialversicherung.' },
  { key: 'adresse', gruppe: 'pflicht', text: 'Anschrift', ort: 'stamm', warum: 'Gehört in den Arbeitsvertrag und auf jede Lohnabrechnung.' },
  { key: 'eintritt', gruppe: 'pflicht', text: 'Eintrittsdatum', ort: 'stamm', warum: 'Daran hängen Probezeit, Kündigungsfristen und Urlaubsanspruch.' },
  { key: 'arbeitszeit', gruppe: 'pflicht', text: 'Arbeitszeit (Modell und Wochenstunden)', ort: 'stamm', warum: 'Pflichtangabe im Nachweis der Arbeitsbedingungen und Grundlage für Zeiterfassung und Dienstplan.' },
  { key: 'urlaub', gruppe: 'pflicht', text: 'Urlaubsanspruch in Tagen', ort: 'stamm', warum: 'Pflichtangabe im Nachweis; daraus rechnet „Mein Bereich" den Resturlaub.' },
  { key: 'steuer_id', gruppe: 'pflicht', text: 'Steuer-ID (11 Ziffern)', ort: 'stamm', warum: 'Ohne Steuer-ID kann das Steuerbüro keine Lohnsteuer anmelden.' },
  { key: 'sv_nummer', gruppe: 'pflicht', text: 'Sozialversicherungsnummer', ort: 'stamm', warum: 'Pflicht für die Anmeldung bei der Krankenkasse.' },
  { key: 'iban', gruppe: 'pflicht', text: 'Bankverbindung (IBAN)', ort: 'stamm', warum: 'Dorthin geht der Lohn.' },
  { key: 'vertrag_dok', gruppe: 'pflicht', text: 'Arbeitsvertrag als Datei abgelegt', ort: 'docs', warum: 'Der unterschriebene Vertrag gehört in die Akte, damit er jederzeit griffbereit ist.' },
  { key: 'nachweis', gruppe: 'pflicht', text: 'Nachweis der Arbeitsbedingungen erteilt', ort: 'nachweis', warum: 'Das Nachweisgesetz verlangt die wesentlichen Bedingungen schriftlich, teils schon am ersten Arbeitstag.' },
  { key: 'unterweisung', gruppe: 'pflicht', text: 'Arbeitsschutz-Unterweisung gültig', ort: 'schul', warum: 'Vor Arbeitsbeginn und danach regelmäßig, in der Regel jährlich (§ 12 ArbSchG).' },
  { key: 'kontakt', gruppe: 'empfohlen', text: 'E-Mail oder Telefon', ort: 'stamm', warum: 'Ohne E-Mail keine Einladung in „Mein Bereich".' },
  { key: 'notfall', gruppe: 'empfohlen', text: 'Notfallkontakt', ort: 'stamm', warum: 'Wen Sie anrufen, wenn auf der Arbeit etwas passiert.' },
  { key: 'position', gruppe: 'empfohlen', text: 'Position / Tätigkeit', ort: 'stamm', warum: 'Die Tätigkeit gehört in den Nachweis und in jedes spätere Zeugnis.' },
  { key: 'datenschutz', gruppe: 'empfohlen', text: 'Datenschutz-Verpflichtung', ort: 'schul', warum: 'Wer mit Kundendaten arbeitet, sollte auf Vertraulichkeit verpflichtet sein.' },
  { key: 'lohn_dok', gruppe: 'empfohlen', text: 'Lohnabrechnungen abgelegt', ort: 'docs', warum: 'Ältere Abrechnungen braucht der Mitarbeiter oft, zum Beispiel für die Bank.' },
  { key: 'zugang', gruppe: 'empfohlen', text: 'Zugang zu „Mein Bereich" eingeladen', ort: 'zugang', warum: 'Dann stempelt der Mitarbeiter selbst, beantragt Urlaub und sieht seine freigegebenen Unterlagen.' },
];

export const ORT_TEXT: Record<AkteOrt, string> = {
  stamm: 'Reiter „Stammdaten"',
  docs: 'Reiter „Dokumente"',
  schul: 'Reiter „Schulungen"',
  nachweis: 'Seite „Personal-Dokumente" (alle Pflichtpunkte abhaken und speichern)',
  zugang: 'Knopf „Zum Self-Service einladen" (Stammdaten)',
};

// ---------------------------------------------------------------------------
// Formate (nur Form, keine amtliche Pruefung)
// ---------------------------------------------------------------------------

function ohneLeer(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, '').toUpperCase();
}

/** Steuer-ID: genau 11 Ziffern, erste Ziffer nicht 0. Pruefziffer wird NICHT gerechnet. */
export function pruefeSteuerId(s: unknown): boolean {
  return /^[1-9]\d{10}$/.test(ohneLeer(s));
}

/**
 * SV-Nummer: 12 Zeichen — 2 Ziffern Bereich, 6 Ziffern Geburtsdatum (TTMMJJ),
 * 1 Buchstabe, 3 Ziffern. Nur die Form; die Pruefziffer rechnen wir nicht.
 */
export function pruefeSvNummer(s: unknown): boolean {
  const t = ohneLeer(s);
  if (!/^\d{2}\d{6}[A-Z]\d{3}$/.test(t)) return false;
  const tag = Number(t.slice(2, 4));
  const monat = Number(t.slice(4, 6));
  return tag >= 1 && tag <= 31 && monat >= 1 && monat <= 12;
}

/** IBAN mit echter Pruefsumme (Modulo 97). Deutsche IBAN muss 22 Zeichen haben. */
export function pruefeIban(s: unknown): boolean {
  const t = ohneLeer(s);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(t)) return false;
  if (t.startsWith('DE') && t.length !== 22) return false;
  const umgestellt = t.slice(4) + t.slice(0, 4);
  let rest = 0;
  for (const z of umgestellt) {
    const wert = /[A-Z]/.test(z) ? String(z.charCodeAt(0) - 55) : z;
    for (const ziffer of wert) rest = (rest * 10 + Number(ziffer)) % 97;
  }
  return rest === 1;
}

// ---------------------------------------------------------------------------
// Stand der Akte
// ---------------------------------------------------------------------------

export type AkteEingabe = {
  vorname?: string | null;
  nachname?: string | null;
  email?: string | null;
  telefon?: string | null;
  position?: string | null;
  geburtsdatum?: string | null;
  adresse?: string | null;
  eintrittsdatum?: string | null;
  arbeitszeit_modell?: string | null;
  wochenstunden?: number | string | null;
  urlaubsanspruch_tage?: number | string | null;
  steuer_id?: string | null;
  sv_nummer?: string | null;
  iban?: string | null;
  notfall_kontakt?: string | null;
  eingeladen?: boolean | null;
  /** Kategorien der abgelegten Dokumente (vertrag, lohn, zeugnis …). */
  dokKategorien?: (string | null | undefined)[] | null;
  /** Aus personal_vertrag. null = noch kein Vertrag erfasst. */
  nachweisErteiltAm?: string | null;
  schulungen?: { kategorie?: string | null; status?: string | null; gueltig_bis?: string | null }[] | null;
};

export type PunktStand = AktePunkt & {
  ok: boolean;
  /** Zusatz, wenn etwas eingetragen, aber falsch ist (z. B. IBAN-Pruefsumme). */
  hinweis?: string;
};

export type AkteStand = {
  punkte: PunktStand[];
  pflichtGesamt: number;
  pflichtOffen: number;
  empfohlenGesamt: number;
  empfohlenOffen: number;
  /** 0–100 ueber alle Punkte. */
  prozent: number;
  ampel: 'gruen' | 'gelb' | 'rot';
  /** Der erste offene Pflichtpunkt (sonst der erste offene empfohlene) — fuer den Guide. */
  naechster: PunktStand | null;
};

function gefuellt(s: unknown): boolean {
  return String(s ?? '').trim().length > 0;
}

function zahl(s: unknown): number {
  return leseZahlOder(s, 0);
}

function istIsoDatum(s: unknown): boolean {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);
}

/** Gilt eine Schulung dieser Kategorie heute (absolviert, nicht abgelaufen)? */
export function schulungGueltig(
  liste: AkteEingabe['schulungen'],
  kategorie: string,
  heute: string,
): boolean {
  const l = Array.isArray(liste) ? liste : [];
  return l.some((s) =>
    s?.kategorie === kategorie &&
    s?.status === 'absolviert' &&
    (!s?.gueltig_bis || String(s.gueltig_bis).slice(0, 10) >= heute));
}

export function akteStand(e: AkteEingabe | null | undefined, heute: string): AkteStand {
  const d: AkteEingabe = e ?? {};
  const kat = new Set((Array.isArray(d.dokKategorien) ? d.dokKategorien : []).map((k) => String(k ?? '')));

  const pruef: Record<string, () => { ok: boolean; hinweis?: string }> = {
    geburtsdatum: () => ({ ok: istIsoDatum(d.geburtsdatum) }),
    adresse: () => ({ ok: gefuellt(d.adresse) }),
    eintritt: () => ({ ok: istIsoDatum(d.eintrittsdatum) }),
    arbeitszeit: () => ({ ok: gefuellt(d.arbeitszeit_modell) && zahl(d.wochenstunden) > 0 }),
    urlaub: () => ({ ok: zahl(d.urlaubsanspruch_tage) > 0 }),
    steuer_id: () => {
      if (!gefuellt(d.steuer_id)) return { ok: false };
      return pruefeSteuerId(d.steuer_id) ? { ok: true } : { ok: false, hinweis: 'Eingetragen, aber keine 11 Ziffern — bitte prüfen.' };
    },
    sv_nummer: () => {
      if (!gefuellt(d.sv_nummer)) return { ok: false };
      return pruefeSvNummer(d.sv_nummer) ? { ok: true } : { ok: false, hinweis: 'Eingetragen, aber das Format passt nicht (Beispiel: 12 150385 M 123) — bitte prüfen.' };
    },
    iban: () => {
      if (!gefuellt(d.iban)) return { ok: false };
      return pruefeIban(d.iban) ? { ok: true } : { ok: false, hinweis: 'Eingetragen, aber die Prüfsumme stimmt nicht — vermutlich ein Tippfehler.' };
    },
    vertrag_dok: () => ({ ok: kat.has('vertrag') }),
    nachweis: () => ({ ok: istIsoDatum(d.nachweisErteiltAm) }),
    unterweisung: () => ({ ok: schulungGueltig(d.schulungen, 'arbeitsschutz', heute) }),
    kontakt: () => ({ ok: gefuellt(d.email) || gefuellt(d.telefon) }),
    notfall: () => ({ ok: gefuellt(d.notfall_kontakt) }),
    position: () => ({ ok: gefuellt(d.position) }),
    datenschutz: () => ({ ok: schulungGueltig(d.schulungen, 'datenschutz', heute) }),
    lohn_dok: () => ({ ok: kat.has('lohn') }),
    zugang: () => ({ ok: d.eingeladen === true }),
  };

  const punkte: PunktStand[] = AKTE_PUNKTE.map((p) => {
    const r = pruef[p.key] ? pruef[p.key]() : { ok: false };
    return r.hinweis ? { ...p, ok: r.ok, hinweis: r.hinweis } : { ...p, ok: r.ok };
  });

  const pflicht = punkte.filter((p) => p.gruppe === 'pflicht');
  const empf = punkte.filter((p) => p.gruppe === 'empfohlen');
  const pflichtOffen = pflicht.filter((p) => !p.ok).length;
  const empfohlenOffen = empf.filter((p) => !p.ok).length;
  const erledigt = punkte.filter((p) => p.ok).length;
  const prozent = punkte.length ? Math.round((erledigt / punkte.length) * 100) : 0;
  const ampel: AkteStand['ampel'] = pflichtOffen > 0 ? 'rot' : empfohlenOffen > 0 ? 'gelb' : 'gruen';
  const naechster = pflicht.find((p) => !p.ok) ?? empf.find((p) => !p.ok) ?? null;

  return {
    punkte,
    pflichtGesamt: pflicht.length,
    pflichtOffen,
    empfohlenGesamt: empf.length,
    empfohlenOffen,
    prozent,
    ampel,
    naechster,
  };
}

/** Ein Satz fuer Guide und Kopfzeile. */
export function akteSatz(s: AkteStand): string {
  if (s.pflichtOffen === 0 && s.empfohlenOffen === 0) return 'Die Personalakte ist vollständig.';
  if (s.pflichtOffen === 0) {
    return `Alle Pflichtangaben sind da. Empfohlen fehlen noch ${s.empfohlenOffen}.`;
  }
  const n = s.naechster;
  const wo = n ? ` Als Nächstes: ${n.text} — ${ORT_TEXT[n.ort]}.` : '';
  return `Es fehlen noch ${s.pflichtOffen} von ${s.pflichtGesamt} Pflichtangaben.${wo}`;
}

// ---------------------------------------------------------------------------
// Dokumente fuer den Mitarbeiter ("Mein Bereich" -> "Meine Unterlagen")
// ---------------------------------------------------------------------------

export const DOK_LABEL: Record<string, string> = {
  vertrag: 'Verträge',
  lohn: 'Lohn- und Gehaltsabrechnungen',
  zeugnis: 'Zeugnisse',
  zertifikat: 'Zertifikate und Nachweise',
  bewerbung: 'Bewerbung',
  sonstiges: 'Sonstiges',
};

/** Reihenfolge der Gruppen in "Meine Unterlagen". */
export const DOK_REIHENFOLGE = ['vertrag', 'lohn', 'zeugnis', 'zertifikat', 'sonstiges', 'bewerbung'];

export type MeinDok = {
  id: string;
  dateiname: string;
  kategorie: string | null;
  hochgeladen_am: string | null;
  fuer_mitarbeiter?: boolean | null;
  hochgeladen_von?: string | null;
};

/**
 * Was ein Mitarbeiter von seinen Dokumenten sehen darf: vom Chef freigegebene
 * und die, die er selbst hochgeladen hat (z. B. Krankmeldung). Die Datenbank
 * regelt das zusaetzlich per Zugriffsregel — dies ist die zweite Sicherung,
 * damit die Seite auch dann richtig ist, wenn die Regel noch fehlt.
 */
export function sichtbarFuerMitarbeiter(d: MeinDok, eigeneUid: string | null | undefined): boolean {
  if (d?.fuer_mitarbeiter === true) return true;
  return !!eigeneUid && d?.hochgeladen_von === eigeneUid;
}

/** Nach Gruppe sortieren, innerhalb der Gruppe das Neueste oben. */
export function gruppiereDokumente(liste: MeinDok[] | null | undefined): { kategorie: string; label: string; docs: MeinDok[] }[] {
  const l = Array.isArray(liste) ? liste : [];
  const gruppen = new Map<string, MeinDok[]>();
  for (const d of l) {
    const k = d?.kategorie && DOK_LABEL[d.kategorie] ? d.kategorie : 'sonstiges';
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k)!.push(d);
  }
  const aus: { kategorie: string; label: string; docs: MeinDok[] }[] = [];
  for (const k of DOK_REIHENFOLGE) {
    const docs = gruppen.get(k);
    if (!docs || docs.length === 0) continue;
    docs.sort((a, b) => String(b.hochgeladen_am ?? '').localeCompare(String(a.hochgeladen_am ?? '')));
    aus.push({ kategorie: k, label: DOK_LABEL[k], docs });
  }
  return aus;
}
