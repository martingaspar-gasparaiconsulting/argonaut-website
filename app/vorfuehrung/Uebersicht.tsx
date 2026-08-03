'use client';

// ============================================================================
// ARGONAUT OS · app/vorfuehrung/Uebersicht.tsx
//
// Der Einstieg am Vorführbildschirm. Zwei Wege, weil Menschen verschieden sind:
//
//   1. TIPPEN — „Was machen Sie beruflich?" Wer seinen Beruf eintippt, findet
//      sich unter 698 Branchen wieder. Das ist der Moment, der verkauft: nicht
//      „so ähnlich wie meine Branche", sondern „das bin ich".
//   2. BLÄTTERN — 19 Kategorie-Kacheln für alle, die auf einem fremden
//      Bildschirm nichts eintippen wollen.
//
// Dazu ein Lockbildschirm: Steht der Bildschirm zwei Minuten still, läuft er
// von selbst durch wechselnde Branchen. Ein schwarzer Bildschirm zieht niemanden
// an, ein laufender schon — und genau darum geht es auf einer Veranstaltung.
// ============================================================================

import { useState, useMemo, useEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import type { BrancheKurz } from '@/lib/vorfuehrung';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', gold2: '#e8c46a',
  cyan: '#00e5ff', text: '#E8EDF4', dim: '#8FA3BE', rand: 'rgba(143,163,190,0.18)',
};

const ZEICHEN: Record<string, string> = {
  'Handwerk & Bau': '🏗', 'Industrie & Produktion': '⚙️', 'Handel & E-Commerce': '🛒',
  'Fahrzeuge & Mobilität': '🚗', 'Gastronomie, Hotellerie & Tourismus': '🏨',
  'Lebensmittel & Nahversorgung': '🥖', 'Logistik & Transport': '🚚', 'IT & Technologie': '💻',
  'Energie & Umwelt': '☀️', 'Immobilien & Verwaltung': '🏢', 'Marketing, Medien & Kreativ': '📣',
  'Recht, Steuern & Finanzen': '⚖️', 'Bildung & Wissenschaft': '🎓', 'Gesundheit & Wellness': '🩺',
  'Sport, Beauty & Lifestyle': '🏋️', 'Tiere': '🐾', 'Landwirtschaft, Garten & Forst': '🌱',
  'Dienstleistungen': '🧹', 'Kultur, Soziales & Öffentliches': '🤝',
};

