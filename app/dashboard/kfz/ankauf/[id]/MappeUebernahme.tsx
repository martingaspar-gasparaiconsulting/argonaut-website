'use client';

// ============================================================
// ARGONAUT OS · Paket 307 · FM3 — „In die Fahrzeugakte übernehmen"
// Teil der Karte „📁 Fahrzeugmappe" in der Ankaufsakte, sobald das Fahrzeug
// angekauft und im Bestand ist. Der Händler hakt an, welche Fotos und Videos
// in die Medien der Fahrzeugakte kopiert werden (vorgewählt: alle
// Fahrzeugfotos; Schäden, Rundgang und Kaltstart auf Wunsch). Fahrzeugschein,
// Unterlagen und Videobotschaft stehen gar nicht zur Wahl.
// Kopiert über /api/kfz/fahrzeugmappe/uebernehmen (Login, Schreibrecht KFZ).
// ============================================================

import { useMemo, useState, type CSSProperties } from 'react';
import { fachZu, istVideo } from '@/lib/fahrzeugMappe';
import { UEBERNAHME_FAECHER, darfUebernommenWerden } from '@/lib/fahrzeugMappeBestand';

const C = { navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', bad: '#E06666' };

type Datei = { id: string; fach: string; mime: string; url: string | null; beschreibung: string | null };

export default function MappeUebernahme({ ankaufId, bestandId, dateien, uebernommen, onFertig }: {
  ankaufId: string; bestandId: string; dateien: Datei[]; uebernommen: string[]; onFertig: () => void;
}) {
  const reihe = useMemo(() => new Map(UEBERNAHME_FAECHER.map((f, i) => [f.key, i])), []);
  const waehlbar = useMemo(() => dateien.filter((d) => darfUebernommenWerden(d.fach))
    .sort((a, b) => (reihe.get(a.fach) ?? 99) - (reihe.get(b.fach) ?? 99)), [dateien, reihe]);
  const da = useMemo(() => new Set(uebernommen.map((x) => x.toLowerCase())), [uebernommen]);
  const offen = waehlbar.filter((d) => !da.has(d.id.toLowerCase()));
  const [auswahl, setAuswahl] = useState<string[]>(() => offen.filter((d) => UEBERNAHME_FAECHER.find((f) => f.key === d.fach)?.vorgewaehlt).map((d) => d.id));
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  if (!waehlbar.length) return null;

  async function uebernehmen() {
    setBusy(true); setMeldung(null);
    try {
      const r = await fetch('/api/kfz/fahrzeugmappe/uebernehmen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ankauf: ankaufId, ids: auswahl }) });
      const j = await r.json().catch(() => ({}));
      setMeldung({ ok: r.ok, text: String(j.text ?? j.error ?? (r.ok ? 'Übernommen.' : 'Übernehmen hat nicht geklappt.')) });
      if (r.ok) { setAuswahl([]); onFertig(); }
    } catch { setMeldung({ ok: false, text: 'Keine Verbindung.' }); } finally { setBusy(false); }
  }

  return (
    <div style={s.box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800, color: C.text }}>🚘 In die Fahrzeugakte übernehmen</div>
          <div style={s.dim}>{da.size ? `${da.size} schon übernommen · ` : ''}{offen.length} zur Auswahl. Fahrzeugschein, Unterlagen und die Videobotschaft bleiben in der Mappe.</div>
        </div>
        <a href={`/dashboard/kfz/bestand/${bestandId}`} style={s.link}>Zur Fahrzeugakte →</a>
      </div>
      {offen.length > 0 && (
        <>
          <div style={s.raster}>
            {offen.map((d) => {
              const an = auswahl.includes(d.id);
              return (
                <label key={d.id} style={{ ...s.kachel, borderColor: an ? C.gold : C.border }}>
                  <div style={s.bild}>
                    {d.url && !istVideo(d.mime) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.url} alt="" style={s.img} loading="lazy" />}
                    {d.url && istVideo(d.mime) && <video src={d.url} muted playsInline preload="metadata" style={s.img} />}
                    <input type="checkbox" checked={an} style={s.haken} aria-label={fachZu(d.fach)?.titel ?? d.fach}
                      onChange={(e) => setAuswahl((a) => (e.target.checked ? [...a, d.id] : a.filter((x) => x !== d.id)))} />
                  </div>
                  <div style={{ padding: '5px 8px', fontSize: 12, color: C.text }}>{fachZu(d.fach)?.titel ?? d.fach}{istVideo(d.mime) ? ' · Video' : ''}</div>
                </label>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
            <button style={{ ...s.gold, opacity: busy || !auswahl.length ? 0.6 : 1 }} disabled={busy || !auswahl.length} onClick={() => void uebernehmen()}>
              {busy ? 'Kopiert …' : `${auswahl.length} übernehmen`}
            </button>
            <button style={s.btn} onClick={() => setAuswahl(offen.map((d) => d.id))}>Alle</button>
            <button style={s.btn} onClick={() => setAuswahl([])}>Keine</button>
          </div>
        </>
      )}
      {meldung && <div style={{ ...s.dim, color: meldung.ok ? C.ok : C.bad, marginTop: 8 }}>{meldung.text}</div>}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  box: { marginTop: 14, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 },
  dim: { color: C.dim, fontSize: 13, lineHeight: 1.5 },
  link: { color: C.gold, fontWeight: 700, fontSize: 13.5, textDecoration: 'none' },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginTop: 10 },
  kachel: { border: '2px solid', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: '#0B1220', display: 'flex', flexDirection: 'column' },
  bild: { position: 'relative', aspectRatio: '4 / 3', display: 'grid', placeItems: 'center' },
  img: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  haken: { position: 'absolute', top: 6, left: 6, width: 20, height: 20 },
  gold: { background: C.gold, color: '#0A1628', border: 0, borderRadius: 8, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 13.5 },
  btn: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13.5 },
};
