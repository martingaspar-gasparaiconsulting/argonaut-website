'use client';

import { useEffect, useState } from 'react';

// ============================================================
// ARGONAUT OS · MARKETING · Landingpage-Auswertung (Funnel-Analytics Paket 1)
// Zeigt je Landingpage den Funnel Aufrufe → Anmeldungen → Bestätigt mit Quoten,
// plus eine Gesamt-Übersicht. Liest nur /api/marketing/lp-analytics.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};

type Zeile = {
  landingpage_id: string; slug: string; titel: string; aktiv: boolean;
  aufrufe: number; anmeldungen: number; bestaetigungen: number;
  quoteAnmeldung: number; quoteBestaetigung: number;
};
type Gesamt = {
  aufrufe: number; anmeldungen: number; bestaetigungen: number;
  quoteAnmeldung: number; quoteBestaetigung: number;
};
type TagPunkt = { datum: string; aufrufe: number; anmeldungen: number; bestaetigungen: number };

export default function LpAuswertungSeite() {
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [gesamt, setGesamt] = useState<Gesamt>({ aufrufe: 0, anmeldungen: 0, bestaetigungen: 0, quoteAnmeldung: 0, quoteBestaetigung: 0 });
  const [verlauf, setVerlauf] = useState<TagPunkt[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setLoading(true); setFehler(null);
    try {
      const res = await fetch('/api/marketing/lp-analytics');
      const j = await res.json();
      if (!res.ok || !j?.ok) { setFehler(j?.error || 'Laden fehlgeschlagen.'); }
      else { setZeilen(j.zeilen as Zeile[]); setGesamt(j.gesamt as Gesamt); setVerlauf((j.verlauf ?? []) as TagPunkt[]); }
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { laden(); }, []);

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 }}>
              📊 Landingpage-Auswertung
            </h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>
              Was Ihre Landingpages bringen — vom Aufruf bis zur bestätigten Anmeldung.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="/dashboard/marketing/landingpages" style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' }}>‹ Zurück zu Landingpages</a>
            <button onClick={laden} style={{ background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '10px 18px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, cursor: 'pointer' }}>↻ Aktualisieren</button>
          </div>
        </div>

        {/* So geht's */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: `1px solid ${C.gold}`, marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: C.gold, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 8 }}>So lesen Sie das</div>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: 0, fontSize: 'clamp(14px, 1.2vw, 19px)', lineHeight: 1.6 }}>
            <strong style={{ color: '#fff' }}>Aufrufe</strong> = wie oft die Seite geöffnet wurde. <strong style={{ color: '#fff' }}>Anmeldungen</strong> = wie viele das Formular abgeschickt haben.
            <strong style={{ color: '#fff' }}> Bestätigt</strong> = wie viele danach den Bestätigungs-Link in der E-Mail geklickt haben (Double-Opt-In) — erst diese zählen als echte Kontakte.
            Die Prozentwerte zeigen, wie gut jede Stufe in die nächste übergeht.
          </p>
        </div>

        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade Auswertung…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>{fehler}</div>
        ) : (
          <>
            {/* Gesamt-KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Aufrufe', wert: String(gesamt.aufrufe), farbe: C.cyan },
                { label: 'Anmeldungen', wert: String(gesamt.anmeldungen), farbe: C.gold },
                { label: 'Bestätigt', wert: String(gesamt.bestaetigungen), farbe: C.green },
                { label: 'Aufruf → Anmeldung', wert: `${gesamt.quoteAnmeldung} %`, farbe: C.gold },
                { label: 'Anmeldung → Bestätigt', wert: `${gesamt.quoteBestaetigung} %`, farbe: C.green },
              ].map((kp) => (
                <div key={kp.label} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(28px, 2.6vw, 42px)', fontWeight: 700, color: kp.farbe }}>{kp.wert}</div>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.15vw, 18px)' }}>{kp.label}</div>
                </div>
              ))}
            </div>

            {zeilen.length === 0 ? (
              <div style={{ background: C.navy2, borderRadius: 14, padding: '48px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
                <div style={{ fontSize: 'clamp(38px, 4vw, 56px)', marginBottom: 12 }}>📊</div>
                <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(16px, 1.38vw, 22px)', margin: '0 0 18px' }}>
                  Noch keine Landingpage angelegt. Sobald eine Seite live ist und Besucher kommen, erscheinen hier die Zahlen.
                </p>
                <a href="/dashboard/marketing/landingpages" style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 22px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 800, textDecoration: 'none' }}>Zu den Landingpages</a>
              </div>
            ) : (
              <>
                <div style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 24 }}>
                  <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: C.gold, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 4 }}>Verlauf — letzte 30 Tage</div>
                  <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '0 0 14px', fontSize: 'clamp(12px, 1.05vw, 16px)' }}>Alle Landingpages zusammen. Fahren Sie mit der Maus über einen Balken für Tag und Wert.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                    <MiniVerlauf punkte={verlauf} feld="aufrufe" farbe={C.cyan} label="Aufrufe" />
                    <MiniVerlauf punkte={verlauf} feld="anmeldungen" farbe={C.gold} label="Anmeldungen" />
                    <MiniVerlauf punkte={verlauf} feld="bestaetigungen" farbe={C.green} label="Bestätigt" />
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                {zeilen.map((z) => (
                  <div key={z.landingpage_id} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                      <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(17px, 1.5vw, 24px)' }}>{z.titel}</span>
                      <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.06vw, 16px)', color: z.aktiv ? C.green : C.textDim, border: `1px solid ${z.aktiv ? C.green : C.textDim}`, borderRadius: 12, padding: '2px 10px' }}>{z.aktiv ? 'Live' : 'Entwurf'}</span>
                      <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.cyan, fontSize: 'clamp(12px, 1vw, 16px)', wordBreak: 'break-all' }}>/lp/{z.slug}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, flexWrap: 'wrap' }}>
                      <Stufe label="Aufrufe" wert={z.aufrufe} farbe={C.cyan} />
                      <Pfeil quote={z.quoteAnmeldung} />
                      <Stufe label="Anmeldungen" wert={z.anmeldungen} farbe={C.gold} />
                      <Pfeil quote={z.quoteBestaetigung} />
                      <Stufe label="Bestätigt" wert={z.bestaetigungen} farbe={C.green} />
                    </div>
                  </div>
                ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stufe({ label, wert, farbe }: { label: string; wert: number; farbe: string }) {
  return (
    <div style={{ flex: '1 1 120px', minWidth: 120, background: '#0A1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(26px, 2.4vw, 38px)', fontWeight: 700, color: farbe }}>{wert}</div>
      <div style={{ fontFamily: 'DM Sans, sans-serif', color: '#8FA3BE', fontSize: 'clamp(12px, 1.06vw, 16px)' }}>{label}</div>
    </div>
  );
}

function Pfeil({ quote }: { quote: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 56, color: '#8FA3BE' }}>
      <div style={{ fontSize: 22, lineHeight: 1 }}>→</div>
      <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.06vw, 15px)', fontWeight: 700, color: quote > 0 ? '#C9A84C' : '#8FA3BE' }}>{quote} %</div>
    </div>
  );
}

function datumKurz(iso: string): string {
  if (!iso) return '';
  const t = iso.split('-');
  return t.length === 3 ? `${t[2]}.${t[1]}.` : iso;
}

/** Kleines Balken-Diagramm einer Kennzahl ueber die Tagesreihe (Small Multiple, eine Farbe). */
function MiniVerlauf({ punkte, feld, farbe, label }: {
  punkte: TagPunkt[]; feld: 'aufrufe' | 'anmeldungen' | 'bestaetigungen'; farbe: string; label: string;
}) {
  const werte = punkte.map((p) => p[feld]);
  const max = Math.max(1, ...werte);
  const summe = werte.reduce((s, v) => s + v, 0);
  const W = 600, H = 96, padX = 4, achse = 16;
  const n = Math.max(1, punkte.length);
  const slot = (W - padX * 2) / n;
  const barW = Math.max(2, slot - 2);
  const nutzH = H - achse - 6;

  return (
    <div style={{ background: '#0A1628', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontFamily: 'DM Sans, sans-serif', color: '#fff', fontWeight: 700, fontSize: 'clamp(14px, 1.2vw, 18px)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: farbe, fontWeight: 700, fontSize: 'clamp(16px, 1.4vw, 22px)' }}>{summe}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={`${label}: Verlauf der letzten ${punkte.length} Tage`}>
        <line x1={padX} y1={H - achse} x2={W - padX} y2={H - achse} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
        {punkte.map((p, i) => {
          const v = p[feld];
          const h = v <= 0 ? 0 : Math.max(3, Math.round((v / max) * nutzH));
          const x = padX + i * slot;
          const y = (H - achse) - h;
          return (
            <g key={p.datum}>
              {v > 0 && <rect x={x} y={y} width={barW} height={h} rx={1.5} fill={farbe} />}
              <rect x={x} y={0} width={barW} height={H - achse} fill="transparent">
                <title>{`${datumKurz(p.datum)} ${v}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Sans, sans-serif', color: '#8FA3BE', fontSize: 11, marginTop: 2 }}>
        <span>{datumKurz(punkte[0]?.datum ?? '')}</span>
        <span>{datumKurz(punkte[punkte.length - 1]?.datum ?? '')}</span>
      </div>
    </div>
  );
}
