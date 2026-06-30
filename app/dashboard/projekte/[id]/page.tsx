'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · MODUL PROJEKTE · P3 — Projekt-Detailseite
// Kopf + Reiter-Geruest (Aufgaben/Kalender folgen additiv)
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

const REITER = [
  { key: 'uebersicht', label: 'Übersicht' },
  { key: 'aufgaben', label: 'Aufgaben' },
  { key: 'kalender', label: 'Kalender' },
  { key: 'einstellungen', label: 'Einstellungen' },
];

const SPALTEN = [
  { key: 'todo', label: 'To-Do', farbe: '#8FA3BE' },
  { key: 'in_arbeit', label: 'In Arbeit', farbe: '#00e5ff' },
  { key: 'review', label: 'Review', farbe: '#E0A24C' },
  { key: 'fertig', label: 'Fertig', farbe: '#4CAF7D' },
];

const PRIO_RANG: Record<string, number> = { dringend: 0, hoch: 1, normal: 2, niedrig: 3 };
const STATUS_RANG: Record<string, number> = { todo: 0, in_arbeit: 1, review: 2, fertig: 3 };
function spalteLabel(key: string): string { return SPALTEN.find((s) => s.key === key)?.label || key; }

function dStr(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; }
}

type Projekt = any;
type Aufgabe = any;

