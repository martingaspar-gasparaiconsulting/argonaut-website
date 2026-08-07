'use client';

import { useEffect, useState } from 'react';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · Autopilot (Vorschläge)
// Zeigt die priorisierten Handlungsvorschläge aus /api/marketing/autopilot.
// Es handelt NICHTS von selbst — jede Karte hat einen 1-Klick-Sprung zur Stelle.
// Look = Kunden-Dashboard (Navy/Gold/Cyan) — für Kunde UND Betreiber identisch.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)',
};

type Vorschlag = { prioritaet: 1 | 2 | 3; kategorie: string; titel: string; grund: string; aktionText: string; aktionHref: string };
type Daten = { ok: boolean; error?: string; vorschlaege: Vorschlag[]; dringend: number; gesamt: number };

const PRIO_FARBE: Record<number, string> = { 1: C.danger, 2: C.gold, 3: C.cyan };
const PRIO_LABEL: Record<number, string> = { 1: 'Dringend', 2: 'Wichtig', 3: 'Ausbau' };

export default function AutopilotPage() {
  const [daten, setDaten] = useState<Daten | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/marketing/autopilot');
        if (res.status === 401 || res.status === 403) { setFehler('Bitte einloggen.'); setLaden(false); return; }
        const j = (await res.json()) as Daten;
        if (!j.ok) { setFehler(j.error || 'Autopilot konnte nicht geladen werden.'); setLaden(false); return; }
        setDaten(j);
      } catch { setFehler('Autopilot konnte nicht geladen werden.'); } finally { setLaden(false); }
    })();
  }, []);

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', fontWeight: 800, margin: 0 }}>Marketing-Autopilot</h1>
      <p style={{ color: C.textDim, fontSize: 14.5, lineHeight: 1.5, margin: '8px 0 20px', maxWidth: 760 }}>
        Der Autopilot beobachtet dein Marketing und schlägt dir die nächsten Schritte vor — nach Dringlichkeit sortiert, jeder mit einem Klick zur richtigen Stelle. Er handelt nichts von selbst: <b style={{ color: C.text }}>du entscheidest</b>.
      </p>

      {fehler && <div style={{ color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}>{fehler}</div>}
      {laden ? <p style={{ color: C.textDim }}>Autopilot prüft die Lage …</p> : daten && (
        <>
          {/* Zusammenfassung */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 20px', marginBottom: 18 }}>
            <span style={{ fontSize: 26 }}>🤖</span>
            <div>
              <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 18 }}>
                {daten.gesamt === 0 ? 'Alles im grünen Bereich' : `${daten.gesamt} Vorschlag${daten.gesamt === 1 ? '' : '(e)'}`}
              </div>
              <div style={{ color: C.textDim, fontSize: 13, marginTop: 2 }}>
                {daten.gesamt === 0 ? 'Der Autopilot hat gerade nichts zu tun.' : `davon ${daten.dringend} dringend.`}
              </div>
            </div>
          </div>

          {/* Vorschläge */}
          {daten.vorschlaege.length === 0 ? (
            <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, color: C.textDim, textAlign: 'center' }}>
              Nichts zu tun — dein Marketing läuft rund. Sobald sich etwas ändert (offene Anfragen, teure Kampagnen, ein Landingpage-Sieger), erscheinen hier Vorschläge.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {daten.vorschlaege.map((v, i) => (
                <div key={i} style={{ background: C.navy2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${PRIO_FARBE[v.prioritaet]}`, borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: PRIO_FARBE[v.prioritaet], border: `1px solid ${PRIO_FARBE[v.prioritaet]}`, borderRadius: 999, padding: '2px 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{PRIO_LABEL[v.prioritaet]}</span>
                    <span style={{ fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{v.kategorie}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16 }}>{v.titel}</div>
                      <div style={{ color: C.textDim, fontSize: 13.5, lineHeight: 1.55, marginTop: 5 }}>{v.grund}</div>
                    </div>
                    <a href={v.aktionHref} style={{ background: C.gold, color: C.navy, borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap', fontFamily: 'var(--font-syne), sans-serif', alignSelf: 'center' }}>
                      {v.aktionText} →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p style={{ color: C.textDim, fontSize: 12, lineHeight: 1.6, marginTop: 20 }}>
            Der Autopilot schlägt nur vor — nichts wird automatisch ausgeführt. Automatisches Handeln (z. B. Kampagnen selbst drosseln) lässt sich später gezielt zuschalten.
          </p>
        </>
      )}
    </div>
  );
}
