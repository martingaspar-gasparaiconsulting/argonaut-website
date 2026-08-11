'use client';

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { VIDEO_KANAELE, type VideoSkript } from '@/lib/videoSkript';

// ============================================================
// ARGONAUT OS · MARKETING · Video-Skript-Studio
// (Abschnitt 14 · Marketing-Tiefe — "Kanaele + Video")
// Thema + Kanaele + Dauer -> /api/marketing/video-skript -> drehreife
// Kurzvideo-Skripte je Kanal (Hook, Shotlist, Untertitel, CTA, Hashtags).
// Nur Text — Video-Erzeugung/Avatar/Stimme ist bewusst Abschnitt 7.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const DAUER_OPTS = [15, 30, 45, 60];
const TON_OPTS = ['', 'professionell', 'locker', 'verkäuferisch', 'sachlich-informativ', 'emotional', 'humorvoll'];

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0F1F33', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 9, padding: '10px 12px', color: '#fff', fontFamily: 'DM Sans, sans-serif',
  fontSize: 'clamp(14px, 1.25vw, 20px)', boxSizing: 'border-box',
};

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16, flex: 1, minWidth: 180 }}>
      <label style={{ display: 'block', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', color: C.textDim, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function skriptAlsText(s: VideoSkript): string {
  const zeilen: string[] = [];
  zeilen.push(`${s.name} · ${s.format} · ~${s.dauerSekunden} Sek.`);
  zeilen.push('');
  if (s.hook) { zeilen.push(`HOOK (0–3s): ${s.hook}`); zeilen.push(''); }
  if (s.szenen.length) {
    zeilen.push('SHOTLIST:');
    for (const sz of s.szenen) {
      const kopf = [sz.zeit, sz.bild].filter(Boolean).join(' · ');
      zeilen.push(kopf ? `• ${kopf}` : '•');
      if (sz.text) zeilen.push(`  ${sz.text}`);
    }
    zeilen.push('');
  }
  if (s.onScreenText.length) { zeilen.push('EINBLENDUNGEN: ' + s.onScreenText.join(' | ')); zeilen.push(''); }
  if (s.untertitel) { zeilen.push('UNTERTITEL / SPRECHERTEXT:'); zeilen.push(s.untertitel); zeilen.push(''); }
  if (s.cta) { zeilen.push(`CALL-TO-ACTION: ${s.cta}`); zeilen.push(''); }
  if (s.hashtags.length) zeilen.push(s.hashtags.join(' '));
  return zeilen.join('\n').trim();
}

export default function VideoSkriptStudio() {
  const [thema, setThema] = useState('');
  const [kanaele, setKanaele] = useState<string[]>(['instagram-reel', 'tiktok']);
  const [dauer, setDauer] = useState(30);
  const [firma, setFirma] = useState('');
  const [branche, setBranche] = useState('');
  const [ton, setTon] = useState('');

  const [generiere, setGeneriere] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [skripte, setSkripte] = useState<VideoSkript[]>([]);
  const [kopiert, setKopiert] = useState<string | null>(null);

  // CI-Vorbelegung aus dem eigenen Betrieb (best effort, still bei Fehler).
  const ladeCi = useCallback(async () => {
    try {
      const { data } = await supabase.from('web_ci').select('firma, branche').limit(1).maybeSingle();
      const r = data as { firma?: string | null; branche?: string | null } | null;
      if (r?.firma) setFirma(r.firma);
      if (r?.branche) setBranche(r.branche);
    } catch { /* egal — Felder bleiben leer */ }
  }, []);
  useEffect(() => { ladeCi(); }, [ladeCi]);

  function toggleKanal(id: string) {
    setKanaele((prev) => prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]);
  }

  async function generieren() {
    if (!thema.trim()) { setFehler('Bitte ein Thema / Ziel angeben.'); return; }
    if (kanaele.length === 0) { setFehler('Bitte mindestens einen Video-Kanal auswählen.'); return; }
    setGeneriere(true); setFehler(null); setSkripte([]); setKopiert(null);
    try {
      const res = await fetch('/api/marketing/video-skript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thema, kanaele, dauer, firma, branche, ton }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) { setFehler(data?.error ?? 'Generierung fehlgeschlagen.'); setGeneriere(false); return; }
      setSkripte((data.skripte ?? []) as VideoSkript[]);
    } catch {
      setFehler('Netzwerkfehler. Bitte erneut versuchen.');
    }
    setGeneriere(false);
  }

  async function kopiere(text: string, marke: string) {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(marke);
      setTimeout(() => setKopiert((m) => (m === marke ? null : m)), 1800);
    } catch { /* Zwischenablage nicht verfügbar — still */ }
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <a href="/dashboard/marketing" style={{ color: C.cyan, fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(14px, 1.25vw, 20px)', textDecoration: 'none' }}>
          ← Zurück zu Marketing
        </a>

        <div style={{ margin: '16px 0 24px' }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 700, color: C.gold, margin: 0 }}>🎬 Video-Skript-Studio</h1>
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '6px 0 0', fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
            Ein Thema — fertige Kurzvideo-Skripte je Kanal: Hook, Shotlist, Untertitel und Call-to-Action. Sie drehen, wir schreiben.
          </p>
        </div>

        {/* Briefing-Karte */}
        <div style={{ background: C.navy2, borderRadius: 16, padding: '26px 28px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 28 }}>
          <Feld label="Thema / Anlass *">
            <textarea
              value={thema}
              onChange={(e) => setThema(e.target.value)}
              rows={2}
              placeholder="z. B. Herbst-Aktion: professionelle Dachreinigung, jetzt Termin sichern"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Feld>

          {/* Kanäle */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)', color: C.textDim, marginBottom: 8 }}>Video-Kanäle</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {VIDEO_KANAELE.map((k) => {
                const an = kanaele.includes(k.id);
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => toggleKanal(k.id)}
                    style={{
                      background: an ? 'rgba(0,229,255,0.14)' : 'transparent',
                      color: an ? C.cyan : C.textDim,
                      border: `1px solid ${an ? C.cyan : 'rgba(255,255,255,0.18)'}`,
                      borderRadius: 999, padding: '9px 16px', cursor: 'pointer',
                      fontFamily: 'DM Sans, sans-serif', fontWeight: 600,
                      fontSize: 'clamp(13px, 1.13vw, 18px)',
                    }}
                  >
                    {an ? '✓ ' : ''}{k.icon} {k.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Feld label="Ziel-Dauer">
              <select value={dauer} onChange={(e) => setDauer(Number(e.target.value))} style={inputStyle}>
                {DAUER_OPTS.map((d) => <option key={d} value={d}>{d} Sekunden</option>)}
              </select>
            </Feld>
            <Feld label="Grundton (optional)">
              <select value={ton} onChange={(e) => setTon(e.target.value)} style={inputStyle}>
                {TON_OPTS.map((t) => <option key={t || 'auto'} value={t}>{t || '— automatisch —'}</option>)}
              </select>
            </Feld>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Feld label="Firma (optional)">
              <input value={firma} onChange={(e) => setFirma(e.target.value)} placeholder="Ihr Betrieb" style={inputStyle} />
            </Feld>
            <Feld label="Branche (optional)">
              <input value={branche} onChange={(e) => setBranche(e.target.value)} placeholder="z. B. Dachdecker" style={inputStyle} />
            </Feld>
          </div>

          <button
            onClick={generieren}
            disabled={generiere}
            style={{
              marginTop: 8, background: C.gold, color: C.navy, border: 'none', borderRadius: 10,
              padding: '13px 28px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700,
              fontSize: 'clamp(15px, 1.31vw, 21px)', cursor: generiere ? 'wait' : 'pointer', opacity: generiere ? 0.7 : 1,
            }}
          >
            {generiere ? '🎬 KI schreibt…' : '🎬 Skripte generieren'}
          </button>

          {fehler && (
            <div style={{ marginTop: 16, background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, borderRadius: 10, padding: 14, color: C.danger, fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
              {fehler}
            </div>
          )}
        </div>

        {/* Skripte */}
        {skripte.length > 0 && (
          <div style={{ display: 'grid', gap: 18 }}>
            {skripte.map((s) => (
              <div key={s.kanal} style={{ background: C.navy2, borderRadius: 14, padding: '22px 24px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, color: '#fff', fontSize: 'clamp(18px, 1.6vw, 25px)' }}>
                    {s.icon} {s.name}
                  </span>
                  <span style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(12px, 1.05vw, 16px)' }}>
                    {s.format} · ~{s.dauerSekunden} Sek.
                  </span>
                </div>

                {s.hook && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: C.cyan, fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1vw, 15px)', fontWeight: 600, marginBottom: 4 }}>HOOK · erste 3 Sek.</div>
                    <div style={{ color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 600 }}>{s.hook}</div>
                  </div>
                )}

                {s.szenen.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: C.gold, fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1vw, 15px)', fontWeight: 600, marginBottom: 8 }}>SHOTLIST</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {s.szenen.map((sz, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#0c1b31', borderRadius: 10, padding: '10px 14px' }}>
                          <span style={{ color: C.cyan, fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 'clamp(12px, 1.05vw, 16px)', minWidth: 56 }}>{sz.zeit || `#${i + 1}`}</span>
                          <span style={{ flex: 1, color: '#dfe8f5', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
                            {sz.bild && <span style={{ color: C.textDim }}>🎥 {sz.bild}<br /></span>}
                            {sz.text && <span>{sz.text}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {s.onScreenText.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: C.gold, fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1vw, 15px)', fontWeight: 600, marginBottom: 8 }}>EINBLENDUNGEN</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {s.onScreenText.map((t, i) => (
                        <span key={i} style={{ background: 'rgba(201,168,76,0.12)', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 8, padding: '5px 11px', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1.05vw, 16px)' }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {s.untertitel && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: C.green, fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(12px, 1vw, 15px)', fontWeight: 600, marginBottom: 4 }}>UNTERTITEL / SPRECHERTEXT</div>
                    <div style={{ color: '#dfe8f5', fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(14px, 1.19vw, 19px)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{s.untertitel}</div>
                  </div>
                )}

                {s.cta && (
                  <div style={{ marginBottom: 14 }}>
                    <span style={{ color: C.warn, fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 'clamp(14px, 1.19vw, 19px)' }}>➡ {s.cta}</span>
                  </div>
                )}

                {s.hashtags.length > 0 && (
                  <div style={{ marginBottom: 14, color: C.cyan, fontFamily: 'DM Sans, sans-serif', fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
                    {s.hashtags.join(' ')}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
                  <button
                    onClick={() => kopiere(skriptAlsText(s), 'voll-' + s.kanal)}
                    style={{ background: 'transparent', color: C.green, border: `1px solid ${C.green}`, borderRadius: 9, padding: '9px 16px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(13px, 1.13vw, 18px)', cursor: 'pointer' }}
                  >
                    {kopiert === 'voll-' + s.kanal ? '✓ Kopiert' : '📋 Ganzes Skript kopieren'}
                  </button>
                  {s.untertitel && (
                    <button
                      onClick={() => kopiere(s.untertitel, 'ut-' + s.kanal)}
                      style={{ background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 9, padding: '9px 16px', fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 700, fontSize: 'clamp(13px, 1.13vw, 18px)', cursor: 'pointer' }}
                    >
                      {kopiert === 'ut-' + s.kanal ? '✓ Kopiert' : '📝 Nur Untertitel kopieren'}
                    </button>
                  )}
                </div>
              </div>
            ))}

            <p style={{ fontFamily: 'DM Sans, sans-serif', color: C.textDim, fontSize: 'clamp(12px, 1.05vw, 16px)', margin: '4px 0 0' }}>
              Hinweis: Diese Skripte sind der drehreife Text. Die automatische Video-Erzeugung (Avatar & Stimme) folgt in einem späteren Ausbauschritt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
