'use client';

// ============================================================
// ARGONAUT OS · Marktplatz-Sync (Punkt 6)
// Amazon/eBay/Kaufland/OTTO anschlussfertig verbinden (verschlüsselte
// Zugangsdaten). Der Bestell-/Bestands-Abgleich ist „in Aufbau".
// Pfad: app/dashboard/marktplaetze/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { MARKTPLAETZE } from '@/lib/marktplatz';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Status = Record<string, { verbunden: boolean; konto_id: string }>;

export default function MarktplaetzeSeite() {
  const [status, setStatus] = useState<Status>({});
  const [encKeyBereit, setEncKeyBereit] = useState(true);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null); // welche Karte im Bearbeiten-Modus
  const [entwurf, setEntwurf] = useState<Record<string, { konto_id: string; token: string }>>({});

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data?.user?.id) { setFehler('Nicht angemeldet.'); return; }
      const r = await fetch('/api/marktplatz/verbindung'); const j = await r.json();
      if (j?.ok) { setStatus(j.status || {}); setEncKeyBereit(!!j.encKeyBereit); }
    } catch (e) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => { void laden_(); }, [laden_]);

  function feld(key: string, f: 'konto_id' | 'token', v: string) {
    setEntwurf((e) => ({ ...e, [key]: { ...(e[key] ?? { konto_id: '', token: '' }), [f]: v } }));
  }

  async function verbinden(key: string) {
    const e = entwurf[key] ?? { konto_id: '', token: '' };
    if (!e.konto_id.trim() || !e.token.trim()) { setFehler('Bitte Konto-Kennung und Token eingeben.'); return; }
    setBusy(key); setFehler(null); setOk(null);
    try {
      const r = await fetch('/api/marktplatz/verbindung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plattform: key, konto_id: e.konto_id.trim(), token: e.token.trim() }) });
      const j = await r.json();
      if (!j?.ok) { setFehler(j?.error || 'Verbinden fehlgeschlagen.'); return; }
      setEntwurf((x) => ({ ...x, [key]: { konto_id: '', token: '' } })); setOffen(null);
      setOk('Zugang gespeichert. Der Abgleich wird gerade finalisiert.');
      await laden_();
    } finally { setBusy(null); }
  }

  async function trennen(key: string) {
    if (!window.confirm('Diesen Marktplatz-Zugang wirklich trennen?')) return;
    setBusy(key); setFehler(null);
    try {
      const r = await fetch(`/api/marktplatz/verbindung?plattform=${encodeURIComponent(key)}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j?.ok) { setFehler(j?.error || 'Trennen fehlgeschlagen.'); return; }
      await laden_();
    } finally { setBusy(null); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Handel</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={styles.h1}>🛒 Marktplätze</h1>
        <span style={styles.beta}>Abgleich in Aufbau</span>
      </div>
      <p style={styles.sub}>Verbinde deine Verkaufsplattformen — die Zugänge kannst du schon jetzt sicher hinterlegen. Der automatische Bestell- und Bestandsabgleich (Bestellungen rein, Bestand synchron) wird gerade finalisiert.</p>

      {!encKeyBereit && <div style={styles.warn}>Hinweis: Der Sicherheits-Schlüssel (APP_ENC_KEY) ist noch nicht gesetzt — das Speichern klappt erst danach.</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {laden ? <div style={styles.hint}>Lädt …</div> : (
        <div style={styles.grid}>
          {MARKTPLAETZE.map((m) => {
            const st = status[m.key] || { verbunden: false, konto_id: '' };
            const e = entwurf[m.key] ?? { konto_id: '', token: '' };
            return (
              <div key={m.key} style={styles.card}>
                <div style={styles.kopf}>
                  <span style={{ fontSize: 22 }}>{m.icon}</span>
                  <span style={{ fontWeight: 800, fontSize: 18 }}>{m.name}</span>
                  <span style={{ flex: 1 }} />
                  {st.verbunden
                    ? <span style={{ ...styles.badge, color: C.green, borderColor: C.green }}>✓ verbunden</span>
                    : <span style={{ ...styles.badge, color: C.textDim, borderColor: C.border }}>nicht verbunden</span>}
                </div>

                {st.verbunden ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ color: C.textDim, fontSize: 13 }}>{m.idLabel}: <b style={{ color: C.text }}>{st.konto_id}</b></div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button style={styles.mini} disabled={busy === m.key} onClick={() => setOffen(offen === m.key ? null : m.key)}>Ändern</button>
                      <button style={styles.miniWeg} disabled={busy === m.key} onClick={() => trennen(m.key)}>Trennen</button>
                    </div>
                  </div>
                ) : (
                  <button style={{ ...styles.mini, marginTop: 10 }} onClick={() => setOffen(offen === m.key ? null : m.key)}>{offen === m.key ? 'Abbrechen' : 'Verbinden'}</button>
                )}

                {offen === m.key && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={styles.lab}>{m.idLabel}<input style={styles.inp} value={e.konto_id} onChange={(ev) => feld(m.key, 'konto_id', ev.target.value)} /></label>
                    <label style={styles.lab}>{m.tokenLabel}<input style={styles.inp} type="password" value={e.token} onChange={(ev) => feld(m.key, 'token', ev.target.value)} /></label>
                    <button style={{ ...styles.primaer, opacity: busy === m.key ? 0.6 : 1 }} disabled={busy === m.key} onClick={() => verbinden(m.key)}>🔗 Speichern</button>
                    <div style={{ color: C.textDim, fontSize: 12 }}>Verschlüsselt gespeichert, nie im Browser sichtbar.</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px', maxWidth: 960, margin: '0 auto' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  beta: { background: 'rgba(0,229,255,0.12)', color: C.cyan, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' },
  sub: { color: C.textDim, margin: '8px 0 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18 },
  kopf: { display: 'flex', gap: 10, alignItems: 'center' },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 15, fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  miniWeg: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '7px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 11px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 16, padding: '10px 0' },
  warn: { color: C.warn, background: 'rgba(224,162,76,0.1)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '10px 14px', margin: '4px 0 12px', fontSize: 13.5 },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 14, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
