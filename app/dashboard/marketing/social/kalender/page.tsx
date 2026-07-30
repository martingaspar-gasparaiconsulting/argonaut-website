'use client';

import { useEffect, useState, useMemo } from 'react';
import { plattformFuer } from '@/lib/social';
import {
  monatsGitter, beitraegeNachTag, uhrzeit, besteZeitFuer, krummeMinute,
  plusMonate, tagIso, KALENDER_HORIZONT_MONATE, type KalenderBeitrag,
} from '@/lib/socialKalender';

// ============================================================
// ARGONAUT OS · MARKETING · Social · Redaktionskalender (Paket 4)
// Postingzentrale: Beiträge auf Tag + Uhrzeit legen (Stunden-Raster ->
// Minuten-Feinauswahl + „krumme Minute"), Drag & Drop verschieben, bis 12
// Monate voraus. Der Auto-Post-Cron feuert sie automatisch zur Zeit.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const STUNDEN = Array.from({ length: 24 }, (_, i) => i);
const z2 = (n: number) => String(n).padStart(2, '0');

export default function SocialKalenderSeite() {
  const [beitraege, setBeitraege] = useState<KalenderBeitrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [jetztIso, setJetztIso] = useState('');
  const [jahr, setJahr] = useState(0);
  const [monat, setMonat] = useState(0); // 1–12

  // Tag-Planungs-Panel
  const [panelTag, setPanelTag] = useState<string | null>(null);
  const [pickId, setPickId] = useState('');
  const [pickStunde, setPickStunde] = useState<number | null>(9);
  const [pickMinute, setPickMinute] = useState(0);
  const [planBusy, setPlanBusy] = useState(false);
  const [planMeldung, setPlanMeldung] = useState<string | null>(null);

  useEffect(() => {
    const jetzt = new Date();
    setJetztIso(jetzt.toISOString());
    setJahr(jetzt.getFullYear());
    setMonat(jetzt.getMonth() + 1);
    laden();
  }, []);

  async function laden() {
    setLoading(true); setFehler(null);
    try {
      const res = await fetch('/api/marketing/social-beitraege');
      const j = await res.json();
      if (!res.ok || !j?.ok) setFehler(j?.error || 'Laden fehlgeschlagen.');
      else setBeitraege(j.liste as KalenderBeitrag[]);
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLoading(false); }
  }

  const nachTag = useMemo(() => beitraegeNachTag(beitraege), [beitraege]);
  const gitter = useMemo(() => (jetztIso && jahr ? monatsGitter(jahr, monat, jetztIso) : []), [jahr, monat, jetztIso]);

  // Monatsgrenzen: nicht vor diesem Monat, nicht über heute+12 Monate hinaus.
  const grenzen = useMemo(() => {
    if (!jetztIso) return { min: '', max: '' };
    const j = new Date(jetztIso);
    const min = `${j.getFullYear()}-${z2(j.getMonth() + 1)}`;
    const maxD = plusMonate(new Date(j.getFullYear(), j.getMonth(), 1), KALENDER_HORIZONT_MONATE);
    return { min, max: `${maxD.getFullYear()}-${z2(maxD.getMonth() + 1)}` };
  }, [jetztIso]);
  const aktuell = `${jahr}-${z2(monat)}`;

  function monatWechseln(delta: number) {
    let m = monat + delta, j = jahr;
    if (m < 1) { m = 12; j--; } else if (m > 12) { m = 1; j++; }
    const kandidat = `${j}-${z2(m)}`;
    if (kandidat < grenzen.min || kandidat > grenzen.max) return;
    setJahr(j); setMonat(m);
  }

  // Auswählbare Beiträge (Entwürfe + bereits geplante), nicht gesendete.
  const planbar = useMemo(() => beitraege.filter((b) => b.status !== 'gesendet'), [beitraege]);
  const gewaehlt = planbar.find((b) => b.id === pickId) || null;

  function oeffneTag(iso: string, vorauswahl?: KalenderBeitrag) {
    setPanelTag(iso);
    setPlanMeldung(null);
    if (vorauswahl) {
      setPickId(vorauswahl.id);
      if (vorauswahl.geplant_am) {
        const d = new Date(vorauswahl.geplant_am);
        setPickStunde(d.getHours()); setPickMinute(d.getMinutes());
      }
    } else {
      setPickId(planbar[0]?.id || '');
      setPickStunde(9); setPickMinute(0);
    }
  }

  function zeitIsoFuer(tagIsoStr: string, stunde: number, minute: number): string {
    const [y, m, d] = tagIsoStr.split('-').map((x) => parseInt(x, 10));
    return new Date(y, m - 1, d, stunde, minute, 0).toISOString(); // lokal -> UTC
  }

  async function einplanen() {
    if (!panelTag || !pickId) { setPlanMeldung('Bitte einen Beitrag auswählen.'); return; }
    if (pickStunde == null) { setPlanMeldung('Bitte eine Stunde wählen.'); return; }
    setPlanBusy(true); setPlanMeldung(null);
    try {
      const geplant_am = zeitIsoFuer(panelTag, pickStunde, pickMinute);
      const res = await fetch('/api/marketing/social-plan', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ beitrag_id: pickId, geplant_am }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) setPlanMeldung(j?.error || 'Einplanen fehlgeschlagen.');
      else { setPanelTag(null); laden(); }
    } catch { setPlanMeldung('Einplanen fehlgeschlagen.'); }
    finally { setPlanBusy(false); }
  }

  async function verschiebeAufTag(zielIso: string, beitrag: KalenderBeitrag) {
    // Uhrzeit beibehalten, nur den Tag ändern.
    const d = beitrag.geplant_am ? new Date(beitrag.geplant_am) : new Date();
    const geplant_am = zeitIsoFuer(zielIso, d.getHours(), d.getMinutes());
    try {
      const res = await fetch('/api/marketing/social-plan', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ beitrag_id: beitrag.id, geplant_am }),
      });
      const j = await res.json();
      if (res.ok && j?.ok) laden();
    } catch { /* still */ }
  }

  async function zurueckEntwurf(beitrag: KalenderBeitrag) {
    try {
      await fetch('/api/marketing/social-plan', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ beitrag_id: beitrag.id, status: 'entwurf' }),
      });
      laden();
    } catch { /* still */ }
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Kopf */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 }}>📅 Redaktionskalender</h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>
              Ihre Postingzentrale: Beiträge auf Tag &amp; Uhrzeit legen — der Auto-Post schickt sie automatisch raus.
            </p>
          </div>
          <a href="/dashboard/marketing/social" style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' }}>‹ Zurück zu Social</a>
        </div>

        {/* So geht's */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '16px 20px', border: `1px solid ${C.gold}`, marginBottom: 16 }}>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: 0, fontSize: 'clamp(13px, 1.15vw, 18px)', lineHeight: 1.6 }}>
            Auf einen <strong style={{ color: '#fff' }}>Tag klicken</strong> → Beitrag + <strong style={{ color: '#fff' }}>Stunde</strong> wählen → <strong style={{ color: '#fff' }}>Minute</strong> fein einstellen (oder <strong style={{ color: C.gold }}>🎲 krumme Minute</strong> für eine natürliche Zeit). Geplante Beiträge lassen sich per <strong style={{ color: '#fff' }}>Ziehen &amp; Ablegen</strong> auf einen anderen Tag verschieben. Bis {KALENDER_HORIZONT_MONATE} Monate im Voraus.
          </p>
        </div>

        {/* Monatsnavigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
          <button onClick={() => monatWechseln(-1)} disabled={aktuell <= grenzen.min} style={{ ...navBtn, opacity: aktuell <= grenzen.min ? 0.4 : 1, cursor: aktuell <= grenzen.min ? 'not-allowed' : 'pointer' }}>‹ Zurück</button>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(18px, 1.6vw, 26px)' }}>{jahr ? `${MONATE[monat - 1]} ${jahr}` : ''}</div>
          <button onClick={() => monatWechseln(1)} disabled={aktuell >= grenzen.max} style={{ ...navBtn, opacity: aktuell >= grenzen.max ? 0.4 : 1, cursor: aktuell >= grenzen.max ? 'not-allowed' : 'pointer' }}>Weiter ›</button>
        </div>

        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>{fehler}</div>
        ) : (
          <>
            {/* Wochentage */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
              {WOCHENTAGE.map((w) => (
                <div key={w} style={{ textAlign: 'center', fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(12px, 1vw, 15px)', fontWeight: 700 }}>{w}</div>
              ))}
            </div>
            {/* Tage */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {gitter.flat().map((t) => {
                const chips = nachTag[t.iso] || [];
                const klickbar = t.imHorizont;
                return (
                  <div
                    key={t.iso}
                    onClick={() => klickbar && oeffneTag(t.iso)}
                    onDragOver={(e) => { if (klickbar) e.preventDefault(); }}
                    onDrop={(e) => {
                      if (!klickbar) return;
                      e.preventDefault();
                      const id = e.dataTransfer.getData('text/plain');
                      const b = beitraege.find((x) => x.id === id);
                      if (b) verschiebeAufTag(t.iso, b);
                    }}
                    style={{
                      minHeight: 96, background: t.imMonat ? C.navy2 : 'rgba(15,31,51,0.5)',
                      border: `1px solid ${t.istHeute ? C.cyan : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: 10, padding: 6, cursor: klickbar ? 'pointer' : 'default',
                      opacity: klickbar ? 1 : 0.45, display: 'flex', flexDirection: 'column', gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: t.istHeute ? 700 : 400, color: t.istHeute ? C.cyan : t.imMonat ? '#fff' : C.textDim }}>{t.tag}</span>
                      {klickbar && <span style={{ color: C.textDim, fontSize: 14, lineHeight: 1 }}>+</span>}
                    </div>
                    {chips.map((b) => (
                      <div
                        key={b.id}
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', b.id); }}
                        onClick={(e) => { e.stopPropagation(); oeffneTag(t.iso, b); }}
                        title={b.text || ''}
                        style={{ background: '#0b141a', border: `1px solid ${C.green}`, borderRadius: 7, padding: '3px 6px', cursor: 'grab' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: C.green, fontWeight: 700 }}>{uhrzeit(b.geplant_am)}</span>
                          {(b.kanaele || []).map((id) => plattformFuer(id)).filter(Boolean).slice(0, 4).map((p) => (
                            <span key={p!.id} style={{ fontSize: 11 }}>{p!.icon}</span>
                          ))}
                        </div>
                        <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: '#dbe4f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.text || '(kein Text)'}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Beste-Zeiten-Referenz */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.08)', marginTop: 24 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 4 }}>⏰ Beste Zeiten je Kanal</div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 12px', fontSize: 'clamp(12px, 1.05vw, 16px)' }}>Richtwerte — Ihre eigenen Zahlen im Funnel-/Analytics-Bereich schlagen jede Faustregel.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {beste.map((e) => (
              <div key={e.id} style={{ background: C.navy, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 14 }}>{e.icon} {e.name}</div>
                <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.cyan, fontSize: 13, margin: '2px 0' }}>{e.fenster.map((f) => `${f.von}–${f.bis}`).join('  ·  ')}</div>
                <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 12 }}>{e.beitragstyp}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Planungs-Panel */}
      {panelTag && (
        <div style={overlay} onClick={() => setPanelTag(null)}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <h2 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: C.gold, fontSize: 'clamp(20px, 1.9vw, 30px)', margin: '0 0 6px' }}>Einplanen</h2>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 16px', fontSize: 'clamp(13px, 1.1vw, 17px)' }}>Für den {panelTag.split('-').reverse().join('.')}</p>

            {planbar.length === 0 ? (
              <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim }}>Noch kein Beitrag da. Legen Sie zuerst im <a href="/dashboard/marketing/social" style={{ color: C.cyan }}>Editor</a> einen Entwurf an.</p>
            ) : (
              <>
                <label style={lbl}>Beitrag</label>
                <select value={pickId} onChange={(e) => setPickId(e.target.value)} style={input}>
                  {planbar.map((b) => (
                    <option key={b.id} value={b.id}>{(b.status === 'geplant' ? '🕒 ' : '📝 ') + ((b.text || '(kein Text)').slice(0, 48))}</option>
                  ))}
                </select>

                <label style={{ ...lbl, marginTop: 14 }}>Stunde</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {STUNDEN.map((h) => (
                    <button key={h} onClick={() => setPickStunde(h)}
                      style={{ background: pickStunde === h ? C.gold : 'transparent', color: pickStunde === h ? C.navy : C.textDim, border: `1px solid ${pickStunde === h ? C.gold : 'rgba(255,255,255,0.12)'}`, borderRadius: 7, padding: '5px 8px', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: pickStunde === h ? 700 : 400, cursor: 'pointer', minWidth: 38 }}>
                      {z2(h)}
                    </button>
                  ))}
                </div>

                <label style={{ ...lbl, marginTop: 14 }}>Minute</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <input type="number" min={0} max={59} value={pickMinute}
                    onChange={(e) => setPickMinute(Math.max(0, Math.min(59, parseInt(e.target.value || '0', 10) || 0)))}
                    style={{ ...input, width: 90 }} />
                  <button onClick={() => setPickMinute(krummeMinute())} style={{ ...btnGhost, borderColor: C.gold, color: C.gold }}>🎲 krumme Minute</button>
                  <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: '#fff', fontWeight: 700, fontSize: 'clamp(20px, 1.8vw, 28px)' }}>
                    {pickStunde != null ? `${z2(pickStunde)}:${z2(pickMinute)}` : '—'}
                  </span>
                </div>

                {gewaehlt && (
                  <div style={{ marginTop: 14, background: '#0b141a', border: '1px solid rgba(0,229,255,0.3)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 12, marginBottom: 4 }}>Empfohlene Zeiten für diesen Beitrag:</div>
                    {(gewaehlt.kanaele || []).map((id) => plattformFuer(id)).filter(Boolean).map((p) => {
                      const bz = besteZeitFuer(p!.id);
                      return (
                        <div key={p!.id} style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#dbe4f0' }}>
                          {p!.icon} {p!.name}: <span style={{ color: C.cyan }}>{bz ? bz.fenster.map((f) => `${f.von}–${f.bis}`).join(', ') : '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {planMeldung && <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.danger, margin: '12px 0 0', fontSize: 'clamp(13px, 1.1vw, 17px)' }}>{planMeldung}</p>}

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
                  <div>
                    {gewaehlt?.status === 'geplant' && (
                      <button onClick={() => { zurueckEntwurf(gewaehlt); setPanelTag(null); }} style={btnGhost}>In Entwurf zurück</button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setPanelTag(null)} style={btnGhost}>Abbrechen</button>
                    <button onClick={einplanen} disabled={planBusy} style={{ ...btnGold, opacity: planBusy ? 0.7 : 1, cursor: planBusy ? 'wait' : 'pointer' }}>{planBusy ? 'Speichere…' : 'Einplanen'}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Beste-Zeiten-Liste (Kern zuerst) für die Referenzkarte.
const BESTE_IDS = ['google_business', 'facebook', 'instagram', 'linkedin', 'youtube', 'telegram', 'pinterest', 'tiktok', 'x', 'threads', 'bluesky', 'mastodon'];
const beste = BESTE_IDS.map((id) => {
  const p = plattformFuer(id);
  const bz = besteZeitFuer(id);
  return p && bz ? { id, name: p.name, icon: p.icon, fenster: bz.fenster, beitragstyp: bz.beitragstyp } : null;
}).filter(Boolean) as { id: string; name: string; icon: string; fenster: { von: string; bis: string }[]; beitragstyp: string }[];

const lbl: React.CSSProperties = { display: 'block', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', color: '#8FA3BE', marginBottom: 6 };
const input: React.CSSProperties = { width: '100%', background: '#0F1F33', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '10px 12px', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(14px, 1.25vw, 20px)', boxSizing: 'border-box' };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 };
const modal: React.CSSProperties = { background: '#0A1628', borderRadius: 18, padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', border: '1px solid #C9A84C' };
const navBtn: React.CSSProperties = { background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '8px 16px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 };
const btnGold: React.CSSProperties = { background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: 10, padding: '11px 24px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700 };
const btnGhost: React.CSSProperties = { background: 'transparent', color: '#8FA3BE', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer' };
