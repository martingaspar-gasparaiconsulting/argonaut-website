'use client';

import { useEffect, useState } from 'react';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · KI-Lagebericht
// Datenehrlicher Marketing-Berater: liest /api/marketing/lagebericht und zeigt
// Ampel + KI-Klartext + Kennzahlen + Kanal-Balken + Befunde mit Empfehlung.
// Look = Kunden-Dashboard (Navy/Gold/Cyan) — für Kunde UND Betreiber identisch.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)',
};

type Befund = { schwere: 'gut' | 'hinweis' | 'warnung'; titel: string; text: string; kennzahl?: string };
type Kpis = {
  leadsGesamt: number; leadsNeu: number; leadsDieseWoche: number;
  adsAusgaben: number; adsUmsatz: number; adsRoas: number | null; aktiveKanaele: number;
};
type Daten = {
  ok: boolean; error?: string;
  ampel: 'gut' | 'hinweis' | 'warnung';
  kpis: Kpis;
  kanaeleLeads: Array<{ quelle: string; anzahl: number }>;
  regionen: Array<{ land: string; anzahl: number }>;
  befunde: Befund[];
  klartext: string;
};

const FARBE: Record<string, string> = { gut: C.green, hinweis: C.gold, warnung: C.danger };
const AMPEL_TEXT: Record<string, string> = {
  gut: 'Dein Marketing läuft rund',
  hinweis: 'Ein paar Stellschrauben warten',
  warnung: 'Es gibt etwas Dringendes',
};

function eur(n: number) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }); }

