'use client';

// ============================================================
// ARGONAUT OS · Website-Analyse — Dashboard (Schritt 4b)
// Zeigt die cookiefreien Kennzahlen aus web_ereignisse: Besucher,
// Aufrufe, Verweildauer, Absprungrate, Kanäle/Anzeigen, Top-Seiten,
// Wohin-geklickt, Geräte, Browser, Länder, Herkunft, Zeitverlauf.
// Liest ausschließlich über die security-definer-Funktionen (Schritt 1 + 4a).
// Pfad: app/dashboard/analyse/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Uebersicht = { aufrufe: number; besucher: number; klicks: number };
type Erweitert = { sitzungen: number; absprungrate: number; seiten_pro_sitzung: number; avg_verweil_sek: number };
type Zeile = { label: string; wert: number; zusatz?: string };
type ZeitPunkt = { tag: string; aufrufe: number; besucher: number };

const SEITE = 'argonaut-os'; // Phase 1: die eigene Seite. Später: Auswahl je Kundenseite.

const ZEITRAEUME: { tage: number; label: string }[] = [
  { tage: 1, label: 'Heute' },
  { tage: 7, label: '7 Tage' },
  { tage: 30, label: '30 Tage' },
  { tage: 90, label: '90 Tage' },
];

function fmtDauer(sek: number | null | undefined): string {
  const s = Math.round(Number(sek) || 0);
  if (s <= 0) return '–';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, '0')}s`;
}
function fmtZahl(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('de-DE');
}

export default function AnalysePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [aktualisiert, setAktualisiert] = useState(false);
  const [tage, setTage] = useState(7);

  const [ueber, setUeber] = useState<Uebersicht | null>(null);
  const [erw, setErw] = useState<Erweitert | null>(null);
  const [topSeiten, setTopSeiten] = useState<Zeile[]>([]);
  const [kanaele, setKanaele] = useState<Zeile[]>([]);
  const [kampagnen, setKampagnen] = useState<Zeile[]>([]);
  const [klicks, setKlicks] = useState<Zeile[]>([]);
  const [verweil, setVerweil] = useState<Zeile[]>([]);
  const [geraete, setGeraete] = useState<Zeile[]>([]);
  const [browser, setBrowser] = useState<Zeile[]>([]);
  const [laender, setLaender] = useState<Zeile[]>([]);
  const [herkunft, setHerkunft] = useState<Zeile[]>([]);
  const [zeitreihe, setZeitreihe] = useState<ZeitPunkt[]>([]);

  const ladeAlles = useCallback(async (t: number) => {
    setAktualisiert(true);
    const seit = new Date(Date.now() - t * 86400000).toISOString();
    const p = { seit, p_seite: SEITE };
    const rpc = (fn: string) => supabase.rpc(fn, p);
    const [ov, ex, ts, kn, kp, kl, vs, gg, br, ld, rf, zr] = await Promise.all([
      rpc('web_stats_uebersicht'), rpc('web_stats_erweitert'), rpc('web_top_seiten'),
      rpc('web_nach_kanal'), rpc('web_nach_kampagne'), rpc('web_top_klicks'),
      rpc('web_verweil_je_seite'), rpc('web_nach_geraet'), rpc('web_nach_browser'),
      rpc('web_nach_land'), rpc('web_nach_referrer'), rpc('web_zeitreihe'),
    ]);
    setUeber(((ov.data as Uebersicht[]) || [])[0] || { aufrufe: 0, besucher: 0, klicks: 0 });
    setErw(((ex.data as Erweitert[]) || [])[0] || null);
    setTopSeiten(((ts.data as Array<{ pfad: string; aufrufe: number; besucher: number }>) || []).map((r) => ({ label: r.pfad, wert: r.aufrufe, zusatz: `${fmtZahl(r.besucher)} Besucher` })));
    setKanaele(((kn.data as Array<{ kanal: string; aufrufe: number }>) || []).map((r) => ({ label: r.kanal, wert: r.aufrufe })));
    setKampagnen(((kp.data as Array<{ quelle: string; medium: string; kampagne: string; aufrufe: number }>) || []).map((r) => ({ label: `${r.quelle} · ${r.medium}${r.kampagne && r.kampagne !== '—' ? ' · ' + r.kampagne : ''}`, wert: r.aufrufe })));
    setKlicks(((kl.data as Array<{ ziel: string; anzahl: number }>) || []).map((r) => ({ label: r.ziel, wert: r.anzahl })));
    setVerweil(((vs.data as Array<{ pfad: string; avg_sek: number; messungen: number }>) || []).map((r) => ({ label: r.pfad, wert: Math.round(r.avg_sek), zusatz: fmtDauer(r.avg_sek) })));
    setGeraete(((gg.data as Array<{ geraet: string; anzahl: number }>) || []).map((r) => ({ label: r.geraet, wert: r.anzahl })));
    setBrowser(((br.data as Array<{ browser: string; anzahl: number }>) || []).map((r) => ({ label: r.browser, wert: r.anzahl })));
    setLaender(((ld.data as Array<{ land: string; anzahl: number }>) || []).map((r) => ({ label: r.land, wert: r.anzahl })));
    setHerkunft(((rf.data as Array<{ referrer: string; anzahl: number }>) || []).map((r) => ({ label: r.referrer, wert: r.anzahl })));
    setZeitreihe(((zr.data as Array<{ tag: string; aufrufe: number; besucher: number }>) || []).map((r) => ({ tag: r.tag, aufrufe: r.aufrufe, besucher: r.besucher })));
    setAktualisiert(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUid(data?.user?.id ?? null);
      setLaden(false);
    })();
  }, []);

  useEffect(() => { if (uid) ladeAlles(tage); }, [uid, tage, ladeAlles]);

  const hatDaten = (ueber?.aufrufe || 0) > 0;

  const wrap: CSSProperties = { background: C.navy, minHeight: '100vh', color: C.text, padding: 'clamp(16px,3vw,40px)', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' };

  if (laden) return <div style={wrap}>Lädt …</div>;
  if (!uid) return <div style={wrap}>Bitte einloggen, um die Website-Analyse zu sehen.</div>;

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 'clamp(24px,2.4vw,38px)', color: C.text }}>
            Website-Analyse <span style={{ color: C.gold }}>·</span> argonaut-os.com
          </h1>
          <p style={{ margin: '6px 0 0', color: C.textDim, fontSize: 14 }}>
            Cookiefrei &amp; anonym — wer kommt, wie lange bleibt er, woher kam er, wohin klickt er.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {ZEITRAEUME.map((z) => (
            <button key={z.tage} onClick={() => setTage(z.tage)}
              style={{ padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                background: tage === z.tage ? C.gold : 'transparent', color: tage === z.tage ? C.navy : C.textDim,
                border: `1px solid ${tage === z.tage ? C.gold : C.border}` }}>
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {!hatDaten && (
        <div style={{ padding: '18px 20px', borderRadius: 14, border: `1px solid ${C.border}`, background: C.navy2, color: C.textDim, marginBottom: 24 }}>
          Noch keine Daten in diesem Zeitraum. Öffne einmal <strong style={{ color: C.text }}>argonaut-os.com</strong>, klick dich durch ein paar Seiten — nach wenigen Sekunden erscheinen hier die ersten Zahlen. {aktualisiert ? '(lädt …)' : ''}
        </div>
      )}

      {/* KPI-Kacheln */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 26 }}>
        <Kachel label="Besucher" wert={fmtZahl(ueber?.besucher)} akzent={C.cyan} />
        <Kachel label="Seitenaufrufe" wert={fmtZahl(ueber?.aufrufe)} akzent={C.text} />
        <Kachel label="Ø Verweildauer" wert={fmtDauer(erw?.avg_verweil_sek)} akzent={C.gold} />
        <Kachel label="Absprungrate" wert={erw ? `${erw.absprungrate ?? 0} %` : '–'} akzent={C.warn} />
        <Kachel label="Seiten / Besuch" wert={erw ? String(erw.seiten_pro_sitzung ?? 0) : '–'} akzent={C.green} />
        <Kachel label="Klicks erfasst" wert={fmtZahl(ueber?.klicks)} akzent={C.text} />
      </div>

      {/* Zeitverlauf */}
      <Karte titel="Zeitverlauf (Aufrufe pro Tag)">
        <Verlauf punkte={zeitreihe} />
      </Karte>

      {/* Tabellen-Raster */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 18, marginTop: 18 }}>
        <Liste titel="Kanäle — woher kam der Besucher" zeilen={kanaele} akzent={C.cyan} hinweis="direkt · organische Suche · bezahlt (Anzeige) · Social · Verweis-Link · E-Mail" />
        <Liste titel="Top-Seiten" zeilen={topSeiten} akzent={C.gold} />
        <Liste titel="Wohin geklickt wird" zeilen={klicks} akzent={C.green} />
        <Liste titel="Verweildauer je Seite" zeilen={verweil} akzent={C.gold} wertFormat={(z) => z.zusatz || fmtDauer(z.wert)} />
        {kampagnen.length > 0 && <Liste titel="Kampagnen & Anzeigen (UTM)" zeilen={kampagnen} akzent={C.warn} />}
        <Liste titel="Herkunft (verweisende Seiten)" zeilen={herkunft} akzent={C.cyan} />
        <Liste titel="Geräte" zeilen={geraete} akzent={C.text} />
        <Liste titel="Browser" zeilen={browser} akzent={C.text} />
        <Liste titel="Länder" zeilen={laender} akzent={C.text} />
      </div>

      <p style={{ marginTop: 28, color: C.textDim, fontSize: 12.5, lineHeight: 1.6 }}>
        Anonyme Messung ohne Cookies — es wird keine IP gespeichert. „Besucher" zählt eindeutige Besucher je Tag.
        Sitzungen/Absprungrate werden aus dem Besuchsverlauf (30-Minuten-Fenster) berechnet.
      </p>
    </div>
  );
}

function Kachel({ label, wert, akzent }: { label: string; wert: string; akzent: string }) {
  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px' }}>
      <div style={{ width: 34, height: 3, borderRadius: 3, background: akzent, marginBottom: 12 }} />
      <div style={{ fontSize: 'clamp(22px,2vw,30px)', fontWeight: 800, color: akzent === C.text ? C.text : akzent, fontFamily: 'var(--font-syne), sans-serif' }}>{wert}</div>
      <div style={{ fontSize: 13, color: C.textDim, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Karte({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>{titel}</div>
      {children}
    </div>
  );
}

function Verlauf({ punkte }: { punkte: ZeitPunkt[] }) {
  if (!punkte.length) return <div style={{ color: C.textDim, fontSize: 13 }}>Noch keine Aufrufe.</div>;
  const max = Math.max(1, ...punkte.map((p) => p.aufrufe));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
      {punkte.map((p) => (
        <div key={p.tag} title={`${p.tag}: ${p.aufrufe} Aufrufe · ${p.besucher} Besucher`}
          style={{ flex: 1, minWidth: 4, background: C.cyan, opacity: 0.85, borderRadius: '4px 4px 0 0',
            height: `${Math.max(4, (p.aufrufe / max) * 116)}px` }} />
      ))}
    </div>
  );
}

function Liste({ titel, zeilen, akzent, hinweis, wertFormat }:
  { titel: string; zeilen: Zeile[]; akzent: string; hinweis?: string; wertFormat?: (z: Zeile) => string }) {
  const max = Math.max(1, ...zeilen.map((z) => z.wert));
  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{titel}</div>
      {hinweis && <div style={{ fontSize: 11.5, color: C.textDim, margin: '4px 0 10px' }}>{hinweis}</div>}
      {!zeilen.length && <div style={{ color: C.textDim, fontSize: 13, marginTop: 10 }}>Noch keine Daten.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: hinweis ? 0 : 10 }}>
        {zeilen.slice(0, 12).map((z, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: akzent, opacity: 0.13, borderRadius: 8, width: `${(z.wert / max) * 100}%` }} />
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 10px' }}>
              <span style={{ color: C.text, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.label}</span>
              <span style={{ color: C.textDim, fontSize: 13, whiteSpace: 'nowrap' }}>
                {wertFormat ? wertFormat(z) : fmtZahl(z.wert)}{z.zusatz && !wertFormat ? ` · ${z.zusatz}` : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
