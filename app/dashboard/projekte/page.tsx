'use client';

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · MODUL PROJEKTE · P2 — Projekt-Liste + Anlegen
// ============================================================

const BRAND = {
  navy: '#0A1628',
  navy2: '#0F1F33',
  gold: '#C9A84C',
  cyan: '#00e5ff',
  green: '#4CAF7D',
  danger: '#E06666',
  warn: '#E0A24C',
  textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)',
};

const FARB_PRESETS = [
  { name: 'Cyan', wert: '#00e5ff' },
  { name: 'Gold', wert: '#C9A84C' },
  { name: 'Grün', wert: '#4CAF7D' },
  { name: 'Orange', wert: '#E0A24C' },
  { name: 'Rot', wert: '#E06666' },
  { name: 'Blau', wert: '#5A8DEE' },
];

const STATUS_META: Record<string, { label: string; farbe: string }> = {
  aktiv: { label: 'Aktiv', farbe: '#4CAF7D' },
  pausiert: { label: 'Pausiert', farbe: '#E0A24C' },
  abgeschlossen: { label: 'Abgeschlossen', farbe: '#5A8DEE' },
  abgebrochen: { label: 'Abgebrochen', farbe: '#E06666' },
};

const PRIO_META: Record<string, { label: string; farbe: string }> = {
  niedrig: { label: 'Niedrig', farbe: '#8FA3BE' },
  normal: { label: 'Normal', farbe: '#8FA3BE' },
  hoch: { label: 'Hoch', farbe: '#E0A24C' },
  dringend: { label: 'Dringend', farbe: '#E06666' },
};

function dStr(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; }
}

function leeresProjekt(): any {
  return {
    id: null,
    name: '',
    beschreibung: '',
    status: 'aktiv',
    prioritaet: 'normal',
    start_datum: '',
    end_datum: '',
    budget: '',
    verantwortlich: '',
    farbe: '#00e5ff',
  };
}

type Projekt = any;
type Aufgabe = any;

