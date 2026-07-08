'use client';

// ============================================================
// ARGONAUT OS · Modul D+ · Block D+.4 · Werkstatt-Board + Uhrwerk
// D.3-Board (Kanban, Durchlaufzeit, Status-Log, KiAuge) ERWEITERT um:
//  - Fahrzeug-Kopplung (optional) per FIN/Kennzeichen (werkstatt_fahrzeuge)
//  - Leistungs-Positionen aus dem Katalog (suchen → übernehmen → überschreibbar)
//  - Material- & Fremdleistungs-Positionen, Live-Summe (Zeit + Betrag)
// Positionen werden sofort gespeichert (schnelles Arbeiten), Entfernen fragt nach.
// Kopfdaten + Archivieren bestätigungspflichtig. Design 1:1 wie das Dashboard.
// Pfad: app/dashboard/werkstatt/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import {
  STATUS_PHASEN, statusDef, gruppiereBoard, naechsterStatus, istAbgeschlossen,
  durchlaufzeitText, durchlaufzeitMinuten, dauerTextMinuten, dringlichkeitsAmpel,
  verweildauerJePhase, zaehleOffen,
  type StatusLogEintrag,
} from '../_components/werkstattLogik';
import {
  katalogNachPosition, positionsMinuten, positionsBetrag, auftragsSumme,
  zeitText, eur, finGueltig, finNormalisieren,
  type KatalogEintrag, type PositionBasis,
} from '../_components/leistungLogik';
import AnhaengeBox from '../_components/AnhaengeBox';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666', lila: '#A855F7',
};

// --- DB-Typen -----------------------------------------------------------
type AuftragRow = {
  id: string; owner_user_id: string;
  nummer: string | null; titel: string; beschreibung: string | null;
  kunde_name: string | null; kennzeichen: string | null;
  status: string; prioritaet: string;
  angenommen_am: string; fertig_am: string | null; zugesagt_am: string | null;
  fahrzeug_id: string | null;
  notiz: string | null; archiviert: boolean;
};
type FahrzeugRow = {
  id: string; owner_user_id: string; fin: string; kennzeichen: string | null;
  hersteller: string | null; modell: string | null; halter_name: string | null;
};
type KatalogRow = KatalogEintrag & { id: string; aktiv: boolean };
type PositionRow = PositionBasis & {
  id: string; owner_user_id: string; auftrag_id: string;
  katalog_id: string | null; artikel_id: string | null; extern_firma: string | null;
};

const PRIO_OPTIONEN = [
  { wert: 'normal', label: 'Normal' }, { wert: 'hoch', label: 'Hoch' }, { wert: 'dringend', label: 'Dringend' },
];
const ART_ERFASSUNG = [
  { wert: 'stunden', label: 'Std' }, { wert: 'minuten', label: 'Min' },
  { wert: 'aw', label: 'AW' }, { wert: 'stueck', label: 'Stück' },
];

type Form = {
  id: string | null;
  titel: string; nummer: string; kunde_name: string; kennzeichen: string;
  prioritaet: string; zugesagt_am: string; beschreibung: string; notiz: string;
  fahrzeug_id: string | null;
};
const LEER: Form = {
  id: null, titel: '', nummer: '', kunde_name: '', kennzeichen: '',
  prioritaet: 'normal', zugesagt_am: '', beschreibung: '', notiz: '', fahrzeug_id: null,
};

