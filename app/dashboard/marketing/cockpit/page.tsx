'use client';

import { useEffect, useState } from 'react';
import { formatEuro, formatZahl, roasAmpel } from '@/lib/adsAnalytics';
import type { CockpitDaten, CockpitVerlauf } from '@/lib/marketingCockpit';

// ============================================================
// ARGONAUT OS · MARKETING · Kanalübergreifendes Cockpit
// Newsletter, Social, WhatsApp, Ads und Leads auf einen Blick —
// jetzt mit 8-Wochen-Verlauf (Sparkline + Trend) je Kanal.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};
const AMPEL: Record<string, string> = { gut: C.green, mittel: C.warn, schwach: C.danger, neutral: C.textDim };

type Verlaufe = Record<string, CockpitVerlauf>;

function Zahl({ wert, label, farbe }: { wert: string | number; label: string; farbe: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: farbe, fontSize: 'clamp(20px, 1.8vw, 28px)' }}>{wert}</div>
      <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(12px, 1.05vw, 16px)' }}>{label}</div>
    </div>
  );
}

/** Mini-Liniendiagramm (SVG) aus den Wochen-Werten. Alles 0 -> flache Linie. */
function Sparkline({ verlauf, farbe }: { verlauf: CockpitVerlauf; farbe: string }) {
  const w = 150, h = 34, pad = 3;
  const werte = verlauf.punkte.map((p) => p.anzahl);
  const max = Math.max(1, ...werte);
  const n = werte.length;
  const dx = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const punkte = werte.map((v, i) => {
    const x = pad + i * dx;
    const y = h - pad - (v / max) * (h - pad * 2);
    return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
  });
  const linie = punkte.join(' ');
  const flaeche = `${pad},${h - pad} ${linie} ${pad + (n - 1) * dx},${h - pad}`;
  const letzter = punkte[punkte.length - 1]?.split(',') ?? null;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', maxWidth: '100%' }}>
      <polygon points={flaeche} fill={farbe} opacity={0.12} />
      <polyline points={linie} fill="none" stroke={farbe} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {letzter && <circle cx={letzter[0]} cy={letzter[1]} r={3} fill={farbe} />}
    </svg>
  );
}

