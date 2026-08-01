'use client';

// ============================================================
// ARGONAUT OS · Anschlüsse-Cockpit
// Eine Seite, ein Blick: welche externen Anschlüsse sind verbunden,
// welche noch offen — alle sicher hinterlegbar, Sync „in Aufbau".
// Liest /api/anschluesse/uebersicht (zählt nur, nie Zugangsdaten).
// Pfad: app/dashboard/anschluesse/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { baueStatusListe, gruppiereNachKategorie, fortschritt, type AnschlussMitStatus } from '@/lib/anschluesse';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

export default function AnschluesseSeite() {
  const [items, setItems] = useState<AnschlussMitStatus[]>([]);
  const [encKeyBereit, setEncKeyBereit] = useState(true);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data?.user?.id) { setFehler('Nicht angemeldet.'); return; }
      const r = await fetch('/api/anschluesse/uebersicht'); const j = await r.json();
      if (j?.ok) {
        setItems(baueStatusListe(j.anzahl || {}));
        setEncKeyBereit(!!j.encKeyBereit);
      } else {
        setFehler(j?.error || 'Übersicht konnte nicht geladen werden.');
      }
    } catch (e) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => { void laden_(); }, [laden_]);

  const f = fortschritt(items);
  const gruppen = gruppiereNachKategorie(items);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Übersicht</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={styles.h1}>🔌 Anschlüsse</h1>
        <span style={styles.beta}>Sync in Aufbau</span>
      </div>
      <p style={styles.sub}>Alles, was ARGONAUT mit der Außenwelt verbindet — an einem Ort. Zugänge kannst du schon jetzt sicher hinterlegen (verschlüsselt, nie im Browser sichtbar). Der automatische Abgleich wird pro Anschluss gerade finalisiert.</p>

      {!encKeyBereit && <div style={styles.warn}>Hinweis: Der Sicherheits-Schlüssel (APP_ENC_KEY) ist noch nicht gesetzt — das Speichern der Zugänge klappt erst danach.</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {!laden && !fehler && (
        <div style={styles.band}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{f.verbunden} von {f.gesamt} Anschlüssen verbunden</div>
            <div style={{ color: C.textDim, fontSize: 14 }}>{f.prozent}%</div>
          </div>
          <div style={styles.bar}><div style={{ ...styles.barFill, width: `${f.prozent}%` }} /></div>
        </div>
      )}

      {laden ? <div style={styles.hint}>Lädt …</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 6 }}>
          {gruppen.map((g) => (
            <div key={g.kategorie}>
              <div style={styles.katKopf}>{g.kategorie}</div>
              <div style={styles.grid}>
                {g.eintraege.map((a) => (
                  <a key={a.key} href={a.href} style={styles.card}>
                    <div style={styles.kopf}>
                      <span style={{ fontSize: 22 }}>{a.icon}</span>
                      <span style={{ fontWeight: 800, fontSize: 17 }}>{a.name}</span>
                      <span style={{ flex: 1 }} />
                      {a.status === 'verbunden'
                        ? <span style={{ ...styles.badge, color: C.green, borderColor: C.green }}>✓ verbunden</span>
                        : <span style={{ ...styles.badge, color: C.textDim, borderColor: C.border }}>nicht verbunden</span>}
                    </div>
                    <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 8, lineHeight: 1.45 }}>{a.was}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                      {a.status === 'verbunden' && a.anzahl > 1 && <span style={styles.chip}>{a.anzahl} Konten</span>}
                      <span style={{ flex: 1 }} />
                      <span style={styles.link}>{a.status === 'verbunden' ? 'Verwalten' : 'Einrichten'} →</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px', maxWidth: 980, margin: '0 auto' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  beta: { background: 'rgba(0,229,255,0.12)', color: C.cyan, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' },
  sub: { color: C.textDim, margin: '8px 0 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 840, lineHeight: 1.5 },
  band: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 18px', margin: '4px 0 20px' },
  bar: { background: 'rgba(143,163,190,0.15)', borderRadius: 999, height: 9, marginTop: 10, overflow: 'hidden' },
  barFill: { background: C.green, height: '100%', borderRadius: 999, transition: 'width .4s ease' },
  katKopf: { color: C.gold, fontWeight: 700, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, textDecoration: 'none', color: C.text, display: 'block' },
  kopf: { display: 'flex', gap: 10, alignItems: 'center' },
  chip: { background: 'rgba(76,175,125,0.12)', color: C.green, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 },
  link: { color: C.cyan, fontSize: 13.5, fontWeight: 700 },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 11px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 16, padding: '10px 0' },
  warn: { color: C.warn, background: 'rgba(224,162,76,0.1)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '10px 14px', margin: '4px 0 12px', fontSize: 13.5 },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
