'use client';

// ============================================================
// ARGONAUT OS · Modul D+ · Block D+.3 · Leistungskatalog-Verwaltung
// Die Werkstatt legt ihre eigenen Arbeitswerte an — selbst ODER per CSV-Import.
// Erfassungsart Minuten/Stunden/AW konfigurierbar, AW-Faktor werkstatt-eigen.
// Bestätigung vor jedem DB-Schreiben. Design 1:1 wie das übrige Dashboard.
// Pfad: app/dashboard/leistungskatalog/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import { nachMinuten, zeitText, eur, type KatalogEintrag } from '../_components/leistungLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

type KatalogRow = KatalogEintrag & {
  id: string;
  owner_user_id: string;
  aktiv: boolean;
  notiz: string | null;
};

const ART_OPTIONEN = [
  { wert: 'stunden', label: 'Stunden' },
  { wert: 'minuten', label: 'Minuten' },
  { wert: 'aw', label: 'AW / Einheiten' },
];
function artLabel(a: string | null | undefined): string {
  return ART_OPTIONEN.find((o) => o.wert === a)?.label || a || '—';
}

// --- Formular -----------------------------------------------------------
type Form = {
  id: string | null;
  bezeichnung: string; kuerzel: string; kategorie: string;
  erfassungsart: string; standard_wert: string; aw_minuten: string;
  stundensatz_netto: string; festpreis_netto: string; notiz: string;
};
const LEER: Form = {
  id: null, bezeichnung: '', kuerzel: '', kategorie: '',
  erfassungsart: 'stunden', standard_wert: '1', aw_minuten: '6',
  stundensatz_netto: '', festpreis_netto: '', notiz: '',
};

