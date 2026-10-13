// ============================================================================
// ARGONAUT OS · lib/speicherSicherungServer.ts — Paket 350 (A2 Datei-Sicherung)
//
// Die Arbeit mit Netz und Datenbank. NUR serverseitig (Service-Rolle).
//   sicherungsDurchgang  — stündlich (Cron) oder per Knopf im Command Center
//   probeWiederherstellung — 10 Dateien aus dem Ziel holen, entschlüsseln,
//                          Prüfsumme vergleichen; 3 davon echt in den Speicher
//                          (Bucket sicherung-probe) zurückspielen, neu laden,
//                          vergleichen, wieder löschen
//   notfallWiederherstellen — ein Bucket aus dem Ziel zurück in Supabase;
//                          vorhandene Dateien werden NIE überschrieben
//   standLaden            — Zahlen, Läufe, Ampel für die Seite
// Rechnen und Prüfen: lib/speicherSicherung.ts, Krypto: lib/speicherSicherungKrypto.ts
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  amzDatum, entschluesseln, LEER_HASH, schluesselKennung, sha256Hex, signieren, uriKodieren, verschluesseln,
} from './speicherSicherungKrypto';
import {
  ausZielSchluessel, brauchtSicherung, fehlerText, glockeNoetig, istSchonVorhanden, konfigAusEnv, listeLesen,
  stapelBilden, typSauber, zeitReicht, zielSchluessel, zuGross, zusatzDaten, BUDGET_MS, LOESCH_TAGE, MAX_VERSUCHE,
  PROBE_ANZAHL, PROBE_BUCKET, PROBE_ECHT, PROBE_ECHT_GRENZE, probeAuswerten, ZIEL_PRAEFIX,
  type DateiZeile, type ProbeErgebnis, type QuellObjekt, type SicherungKonfig, type SicherungZahlen,
} from './speicherSicherung';

type Admin = SupabaseClient;

export function sicherungKonfig() {
  return konfigAusEnv(process.env as Record<string, string | undefined>);
}

// ---------------------------------------------------------------------------
// S3 (SigV4, Pfad-Stil: https://endpoint/<bucket>/<key>)
// ---------------------------------------------------------------------------
type S3Anfrage = { methode: 'GET' | 'PUT' | 'DELETE' | 'HEAD'; key?: string; abfrage?: Array<[string, string]>; body?: Buffer; koepfe?: Record<string, string> };

