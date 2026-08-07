'use client';

import { useEffect, useState } from 'react';

// ============================================================
// ARGONAUT OS · MODUL 3 MARKETING · SEO-Modul (Punkt 6 + 6b)
// Prüft die eigene(n) ARGONAUT-Seite(n) UND — auf Wunsch — die bestehende
// externe Website des Kunden gegen die wichtigsten On-Page-SEO-Faktoren,
// zeigt je Seite einen Score + konkrete Tipps und lokale Keyword-Ideen.
// Ziel: mehr organische Google-Anfragen. Look = Kunden-Dashboard.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)',
};

type Note = 'gut' | 'mittel' | 'schwach';
type CheckStatus = 'gut' | 'warnung' | 'fehlt';
type Check = { schluessel: string; titel: string; status: CheckStatus; gewicht: number; befund: string; tipp: string };
type Seite = {
  slug: string; oeffentlich_id: string | null; status: string;
  titel: string; score: number; note: Note; offen: number; checks: Check[];
};
type Daten = { ok: boolean; error?: string; seiten: Seite[]; gesamtScore: number | null; keywords: string[]; hatFirmendaten: boolean };
type ExternErg = { ok: boolean; error?: string; url?: string; title?: string; score?: number; note?: Note; offen?: number; checks?: Check[] };

const NOTE_FARBE: Record<Note, string> = { gut: C.green, mittel: C.gold, schwach: C.danger };
const NOTE_TEXT: Record<Note, string> = { gut: 'Gut aufgestellt', mittel: 'Ausbaufähig', schwach: 'Viel Potenzial' };
const ST_FARBE: Record<CheckStatus, string> = { gut: C.green, warnung: C.warn, fehlt: C.danger };
const ST_ICON: Record<CheckStatus, string> = { gut: '✓', warnung: '!', fehlt: '✗' };

const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 200, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10,
  padding: '11px 13px', color: C.text, fontSize: 14.5, fontFamily: 'inherit', boxSizing: 'border-box',
};

