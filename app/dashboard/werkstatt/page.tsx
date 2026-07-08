'use client';

// ============================================================
// ARGONAUT OS · Phase 2 · Modul D · Block D.3 · Werkstatt-Durchlauf
// Kanban-Board (Angenommen → In Arbeit → Wartet → Fertig → Abgeholt).
// Karten mit Dringlichkeits-Ampel + Durchlaufzeit. "→ weiterrücken" schreibt
// automatisch ins werkstatt_status_log (Verweildauer-Analyse) und setzt
// fertig_am beim Abschluss. Generisch: Kfz, Reparatur, Auftragsfertigung.
// Bestätigung vor jedem DB-Schreiben. Design 1:1 wie das übrige Dashboard.
// Pfad: app/dashboard/werkstatt/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import {
  STATUS_PHASEN, statusDef, gruppiereBoard, naechsterStatus, istAbgeschlossen,
  durchlaufzeitText, durchlaufzeitMinuten, dauerTextMinuten, dringlichkeitsAmpel,
  verweildauerJePhase, zaehleOffen,
  type WerkstattStatus, type StatusLogEintrag,
} from '../_components/werkstattLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666', lila: '#A855F7',
};

// --- DB-Typ -------------------------------------------------------------
type AuftragRow = {
  id: string;
  owner_user_id: string;
  nummer: string | null;
  titel: string;
  beschreibung: string | null;
  kunde_name: string | null;
  kennzeichen: string | null;
  status: string;
  prioritaet: string;
  angenommen_am: string;
  fertig_am: string | null;
  zugesagt_am: string | null;
  notiz: string | null;
  archiviert: boolean;
};

const PRIO_OPTIONEN = [
  { wert: 'normal', label: 'Normal' },
  { wert: 'hoch', label: 'Hoch' },
  { wert: 'dringend', label: 'Dringend' },
];

// --- Formular -----------------------------------------------------------
type Form = {
  id: string | null;
  titel: string; nummer: string; kunde_name: string; kennzeichen: string;
  prioritaet: string; zugesagt_am: string; beschreibung: string; notiz: string;
};
const LEER: Form = {
  id: null, titel: '', nummer: '', kunde_name: '', kennzeichen: '',
  prioritaet: 'normal', zugesagt_am: '', beschreibung: '', notiz: '',
};