function datumHuebsch(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function num(s: string): number | null {
  const t = s.trim().replace(',', '.'); if (t === '') return null;
  const n = Number(t); return Number.isFinite(n) ? n : null;
}

export default function WerkstattPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [auftraege, setAuftraege] = useState<AuftragRow[]>([]);
  const [fahrzeuge, setFahrzeuge] = useState<FahrzeugRow[]>([]);
  const [katalog, setKatalog] = useState<KatalogRow[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [modalAuf, setModalAuf] = useState(false);
  const [form, setForm] = useState<Form>(LEER);
  const [speichert, setSpeichert] = useState(false);
  const [gespeichertHinweis, setGespeichertHinweis] = useState(false);

  const [log, setLog] = useState<StatusLogEintrag[]>([]);
  const [positionen, setPositionen] = useState<PositionRow[]>([]);

  // Fahrzeug-Suche im Modal
  const [fzSuche, setFzSuche] = useState('');
  const [fzNeuAuf, setFzNeuAuf] = useState(false);
  const [fzNeu, setFzNeu] = useState({ fin: '', kennzeichen: '', hersteller: '', modell: '', halter_name: '' });

  // Leistungs-Suche (Dropdown)
  const [leiSuche, setLeiSuche] = useState('');
  const [leiOffen, setLeiOffen] = useState(false);

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
      const [aRes, fRes, kRes] = await Promise.all([
        supabase.from('werkstatt_auftraege').select('*').eq('owner_user_id', uid).eq('archiviert', false).order('angenommen_am', { ascending: true }),
        supabase.from('werkstatt_fahrzeuge').select('id, owner_user_id, fin, kennzeichen, hersteller, modell, halter_name').eq('owner_user_id', uid).eq('archiviert', false),
        supabase.from('leistungskatalog').select('*').eq('owner_user_id', uid).eq('aktiv', true).order('bezeichnung', { ascending: true }),
      ]);
      if (aRes.error) throw aRes.error;
      setAuftraege((aRes.data as AuftragRow[]) ?? []);
      setFahrzeuge((fRes.data as FahrzeugRow[]) ?? []);
      setKatalog((kRes.data as KatalogRow[]) ?? []);
    } catch (e: unknown) {
      setFehler('Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid]);

  useEffect(() => { void laden_(); }, [laden_]);

  // --- Positionen + Log eines Auftrags laden ----------------------------
  const ladePositionen = useCallback(async (auftragId: string) => {
    const { data } = await supabase.from('werkstatt_positionen').select('*')
      .eq('auftrag_id', auftragId).order('erstellt_am', { ascending: true });
    setPositionen((data as PositionRow[]) ?? []);
  }, []);
  const ladeLog = useCallback(async (auftragId: string) => {
    const { data } = await supabase.from('werkstatt_status_log')
      .select('von_status, nach_status, geaendert_am').eq('auftrag_id', auftragId).order('geaendert_am', { ascending: true });
    setLog((data as StatusLogEintrag[]) ?? []);
  }, []);

  // --- Modal öffnen -----------------------------------------------------
  function neu() {
    setForm(LEER); setLog([]); setPositionen([]); setFzSuche(''); setFzNeuAuf(false);
    setFzNeu({ fin: '', kennzeichen: '', hersteller: '', modell: '', halter_name: '' });
    setLeiSuche(''); setLeiOffen(false); setGespeichertHinweis(false);
    setModalAuf(true);
  }
  async function bearbeiten(a: AuftragRow) {
    setForm({
      id: a.id, titel: a.titel ?? '', nummer: a.nummer ?? '', kunde_name: a.kunde_name ?? '',
      kennzeichen: a.kennzeichen ?? '', prioritaet: a.prioritaet ?? 'normal',
      zugesagt_am: a.zugesagt_am ?? '', beschreibung: a.beschreibung ?? '', notiz: a.notiz ?? '',
      fahrzeug_id: a.fahrzeug_id ?? null,
    });
    setFzSuche(''); setFzNeuAuf(false); setLeiSuche(''); setLeiOffen(false); setGespeichertHinweis(false);
    setModalAuf(true);
    await Promise.all([ladePositionen(a.id), ladeLog(a.id)]);
  }
  function setF<K extends keyof Form>(k: K, v: Form[K]) { setForm((f) => ({ ...f, [k]: v })); }

  // --- Kopfdaten speichern (Modal bleibt offen) -------------------------
  async function speichern() {
    if (!uid) return;
    if (!form.titel.trim()) { setFehler('Bitte einen Titel eingeben.'); return; }
    const istNeu = !form.id;
    if (!window.confirm(istNeu ? `Neuen Werkstatt-Auftrag anlegen?\n\n• ${form.titel}` : `Änderungen an "${form.titel}" speichern?`)) return;

    setSpeichert(true); setFehler(null);
    try {
      const payload = {
        owner_user_id: uid, titel: form.titel.trim(), nummer: form.nummer.trim() || null,
        kunde_name: form.kunde_name.trim() || null, kennzeichen: form.kennzeichen.trim() || null,
        prioritaet: form.prioritaet, zugesagt_am: form.zugesagt_am || null,
        beschreibung: form.beschreibung.trim() || null, notiz: form.notiz.trim() || null,
        fahrzeug_id: form.fahrzeug_id, aktualisiert_am: new Date().toISOString(),
      };
      if (istNeu) {
        const { data, error } = await supabase.from('werkstatt_auftraege').insert(payload).select('id').single();
        if (error) throw error;
        setForm((f) => ({ ...f, id: (data as { id: string }).id }));  // in Bearbeiten-Modus wechseln
      } else {
        const { error } = await supabase.from('werkstatt_auftraege').update(payload).eq('id', form.id);
        if (error) throw error;
      }
      setGespeichertHinweis(true);
      setTimeout(() => setGespeichertHinweis(false), 2500);
      await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  // --- Fahrzeug koppeln -------------------------------------------------
  const fzTreffer = useMemo(() => {
    const q = fzSuche.trim().toLowerCase();
    if (!q) return [];
    return fahrzeuge.filter((f) =>
      (f.fin || '').toLowerCase().includes(q) || (f.kennzeichen || '').toLowerCase().includes(q)
    ).slice(0, 6);
  }, [fzSuche, fahrzeuge]);

  async function fahrzeugKoppeln(fzId: string | null) {
    if (!form.id) { setForm((f) => ({ ...f, fahrzeug_id: fzId })); return; }
    try {
      const { error } = await supabase.from('werkstatt_auftraege')
        .update({ fahrzeug_id: fzId, aktualisiert_am: new Date().toISOString() }).eq('id', form.id);
      if (error) throw error;
      setForm((f) => ({ ...f, fahrzeug_id: fzId }));
      setFzSuche('');
      await laden_();
    } catch (e: unknown) {
      setFehler('Fahrzeug-Kopplung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }
  async function fahrzeugNeuAnlegen() {
    if (!uid) return;
    const fin = finNormalisieren(fzNeu.fin);
    if (!fin) { setFehler('Bitte eine FIN eingeben.'); return; }
    if (!finGueltig(fin)) { if (!window.confirm('Die FIN sieht ungewöhnlich aus (nicht 17 Zeichen / enthält I/O/Q). Trotzdem anlegen?')) return; }
    try {
      const { data, error } = await supabase.from('werkstatt_fahrzeuge').insert({
        owner_user_id: uid, fin, kennzeichen: fzNeu.kennzeichen.trim() || null,
        hersteller: fzNeu.hersteller.trim() || null, modell: fzNeu.modell.trim() || null,
        halter_name: fzNeu.halter_name.trim() || null,
      }).select('id').single();
      if (error) throw error;
      setFzNeuAuf(false);
      setFzNeu({ fin: '', kennzeichen: '', hersteller: '', modell: '', halter_name: '' });
      await laden_();
      await fahrzeugKoppeln((data as { id: string }).id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('wfz_fin_owner_unique')) {
        setFehler('Ein Fahrzeug mit dieser FIN existiert bereits — bitte über die Suche auswählen.');
      } else setFehler('Fahrzeug anlegen fehlgeschlagen: ' + msg);
    }
  }
  const gekoppeltesFahrzeug = fahrzeuge.find((f) => f.id === form.fahrzeug_id) || null;

  // --- Positionen -------------------------------------------------------
  const leiTreffer = useMemo(() => {
    const q = leiSuche.trim().toLowerCase();
    const basis = q ? katalog.filter((k) => (k.bezeichnung || '').toLowerCase().includes(q) || (k.kategorie || '').toLowerCase().includes(q)) : katalog;
    return basis.slice(0, 8);
  }, [leiSuche, katalog]);

  async function positionEinfuegen(pos: PositionBasis, katalogId: string | null) {
    if (!uid || !form.id) { setFehler('Bitte zuerst den Auftrag speichern (Anlegen), dann Positionen hinzufügen.'); return; }
    try {
      const { error } = await supabase.from('werkstatt_positionen').insert({
        owner_user_id: uid, auftrag_id: form.id, katalog_id: katalogId,
        art: pos.art ?? 'leistung', bezeichnung: pos.bezeichnung ?? '',
        erfassungsart: pos.erfassungsart ?? 'stunden', menge: pos.menge ?? 1,
        aw_minuten: pos.aw_minuten ?? null, einzelpreis_netto: pos.einzelpreis_netto ?? null,
        extern: pos.extern ?? false, extern_firma: null,
      });
      if (error) throw error;
      await ladePositionen(form.id);
    } catch (e: unknown) {
      setFehler('Position konnte nicht hinzugefügt werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }
  function katalogUebernehmen(k: KatalogRow) {
    const pos = katalogNachPosition(k);
    void positionEinfuegen(pos, k.id);
    setLeiSuche(''); setLeiOffen(false);
  }
  function materialHinzufuegen() {
    void positionEinfuegen({ art: 'material', bezeichnung: '', erfassungsart: 'stueck', menge: 1, einzelpreis_netto: null }, null);
  }
  function fremdleistungHinzufuegen() {
    void positionEinfuegen({ art: 'fremdleistung', bezeichnung: '', erfassungsart: 'stueck', menge: 1, einzelpreis_netto: null, extern: true }, null);
  }
  async function positionAendern(id: string, patch: Partial<PositionRow>) {
    setPositionen((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      await supabase.from('werkstatt_positionen').update({ ...patch, aktualisiert_am: new Date().toISOString() }).eq('id', id);
    } catch { /* Feld-Fehler still; UI bleibt konsistent */ }
  }
  async function positionEntfernen(p: PositionRow) {
    if (!window.confirm(`Position "${p.bezeichnung || 'ohne Bezeichnung'}" entfernen?`)) return;
    try {
      const { error } = await supabase.from('werkstatt_positionen').delete().eq('id', p.id);
      if (error) throw error;
      if (form.id) await ladePositionen(form.id);
    } catch (e: unknown) {
      setFehler('Entfernen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // --- Status weiterrücken (+ Log) --------------------------------------
  async function weiterruecken(a: AuftragRow) {
    if (!uid) return;
    const naechster = naechsterStatus(a.status);
    if (!naechster) return;
    if (!window.confirm(`Auftrag "${a.titel}" weiterrücken?\n\n${statusDef(a.status).label} → ${statusDef(naechster).label}`)) return;
    try {
      const update: Record<string, unknown> = { status: naechster, aktualisiert_am: new Date().toISOString() };
      if (istAbgeschlossen(naechster) && !a.fertig_am) update.fertig_am = new Date().toISOString();
      const { error: e1 } = await supabase.from('werkstatt_auftraege').update(update).eq('id', a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('werkstatt_status_log').insert({
        owner_user_id: uid, auftrag_id: a.id, von_status: a.status, nach_status: naechster, geaendert_von: uid,
      });
      if (e2) throw e2;
      await laden_();
    } catch (e: unknown) {
      setFehler('Weiterrücken fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }
  async function archivieren(a: AuftragRow) {
    if (!window.confirm(`Auftrag "${a.titel}" archivieren?\n\nDer Verlauf bleibt erhalten.`)) return;
    try {
      const { error } = await supabase.from('werkstatt_auftraege').update({ archiviert: true, aktualisiert_am: new Date().toISOString() }).eq('id', a.id);
      if (error) throw error;
      setModalAuf(false); await laden_();
    } catch (e: unknown) {
      setFehler('Archivieren fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // --- Kennzahlen -------------------------------------------------------
  const spalten = gruppiereBoard(auftraege);
  const offen = zaehleOffen(auftraege);
  const inArbeit = auftraege.filter((a) => a.status === 'in_arbeit').length;
  const abg = auftraege.filter((a) => istAbgeschlossen(a.status) && a.fertig_am);
  const oDurchlauf = abg.length > 0 ? dauerTextMinuten(Math.round(abg.reduce((s, a) => s + durchlaufzeitMinuten(a), 0) / abg.length)) : '—';

  const summe = auftragsSumme(positionen);
  const kiKontext = auftraege.length === 0 ? '' :
    `${auftraege.length} Werkstatt-Aufträge, ${offen} offen, ${inArbeit} in Arbeit. Ø Durchlaufzeit: ${oDurchlauf}.`;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Service</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Werkstatt-Durchlauf</h1>
          <p style={styles.sub}>Aufträge führen, Leistungen erfassen, Fahrzeughistorie aufbauen — mit automatischer Durchlaufzeit.</p>
        </div>
        <button onClick={neu} style={styles.primaerBtn}>+ Neuer Auftrag</button>
      </div>

      {!laden && (
        <div style={styles.summenGrid}>
          <SummeKarte label="Aufträge" value={String(auftraege.length)} accent={C.cyan} />
          <SummeKarte label="Offen" value={String(offen)} accent={offen > 0 ? C.warn : C.green} />
          <SummeKarte label="In Arbeit" value={String(inArbeit)} accent={C.gold} />
          <SummeKarte label="Ø Durchlaufzeit" value={oDurchlauf} accent={C.green} />
        </div>
      )}

      {!laden && kiKontext && (
        <KiAuge modul="Werkstatt-Durchlauf" kontext={kiKontext} aktionHref="/dashboard/werkstatt" aktionText="Zum Werkstatt-Board" />
      )}

      {fehler && <div style={styles.err}>{fehler}</div>}

      {laden ? (
        <div style={styles.hint}>Lädt …</div>
      ) : auftraege.length === 0 ? (
        <div style={styles.card}><div style={styles.hint}>Noch keine Aufträge. Leg oben rechts den ersten an.</div></div>
      ) : (
        <div style={styles.board}>
          {spalten.map(({ def, auftraege: liste }) => (
            <div key={def.wert} style={styles.spalte}>
              <div style={{ ...styles.spalteKopf, borderTopColor: def.farbe }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: def.farbe, display: 'inline-block' }} />
                <span style={{ fontWeight: 700 }}>{def.label}</span>
                <span style={{ color: C.textDim, fontSize: 12, marginLeft: 'auto' }}>{liste.length}</span>
              </div>
              <div style={styles.spalteBody}>
                {liste.length === 0 ? <div style={{ color: C.textDim, fontSize: 12, padding: '8px 4px' }}>—</div> : (
                  liste.map((a) => {
                    const ampel = dringlichkeitsAmpel(a);
                    const naechster = naechsterStatus(a.status);
                    const fz = fahrzeuge.find((f) => f.id === a.fahrzeug_id);
                    return (
                      <div key={a.id} style={styles.karte}>
                        <button onClick={() => bearbeiten(a)} style={styles.karteHaupt} title="Details / Bearbeiten">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: ampel.farbe, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titel}</span>
                          </div>
                          {(a.kunde_name || a.kennzeichen || fz) && (
                            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>
                              {[a.kunde_name, fz ? (fz.kennzeichen || fz.fin.slice(-6)) : a.kennzeichen].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                            <span style={{ color: ampel.farbe }}>{ampel.label}</span>
                            <span style={{ color: C.textDim }}>{durchlaufzeitText(a)}</span>
                          </div>
                        </button>
                        {naechster && (
                          <button onClick={() => weiterruecken(a)} style={styles.weiterBtn} title={`→ ${statusDef(naechster).label}`}>
                            → {statusDef(naechster).label}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.rechtHinweis}>
        Jeder Phasenwechsel wird protokolliert. Leistungen kommen aus dem Leistungskatalog und lassen sich je Auftrag anpassen. Fahrzeuge werden über die FIN dauerhaft geführt — auch bei Halterwechsel.
      </div>

      {/* --- Modal --------------------------------------------------- */}
      {modalAuf && (
        <div style={styles.overlay} onClick={() => !speichert && setModalAuf(false)}>
          <div style={{ ...styles.modal, maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ ...styles.modalTitel, margin: 0 }}>{form.id ? 'Auftrag bearbeiten' : 'Neuer Werkstatt-Auftrag'}</h2>
              {gespeichertHinweis && <span style={{ color: C.green, fontSize: 13 }}>✓ gespeichert</span>}
            </div>

            {/* Kopfdaten */}
            <div style={styles.formGrid}>
              <Feld label="Titel *" voll>
                <input style={styles.input} value={form.titel} onChange={(e) => setF('titel', e.target.value)} placeholder="z. B. Großer Service / Reparatur Motorsäge" />
              </Feld>
              <Feld label="Kunde">
                <input style={styles.input} value={form.kunde_name} onChange={(e) => setF('kunde_name', e.target.value)} />
              </Feld>
              <Feld label="Auftrags-Nr.">
                <input style={styles.input} value={form.nummer} onChange={(e) => setF('nummer', e.target.value)} />
              </Feld>
              <Feld label="Priorität">
                <select style={styles.input} value={form.prioritaet} onChange={(e) => setF('prioritaet', e.target.value)}>
                  {PRIO_OPTIONEN.map((o) => <option key={o.wert} value={o.wert}>{o.label}</option>)}
                </select>
              </Feld>
              <Feld label="Zugesagt bis">
                <input type="date" style={styles.input} value={form.zugesagt_am} onChange={(e) => setF('zugesagt_am', e.target.value)} />
              </Feld>
              <Feld label="Beschreibung" voll>
                <textarea style={{ ...styles.input, minHeight: 50, resize: 'vertical' }} value={form.beschreibung} onChange={(e) => setF('beschreibung', e.target.value)} />
              </Feld>
            </div>

            {!form.id ? (
              <div style={styles.infoBox}>Kopfdaten unten mit „Anlegen" speichern — danach kannst du Fahrzeug und Leistungen hinzufügen.</div>
            ) : (
              <>
                {/* Fahrzeug (optional) */}
                <div style={styles.sektion}>
                  <div style={styles.sektionTitel}>🚗 Fahrzeug <span style={{ color: C.textDim, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
                  {gekoppeltesFahrzeug ? (
                    <div style={styles.fzKarte}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{[gekoppeltesFahrzeug.hersteller, gekoppeltesFahrzeug.modell].filter(Boolean).join(' ') || 'Fahrzeug'}</div>
                        <div style={{ fontSize: 12, color: C.textDim }}>FIN {gekoppeltesFahrzeug.fin}{gekoppeltesFahrzeug.kennzeichen ? ` · ${gekoppeltesFahrzeug.kennzeichen}` : ''}</div>
                      </div>
                      <button onClick={() => fahrzeugKoppeln(null)} style={styles.miniBtnGhost}>Entkoppeln</button>
                    </div>
                  ) : (
                    <>
                      <input style={styles.input} value={fzSuche} onChange={(e) => setFzSuche(e.target.value)} placeholder="Fahrzeug suchen (FIN oder Kennzeichen) …" />
                      {fzTreffer.length > 0 && (
                        <div style={styles.dropdown}>
                          {fzTreffer.map((f) => (
                            <button key={f.id} onClick={() => fahrzeugKoppeln(f.id)} style={styles.dropdownItem}>
                              <span style={{ fontWeight: 600 }}>{[f.hersteller, f.modell].filter(Boolean).join(' ') || 'Fahrzeug'}</span>
                              <span style={{ color: C.textDim, fontSize: 12 }}> · {f.kennzeichen || f.fin}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {!fzNeuAuf ? (
                        <button onClick={() => setFzNeuAuf(true)} style={{ ...styles.miniBtnGhost, marginTop: 8, marginLeft: 0 }}>+ Neues Fahrzeug anlegen</button>
                      ) : (
                        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <Feld label="FIN *"><input style={styles.input} value={fzNeu.fin} onChange={(e) => setFzNeu((f) => ({ ...f, fin: e.target.value }))} placeholder="17-stellig" /></Feld>
                          <Feld label="Kennzeichen"><input style={styles.input} value={fzNeu.kennzeichen} onChange={(e) => setFzNeu((f) => ({ ...f, kennzeichen: e.target.value }))} /></Feld>
                          <Feld label="Hersteller"><input style={styles.input} value={fzNeu.hersteller} onChange={(e) => setFzNeu((f) => ({ ...f, hersteller: e.target.value }))} placeholder="z. B. Mercedes-Benz" /></Feld>
                          <Feld label="Modell"><input style={styles.input} value={fzNeu.modell} onChange={(e) => setFzNeu((f) => ({ ...f, modell: e.target.value }))} placeholder="z. B. C-Klasse" /></Feld>
                          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setFzNeuAuf(false)} style={styles.miniBtnGhost}>Abbrechen</button>
                            <button onClick={fahrzeugNeuAnlegen} style={styles.miniBtn}>Anlegen & koppeln</button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Leistungen / Positionen */}
                <div style={styles.sektion}>
                  <div style={styles.sektionTitel}>🧰 Leistungen &amp; Material</div>
                  <div style={{ position: 'relative' }}>
                    <input style={styles.input} value={leiSuche}
                      onFocus={() => setLeiOffen(true)}
                      onChange={(e) => { setLeiSuche(e.target.value); setLeiOffen(true); }}
                      placeholder="▾ Leistung aus Katalog suchen & übernehmen …" />
                    {leiOffen && (
                      <div style={styles.dropdown}>
                        {leiTreffer.length === 0 ? (
                          <div style={{ padding: '10px 12px', color: C.textDim, fontSize: 13 }}>Keine passende Leistung. Katalog unter „Leistungskatalog" pflegen.</div>
                        ) : leiTreffer.map((k) => (
                          <button key={k.id} onClick={() => katalogUebernehmen(k)} style={styles.dropdownItem}>
                            <span style={{ fontWeight: 600 }}>{k.bezeichnung}</span>
                            <span style={{ color: C.textDim, fontSize: 12 }}>
                              {' · '}{k.kategorie || 'ohne Kat.'}{k.stundensatz_netto != null ? ` · ${eur(k.stundensatz_netto)}/h` : (k.festpreis_netto != null ? ` · ${eur(k.festpreis_netto)}` : '')}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={materialHinzufuegen} style={styles.miniBtnGhost}>+ Material</button>
                    <button onClick={fremdleistungHinzufuegen} style={styles.miniBtnGhost}>+ Fremdleistung</button>
                    {leiOffen && <button onClick={() => setLeiOffen(false)} style={{ ...styles.miniBtnGhost, marginLeft: 'auto' }}>Liste schließen</button>}
                  </div>

                  {positionen.length > 0 && (
                    <div style={{ overflowX: 'auto', marginTop: 12 }}>
                      <table style={styles.posTable}>
                        <thead>
                          <tr>
                            <th style={styles.posTh}>Bezeichnung</th>
                            <th style={{ ...styles.posTh, width: 80 }}>Menge</th>
                            <th style={{ ...styles.posTh, width: 90 }}>Einheit</th>
                            <th style={{ ...styles.posTh, width: 100, textAlign: 'right' }}>Satz/Preis</th>
                            <th style={{ ...styles.posTh, width: 90, textAlign: 'right' }}>Zeit</th>
                            <th style={{ ...styles.posTh, width: 90, textAlign: 'right' }}>Betrag</th>
                            <th style={{ ...styles.posTh, width: 36 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {positionen.map((p) => {
                            const min = positionsMinuten(p);
                            const betrag = positionsBetrag(p);
                            return (
                              <tr key={p.id}>
                                <td style={styles.posTd}>
                                  <input style={styles.posInput} defaultValue={p.bezeichnung ?? ''} onBlur={(e) => positionAendern(p.id, { bezeichnung: e.target.value })} />
                                  {p.extern && <span style={styles.externBadge}>extern</span>}
                                </td>
                                <td style={styles.posTd}>
                                  <input style={{ ...styles.posInput, textAlign: 'right' }} defaultValue={String(p.menge ?? 1)} onBlur={(e) => positionAendern(p.id, { menge: num(e.target.value) ?? 0 })} />
                                </td>
                                <td style={styles.posTd}>
                                  <select style={styles.posInput} value={p.erfassungsart ?? 'stunden'} onChange={(e) => positionAendern(p.id, { erfassungsart: e.target.value })}>
                                    {ART_ERFASSUNG.map((o) => <option key={o.wert} value={o.wert}>{o.label}</option>)}
                                  </select>
                                </td>
                                <td style={styles.posTd}>
                                  <input style={{ ...styles.posInput, textAlign: 'right' }} defaultValue={p.einzelpreis_netto != null ? String(p.einzelpreis_netto) : ''} placeholder="—" onBlur={(e) => positionAendern(p.id, { einzelpreis_netto: num(e.target.value) })} />
                                </td>
                                <td style={{ ...styles.posTd, textAlign: 'right', color: C.textDim }}>{min > 0 ? zeitText(min) : '—'}</td>
                                <td style={{ ...styles.posTd, textAlign: 'right', color: C.gold }}>{betrag != null ? eur(betrag) : '—'}</td>
                                <td style={{ ...styles.posTd, textAlign: 'center' }}>
                                  <button onClick={() => positionEntfernen(p)} style={styles.xBtn} title="Entfernen">✕</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Live-Summe */}
                  <div style={styles.summeZeile}>
                    <span>Summe: <strong>{zeitText(summe.gesamtMinuten)}</strong> Arbeitszeit</span>
                    <span style={{ color: C.gold }}>
                      {summe.gesamtBetrag != null ? eur(summe.gesamtBetrag) + ' netto' : 'Betrag unvollständig (Preise fehlen)'}
                    </span>
                  </div>
                </div>

                {/* Anhänge am Auftrag (Fotos vom Besuch, Belege) */}
                <div style={styles.sektion}>
                  <AnhaengeBox bezug="auftrag" bezugId={form.id} titel="Anhänge zum Auftrag (Fotos, Belege)" />
                </div>

                {/* Verweildauer je Phase */}
                {(() => {
                  const a = auftraege.find((x) => x.id === form.id);
                  if (!a) return null;
                  const phasen = verweildauerJePhase(a, log);
                  if (phasen.length === 0) return null;
                  return (
                    <div style={styles.sektion}>
                      <div style={styles.sektionTitel}>⏱ Durchlauf · gesamt {durchlaufzeitText(a)}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {phasen.map((ph) => (
                          <div key={ph.status} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: ph.farbe, display: 'inline-block' }} />
                            <span style={{ minWidth: 110 }}>{ph.label}</span>
                            <span style={{ color: C.textDim }}>{dauerTextMinuten(ph.minuten)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            <div style={styles.modalAktionen}>
              {form.id && (
                <button onClick={() => { const a = auftraege.find((x) => x.id === form.id); if (a) archivieren(a); }} disabled={speichert}
                  style={{ ...styles.ghostBtn, color: C.textDim, marginRight: 'auto' }}>Archivieren</button>
              )}
              <button onClick={() => setModalAuf(false)} disabled={speichert} style={styles.ghostBtn}>{form.id ? 'Schließen' : 'Abbrechen'}</button>
              <button onClick={speichern} disabled={speichert} style={{ ...styles.primaerBtn, opacity: speichert ? 0.6 : 1 }}>
                {speichert ? 'Speichert …' : (form.id ? 'Kopfdaten speichern' : 'Anlegen')}
              </button>
            </div>
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
  miniBtn: { background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', marginLeft: 6 },

  summenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  summeLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800 },

  board: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(190px, 1fr))', gap: 12, overflowX: 'auto', paddingBottom: 8 },
  spalte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, display: 'flex', flexDirection: 'column', minHeight: 200 },
  spalteKopf: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderTop: '3px solid', borderTopLeftRadius: 14, borderTopRightRadius: 14, fontSize: 14 },
  spalteBody: { padding: '4px 10px 12px', display: 'flex', flexDirection: 'column', gap: 8 },
  karte: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' },
  karteHaupt: { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: C.text, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  weiterBtn: { display: 'block', width: '100%', background: 'rgba(0,229,255,0.08)', color: C.cyan, border: 'none', borderTop: `1px solid ${C.border}`, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  hint: { color: C.textDim, fontSize: 14, padding: '14px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  rechtHinweis: { marginTop: 16, fontSize: 12, color: C.textDim, lineHeight: 1.5, maxWidth: 760 },
  infoBox: { marginTop: 16, padding: '12px 14px', background: 'rgba(0,229,255,0.08)', border: `1px solid rgba(0,229,255,0.25)`, borderRadius: 10, fontSize: 13.5, color: C.text },

  sektion: { marginTop: 18, padding: 16, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12 },
  sektionTitel: { fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 12, color: C.text, textTransform: 'uppercase', letterSpacing: 1 },
  fzKarte: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' },

  dropdown: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 10, marginTop: 6, overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,0.4)' },
  dropdownItem: { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `1px solid rgba(143,163,190,0.08)`, color: C.text, padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 },

  posTable: { width: '100%', borderCollapse: 'collapse', minWidth: 560 },
  posTh: { textAlign: 'left', padding: '6px 8px', fontSize: 10.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  posTd: { padding: '5px 8px', fontSize: 13, borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  posInput: { width: '100%', boxSizing: 'border-box', background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 13, fontFamily: 'inherit' },
  externBadge: { marginLeft: 6, fontSize: 10, color: C.lila, border: `1px solid ${C.lila}`, borderRadius: 5, padding: '1px 5px' },
  xBtn: { background: 'transparent', color: C.textDim, border: 'none', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' },
  summeZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 14 },

  lbl: { display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 640, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, margin: '0 0 18px', color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, alignItems: 'center' },
};
