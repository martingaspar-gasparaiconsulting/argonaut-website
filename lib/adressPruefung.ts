// ============================================================================
// ARGONAUT OS · lib/adressPruefung.ts — welche Adressen darf der Server anrufen?
//
// Punkt 65 / R12 · Paket 3 (21.09.2026). REINE Logik, node-testbar.
// Kein fetch, kein DNS, keine Netzwerkverbindung — nur die Frage:
// „Darf diese Adresse angerufen werden, und wenn nein, warum nicht?"
//
// ▄▄▄ DER BEFUND ▄▄▄
// lib/konnektoren.ts ist ein reiner KATALOG: es beschreibt, welche Felder eine
// Schnittstelle braucht. Mehrere davon haben `typ: 'url'` und werden vom
// Betrieb frei eingetippt:
//     shop_url    (Shopware, Shopify)
//     base_url    (fiskaly FCC)
//     device_url  (Epson-TSE — ausdrücklich „Adresse der TSE im lokalen Netz")
// Geprüft wird heute NICHTS. Kein Schema, kein Adressbereich, nichts.
//
// Heute ruft noch keine Route diese Adressen auf — app/api/schnittstellen und
// app/api/anschluesse/uebersicht speichern und zeigen sie nur. Nachgesehen,
// nicht vermutet. Die Lücke ist also LATENT: Sie entsteht in dem Moment, in
// dem der erste Konnektor die gespeicherte Adresse wirklich anruft. Genau
// deshalb wird sie jetzt geschlossen — jetzt kostet es nichts.
//
// ▄▄▄ WORUM ES GEHT (SSRF, „Server Side Request Forgery") ▄▄▄
// Wer in ein solches Feld `http://169.254.169.254/…` einträgt, bringt den
// Server dazu, den Metadaten-Dienst der Cloud abzufragen — dort liegen
// Zugangsschlüssel. `http://127.0.0.1:54321/…` zielt auf Dienste, die nur
// lokal lauschen. In einer Anwendung, in der JEDER Betrieb eigene Adressen
// hinterlegen kann, ist das ein Weg von außen nach innen.
//
// ▄▄▄ DIE AUSNAHME, DIE ES BRAUCHT — und warum sie nicht das Loch aufreißt ▄▄▄
// Die Epson-TSE steht IM lokalen Netz des Betriebs. Eine pauschale Sperre
// gegen private Adressen würde die Kasse aussperren — deshalb gibt es
// `erlaubeLokalesNetz`. Was diese Ausnahme NICHT freigibt:
//     · 169.254.169.254 und 169.254.170.2 — die Metadaten-Dienste
//     · fd00:ec2::254 — dasselbe über IPv6
//     · metadata.google.internal und Verwandte
// Diese Adressen bleiben in JEDEM Fall gesperrt. Eine TSE steht nie dort.
//
// ▄▄▄ WAS DIESE DATEI NICHT KANN — ehrlich benannt ▄▄▄
// Sie prüft die GESCHRIEBENE Adresse. Ein Name wie `kasse.example.com` kann
// im DNS auf 127.0.0.1 zeigen („DNS-Rebinding"), und das sieht man dem Text
// nicht an. Dagegen hilft nur, die AUFGELÖSTE Adresse vor dem Verbinden noch
// einmal zu prüfen — dafür gibt es pruefeAufgeloesteIp() mit denselben Regeln.
// Der Anschluss daran gehört zum Konnektor, nicht hierher.
// ============================================================================

export type IpArt = 'ipv4' | 'ipv6' | 'unbekannt';

/**
 * In welchem Adressbereich liegt die IP?
 *  oeffentlich  — normales Internet
 *  loopback     — der Server selbst (127.x, ::1)
 *  privat       — eigenes Netz (10.x, 172.16-31.x, 192.168.x, fc00::/7)
 *  linklokal    — 169.254.x, fe80::/10
 *  metadaten    — Cloud-Metadatendienst. NIE erlaubt.
 *  cgnat        — 100.64.x, Providernetz
 *  multicast    — 224.x aufwärts, ff00::/8
 *  reserviert   — 0.x, 240.x, Dokumentationsbereiche
 */