function datumHuebsch(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

export default function WerkstattPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [auftraege, setAuftraege] = useState<AuftragRow[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [modalAuf, setModalAuf] = useState(false);
  const [form, setForm] = useState<Form>(LEER);
  const [speichert, setSpeichert] = useState(false);

  // Verweildauer-Log des gerade bearbeiteten Auftrags
  const [log, setLog] = useState<StatusLogEintrag[]>([]);

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
      const { data, error } = await supabase
        .from('werkstatt_auftraege').select('*')
        .eq('owner_user_id', uid).eq('archiviert', false)
        .order('angenommen_am', { ascending: true });
      if (error) throw error;
      setAuftraege((data as AuftragRow[]) ?? []);
    } catch (e: unknown) {
      setFehler('Aufträge konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid]);

  useEffect(() => { void laden_(); }, [laden_]);

  // --- Anlegen / Bearbeiten ---------------------------------------------
  function neu() { setForm(LEER); setLog([]); setModalAuf(true); }
  async function bearbeiten(a: AuftragRow) {
    setForm({
      id: a.id, titel: a.titel ?? '', nummer: a.nummer ?? '', kunde_name: a.kunde_name ?? '',
      kennzeichen: a.kennzeichen ?? '', prioritaet: a.prioritaet ?? 'normal',
      zugesagt_am: a.zugesagt_am ?? '', beschreibung: a.beschreibung ?? '', notiz: a.notiz ?? '',
    });
    setModalAuf(true);
    // Verweildauer-Log dieses Auftrags laden
    try {
      const { data } = await supabase.from('werkstatt_status_log')
        .select('von_status, nach_status, geaendert_am')
        .eq('auftrag_id', a.id).order('geaendert_am', { ascending: true });
      setLog((data as StatusLogEintrag[]) ?? []);
    } catch { setLog([]); }
  }
  function setF<K extends keyof Form>(k: K, v: Form[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function speichern() {
    if (!uid) return;
    if (!form.titel.trim()) { setFehler('Bitte einen Titel eingeben.'); return; }
    const istNeu = !form.id;
    if (!window.confirm(istNeu ? `Neuen Werkstatt-Auftrag anlegen?\n\n• ${form.titel}` : `Änderungen an "${form.titel}" speichern?`)) return;

    setSpeichert(true); setFehler(null);
    try {
      const payload = {
        owner_user_id: uid,
        titel: form.titel.trim(),
        nummer: form.nummer.trim() || null,
        kunde_name: form.kunde_name.trim() || null,
        kennzeichen: form.kennzeichen.trim() || null,
        prioritaet: form.prioritaet,
        zugesagt_am: form.zugesagt_am || null,
        beschreibung: form.beschreibung.trim() || null,
        notiz: form.notiz.trim() || null,
        aktualisiert_am: new Date().toISOString(),
      };
      if (istNeu) {
        const { error } = await supabase.from('werkstatt_auftraege').insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('werkstatt_auftraege').update(payload).eq('id', form.id);
        if (error) throw error;
      }
      setModalAuf(false); setForm(LEER);
      await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  // --- Status weiterrücken (+ Log schreiben) ----------------------------
  async function weiterruecken(a: AuftragRow) {
    if (!uid) return;
    const naechster = naechsterStatus(a.status);
    if (!naechster) return;
    const vonLabel = statusDef(a.status).label;
    const nachLabel = statusDef(naechster).label;
    if (!window.confirm(`Auftrag "${a.titel}" weiterrücken?\n\n${vonLabel} → ${nachLabel}`)) return;

    try {
      // 1) Auftrag-Status setzen (+ fertig_am beim Abschluss)
      const update: Record<string, unknown> = { status: naechster, aktualisiert_am: new Date().toISOString() };
      if (istAbgeschlossen(naechster) && !a.fertig_am) update.fertig_am = new Date().toISOString();
      const { error: e1 } = await supabase.from('werkstatt_auftraege').update(update).eq('id', a.id);
      if (e1) throw e1;

      // 2) Status-Log-Eintrag (für Verweildauer-Analyse)
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
      const { error } = await supabase.from('werkstatt_auftraege')
        .update({ archiviert: true, aktualisiert_am: new Date().toISOString() }).eq('id', a.id);
      if (error) throw error;
      setModalAuf(false);
      await laden_();
    } catch (e: unknown) {
      setFehler('Archivieren fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // --- Kennzahlen -------------------------------------------------------
  const spalten = gruppiereBoard(auftraege);
  const offen = zaehleOffen(auftraege);
  const inArbeit = auftraege.filter((a) => a.status === 'in_arbeit').length;
  const abgeschlosseneMitZeit = auftraege.filter((a) => istAbgeschlossen(a.status) && a.fertig_am);
  const oDurchlauf = abgeschlosseneMitZeit.length > 0
    ? dauerTextMinuten(Math.round(abgeschlosseneMitZeit.reduce((s, a) => s + durchlaufzeitMinuten(a), 0) / abgeschlosseneMitZeit.length))
    : '—';

  const kiKontext = auftraege.length === 0
    ? ''
    : `${auftraege.length} Werkstatt-Aufträge, davon ${offen} offen, ${inArbeit} in Arbeit. Durchschnittliche Durchlaufzeit abgeschlossener: ${oDurchlauf}.`;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Service</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Werkstatt-Durchlauf</h1>
          <p style={styles.sub}>Aufträge durch die Phasen führen — mit automatischer Durchlaufzeit-Messung.</p>
        </div>
        <button onClick={neu} style={styles.primaerBtn}>+ Neuer Auftrag</button>
      </div>

      {/* Kopf-Kacheln */}
      {!laden && (
        <div style={styles.summenGrid}>
          <SummeKarte label="Aufträge" value={String(auftraege.length)} accent={C.cyan} />
          <SummeKarte label="Offen" value={String(offen)} accent={offen > 0 ? C.warn : C.green} />
          <SummeKarte label="In Arbeit" value={String(inArbeit)} accent={C.gold} />
          <SummeKarte label="Ø Durchlaufzeit" value={oDurchlauf} accent={C.green} />
        </div>
      )}

      {/* KI-Auge (on-demand) */}
      {!laden && kiKontext && (
        <KiAuge modul="Werkstatt-Durchlauf" kontext={kiKontext} aktionHref="/dashboard/werkstatt" aktionText="Zum Werkstatt-Board" />
      )}

      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Kanban-Board */}
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
                {liste.length === 0 ? (
                  <div style={{ color: C.textDim, fontSize: 12, padding: '8px 4px' }}>—</div>
                ) : (
                  liste.map((a) => {
                    const ampel = dringlichkeitsAmpel(a);
                    const naechster = naechsterStatus(a.status);
                    return (
                      <div key={a.id} style={styles.karte}>
                        <button onClick={() => bearbeiten(a)} style={styles.karteHaupt} title="Details / Bearbeiten">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: ampel.farbe, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titel}</span>
                          </div>
                          {(a.kunde_name || a.kennzeichen) && (
                            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>
                              {[a.kunde_name, a.kennzeichen].filter(Boolean).join(' · ')}
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
        Jeder Phasenwechsel wird protokolliert — so misst ARGONAUT automatisch die Durchlaufzeit und zeigt, wo Aufträge liegenbleiben.
      </div>

      {/* --- Modal: Anlegen/Bearbeiten --------------------------------- */}
      {modalAuf && (
        <div style={styles.overlay} onClick={() => !speichert && setModalAuf(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>{form.id ? 'Auftrag bearbeiten' : 'Neuer Werkstatt-Auftrag'}</h2>

            <div style={styles.formGrid}>
              <Feld label="Titel *" voll>
                <input style={styles.input} value={form.titel} onChange={(e) => setF('titel', e.target.value)} placeholder="z. B. Ölwechsel + Inspektion / Reparatur Motorsäge Stihl" />
              </Feld>
              <Feld label="Kunde">
                <input style={styles.input} value={form.kunde_name} onChange={(e) => setF('kunde_name', e.target.value)} placeholder="Name (frei)" />
              </Feld>
              <Feld label="Kennzeichen / Objekt">
                <input style={styles.input} value={form.kennzeichen} onChange={(e) => setF('kennzeichen', e.target.value)} placeholder="z. B. BB-XY 123" />
              </Feld>
              <Feld label="Auftrags-Nr.">
                <input style={styles.input} value={form.nummer} onChange={(e) => setF('nummer', e.target.value)} />
              </Feld>
              <Feld label="Priorität">
                <select style={styles.input} value={form.prioritaet} onChange={(e) => setF('prioritaet', e.target.value)}>
                  {PRIO_OPTIONEN.map((o) => <option key={o.wert} value={o.wert}>{o.label}</option>)}
                </select>
              </Feld>
              <Feld label="Zugesagt bis (optional)">
                <input type="date" style={styles.input} value={form.zugesagt_am} onChange={(e) => setF('zugesagt_am', e.target.value)} />
              </Feld>
              <Feld label="Beschreibung" voll>
                <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} value={form.beschreibung} onChange={(e) => setF('beschreibung', e.target.value)} />
              </Feld>
              <Feld label="Interne Notiz" voll>
                <textarea style={{ ...styles.input, minHeight: 50, resize: 'vertical' }} value={form.notiz} onChange={(e) => setF('notiz', e.target.value)} />
              </Feld>
            </div>

            {/* Verweildauer je Phase (nur beim Bearbeiten, wenn Log vorhanden) */}
            {form.id && (() => {
              const a = auftraege.find((x) => x.id === form.id);
              if (!a) return null;
              const phasen = verweildauerJePhase(a, log);
              return (
                <div style={styles.verlauf}>
                  <div style={{ fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    Durchlauf · gesamt {durchlaufzeitText(a)}
                  </div>
                  {phasen.length === 0 ? (
                    <div style={{ fontSize: 13, color: C.textDim }}>Noch keine Phasenwechsel protokolliert.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {phasen.map((p) => (
                        <div key={p.status} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.farbe, display: 'inline-block' }} />
                          <span style={{ minWidth: 110 }}>{p.label}</span>
                          <span style={{ color: C.textDim }}>{dauerTextMinuten(p.minuten)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={styles.modalAktionen}>
              {form.id && (
                <button onClick={() => { const a = auftraege.find((x) => x.id === form.id); if (a) archivieren(a); }} disabled={speichert}
                  style={{ ...styles.ghostBtn, color: C.textDim, marginRight: 'auto' }}>Archivieren</button>
              )}
              <button onClick={() => setModalAuf(false)} disabled={speichert} style={styles.ghostBtn}>Abbrechen</button>
              <button onClick={speichern} disabled={speichert} style={{ ...styles.primaerBtn, opacity: speichert ? 0.6 : 1 }}>
                {speichert ? 'Speichert …' : (form.id ? 'Speichern' : 'Anlegen')}
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
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 640, lineHeight: 1.5 },

  primaerBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' },

  summenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  summeLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800 },

  // Board
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
  rechtHinweis: { marginTop: 16, fontSize: 12, color: C.textDim, lineHeight: 1.5, maxWidth: 720 },

  verlauf: { marginTop: 18, padding: 14, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 640, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, margin: '0 0 18px', color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  lbl: { display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, alignItems: 'center' },
};
