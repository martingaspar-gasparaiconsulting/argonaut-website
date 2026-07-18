'use client';

// ============================================================
// ARGONAUT OS · Bündel 4 · Bau & Handwerk Teil 2 — Baustellen-Doku
// Zwei Werkzeuge je Baustelle (Projekt):
//   (1) BAUTAGEBUCH / REGIEBERICHT — Tageseinträge mit Wetter, Mannschaft,
//       geleisteten Arbeiten, Material, Vorkommnissen + Fotodokumentation.
//   (2) MÄNGEL- & ABNAHME — Mängelliste mit Status offen -> in Arbeit ->
//       behoben -> abgenommen, mit Frist.
// Angedockt an Projekte. Fotos im privaten Bucket 'baustellen-fotos'.
// Pfad: app/dashboard/bautagebuch/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

type Projekt = { id: string; name: string | null };
type Eintrag = {
  id: string; projekt_id: string | null; datum: string; wetter: string | null;
  temperatur: string | null; anwesende: string | null; arbeiten: string | null;
  material: string | null; vorkommnisse: string | null; erstellt_am: string;
};
type Foto = { id: string; bautagebuch_id: string | null; pfad: string; dateiname: string | null };
type Mangel = {
  id: string; projekt_id: string | null; titel: string; beschreibung: string | null;
  status: string; frist: string | null; erstellt_am: string; erledigt_am: string | null;
};

const MANGEL_STATUS: { wert: string; label: string; farbe: string }[] = [
  { wert: 'offen', label: 'Offen', farbe: C.danger },
  { wert: 'in_arbeit', label: 'In Arbeit', farbe: C.warn },
  { wert: 'behoben', label: 'Behoben', farbe: C.cyan },
  { wert: 'abgenommen', label: 'Abgenommen', farbe: C.green },
];
function mangelInfo(s: string) { return MANGEL_STATUS.find((x) => x.wert === s) ?? { wert: s, label: s, farbe: C.textDim }; }
function naechsterMangelStatus(s: string): string | null {
  const i = MANGEL_STATUS.findIndex((x) => x.wert === s);
  return i >= 0 && i < MANGEL_STATUS.length - 1 ? MANGEL_STATUS[i + 1].wert : null;
}

