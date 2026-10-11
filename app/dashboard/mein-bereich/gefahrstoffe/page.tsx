'use client';

// ============================================================
// ARGONAUT OS · Paket 319 (G2a Teil 2) · Gefahrstoffe am Lagerplatz (Handy)
// Ziel des QR-Aushangs: /dashboard/mein-bereich/gefahrstoffe?platz=<Lagerplatz>
// Für ALLE Beschäftigten mit Login (unter „Mein Bereich", also ohne Modul-
// Recht): § 6 und § 14 GefStoffV — wer mit Gefahrstoffen arbeitet, muss
// Verzeichnis, Sicherheitsdatenblatt und Betriebsanweisung einsehen können.
// Nur lesen. Datenbank-Regel: gefahrstoff_ma_select (SQL ps2-qualitaet).
// SDB über /api/gefahrstoff/sdb (60-Sekunden-Link).
// Logik: lib/gefahrstoffLager.ts + lib/qualitaet.ts (getestet).
// Pfad: app/dashboard/mein-bereich/gefahrstoffe/page.tsx
// ============================================================

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { PIKTOGRAMME, leseHSaetze, istCmr } from '@/lib/qualitaet';
import { lagerklasseText, plaetzeMitAnzahl, stoffeAmPlatz, betriebsanweisungText, platzSchluessel, HANDY_PFAD } from '@/lib/gefahrstoffLager';
import Leerzustand from '../../_components/Leerzustand';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Stoff = {
  id: string; bezeichnung: string | null; hersteller: string | null; h_saetze: string | null; piktogramme: string[] | null;
  signalwort: string | null; lagerklasse: string | null; lagerplatz: string | null; betriebsanweisung_am: string | null;
  artikel_id: string | null; sdb_pfad: string | null; arbeitsbereiche: string | null;
};

const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 10 };
const knopf: CSSProperties = { display: 'inline-block', background: C.gold, color: C.navy, borderRadius: 10, padding: '10px 14px', fontWeight: 800, fontSize: 15, textDecoration: 'none' };
const chip: CSSProperties = { display: 'inline-block', border: `1px solid ${C.border}`, borderRadius: 999, padding: '3px 10px', fontSize: 13, marginRight: 6, marginBottom: 6 };

function platzAusAdresse(): string {
  try { return new URLSearchParams(window.location.search).get('platz') ?? ''; } catch { return ''; }
}

