'use client';

import { useEffect, useState, useMemo } from 'react';
import { plattformFuer, zielFuer } from '@/lib/ads';
import {
  roas, cpc, cpm, ctr, cpa, aggregiere, monatsHochrechnung, summeTagesbudget,
  formatEuro, formatZahl, formatProzent, roasAmpel, zuZahl,
} from '@/lib/adsAnalytics';

// ============================================================
// ARGONAUT OS · MARKETING · Ads-Auswertung (Paket 4 · Analytics-Cockpit)
// ROAS & Performance auf einen Blick + Ist-Kennzahlen je Kampagne erfassen.
// Werte werden aktuell selbst eingetragen; API-Insights füllen sie später.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};

const AMPEL_FARBE: Record<string, string> = { gut: C.green, mittel: C.warn, schwach: C.danger, neutral: C.textDim };

type Kampagne = {
  id: string; name: string; ziel: string | null; kanaele: string[] | null;
  tagesbudget: number | null; status: string;
};
type Ergebnis = {
  kampagne_id: string; ausgaben: number | null; impressionen: number | null;
  klicks: number | null; conversions: number | null; umsatz: number | null; aktualisiert_am: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf', bereit: 'Bereit', aktiv: 'Aktiv', pausiert: 'Pausiert', beendet: 'Beendet',
};