export default function LageberichtPage() {
  const [daten, setDaten] = useState<Daten | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/marketing/lagebericht');
        if (res.status === 401 || res.status === 403) { setFehler('Bitte einloggen.'); setLaden(false); return; }
        const j = (await res.json()) as Daten;
        if (!j.ok) { setFehler(j.error || 'Bericht konnte nicht geladen werden.'); setLaden(false); return; }
        setDaten(j);
      } catch { setFehler('Bericht konnte nicht geladen werden.'); } finally { setLaden(false); }
    })();
  }, []);

  const maxLead = Math.max(1, ...(daten?.kanaeleLeads.map((k) => k.anzahl) ?? [1]));

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', fontWeight: 800, margin: 0 }}>KI-Lagebericht</h1>
      <p style={{ color: C.textDim, fontSize: 14.5, lineHeight: 1.5, margin: '8px 0 20px', maxWidth: 760 }}>
        Dein Marketing auf einen Blick — was läuft, was dringend ist, und was du als Nächstes tun solltest. Aus deinen echten Zahlen (Leads, Kanäle, Kampagnen, Landingpages).
      </p>

      {fehler && <div style={{ color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}>{fehler}</div>}
      {laden ? <p style={{ color: C.textDim }}>Bericht wird erstellt …</p> : daten && (
        <>
          {/* Ampel */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: `${FARBE[daten.ampel]}14`, border: `1px solid ${FARBE[daten.ampel]}66`, borderRadius: 16, padding: '16px 20px', marginBottom: 18 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: FARBE[daten.ampel], flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 18, color: FARBE[daten.ampel] }}>{AMPEL_TEXT[daten.ampel]}</div>
              <div style={{ color: C.textDim, fontSize: 13, marginTop: 2 }}>{daten.befunde.length} Befund(e) aus deinen aktuellen Daten.</div>
            </div>
          </div>

          {/* KI-Klartext */}
          {daten.klartext && (
            <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: C.cyan, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Dein Berater sagt</div>
              <p style={{ margin: 0, lineHeight: 1.65, fontSize: 15 }}>{daten.klartext}</p>
            </div>
          )}

          {/* Kennzahlen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
            {[
              { label: 'Leads gesamt', wert: String(daten.kpis.leadsGesamt), farbe: C.gold },
              { label: 'Neu / offen', wert: String(daten.kpis.leadsNeu), farbe: daten.kpis.leadsNeu > 0 ? C.warn : C.green },
              { label: 'Diese Woche', wert: String(daten.kpis.leadsDieseWoche), farbe: C.cyan },
              { label: 'Aktive Kanäle', wert: `${daten.kpis.aktiveKanaele}/4`, farbe: C.green },
              ...(daten.kpis.adsAusgaben > 0 ? [
                { label: 'Werbe-Ausgaben', wert: eur(daten.kpis.adsAusgaben), farbe: C.textDim },
                { label: 'Werbe-Umsatz', wert: eur(daten.kpis.adsUmsatz), farbe: C.green },
                { label: 'ROAS', wert: daten.kpis.adsRoas != null ? `${daten.kpis.adsRoas}×` : '—', farbe: C.gold },
              ] : []),
            ].map((k) => (
              <div key={k.label} style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ color: C.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
                <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, color: k.farbe, marginTop: 6 }}>{k.wert}</div>
              </div>
            ))}
          </div>

          {/* Kanal-Balken (Leads je Quelle) */}
          {daten.kanaeleLeads.length > 0 && (
            <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 18 }}>
              <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Leads je Kanal</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {daten.kanaeleLeads.map((k, i) => (
                  <div key={k.quelle} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 44px', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13.5, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.quelle}</span>
                    <div style={{ height: 22, background: 'rgba(143,163,190,0.12)', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(4, Math.round((k.anzahl / maxLead) * 100))}%`, background: i === 0 ? C.gold : C.cyan, borderRadius: 6 }} />
                    </div>
                    <span style={{ textAlign: 'right', fontWeight: 700, fontSize: 14 }}>{k.anzahl}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Region (geschätzt aus PLZ) */}
          {daten.regionen.length > 0 && (
            <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16 }}>Leads je Region</div>
                <div style={{ color: C.textDim, fontSize: 12 }}>geschätzt aus der PLZ</div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {daten.regionen.map((r, i) => {
                  const maxReg = Math.max(1, ...daten.regionen.map((x) => x.anzahl));
                  return (
                    <div key={r.land} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 44px', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 13.5, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.land}</span>
                      <div style={{ height: 22, background: 'rgba(143,163,190,0.12)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(4, Math.round((r.anzahl / maxReg) * 100))}%`, background: i === 0 ? C.gold : C.cyan, borderRadius: 6 }} />
                      </div>
                      <span style={{ textAlign: 'right', fontWeight: 700, fontSize: 14 }}>{r.anzahl}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Befunde */}
          <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, margin: '0 0 12px' }}>Befunde &amp; Empfehlungen</div>
          {daten.befunde.length === 0 ? (
            <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, color: C.textDim }}>
              Noch zu wenig Daten für Empfehlungen. Sobald Anfragen und Kampagnen laufen, füllt sich der Bericht.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {daten.befunde.map((b, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14, background: C.navy2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${FARBE[b.schwere]}`, borderRadius: 12, padding: '14px 16px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: FARBE[b.schwere], marginTop: 6 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{b.titel}</span>
                      {b.kennzahl && <span style={{ fontSize: 12, fontWeight: 700, color: FARBE[b.schwere], border: `1px solid ${FARBE[b.schwere]}`, borderRadius: 999, padding: '1px 9px' }}>{b.kennzahl}</span>}
                    </div>
                    <div style={{ color: C.textDim, fontSize: 13.5, lineHeight: 1.55, marginTop: 5 }}>{b.text}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p style={{ color: C.textDim, fontSize: 12, lineHeight: 1.6, marginTop: 20 }}>
            Hinweis: Der Bericht rechnet mechanisch aus deinen echten Zahlen (kostenlos); die KI formuliert nur den Klartext. Eine regionale Auswertung („mehr Werbung in Bayern statt Niedersachsen") folgt, sobald wir Region/PLZ bei Leads erfassen bzw. Meta/Google-Ads verbunden sind.
          </p>
        </>
      )}
    </div>
  );
}