function num(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function LeistungskatalogPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [liste, setListe] = useState<KatalogRow[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kategorieFilter, setKategorieFilter] = useState('alle');

  const [modalAuf, setModalAuf] = useState(false);
  const [form, setForm] = useState<Form>(LEER);
  const [speichert, setSpeichert] = useState(false);

  // CSV-Import
  const [impOffen, setImpOffen] = useState(false);
  const [impZeilen, setImpZeilen] = useState<string[][]>([]);
  const [impHeader, setImpHeader] = useState(true);
  const [impMap, setImpMap] = useState<Record<string, number>>({ bezeichnung: -1, kategorie: -1, erfassungsart: -1, standard_wert: -1, stundensatz: -1 });
  const [impFehler, setImpFehler] = useState<string | null>(null);
  const [impSpeichert, setImpSpeichert] = useState(false);
  const [impFertig, setImpFertig] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
    })();
  }, []);

  const laden_ = useCallback(async () => {
    if (!uid) return;
    setLaden(true); setFehler(null);
    try {
      const { data, error } = await supabase.from('leistungskatalog')
        .select('*').eq('owner_user_id', uid)
        .order('kategorie', { ascending: true }).order('bezeichnung', { ascending: true });
      if (error) throw error;
      setListe((data as KatalogRow[]) ?? []);
    } catch (e: unknown) {
      setFehler('Katalog konnte nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid]);

  useEffect(() => { void laden_(); }, [laden_]);

  const kategorien = useMemo(() => {
    const s = new Set<string>();
    liste.forEach((k) => { if (k.kategorie) s.add(k.kategorie); });
    return Array.from(s).sort();
  }, [liste]);

  const gefiltert = useMemo(() => {
    if (kategorieFilter === 'alle') return liste;
    return liste.filter((k) => (k.kategorie || '') === kategorieFilter);
  }, [liste, kategorieFilter]);

  // --- Anlegen / Bearbeiten ---------------------------------------------
  function neu() { setForm(LEER); setModalAuf(true); }
  function bearbeiten(k: KatalogRow) {
    setForm({
      id: k.id, bezeichnung: k.bezeichnung ?? '', kuerzel: k.kuerzel ?? '', kategorie: k.kategorie ?? '',
      erfassungsart: k.erfassungsart ?? 'stunden', standard_wert: String(k.standard_wert ?? 1),
      aw_minuten: String(k.aw_minuten ?? 6),
      stundensatz_netto: k.stundensatz_netto != null ? String(k.stundensatz_netto) : '',
      festpreis_netto: k.festpreis_netto != null ? String(k.festpreis_netto) : '',
      notiz: k.notiz ?? '',
    });
    setModalAuf(true);
  }
  function setF<K extends keyof Form>(k: K, v: Form[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function speichern() {
    if (!uid) return;
    if (!form.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung eingeben.'); return; }
    const istNeu = !form.id;
    if (!window.confirm(istNeu ? `Neue Leistung anlegen?\n\n• ${form.bezeichnung}` : `Änderungen an "${form.bezeichnung}" speichern?`)) return;

    setSpeichert(true); setFehler(null);
    try {
      const payload = {
        owner_user_id: uid,
        bezeichnung: form.bezeichnung.trim(),
        kuerzel: form.kuerzel.trim() || null,
        kategorie: form.kategorie.trim() || null,
        erfassungsart: form.erfassungsart,
        standard_wert: num(form.standard_wert) ?? 1,
        aw_minuten: form.erfassungsart === 'aw' ? (num(form.aw_minuten) ?? 6) : null,
        stundensatz_netto: num(form.stundensatz_netto),
        festpreis_netto: num(form.festpreis_netto),
        notiz: form.notiz.trim() || null,
        aktualisiert_am: new Date().toISOString(),
      };
      if (istNeu) {
        const { error } = await supabase.from('leistungskatalog').insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('leistungskatalog').update(payload).eq('id', form.id);
        if (error) throw error;
      }
      setModalAuf(false); setForm(LEER);
      await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }
  async function archivieren(k: KatalogRow) {
    if (!window.confirm(`Leistung "${k.bezeichnung}" deaktivieren?\n\nSie bleibt erhalten, erscheint aber nicht mehr zur Auswahl.`)) return;
    try {
      const { error } = await supabase.from('leistungskatalog')
        .update({ aktiv: false, aktualisiert_am: new Date().toISOString() }).eq('id', k.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) {
      setFehler('Deaktivieren fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }
  async function aktivieren(k: KatalogRow) {
    try {
      const { error } = await supabase.from('leistungskatalog')
        .update({ aktiv: true, aktualisiert_am: new Date().toISOString() }).eq('id', k.id);
      if (error) throw error;
      await laden_();
    } catch { /* still */ }
  }

  // --- CSV-Import -------------------------------------------------------
  function csvParse(text: string, delim: string): string[][] {
    const zeilen: string[][] = [];
    let feld = '', zeile: string[] = [], inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuote) {
        if (c === '"') { if (text[i + 1] === '"') { feld += '"'; i++; } else inQuote = false; }
        else feld += c;
      } else {
        if (c === '"') inQuote = true;
        else if (c === delim) { zeile.push(feld); feld = ''; }
        else if (c === '\n') { zeile.push(feld); zeilen.push(zeile); zeile = []; feld = ''; }
        else if (c === '\r') { /* skip */ }
        else feld += c;
      }
    }
    if (feld.length > 0 || zeile.length > 0) { zeile.push(feld); zeilen.push(zeile); }
    return zeilen.filter((z) => z.some((f) => f.trim() !== ''));
  }
  function rateMap(header: string[]): Record<string, number> {
    const m: Record<string, number> = { bezeichnung: -1, kategorie: -1, erfassungsart: -1, standard_wert: -1, stundensatz: -1 };
    header.forEach((h, i) => {
      const t = h.toLowerCase();
      if (m.bezeichnung === -1 && (t.includes('bezeich') || t.includes('leistung') || t === 'name')) m.bezeichnung = i;
      else if (m.kategorie === -1 && (t.includes('kategor') || t.includes('gruppe'))) m.kategorie = i;
      else if (m.erfassungsart === -1 && (t.includes('art') || t.includes('einheit'))) m.erfassungsart = i;
      else if (m.standard_wert === -1 && (t.includes('wert') || t.includes('zeit') || t.includes('dauer') || t.includes('aw'))) m.standard_wert = i;
      else if (m.stundensatz === -1 && (t.includes('satz') || t.includes('preis') || t.includes('stunden'))) m.stundensatz = i;
    });
    return m;
  }
  function impOeffnen() {
    setImpOffen(true); setImpZeilen([]); setImpHeader(true); setImpFehler(null); setImpFertig(0);
    setImpMap({ bezeichnung: -1, kategorie: -1, erfassungsart: -1, standard_wert: -1, stundensatz: -1 });
  }
  function impDatei(datei: File | null) {
    if (!datei) return;
    setImpFehler(null); setImpFertig(0);
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result || '');
      const erste = text.split('\n')[0] || '';
      const delim = (erste.match(/;/g) || []).length > (erste.match(/,/g) || []).length ? ';' : ',';
      const zeilen = csvParse(text, delim);
      if (zeilen.length === 0) { setImpFehler('Keine lesbaren Zeilen in der Datei.'); return; }
      setImpZeilen(zeilen); setImpHeader(true); setImpMap(rateMap(zeilen[0]));
    };
    r.onerror = () => setImpFehler('Datei konnte nicht gelesen werden.');
    r.readAsText(datei, 'UTF-8');
  }
  function erkenneArt(s: string): string {
    const t = (s || '').toLowerCase();
    if (t.includes('aw') || t.includes('einheit')) return 'aw';
    if (t.includes('min')) return 'minuten';
    return 'stunden';
  }
  async function impStart(header: string[], daten: string[][]) {
    if (!uid) return;
    setImpSpeichert(true); setImpFehler(null);
    const val = (row: string[], i: number) => (i >= 0 && i < row.length ? (row[i] || '').trim() : '');
    const neu: Record<string, unknown>[] = [];
    for (const row of daten) {
      const bez = val(row, impMap.bezeichnung);
      if (!bez) continue;
      const art = impMap.erfassungsart >= 0 ? erkenneArt(val(row, impMap.erfassungsart)) : 'stunden';
      neu.push({
        owner_user_id: uid,
        bezeichnung: bez,
        kategorie: val(row, impMap.kategorie) || null,
        erfassungsart: art,
        standard_wert: num(val(row, impMap.standard_wert)) ?? 1,
        aw_minuten: art === 'aw' ? 6 : null,
        stundensatz_netto: num(val(row, impMap.stundensatz)),
        aktiv: true,
      });
    }
    if (neu.length === 0) { setImpSpeichert(false); setImpFehler('Keine importierbaren Zeilen — bitte Spalten-Zuordnung prüfen (mind. Bezeichnung).'); return; }
    try {
      let done = 0;
      for (let i = 0; i < neu.length; i += 500) {
        const chunk = neu.slice(i, i + 500);
        const { error } = await supabase.from('leistungskatalog').insert(chunk);
        if (error) throw error;
        done += chunk.length;
      }
      setImpFertig(done);
      await laden_();
    } catch (e: unknown) {
      setImpFehler('Import fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setImpSpeichert(false); }
  }

  const impDatenHeader = impZeilen.length ? (impHeader ? impZeilen[0] : impZeilen[0].map((_, i) => 'Spalte ' + (i + 1))) : [];
  const impDaten = impZeilen.length ? (impHeader ? impZeilen.slice(1) : impZeilen) : [];

  // Live-Vorschau der Zeit im Formular
  const vorschauMin = nachMinuten(num(form.standard_wert), form.erfassungsart, num(form.aw_minuten));

  const kiKontext = liste.length === 0 ? '' :
    `${liste.length} Leistungen im Katalog, davon ${liste.filter((k) => k.aktiv).length} aktiv, in ${kategorien.length} Kategorien.`;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Service</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Leistungskatalog</h1>
          <p style={styles.sub}>Eure Arbeitswerte — Minuten, Stunden oder AW/Einheiten, frei konfigurierbar. Selbst anlegen oder per CSV importieren.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={impOeffnen} style={styles.ghostBtn}>📥 CSV-Import</button>
          <button onClick={neu} style={styles.primaerBtn}>+ Neue Leistung</button>
        </div>
      </div>

      {!laden && (
        <div style={styles.summenGrid}>
          <SummeKarte label="Leistungen" value={String(liste.length)} accent={C.cyan} />
          <SummeKarte label="Aktiv" value={String(liste.filter((k) => k.aktiv).length)} accent={C.green} />
          <SummeKarte label="Kategorien" value={String(kategorien.length)} accent={C.gold} />
        </div>
      )}

      {!laden && kiKontext && (
        <KiAuge modul="Leistungskatalog" kontext={kiKontext} aktionHref="/dashboard/leistungskatalog" aktionText="Zum Katalog" />
      )}

      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Filter */}
      {kategorien.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <select style={{ ...styles.input, maxWidth: 260 }} value={kategorieFilter} onChange={(e) => setKategorieFilter(e.target.value)}>
            <option value="alle">Kategorie: alle</option>
            {kategorien.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      )}

      {/* Liste */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Leistungen</h2>
        {laden ? (
          <div style={styles.hint}>Lädt …</div>
        ) : gefiltert.length === 0 ? (
          <div style={styles.hint}>Noch keine Leistungen. Leg oben rechts die erste an — oder importiere eine CSV.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Bezeichnung</th>
                  <th style={styles.th}>Kategorie</th>
                  <th style={styles.th}>Erfassung</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Wert</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>= Zeit</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Satz/Preis</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((k) => {
                  const min = nachMinuten(k.standard_wert, k.erfassungsart, k.aw_minuten);
                  const preis = k.stundensatz_netto != null ? `${eur(k.stundensatz_netto)}/h` : (k.festpreis_netto != null ? eur(k.festpreis_netto) : '—');
                  return (
                    <tr key={k.id} style={{ opacity: k.aktiv ? 1 : 0.5 }}>
                      <td style={{ ...styles.td, fontWeight: 600 }}>
                        {k.bezeichnung}{k.kuerzel ? <span style={{ color: C.textDim, fontWeight: 400 }}> · {k.kuerzel}</span> : null}
                      </td>
                      <td style={styles.td}>{k.kategorie || '—'}</td>
                      <td style={styles.td}>{artLabel(k.erfassungsart)}{k.erfassungsart === 'aw' && k.aw_minuten ? ` (1 AW=${k.aw_minuten}m)` : ''}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{k.standard_wert}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{min > 0 ? zeitText(min) : '—'}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: C.gold }}>{preis}</td>
                      <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => bearbeiten(k)} style={styles.miniBtnGhost}>Bearbeiten</button>
                        {k.aktiv
                          ? <button onClick={() => archivieren(k)} style={styles.miniBtnGhost}>Deaktivieren</button>
                          : <button onClick={() => aktivieren(k)} style={styles.miniBtnGhost}>Aktivieren</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Modal: Anlegen/Bearbeiten --------------------------------- */}
      {modalAuf && (
        <div style={styles.overlay} onClick={() => !speichert && setModalAuf(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>{form.id ? 'Leistung bearbeiten' : 'Neue Leistung'}</h2>
            <div style={styles.formGrid}>
              <Feld label="Bezeichnung *" voll>
                <input style={styles.input} value={form.bezeichnung} onChange={(e) => setF('bezeichnung', e.target.value)} placeholder="z. B. Kleiner Service / Reifenwechsel / Auswuchten" />
              </Feld>
              <Feld label="Kürzel">
                <input style={styles.input} value={form.kuerzel} onChange={(e) => setF('kuerzel', e.target.value)} placeholder="z. B. SVC-K" />
              </Feld>
              <Feld label="Kategorie">
                <input style={styles.input} value={form.kategorie} onChange={(e) => setF('kategorie', e.target.value)} placeholder="z. B. Service, Reifen, Motor" />
              </Feld>
              <Feld label="Erfassungsart">
                <select style={styles.input} value={form.erfassungsart} onChange={(e) => setF('erfassungsart', e.target.value)}>
                  {ART_OPTIONEN.map((o) => <option key={o.wert} value={o.wert}>{o.label}</option>)}
                </select>
              </Feld>
              <Feld label="Standardwert">
                <input style={styles.input} value={form.standard_wert} onChange={(e) => setF('standard_wert', e.target.value)} placeholder="z. B. 1 / 12 / 20" />
              </Feld>
              {form.erfassungsart === 'aw' && (
                <Feld label="1 AW = wieviele Minuten?">
                  <input style={styles.input} value={form.aw_minuten} onChange={(e) => setF('aw_minuten', e.target.value)} placeholder="z. B. 6" />
                </Feld>
              )}
              <Feld label="Stundensatz netto (€/h)">
                <input style={styles.input} value={form.stundensatz_netto} onChange={(e) => setF('stundensatz_netto', e.target.value)} placeholder="z. B. 95" />
              </Feld>
              <Feld label="oder Festpreis netto (€)">
                <input style={styles.input} value={form.festpreis_netto} onChange={(e) => setF('festpreis_netto', e.target.value)} placeholder="alternativ" />
              </Feld>
              <Feld label="Notiz" voll>
                <textarea style={{ ...styles.input, minHeight: 50, resize: 'vertical' }} value={form.notiz} onChange={(e) => setF('notiz', e.target.value)} />
              </Feld>
            </div>

            {/* Live-Vorschau */}
            {vorschauMin > 0 && (
              <div style={styles.vorschau}>
                Entspricht <strong>{zeitText(vorschauMin)}</strong> Arbeitszeit
                {form.erfassungsart === 'aw' ? ` (${form.standard_wert} AW × ${form.aw_minuten} Min)` : ''}.
              </div>
            )}

            <div style={styles.modalAktionen}>
              <button onClick={() => setModalAuf(false)} disabled={speichert} style={styles.ghostBtn}>Abbrechen</button>
              <button onClick={speichern} disabled={speichert} style={{ ...styles.primaerBtn, opacity: speichert ? 0.6 : 1 }}>
                {speichert ? 'Speichert …' : (form.id ? 'Speichern' : 'Anlegen')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Modal: CSV-Import ----------------------------------------- */}
      {impOffen && (
        <div style={styles.overlay} onClick={() => !impSpeichert && setImpOffen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>📥 Leistungen importieren (CSV)</h2>
            {impFertig > 0 ? (
              <>
                <div style={styles.okBox}>✅ {impFertig} Leistung(en) importiert.</div>
                <div style={styles.modalAktionen}>
                  <button onClick={() => setImpOffen(false)} style={styles.primaerBtn}>Fertig</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ color: C.textDim, fontSize: 13, marginBottom: 12 }}>
                  CSV wählen (Export aus Excel o.ä.). Komma und Semikolon werden erkannt. Mindestens die Bezeichnung muss zugeordnet sein.
                </div>
                <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => impDatei(e.target.files ? e.target.files[0] : null)}
                  style={{ color: C.textDim, fontSize: 13, marginBottom: 14, width: '100%' }} />
                {impFehler && <div style={styles.err}>{impFehler}</div>}
                {impZeilen.length > 0 && (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.textDim, fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
                      <input type="checkbox" checked={impHeader} onChange={(e) => { setImpHeader(e.target.checked); if (e.target.checked) setImpMap(rateMap(impZeilen[0])); }} />
                      Erste Zeile enthält Spaltenüberschriften
                    </label>
                    <div style={{ color: C.cyan, fontSize: 12, marginBottom: 10 }}>Spalten zuordnen</div>
                    <div style={styles.formGrid}>
                      {[['bezeichnung', 'Bezeichnung *'], ['kategorie', 'Kategorie'], ['erfassungsart', 'Erfassungsart'], ['standard_wert', 'Wert/Zeit'], ['stundensatz', 'Stundensatz']].map(([feld, label]) => (
                        <Feld key={feld} label={label}>
                          <select style={styles.input} value={impMap[feld]} onChange={(e) => setImpMap((m) => ({ ...m, [feld]: Number(e.target.value) }))}>
                            <option value={-1}>— ignorieren —</option>
                            {impDatenHeader.map((h, i) => <option key={i} value={i}>{h || 'Spalte ' + (i + 1)}</option>)}
                          </select>
                        </Feld>
                      ))}
                    </div>
                    <div style={{ color: C.textDim, fontSize: 12, margin: '12px 0' }}>
                      {impDaten.length} Datenzeile(n) erkannt. Erfassungsart wird aus Text erraten (Std/Min/AW), Standard = Stunden.
                    </div>
                    <div style={styles.modalAktionen}>
                      <button onClick={() => setImpOffen(false)} disabled={impSpeichert} style={styles.ghostBtn}>Abbrechen</button>
                      <button onClick={() => impStart(impDatenHeader, impDaten)} disabled={impSpeichert || impDaten.length === 0}
                        style={{ ...styles.primaerBtn, opacity: (impSpeichert || impDaten.length === 0) ? 0.6 : 1 }}>
                        {impSpeichert ? 'Importiert …' : `${impDaten.length} importieren`}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Feld({ label, children, voll }: { label: string; children: React.ReactNode; voll?: boolean }) {
  return (
    <div style={{ gridColumn: voll ? '1 / -1' : 'auto' }}>
      <label style={styles.lbl}>{label}</label>
      {children}
    </div>
  );
}
function SummeKarte({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={styles.summeBox}>
      <div style={styles.summeLabel}>{label}</div>
      <div style={{ ...styles.summeValue, color: accent || C.text }}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 680, lineHeight: 1.5 },

  primaerBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', marginLeft: 6 },

  summenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  summeLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, margin: '0 0 14px', color: C.text },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 720 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '10px', fontSize: 14, borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },

  hint: { color: C.textDim, fontSize: 14, padding: '14px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  okBox: { color: C.green, fontSize: 15, background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.green}`, borderRadius: 10, padding: '16px 18px', marginBottom: 16 },
  vorschau: { marginTop: 14, padding: '10px 14px', background: 'rgba(0,229,255,0.08)', border: `1px solid rgba(0,229,255,0.25)`, borderRadius: 10, fontSize: 13.5, color: C.text },

  lbl: { display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 660, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, margin: '0 0 18px', color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
};