export type Bereich =
  | 'oeffentlich' | 'loopback' | 'privat' | 'linklokal'
  | 'metadaten' | 'cgnat' | 'multicast' | 'reserviert' | 'unbekannt';

// ----------------------------------------------------------------------------
// IP-ADRESSEN LESEN
// ----------------------------------------------------------------------------

/**
 * Ist das eine gültige IPv4-Adresse in Punktschreibweise?
 *
 * Führende Nullen werden ABGELEHNT: "0177.0.0.1" ist oktal geschrieben und
 * bedeutet 127.0.0.1 — wer eine Adresse so schreibt, will etwas verbergen.
 * Wir lesen sie gar nicht erst als gültige Adresse.
 */
export function istIpv4(s: string): boolean {
  const teile = (s || '').split('.');
  if (teile.length !== 4) return false;
  return teile.every((t) => {
    if (!/^\d{1,3}$/.test(t)) return false;
    if (t.length > 1 && t.startsWith('0')) return false;
    return Number(t) <= 255;
  });
}

/** Die vier Zahlen einer IPv4 — oder null. */
export function ipv4Teile(s: string): [number, number, number, number] | null {
  if (!istIpv4(s)) return null;
  const t = s.split('.').map(Number);
  return [t[0], t[1], t[2], t[3]];
}

/**
 * IPv6 in acht 16-Bit-Gruppen auflösen — oder null.
 * Versteht "::" (einmal), Grossschreibung und die eingebettete IPv4-Form
 * ("::ffff:127.0.0.1").
 */
