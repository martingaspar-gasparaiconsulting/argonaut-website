// ============================================================================
// ARGONAUT OS · lib/multiplikator.ts — Partner, Multiplikatoren, Provisionen
//
// ABGRENZUNG ZU lib/provision.ts
// `lib/provision.ts` rechnet die INNERBETRIEBLICHE Verkaufsprovision: eigener
// Vertriebler, gewonnener CRM-Deal, Empfaenger als Freitext. Das bleibt, wie
// es ist. Diese Datei ist etwas anderes: EXTERNE Partner mit Stammdaten,
// eigenen Konditionen, Gegengeschaeft und einer Auszahlungsstrecke.
//
// DREI PARTNERMODELLE, WEIL DER MITTELSTAND SIE ALLE DREI HAT
//   einmalig       — eine Vermittlung, eine Provision. Der Normalfall.
//   wiederkehrend  — laufender Anteil, solange der Kunde zahlt (Abo-Geschaeft).
//                    Braucht eine Periode, sonst legt man denselben Monat
//                    zweimal an — dagegen steht der Unique-Index im SQL.
//   gegengeschaeft — der Partner bekommt einen Zugang statt Geld und liefert
//                    dafuer Vertrag, Logo-Freigabe und ein Zitat. Hier wird
//                    NIE Geld faellig; wer das verwechselt, zahlt doppelt.
//
// DER STEUERPUNKT, DEN MAN LEICHT UEBERSIEHT
// Bei Vermittlungsprovision stellt ueblicherweise der ZAHLENDE die Rechnung
// aus — als Gutschrift (§ 14 Abs. 2 UStG). Ist der Partner Kleinunternehmer
// nach § 19, darf dabei KEINE Umsatzsteuer stehen: weist man sie trotzdem
// aus, schuldet er sie dem Finanzamt, obwohl er sie nie behalten darf.
// Deshalb haengt der Steuerausweis am Partner, nicht an einer Voreinstellung.
//
// Keine Imports, keine Hooks — node-testbar.
// ============================================================================

export type PartnerArt = 'empfehlung' | 'multiplikator' | 'vertrieb';
export type PartnerModell = 'einmalig' | 'wiederkehrend' | 'gegengeschaeft';
export type PartnerStatus = 'aktiv' | 'pausiert' | 'beendet';
export type ZuordnungStatus = 'offen' | 'faellig' | 'ausgezahlt' | 'storniert';

export type Partner = {
  id?: string;
  name?: string | null;
  firma?: string | null;
  email?: string | null;
  art?: string | null;
  modell?: string | null;
  satz_prozent?: number | string | null;
  laufzeit_monate?: number | string | null;
  status?: string | null;
  ust_pflichtig?: boolean | null;
  iban?: string | null;
  kontoinhaber?: string | null;
  zugang_gewaehrt_am?: string | null;
  gegen_vertrag_am?: string | null;
  gegen_logo?: boolean | null;
  gegen_zitat?: string | null;
};

export type Zuordnung = {
  id?: string;
  partner_id?: string | null;
  kunde_name?: string | null;
  basis_netto?: number | string | null;
  satz_prozent?: number | string | null;
  betrag?: number | string | null;
  periode?: string | null;
  status?: string | null;
  faellig_am?: string | null;
  ausgezahlt_am?: string | null;
};

export const ART_LABEL: Record<PartnerArt, string> = {
  empfehlung: 'Empfehlungsgeber',
  multiplikator: 'Multiplikator',
  vertrieb: 'Vertriebspartner',
};

export const ART_ERKLAERUNG: Record<PartnerArt, string> = {
  empfehlung: 'Empfiehlt gelegentlich weiter — ein zufriedener Kunde, ein Bekannter aus dem Netzwerk.',
  multiplikator: 'Steht regelmäßig vor Ihrer Zielgruppe: Steuerberater, Innung, Verband, Berater.',
  vertrieb: 'Verkauft aktiv für Sie und arbeitet mit festen Konditionen.',
};

export const MODELL_LABEL: Record<PartnerModell, string> = {
  einmalig: 'Einmalige Provision',
  wiederkehrend: 'Laufende Beteiligung',
  gegengeschaeft: 'Gegengeschäft statt Geld',
};

