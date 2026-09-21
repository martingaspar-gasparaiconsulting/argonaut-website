// ============================================================================
// ARGONAUT OS · lib/einwilligung.ts — der Nachweis einer Einwilligung
//
// Punkt 65 / R12 · Paket 3 (21.09.2026). REINE Logik, node-testbar.
// Kein Supabase, kein fetch, keine Hooks. Zeitpunkte werden hereingereicht.
//
// ▄▄▄ DER BEFUND, am echten Code nachgesehen ▄▄▄
// Das Double-Opt-In-Verfahren ist da und es funktioniert:
//   app/api/oeffentlich/optin/route.ts              legt 'unbestaetigt' an,
//                                                   schickt die Bestätigungsmail
//   app/api/oeffentlich/optin-bestaetigen/route.ts  setzt 'aktiv' + bestaetigt_am
//   app/api/oeffentlich/web-newsletter/route.ts     dasselbe von der Website aus
//
// Was fehlt, ist der NACHWEIS. Gespeichert wird heute nur `bestaetigt_am`:
//
//  1. KEIN Zeitpunkt der Anmeldung. Wann das Formular abgeschickt wurde, steht
//     nirgends — nur, wann geklickt wurde.
//  2. KEINE IP. Weder bei der Anmeldung noch bei der Bestätigung. Damit lässt
//     sich nicht zeigen, dass die Bestätigung überhaupt von einem Gerät kam.
//  3. KEIN Einwilligungstext. Der Wortlaut steht in profiles.optin_titel und
//     profiles.optin_text — der Betrieb kann ihn jederzeit ändern. Ändert er
//     ihn, ist nicht mehr feststellbar, WORIN der Abonnent eingewilligt hat.
//     Das ist der schwerste der drei Punkte.
//  4. web-newsletter prüft `b.privacy === true`, SPEICHERT aber nicht, dass
//     das Häkchen gesetzt war. optin prüft es gar nicht erst.
//
// Nebenbefund beim Lesen: lib/besucherKennung.ts hat mit leseIp() bereits eine
// saubere Funktion, um die Adresse hinter Vercel aus `x-forwarded-for` zu
// holen. Sie wird hier benutzt statt neu geschrieben.
//
// ▄▄▄ WORAUF SICH DAS STÜTZT ▄▄▄
// Jede Angabe trägt eine Belegstufe:
//   'belegt'  — im Gesetzestext bzw. im Leitsatz der Entscheidung nachlesbar
//   'pruefen' — ständige Praxis, aber nicht einheitlich entschieden;
//               das gehört auf die Liste für den Anwaltstermin
//
// Diese Datei ersetzt keine Rechtsberatung. Sie sorgt dafür, dass die Daten,
// die ein Anwalt oder eine Aufsichtsbehörde sehen will, überhaupt VORHANDEN
// sind — was heute nicht der Fall ist.
// ============================================================================

import { createHash } from 'node:crypto';
import { leseIp } from './besucherKennung';
import { ipArt, ipBereich, ipv6Gruppen, normalisiereHost, type IpArt } from './adressPruefung';

export type Belegstufe = 'belegt' | 'pruefen';

export type Rechtsgrundlage = {
  norm: string;
  kern: string;
  stufe: Belegstufe;
};

export const GRUNDLAGEN: readonly Rechtsgrundlage[] = [
  {
    norm: 'Art. 7 Abs. 1 DSGVO',
    kern: 'Beruht die Verarbeitung auf einer Einwilligung, muss der Verantwortliche nachweisen können, dass die betroffene Person eingewilligt hat.',
    stufe: 'belegt',
  },
  {
    norm: 'Art. 5 Abs. 2 DSGVO',
    kern: 'Der Verantwortliche ist für die Einhaltung verantwortlich und muss sie nachweisen können (Rechenschaftspflicht).',
    stufe: 'belegt',
  },
  {
    norm: '§ 7 Abs. 2 Nr. 2 UWG',
    kern: 'Werbung mit elektronischer Post ohne vorherige ausdrückliche Einwilligung des Empfängers ist eine unzumutbare Belästigung.',
    stufe: 'belegt',
  },
  {
    norm: 'BGH, Urteil vom 10.02.2011 – I ZR 164/09 („Double-opt-in-Verfahren")',
    kern: 'Das Double-Opt-In-Verfahren ist geeignet, eine Einwilligung zu belegen; der Werbende muss den Vorgang vollständig dokumentieren.',
    stufe: 'belegt',
  },
  {
    norm: '§ 195, § 199 Abs. 1 BGB',
    kern: 'Die regelmäßige Verjährungsfrist beträgt drei Jahre und beginnt mit dem Schluss des Jahres, in dem der Anspruch entstanden ist.',
    stufe: 'belegt',
  },
  {
    norm: 'Aufbewahrung des Nachweises über das Ende der Einwilligung hinaus',
    kern: 'Der Nachweis wird bis zum Ablauf der Verjährungsfrist aufbewahrt, damit er im Streitfall noch vorliegt. Dauer und Rechtsgrundlage sind nicht einheitlich entschieden.',
    stufe: 'pruefen',
  },
  {
    norm: 'Veralten einer nicht genutzten Einwilligung',
    kern: 'Eine über lange Zeit nicht genutzte Einwilligung kann ihre Wirkung verlieren (so etwa OLG München, 27.09.2012 – 29 U 1682/12 bei rund eineinhalb Jahren). Eine feste Frist gibt es nicht.',
    stufe: 'pruefen',
  },
];