export default function GefahrstoffeAmPlatz() {
  const [stoffe, setStoffe] = useState<Stoff[] | null>(null);
  const [platz, setPlatz] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    setPlatz(platzAusAdresse());
    (async () => {
      const r = await supabase.from('gefahrstoff')
        .select('id, bezeichnung, hersteller, h_saetze, piktogramme, signalwort, lagerklasse, lagerplatz, betriebsanweisung_am, artikel_id, sdb_pfad, arbeitsbereiche')
        .order('bezeichnung', { ascending: true }).range(0, 999);
      if (r.error) { setFehler('Das Verzeichnis konnte nicht geladen werden.'); setStoffe([]); return; }
      setStoffe((r.data as Stoff[]) ?? []);
    })();
  }, []);

  const plaetze = useMemo(() => plaetzeMitAnzahl(stoffe ?? []), [stoffe]);
  const liste = useMemo(() => stoffeAmPlatz(stoffe ?? [], platz), [stoffe, platz]);
  const platzName = plaetze.find((p) => platzSchluessel(p.platz) === platzSchluessel(platz))?.platz ?? platz;

  function waehle(p: string) {
    setPlatz(p);
    try { window.history.replaceState(null, '', p ? `${HANDY_PFAD}?platz=${encodeURIComponent(p)}` : HANDY_PFAD); } catch { /* egal */ }
  }

  return (
    <div style={{ color: C.text, maxWidth: 720, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Arbeitsschutz</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(24px,2.2vw,32px)', fontWeight: 800 }}>☣️ Gefahrstoffe{platz ? ` · ${platzName}` : ''}</h1>
      <p style={{ margin: '0 0 12px', color: C.textDim, fontSize: 14.5 }}>
        Welche Gefahrstoffe hier stehen, wie gefährlich sie sind und wo das Sicherheitsdatenblatt ist. Im Zweifel: erst lesen, dann arbeiten.
      </p>

      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {stoffe === null && <div style={{ ...karte, color: C.textDim }}>Lädt …</div>}

      {stoffe !== null && stoffe.length === 0 && !fehler && (
        <Leerzustand icon="☣️" titel="Noch keine Gefahrstoffe erfasst"
          text="Hier sehen Sie die Gefahrstoffe Ihres Betriebs mit Sicherheitsdatenblatt — sobald die Geschäftsleitung das Gefahrstoffverzeichnis pflegt."
          schritte={['Geschäftsleitung: Nachweise → Gefahrstoffe → Stoffe mit Lagerplatz anlegen', '„🔳 QR-Aushang" drucken und am Lagerplatz aufhängen', 'QR mit dem Handy scannen — diese Seite öffnet sich']} />
      )}

      {stoffe !== null && stoffe.length > 0 && (
        <>
          {plaetze.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <button style={{ ...chip, background: !platz ? C.gold : 'transparent', color: !platz ? C.navy : C.text, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => waehle('')}>Alle ({stoffe.length})</button>
              {plaetze.map((p) => {
                const an = platzSchluessel(p.platz) === platzSchluessel(platz);
                return <button key={p.platz} style={{ ...chip, background: an ? C.gold : 'transparent', color: an ? C.navy : C.text, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => waehle(p.platz)}>📍 {p.platz} ({p.anzahl})</button>;
              })}
            </div>
          )}
          {liste.length === 0 && <div style={{ ...karte, color: C.textDim }}>An diesem Lagerplatz ist kein Stoff eingetragen. Bitte bei der Geschäftsleitung melden, falls hier Gefahrstoffe stehen.</div>}
          {liste.map((s) => {
            const h = leseHSaetze(s.h_saetze);
            const cmr = istCmr(h);
            const ba = betriebsanweisungText(s.betriebsanweisung_am);
            const sdb = !!(s.sdb_pfad || s.artikel_id);
            return (
              <div key={s.id} style={{ ...karte, borderLeft: `4px solid ${s.signalwort === 'Gefahr' || cmr ? C.danger : s.signalwort === 'Achtung' ? C.warn : C.border}` }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{s.bezeichnung}</div>
                {s.hersteller && <div style={{ color: C.textDim, fontSize: 13.5 }}>{s.hersteller}</div>}
                <div style={{ marginTop: 8 }}>
                  {s.signalwort && <span style={{ ...chip, borderColor: s.signalwort === 'Gefahr' ? C.danger : C.warn, color: s.signalwort === 'Gefahr' ? C.danger : C.warn, fontWeight: 800 }}>{s.signalwort.toUpperCase()}</span>}
                  {cmr && <span style={{ ...chip, borderColor: C.danger, color: C.danger, fontWeight: 800 }}>CMR — besondere Vorsicht</span>}
                  {(s.piktogramme ?? []).map((p) => <span key={p} style={chip}>{p} {PIKTOGRAMME.find((x) => x.key === p)?.label ?? ''}</span>)}
                </div>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  {h.length > 0 && <div>Gefahrenhinweise: {h.join(', ')}</div>}
                  {s.lagerklasse && <div style={{ color: C.textDim }}>{lagerklasseText(s.lagerklasse)}</div>}
                  {!platz && s.lagerplatz && <div style={{ color: C.textDim }}>📍 {s.lagerplatz}</div>}
                  {s.arbeitsbereiche && <div style={{ color: C.textDim }}>Verwendet in: {s.arbeitsbereiche}</div>}
                  <div style={{ color: ba.ok ? C.textDim : C.danger, marginTop: 4 }}>{ba.ok ? '📋' : '✕'} {ba.text}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                  {sdb
                    ? <a style={knopf} href={`/api/gefahrstoff/sdb?id=${s.id}`} target="_blank" rel="noopener noreferrer">📄 Sicherheitsdatenblatt öffnen</a>
                    : <span style={{ color: C.warn, fontSize: 14 }}>⚠ Kein Sicherheitsdatenblatt als Datei hinterlegt — bitte bei der Geschäftsleitung nachfragen.</span>}
                </div>
              </div>
            );
          })}
        </>
      )}
      <p style={{ color: C.textDim, fontSize: 12.5 }}>
        Im Notfall: Abschnitt 4 (Erste Hilfe) und 5 (Brandbekämpfung) des Sicherheitsdatenblatts. Notruf 112.
      </p>
    </div>
  );
}