function heute() { return new Date().toISOString().slice(0, 10); }
function datumHuebsch(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

const LEER_EINTRAG = { datum: heute(), wetter: '', temperatur: '', anwesende: '', arbeiten: '', material: '', vorkommnisse: '' };
const LEER_MANGEL = { titel: '', beschreibung: '', frist: '' };

export default function BautagebuchPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [projektId, setProjektId] = useState<string>('');
  const [tab, setTab] = useState<'tagebuch' | 'maengel'>('tagebuch');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [maengel, setMaengel] = useState<Mangel[]>([]);

  const [eintragModal, setEintragModal] = useState(false);
  const [eintragForm, setEintragForm] = useState({ ...LEER_EINTRAG });
  const [eintragBusy, setEintragBusy] = useState(false);
  const [fotoBusy, setFotoBusy] = useState<string | null>(null);

  const [mangelModal, setMangelModal] = useState(false);
  const [mangelForm, setMangelForm] = useState({ ...LEER_MANGEL });
  const [mangelBusy, setMangelBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      const { data: pr } = await supabase.from('projekte').select('id, name').eq('archiviert', false).order('name', { ascending: true });
      const liste = (pr as Projekt[]) ?? [];
      setProjekte(liste);
      if (liste.length) setProjektId(liste[0].id);
      setLaden(false);
    })();
  }, []);

  const laden_ = useCallback(async () => {
    if (!projektId) { setEintraege([]); setMaengel([]); setFotos([]); setFotoUrls({}); return; }
    setFehler(null);
    try {
      const [eRes, mRes] = await Promise.all([
        supabase.from('bautagebuch').select('*').eq('projekt_id', projektId).order('datum', { ascending: false }),
        supabase.from('maengel').select('*').eq('projekt_id', projektId).order('erstellt_am', { ascending: false }),
      ]);
      if (eRes.error) throw eRes.error;
      if (mRes.error) throw mRes.error;
      const ein = (eRes.data as Eintrag[]) ?? [];
      setEintraege(ein);
      setMaengel((mRes.data as Mangel[]) ?? []);

      const ids = ein.map((e) => e.id);
      if (ids.length) {
        const { data: fdata } = await supabase.from('baustellen_fotos').select('*').in('bautagebuch_id', ids).order('erstellt_am', { ascending: true });
        const frows = (fdata as Foto[]) ?? [];
        setFotos(frows);
        if (frows.length) {
          const { data: signed } = await supabase.storage.from('baustellen-fotos').createSignedUrls(frows.map((f) => f.pfad), 3600);
          const urls: Record<string, string> = {};
          if (signed) for (const s of signed) { if (s.signedUrl && s.path) urls[s.path] = s.signedUrl; }
          setFotoUrls(urls);
        } else setFotoUrls({});
      } else { setFotos([]); setFotoUrls({}); }
    } catch (e: unknown) {
      setFehler('Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }, [projektId]);

  useEffect(() => { void laden_(); }, [laden_]);

  const fotosNachEintrag = useMemo(() => {
    const m = new Map<string, Foto[]>();
    for (const f of fotos) { if (!f.bautagebuch_id) continue; const a = m.get(f.bautagebuch_id) ?? []; a.push(f); m.set(f.bautagebuch_id, a); }
    return m;
  }, [fotos]);

  // --- Bautagebuch-Eintrag anlegen --------------------------------------
  async function eintragSpeichern() {
    if (!uid || !projektId) { setFehler('Bitte zuerst ein Projekt wählen.'); return; }
    setEintragBusy(true); setFehler(null);
    try {
      const { error } = await supabase.from('bautagebuch').insert({
        owner_user_id: uid, projekt_id: projektId, erstellt_von: uid,
        datum: eintragForm.datum || heute(),
        wetter: eintragForm.wetter.trim() || null,
        temperatur: eintragForm.temperatur.trim() || null,
        anwesende: eintragForm.anwesende.trim() || null,
        arbeiten: eintragForm.arbeiten.trim() || null,
        material: eintragForm.material.trim() || null,
        vorkommnisse: eintragForm.vorkommnisse.trim() || null,
      });
      if (error) throw error;
      setEintragModal(false); setEintragForm({ ...LEER_EINTRAG });
      await laden_();
    } catch (e: unknown) {
      setFehler('Eintrag konnte nicht gespeichert werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setEintragBusy(false); }
  }

  // --- Foto zu einem Eintrag hochladen ----------------------------------
  async function fotoHochladen(e: Eintrag, file: File) {
    if (!uid) return;
    setFotoBusy(e.id); setFehler(null);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const pfad = `${uid}/${e.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('baustellen-fotos').upload(pfad, file, { upsert: false });
      if (upErr) throw upErr;
      const { error: refErr } = await supabase.from('baustellen_fotos').insert({
        owner_user_id: uid, bautagebuch_id: e.id, pfad, dateiname: file.name,
      });
      if (refErr) throw refErr;
      await laden_();
    } catch (err: unknown) {
      setFehler('Foto konnte nicht hochgeladen werden: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setFotoBusy(null); }
  }
  async function fotoLoeschen(f: Foto) {
    if (!window.confirm('Dieses Foto löschen?')) return;
    setFehler(null);
    try {
      const { error } = await supabase.from('baustellen_fotos').delete().eq('id', f.id);
      if (error) throw error;
      await supabase.storage.from('baustellen-fotos').remove([f.pfad]);
      await laden_();
    } catch (err: unknown) {
      setFehler('Foto konnte nicht gelöscht werden: ' + (err instanceof Error ? err.message : 'Fehler'));
    }
  }

  // --- Mängel ------------------------------------------------------------
  async function mangelSpeichern() {
    if (!uid || !projektId) { setFehler('Bitte zuerst ein Projekt wählen.'); return; }
    if (!mangelForm.titel.trim()) { setFehler('Bitte einen Titel für den Mangel angeben.'); return; }
    setMangelBusy(true); setFehler(null);
    try {
      const { error } = await supabase.from('maengel').insert({
        owner_user_id: uid, projekt_id: projektId,
        titel: mangelForm.titel.trim(), beschreibung: mangelForm.beschreibung.trim() || null,
        frist: mangelForm.frist || null, status: 'offen',
      });
      if (error) throw error;
      setMangelModal(false); setMangelForm({ ...LEER_MANGEL });
      await laden_();
    } catch (e: unknown) {
      setFehler('Mangel konnte nicht gespeichert werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setMangelBusy(false); }
  }
  async function mangelWeiter(m: Mangel) {
    const ziel = naechsterMangelStatus(m.status);
    if (!ziel) return;
    setFehler(null);
    try {
      const patch: Record<string, unknown> = { status: ziel };
      if (ziel === 'behoben' || ziel === 'abgenommen') patch.erledigt_am = new Date().toISOString();
      const { error } = await supabase.from('maengel').update(patch).eq('id', m.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) {
      setFehler('Status konnte nicht geändert werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }
  async function mangelLoeschen(m: Mangel) {
    if (!window.confirm(`Mangel „${m.titel}" löschen?`)) return;
    setFehler(null);
    try {
      const { error } = await supabase.from('maengel').delete().eq('id', m.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) {
      setFehler('Mangel konnte nicht gelöscht werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  const offeneMaengel = maengel.filter((m) => m.status !== 'abgenommen').length;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Baustelle</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Bautagebuch &amp; Mängel</h1>
          <p style={styles.sub}>Regieberichte, Fotodokumentation und Mängel-/Abnahmemanagement je Baustelle.</p>
        </div>
      </div>

      {/* Projekt-Auswahl */}
      <div style={styles.projektZeile}>
        <label style={styles.lbl}>Baustelle / Projekt</label>
        {projekte.length === 0 ? (
          <div style={styles.hint}>Noch keine Projekte. Lege zuerst unter <a href="/dashboard/projekte" style={{ color: C.cyan, fontWeight: 700 }}>Projekte</a> eine Baustelle an.</div>
        ) : (
          <select style={{ ...styles.input, maxWidth: 460 }} value={projektId} onChange={(e) => setProjektId(e.target.value)}>
            {projekte.map((p) => <option key={p.id} value={p.id}>{p.name || 'Projekt ohne Name'}</option>)}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button onClick={() => setTab('tagebuch')} style={tab === 'tagebuch' ? styles.tabAktiv : styles.tab}>🏗 Bautagebuch</button>
        <button onClick={() => setTab('maengel')} style={tab === 'maengel' ? styles.tabAktiv : styles.tab}>
          ⚠️ Mängel{offeneMaengel > 0 ? ` (${offeneMaengel})` : ''}
        </button>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}

      {laden ? (
        <div style={styles.hint}>Lädt …</div>
      ) : !projektId ? null : tab === 'tagebuch' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => { setEintragForm({ ...LEER_EINTRAG }); setEintragModal(true); }} style={styles.primaerBtn}>+ Neuer Eintrag</button>
          </div>
          {eintraege.length === 0 ? (
            <div style={styles.card}><div style={styles.hint}>Noch kein Eintrag für diese Baustelle. Leg oben rechts den ersten Regiebericht an.</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {eintraege.map((e) => {
                const efotos = fotosNachEintrag.get(e.id) ?? [];
                return (
                  <div key={e.id} style={styles.card}>
                    <div style={styles.eintragKopf}>
                      <div style={{ fontWeight: 800, fontSize: 'clamp(16px, 1.38vw, 22px)' }}>📅 {datumHuebsch(e.datum)}</div>
                      <div style={{ display: 'flex', gap: 14, color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', flexWrap: 'wrap' }}>
                        {e.wetter && <span>🌤 {e.wetter}</span>}
                        {e.temperatur && <span>🌡 {e.temperatur}</span>}
                      </div>
                    </div>
                    {e.anwesende && <Zeile label="Mannschaft / Gewerke" wert={e.anwesende} />}
                    {e.arbeiten && <Zeile label="Geleistete Arbeiten" wert={e.arbeiten} />}
                    {e.material && <Zeile label="Material" wert={e.material} />}
                    {e.vorkommnisse && <Zeile label="Besondere Vorkommnisse" wert={e.vorkommnisse} />}

                    <div style={styles.fotoBereich}>
                      <div style={styles.fotoKopf}>
                        <span style={{ fontWeight: 700 }}>📷 Fotos {efotos.length > 0 ? `(${efotos.length})` : ''}</span>
                        <label style={{ ...styles.fotoAddBtn, opacity: fotoBusy === e.id ? 0.6 : 1 }}>
                          {fotoBusy === e.id ? 'Lädt …' : '+ Foto'}
                          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={fotoBusy === e.id}
                            onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void fotoHochladen(e, f); ev.target.value = ''; }} />
                        </label>
                      </div>
                      {efotos.length > 0 && (
                        <div style={styles.fotoGrid}>
                          {efotos.map((f) => (
                            <div key={f.id} style={styles.fotoThumb}>
                              {fotoUrls[f.pfad] ? (
                                <a href={fotoUrls[f.pfad]} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={fotoUrls[f.pfad]} alt={f.dateiname ?? 'Foto'} style={styles.fotoImg} />
                                </a>
                              ) : <div style={styles.fotoLaedt}>…</div>}
                              <button onClick={() => fotoLoeschen(f)} style={styles.fotoDel} title="Foto löschen">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => { setMangelForm({ ...LEER_MANGEL }); setMangelModal(true); }} style={styles.primaerBtn}>+ Neuer Mangel</button>
          </div>
          {maengel.length === 0 ? (
            <div style={styles.card}><div style={styles.hint}>Keine Mängel erfasst. Für diese Baustelle ist alles sauber. 👍</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {maengel.map((m) => {
                const mi = mangelInfo(m.status);
                const ziel = naechsterMangelStatus(m.status);
                return (
                  <div key={m.id} style={styles.card}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{m.titel}</div>
                        {m.beschreibung && <div style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', marginTop: 2 }}>{m.beschreibung}</div>}
                        {m.frist && <div style={{ color: C.warn, fontSize: 'clamp(12.5px, 1.13vw, 18px)', marginTop: 4 }}>Frist: {datumHuebsch(m.frist)}</div>}
                      </div>
                      <span style={{ ...styles.badge, color: mi.farbe, borderColor: mi.farbe }}>{mi.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      {ziel && (
                        <button onClick={() => mangelWeiter(m)} style={styles.miniBtn}>
                          → {mangelInfo(ziel).label} melden
                        </button>
                      )}
                      <button onClick={() => mangelLoeschen(m)} style={styles.miniBtnGhost}>Löschen</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal: neuer Bautagebuch-Eintrag */}
      {eintragModal && (
        <div style={styles.overlay} onClick={() => !eintragBusy && setEintragModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>Neuer Regiebericht</h2>
            <div style={styles.formGrid}>
              <Feld label="Datum"><input type="date" style={styles.input} value={eintragForm.datum} onChange={(e) => setEintragForm((f) => ({ ...f, datum: e.target.value }))} /></Feld>
              <Feld label="Wetter"><input style={styles.input} value={eintragForm.wetter} onChange={(e) => setEintragForm((f) => ({ ...f, wetter: e.target.value }))} placeholder="z. B. bewölkt, trocken" /></Feld>
              <Feld label="Temperatur"><input style={styles.input} value={eintragForm.temperatur} onChange={(e) => setEintragForm((f) => ({ ...f, temperatur: e.target.value }))} placeholder="z. B. 12 °C" /></Feld>
              <Feld label="Mannschaft / Gewerke" voll><input style={styles.input} value={eintragForm.anwesende} onChange={(e) => setEintragForm((f) => ({ ...f, anwesende: e.target.value }))} placeholder="wer war vor Ort" /></Feld>
              <Feld label="Geleistete Arbeiten" voll><textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} value={eintragForm.arbeiten} onChange={(e) => setEintragForm((f) => ({ ...f, arbeiten: e.target.value }))} /></Feld>
              <Feld label="Material" voll><textarea style={{ ...styles.input, minHeight: 44, resize: 'vertical' }} value={eintragForm.material} onChange={(e) => setEintragForm((f) => ({ ...f, material: e.target.value }))} /></Feld>
              <Feld label="Besondere Vorkommnisse / Behinderungen" voll><textarea style={{ ...styles.input, minHeight: 44, resize: 'vertical' }} value={eintragForm.vorkommnisse} onChange={(e) => setEintragForm((f) => ({ ...f, vorkommnisse: e.target.value }))} placeholder="Verzögerungen, Nachträge, Anweisungen …" /></Feld>
            </div>
            <div style={styles.modalAktionen}>
              <button onClick={() => setEintragModal(false)} disabled={eintragBusy} style={styles.ghostBtn}>Abbrechen</button>
              <button onClick={eintragSpeichern} disabled={eintragBusy} style={{ ...styles.primaerBtn, opacity: eintragBusy ? 0.6 : 1 }}>{eintragBusy ? 'Speichert …' : 'Eintrag speichern'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: neuer Mangel */}
      {mangelModal && (
        <div style={styles.overlay} onClick={() => !mangelBusy && setMangelModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>Neuer Mangel</h2>
            <div style={styles.formGrid}>
              <Feld label="Titel *" voll><input style={styles.input} value={mangelForm.titel} onChange={(e) => setMangelForm((f) => ({ ...f, titel: e.target.value }))} placeholder="z. B. Fuge Bad unvollständig" /></Feld>
              <Feld label="Beschreibung" voll><textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} value={mangelForm.beschreibung} onChange={(e) => setMangelForm((f) => ({ ...f, beschreibung: e.target.value }))} /></Feld>
              <Feld label="Frist zur Behebung"><input type="date" style={styles.input} value={mangelForm.frist} onChange={(e) => setMangelForm((f) => ({ ...f, frist: e.target.value }))} /></Feld>
            </div>
            <div style={styles.modalAktionen}>
              <button onClick={() => setMangelModal(false)} disabled={mangelBusy} style={styles.ghostBtn}>Abbrechen</button>
              <button onClick={mangelSpeichern} disabled={mangelBusy} style={{ ...styles.primaerBtn, opacity: mangelBusy ? 0.6 : 1 }}>{mangelBusy ? 'Speichert …' : 'Mangel anlegen'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Feld({ label, children, voll }: { label: string; children: React.ReactNode; voll?: boolean }) {
  return <div style={{ gridColumn: voll ? '1 / -1' : 'auto' }}><label style={styles.lbl}>{label}</label>{children}</div>;
}
function Zeile({ label, wert }: { label: string; wert: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 'clamp(11.5px, 1vw, 16px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 'clamp(14px, 1.25vw, 20px)', color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{wert}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 680, lineHeight: 1.5 },

  projektZeile: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 14 },
  tabs: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tab: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit', cursor: 'pointer' },
  tabAktiv: { background: 'rgba(201,168,76,0.12)', color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },

  primaerBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit', cursor: 'pointer' },
  miniBtn: { background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 8, padding: '7px 12px', fontSize: 'clamp(13px, 1.13vw, 18px)', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 'clamp(13px, 1.13vw, 18px)', fontFamily: 'inherit', cursor: 'pointer' },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 },
  eintragKopf: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: `1px solid ${C.border}`, paddingBottom: 10, marginBottom: 4 },
  badge: { fontSize: 'clamp(12px, 1.06vw, 17px)', fontWeight: 700, border: '1px solid', borderRadius: 999, padding: '3px 12px', whiteSpace: 'nowrap' },

  fotoBereich: { marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 },
  fotoKopf: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 'clamp(14px, 1.25vw, 20px)' },
  fotoAddBtn: { background: C.navy, color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '8px 14px', fontSize: 'clamp(13.5px, 1.19vw, 19px)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  fotoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginTop: 10 },
  fotoThumb: { position: 'relative', aspectRatio: '1 / 1', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.navy },
  fotoImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  fotoLaedt: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim },
  fotoDel: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(10,22,40,0.8)', color: C.danger, fontSize: 'clamp(13px, 1.13vw, 18px)', cursor: 'pointer', lineHeight: 1, fontFamily: 'inherit' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 620, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 800, margin: '0 0 18px', color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  lbl: { display: 'block', fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit' },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 },

  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '14px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
};