/** Trend-Pfeil: ▲ grün / ▼ rot / • neu-oder-flach. */
function Trend({ verlauf }: { verlauf: CockpitVerlauf }) {
  const t = verlauf.trendProzent;
  if (t === null) return <span style={{ color: C.cyan, fontSize: 'clamp(12px, 1.05vw, 16px)', fontFamily: 'DM Sans, sans-serif' }}>• neu</span>;
  if (t > 0) return <span style={{ color: C.green, fontSize: 'clamp(12px, 1.05vw, 16px)', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>▲ +{t}%</span>;
  if (t < 0) return <span style={{ color: C.danger, fontSize: 'clamp(12px, 1.05vw, 16px)', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>▼ {t}%</span>;
  return <span style={{ color: C.textDim, fontSize: 'clamp(12px, 1.05vw, 16px)', fontFamily: 'DM Sans, sans-serif' }}>– stabil</span>;
}

function Kanal({ icon, titel, href, farbe, verlauf, children }: { icon: string; titel: string; href: string; farbe: string; verlauf?: CockpitVerlauf; children: React.ReactNode }) {
  return (
    <div style={{ background: C.navy2, borderRadius: 14, padding: '20px 22px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(17px, 1.5vw, 23px)' }}>{icon} {titel}</span>
        <a href={href} style={{ fontFamily: 'DM Sans, sans-serif', color: farbe, border: `1px solid ${farbe}`, borderRadius: 8, padding: '5px 12px', fontSize: 'clamp(12px, 1.05vw, 16px)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Öffnen ›</a>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 14 }}>{children}</div>
      {verlauf && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(11px, 0.95vw, 15px)' }}>Verlauf · 8 Wochen ({formatZahl(verlauf.summe)})</span>
            <Trend verlauf={verlauf} />
          </div>
          <Sparkline verlauf={verlauf} farbe={farbe} />
        </div>
      )}
    </div>
  );
}

export default function MarketingCockpit() {
  const [d, setD] = useState<CockpitDaten | null>(null);
  const [v, setV] = useState<Verlaufe | null>(null);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/marketing/cockpit');
        const j = await res.json();
        if (!res.ok || !j?.ok) setFehler(j?.error || 'Laden fehlgeschlagen.');
        else { setD(j.daten as CockpitDaten); setV((j.verlauf ?? null) as Verlaufe | null); }
      } catch { setFehler('Verbindung fehlgeschlagen.'); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Kopf */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, color: C.gold, margin: 0 }}>
              🛰️ Marketing-Cockpit
            </h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0' }}>
              Alle Marketing-Kanäle auf einen Blick — mit 8-Wochen-Verlauf je Kanal.
            </p>
          </div>
          <a href="/dashboard/marketing" style={{ background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none' }}>‹ Zurück zum Marketing</a>
        </div>

        {loading ? (
          <p style={{ color: C.textDim, fontFamily: 'DM Sans, sans-serif' }}>Lade Kennzahlen…</p>
        ) : fehler ? (
          <div style={{ background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 12, padding: 18, color: C.danger, fontFamily: 'DM Sans, sans-serif' }}>{fehler}</div>
        ) : d ? (
          <>
            {/* Gesamt-Überblick */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Leads gesamt', wert: formatZahl(d.leads.gesamt), farbe: C.gold },
                { label: 'Aktive Kanäle', wert: `${d.gesamt.aktive_kanaele} / 4`, farbe: C.cyan },
                { label: 'Ads-Ausgaben', wert: formatEuro(d.ads.ausgaben), farbe: C.cyan },
                { label: 'Ads-Umsatz', wert: formatEuro(d.ads.umsatz), farbe: C.green },
                { label: 'Ads-ROAS', wert: d.ads.roas != null ? `${d.ads.roas.toLocaleString('de-DE')}×` : '—', farbe: AMPEL[roasAmpel(d.ads.roas)] },
              ].map((kp) => (
                <div key={kp.label} style={{ background: C.navy2, borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(28px, 2.6vw, 40px)', fontWeight: 700, color: kp.farbe }}>{kp.wert}</div>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(13px, 1.15vw, 18px)' }}>{kp.label}</div>
                </div>
              ))}
            </div>

            {/* Kanäle */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Kanal icon="✉️" titel="Newsletter" href="/dashboard/marketing/newsletter" farbe={C.cyan} verlauf={v?.newsletter}>
                <Zahl wert={formatZahl(d.newsletter.abonnenten)} label="Abonnenten" farbe={C.cyan} />
                <Zahl wert={formatZahl(d.newsletter.kampagnen)} label="Versände" farbe="#fff" />
                <Zahl wert={formatZahl(d.newsletter.mails_gesendet)} label="Mails gesendet" farbe="#fff" />
              </Kanal>

              <Kanal icon="📣" titel="Social" href="/dashboard/marketing/social" farbe={C.green} verlauf={v?.social}>
                <Zahl wert={formatZahl(d.social.beitraege)} label="Beiträge" farbe={C.green} />
                <Zahl wert={formatZahl(d.social.geplant)} label="Geplant" farbe="#fff" />
                <Zahl wert={formatZahl(d.social.gesendet)} label="Gepostet" farbe="#fff" />
                <Zahl wert={formatZahl(d.social.kanaele_verbunden)} label="Kanäle verbunden" farbe="#fff" />
              </Kanal>

              <Kanal icon="💬" titel="WhatsApp" href="/dashboard/marketing/whatsapp" farbe={C.green} verlauf={v?.whatsapp}>
                <Zahl wert={formatZahl(d.whatsapp.kontakte)} label="Empfänger" farbe={C.green} />
                <Zahl wert={formatZahl(d.whatsapp.gesendet)} label="Nachrichten gesendet" farbe="#fff" />
              </Kanal>

              <Kanal icon="📢" titel="Ads" href="/dashboard/marketing/ads" farbe={C.gold} verlauf={v?.ads}>
                <Zahl wert={formatZahl(d.ads.kampagnen)} label="Kampagnen" farbe={C.gold} />
                <Zahl wert={formatZahl(d.ads.aktiv)} label="Aktiv" farbe="#fff" />
                <Zahl wert={formatEuro(d.ads.ausgaben)} label="Ausgaben" farbe="#fff" />
                <Zahl wert={d.ads.roas != null ? `${d.ads.roas.toLocaleString('de-DE')}×` : '—'} label="ROAS" farbe={AMPEL[roasAmpel(d.ads.roas)]} />
              </Kanal>

              <Kanal icon="🧲" titel="Leads" href="/dashboard/marketing" farbe={C.warn} verlauf={v?.leads}>
                <Zahl wert={formatZahl(d.leads.gesamt)} label="Leads gesamt" farbe={C.warn} />
                <Zahl wert={formatZahl(d.leads.neu)} label="Neu" farbe="#fff" />
                <Zahl wert={formatZahl(d.leads.ausKampagne)} label="Aus Kampagne" farbe="#fff" />
              </Kanal>
            </div>

            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '20px 0 0', fontSize: 'clamp(12px, 1.05vw, 16px)' }}>
              Die Zahlen und der Verlauf aktualisieren sich live aus Ihren Kanälen. Der Verlauf zählt Aktivität je Woche (neue Leads, Posts, Nachrichten, Versände, Ads-Ergebnisse) über die letzten 8 Wochen; der Pfeil vergleicht die aktuelle mit der Vorwoche.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
