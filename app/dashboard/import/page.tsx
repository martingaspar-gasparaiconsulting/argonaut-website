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

import { useMemo, useState, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { importQuellen, sucheImporte, gruppiereImporte, zaehleImporte } from '@/lib/importKatalog';
import {
  ZIELE, zielDef, errateMapping, fehlendePflichtfelder, pruefeAlles,
  type Mapping, type PruefBericht, type ZeilenFehler,
} from '@/lib/importParser';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)',
  danger: '#E06666', warn: '#E0A24C',
};

const BATCH = 100;                 // so viele Zeilen gehen pro Schreibvorgang raus
const MAX_FEHLER_ANZEIGE = 50;

type Datei = {
  dateiname: string;
  blatt: string | null;
  trennzeichen: string;
  kopf: string[];
  zeilen: string[][];
  abgeschnitten: number;
};

type ImportErgebnis = {
  angelegt: number;
  aktualisiert: number;
  uebersprungen: number;
  fehlgeschlagen: number;
  fehler: ZeilenFehler[];
};

export default function ImportCenterPage() {
  // --- Stufe 1: Katalog (unveraendert) -------------------------------------
  const [suche, setSuche] = useState('');
  const alle = useMemo(() => importQuellen(), []);
  const gefiltert = useMemo(() => sucheImporte(alle, suche), [alle, suche]);
  const gruppen = useMemo(() => gruppiereImporte(gefiltert), [gefiltert]);
  const kpi = useMemo(() => zaehleImporte(alle), [alle]);

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

  const ziel = useMemo(() => (zielKey ? zielDef(zielKey) : undefined), [zielKey]);
  const offenePflicht = useMemo(() => (zielKey ? fehlendePflichtfelder(mapping, zielKey) : []), [mapping, zielKey]);

  function zuruecksetzen(behalteZiel = false) {
    if (!behalteZiel) setZielKey('');
    setDatei(null); setMapping({}); setBericht(null); setErgebnis(null);
    setFehler(null); setHinweis(null);
  }

  function zielWaehlen(key: string) {
    setZielKey(key);
    setDatei(null); setMapping({}); setBericht(null); setErgebnis(null); setFehler(null); setHinweis(null);
  }

  // --- Datei einlesen -------------------------------------------------------
  async function dateiLesen(f: File) {
    if (!zielKey) return;
    setBusy('lesen'); setFehler(null); setHinweis(null); setBericht(null); setErgebnis(null);
    try {
      const form = new FormData();
      form.append('datei', f);
      const antwort = await fetch('/api/import/lesen', { method: 'POST', body: form });
      const daten = await antwort.json() as { ok: boolean; error?: string } & Partial<Datei>;
      if (!antwort.ok || !daten.ok) throw new Error(daten.error || 'Die Datei konnte nicht gelesen werden.');

      const neu: Datei = {
        dateiname: daten.dateiname ?? f.name,
        blatt: daten.blatt ?? null,
        trennzeichen: daten.trennzeichen ?? '',
        kopf: daten.kopf ?? [],
        zeilen: daten.zeilen ?? [],
        abgeschnitten: daten.abgeschnitten ?? 0,
      };
      setDatei(neu);
      setMapping(errateMapping(neu.kopf, zielKey));

      const erkannt = Object.values(errateMapping(neu.kopf, zielKey)).filter(Boolean).length;
      setHinweis(`${neu.zeilen.length} Zeilen gelesen · ${erkannt} von ${neu.kopf.length} Spalten automatisch erkannt. Bitte kurz prüfen.`);
      if (neu.abgeschnitten > 0) {
        setHinweis((h) => `${h ?? ''} Achtung: ${neu.abgeschnitten} weitere Zeilen wurden abgeschnitten — bitte in einem zweiten Durchgang importieren.`);
      }
    } catch (err: unknown) {
      setFehler(err instanceof Error ? err.message : 'Die Datei konnte nicht gelesen werden.');
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
      setBericht(pruefeAlles(zielKey, mapping, datei.kopf, datei.zeilen));
      setErgebnis(null);
    } catch (err: unknown) {
      setFehler('Prüfung fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  // --- Importieren ----------------------------------------------------------
  async function importieren() {
    if (!datei || !ziel || !bericht || bericht.gut === 0) return;
    if (typeof window !== 'undefined' && !window.confirm(
      `${bericht.gut} Datensätze werden jetzt in „${ziel.label}" geschrieben. Fortfahren?`
    )) return;

    setBusy('import'); setFehler(null);
    const start = new Date();
    const erg: ImportErgebnis = { angelegt: 0, aktualisiert: 0, uebersprungen: 0, fehlgeschlagen: 0, fehler: [] };

    try {
      const { data: nutzer } = await supabase.auth.getUser();
      const uid = nutzer?.user?.id;
      if (!uid) throw new Error('Nicht angemeldet.');

      // Bereits vorhandene Schlüssel laden — damit nichts doppelt entsteht.
      const vorhanden = new Map<string, string>();
      if (ziel.schluessel) {
        // Der dynamische Spaltenname laesst sich vom Supabase-Typparser nicht
        // aufloesen — deshalb der Umweg ueber unknown.
        const { data: alt } = await supabase.from(ziel.tabelle).select(`id,${ziel.schluessel}`).limit(20000);
        for (const z of ((alt ?? []) as unknown as Record<string, unknown>[])) {
          const s = String(z[ziel.schluessel] ?? '').trim().toLowerCase();
          if (s) vorhanden.set(s, String(z.id));
        }
      }

      const neu: Record<string, unknown>[] = [];
      const zuAendern: { id: string; werte: Record<string, unknown> }[] = [];

      bericht.saetze.forEach((satz) => {
        const s = ziel.schluessel ? String(satz[ziel.schluessel] ?? '').trim().toLowerCase() : '';
        const treffer = s ? vorhanden.get(s) : undefined;
        if (treffer) {
          if (beiDublette === 'aktualisieren') zuAendern.push({ id: treffer, werte: satz });
          else erg.uebersprungen++;
          return;
        }
        neu.push({ ...satz, owner_user_id: uid });
      });

      // Neue Datensätze in Stapeln. Scheitert ein Stapel, wird er Zeile für Zeile
      // wiederholt — nur so weiß man am Ende, WELCHE Zeile das Problem war.
      for (let i = 0; i < neu.length; i += BATCH) {
        const stapel = neu.slice(i, i + BATCH);
        const { error } = await supabase.from(ziel.tabelle).insert(stapel);
        if (!error) { erg.angelegt += stapel.length; continue; }

        for (let j = 0; j < stapel.length; j++) {
          const einzeln = stapel[j];
          const { error: e2 } = await supabase.from(ziel.tabelle).insert(einzeln);
          if (e2) {
            erg.fehlgeschlagen++;
            erg.fehler.push({
              zeile: i + j + 2,
              feld: ziel.schluessel ? String(einzeln?.[ziel.schluessel] ?? '') : '',
              meldung: e2.message,
            });
          } else erg.angelegt++;
        }
      }

      for (const a of zuAendern) {
        const { error } = await supabase.from(ziel.tabelle).update(a.werte).eq('id', a.id);
        if (error) { erg.fehlgeschlagen++; erg.fehler.push({ zeile: 0, feld: '', meldung: error.message }); }
        else erg.aktualisiert++;
      }

      // Protokoll schreiben — inklusive Zuordnung, damit sie wiederverwendbar ist.
      await supabase.from('import_jobs').insert({
        owner_user_id: uid,
        ziel: zielKey,
        dateiname: datei.dateiname,
        status: erg.fehlgeschlagen > 0 ? 'teilweise' : 'fertig',
        kopfzeilen: datei.kopf,
        mapping,
        zeilen_gesamt: bericht.gesamt,
        zeilen_ok: erg.angelegt + erg.aktualisiert,
        zeilen_fehler: erg.fehlgeschlagen + bericht.schlecht,
        fehler: [...bericht.fehler, ...erg.fehler].slice(0, 500),
        beendet_am: new Date().toISOString(),
      });

      setErgebnis(erg);
      setHinweis(`Import abgeschlossen in ${Math.max(1, Math.round((Date.now() - start.getTime()) / 1000))} Sekunden.`);
    } catch (err: unknown) {
      setFehler('Import fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
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
    const text = [kopf, ...zeilen.map((z) => `${z.art};${z.zeile};"${String(z.feld).replace(/"/g, '""')}";"${String(z.meldung).replace(/"/g, '""')}"`)].join('\r\n');
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
              Ihre Datei wird nur gelesen und <b style={{ color: C.text }}>nicht gespeichert</b>.
            </p>
            <input
              type="file" accept=".csv,.txt,.xlsx,.xlsm,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) dateiLesen(f); e.target.value = ''; }}
              disabled={busy !== null}
              style={styles.dateiFeld}
            />
            {busy === 'lesen' && <div style={{ color: C.cyan, fontSize: 13.5, marginTop: 8 }}>Datei wird gelesen …</div>}
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

            <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                type="button" onClick={importieren}
                disabled={busy !== null || bericht.gut === 0 || ergebnis !== null}
                style={{ ...styles.btnGold, opacity: busy !== null || bericht.gut === 0 || ergebnis !== null ? 0.5 : 1 }}
              >
                {busy === 'import' ? 'Importiert …' : ergebnis ? 'Import erledigt' : `${bericht.gut} Datensätze jetzt importieren`}
              </button>
              {(bericht.fehler.length > 0 || bericht.warnungen.length > 0) && (
                <button type="button" onClick={fehlerHerunterladen} style={styles.btnRand}>⬇ Bericht als CSV</button>
              )}
            </div>
          </div>
        )}

        {/* --- Ergebnis --- */}
        {ergebnis && (
          <div style={{ ...styles.stufe, borderColor: 'rgba(76,175,125,0.45)' }}>
            <div style={{ ...styles.stufenTitel, color: C.green }}>✓ Import abgeschlossen</div>
            <div style={styles.zahlenReihe}>
              <Zahl wert={ergebnis.angelegt} label="neu angelegt" farbe={C.green} />
              <Zahl wert={ergebnis.aktualisiert} label="aktualisiert" farbe={C.cyan} />
              <Zahl wert={ergebnis.uebersprungen} label="übersprungen" farbe={C.dim} />
              <Zahl wert={ergebnis.fehlgeschlagen} label="fehlgeschlagen" farbe={ergebnis.fehlgeschlagen > 0 ? C.danger : C.dim} />
            </div>
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

      <input
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        placeholder="🔍 Suchen … (z. B. Kontakte, Lieferanten, Räume)"
        style={styles.suche}
      />

      {gruppen.length === 0 ? (
        <div style={styles.leer}>Keine Import-Quelle passt zur Suche.</div>
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
                    {s.vorlage ? (
                      <a href={s.vorlage} download style={styles.btnVorlage}>⬇ Vorlage</a>
                    ) : (
                      <span style={styles.keineVorlage}>eigener Import</span>
                    )}
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

  dateiFeld: { width: '100%', boxSizing: 'border-box', background: 'rgba(10,22,40,0.7)', border: `1px dashed ${C.border}`, borderRadius: 10, padding: '14px', color: C.text, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' },
  dateiInfo: { marginTop: 10, color: C.dim, fontSize: 13 },

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
