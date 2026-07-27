'use client';

// ============================================================
// ARGONAUT OS · Holzernte-Schäfer · F3 · Forst-Aufträge
// Fäll-/Pflegeauftrag: Positionen aus Einsatzmitteln (Std × Satz + Wegepauschale)
// oder freie Leistungen. Notdienst-Zuschlag auf die Summe. Preise eingefroren
// beim Hinzufügen. Ab Status "erledigt" sind die Positionen gesperrt.
// Pfad: app/dashboard/forst/auftraege/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Art = 'faellung' | 'kronenpflege' | 'sturmschaden' | 'wurzelfraesen' | 'haeckseln' | 'sonstige';
type Status = 'entwurf' | 'beauftragt' | 'erledigt';
type PosArt = 'leistung' | 'einsatzmittel';

type Auftrag = {
  id: string; objekt_id: string | null; titel: string; art: Art;
  notdienst: boolean; notdienst_zuschlag_prozent: number; status: Status; datum: string; notiz: string | null;
};
type Position = {
  id: string; art: PosArt; bezeichnung: string; menge: number; einheit: string;
  einzelpreis_netto: number; wegepauschale_netto: number; steuersatz_prozent: number; sortierung: number;
};
type Objekt = { id: string; bezeichnung: string };
type Einsatzmittel = { id: string; bezeichnung: string; stundensatz_netto: number | null; wegepauschale_netto: number | null; steuersatz_prozent: number };

const ART_LABEL: Record<Art, string> = {
  faellung: '🪓 Fällung', kronenpflege: '✂️ Kronenpflege', sturmschaden: '🌪 Sturmschaden',
  wurzelfraesen: '🌱 Wurzelfräsen', haeckseln: '♻️ Häckseln', sonstige: '· Sonstige',
};
const STATUS_LABEL: Record<Status, string> = { entwurf: 'Entwurf', beauftragt: 'Beauftragt', erledigt: 'Erledigt' };
const EINHEITEN = ['Std', 'Stk', 'pauschal', 'km'];

