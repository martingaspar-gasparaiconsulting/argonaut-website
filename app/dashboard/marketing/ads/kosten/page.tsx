'use client';

import { useEffect, useState, useMemo } from 'react';
import { plattformFuer } from '@/lib/ads';
import { formatEuro, formatZahl, roasAmpel } from '@/lib/adsAnalytics';
import { postenAnalyse, type ErgebnisLite, type KampagneLite } from '@/lib/adsKosten';

// ============================================================
// ARGONAUT OS · MARKETING · Ads-Kostenanalyse (Postenanalyse)
// Was kostet mich das? Gesamtkosten, Kosten je Ergebnis, Posten-Aufschlüsselung.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};
const AMPEL: Record<string, string> = { gut: C.green, mittel: C.warn, schwach: C.danger, neutral: C.textDim };
const STATUS_LABEL: Record<string, string> = { entwurf: 'Entwurf', bereit: 'Bereit', aktiv: 'Aktiv', pausiert: 'Pausiert', beendet: 'Beendet' };

type Kampagne = KampagneLite & { name: string };
type Ergebnis = ErgebnisLite & { kampagne_id: string };

export default function AdsKostenanalyse() {
  const [kampagnen, setKampagnen] = useState<Kampagne[]>([]);
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [rK, rE] = await Promise.all([
          fetch('/api/marketing/ads-kampagnen'),
          fetch('/api/marketing/ads-ergebnisse'),
        ]);
        const jK = await rK.json();
        const jE = await rE.json();
        if (jE?.ok) setErgebnisse((jE.liste as Ergebnis[]) || []);
        if (!rK.ok || !jK?.ok) setFehler(jK?.error || 'Laden fehlgeschlagen.');
        else setKampagnen((jK.liste as Kampagne[]) || []);
      } catch { setFehler('Verbindung fehlgeschlagen.'); }
      finally { setLoading(false); }
    })();
  }, []);

  const ergMap = useMemo(() => {
    const m: Record<string, Ergebnis> = {};
    for (const e of ergebnisse) m[e.kampagne_id] = e;
    return m;
  }, [ergebnisse]);

  const a = useMemo(() => postenAnalyse(kampagnen, ergMap), [kampagnen, ergMap]);

  const ausschoepfung = a.budget.hochrechnungMonat > 0
    ? Math.min(100, Math.round((a.budget.ausgegeben / a.budget.hochrechnungMonat) * 100))
    : 0;

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Kopf */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 }}>
              💶 Kostenanalyse
            </h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>
              Was kostet mich die Werbung — Gesamtkosten, Kosten je Ergebnis und wo das Geld hingeht.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="/dashboard/marketing/ads" style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' }}>‹ Zurück zu Ads</a>
            <a href="/dashboard/marketing/ads/auswertung" style={{ background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '10px 18px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, textDecoration: 'none' }}>📊 Auswertung</a>
          </div>
        </div>

        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>{fehler}</div>
        ) : (
          <>
            {/* Gesamtkosten groß */}
            <div style={{ background: C.navy2, borderRadius: 16, padding: '24px 26px', border: `1px solid ${C.gold}`, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(14px, 1.2vw, 19px)' }}>Gesamtkosten (bisher ausgegeben)</div>
                <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: C.gold, fontWeight: 700, fontSize: 'clamp(40px, 4.5vw, 68px)', lineHeight: 1.1 }}>{formatEuro(a.gesamt.ausgaben)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.1vw, 17px)' }}>daraus Umsatz</div>
                <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: C.green, fontWeight: 700, fontSize: 'clamp(22px, 2.2vw, 34px)' }}>{formatEuro(a.gesamt.umsatz)}</div>
                <div style={{ fontFamily: 'DM Sans, sans-serif', color: AMPEL[roasAmpel(a.gesamt.roas)], fontSize: 'clamp(14px, 1.2vw, 19px)', fontWeight: 700, marginTop: 2 }}>
                  {a.gesamt.roas != null ? `ROAS ${a.gesamt.roas.toLocaleString('de-DE')}× — je 1 € kommen ${formatEuro(a.gesamt.roas)} zurück` : 'ROAS —'}
                </div>
              </div>
            </div>

            {/* Was kostet mich ... */}
            <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 }}>Was kostet mich …</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
              {[
                { label: '… ein Klick', wert: a.gesamt.cpc != null ? formatEuro(a.gesamt.cpc) : '—', sub: `${formatZahl(a.gesamt.klicks)} Klicks`, farbe: C.cyan },
                { label: '… eine Conversion', wert: a.gesamt.cpa != null ? formatEuro(a.gesamt.cpa) : '—', sub: `${formatZahl(a.gesamt.conversions)} Conversions`, farbe: C.warn },
                { label: '… 1.000 Kontakte (TKP)', wert: a.gesamt.tkp != null ? formatEuro(a.gesamt.tkp) : '—', sub: `${formatZahl(a.gesamt.impressionen)} Impressionen`, farbe: C.textDim },
                { label: 'Rücklauf je 1 € (ROAS)', wert: a.gesamt.roas != null ? `${a.gesamt.roas.toLocaleString('de-DE')}×` : '—', sub: `${formatEuro(a.gesamt.umsatz)} Umsatz`, farbe: AMPEL[roasAmpel(a.gesamt.roas)] },
              ].map((kp) => (
                <div key={kp.label} style={{ background: C.navy2, borderRadius: 14, padding: '18px 20px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(26px, 2.4vw, 38px)', fontWeight: 700, color: kp.farbe }}>{kp.wert}</div>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', color: '#fff', fontSize: 'clamp(13px, 1.15vw, 18px)' }}>{kp.label}</div>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(11px, 1vw, 14px)' }}>{kp.sub}</div>
                </div>
              ))}
            </div>

            {/* Budget-Ausschöpfung */}
            <div style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
                <div><div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 14 }}>Aktives Tagesbudget</div><div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: C.green, fontWeight: 700, fontSize: 'clamp(18px, 1.6vw, 25px)' }}>{formatEuro(a.budget.aktivTag)}<span style={{ color: C.textDim, fontSize: 13, fontWeight: 400 }}> /Tag</span></div></div>
                <div><div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 14 }}>Hochrechnung/Monat</div><div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: '#fff', fontWeight: 700, fontSize: 'clamp(18px, 1.6vw, 25px)' }}>{formatEuro(a.budget.hochrechnungMonat)}</div></div>
                <div><div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 14 }}>Bisher ausgegeben</div><div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: C.gold, fontWeight: 700, fontSize: 'clamp(18px, 1.6vw, 25px)' }}>{formatEuro(a.budget.ausgegeben)}</div></div>
              </div>
              <div style={{ height: 12, borderRadius: 6, background: C.navy, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ width: `${ausschoepfung}%`, height: '100%', background: C.gold }} />
              </div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 13, marginTop: 6 }}>{ausschoepfung}% des monatlichen Budgets bereits ausgegeben.</div>
            </div>

            {/* Posten-Aufschlüsselung */}
            <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(18px, 1.6vw, 26px)', marginBottom: 14 }}>Posten-Aufschlüsselung — wo geht das Geld hin?</div>
            {a.posten.length === 0 ? (
              <div style={{ background: C.navy2, borderRadius: 14, padding: '48px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
                <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(16px, 1.38vw, 22px)', margin: 0 }}>Noch keine Kampagnen. Kosten erscheinen, sobald Kennzahlen erfasst sind (Auswertung) oder die Werbekonten Insights liefern.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {a.posten.map((p) => (
                  <div key={p.id} style={{ background: C.navy2, borderRadius: 12, padding: '14px 18px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 200 }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(15px, 1.35vw, 21px)' }}>{p.name}</span>
                        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: C.textDim, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '1px 9px' }}>{STATUS_LABEL[p.status] || 'Entwurf'}</span>
                        {p.kanaele.map((id) => plattformFuer(id)).filter(Boolean).map((pl) => (<span key={pl!.id} title={pl!.name} style={{ fontSize: 14 }}>{pl!.icon}</span>))}
                      </div>
                      <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: C.gold, fontSize: 'clamp(16px, 1.5vw, 23px)' }}>{formatEuro(p.ausgaben)} <span style={{ color: C.textDim, fontSize: 13, fontWeight: 400 }}>({Math.round(p.anteil * 100)}%)</span></div>
                    </div>
                    {/* Anteils-Balken */}
                    <div style={{ height: 8, borderRadius: 4, background: C.navy, overflow: 'hidden', marginBottom: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ width: `${Math.round(p.anteil * 100)}%`, height: '100%', background: C.cyan }} />
                    </div>
                    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(12px, 1.05vw, 16px)' }}>
                      <span>Klick: <strong style={{ color: '#fff' }}>{p.cpc != null ? formatEuro(p.cpc) : '—'}</strong></span>
                      <span>Conversion: <strong style={{ color: '#fff' }}>{p.cpa != null ? formatEuro(p.cpa) : '—'}</strong></span>
                      <span>Umsatz: <strong style={{ color: '#fff' }}>{formatEuro(p.umsatz)}</strong></span>
                      <span>ROAS: <strong style={{ color: AMPEL[roasAmpel(p.roas)] }}>{p.roas != null ? `${p.roas.toLocaleString('de-DE')}×` : '—'}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '20px 0 0', fontSize: 'clamp(12px, 1.05vw, 16px)' }}>
              Kosten stammen aus den erfassten Kennzahlen (Auswertung). Sobald die Werbekonten Insights liefern, füllt ARGONAUT sie automatisch — dann ist die Aufschlüsselung tagesaktuell.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
