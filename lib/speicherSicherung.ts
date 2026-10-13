// ============================================================================
// ARGONAUT OS · lib/speicherSicherung.ts — Paket 350 (A2 Datei-Sicherung des Speichers)
//
// Reine Logik, ohne Netz und ohne Datenbank (node-testbar, auch im Browser
// nutzbar — KEIN node:crypto hier, das steht in speicherSicherungKrypto.ts).
//
// ▄▄▄ WAS DIE DATEI-SICHERUNG TUT ▄▄▄
// Supabase sichert die DATENBANK täglich. Die DATEIEN im Speicher (Belege,
// Rechnungs-PDFs, Fotos, Dokumente) hatten bis Paket 350 keine eigene Kopie.
// Jetzt: stündlich (vercel.json, Minute 40) geht jede neue oder geänderte
// Datei VERSCHLÜSSELT an einen zweiten Ort in Deutschland (S3-kompatibel,
// Empfehlung Hetzner Object Storage). Gelöschte Dateien bleiben dort noch
// 30 Tage liegen (versehentlich gelöscht = zurückholbar), dann gehen sie auch
// im Ziel weg. Die Wiederherstellung wird im Command Center echt geprobt.
//
// ▄▄▄ OHNE EINRICHTUNG PASSIERT NICHTS ▄▄▄
// Fehlt eine der sechs Umgebungsvariablen, meldet alles „nicht eingerichtet"
// und rührt nichts an.
// ============================================================================

export const ZIEL_PRAEFIX = 'speicher/';
export const ZIEL_ENDUNG = '.ags';
export const PROBE_BUCKET = 'sicherung-probe';
/** Größte Datei, die gepuffert gesichert wird (größte Bucket-Grenze ist 200 MB). */
export const GROESSE_GRENZE = 250 * 1024 * 1024;
/** Bis zu dieser Größe laufen bis zu PARALLEL Dateien gleichzeitig. */
export const KLEIN_GRENZE = 10 * 1024 * 1024;
export const PARALLEL = 3;
export const MAX_VERSUCHE = 5;
/** Zeitbudget je Durchgang (Funktion darf 300 s). */
export const BUDGET_MS = 240_000;
/** Puffer am Ende: keine neue Datei mehr anfangen, wenn weniger übrig ist. */
export const RESERVE_MS = 25_000;
export const LOESCH_TAGE = 30;
/** Länger ohne erfolgreichen Durchgang -> Glocke. */
export const WARN_STUNDEN = 26;
/** Länger ohne erfolgreiche Probe-Wiederherstellung -> Glocke. */
export const PROBE_TAGE = 90;
export const PROBE_ANZAHL = 10;
export const PROBE_ECHT = 3;
export const PROBE_ECHT_GRENZE = 20 * 1024 * 1024;
export const BESTAETIGUNG_WORT = 'WIEDERHERSTELLEN';

export const ENV_NAMEN = [
  'SPEICHER_SICHERUNG_ENDPOINT',
  'SPEICHER_SICHERUNG_REGION',
  'SPEICHER_SICHERUNG_BUCKET',
  'SPEICHER_SICHERUNG_KEY_ID',
  'SPEICHER_SICHERUNG_SECRET',
  'SPEICHER_SICHERUNG_SCHLUESSEL',
] as const;

export type SicherungKonfig = {
  endpoint: string; // https://fsn1.your-objectstorage.com (ohne / am Ende)
  host: string;
  region: string;
  bucket: string;
  keyId: string;
  secret: string;
  schluessel: string; // 64 Hex
};

export type KonfigErgebnis =
  | { eingerichtet: true; cfg: SicherungKonfig }
  | { eingerichtet: false; fehlend: string[]; fehler: string[] };

