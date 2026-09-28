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
  ZIELE, zielDef, fehlendePflichtfelder, pruefeAlles,
  baueMustervorlage, passtZuordnung, leseCsv,
  type Mapping, type PruefBericht, type ZeilenFehler,
} from '@/lib/importParser';
import {
  EIGEN, NICHT, MOTOR_TABELLEN, GRUND, eindeutigeKoepfe, katalogFuerZiel, vorschlagMapping, bereinigeMapping,
  spaltenBilanz, eigeneSpalten, eigeneWerteDerZeile, eigeneFelderZuordnen, erkennungsFelder, baueBestandIndex,
  findeImBestand, istBankSpalte, spalteLeer, leseDatev, datevAblehnung, datevZaehlen, dateiArt,
  sperrGrund, baueKundenIndex, verknuepfeKunde, fuerDatenbank, erkennungsSpalten, kindZeilen, type KundeRoh,
  verweisAusMitarbeitern, verweisAusLieferanten, istPersonalnummerLabel, type MitarbeiterRoh, type LieferantRoh,
  verweisAusPatienten, verweisAusTieren, type PatientRoh, type TierRoh,
  nachschlagIndex, fehlendeNamen, loeseNachschlag, elternZeilen, positionenJeEintrag, nachschlagPflichtGrund,
  type KatalogSpalte, type DatevKopf, type SpaltenBilanz, type EigeneSpalte,
} from '@/lib/importMotor';
import {
  ALTSYSTEME, altsystem, anleitung, sperrText, sucheAltsysteme, gruppiereAltsysteme, sichtbareAltsysteme,
  bereinigeWahl, erkenneAltsystem, zaehleAltsysteme, istBelegt, type Altsystem,
} from '@/lib/altsysteme';
import { leseXls } from '@/lib/xlsLeser';
import {
  gruppiereBestellungen, baueArtikelIndex, kopfFuerDatenbank, positionFuerDatenbank, bestellSumme,
} from '@/lib/importBestellungen';
import type { ImportZiel } from '@/lib/importParser';
import {
  baueArtikelSuche, baueStandortSuche, planeBestand, bestandSumme, bestandGrund, rueckDaten, leseRueckDaten,
  planeRueckgaengig, bestandSchluessel, type ArtikelRoh, type StandortRoh, type BestandRoh, type BestandBuchung,
} from '@/lib/importBestand';
import { buchenArgumente, RPC_BUCHEN } from '@/lib/lagerBuchung';
import { importErlaubt, leseRechtStand, type RechtStand } from '@/lib/importRechte';
import { aufraeumerErlaubt, teileText, zeilenZuCsv, AUFRAEUMER_MAX_PORTIONEN } from '@/lib/importAufraeumer';
import UmzugStapel from './UmzugStapel';
import { istVcard, leseVcard } from '@/lib/vcardLeser';
import { istDatanorm, leseDatanorm, datanormReihenfolge, DATANORM_ENDUNGEN } from '@/lib/datanormLeser';
import { istBmecat, leseBmecat } from '@/lib/bmecatLeser';
import { istIcal, leseIcal } from '@/lib/icalLeser';
import { notizenFuerSatz, behandlungUeberschrift, STAPEL_MAX, type NotizEntwurf } from '@/lib/gesundheitImport';
import { naechsteFaelligkeitString } from '../_components/wartungsLogik';
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
  /** Schritt 2: DATEV-Formatkopf, wenn die Datei eine DATEV-Datei ist. */
  datev?: DatevKopf | null;
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
  // --- Schritt 2: Eigene Felder ---
  eigeneWerte: number;
  eigeneFelderNeu: number;
  /** Eigene Felder konnten nicht angelegt werden -> Werte stehen in den Notizen. */
  eigeneAlsNotiz: number;
  eigeneFehler: string[];
  // --- Schritt 3: Verknuepfung mit dem Kunden ---
  kundeVerknuepft: number;
  kundeOhne: number;
  kundeHinweise: string[];
  /** Paket 127: Zusammenfassung und Hinweise (z. B. Bestellungen mit Positionen). */
  zusammenfassung?: string;
  zusatzHinweise?: string[];
};

