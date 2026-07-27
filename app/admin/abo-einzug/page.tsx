'use client';
import { useCallback, useEffect, useState } from 'react';

// ============================================================================
// ARGONAUT OS · app/admin/abo-einzug/page.tsx  (Teil 2c · Betreiber-Einzug)
//
// OPERATOR-Sicht: alle Kunden-Abos. Neue Abos freigeben, einzugsbereite
// auswählen, EINE SEPA-Sammellastschrift herunterladen und als eingezogen
// markieren. Nichts wird automatisch abgebucht — die Datei reichst DU bei
// deiner Bank ein. Liegt unter /admin -> serverseitiges Admin-Schloss.
// ============================================================================

const CYAN = '#00e5ff';
const GOLD = '#C9A84C';
const GRUEN = '#3ddc84';
const mono = "'Share Tech Mono', 'DM Mono', ui-monospace, monospace";

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

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: `${CYAN}aa`, borderBottom: `1px solid ${CYAN}33`, fontFamily: mono, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 14, color: 'rgba(255,255,255,0.9)', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle' };
  const btn = (bg: string, bd: string, col: string): React.CSSProperties => ({ border: `1px solid ${bd}`, background: bg, color: col, fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, fontWeight: 800, padding: '10px 16px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.55 : 1 });

  return (
    <main style={{ minHeight: '100vh', background: 'radial-gradient(circle at 50% -10%, #0d1f33 0%, #050810 60%)', color: '#fff', fontFamily: 'DM Sans, sans-serif', padding: '32px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.3em', color: `${CYAN}aa`, fontFamily: mono }}>ARGONAUT · OPERATOR</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, margin: '4px 0 0', letterSpacing: '0.05em', color: CYAN, fontFamily: mono }}>ABO-EINZUG</h1>
        </div>
        <a href="/admin/command-center" style={{ fontFamily: mono, fontSize: 12, letterSpacing: '0.1em', color: GOLD, border: `1px solid ${GOLD}66`, borderRadius: 6, padding: '8px 16px', textDecoration: 'none', background: `${GOLD}12` }}>‹ COMMAND CENTER</a>
      </div>

      <p style={{ fontFamily: mono, fontSize: 12, color: 'rgba(255,255,255,0.45)', maxWidth: 760, lineHeight: 1.6, marginBottom: 20 }}>
        ‣ Sammel-Lastschrift für ALLE ausgewählten Kunden in EINER Datei. Es wird nichts automatisch abgebucht — du lädst die Datei herunter und reichst sie in deinem Online-Banking ein. Erst-Einzug = FRST, danach RCUR (automatisch).
      </p>

      {meldung && <div style={{ padding: '12px 16px', background: 'rgba(61,220,132,0.08)', border: `1px solid ${GRUEN}55`, borderRadius: 10, fontFamily: mono, fontSize: 13, color: GRUEN, marginBottom: 16, lineHeight: 1.5 }}>{meldung}</div>}
      {fehler && <div style={{ padding: '12px 16px', background: 'rgba(255,90,90,0.08)', border: '1px solid rgba(255,90,90,0.4)', borderRadius: 10, fontFamily: mono, fontSize: 13, color: '#ff8a8a', marginBottom: 16 }}>⚠ {fehler}</div>}

      {ladend ? <div style={{ fontFamily: mono, color: `${CYAN}cc` }}>‣ Lade Abos …</div> : (
        <>
          {/* Zur Freigabe */}
          {neue.length > 0 && (
            <section style={{ border: `1px solid ${GOLD}44`, background: `${GOLD}0c`, borderRadius: 12, marginBottom: 22, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', fontFamily: mono, fontSize: 12, letterSpacing: '0.12em', color: `${GOLD}dd`, textTransform: 'uppercase', borderBottom: `1px solid ${GOLD}33` }}>⚑ Neu gemeldet — zur Freigabe ({neue.length})</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead><tr><th style={th}>Firma</th><th style={th}>Stufe</th><th style={th}>Brutto/Mon.</th><th style={th}>Mandat</th><th style={th}></th></tr></thead>
                  <tbody>
                    {neue.map((a) => (
                      <tr key={a.id}>
                        <td style={{ ...td, fontWeight: 700, color: GOLD }}>{a.firma}</td>
                        <td style={td}>{a.stufe}</td>
                        <td style={td}>{eur(a.bruttoMon)}</td>
                        <td style={td}>{a.mandatErteilt ? <span style={{ color: GRUEN }}>erteilt</span> : <span style={{ color: '#ff8a8a' }}>fehlt</span>}</td>
                        <td style={{ ...td, textAlign: 'right' }}><button disabled={busy} onClick={() => freigeben(a.id)} style={btn(`${GRUEN}18`, `${GRUEN}88`, '#eafff2')}>Freigeben</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Einzugsbereit */}
          <section style={{ border: `1px solid ${CYAN}33`, borderRadius: 12, background: 'rgba(5,12,22,0.6)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '16px 18px', borderBottom: `1px solid ${CYAN}22` }}>
              <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: '0.12em', color: `${CYAN}aa`, textTransform: 'uppercase' }}>Einzugsbereit ({aktive.length}) · ausgewählt: {selArr.length}</div>
              <div style={{ fontFamily: mono, fontSize: 15, color: '#fff' }}>Summe: <b style={{ color: GOLD }}>{eur(summe)}</b></div>
            </div>

            {aktive.length === 0 ? (
              <div style={{ padding: 22, color: 'rgba(255,255,255,0.55)', fontFamily: mono }}>‣ Keine einzugsbereiten Abos. Erst oben freigeben.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                  <thead><tr><th style={th}></th><th style={th}>Firma</th><th style={th}>Stufe</th><th style={th}>Brutto/Mon.</th><th style={th}>Sequenz</th><th style={th}>IBAN</th><th style={th}>Referenz</th></tr></thead>
                  <tbody>
                    {aktive.map((a) => (
                      <tr key={a.id} style={{ opacity: a.mandatErteilt ? 1 : 0.5 }}>
                        <td style={{ ...td, width: 40, textAlign: 'center' }}><input type="checkbox" checked={sel.has(a.id)} disabled={!a.mandatErteilt} onChange={() => toggle(a.id)} style={{ accentColor: CYAN, width: 16, height: 16 }} /></td>
                        <td style={{ ...td, fontWeight: 700, color: GOLD }}>{a.firma}</td>
                        <td style={td}>{a.stufe}</td>
                        <td style={td}>{eur(a.bruttoMon)}</td>
                        <td style={td}><span style={{ fontFamily: mono, fontSize: 12, color: a.sequenz === 'FRST' ? GOLD : CYAN }}>{a.sequenz}</span></td>
                        <td style={{ ...td, fontFamily: mono, fontSize: 12.5, color: 'rgba(255,255,255,0.6)' }}>{ibanMask(a.iban)}</td>
                        <td style={{ ...td, fontFamily: mono, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{a.mandatsreferenz || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '16px 18px', borderTop: `1px solid ${CYAN}22` }}>
              <button disabled={busy || selArr.length === 0} onClick={dateiLaden} style={btn(GOLD, GOLD, '#0A1628')}>⤓ SEPA-Datei herunterladen ({selArr.length})</button>
              <button disabled={busy || letzteDatei.length === 0} onClick={markieren} style={btn('transparent', `${GRUEN}88`, letzteDatei.length ? GRUEN : 'rgba(255,255,255,0.3)')}>✓ Als eingezogen markieren</button>
            </div>
          </section>

          <p style={{ marginTop: 16, fontFamily: mono, fontSize: 11.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, maxWidth: 760 }}>
            ‣ Fehlen die Gläubiger-Daten (Env-Variablen), meldet der Download einen Hinweis — dann zuerst SEPA_CREDITOR_NAME/IBAN/GLAEUBIGER_ID in Vercel setzen.
          </p>
        </>
      )}
    </main>
  );
}