/** Umlaute und Bindestriche wegnormieren, damit „muller" auch „Müller" findet. */
function norm(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

type Kat = { kategorie: string; anzahl: number; beispiele: string[] };

export default function Uebersicht({
  branchen, kategorien,
}: { branchen: BrancheKurz[]; kategorien: Kat[] }) {
  const [suche, setSuche] = useState('');
  const [ruhe, setRuhe] = useState(false);
  const [lockIndex, setLockIndex] = useState(0);
  const letzteAktion = useRef<number>(0);

  const vorbereitet = useMemo(
    () => branchen.map((b) => ({ ...b, n: norm(b.name), k: norm(b.kategorie) })),
    [branchen],
  );

  const treffer = useMemo(() => {
    const q = norm(suche);
    if (q.length < 2) return [];
    const beginnt = vorbereitet.filter((b) => b.n.startsWith(q));
    const enthaelt = vorbereitet.filter((b) => !b.n.startsWith(q) && (b.n.includes(q) || b.k.includes(q)));
    return [...beginnt, ...enthaelt].slice(0, 12);
  }, [suche, vorbereitet]);

  // --- Lockbildschirm: nach zwei Minuten Stillstand läuft der Schirm selbst --
  useEffect(() => {
    letzteAktion.current = 0;
    const wach = () => { letzteAktion.current = 0; setRuhe(false); };
    for (const e of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
      window.addEventListener(e, wach, { passive: true });
    }
    const t = setInterval(() => {
      letzteAktion.current += 1;
      if (letzteAktion.current >= 120) setRuhe(true);
    }, 1000);
    return () => {
      clearInterval(t);
      for (const e of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
        window.removeEventListener(e, wach);
      }
    };
  }, []);

  useEffect(() => {
    if (!ruhe) return;
    const t = setInterval(() => setLockIndex((i) => (i + 1) % Math.max(1, branchen.length)), 1600);
    return () => clearInterval(t);
  }, [ruhe, branchen.length]);

  if (ruhe) {
    const b = branchen[lockIndex] || branchen[0];
    return (
      <div style={s.lock} onClick={() => setRuhe(false)}>
        <div style={s.lockMarke}>🔱&nbsp;&nbsp;A R G O N A U T&nbsp;&nbsp; O S</div>
        <div style={s.lockZeile}>Wir haben</div>
        <div style={s.lockName}>{b?.name}</div>
        <div style={s.lockZeile}>und {branchen.length - 1} weitere Branchen.</div>
        <div style={s.lockCta}>Bildschirm berühren</div>
      </div>
    );
  }

  return (
    <div style={s.seite}>
      <div style={s.kopf}>
        <div style={s.marke}>🔱&nbsp;&nbsp;A R G O N A U T&nbsp;&nbsp; O S</div>
        <h1 style={s.h1}>Was machen Sie beruflich?</h1>
        <p style={s.unter}>
          Tippen Sie es ein. Wir haben <b style={{ color: C.gold2 }}>{branchen.length} Branchen</b> hinterlegt —
          Ihre ist mit ziemlicher Sicherheit dabei.
        </p>

        <div style={s.suchfeld}>
          <span style={s.lupe}>🔍</span>
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="z. B. Maler, Bäckerei, Spedition, Steuerberater …"
            style={s.eingabe}
            autoComplete="off"
            spellCheck={false}
          />
          {suche && <button onClick={() => setSuche('')} style={s.leeren}>✕</button>}
        </div>

        {suche.length >= 2 && (
          <div style={s.trefferBox}>
            {treffer.length === 0 ? (
              <div style={s.keinTreffer}>
                Dazu haben wir noch nichts. Schauen Sie unten in den Kategorien —
                oder sprechen Sie mich an, dann bauen wir Ihre Branche.
              </div>
            ) : (
              treffer.map((t) => (
                <Link key={t.slug} href={`/vorfuehrung/${t.slug}`} style={s.treffer}>
                  <span style={s.trefferZeichen}>{ZEICHEN[t.kategorie] || '🔱'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={s.trefferName}>{t.name}</b>
                    <span style={s.trefferKat}>{t.kategorie}</span>
                  </span>
                  <span style={s.trefferPfeil}>›</span>
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      {suche.length < 2 && (
        <>
          <div style={s.trenner}>… oder blättern Sie durch die Kategorien</div>
          <div style={s.gitter}>
            {kategorien.map((k) => (
              <Link key={k.kategorie} href={`/vorfuehrung/kategorie/${encodeURIComponent(k.kategorie)}`} style={s.kachel}>
                <div style={s.zeichen}>{ZEICHEN[k.kategorie] || '🔱'}</div>
                <div style={s.katName}>{k.kategorie}</div>
                <div style={s.katAnzahl}>{k.anzahl} Branchen</div>
                <div style={s.katBeispiele}>{k.beispiele.join(' · ')}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      <p style={s.fuss}>
        Alle gezeigten Betriebe sind Beispiele. Modul-Zusammenstellung und Preise stammen aus demselben
        System, das auch ein echtes Angebot rechnet.
      </p>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  seite: { minHeight: '100vh', background: `radial-gradient(1200px 700px at 50% -10%, #14243c 0%, ${C.navy} 60%)`, color: C.text, padding: '44px 30px 60px', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  kopf: { maxWidth: 940, margin: '0 auto', textAlign: 'center' },
  marke: { color: C.gold, fontSize: 15, fontWeight: 800, letterSpacing: 3, marginBottom: 18 },
  h1: { fontSize: 50, fontWeight: 800, margin: 0, lineHeight: 1.08 },
  unter: { color: C.dim, fontSize: 20, lineHeight: 1.5, margin: '14px 0 0' },
  suchfeld: { display: 'flex', alignItems: 'center', gap: 14, background: C.navy2, border: `2px solid ${C.gold}`, borderRadius: 18, padding: '6px 18px', marginTop: 26 },
  lupe: { fontSize: 26 },
  eingabe: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 26, padding: '18px 0', fontFamily: 'inherit' },
  leeren: { background: 'transparent', border: 'none', color: C.dim, fontSize: 26, cursor: 'pointer', padding: '0 6px', fontFamily: 'inherit' },
  trefferBox: { marginTop: 14, background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 18, overflow: 'hidden', textAlign: 'left' },
  treffer: { display: 'flex', alignItems: 'center', gap: 16, padding: '17px 22px', borderBottom: `1px solid ${C.rand}`, textDecoration: 'none', color: C.text },
  trefferZeichen: { fontSize: 26 },
  trefferName: { display: 'block', fontSize: 21, fontWeight: 700 },
  trefferKat: { display: 'block', color: C.dim, fontSize: 14.5, marginTop: 2 },
  trefferPfeil: { color: C.cyan, fontSize: 30, fontWeight: 800 },
  keinTreffer: { padding: '22px 24px', color: C.dim, fontSize: 17, lineHeight: 1.55 },
  trenner: { textAlign: 'center', color: C.dim, fontSize: 17, margin: '38px 0 18px' },
  gitter: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16, maxWidth: 1500, margin: '0 auto' },
  kachel: { display: 'flex', flexDirection: 'column', gap: 5, background: C.navy2, border: `1px solid ${C.rand}`, borderRadius: 18, padding: '20px 22px', textDecoration: 'none', color: C.text, minHeight: 160 },
  zeichen: { fontSize: 34, lineHeight: 1 },
  katName: { fontSize: 19, fontWeight: 800, lineHeight: 1.25, marginTop: 6 },
  katAnzahl: { color: C.gold, fontSize: 14.5, fontWeight: 700 },
  katBeispiele: { color: C.dim, fontSize: 13.5, lineHeight: 1.45, marginTop: 4 },
  fuss: { color: C.dim, fontSize: 13.5, lineHeight: 1.6, maxWidth: 900, margin: '36px auto 0', textAlign: 'center' },
  lock: { minHeight: '100vh', background: C.navy, color: C.text, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: 'pointer', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: 40, textAlign: 'center' },
  lockMarke: { color: C.gold, fontSize: 18, fontWeight: 800, letterSpacing: 4, marginBottom: 30 },
  lockZeile: { color: C.dim, fontSize: 28 },
  lockName: { fontSize: 62, fontWeight: 800, color: C.gold2, lineHeight: 1.1, maxWidth: 1100 },
  lockCta: { marginTop: 44, color: C.cyan, fontSize: 24, fontWeight: 800, border: `2px solid ${C.cyan}`, borderRadius: 999, padding: '14px 34px' },
};