/** Jahre, die der Nachweis nach dem Ende der Einwilligung aufbewahrt wird. */
export const AUFBEWAHRUNG_JAHRE = 3;

/**
 * Monate, nach denen eine nie genutzte Einwilligung als möglicherweise
 * veraltet gemeldet wird. Belegstufe 'pruefen' — das ist eine Warnung für den
 * Betrieb, keine Sperre.
 */
export const VERALTET_MONATE = 18;

/** Mehr Text als das ist kein Einwilligungstext mehr. */
export const TEXT_MAX_ZEICHEN = 20_000;

// ----------------------------------------------------------------------------
// EIN EINZELNER SCHRITT
// ----------------------------------------------------------------------------

export type EinwilligungSchritt = 'anmeldung' | 'bestaetigung';

export type EinwilligungEingabe = {
  schritt: EinwilligungSchritt;
  /** Zeitpunkt als ISO-Text. Wird hereingereicht, damit die Funktion testbar bleibt. */
  zeitpunktIso: string;
  /** Die Adresse des Anfragenden. Roh, so wie leseIp() sie liefert. */
  ip?: string | null;
  /** user-agent. */
  browser?: string | null;
  /** accept-language. */
  sprache?: string | null;
  /** Der WORTLAUT, dem zugestimmt wurde. Ohne ihn ist der Nachweis wertlos. */
  text?: string | null;
  /** Kennzeichen der Textfassung, z. B. "optin-2026-09" — erleichtert das Zuordnen. */
  textFassung?: string | null;
  /** Woher die Anmeldung kam: 'opt-in', 'website', 'landingpage' … */
  quelle?: string | null;
  /** Die Seite, auf der zugestimmt wurde. */
  formularUrl?: string | null;
  /** War das Zustimmungs-Häkchen gesetzt? null = nicht erhoben. */
  haekchenGesetzt?: boolean | null;
};

export type Einwilligungseintrag = {
  schritt: EinwilligungSchritt;
  zeitpunktIso: string;
  /** Der Zeitpunkt als Zahl — 0, wenn unlesbar. */
  zeitpunktMs: number;
  ip: string;
  ipArt: IpArt;
  /** Die Adresse liegt im öffentlichen Internet (und ist damit aussagekräftig). */
  ipOeffentlich: boolean;
  browser: string;
  sprache: string;
  quelle: string;
  formularUrl: string;
  haekchenGesetzt: boolean | null;
  text: string;
  textFassung: string;
  /** SHA-256 des Textes. Wird der Text später geändert, fällt das auf. */
  textFingerabdruck: string;
  /** Alles da, was der Nachweis braucht? */
  vollstaendig: boolean;
  /** Was fehlt — in Klartext, für die Oberfläche. */
  fehlend: string[];
};

function txt(v: unknown): string {
  return String(v ?? '').trim();
}

/** SHA-256 über den Einwilligungstext, in Hex. Leerer Text ergibt leeren Wert. */
export function textFingerabdruck(text: unknown): string {
  const t = txt(text);
  if (t === '') return '';
  return createHash('sha256').update(t, 'utf8').digest('hex');
}

/**
 * Die IP so aufbereiten, wie sie in den Nachweis gehört: aufgeräumt, aber
 * VOLLSTÄNDIG.
 *
 * Bewusst NICHT gekürzt. Eine auf /24 gekürzte Adresse belegt nichts — sie
 * zeigt nur, aus welchem Netzbereich jemand kam. Für die Reichweitenmessung
 * ist das Kürzen richtig (dafür gibt es ipGekuerzt() weiter unten), für den
 * Nachweis der Einwilligung nicht: dort ist die vollständige Adresse gerade
 * der Zweck der Speicherung.
 */
