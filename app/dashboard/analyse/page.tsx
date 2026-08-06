'use client';

// ============================================================
// ARGONAUT OS · Website-Analyse — Dashboard (Paket 2b: mandantenfähig)
// Kennzahlen + KI-Auge, jetzt über die SICHERE Route /api/analyse-daten.
// Jeder sieht nur seine eigenen Seiten (Umschalter); direkter DB-Zugriff aus
// dem Browser ist gesperrt. Pfad: app/dashboard/analyse/page.tsx
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
type SeitenEintrag = { seite: string; name: string };

const ZEITRAEUME: { tage: number; label: string }[] = [
  { tage: 1, label: 'Heute' }, { tage: 7, label: '7 Tage' }, { tage: 30, label: '30 Tage' }, { tage: 90, label: '90 Tage' },
];

function fmtDauer(sek: number | null | undefined): string {
  const s = Math.round(Number(sek) || 0);
  if (s <= 0) return '–';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`;
}
function fmtZahl(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('de-DE');
}

export default function AnalysePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [tage, setTage] = useState(7);
  const [seiten, setSeiten] = useState<SeitenEintrag[]>([]);
  const [seite, setSeite] = useState<string>('');

  const [ueber, setUeber] = useState<Uebersicht | null>(null);
  const [erw, setErw] = useState<Erweitert | null>(null);
  const [topSeiten, setTopSeiten] = useState<Zeile[]>([]);
  const [kanaele, setKanaele] = useState<Zeile[]>([]);
  const [kampagnen, setKampagnen] = useState<Zeile[]>([]);
  const [klicks, setKlicks] = useState<Zeile[]>([]);
  const [verweil, setVerweil] = useState<Zeile[]>([]);
  const [geraete, setGeraete] = useState<Zeile[]>([]);
  const [browserL, setBrowserL] = useState<Zeile[]>([]);
  const [laender, setLaender] = useState<Zeile[]>([]);
  const [herkunft, setHerkunft] = useState<Zeile[]>([]);
  const [zeitreihe, setZeitreihe] = useState<ZeitPunkt[]>([]);

  const [kiLaden, setKiLaden] = useState(false);
  const [kiBewertung, setKiBewertung] = useState<string | null>(null);
  const [kiEmpfehlungen, setKiEmpfehlungen] = useState<string[]>([]);
  const [kiFehler, setKiFehler] = useState<string | null>(null);

  const ladeDaten = useCallback(async (s: string, t: number) => {
    const res = await fetch('/api/analyse-daten', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'daten', seite: s, tage: t }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setUeber((d.ueber as Uebersicht) || { aufrufe: 0, besucher: 0, klicks: 0 });
    setErw((d.erw as Erweitert) || null);
    setTopSeiten(((d.topSeiten as Array<{ pfad: string; aufrufe: number; besucher: number }>) || []).map((r) => ({ label: r.pfad, wert: r.aufrufe, zusatz: `${fmtZahl(r.besucher)} Besucher` })));
    setKanaele(((d.kanaele as Array<{ kanal: string; aufrufe: number }>) || []).map((r) => ({ label: r.kanal, wert: r.aufrufe })));
    setKampagnen(((d.kampagnen as Array<{ quelle: string; medium: string; kampagne: string; aufrufe: number }>) || []).map((r) => ({ label: `${r.quelle} · ${r.medium}${r.kampagne && r.kampagne !== '—' ? ' · ' + r.kampagne : ''}`, wert: r.aufrufe })));
    setKlicks(((d.klicks as Array<{ ziel: string; anzahl: number }>) || []).map((r) => ({ label: r.ziel, wert: r.anzahl })));
    setVerweil(((d.verweil as Array<{ pfad: string; avg_sek: number }>) || []).map((r) => ({ label: r.pfad, wert: Math.round(r.avg_sek), zusatz: fmtDauer(r.avg_sek) })));
    setGeraete(((d.geraete as Array<{ geraet: string; anzahl: number }>) || []).map((r) => ({ label: r.geraet, wert: r.anzahl })));
    setBrowserL(((d.browser as Array<{ browser: string; anzahl: number }>) || []).map((r) => ({ label: r.browser, wert: r.anzahl })));
    setLaender(((d.laender as Array<{ land: string; anzahl: number }>) || []).map((r) => ({ label: r.land, wert: r.anzahl })));
    setHerkunft(((d.herkunft as Array<{ referrer: string; anzahl: number }>) || []).map((r) => ({ label: r.referrer, wert: r.anzahl })));
    setZeitreihe(((d.zeitreihe as ZeitPunkt[]) || []).map((r) => ({ tag: r.tag, aufrufe: r.aufrufe, besucher: r.besucher })));
  }, []);

  const frageKiAuge = useCallback(async (s: string, t: number) => {
    setKiLaden(true); setKiFehler(null);
    try {
      const res = await fetch('/api/analyse-ki', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tage: t, seite: s }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Fehler');
      setKiBewertung(d.bewertung || null);
      setKiEmpfehlungen(Array.isArray(d.empfehlungen) ? d.empfehlungen : []);
    } catch (e) {
      setKiFehler(e instanceof Error ? e.message : 'Das KI-Auge ist gerade nicht erreichbar.');
    } finally {
      setKiLaden(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setUid(id);
      if (id) {
        const res = await fetch('/api/analyse-daten', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'liste' }) });
        const d = await res.json().catch(() => ({}));
        const liste = (d.seiten as SeitenEintrag[]) || [];
        setSeiten(liste);
        setSeite(liste[0]?.seite || '');
      }
      setLaden(false);
    })();
  }, []);

  useEffect(() => {
    if (!uid || !seite) return;
    ladeDaten(seite, tage);
    setKiBewertung(null); setKiEmpfehlungen([]); setKiFehler(null);
  }, [uid, seite, tage, ladeDaten]);

  const hatDaten = (ueber?.aufrufe || 0) > 0;
  const seiteName = seiten.find((s) => s.seite === seite)?.name || seite;
  const wrap: CSSProperties = { background: C.navy, minHeight: '100vh', color: C.text, padding: 'clamp(16px,3vw,40px)', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' };

  if (laden) return <div style={wrap}>Lädt …</div>;
  if (!uid) return <div style={wrap}>Bitte einloggen, um die Website-Analyse zu sehen.</div>;
  if (!seite) return (
    <div style={wrap}>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800 }}>Website-Analyse</h1>
      <p style={{ color: C.textDim, maxWidth: 620, lineHeight: 1.6 }}>
        Für dein Konto ist noch keine Seite freigeschaltet. Sobald du eine Website veröffentlichst (oder als Betreiber die Betreiber-ID gesetzt ist), erscheint sie hier zur Auswahl.
      </p>
    </div>
  );

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 'clamp(24px,2.4vw,38px)', color: C.text }}>
            Website-Analyse <span style={{ color: C.gold }}>·</span> {seiteName}
          </h1>
          <p style={{ margin: '6px 0 0', color: C.textDim, fontSize: 14 }}>
            Cookiefrei &amp; anonym — wer kommt, wie lange bleibt er, woher kam er, wohin klickt er.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {seiten.length > 1 && (
            <select value={seite} onChange={(e) => setSeite(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 10, background: C.navy2, color: C.text, border: `1px solid ${C.border}`, fontSize: 14 }}>
              {seiten.map((s) => <option key={s.seite} value={s.seite}>{s.name}</option>)}
            </select>
          )}
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
      </div>

      {/* ---- KI-Auge ---- */}
      <div style={{ position: 'relative', background: 'linear-gradient(180deg,#0d1a30,#0b1526)', border: `1px solid ${C.cyan}55`, borderRadius: 18, padding: '18px 20px', marginBottom: 22, boxShadow: `0 0 0 1px ${C.cyan}18, 0 10px 40px -20px ${C.cyan}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Auge />
            <div>
              <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, color: C.gold, letterSpacing: '.02em' }}>ARGONAUT · KI-Auge</div>
              <div style={{ fontSize: 12.5, color: C.textDim }}>Was heißt das gerade für mich?</div>
            </div>
          </div>
          <button onClick={() => frageKiAuge(seite, tage)} disabled={kiLaden}
            style={{ padding: '10px 18px', borderRadius: 12, cursor: kiLaden ? 'default' : 'pointer', fontWeight: 700, fontSize: 14,
              background: kiLaden ? 'transparent' : C.cyan, color: kiLaden ? C.cyan : C.navy, border: `1px solid ${C.cyan}` }}>
            {kiLaden ? 'Das KI-Auge schaut hin …' : (kiBewertung ? 'Neu bewerten' : 'Jetzt bewerten')}
          </button>
        </div>

        {kiFehler && <div style={{ marginTop: 14, color: C.danger, fontSize: 13.5 }}>{kiFehler}</div>}

        {kiBewertung && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <p style={{ margin: 0, color: C.text, fontSize: 15.5, lineHeight: 1.55 }}>{kiBewertung}</p>
            {kiEmpfehlungen.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {kiEmpfehlungen.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ color: C.cyan, fontWeight: 800, lineHeight: 1.5 }}>▸</span>
                    <span style={{ color: C.text, fontSize: 14.5, lineHeight: 1.5 }}>{e}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {!kiBewertung && !kiFehler && !kiLaden && (
          <div style={{ marginTop: 12, color: C.textDim, fontSize: 13.5 }}>
            Ein Klick — und die KI liest deine Zahlen und sagt dir in Klartext, was gut läuft und was du als Nächstes tun solltest.
          </div>
        )}
      </div>

      {!hatDaten && (
        <div style={{ padding: '18px 20px', borderRadius: 14, border: `1px solid ${C.border}`, background: C.navy2, color: C.textDim, marginBottom: 22 }}>
          Noch keine Daten in diesem Zeitraum für <strong style={{ color: C.text }}>{seiteName}</strong>. Sobald Besucher kommen, erscheinen hier die Zahlen.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 22 }}>
        <Kachel label="Besucher" wert={fmtZahl(ueber?.besucher)} akzent={C.cyan} />
        <Kachel label="Seitenaufrufe" wert={fmtZahl(ueber?.aufrufe)} akzent={C.text} />
        <Kachel label="Ø Verweildauer" wert={fmtDauer(erw?.avg_verweil_sek)} akzent={C.gold} />
        <Kachel label="Absprungrate" wert={erw ? `${erw.absprungrate ?? 0} %` : '–'} akzent={C.warn} />
        <Kachel label="Seiten / Besuch" wert={erw ? String(erw.seiten_pro_sitzung ?? 0) : '–'} akzent={C.green} />
        <Kachel label="Klicks erfasst" wert={fmtZahl(ueber?.klicks)} akzent={C.text} />
      </div>

      <Karte titel="Zeitverlauf (Aufrufe pro Tag)"><Verlauf punkte={zeitreihe} /></Karte>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 18, marginTop: 18 }}>
        <Liste titel="Kanäle — woher kam der Besucher" zeilen={kanaele} akzent={C.cyan} hinweis="direkt · organische Suche · bezahlt (Anzeige) · Social · Verweis-Link · E-Mail" />
        <Liste titel="Top-Seiten" zeilen={topSeiten} akzent={C.gold} />
        <Liste titel="Wohin geklickt wird" zeilen={klicks} akzent={C.green} />
        <Liste titel="Verweildauer je Seite" zeilen={verweil} akzent={C.gold} wertFormat={(z) => z.zusatz || fmtDauer(z.wert)} />
        {kampagnen.length > 0 && <Liste titel="Kampagnen & Anzeigen (UTM)" zeilen={kampagnen} akzent={C.warn} />}
        <Liste titel="Herkunft (verweisende Seiten)" zeilen={herkunft} akzent={C.cyan} />
        <Liste titel="Geräte" zeilen={geraete} akzent={C.text} />
        <Liste titel="Browser" zeilen={browserL} akzent={C.text} />
        <Liste titel="Länder" zeilen={laender} akzent={C.text} />
      </div>

      <p style={{ marginTop: 26, color: C.textDim, fontSize: 12.5, lineHeight: 1.6 }}>
        Anonyme Messung ohne Cookies — es wird keine IP gespeichert. „Besucher" zählt eindeutige Besucher je Tag.
        Zugriff serverseitig geprüft: jeder sieht nur seine eigenen Seiten.
      </p>
    </div>
  );
}

function Auge() {
  return (
    <div style={{ width: 44, height: 44, borderRadius: 12, background: '#0b1526', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 22px -4px ${C.cyan}` }}>
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <ellipse cx="16" cy="16" rx="14" ry="9" fill="none" stroke={C.cyan} strokeWidth="2.4" />
        <circle cx="16" cy="16" r="5.4" fill={C.cyan} />
        <circle cx="16" cy="16" r="2.6" fill="#07121f" />
        <circle cx="13.6" cy="13.6" r="1.2" fill="#EAF6FF" />
      </svg>
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
          style={{ flex: 1, minWidth: 4, background: C.cyan, opacity: 0.85, borderRadius: '4px 4px 0 0', height: `${Math.max(4, (p.aufrufe / max) * 116)}px` }} />
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
