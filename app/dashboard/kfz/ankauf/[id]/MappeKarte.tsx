'use client';

// ============================================================
// ARGONAUT OS · Paket 305 · FM1 — Karte „📁 Fahrzeugmappe" in der Ankaufsakte
// Zeigt, was der Verkäufer geschickt hat: Fahrzeugschein, Fotos, Schäden,
// Videos, Unterlagen — gruppiert, mit Schärfe-Hinweis, groß ansehen mit
// Blättern, Herunterladen. Daten über /api/kfz/fahrzeugmappe (Login; die
// Datenbank entscheidet, wer sehen darf; Links 1 Stunde gültig).
// Ohne Mappe (alter Formular-Eingang, Hof, Telefon) zeigt die Karte nichts.
// ============================================================

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { FAECHER, GRUPPEN, bildUrteil, fachZu, istBild, istPdf, istVideo, mbText, vollstaendigkeit, wunschText } from '@/lib/fahrzeugMappe';

const C = { navy: '#0A1628', navy2: '#0F2036', navy3: '#14294A', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };

type Datei = { id: string; fach: string; art: string; mime: string; bytes: number | null; dateiname: string | null; beschreibung: string | null; pruefung: { schaerfe?: number; helligkeit?: number }; url: string | null };
type Mappe = { id: string; status: string; wunsch: string | null; eingereicht_am: string | null; einwilligung_am: string | null; einwilligung_fassung: string | null };