export function ipv6Gruppen(roh: string): number[] | null {
  let s = (roh || '').trim();
  if (s === '') return null;
  if (s.includes('%')) s = s.slice(0, s.indexOf('%'));   // Zonen-Index abschneiden
  if (s.split('::').length > 2) return null;

  // Eingebettete IPv4 am Ende in zwei Gruppen umrechnen.
  const letzterDoppel = s.lastIndexOf(':');
  const schwanz = letzterDoppel >= 0 ? s.slice(letzterDoppel + 1) : '';
  if (schwanz.includes('.')) {
    const v4 = ipv4Teile(schwanz);
    if (!v4) return null;
    s = s.slice(0, letzterDoppel + 1)
      + ((v4[0] << 8) | v4[1]).toString(16) + ':' + ((v4[2] << 8) | v4[3]).toString(16);
  }

  const [vorn, hinten] = s.includes('::') ? s.split('::') : [s, null];
  const lese = (teil: string): number[] | null => {
    if (teil === '') return [];
    const out: number[] = [];
    for (const g of teil.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const a = lese(vorn);
  const b = hinten === null ? [] : lese(hinten);
  if (a === null || b === null) return null;

  if (hinten === null) return a.length === 8 ? a : null;
  const luecke = 8 - a.length - b.length;
  if (luecke < 1) return null;
  return [...a, ...new Array(luecke).fill(0), ...b];
}

export function istIpv6(s: string): boolean {
  return ipv6Gruppen(s) !== null;
}

/** Klammern und Zonen-Index entfernen, klein schreiben, Punkt am Ende weg. */
export function normalisiereHost(roh: string): string {
  let h = (roh || '').trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  while (h.endsWith('.') && h.length > 1) h = h.slice(0, -1);
  return h;
}

export function ipArt(s: string): IpArt {
  const h = normalisiereHost(s);
  if (istIpv4(h)) return 'ipv4';
  if (istIpv6(h)) return 'ipv6';
  return 'unbekannt';
}

export function istIpGueltig(s: string): boolean {
  return ipArt(s) !== 'unbekannt';
}

// ----------------------------------------------------------------------------
// ADRESSBEREICHE
// ----------------------------------------------------------------------------

/** Die Metadaten-Dienste der grossen Anbieter. Immer gesperrt. */
export const METADATEN_IPS: readonly string[] = [
  '169.254.169.254',   // AWS, Azure, Google, DigitalOcean, Hetzner
  '169.254.170.2',     // AWS ECS Task-Rollen
  'fd00:ec2::254',     // AWS über IPv6
];

/** Namen, hinter denen ein Metadaten-Dienst steht. Immer gesperrt. */
export const METADATEN_NAMEN: readonly string[] = [
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
  'instance-data',
];

function bereichIpv4(t: [number, number, number, number]): Bereich {
  const s = t.join('.');
  if (METADATEN_IPS.includes(s)) return 'metadaten';
  const [a, b] = t;
  if (a === 0) return 'reserviert';                              // 0.0.0.0/8
  if (a === 127) return 'loopback';                              // 127.0.0.0/8
  if (a === 10) return 'privat';                                 // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return 'privat';          // 172.16.0.0/12
  if (a === 192 && b === 168) return 'privat';                   // 192.168.0.0/16
  if (a === 169 && b === 254) return 'linklokal';                // 169.254.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return 'cgnat';          // 100.64.0.0/10
  if (a === 192 && b === 0 && t[2] === 0) return 'reserviert';   // 192.0.0.0/24
  if (a === 192 && b === 0 && t[2] === 2) return 'reserviert';   // Doku
  if (a === 198 && b === 51 && t[2] === 100) return 'reserviert';// Doku
  if (a === 203 && b === 0 && t[2] === 113) return 'reserviert'; // Doku
  if (a === 198 && (b === 18 || b === 19)) return 'reserviert';  // Messnetz
  if (a >= 224 && a <= 239) return 'multicast';                  // 224.0.0.0/4
  if (a >= 240) return 'reserviert';                             // 240.0.0.0/4 + Broadcast
  return 'oeffentlich';
}

/** Adressbereich einer IP-Adresse. Kein DNS, keine Verbindung — reine Rechnung. */
export function ipBereich(roh: string): Bereich {
  const h = normalisiereHost(roh);

  const v4 = ipv4Teile(h);
  if (v4) return bereichIpv4(v4);

  const g = ipv6Gruppen(h);
  if (!g) return 'unbekannt';

  const alsText = g.map((x) => x.toString(16)).join(':');
  if (METADATEN_IPS.some((m) => ipv6Gruppen(m)?.join(':') === g.join(':'))) return 'metadaten';

  // IPv4 in IPv6 verpackt (::ffff:a.b.c.d) — nach der echten Adresse einstufen.
  // GEMESSEN: new URL('http://[::ffff:127.0.0.1]/') liefert '[::ffff:7f00:1]'.
  const istMapped = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff;
  const istKompat = g.slice(0, 6).every((x) => x === 0) && (g[6] !== 0 || g[7] !== 0);
  if (istMapped || istKompat) {
    const eingebettet: [number, number, number, number] = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
    if (!(istKompat && eingebettet[0] === 0)) return bereichIpv4(eingebettet);
  }

  if (g.every((x) => x === 0)) return 'reserviert';                       // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return 'loopback'; // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return 'privat';                        // fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return 'linklokal';                     // fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return 'multicast';                     // ff00::/8
  if (g[0] === 0x2001 && g[1] === 0x0db8) return 'reserviert';            // Doku
  void alsText;
  return 'oeffentlich';
}

/** Bereiche, die ein Gerät im eigenen Netz haben darf. */
const LOKAL_ERLAUBT: readonly Bereich[] = ['privat', 'loopback', 'linklokal'];

// ----------------------------------------------------------------------------
// NAMEN
// ----------------------------------------------------------------------------

/** Endungen, die immer auf das eigene Netz zeigen. */
export const LOKALE_ENDUNGEN: readonly string[] = [
  '.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.home.arpa', '.corp',
];

function istLokalerName(host: string): boolean {
  if (host === 'localhost') return true;
  if (!host.includes('.')) return true;                       // ein Wort: "nas", "kasse"
  return LOKALE_ENDUNGEN.some((e) => host.endsWith(e));
}

function istMetadatenName(host: string): boolean {
  return METADATEN_NAMEN.some((n) => host === n || host.endsWith('.' + n));
}

/**
 * Sieht die letzte Stelle des Namens wie eine echte Top-Level-Domain aus?
 *
 * Sicherheitsnetz gegen Zahlenschreibweisen wie http://2130706433/ (das ist
 * 127.0.0.1 dezimal). GEMESSEN: new URL() rechnet solche Formen von sich aus
 * in die Punktschreibweise um, sie werden also schon vorher als IP erkannt.
 * Die Prüfung bleibt trotzdem stehen — sie kostet nichts und fängt den Fall,
 * dass ein Aufrufer den Host nicht über new URL() gewonnen hat.
 */
function tldPlausibel(host: string): boolean {
  const letzte = host.split('.').pop() || '';
  return /^[a-z][a-z0-9-]*$/.test(letzte);
}

// ----------------------------------------------------------------------------
// DIE PRÜFUNG
// ----------------------------------------------------------------------------

export type SperrGrund =
  | 'leer' | 'unlesbar' | 'schema' | 'zugangsdaten' | 'kein_host'
  | 'adressform' | 'metadaten' | 'internes_netz' | 'unerreichbar'
  | 'port' | 'kein_tls';

export type UrlPruefung = {
  erlaubt: boolean;
  /** Maschinenlesbarer Grund. null, wenn erlaubt. */
  grund: SperrGrund | null;
  /** Klartext für den Betrieb. null, wenn erlaubt. */
  hinweis: string | null;
  schema: string;
  host: string;
  port: number | null;
  hostArt: IpArt | 'name';
  bereich: Bereich;
  /** Die aufgeräumte Adresse — das, was gespeichert werden sollte. */
  normalisiert: string;
};

export type UrlOptionen = {
  /**
   * Adressen im eigenen Netz zulassen. NUR für Felder, die ein Gerät vor Ort
   * meinen — bei uns die Epson-TSE (`device_url`). Metadaten-Adressen bleiben
   * auch damit gesperrt.
   */
  erlaubeLokalesNetz?: boolean;
  /**
   * http ohne Verschlüsselung zulassen. Im lokalen Netz oft nötig (die TSE
   * bringt kein gültiges Zertifikat mit), im Internet nie.
   */
  erlaubeHttp?: boolean;
  /** Wenn gesetzt: nur diese Ports. Ohne Angabe wird der Port nicht geprüft. */
  erlaubtePorts?: readonly number[] | null;
};

const STANDARD_PORT: Record<string, number> = { 'http:': 80, 'https:': 443 };

function ergebnis(
  erlaubt: boolean, grund: SperrGrund | null, hinweis: string | null,
  rest: Partial<UrlPruefung> = {},
): UrlPruefung {
  return {
    erlaubt, grund, hinweis,
    schema: '', host: '', port: null, hostArt: 'name', bereich: 'unbekannt', normalisiert: '',
    ...rest,
  };
}

/**
 * Darf diese Adresse vom Server angerufen werden?
 *
 * Nur Text, keine Verbindung. Der Rückgabewert sagt immer auch, WARUM nicht —
 * ein Betrieb, der seine TSE einträgt und eine Fehlermeldung bekommt, soll
 * lesen können, was zu tun ist.
 */
export function pruefeAusgehendeUrl(roh: unknown, opt: UrlOptionen = {}): UrlPruefung {
  const text = String(roh ?? '').trim();
  if (text === '') {
    return ergebnis(false, 'leer', 'Es ist keine Adresse eingetragen.');
  }

  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return ergebnis(false, 'unlesbar',
      'Diese Adresse lässt sich nicht lesen. Sie muss mit https:// beginnen, zum Beispiel https://shop.example.de.');
  }

  const schema = u.protocol.toLowerCase();
  if (schema !== 'http:' && schema !== 'https:') {
    return ergebnis(false, 'schema',
      `Adressen dieser Art (${schema.replace(':', '')}) werden nicht angerufen. Erlaubt sind https:// und — im eigenen Netz — http://.`,
      { schema });
  }

  if (u.username !== '' || u.password !== '') {
    return ergebnis(false, 'zugangsdaten',
      'In der Adresse stehen Benutzername oder Passwort. Bitte die Adresse ohne Zugangsdaten eintragen — die Zugangsdaten gehören in die dafür vorgesehenen Felder.',
      { schema });
  }

  const host = normalisiereHost(u.hostname);
  if (host === '') {
    return ergebnis(false, 'kein_host', 'In der Adresse fehlt der Server-Name.', { schema });
  }

  const port = u.port === '' ? (STANDARD_PORT[schema] ?? null) : Number(u.port);
  const art = ipArt(host);
  const hostArt: IpArt | 'name' = art === 'unbekannt' ? 'name' : art;
  const normalisiert = u.toString();

  const basis = { schema, host, port, hostArt, normalisiert };

  // 1. Metadaten-Dienste — vor allem anderen und ohne jede Ausnahme.
  if (istMetadatenName(host)) {
    return ergebnis(false, 'metadaten',
      'Diese Adresse gehört zum Metadaten-Dienst der Serverumgebung. Sie wird nie angerufen — dort liegen Zugangsschlüssel.',
      { ...basis, bereich: 'metadaten' });
  }

  if (hostArt !== 'name') {
    const bereich = ipBereich(host);
    if (bereich === 'metadaten') {
      return ergebnis(false, 'metadaten',
        'Diese Adresse gehört zum Metadaten-Dienst der Serverumgebung. Sie wird nie angerufen — dort liegen Zugangsschlüssel.',
        { ...basis, bereich });
    }
    if (bereich === 'multicast' || bereich === 'reserviert' || bereich === 'cgnat' || bereich === 'unbekannt') {
      return ergebnis(false, 'unerreichbar',
        'Diese Adresse führt in keinen erreichbaren Bereich. Bitte die Adresse des Anbieters oder des Geräts eintragen.',
        { ...basis, bereich });
    }
    if (LOKAL_ERLAUBT.includes(bereich) && !opt.erlaubeLokalesNetz) {
      return ergebnis(false, 'internes_netz',
        'Diese Adresse zeigt in ein internes Netz. Für dieses Feld wird eine Adresse aus dem Internet gebraucht. ' +
        'Geräte im eigenen Netz — etwa die TSE der Kasse — werden nur in den Feldern eingetragen, die ausdrücklich dafür vorgesehen sind.',
        { ...basis, bereich });
    }
    return abschluss({ ...basis, bereich }, opt);
  }

  // Name statt IP.
  if (!tldPlausibel(host)) {
    return ergebnis(false, 'adressform',
      'Diese Adresse ist in einer ungewöhnlichen Zahlenschreibweise angegeben. Bitte den Server-Namen ausschreiben, zum Beispiel shop.example.de.',
      { ...basis, bereich: 'unbekannt' });
  }
  if (istLokalerName(host)) {
    if (!opt.erlaubeLokalesNetz) {
      return ergebnis(false, 'internes_netz',
        'Dieser Name zeigt in das eigene Netz. Für dieses Feld wird eine Adresse aus dem Internet gebraucht.',
        { ...basis, bereich: 'privat' });
    }
    return abschluss({ ...basis, bereich: 'privat' }, opt);
  }

  // Ein gewöhnlicher Name im Internet. WICHTIG: dass er im DNS nicht doch auf
  // eine interne Adresse zeigt, kann hier niemand wissen — dafür gibt es
  // pruefeAufgeloesteIp().
  return abschluss({ ...basis, bereich: 'oeffentlich' }, opt);
}

function abschluss(
  b: { schema: string; host: string; port: number | null; hostArt: IpArt | 'name'; bereich: Bereich; normalisiert: string },
  opt: UrlOptionen,
): UrlPruefung {
  if (opt.erlaubtePorts && b.port !== null && !opt.erlaubtePorts.includes(b.port)) {
    return ergebnis(false, 'port',
      `Der Port ${b.port} ist für diesen Anschluss nicht vorgesehen. Erlaubt ${opt.erlaubtePorts.length === 1 ? 'ist' : 'sind'} ${opt.erlaubtePorts.join(', ')}.`,
      b);
  }
  const imEigenenNetz = LOKAL_ERLAUBT.includes(b.bereich);
  if (b.schema === 'http:' && !opt.erlaubeHttp && !(imEigenenNetz && opt.erlaubeLokalesNetz)) {
    return ergebnis(false, 'kein_tls',
      'Diese Adresse ist unverschlüsselt (http://). Zugangsdaten und Umsätze dürfen so nicht übertragen werden — bitte https:// eintragen.',
      b);
  }
  return ergebnis(true, null, null, b);
}

/**
 * Dieselben Regeln, angewandt auf eine bereits AUFGELÖSTE IP-Adresse.
 *
 * Hierfür gibt es die Funktion: der Name in der Adresse kann im DNS auf eine
 * interne Adresse zeigen. Wer wirklich verbindet, löst den Namen auf und fragt
 * hier noch einmal nach, bevor er die Verbindung öffnet.
 */
export function pruefeAufgeloesteIp(ip: string, opt: UrlOptionen = {}): UrlPruefung {
  const host = normalisiereHost(ip);
  const art = ipArt(host);
  if (art === 'unbekannt') {
    return ergebnis(false, 'unlesbar', 'Der Name liess sich zu keiner gültigen Adresse auflösen.', { host });
  }
  const bereich = ipBereich(host);
  const basis = { schema: '', host, port: null, hostArt: art as IpArt | 'name', bereich, normalisiert: host };

  if (bereich === 'metadaten') {
    return ergebnis(false, 'metadaten',
      'Der Name zeigt auf den Metadaten-Dienst der Serverumgebung. Die Verbindung wird nicht aufgebaut.', basis);
  }
  if (bereich === 'multicast' || bereich === 'reserviert' || bereich === 'cgnat' || bereich === 'unbekannt') {
    return ergebnis(false, 'unerreichbar',
      'Der Name zeigt in keinen erreichbaren Bereich. Die Verbindung wird nicht aufgebaut.', basis);
  }
  if (LOKAL_ERLAUBT.includes(bereich) && !opt.erlaubeLokalesNetz) {
    return ergebnis(false, 'internes_netz',
      'Der Name zeigt in ein internes Netz. Die Verbindung wird nicht aufgebaut.', basis);
  }
  return ergebnis(true, null, null, basis);
}

// ----------------------------------------------------------------------------
// WELCHES FELD DARF INS EIGENE NETZ?
// ----------------------------------------------------------------------------

/**
 * Die Felder aus lib/konnektoren.ts, die ausdrücklich ein Gerät im eigenen
 * Netz meinen. Stand 21.09.2026 ist das genau eines: die Epson-TSE.
 *
 * Bewusst eine kurze, ausdrückliche Liste statt einer Regel über Feldnamen.
 * Wer hier etwas einträgt, öffnet das interne Netz für dieses eine Feld und
 * soll das sehen.
 */
export const LOKALES_NETZ_FELDER: readonly string[] = ['device_url'];

export function lokalesNetzErlaubt(feldKey: unknown): boolean {
  return LOKALES_NETZ_FELDER.includes(String(feldKey ?? ''));
}

/**
 * Die Prüfung für ein Konnektor-Feld: entscheidet die Ausnahme selbst, anhand
 * des Feldnamens. Das ist der Aufruf, den ein Konnektor nehmen sollte.
 */
export function pruefeKonnektorAdresse(feldKey: string, wert: unknown): UrlPruefung {
  const lokal = lokalesNetzErlaubt(feldKey);
  return pruefeAusgehendeUrl(wert, { erlaubeLokalesNetz: lokal, erlaubeHttp: lokal });
}
