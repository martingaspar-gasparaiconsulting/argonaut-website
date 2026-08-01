'use client';

// ============================================================
// ARGONAUT OS · Baustein 2 · Block G · Objekt-/Asset-Register
// Generisches Register (Baumkataster als Blaupause): Objekte mit Zustand-Ampel,
// Kontrollintervall + Fälligkeits-Ampel, optionaler Gruppe/Standort, Alter.
// Reine Kennzahlen aus lib/assets (0 €, getestet).
// Pfad: app/dashboard/objekte/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  naechsteKontrolleBerechnen,
  kontrollBucket,
  zaehleRegister,
  alterInJahren,
  normZustand,
  ZUSTAND_LABEL,
  OBJEKT_TYPEN,
  objektTypByLabel,
  type Zustand,
  type AssetBasis,
} from '@/lib/assets';
import { augeObjekte } from '@/lib/auge';
import KiAuge from '../_components/KiAuge';
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from '../_components/EigeneFelder';
import type { EigenesFeld } from '@/lib/eigeneFelder';

const MODUL = 'assets';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

const TYP_OPTIONEN = OBJEKT_TYPEN.map((t) => t.label);

type Gruppe = { id: string; bezeichnung: string; adresse: string | null };
type Asset = AssetBasis & {
  id: string; owner_user_id: string; gruppe_id: string | null; kontakt_id: string | null;
  wartungsvertrag_id: string | null; typ: string; bezeichnung: string; standort: string | null;
  hersteller: string | null; kennung: string | null; zustand: Zustand;
  kontrollintervall_monate: number; letzte_kontrolle: string | null; naechste_kontrolle: string | null;
  anschaffungsdatum: string | null; anschaffungswert: number | null; notiz: string | null; archiviert: boolean;
};

type FormState = {
  id: string | null; bezeichnung: string; typ: string; gruppe_id: string; neueGruppe: string;
  standort: string; hersteller: string; kennung: string; zustand: Zustand;
  kontrollintervall_monate: string; letzte_kontrolle: string; anschaffungsdatum: string;
  anschaffungswert: string; notiz: string;
};
const LEER: FormState = {
  id: null, bezeichnung: '', typ: 'Maschine', gruppe_id: '', neueGruppe: '', standort: '',
  hersteller: '', kennung: '', zustand: 'gut', kontrollintervall_monate: '12',
  letzte_kontrolle: '', anschaffungsdatum: '', anschaffungswert: '', notiz: '',
};

