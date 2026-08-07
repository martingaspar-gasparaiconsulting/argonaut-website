'use client';

import { useEffect, useState } from 'react';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · Bewertungs-Kampagne (Punkt 7)
// Viele Kunden auf einmal um eine Bewertung bitten (aus dem CRM), Antwortquote
// sehen. Baut auf dem Bewertungs-Modul auf (Abgabe unter /bewerten/<token>,
// Auswertung/Freigabe unter /dashboard/bewertungen). Look = Kunden-Dashboard.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)',
};

type Empfaenger = { name: string; email: string };
type Kennzahlen = { eingeladen: number; abgegeben: number; offen: number; antwortquote: number; avgSterne: number | null; veroeffentlicht: number };
type Daten = { ok: boolean; error?: string; pool: Empfaenger[]; kennzahlen: Kennzahlen; firma: string };
type Sendeergebnis = { ok: boolean; error?: string; gesendet?: number; fehler?: number; uebersprungen?: number };

export default function BewertungKampagnePage() {
  const [daten, setDaten] = useState<Daten | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [senden, setSenden] = useState(false);
  const [erg, setErg] = useState<string | null>(null);

  async function laden_() {
    setLaden(true); setFehler(null);
    try {
      const res = await fetch('/api/marketing/bewertung-kampagne');
      if (res.status === 401 || res.status === 403) { setFehler('Bitte einloggen.'); setLaden(false); return; }
      const j = (await res.json()) as Daten;
      if (!j.ok) { setFehler(j.error || 'Konnte nicht geladen werden.'); setLaden(false); return; }
      setDaten(j);
      setGewaehlt(new Set());
    } catch { setFehler('Konnte nicht geladen werden.'); } finally { setLaden(false); }
  }

  useEffect(() => { void laden_(); }, []);

  function toggle(email: string) {
    setGewaehlt((prev) => {
      const s = new Set(prev);
      if (s.has(email)) s.delete(email); else s.add(email);
      return s;
    });
  }
  function alle() {
    if (!daten) return;
    setGewaehlt(gewaehlt.size === daten.pool.length ? new Set() : new Set(daten.pool.map((e) => e.email)));
  }

  async function starten() {
    if (!daten || gewaehlt.size === 0) return;
    setSenden(true); setErg(null); setFehler(null);
    const empfaenger = daten.pool.filter((e) => gewaehlt.has(e.email));
    try {
      const res = await fetch('/api/marketing/bewertung-kampagne', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ empfaenger }),
      });
      const j = (await res.json()) as Sendeergebnis;
      if (!j.ok) { setFehler(j.error || 'Versand fehlgeschlagen.'); setSenden(false); return; }
      const teile = [`${j.gesendet ?? 0} Einladung(en) verschickt`];
      if (j.uebersprungen) teile.push(`${j.uebersprungen} übersprungen (schon eingeladen)`);
      if (j.fehler) teile.push(`${j.fehler} fehlgeschlagen`);
      setErg(teile.join(' · '));
      await laden_();
    } catch { setFehler('Versand fehlgeschlagen.'); } finally { setSenden(false); }
  }

  const k = daten?.kennzahlen;

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', fontWeight: 800, margin: 0 }}>
        ⭐ Bewertungs-Kampagne
      </h1>
      <p style={{ color: C.textDim, fontSize: 14.5, lineHeight: 1.5, margin: '8px 0 22px', maxWidth: 800 }}>
        Gute Bewertungen sind der beste Verkäufer. Bitte deine zufriedenen Kunden aus dem CRM <b style={{ color: C.text }}>mit einem Klick</b> um eine Bewertung — die Einladung geht in deinem Namen raus. Abgegebene Bewertungen sammelst und veröffentlichst du im Bewertungs-Modul.
      </p>

      {fehler && <div style={{ color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginBottom: 14 }}>{fehler}</div>}
      {erg && <div style={{ color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginBottom: 14 }}>✓ {erg}</div>}

      {laden ? <p style={{ color: C.textDim }}>Wird geladen …</p> : daten && k && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 22 }}>
            <KpiTile label="Eingeladen" wert={String(k.eingeladen)} farbe={C.cyan} />
            <KpiTile label="Antwortquote" wert={`${k.antwortquote}%`} farbe={C.gold} sub={`${k.abgegeben} abgegeben`} />
            <KpiTile label="Ø Sterne" wert={k.avgSterne != null ? k.avgSterne.toLocaleString('de-DE') : '—'} farbe={C.gold} />
            <KpiTile label="Veröffentlicht" wert={String(k.veroeffentlicht)} farbe={C.green} />
          </div>

          {/* Empfänger-Auswahl */}
          <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16 }}>Kunden einladen</div>
                <div style={{ color: C.textDim, fontSize: 13, marginTop: 2 }}>
                  {daten.pool.length} Kontakt{daten.pool.length === 1 ? '' : 'e'} mit E-Mail, noch nicht eingeladen · max. 50 pro Kampagne
                </div>
              </div>
              {daten.pool.length > 0 && (
                <button onClick={alle} style={{ background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {gewaehlt.size === daten.pool.length ? 'Keine' : 'Alle'} auswählen
                </button>
              )}
            </div>

            {daten.pool.length === 0 ? (
              <div style={{ color: C.textDim, fontSize: 13.5, lineHeight: 1.6 }}>
                Keine offenen Empfänger. Entweder sind alle Kontakte schon eingeladen, oder es gibt noch keine Kontakte mit E-Mail im CRM.
                <div style={{ marginTop: 10 }}>
                  <a href="/dashboard/crm" style={{ color: C.cyan, textDecoration: 'none', fontWeight: 700 }}>Zum CRM →</a>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gap: 6, maxHeight: 360, overflowY: 'auto', marginBottom: 14 }}>
                  {daten.pool.map((e) => {
                    const an = gewaehlt.has(e.email);
                    return (
                      <label key={e.email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: an ? 'rgba(201,168,76,0.10)' : 'rgba(143,163,190,0.05)', border: `1px solid ${an ? C.gold : C.border}`, cursor: 'pointer' }}>
                        <input type="checkbox" checked={an} onChange={() => toggle(e.email)} style={{ width: 17, height: 17, accentColor: C.gold, cursor: 'pointer' }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{e.name || e.email}</span>
                          {e.name && <span style={{ color: C.textDim, fontSize: 12.5, marginLeft: 8 }}>{e.email}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <button
                  onClick={starten}
                  disabled={senden || gewaehlt.size === 0}
                  style={{ background: gewaehlt.size === 0 ? 'rgba(201,168,76,0.3)' : C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 700, fontSize: 15, cursor: senden || gewaehlt.size === 0 ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-syne), sans-serif', opacity: senden ? 0.7 : 1 }}
                >
                  {senden ? 'Sende …' : `★ Kampagne starten (${gewaehlt.size})`}
                </button>
              </>
            )}
          </div>

          {/* Verweis aufs Bewertungs-Modul */}
          <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ color: C.textDim, fontSize: 13.5 }}>Abgegebene Bewertungen ansehen, freigeben und veröffentlichen:</div>
            <a href="/dashboard/bewertungen" style={{ background: 'transparent', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, textDecoration: 'none', fontFamily: 'var(--font-syne), sans-serif' }}>
              Zum Bewertungs-Modul →
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function KpiTile({ label, wert, farbe, sub }: { label: string; wert: string; farbe: string; sub?: string }) {
  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 28, color: farbe, lineHeight: 1.1 }}>{wert}</div>
      <div style={{ color: C.text, fontSize: 13, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ color: C.textDim, fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
