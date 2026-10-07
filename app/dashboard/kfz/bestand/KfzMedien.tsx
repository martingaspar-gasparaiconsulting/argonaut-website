'use client';

// ============================================================
// ARGONAUT OS · Paket 262 · K3 Fotos und Medien (Reiter in der Handelsakte)
// Aufnahme-Schablone mit 14 Ansichten (Handy: Kamera öffnet direkt), weitere
// Fotos, ein Video, Reihenfolge per Ziehen (Desktop) oder Pfeilen (Handy).
// Fotos werden im Browser verkleinert (lib/bildKlein, WebP), Speicherordner
// „fahrzeug-medien", Pfad <Betrieb>/<Fahrzeug>/… (Speicher-Wächter zählt mit).
// Andockpunkt K4: Schäden am Foto markieren (Foto-Markierung wie Bautagebuch).
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { verkleinereBild } from '@/lib/bildKlein';
import { SCHABLONE, MEDIEN_BUCKET, schabloneStand, pruefeMedium, medienPfad, endungFuer, verschieben, sortiert } from '@/lib/kfzMedien';

type Medium = { id: string; art: string; pfad: string; schablone: string | null; position: number; dateiname: string | null; url?: string };

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = { navy: '#0A1628', navy2: '#0F2036', navy3: '#14294A', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };

export default function KfzMedien({ bestandId, betrieb, onAnzahl }: {
  bestandId: string; betrieb: string; onAnzahl?: (fotos: number) => void;
}) {
  const [medien, setMedien] = useState<Medium[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ziehe, setZiehe] = useState<number | null>(null);
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null);

  const lade = useCallback(async () => {
    const { data, error } = await supabase.from('kfz_bestand_medien').select('id, art, pfad, schablone, position, dateiname').eq('bestand_id', bestandId);
    if (error) { setFehler('Fotos lassen sich nicht laden. Ist SQL Paket 262 ausgeführt?'); return; }
    const rows = sortiert(((data as unknown) as Medium[]) ?? []);
    if (rows.length) {
      const { data: urls } = await supabase.storage.from(MEDIEN_BUCKET).createSignedUrls(rows.map((m) => m.pfad), 3600);
      const map = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
      rows.forEach((m) => { m.url = map.get(m.pfad) ?? undefined; });
    }
    setMedien(rows);
    onAnzahl?.(rows.filter((m) => m.art === 'foto').length);
  }, [bestandId, onAnzahl]);

  useEffect(() => { void lade(); }, [lade]);

  async function hochladen(art: 'foto' | 'video', dateien: FileList | null, schablone: string | null) {
    if (!dateien || !dateien.length) return;
    setFehler(null);
    const liste = Array.from(dateien).slice(0, art === 'video' ? 1 : 30);
    let pos = medien.reduce((m, x) => Math.max(m, x.position), 0);
    for (const datei of liste) {
      const p = pruefeMedium(art, datei.name, datei.type, datei.size);
      if (!p.ok) { setFehler(`${datei.name}: ${p.fehler}`); continue; }
      setBusy(schablone ?? art);
      try {
        const blob: Blob = art === 'foto' ? await verkleinereBild(datei, 2400, 0.85) : datei;
        const typ = blob.type || datei.type || (art === 'foto' ? 'image/jpeg' : 'video/mp4');
        const pfad = medienPfad(betrieb, bestandId, endungFuer(typ, datei.name), Date.now(), Math.random().toString(36).slice(2));
        if (!pfad) throw new Error('Ablageort ungültig.');
        const { error: upErr } = await supabase.storage.from(MEDIEN_BUCKET).upload(pfad, blob, { upsert: false, contentType: typ });
        if (upErr) throw new Error(/size|groß|large/i.test(upErr.message) ? 'Die Datei ist zu groß.' : 'Hochladen nicht erlaubt oder fehlgeschlagen (Schreibrecht „KFZ"?).');
        pos += 1;
        const { error: refErr } = await supabase.from('kfz_bestand_medien').insert({
          owner_user_id: betrieb, bestand_id: bestandId, art, pfad, schablone, position: pos, dateiname: datei.name.slice(0, 120), bytes: blob.size,
        });
        if (refErr) { await supabase.storage.from(MEDIEN_BUCKET).remove([pfad]); throw new Error('Speichern fehlgeschlagen.'); }
      } catch (e) {
        setFehler(`${datei.name}: ${e instanceof Error ? e.message : 'Fehler beim Hochladen.'}`);
      }
    }
    setBusy(null);
    await lade();
  }

  async function reihenfolge(von: number, nach: number) {
    const neu = verschieben(medien, von, nach);
    setMedien((m) => sortiert(m.map((x) => ({ ...x, position: neu.find((n) => n.id === x.id)?.position ?? x.position }))));
    for (const n of neu) {
      const alt = medien.find((x) => x.id === n.id);
      if (alt && alt.position !== n.position) await supabase.from('kfz_bestand_medien').update({ position: n.position }).eq('id', n.id);
    }
    await lade();
  }

  async function loeschen(m: Medium) {
    setLoeschFrage(null); setFehler(null);
    const { error } = await supabase.from('kfz_bestand_medien').delete().eq('id', m.id);
    if (error) { setFehler('Löschen nicht erlaubt (Schreibrecht „KFZ"?).'); return; }
    await supabase.storage.from(MEDIEN_BUCKET).remove([m.pfad]);
    await lade();
  }

  const stand = schabloneStand(medien);
  const fotos = medien.filter((m) => m.art === 'foto');
  const video = medien.find((m) => m.art === 'video');

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}

      <div style={s.karte}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <h3 style={s.h3}>Aufnahme-Schablone</h3>
          <span style={{ color: stand.fehlt.length ? C.warn : C.ok, fontSize: 13.5 }}>{stand.belegt.length} von {SCHABLONE.length} Ansichten</span>
        </div>
        <div style={s.dim}>Am Handy öffnet ein Tippen direkt die Kamera. Gleiche Höhe und ruhiger Hintergrund wirken am besten.</div>
        <div style={s.raster}>
          {SCHABLONE.map((sch) => {
            const m = fotos.find((f) => f.schablone === sch.key);
            return (
              <label key={sch.key} style={{ ...s.slot, borderColor: m ? C.ok : C.border }} title={sch.tipp}>
                {m?.url ? <img src={m.url} alt={sch.name} style={s.vorschau} /> : <div style={s.leer}>{busy === sch.key ? 'lädt …' : '＋'}</div>}
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{m ? '✓ ' : ''}{sch.name}</span>
                <span style={{ fontSize: 11.5, color: C.dim }}>{sch.tipp}</span>
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void hochladen('foto', e.target.files, sch.key); e.target.value = ''; }} />
              </label>
            );
          })}
        </div>
      </div>

      <div style={s.karte}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <h3 style={s.h3}>Alle Fotos in Inserats-Reihenfolge ({fotos.length})</h3>
          <label style={s.btn}>＋ Weitere Fotos<input type="file" accept="image/*" multiple hidden onChange={(e) => { void hochladen('foto', e.target.files, null); e.target.value = ''; }} /></label>
        </div>
        <div style={s.dim}>Das erste Foto ist das Titelbild. Ziehen Sie Fotos an die richtige Stelle oder nutzen Sie die Pfeile.</div>
        {busy === 'foto' && <div style={s.dim}>Fotos werden hochgeladen …</div>}
        <div style={s.galerie}>
          {fotos.map((m, i) => (
            <div key={m.id} style={{ ...s.bild, outline: ziehe === i ? `2px solid ${C.gold}` : 'none' }} draggable
              onDragStart={() => setZiehe(i)} onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (ziehe !== null && ziehe !== i) void reihenfolge(medien.indexOf(fotos[ziehe]), medien.indexOf(m)); setZiehe(null); }}>
              {m.url ? <img src={m.url} alt={m.dateiname ?? 'Fahrzeugfoto'} style={s.vorschau} /> : <div style={s.leer}>…</div>}
              <div style={s.leiste}>
                <span style={{ fontSize: 11.5 }}>{i === 0 ? '★ Titelbild' : `${i + 1}.`} {SCHABLONE.find((x) => x.key === m.schablone)?.name ?? ''}</span>
                <span>
                  <button style={s.mini} aria-label="nach vorn" disabled={i === 0} onClick={() => void reihenfolge(medien.indexOf(m), medien.indexOf(fotos[i - 1]))}>◀</button>
                  <button style={s.mini} aria-label="nach hinten" disabled={i === fotos.length - 1} onClick={() => void reihenfolge(medien.indexOf(m), medien.indexOf(fotos[i + 1]))}>▶</button>
                  {loeschFrage === m.id
                    ? <><button style={{ ...s.mini, color: C.bad }} onClick={() => void loeschen(m)}>Ja, weg</button><button style={s.mini} onClick={() => setLoeschFrage(null)}>Nein</button></>
                    : <button style={s.mini} aria-label="Foto löschen" onClick={() => setLoeschFrage(m.id)}>🗑</button>}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.karte}>
        <h3 style={s.h3}>Video</h3>
        {video ? (
          <div style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
            {video.url && <video src={video.url} controls style={{ width: '100%', borderRadius: 10, background: '#000' }} />}
            {loeschFrage === video.id
              ? <div><button style={{ ...s.btn, color: C.bad }} onClick={() => void loeschen(video)}>Ja, Video löschen</button> <button style={s.btn} onClick={() => setLoeschFrage(null)}>Nein</button></div>
              : <button style={{ ...s.btn, width: 'fit-content' }} onClick={() => setLoeschFrage(video.id)}>🗑 Video löschen</button>}
          </div>
        ) : (
          <label style={{ ...s.btn, width: 'fit-content' }}>{busy === 'video' ? 'Video wird hochgeladen …' : '＋ Video hochladen (bis 50 MB)'}<input type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => { void hochladen('video', e.target.files, null); e.target.value = ''; }} /></label>
        )}
        <div style={{ ...s.dim, marginTop: 6 }}>Tipp: 30 bis 60 Sekunden einmal ums Fahrzeug, dann innen. Querformat.</div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0 },
  h3: { margin: '0 0 6px', fontSize: 15, fontWeight: 800 },
  dim: { color: C.dim, fontSize: 13 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px' },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 12 },
  slot: { display: 'grid', gap: 4, border: '1px dashed', borderRadius: 10, padding: 8, cursor: 'pointer', background: C.navy, minWidth: 0 },
  leer: { aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', background: C.navy3, borderRadius: 8, color: C.gold, fontSize: 22, maxWidth: '100%' },
  vorschau: { width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8, display: 'block', maxWidth: '100%' },
  galerie: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginTop: 12 },
  bild: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: 6, display: 'grid', gap: 6, cursor: 'grab', minWidth: 0 },
  leiste: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, color: C.text },
  mini: { background: 'none', border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '2px 6px', marginLeft: 3, cursor: 'pointer', fontSize: 12 },
  btn: { background: C.navy3, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 14, display: 'inline-block' },
};
