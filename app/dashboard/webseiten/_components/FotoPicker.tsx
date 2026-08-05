'use client';

// ============================================================
// ARGONAUT OS · W6 · FotoPicker — Bild auswählen
// Sucht Fotos über /api/fotos (Unsplash oder Fallback), zeigt ein Raster,
// erlaubt auch das Einfügen einer eigenen Bild-Adresse. Liefert die gewählte
// URL über onPick zurück.
// ============================================================

import { useState, useEffect, useCallback, CSSProperties, ChangeEvent } from 'react';

const C = {
  navy: '#0A1628', navy2: '#0F2036', navy3: '#0c1a2e', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.22)', danger: '#E06666',
};

type Foto = { url: string; thumb: string; autor: string; autorUrl: string; quelle: string };

export default function FotoPicker({ start, onPick, onClose }: { start?: string; onPick: (url: string) => void; onClose: () => void }) {
  const [q, setQ] = useState(start || 'business');
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [laden, setLaden] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [eigene, setEigene] = useState('');
  const [hochlaedt, setHochlaedt] = useState(false);

  const suchen = useCallback(async (begriff: string) => {
    setLaden(true); setHinweis(null);
    try {
      const res = await fetch(`/api/fotos?q=${encodeURIComponent(begriff)}`);
      const data = await res.json();
      setFotos(Array.isArray(data.fotos) ? data.fotos : []);
      if (data.hinweis) setHinweis(data.hinweis);
    } catch {
      setHinweis('Bildsuche fehlgeschlagen.');
    }
    setLaden(false);
  }, []);

  useEffect(() => { suchen(start || 'business'); }, [suchen, start]);

  // Eigenes Foto hochladen: Datei an die geschützte Route geben, gewählte URL
  // direkt übernehmen. Bild-Prüfung passiert zusätzlich serverseitig.
  async function hochladen(e: ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    e.target.value = '';
    if (!datei) return;
    if (datei.size > 8 * 1024 * 1024) { setHinweis('Das Bild ist zu groß (maximal 8 MB).'); return; }
    setHochlaedt(true); setHinweis(null);
    try {
      const fd = new FormData();
      fd.append('datei', datei);
      const res = await fetch('/api/webseite-foto', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.url) { onPick(data.url); return; }
      setHinweis(data?.error || 'Upload fehlgeschlagen.');
    } catch {
      setHinweis('Upload fehlgeschlagen. Bitte erneut versuchen.');
    }
    setHochlaedt(false);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.kopf}>
          <span style={styles.titel}>🖼️ Bild auswählen</span>
          <button style={styles.x} onClick={onClose}>✕</button>
        </div>

        <div style={styles.suchRow}>
          <input
            style={styles.input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') suchen(q); }}
            placeholder="z. B. Elektriker, Baustelle, Büro, Handwerk"
          />
          <button style={styles.btnGold} onClick={() => suchen(q)} disabled={laden}>{laden ? 'Sucht …' : 'Suchen'}</button>
        </div>

        {hinweis && <div style={styles.hinweis}>{hinweis}</div>}

        <div style={styles.grid}>
          {fotos.map((f, i) => (
            <button key={i} style={styles.kachel} title={`Foto von ${f.autor}`} onClick={() => onPick(f.url)}>
              <img src={f.thumb} alt="" style={styles.thumb} loading="lazy" />
              <span style={styles.autor}>{f.autor}</span>
            </button>
          ))}
          {!laden && fotos.length === 0 && <div style={styles.leer}>Keine Bilder gefunden.</div>}
        </div>

        <label style={styles.uploadRow}>
          <span style={styles.uploadBtn}>{hochlaedt ? 'Lädt hoch …' : '📤 Eigenes Foto hochladen'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={hochladen} disabled={hochlaedt} />
        </label>

        <div style={styles.eigeneRow}>
          <input
            style={styles.input}
            value={eigene}
            onChange={(e) => setEigene(e.target.value)}
            placeholder="Oder eigene Bild-Adresse einfügen (https://…)"
          />
          <button style={styles.btnGhost} onClick={() => { const u = eigene.trim(); if (/^https?:\/\//i.test(u)) onPick(u); }}>Einfügen</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(5,10,20,0.72)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflow: 'auto' },
  panel: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 12, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  kopf: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  titel: { fontWeight: 800, fontSize: 'clamp(16px,1.4vw,22px)', fontFamily: 'var(--font-syne), sans-serif' },
  x: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontWeight: 800, cursor: 'pointer' },
  suchRow: { display: 'flex', gap: 8 },
  input: { flex: 1, background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', fontSize: 'clamp(13px,1.1vw,17px)', fontFamily: 'inherit', boxSizing: 'border-box', minWidth: 0 },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '10px 18px', fontWeight: 800, fontSize: 'clamp(13px,1.1vw,17px)', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnGhost: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}55`, borderRadius: 9, padding: '10px 16px', fontWeight: 700, fontSize: 'clamp(13px,1.1vw,17px)', cursor: 'pointer', whiteSpace: 'nowrap' },
  hinweis: { fontSize: 'clamp(11px,0.95vw,14px)', color: C.textDim, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 8, padding: '8px 11px', lineHeight: 1.5 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, maxHeight: '46vh', overflow: 'auto' },
  kachel: { position: 'relative', padding: 0, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: C.navy, aspectRatio: '4/3' },
  thumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  autor: { position: 'absolute', left: 0, right: 0, bottom: 0, fontSize: 10, color: '#fff', background: 'linear-gradient(transparent, rgba(0,0,0,.7))', padding: '10px 6px 4px', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  leer: { color: C.textDim, gridColumn: '1 / -1', padding: 20, textAlign: 'center' },
  uploadRow: { display: 'flex', borderTop: `1px solid ${C.border}`, paddingTop: 12 },
  uploadBtn: { display: 'inline-block', width: '100%', textAlign: 'center', background: `${C.gold}14`, color: C.gold, border: `1px dashed ${C.gold}66`, borderRadius: 9, padding: '11px 16px', fontWeight: 800, fontSize: 'clamp(13px,1.1vw,17px)', cursor: 'pointer' },
  eigeneRow: { display: 'flex', gap: 8, paddingTop: 12 },
};