export default function ProjektDetailPage() {
  const params = useParams();
  const projektId = String(params?.id || '');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState('');
  const [projekt, setProjekt] = useState<Projekt | null>(null);
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [reiter, setReiter] = useState('uebersicht');

  // Aufgaben-Modal + Drag&Drop
  const [aufgabeModal, setAufgabeModal] = useState<any | null>(null);
  const [speichern, setSpeichern] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverSpalte, setDragOverSpalte] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState('');
  // Aufgaben-Ansicht: Kanban oder Liste
  const [aufgabenAnsicht, setAufgabenAnsicht] = useState<'kanban' | 'liste'>('kanban');
  const [sortFeld, setSortFeld] = useState<'faellig' | 'prio' | 'status' | 'titel'>('faellig');

  const ladeDaten = useCallback(async () => {
    setLaden(true);
    setFehler('');
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setOwnerId(uid);

      const [projRes, aufgRes] = await Promise.all([
        supabase.from('projekte').select('*').eq('id', projektId).eq('owner_user_id', uid).maybeSingle(),
        supabase.from('aufgaben').select('*').eq('projekt_id', projektId).eq('owner_user_id', uid)
          .order('sortierung', { ascending: true }).order('erstellt_am', { ascending: true }),
      ]);
      if (!projRes.data) { setFehler('Projekt nicht gefunden.'); setLaden(false); return; }
      setProjekt(projRes.data);
      setAufgaben(aufgRes.data || []);
    } catch (e: any) {
      setFehler(e?.message || 'Fehler beim Laden.');
    } finally {
      setLaden(false);
    }
  }, [supabase, projektId]);

  useEffect(() => { void ladeDaten(); }, [ladeDaten]);

  // --- Aufgaben: anlegen / bearbeiten / loeschen ---
  function leereAufgabe(status: string): any {
    return { id: null, titel: '', beschreibung: '', status, prioritaet: 'normal', faellig_am: '' };
  }
  function oeffneNeueAufgabe(status: string) { setAufgabeModal(leereAufgabe(status)); }
  function oeffneAufgabe(a: Aufgabe) {
    setAufgabeModal({
      id: a.id, titel: a.titel || '', beschreibung: a.beschreibung || '',
      status: a.status || 'todo', prioritaet: a.prioritaet || 'normal', faellig_am: a.faellig_am || '',
    });
  }

  async function speichereAufgabe() {
    if (!aufgabeModal) return;
    if (!aufgabeModal.titel.trim()) { alert('Bitte einen Titel eingeben.'); return; }
    setSpeichern(true);
    try {
      const datensatz = {
        owner_user_id: ownerId,
        projekt_id: projektId,
        titel: aufgabeModal.titel.trim(),
        beschreibung: aufgabeModal.beschreibung || null,
        status: aufgabeModal.status,
        prioritaet: aufgabeModal.prioritaet,
        faellig_am: aufgabeModal.faellig_am || null,
        erledigt: aufgabeModal.status === 'fertig',
      };
      let res;
      if (aufgabeModal.id) {
        res = await supabase.from('aufgaben').update(datensatz).eq('id', aufgabeModal.id);
      } else {
        res = await supabase.from('aufgaben').insert(datensatz);
      }
      if (res.error) throw res.error;
      setAufgabeModal(null);
      await ladeDaten();
    } catch (e: any) {
      alert('Speichern fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setSpeichern(false);
    }
  }

  async function loescheAufgabe() {
    if (!aufgabeModal?.id) return;
    if (!confirm('Aufgabe wirklich löschen?')) return;
    setSpeichern(true);
    try {
      const res = await supabase.from('aufgaben').delete().eq('id', aufgabeModal.id);
      if (res.error) throw res.error;
      setAufgabeModal(null);
      await ladeDaten();
    } catch (e: any) {
      alert('Löschen fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setSpeichern(false);
    }
  }

  // --- Drag & Drop zwischen Spalten ---
  function onDragStartTask(e: React.DragEvent, a: Aufgabe) {
    setDraggingTaskId(a.id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', a.id); } catch { /* ignore */ }
  }
  function onDragEndTask() { setDraggingTaskId(null); setDragOverSpalte(null); }

  async function onDropSpalte(status: string) {
    const id = draggingTaskId;
    setDragOverSpalte(null);
    setDraggingTaskId(null);
    if (!id) return;
    const a = aufgaben.find((x) => x.id === id);
    if (!a || a.status === status) return;
    try {
      const res = await supabase.from('aufgaben')
        .update({ status, erledigt: status === 'fertig' })
        .eq('id', id);
      if (res.error) throw res.error;
      await ladeDaten();
    } catch (e: any) {
      alert('Verschieben fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  }

  // --- Styles ---
  const card: React.CSSProperties = {
    background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 18,
  };
  const btnGhost: React.CSSProperties = {
    background: 'transparent', color: BRAND.textDim, border: `1px solid ${BRAND.border}`,
    borderRadius: 10, padding: '8px 14px', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif', textDecoration: 'none', display: 'inline-block',
  };
  const btn: React.CSSProperties = {
    background: BRAND.cyan, color: BRAND.navy, border: 'none', borderRadius: 10,
    padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
  };
  const inputStil: React.CSSProperties = {
    width: '100%', background: BRAND.navy, color: '#fff', border: `1px solid ${BRAND.border}`,
    borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
  };
  const labelStil: React.CSSProperties = {
    display: 'block', color: BRAND.textDim, fontSize: 12, fontWeight: 600, marginBottom: 5, fontFamily: 'DM Sans, sans-serif',
  };

  if (laden) {
    return (
      <div style={{ background: BRAND.navy, minHeight: '100vh', color: '#fff', padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ ...card, color: BRAND.textDim }}>Lade Projekt…</div>
      </div>
    );
  }

  if (fehler || !projekt) {
    return (
      <div style={{ background: BRAND.navy, minHeight: '100vh', color: '#fff', padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>
        <a href="/dashboard/projekte" style={{ ...btnGhost, marginBottom: 16 }}>← Zur Übersicht</a>
        <div style={{ ...card, borderColor: BRAND.danger, color: BRAND.danger, marginTop: 16 }}>{fehler || 'Projekt nicht gefunden.'}</div>
      </div>
    );
  }

  const sm = STATUS_META[projekt.status] || STATUS_META.aktiv;
  const pm = PRIO_META[projekt.prioritaet] || PRIO_META.normal;

  const gesamt = aufgaben.length;
  const erledigt = aufgaben.filter((a) => a.erledigt || a.status === 'fertig').length;
  const offen = gesamt - erledigt;
  const pct = gesamt > 0 ? Math.round((erledigt / gesamt) * 100) : 0;
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const ueberfaellig = aufgaben.filter((a) => !a.erledigt && a.status !== 'fertig' && a.faellig_am && new Date(a.faellig_am) < heute).length;

  return (
    <div style={{ background: BRAND.navy, minHeight: '100vh', color: '#fff', padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>
      <a href="/dashboard/projekte" style={{ ...btnGhost, marginBottom: 16 }}>← Zur Übersicht</a>

      {/* Projekt-Kopf */}
      <div style={{ ...card, borderLeft: `4px solid ${projekt.farbe || BRAND.cyan}`, marginTop: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800 }}>{projekt.name}</h1>
              <span style={{ fontSize: 11, fontWeight: 700, color: sm.farbe, background: sm.farbe + '22', border: `1px solid ${sm.farbe}55`, borderRadius: 999, padding: '3px 10px' }}>{sm.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: pm.farbe, background: pm.farbe + '22', border: `1px solid ${pm.farbe}55`, borderRadius: 999, padding: '3px 10px' }}>{pm.label}</span>
            </div>
            {projekt.beschreibung && (
              <p style={{ margin: '0 0 10px', color: BRAND.textDim, fontSize: 14, lineHeight: 1.5 }}>{projekt.beschreibung}</p>
            )}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: BRAND.textDim }}>
              <span>📅 {dStr(projekt.start_datum)} – {dStr(projekt.end_datum)}</span>
              {projekt.verantwortlich && <span>👤 {projekt.verantwortlich}</span>}
              {projekt.budget != null && <span>💶 {Number(projekt.budget).toLocaleString('de-DE')} €</span>}
            </div>
          </div>
        </div>

        {/* Fortschritt */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: BRAND.textDim, marginBottom: 5 }}>
            <span>Fortschritt</span>
            <span>{erledigt}/{gesamt} Aufgaben · {pct}%</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? BRAND.green : BRAND.cyan, borderRadius: 999, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      </div>

      {/* Reiter-Leiste */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 18, borderBottom: `1px solid ${BRAND.border}`, paddingBottom: 0 }}>
        {REITER.map((r) => {
          const aktiv = reiter === r.key;
          return (
            <button
              key={r.key}
              onClick={() => setReiter(r.key)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '10px 16px', fontSize: 14, fontWeight: 700,
                fontFamily: 'DM Sans, sans-serif',
                color: aktiv ? BRAND.cyan : BRAND.textDim,
                borderBottom: `2px solid ${aktiv ? BRAND.cyan : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Reiter-Inhalt */}
      {reiter === 'uebersicht' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <StatKachel label="Aufgaben gesamt" wert={String(gesamt)} farbe={BRAND.cyan} />
          <StatKachel label="Offen" wert={String(offen)} farbe={BRAND.warn} />
          <StatKachel label="Erledigt" wert={String(erledigt)} farbe={BRAND.green} />
          <StatKachel label="Überfällig" wert={String(ueberfaellig)} farbe={ueberfaellig > 0 ? BRAND.danger : BRAND.textDim} />
        </div>
      )}

      {reiter === 'aufgaben' && (
        <div>
          {/* Umschalter Kanban / Liste */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 0, border: `1px solid ${BRAND.border}`, borderRadius: 10, overflow: 'hidden' }}>
              {(['kanban', 'liste'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setAufgabenAnsicht(v)}
                  style={{
                    background: aufgabenAnsicht === v ? BRAND.cyan : 'transparent',
                    color: aufgabenAnsicht === v ? BRAND.navy : BRAND.textDim,
                    border: 'none', padding: '8px 16px', cursor: 'pointer', fontWeight: 700,
                    fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  {v === 'kanban' ? '▦ Board' : '☰ Liste'}
                </button>
              ))}
            </div>
            {aufgabenAnsicht === 'liste' && (
              <>
                <span style={{ color: BRAND.textDim, fontSize: 13 }}>Sortieren:</span>
                <select
                  value={sortFeld}
                  onChange={(e) => setSortFeld(e.target.value as any)}
                  style={{ ...inputStil, width: 'auto', padding: '7px 10px' }}
                >
                  <option value="faellig">Fälligkeit</option>
                  <option value="prio">Priorität</option>
                  <option value="status">Status</option>
                  <option value="titel">Titel (A–Z)</option>
                </select>
              </>
            )}
            <div style={{ flex: 1 }} />
            <button style={btn} onClick={() => oeffneNeueAufgabe('todo')}>+ Aufgabe</button>
          </div>

          {aufgabenAnsicht === 'kanban' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, alignItems: 'start' }}>
              {SPALTEN.map((sp) => {
                const spaltenAufgaben = aufgaben.filter((a) => a.status === sp.key);
                const istDropZiel = dragOverSpalte === sp.key;
                return (
                  <div
                    key={sp.key}
                    onDragOver={(e) => { if (!draggingTaskId) return; e.preventDefault(); setDragOverSpalte(sp.key); }}
                    onDragLeave={() => setDragOverSpalte((p) => (p === sp.key ? null : p))}
                    onDrop={() => onDropSpalte(sp.key)}
                    style={{
                      background: istDropZiel ? 'rgba(0,229,255,0.08)' : BRAND.navy2,
                      border: `1px solid ${istDropZiel ? BRAND.cyan : BRAND.border}`,
                      borderRadius: 14, padding: 12, minHeight: 120,
                      transition: 'background 0.12s ease, border 0.12s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: sp.farbe, display: 'inline-block' }} />
                        <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'Syne, sans-serif' }}>{sp.label}</span>
                        <span style={{ fontSize: 12, color: BRAND.textDim }}>{spaltenAufgaben.length}</span>
                      </div>
                    </div>

                    {spaltenAufgaben.map((a) => {
                      const pm = PRIO_META[a.prioritaet] || PRIO_META.normal;
                      const ueberfaellig = a.faellig_am && a.status !== 'fertig' && new Date(a.faellig_am) < new Date(new Date().toDateString());
                      return (
                        <div
                          key={a.id}
                          draggable
                          onDragStart={(e) => onDragStartTask(e, a)}
                          onDragEnd={onDragEndTask}
                          onClick={() => oeffneAufgabe(a)}
                          style={{
                            background: BRAND.navy, border: `1px solid ${BRAND.border}`,
                            borderLeft: `3px solid ${pm.farbe}`, borderRadius: 8,
                            padding: '10px 12px', marginBottom: 8, cursor: 'grab',
                            opacity: draggingTaskId === a.id ? 0.4 : 1,
                          }}
                        >
                          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: a.beschreibung ? 4 : 0 }}>{a.titel}</div>
                          {a.beschreibung && (
                            <div style={{ fontSize: 12, color: BRAND.textDim, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {a.beschreibung}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, fontSize: 11, alignItems: 'center' }}>
                            <span style={{ color: pm.farbe, fontWeight: 700 }}>● {pm.label}</span>
                            {a.faellig_am && (
                              <span style={{ color: ueberfaellig ? BRAND.danger : BRAND.textDim, fontWeight: ueberfaellig ? 700 : 400 }}>
                                📅 {dStr(a.faellig_am)}{ueberfaellig ? ' (überfällig)' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    <button
                      onClick={() => oeffneNeueAufgabe(sp.key)}
                      style={{
                        width: '100%', background: 'transparent', border: `1px dashed ${BRAND.border}`,
                        borderRadius: 8, color: BRAND.textDim, padding: '8px 0', cursor: 'pointer',
                        fontSize: 13, fontFamily: 'DM Sans, sans-serif', marginTop: 2,
                      }}
                    >
                      + Aufgabe
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <AufgabenListe
              aufgaben={aufgaben}
              sortFeld={sortFeld}
              onOeffnen={oeffneAufgabe}
              onStatusWechsel={async (id, status) => {
                try {
                  const res = await supabase.from('aufgaben').update({ status, erledigt: status === 'fertig' }).eq('id', id);
                  if (res.error) throw res.error;
                  await ladeDaten();
                } catch (e: any) { alert('Aktualisieren fehlgeschlagen: ' + (e?.message || 'Fehler')); }
              }}
            />
          )}
        </div>
      )}

      {reiter === 'kalender' && (
        <div style={{ ...card, color: BRAND.textDim, textAlign: 'center', padding: 40 }}>
          Kalenderansicht folgt.
        </div>
      )}

      {reiter === 'einstellungen' && (
        <div style={{ ...card, color: BRAND.textDim }}>
          Projekt-Einstellungen (bearbeiten/archivieren) folgen. Bis dahin: zurück zur Übersicht, dort „Bearbeiten".
        </div>
      )}

      {/* ===== Aufgaben-Modal ===== */}
      {aufgabeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
          onClick={() => setAufgabeModal(null)}>
          <div style={{ ...card, width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontFamily: 'Syne, sans-serif', fontSize: 20 }}>
              {aufgabeModal.id ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
            </h2>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStil}>Titel *</label>
              <input style={inputStil} value={aufgabeModal.titel} onChange={(e) => setAufgabeModal({ ...aufgabeModal, titel: e.target.value })} placeholder="z.B. Material bestellen" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStil}>Beschreibung</label>
              <textarea style={{ ...inputStil, minHeight: 64, resize: 'vertical' }} value={aufgabeModal.beschreibung} onChange={(e) => setAufgabeModal({ ...aufgabeModal, beschreibung: e.target.value })} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Spalte</label>
                <select style={inputStil} value={aufgabeModal.status} onChange={(e) => setAufgabeModal({ ...aufgabeModal, status: e.target.value })}>
                  {SPALTEN.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Priorität</label>
                <select style={inputStil} value={aufgabeModal.prioritaet} onChange={(e) => setAufgabeModal({ ...aufgabeModal, prioritaet: e.target.value })}>
                  {Object.keys(PRIO_META).map((s) => <option key={s} value={s}>{PRIO_META[s].label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Fällig am</label>
                <input type="date" style={inputStil} value={aufgabeModal.faellig_am} onChange={(e) => setAufgabeModal({ ...aufgabeModal, faellig_am: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
              <div>
                {aufgabeModal.id && (
                  <button style={{ ...btnGhost, color: BRAND.danger, borderColor: BRAND.danger }} onClick={loescheAufgabe} disabled={speichern}>Löschen</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={btnGhost} onClick={() => setAufgabeModal(null)} disabled={speichern}>Abbrechen</button>
                <button style={btn} onClick={speichereAufgabe} disabled={speichern}>{speichern ? 'Speichert…' : 'Speichern'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatKachel({ label, wert, farbe }: { label: string; wert: string; farbe: string }) {
  return (
    <div style={{ background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: '20px 18px' }}>
      <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 30, fontWeight: 800, color: farbe }}>{wert}</div>
      <div style={{ fontSize: 13, color: BRAND.textDim, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function AufgabenListe({
  aufgaben, sortFeld, onOeffnen, onStatusWechsel,
}: {
  aufgaben: Aufgabe[];
  sortFeld: 'faellig' | 'prio' | 'status' | 'titel';
  onOeffnen: (a: Aufgabe) => void;
  onStatusWechsel: (id: string, status: string) => void | Promise<void>;
}) {
  const heute = new Date(new Date().toDateString());
  const sortiert = [...aufgaben].sort((a, b) => {
    if (sortFeld === 'faellig') {
      const av = a.faellig_am ? new Date(a.faellig_am).getTime() : Infinity;
      const bv = b.faellig_am ? new Date(b.faellig_am).getTime() : Infinity;
      return av - bv;
    }
    if (sortFeld === 'prio') return (PRIO_RANG[a.prioritaet] ?? 9) - (PRIO_RANG[b.prioritaet] ?? 9);
    if (sortFeld === 'status') return (STATUS_RANG[a.status] ?? 9) - (STATUS_RANG[b.status] ?? 9);
    return String(a.titel).localeCompare(String(b.titel), 'de');
  });

  if (sortiert.length === 0) {
    return (
      <div style={{ background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 40, textAlign: 'center', color: BRAND.textDim }}>
        Noch keine Aufgaben. Leg mit „+ Aufgabe" los.
      </div>
    );
  }

  const zellKopf: React.CSSProperties = {
    textAlign: 'left', padding: '10px 12px', fontSize: 12, color: BRAND.textDim,
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: `1px solid ${BRAND.border}`,
  };
  const zelle: React.CSSProperties = { padding: '10px 12px', fontSize: 14, borderBottom: `1px solid rgba(143,163,190,0.10)` };

  return (
    <div style={{ background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              <th style={zellKopf}>Aufgabe</th>
              <th style={zellKopf}>Priorität</th>
              <th style={zellKopf}>Fällig</th>
              <th style={{ ...zellKopf, width: 150 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sortiert.map((a) => {
              const pm = PRIO_META[a.prioritaet] || PRIO_META.normal;
              const ueberfaellig = a.faellig_am && a.status !== 'fertig' && new Date(a.faellig_am) < heute;
              return (
                <tr key={a.id} style={{ cursor: 'pointer' }}>
                  <td style={zelle} onClick={() => onOeffnen(a)}>
                    <div style={{ fontWeight: 600, color: a.status === 'fertig' ? BRAND.textDim : '#fff', textDecoration: a.status === 'fertig' ? 'line-through' : 'none' }}>{a.titel}</div>
                    {a.beschreibung && (
                      <div style={{ fontSize: 12, color: BRAND.textDim, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 }}>{a.beschreibung}</div>
                    )}
                  </td>
                  <td style={zelle} onClick={() => onOeffnen(a)}>
                    <span style={{ color: pm.farbe, fontWeight: 700, fontSize: 13 }}>● {pm.label}</span>
                  </td>
                  <td style={{ ...zelle, color: ueberfaellig ? BRAND.danger : BRAND.textDim, fontWeight: ueberfaellig ? 700 : 400, fontSize: 13, whiteSpace: 'nowrap' }} onClick={() => onOeffnen(a)}>
                    {a.faellig_am ? dStr(a.faellig_am) : '—'}{ueberfaellig ? ' ⚠' : ''}
                  </td>
                  <td style={zelle}>
                    <select
                      value={a.status}
                      onChange={(e) => onStatusWechsel(a.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: BRAND.navy, color: '#fff', border: `1px solid ${BRAND.border}`,
                        borderRadius: 8, padding: '6px 8px', fontSize: 13, fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
                      }}
                    >
                      {SPALTEN.map((s) => <option key={s.key} value={s.key}>{spalteLabel(s.key)}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