function heute() { return new Date().toISOString().slice(0, 10); }
function num(s: string) { const n = parseFloat((s || '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function eur(n: number) { return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }

export default function ForstAuftraegePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [aktiv, setAktiv] = useState<Auftrag | null>(null);
  const [positionen, setPositionen] = useState<Position[]>([]);
  const [objekte, setObjekte] = useState<Objekt[]>([]);
  const [einsatzmittel, setEinsatzmittel] = useState<Einsatzmittel[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [na, setNa] = useState({ titel: '', art: 'faellung' as Art, objekt_id: '', datum: heute() });

  // Positions-Formular
  const [posModus, setPosModus] = useState<PosArt>('einsatzmittel');
  const [emAuswahl, setEmAuswahl] = useState('');
  const [emMenge, setEmMenge] = useState('1');
  const [freie, setFreie] = useState({ bezeichnung: '', menge: '1', einheit: 'Std', einzelpreis: '', steuersatz: '19' });

  const ladeAuftraege = useCallback(async () => {
    const { data } = await supabase.from('forst_auftrag')
      .select('id, objekt_id, titel, art, notdienst, notdienst_zuschlag_prozent, status, datum, notiz')
      .order('datum', { ascending: false });
    setAuftraege((data as Auftrag[]) ?? []);
  }, []);
  const ladePositionen = useCallback(async (aid: string) => {
    const { data } = await supabase.from('forst_auftrag_position')
      .select('id, art, bezeichnung, menge, einheit, einzelpreis_netto, wegepauschale_netto, steuersatz_prozent, sortierung')
      .eq('auftrag_id', aid).order('sortierung', { ascending: true });
    setPositionen((data as Position[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      await ladeAuftraege();
      const [oRes, eRes] = await Promise.all([
        supabase.from('forst_objekte').select('id, bezeichnung').order('bezeichnung'),
        supabase.from('forst_einsatzmittel').select('id, bezeichnung, stundensatz_netto, wegepauschale_netto, steuersatz_prozent').eq('aktiv', true).order('bezeichnung'),
      ]);
      setObjekte((oRes.data as Objekt[]) ?? []);
      setEinsatzmittel((eRes.data as Einsatzmittel[]) ?? []);
      setLaden(false);
    })();
  }, [ladeAuftraege]);

  async function auftragAnlegen() {
    if (!uid || !na.titel.trim()) { setFehler('Bitte einen Titel angeben.'); return; }
    setFehler(null); setOk(null);
    const { data, error } = await supabase.from('forst_auftrag').insert({
      owner_user_id: uid, titel: na.titel.trim(), art: na.art,
      objekt_id: na.objekt_id || null, datum: na.datum,
    }).select('id, objekt_id, titel, art, notdienst, notdienst_zuschlag_prozent, status, datum, notiz').single();
    if (error || !data) { setFehler('Auftrag konnte nicht angelegt werden.'); return; }
    setNa({ titel: '', art: 'faellung', objekt_id: '', datum: heute() });
    setOk('Auftrag angelegt.'); await ladeAuftraege();
    setAktiv(data as Auftrag); setPositionen([]);
  }

  async function auftragOeffnen(a: Auftrag) { setAktiv(a); setOk(null); setFehler(null); await ladePositionen(a.id); }

  async function updateAuftrag(patch: Partial<Auftrag>) {
    if (!aktiv) return;
    const neu = { ...aktiv, ...patch };
    setAktiv(neu);
    const { error } = await supabase.from('forst_auftrag').update(patch).eq('id', aktiv.id);
    if (error) { setFehler('Änderung konnte nicht gespeichert werden.'); return; }
    setAuftraege((list) => list.map((x) => (x.id === neu.id ? neu : x)));
  }

  async function positionEinsatzmittel() {
    if (!uid || !aktiv) return;
    const em = einsatzmittel.find((e) => e.id === emAuswahl);
    if (!em) { setFehler('Bitte ein Einsatzmittel wählen.'); return; }
    setFehler(null);
    const { error } = await supabase.from('forst_auftrag_position').insert({
      owner_user_id: uid, auftrag_id: aktiv.id, art: 'einsatzmittel', bezeichnung: em.bezeichnung,
      menge: num(emMenge) || 1, einheit: 'Std',
      einzelpreis_netto: em.stundensatz_netto ?? 0, wegepauschale_netto: em.wegepauschale_netto ?? 0,
      steuersatz_prozent: em.steuersatz_prozent, sortierung: positionen.length,
    });
    if (error) { setFehler('Position konnte nicht gespeichert werden.'); return; }
    setEmAuswahl(''); setEmMenge('1'); await ladePositionen(aktiv.id);
  }

  async function positionFreie() {
    if (!uid || !aktiv || !freie.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setFehler(null);
    const { error } = await supabase.from('forst_auftrag_position').insert({
      owner_user_id: uid, auftrag_id: aktiv.id, art: 'leistung', bezeichnung: freie.bezeichnung.trim(),
      menge: num(freie.menge) || 1, einheit: freie.einheit,
      einzelpreis_netto: num(freie.einzelpreis), wegepauschale_netto: 0,
      steuersatz_prozent: num(freie.steuersatz) || 19, sortierung: positionen.length,
    });
    if (error) { setFehler('Position konnte nicht gespeichert werden.'); return; }
    setFreie({ bezeichnung: '', menge: '1', einheit: 'Std', einzelpreis: '', steuersatz: '19' });
    await ladePositionen(aktiv.id);
  }

  async function positionLoeschen(id: string) {
    if (!aktiv) return;
    const { error } = await supabase.from('forst_auftrag_position').delete().eq('id', id);
    if (error) { setFehler('Position konnte nicht entfernt werden.'); return; }
    await ladePositionen(aktiv.id);
  }

  // --- Summe (Notdienst-Zuschlag skaliert jede Zeile, USt je Zeile) ------
  const zuschlag = aktiv && aktiv.notdienst ? Number(aktiv.notdienst_zuschlag_prozent) || 0 : 0;
  const faktor = 1 + zuschlag / 100;
  let nettoPos = 0, nettoGesamt = 0, steuerGesamt = 0;
  for (const p of positionen) {
    const zeile = Number(p.menge) * Number(p.einzelpreis_netto) + Number(p.wegepauschale_netto);
    const skaliert = zeile * faktor;
    nettoPos += zeile;
    nettoGesamt += skaliert;
    steuerGesamt += skaliert * (Number(p.steuersatz_prozent) / 100);
  }
  const bruttoGesamt = nettoGesamt + steuerGesamt;
  const gesperrt = aktiv?.status === 'erledigt';

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🌲 Forst & Baumpflege</h1>
      <div style={styles.subnav}>
        <Link href="/dashboard/forst" style={styles.subnavLink}>Baumkataster</Link>
        <Link href="/dashboard/forst/einsatzmittel" style={styles.subnavLink}>Einsatzmittel &amp; Sätze</Link>
        <span style={styles.subnavAktiv}>Aufträge</span>
        <Link href="/dashboard/forst/nachweise" style={styles.subnavLink}>Nachweise</Link>
      </div>
      <p style={styles.sub}>
        Fäll- und Pflegeaufträge mit Positionen aus deinen Einsatzmitteln oder freien Leistungen. Notdienst-Zuschlag inklusive.
      </p>

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Neuer Auftrag */}
      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Neuer Auftrag</div>
        <div style={styles.row}>
          <input style={{ ...styles.inp, flex: 1, minWidth: 160 }} value={na.titel} onChange={(e) => setNa({ ...na, titel: e.target.value })} placeholder="Titel (z. B. Eiche fällen, Garten Müller)" />
          <label style={styles.lab}>Art
            <select style={styles.inp} value={na.art} onChange={(e) => setNa({ ...na, art: e.target.value as Art })}>
              {(Object.keys(ART_LABEL) as Art[]).map((a) => <option key={a} value={a}>{ART_LABEL[a]}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Objekt
            <select style={styles.inp} value={na.objekt_id} onChange={(e) => setNa({ ...na, objekt_id: e.target.value })}>
              <option value="">— ohne —</option>
              {objekte.map((o) => <option key={o.id} value={o.id}>{o.bezeichnung}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={na.datum} onChange={(e) => setNa({ ...na, datum: e.target.value })} /></label>
          <button style={styles.primaer} onClick={auftragAnlegen}>＋ Auftrag</button>
        </div>
      </div>

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <div style={styles.split}>
          {/* Auftrags-Liste */}
          <div style={styles.lvListe}>
            {auftraege.map((a) => (
              <button key={a.id} style={{ ...styles.lvItem, ...(aktiv?.id === a.id ? styles.lvAktiv : {}) }} onClick={() => auftragOeffnen(a)}>
                <div style={{ fontWeight: 700 }}>{a.titel}</div>
                <div style={{ color: C.textDim, fontSize: 13 }}>{ART_LABEL[a.art]} · {d(a.datum)} · {STATUS_LABEL[a.status]}</div>
              </button>
            ))}
            {!auftraege.length && <p style={styles.dim}>Noch keine Aufträge.</p>}
          </div>

          {/* Auftrags-Detail */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!aktiv ? <p style={styles.dim}>Links einen Auftrag wählen oder oben neu anlegen.</p> : (
              <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{aktiv.titel}</div>
                  <label style={styles.lab}>Status
                    <select style={styles.inp} value={aktiv.status} onChange={(e) => updateAuftrag({ status: e.target.value as Status })}>
                      {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </label>
                </div>

                {/* Notdienst */}
                <div style={styles.row}>
                  <label style={styles.check}>
                    <input type="checkbox" checked={aktiv.notdienst} onChange={(e) => updateAuftrag({ notdienst: e.target.checked })} /> Notdienst / Sturmschaden
                  </label>
                  {aktiv.notdienst && (
                    <label style={styles.lab}>Zuschlag %
                      <input style={{ ...styles.inp, width: 90 }} inputMode="decimal" defaultValue={String(aktiv.notdienst_zuschlag_prozent)}
                        onBlur={(e) => updateAuftrag({ notdienst_zuschlag_prozent: num(e.target.value) })} placeholder="z. B. 50" />
                    </label>
                  )}
                </div>

                {/* Positionen */}
                <div style={{ fontWeight: 800, marginTop: 6 }}>Positionen</div>
                {positionen.map((p) => {
                  const zeile = Number(p.menge) * Number(p.einzelpreis_netto) + Number(p.wegepauschale_netto);
                  return (
                    <div key={p.id} style={styles.posZeile}>
                      <span style={{ minWidth: 150, fontWeight: 700 }}>{p.bezeichnung}</span>
                      <span style={{ minWidth: 180, color: C.textDim }}>
                        {p.menge} {p.einheit} × {eur(p.einzelpreis_netto)}{p.wegepauschale_netto > 0 ? ` + ${eur(p.wegepauschale_netto)} Anfahrt` : ''}
                      </span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: 700 }}>{eur(zeile)}</span>
                      {!gesperrt && <button style={styles.xBtn} title="Position entfernen" onClick={() => positionLoeschen(p.id)}>✕</button>}
                    </div>
                  );
                })}
                {!positionen.length && <p style={styles.dim}>Noch keine Positionen.</p>}

                {/* Positions-Editor */}
                {gesperrt ? (
                  <div style={styles.hinweis}>Auftrag ist „erledigt" — Positionen sind gesperrt. Für Änderungen den Status zurücksetzen.</div>
                ) : (
                  <div style={styles.editor}>
                    <div style={styles.modusZeile}>
                      <button style={{ ...styles.modusBtn, ...(posModus === 'einsatzmittel' ? styles.modusAktiv : {}) }} onClick={() => setPosModus('einsatzmittel')}>Einsatzmittel</button>
                      <button style={{ ...styles.modusBtn, ...(posModus === 'leistung' ? styles.modusAktiv : {}) }} onClick={() => setPosModus('leistung')}>Freie Leistung</button>
                    </div>
                    {posModus === 'einsatzmittel' ? (
                      <div style={styles.row}>
                        <label style={styles.lab}>Einsatzmittel
                          <select style={{ ...styles.inp, minWidth: 180 }} value={emAuswahl} onChange={(e) => setEmAuswahl(e.target.value)}>
                            <option value="">— wählen —</option>
                            {einsatzmittel.map((e) => <option key={e.id} value={e.id}>{e.bezeichnung}{e.stundensatz_netto != null ? ` (${eur(e.stundensatz_netto)}/Std)` : ''}</option>)}
                          </select>
                        </label>
                        <label style={styles.lab}>Stunden<input style={{ ...styles.inp, width: 80 }} value={emMenge} onChange={(e) => setEmMenge(e.target.value)} inputMode="decimal" /></label>
                        <button style={styles.dazuBtn} onClick={positionEinsatzmittel}>＋ Position</button>
                        {einsatzmittel.length === 0 && <span style={{ color: C.warn, fontSize: 13 }}>Erst Einsatzmittel anlegen.</span>}
                      </div>
                    ) : (
                      <div style={styles.row}>
                        <input style={{ ...styles.inp, flex: 1, minWidth: 140 }} value={freie.bezeichnung} onChange={(e) => setFreie({ ...freie, bezeichnung: e.target.value })} placeholder="Leistung (z. B. Entsorgung)" />
                        <label style={styles.lab}>Menge<input style={{ ...styles.inp, width: 70 }} value={freie.menge} onChange={(e) => setFreie({ ...freie, menge: e.target.value })} inputMode="decimal" /></label>
                        <label style={styles.lab}>Einheit
                          <select style={styles.inp} value={freie.einheit} onChange={(e) => setFreie({ ...freie, einheit: e.target.value })}>
                            {EINHEITEN.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </label>
                        <label style={styles.lab}>Preis €<input style={{ ...styles.inp, width: 90 }} value={freie.einzelpreis} onChange={(e) => setFreie({ ...freie, einzelpreis: e.target.value })} inputMode="decimal" /></label>
                        <label style={styles.lab}>USt %<input style={{ ...styles.inp, width: 66 }} value={freie.steuersatz} onChange={(e) => setFreie({ ...freie, steuersatz: e.target.value })} inputMode="decimal" /></label>
                        <button style={styles.dazuBtn} onClick={positionFreie}>＋ Position</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Summe */}
                {positionen.length > 0 && (
                  <div style={styles.summe}>
                    {zuschlag > 0 && (
                      <>
                        <div style={styles.summeZeile}><span>Zwischensumme netto</span><span>{eur(nettoPos)}</span></div>
                        <div style={styles.summeZeile}><span>Notdienst-Zuschlag (+{zuschlag} %)</span><span>{eur(nettoGesamt - nettoPos)}</span></div>
                      </>
                    )}
                    <div style={styles.summeZeile}><span>Netto gesamt</span><span>{eur(nettoGesamt)}</span></div>
                    <div style={styles.summeZeile}><span>zzgl. USt</span><span>{eur(steuerGesamt)}</span></div>
                    <div style={{ ...styles.summeZeile, ...styles.summeBrutto }}><span>Brutto gesamt</span><span>{eur(bruttoGesamt)}</span></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  subnav: { display: 'flex', gap: 8, margin: '12px 0 4px', flexWrap: 'wrap' },
  subnavAktiv: { background: C.gold, color: C.navy, borderRadius: 9, padding: '7px 14px', fontSize: 14, fontWeight: 800 },
  subnavLink: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 14px', fontSize: 14, fontWeight: 700, textDecoration: 'none' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0' },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.text, alignSelf: 'flex-end', paddingBottom: 8 },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  split: { display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) 1fr', gap: 16, marginTop: 12, alignItems: 'start' },
  lvListe: { display: 'flex', flexDirection: 'column', gap: 8 },
  lvItem: { textAlign: 'left', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', color: C.text, fontFamily: 'inherit' },
  lvAktiv: { borderColor: C.gold },
  posZeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 6, fontSize: 14 },
  xBtn: { background: 'transparent', color: C.textDim, border: 'none', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit', flexShrink: 0 },
  editor: { background: C.navy, border: `1px dashed ${C.border}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 },
  modusZeile: { display: 'flex', gap: 8 },
  modusBtn: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  modusAktiv: { background: 'rgba(0,229,255,0.14)', borderColor: C.cyan, color: C.text },
  hinweis: { fontSize: 13, color: C.warn, background: 'rgba(224,162,76,0.09)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 9, padding: '10px 12px' },
  dazuBtn: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  summe: { marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 },
  summeZeile: { display: 'flex', justifyContent: 'space-between', fontSize: 14, color: C.textDim },
  summeBrutto: { fontSize: 17, fontWeight: 800, color: C.gold, borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4 },
};