export const STATUS_LABEL: Record<PartnerStatus, string> = {
  aktiv: 'Aktiv',
  pausiert: 'Pausiert',
  beendet: 'Beendet',
};

export const ZUORDNUNG_LABEL: Record<ZuordnungStatus, string> = {
  offen: 'Offen',
  faellig: 'Fällig',
  ausgezahlt: 'Ausgezahlt',
  storniert: 'Storniert',
};

const UST_SATZ = 19;

// ---------------------------------------------------------------------------
// Zahlen
// ---------------------------------------------------------------------------

export function z(x: unknown): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') {
    const roh = x.trim();
    if (!roh) return 0;
    // "1.234,50" und "1234.50" sollen beide funktionieren.
    const deutsch = /,\d{1,2}$/.test(roh) || (roh.includes('.') && roh.includes(','));
    const sauber = deutsch ? roh.replace(/\./g, '').replace(',', '.') : roh.replace(',', '.');
    const n = Number(sauber.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function euro(n: unknown): string {
  return z(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export function prozent(n: unknown): string {
  const w = z(n);
  const s = w.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return `${s} %`;
}

// ---------------------------------------------------------------------------
// Die Rechnung selbst
// ---------------------------------------------------------------------------

/** Provision = Bemessungsgrundlage × Satz. Negative Werte gibt es nicht. */
export function provisionBetrag(basisNetto: unknown, satzProzent: unknown): number {
  const basis = z(basisNetto);
  const satz = z(satzProzent);
  if (basis <= 0 || satz <= 0) return 0;
  return r2(basis * (satz / 100));
}

export function modellVon(p: Partner): PartnerModell {
  const m = String(p.modell ?? 'einmalig');
  return m === 'wiederkehrend' || m === 'gegengeschaeft' ? m : 'einmalig';
}

export function artVon(p: Partner): PartnerArt {
  const a = String(p.art ?? 'empfehlung');
  return a === 'multiplikator' || a === 'vertrieb' ? a : 'empfehlung';
}

export function statusVon(p: Partner): PartnerStatus {
  const s = String(p.status ?? 'aktiv');
  return s === 'pausiert' || s === 'beendet' ? s : 'aktiv';
}

/**
 * Wird bei diesem Partner ueberhaupt Geld faellig? Beim Gegengeschaeft nicht —
 * er hat seinen Zugang bekommen. Diese eine Zeile verhindert, dass jemand
 * zusaetzlich Provision auszahlt.
 */
export function erwartetGeld(p: Partner): boolean {
  return modellVon(p) !== 'gegengeschaeft';
}

// ---------------------------------------------------------------------------
// Gegengeschaeft: was ist geliefert, was fehlt?
// ---------------------------------------------------------------------------

export type GegenStand = {
  erfuellt: number;
  gesamt: number;
  offen: string[];
  vollstaendig: boolean;
  /** Zugang laeuft, Gegenleistung fehlt — genau das schaut sonst niemand nach. */
  schuldet: boolean;
};

export function gegengeschaeftStand(p: Partner): GegenStand {
  const teile: Array<{ label: string; da: boolean }> = [
    { label: 'Unterschriebener Vertrag', da: Boolean(p.gegen_vertrag_am) },
    { label: 'Logo-Freigabe', da: Boolean(p.gegen_logo) },
    { label: 'Referenz-Zitat', da: Boolean((p.gegen_zitat ?? '').trim()) },
  ];
  const offen = teile.filter((t) => !t.da).map((t) => t.label);
  const erfuellt = teile.length - offen.length;
  const vollstaendig = offen.length === 0;
  return {
    erfuellt,
    gesamt: teile.length,
    offen,
    vollstaendig,
    schuldet: Boolean(p.zugang_gewaehrt_am) && !vollstaendig,
  };
}

// ---------------------------------------------------------------------------
// Perioden bei laufender Beteiligung
// ---------------------------------------------------------------------------

/** '2026-08' aus einem ISO-Datum. Leere oder unsinnige Eingaben ergeben ''. */
export function periodeAus(isoDatum: string | null | undefined): string {
  const s = String(isoDatum ?? '').trim();
  if (!/^\d{4}-\d{2}/.test(s)) return '';
  return s.slice(0, 7);
}

export function periodeLesbar(periode: string | null | undefined): string {
  const p = String(periode ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(p)) return p;
  const monate = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const jahr = p.slice(0, 4);
  const nr = Number(p.slice(5, 7));
  if (nr < 1 || nr > 12) return p;
  return `${monate[nr - 1]} ${jahr}`;
}

/**
 * Die Perioden, fuer die eine laufende Beteiligung faellig wird.
 * Ohne Laufzeit gibt es keine Liste — unbefristete Provision ohne Ende ist
 * fast immer ein Versehen und waere hier eine Endlosschleife.
 */
export function perioden(startISO: string, laufzeitMonate: unknown): string[] {
  const start = periodeAus(startISO);
  const dauer = Math.floor(z(laufzeitMonate));
  if (!start || dauer <= 0) return [];
  const grenze = Math.min(dauer, 240); // 20 Jahre sind mehr als genug
  const jahr = Number(start.slice(0, 4));
  const monat = Number(start.slice(5, 7));
  const liste: string[] = [];
  for (let i = 0; i < grenze; i++) {
    const gesamt = (jahr * 12 + (monat - 1)) + i;
    const j = Math.floor(gesamt / 12);
    const m = (gesamt % 12) + 1;
    liste.push(`${j}-${String(m).padStart(2, '0')}`);
  }
  return liste;
}

/** Welche Perioden fehlen noch? Verhindert doppelte Anlage. */
export function fehlendePerioden(alle: string[], vorhanden: Array<string | null | undefined>): string[] {
  const da = new Set(vorhanden.map((p) => String(p ?? '').trim()).filter(Boolean));
  return alle.filter((p) => !da.has(p));
}

// ---------------------------------------------------------------------------
// Summen
// ---------------------------------------------------------------------------

export type Summen = {
  gesamt: number;
  offen: number;
  faellig: number;
  ausgezahlt: number;
  storniert: number;
  anzahl: number;
};

export function summen(zuordnungen: Zuordnung[]): Summen {
  const s: Summen = { gesamt: 0, offen: 0, faellig: 0, ausgezahlt: 0, storniert: 0, anzahl: 0 };
  for (const zu of zuordnungen || []) {
    const betrag = z(zu.betrag);
    const st = String(zu.status ?? 'offen');
    if (st === 'storniert') { s.storniert += betrag; continue; }
    s.anzahl += 1;
    s.gesamt += betrag;
    if (st === 'ausgezahlt') s.ausgezahlt += betrag;
    else if (st === 'faellig') s.faellig += betrag;
    else s.offen += betrag;
  }
  return {
    gesamt: r2(s.gesamt), offen: r2(s.offen), faellig: r2(s.faellig),
    ausgezahlt: r2(s.ausgezahlt), storniert: r2(s.storniert), anzahl: s.anzahl,
  };
}

export type PartnerZeile = {
  partner: Partner;
  summen: Summen;
  gegen: GegenStand;
  /** Was jetzt ausgezahlt werden kann: offen + faellig. */
  auszahlbar: number;
};

export function proPartner(partner: Partner[], zuordnungen: Zuordnung[]): PartnerZeile[] {
  const nachPartner = new Map<string, Zuordnung[]>();
  for (const zu of zuordnungen || []) {
    const pid = String(zu.partner_id ?? '');
    if (!pid) continue;
    const liste = nachPartner.get(pid) ?? [];
    liste.push(zu);
    nachPartner.set(pid, liste);
  }

  return (partner || []).map((p) => {
    const eigene = nachPartner.get(String(p.id ?? '')) ?? [];
    const s = summen(eigene);
    return {
      partner: p,
      summen: s,
      gegen: gegengeschaeftStand(p),
      auszahlbar: erwartetGeld(p) ? r2(s.offen + s.faellig) : 0,
    };
  }).sort((a, b) => b.auszahlbar - a.auszahlbar
    || String(a.partner.name ?? '').localeCompare(String(b.partner.name ?? ''), 'de'));
}

// ---------------------------------------------------------------------------
// Gutschrift: was steht auf dem Beleg?
// ---------------------------------------------------------------------------

export type Gutschrift = {
  netto: number;
  ustSatz: number;
  ust: number;
  brutto: number;
  hinweis: string;
  positionen: Array<{ text: string; betrag: number }>;
};

/**
 * Baut die Zahlen fuer eine Provisionsgutschrift. Der Provisionsbetrag ist
 * immer der NETTO-Betrag — er wurde auf den Netto-Umsatz gerechnet.
 */
export function baueGutschrift(p: Partner, zuordnungen: Zuordnung[]): Gutschrift {
  const zeilen = (zuordnungen || []).filter((zu) => String(zu.status ?? '') !== 'storniert');
  const positionen = zeilen.map((zu) => ({
    text: [
      zu.kunde_name || 'Vermittlung',
      zu.periode ? periodeLesbar(zu.periode) : '',
      `${prozent(zu.satz_prozent)} aus ${euro(zu.basis_netto)}`,
    ].filter(Boolean).join(' · '),
    betrag: r2(z(zu.betrag)),
  }));

  const netto = r2(positionen.reduce((a, b) => a + b.betrag, 0));
  const pflichtig = p.ust_pflichtig !== false;
  const ustSatz = pflichtig ? UST_SATZ : 0;
  const ust = pflichtig ? r2(netto * (UST_SATZ / 100)) : 0;

  return {
    netto,
    ustSatz,
    ust,
    brutto: r2(netto + ust),
    hinweis: pflichtig
      ? 'Gutschrift im Sinne des § 14 Abs. 2 UStG. Der Betrag wird ohne gesonderte Rechnung des Empfängers abgerechnet.'
      : 'Gutschrift im Sinne des § 14 Abs. 2 UStG. Kein Ausweis von Umsatzsteuer — der Empfänger ist Kleinunternehmer nach § 19 UStG.',
    positionen,
  };
}

/** Kennung eines Auszahlungslaufs: PROV-2026-08-01 */
export function laufKennung(periode: string, nummer: number): string {
  const p = /^\d{4}-\d{2}$/.test(periode) ? periode : '0000-00';
  const n = Math.max(1, Math.floor(z(nummer)));
  return `PROV-${p}-${String(n).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Eingabepruefung
// ---------------------------------------------------------------------------

export function pruefePartner(p: Partner): string[] {
  const fehler: string[] = [];
  if (!String(p.name ?? '').trim()) fehler.push('Bitte einen Namen eintragen.');

  const satz = z(p.satz_prozent);
  const modell = modellVon(p);

  if (modell !== 'gegengeschaeft') {
    if (satz <= 0) fehler.push('Bitte einen Provisionssatz größer als 0 eintragen.');
    if (satz > 50) fehler.push('Ein Satz über 50 % ist ungewöhnlich hoch — bitte prüfen.');
  }
  if (modell === 'wiederkehrend') {
    const dauer = z(p.laufzeit_monate);
    if (dauer <= 0) fehler.push('Bei laufender Beteiligung bitte eine Laufzeit in Monaten angeben.');
    if (dauer > 240) fehler.push('Die Laufzeit ist auf 240 Monate begrenzt.');
  }

  const mail = String(p.email ?? '').trim();
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) fehler.push('Die E-Mail-Adresse sieht nicht richtig aus.');

  const iban = String(p.iban ?? '').replace(/\s/g, '');
  if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i.test(iban)) fehler.push('Die IBAN sieht nicht richtig aus.');

  return fehler;
}

export function pruefeZuordnung(zu: Zuordnung, p?: Partner): string[] {
  const fehler: string[] = [];
  if (!String(zu.partner_id ?? '').trim()) fehler.push('Bitte einen Partner auswählen.');
  if (z(zu.basis_netto) <= 0) fehler.push('Bitte den vermittelten Netto-Umsatz eintragen.');
  if (z(zu.satz_prozent) <= 0) fehler.push('Bitte einen Provisionssatz eintragen.');
  if (p && !erwartetGeld(p)) {
    fehler.push('Dieser Partner arbeitet auf Gegengeschäft — hier wird keine Provision fällig.');
  }
  if (p && statusVon(p) === 'beendet') fehler.push('Die Zusammenarbeit mit diesem Partner ist beendet.');
  return fehler;
}

/** IBAN nur fuer die Anzeige verkuerzen: DE89 ****  **** 3000 */
export function ibanKurz(iban: string | null | undefined): string {
  const roh = String(iban ?? '').replace(/\s/g, '');
  if (roh.length < 8) return roh;
  return `${roh.slice(0, 4)} •••• ${roh.slice(-4)}`;
}
