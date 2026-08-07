'use client';
import { useCallback, useEffect, useState } from 'react';

// ============================================================================
// ARGONAUT OS · app/admin/abo-einzug/page.tsx  (Teil 2c · Betreiber-Einzug)
//
// OPERATOR-Sicht: alle Kunden-Abos. Neue Abos freigeben, einzugsbereite
// auswählen, EINE SEPA-Sammellastschrift herunterladen und als eingezogen
// markieren. Nichts wird automatisch abgebucht — die Datei reichst DU bei
// deiner Bank ein. Liegt unter /admin -> serverseitiges Admin-Schloss.
// Look: Command-Center-Marken-Design (Navy/Gold, Syne + DM Sans).
// ============================================================================

const C = {
  navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', dim: 'rgba(255,255,255,0.45)', border: 'rgba(201,168,76,0.16)',
  card: 'rgba(255,255,255,0.04)', rot: '#e0a066',
};
const SYNE = 'var(--font-syne), sans-serif';
const SANS = 'var(--font-dm-sans), system-ui, sans-serif';

type Abo = {
  id: string; firma: string; stufe: string; nettoMon: number; bruttoMon: number;
  status: string; mandatErteilt: boolean; iban: string | null; mandatsreferenz: string | null;
  sequenz: 'FRST' | 'RCUR'; letzterEinzug: string | null; naechsterFaellig: string | null;
};