export default function SeoPage() {
  const [daten, setDaten] = useState<Daten | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // Externe Website-Prüfung (Punkt 6b).
  const [extUrl, setExtUrl] = useState('');
  const [extLaden, setExtLaden] = useState(false);
  const [extFehler, setExtFehler] = useState<string | null>(null);
  const [extErg, setExtErg] = useState<ExternErg | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/marketing/seo');
        if (res.status === 401 || res.status === 403) { setFehler('Bitte einloggen.'); setLaden(false); return; }
        const j = (await res.json()) as Daten;
        if (!j.ok) { setFehler(j.error || 'Der SEO-Check konnte nicht geladen werden.'); setLaden(false); return; }
        setDaten(j);
      } catch { setFehler('Der SEO-Check konnte nicht geladen werden.'); } finally { setLaden(false); }
    })();
  }, []);

  async function pruefeExtern() {
    setExtFehler(null); setExtErg(null);
    if (!extUrl.trim()) { setExtFehler('Bitte eine Website-Adresse eingeben.'); return; }
    setExtLaden(true);
    try {
      const res = await fetch('/api/marketing/seo-extern', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: extUrl }),
      });
      const j = (await res.json()) as ExternErg;
      if (!j.ok) { setExtFehler(j.error || 'Die Seite konnte nicht geprüft werden.'); setExtLaden(false); return; }
      setExtErg(j);
    } catch { setExtFehler('Die Seite konnte nicht geprüft werden.'); } finally { setExtLaden(false); }
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
      <h1 style={{ fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.5rem, 3.2vw, 2.1rem)', fontWeight: 800, margin: 0 }}>
        🔍 SEO-Modul
      </h1>
      <p style={{ color: C.textDim, fontSize: 14.5, lineHeight: 1.5, margin: '8px 0 22px', maxWidth: 800 }}>
        Damit dich Kunden bei Google finden — <b style={{ color: C.text }}>ohne für jede Anfrage zu bezahlen</b>. Der Check prüft deine Website gegen die wichtigsten Google-Faktoren und sagt dir in Klartext, was du verbessern kannst. Dazu passende Suchbegriffe, nach denen deine Kunden suchen.
      </p>

      {/* Punkt 6b — Bestehende externe Website prüfen */}
      <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 22 }}>
        <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>🌐 Bestehende Website prüfen</div>
        <div style={{ color: C.textDim, fontSize: 13.5, marginBottom: 12, lineHeight: 1.5 }}>
          Du hast schon eine eigene Website? Gib die Adresse ein — der Check liest die echte Seite und bewertet sie genauso wie eine ARGONAUT-Seite.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={extUrl}
            onChange={(e) => setExtUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') pruefeExtern(); }}
            placeholder="z. B. meine-firma.de"
            style={inputStyle}
          />
          <button
            onClick={pruefeExtern}
            disabled={extLaden}
            style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 22px', fontWeight: 700, fontSize: 14.5, cursor: extLaden ? 'wait' : 'pointer', opacity: extLaden ? 0.7 : 1, fontFamily: 'var(--font-syne), sans-serif' }}
          >
            {extLaden ? 'Prüfe …' : 'Website prüfen'}
          </button>
        </div>
        {extFehler && <div style={{ color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginTop: 12 }}>{extFehler}</div>}
        {extErg && extErg.ok && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
              <ScoreRing score={extErg.score || 0} gross />
              <div>
                <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16 }}>{extErg.title || extErg.url}</div>
                <div style={{ color: NOTE_FARBE[extErg.note || 'schwach'], fontSize: 13.5, marginTop: 2, fontWeight: 600 }}>
                  {NOTE_TEXT[extErg.note || 'schwach']} · {extErg.offen} Punkt{extErg.offen === 1 ? '' : 'e'} offen
                </div>
                <div style={{ color: C.textDim, fontSize: 12, marginTop: 2, wordBreak: 'break-all' }}>{extErg.url}</div>
              </div>
            </div>
            <CheckListe checks={extErg.checks || []} />
          </div>
        )}
      </div>

      {fehler && <div style={{ color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}>{fehler}</div>}

      {/* ARGONAUT-eigene Seiten */}
      <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, margin: '4px 0 12px' }}>🏛️ Deine ARGONAUT-Seiten</div>
      {laden ? <p style={{ color: C.textDim }}>Website wird geprüft …</p> : daten && (
        <>
          {daten.seiten.length === 0 ? (
            <div style={{ background: C.navy2, border: `1px dashed ${C.border}`, borderRadius: 14, padding: 24, color: C.textDim, fontSize: 14.5, lineHeight: 1.6 }}>
              Noch keine Seite im ARGONAUT-Baukasten. Sobald du dort eine Seite angelegt und veröffentlicht hast, prüft der Check sie hier automatisch. Eine bestehende externe Website kannst du oben direkt prüfen.
              <div style={{ marginTop: 12 }}>
                <a href="/dashboard/website" style={{ color: C.cyan, textDecoration: 'none', fontWeight: 700 }}>Zum Website-Baukasten →</a>
              </div>
            </div>
          ) : (
            <>
              {daten.gesamtScore != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px', marginBottom: 18 }}>
                  <ScoreRing score={daten.gesamtScore} gross />
                  <div>
                    <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 18 }}>Gesamt-SEO-Score</div>
                    <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 3 }}>
                      Durchschnitt über {daten.seiten.length} Seite{daten.seiten.length === 1 ? '' : 'n'}. Je höher, desto besser findet dich Google.
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
                {daten.seiten.map((s) => <SeitenKarte key={s.slug || s.titel} s={s} />)}
              </div>
            </>
          )}

          {daten.keywords.length > 0 && (
            <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16, marginBottom: 6 }}>💡 Keyword-Ideen für deine Region</div>
              <div style={{ color: C.textDim, fontSize: 13, marginBottom: 12 }}>Suchbegriffe, nach denen potenzielle Kunden googeln — baue sie natürlich in deine Texte, Titel und FAQ ein.</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {daten.keywords.map((k, i) => (
                  <span key={i} style={{ background: 'rgba(0,229,255,0.10)', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 999, padding: '6px 14px', fontSize: 13.5 }}>{k}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- Bausteine ----------------

function CheckListe({ checks }: { checks: Check[] }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {checks.map((c) => (
        <div key={c.schluessel} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 10, alignItems: 'start', background: 'rgba(143,163,190,0.05)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: ST_FARBE[c.status], color: C.navy, fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{ST_ICON[c.status]}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{c.titel} <span style={{ color: C.textDim, fontWeight: 400, fontSize: 13 }}>— {c.befund}</span></div>
            {c.status !== 'gut' && <div style={{ color: C.textDim, fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>👉 {c.tipp}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoreRing({ score, gross }: { score: number; gross?: boolean }) {
  const note: Note = score >= 80 ? 'gut' : score >= 50 ? 'mittel' : 'schwach';
  const farbe = NOTE_FARBE[note];
  const groesse = gross ? 76 : 54;
  const strich = gross ? 8 : 6;
  const r = (groesse - strich) / 2;
  const umfang = 2 * Math.PI * r;
  const gefuellt = Math.max(0, Math.min(100, score)) / 100 * umfang;
  return (
    <div style={{ position: 'relative', width: groesse, height: groesse, flexShrink: 0 }}>
      <svg width={groesse} height={groesse} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={groesse / 2} cy={groesse / 2} r={r} fill="none" stroke="rgba(143,163,190,0.18)" strokeWidth={strich} />
        <circle cx={groesse / 2} cy={groesse / 2} r={r} fill="none" stroke={farbe} strokeWidth={strich} strokeLinecap="round" strokeDasharray={`${gefuellt} ${umfang}`} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: gross ? 22 : 16, color: farbe, lineHeight: 1 }}>{score}</span>
      </div>
    </div>
  );
}

function SeitenKarte({ s }: { s: Seite }) {
  const [offen, setOffen] = useState(false);
  return (
    <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <ScoreRing score={s.score} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 16 }}>{s.titel}</div>
          <div style={{ color: NOTE_FARBE[s.note], fontSize: 13, marginTop: 2, fontWeight: 600 }}>
            {NOTE_TEXT[s.note]} · {s.offen} Punkt{s.offen === 1 ? '' : 'e'} offen · {s.status === 'live' ? 'live' : 'Entwurf'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {s.oeffentlich_id && s.status === 'live' && (
            <a href={`/p/${s.oeffentlich_id}`} target="_blank" rel="noreferrer" style={{ color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '8px 14px', fontSize: 13, textDecoration: 'none', fontWeight: 700 }}>Seite ansehen ↗</a>
          )}
          <button onClick={() => setOffen((o) => !o)} style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-syne), sans-serif' }}>
            {offen ? 'Details ▲' : 'Details ▼'}
          </button>
        </div>
      </div>
      {offen && <div style={{ marginTop: 14 }}><CheckListe checks={s.checks} /></div>}
    </div>
  );
}
