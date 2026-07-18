'use client';

// ============================================================
// ARGONAUT OS · Bündel 6 · Online-Buchung (Chef-Einstellung)
// Der Betrieb legt seinen öffentlichen Buchungs-Link fest, schaltet die Seite
// frei und kopiert den Link. Die Buchbarkeit selbst kommt aus Termine
// (Öffnungszeiten + Terminarten). Speichert in profiles.buchung_slug/-_aktiv.
// Pfad: app/dashboard/online-buchung/page.tsx
// ============================================================

import { useState, useEffect, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[äàáâ]/g, 'a').replace(/[öòóô]/g, 'o').replace(/[üùúû]/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export default function OnlineBuchungPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [firma, setFirma] = useState('');
  const [slug, setSlug] = useState('');
  const [aktiv, setAktiv] = useState(false);
  const [laden, setLaden] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      const { data: p } = await supabase.from('profiles').select('firma_name, buchung_slug, buchung_aktiv').eq('id', id).maybeSingle();
      const f = (p?.firma_name as string) || '';
      setFirma(f);
      setSlug(((p?.buchung_slug as string) || '') || slugify(f));
      setAktiv((p?.buchung_aktiv as boolean) === true);
      setLaden(false);
    })();
  }, []);

  const linkBasis = typeof window !== 'undefined' ? window.location.origin : 'https://www.argonaut-os.com';
  const link = slug ? `${linkBasis}/buchen/${slug}` : '';

  async function speichern() {
    if (!uid) return;
    const s = slugify(slug);
    if (aktiv && !s) { setFehler('Bitte zuerst einen Buchungs-Link (Slug) festlegen.'); return; }
    setSpeichert(true); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('profiles').update({ buchung_slug: s || null, buchung_aktiv: aktiv }).eq('id', uid);
      if (error) {
        if ((error.message || '').toLowerCase().includes('duplicate') || (error as { code?: string }).code === '23505') {
          setFehler('Dieser Link ist schon vergeben. Bitte einen anderen wählen.');
        } else setFehler('Speichern fehlgeschlagen: ' + error.message);
        return;
      }
      setSlug(s);
      setOk('Gespeichert.');
      setTimeout(() => setOk(null), 2500);
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  function kopiere() {
    if (!link) return;
    try { void navigator.clipboard.writeText(link); setKopiert(true); setTimeout(() => setKopiert(false), 1800); } catch { /* ignore */ }
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Termine</div>
      <h1 style={styles.h1}>Online-Terminbuchung</h1>
      <p style={styles.sub}>
        Gib deinen Kunden einen Link, unter dem sie selbst freie Termine buchen — ohne Anruf, ohne Login.
        Grundlage sind deine <a href="/dashboard/termine" style={{ color: C.cyan, fontWeight: 700 }}>Öffnungszeiten &amp; Terminarten</a>.
      </p>

      {laden ? (
        <div style={styles.hint}>Lädt …</div>
      ) : (
        <div style={styles.card}>
          {fehler && <div style={styles.err}>{fehler}</div>}
          {ok && <div style={styles.ok}>{ok}</div>}

          <label style={styles.lbl}>Dein Buchungs-Link (Kürzel)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>{linkBasis}/buchen/</span>
            <input style={{ ...styles.input, maxWidth: 260 }} value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="mein-betrieb" />
          </div>
          <div style={{ color: C.textDim, fontSize: 'clamp(12.5px, 1.06vw, 17px)', marginTop: 6 }}>
            Nur Kleinbuchstaben, Zahlen und Bindestriche. Beispiel: <code style={styles.code}>friseur-mueller</code>.
          </div>

          <div style={styles.toggleZeile} onClick={() => setAktiv((v) => !v)}>
            <div style={{ ...styles.toggle, background: aktiv ? C.green : 'rgba(255,255,255,0.15)' }}>
              <div style={{ ...styles.toggleKnopf, left: aktiv ? 23 : 3 }} />
            </div>
            <span style={{ fontWeight: 600 }}>Buchungsseite {aktiv ? 'ist online' : 'ist offline'}</span>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button onClick={speichern} disabled={speichert} style={{ ...styles.primaer, opacity: speichert ? 0.6 : 1 }}>{speichert ? 'Speichert …' : 'Speichern'}</button>
          </div>

          {aktiv && link && (
            <div style={styles.linkBox}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>🌐 Dein Link — teile ihn mit Kunden:</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: C.cyan, fontWeight: 700, wordBreak: 'break-all' }}>{link}</a>
                <button onClick={kopiere} style={styles.ghost}>{kopiert ? '✓ Kopiert' : 'Kopieren'}</button>
                <a href={link} target="_blank" rel="noopener noreferrer" style={styles.ghost}>Vorschau öffnen</a>
              </div>
            </div>
          )}

          <div style={styles.tipp}>
            💡 Damit Slots erscheinen, brauchst du in <a href="/dashboard/termine" style={{ color: C.cyan, fontWeight: 700 }}>Termine</a> hinterlegte
            Öffnungszeiten und mindestens eine aktive Terminart.
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 20px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 680, lineHeight: 1.5 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, maxWidth: 680 },
  lbl: { display: 'block', fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  input: { boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit', width: '100%' },
  code: { background: 'rgba(0,229,255,0.08)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '1px 6px', fontFamily: 'monospace' },
  toggleZeile: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, cursor: 'pointer' },
  toggle: { width: 44, height: 24, borderRadius: 12, position: 'relative', flexShrink: 0, transition: 'background 0.15s' },
  toggleKnopf: { width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, transition: 'left 0.15s' },
  primaer: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)', fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none' },
  linkBox: { marginTop: 18, background: 'rgba(0,229,255,0.05)', border: `1px solid rgba(0,229,255,0.25)`, borderRadius: 12, padding: '14px 16px', fontSize: 'clamp(13.5px, 1.19vw, 19px)' },
  tipp: { marginTop: 16, color: C.textDim, fontSize: 'clamp(12.5px, 1.06vw, 17px)', lineHeight: 1.5 },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '14px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 },
};