function eur(n: number) { return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function ibanMask(iban: string | null) { if (!iban) return '—'; return iban.length > 8 ? iban.slice(0, 4) + ' … ' + iban.slice(-4) : iban; }

export default function AboEinzug() {
  const [abos, setAbos] = useState<Abo[]>([]);
  const [ladend, setLadend] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [letzteDatei, setLetzteDatei] = useState<string[]>([]);

  const laden = useCallback(async () => {
    setLadend(true);
    try {
      const res = await fetch('/api/admin/abo-einzug', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setFehler(j.error || 'Fehler beim Laden.'); }
      else {
        setFehler(null);
        setAbos(j.abos as Abo[]);
        setSel(new Set((j.abos as Abo[]).filter((a) => a.status === 'aktiv' && a.mandatErteilt).map((a) => a.id)));
      }
    } catch { setFehler('Netzwerkfehler.'); } finally { setLadend(false); }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const neue = abos.filter((a) => a.status === 'neu');
  const aktive = abos.filter((a) => a.status === 'aktiv');
  const selArr = aktive.filter((a) => sel.has(a.id));
  const summe = selArr.reduce((s, a) => s + a.bruttoMon, 0);

  async function freigeben(id: string) {
    setBusy(true); setMeldung(null); setFehler(null);
    try {
      const res = await fetch('/api/admin/abo-einzug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'freigeben', aboId: id }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) setFehler(j.error || 'Freigabe fehlgeschlagen.');
      else { setMeldung('Abo freigegeben.'); await laden(); }
    } catch { setFehler('Netzwerkfehler.'); } finally { setBusy(false); }
  }

  async function dateiLaden() {
    if (selArr.length === 0) { setFehler('Bitte mindestens ein Abo auswählen.'); return; }
    setBusy(true); setMeldung(null); setFehler(null);
    try {
      const ids = selArr.map((a) => a.id);
      const res = await fetch('/api/admin/abo-einzug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sepa-datei', aboIds: ids }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setFehler(j.error || 'Datei konnte nicht erstellt werden.'); return; }
      const blob = new Blob([j.xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = j.dateiname; document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      setLetzteDatei(ids);
      setMeldung(`SEPA-Datei erstellt: ${j.anzahl} Einzüge, zusammen ${eur(j.summe)} · Ausführung ${j.ausfuehrung}. Bitte im Online-Banking hochladen, danach unten „als eingezogen markieren".`);
    } catch { setFehler('Netzwerkfehler.'); } finally { setBusy(false); }
  }

  async function markieren() {
    if (letzteDatei.length === 0) return;
    setBusy(true); setMeldung(null); setFehler(null);
    try {
      const res = await fetch('/api/admin/abo-einzug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'markieren', aboIds: letzteDatei }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) setFehler(j.error || 'Markieren fehlgeschlagen.');
      else { setMeldung(`${j.markiert} Abo(s) als eingezogen markiert. Nächster Einzug in einem Monat.`); setLetzteDatei([]); await laden(); }
    } catch { setFehler('Netzwerkfehler.'); } finally { setBusy(false); }
  }

  function toggle(id: string) { setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.dim, borderBottom: `1px solid ${C.border}`, fontFamily: SANS, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 14, color: C.text, borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle' };
  const btn = (bg: string, bd: string, col: string): React.CSSProperties => ({ border: `1px solid ${bd}`, background: bg, color: col, fontFamily: SYNE, fontSize: 13.5, fontWeight: 700, padding: '10px 16px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.55 : 1 });

  return (
    <main style={{ minHeight: '100vh', background: C.navy, color: C.text, fontFamily: SANS, padding: 'clamp(1rem, 3vw, 2.5rem)' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.gold, fontWeight: 600 }}>Betreiber</div>
            <h1 style={{ fontSize: 'clamp(1.4rem, 3.2vw, 2.1rem)', fontWeight: 700, margin: '4px 0 0', fontFamily: SYNE, letterSpacing: '-0.01em' }}>Abo-Einzug</h1>
          </div>
          <a href="/admin/command-center" style={{ fontSize: 13, color: C.dim, textDecoration: 'none' }}>← Zurück zum Command Center</a>
        </div>

        <p style={{ fontSize: 14, color: C.dim, maxWidth: 760, lineHeight: 1.6, marginBottom: 20 }}>
          Sammel-Lastschrift für alle ausgewählten Kunden in einer Datei. Es wird nichts automatisch abgebucht — du lädst die Datei herunter und reichst sie in deinem Online-Banking ein. Erst-Einzug = FRST, danach RCUR (automatisch).
        </p>

        {meldung && <div style={{ padding: '12px 16px', background: 'rgba(76,175,125,0.08)', border: `1px solid rgba(76,175,125,0.4)`, borderRadius: 10, fontSize: 13.5, color: C.green, marginBottom: 16, lineHeight: 1.5 }}>{meldung}</div>}
        {fehler && <div style={{ padding: '12px 16px', background: 'rgba(224,160,102,0.08)', border: '1px solid rgba(224,160,102,0.4)', borderRadius: 10, fontSize: 13.5, color: C.rot, marginBottom: 16 }}>{fehler}</div>}

        {ladend ? <div style={{ color: C.dim }}>Lade Abos …</div> : (
          <>
            {/* Zur Freigabe */}
            {neue.length > 0 && (
              <section style={{ border: `1px solid rgba(201,168,76,0.3)`, background: 'rgba(201,168,76,0.05)', borderRadius: 16, marginBottom: 22, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', color: C.gold, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>Neu gemeldet — zur Freigabe ({neue.length})</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                    <thead><tr><th style={th}>Firma</th><th style={th}>Stufe</th><th style={th}>Brutto/Mon.</th><th style={th}>Mandat</th><th style={th}></th></tr></thead>
                    <tbody>
                      {neue.map((a) => (
                        <tr key={a.id}>
                          <td style={{ ...td, fontWeight: 600 }}>{a.firma}</td>
                          <td style={td}>{a.stufe}</td>
                          <td style={td}>{eur(a.bruttoMon)}</td>
                          <td style={td}>{a.mandatErteilt ? <span style={{ color: C.green }}>erteilt</span> : <span style={{ color: C.rot }}>fehlt</span>}</td>
                          <td style={{ ...td, textAlign: 'right' }}><button disabled={busy} onClick={() => freigeben(a.id)} style={btn('rgba(76,175,125,0.15)', 'rgba(76,175,125,0.55)', '#eafff2')}>Freigeben</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Einzugsbereit */}
            <section style={{ border: `1px solid ${C.border}`, borderRadius: 16, background: C.card, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '16px 18px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', color: C.dim, textTransform: 'uppercase' }}>Einzugsbereit ({aktive.length}) · ausgewählt: {selArr.length}</div>
                <div style={{ fontSize: 15 }}>Summe: <b style={{ color: C.gold, fontFamily: SYNE }}>{eur(summe)}</b></div>
              </div>

              {aktive.length === 0 ? (
                <div style={{ padding: 22, color: C.dim }}>Keine einzugsbereiten Abos. Erst oben freigeben.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                    <thead><tr><th style={th}></th><th style={th}>Firma</th><th style={th}>Stufe</th><th style={th}>Brutto/Mon.</th><th style={th}>Sequenz</th><th style={th}>IBAN</th><th style={th}>Referenz</th></tr></thead>
                    <tbody>
                      {aktive.map((a) => (
                        <tr key={a.id} style={{ opacity: a.mandatErteilt ? 1 : 0.5 }}>
                          <td style={{ ...td, width: 40, textAlign: 'center' }}><input type="checkbox" checked={sel.has(a.id)} disabled={!a.mandatErteilt} onChange={() => toggle(a.id)} style={{ accentColor: C.gold, width: 16, height: 16 }} /></td>
                          <td style={{ ...td, fontWeight: 600 }}>{a.firma}</td>
                          <td style={td}>{a.stufe}</td>
                          <td style={td}>{eur(a.bruttoMon)}</td>
                          <td style={td}><span style={{ fontSize: 12.5, fontWeight: 700, color: a.sequenz === 'FRST' ? C.gold : C.cyan }}>{a.sequenz}</span></td>
                          <td style={{ ...td, fontSize: 13, color: C.dim }}>{ibanMask(a.iban)}</td>
                          <td style={{ ...td, fontSize: 12.5, color: C.dim }}>{a.mandatsreferenz || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '16px 18px', borderTop: `1px solid ${C.border}` }}>
                <button disabled={busy || selArr.length === 0} onClick={dateiLaden} style={btn(C.gold, C.gold, '#0A1628')}>⤓ SEPA-Datei herunterladen ({selArr.length})</button>
                <button disabled={busy || letzteDatei.length === 0} onClick={markieren} style={btn('transparent', 'rgba(76,175,125,0.55)', letzteDatei.length ? C.green : 'rgba(255,255,255,0.3)')}>✓ Als eingezogen markieren</button>
              </div>
            </section>

            <p style={{ marginTop: 16, fontSize: 12.5, color: C.dim, lineHeight: 1.6, maxWidth: 760 }}>
              Fehlen die Gläubiger-Daten (Env-Variablen), meldet der Download einen Hinweis — dann zuerst SEPA_CREDITOR_NAME/IBAN/GLAEUBIGER_ID in Vercel setzen.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