async function s3(cfg: SicherungKonfig, a: S3Anfrage): Promise<Response> {
  const pfad = '/' + uriKodieren(cfg.bucket, false) + (a.key !== undefined ? '/' + uriKodieren(a.key, true) : '');
  const inhaltHash = a.body ? sha256Hex(a.body) : LEER_HASH;
  const datum = amzDatum(new Date());
  const koepfe: Record<string, string> = { host: cfg.host, 'x-amz-content-sha256': inhaltHash, 'x-amz-date': datum, ...(a.koepfe ?? {}) };
  const sig = signieren({ methode: a.methode, pfad, abfrage: a.abfrage, koepfe, inhaltHash, region: cfg.region, dienst: 's3', schluesselId: cfg.keyId, geheimnis: cfg.secret, amzDatum: datum });
  const q = (a.abfrage ?? []).map(([k, v]) => `${uriKodieren(k, false)}=${uriKodieren(v, false)}`).join('&');
  const url = cfg.endpoint + pfad + (q ? '?' + q : '');
  const sende: Record<string, string> = { ...koepfe, authorization: sig.authorization };
  delete sende.host;
  return fetch(url, { method: a.methode, headers: sende, body: a.body ? new Uint8Array(a.body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(120_000) });
}

async function s3Fehler(r: Response, was: string): Promise<Error> {
  const t = await r.text().catch(() => '');
  const code = /<Code>([^<]+)<\/Code>/.exec(t)?.[1];
  return new Error(`${was}: HTTP ${r.status}${code ? ' ' + code : ''}`);
}

export async function zielHochladen(cfg: SicherungKonfig, key: string, daten: Buffer, typ: string): Promise<void> {
  const r = await s3(cfg, { methode: 'PUT', key, body: daten, koepfe: { 'content-type': 'application/octet-stream', 'x-amz-meta-typ': typSauber(typ), 'x-amz-meta-schluessel': schluesselKennung(cfg.schluessel) } });
  if (!r.ok) throw await s3Fehler(r, 'Hochladen ins Ziel');
  await r.arrayBuffer().catch(() => null);
}

export async function zielLaden(cfg: SicherungKonfig, key: string): Promise<{ daten: Buffer; typ: string } | null> {
  const r = await s3(cfg, { methode: 'GET', key });
  if (r.status === 404) { await r.arrayBuffer().catch(() => null); return null; }
  if (!r.ok) throw await s3Fehler(r, 'Laden aus dem Ziel');
  return { daten: Buffer.from(await r.arrayBuffer()), typ: typSauber(r.headers.get('x-amz-meta-typ')) };
}

export async function zielLoeschen(cfg: SicherungKonfig, key: string): Promise<void> {
  const r = await s3(cfg, { methode: 'DELETE', key });
  if (!r.ok && r.status !== 404) throw await s3Fehler(r, 'Löschen im Ziel');
  await r.arrayBuffer().catch(() => null);
}

export async function zielListe(cfg: SicherungKonfig, praefix: string, weiter: string | null, trenner?: string) {
  const abfrage: Array<[string, string]> = [['list-type', '2'], ['prefix', praefix], ['max-keys', '1000']];
  if (weiter) abfrage.push(['continuation-token', weiter]);
  if (trenner) abfrage.push(['delimiter', trenner]);
  const r = await s3(cfg, { methode: 'GET', abfrage });
  if (!r.ok) throw await s3Fehler(r, 'Liste aus dem Ziel');
  return listeLesen(await r.text());
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
async function quelleLaden(admin: Admin, bucket: string, name: string): Promise<Buffer> {
  const { data, error } = await admin.storage.from(bucket).download(name);
  if (error || !data) throw new Error('Laden aus Supabase: ' + (error?.message ?? 'leer'));
  return Buffer.from(await data.arrayBuffer());
}

async function laufBeginnen(admin: Admin, art: string, ausgeloest: 'zeitplan' | 'betreiber'): Promise<string | null> {
  const { data } = await admin.from('speicher_sicherung_lauf').insert({ art, ausgeloest }).select('id').maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function laufBeenden(admin: Admin, id: string | null, z: { dateien?: number; bytes?: number; fehler?: number; geloescht?: number; ok: boolean; meldung: string }) {
  if (!id) return;
  await admin.from('speicher_sicherung_lauf').update({ ...z, meldung: z.meldung.slice(0, 1000), beendet_am: new Date().toISOString() }).eq('id', id);
}

type DbObjekt = { bucket: string; name: string; geaendert: string; groesse: number | string | null; etag: string | null; typ: string | null };
const alsObjekt = (o: DbObjekt): QuellObjekt => ({ ...o, groesse: o.groesse === null ? null : Number(o.groesse) });

/** Eine Datei sichern. Wirft nie — Fehler landen in der Zeile. */
async function eineSichern(admin: Admin, cfg: SicherungKonfig, o: QuellObjekt, alt: DateiZeile | null): Promise<{ ok: boolean; bytes: number }> {
  const basis = { bucket: o.bucket, name: o.name, groesse: o.groesse, quelle_etag: o.etag, quelle_geaendert: o.geaendert, typ: o.typ, fehlt_seit: null };
  try {
    if (zuGross(o)) throw new Error('Zu groß für die Sicherung (über 250 MB).');
    const klar = await quelleLaden(admin, o.bucket, o.name);
    const chiffrat = verschluesseln(klar, cfg.schluessel, zusatzDaten(o.bucket, o.name));
    await zielHochladen(cfg, zielSchluessel(o.bucket, o.name), chiffrat, o.typ ?? '');
    await admin.from('speicher_sicherung_datei').upsert({
      ...basis, groesse: klar.length, sha256: sha256Hex(klar), schluessel_kennung: schluesselKennung(cfg.schluessel),
      gesichert_am: new Date().toISOString(), fehler: null, versuche: 0,
    }, { onConflict: 'bucket,name' });
    return { ok: true, bytes: klar.length };
  } catch (e) {
    const versuche = zuGross(o) ? MAX_VERSUCHE : Math.min((alt?.versuche ?? 0) + 1, 100);
    await admin.from('speicher_sicherung_datei').upsert({ ...basis, fehler: fehlerText(e), versuche }, { onConflict: 'bucket,name' });
    return { ok: false, bytes: 0 };
  }
}

async function zeilenFuer(admin: Admin, liste: QuellObjekt[]): Promise<Map<string, DateiZeile>> {
  const m = new Map<string, DateiZeile>();
  const jeBucket = new Map<string, string[]>();
  for (const o of liste) jeBucket.set(o.bucket, [...(jeBucket.get(o.bucket) ?? []), o.name]);
  for (const [bucket, namen] of jeBucket) {
    for (let i = 0; i < namen.length; i += 100) {
      const { data } = await admin.from('speicher_sicherung_datei').select('bucket, name, quelle_etag, quelle_geaendert, sha256, fehler, versuche').eq('bucket', bucket).in('name', namen.slice(i, i + 100));
      for (const z of (data ?? []) as DateiZeile[]) m.set(`${z.bucket}\u0000${z.name}`, z);
    }
  }
  return m;
}

export type DurchgangBericht = { ok: boolean; eingerichtet: boolean; gesperrt?: boolean; dateien: number; bytes: number; fehler: number; geloescht: number; wiederholt: number; fertig: boolean; meldung: string; glocke?: boolean };

/** Ein Durchgang: Fehler wiederholen, neue/geänderte Dateien sichern, einmal am Tag Gelöschtes abgleichen. */
export async function sicherungsDurchgang(admin: Admin, opt: { budgetMs?: number; ausgeloest: 'zeitplan' | 'betreiber' }): Promise<DurchgangBericht> {
  const k = sicherungKonfig();
  const leer: DurchgangBericht = { ok: true, eingerichtet: false, dateien: 0, bytes: 0, fehler: 0, geloescht: 0, wiederholt: 0, fertig: true, meldung: '' };
  if (!k.eingerichtet) return { ...leer, ok: k.fehler.length === 0, meldung: k.fehler.length ? k.fehler.join(' ') : 'Nicht eingerichtet (Umgebungsvariablen fehlen).' };
  const cfg = k.cfg;
  const budget = Math.min(opt.budgetMs ?? BUDGET_MS, BUDGET_MS);
  const start = Date.now();

  const { data: frei, error: sperrFehler } = await admin.rpc('speicher_sicherung_sperre', { p_sekunden: Math.ceil(budget / 1000) + 60 });
  if (sperrFehler) return { ...leer, eingerichtet: true, ok: false, fertig: false, meldung: 'Sperre nicht lesbar (SQL Paket 350 eingespielt?).' };
  if (frei !== true) return { ...leer, eingerichtet: true, gesperrt: true, fertig: false, meldung: 'Ein anderer Durchgang läuft gerade.' };

  const lauf = await laufBeginnen(admin, 'sicherung', opt.ausgeloest);
  const b: DurchgangBericht = { ...leer, eingerichtet: true, fertig: false };
  try {
    // 1) Fehler von früher erneut versuchen (höchstens MAX_VERSUCHE je Datei)
    const { data: nochmal } = await admin.rpc('speicher_sicherung_wiederholen', { p_limit: 50, p_max_versuche: MAX_VERSUCHE });
    const wl = ((nochmal ?? []) as DbObjekt[]).map(alsObjekt);
    const wz = await zeilenFuer(admin, wl);
    for (const stapel of stapelBilden(wl)) {
      if (!zeitReicht(start, Date.now(), budget)) break;
      const erg = await Promise.all(stapel.map((o) => eineSichern(admin, cfg, o, wz.get(`${o.bucket}\u0000${o.name}`) ?? null)));
      for (const e of erg) { b.wiederholt++; if (e.ok) { b.dateien++; b.bytes += e.bytes; } else b.fehler++; }
    }

    // 2) Neue und geänderte Dateien ab dem Cursor
    const { data: st } = await admin.from('speicher_sicherung_stand').select('cursor_zeit, cursor_bucket, cursor_name, letzter_abgleich').eq('id', 1).maybeSingle();
    let cur = { zeit: (st?.cursor_zeit as string | null) ?? null, bucket: (st?.cursor_bucket as string | null) ?? null, name: (st?.cursor_name as string | null) ?? null };
    let ende = false;
    while (!ende && zeitReicht(start, Date.now(), budget)) {
      const { data: seite, error } = await admin.rpc('speicher_objekte_seit', { p_ab: cur.zeit, p_bucket: cur.bucket, p_name: cur.name, p_limit: 200 });
      if (error) throw new Error('Speicher-Liste nicht lesbar: ' + error.message);
      const liste = ((seite ?? []) as DbObjekt[]).map(alsObjekt);
      if (!liste.length) { ende = true; break; }
      const zeilen = await zeilenFuer(admin, liste);
      let abgebrochen = false;
      for (const stapel of stapelBilden(liste)) {
        if (!zeitReicht(start, Date.now(), budget)) { abgebrochen = true; break; }
        const zuTun = stapel.filter((o) => brauchtSicherung(o, zeilen.get(`${o.bucket}\u0000${o.name}`)));
        const erg = await Promise.all(zuTun.map((o) => eineSichern(admin, cfg, o, zeilen.get(`${o.bucket}\u0000${o.name}`) ?? null)));
        for (const e of erg) { if (e.ok) { b.dateien++; b.bytes += e.bytes; } else b.fehler++; }
        const letzte = stapel[stapel.length - 1];
        cur = { zeit: letzte.geaendert, bucket: letzte.bucket, name: letzte.name };
        await admin.from('speicher_sicherung_stand').update({ cursor_zeit: cur.zeit, cursor_bucket: cur.bucket, cursor_name: cur.name, aktualisiert_am: new Date().toISOString() }).eq('id', 1);
      }
      if (!abgebrochen && liste.length < 200) ende = true;
    }
    b.fertig = ende;

    // 3) Einmal am Tag: in der Quelle gelöschte Dateien abgleichen
    const letzter = st?.letzter_abgleich ? Date.parse(st.letzter_abgleich as string) : 0;
    if (Date.now() - letzter > 23 * 3_600_000 && zeitReicht(start, Date.now(), budget)) {
      const { data: alt, error } = await admin.rpc('speicher_sicherung_abgleich', { p_tage: LOESCH_TAGE });
      if (!error) {
        for (const z of (alt ?? []) as Array<{ bucket: string; name: string }>) {
          if (!zeitReicht(start, Date.now(), budget)) break;
          try {
            await zielLoeschen(cfg, zielSchluessel(z.bucket, z.name));
            await admin.from('speicher_sicherung_datei').delete().eq('bucket', z.bucket).eq('name', z.name).not('fehlt_seit', 'is', null);
            b.geloescht++;
          } catch { b.fehler++; }
        }
      }
    }
    b.ok = b.fehler === 0;
    b.meldung = `${b.dateien} Datei(en) gesichert${b.wiederholt ? ` (davon ${b.wiederholt} Wiederholung)` : ''}, ${b.fehler} Fehler${b.geloescht ? `, ${b.geloescht} nach ${LOESCH_TAGE} Tagen im Ziel gelöscht` : ''}${b.fertig ? ' — alles erfasst.' : ' — Rest im nächsten Durchgang.'}`;
  } catch (e) {
    b.ok = false;
    b.meldung = fehlerText(e);
  } finally {
    await laufBeenden(admin, lauf, { dateien: b.dateien, bytes: b.bytes, fehler: b.fehler, geloescht: b.geloescht, ok: b.ok, meldung: b.meldung });
    await admin.rpc('speicher_sicherung_frei');
  }
  b.glocke = await glockePruefen(admin);
  return b;
}

/** Glocke an den Betreiber, wenn etwas nicht stimmt (höchstens einmal in 24 Stunden). */
export async function glockePruefen(admin: Admin): Promise<boolean> {
  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (!betreiber) return false;
  const [erfolg, probe, erster, zahlen] = await Promise.all([
    admin.from('speicher_sicherung_lauf').select('gestartet_am').eq('art', 'sicherung').eq('ok', true).order('gestartet_am', { ascending: false }).limit(1).maybeSingle(),
    admin.from('speicher_sicherung_lauf').select('gestartet_am').eq('art', 'probe').eq('ok', true).order('gestartet_am', { ascending: false }).limit(1).maybeSingle(),
    admin.from('speicher_sicherung_lauf').select('gestartet_am').eq('art', 'sicherung').order('gestartet_am', { ascending: true }).limit(1).maybeSingle(),
    admin.rpc('speicher_sicherung_zahlen'),
  ]);
  const z = (zahlen.data ?? null) as SicherungZahlen | null;
  const g = glockeNoetig({
    jetzt: new Date(),
    letzterErfolg: (erfolg.data?.gestartet_am as string | undefined) ?? null,
    letzteProbe: (probe.data?.gestartet_am as string | undefined) ?? null,
    ersterLauf: (erster.data?.gestartet_am as string | undefined) ?? null,
    dauerFehler: Number(z?.dauerhaft ?? 0),
  });
  if (!g) return false;
  const { error } = await admin.rpc('benachrichtigung_erstellen', {
    p_owner: betreiber, p_typ: 'speicher_sicherung', p_titel: g.titel, p_nachricht: g.nachricht,
    p_link: '/admin/command-center/speicher-sicherung', p_ref_tabelle: 'speicher_sicherung_lauf', p_ref_id: 'speicher-sicherung', p_dedup_stunden: 24,
  });
  return !error;
}

// ---------------------------------------------------------------------------
// Probe-Wiederherstellung
// ---------------------------------------------------------------------------
export async function probeWiederherstellung(admin: Admin, cfg: SicherungKonfig): Promise<{ ok: boolean; meldung: string; ergebnisse: ProbeErgebnis[] }> {
  const lauf = await laufBeginnen(admin, 'probe', 'betreiber');
  const ergebnisse: ProbeErgebnis[] = [];
  const { data, error } = await admin.rpc('speicher_sicherung_stichprobe', { p_anzahl: PROBE_ANZAHL });
  if (error) {
    await laufBeenden(admin, lauf, { ok: false, meldung: 'Stichprobe nicht lesbar (SQL Paket 350?).' });
    return { ok: false, meldung: 'Stichprobe nicht lesbar (SQL Paket 350 eingespielt?).', ergebnisse };
  }
  const zeilen = ((data ?? []) as Array<DateiZeile & { groesse: number | null; typ: string | null }>);
  let echtUebrig = PROBE_ECHT;
  const ordner = `probe/${new Date().toISOString().replace(/[:.]/g, '-')}`;
  for (const [i, z] of zeilen.entries()) {
    const e: ProbeErgebnis = { bucket: z.bucket, name: z.name, entschluesselt: false, hashGleich: false, echt: false, echtOk: null, fehler: null };
    try {
      const geladen = await zielLaden(cfg, zielSchluessel(z.bucket, z.name));
      if (!geladen) throw new Error('Im Ziel nicht gefunden.');
      const klar = entschluesseln(geladen.daten, cfg.schluessel, zusatzDaten(z.bucket, z.name));
      e.entschluesselt = true;
      e.hashGleich = sha256Hex(klar) === z.sha256;
      if (!e.hashGleich) throw new Error('Prüfsumme weicht ab.');
      if (echtUebrig > 0 && klar.length <= PROBE_ECHT_GRENZE) {
        echtUebrig--;
        e.echt = true;
        const pfad = `${ordner}/${i + 1}-${z.name.split('/').pop() ?? 'datei'}`.slice(0, 900);
        const hoch = await admin.storage.from(PROBE_BUCKET).upload(pfad, klar, { contentType: geladen.typ, upsert: false });
        if (hoch.error) throw new Error('Zurückspielen: ' + hoch.error.message);
        try {
          const zurueck = await quelleLaden(admin, PROBE_BUCKET, pfad);
          e.echtOk = sha256Hex(zurueck) === z.sha256;
          if (!e.echtOk) throw new Error('Zurückgespielte Datei weicht ab.');
        } finally {
          await admin.storage.from(PROBE_BUCKET).remove([pfad]);
        }
      }
    } catch (x) {
      e.fehler = fehlerText(x);
      if (e.echt && e.echtOk === null) e.echtOk = false;
    }
    ergebnisse.push(e);
  }
  const a = probeAuswerten(ergebnisse);
  await laufBeenden(admin, lauf, { dateien: ergebnisse.length, fehler: ergebnisse.filter((x) => x.fehler).length, ok: a.ok, meldung: a.meldung });
  return { ...a, ergebnisse };
}

// ---------------------------------------------------------------------------
// Notfall-Wiederherstellung eines Buckets (überschreibt nie)
// ---------------------------------------------------------------------------
export async function zielBuckets(cfg: SicherungKonfig): Promise<string[]> {
  const aus: string[] = [];
  let weiter: string | null = null;
  for (let i = 0; i < 20; i++) {
    const l = await zielListe(cfg, ZIEL_PRAEFIX, weiter, '/');
    for (const p of l.ordner) { const b = p.slice(ZIEL_PRAEFIX.length).replace(/\/$/, ''); if (b) aus.push(b); }
    weiter = l.weiter;
    if (!weiter) break;
  }
  return aus.sort();
}

export type WiederherstellBericht = { ok: boolean; zurueck: number; vorhanden: number; fehler: number; weiter: string | null; meldung: string; fehlerListe: string[] };

export async function notfallWiederherstellen(admin: Admin, cfg: SicherungKonfig, bucket: string, weiter: string | null, budgetMs = BUDGET_MS): Promise<WiederherstellBericht> {
  const start = Date.now();
  const lauf = await laufBeginnen(admin, 'wiederherstellung', 'betreiber');
  const b: WiederherstellBericht = { ok: true, zurueck: 0, vorhanden: 0, fehler: 0, weiter, meldung: '', fehlerListe: [] };
  let bytes = 0;
  try {
    let token: string | null = weiter;
    let erstes = true;
    while ((erstes || token) && zeitReicht(start, Date.now(), budgetMs)) {
      erstes = false;
      const l = await zielListe(cfg, `${ZIEL_PRAEFIX}${bucket}/`, token);
      let komplett = true;
      for (const eintrag of l.eintraege) {
        if (!zeitReicht(start, Date.now(), budgetMs)) { komplett = false; break; }
        const ort = ausZielSchluessel(eintrag.key);
        if (!ort || ort.bucket !== bucket) continue;
        try {
          const g = await zielLaden(cfg, eintrag.key);
          if (!g) continue;
          const klar = entschluesseln(g.daten, cfg.schluessel, zusatzDaten(ort.bucket, ort.name));
          const { error } = await admin.storage.from(ort.bucket).upload(ort.name, klar, { contentType: g.typ, upsert: false });
          if (error && istSchonVorhanden(error)) b.vorhanden++;
          else if (error) throw new Error(error.message);
          else { b.zurueck++; bytes += klar.length; }
        } catch (x) {
          b.fehler++;
          if (b.fehlerListe.length < 10) b.fehlerListe.push(`${ort.name}: ${fehlerText(x)}`);
        }
      }
      // Seite nicht ganz geschafft: dieselbe Seite beim nächsten Klick noch einmal
      // (bereits zurückgespielte Dateien zählen dann als „schon vorhanden").
      if (!komplett) { b.weiter = token ?? ''; break; }
      token = l.weiter;
      b.weiter = token;
    }
    b.ok = b.fehler === 0;
    b.meldung = `${bucket}: ${b.zurueck} Datei(en) zurückgespielt, ${b.vorhanden} waren schon da (nicht überschrieben), ${b.fehler} Fehler${b.weiter !== null ? ' — noch nicht fertig, bitte „Weiter" drücken.' : ' — fertig.'}`;
  } catch (x) {
    b.ok = false;
    b.meldung = fehlerText(x);
  }
  await laufBeenden(admin, lauf, { dateien: b.zurueck, bytes, fehler: b.fehler, ok: b.ok, meldung: b.meldung });
  return b;
}

// ---------------------------------------------------------------------------
// Stand für die Seite
// ---------------------------------------------------------------------------
export async function standLaden(admin: Admin) {
  const [zahlen, laeufe, erfolg, probe, stand, fehlerDateien] = await Promise.all([
    admin.rpc('speicher_sicherung_zahlen'),
    admin.from('speicher_sicherung_lauf').select('id, art, ausgeloest, gestartet_am, beendet_am, dateien, bytes, fehler, geloescht, ok, meldung').order('gestartet_am', { ascending: false }).limit(40),
    admin.from('speicher_sicherung_lauf').select('gestartet_am').eq('art', 'sicherung').eq('ok', true).order('gestartet_am', { ascending: false }).limit(1).maybeSingle(),
    admin.from('speicher_sicherung_lauf').select('gestartet_am, ok, meldung').eq('art', 'probe').order('gestartet_am', { ascending: false }).limit(1).maybeSingle(),
    admin.from('speicher_sicherung_stand').select('cursor_zeit, laeuft_bis, letzter_abgleich').eq('id', 1).maybeSingle(),
    admin.from('speicher_sicherung_datei').select('bucket, name, fehler, versuche').not('fehler', 'is', null).order('versuche', { ascending: false }).limit(20),
  ]);
  return {
    sqlFehlt: !!zahlen.error,
    zahlen: (zahlen.data ?? null) as SicherungZahlen | null,
    laeufe: laeufe.data ?? [],
    letzterErfolg: (erfolg.data?.gestartet_am as string | undefined) ?? null,
    letzteProbe: probe.data ?? null,
    stand: stand.data ?? null,
    fehlerDateien: fehlerDateien.data ?? [],
  };
}