/** Liest die sechs Variablen. Fehlt eine: „nicht eingerichtet". Ist eine falsch: Fehler mit Klartext. */
export function konfigAusEnv(env: Record<string, string | undefined>): KonfigErgebnis {
  const w = (k: string) => String(env[k] ?? '').trim();
  const fehlend = ENV_NAMEN.filter((k) => !w(k));
  if (fehlend.length) return { eingerichtet: false, fehlend: [...fehlend], fehler: [] };
  const fehler: string[] = [];
  const endpoint = w('SPEICHER_SICHERUNG_ENDPOINT').replace(/\/+$/, '');
  let host = '';
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:') fehler.push('SPEICHER_SICHERUNG_ENDPOINT muss mit https:// beginnen.');
    if (u.pathname !== '/' && u.pathname !== '') fehler.push('SPEICHER_SICHERUNG_ENDPOINT ohne Pfad angeben, z. B. https://fsn1.your-objectstorage.com');
    host = u.host;
  } catch {
    fehler.push('SPEICHER_SICHERUNG_ENDPOINT ist keine gültige Adresse.');
  }
  const region = w('SPEICHER_SICHERUNG_REGION');
  if (!/^[a-z0-9-]{2,40}$/.test(region)) fehler.push('SPEICHER_SICHERUNG_REGION: nur Kleinbuchstaben, Ziffern und Bindestrich (z. B. fsn1).');
  const bucket = w('SPEICHER_SICHERUNG_BUCKET');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) fehler.push('SPEICHER_SICHERUNG_BUCKET: 3–63 Zeichen, Kleinbuchstaben, Ziffern, Punkt, Bindestrich.');
  const schluessel = w('SPEICHER_SICHERUNG_SCHLUESSEL');
  if (!/^[0-9a-fA-F]{64}$/.test(schluessel)) fehler.push('SPEICHER_SICHERUNG_SCHLUESSEL: genau 64 Hex-Zeichen (0–9, a–f).');
  if (fehler.length) return { eingerichtet: false, fehlend: [], fehler };
  return {
    eingerichtet: true,
    cfg: { endpoint, host, region, bucket, keyId: w('SPEICHER_SICHERUNG_KEY_ID'), secret: w('SPEICHER_SICHERUNG_SECRET'), schluessel: schluessel.toLowerCase() },
  };
}

const BUCKET_MUSTER = /^[a-z0-9][a-z0-9_.-]{0,62}$/i;

/** Speicherort im Ziel: speicher/<bucket>/<name>.ags */
export function zielSchluessel(bucket: string, name: string): string {
  if (!BUCKET_MUSTER.test(bucket)) throw new Error('Ungültiger Bucket-Name: ' + bucket);
  if (!name || name.startsWith('/')) throw new Error('Ungültiger Dateiname.');
  return `${ZIEL_PRAEFIX}${bucket}/${name}${ZIEL_ENDUNG}`;
}

/** Gegenstück — null, wenn der Schlüssel nicht von der Sicherung stammt. */
export function ausZielSchluessel(schluessel: string): { bucket: string; name: string } | null {
  if (!schluessel.startsWith(ZIEL_PRAEFIX) || !schluessel.endsWith(ZIEL_ENDUNG)) return null;
  const rest = schluessel.slice(ZIEL_PRAEFIX.length, -ZIEL_ENDUNG.length);
  const i = rest.indexOf('/');
  if (i <= 0 || i === rest.length - 1) return null;
  const bucket = rest.slice(0, i);
  const name = rest.slice(i + 1);
  if (!BUCKET_MUSTER.test(bucket) || name.startsWith('/')) return null;
  return { bucket, name };
}

/** Zusatzdaten für AES-GCM: bindet das Chiffrat an Bucket und Namen. */
export function zusatzDaten(bucket: string, name: string): string {
  return `${bucket}/${name}`;
}

/** Inhaltstyp für den Kopf x-amz-meta-typ — nur harmlose Zeichen. */
export function typSauber(typ: string | null | undefined): string {
  const t = String(typ ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9.+\-/]{0,99}$/.test(t) ? t : 'application/octet-stream';
}

export type QuellObjekt = { bucket: string; name: string; geaendert: string; groesse: number | null; etag: string | null; typ: string | null };
export type DateiZeile = { bucket: string; name: string; quelle_etag: string | null; quelle_geaendert: string | null; sha256: string | null; fehler: string | null; versuche: number };

/** Muss diese Datei (neu) gesichert werden? */
export function brauchtSicherung(o: QuellObjekt, d: DateiZeile | null | undefined): boolean {
  if (!d || !d.sha256) return true;
  if ((d.quelle_etag ?? null) !== (o.etag ?? null)) return true;
  const a = d.quelle_geaendert ? Date.parse(d.quelle_geaendert) : NaN;
  const b = Date.parse(o.geaendert);
  return !(Number.isFinite(a) && Number.isFinite(b) && a === b);
}