export default function AdsAuswertung() {
  const [kampagnen, setKampagnen] = useState<Kampagne[]>([]);
  const [ergebnisse, setErgebnisse] = useState<Ergebnis[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // Bearbeiten je Kampagne
  const [editId, setEditId] = useState<string | null>(null);
  const [fAusgaben, setFAusgaben] = useState('');
  const [fImpressionen, setFImpressionen] = useState('');
  const [fKlicks, setFKlicks] = useState('');
  const [fConversions, setFConversions] = useState('');
  const [fUmsatz, setFUmsatz] = useState('');
  const [busy, setBusy] = useState(false);

  // Insights-Autofüllen
  const [insBusy, setInsBusy] = useState(false);
  const [insMeldung, setInsMeldung] = useState<string | null>(null);

  async function laden() {
    setLoading(true); setFehler(null);
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
  }
  useEffect(() => { laden(); }, []);

  const ergMap = useMemo(() => {
    const m: Record<string, Ergebnis> = {};
    for (const e of ergebnisse) m[e.kampagne_id] = e;
    return m;
  }, [ergebnisse]);

  const agg = useMemo(() => aggregiere(ergebnisse), [ergebnisse]);
  const gesamtRoas = roas(agg.umsatz, agg.ausgaben);
  const gesamtCpc = cpc(agg.ausgaben, agg.klicks);

  const budgetAktivTag = useMemo(() => summeTagesbudget(kampagnen, ['aktiv']), [kampagnen]);
  const budgetGeplantTag = useMemo(() => summeTagesbudget(kampagnen, ['aktiv', 'pausiert', 'bereit']), [kampagnen]);

  function bearbeiten(k: Kampagne) {
    const e = ergMap[k.id];
    setEditId(k.id);
    setFAusgaben(e?.ausgaben != null ? String(e.ausgaben).replace('.', ',') : '');
    setFImpressionen(e?.impressionen != null ? String(e.impressionen) : '');
    setFKlicks(e?.klicks != null ? String(e.klicks) : '');
    setFConversions(e?.conversions != null ? String(e.conversions) : '');
    setFUmsatz(e?.umsatz != null ? String(e.umsatz).replace('.', ',') : '');
  }

  async function speichern(k: Kampagne) {
    setBusy(true);
    try {
      const res = await fetch('/api/marketing/ads-ergebnisse', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kampagne_id: k.id, ausgaben: fAusgaben, impressionen: fImpressionen,
          klicks: fKlicks, conversions: fConversions, umsatz: fUmsatz,
        }),
      });
      const j = await res.json();
      if (res.ok && j?.ok) { setEditId(null); laden(); }
      else alert(j?.error || 'Speichern fehlgeschlagen.');
    } catch { alert('Speichern fehlgeschlagen.'); }
    finally { setBusy(false); }
  }

  async function insightsAktualisieren() {
    setInsBusy(true); setInsMeldung(null);
    try {
      const res = await fetch('/api/marketing/ads-insights', { method: 'POST' });
      const j = await res.json();
      if (!res.ok || !j?.ok) setInsMeldung(j?.error || 'Aktualisieren fehlgeschlagen.');
      else if (j.geschaltet === 0) setInsMeldung('Noch keine geschaltete Kampagne — erst schalten, dann liefern die Werbekonten Zahlen.');
      else setInsMeldung(`✓ ${j.aktualisiert} Kampagne${j.aktualisiert === 1 ? '' : 'n'} aus den Werbekonten aktualisiert.`);
      laden();
    } catch { setInsMeldung('Aktualisieren fehlgeschlagen.'); }
    finally { setInsBusy(false); }
  }

  const kpi = [
    { label: 'Ausgaben', wert: formatEuro(agg.ausgaben), farbe: C.cyan },
    { label: 'Umsatz', wert: formatEuro(agg.umsatz), farbe: C.green },
    { label: 'ROAS', wert: gesamtRoas != null ? `${gesamtRoas.toLocaleString('de-DE')}×` : '—', farbe: AMPEL_FARBE[roasAmpel(gesamtRoas)] },
    { label: 'Klicks', wert: formatZahl(agg.klicks), farbe: C.gold },
    { label: 'Conversions', wert: formatZahl(agg.conversions), farbe: C.warn },
    { label: 'Ø Klickpreis', wert: gesamtCpc != null ? formatEuro(gesamtCpc) : '—', farbe: C.textDim },
  ];

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Kopf */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 }}>
              📊 Ads-Auswertung
            </h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>
              Ausgaben, Ergebnisse und ROAS Ihrer Kampagnen auf einen Blick.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={insightsAktualisieren} disabled={insBusy}
              style={{ background: C.green, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 18px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, cursor: insBusy ? 'wait' : 'pointer', opacity: insBusy ? 0.6 : 1 }}>
              {insBusy ? 'Hole Zahlen…' : '🔄 Insights aktualisieren'}
            </button>
            <a href="/dashboard/marketing/ads/kosten" style={{ background: 'rgba(201,168,76,0.12)', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 10, padding: '10px 18px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, textDecoration: 'none' }}>💶 Kosten</a>
            <a href="/dashboard/marketing/ads" style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' }}>‹ Zurück zu Ads</a>
          </div>
        </div>
        {insMeldung && (
          <div style={{ marginBottom: 16, background: insMeldung.startsWith('✓') ? 'rgba(76,175,125,0.12)' : 'rgba(224,162,76,0.12)', border: `1px solid ${insMeldung.startsWith('✓') ? C.green : C.warn}`, borderRadius: 12, padding: '12px 16px', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>{insMeldung}</div>
        )}

        {/* Hinweis */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '16px 22px', border: `1px solid ${C.gold}`, marginBottom: 20 }}>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: 0, fontSize: 'clamp(13px, 1.15vw, 18px)', lineHeight: 1.6 }}>
            Die geplanten Budgets kommen direkt aus Ihren Kampagnen. Die <strong style={{ color: '#fff' }}>Ist-Kennzahlen</strong> (Ausgaben, Klicks, Conversions, Umsatz) tragen Sie aktuell selbst ein — sobald die Werbekonten angebunden sind, füllt ARGONAUT diese Werte automatisch aus den Insights der Plattformen.
          </p>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
          {kpi.map((kp) => (
            <div key={kp.label} style={{ background: C.navy2, borderRadius: 14, padding: '18px 20px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(24px, 2.2vw, 34px)', fontWeight: 700, color: kp.farbe }}>{kp.wert}</div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.15vw, 18px)' }}>{kp.label}</div>
            </div>
          ))}
        </div>

        {/* Budget-Übersicht */}
        <div style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24, display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.1vw, 16px)' }}>Aktives Tagesbudget</div>
            <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: C.green, fontWeight: 700, fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{formatEuro(budgetAktivTag)}<span style={{ color: C.textDim, fontSize: 14, fontWeight: 400 }}> /Tag</span></div>
          </div>
          <div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.1vw, 16px)' }}>Hochrechnung/Monat (aktiv)</div>
            <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: '#fff', fontWeight: 700, fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{formatEuro(monatsHochrechnung(budgetAktivTag))}</div>
          </div>
          <div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.1vw, 16px)' }}>Geplant gesamt (inkl. bereit/pausiert)</div>
            <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', color: C.textDim, fontWeight: 700, fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{formatEuro(budgetGeplantTag)}<span style={{ fontSize: 14, fontWeight: 400 }}> /Tag</span></div>
          </div>
        </div>

        {/* Kampagnen */}
        <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(18px, 1.6vw, 26px)', marginBottom: 14 }}>Kampagnen im Detail</div>
        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>{fehler}</div>
        ) : kampagnen.length === 0 ? (
          <div style={{ background: C.navy2, borderRadius: 14, padding: '48px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.12)' }}>
            <div style={{ fontSize: 'clamp(38px, 4vw, 56px)', marginBottom: 12 }}>📊</div>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(16px, 1.38vw, 22px)', margin: 0 }}>Noch keine Kampagne. Legen Sie unter „Ads“ Ihre erste an.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {kampagnen.map((k) => {
              const e = ergMap[k.id];
              const r = roas(e?.umsatz, e?.ausgaben);
              const istEdit = editId === k.id;
              return (
                <div key={k.id} style={{ background: C.navy2, borderRadius: 14, padding: '16px 20px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: istEdit || e ? 12 : 0 }}>
                    <div style={{ minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(16px, 1.4vw, 22px)' }}>{k.name}</span>
                        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1vw, 15px)', color: C.textDim, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '1px 10px' }}>{STATUS_LABEL[k.status] || 'Entwurf'}</span>
                        {(k.kanaele || []).map((id) => plattformFuer(id)).filter(Boolean).map((p) => (<span key={p!.id} title={p!.name} style={{ fontSize: 15 }}>{p!.icon}</span>))}
                      </div>
                      <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(12px, 1.05vw, 16px)', marginTop: 4 }}>
                        {zielFuer(k.ziel)?.label || '—'}{k.tagesbudget ? ` · ${formatEuro(k.tagesbudget)}/Tag geplant` : ''}
                      </div>
                    </div>
                    <button onClick={() => (istEdit ? setEditId(null) : bearbeiten(k))} style={{ background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 8, padding: '7px 13px', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.1vw, 17px)', cursor: 'pointer' }}>
                      {istEdit ? 'Abbrechen' : e ? 'Kennzahlen bearbeiten' : 'Kennzahlen erfassen'}
                    </button>
                  </div>

                  {/* Ergebnis-Anzeige */}
                  {!istEdit && e && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                      {[
                        { l: 'Ausgaben', w: formatEuro(e.ausgaben), f: C.cyan },
                        { l: 'Umsatz', w: formatEuro(e.umsatz), f: C.green },
                        { l: 'ROAS', w: r != null ? `${r.toLocaleString('de-DE')}×` : '—', f: AMPEL_FARBE[roasAmpel(r)] },
                        { l: 'Klicks', w: formatZahl(e.klicks), f: '#fff' },
                        { l: 'CTR', w: formatProzent(ctr(e.klicks, e.impressionen)), f: '#fff' },
                        { l: 'Ø Klickpreis', w: cpc(e.ausgaben, e.klicks) != null ? formatEuro(cpc(e.ausgaben, e.klicks)) : '—', f: '#fff' },
                        { l: 'TKP (CPM)', w: cpm(e.ausgaben, e.impressionen) != null ? formatEuro(cpm(e.ausgaben, e.impressionen)) : '—', f: '#fff' },
                        { l: 'Kosten/Conv.', w: cpa(e.ausgaben, e.conversions) != null ? formatEuro(cpa(e.ausgaben, e.conversions)) : '—', f: '#fff' },
                      ].map((m) => (
                        <div key={m.l} style={{ background: C.navy, borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: m.f, fontSize: 'clamp(15px, 1.3vw, 20px)' }}>{m.w}</div>
                          <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 12 }}>{m.l}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Erfassungs-Formular */}
                  {istEdit && (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
                        {[
                          { l: 'Ausgaben (€)', v: fAusgaben, s: setFAusgaben, ph: 'z. B. 250' },
                          { l: 'Impressionen', v: fImpressionen, s: setFImpressionen, ph: 'z. B. 12000' },
                          { l: 'Klicks', v: fKlicks, s: setFKlicks, ph: 'z. B. 320' },
                          { l: 'Conversions/Leads', v: fConversions, s: setFConversions, ph: 'z. B. 18' },
                          { l: 'Umsatz (€)', v: fUmsatz, s: setFUmsatz, ph: 'z. B. 1400' },
                        ].map((feld) => (
                          <div key={feld.l}>
                            <label style={{ display: 'block', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.05vw, 16px)', color: C.textDim, marginBottom: 6 }}>{feld.l}</label>
                            <input value={feld.v} onChange={(ev) => feld.s(ev.target.value)} placeholder={feld.ph} inputMode="decimal"
                              style={{ width: '100%', background: C.navy, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '9px 11px', color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(14px, 1.2vw, 19px)', boxSizing: 'border-box' }} />
                          </div>
                        ))}
                      </div>
                      <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(12px, 1.05vw, 16px)', marginBottom: 12 }}>
                        Vorschau ROAS: <strong style={{ color: AMPEL_FARBE[roasAmpel(roas(fUmsatz, fAusgaben))] }}>{roas(fUmsatz, fAusgaben) != null ? `${roas(fUmsatz, fAusgaben)!.toLocaleString('de-DE')}×` : '—'}</strong>
                        {zuZahl(fAusgaben) > 0 && zuZahl(fKlicks) > 0 ? ` · Klickpreis ${formatEuro(cpc(fAusgaben, fKlicks))}` : ''}
                      </div>
                      <button onClick={() => speichern(k)} disabled={busy}
                        style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 22px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                        {busy ? 'Speichere…' : 'Kennzahlen speichern'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
