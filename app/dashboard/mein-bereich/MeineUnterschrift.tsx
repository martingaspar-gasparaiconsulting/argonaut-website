'use client';

// ============================================================
// ARGONAUT OS · Q1 · Meine Unterschrift (in „Mein Bereich")
// Jeder Nutzer (Chef wie Mitarbeiter) legt seine EIGENE Unterschrift ab —
// per Zeichnen (Finger/Maus) oder PNG-Upload. Gespeichert je auth.uid()
// in benutzer_unterschrift (RLS: nur die eigene Zeile). Self-contained.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navySoft: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)', danger: '#E06666',
};

export default function MeineUnterschrift() {
  const [uid, setUid] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState<string | null>(null);
  const [kandidat, setKandidat] = useState<string | null>(null);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [modus, setModus] = useState<'zeichnen' | 'upload'>('zeichnen');
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zeichnet = useRef(false);
  const [hatGezeichnet, setHatGezeichnet] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data?.user?.id ?? null;
        setUid(u);
        if (u) {
          const { data: row } = await supabase
            .from('benutzer_unterschrift')
            .select('bild')
            .eq('auth_user_id', u)
            .maybeSingle();
          const bild = (row as { bild?: string | null } | null)?.bild ?? null;
          setGespeichert(bild);
          if (!bild) setBearbeiten(true);
        }
      } catch {
        /* still — Karte bleibt bedienbar */
      } finally {
        setLaden(false);
      }
    })();
  }, []);

  // --- Zeichnen ---
  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const c = canvasRef.current; if (!c) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    zeichnet.current = true;
    const ctx = c.getContext('2d')!;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!zeichnet.current) return;
    e.preventDefault();
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = '#111111'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke();
    if (!hatGezeichnet) setHatGezeichnet(true);
  }
  function ende() {
    if (!zeichnet.current) return;
    zeichnet.current = false;
    const c = canvasRef.current;
    if (c && hatGezeichnet) setKandidat(c.toDataURL('image/png'));
  }
  function leeren() {
    const c = canvasRef.current;
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setHatGezeichnet(false);
    setKandidat(null);
  }

  function hochladen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 3_000_000) { setMsg('Datei zu groß (max. 3 MB).'); return; }
    const r = new FileReader();
    r.onload = () => setKandidat(String(r.result));
    r.readAsDataURL(f);
  }

  async function speichern() {
    if (!uid || !kandidat) return;
    setBusy(true); setMsg(null);
    try {
      const { error } = await supabase
        .from('benutzer_unterschrift')
        .upsert({ auth_user_id: uid, bild: kandidat, updated_at: new Date().toISOString() }, { onConflict: 'auth_user_id' });
      if (error) throw error;
      setGespeichert(kandidat);
      setKandidat(null); setBearbeiten(false); leeren();
      setMsg('Unterschrift gespeichert.');
    } catch {
      setMsg('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  async function entfernen() {
    if (!uid) return;
    if (typeof window !== 'undefined' && !window.confirm('Deine gespeicherte Unterschrift wirklich entfernen?')) return;
    setBusy(true); setMsg(null);
    try {
      await supabase.from('benutzer_unterschrift').delete().eq('auth_user_id', uid);
      setGespeichert(null); setBearbeiten(true); setKandidat(null); leeren();
      setMsg('Unterschrift entfernt.');
    } finally {
      setBusy(false);
    }
  }

  if (laden) return null;

  const card: React.CSSProperties = { background: C.navySoft, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, marginBottom: 18 };
  const btn: React.CSSProperties = { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '10px 16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' };
  const ghost: React.CSSProperties = { background: 'transparent', color: C.text, border: `1px solid ${C.line}`, borderRadius: 9, padding: '10px 16px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
  const tab = (an: boolean): React.CSSProperties => ({ background: an ? 'rgba(0,229,255,0.10)' : 'transparent', color: an ? '#fff' : C.textDim, border: `1.5px solid ${an ? C.cyan : C.line}`, borderRadius: 9, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });

  return (
    <section style={{ ...card, fontFamily: 'var(--font-dm-sans), sans-serif', color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 'clamp(17px, 1.5vw, 22px)', fontWeight: 800, color: C.gold }}>✍️ Meine Unterschrift</h2>
      </div>
      <p style={{ color: C.textDim, margin: '0 0 16px', fontSize: 14 }}>
        Deine persönliche Unterschrift — nur du siehst und nutzt sie. Sie kann auf deine Dokumente gesetzt werden (z. B. Nachweise, Bestätigungen).
      </p>

      {msg && (
        <div style={{ background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.green}`, color: C.text, borderRadius: 9, padding: '9px 13px', marginBottom: 14, fontSize: 14 }}>{msg}</div>
      )}

      {gespeichert && !bearbeiten ? (
        <div>
          <div style={{ background: '#fff', borderRadius: 10, padding: 14, display: 'inline-block', maxWidth: '100%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gespeichert} alt="Meine Unterschrift" style={{ display: 'block', maxWidth: '100%', maxHeight: 120 }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button style={ghost} onClick={() => { setBearbeiten(true); setModus('zeichnen'); }}>Ändern</button>
            <button style={{ ...ghost, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={entfernen} disabled={busy}>Entfernen</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <button style={tab(modus === 'zeichnen')} onClick={() => setModus('zeichnen')}>✍️ Zeichnen</button>
            <button style={tab(modus === 'upload')} onClick={() => setModus('upload')}>⬆ PNG hochladen</button>
          </div>

          {modus === 'zeichnen' ? (
            <div>
              <canvas
                ref={canvasRef}
                width={640}
                height={200}
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={ende}
                onPointerLeave={ende}
                style={{ width: '100%', maxWidth: 640, height: 'auto', aspectRatio: '640 / 200', background: '#fff', borderRadius: 10, border: `1px solid ${C.line}`, touchAction: 'none', cursor: 'crosshair', display: 'block' }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <button style={ghost} onClick={leeren}>Leeren</button>
              </div>
            </div>
          ) : (
            <div>
              <input type="file" accept="image/png,image/jpeg" onChange={hochladen} style={{ color: C.textDim }} />
              <p style={{ color: C.textDim, fontSize: 13, marginTop: 8 }}>Am besten ein PNG mit durchsichtigem Hintergrund (z. B. aus dem Unterschrift-Generator).</p>
              {kandidat && (
                <div style={{ background: '#fff', borderRadius: 10, padding: 14, display: 'inline-block', marginTop: 8, maxWidth: '100%' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={kandidat} alt="Vorschau" style={{ display: 'block', maxWidth: '100%', maxHeight: 120 }} />
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button style={{ ...btn, opacity: kandidat && !busy ? 1 : 0.5, cursor: kandidat && !busy ? 'pointer' : 'not-allowed' }} onClick={speichern} disabled={!kandidat || busy}>
              {busy ? 'Speichern …' : 'Unterschrift speichern'}
            </button>
            {gespeichert && (
              <button style={ghost} onClick={() => { setBearbeiten(false); setKandidat(null); leeren(); }}>Abbrechen</button>
            )}
          </div>
        </div>
      )}

      <p style={{ color: C.textDim, fontSize: 12, marginTop: 18, lineHeight: 1.5, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
        <b style={{ color: C.textDim }}>Hinweis zur Gültigkeit:</b> Dies ist eine einfache elektronische Signatur (grafisches Faksimile). Sie ist für Geschäftsdokumente ohne gesetzliche Formvorschrift wirksam, ersetzt aber <b>keine</b> eigenhändige oder qualifizierte elektronische Signatur, wo das Gesetz Schriftform verlangt (u. a. Kündigung/Befristung von Arbeitsverträgen, Bürgschaften, notariell zu beurkundende Geschäfte).
      </p>
    </section>
  );
}