/** Zu groß für den gepufferten Weg? */
export function zuGross(o: Pick<QuellObjekt, 'groesse'>): boolean {
  return (o.groesse ?? 0) > GROESSE_GRENZE;
}

/** Stapel: kleine Dateien zu höchstens PARALLEL, große (> KLEIN_GRENZE) allein. Reihenfolge bleibt. */
export function stapelBilden<T extends { groesse: number | null }>(liste: T[]): T[][] {
  const aus: T[][] = [];
  let lauf: T[] = [];
  for (const o of liste) {
    if ((o.groesse ?? 0) > KLEIN_GRENZE) {
      if (lauf.length) { aus.push(lauf); lauf = []; }
      aus.push([o]);
      continue;
    }
    lauf.push(o);
    if (lauf.length >= PARALLEL) { aus.push(lauf); lauf = []; }
  }
  if (lauf.length) aus.push(lauf);
  return aus;
}

/** Reicht die Zeit noch für einen weiteren Stapel? */
export function zeitReicht(startMs: number, jetztMs: number, budgetMs: number = BUDGET_MS): boolean {
  return jetztMs - startMs < budgetMs - RESERVE_MS;
}

/** Fehlertext für die Datenbank (höchstens 500 Zeichen). */
export function fehlerText(e: unknown): string {
  const t = e instanceof Error ? e.message : typeof e === 'string' ? e : (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
  return (t || 'Unbekannter Fehler').replace(/\s+/g, ' ').trim().slice(0, 500);
}

/** Hat Supabase beim Hochladen gemeldet, dass die Datei schon da ist? (Notfall-Wiederherstellung überschreibt nie.) */
export function istSchonVorhanden(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { statusCode?: string | number; status?: number; message?: string; error?: string };
  if (String(e.statusCode ?? '') === '409' || e.status === 409) return true;
  return /already exists|duplicate/i.test(`${e.message ?? ''} ${e.error ?? ''}`);
}

/** Antwort von ListObjectsV2 lesen (ohne XML-Bibliothek). */
export function listeLesen(xml: string): { eintraege: Array<{ key: string; groesse: number }>; ordner: string[]; weiter: string | null } {
  const ent = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
  const eintraege: Array<{ key: string; groesse: number }> = [];
  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(m[1]);
    const size = /<Size>(\d+)<\/Size>/.exec(m[1]);
    if (key) eintraege.push({ key: ent(key[1]), groesse: size ? Number(size[1]) : 0 });
  }
  const ordner: string[] = [];
  for (const m of xml.matchAll(/<CommonPrefixes>\s*<Prefix>([\s\S]*?)<\/Prefix>\s*<\/CommonPrefixes>/g)) ordner.push(ent(m[1]));
  const abgeschnitten = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const token = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml);
  return { eintraege, ordner, weiter: abgeschnitten && token ? ent(token[1]) : null };
}

export type GlockenLage = {
  jetzt: Date;
  letzterErfolg: string | null;
  letzteProbe: string | null;
  dauerFehler: number;
  /** Erster Durchgang überhaupt erst vor kurzem? Dann keine „seit 26 Stunden"-Glocke. */
  ersterLauf: string | null;
};

/** Muss der Betreiber per Glocke geweckt werden? null = alles gut. */
export function glockeNoetig(l: GlockenLage): { titel: string; nachricht: string } | null {
  const t = l.jetzt.getTime();
  const gruende: string[] = [];
  if (l.dauerFehler > 0) gruende.push(`${l.dauerFehler} Datei(en) ließen sich auch nach ${MAX_VERSUCHE} Versuchen nicht sichern.`);
  const seit = l.letzterErfolg ? Date.parse(l.letzterErfolg) : NaN;
  const erst = l.ersterLauf ? Date.parse(l.ersterLauf) : NaN;
  const langeDabei = Number.isFinite(erst) && t - erst > WARN_STUNDEN * 3_600_000;
  if (Number.isFinite(seit) ? t - seit > WARN_STUNDEN * 3_600_000 : langeDabei) {
    gruende.push(`Seit über ${WARN_STUNDEN} Stunden kein fehlerfreier Durchgang.`);
  }
  const probe = l.letzteProbe ? Date.parse(l.letzteProbe) : NaN;
  if (langeDabei && (!Number.isFinite(probe) || t - probe > PROBE_TAGE * 86_400_000)) {
    gruende.push(`Die letzte erfolgreiche Probe-Wiederherstellung ist über ${PROBE_TAGE} Tage her (oder fehlt).`);
  }
  if (!gruende.length) return null;
  return { titel: 'Datei-Sicherung braucht Aufmerksamkeit', nachricht: gruende.join(' ') + ' Details im Command Center unter „Datei-Sicherung".' };
}