export function ipFuerNachweis(roh: unknown): { ip: string; art: IpArt; oeffentlich: boolean } {
  const ip = normalisiereHost(txt(roh));
  const art = ipArt(ip);
  if (art === 'unbekannt') return { ip: '', art, oeffentlich: false };
  return { ip, art, oeffentlich: ipBereich(ip) === 'oeffentlich' };
}

/**
 * Eine Adresse für die Reichweitenmessung kürzen — NICHT für den Nachweis.
 * IPv4: letztes Feld auf 0. IPv6: nur die ersten 48 Bit bleiben stehen.
 */
export function ipGekuerzt(roh: unknown): string {
  const ip = normalisiereHost(txt(roh));
  const art = ipArt(ip);
  if (art === 'ipv4') {
    const t = ip.split('.');
    return `${t[0]}.${t[1]}.${t[2]}.0`;
  }
  if (art === 'ipv6') {
    // Über die Textform zu kürzen ist fehleranfällig (":: " steht für eine
    // unterschiedlich lange Folge von Nullen). Daher über die acht Gruppen.
    const g = ipv6Gruppen(ip);
    if (!g) return '';
    return g.slice(0, 3).map((x) => x.toString(16)).join(':') + '::';
  }
  return '';
}

/**
 * Die IP aus den Kopfzeilen der Anfrage holen — über leseIp() aus
 * lib/besucherKennung.ts, damit es im ganzen Haus dieselbe Regel ist.
 *
 * EHRLICH DAZU: `x-forwarded-for` ist eine Kopfzeile und damit grundsätzlich
 * fälschbar. Hinter Vercel wird sie vom Netz gesetzt und der erste Eintrag ist
 * die echte Adresse. Wer die Anwendung ohne einen solchen Vorschalt-Dienst
 * betreibt, darf sich auf diesen Wert nicht verlassen.
 */
export function ipAusKopfzeilen(kopfzeilen: Headers | null | undefined): string {
  try {
    return leseIp(kopfzeilen);
  } catch {
    return '';
  }
}