/** Schritt 2: gemerkte Altsystem-Wahl des Betriebs. */
type Wahl = { systeme: string[]; ausgeblendet: string[]; nur_meine: boolean };
const WAHL_SPEICHER = 'argonaut_import_altsysteme';
const LEERE_WAHL: Wahl = { systeme: [], ausgeblendet: [], nur_meine: false };

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
  /** Schritt 3 Teil 2: angemeldet als Mitarbeiter (nicht Chef)? Dann keine „nur Chef"-Ziele. */
  const [binMitarbeiter, setBinMitarbeiter] = useState(false);
  /** Paket 137: Bereiche und „darf ändern" des angemeldeten Mitarbeiters (null = noch nicht geladen). */
  const [rechtStand, setRechtStand] = useState<RechtStand | null>(null);
  const [namen, setNamen] = useState<Record<string, string>>({});

  // --- Schritt 2: Feldkatalog aus der Datenbank, Altsysteme -----------------
  /** null = noch nicht geladen oder SQL p124 fehlt (dann fester Katalog). */
  const [dbSpalten, setDbSpalten] = useState<KatalogSpalte[] | null>(null);
  const [wahl, setWahl] = useState<Wahl>(LEERE_WAHL);
  const [wahlInDb, setWahlInDb] = useState(false);
  const [systemeOffen, setSystemeOffen] = useState(false);
  const [systemSuche, setSystemSuche] = useState('');
  const [anleitungOffen, setAnleitungOffen] = useState<string | null>(null);
  /** Aus welchem Altsystem stammt die aktuelle Datei ('' = unbekannt). */
  const [dateiSystem, setDateiSystem] = useState('');
  // Paket 145: KI-Aufraeumer fuer Text, der keine saubere Tabelle ist
  const [kiOffen, setKiOffen] = useState(false);
  const [kiText, setKiText] = useState('');
  const [kiStand, setKiStand] = useState<string | null>(null);
  // Paket 147: Umzug „alles auf einmal" — Datei wartet, bis das Ziel gewaehlt ist
  const [wartend, setWartend] = useState<{ datei: File; ziel: string } | null>(null);
  const [erledigtDateien, setErledigtDateien] = useState<string[]>([]);
  const [spaltenOffen, setSpaltenOffen] = useState(false);

  const katalog = useMemo(() => (zielKey ? katalogFuerZiel(zielKey, dbSpalten) : null), [zielKey, dbSpalten]);
  const ziel = katalog?.ziel;
  const offenePflicht = useMemo(() => (zielKey && ziel ? fehlendePflichtfelder(mapping, zielKey, ziel) : []), [mapping, zielKey, ziel]);
  const bilanz: SpaltenBilanz | null = useMemo(
    () => (datei && ziel ? spaltenBilanz(datei.kopf, datei.zeilen, mapping, ziel) : null),
    [datei, ziel, mapping],
  );

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

  // Schritt 2: Feldkatalog aus der Datenbank (SQL p124). Fehlt die Funktion,
  // bleibt dbSpalten null und der feste Katalog gilt — ohne die neuen Felder.
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('import_feldkatalog', { p_tabellen: [...MOTOR_TABELLEN] });
        if (!error && Array.isArray(data) && data.length > 0) setDbSpalten(data as KatalogSpalte[]);
      } catch { /* ohne Katalog weiter wie bisher */ }
    })();
  }, []);

  // Schritt 2: gemerkte Altsystem-Wahl (Datenbank, sonst Browser).
  useEffect(() => {
    (async () => {
      let geladen: Wahl | null = null;
      try {
        const { data, error } = await supabase.from('import_altsystem_wahl').select('systeme, ausgeblendet, nur_meine').limit(1);
        if (!error) {
          setWahlInDb(true);
          const z = (data as unknown as Wahl[] | null)?.[0];
          if (z) geladen = { systeme: bereinigeWahl(z.systeme), ausgeblendet: bereinigeWahl(z.ausgeblendet), nur_meine: !!z.nur_meine };
        }
      } catch { /* Tabelle fehlt: Browser */ }
      if (!geladen) {
        try {
          const roh = window.localStorage.getItem(WAHL_SPEICHER);
          if (roh) {
            const z = JSON.parse(roh) as Partial<Wahl>;
            geladen = { systeme: bereinigeWahl(z.systeme), ausgeblendet: bereinigeWahl(z.ausgeblendet), nur_meine: !!z.nur_meine };
          }
        } catch { /* egal */ }
      }
      if (geladen) setWahl(geladen);
    })();
  }, []);

  // Schritt 2: Modul-Knoepfe oeffnen den Motor mit vorgewaehltem Ziel (?ziel=kontakte).
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const z = q.get('ziel');
      if (z && ZIELE.some((x) => x.key === z)) setZielKey(z);
      const sys = q.get('system');
      if (sys && altsystem(sys)) setDateiSystem(sys);
    } catch { /* ohne Vorwahl */ }
  }, []);

  async function wahlSpeichern(neu: Wahl) {
    setWahl(neu);
    try { window.localStorage.setItem(WAHL_SPEICHER, JSON.stringify(neu)); } catch { /* egal */ }
    if (!wahlInDb) return;
    try {
      const { uid, betrieb } = await betriebUndIch();
      await supabase.from('import_altsystem_wahl').upsert({
        owner_user_id: betrieb, systeme: neu.systeme, ausgeblendet: neu.ausgeblendet, nur_meine: neu.nur_meine,
        aktualisiert_am: new Date().toISOString(), aktualisiert_von: uid,
      }, { onConflict: 'owner_user_id' });
    } catch { /* bleibt im Browser gemerkt */ }
  }
  function systemUmschalten(key: string) {
    const drin = wahl.systeme.includes(key);
    void wahlSpeichern({
      ...wahl,
      systeme: drin ? wahl.systeme.filter((k) => k !== key) : [...wahl.systeme, key],
      ausgeblendet: wahl.ausgeblendet.filter((k) => k !== key),
    });
    if (!drin) setAnleitungOffen(key);
  }
  function systemAusblenden(key: string) {
    void wahlSpeichern({
      ...wahl,
      systeme: wahl.systeme.filter((k) => k !== key),
      ausgeblendet: wahl.ausgeblendet.includes(key) ? wahl.ausgeblendet : [...wahl.ausgeblendet, key],
    });
  }
  function importAusSystem(sysKey: string, zKey: string) {
    zielWaehlen(zKey);
    setDateiSystem(sysKey);
    try { document.getElementById('import-ziel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* egal */ }
  }

  // Wer bin ich, wie heissen die Kolleginnen und Kollegen (Spalte „Wer").
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setIch(data?.user?.id ?? null);
      try {
        const { data: chef } = await supabase.rpc('mein_chef_id');
        setBinMitarbeiter(typeof chef === 'string' && !!chef && chef !== data?.user?.id);
      } catch { /* dann eben wie Chef — die Datenbank-Regeln schuetzen trotzdem */ }
      // Paket 137: Rechte wie im Menue — keine eigene mitarbeiter-Zeile = Chef.
      try {
        const uid = data?.user?.id;
        const { data: meine } = uid
          ? await supabase.from('mitarbeiter').select('id').eq('auth_user_id', uid).maybeSingle()
          : { data: null };
        const maId = (meine as { id?: string } | null)?.id;
        if (!maId) setRechtStand({ chef: true, module: [], schreibModule: null });
        else {
          const r1 = await supabase.from('mitarbeiter_rechte').select('module, schreib_module').eq('mitarbeiter_id', maId).maybeSingle();
          if (!r1.error) setRechtStand(leseRechtStand(r1.data, true));
          else {
            // Ohne Spalte schreib_module (altes Datenbank-Update): Bereich allein, wie bisher.
            const r2 = await supabase.from('mitarbeiter_rechte').select('module').eq('mitarbeiter_id', maId).maybeSingle();
            setRechtStand(leseRechtStand(r2.data, false));
          }
        }
      } catch { setRechtStand({ chef: false, module: [], schreibModule: [] }); }
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
    const recht = importErlaubt(j.ziel, rechtStand);
    if (!recht.ok) { setFehler(recht.grund); return; }
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
      // Paket 127: Positionen (Bestellungen) zuerst — sonst bliebe ein Rest ohne Kopf.
      if (z.kinder) {
        for (let i = 0; i < ids.length; i += 200) {
          await supabase.from(z.kinder.tabelle).delete().in(z.kinder.fremdschluessel, ids.slice(i, i + 200));
        }
      }
      // Paket 146: ebenso die Positionen der Angebote
      const kt = z.jsonPositionen?.kindTabelle;
      if (kt) {
        for (let i = 0; i < ids.length; i += 200) {
          await supabase.from(kt.tabelle).delete().in(kt.fremdschluessel, ids.slice(i, i + 200));
        }
      }
      for (let i = 0; i < ids.length; i += 200) {
        const teil = ids.slice(i, i + 200);
        const { data, error } = await supabase.from(z.tabelle).delete().in('id', teil).select('id');
        if (error) { gescheitert += teil.length; continue; }
        const n = ((data as unknown[]) ?? []).length;
        geloescht += n; gescheitert += teil.length - n;
      }
      // Schritt 2: die Eigenen-Feld-Werte dieser Datensaetze gehen mit.
      if (z.eigeneFelderModul) {
        for (let i = 0; i < ids.length; i += 200) {
          await supabase.from('eigenes_feld_wert').delete().eq('modul', z.eigeneFelderModul).in('datensatz_id', ids.slice(i, i + 200));
        }
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
    if (!behalteZiel) { setZielKey(''); setDateiSystem(''); }
    setDatei(null); setMapping({}); setBericht(null); setErgebnis(null);
    setFehler(null); setHinweis(null); setBalken(null);
  }

  function zielWaehlen(key: string) {
    // Paket 137: nur mit Freigabe fuer diesen Bereich.
    const recht = importErlaubt(key, rechtStand);
    if (!recht.ok) { setFehler(recht.grund); return; }
    // Paket 128: Ziele, die das Datenbank-Update brauchen, nicht halb oeffnen.
    const z = zielDef(key);
    if (z?.nurMitKatalog && dbSpalten !== null && !dbSpalten.some((c) => c.tabelle === z.tabelle)) {
      setFehler(`„${z.label}" braucht einmal das Datenbank-Update der Import-Pakete (zuletzt „p128-import-karten1“).`);
      return;
    }
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

  // Paket 149: DATANORM.001 + DATPREIS.001 (+ .WRG/.RAB) gehoeren zusammen —
  // gemeinsam gewaehlt werden sie in der richtigen Reihenfolge zu EINER Datei.
  // Andere Mehrfachauswahl: die erste Datei, der Rest gehoert in den Umzug-Stapel.
  async function dateienGewaehlt(liste: File[]) {
    if (liste.length === 1) return dateiLesen(liste[0]);
    const dn = datanormReihenfolge(liste.map((f) => f.name));
    if (dn.length === liste.length) {
      const sortiert = dn.map((i) => liste[i]);
      const teile: BlobPart[] = [];
      sortiert.forEach((f, i) => { if (i > 0) teile.push('\r\n'); teile.push(f); });
      return dateiLesen(new File(teile, sortiert.map((f) => f.name).join(' + ')));
    }
    await dateiLesen(liste[0]);
    setHinweis((h) => `${h ? h + ' · ' : ''}Mehrere Dateien gewählt — gelesen wurde nur „${liste[0].name}". Für viele Dateien auf einmal oben die Box „Alles auf einmal" nutzen.`);
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
        if (dateiArt(f.name, bytes.subarray(0, 8)) === 'xls') {
          // Schritt 2: altes Excel (.xls, z. B. DATEV-OPOS) — im Browser gelesen.
          const x = leseXls(bytes);
          leseHinweise.push(...x.hinweise);
          const [kopfZeile, ...rest] = x.zeilen;
          neu = {
            dateiname: f.name, blatt: x.blatt, trennzeichen: '',
            kopf: eindeutigeKoepfe(kopfZeile ?? []),
            zeilen: rest.map((z) => { const k = [...z]; while (k.length < (kopfZeile?.length ?? 0)) k.push(''); return k; }),
            abgeschnitten: 0, groesse: f.size,
          };
        } else {
          if (istDatanorm(f.name, bytes.subarray(0, 400))) {
            // Paket 149: DATANORM 4/5 (Artikel + Preise vom Großhandel) -> Tabelle mit den Feldnamen der Artikel
            const d = leseDatanorm(bytes);
            leseHinweise.push(...d.hinweise);
            if (zielKey !== 'artikel') leseHinweise.push('Tipp: DATANORM gehört zum Ziel „Artikel & Preise".');
            neu = { dateiname: f.name, blatt: null, trennzeichen: '', kopf: eindeutigeKoepfe(d.kopf), zeilen: d.zeilen, abgeschnitten: 0, groesse: f.size };
          } else {
          const text = dekodiere(bytes);
          if (/\.xml$/i.test(f.name) && !istBmecat(f.name, text.slice(0, 5000))) {
            throw new Error('Diese XML-Datei ist kein BMEcat-Artikelkatalog. E-Rechnungen gehören zu den Eingangsbelegen, GAEB-Leistungsverzeichnisse zu den Ausschreibungen.');
          }
          if (istBmecat(f.name, text.slice(0, 5000))) {
            // Paket 150: BMEcat 1.2/2005 (Artikelkatalog als XML) -> Tabelle mit den Feldnamen der Artikel
            const b = leseBmecat(text);
            leseHinweise.push(...b.hinweise);
            if (zielKey !== 'artikel') leseHinweise.push('Tipp: BMEcat gehört zum Ziel „Artikel & Preise".');
            neu = { dateiname: f.name, blatt: null, trennzeichen: '', kopf: eindeutigeKoepfe(b.kopf), zeilen: b.zeilen, abgeschnitten: 0, groesse: f.size };
          } else if (istIcal(f.name, text.slice(0, 200))) {
            // Paket 151: iCalendar (.ics) -> Tabelle mit den Feldnamen der Termine
            const c = leseIcal(text);
            leseHinweise.push(...c.hinweise);
            if (zielKey !== 'termine') leseHinweise.push('Tipp: Kalender-Dateien gehören zum Ziel „Termine / Kalender".');
            neu = { dateiname: f.name, blatt: null, trennzeichen: '', kopf: eindeutigeKoepfe(c.kopf), zeilen: c.zeilen, abgeschnitten: 0, groesse: f.size };
          } else if (istVcard(f.name, text.slice(0, 200))) {
            // Paket 148: vCard (.vcf) -> Tabelle mit den Feldnamen der Kunden
            const v = leseVcard(text);
            leseHinweise.push(`vCard erkannt: ${zahlDe(v.anzahl)} Kontakte.`, ...v.hinweise);
            if (zielKey !== 'kontakte' && zielKey !== 'lieferanten') leseHinweise.push('Tipp: vCards gehören meist zum Ziel „Kunden & Kontakte".');
            neu = { dateiname: f.name, blatt: null, trennzeichen: '', kopf: eindeutigeKoepfe(v.kopf), zeilen: v.zeilen, abgeschnitten: 0, groesse: f.size };
          } else {
          // Schritt 2: DATEV-Format (Kopf "EXTF") erkennen — erste Zeile ist
          // der Formatkopf, die Spaltennamen stehen in der zweiten.
          const dv = leseDatev(text);
          if (dv?.fehler) throw new Error(dv.fehler);
          const tab = dv ? dv.tabelle : leseCsv(text);
          leseHinweise.push(...tab.hinweise);
          neu = {
            dateiname: f.name, blatt: null, trennzeichen: tab.trennzeichen,
            kopf: eindeutigeKoepfe(tab.kopf),
            zeilen: tab.zeilen, abgeschnitten: 0, groesse: f.size,
            datev: dv ? dv.kopf : null,
          };
          }
          }
        }
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
          kopf: eindeutigeKoepfe(daten.kopf ?? []),
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

      // Schritt 2: aus welchem Altsystem? (erkannt oder vorher angeklickt)
      const erkannt = erkenneAltsystem(neu.kopf);
      const system = dateiSystem || erkannt?.key || '';
      if (!dateiSystem && erkannt) setDateiSystem(erkannt.key);
      const zielJetzt = katalogFuerZiel(zielKey, dbSpalten)?.ziel;
      if (!zielJetzt) throw new Error('Unbekanntes Import-Ziel.');

      if (gemerkt?.mapping) {
        setMapping(bereinigeMapping(neu.kopf, gemerkt.mapping, zielJetzt));
        setHinweis(`${zahlDe(neu.zeilen.length)} Zeilen gelesen · gespeicherte Zuordnung von „${gemerkt.vorlage_name || gemerkt.dateiname || 'früherem Import'}" übernommen.`);
      } else {
        const geraten = vorschlagMapping(neu.kopf, neu.zeilen, zielJetzt, {
          systeme: [system, ...wahl.systeme].filter(Boolean), datev: !!neu.datev,
        });
        setMapping(geraten);
        const inFeldern = Object.values(geraten).filter((v) => v && v !== EIGEN).length;
        const alsEigen = Object.values(geraten).filter((v) => v === EIGEN).length;
        setHinweis(`${zahlDe(neu.zeilen.length)} Zeilen gelesen · ${inFeldern} von ${neu.kopf.length} Spalten automatisch erkannt`
          + (alsEigen > 0 ? `, ${alsEigen} werden als Eigene Felder übernommen` : '') + '. Bitte kurz prüfen.');
      }
      if (erkannt && !dateiSystem) setHinweis((h) => `${h ?? ''} Erkannt: Export aus ${erkannt.name}.`);
      if (neu.datev) {
        const kontoIdx = neu.kopf.findIndex((k) => k.trim().toLowerCase() === 'konto');
        const z = kontoIdx >= 0 ? datevZaehlen(neu.zeilen, kontoIdx, neu.datev.sachkontenlaenge) : null;
        setHinweis((h) => `${h ?? ''} DATEV-Format erkannt (${neu.datev?.formatname || 'Stammdaten'})`
          + (z ? `: ${zahlDe(z.debitoren)} Debitoren (Kunden), ${zahlDe(z.kreditoren)} Kreditoren (Lieferanten). Die jeweils anderen werden beim Prüfen mit Grund aussortiert — importieren Sie die Datei dafür ein zweites Mal mit dem anderen Ziel.` : '.'));
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

  /**
   * Paket 145: Umzug Schritt 5 — eingefuegten Text portionsweise von der KI
   * den Feldern dieses Ziels zuordnen lassen; das Ergebnis geht als CSV durch
   * denselben Motor wie jede Datei (dateiLesen). Die KI schreibt nichts.
   */
  async function kiAufraeumen() {
    if (!zielKey || !ziel) return;
    const e = aufraeumerErlaubt(zielKey);
    if (!e.ok) { setFehler(e.grund); return; }
    const { teile, zuViel } = teileText(kiText);
    if (teile.length === 0) { setFehler('Bitte zuerst Text einfügen.'); return; }
    if (zuViel) { setFehler(`Der Text ist zu lang für einen Durchgang (höchstens ${AUFRAEUMER_MAX_PORTIONEN} Portionen). Bitte in Teilen einlesen.`); return; }
    setBusy('ki'); setFehler(null); setHinweis(null);
    const alle: Record<string, string>[] = [];
    let verworfen = 0;
    try {
      for (let i = 0; i < teile.length; i++) {
        setKiStand(`ARGONAUT räumt auf … Portion ${i + 1} von ${teile.length}`);
        const res = await fetch('/api/import-aufraeumen', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zielKey, rohtext: teile[i] }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((j as { error?: string }).error || 'Aufbereitung fehlgeschlagen.');
        alle.push(...(((j as { zeilen?: Record<string, string>[] }).zeilen) ?? []));
        verworfen += Number((j as { verworfen?: number }).verworfen) || 0;
      }
      if (alle.length === 0) { setFehler('Im Text war kein passender Datensatz zu erkennen.'); return; }
      const csv = zeilenZuCsv(alle, ziel);
      setKiStand(null);
      await dateiLesen(new File([csv], `KI-aufgeraeumt-${ziel.key}.csv`, { type: 'text/csv' }));
      setHinweis((h) => `${h ?? ''} Aus eingefügtem Text von ARGONAUT aufgeräumt${verworfen > 0 ? ` (${zahlDe(verworfen)} unbrauchbare Einträge verworfen)` : ''} — bitte die Zuordnung und das Prüfergebnis genau ansehen.`);
    } catch (err: unknown) {
      setFehler(err instanceof Error ? err.message : 'Aufbereitung fehlgeschlagen.');
    } finally { setBusy(null); setKiStand(null); }
  }

  // Paket 147: gewaehlte Datei aus dem Umzugsplan einlesen, sobald ihr Ziel aktiv ist
  useEffect(() => {
    if (!wartend || zielKey !== wartend.ziel || busy) return;
    const d = wartend.datei;
    setWartend(null);
    void dateiLesen(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wartend, zielKey, busy]);
  // Paket 147: nach jedem Import die Datei im Umzugsplan abhaken
  useEffect(() => {
    if (ergebnis && datei && ergebnis.angelegt + ergebnis.aktualisiert > 0) {
      setErledigtDateien((l) => (l.includes(datei.dateiname) ? l : [...l, datei.dateiname]));
    }
  }, [ergebnis, datei]);

  function feldSetzen(spalte: string, feldKey: string) {
    setMapping((m) => {
      const neu = { ...m };
      // Ein Zielfeld darf nur einmal belegt sein — sonst überschreiben sich zwei Spalten.
      // „Eigenes Feld" darf beliebig oft vorkommen (jede Spalte wird ihr eigenes Feld).
      if (feldKey && feldKey !== EIGEN) for (const [s, k] of Object.entries(neu)) if (k === feldKey && s !== spalte) neu[s] = EIGEN;
      neu[spalte] = feldKey;
      return neu;
    });
    setBericht(null); setErgebnis(null);
  }

  // --- Prüfen ---------------------------------------------------------------
  function pruefen() {
    if (!datei || !zielKey || !ziel) return;
    setBusy('pruefen'); setFehler(null);
    try {
      const t0 = Date.now();
      // Die Zeit bis hierher war Ihre Zuordnung — sie zaehlt nicht als Rechenzeit.
      if (lesenEndeRef.current) phasenRef.current.zuordnen = t0 - lesenEndeRef.current;
      const kontoIdx = datei.datev ? datei.kopf.findIndex((k) => k.trim().toLowerCase() === 'konto') : -1;
      const b = pruefeAlles(zielKey, mapping, datei.kopf, datei.zeilen, {
        ziel,
        ablehnen: datei.datev ? datevAblehnung(zielKey, kontoIdx, datei.datev.sachkontenlaenge) : undefined,
      });
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

  // --- Paket 127: Verweis-Ziele laden (Kunden, Mitarbeiter, Lieferanten) ---
  /** Alle Zeilen einer Tabelle seitenweise; faellt beim ersten Fehler auf die zweite Spaltenliste zurueck. */
  async function allesLaden(tabelle: string, spaltenListen: string[], was: string): Promise<Record<string, unknown>[]> {
    let spalten = spaltenListen[0];
    const alle: Record<string, unknown>[] = [];
    for (let von = 0; von < 5000000; von += LESE_SEITE) {
      let r = await supabase.from(tabelle).select(spalten).order('id').range(von, von + LESE_SEITE - 1);
      if (r.error && von === 0 && spaltenListen[1]) {
        // z. B. ohne SQL p124 gibt es keine Kunden-/Lieferantennummer
        spalten = spaltenListen[1];
        r = await supabase.from(tabelle).select(spalten).order('id').range(von, von + LESE_SEITE - 1);
      }
      if (r.error) throw new Error(`${was} konnten nicht geladen werden: ${r.error.message}`);
      const liste = (r.data ?? []) as unknown as Record<string, unknown>[];
      alle.push(...liste);
      if (liste.length < LESE_SEITE) break;
    }
    return alle;
  }

  /** Nachschlage-Tabelle fuer den Verweis eines Ziels — gleicher Suchweg fuer alle Quellen. */
  async function ladeVerweisIndex(verweis: NonNullable<ImportZiel['kundeVerweis']>) {
    const quelle = verweis.quelle ?? 'kontakte';
    const mehrzahl = (verweis.mehrzahl ?? 'die Kunden').replace(/^die /, '');
    setBalken({ phase: 'einspielen', anteil: 0, zaehler: `${mehrzahl} zum Verknüpfen laden …` });
    if (quelle === 'mitarbeiter') {
      const ma = await allesLaden('mitarbeiter', ['id,vorname,nachname,email'], 'Mitarbeiter zum Verknüpfen');
      // Die Personalnummer ist ein Eigenes Feld (Mitarbeiter-Import, Paket 126).
      const nummern: Record<string, string> = {};
      try {
        const { data: felder } = await supabase.from('eigenes_feld').select('id, label').eq('modul', 'mitarbeiter');
        const ids = ((felder ?? []) as unknown as { id: string; label: string }[]).filter((f) => istPersonalnummerLabel(f.label)).map((f) => f.id);
        if (ids.length > 0) {
          for (let von = 0; von < 5000000; von += LESE_SEITE) {
            const { data, error } = await supabase.from('eigenes_feld_wert').select('datensatz_id, wert')
              .in('feld_id', ids).order('datensatz_id').order('feld_id').range(von, von + LESE_SEITE - 1);
            if (error) break;
            const liste = (data ?? []) as unknown as { datensatz_id: string; wert: string | null }[];
            for (const w of liste) if (w.wert && !nummern[String(w.datensatz_id)]) nummern[String(w.datensatz_id)] = String(w.wert);
            if (liste.length < LESE_SEITE) break;
          }
        }
      } catch { /* ohne Personalnummer: ueber E-Mail und Namen */ }
      return baueKundenIndex(verweisAusMitarbeitern(ma as MitarbeiterRoh[], nummern));
    }
    if (quelle === 'lieferanten') {
      const l = await allesLaden('lieferanten', ['id,name,email,lieferantennummer', 'id,name,email'], 'Lieferanten zum Verknüpfen');
      return baueKundenIndex(verweisAusLieferanten(l as LieferantRoh[]));
    }
    // Paket 153: Patienten (Praxis) und Tiere (Tierarzt)
    if (quelle === 'wellness_kunden') {
      const pz = await allesLaden('wellness_kunden', ['id,name,email'], 'Patienten zum Verknüpfen');
      return baueKundenIndex(verweisAusPatienten(pz as PatientRoh[]));
    }
    if (quelle === 'tier_tiere') {
      const t = await allesLaden('tier_tiere', ['id,name,halter,chip_nr'], 'Tiere zum Verknüpfen');
      return baueKundenIndex(verweisAusTieren(t as TierRoh[]));
    }
    const k = await allesLaden('kontakte', [
      'id,kundennummer,import_schluessel,email,firma,vorname,nachname,firma_id',
      'id,email,firma,vorname,nachname,firma_id',
    ], 'Kunden zum Verknüpfen');
    return baueKundenIndex(k as KundeRoh[]);
  }

  // --- Paket 127: Bestellungen mit Positionen ---------------------------------
  // Eine Datei-Zeile = eine Position; gleiche Bestellnummer = eine Bestellung.
  // Kopf nach bestellungen, Positionen nach bestellpositionen (Bestellwesen im
  // ERP). Scheitern die Positionen einer Bestellung, wird ihr Kopf wieder
  // entfernt — halbe Bestellungen entstehen nicht. Die Zeilen-Bilanz zaehlt
  // Datei-Zeilen (= Positionen), damit sie wie bei allen Importen aufgeht.
  async function importiereMitPositionen() {
    if (!datei || !ziel || !bericht || !ziel.kinder) return;
    const kinder = ziel.kinder;
    const vorab = bestellSumme(gruppiereBestellungen(bericht.saetze, bericht.zeilenNummern).bestellungen);
    if (typeof window !== 'undefined' && !window.confirm(
      `${zahlDe(vorab.bestellungen)} Bestellungen mit ${zahlDe(vorab.positionen)} Positionen werden jetzt in „${ziel.label}" geschrieben. `
      + 'Bestellnummern, die es schon gibt, werden übersprungen. Fortfahren?'
    )) return;

    setBusy('import'); setFehler(null);
    anhaltenRef.current = false; setAnhaltenGewuenscht(false);
    messRef.current = [];
    const erg: ImportErgebnis = {
      angelegt: 0, aktualisiert: 0, uebersprungen: 0, fehlgeschlagen: 0, fehler: [],
      gelesen: bericht.gesamt, doppelt: 0, abgelehnt: bericht.schlecht,
      offen: 0, angehalten: false, dauerMs: 0, zeilenProS: null,
      eigeneWerte: 0, eigeneFelderNeu: 0, eigeneAlsNotiz: 0, eigeneFehler: [],
      kundeVerknuepft: 0, kundeOhne: 0, kundeHinweise: [], zusatzHinweise: [],
    };
    const angelegteIds: string[] = [];
    let gesamtZeilen = 0;
    let erledigt = 0;
    const einspielStart = Date.now();
    try {
      const { uid, betrieb } = await betriebUndIch();

      setBalken({ phase: 'einspielen', anteil: 0, zaehler: 'Abgleich mit vorhandenen Bestellungen …' });
      const vorhanden = new Set((await allesLaden(ziel.tabelle, ['id,bestellnummer'], 'Vorhandene Bestellungen'))
        .map((b) => String(b.bestellnummer ?? '').trim().toLowerCase()).filter(Boolean));
      setBalken({ phase: 'einspielen', anteil: 0, zaehler: 'Artikel zum Verknüpfen laden …' });
      const artikelIndex = baueArtikelIndex(await allesLaden('artikel', ['id,artikelnummer,einheit'], 'Artikel zum Verknüpfen'));
      const lieferantenIndex = ziel.kundeVerweis ? await ladeVerweisIndex(ziel.kundeVerweis) : null;

      const g = gruppiereBestellungen(bericht.saetze, bericht.zeilenNummern, artikelIndex);
      for (const a of g.abgelehnt) {
        erg.fehlgeschlagen += a.zeilen.length;
        for (const z of a.zeilen) erg.fehler.push({ zeile: z, feld: 'Lieferant', meldung: a.grund });
      }
      for (const b of g.bestellungen) for (const w of b.warnungen) erg.zusatzHinweise!.push(`Zeile ${w.zeile}: ${w.meldung}`);

      // Eigene Felder: je Bestellung die Werte der ersten Zeile, in der sie stehen.
      const eigene: EigeneSpalte[] = eigeneSpalten(datei.kopf, datei.zeilen, mapping, ziel);
      const modul = ziel.eigeneFelderModul ?? ziel.key;
      const feldIdJeSpalte: Record<string, string> = {};
      if (eigene.length > 0) {
        try {
          const { data: da, error: e1 } = await supabase.from('eigenes_feld').select('id, label').eq('modul', modul);
          if (e1) throw new Error(e1.message);
          const zuordnung = eigeneFelderZuordnen(eigene, ((da ?? []) as unknown as { id: string; label: string }[]));
          Object.assign(feldIdJeSpalte, zuordnung.vorhanden);
          if (zuordnung.neu.length > 0) {
            const start = (da ?? []).length;
            const { data: angelegt, error: e2 } = await supabase.from('eigenes_feld').insert(
              zuordnung.neu.map((e, i) => ({ owner_user_id: betrieb, modul, label: e.spalte.slice(0, 120), feld_typ: e.typ, optionen: [], reihenfolge: start + i })),
            ).select('id, label');
            if (e2) throw new Error(e2.message);
            for (const f of ((angelegt ?? []) as unknown as { id: string; label: string }[])) {
              const e = zuordnung.neu.find((x) => x.spalte.slice(0, 120) === f.label);
              if (e) feldIdJeSpalte[e.spalte] = f.id;
            }
            erg.eigeneFelderNeu = (angelegt ?? []).length;
          }
        } catch (e) {
          erg.eigeneFehler.push(`Eigene Felder: ${e instanceof Error ? e.message : 'Fehler'} — die Werte stehen in den Notizen der Bestellung.`);
        }
      }

      type Vorhaben = { kopf: Record<string, unknown>; b: (typeof g.bestellungen)[number] };
      const vorhaben: Vorhaben[] = [];
      for (const b of g.bestellungen) {
        if (vorhanden.has(b.kopf.bestellnummer.toLowerCase())) { erg.uebersprungen += b.zeilen.length; continue; }
        let kopf = kopfFuerDatenbank(b.kopf);
        if (ziel.kundeVerweis && lieferantenIndex) {
          const v = verknuepfeKunde({ ...kopf, __kunde: b.kopf.__kunde, __kunde2: b.kopf.__kunde2 }, ziel.kundeVerweis, lieferantenIndex);
          kopf = v.satz;
          if (v.treffer.art === 'gefunden') erg.kundeVerknuepft++;
          else {
            erg.kundeOhne++;
            const grund = v.treffer.art === 'mehrdeutig'
              ? `„${v.gesucht}" passt zu ${v.treffer.anzahl} Lieferanten — nicht verknüpft`
              : v.gesucht ? `Lieferant „${v.gesucht}" nicht gefunden` : 'kein Lieferant angegeben';
            erg.kundeHinweise.push(`Bestellung ${b.kopf.bestellnummer}: ${grund} — ohne Lieferant übernommen (der Name steht in den Notizen).`);
            if (v.gesucht) kopf.notizen = [kopf.notizen, `Lieferant im Altsystem: ${v.gesucht}`].filter(Boolean).join('\n');
          }
        }
        // Eigene Felder ohne Feld (Fehler oben) -> in die Notizen
        if (eigene.length > 0) {
          const werte = new Map<string, string>();
          for (const z of b.zeilen) for (const w of eigeneWerteDerZeile(datei.zeilen[z - 2] ?? [], eigene)) if (!werte.has(w.spalte)) werte.set(w.spalte, w.wert);
          const ohneFeld = [...werte].filter(([sp]) => !feldIdJeSpalte[sp]);
          if (ohneFeld.length > 0) {
            kopf.notizen = [kopf.notizen, 'Weitere Angaben aus dem Altsystem:', ...ohneFeld.map(([sp, w]) => `${sp}: ${w}`)].filter(Boolean).join('\n');
            erg.eigeneAlsNotiz++;
          }
        }
        vorhaben.push({ kopf: { ...kopf, owner_user_id: betrieb }, b });
      }
      gesamtZeilen = vorhaben.reduce((n, v) => n + v.b.zeilen.length, 0);

      const zeigeStand = () => {
        messRef.current.push({ t: Date.now(), n: erledigt });
        setBalken({
          phase: 'einspielen',
          anteil: gesamtZeilen > 0 ? erledigt / gesamtZeilen : 1,
          zaehler: `${zahlDe(erledigt)} von ${zahlDe(gesamtZeilen)} Positionen eingespielt`,
          rest: restText(restMs(erledigt, gesamtZeilen, tempoProMs(messRef.current))),
        });
      };
      zeigeStand();

      // In Paketen zu 100 Bestellungen: Koepfe, dann alle ihre Positionen.
      for (const p of pakete(vorhaben.length, 100)) {
        if (anhaltenRef.current) break;
        const teil = vorhaben.slice(p.von, p.bis);
        const { data: koepfe, error } = await supabase.from(ziel.tabelle).insert(teil.map((v) => v.kopf)).select('id, bestellnummer');
        let paare: { id: string; v: Vorhaben }[] = [];
        if (!error) {
          const nachNr = new Map(((koepfe ?? []) as unknown as { id: string; bestellnummer: string }[]).map((k) => [String(k.bestellnummer), String(k.id)]));
          paare = teil.map((v) => ({ id: nachNr.get(v.b.kopf.bestellnummer) ?? '', v })).filter((x) => x.id);
        } else {
          // Paket gescheitert: einzeln, damit die schuldige Bestellung benannt ist.
          for (const v of teil) {
            const r = await supabase.from(ziel.tabelle).insert(v.kopf).select('id').single();
            if (r.error || !r.data) {
              erg.fehlgeschlagen += v.b.zeilen.length;
              erg.fehler.push({ zeile: v.b.zeilen[0] ?? 0, feld: 'Bestellnummer', meldung: `Bestellung ${v.b.kopf.bestellnummer}: ${r.error?.message ?? 'nicht angelegt'}` });
            } else paare.push({ id: String((r.data as { id: string }).id), v });
          }
        }
        // Positionen je Paket in einem Rutsch, sonst je Bestellung.
        const allePos = paare.flatMap((x) => x.v.b.positionen.map((pos) => ({ ...positionFuerDatenbank(pos, x.id), owner_user_id: betrieb })));
        const { error: ePos } = allePos.length > 0 ? await supabase.from(kinder.tabelle).insert(allePos) : { error: null };
        const fertig: typeof paare = [];
        if (!ePos) fertig.push(...paare);
        else {
          for (const x of paare) {
            const r = await supabase.from(kinder.tabelle).insert(x.v.b.positionen.map((pos) => ({ ...positionFuerDatenbank(pos, x.id), owner_user_id: betrieb })));
            if (r.error) {
              await supabase.from(ziel.tabelle).delete().eq('id', x.id);   // keine halbe Bestellung
              erg.fehlgeschlagen += x.v.b.zeilen.length;
              erg.fehler.push({ zeile: x.v.b.zeilen[0] ?? 0, feld: 'Positionen', meldung: `Bestellung ${x.v.b.kopf.bestellnummer}: ${r.error.message} — Bestellung nicht übernommen.` });
            } else fertig.push(x);
          }
        }
        for (const x of fertig) {
          angelegteIds.push(x.id);
          erg.angelegt += x.v.b.zeilen.length;
          // Eigene-Feld-Werte an die Bestellung
          if (eigene.length > 0) {
            const werte = new Map<string, string>();
            for (const z of x.v.b.zeilen) for (const w of eigeneWerteDerZeile(datei.zeilen[z - 2] ?? [], eigene)) if (!werte.has(w.spalte)) werte.set(w.spalte, w.wert);
            const zeilen = [...werte].filter(([sp]) => feldIdJeSpalte[sp]).map(([sp, wert]) => ({
              owner_user_id: betrieb, modul, datensatz_id: x.id, feld_id: feldIdJeSpalte[sp], wert, aktualisiert_am: new Date().toISOString(),
            }));
            if (zeilen.length > 0) {
              const { error: eW } = await supabase.from('eigenes_feld_wert').upsert(zeilen, { onConflict: 'feld_id,datensatz_id' });
              if (eW) erg.eigeneFehler.push(`Bestellung ${x.v.b.kopf.bestellnummer}: ${eW.message}`); else erg.eigeneWerte += zeilen.length;
            }
          }
        }
        erledigt += teil.reduce((n, v) => n + v.b.zeilen.length, 0);
        zeigeStand();
      }

      erg.offen = Math.max(0, gesamtZeilen - erledigt);
      erg.angehalten = erg.offen > 0;
      const einspielMs = Date.now() - einspielStart;
      erg.dauerMs = (phasenRef.current.laden ?? 0) + (phasenRef.current.lesen ?? 0) + (phasenRef.current.pruefen ?? 0) + einspielMs;
      erg.zeilenProS = einspielMs >= 1000 && erledigt > 0 ? erledigt / (einspielMs / 1000) : null;
      erg.zusammenfassung = `${zahlDe(angelegteIds.length)} Bestellungen mit ${zahlDe(erg.angelegt)} Positionen angelegt`
        + ` (${zahlDe(g.bestellungen.length)} Bestellnummern in der Datei)`
        + (erg.uebersprungen > 0 ? ` · ${zahlDe(erg.uebersprungen)} Zeilen gehören zu schon vorhandenen Bestellnummern` : '');
      const status = erg.angehalten ? 'angehalten' : erg.fehlgeschlagen > 0 ? 'teilweise' : 'fertig';

      // Protokoll (neues Schema mit Messwerten, sonst wie bisher)
      const jobSatz: Record<string, unknown> = {
        owner_user_id: neuesSchema ? betrieb : uid,
        ziel: zielKey, dateiname: datei.dateiname,
        status: !neuesSchema && status === 'angehalten' ? 'abgebrochen' : status,
        kopfzeilen: datei.kopf, mapping,
        zeilen_gesamt: bericht.gesamt, zeilen_ok: erg.angelegt, zeilen_fehler: erg.fehlgeschlagen + bericht.schlecht,
        fehler: [...bericht.fehler, ...erg.fehler].slice(0, 500),
        als_vorlage: merken, vorlage_name: merken ? datei.dateiname : null,
        beendet_am: new Date().toISOString(), angelegte_ids: angelegteIds,
        ...(neuesSchema ? {
          erstellt_von: uid, zeilen_gelesen: bericht.gesamt, zeilen_uebersprungen: erg.uebersprungen,
          zeilen_abgelehnt: erg.abgelehnt, zeilen_doppelt: 0, zeilen_gescheitert: erg.fehlgeschlagen, zeilen_offen: erg.offen,
          warnungen: bericht.warnungen.length + (erg.zusatzHinweise?.length ?? 0), umzug_id: umzug?.id ?? null,
          dateigroesse: datei.groesse, gestartet_am: new Date(dateiStartRef.current || einspielStart).toISOString(),
          dauer_ms: erg.dauerMs, zeilen_pro_s: erg.zeilenProS ? Math.round(erg.zeilenProS * 100) / 100 : null,
          phasen_ms: { ...phasenRef.current, einspielen: einspielMs },
        } : {}),
      };
      const { error: jobFehler } = await supabase.from('import_jobs').insert(jobSatz);
      if (jobFehler) {
        const { angelegte_ids: _weg, ...ohne } = jobSatz;
        void _weg;
        await supabase.from('import_jobs').insert(ohne);
      }

      setErgebnis(erg);
      setBalken({
        phase: erg.angehalten ? 'einspielen' : 'fertig',
        anteil: gesamtZeilen > 0 ? erledigt / gesamtZeilen : 1,
        angehalten: erg.angehalten,
        zaehler: `${zahlDe(erledigt)} von ${zahlDe(gesamtZeilen)} Positionen eingespielt · ${formatDauer(erg.dauerMs)} Rechenzeit`,
        wartet: erg.angehalten ? `angehalten — ${zahlDe(erg.offen)} Positionen noch offen` : null,
      });
      await verlaufLaden();
      setHinweis(erg.zusammenfassung);
    } catch (err: unknown) {
      setFehler(`Import abgebrochen: ${err instanceof Error ? err.message : 'Fehler'}`
        + (angelegteIds.length > 0 ? ` Bis dahin ${zahlDe(angelegteIds.length)} Bestellungen übernommen.` : ''));
      setBalken((b) => (b ? { ...b, fehler: true, rest: null, wartet: 'abgebrochen' } : null));
    } finally {
      setBusy(null);
      anhaltenRef.current = false; setAnhaltenGewuenscht(false);
    }
  }

  // --- Paket 136: Bestand je Filiale ---------------------------------------
  // Eine Bestandsliste bringt Zaehlstaende, keine neuen Datensaetze. Jede Zahl
  // wird als KORREKTUR ueber lager_buchen gebucht — genau wie eine Inventur in
  // der Lager-Matrix: Eintrag im Verlauf, Filialbestand und Summe am Artikel
  // in einem Vorgang. Der alte Stand je Buchung kommt ins Protokoll
  // (rueck_daten), damit „Rückgängig" ihn wiederherstellen kann.
  async function ladeBestandsDaten() {
    setBalken({ phase: 'einspielen', anteil: 0, zaehler: 'Artikel, Filialen und Bestände laden …' });
    const artikel = await allesLaden('artikel', ['id,artikelnummer,bezeichnung,ean,aktueller_bestand,aktiv', 'id,artikelnummer,bezeichnung,aktueller_bestand'], 'Artikel');
    const { data: st, error: eSt } = await supabase.from('standorte').select('id,name,ort,ist_hauptsitz,aktiv');
    // Ohne Tabelle „standorte" (Multistandort nie eingerichtet) gilt: keine Filialen.
    const standorte = eSt ? [] : ((st ?? []) as unknown as StandortRoh[]);
    const vorhanden = standorte.length === 0 ? [] : await allesLaden('artikel_bestand_standort', ['id,artikel_id,standort_id,bestand'], 'Filialbestände');
    return { artikel: artikel as unknown as ArtikelRoh[], standorte, vorhanden: vorhanden as unknown as BestandRoh[] };
  }

  async function importiereBestand() {
    if (!datei || !ziel || !bericht) return;
    setBusy('import'); setFehler(null); setHinweis(null);
    anhaltenRef.current = false; setAnhaltenGewuenscht(false);
    messRef.current = [];
    const erg: ImportErgebnis = {
      angelegt: 0, aktualisiert: 0, uebersprungen: 0, fehlgeschlagen: 0, fehler: [],
      gelesen: bericht.gesamt, doppelt: 0, abgelehnt: bericht.schlecht,
      offen: 0, angehalten: false, dauerMs: 0, zeilenProS: null,
      eigeneWerte: 0, eigeneFelderNeu: 0, eigeneAlsNotiz: 0, eigeneFehler: [],
      kundeVerknuepft: 0, kundeOhne: 0, kundeHinweise: [], zusatzHinweise: [],
    };
    const gebucht: BestandBuchung[] = [];
    let erledigt = 0;
    let gesamt = 0;
    const einspielStart = Date.now();
    try {
      const { uid, betrieb } = await betriebUndIch();
      const daten = await ladeBestandsDaten();
      const plan = planeBestand(bericht.saetze, bericht.zeilenNummern,
        baueArtikelSuche(daten.artikel), baueStandortSuche(daten.standorte), daten.vorhanden);
      const summe = bestandSumme(plan);
      setBalken(null);
      if (plan.buchungen.length > 0 && typeof window !== 'undefined' && !window.confirm(
        `${zahlDe(summe.buchungen)} Bestände (${zahlDe(summe.artikel)} Artikel) werden jetzt als Korrektur gebucht — mit Eintrag im Lager-Verlauf. `
        + (summe.unveraendert > 0 ? `${zahlDe(summe.unveraendert)} stimmen schon und bleiben. ` : '')
        + (summe.abgelehnt > 0 ? `${zahlDe(summe.abgelehnt)} Zeilen können nicht zugeordnet werden (Gründe im Ergebnis). ` : '')
        + 'Fortfahren?'
      )) { setBusy(null); return; }

      for (const a of plan.abgelehnt) erg.fehler.push({ zeile: a.zeile, feld: a.feld, meldung: a.grund });
      erg.abgelehnt += plan.abgelehnt.length;
      erg.doppelt = plan.doppelt.length;
      erg.uebersprungen = plan.unveraendert.length;
      erg.zusatzHinweise!.push(...plan.hinweise);
      if (plan.doppelt.length > 0) erg.zusatzHinweise!.push(`${zahlDe(plan.doppelt.length)} Zeilen wiederholen einen Bestand mit derselben Zahl — einmal gebucht.`);

      // Spalten ohne Feld (z. B. Lagerplatz, Mindestbestand) stehen im Verlauf-Text.
      const eigene: EigeneSpalte[] = eigeneSpalten(datei.kopf, datei.zeilen, mapping, ziel);
      if (eigene.length > 0) erg.zusatzHinweise!.push(`Die Spalten ${eigene.map((e) => `„${e.spalte}"`).join(', ')} haben hier kein eigenes Feld — ihre Werte stehen im Lager-Verlauf bei der jeweiligen Buchung.`);

      gesamt = plan.buchungen.length;
      const zeigeStand = () => {
        messRef.current.push({ t: Date.now(), n: erledigt });
        setBalken({
          phase: 'einspielen',
          anteil: gesamt > 0 ? erledigt / gesamt : 1,
          zaehler: `${zahlDe(erledigt)} von ${zahlDe(gesamt)} Beständen gebucht`,
          rest: restText(restMs(erledigt, gesamt, tempoProMs(messRef.current))),
        });
      };
      zeigeStand();

      // Je zehn Buchungen gleichzeitig — jede ist ein eigener Vorgang in der Datenbank.
      for (const p of pakete(plan.buchungen.length, 10)) {
        if (anhaltenRef.current) break;
        const teil = plan.buchungen.slice(p.von, p.bis);
        const antworten = await Promise.all(teil.map((b) => {
          const weitere = eigene.length > 0 ? eigeneWerteDerZeile(datei.zeilen[b.zeilen[0] - 2] ?? [], eigene) : [];
          return supabase.rpc(RPC_BUCHEN, buchenArgumente({
            artikelId: b.artikelId, standortId: b.standortId, art: 'korrektur', menge: b.neu,
            herkunft: 'inventur', notiz: bestandGrund(datei.dateiname, b, weitere),
          }));
        }));
        antworten.forEach((r, i) => {
          const b = teil[i];
          if (r.error) {
            erg.fehlgeschlagen += 1 + (b.zeilen.length - 1);
            erg.doppelt -= b.zeilen.length - 1;
            erg.fehler.push({ zeile: b.zeilen[0], feld: 'Bestand', meldung: `Nicht gebucht: ${r.error.message}` });
          } else {
            gebucht.push(b);
            erg.aktualisiert += 1;
          }
        });
        erledigt += teil.length;
        zeigeStand();
      }

      erg.offen = Math.max(0, gesamt - erledigt);
      // Offene Buchungen: auch ihre Wiederholungs-Zeilen sind noch offen.
      if (erg.offen > 0) {
        const offeneWdh = plan.buchungen.slice(erledigt).reduce((n, b) => n + b.zeilen.length - 1, 0);
        erg.offen += offeneWdh; erg.doppelt -= offeneWdh;
      }
      erg.angehalten = erg.offen > 0;
      const einspielMs = Date.now() - einspielStart;
      erg.dauerMs = (phasenRef.current.laden ?? 0) + (phasenRef.current.lesen ?? 0) + (phasenRef.current.pruefen ?? 0) + einspielMs;
      erg.zeilenProS = einspielMs >= 1000 && erledigt > 0 ? erledigt / (einspielMs / 1000) : null;
      erg.zusammenfassung = `${zahlDe(gebucht.length)} Bestände gebucht`
        + (erg.uebersprungen > 0 ? ` · ${zahlDe(erg.uebersprungen)} stimmten schon` : '')
        + (erg.abgelehnt > 0 ? ` · ${zahlDe(erg.abgelehnt)} Zeilen nicht zugeordnet` : '');
      const status = erg.angehalten ? 'angehalten' : erg.fehlgeschlagen > 0 ? 'teilweise' : 'fertig';

      const jobSatz: Record<string, unknown> = {
        owner_user_id: neuesSchema ? betrieb : uid,
        ziel: zielKey, dateiname: datei.dateiname,
        status: !neuesSchema && status === 'angehalten' ? 'abgebrochen' : status,
        kopfzeilen: datei.kopf, mapping,
        zeilen_gesamt: bericht.gesamt, zeilen_ok: gebucht.length, zeilen_fehler: erg.fehlgeschlagen + erg.abgelehnt,
        fehler: [...bericht.fehler, ...erg.fehler].slice(0, 500),
        als_vorlage: merken, vorlage_name: merken ? datei.dateiname : null,
        beendet_am: new Date().toISOString(),
        rueck_daten: rueckDaten(gebucht),
        ...(neuesSchema ? {
          erstellt_von: uid, zeilen_gelesen: bericht.gesamt, zeilen_uebersprungen: erg.uebersprungen,
          zeilen_abgelehnt: erg.abgelehnt, zeilen_doppelt: erg.doppelt, zeilen_gescheitert: erg.fehlgeschlagen, zeilen_offen: erg.offen,
          warnungen: bericht.warnungen.length + (erg.zusatzHinweise?.length ?? 0), umzug_id: umzug?.id ?? null,
          dateigroesse: datei.groesse, gestartet_am: new Date(dateiStartRef.current || einspielStart).toISOString(),
          dauer_ms: erg.dauerMs, zeilen_pro_s: erg.zeilenProS ? Math.round(erg.zeilenProS * 100) / 100 : null,
          phasen_ms: { ...phasenRef.current, einspielen: einspielMs },
        } : {}),
      };
      const { error: jobFehler } = await supabase.from('import_jobs').insert(jobSatz);
      if (jobFehler) {
        // Ohne SQL p136 gibt es rueck_daten nicht — Protokoll trotzdem schreiben.
        const { rueck_daten: _weg, ...ohne } = jobSatz;
        void _weg;
        const { error: e2 } = await supabase.from('import_jobs').insert(ohne);
        if (!e2) erg.zusatzHinweise!.push('Der alte Stand konnte nicht im Protokoll gespeichert werden (Datenbank-Update „p136" fehlt) — „Rückgängig" geht für diesen Import nicht. Jeder alte Stand steht aber im Lager-Verlauf („vorher …").');
      }

      setErgebnis(erg);
      setBalken({
        phase: erg.angehalten ? 'einspielen' : 'fertig',
        anteil: gesamt > 0 ? erledigt / gesamt : 1,
        angehalten: erg.angehalten,
        zaehler: `${zahlDe(erledigt)} von ${zahlDe(gesamt)} Beständen gebucht · ${formatDauer(erg.dauerMs)} Rechenzeit`,
        wartet: erg.angehalten ? `angehalten — ${zahlDe(gesamt - erledigt)} Bestände noch offen` : null,
      });
      await verlaufLaden();
      setHinweis(erg.zusammenfassung);
    } catch (err: unknown) {
      setFehler(`Import abgebrochen: ${err instanceof Error ? err.message : 'Fehler'}`
        + (gebucht.length > 0 ? ` Bis dahin ${zahlDe(gebucht.length)} Bestände gebucht (jeweils mit „vorher …" im Lager-Verlauf).` : ''));
      setBalken((b) => (b ? { ...b, fehler: true, rest: null, wartet: 'abgebrochen' } : null));
    } finally {
      setBusy(null);
      anhaltenRef.current = false; setAnhaltenGewuenscht(false);
    }
  }

  /**
   * Paket 136: Bestaende zuruecksetzen. Nur dort, wo heute noch genau die
   * importierte Zahl steht — hat seitdem jemand verkauft oder gezaehlt,
   * bleibt der heutige Stand (sonst wuerde eine echte Buchung ueberschrieben).
   */
  async function rueckgaengigBestand(j: Job) {
    const recht = importErlaubt(j.ziel, rechtStand);
    if (!recht.ok) { setFehler(recht.grund); return; }
    setBusy('rueck'); setFehler(null); setHinweis(null);
    try {
      const { data, error } = await supabase.from('import_jobs').select('rueck_daten').eq('id', j.id).single();
      const rueck = error ? [] : leseRueckDaten((data as { rueck_daten?: unknown } | null)?.rueck_daten);
      if (rueck.length === 0) {
        setHinweis('Für diesen Import ist der alte Stand nicht gespeichert. Jeder alte Stand steht im Lager-Verlauf („vorher …") — dort lässt er sich per Korrektur zurücksetzen.');
        return;
      }
      const daten = await ladeBestandsDaten();
      const heuteFiliale = new Map(daten.vorhanden.map((v) => [bestandSchluessel(String(v.artikel_id), String(v.standort_id)), Number(v.bestand)]));
      const heuteGesamt = new Map(daten.artikel.map((a) => [String(a.id), Number(a.aktueller_bestand) || 0]));
      const p = planeRueckgaengig(rueck, heuteFiliale, heuteGesamt);
      setBalken(null);
      if (typeof window !== 'undefined' && !window.confirm(
        `${zahlDe(p.zurueck.length)} Bestände werden auf den Stand vor dem Import zurückgesetzt (Korrektur mit Eintrag im Verlauf).`
        + (p.geaendert.length > 0 ? ` ${zahlDe(p.geaendert.length)} wurden seitdem schon wieder gebucht und bleiben, wie sie sind.` : '')
        + ' Fortfahren?'
      )) return;
      let ok = 0; let schief = 0;
      for (let i = 0; i < p.zurueck.length; i += 10) {
        const antworten = await Promise.all(p.zurueck.slice(i, i + 10).map((r) => supabase.rpc(RPC_BUCHEN, buchenArgumente({
          artikelId: r.a, standortId: r.s, art: 'korrektur', menge: r.alt,
          herkunft: 'inventur', notiz: `Import „${String(j.dateiname ?? 'Datei').slice(0, 80)}" rückgängig gemacht`,
        }))));
        for (const r of antworten) if (r.error) schief++; else ok++;
      }
      if (schief === 0) await supabase.from('import_jobs').update({ status: 'rueckgaengig', rueckgaengig_am: new Date().toISOString() }).eq('id', j.id);
      setHinweis(`${zahlDe(ok)} Bestände zurückgesetzt.`
        + (p.geaendert.length > 0 ? ` ${zahlDe(p.geaendert.length)} blieben, weil seitdem gebucht wurde.` : '')
        + (schief > 0 ? ` ${zahlDe(schief)} gingen nicht (fehlendes Recht oder Artikel gelöscht) — der Import bleibt im Verlauf offen.` : ''));
      await verlaufLaden();
    } catch (err: unknown) {
      setFehler('Rückgängig fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  async function importieren() {
    if (!datei || !ziel || !bericht || bericht.gut === 0) return;
    // Paket 137: Freigabe pruefen — auch wenn das Ziel per Link (?ziel=) vorgewaehlt war.
    const recht = importErlaubt(ziel.key, rechtStand);
    if (!recht.ok) { setFehler(recht.grund); return; }
    // Paket 127: Bestellungen mit Positionen gehen einen eigenen Weg (Kopf + Positionen).
    if (ziel.kinder) { await importiereMitPositionen(); return; }
    // Paket 136: Zaehlstaende je Filiale — Korrektur statt Anlegen.
    if (ziel.bestandSetzen) { await importiereBestand(); return; }
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
      eigeneWerte: 0, eigeneFelderNeu: 0, eigeneAlsNotiz: 0, eigeneFehler: [],
      kundeVerknuepft: 0, kundeOhne: 0, kundeHinweise: [], zusatzHinweise: [],
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
      // Schritt 2: ALLE importierten Daten gehoeren dem Betrieb (beim Mitarbeiter
      // der Chef) — nicht mehr nur Kontakte. Die Regeln der Tabellen entscheiden,
      // wer was anlegen darf; scheitert es, steht es mit Grund im Bericht.
      const neuOwner = betrieb;

      // Bereits vorhandene Eintraege laden — damit nichts doppelt entsteht.
      // Schritt 0: SEITENWEISE (Supabase liefert je Abfrage hoechstens 1.000).
      // Schritt 2: ueber ALLE Erkennungsfelder (Kundennummer, Alt-ID, E-Mail …).
      setBalken({ phase: 'einspielen', anteil: 0, zaehler: 'Abgleich mit vorhandenen Einträgen …' });
      const erkennung = erkennungsFelder(ziel);
      let bestand = new Map<string, string>();
      if (erkennung.length > 0) {
        const alle: Record<string, unknown>[] = [];
        for (let von = 0; von < 5000000; von += LESE_SEITE) {
          // Dynamische Spaltennamen kann der Supabase-Typparser nicht aufloesen —
          // deshalb der Umweg ueber unknown.
          const { data: alt, error } = await supabase.from(ziel.tabelle)
            .select(`id,${erkennungsSpalten(erkennung).join(',')}`).order('id').range(von, von + LESE_SEITE - 1);
          if (error) throw new Error('Abgleich mit den vorhandenen Einträgen fehlgeschlagen: ' + error.message);
          const liste = (alt ?? []) as unknown as Record<string, unknown>[];
          alle.push(...liste);
          if (liste.length < LESE_SEITE) break;
        }
        bestand = baueBestandIndex(alle, erkennung);
      }

      // Schritt 2: Eigene Felder vorbereiten — vorhandene wiederfinden, neue anlegen.
      // Klappt das nicht (fehlende Rechte o. Ae.), wandern die Werte in die
      // Notizen: verschluckt wird nichts.
      // Paket 153: Bei Gesundheitszielen gibt es KEINE Eigenen Felder (Klartext) — diese
      // Spalten gehen verschluesselt als Hinweis zum Patienten (gesundheitAblegen).
      const gesundEigene: EigeneSpalte[] = ziel.gesundheitNotizen ? eigeneSpalten(datei.kopf, datei.zeilen, mapping, ziel) : [];
      const eigene: EigeneSpalte[] = ziel.gesundheitNotizen ? [] : eigeneSpalten(datei.kopf, datei.zeilen, mapping, ziel);
      const feldIdJeSpalte: Record<string, string> = {};
      const modul = ziel.eigeneFelderModul ?? ziel.key;
      const notizFeld = ziel.felder.some((f) => f.key === 'notizen');
      let eigeneAlsNotiz = false;
      if (eigene.length > 0) {
        try {
          const { data: da, error: e1 } = await supabase.from('eigenes_feld').select('id, label').eq('modul', modul);
          if (e1) throw new Error(e1.message);
          const zuordnung = eigeneFelderZuordnen(eigene, ((da ?? []) as unknown as { id: string; label: string }[]));
          Object.assign(feldIdJeSpalte, zuordnung.vorhanden);
          if (zuordnung.neu.length > 0) {
            const start = (da ?? []).length;
            const { data: angelegt, error: e2 } = await supabase.from('eigenes_feld').insert(
              zuordnung.neu.map((e, i) => ({
                owner_user_id: betrieb, modul, label: e.spalte.slice(0, 120), feld_typ: e.typ, optionen: [], reihenfolge: start + i,
              })),
            ).select('id, label');
            if (e2) throw new Error(e2.message);
            for (const f of ((angelegt ?? []) as unknown as { id: string; label: string }[])) {
              const e = zuordnung.neu.find((x) => x.spalte.slice(0, 120) === f.label);
              if (e) feldIdJeSpalte[e.spalte] = f.id;
            }
            erg.eigeneFelderNeu = (angelegt ?? []).length;
          }
          if (eigene.some((e) => !feldIdJeSpalte[e.spalte])) throw new Error('nicht alle Eigenen Felder ließen sich anlegen');
        } catch (e) {
          eigeneAlsNotiz = notizFeld;
          erg.eigeneFehler.push(`Eigene Felder: ${e instanceof Error ? e.message : 'Fehler'} — `
            + (notizFeld ? 'die Werte stehen stattdessen in den Notizen.' : 'die Werte stehen im Bericht.'));
        }
      }
      /** Die Werte der Eigenen Felder zu einer Dateizeile. */
      const eigeneZuZeile = (dateiZeile: number) => (eigene.length > 0 && dateiZeile >= 2
        ? eigeneWerteDerZeile(datei.zeilen[dateiZeile - 2] ?? [], eigene) : []);
      /** Eigene-Feld-Werte schreiben (nach dem Anlegen, mit der echten id). */
      const eigeneSchreiben = async (paare: { id: string; dateiZeile: number }[]) => {
        if (eigene.length === 0 || eigeneAlsNotiz) return;
        const zeilen = paare.flatMap((p) => eigeneZuZeile(p.dateiZeile)
          .filter((w) => feldIdJeSpalte[w.spalte])
          .map((w) => ({
            owner_user_id: betrieb, modul, datensatz_id: p.id, feld_id: feldIdJeSpalte[w.spalte],
            wert: w.wert, aktualisiert_am: new Date().toISOString(),
          })));
        for (let i = 0; i < zeilen.length; i += PAKET_GROESSE) {
          const teil = zeilen.slice(i, i + PAKET_GROESSE);
          const { error } = await supabase.from('eigenes_feld_wert').upsert(teil, { onConflict: 'feld_id,datensatz_id' });
          if (error) erg.eigeneFehler.push(`${teil.length} Werte der Eigenen Felder: ${error.message}`);
          else erg.eigeneWerte += teil.length;
        }
      };

      // Schritt 3: Kunden laden, damit Offene Posten, Chancen, Aktivitaeten
      // und Wartungsvertraege am richtigen Kunden haengen.
      let kundenIndex: ReturnType<typeof baueKundenIndex> | null = null;
      if (ziel.kundeVerweis) kundenIndex = await ladeVerweisIndex(ziel.kundeVerweis);
      const verweisWas = ziel.kundeVerweis?.label ?? 'Kunde';

      // Paket 128: Verweis ueber einen Namen (Gruppe eines Objekts, Objekt eines
      // Pruefprotokolls). Fehlende Gruppen werden angelegt, wenn das Ziel es will.
      const nach = ziel.nachschlag;
      const nachVirtuell = !!nach && ziel.felder.some((f) => f.key === nach.ausFeld && f.virtuell === 'nachschlag');
      let nachIndex: Map<string, string> | null = null;
      let nachNeu = 0;
      if (nach && dbSpalten?.some((c) => c.tabelle === ziel.tabelle && c.spalte === nach.spalte)) {
        try {
          setBalken({ phase: 'einspielen', anteil: 0, zaehler: `${nach.label} zum Verknüpfen laden …` });
          nachIndex = nachschlagIndex(await allesLaden(nach.tabelle, [`id,${nach.nameSpalte}`], nach.label), nach.nameSpalte);
          const fehlen = nach.anlegen ? fehlendeNamen(bericht.saetze, nachIndex) : [];
          for (let i = 0; i < fehlen.length; i += 200) {
            const { data, error } = await supabase.from(nach.tabelle)
              // Paket 129: mit festen Werten und denen der ersten Zeile (Rezept-Typ, Tour-Datum …)
              .insert(elternZeilen(fehlen.slice(i, i + 200), bericht.saetze, nach, neuOwner))
              .select(`id,${nach.nameSpalte}`);
            if (error) { (erg.zusatzHinweise ??= []).push(`${nach.label}: ${error.message} — die Namen stehen im Text.`); break; }
            for (const r of ((data ?? []) as unknown as Record<string, unknown>[])) nachIndex.set(String(r[nach.nameSpalte] ?? '').trim().toLowerCase(), String(r.id));
            nachNeu += (data ?? []).length;
          }
        } catch (e) {
          nachIndex = null;
          (erg.zusatzHinweise ??= []).push(`${nach.label}: ${e instanceof Error ? e.message : 'Fehler'} — ohne Verknüpfung, die Namen stehen im Text.`);
        }
      }
      let nachOhne = 0;
      // Paket 129: laufende Nummer je Rezept/Tour, wo die Datei keine hat
      const posNr = nach?.positionSpalte ? positionenJeEintrag(bericht.saetze, nach.positionSpalte) : null;

      const neu: Record<string, unknown>[] = [];
      const neuZeile: number[] = [];               // F6: echte Dateizeile je neuem Satz
      const neuPos: unknown[] = [];                // Paket 146: Positionen je neuem Kopf (Kind-Tabelle)
      const neuGes: unknown[] = [];                // Paket 153: Gesundheitsangaben je neuem Satz (__gesundheit)
      const kindTab = ziel.jsonPositionen?.kindTabelle ?? null;
      const zuAendern: { id: string; werte: Record<string, unknown>; zeile: number }[] = [];

      bericht.saetze.forEach((satzRoh, idx) => {
        const dateiZeile = bericht.zeilenNummern?.[idx] ?? 0;
        let satz0 = fuerDatenbank(satzRoh);
        // Paket 132: Einsatz der Geschaeftsleitung („Chef") braucht keinen Mitarbeiter-Verweis.
        if (ziel.kundeVerweis && kundenIndex && satzRoh.inhaber_einsatz !== true) {
          const v = verknuepfeKunde(satzRoh, ziel.kundeVerweis, kundenIndex);
          satz0 = v.satz;
          if (v.treffer.art === 'gefunden') erg.kundeVerknuepft++;
          else {
            erg.kundeOhne++;
            const grund = v.treffer.art === 'mehrdeutig'
              ? `„${v.gesucht || 'Text'}" passt zu ${v.treffer.anzahl} Einträgen (${verweisWas}) — nicht verknüpft`
              : v.gesucht ? `${verweisWas} „${v.gesucht}" nicht gefunden` : `kein ${verweisWas} angegeben`;
            if (ziel.kundeVerweis.pflicht) {
              // Ohne Verweis gibt es hier keinen Datensatz (z. B. Aktivitaet ohne Zeitleiste, Qualifikation ohne Mitarbeiter).
              erg.fehlgeschlagen++;
              erg.fehler.push({ zeile: dateiZeile, feld: verweisWas, meldung: `${grund}. Bitte zuerst ${ziel.kundeVerweis.mehrzahl ?? 'die Kunden'} importieren, dann diese Datei noch einmal.` });
              return;
            }
            // Paket 132: nicht gefunden -> Name ins Textfeld, damit nichts verschluckt wird.
            const tf = ziel.kundeVerweis.textFeld;
            if (tf && v.gesucht) {
              const alt = `${verweisWas} im Altsystem: ${v.gesucht}`;
              const bisher = typeof satz0[tf] === 'string' ? String(satz0[tf]).trim() : '';
              satz0[tf] = bisher ? `${bisher}\n${alt}` : alt;
            }
            if (erg.kundeHinweise.length < 200) erg.kundeHinweise.push(`Zeile ${dateiZeile}: ${grund} — ohne ${verweisWas} übernommen${tf && v.gesucht ? ' (der Name steht im Text)' : ''}.`);
          }
        }
        if (nach) {
          const r = loeseNachschlag(satz0.__nach !== undefined ? satz0 : { ...satz0, __nach: satzRoh.__nach }, nach, nachIndex, nachVirtuell);
          satz0 = r.satz;
          // Paket 134: ohne gefundenen Eintrag keine Zeile (Anmeldung ohne Kurs) — mit Grund statt Datenbankfehler.
          if (nach.pflicht && !r.gefunden) {
            erg.fehlgeschlagen++;
            erg.fehler.push({ zeile: dateiZeile, feld: nach.label, meldung: nachschlagPflichtGrund(nach, r.name) });
            return;
          }
          if (r.name && !r.gefunden) nachOhne++;
          const nr = posNr?.[idx];
          if (nach.positionSpalte && typeof nr === 'number' && satz0[nach.positionSpalte] == null) satz0[nach.positionSpalte] = nr;
        }
        // Schritt 3: Wartungsvertraege — naechste Faelligkeit wie im Modul rechnen.
        if (ziel.key === 'wartungsvertraege' && !satz0.naechste_faelligkeit_am) {
          satz0.naechste_faelligkeit_am = naechsteFaelligkeitString({
            letzte_wartung_am: (satz0.letzte_wartung_am as string | null) ?? null,
            beginn_am: (satz0.beginn_am as string | null) ?? null,
            intervall_monate: typeof satz0.intervall_monate === 'number' ? satz0.intervall_monate : 12,
          } as Parameters<typeof naechsteFaelligkeitString>[0]);
        }
        let satz = satz0;
        if (eigeneAlsNotiz) {
          const extra = eigeneZuZeile(dateiZeile);
          if (extra.length > 0) {
            const zusatz = 'Weitere Angaben aus dem Altsystem:\n' + extra.map((w) => `${w.spalte}: ${w.wert}`).join('\n');
            satz = { ...satz0, notizen: satz0.notizen ? `${String(satz0.notizen)}\n${zusatz}` : zusatz };
            erg.eigeneAlsNotiz++;
          }
        }
        const treffer = findeImBestand(satz, erkennung, bestand);
        if (treffer) {
          // Paket 141: Ziele mit nurNeu (Spenden) ueberschreiben nie Vorhandenes.
          if (beiDublette === 'aktualisieren' && !ziel.nurNeu) zuAendern.push({ id: treffer, werte: satz, zeile: dateiZeile });
          else erg.uebersprungen++;
          return;
        }
        neu.push({ ...satz, owner_user_id: neuOwner });
        if (kindTab) neuPos.push(satzRoh[ziel.jsonPositionen!.spalte] ?? []);
        if (ziel.gesundheitNotizen) neuGes.push(satzRoh.__gesundheit);
        neuZeile.push(dateiZeile);
      });
      gesamtSchreiben = neu.length + zuAendern.length;
      if (nach && (nachNeu > 0 || nachOhne > 0)) {
        erg.zusammenfassung = `${nach.label}: ${nachNeu > 0 ? `${zahlDe(nachNeu)} neu angelegt` : 'alle vorhanden'}`
          + (nachOhne > 0 ? ` · ${zahlDe(nachOhne)} Zeilen ohne Verknüpfung (${nach.label} nicht gefunden${nachVirtuell ? ', Name steht im Text' : ''})` : '');
      }

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

      /**
       * Paket 153: Gesundheitsangaben der gerade angelegten Saetze verschluesselt
       * ablegen (Server-Route, Schluessel nur dort). Gibt einen Fehlertext zurueck
       * oder null. Bei Fehler entfernt der Aufrufer die Saetze wieder — ein Patient
       * ohne seine Angaben oder Angaben im Klartext entstehen nie.
       */
      const gesundheitAblegen = async (ids: readonly string[], von: number): Promise<string | null> => {
        if (!ziel.gesundheitNotizen) return null;
        const alle: NotizEntwurf[] = [];
        ids.forEach((id, j) => {
          const satz = neu[von + j] ?? {};
          const kundeId = ziel.tabelle === 'wellness_kunden' ? id : String(satz.kunde_id ?? '');
          const dz = neuZeile[von + j] ?? 0;
          alle.push(...notizenFuerSatz({
            kundeId,
            gesundheit: neuGes[von + j],
            weitere: gesundEigene.length > 0 && dz >= 2 ? eigeneWerteDerZeile(datei.zeilen[dz - 2] ?? [], gesundEigene) : [],
            ueberschrift: ziel.tabelle === 'wellness_behandlungen' ? behandlungUeberschrift(satz) : undefined,
          }));
        });
        for (let i = 0; i < alle.length; i += STAPEL_MAX) {
          try {
            const r = await fetch('/api/gesundheit-notiz/stapel', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ notizen: alle.slice(i, i + STAPEL_MAX) }),
            });
            const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string };
            if (!r.ok || !j.ok) return j.error ?? `Fehler ${r.status}`;
          } catch (e) {
            return e instanceof Error ? e.message : 'Verbindung fehlgeschlagen';
          }
        }
        return null;
      };

      // Neue Datensätze in Paketen. Scheitert ein Paket, wird es Zeile für Zeile
      // wiederholt — nur so weiß man am Ende, WELCHE Zeile das Problem war.
      for (const p of pakete(neu.length, PAKET_GROESSE)) {
        if (anhaltenRef.current) break;
        const stapel = neu.slice(p.von, p.bis);
        const { data: neuIds, error } = await supabase.from(ziel.tabelle).insert(stapel).select('id');
        // Paket 146: Positionen in die Kind-Tabelle; scheitern sie, fliegen die Koepfe wieder raus (keine halben Angebote).
        let kindFehler: string | null = null;
        if (!error && kindTab) {
          const ids0 = ((neuIds as { id: string }[] | null) ?? []).map((r) => String(r.id));
          if (ids0.length !== stapel.length) kindFehler = 'Rückmeldung der Datenbank unvollständig';
          else {
            const kz = ids0.flatMap((id, j) => kindZeilen(neuPos[p.von + j], id, kindTab.fremdschluessel, neuOwner));
            if (kz.length > 0) {
              const { error: ek } = await supabase.from(kindTab.tabelle).insert(kz);
              if (ek) kindFehler = ek.message;
            }
          }
          if (kindFehler && ids0.length > 0) await supabase.from(ziel.tabelle).delete().in('id', ids0);
        }
        // Paket 153: Gesundheitsangaben verschluesselt — klappt es nicht, fliegt das Paket wieder raus.
        let gesFehler: string | null = null;
        if (!error && !kindFehler && ziel.gesundheitNotizen) {
          const ids0 = ((neuIds as { id: string }[] | null) ?? []).map((r) => String(r.id));
          gesFehler = ids0.length !== stapel.length ? 'Rückmeldung der Datenbank unvollständig' : await gesundheitAblegen(ids0, p.von);
          if (gesFehler && ids0.length > 0) await supabase.from(ziel.tabelle).delete().in('id', ids0);
        }
        if (kindFehler) {
          erg.fehlgeschlagen += stapel.length;
          for (let j = 0; j < stapel.length; j++) erg.fehler.push({ zeile: neuZeile[p.von + j] ?? 0, feld: 'Positionen', meldung: `Positionen nicht gespeichert (${kindFehler}) — Eintrag nicht übernommen.` });
        } else if (gesFehler) {
          erg.fehlgeschlagen += stapel.length;
          for (let j = 0; j < stapel.length; j++) erg.fehler.push({ zeile: neuZeile[p.von + j] ?? 0, feld: 'Gesundheitsangaben', meldung: `Nicht verschlüsselt ablegbar (${gesFehler}) — Eintrag nicht übernommen.` });
        } else if (!error) {
          erg.angelegt += stapel.length;
          const ids = ((neuIds as { id: string }[] | null) ?? []).map((r) => String(r.id));
          ids.forEach((id) => angelegteIds.push(id));
          // Die Datenbank liefert die ids in der Reihenfolge des Einfuegens.
          // Stimmt die Anzahl nicht, wird nichts geraten: Eigene-Feld-Werte
          // dieses Pakets gehen dann als Hinweis in den Bericht.
          if (ids.length === stapel.length) {
            await eigeneSchreiben(ids.map((id, j) => ({ id, dateiZeile: neuZeile[p.von + j] ?? 0 })));
          } else if (eigene.length > 0) {
            erg.eigeneFehler.push(`Paket ab Zeile ${neuZeile[p.von] ?? '?'}: Eigene Felder nicht zugeordnet (Rückmeldung unvollständig).`);
          }
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
              const id = ((eineId as { id: string }[] | null) ?? [])[0]?.id;
              // Paket 146: auch einzeln — erst die Positionen, sonst Kopf wieder weg
              if (id && kindTab) {
                const kz = kindZeilen(neuPos[p.von + j], String(id), kindTab.fremdschluessel, neuOwner);
                const { error: ek } = kz.length > 0 ? await supabase.from(kindTab.tabelle).insert(kz) : { error: null };
                if (ek) {
                  await supabase.from(ziel.tabelle).delete().eq('id', id);
                  erg.fehlgeschlagen++;
                  erg.fehler.push({ zeile: neuZeile[p.von + j] ?? 0, feld: 'Positionen', meldung: `Positionen nicht gespeichert (${ek.message}) — Eintrag nicht übernommen.` });
                  continue;
                }
              }
              // Paket 153: auch einzeln — erst die Gesundheitsangaben, sonst Eintrag wieder weg
              if (id && ziel.gesundheitNotizen) {
                const gf = await gesundheitAblegen([String(id)], p.von + j);
                if (gf) {
                  await supabase.from(ziel.tabelle).delete().eq('id', id);
                  erg.fehlgeschlagen++;
                  erg.fehler.push({ zeile: neuZeile[p.von + j] ?? 0, feld: 'Gesundheitsangaben', meldung: `Nicht verschlüsselt ablegbar (${gf}) — Eintrag nicht übernommen.` });
                  continue;
                }
              }
              erg.angelegt++;
              if (id) { angelegteIds.push(id); await eigeneSchreiben([{ id: String(id), dateiZeile: neuZeile[p.von + j] ?? 0 }]); }
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
          else { erg.aktualisiert++; await eigeneSchreiben([{ id: a.id, dateiZeile: a.zeile }]); }
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

        {/* --- Paket 147: Umzug Schritt 6 — mehrere Dateien auf einmal --- */}
        <UmzugStapel
          dbSpalten={dbSpalten}
          erlaubt={(k) => importErlaubt(k, rechtStand).ok}
          erledigt={erledigtDateien}
          busy={busy !== null}
          onOeffnen={(d, k) => { zielWaehlen(k); setWartend({ datei: d, ziel: k }); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        />

        {/* --- Schritt 2: Aus welchem System ziehen Sie um? --- */}
        <AltsystemKarte
          wahl={wahl}
          offen={systemeOffen}
          setOffen={setSystemeOffen}
          suche={systemSuche}
          setSuche={setSystemSuche}
          anleitungOffen={anleitungOffen}
          setAnleitungOffen={setAnleitungOffen}
          umschalten={systemUmschalten}
          ausblenden={systemAusblenden}
          nurMeine={(v) => void wahlSpeichern({ ...wahl, nur_meine: v })}
          allesZeigen={() => void wahlSpeichern({ ...wahl, ausgeblendet: [], nur_meine: false })}
          importieren={importAusSystem}
          gemerktIn={wahlInDb ? 'betrieb' : 'browser'}
        />

        {/* --- 1 Ziel --- */}
        <div style={styles.stufe} id="import-ziel">
          <div style={styles.stufenTitel}>1 · Was möchten Sie importieren?</div>
          <div style={styles.zielGrid}>
            {ZIELE.map((z) => {
              // Schritt 3: neue Ziele erst, wenn die Datenbank sie kennt (SQL p125).
              const mitKatalog = (!z.nurMitKatalog || !!dbSpalten?.some((c) => c.tabelle === z.tabelle))
                && (!z.kinder || !!dbSpalten?.some((c) => c.tabelle === z.kinder!.tabelle));
              const bereitKatalog = mitKatalog && !(z.nurChef && binMitarbeiter);
              const recht = importErlaubt(z.key, rechtStand);
              const bereit = bereitKatalog && recht.ok;
              return (
                <button
                  key={z.key} type="button" onClick={() => bereit && zielWaehlen(z.key)} disabled={!bereit}
                  style={{
                    ...styles.zielKarte,
                    borderColor: zielKey === z.key ? C.gold : C.border,
                    background: zielKey === z.key ? 'rgba(201,168,76,0.12)' : 'rgba(10,22,40,0.5)',
                    opacity: bereit ? 1 : 0.5, cursor: bereit ? 'pointer' : 'not-allowed',
                  }}
                >
                  <div style={{ fontSize: 22 }}>{z.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 15, marginTop: 4 }}>{z.label}</div>
                  <div style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}>{z.beschreibung}</div>
                  {!mitKatalog && <div style={{ color: C.warn, fontSize: 11.5, marginTop: 6 }}>Braucht einmal das Datenbank-Update der Import-Pakete (zuletzt „p128-import-karten1“).</div>}
                  {mitKatalog && z.nurChef && binMitarbeiter && <div style={{ color: C.warn, fontSize: 11.5, marginTop: 6 }}>Diese Daten importiert nur die Geschäftsleitung.</div>}
                  {bereitKatalog && !recht.ok && rechtStand && <div style={{ color: C.warn, fontSize: 11.5, marginTop: 6 }}>{recht.grund}</div>}
                </button>
              );
            })}
          </div>
        </div>

        {/* --- 2 Datei --- */}
        {ziel && (
          <div style={styles.stufe}>
            <div style={styles.stufenTitel}>2 · Datei auswählen</div>
            <p style={styles.stufenText}>
              Excel (.xlsx, auch altes .xls), CSV, vCard (.vcf), DATANORM 4/5 vom Großhandel (DATANORM.001 — mit DATPREIS.001 gemeinsam auswählen), BMEcat-Katalog (.xml), Kalender (.ics)
              oder eine DATEV-Datei (Debitoren/Kreditoren). Die erste Zeile muss die
              Spaltenüberschriften enthalten — beim DATEV-Format erkennt ARGONAUT den Formatkopf selbst.
              CSV, .xls und DATEV liest ARGONAUT <b style={{ color: C.text }}>direkt in Ihrem Browser</b> — die Datei verlässt Ihren Rechner nicht.
              .xlsx wird auf dem Server gelesen und sofort verworfen, <b style={{ color: C.text }}>nicht gespeichert</b>.
            </p>
            <div style={{ ...styles.vorlagenLeiste, background: 'rgba(201,168,76,0.06)', borderColor: 'rgba(201,168,76,0.25)' }}>
              <label style={{ ...styles.feldLabel, flex: '1 1 260px' }}>
                Die Datei stammt aus
                <select value={dateiSystem} onChange={(e) => setDateiSystem(e.target.value)} style={styles.select}>
                  <option value="">— unbekannt / Excel-Liste</option>
                  {(wahl.systeme.length > 0 ? wahl.systeme.map((k) => altsystem(k)).filter((x): x is Altsystem => !!x) : ALTSYSTEME)
                    .filter((x) => x.ziele.includes(ziel.key as never))
                    .map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                </select>
              </label>
              <span style={{ color: C.dim, fontSize: 12.5, flex: '2 1 300px' }}>
                Mit dem richtigen System erkennt ARGONAUT die Spalten zuerst an dessen Spaltennamen. Beim Einlesen wird das
                System auch selbst erkannt, wenn genug Spalten passen.
                {dateiSystem && altsystem(dateiSystem) && (
                  <> {' '}<button type="button" onClick={() => { setSystemeOffen(true); setAnleitungOffen(dateiSystem); }} style={styles.linkKnopf}>Export-Anleitung für {altsystem(dateiSystem)?.name} ›</button></>
                )}
              </span>
            </div>
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
              type="file" multiple accept={`.csv,.txt,.xlsx,.xlsm,.xls,.vcf,.ics,.xml,${DATANORM_ENDUNGEN}`}
              onChange={(e) => { const liste = Array.from(e.target.files ?? []); e.target.value = ''; if (liste.length > 0) void dateienGewaehlt(liste); }}
              disabled={busy !== null}
              style={styles.dateiFeld}
            />
            {/* Paket 145: KI-Aufraeumer */}
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => setKiOffen((o) => !o)} style={styles.linkKnopf}>
                {kiOffen ? '▾' : '▸'} Keine saubere Tabelle (PDF, Word, E-Mail)? Text einfügen — ARGONAUT räumt auf
              </button>
              {kiOffen && (() => {
                const erlaubtKi = aufraeumerErlaubt(ziel.key);
                return (
                  <div style={{ ...styles.vorlagenLeiste, flexDirection: 'column', alignItems: 'stretch', marginTop: 8 }}>
                    {!erlaubtKi.ok ? (
                      <span style={{ color: C.dim, fontSize: 13 }}>{erlaubtKi.grund}</span>
                    ) : (<>
                      <span style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.5 }}>
                        Kopieren Sie die Liste aus PDF, Word oder E-Mail hier hinein. ARGONAUT ordnet sie den Feldern „{ziel.label}" zu —
                        danach sehen Sie wie bei jeder Datei die Zuordnung und das Prüfergebnis, bevor etwas gespeichert wird.
                        Der Text wird dafür an unseren KI-Dienst übermittelt und dort nicht gespeichert. Bankdaten werden nie übernommen.
                      </span>
                      <textarea
                        value={kiText} onChange={(e) => setKiText(e.target.value)} rows={8} disabled={busy !== null}
                        placeholder="Liste hier einfügen …"
                        style={{ ...styles.select, width: '100%', minHeight: 140, fontFamily: 'inherit', resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button type="button" onClick={kiAufraeumen} disabled={busy !== null || !kiText.trim()} style={{ ...styles.btnRand, fontSize: 13 }}>
                          ✨ Aufräumen und einlesen
                        </button>
                        <span style={{ color: C.dim, fontSize: 12.5 }}>{kiStand ?? `${zahlDe(kiText.length)} Zeichen`}</span>
                      </div>
                    </>)}
                  </div>
                );
              })()}
            </div>
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
              erkannt wurde, ist schon eingestellt. Spalten auf „— nicht übernehmen“ stehen mit Grund im Prüfergebnis.
            </p>

            {offenePflicht.length > 0 && (
              <div style={styles.warnKasten}>
                ⚠️ Pflichtfeld noch nicht zugeordnet: <b>{offenePflicht.map((f) => f.label).join(', ')}</b>.
                Ohne dieses Feld kann nicht importiert werden.
              </div>
            )}
            <div style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.55, marginBottom: 10 }}>
              {katalog?.ausDb
                ? <>✓ Feldliste aus Ihrer Datenbank ({ziel.felder.length} Felder{katalog.zusatz.length > 0 ? `, davon ${katalog.zusatz.length} nur in Ihrer Datenbank` : ''}).</>
                : <>ℹ️ Feldliste ohne Datenbank-Abgleich (Datenbank-Update „p124-import-motor“ fehlt noch) — neue Felder wie Kundennummer und Adresse erscheinen danach.</>}
              {' '}Spalten ohne passendes Feld werden als <b style={{ color: C.text }}>Eigenes Feld</b> übernommen — sie erscheinen danach im Modul unter „⚙️ Eigene Felder“.
              {datei.datev && <> <b style={{ color: C.gold }}>DATEV-Format erkannt.</b></>}
            </div>

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
                    const leer = spalteLeer(datei.zeilen, i);
                    // Leere Spalten nur auf Wunsch zeigen — bei DATEV sind es Hunderte.
                    const sperre = sperrGrund(spalte, ziel);
                    if (leer && !spaltenOffen && !sperre) return null;
                    const beispiele = istBankSpalte(spalte) ? [] : datei.zeilen.slice(0, 3).map((z) => (z[i] ?? '').trim()).filter(Boolean);
                    const gewaehlt = mapping[spalte] ?? '';
                    const feldDef = ziel.felder.find((f) => f.key === gewaehlt);
                    const bank = istBankSpalte(spalte);
                    return (
                      <tr key={spalte + i}>
                        <td style={styles.td}><b>{spalte}</b></td>
                        <td style={{ ...styles.td, color: C.dim, fontSize: 12.5 }}>
                          {bank ? <i>ausgeblendet (Bankdaten)</i> : beispiele.length ? beispiele.join(' · ') : <i>leer</i>}
                        </td>
                        <td style={styles.td}>
                          {sperre ? (
                            <div style={{ color: C.warn, fontSize: 12.5, lineHeight: 1.5 }}>🔒 nicht übernommen — {sperre}</div>
                          ) : (
                            <>
                              <select value={gewaehlt} onChange={(e) => feldSetzen(spalte, e.target.value)} style={styles.select}>
                                <option value={NICHT}>— nicht übernehmen</option>
                                <option value={EIGEN}>➕ als Eigenes Feld „{spalte.slice(0, 40)}“</option>
                                {ziel.felder.map((f) => (
                                  <option key={f.key} value={f.key}>{f.label}{f.pflicht ? ' *' : ''}</option>
                                ))}
                              </select>
                              {feldDef?.hinweis && <div style={{ color: C.dim, fontSize: 11.5, marginTop: 4 }}>{feldDef.hinweis}</div>}
                              {gewaehlt === NICHT && (
                                <div style={{ color: leer ? C.dim : C.warn, fontSize: 11.5, marginTop: 4 }}>
                                  {leer ? GRUND.leer : 'Wird nicht übernommen und steht so im Bericht. Lieber als Eigenes Feld behalten?'}
                                </div>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {datei.kopf.some((_, i) => spalteLeer(datei.zeilen, i)) && (
              <button type="button" onClick={() => setSpaltenOffen((o) => !o)} style={{ ...styles.linkKnopf, marginTop: 8 }}>
                {spaltenOffen ? 'Leere Spalten ausblenden' : `${datei.kopf.filter((_, i) => spalteLeer(datei.zeilen, i)).length} leere Spalten zeigen`}
              </button>
            )}

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

            {bilanz && <SpaltenBilanzKasten bilanz={bilanz} />}

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

            {erkennungsFelder(ziel).length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ color: C.dim, fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                  Wenn ein Eintrag schon vorhanden ist (erkannt über {erkennungsFelder(ziel).map((k) => ziel.felder.find((f) => f.key === k)?.label ?? k).join(' oder ')}):
                </div>
                {ziel.nurNeu ? (
                  <div style={{ color: C.dim, fontSize: 13 }}>Vorhandene Einträge werden hier nie überschrieben — sie werden übersprungen.</div>
                ) : (
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
                )}
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
                      {ziel?.bestandSetzen
                        ? 'Weitermachen: dieselbe Datei noch einmal importieren — was schon gebucht ist, stimmt dann und wird übersprungen.'
                        : ziel?.kinder
                        ? 'Weitermachen: dieselbe Datei noch einmal importieren — schon übernommene Bestellungen werden an der Bestellnummer erkannt und übersprungen.'
                        : ziel && erkennungsFelder(ziel).length > 0
                        ? `Weitermachen: dieselbe Datei noch einmal importieren (Einstellung „Überspringen") — schon Übernommenes wird über „${erkennungsFelder(ziel).map((k) => ziel.felder.find((f) => f.key === k)?.label ?? k).join('" oder „')}" erkannt und nicht doppelt angelegt.`
                        : 'Diese Liste hat kein Erkennungsmerkmal. Zum Weitermachen den Import unten rückgängig machen und neu starten — sonst entstehen Doppelte.'}
                    </div>
                  )}
                </div>
              );
            })()}
            {(ergebnis.kundeVerknuepft > 0 || ergebnis.kundeOhne > 0) && (
              <div style={{ ...styles.hinweisKasten, marginBottom: 10 }}>
                <b style={{ color: C.text }}>Verknüpft mit {ziel?.kundeVerweis?.label ?? 'Kunde'}:</b> {zahlDe(ergebnis.kundeVerknuepft)}{ziel?.kinder ? ' Bestellungen' : ''}
                {ergebnis.kundeOhne > 0 && <> · <span style={{ color: C.warn }}>{zahlDe(ergebnis.kundeOhne)} ohne {ziel?.kundeVerweis?.label ?? 'Kunde'}</span></>}
                {ergebnis.kundeHinweise.slice(0, 8).map((t, i) => <div key={i} style={{ color: C.warn, marginTop: 3, fontSize: 12.5 }}>⚠ {t}</div>)}
                {ergebnis.kundeHinweise.length > 8 && <div style={{ marginTop: 3, fontSize: 12.5 }}>… und {ergebnis.kundeHinweise.length - 8} weitere.</div>}
              </div>
            )}
            {(ergebnis.zusammenfassung || (ergebnis.zusatzHinweise?.length ?? 0) > 0) && (
              <div style={{ ...styles.hinweisKasten, marginTop: 10, marginBottom: 10 }}>
                {ergebnis.zusammenfassung && <b style={{ color: C.text }}>{ergebnis.zusammenfassung}</b>}
                {(ergebnis.zusatzHinweise ?? []).slice(0, 12).map((t, i) => <div key={i} style={{ color: C.warn, marginTop: 3, fontSize: 12.5 }}>⚠ {t}</div>)}
                {(ergebnis.zusatzHinweise?.length ?? 0) > 12 && <div style={{ marginTop: 3, fontSize: 12.5 }}>… und {(ergebnis.zusatzHinweise?.length ?? 0) - 12} weitere (im Fehlerbericht).</div>}
              </div>
            )}
            {(ergebnis.eigeneWerte > 0 || ergebnis.eigeneAlsNotiz > 0 || ergebnis.eigeneFehler.length > 0) && (
              <div style={{ ...styles.hinweisKasten, marginBottom: 10 }}>
                <b style={{ color: C.text }}>Eigene Felder:</b>{' '}
                {zahlDe(ergebnis.eigeneWerte)} Werte gespeichert
                {ergebnis.eigeneFelderNeu > 0 && ` · ${zahlDe(ergebnis.eigeneFelderNeu)} Felder neu angelegt`}
                {ergebnis.eigeneAlsNotiz > 0 && ` · bei ${zahlDe(ergebnis.eigeneAlsNotiz)} Einträgen in die Notizen geschrieben`}
                {ergebnis.eigeneFehler.slice(0, 5).map((t, i) => <div key={i} style={{ color: C.warn, marginTop: 4 }}>⚠ {t}</div>)}
              </div>
            )}
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
                            : z?.bestandSetzen ? (j.zeilen_ok > 0 ? (
                              <button type="button" disabled={busy !== null} onClick={() => rueckgaengigBestand(j)}
                                style={{ background: 'transparent', border: `1px solid ${C.danger}`, color: C.danger, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12.5 }}>
                                ↺ {j.zeilen_ok} Bestände zurücksetzen
                              </button>
                            ) : <span style={{ color: C.dim }}>—</span>)
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
                    {s.motor ? (
                      <button
                        type="button"
                        onClick={() => { zielWaehlen(s.motor as string); try { document.getElementById('import-ziel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* egal */ } }}
                        style={{ ...styles.btnZiel, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Hier importieren ›
                      </button>
                    ) : (
                      <a href={s.zielHref} style={styles.btnZiel}>Zum Import ›</a>
                    )}
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

// ============================================================================
// Schritt 2: „Aus welchem System ziehen Sie um?"
// ============================================================================

function AltsystemKarte(p: {
  wahl: Wahl;
  offen: boolean; setOffen: (v: boolean) => void;
  suche: string; setSuche: (v: string) => void;
  anleitungOffen: string | null; setAnleitungOffen: (v: string | null) => void;
  umschalten: (key: string) => void;
  ausblenden: (key: string) => void;
  nurMeine: (v: boolean) => void;
  allesZeigen: () => void;
  importieren: (system: string, ziel: string) => void;
  gemerktIn: 'betrieb' | 'browser';
}) {
  const meine = p.wahl.systeme.map((k) => altsystem(k)).filter((x): x is Altsystem => !!x);
  const sichtbar = sucheAltsysteme(sichtbareAltsysteme(ALTSYSTEME, p.wahl, p.wahl.nur_meine), p.suche);
  const gruppen = gruppiereAltsysteme(sichtbar);
  const kpi = zaehleAltsysteme();
  const zielName: Record<string, string> = { kontakte: 'Kunden', lieferanten: 'Lieferanten', artikel: 'Artikel', rechnungen: 'Offene Posten' };

  return (
    <div style={{ ...styles.stufe, borderColor: meine.length > 0 ? 'rgba(0,229,255,0.35)' : C.border }}>
      <div style={styles.stufenTitel}>🧭 Aus welchem System ziehen Sie um?</div>
      <p style={styles.stufenText}>
        Haken Sie Ihre bisherigen Programme an — Sie bekommen je Programm eine Schritt-für-Schritt-Anleitung für den
        Export, und ARGONAUT erkennt die Spalten dieser Programme beim Einlesen zuerst. Fremde Programme können Sie
        ausblenden. {p.gemerktIn === 'betrieb' ? 'Ihre Auswahl gilt für den ganzen Betrieb.' : 'Ihre Auswahl wird in diesem Browser gemerkt.'}
      </p>

      {meine.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {meine.map((sys) => {
            const a = anleitung(sys);
            const sperre = sperrText(sys);
            const auf = p.anleitungOffen === sys.key;
            return (
              <div key={sys.key} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', background: 'rgba(10,22,40,0.5)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 14.5 }}>{sys.name}</b>
                  <span style={{ color: C.dim, fontSize: 12.5 }}>{sys.daten}</span>
                  {!a.belegt && <span style={styles.marke}>Export beim Hersteller erfragen</span>}
                  {sys.datev && <span style={{ ...styles.marke, color: C.cyan, borderColor: 'rgba(0,229,255,0.4)' }}>DATEV-Format</span>}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => p.setAnleitungOffen(auf ? null : sys.key)} style={styles.linkKnopf}>
                      {auf ? 'Anleitung zu' : 'Anleitung ›'}
                    </button>
                    <button type="button" onClick={() => p.umschalten(sys.key)} style={{ ...styles.linkKnopf, color: C.dim }} title="Aus meiner Liste nehmen">✕</button>
                  </span>
                </div>
                {auf && (
                  <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.6 }}>
                    {sperre && <div style={{ ...styles.warnKasten, margin: '0 0 10px' }}>🔒 {sperre}</div>}
                    <ol style={{ margin: '0 0 8px', paddingLeft: 20 }}>
                      {a.schritte.map((t, i) => <li key={i} style={{ marginBottom: 3 }}>{t}</li>)}
                    </ol>
                    {(sys.hinweise ?? []).map((h, i) => <div key={i} style={{ color: C.warn, fontSize: 12.5 }}>⚠ {h}</div>)}
                    {sys.formate.length > 0 && <div style={{ color: C.dim, fontSize: 12.5, marginTop: 4 }}>Formate: {sys.formate.join(' · ')}</div>}
                    {sys.quelle && (
                      <div style={{ color: C.dim, fontSize: 11.5, marginTop: 2 }}>
                        Quelle: {sys.quelle}{sys.drittquelle ? ' (nicht vom Hersteller — bitte gegenprüfen)' : ' (Hilfe des Herstellers)'}
                      </div>
                    )}
                    {!sperre && sys.ziele.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        {sys.ziele.map((z) => (
                          <button key={z} type="button" onClick={() => p.importieren(sys.key, z)} style={{ ...styles.btnRand, fontSize: 12.5, padding: '7px 11px', borderColor: C.cyan, color: C.cyan }}>
                            📥 {zielName[z] ?? z} aus {sys.name} importieren
                          </button>
                        ))}
                      </div>
                    )}
                    {!sperre && sys.ziele.length === 0 && (
                      <div style={{ color: C.dim, fontSize: 12.5, marginTop: 6 }}>
                        Diese Daten übernimmt ARGONAUT in einem späteren Schritt des Umzugs (Termine, Projekte, Mitarbeiter).
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => p.setOffen(!p.offen)} style={styles.btnRand}>
          {p.offen ? 'Liste schließen' : meine.length > 0 ? 'Weitere Programme anhaken' : `Programme anhaken (${kpi.gesamt} zur Auswahl)`}
        </button>
        {p.offen && (
          <>
            <input value={p.suche} onChange={(e) => p.setSuche(e.target.value)} placeholder="🔍 Programm suchen …" style={{ ...styles.eingabe, flex: '1 1 200px' }} />
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: C.dim, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={p.wahl.nur_meine} onChange={(e) => p.nurMeine(e.target.checked)} /> nur meine zeigen
            </label>
            {p.wahl.ausgeblendet.length > 0 && (
              <button type="button" onClick={p.allesZeigen} style={styles.linkKnopf}>{p.wahl.ausgeblendet.length} ausgeblendete wieder zeigen</button>
            )}
          </>
        )}
      </div>

      {p.offen && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: C.dim, fontSize: 12, marginBottom: 8 }}>
            {kpi.gesamt} Programme · {kpi.belegt} mit belegter Export-Anleitung · {kpi.datev} mit DATEV-Format. Klick = anhaken, ✕ = ausblenden.
          </div>
          {gruppen.length === 0 && <div style={{ color: C.dim, fontSize: 13 }}>Kein Programm passt. Nicht dabei? Dann „Excel / eigene Listen“ anhaken — jede Liste mit Überschriften geht.</div>}
          {gruppen.map((g) => (
            <div key={g.key} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{g.icon} {g.label}</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {g.systeme.map((sys) => {
                  const an = p.wahl.systeme.includes(sys.key);
                  return (
                    <span key={sys.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <button type="button" onClick={() => p.umschalten(sys.key)} style={an ? styles.chipAktiv : styles.chip} title={istBelegt(sys) ? sys.daten : 'Export-Weg beim Hersteller erfragen'}>
                        {an ? '✓ ' : ''}{sys.name}{!istBelegt(sys) ? ' ?' : ''}
                      </button>
                      {!an && (
                        <button type="button" onClick={() => p.ausblenden(sys.key)} style={{ ...styles.linkKnopf, color: C.dim, padding: '0 4px' }} title="Nicht mein Programm — ausblenden">✕</button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Wohin ging jede Spalte? Feld · Eigenes Feld · nicht übernommen (mit Grund). */
function SpaltenBilanzKasten({ bilanz }: { bilanz: SpaltenBilanz }) {
  const [offen, setOffen] = useState(false);
  const eigen = bilanz.eintraege.filter((e) => e.art === 'eigen');
  const nicht = bilanz.eintraege.filter((e) => e.art === 'nicht');
  const nichtOhneLeer = nicht.filter((e) => e.grund !== GRUND.leer);
  const leer = nicht.length - nichtOhneLeer.length;
  return (
    <div style={{ ...styles.hinweisKasten, marginBottom: 12 }}>
      <b style={{ color: C.text }}>Spalten-Bilanz:</b> {bilanz.gesamt} Spalten = {bilanz.feld} in Feldern
      + {bilanz.eigen} als Eigene Felder + {bilanz.nicht} nicht übernommen
      {' · '}<b style={{ color: bilanz.verschluckt === 0 ? C.green : C.danger }}>{bilanz.verschluckt} verschluckt</b>
      {(eigen.length > 0 || nicht.length > 0) && (
        <button type="button" onClick={() => setOffen(!offen)} style={{ ...styles.linkKnopf, marginLeft: 8 }}>{offen ? 'zu' : 'Einzelheiten ›'}</button>
      )}
      {offen && (
        <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.7 }}>
          {eigen.length > 0 && <div><b style={{ color: C.cyan }}>Als Eigene Felder:</b> {eigen.map((e) => e.spalte).join(' · ')}</div>}
          {nichtOhneLeer.map((e) => (
            <div key={e.spalte} style={{ color: C.warn }}>✕ „{e.spalte}“ nicht übernommen, weil: {e.grund}</div>
          ))}
          {leer > 0 && <div>{leer} Spalten sind in allen Zeilen leer und werden deshalb nicht übernommen.</div>}
        </div>
      )}
    </div>
  );
}

/** Wohin nach dem Import geschaut wird. */
function katalogZiel(zielKey: string): string {
  const eigen = zielDef(zielKey)?.ergebnisHref;
  if (eigen) return eigen;
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
  linkKnopf: { background: 'transparent', border: 'none', color: C.cyan, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, padding: 0, fontFamily: 'inherit' },
  marke: { fontSize: 11, fontWeight: 800, color: C.warn, border: '1px solid rgba(224,162,76,0.45)', borderRadius: 999, padding: '2px 8px' },
  btnZiel: { color: C.navy, background: C.cyan, textDecoration: 'none', fontWeight: 700, fontSize: 13, borderRadius: 9, padding: '7px 12px', marginLeft: 'auto' },
  leer: { marginTop: 24, background: C.navy2, border: `1px dashed ${C.border}`, borderRadius: 14, padding: '36px 20px', textAlign: 'center', color: C.dim },
};
