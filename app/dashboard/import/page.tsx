'use client';

// ============================================================
// ARGONAUT OS · IMPORT-CENTER (Stufe 2) · /dashboard/import
//
// Stufe 1 (Launcher: Vorlage laden, zum Modul springen) bleibt unten erhalten.
// NEU oben: der Import-Assistent — Datei hochladen, Spalten zuordnen, prüfen,
// importieren. In vier Stufen, jede einzeln sichtbar:
//
//   1 Was importieren  ·  2 Datei wählen  ·  3 Spalten zuordnen  ·  4 Prüfen & Import
//
// Die Datei wird serverseitig gelesen (/api/import/lesen) und NICHT gespeichert.
// Geprüft wird mit lib/importParser (node-getestet), geschrieben per Supabase
// mit aktivem RLS — jeder Betrieb schreibt ausschließlich in seine eigenen Daten.
// ============================================================

import { useMemo, useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  importQuellen, sucheImporte, gruppiereImporte, zaehleImporte, quellenFuerModule,
  type ImportQuelle,
} from '@/lib/importKatalog';
import { BRANCHEN_PAKETE, KERN_MODULE, paketModule } from '@/lib/pakete';
import { MODUL_PFAD } from '@/lib/rechte';
import { csvZeile } from '@/lib/csvSchreiben';
import {
  ZIELE, zielDef, errateMapping, fehlendePflichtfelder, pruefeAlles,
  baueMustervorlage, passtZuordnung, leseCsv,
  type Mapping, type PruefBericht, type ZeilenFehler,
} from '@/lib/importParser';
import {
  PAKET_GROESSE, LESE_SEITE, GRENZEN_UMZUG, dateiWeg, dekodiere, pakete, tempoProMs, restMs, restText,
  formatDauer, formatBytes, zahlDe, uhrzeitBerlin, gesamtFortschritt, dateiProzent, verschluckt,
  hochrechnung, spannenText, umzugSumme, abschlussText,
  type Messpunkt, type MengenEinheit, type UmzugSumme,
} from '@/lib/importFortschritt';
import { leseZahl } from '@/lib/zahlen';
import { DateiBalken, GesamtBalken, type BalkenStand } from './FortschrittAnzeige';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)',
  danger: '#E06666', warn: '#E0A24C',
};

// Schritt 0 (27.09.2026): Einspielen in Paketen zu PAKET_GROESSE (500) Zeilen —
// echter Fortschritt, kein Timeout, und nach jedem Paket steht im Protokoll,
// was schon drin ist.
const MAX_FEHLER_ANZEIGE = 50;

/** Spalten, die erst mit supabase-sql/p123-import-fortschritt.sql existieren. */
const NEU_SPALTEN = 'umzug_id,dateigroesse,gestartet_am,dauer_ms,zeilen_pro_s,zeilen_gelesen,zeilen_uebersprungen,zeilen_abgelehnt,zeilen_doppelt,zeilen_gescheitert,zeilen_offen,warnungen,erstellt_von,beendet_am';

type Datei = {
  dateiname: string;
  blatt: string | null;
  trennzeichen: string;
  kopf: string[];
  zeilen: string[][];
  abgeschnitten: number;
  /** Groesse in Bytes (fuer Protokoll und Hochrechnung). */
  groesse: number;
};

type ImportErgebnis = {
  angelegt: number;
  aktualisiert: number;
  uebersprungen: number;
  fehlgeschlagen: number;
  fehler: ZeilenFehler[];
  // --- Schritt 0: Bilanz und Stoppuhr ---
  gelesen: number;
  abgelehnt: number;
  doppelt: number;
  /** noch nicht eingespielt, weil angehalten oder abgebrochen */
  offen: number;
  angehalten: boolean;
  dauerMs: number;
  zeilenProS: number | null;
};

type Umzug = {
  id: string; name: string; geplante_dateien: number | null;
  datenmenge: number | null; datenmenge_einheit: MengenEinheit | null;
  status: string; gestartet_am: string; beendet_am: string | null; dauer_ms: number | null;
  zusammenfassung: UmzugSumme | null;
};

type Job = {
  id: string; ziel: string; dateiname: string | null; status: string;
  kopfzeilen: string[] | null; mapping: Mapping | null;
  zeilen_gesamt: number; zeilen_ok: number; zeilen_fehler: number;
  als_vorlage: boolean; vorlage_name: string | null; erstellt_am: string;
  /** F6: ids der neu angelegten Datensätze (nur wenn die SQL-Spalte existiert). */
  angelegte_ids?: string[] | null; rueckgaengig_am?: string | null;
  /** Schritt 0: Messwerte (nur wenn p123-SQL gelaufen ist; alte Zeilen: null). */
  umzug_id?: string | null; dateigroesse?: number | null; gestartet_am?: string | null;
  dauer_ms?: number | null; zeilen_pro_s?: number | null; zeilen_gelesen?: number | null;
  zeilen_uebersprungen?: number | null; zeilen_abgelehnt?: number | null; zeilen_doppelt?: number | null;
  zeilen_gescheitert?: number | null; zeilen_offen?: number | null; warnungen?: number | null;
  erstellt_von?: string | null; beendet_am?: string | null;
};

type ServerAntwort = { ok: boolean; error?: string } & Partial<Omit<Datei, 'groesse'>>;

/** Datei im Browser laden — mit Bytes-Fortschritt. Die Datei verlaesst den Rechner nicht. */
function ladeImBrowser(f: File, beiFortschritt: (geladen: number) => void): Promise<Uint8Array> {
  return new Promise((ok, nein) => {
    const r = new FileReader();
    r.onprogress = (e) => { if (e.lengthComputable) beiFortschritt(e.loaded); };
    r.onerror = () => nein(new Error('Die Datei konnte nicht geladen werden.'));
    r.onload = () => { beiFortschritt(f.size); ok(new Uint8Array(r.result as ArrayBuffer)); };
    r.readAsArrayBuffer(f);
  });
}

/**
 * Excel an den Server schicken — mit Upload-Fortschritt (fetch kann das nicht,
 * deshalb XMLHttpRequest). hochgeladen() meldet: jetzt liest der Server.
 */
function ladeUeberServer(f: File, beiFortschritt: (geladen: number, gesamt: number) => void, hochgeladen: () => void): Promise<ServerAntwort> {
  return new Promise((ok, nein) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/import/lesen');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) beiFortschritt(e.loaded, e.total); };
    xhr.upload.onload = () => hochgeladen();
    xhr.onerror = () => nein(new Error('Die Verbindung ist abgebrochen — die Datei kam nicht beim Server an.'));
    xhr.onload = () => {
      const d = xhr.response as ServerAntwort | null;
      if (xhr.status === 413) {
        nein(new Error('Die Datei ist für den Server zu groß. Bitte in Excel als CSV speichern — CSV liest ARGONAUT direkt im Browser.'));
        return;
      }
      if (!d || xhr.status >= 400 || !d.ok) { nein(new Error(d?.error || 'Die Datei konnte nicht gelesen werden.')); return; }
      ok(d);
    };
    const form = new FormData();
    form.append('datei', f);
    xhr.send(form);
  });
}