function zeitMs(iso: unknown): number {
  const t = new Date(txt(iso)).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Baut einen Nachweis-Eintrag aus dem, was beim Anmelden oder Bestätigen
 * vorliegt — und sagt ausdrücklich, was daran fehlt.
 *
 * Es wird NICHTS erfunden: eine fehlende IP bleibt leer, ein fehlender Text
 * bleibt leer. Ein Nachweis mit erfundenen Teilen wäre schlimmer als keiner.
 */
export function baueEintrag(e: EinwilligungEingabe): Einwilligungseintrag {
  const fehlend: string[] = [];

  const zeitpunktMs = zeitMs(e.zeitpunktIso);
  const zeitpunktIso = zeitpunktMs > 0 ? new Date(zeitpunktMs).toISOString() : '';
  if (zeitpunktMs <= 0) fehlend.push('der Zeitpunkt');

  const { ip, art, oeffentlich } = ipFuerNachweis(e.ip);
  if (ip === '') fehlend.push('die IP-Adresse');

  let text = txt(e.text);
  if (text.length > TEXT_MAX_ZEICHEN) text = text.slice(0, TEXT_MAX_ZEICHEN);
  if (text === '') fehlend.push('der Wortlaut, dem zugestimmt wurde');

  const browser = txt(e.browser);
  const quelle = txt(e.quelle);
  if (quelle === '') fehlend.push('die Herkunft der Anmeldung');

  return {
    schritt: e.schritt,
    zeitpunktIso,
    zeitpunktMs,
    ip,
    ipArt: art,
    ipOeffentlich: oeffentlich,
    browser,
    sprache: txt(e.sprache),
    quelle,
    formularUrl: txt(e.formularUrl),
    haekchenGesetzt: typeof e.haekchenGesetzt === 'boolean' ? e.haekchenGesetzt : null,
    text,
    textFassung: txt(e.textFassung),
    textFingerabdruck: textFingerabdruck(text),
    vollstaendig: fehlend.length === 0,
    fehlend,
  };
}

// ----------------------------------------------------------------------------
// DER NACHWEIS ALS GANZES
// ----------------------------------------------------------------------------

export type NachweisPruefung = {
  /** Trägt der Nachweis im Streitfall? */
  nachweisbar: boolean;
  /** Was ihm fehlt oder woran er hakt — Klartext, in der Reihenfolge des Gewichts. */
  maengel: string[];
  /** Die beiden Schritte liegen vor und der Text ist derselbe geblieben. */
  textGleich: boolean;
  /** Minuten zwischen Anmeldung und Bestätigung — null, wenn nicht berechenbar. */
  minutenBisBestaetigung: number | null;
  hinweis: string | null;
};

/**
 * Prüft den vollständigen Double-Opt-In-Vorgang.
 *
 * Der Nachweis besteht aus BEIDEN Schritten. Nur die Bestätigung zu haben
 * reicht nicht: dann ist zwar belegt, dass jemand geklickt hat, aber nicht,
 * dass die Anmeldung von dieser Adresse ausging und worin eingewilligt wurde.
 * Genau das ist der heutige Stand — `bestaetigt_am` allein.
 */
export function pruefeNachweis(
  anmeldung: Einwilligungseintrag | null | undefined,
  bestaetigung: Einwilligungseintrag | null | undefined,
): NachweisPruefung {
  const maengel: string[] = [];

  if (!anmeldung) {
    maengel.push('Die Anmeldung ist nicht protokolliert. Es lässt sich nicht zeigen, wann und von wo die Adresse eingetragen wurde.');
  }
  if (!bestaetigung) {
    maengel.push('Die Bestätigung ist nicht protokolliert. Ohne sie ist das Double-Opt-In nicht abgeschlossen.');
  }

  for (const [name, e] of [['Anmeldung', anmeldung], ['Bestätigung', bestaetigung]] as const) {
    if (!e) continue;
    for (const f of e.fehlend) {
      maengel.push(`Bei der ${name} fehlt ${f}.`);
    }
    if (e.ip !== '' && !e.ipOeffentlich) {
      maengel.push(`Die bei der ${name} festgehaltene Adresse ${e.ip} liegt nicht im öffentlichen Internet. Vermutlich wurde die Adresse des Vorschalt-Dienstes statt der des Besuchers festgehalten.`);
    }
  }

  let textGleich = false;
  if (anmeldung && bestaetigung) {
    if (anmeldung.textFingerabdruck !== '' && bestaetigung.textFingerabdruck !== '') {
      textGleich = anmeldung.textFingerabdruck === bestaetigung.textFingerabdruck;
      if (!textGleich) {
        maengel.push('Der Einwilligungstext bei der Anmeldung und bei der Bestätigung ist nicht derselbe. Es ist damit offen, worin eingewilligt wurde.');
      }
    }
  }

  let minutenBisBestaetigung: number | null = null;
  if (anmeldung?.zeitpunktMs && bestaetigung?.zeitpunktMs) {
    const diff = bestaetigung.zeitpunktMs - anmeldung.zeitpunktMs;
    minutenBisBestaetigung = Math.round(diff / 60_000);
    if (diff < 0) {
      maengel.push('Die Bestätigung liegt VOR der Anmeldung. Die Zeitpunkte passen nicht zusammen.');
      minutenBisBestaetigung = null;
    }
  }

  const nachweisbar = maengel.length === 0;
  return {
    nachweisbar,
    maengel,
    textGleich,
    minutenBisBestaetigung,
    hinweis: nachweisbar
      ? null
      : `Diese Einwilligung ist im Streitfall nicht vollständig belegbar (${maengel.length} ${maengel.length === 1 ? 'Punkt' : 'Punkte'}).`,
  };
}

/**
 * Ist die Einwilligung womöglich veraltet, weil sie lange nicht genutzt wurde?
 *
 * Belegstufe 'pruefen'. Es gibt keine feste Frist; die Gerichte urteilen
 * uneinheitlich. Deshalb wird gemeldet, nicht gesperrt.
 */
export function pruefeVeraltet(
  bestaetigtIso: string,
  letzteNutzungIso: string | null | undefined,
  jetztIso: string,
  monate: number = VERALTET_MONATE,
): { veraltet: boolean; monateOhneNutzung: number | null; hinweis: string | null } {
  const bezug = zeitMs(letzteNutzungIso) || zeitMs(bestaetigtIso);
  const jetzt = zeitMs(jetztIso);
  if (bezug <= 0 || jetzt <= 0) return { veraltet: false, monateOhneNutzung: null, hinweis: null };

  const a = new Date(bezug);
  const b = new Date(jetzt);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m -= 1;
  if (m < 0) m = 0;

  const veraltet = m >= monate;
  return {
    veraltet,
    monateOhneNutzung: m,
    hinweis: veraltet
      ? `Diese Einwilligung wurde seit ${m} Monaten nicht genutzt. Eine lange ungenutzte Einwilligung kann ihre Wirkung verlieren — vor einem Versand bitte prüfen, ob eine erneute Bestätigung sinnvoll ist. Eine feste Frist gibt es dafür nicht.`
      : null,
  };
}

/**
 * Bis wann der Nachweis aufbewahrt wird: drei Jahre, gerechnet ab dem Schluss
 * des Jahres, in dem die Einwilligung endete (§ 195, § 199 Abs. 1 BGB).
 *
 * Beispiel: Abmeldung am 03.04.2026 → das Jahr endet am 31.12.2026, drei Jahre
 * später ist der 31.12.2029. So lange bleibt der Nachweis, dann wird er
 * gelöscht.
 */
export function aufbewahrungBis(endeIso: string, jahre: number = AUFBEWAHRUNG_JAHRE): string {
  const ms = zeitMs(endeIso);
  if (ms <= 0) return '';
  const jahr = new Date(ms).getUTCFullYear();
  return `${jahr + Math.max(0, Math.floor(jahre))}-12-31`;
}

/** Ist der Nachweis jetzt zu löschen? */
export function loeschreif(endeIso: string, jetztIso: string, jahre: number = AUFBEWAHRUNG_JAHRE): boolean {
  const bis = aufbewahrungBis(endeIso, jahre);
  if (bis === '') return false;
  const jetzt = zeitMs(jetztIso);
  if (jetzt <= 0) return false;
  // Das Aufbewahrungsjahr läuft bis zum Ende des 31.12.
  return jetzt > Date.parse(`${bis}T23:59:59.999Z`);
}

// ----------------------------------------------------------------------------
// AUSGABE
// ----------------------------------------------------------------------------

function deutschesDatum(iso: string): string {
  const ms = zeitMs(iso);
  if (ms <= 0) return 'unbekannt';
  const d = new Date(ms);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${z(d.getUTCDate())}.${z(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} um ${z(d.getUTCHours())}:${z(d.getUTCMinutes())} Uhr UTC`;
}

/**
 * Der Nachweis in Klartext — für die Auskunft nach Art. 15 DSGVO, für den
 * Anwalt und für den Fall, dass eine Abmahnung ins Haus kommt.
 *
 * Bewusst ohne Schönfärberei: was fehlt, steht mit drin.
 */
export function nachweisKlartext(
  email: string,
  anmeldung: Einwilligungseintrag | null | undefined,
  bestaetigung: Einwilligungseintrag | null | undefined,
): string {
  const zeilen: string[] = [];
  zeilen.push(`Nachweis der Einwilligung für ${txt(email) || '(keine Adresse angegeben)'}`);
  zeilen.push('');

  const block = (name: string, e: Einwilligungseintrag | null | undefined) => {
    zeilen.push(`${name}:`);
    if (!e) {
      zeilen.push('  Nicht protokolliert.');
      zeilen.push('');
      return;
    }
    zeilen.push(`  Zeitpunkt:       ${deutschesDatum(e.zeitpunktIso)}`);
    zeilen.push(`  IP-Adresse:      ${e.ip || 'nicht festgehalten'}`);
    if (e.browser) zeilen.push(`  Browser:         ${e.browser}`);
    if (e.quelle) zeilen.push(`  Herkunft:        ${e.quelle}`);
    if (e.formularUrl) zeilen.push(`  Formular:        ${e.formularUrl}`);
    if (e.haekchenGesetzt !== null) {
      zeilen.push(`  Häkchen gesetzt: ${e.haekchenGesetzt ? 'ja' : 'nein'}`);
    }
    if (e.textFassung) zeilen.push(`  Textfassung:     ${e.textFassung}`);
    if (e.textFingerabdruck) zeilen.push(`  Prüfsumme Text:  ${e.textFingerabdruck.slice(0, 16)}…`);
    if (e.text) {
      zeilen.push('  Wortlaut, dem zugestimmt wurde:');
      for (const z of e.text.split('\n')) zeilen.push(`    ${z}`);
    } else {
      zeilen.push('  Wortlaut:        nicht festgehalten');
    }
    zeilen.push('');
  };

  block('Anmeldung', anmeldung);
  block('Bestätigung', bestaetigung);

  const p = pruefeNachweis(anmeldung, bestaetigung);
  if (p.nachweisbar) {
    zeilen.push('Ergebnis: Der Vorgang ist vollständig protokolliert.');
    if (p.minutenBisBestaetigung !== null) {
      zeilen.push(`Zwischen Anmeldung und Bestätigung lagen ${p.minutenBisBestaetigung} Minuten.`);
    }
  } else {
    zeilen.push('Ergebnis: Der Vorgang ist NICHT vollständig belegbar.');
    for (const m of p.maengel) zeilen.push(`  · ${m}`);
  }

  return zeilen.join('\n');
}