function zeit(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MappeKarte({ ankaufId }: { ankaufId: string }) {
  const [mappe, setMappe] = useState<Mappe | null>(null);
  const [dateien, setDateien] = useState<Datei[]>([]);
  const [stand, setStand] = useState<'laedt' | 'da' | 'keine' | 'fehler'>('laedt');
  const [gross, setGross] = useState<number | null>(null);

  const laden = useCallback(async () => {
    try {
      const r = await fetch(`/api/kfz/fahrzeugmappe?ankauf=${ankaufId}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setStand('fehler'); return; }
      if (!j.mappe) { setStand('keine'); return; }
      setMappe(j.mappe as Mappe);
      setDateien((j.dateien as Datei[]) ?? []);
      setStand('da');
    } catch { setStand('fehler'); }
  }, [ankaufId]);

  useEffect(() => { void laden(); }, [laden]);

  // Reihenfolge wie beim Verkäufer: Fach-Reihenfolge, darin nach Eingang
  const sortiert = useMemo(() => {
    const pos = new Map(FAECHER.map((f, i) => [f.key, i]));
    return [...dateien].sort((x, y) => (pos.get(x.fach) ?? 99) - (pos.get(y.fach) ?? 99));
  }, [dateien]);

  useEffect(() => {
    if (gross === null) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGross(null);
      if (e.key === 'ArrowRight') setGross((g) => (g === null ? g : Math.min(sortiert.length - 1, g + 1)));
      if (e.key === 'ArrowLeft') setGross((g) => (g === null ? g : Math.max(0, g - 1)));
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [gross, sortiert.length]);

  if (stand === 'keine' || stand === 'laedt') return null;
  if (stand === 'fehler') return <div style={s.karte}><div style={s.dim}>Die Fahrzeugmappe konnte nicht geladen werden. <button style={s.link} onClick={() => void laden()}>Neu laden</button></div></div>;
  if (!mappe) return null;

  const voll = vollstaendigkeit(dateien.map((d) => ({ fach: d.fach })));
  const unscharf = dateien.filter((d) => { const u = bildUrteil(d.pruefung?.schaerfe !== undefined && d.pruefung?.helligkeit !== undefined ? { schaerfe: d.pruefung.schaerfe, helligkeit: d.pruefung.helligkeit } : null); return u && u.stufe !== 'gut'; }).length;
  const akt = gross !== null ? sortiert[gross] : null;

  return (
    <div style={s.karte}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3 style={s.h3}>📁 Fahrzeugmappe des Verkäufers</h3>
          <div style={s.dim}>Wunsch: <b style={{ color: C.text }}>{wunschText(mappe.wunsch)}</b> · eingereicht {zeit(mappe.eingereicht_am)} · Einwilligung {zeit(mappe.einwilligung_am)}{mappe.einwilligung_fassung ? ` (Fassung ${mappe.einwilligung_fassung})` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ ...s.pill, color: voll.fehlend.length ? C.warn : C.ok }}>{voll.erledigt} von {voll.pflicht} Pflichtteilen</span>
          {unscharf > 0 && <span style={{ ...s.pill, color: C.warn }}>{unscharf} Foto{unscharf === 1 ? '' : 's'} evtl. unscharf/dunkel</span>}
        </div>
      </div>

      {GRUPPEN.map((g) => {
        const liste = sortiert.filter((d) => fachZu(d.fach)?.gruppe === g.key);
        if (!liste.length) return null;
        return (
          <div key={g.key} style={{ marginTop: 14 }}>
            <div style={s.lab}>{g.titel} ({liste.length})</div>
            <div style={s.raster}>
              {liste.map((d) => {
                const i = sortiert.indexOf(d);
                const f = fachZu(d.fach);
                const u = bildUrteil(d.pruefung?.schaerfe !== undefined && d.pruefung?.helligkeit !== undefined ? { schaerfe: d.pruefung.schaerfe, helligkeit: d.pruefung.helligkeit } : null);
                return (
                  <button key={d.id} style={s.kachel} onClick={() => setGross(i)} title={f?.titel}>
                    <div style={s.bild}>
                      {d.url && istBild(d.mime) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.url} alt="" style={s.img} loading="lazy" />}
                      {d.url && istVideo(d.mime) && <video src={d.url} muted playsInline preload="metadata" style={s.img} />}
                      {(!d.url || istPdf(d.mime)) && <div style={{ fontSize: 26 }}>📄</div>}
                      {istVideo(d.mime) && <span style={s.ecke}>▶ Video</span>}
                    </div>
                    <div style={s.unter}>
                      <div style={{ fontWeight: 700, fontSize: 12.5, color: C.text }}>{f?.titel ?? d.fach}</div>
                      {d.beschreibung && <div style={{ fontSize: 12, color: C.text }}>{d.beschreibung}</div>}
                      {u && u.stufe !== 'gut' && <div style={{ fontSize: 11.5, color: C.warn }}>⚠ {u.text.split('.')[0]}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ ...s.dim, marginTop: 12 }}>Alle Angaben, Fotos und Unterlagen stammen vom Verkäufer — bitte bei der Besichtigung prüfen. Ein Angebot ohne Besichtigung immer nur unter Vorbehalt.</div>

      {akt && gross !== null && (
        <div style={s.overlay} role="dialog" aria-modal="true" onClick={() => setGross(null)}>
          <div style={s.gross} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800 }}>{fachZu(akt.fach)?.titel ?? akt.fach} <span style={s.dim}>· {gross + 1} von {sortiert.length}</span></div>
                {akt.beschreibung && <div style={s.dim}>{akt.beschreibung}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {akt.url && <a href={akt.url} target="_blank" rel="noopener noreferrer" style={{ ...s.btn, textDecoration: 'none' }}>⬇ Öffnen{akt.bytes ? ` (${mbText(akt.bytes)})` : ''}</a>}
                <button style={s.btn} onClick={() => setGross(null)}>✕</button>
              </div>
            </div>
            <div style={s.buehne}>
              {akt.url && istBild(akt.mime) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={akt.url} alt="" style={s.voll} />}
              {akt.url && istVideo(akt.mime) && <video src={akt.url} controls autoPlay playsInline style={s.voll} />}
              {istPdf(akt.mime) && akt.url && <iframe src={akt.url} title="PDF" style={{ width: '100%', height: '70vh', border: 0, background: '#fff' }} />}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button style={s.btn} disabled={gross === 0} onClick={() => setGross(Math.max(0, gross - 1))}>← Zurück</button>
              <button style={s.btn} disabled={gross >= sortiert.length - 1} onClick={() => setGross(Math.min(sortiert.length - 1, gross + 1))}>Weiter →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  karte: { background: C.navy3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, margin: '10px 0' },
  h3: { margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: C.text },
  dim: { color: C.dim, fontSize: 13, lineHeight: 1.5 },
  lab: { color: C.dim, fontSize: 12, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' },
  pill: { border: `1px solid ${C.border}`, borderRadius: 999, padding: '5px 11px', fontSize: 12.5, fontWeight: 700 },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 },
  kachel: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 0, overflow: 'hidden', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column' },
  bild: { position: 'relative', aspectRatio: '4 / 3', background: '#0B1220', display: 'grid', placeItems: 'center', overflow: 'hidden' },
  img: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  ecke: { position: 'absolute', right: 6, bottom: 6, background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 },
  unter: { padding: '7px 9px', display: 'grid', gap: 2 },
  link: { background: 'none', border: 0, color: C.gold, cursor: 'pointer', padding: 0, fontWeight: 700 },
  btn: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13.5 },
  overlay: { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(5,10,20,0.82)', display: 'grid', placeItems: 'center', padding: 12 },
  gross: { width: 'min(1100px, 100%)', maxHeight: '100%', overflow: 'auto', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, display: 'grid', gap: 12, color: C.text },
  buehne: { background: '#000', borderRadius: 10, display: 'grid', placeItems: 'center', minHeight: 240, overflow: 'hidden' },
  voll: { maxWidth: '100%', maxHeight: '72vh', display: 'block' },
};