/** Dem Browser kurz Luft geben, damit der Balken sich zeichnet. */
function kurzLuft(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function fmtZeit(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Merkt die gewaehlte Branche im Browser (nur Anzeige-Komfort, keine Daten). */
const BRANCHE_SPEICHER = 'argonaut_import_branche';

/**
 * Laedt die aus dem Feld-Katalog erzeugte Mustervorlage als CSV herunter.
 * Wird an zwei Stellen gebraucht: im Assistenten (Stufe 2) und auf den
 * Katalogkarten unten, die keine fertige Datei unter /vorlagen/ haben.
 */
function musterHerunterladen(zielKey: string) {
  const csv = baueMustervorlage(zielKey);
  if (!csv) return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `argonaut-vorlage-${zielKey}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Der Vorlagen-Knopf einer Katalogkarte: fertige Datei, erzeugte Vorlage oder nichts. */
function VorlagenKnopf({ quelle }: { quelle: ImportQuelle }) {
  if (quelle.vorlage) {
    return <a href={quelle.vorlage} download style={styles.btnVorlage}>⬇ Vorlage</a>;
  }
  if (quelle.musterZiel) {
    const zielKey = quelle.musterZiel;
    return (
      <button
        type="button"
        onClick={() => musterHerunterladen(zielKey)}
        style={{ ...styles.btnVorlage, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.2 }}
        title="Beispieldatei mit den richtigen Spalten und drei ausgefüllten Zeilen"
      >
        ⬇ Vorlage
      </button>
    );
  }
  return <span style={styles.keineVorlage}>eigener Import</span>;
}

export default function ImportCenterPage() {
  // --- Stufe 1: Katalog (unveraendert) -------------------------------------
  const [suche, setSuche] = useState('');
  const alle = useMemo(() => importQuellen(), []);

  // Branchen-Filter: zeigt nur die Vorlagen, die dieser Betrieb wirklich braucht.
  // Die Wahl bleibt im Browser gemerkt — kein Datenbankfeld, keine Migration.
  const [branche, setBranche] = useState('');
  useEffect(() => {
    try {
      const b = window.localStorage.getItem(BRANCHE_SPEICHER);
      if (b) setBranche(b);
    } catch { /* privater Modus: dann eben ohne Gedaechtnis */ }
  }, []);
  function waehleBranche(key: string) {
    setBranche(key);
    try { window.localStorage.setItem(BRANCHE_SPEICHER, key); } catch { /* egal */ }
  }
  const brancheQuellen = useMemo(
    () => (branche ? quellenFuerModule([...KERN_MODULE, ...paketModule(branche)], MODUL_PFAD, alle) : alle),
    [alle, branche],
  );

  const gefiltert = useMemo(() => sucheImporte(brancheQuellen, suche), [brancheQuellen, suche]);
  const gruppen = useMemo(() => gruppiereImporte(gefiltert), [gefiltert]);
  const kpi = useMemo(() => zaehleImporte(brancheQuellen), [brancheQuellen]);

  // --- Stufe 2: Assistent ---------------------------------------------------
  const [zielKey, setZielKey] = useState<string>('');
  const [datei, setDatei] = useState<Datei | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [bericht, setBericht] = useState<PruefBericht | null>(null);
  const [ergebnis, setErgebnis] = useState<ImportErgebnis | null>(null);
  const [beiDublette, setBeiDublette] = useState<'ueberspringen' | 'aktualisieren'>('ueberspringen');
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [merken, setMerken] = useState(true);
  const [verlauf, setVerlauf] = useState<Job[]>([]);

  // --- Schritt 0: Fortschritt, Stoppuhr, Umzug ------------------------------
  const [balken, setBalken] = useState<BalkenStand | null>(null);
  const messRef = useRef<Messpunkt[]>([]);
  const anhaltenRef = useRef(false);
  const [anhaltenGewuenscht, setAnhaltenGewuenscht] = useState(false);
  const dateiStartRef = useRef(0);
  const lesenEndeRef = useRef(0);
  const phasenRef = useRef<Record<string, number>>({});
  /** true, sobald supabase-sql/p123-import-fortschritt.sql gelaufen ist */
  const [neuesSchema, setNeuesSchema] = useState(false);
  const [umzug, setUmzug] = useState<Umzug | null>(null);
  const [letzteUmzuege, setLetzteUmzuege] = useState<Umzug[]>([]);
  const [abschluss, setAbschluss] = useState<{ summe: UmzugSumme; name: string } | null>(null);
  const [planDateien, setPlanDateien] = useState('');
  const [planMenge, setPlanMenge] = useState('');
  const [planEinheit, setPlanEinheit] = useState<MengenEinheit>('MB');
  const [jetzt, setJetzt] = useState(() => Date.now());
  const [ich, setIch] = useState<string | null>(null);
  const [namen, setNamen] = useState<Record<string, string>>({});

  const ziel = useMemo(() => (zielKey ? zielDef(zielKey) : undefined), [zielKey]);
  const offenePflicht = useMemo(() => (zielKey ? fehlendePflichtfelder(mapping, zielKey) : []), [mapping, zielKey]);

  const verlaufLaden = useCallback(async () => {
    const SPALTEN = 'id,ziel,dateiname,status,kopfzeilen,mapping,zeilen_gesamt,zeilen_ok,zeilen_fehler,als_vorlage,vorlage_name,erstellt_am';
    // Schritt 0: mit Messwerten — fehlen die Spalten (p123-SQL noch nicht
    // gelaufen), wie bisher. F6: mit „Rückgängig"-Spalten, sonst ohne.
    const r0 = await supabase.from('import_jobs').select(SPALTEN + ',angelegte_ids,rueckgaengig_am,' + NEU_SPALTEN)
      .order('erstellt_am', { ascending: false }).limit(60);
    if (!r0.error) {
      setVerlauf((r0.data as unknown as Job[]) ?? []);
      setNeuesSchema(true);
      const u = await supabase.from('import_umzug')
        .select('id,name,geplante_dateien,datenmenge,datenmenge_einheit,status,gestartet_am,beendet_am,dauer_ms,zusammenfassung')
        .order('gestartet_am', { ascending: false }).limit(10);
      if (!u.error) {
        const liste = (u.data as unknown as Umzug[]) ?? [];
        setUmzug(liste.find((x) => x.status === 'laeuft') ?? null);
        setLetzteUmzuege(liste.filter((x) => x.status === 'fertig').slice(0, 5));
      }
      return;
    }
    setNeuesSchema(false);
    const r1 = await supabase.from('import_jobs').select(SPALTEN + ',angelegte_ids,rueckgaengig_am')
      .order('erstellt_am', { ascending: false }).limit(40);
    if (!r1.error) { setVerlauf((r1.data as unknown as Job[]) ?? []); return; }
    const r2 = await supabase.from('import_jobs').select(SPALTEN)
      .order('erstellt_am', { ascending: false }).limit(40);
    setVerlauf((r2.data as unknown as Job[]) ?? []);
  }, []);

  // Wer bin ich, wie heissen die Kolleginnen und Kollegen (Spalte „Wer").
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setIch(data?.user?.id ?? null);
      const { data: ma } = await supabase.from('mitarbeiter').select('auth_user_id, vorname, nachname');
      const n: Record<string, string> = {};
      for (const m of ((ma ?? []) as { auth_user_id: string | null; vorname: string | null; nachname: string | null }[])) {
        if (m.auth_user_id) n[m.auth_user_id] = [m.vorname, m.nachname].filter(Boolean).join(' ') || 'Mitarbeiter';
      }
      setNamen(n);
    })();
  }, []);

  // Stoppuhr: laeuft, solange ein Umzug offen ist oder eine Datei arbeitet.
  useEffect(() => {
    if (!umzug && busy !== 'import' && busy !== 'lesen') return;
    const t = setInterval(() => setJetzt(Date.now()), 1000);
    return () => clearInterval(t);
  }, [umzug, busy]);

  /** Eigene Messwerte des Betriebs fuer die Hochrechnung. */
  const messwerte = useMemo(() => verlauf
    .filter((j) => (j.dauer_ms ?? 0) > 0 && (j.zeilen_gelesen ?? 0) > 0 && j.status !== 'rueckgaengig')
    .map((j) => ({ bytes: j.dateigroesse ?? null, zeilen: j.zeilen_gelesen ?? 0, dauerMs: j.dauer_ms ?? 0 })), [verlauf]);

  const umzugJobs = useMemo(() => (umzug ? verlauf.filter((j) => j.umzug_id === umzug.id) : []), [verlauf, umzug]);

  const laufendProzent = balken && balken.phase !== 'fertig' && !balken.fehler && datei ? dateiProzent(balken) : null;
  const gesamt = umzug ? gesamtFortschritt({
    geplant: umzug.geplante_dateien ?? 0,
    fertigeDateien: umzugJobs.filter((j) => j.status !== 'laeuft' && j.status !== 'rueckgaengig').length,
    laufendProzent,
    startMs: Date.parse(umzug.gestartet_am),
    jetztMs: jetzt,
  }) : null;

  const planMengeZahl = leseZahl(planMenge);
  const schaetzung = useMemo(() => {
    const menge = umzug?.datenmenge ?? planMengeZahl;
    const einheit = (umzug?.datenmenge_einheit ?? planEinheit) as MengenEinheit;
    return menge ? hochrechnung(menge, einheit, messwerte) : null;
  }, [umzug, planMengeZahl, planEinheit, messwerte]);

  async function betriebUndIch(): Promise<{ uid: string; betrieb: string }> {
    const { data: nutzer } = await supabase.auth.getUser();
    const uid = nutzer?.user?.id;
    if (!uid) throw new Error('Nicht angemeldet.');
    const { data: chefId } = await supabase.rpc('mein_chef_id');
    return { uid, betrieb: typeof chefId === 'string' && chefId ? chefId : uid };
  }

  async function umzugStarten() {
    setFehler(null); setAbschluss(null);
    try {
      const { uid, betrieb } = await betriebUndIch();
      const geplant = leseZahl(planDateien);
      const menge = leseZahl(planMenge);
      const { data, error } = await supabase.from('import_umzug').insert({
        owner_user_id: betrieb,
        erstellt_von: uid,
        geplante_dateien: geplant && geplant > 0 ? Math.min(1000, Math.round(geplant)) : null,
        datenmenge: menge && menge > 0 ? menge : null,
        datenmenge_einheit: menge && menge > 0 ? planEinheit : null,
      }).select('id,name,geplante_dateien,datenmenge,datenmenge_einheit,status,gestartet_am,beendet_am,dauer_ms,zusammenfassung').single();
      if (error) throw new Error(error.message);
      setUmzug(data as unknown as Umzug);
      setJetzt(Date.now());
    } catch (err: unknown) {
      setFehler('Umzug konnte nicht gestartet werden: ' + (err instanceof Error ? err.message : 'Fehler'));
    }
  }

  async function umzugAbschliessen() {
    if (!umzug) return;
    const fertig = umzugJobs.filter((j) => j.status !== 'rueckgaengig').length;
    if (umzug.geplante_dateien && fertig < umzug.geplante_dateien && typeof window !== 'undefined'
      && !window.confirm(`Erst ${fertig} von ${umzug.geplante_dateien} Dateien sind importiert. Umzug trotzdem abschließen?`)) return;
    const ende = Date.now();
    const summe = umzugSumme(umzugJobs, Date.parse(umzug.gestartet_am), ende);
    const { error } = await supabase.from('import_umzug').update({
      status: 'fertig', beendet_am: new Date(ende).toISOString(), dauer_ms: summe.dauerMs, zusammenfassung: summe,
    }).eq('id', umzug.id);
    if (error) { setFehler('Abschluss konnte nicht gespeichert werden: ' + error.message); return; }
    setAbschluss({ summe, name: umzug.name });
    setUmzug(null);
    await verlaufLaden();
  }

  // --- F6: Import rückgängig machen -----------------------------------------
  // Loescht NUR die Datensaetze, die dieser Import neu angelegt hat. Geaenderte
  // bestehende Datensaetze bleiben geaendert (der alte Stand ist nicht
  // gespeichert). Offene Posten (Rechnungen) sind ausgenommen — Geld-Daten
  // werden nicht per Knopf geloescht.
  async function rueckgaengig(j: Job) {
    const z = zielDef(j.ziel);
    const ids = (j.angelegte_ids ?? []).filter(Boolean);
    if (!z || ids.length === 0 || z.tabelle === 'rechnungen') return;
    if (typeof window !== 'undefined' && !window.confirm(
      `Die ${ids.length} Datensätze, die dieser Import in „${z.label}" neu angelegt hat, werden gelöscht. ` +
      'Geänderte bestehende Datensätze bleiben, wie sie sind. Fortfahren?'
    )) return;
    setBusy('rueck'); setFehler(null); setHinweis(null);
    let geloescht = 0; let gescheitert = 0;
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const teil = ids.slice(i, i + 200);
        const { data, error } = await supabase.from(z.tabelle).delete().in('id', teil).select('id');
        if (error) { gescheitert += teil.length; continue; }
        const n = ((data as unknown[]) ?? []).length;
        geloescht += n; gescheitert += teil.length - n;
      }
      await supabase.from('import_jobs').update({ status: 'rueckgaengig', rueckgaengig_am: new Date().toISOString() }).eq('id', j.id);
      setHinweis(gescheitert === 0
        ? `Import rückgängig gemacht — ${geloescht} Datensätze gelöscht.`
        : `${geloescht} Datensätze gelöscht, ${gescheitert} nicht (bereits gelöscht, fehlendes Löschrecht oder schon anderswo verwendet, z. B. in einer Rechnung).`);
      await verlaufLaden();
    } catch (err: unknown) {
      setFehler('Rückgängig fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  useEffect(() => { verlaufLaden(); }, [verlaufLaden]);

  /** Die eigene Mustervorlage als CSV herunterladen — passt garantiert. */
  function vorlageHerunterladen() {
    if (!ziel) return;
    musterHerunterladen(ziel.key);
  }

  function zuruecksetzen(behalteZiel = false) {
    if (!behalteZiel) setZielKey('');
    setDatei(null); setMapping({}); setBericht(null); setErgebnis(null);
    setFehler(null); setHinweis(null); setBalken(null);
  }

  function zielWaehlen(key: string) {
    setZielKey(key);
    setDatei(null); setMapping({}); setBericht(null); setErgebnis(null); setFehler(null); setHinweis(null); setBalken(null);
  }

  // --- Datei einlesen -------------------------------------------------------
  // Schritt 0: CSV/TXT liest der BROWSER (Bytes-Fortschritt, keine 4,5-MB-
  // Grenze von Vercel, keine 5.000-Zeilen-Kappung). Excel geht an den Server,
  // mit Upload-Fortschritt; dort gilt die Grenze je Anfrage.
  function ladeFortschritt(geladen: number, gesamtBytes: number) {
    messRef.current.push({ t: Date.now(), n: geladen });
    const tempo = tempoProMs(messRef.current);
    setBalken({
      phase: 'laden',
      anteil: gesamtBytes > 0 ? geladen / gesamtBytes : 0,
      zaehler: `${formatBytes(geladen)} von ${formatBytes(gesamtBytes)}`,
      rest: restText(restMs(geladen, gesamtBytes, tempo)),
    });
  }

  async function dateiLesen(f: File) {
    if (!zielKey) return;
    setFehler(null); setHinweis(null); setBericht(null); setErgebnis(null);
    const weg = dateiWeg(f.name, f.size);
    if (weg.weg === 'zu_gross') { setFehler(weg.hinweis); setBalken(null); return; }

    setBusy('lesen');
    dateiStartRef.current = Date.now();
    phasenRef.current = {};
    messRef.current = [];
    let phaseStart = Date.now();
    const phaseEnde = (key: string) => { phasenRef.current[key] = Date.now() - phaseStart; phaseStart = Date.now(); };
    ladeFortschritt(0, f.size);

    try {
      let neu: Datei;
      const leseHinweise: string[] = [];
      if (weg.weg === 'browser') {
        const bytes = await ladeImBrowser(f, (geladen) => ladeFortschritt(geladen, f.size));
        phaseEnde('laden');
        setBalken({ phase: 'lesen', anteil: 0.4, zaehler: `${formatBytes(f.size)} geladen · wird gelesen …` });
        await kurzLuft();
        const tab = leseCsv(dekodiere(bytes));
        leseHinweise.push(...tab.hinweise);
        neu = {
          dateiname: f.name, blatt: null, trennzeichen: tab.trennzeichen,
          kopf: tab.kopf.map((h, i) => (h.trim() || `Spalte ${i + 1}`)),
          zeilen: tab.zeilen, abgeschnitten: 0, groesse: f.size,
        };
        if (neu.kopf.length === 0) throw new Error('In der Datei ist keine Kopfzeile mit Spaltennamen zu erkennen.');
      } else {
        const daten = await ladeUeberServer(
          f,
          (geladen, gesamtBytes) => ladeFortschritt(geladen, gesamtBytes),
          () => { phaseEnde('laden'); setBalken({ phase: 'lesen', anteil: 0.5, zaehler: 'Der Server liest die Excel-Datei …' }); },
        );
        if (!phasenRef.current.laden) phaseEnde('laden');
        neu = {
          dateiname: daten.dateiname ?? f.name,
          blatt: daten.blatt ?? null,
          trennzeichen: daten.trennzeichen ?? '',
          kopf: daten.kopf ?? [],
          zeilen: daten.zeilen ?? [],
          abgeschnitten: daten.abgeschnitten ?? 0,
          groesse: f.size,
        };
      }
      phaseEnde('lesen');
      lesenEndeRef.current = Date.now();
      setDatei(neu);
      setBalken({ phase: 'pruefen', anteil: 0, zaehler: `${zahlDe(neu.zeilen.length)} Zeilen gelesen in ${formatDauer(Date.now() - dateiStartRef.current)}`, wartet: 'wartet auf Ihre Zuordnung (Stufe 3)' });

      // Gab es fuer genau diesen Datei-Aufbau schon einmal eine Zuordnung?
      // Dann die gemerkte nehmen — die ist von Hand geprueft und schlaegt jedes Raten.
      const gemerkt = verlauf.find(
        (j) => j.als_vorlage && j.ziel === zielKey && passtZuordnung(j.kopfzeilen ?? [], neu.kopf) && j.mapping
      );

      if (gemerkt?.mapping) {
        setMapping(gemerkt.mapping);
        setHinweis(`${zahlDe(neu.zeilen.length)} Zeilen gelesen · gespeicherte Zuordnung von „${gemerkt.vorlage_name || gemerkt.dateiname || 'früherem Import'}" übernommen.`);
      } else {
        const geraten = errateMapping(neu.kopf, zielKey);
        setMapping(geraten);
        const erkannt = Object.values(geraten).filter(Boolean).length;
        setHinweis(`${zahlDe(neu.zeilen.length)} Zeilen gelesen · ${erkannt} von ${neu.kopf.length} Spalten automatisch erkannt. Bitte kurz prüfen.`);
      }
      if (leseHinweise.length > 0) setHinweis((h) => `${h ?? ''} ${leseHinweise.join(' ')}`);
      if (neu.abgeschnitten > 0) {
        setHinweis((h) => `${h ?? ''} Achtung: ${zahlDe(neu.abgeschnitten)} weitere Zeilen wurden abgeschnitten (Excel-Grenze des Servers). Tipp: in Excel als CSV speichern — CSV liest ARGONAUT vollständig im Browser.`);
      }
    } catch (err: unknown) {
      setFehler(err instanceof Error ? err.message : 'Die Datei konnte nicht gelesen werden.');
      setBalken((b) => (b ? { ...b, fehler: true, rest: null, wartet: null } : null));
    } finally { setBusy(null); }
  }

  function feldSetzen(spalte: string, feldKey: string) {
    setMapping((m) => {
      const neu = { ...m };
      // Ein Zielfeld darf nur einmal belegt sein — sonst überschreiben sich zwei Spalten.
      if (feldKey) for (const [s, k] of Object.entries(neu)) if (k === feldKey && s !== spalte) neu[s] = '';
      neu[spalte] = feldKey;
      return neu;
    });
    setBericht(null); setErgebnis(null);
  }

  // --- Prüfen ---------------------------------------------------------------
  function pruefen() {
    if (!datei || !zielKey) return;
    setBusy('pruefen'); setFehler(null);
    try {
      const t0 = Date.now();
      // Die Zeit bis hierher war Ihre Zuordnung — sie zaehlt nicht als Rechenzeit.
      if (lesenEndeRef.current) phasenRef.current.zuordnen = t0 - lesenEndeRef.current;
      const b = pruefeAlles(zielKey, mapping, datei.kopf, datei.zeilen);
      phasenRef.current.pruefen = Date.now() - t0;
      setBericht(b);
      setErgebnis(null);
      setBalken({
        phase: 'einspielen', anteil: 0,
        zaehler: `${zahlDe(b.gut)} von ${zahlDe(b.gesamt)} Zeilen bereit · geprüft in ${formatDauer(phasenRef.current.pruefen)}`,
        wartet: b.gut > 0 ? 'wartet auf „jetzt importieren"' : 'nichts zu übernehmen',
      });
    } catch (err: unknown) {
      setFehler('Prüfung fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  // --- Importieren ----------------------------------------------------------
  // Schritt 0: in Paketen zu 500 Zeilen. Das Protokoll entsteht VOR dem ersten
  // Paket und wird nach jedem Paket fortgeschrieben — bricht etwas ab (Netz,
  // Tab zu, „Anhalten"), steht dort genau, was schon drin ist. Die Zeilen-
  // Bilanz geht immer auf: gelesen = übernommen + geändert + übersprungen +
  // abgelehnt + doppelt + gescheitert + offen. Rest = „verschluckt" (muss 0 sein).
  function anhalten() {
    anhaltenRef.current = true;
    setAnhaltenGewuenscht(true);
  }

  async function importieren() {
    if (!datei || !ziel || !bericht || bericht.gut === 0) return;
    if (typeof window !== 'undefined' && !window.confirm(
      `${zahlDe(bericht.gut)} Datensätze werden jetzt in „${ziel.label}" geschrieben. Fortfahren?`
    )) return;

    setBusy('import'); setFehler(null);
    anhaltenRef.current = false; setAnhaltenGewuenscht(false);
    messRef.current = [];
    const doppelt = bericht.dubletten_in_datei;
    const erg: ImportErgebnis = {
      angelegt: 0, aktualisiert: 0, uebersprungen: 0, fehlgeschlagen: 0, fehler: [],
      gelesen: bericht.gesamt, doppelt, abgelehnt: Math.max(0, bericht.schlecht - doppelt),
      offen: 0, angehalten: false, dauerMs: 0, zeilenProS: null,
    };
    const angelegteIds: string[] = [];
    let jobId: string | null = null;
    let gesamtSchreiben = 0;
    let erledigt = 0;
    let einspielStart = Date.now();
    let uidFuerAlt = '';

    /** Protokoll-Zeile auf den aktuellen Stand bringen (nur neues Schema). */
    const fortschreiben = async (status: string, ende = false) => {
      if (!jobId) return;
      const einspielMs = Date.now() - einspielStart;
      const rechenMs = (phasenRef.current.laden ?? 0) + (phasenRef.current.lesen ?? 0) + (phasenRef.current.pruefen ?? 0) + einspielMs;
      await supabase.from('import_jobs').update({
        status,
        zeilen_ok: erg.angelegt + erg.aktualisiert,
        zeilen_fehler: erg.fehlgeschlagen + bericht.schlecht,
        zeilen_uebersprungen: erg.uebersprungen,
        zeilen_gescheitert: erg.fehlgeschlagen,
        zeilen_offen: Math.max(0, gesamtSchreiben - erledigt),
        angelegte_ids: angelegteIds,
        fehler: [...bericht.fehler, ...erg.fehler].slice(0, 500),
        dauer_ms: rechenMs,
        zeilen_pro_s: einspielMs >= 1000 && erledigt > 0 ? Math.round((erledigt / (einspielMs / 1000)) * 100) / 100 : null,
        phasen_ms: { ...phasenRef.current, einspielen: einspielMs },
        ...(ende ? { beendet_am: new Date().toISOString() } : {}),
      }).eq('id', jobId);
    };

    const zeigeStand = () => {
      messRef.current.push({ t: Date.now(), n: erledigt });
      const tempo = tempoProMs(messRef.current);
      setBalken({
        phase: 'einspielen',
        anteil: gesamtSchreiben > 0 ? erledigt / gesamtSchreiben : 1,
        zaehler: `${zahlDe(erledigt)} von ${zahlDe(gesamtSchreiben)} Zeilen eingespielt`,
        rest: restText(restMs(erledigt, gesamtSchreiben, tempo)),
      });
    };

    try {
      const { uid, betrieb } = await betriebUndIch();
      uidFuerAlt = uid;
      // B1b-2 (26.09.26): Importierte Kontakte gehoeren dem Betrieb (beim Mitarbeiter
      // der Chef) — sonst sieht der Chef sie nicht. Andere Ziele bleiben wie bisher.
      let neuOwner = uid;
      if (ziel.tabelle === 'kontakte') neuOwner = betrieb;

      // Bereits vorhandene Schlüssel laden — damit nichts doppelt entsteht.
      // Schritt 0: SEITENWEISE. Supabase liefert je Abfrage hoechstens 1.000
      // Zeilen; vorher sah die Pruefung ab dem 1.001. Eintrag nichts mehr.
      setBalken({ phase: 'einspielen', anteil: 0, zaehler: 'Abgleich mit vorhandenen Einträgen …' });
      const vorhanden = new Map<string, string>();
      if (ziel.schluessel) {
        for (let von = 0; von < 5000000; von += LESE_SEITE) {
          // Der dynamische Spaltenname laesst sich vom Supabase-Typparser nicht
          // aufloesen — deshalb der Umweg ueber unknown.
          const { data: alt, error } = await supabase.from(ziel.tabelle)
            .select(`id,${ziel.schluessel}`).order('id').range(von, von + LESE_SEITE - 1);
          if (error) throw new Error('Abgleich mit den vorhandenen Einträgen fehlgeschlagen: ' + error.message);
          const liste = (alt ?? []) as unknown as Record<string, unknown>[];
          for (const z of liste) {
            const sch = String(z[ziel.schluessel] ?? '').trim().toLowerCase();
            if (sch) vorhanden.set(sch, String(z.id));
          }
          if (liste.length < LESE_SEITE) break;
        }
      }

      const neu: Record<string, unknown>[] = [];
      const neuZeile: number[] = [];               // F6: echte Dateizeile je neuem Satz
      const zuAendern: { id: string; werte: Record<string, unknown>; zeile: number }[] = [];

      bericht.saetze.forEach((satz, idx) => {
        const dateiZeile = bericht.zeilenNummern?.[idx] ?? 0;
        const sch = ziel.schluessel ? String(satz[ziel.schluessel] ?? '').trim().toLowerCase() : '';
        const treffer = sch ? vorhanden.get(sch) : undefined;
        if (treffer) {
          if (beiDublette === 'aktualisieren') zuAendern.push({ id: treffer, werte: satz, zeile: dateiZeile });
          else erg.uebersprungen++;
          return;
        }
        neu.push({ ...satz, owner_user_id: neuOwner });
        neuZeile.push(dateiZeile);
      });
      gesamtSchreiben = neu.length + zuAendern.length;

      // Protokoll VOR dem ersten Paket anlegen (neues Schema). Gehoert dem
      // Betrieb, erstellt_von sagt, wer es war.
      if (neuesSchema) {
        const { data: j } = await supabase.from('import_jobs').insert({
          owner_user_id: betrieb,
          erstellt_von: uid,
          ziel: zielKey,
          dateiname: datei.dateiname,
          status: 'laeuft',
          kopfzeilen: datei.kopf,
          mapping,
          zeilen_gesamt: bericht.gesamt,
          zeilen_gelesen: bericht.gesamt,
          zeilen_ok: 0,
          zeilen_fehler: bericht.schlecht,
          zeilen_abgelehnt: erg.abgelehnt,
          zeilen_doppelt: doppelt,
          zeilen_uebersprungen: erg.uebersprungen,
          zeilen_gescheitert: 0,
          zeilen_offen: gesamtSchreiben,
          warnungen: bericht.warnungen.length,
          fehler: bericht.fehler.slice(0, 500),
          als_vorlage: merken,
          vorlage_name: merken ? datei.dateiname : null,
          umzug_id: umzug?.id ?? null,
          dateigroesse: datei.groesse,
          gestartet_am: new Date(dateiStartRef.current || Date.now()).toISOString(),
          angelegte_ids: [],
        }).select('id').single();
        jobId = (j as { id: string } | null)?.id ?? null;
      }

      einspielStart = Date.now();
      zeigeStand();

      // Neue Datensätze in Paketen. Scheitert ein Paket, wird es Zeile für Zeile
      // wiederholt — nur so weiß man am Ende, WELCHE Zeile das Problem war.
      for (const p of pakete(neu.length, PAKET_GROESSE)) {
        if (anhaltenRef.current) break;
        const stapel = neu.slice(p.von, p.bis);
        const { data: neuIds, error } = await supabase.from(ziel.tabelle).insert(stapel).select('id');
        if (!error) {
          erg.angelegt += stapel.length;
          ((neuIds as { id: string }[] | null) ?? []).forEach((r) => angelegteIds.push(r.id));
        } else {
          for (let j = 0; j < stapel.length; j++) {
            const einzeln = stapel[j];
            const { data: eineId, error: e2 } = await supabase.from(ziel.tabelle).insert(einzeln).select('id');
            if (e2) {
              erg.fehlgeschlagen++;
              erg.fehler.push({
                zeile: neuZeile[p.von + j] ?? 0,
                feld: ziel.schluessel ? String(einzeln?.[ziel.schluessel] ?? '') : '',
                meldung: e2.message,
              });
            } else {
              erg.angelegt++;
              ((eineId as { id: string }[] | null) ?? []).forEach((r) => angelegteIds.push(r.id));
            }
          }
        }
        erledigt += stapel.length;
        zeigeStand();
        await fortschreiben('laeuft');
      }

      // Aenderungen: je 10 gleichzeitig, Protokoll alle 500.
      for (const p of pakete(anhaltenRef.current ? 0 : zuAendern.length, 10)) {
        if (anhaltenRef.current) break;
        await Promise.all(zuAendern.slice(p.von, p.bis).map(async (a) => {
          const { error } = await supabase.from(ziel.tabelle).update(a.werte).eq('id', a.id);
          if (error) { erg.fehlgeschlagen++; erg.fehler.push({ zeile: a.zeile, feld: '', meldung: error.message }); }
          else erg.aktualisiert++;
        }));
        erledigt += p.bis - p.von;
        zeigeStand();
        if (p.bis % PAKET_GROESSE === 0) await fortschreiben('laeuft');
      }

      erg.offen = Math.max(0, gesamtSchreiben - erledigt);
      erg.angehalten = erg.offen > 0;
      const einspielMs = Date.now() - einspielStart;
      erg.dauerMs = (phasenRef.current.laden ?? 0) + (phasenRef.current.lesen ?? 0) + (phasenRef.current.pruefen ?? 0) + einspielMs;
      erg.zeilenProS = einspielMs >= 1000 && erledigt > 0 ? erledigt / (einspielMs / 1000) : null;
      const status = erg.angehalten ? 'angehalten' : erg.fehlgeschlagen > 0 ? 'teilweise' : 'fertig';

      if (jobId) {
        await fortschreiben(status, true);
      } else {
        // Alter Weg (p123-SQL noch nicht gelaufen): Protokoll am Ende, wie bisher.
        // F6: mit angelegten ids; fehlt die Spalte, ohne.
        const jobSatz = {
          owner_user_id: uid,
          ziel: zielKey,
          dateiname: datei.dateiname,
          status: status === 'angehalten' ? 'abgebrochen' : status,
          kopfzeilen: datei.kopf,
          mapping,
          zeilen_gesamt: bericht.gesamt,
          zeilen_ok: erg.angelegt + erg.aktualisiert,
          zeilen_fehler: erg.fehlgeschlagen + bericht.schlecht,
          fehler: [...bericht.fehler, ...erg.fehler].slice(0, 500),
          als_vorlage: merken,
          vorlage_name: merken ? datei.dateiname : null,
          beendet_am: new Date().toISOString(),
        };
        const { error: jobFehler } = await supabase.from('import_jobs').insert({ ...jobSatz, angelegte_ids: angelegteIds });
        if (jobFehler) await supabase.from('import_jobs').insert(jobSatz);
      }

      setErgebnis(erg);
      setBalken({
        phase: erg.angehalten ? 'einspielen' : 'fertig',
        anteil: gesamtSchreiben > 0 ? erledigt / gesamtSchreiben : 1,
        angehalten: erg.angehalten,
        zaehler: `${zahlDe(erledigt)} von ${zahlDe(gesamtSchreiben)} Zeilen eingespielt · ${formatDauer(erg.dauerMs)} Rechenzeit`,
        rest: erg.zeilenProS ? `${zahlDe(erg.zeilenProS)} Zeilen pro Sekunde` : null,
        wartet: erg.angehalten ? `angehalten — ${zahlDe(erg.offen)} Zeilen noch offen` : null,
      });
      await verlaufLaden();
      setHinweis(erg.angehalten
        ? `Import angehalten. ${zahlDe(erg.angelegt + erg.aktualisiert)} Datensätze sind drin, ${zahlDe(erg.offen)} Zeilen noch nicht.`
        : `Import abgeschlossen in ${formatDauer(erg.dauerMs)} Rechenzeit.`);
    } catch (err: unknown) {
      const meldung = err instanceof Error ? err.message : 'Fehler';
      erg.offen = Math.max(0, gesamtSchreiben - erledigt);
      if (jobId) {
        try { await fortschreiben('abgebrochen', true); } catch { /* Protokoll bleibt beim letzten Paket-Stand */ }
      }
      setFehler(`Import abgebrochen: ${meldung}` + (erledigt > 0
        ? ` Bis dahin ${zahlDe(erg.angelegt + erg.aktualisiert)} Datensätze übernommen — steht so im Protokoll unten.`
        : ''));
      setBalken((b) => (b ? { ...b, fehler: true, rest: null, wartet: 'abgebrochen' } : null));
      if (uidFuerAlt) await verlaufLaden();
    } finally {
      setBusy(null);
      anhaltenRef.current = false; setAnhaltenGewuenscht(false);
    }
  }

  // --- Fehlerbericht als CSV -----------------------------------------------
  function fehlerHerunterladen() {
    const zeilen = [
      ...(bericht?.fehler ?? []).map((f) => ({ ...f, art: 'Fehler' })),
      ...(ergebnis?.fehler ?? []).map((f) => ({ ...f, art: 'Fehler beim Speichern' })),
      ...(bericht?.warnungen ?? []).map((f) => ({ ...f, art: 'Warnung' })),
    ];
    if (zeilen.length === 0) return;
    const kopf = 'Art;Zeile;Feld;Meldung';
    // Feldname und Meldung stammen aus der HOCHGELADENEN Datei, sind also
    // fremder Text. Bis 16.09.2026 wurden sie nur gequotet, nicht entschaerft.
    const text = [kopf, ...zeilen.map((z) => csvZeile([z.art, z.zeile, z.feld, z.meldung]))].join('\r\n');
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-bericht-${zielKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // =========================================================================

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>📥 Import-Center</h1>
      <p style={styles.sub}>
        Ihre bestehenden Daten in ARGONAUT bringen — ohne Abtippen. Laden Sie eine Excel- oder CSV-Datei
        hoch, ordnen Sie die Spalten zu und importieren Sie. Vorher sehen Sie genau, was ankommt und was nicht.
      </p>

      {/* ================= Assistent ================= */}
      <div style={styles.assistent}>

        {/* --- Umzug: Gesamtbalken, Stoppuhr, Hochrechnung (Schritt 0) --- */}
        <div style={{ ...styles.stufe, borderColor: umzug ? 'rgba(201,168,76,0.45)' : C.border }}>
          <div style={styles.stufenTitel}>🚚 Umzug nach ARGONAUT</div>
          {umzug && gesamt ? (
            <>
              <GesamtBalken
                prozent={gesamt.prozent}
                text={`${gesamt.fertig} von ${umzug.geplante_dateien ? umzug.geplante_dateien : '?'} Dateien`}
                unter={[
                  `läuft seit ${formatDauer(jetzt - Date.parse(umzug.gestartet_am))}`,
                  gesamt.fertigUm ? `fertig ca. ${uhrzeitBerlin(gesamt.fertigUm)}` : (umzug.geplante_dateien ? 'Hochrechnung ab dem ersten Fortschritt' : 'Ohne geplante Dateizahl keine Uhrzeit-Hochrechnung'),
                ].join(' · ')}
              />
              {umzugJobs.length > 0 && (
                <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
                  {[...umzugJobs].reverse().map((j) => {
                    const z = zielDef(j.ziel);
                    const stand: BalkenStand = {
                      phase: j.status === 'laeuft' || j.status === 'angehalten' || j.status === 'abgebrochen' ? 'einspielen' : 'fertig',
                      anteil: (j.zeilen_offen ?? 0) > 0 && (j.zeilen_gelesen ?? 0) > 0 ? 1 - (j.zeilen_offen ?? 0) / (j.zeilen_gelesen ?? 1) : 1,
                      angehalten: j.status === 'angehalten',
                      fehler: j.status === 'abgebrochen',
                      zaehler: `${z ? z.label : j.ziel} · ${zahlDe(j.zeilen_ok)} übernommen${j.dauer_ms ? ` · ${formatDauer(j.dauer_ms)}` : ''}${j.status === 'rueckgaengig' ? ' · rückgängig gemacht' : ''}`,
                    };
                    return <DateiBalken key={j.id} name={j.dateiname ?? '—'} stand={stand} kompakt />;
                  })}
                </div>
              )}
              {schaetzung && (
                <div style={{ color: C.dim, fontSize: 12.5, marginTop: 10 }}>
                  Hochrechnung für {zahlDe(umzug.datenmenge ?? 0)} {umzug.datenmenge_einheit}: <b style={{ color: C.text }}>{spannenText(schaetzung.dauerVonMs, schaetzung.dauerBisMs)}</b> Rechenzeit
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={umzugAbschliessen} disabled={busy !== null} style={{ ...styles.btnRand, borderColor: C.gold, color: C.gold }}>
                  ✓ Umzug abschließen
                </button>
                <span style={{ color: C.dim, fontSize: 12.5, alignSelf: 'center' }}>
                  Jede Datei, die Sie jetzt unten importieren, zählt zu diesem Umzug.
                </span>
              </div>
            </>
          ) : (
            <>
              <p style={styles.stufenText}>
                Bringen Sie mehrere Dateien mit (Kunden, Artikel, Lieferanten …)? Dann starten Sie einen Umzug:
                ein Gesamtbalken über alle Dateien, eine Stoppuhr und am Ende eine Abschluss-Karte.
                Einzelne Dateien können Sie auch ohne Umzug direkt unten importieren.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={styles.feldLabel}>
                  Wie viele Dateien?
                  <input value={planDateien} onChange={(e) => setPlanDateien(e.target.value)} inputMode="numeric" placeholder="z. B. 13" style={{ ...styles.eingabe, width: 110 }} />
                </label>
                <label style={styles.feldLabel}>
                  Datenmenge (ungefähr)
                  <span style={{ display: 'flex', gap: 6 }}>
                    <input value={planMenge} onChange={(e) => setPlanMenge(e.target.value)} inputMode="decimal" placeholder="z. B. 5" style={{ ...styles.eingabe, width: 110 }} />
                    <select value={planEinheit} onChange={(e) => setPlanEinheit(e.target.value as MengenEinheit)} style={{ ...styles.eingabe, width: 100 }}>
                      <option value="MB">MB</option><option value="GB">GB</option><option value="TB">TB</option><option value="Zeilen">Zeilen</option>
                    </select>
                  </span>
                </label>
                <button type="button" onClick={umzugStarten} disabled={!neuesSchema || busy !== null} style={{ ...styles.btnGold, opacity: !neuesSchema || busy !== null ? 0.5 : 1 }}>
                  Umzug starten
                </button>
              </div>
              {!neuesSchema && (
                <div style={{ color: C.warn, fontSize: 12.5, marginTop: 8 }}>
                  Die Umzug-Leiste braucht einmal das Datenbank-Update „p123-import-fortschritt". Bis dahin funktioniert der Import wie gewohnt.
                </div>
              )}
            </>
          )}

          {schaetzung && !umzug && (
            <div style={styles.schaetzKasten}>
              <div>
                Geschätzte Rechenzeit: <b style={{ color: C.text }}>{spannenText(schaetzung.dauerVonMs, schaetzung.dauerBisMs)}</b>
                {planEinheit !== 'Zeilen' && <> · etwa {zahlDe(schaetzung.zeilenVon)} bis {zahlDe(schaetzung.zeilenBis)} Zeilen</>}
              </div>
              <div style={{ fontSize: 12, marginTop: 3 }}>Ohne die Zeit, die Sie für das Zuordnen der Spalten brauchen.</div>
              {schaetzung.hinweise.map((h, i) => (
                <div key={i} style={{ marginTop: 5, color: i === 0 ? C.dim : C.warn }}>{i === 0 ? 'ℹ️' : '⚠️'} {h}</div>
              ))}
            </div>
          )}
          <div style={{ color: C.dim, fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
            Grenzen: CSV bis {formatBytes(GRENZEN_UMZUG.browserDateiBytes)} je Datei (wird in Ihrem Browser gelesen) ·
            Excel bis {formatBytes(GRENZEN_UMZUG.serverDateiBytes)} je Datei (wird auf dem Server gelesen) ·
            eingespielt wird in Paketen zu {PAKET_GROESSE} Zeilen.
          </div>
        </div>

        {abschluss && (
          <div style={{ ...styles.stufe, borderColor: 'rgba(76,175,125,0.55)', background: 'rgba(76,175,125,0.07)' }}>
            <div style={{ ...styles.stufenTitel, color: C.green }}>🏁 {abschluss.name} — abgeschlossen</div>
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.5 }}>{abschlussText(abschluss.summe)}</div>
            <div style={styles.zahlenReihe}>
              <Zahl wert={abschluss.summe.dateien} label="Dateien" farbe={C.cyan} />
              <Zahl wert={abschluss.summe.datensaetze} label="Datensätze übernommen" farbe={C.green} />
              <Zahl wert={abschluss.summe.warnungen} label="Warnungen" farbe={abschluss.summe.warnungen > 0 ? C.warn : C.dim} />
              <Zahl wert={abschluss.summe.abgelehnt} label="abgelehnt (mit Grund im Bericht)" farbe={abschluss.summe.abgelehnt > 0 ? C.warn : C.dim} />
              <Zahl wert={abschluss.summe.verschluckt} label="verschluckt" farbe={abschluss.summe.verschluckt > 0 ? C.danger : C.green} />
            </div>
            <div style={{ color: C.dim, fontSize: 12.5 }}>
              Die Dauer ist die echte Zeit vom Start bis zum Abschluss — einschließlich Ihrer Zuordnungen.
            </div>
            <button type="button" onClick={() => setAbschluss(null)} style={{ ...styles.btnRand, marginTop: 10 }}>Schließen</button>
          </div>
        )}

        {/* --- 1 Ziel --- */}
        <div style={styles.stufe}>
          <div style={styles.stufenTitel}>1 · Was möchten Sie importieren?</div>
          <div style={styles.zielGrid}>
            {ZIELE.map((z) => (
              <button
                key={z.key} type="button" onClick={() => zielWaehlen(z.key)}
                style={{
                  ...styles.zielKarte,
                  borderColor: zielKey === z.key ? C.gold : C.border,
                  background: zielKey === z.key ? 'rgba(201,168,76,0.12)' : 'rgba(10,22,40,0.5)',
                }}
              >
                <div style={{ fontSize: 22 }}>{z.icon}</div>
                <div style={{ fontWeight: 800, fontSize: 15, marginTop: 4 }}>{z.label}</div>
                <div style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}>{z.beschreibung}</div>
              </button>
            ))}
          </div>
        </div>

        {/* --- 2 Datei --- */}
        {ziel && (
          <div style={styles.stufe}>
            <div style={styles.stufenTitel}>2 · Datei auswählen</div>
            <p style={styles.stufenText}>
              Excel (.xlsx) oder CSV. Die erste Zeile muss die Spaltenüberschriften enthalten.
              CSV liest ARGONAUT <b style={{ color: C.text }}>direkt in Ihrem Browser</b> — die Datei verlässt Ihren Rechner nicht.
              Excel wird auf dem Server gelesen und sofort verworfen, <b style={{ color: C.text }}>nicht gespeichert</b>.
            </p>
            <div style={styles.vorlagenLeiste}>
              <span style={{ color: C.dim, fontSize: 13 }}>Noch keine passende Datei zur Hand?</span>
              <button type="button" onClick={vorlageHerunterladen} style={{ ...styles.btnRand, fontSize: 13, padding: '8px 13px' }}>
                ⬇ Mustervorlage „{ziel.label}"
              </button>
              <span style={{ color: C.dim, fontSize: 12.5 }}>
                Enthält alle Felder und zwei ausgefüllte Beispielzeilen — einfach überschreiben.
              </span>
            </div>
            <input
              type="file" accept=".csv,.txt,.xlsx,.xlsm,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) dateiLesen(f); e.target.value = ''; }}
              disabled={busy !== null}
              style={styles.dateiFeld}
            />
            {balken && !bericht && (
              <div style={{ marginTop: 10 }}>
                <DateiBalken name={datei?.dateiname ?? 'Datei'} stand={balken} />
              </div>
            )}
            {datei && (
              <div style={styles.dateiInfo}>
                <b style={{ color: C.text }}>{datei.dateiname}</b>
                {datei.blatt && <> · Tabellenblatt „{datei.blatt}"</>}
                {datei.trennzeichen && <> · Trennzeichen „{datei.trennzeichen === '\t' ? 'Tabulator' : datei.trennzeichen}"</>}
                {' '}· {datei.kopf.length} Spalten · {datei.zeilen.length} Zeilen
              </div>
            )}
          </div>
        )}

        {/* --- 3 Zuordnen --- */}
        {ziel && datei && datei.kopf.length > 0 && (
          <div style={styles.stufe}>
            <div style={styles.stufenTitel}>3 · Spalten zuordnen</div>
            <p style={styles.stufenText}>
              Links steht, was in Ihrer Datei steht — rechts, wo es in ARGONAUT landet. Was automatisch
              erkannt wurde, ist schon eingestellt. Spalten auf „— nicht importieren" werden ignoriert.
            </p>

            {offenePflicht.length > 0 && (
              <div style={styles.warnKasten}>
                ⚠️ Pflichtfeld noch nicht zugeordnet: <b>{offenePflicht.map((f) => f.label).join(', ')}</b>.
                Ohne dieses Feld kann nicht importiert werden.
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table style={styles.tabelle}>
                <thead>
                  <tr>
                    <th style={styles.th}>Spalte in Ihrer Datei</th>
                    <th style={styles.th}>Beispiele daraus</th>
                    <th style={styles.th}>Feld in ARGONAUT</th>
                  </tr>
                </thead>
                <tbody>
                  {datei.kopf.map((spalte, i) => {
                    const beispiele = datei.zeilen.slice(0, 3).map((z) => (z[i] ?? '').trim()).filter(Boolean);
                    const gewaehlt = mapping[spalte] ?? '';
                    const feldDef = ziel.felder.find((f) => f.key === gewaehlt);
                    return (
                      <tr key={spalte + i}>
                        <td style={styles.td}><b>{spalte}</b></td>
                        <td style={{ ...styles.td, color: C.dim, fontSize: 12.5 }}>
                          {beispiele.length ? beispiele.join(' · ') : <i>leer</i>}
                        </td>
                        <td style={styles.td}>
                          <select value={gewaehlt} onChange={(e) => feldSetzen(spalte, e.target.value)} style={styles.select}>
                            <option value="">— nicht importieren</option>
                            {ziel.felder.map((f) => (
                              <option key={f.key} value={f.key}>{f.label}{f.pflicht ? ' *' : ''}</option>
                            ))}
                          </select>
                          {feldDef?.hinweis && <div style={{ color: C.dim, fontSize: 11.5, marginTop: 4 }}>{feldDef.hinweis}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" onClick={pruefen} disabled={busy !== null || offenePflicht.length > 0} style={{ ...styles.btnGold, opacity: busy !== null || offenePflicht.length > 0 ? 0.5 : 1 }}>
                {busy === 'pruefen' ? 'Prüft …' : 'Prüfen — was käme an?'}
              </button>
              <button type="button" onClick={() => zuruecksetzen(true)} style={styles.btnRand}>Andere Datei</button>
            </div>
          </div>
        )}

        {/* --- 4 Bericht + Import --- */}
        {bericht && ziel && (
          <div style={styles.stufe}>
            <div style={styles.stufenTitel}>4 · Prüfergebnis</div>

            <div style={styles.zahlenReihe}>
              <Zahl wert={bericht.gesamt} label="Zeilen in der Datei" farbe={C.cyan} />
              <Zahl wert={bericht.gut} label="werden übernommen" farbe={C.green} />
              <Zahl wert={bericht.schlecht} label="fallen raus" farbe={bericht.schlecht > 0 ? C.danger : C.dim} />
              <Zahl wert={bericht.warnungen.length} label="Warnungen" farbe={bericht.warnungen.length > 0 ? C.warn : C.dim} />
            </div>

            {bericht.dubletten_in_datei > 0 && (
              <div style={styles.warnKasten}>
                In der Datei stehen {bericht.dubletten_in_datei} doppelte Einträge — jeder wird nur einmal übernommen.
              </div>
            )}

            {(bericht.fehler.length > 0 || bericht.warnungen.length > 0) && (
              <div style={styles.meldungsListe}>
                {[...bericht.fehler.map((f) => ({ f, art: 'F' as const })), ...bericht.warnungen.map((f) => ({ f, art: 'W' as const }))]
                  .slice(0, MAX_FEHLER_ANZEIGE)
                  .map((e, i) => (
                    <div key={i} style={{ color: e.art === 'F' ? C.danger : C.warn, fontSize: 12.5, lineHeight: 1.7 }}>
                      {e.art === 'F' ? '✕' : '⚠'} Zeile {e.f.zeile}{e.f.feld ? ` · ${e.f.feld}` : ''}: {e.f.meldung}
                    </div>
                  ))}
                {bericht.fehler.length + bericht.warnungen.length > MAX_FEHLER_ANZEIGE && (
                  <div style={{ color: C.dim, fontSize: 12.5, marginTop: 6 }}>
                    … und {bericht.fehler.length + bericht.warnungen.length - MAX_FEHLER_ANZEIGE} weitere. Vollständig im Bericht zum Herunterladen.
                  </div>
                )}
              </div>
            )}

            {bericht.gut > 0 && (
              <div style={styles.vorschauKasten}>
                <div style={styles.vorschauTitel}>So sieht der erste Datensatz aus</div>
                {Object.entries(bericht.saetze[0] ?? {}).map(([k, v]) => {
                  const f = ziel.felder.find((x) => x.key === k);
                  return (
                    <div key={k} style={{ fontSize: 12.5, lineHeight: 1.8 }}>
                      <span style={{ color: C.dim }}>{f?.label ?? k}:</span>{' '}
                      <b>{typeof v === 'boolean' ? (v ? 'ja' : 'nein') : String(v)}</b>
                    </div>
                  );
                })}
              </div>
            )}

            {ziel.schluessel && (
              <div style={{ marginTop: 14 }}>
                <div style={{ color: C.dim, fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                  Wenn ein Eintrag schon vorhanden ist (erkannt über {ziel.felder.find((f) => f.key === ziel.schluessel)?.label}):
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {([['ueberspringen', 'Überspringen — Vorhandenes bleibt unangetastet'], ['aktualisieren', 'Aktualisieren — Vorhandenes wird überschrieben']] as const).map(([wert, text]) => (
                    <button
                      key={wert} type="button" onClick={() => setBeiDublette(wert)}
                      style={{
                        ...styles.btnRand, fontSize: 13,
                        borderColor: beiDublette === wert ? C.gold : C.border,
                        color: beiDublette === wert ? C.gold : C.text,
                      }}
                    >
                      {beiDublette === wert ? '● ' : '○ '}{text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label style={styles.merkenZeile}>
              <input type="checkbox" checked={merken} onChange={(e) => setMerken(e.target.checked)} style={{ width: 17, height: 17, cursor: 'pointer' }} />
              <span>
                <b>Diese Spalten-Zuordnung merken.</b>{' '}
                <span style={{ color: C.dim }}>Beim nächsten Import mit demselben Datei-Aufbau wird sie automatisch übernommen — dann entfällt Stufe 3.</span>
              </span>
            </label>

            {balken && (busy === 'import' || ergebnis) && (
              <div style={{ marginTop: 14 }}>
                <DateiBalken name={datei?.dateiname ?? 'Datei'} stand={balken} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                type="button" onClick={importieren}
                disabled={busy !== null || bericht.gut === 0 || ergebnis !== null}
                style={{ ...styles.btnGold, opacity: busy !== null || bericht.gut === 0 || ergebnis !== null ? 0.5 : 1 }}
              >
                {busy === 'import' ? 'Importiert …' : ergebnis ? 'Import erledigt' : `${zahlDe(bericht.gut)} Datensätze jetzt importieren`}
              </button>
              {busy === 'import' && (
                <button type="button" onClick={anhalten} disabled={anhaltenGewuenscht} style={{ ...styles.btnRand, borderColor: C.warn, color: C.warn }}>
                  {anhaltenGewuenscht ? 'Hält nach dem laufenden Paket an …' : '⏸ Anhalten'}
                </button>
              )}
              {(bericht.fehler.length > 0 || bericht.warnungen.length > 0) && (
                <button type="button" onClick={fehlerHerunterladen} style={styles.btnRand}>⬇ Bericht als CSV</button>
              )}
            </div>
          </div>
        )}

        {/* --- Ergebnis --- */}
        {ergebnis && (
          <div style={{ ...styles.stufe, borderColor: 'rgba(76,175,125,0.45)' }}>
            <div style={{ ...styles.stufenTitel, color: ergebnis.angehalten ? C.warn : C.green }}>
              {ergebnis.angehalten ? '⏸ Import angehalten' : '✓ Import abgeschlossen'}
            </div>
            <div style={styles.zahlenReihe}>
              <Zahl wert={ergebnis.angelegt} label="neu angelegt" farbe={C.green} />
              <Zahl wert={ergebnis.aktualisiert} label="aktualisiert" farbe={C.cyan} />
              <Zahl wert={ergebnis.uebersprungen} label="übersprungen (schon vorhanden)" farbe={C.dim} />
              <Zahl wert={ergebnis.fehlgeschlagen} label="fehlgeschlagen" farbe={ergebnis.fehlgeschlagen > 0 ? C.danger : C.dim} />
              {ergebnis.offen > 0 && <Zahl wert={ergebnis.offen} label="noch offen (angehalten)" farbe={C.warn} />}
            </div>
            {(() => {
              const rest = verschluckt({
                gelesen: ergebnis.gelesen, angelegt: ergebnis.angelegt, aktualisiert: ergebnis.aktualisiert,
                uebersprungen: ergebnis.uebersprungen, abgelehnt: ergebnis.abgelehnt, doppelt: ergebnis.doppelt,
                gescheitert: ergebnis.fehlgeschlagen, offen: ergebnis.offen,
              });
              return (
                <div style={{ ...styles.hinweisKasten, marginBottom: 10 }}>
                  <b style={{ color: C.text }}>Zeilen-Bilanz:</b> {zahlDe(ergebnis.gelesen)} gelesen = {zahlDe(ergebnis.angelegt)} neu
                  + {zahlDe(ergebnis.aktualisiert)} aktualisiert + {zahlDe(ergebnis.uebersprungen)} übersprungen
                  + {zahlDe(ergebnis.abgelehnt)} abgelehnt + {zahlDe(ergebnis.doppelt)} doppelt in der Datei
                  + {zahlDe(ergebnis.fehlgeschlagen)} fehlgeschlagen{ergebnis.offen > 0 ? ` + ${zahlDe(ergebnis.offen)} offen` : ''}
                  {' · '}<b style={{ color: rest === 0 ? C.green : C.danger }}>{zahlDe(rest)} verschluckt</b>
                  <div style={{ marginTop: 4 }}>
                    Rechenzeit {formatDauer(ergebnis.dauerMs)}
                    {ergebnis.zeilenProS ? ` · ${zahlDe(ergebnis.zeilenProS)} Zeilen pro Sekunde` : ''}
                  </div>
                  {ergebnis.angehalten && (
                    <div style={{ marginTop: 4, color: C.warn }}>
                      {ziel?.schluessel
                        ? `Weitermachen: dieselbe Datei noch einmal importieren (Einstellung „Überspringen") — schon Übernommenes wird über „${ziel.felder.find((f) => f.key === ziel.schluessel)?.label ?? ziel.schluessel}" erkannt und nicht doppelt angelegt.`
                        : 'Diese Liste hat kein Erkennungsmerkmal. Zum Weitermachen den Import unten rückgängig machen und neu starten — sonst entstehen Doppelte.'}
                    </div>
                  )}
                </div>
              );
            })()}
            {ergebnis.fehler.length > 0 && (
              <div style={styles.meldungsListe}>
                {ergebnis.fehler.slice(0, MAX_FEHLER_ANZEIGE).map((f, i) => (
                  <div key={i} style={{ color: C.danger, fontSize: 12.5, lineHeight: 1.7 }}>
                    ✕ Zeile {f.zeile}{f.feld ? ` · ${f.feld}` : ''}: {f.meldung}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <a href={ziel ? katalogZiel(ziel.key) : '/dashboard'} style={styles.btnCyanLink}>Ergebnis ansehen ›</a>
              <button type="button" onClick={() => zuruecksetzen(false)} style={styles.btnRand}>Nächster Import</button>
              {(ergebnis.fehler.length > 0 || (bericht?.fehler.length ?? 0) > 0) && (
                <button type="button" onClick={fehlerHerunterladen} style={styles.btnRand}>⬇ Bericht als CSV</button>
              )}
            </div>
          </div>
        )}

        {fehler && <div style={styles.fehlerKasten}>⚠️ {fehler}</div>}
        {hinweis && !fehler && <div style={styles.hinweisKasten}>{hinweis}</div>}

        {/* --- Verlauf --- */}
        {verlauf.length > 0 && (
          <div style={styles.stufe}>
            <div style={styles.stufenTitel}>Letzte Importe</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.tabelle}>
                <thead>
                  <tr>
                    <th style={styles.th}>Wann</th>
                    <th style={styles.th}>Was</th>
                    <th style={styles.th}>Datei</th>
                    <th style={styles.th}>Übernommen</th>
                    <th style={styles.th}>Größe</th>
                    <th style={styles.th}>Dauer</th>
                    <th style={styles.th}>Tempo</th>
                    <th style={styles.th}>Wer</th>
                    <th style={styles.th}>Zuordnung</th>
                    <th style={styles.th}>Rückgängig</th>
                  </tr>
                </thead>
                <tbody>
                  {verlauf.slice(0, 12).map((j) => {
                    const z = zielDef(j.ziel);
                    return (
                      <tr key={j.id}>
                        <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{fmtZeit(j.erstellt_am)}</td>
                        <td style={styles.td}>{z ? `${z.icon} ${z.label}` : j.ziel}</td>
                        <td style={{ ...styles.td, color: C.dim, fontSize: 12.5 }}>{j.dateiname ?? '—'}</td>
                        <td style={styles.td}>
                          <b style={{ color: j.zeilen_fehler > 0 ? C.warn : C.green }}>{j.zeilen_ok}</b>
                          <span style={{ color: C.dim }}> von {j.zeilen_gesamt}</span>
                          {j.zeilen_fehler > 0 && <span style={{ color: C.danger, fontSize: 12.5 }}> · {j.zeilen_fehler} Probleme</span>}
                          {j.status === 'laeuft' && <span style={{ color: C.cyan, fontSize: 12.5 }}> · läuft</span>}
                          {j.status === 'angehalten' && <span style={{ color: C.warn, fontSize: 12.5 }}> · angehalten, {zahlDe(j.zeilen_offen ?? 0)} offen</span>}
                          {j.status === 'abgebrochen' && <span style={{ color: C.danger, fontSize: 12.5 }}> · abgebrochen</span>}
                        </td>
                        <td style={{ ...styles.td, fontSize: 12.5, color: C.dim, whiteSpace: 'nowrap' }}>{j.dateigroesse ? formatBytes(j.dateigroesse) : '—'}</td>
                        <td style={{ ...styles.td, fontSize: 12.5, whiteSpace: 'nowrap' }}>{j.dauer_ms ? formatDauer(j.dauer_ms) : '—'}</td>
                        <td style={{ ...styles.td, fontSize: 12.5, color: C.dim, whiteSpace: 'nowrap' }}>{j.zeilen_pro_s ? `${zahlDe(Number(j.zeilen_pro_s))} Z./s` : '—'}</td>
                        <td style={{ ...styles.td, fontSize: 12.5, color: C.dim }}>
                          {!j.erstellt_von ? '—' : j.erstellt_von === ich ? 'Sie' : (namen[j.erstellt_von] ?? 'Chef')}
                        </td>
                        <td style={{ ...styles.td, fontSize: 12.5, color: j.als_vorlage ? C.cyan : C.dim }}>
                          {j.als_vorlage ? '✓ gemerkt' : '—'}
                        </td>
                        <td style={{ ...styles.td, fontSize: 12.5 }}>
                          {j.status === 'rueckgaengig' ? <span style={{ color: C.dim }}>↺ rückgängig gemacht</span>
                            : z?.tabelle === 'rechnungen' ? <span style={{ color: C.dim }} title="Offene Posten werden nicht per Knopf gelöscht.">—</span>
                            : (j.angelegte_ids?.length ?? 0) > 0 ? (
                              <button type="button" disabled={busy !== null} onClick={() => rueckgaengig(j)}
                                style={{ background: 'transparent', border: `1px solid ${C.danger}`, color: C.danger, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12.5 }}>
                                ↺ {j.angelegte_ids?.length} löschen
                              </button>
                            ) : <span style={{ color: C.dim }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {letzteUmzuege.length > 0 && (
          <div style={styles.stufe}>
            <div style={styles.stufenTitel}>Letzte Umzüge</div>
            {letzteUmzuege.map((u) => (
              <div key={u.id} style={{ fontSize: 13, lineHeight: 1.7, color: C.dim }}>
                <b style={{ color: C.text }}>{fmtZeit(u.gestartet_am)}</b> · {u.zusammenfassung ? abschlussText(u.zusammenfassung) : `Umzug fertig in ${formatDauer(u.dauer_ms)}`}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ================= Katalog (Stufe 1) ================= */}
      <div style={styles.trenner} />

      <h2 style={styles.h2}>Alle weiteren Import-Quellen</h2>
      <p style={styles.sub}>
        Für die übrigen Bereiche gibt es fertige CSV-Vorlagen und den Import direkt im jeweiligen Modul.
        Vorlage herunterladen, ausfüllen, dort hochladen.
      </p>

      <div style={styles.kpiRow}>
        <Kpi wert={kpi.gesamt} label="Importquellen" farbe={C.cyan} />
        <Kpi wert={kpi.mitVorlage} label="mit CSV-Vorlage" farbe={C.gold} />
        <Kpi wert={kpi.gruppen} label="Bereiche" farbe={C.green} />
      </div>

      <div style={styles.branchenLeiste}>
        <span style={styles.branchenLabel}>Ihre Branche</span>
        <button type="button" onClick={() => waehleBranche('')} style={branche === '' ? styles.chipAktiv : styles.chip}>
          Alle Bereiche
        </button>
        {BRANCHEN_PAKETE.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => waehleBranche(b.key)}
            style={branche === b.key ? styles.chipAktiv : styles.chip}
          >
            {b.icon} {b.name}
          </button>
        ))}
      </div>
      {branche ? (
        <p style={styles.branchenHinweis}>
          Sie sehen die Vorlagen, die zu Ihrer Branche und den Kernbausteinen gehören.
          Über „Alle Bereiche" bekommen Sie jederzeit die vollständige Liste zurück.
        </p>
      ) : null}

      <input
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        placeholder="🔍 Suchen … (z. B. Kontakte, Lieferanten, Räume)"
        style={styles.suche}
      />

      {gruppen.length === 0 ? (
        <div style={styles.leer}>
          Keine Import-Quelle passt zur Suche{branche ? ' und zur gewählten Branche' : ''}.
        </div>
      ) : (
        gruppen.map((g) => (
          <div key={g.key} style={{ marginTop: 26 }}>
            <div style={styles.gruppeTitel}>{g.icon} {g.label}</div>
            <div style={styles.grid}>
              {g.quellen.map((s) => (
                <div key={s.key} style={styles.karte}>
                  <div style={styles.karteKopf}>
                    <span style={styles.karteIcon}>{s.icon}</span>
                    <span style={styles.karteTitel}>{s.label}</span>
                  </div>
                  <div style={styles.karteText}>{s.beschreibung}</div>
                  <div style={styles.karteAktionen}>
                    <VorlagenKnopf quelle={s} />
                    <a href={s.zielHref} style={styles.btnZiel}>Zum Import ›</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/** Wohin nach dem Import geschaut wird. */
function katalogZiel(zielKey: string): string {
  const wege: Record<string, string> = {
    kontakte: '/dashboard/crm',
    artikel: '/dashboard/erp',
    lieferanten: '/dashboard/erp/lieferanten',
    rechnungen: '/dashboard/rechnungen',
  };
  return wege[zielKey] ?? '/dashboard';
}

function Kpi({ wert, label, farbe }: { wert: number; label: string; farbe: string }) {
  return (
    <div style={styles.kpi}>
      <div style={{ ...styles.kpiWert, color: farbe }}>{wert}</div>
      <div style={styles.kpiLabel}>{label}</div>
    </div>
  );
}

function Zahl({ wert, label, farbe }: { wert: number; label: string; farbe: string }) {
  return (
    <div style={styles.zahl}>
      <div style={{ fontSize: 24, fontWeight: 800, color: farbe, lineHeight: 1 }}>{wert}</div>
      <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>{label}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '8px 4px 64px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 28, fontWeight: 800, margin: 0, color: C.gold },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 21, fontWeight: 800, margin: '0 0 2px', color: C.text },
  sub: { color: C.dim, fontSize: 15, lineHeight: 1.55, margin: '8px 0 0', maxWidth: 820 },

  assistent: { marginTop: 22, display: 'grid', gap: 14 },
  stufe: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  stufenTitel: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: C.gold, fontWeight: 800, marginBottom: 10 },
  stufenText: { color: C.dim, fontSize: 13.5, lineHeight: 1.55, margin: '0 0 12px' },

  zielGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 11 },
  zielKarte: { textAlign: 'left', cursor: 'pointer', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, color: C.text, fontFamily: 'inherit' },

  branchenLeiste: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '18px 0 10px' },
  branchenLabel: { fontSize: 12.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: C.dim, marginRight: 4 },
  chip: { background: 'transparent', border: '1px solid rgba(255,255,255,0.16)', color: C.dim, borderRadius: 999, padding: '6px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  chipAktiv: { background: 'rgba(201,168,76,0.16)', border: `1px solid ${C.gold}`, color: C.gold, borderRadius: 999, padding: '6px 13px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  branchenHinweis: { margin: '0 0 12px', fontSize: 13, color: C.dim, lineHeight: 1.55 },
  vorlagenLeiste: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.2)' },
  merkenZeile: { display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, fontSize: 13.5, lineHeight: 1.55, cursor: 'pointer' },
  dateiFeld: { width: '100%', boxSizing: 'border-box', background: 'rgba(10,22,40,0.7)', border: `1px dashed ${C.border}`, borderRadius: 10, padding: '14px', color: C.text, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' },
  dateiInfo: { marginTop: 10, color: C.dim, fontSize: 13 },
  feldLabel: { display: 'grid', gap: 5, color: C.dim, fontSize: 12.5, fontWeight: 700 },
  eingabe: { padding: '9px 11px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(10,22,40,0.7)', color: C.text, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' },
  schaetzKasten: { marginTop: 12, border: '1px solid rgba(0,229,255,0.2)', borderRadius: 10, padding: '10px 12px', background: 'rgba(0,229,255,0.05)', color: C.dim, fontSize: 13, lineHeight: 1.55 },

  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: { textAlign: 'left', color: C.dim, fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, padding: '8px 8px', borderBottom: `1px solid ${C.border}` },
  td: { padding: '9px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
  select: { width: '100%', minWidth: 190, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(10,22,40,0.7)', color: C.text, fontSize: 13.5, fontFamily: 'inherit' },

  zahlenReihe: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 },
  zahl: { border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 13px', background: 'rgba(10,22,40,0.5)' },

  meldungsListe: { marginTop: 10, maxHeight: 260, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', background: 'rgba(10,22,40,0.5)' },
  vorschauKasten: { marginTop: 12, border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '11px 13px', background: 'rgba(76,175,125,0.06)' },
  vorschauTitel: { fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', color: C.green, fontWeight: 800, marginBottom: 7 },
  warnKasten: { margin: '0 0 12px', border: '1px solid rgba(224,162,76,0.4)', borderRadius: 10, padding: '10px 12px', background: 'rgba(224,162,76,0.08)', color: C.warn, fontSize: 13.5, lineHeight: 1.55 },
  fehlerKasten: { border: '1px solid rgba(224,102,102,0.5)', borderRadius: 12, padding: '12px 14px', background: 'rgba(224,102,102,0.07)', color: C.danger, fontSize: 14 },
  hinweisKasten: { border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', background: 'rgba(0,229,255,0.06)', color: C.dim, fontSize: 13.5, lineHeight: 1.55 },

  btnGold: { padding: '11px 17px', borderRadius: 9, border: 'none', background: C.gold, color: C.navy, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  btnRand: { padding: '11px 15px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' },
  btnCyanLink: { padding: '11px 15px', borderRadius: 9, background: C.cyan, color: C.navy, fontWeight: 800, fontSize: 13.5, textDecoration: 'none', display: 'inline-block' },

  trenner: { height: 1, background: C.border, margin: '38px 0 26px' },

  kpiRow: { display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 20 },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 20px', minWidth: 150 },
  kpiWert: { fontSize: 34, fontWeight: 800, lineHeight: 1 },
  kpiLabel: { color: C.dim, fontSize: 13, marginTop: 4 },
  suche: { width: '100%', boxSizing: 'border-box', marginTop: 20, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 15, fontFamily: 'inherit' },
  gruppeTitel: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 },
  karteKopf: { display: 'flex', alignItems: 'center', gap: 10 },
  karteIcon: { fontSize: 22, lineHeight: 1 },
  karteTitel: { fontWeight: 700, fontSize: 16 },
  karteText: { color: C.dim, fontSize: 13.5, lineHeight: 1.5, flex: 1 },
  karteAktionen: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 'auto' },
  btnVorlage: { color: C.gold, textDecoration: 'none', fontWeight: 700, fontSize: 13, border: `1px solid ${C.gold}`, borderRadius: 9, padding: '7px 12px' },
  keineVorlage: { color: C.dim, fontSize: 12, fontStyle: 'italic' },
  btnZiel: { color: C.navy, background: C.cyan, textDecoration: 'none', fontWeight: 700, fontSize: 13, borderRadius: 9, padding: '7px 12px', marginLeft: 'auto' },
  leer: { marginTop: 24, background: C.navy2, border: `1px dashed ${C.border}`, borderRadius: 14, padding: '36px 20px', textAlign: 'center', color: C.dim },
};