function heuteLokal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function d(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function num(s: string): number { const n = parseFloat((s || '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function eur(n: number | null): string { if (n == null) return '—'; return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function zustandFarbe(z: Zustand): string { const n = normZustand(z); return n === 'kritisch' ? C.danger : n === 'beobachten' ? C.warn : C.green; }
const BUCKET_FARBE: Record<string, string> = { faellig: C.danger, bald: C.warn, ok: C.green, kein: C.textDim };
const BUCKET_LABEL: Record<string, string> = { faellig: 'Kontrolle fällig', bald: 'bald fällig', ok: 'im Plan', kein: 'keine Kontrolle' };

export default function ObjekteRegister() {
  const [uid, setUid] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [gruppen, setGruppen] = useState<Gruppe[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [suche, setSuche] = useState('');
  const [typFilter, setTypFilter] = useState('');
  const [gruppeFilter, setGruppeFilter] = useState('');
  const [nurFaellige, setNurFaellige] = useState(false);
  const [zeigeArchiv, setZeigeArchiv] = useState(false);

  const [modalAuf, setModalAuf] = useState(false);
  const [form, setForm] = useState<FormState>(LEER);
  const [speichert, setSpeichert] = useState(false);
  const [wartungBusy, setWartungBusy] = useState<string | null>(null);
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nmExtra, setNmExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});
  const heute = heuteLokal();

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [a, g] = await Promise.all([
        supabase.from('assets').select('*').eq('archiviert', zeigeArchiv).order('naechste_kontrolle', { ascending: true, nullsFirst: false }),
        supabase.from('asset_gruppen').select('id, bezeichnung, adresse').order('bezeichnung', { ascending: true }),
      ]);
      const rows = (a.data as Asset[]) ?? [];
      setAssets(rows);
      setGruppen((g.data as Gruppe[]) ?? []);
      setFelder(await ladeFelder(MODUL));
      setWerteMap(await ladeWerte(MODUL, rows.map((r) => r.id)));
    } catch (e: unknown) {
      setFehler('Register konnte nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [zeigeArchiv]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_();
    })();
  }, [laden_]);

  const gruppeName = useCallback((id: string | null) => gruppen.find((x) => x.id === id)?.bezeichnung ?? null, [gruppen]);
  const kennzahlen = useMemo(() => zaehleRegister(assets, heute), [assets, heute]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return assets.filter((a) => {
      if (typFilter && a.typ !== typFilter) return false;
      if (gruppeFilter && a.gruppe_id !== gruppeFilter) return false;
      if (nurFaellige && kontrollBucket(a, heute) !== 'faellig') return false;
      if (q) {
        const hay = [a.bezeichnung, a.typ, a.standort, a.hersteller, a.kennung, gruppeName(a.gruppe_id)].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assets, suche, typFilter, gruppeFilter, nurFaellige, heute, gruppeName]);

  function neuOeffnen() { setForm(LEER); setNmExtra({}); setFehler(null); setModalAuf(true); }
  function bearbeiten(a: Asset) {
    setNmExtra(werteMap[a.id] ?? {});
    setForm({
      id: a.id, bezeichnung: a.bezeichnung ?? '', typ: a.typ ?? 'Maschine', gruppe_id: a.gruppe_id ?? '',
      neueGruppe: '', standort: a.standort ?? '', hersteller: a.hersteller ?? '', kennung: a.kennung ?? '',
      zustand: normZustand(a.zustand), kontrollintervall_monate: String(a.kontrollintervall_monate ?? 12),
      letzte_kontrolle: a.letzte_kontrolle ?? '', anschaffungsdatum: a.anschaffungsdatum ?? '',
      anschaffungswert: a.anschaffungswert != null ? String(a.anschaffungswert) : '', notiz: a.notiz ?? '',
    });
    setFehler(null); setModalAuf(true);
  }
  function setF<K extends keyof FormState>(k: K, v: FormState[K]) { setForm((f) => ({ ...f, [k]: v })); }
  // Typ wählen: setzt zugleich die Standard-Prüffrist des Typs (Block I).
  function typWaehlen(label: string) {
    const t = objektTypByLabel(label);
    setForm((f) => ({ ...f, typ: label, kontrollintervall_monate: t ? String(t.kontrollintervallMonate) : f.kontrollintervall_monate }));
  }

  async function speichern() {
    if (!uid) return;
    if (!form.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setSpeichert(true); setFehler(null); setOk(null);
    try {
      // Optional: neue Gruppe anlegen und verknüpfen.
      let gruppeId: string | null = form.gruppe_id || null;
      if (form.neueGruppe.trim()) {
        const { data: g, error: gErr } = await supabase.from('asset_gruppen')
          .insert({ owner_user_id: uid, bezeichnung: form.neueGruppe.trim() }).select('id').single();
        if (gErr || !g) throw gErr ?? new Error('Gruppe fehlgeschlagen');
        gruppeId = g.id as string;
      }
      const intervall = Math.max(0, Math.round(num(form.kontrollintervall_monate))) || 12;
      const letzte = form.letzte_kontrolle || null;
      const naechste = naechsteKontrolleBerechnen(letzte, intervall);
      const payload = {
        owner_user_id: uid, gruppe_id: gruppeId, typ: form.typ, bezeichnung: form.bezeichnung.trim(),
        standort: form.standort.trim() || null, hersteller: form.hersteller.trim() || null,
        kennung: form.kennung.trim() || null, zustand: form.zustand, kontrollintervall_monate: intervall,
        letzte_kontrolle: letzte, naechste_kontrolle: naechste, anschaffungsdatum: form.anschaffungsdatum || null,
        anschaffungswert: form.anschaffungswert.trim() ? num(form.anschaffungswert) : null,
        notiz: form.notiz.trim() || null, aktualisiert_am: new Date().toISOString(),
      };
      if (form.id) {
        const { error } = await supabase.from('assets').update(payload).eq('id', form.id);
        if (error) throw error;
        try { await speichereWerte(MODUL, form.id, uid, nmExtra); } catch { /* eigene Felder optional */ }
      } else {
        const { data: neu, error } = await supabase.from('assets').insert(payload).select('id').single();
        if (error) throw error;
        try { await speichereWerte(MODUL, (neu as { id: string }).id, uid, nmExtra); } catch { /* eigene Felder optional */ }
      }
      setModalAuf(false); setForm(LEER); setNmExtra({}); setOk('Objekt gespeichert.'); await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  async function archivToggle(a: Asset) {
    const ziel = !a.archiviert;
    if (ziel && !window.confirm(`Objekt „${a.bezeichnung}" archivieren?`)) return;
    try {
      const { error } = await supabase.from('assets').update({ archiviert: ziel, aktualisiert_am: new Date().toISOString() }).eq('id', a.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) { setFehler('Archivieren fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
  }

  // --- Wartungsvertrag aus einem Objekt anlegen (Block H · Baustein-1-Andock) ---
  async function wartungAusObjekt(a: Asset) {
    if (!uid) return;
    if (a.wartungsvertrag_id) { setOk('Dieses Objekt hat bereits einen Wartungsvertrag — zu finden unter 🔧 Wartung.'); return; }
    const kunde = gruppeName(a.gruppe_id) || a.standort || null;
    if (!window.confirm(
      `Für „${a.bezeichnung}" einen Wartungsvertrag anlegen?\n\n` +
      `• Intervall: alle ${a.kontrollintervall_monate || 12} Monate\n` +
      `• Nächste Fälligkeit: ${a.naechste_kontrolle ? d(a.naechste_kontrolle) : 'offen'}\n\n` +
      `Er erscheint unter 🔧 Wartung und fließt in Rechnung + Wiederkehr-Cockpit.`
    )) return;
    setWartungBusy(a.id); setFehler(null); setOk(null);
    try {
      const { data: w, error: wErr } = await supabase.from('wartungsvertraege').insert({
        owner_user_id: uid, titel: a.bezeichnung, kunde_name: kunde, kontakt_id: a.kontakt_id,
        status: 'aktiv', beginn_am: a.letzte_kontrolle || null, intervall_monate: a.kontrollintervall_monate || 12,
        letzte_wartung_am: a.letzte_kontrolle || null, naechste_faelligkeit_am: a.naechste_kontrolle || null,
        erinnerung_tage_vorher: 30, aktualisiert_am: new Date().toISOString(),
      }).select('id').single();
      if (wErr || !w) throw wErr ?? new Error('Wartung fehlgeschlagen');
      const { error: uErr } = await supabase.from('assets').update({ wartungsvertrag_id: w.id, aktualisiert_am: new Date().toISOString() }).eq('id', a.id);
      if (uErr) throw uErr;
      setOk(`Wartungsvertrag für „${a.bezeichnung}" angelegt — unter 🔧 Wartung. Betrag netto dort ergänzen, dann läuft die Auto-Abrechnung.`);
      await laden_();
    } catch (e: unknown) {
      setFehler('Wartung anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setWartungBusy(null); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Register</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>🏛 Objekt-Register</h1>
          <p style={styles.sub}>Alle Objekte, Anlagen und Geräte an einem Ort — mit Zustand-Ampel, Kontrollintervall und Fälligkeit. Ein Register für alle Gewerke.</p>
        </div>
        <button onClick={neuOeffnen} style={styles.primaerBtn}>+ Objekt anlegen</button>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {/* KPI-Kacheln */}
      <div style={styles.kpiGrid}>
        <Kpi label="Objekte gesamt" value={String(kennzahlen.gesamt)} accent={C.cyan} />
        <Kpi label="Kontrolle fällig" value={String(kennzahlen.faellig)} accent={kennzahlen.faellig > 0 ? C.danger : C.green} />
        <Kpi label="Bald fällig (≤ 30 T.)" value={String(kennzahlen.bald)} accent={kennzahlen.bald > 0 ? C.warn : C.green} />
        <Kpi label="Zustand kritisch" value={String(kennzahlen.kritisch)} accent={kennzahlen.kritisch > 0 ? C.danger : C.green} />
      </div>

      {/* Regel-Auge: Klartext zur Register-Lage (0 €, ohne KI-Aufruf). */}
      {!laden && (
        <div style={{ marginTop: 18 }}>
          <KiAuge
            modul="Objekt-Register"
            regel={augeObjekte({ gesamt: kennzahlen.gesamt, faellig: kennzahlen.faellig, bald: kennzahlen.bald, kritisch: kennzahlen.kritisch, beobachten: kennzahlen.beobachten })}
          />
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '18px 0 14px' }}>
        <input style={{ ...styles.input, maxWidth: 300 }} placeholder="Suche: Bezeichnung, Typ, Standort, Kennung…" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <select style={{ ...styles.input, maxWidth: 200 }} value={typFilter} onChange={(e) => setTypFilter(e.target.value)}>
          <option value="">Alle Typen</option>
          {TYP_OPTIONEN.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select style={{ ...styles.input, maxWidth: 220 }} value={gruppeFilter} onChange={(e) => setGruppeFilter(e.target.value)}>
          <option value="">Alle Gruppen</option>
          {gruppen.map((g) => <option key={g.id} value={g.id}>{g.bezeichnung}</option>)}
        </select>
        <label style={styles.check}><input type="checkbox" checked={nurFaellige} onChange={(e) => setNurFaellige(e.target.checked)} /> nur fällige</label>
        <button onClick={() => setZeigeArchiv((v) => !v)} style={styles.ghostBtn}>{zeigeArchiv ? '← aktive Objekte' : 'Archiv'}</button>
      </div>

      {/* Tabelle */}
      <div style={styles.card}>
        {laden ? (
          <div style={styles.hint}>Lädt …</div>
        ) : gefiltert.length === 0 ? (
          <div style={styles.hint}>{assets.length === 0 ? 'Noch keine Objekte erfasst. Leg oben rechts das erste an.' : 'Keine Objekte für diese Filter.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Objekt</th>
                  <th style={styles.th}>Gruppe / Standort</th>
                  <th style={styles.th}>Zustand</th>
                  <th style={styles.th}>Nächste Kontrolle</th>
                  <th style={styles.th}>Alter</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((a) => {
                  const bucket = kontrollBucket(a, heute);
                  const alter = alterInJahren(a.anschaffungsdatum, heute);
                  return (
                    <tr key={a.id}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: 600 }}>{a.bezeichnung}</div>
                        <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim }}>
                          {a.typ}{a.kennung ? ` · ${a.kennung}` : ''}{a.hersteller ? ` · ${a.hersteller}` : ''}
                        </div>
                        <EigeneFelderAnzeige felder={felder} werte={werteMap[a.id]} />
                      </td>
                      <td style={{ ...styles.td, color: C.textDim }}>
                        {gruppeName(a.gruppe_id) || '—'}{a.standort ? <div style={{ fontSize: 'clamp(11px, 0.94vw, 15px)' }}>{a.standort}</div> : null}
                      </td>
                      <td style={styles.td}>
                        <span style={{ color: zustandFarbe(a.zustand), fontWeight: 600 }}>{ZUSTAND_LABEL[normZustand(a.zustand)]}</span>
                      </td>
                      <td style={styles.td}>
                        <div>{d(a.naechste_kontrolle)}</div>
                        <div style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', color: BUCKET_FARBE[bucket], fontWeight: 600 }}>
                          {BUCKET_LABEL[bucket]}{a.kontrollintervall_monate ? ` · alle ${a.kontrollintervall_monate} Mon.` : ''}
                        </div>
                      </td>
                      <td style={{ ...styles.td, color: C.textDim }}>{alter != null ? `${alter} J.` : '—'}{a.anschaffungswert != null ? <div style={{ fontSize: 'clamp(11px, 0.94vw, 15px)' }}>{eur(a.anschaffungswert)}</div> : null}</td>
                      <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {a.wartungsvertrag_id ? (
                          <a href="/dashboard/wartung" style={{ ...styles.miniBtn, display: 'inline-block', color: C.green, borderColor: `${C.green}55`, textDecoration: 'none' }} title="Wartungsvertrag verknüpft">🔧 Wartung ✓</a>
                        ) : (
                          <button onClick={() => wartungAusObjekt(a)} disabled={wartungBusy === a.id} style={{ ...styles.miniBtn, color: C.gold, borderColor: `${C.gold}55` }} title="Wartungsvertrag aus diesem Objekt anlegen">{wartungBusy === a.id ? '…' : '🔧 Wartung'}</button>
                        )}
                        <button onClick={() => bearbeiten(a)} style={styles.miniBtn}>Bearbeiten</button>
                        <button onClick={() => archivToggle(a)} style={styles.miniBtn}>{a.archiviert ? 'Reaktivieren' : 'Archiv'}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {uid && <EigeneFelderManager modul={MODUL} ownerId={uid} onChange={laden_} />}

      <div style={styles.rechtHinweis}>
        Die nächste Kontrolle wird automatisch aus letzter Kontrolle + Intervall berechnet; der Objekt-Typ setzt die Standard-Prüffrist. Für Abschreibung/AfA nutze das Anlagen-Modul, für die Fahrzeug-Historie die Fahrzeugakte — das Register dupliziert diese Tiefe bewusst nicht, sondern verknüpft.
      </div>

      {/* Modal */}
      {modalAuf && (
        <div style={styles.overlay} onClick={() => !speichert && setModalAuf(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>{form.id ? 'Objekt bearbeiten' : 'Neues Objekt'}</h2>
            <div style={styles.formGrid}>
              <Feld label="Bezeichnung *" voll><input style={styles.input} value={form.bezeichnung} onChange={(e) => setF('bezeichnung', e.target.value)} placeholder="z. B. Bagger CAT 320 / Aufzug Haus A" /></Feld>
              <Feld label="Typ (setzt Standard-Prüffrist)">
                <select style={styles.input} value={form.typ} onChange={(e) => typWaehlen(e.target.value)}>{TYP_OPTIONEN.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                {objektTypByLabel(form.typ)?.hinweis && <div style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, marginTop: 4 }}>{objektTypByLabel(form.typ)!.hinweis}</div>}
              </Feld>
              <Feld label="Zustand"><select style={styles.input} value={form.zustand} onChange={(e) => setF('zustand', e.target.value as Zustand)}><option value="gut">🟢 Gut</option><option value="beobachten">🟠 Beobachten</option><option value="kritisch">🔴 Kritisch</option></select></Feld>
              <Feld label="Gruppe / Standort"><select style={styles.input} value={form.gruppe_id} onChange={(e) => setF('gruppe_id', e.target.value)}><option value="">— keine —</option>{gruppen.map((g) => <option key={g.id} value={g.id}>{g.bezeichnung}</option>)}</select></Feld>
              <Feld label="… oder neue Gruppe anlegen"><input style={styles.input} value={form.neueGruppe} onChange={(e) => setF('neueGruppe', e.target.value)} placeholder="Name (optional)" /></Feld>
              <Feld label="Standort (frei)"><input style={styles.input} value={form.standort} onChange={(e) => setF('standort', e.target.value)} placeholder="Halle 2 / Adresse" /></Feld>
              <Feld label="Hersteller"><input style={styles.input} value={form.hersteller} onChange={(e) => setF('hersteller', e.target.value)} /></Feld>
              <Feld label="Kennung (Seriennr./Kennzeichen)"><input style={styles.input} value={form.kennung} onChange={(e) => setF('kennung', e.target.value)} /></Feld>
              <Feld label="Kontrollintervall (Monate)"><input type="number" min={0} style={styles.input} value={form.kontrollintervall_monate} onChange={(e) => setF('kontrollintervall_monate', e.target.value)} /></Feld>
              <Feld label="Letzte Kontrolle"><input type="date" style={styles.input} value={form.letzte_kontrolle} onChange={(e) => setF('letzte_kontrolle', e.target.value)} /></Feld>
              <Feld label="Anschaffungsdatum"><input type="date" style={styles.input} value={form.anschaffungsdatum} onChange={(e) => setF('anschaffungsdatum', e.target.value)} /></Feld>
              <Feld label="Anschaffungswert (€)"><input style={styles.input} value={form.anschaffungswert} onChange={(e) => setF('anschaffungswert', e.target.value)} inputMode="decimal" placeholder="0,00" /></Feld>
              <Feld label="Notiz" voll><textarea style={{ ...styles.input, minHeight: 56, resize: 'vertical' }} value={form.notiz} onChange={(e) => setF('notiz', e.target.value)} /></Feld>
              <EigeneFelderInputs felder={felder} werte={nmExtra} setWert={(fid, w) => setNmExtra((s) => ({ ...s, [fid]: w }))} inpStyle={styles.input} labStyle={styles.lbl} />
            </div>
            <div style={styles.modalAktionen}>
              <button onClick={() => setModalAuf(false)} disabled={speichert} style={styles.ghostBtn}>Abbrechen</button>
              <button onClick={speichern} disabled={speichert} style={{ ...styles.primaerBtn, opacity: speichert ? 0.6 : 1 }}>{speichert ? 'Speichert …' : (form.id ? 'Speichern' : 'Anlegen')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (<div style={styles.kpiBox}><div style={styles.kpiLabel}>{label}</div><div style={{ ...styles.kpiValue, color: accent || C.text }}>{value}</div></div>);
}
function Feld({ label, children, voll }: { label: string; children: React.ReactNode; voll?: boolean }) {
  return (<div style={{ gridColumn: voll ? '1 / -1' : 'auto' }}><label style={styles.lbl}>{label}</label>{children}</div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 22px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 760, lineHeight: 1.5 },
  primaerBtn: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)', fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  miniBtn: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 'clamp(12.5px, 1.13vw, 18px)', fontFamily: 'inherit', cursor: 'pointer', marginLeft: 6 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  kpiBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  kpiLabel: { fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  kpiValue: { fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 800, fontSize: 'clamp(24px, 2.13vw, 34px)' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 760 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 10px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'top' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '14px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '16px 0' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '16px 0' },
  rechtHinweis: { marginTop: 16, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, lineHeight: 1.5, maxWidth: 760 },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 'clamp(13px, 1.13vw, 18px)', color: C.textDim, cursor: 'pointer', userSelect: 'none' },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit' },
  lbl: { display: 'block', fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 660, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 800, margin: '0 0 18px', color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
};