export default function ProjektePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('alle');
  const [zeigeArchiv, setZeigeArchiv] = useState(false);

  const [modal, setModal] = useState<any | null>(null);
  const [speichern, setSpeichern] = useState(false);

  // Vorlagen
  const [vorlagen, setVorlagen] = useState<any[]>([]);
  const [vorlagenModal, setVorlagenModal] = useState(false);
  const [ausVorlage, setAusVorlage] = useState<any | null>(null); // {vorlage, name}
  const [erstellen, setErstellen] = useState(false);

  const ladeDaten = useCallback(async () => {
    setLaden(true);
    setFehler('');
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setOwnerId(uid);

      const [projRes, aufgRes, vorlRes, vAufgRes] = await Promise.all([
        supabase.from('projekte').select('*').eq('owner_user_id', uid)
          .order('erstellt_am', { ascending: false }),
        supabase.from('aufgaben').select('id,projekt_id,erledigt,status').eq('owner_user_id', uid),
        supabase.from('projekt_vorlagen').select('*').eq('owner_user_id', uid)
          .order('erstellt_am', { ascending: false }),
        supabase.from('vorlagen_aufgaben').select('id,vorlage_id').eq('owner_user_id', uid),
      ]);
      setProjekte(projRes.data || []);
      setAufgaben(aufgRes.data || []);
      // Vorlagen mit Aufgaben-Anzahl anreichern
      const zaehl: Record<string, number> = {};
      (vAufgRes.data || []).forEach((r: any) => { zaehl[r.vorlage_id] = (zaehl[r.vorlage_id] || 0) + 1; });
      setVorlagen((vorlRes.data || []).map((v: any) => ({ ...v, anzahlAufgaben: zaehl[v.id] || 0 })));
    } catch (e: any) {
      setFehler(e?.message || 'Fehler beim Laden.');
    } finally {
      setLaden(false);
    }
  }, [supabase]);

  useEffect(() => { void ladeDaten(); }, [ladeDaten]);

  // Fortschritt eines Projekts aus erledigten Aufgaben
  function fortschritt(projektId: string): { erledigt: number; gesamt: number; pct: number } {
    const eigene = aufgaben.filter((a) => a.projekt_id === projektId);
    const gesamt = eigene.length;
    const erledigt = eigene.filter((a) => a.erledigt || a.status === 'fertig').length;
    const pct = gesamt > 0 ? Math.round((erledigt / gesamt) * 100) : 0;
    return { erledigt, gesamt, pct };
  }

  function oeffneNeu() { setModal(leeresProjekt()); }  function oeffneBearbeiten(p: Projekt) {
    setModal({
      id: p.id,
      name: p.name || '',
      beschreibung: p.beschreibung || '',
      status: p.status || 'aktiv',
      prioritaet: p.prioritaet || 'normal',
      start_datum: p.start_datum || '',
      end_datum: p.end_datum || '',
      budget: p.budget ?? '',
      verantwortlich: p.verantwortlich || '',
      farbe: p.farbe || '#00e5ff',
    });
  }

  async function speichereProjekt() {
    if (!modal) return;
    if (!modal.name.trim()) { alert('Bitte einen Projektnamen eingeben.'); return; }
    setSpeichern(true);
    try {
      const datensatz = {
        owner_user_id: ownerId,
        name: modal.name.trim(),
        beschreibung: modal.beschreibung || null,
        status: modal.status,
        prioritaet: modal.prioritaet,
        start_datum: modal.start_datum || null,
        end_datum: modal.end_datum || null,
        budget: modal.budget === '' ? null : Number(modal.budget),
        verantwortlich: modal.verantwortlich || null,
        farbe: modal.farbe || '#00e5ff',
      };
      let res;
      if (modal.id) {
        res = await supabase.from('projekte').update(datensatz).eq('id', modal.id);
      } else {
        res = await supabase.from('projekte').insert(datensatz);
      }
      if (res.error) throw res.error;
      setModal(null);
      await ladeDaten();
    } catch (e: any) {
      alert('Speichern fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setSpeichern(false);
    }
  }

  async function archivWechsel(p: Projekt) {
    const neu = !p.archiviert;
    if (neu && !confirm('Projekt archivieren? Es verschwindet aus der aktiven Liste (nicht gelöscht).')) return;
    try {
      const res = await supabase.from('projekte').update({ archiviert: neu }).eq('id', p.id);
      if (res.error) throw res.error;
      await ladeDaten();
    } catch (e: any) {
      alert('Aktion fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  }

  // --- Aus Vorlage ein neues Projekt erstellen ---
  function oeffneAusVorlage(v: any) {
    setVorlagenModal(false);
    setAusVorlage({ vorlage: v, name: (v.name || '').replace(/\s*\(Vorlage\)\s*$/i, '') });
  }

  async function erstelleAusVorlage() {
    if (!ausVorlage) return;
    const v = ausVorlage.vorlage;
    if (!ausVorlage.name.trim()) { alert('Bitte einen Projektnamen eingeben.'); return; }
    setErstellen(true);
    try {
      // 1) Projekt anlegen
      const pRes = await supabase.from('projekte').insert({
        owner_user_id: ownerId,
        name: ausVorlage.name.trim(),
        beschreibung: v.beschreibung || null,
        status: 'aktiv',
        prioritaet: v.prioritaet || 'normal',
        farbe: v.farbe || '#00e5ff',
      }).select('id').single();
      if (pRes.error) throw pRes.error;
      const projektId = pRes.data.id;

      // 2) Standard-Aufgaben der Vorlage laden und uebernehmen
      const { data: vAufg } = await supabase.from('vorlagen_aufgaben')
        .select('*').eq('vorlage_id', v.id).order('sortierung', { ascending: true });
      if (vAufg && vAufg.length > 0) {
        const rows = vAufg.map((a: any, i: number) => ({
          owner_user_id: ownerId,
          projekt_id: projektId,
          titel: a.titel,
          beschreibung: a.beschreibung || null,
          status: a.status || 'todo',
          prioritaet: a.prioritaet || 'normal',
          sortierung: i,
          erledigt: a.status === 'fertig',
        }));
        const aRes = await supabase.from('aufgaben').insert(rows);
        if (aRes.error) throw aRes.error;
      }
      // 3) Direkt ins neue Projekt springen
      window.location.href = `/dashboard/projekte/${projektId}`;
    } catch (e: any) {
      alert('Erstellen fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
      setErstellen(false);
    }
  }

  async function loescheVorlage(v: any) {
    if (!confirm(`Vorlage „${v.name}" löschen? (Bereits erstellte Projekte bleiben bestehen.)`)) return;
    try {
      const res = await supabase.from('projekt_vorlagen').delete().eq('id', v.id);
      if (res.error) throw res.error;
      await ladeDaten();
    } catch (e: any) {
      alert('Löschen fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  }

  // --- Styles ---
  const card: React.CSSProperties = {
    background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 18,
  };
  const btn: React.CSSProperties = {
    background: BRAND.cyan, color: BRAND.navy, border: 'none', borderRadius: 10,
    padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
  };
  const btnGhost: React.CSSProperties = {
    background: 'transparent', color: BRAND.textDim, border: `1px solid ${BRAND.border}`,
    borderRadius: 10, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
  };
  const inputStil: React.CSSProperties = {
    width: '100%', background: BRAND.navy, color: '#fff', border: `1px solid ${BRAND.border}`,
    borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
  };
  const labelStil: React.CSSProperties = {
    display: 'block', color: BRAND.textDim, fontSize: 12, fontWeight: 600, marginBottom: 5, fontFamily: 'DM Sans, sans-serif',
  };

  const gefiltert = projekte.filter((p) => {
    if (p.archiviert !== zeigeArchiv) return false;
    if (filterStatus !== 'alle' && p.status !== filterStatus) return false;
    return true;
  });

  return (
    <div style={{ background: BRAND.navy, minHeight: '100vh', color: '#fff', padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>
      {/* Kopf */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, color: BRAND.gold, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
            ARGONAUT OS · Projekte
          </p>
          <h1 style={{ margin: '2px 0 0', fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 800 }}>
            Projekte
          </h1>
          <p style={{ margin: '4px 0 0', color: BRAND.textDim, fontSize: 14 }}>
            Alle Projekte, Status und Fortschritt an einem Ort.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {vorlagen.length > 0 && (
            <button style={btnGhost} onClick={() => setVorlagenModal(true)}>📋 Aus Vorlage erstellen</button>
          )}
          <button style={btn} onClick={oeffneNeu}>+ Neues Projekt</button>
        </div>
      </div>

      {/* Filterleiste */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
        {['alle', 'aktiv', 'pausiert', 'abgeschlossen', 'abgebrochen'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            style={{
              ...btnGhost, padding: '6px 14px',
              color: filterStatus === s ? BRAND.navy : BRAND.textDim,
              background: filterStatus === s ? BRAND.gold : 'transparent',
              borderColor: filterStatus === s ? BRAND.gold : BRAND.border,
              fontWeight: 700,
            }}
          >
            {s === 'alle' ? 'Alle' : STATUS_META[s].label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setZeigeArchiv(!zeigeArchiv)}
          style={{ ...btnGhost, color: zeigeArchiv ? BRAND.gold : BRAND.textDim }}
        >
          {zeigeArchiv ? '← Aktive Projekte' : 'Archiv ansehen'}
        </button>
      </div>

      {fehler && (
        <div style={{ ...card, borderColor: BRAND.danger, color: BRAND.danger, marginBottom: 16 }}>{fehler}</div>
      )}

      {laden ? (
        <div style={{ ...card, color: BRAND.textDim }}>Lade Projekte…</div>
      ) : gefiltert.length === 0 ? (
        <div style={{ ...card, color: BRAND.textDim, textAlign: 'center', padding: 40 }}>
          {zeigeArchiv ? 'Keine archivierten Projekte.' : 'Noch keine Projekte. Leg mit „+ Neues Projekt" los.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {gefiltert.map((p) => {
            const fp = fortschritt(p.id);
            const sm = STATUS_META[p.status] || STATUS_META.aktiv;
            const pm = PRIO_META[p.prioritaet] || PRIO_META.normal;
            return (
              <div key={p.id} style={{ ...card, borderLeft: `4px solid ${p.farbe || BRAND.cyan}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <a href={`/dashboard/projekte/${p.id}`} style={{ color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 17, fontFamily: 'Syne, sans-serif' }}>
                    {p.name}
                  </a>
                  <span style={{ fontSize: 11, fontWeight: 700, color: sm.farbe, background: sm.farbe + '22', border: `1px solid ${sm.farbe}55`, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                    {sm.label}
                  </span>
                </div>

                {p.beschreibung && (
                  <p style={{ margin: 0, color: BRAND.textDim, fontSize: 13, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.beschreibung}
                  </p>
                )}

                {/* Fortschritt */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: BRAND.textDim, marginBottom: 4 }}>
                    <span>Fortschritt</span>
                    <span>{fp.erledigt}/{fp.gesamt} Aufgaben · {fp.pct}%</span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 999, height: 7, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${fp.pct}%`, background: fp.pct === 100 ? BRAND.green : BRAND.cyan, borderRadius: 999 }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: BRAND.textDim }}>
                  <span>📅 {dStr(p.start_datum)} – {dStr(p.end_datum)}</span>
                  <span style={{ color: pm.farbe }}>● {pm.label}</span>
                  {p.verantwortlich && <span>👤 {p.verantwortlich}</span>}
                  {p.budget != null && <span>💶 {Number(p.budget).toLocaleString('de-DE')} €</span>}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <a href={`/dashboard/projekte/${p.id}`} style={{ ...btn, padding: '7px 14px', fontSize: 13, textDecoration: 'none', display: 'inline-block' }}>
                    Öffnen
                  </a>
                  <button style={{ ...btnGhost, padding: '7px 12px', fontSize: 13 }} onClick={() => oeffneBearbeiten(p)}>Bearbeiten</button>
                  <button style={{ ...btnGhost, padding: '7px 12px', fontSize: 13 }} onClick={() => archivWechsel(p)}>
                    {p.archiviert ? 'Wiederherstellen' : 'Archivieren'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Projekt-Modal ===== */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
          onClick={() => setModal(null)}>
          <div style={{ ...card, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontFamily: 'Syne, sans-serif', fontSize: 20 }}>
              {modal.id ? 'Projekt bearbeiten' : 'Neues Projekt'}
            </h2>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStil}>Projektname *</label>
              <input style={inputStil} value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} placeholder="z.B. Gartenanlage Kunde Müller" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStil}>Beschreibung</label>
              <textarea style={{ ...inputStil, minHeight: 64, resize: 'vertical' }} value={modal.beschreibung} onChange={(e) => setModal({ ...modal, beschreibung: e.target.value })} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Status</label>
                <select style={inputStil} value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value })}>
                  {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Priorität</label>
                <select style={inputStil} value={modal.prioritaet} onChange={(e) => setModal({ ...modal, prioritaet: e.target.value })}>
                  {Object.keys(PRIO_META).map((s) => <option key={s} value={s}>{PRIO_META[s].label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Start</label>
                <input type="date" style={inputStil} value={modal.start_datum} onChange={(e) => setModal({ ...modal, start_datum: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Ende</label>
                <input type="date" style={inputStil} value={modal.end_datum} onChange={(e) => setModal({ ...modal, end_datum: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Verantwortlich</label>
                <input style={inputStil} value={modal.verantwortlich} onChange={(e) => setModal({ ...modal, verantwortlich: e.target.value })} placeholder="Name" />
              </div>
              <div style={{ width: 140 }}>
                <label style={labelStil}>Budget (€)</label>
                <input type="number" min={0} style={inputStil} value={modal.budget} onChange={(e) => setModal({ ...modal, budget: e.target.value })} />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStil}>Farbe</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {FARB_PRESETS.map((f) => (
                  <button key={f.wert} onClick={() => setModal({ ...modal, farbe: f.wert })} title={f.name}
                    style={{ width: 30, height: 30, borderRadius: '50%', background: f.wert, border: modal.farbe === f.wert ? '3px solid #fff' : '2px solid transparent', cursor: 'pointer' }} />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={btnGhost} onClick={() => setModal(null)} disabled={speichern}>Abbrechen</button>
              <button style={btn} onClick={speichereProjekt} disabled={speichern}>{speichern ? 'Speichert…' : 'Speichern'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Vorlagen-Liste ===== */}
      {vorlagenModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
          onClick={() => setVorlagenModal(false)}>
          <div style={{ ...card, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 6px', fontFamily: 'Syne, sans-serif', fontSize: 20 }}>Aus Vorlage erstellen</h2>
            <p style={{ margin: '0 0 16px', color: BRAND.textDim, fontSize: 13 }}>
              Wähle eine Vorlage — daraus entsteht ein neues Projekt mit allen Standard-Aufgaben.
            </p>
            {vorlagen.length === 0 ? (
              <div style={{ color: BRAND.textDim, fontSize: 13, padding: 20, textAlign: 'center' }}>
                Noch keine Vorlagen. Öffne ein Projekt → Reiter „Einstellungen" → „Als Vorlage speichern".
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {vorlagen.map((v) => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px', background: BRAND.navy, border: `1px solid ${BRAND.border}`, borderLeft: `3px solid ${v.farbe}`, borderRadius: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{v.name}</div>
                      <div style={{ fontSize: 12, color: BRAND.textDim, marginTop: 2 }}>
                        {v.anzahlAufgaben} Standard-Aufgabe{v.anzahlAufgaben === 1 ? '' : 'n'}
                        {v.beschreibung ? ` · ${v.beschreibung.slice(0, 60)}${v.beschreibung.length > 60 ? '…' : ''}` : ''}
                      </div>
                    </div>
                    <button style={btn} onClick={() => oeffneAusVorlage(v)}>Verwenden</button>
                    <button style={{ ...btnGhost, padding: '8px 10px', color: BRAND.danger, borderColor: BRAND.danger }} onClick={() => loescheVorlage(v)} title="Vorlage löschen">🗑</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={btnGhost} onClick={() => setVorlagenModal(false)}>Schließen</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Aus Vorlage: Name wählen ===== */}
      {ausVorlage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60 }}
          onClick={() => !erstellen && setAusVorlage(null)}>
          <div style={{ ...card, width: 440, maxWidth: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 6px', fontFamily: 'Syne, sans-serif', fontSize: 20 }}>Neues Projekt aus Vorlage</h2>
            <p style={{ margin: '0 0 16px', color: BRAND.textDim, fontSize: 13 }}>
              Vorlage „{ausVorlage.vorlage.name}" → {ausVorlage.vorlage.anzahlAufgaben} Aufgabe{ausVorlage.vorlage.anzahlAufgaben === 1 ? '' : 'n'} werden übernommen.
            </p>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStil}>Projektname *</label>
              <input style={inputStil} value={ausVorlage.name} autoFocus
                onChange={(e) => setAusVorlage({ ...ausVorlage, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); erstelleAusVorlage(); } }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={btnGhost} onClick={() => setAusVorlage(null)} disabled={erstellen}>Abbrechen</button>
              <button style={btn} onClick={erstelleAusVorlage} disabled={erstellen}>{erstellen ? 'Erstellt…' : 'Projekt erstellen'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