export type SicherungZahlen = {
  quelle_dateien: number; quelle_bytes: number; gesichert: number; gesichert_bytes: number;
  offen: number; fehler: number; dauerhaft: number; fehlend: number;
};

export type Ampel = { farbe: 'aus' | 'gruen' | 'gelb' | 'rot'; text: string };

/** Die eine Zeile oben auf der Seite. */
export function ampel(eingerichtet: boolean, z: SicherungZahlen | null, letzterErfolg: string | null, jetzt: Date): Ampel {
  if (!eingerichtet) return { farbe: 'aus', text: 'Nicht eingerichtet — es wird nichts gesichert.' };
  if (!z) return { farbe: 'rot', text: 'Stand nicht lesbar (SQL Paket 350 eingespielt?).' };
  if (z.dauerhaft > 0) return { farbe: 'rot', text: `${z.dauerhaft} Datei(en) dauerhaft nicht gesichert.` };
  const seit = letzterErfolg ? jetzt.getTime() - Date.parse(letzterErfolg) : Infinity;
  if (seit > WARN_STUNDEN * 3_600_000) return { farbe: 'rot', text: `Seit über ${WARN_STUNDEN} Stunden kein fehlerfreier Durchgang.` };
  if (z.offen > 0 || z.fehler > 0) return { farbe: 'gelb', text: `Läuft — noch ${z.offen} Datei(en) offen${z.fehler ? `, ${z.fehler} mit Fehler (wird erneut versucht)` : ''}.` };
  return { farbe: 'gruen', text: `Alle ${z.gesichert} Dateien gesichert.` };
}

/** 1536 -> „1,5 KB" */
export function groesseText(bytes: number | null | undefined): string {
  const b = Number(bytes ?? 0);
  if (!Number.isFinite(b) || b <= 0) return '0 B';
  const e = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = b;
  while (v >= 1024 && i < e.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString('de-DE', { maximumFractionDigits: i ? 1 : 0 })} ${e[i]}`;
}

export type ProbeErgebnis = { name: string; bucket: string; entschluesselt: boolean; hashGleich: boolean; echt: boolean; echtOk: boolean | null; fehler: string | null };

/** Ist die Probe bestanden? Alles entschlüsselt + Prüfsumme gleich, und die echten Rückspielungen gingen. */
export function probeAuswerten(e: ProbeErgebnis[]): { ok: boolean; meldung: string } {
  if (!e.length) return { ok: false, meldung: 'Keine gesicherte Datei für die Probe gefunden.' };
  const gut = e.filter((x) => x.entschluesselt && x.hashGleich).length;
  const echt = e.filter((x) => x.echt);
  const echtGut = echt.filter((x) => x.echtOk === true).length;
  const ok = gut === e.length && echt.length > 0 && echtGut === echt.length;
  const fehl = e.filter((x) => x.fehler).map((x) => `${x.bucket}/${x.name}: ${x.fehler}`).slice(0, 3);
  return {
    ok,
    meldung: `${gut}/${e.length} entschlüsselt und Prüfsumme gleich · ${echtGut}/${echt.length} echt zurückgespielt, neu geladen und verglichen${fehl.length ? ' · ' + fehl.join(' · ') : ''}`.slice(0, 1000),
  };
}

export const ART_TEXT: Record<string, string> = {
  sicherung: 'Sicherung',
  abgleich: 'Abgleich gelöschter Dateien',
  probe: 'Probe-Wiederherstellung',
  wiederherstellung: 'Notfall-Wiederherstellung',
};
