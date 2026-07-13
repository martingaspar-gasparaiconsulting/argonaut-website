'use client';

// ============================================================
// ARGONAUT OS · Monteur-Handy „Meine Einsätze" (Field Service · Punkt 24)
// Mobil-first: der eingeloggte Monteur sieht seine Einsätze des Tages als
// große, fingerfreundliche Karten. Tap-to-Call (Kunden-Telefon) + Route-Link
// (Einsatzort → Google Maps). Tag vor/zurück blätterbar.
// NUR Anzeige — die Status-Knöpfe (unterwegs/vor Ort/erledigt) kommen in P25.
// Zuordnung Monteur = mitarbeiter.auth_user_id == eingeloggter Nutzer.
// Pfad: app/dashboard/meine-einsaetze/page.tsx
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

function statusInfo(s: string | null): { label: string; farbe: string } {
  switch (s ?? 'geplant') {
    case 'unterwegs': return { label: 'Unterwegs', farbe: C.cyan };
    case 'vor_ort':   return { label: 'Vor Ort', farbe: C.warn };
    case 'erledigt':  return { label: 'Erledigt', farbe: C.green };
    case 'abgesagt':  return { label: 'Abgesagt', farbe: C.danger };
    default:          return { label: 'Geplant', farbe: C.gold };
  }
}
function belegend(status: string | null): boolean {
  return (status ?? '').toLowerCase() !== 'abgesagt';
}

function pad(n: number) { return n < 10 ? '0' + n : String(n); }
function addDays(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function uhr(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function telLink(t: string) { return `tel:${t.replace(/[^\d+]/g, '')}`; }
function mapsLink(ort: string) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ort)}`; }

// Nächste Phase im Lebenszyklus: Geplant → Unterwegs → Vor Ort → Erledigt
function naechstePhase(status: string | null): { ziel: string; label: string; farbe: string } | null {
  switch (status ?? 'geplant') {
    case 'geplant':   return { ziel: 'unterwegs', label: '▶  Losfahren', farbe: C.cyan };
    case 'unterwegs': return { ziel: 'vor_ort',   label: '📍  Angekommen', farbe: C.warn };
    case 'vor_ort':   return { ziel: 'erledigt',  label: '✅  Erledigt melden', farbe: C.green };
    default:          return null; // erledigt / abgesagt: kein Weiter-Knopf
  }
}

type MitarbeiterRow = { id: string; vorname: string | null; nachname: string | null };
type EinsatzRow = {
  id: string; titel: string | null; beschreibung: string | null; einsatzort: string | null;
  beginn_am: string | null; ende_am: string | null; status: string | null;
  kunde_name: string | null; kunde_email: string | null; kunde_telefon: string | null;
  unterwegs_am: string | null; vor_ort_am: string | null; erledigt_am: string | null;
  owner_user_id: string | null;
};
type FotoRow = { id: string; einsatz_id: string; pfad: string; dateiname: string | null };

export default function MeineEinsaetzePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [mitarbeiter, setMitarbeiter] = useState<MitarbeiterRow | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [einsaetze, setEinsaetze] = useState<EinsatzRow[]>([]);
  const [tagOffset, setTagOffset] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fotos, setFotos] = useState<FotoRow[]>([]);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({}); // Pfad -> signierte URL
  const [fotoBusy, setFotoBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      const { data: ma } = await supabase
        .from('mitarbeiter').select('id, vorname, nachname')
        .eq('auth_user_id', id).maybeSingle();
      if (ma) setMitarbeiter(ma as MitarbeiterRow);
      else { setIstChef(true); setLaden(false); }
    })();
  }, []);

  const tag = useMemo(() => addDays(new Date(), tagOffset), [tagOffset]);

  const laden_ = useCallback(async () => {
    if (!mitarbeiter) return;
    setLaden(true); setFehler(null);
    try {
      const start = new Date(tag.getFullYear(), tag.getMonth(), tag.getDate(), 0, 0, 0);
      const ende = new Date(tag.getFullYear(), tag.getMonth(), tag.getDate(), 23, 59, 59);
      const { data, error } = await supabase
        .from('einsaetze')
        .select('id, titel, beschreibung, einsatzort, beginn_am, ende_am, status, kunde_name, kunde_email, kunde_telefon, unterwegs_am, vor_ort_am, erledigt_am, owner_user_id')
        .eq('mitarbeiter_id', mitarbeiter.id)
        .gte('beginn_am', start.toISOString())
        .lte('beginn_am', ende.toISOString())
        .order('beginn_am', { ascending: true });
      if (error) throw error;
      const rows = (data as EinsatzRow[]) ?? [];
      setEinsaetze(rows);

      // Fotos zu diesen Einsätzen laden (+ signierte Anzeige-Links, 1h gültig)
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        const { data: fdata } = await supabase
          .from('einsatz_fotos')
          .select('id, einsatz_id, pfad, dateiname')
          .in('einsatz_id', ids)
          .order('created_at', { ascending: true });
        const frows = (fdata as FotoRow[]) ?? [];
        setFotos(frows);
        if (frows.length) {
          const { data: signed } = await supabase.storage
            .from('einsatz-fotos')
            .createSignedUrls(frows.map((f) => f.pfad), 3600);
          const urls: Record<string, string> = {};
          if (signed) for (const s of signed) { if (s.signedUrl && s.path) urls[s.path] = s.signedUrl; }
          setFotoUrls(urls);
        } else setFotoUrls({});
      } else { setFotos([]); setFotoUrls({}); }
    } catch (e: unknown) {
      setFehler('Einsätze konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [mitarbeiter, tag]);

  useEffect(() => { void laden_(); }, [laden_]);

  // Status eine Phase weiterschalten (über geschützte DB-Funktion)
  async function phaseWeiter(e: EinsatzRow) {
    const np = naechstePhase(e.status);
    if (!np) return;
    setBusyId(e.id); setFehler(null);
    try {
      const { error } = await supabase.rpc('einsatz_status_setzen', { p_einsatz_id: e.id, p_status: np.ziel });
      if (error) throw error;
      await laden_();
    } catch (err: unknown) {
      setFehler('Status konnte nicht gesetzt werden: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusyId(null); }
  }

  // Fotos je Einsatz gruppiert
  const fotosNachEinsatz = useMemo(() => {
    const m = new Map<string, FotoRow[]>();
    for (const f of fotos) { const a = m.get(f.einsatz_id) ?? []; a.push(f); m.set(f.einsatz_id, a); }
    return m;
  }, [fotos]);

  // Foto hochladen: Datei -> privater Bucket, dann Verweis via geschützter Funktion
  async function fotoHochladen(e: EinsatzRow, file: File) {
    if (!e.owner_user_id) { setFehler('Einsatz ohne Betriebszuordnung.'); return; }
    setFotoBusy(e.id); setFehler(null);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const pfad = `${e.owner_user_id}/${e.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('einsatz-fotos').upload(pfad, file, { upsert: false });
      if (upErr) throw upErr;
      const { error: rpcErr } = await supabase.rpc('einsatz_foto_speichern', {
        p_einsatz_id: e.id, p_pfad: pfad, p_dateiname: file.name, p_groesse_bytes: file.size,
      });
      if (rpcErr) throw rpcErr;
      await laden_();
    } catch (err: unknown) {
      setFehler('Foto konnte nicht hochgeladen werden: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setFotoBusy(null); }
  }

  // Foto löschen (Chef oder Uploader): erst DB-Verweis, dann Datei aus dem Bucket
  async function fotoLoeschen(f: FotoRow) {
    if (!window.confirm('Dieses Foto wirklich löschen?')) return;
    setFehler(null);
    try {
      const { data: pfad, error } = await supabase.rpc('einsatz_foto_loeschen', { p_foto_id: f.id });
      if (error) throw error;
      if (pfad) await supabase.storage.from('einsatz-fotos').remove([pfad as string]);
      await laden_();
    } catch (err: unknown) {
      setFehler('Foto konnte nicht gelöscht werden: ' + (err instanceof Error ? err.message : 'Fehler'));
    }
  }

  const datumLang = `${WOCHENTAGE[tag.getDay()]}, ${pad(tag.getDate())}.${pad(tag.getMonth() + 1)}.${tag.getFullYear()}`;
  const tagLabel = tagOffset === 0 ? 'Heute' : tagOffset === 1 ? 'Morgen' : tagOffset === -1 ? 'Gestern' : datumLang;

  const aktive = useMemo(() => einsaetze.filter((e) => belegend(e.status)), [einsaetze]);

  // ---- Chef-Hinweis ----
  if (istChef) {
    return (
      <div style={styles.page}>
        <div style={styles.eyebrow}>ARGONAUT OS · Field Service</div>
        <h1 style={styles.h1}>Meine Einsätze</h1>
        <div style={{ ...styles.karte, marginTop: 16 }}>
          <p style={{ margin: 0, lineHeight: 1.6, color: C.text }}>
            Diese Ansicht ist für <b>Monteure</b> gedacht – sie zeigt die eigenen Einsätze des Tages.
            Als Betriebsinhaber planst und siehst du alle Einsätze im{' '}
            <a href="/dashboard/dispo" style={{ color: C.cyan, fontWeight: 700 }}>Dispo-Board</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Field Service</div>
      <h1 style={styles.h1}>Meine Einsätze</h1>
      {mitarbeiter && (
        <p style={styles.sub}>Hallo {mitarbeiter.vorname ?? ''} – hier sind deine Einsätze.</p>
      )}

      {/* Tag-Navigation */}
      <div style={styles.tagNav}>
        <button style={styles.navBtn} onClick={() => setTagOffset((o) => o - 1)} aria-label="Tag zurück">‹</button>
        <div style={styles.tagMitte}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{tagLabel}</div>
          <div style={{ color: C.textDim, fontSize: 12.5 }}>{datumLang}</div>
        </div>
        <button style={styles.navBtn} onClick={() => setTagOffset((o) => o + 1)} aria-label="Tag vor">›</button>
      </div>
      {tagOffset !== 0 && (
        <button style={styles.heuteBtn} onClick={() => setTagOffset(0)}>← Zurück zu heute</button>
      )}

      {fehler && <div style={styles.err}>{fehler}</div>}

      {laden ? (
        <div style={styles.hint}>Lädt …</div>
      ) : aktive.length === 0 ? (
        <div style={{ ...styles.karte, textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Keine Einsätze eingeplant</div>
          <div style={{ color: C.textDim, fontSize: 13.5, marginTop: 6 }}>
            Für {tagOffset === 0 ? 'heute' : 'diesen Tag'} ist nichts für dich eingeplant.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {aktive.map((e) => {
            const b = e.beginn_am ? new Date(e.beginn_am) : null;
            const en = e.ende_am ? new Date(e.ende_am) : null;
            const si = statusInfo(e.status);
            return (
              <div key={e.id} style={{ ...styles.einsatzKarte, borderLeft: `4px solid ${si.farbe}` }}>
                <div style={styles.karteKopf}>
                  <div style={styles.zeit}>{b ? uhr(b) : '—'}{en ? `–${uhr(en)}` : ''}</div>
                  <span style={{ ...styles.badge, color: si.farbe, borderColor: si.farbe }}>{si.label}</span>
                </div>
                <div style={styles.titel}>{e.titel || 'Einsatz'}</div>
                {e.kunde_name && <div style={styles.kunde}>{e.kunde_name}</div>}

                {e.einsatzort && (
                  <a href={mapsLink(e.einsatzort)} target="_blank" rel="noopener noreferrer" style={styles.aktionZeile}>
                    <span style={styles.aktionIcon}>📍</span>
                    <span style={{ flex: 1 }}>{e.einsatzort}</span>
                    <span style={styles.aktionHinweis}>Route ›</span>
                  </a>
                )}
                {e.kunde_telefon && (
                  <a href={telLink(e.kunde_telefon)} style={styles.aktionZeile}>
                    <span style={styles.aktionIcon}>📞</span>
                    <span style={{ flex: 1 }}>{e.kunde_telefon}</span>
                    <span style={styles.aktionHinweis}>Anrufen ›</span>
                  </a>
                )}
                {e.beschreibung && (
                  <div style={styles.beschreibung}>{e.beschreibung}</div>
                )}

                {(e.unterwegs_am || e.vor_ort_am || e.erledigt_am) && (
                  <div style={styles.stempelZeile}>
                    {e.unterwegs_am && <span>▶ Los {uhr(new Date(e.unterwegs_am))}</span>}
                    {e.vor_ort_am && <span>📍 Vor Ort {uhr(new Date(e.vor_ort_am))}</span>}
                    {e.erledigt_am && <span>✅ Fertig {uhr(new Date(e.erledigt_am))}</span>}
                  </div>
                )}

                {(() => {
                  const np = naechstePhase(e.status);
                  if (np) {
                    return (
                      <button onClick={() => phaseWeiter(e)} disabled={busyId === e.id}
                        style={{ ...styles.phaseBtn, background: np.farbe, opacity: busyId === e.id ? 0.6 : 1 }}>
                        {busyId === e.id ? 'Speichert …' : np.label}
                      </button>
                    );
                  }
                  if ((e.status ?? '') === 'erledigt') {
                    return <div style={styles.erledigtHinweis}>✅ Erledigt{e.erledigt_am ? ` um ${uhr(new Date(e.erledigt_am))}` : ''}</div>;
                  }
                  return null;
                })()}

                {(() => {
                  const efotos = fotosNachEinsatz.get(e.id) ?? [];
                  return (
                    <div style={styles.fotoBereich}>
                      <div style={styles.fotoKopf}>
                        <span style={{ fontWeight: 700 }}>📷 Fotos {efotos.length > 0 ? `(${efotos.length})` : ''}</span>
                        <label style={{ ...styles.fotoAddBtn, opacity: fotoBusy === e.id ? 0.6 : 1 }}>
                          {fotoBusy === e.id ? 'Lädt …' : '+ Foto'}
                          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                            disabled={fotoBusy === e.id}
                            onChange={(ev) => { const f = ev.target.files?.[0]; if (f) { void fotoHochladen(e, f); } ev.target.value = ''; }} />
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
                              ) : (
                                <div style={styles.fotoLaedt}>…</div>
                              )}
                              <button onClick={() => fotoLoeschen(f)} style={styles.fotoDel} title="Foto löschen">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '24px 16px 64px', maxWidth: 560, margin: '0 auto' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 16px', fontSize: 14 },

  tagNav: { display: 'flex', alignItems: 'center', gap: 10, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '10px 12px', marginTop: 8 },
  tagMitte: { flex: 1, textAlign: 'center' },
  navBtn: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, width: 52, height: 48, cursor: 'pointer', fontSize: 24, fontFamily: 'inherit', flexShrink: 0 },
  heuteBtn: { background: 'transparent', color: C.cyan, border: 'none', padding: '10px 2px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },

  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 },
  einsatzKarte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 16px 16px 18px', display: 'flex', flexDirection: 'column', gap: 6 },
  karteKopf: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  zeit: { fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: 0.5 },
  badge: { fontSize: 12, fontWeight: 700, border: '1px solid', borderRadius: 999, padding: '3px 12px', whiteSpace: 'nowrap' },
  titel: { fontSize: 17, fontWeight: 700, color: C.text, marginTop: 2 },
  kunde: { fontSize: 14, color: C.textDim },

  aktionZeile: { display: 'flex', alignItems: 'center', gap: 10, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginTop: 6, textDecoration: 'none', color: C.text, fontSize: 14.5 },
  aktionIcon: { fontSize: 18, flexShrink: 0 },
  aktionHinweis: { color: C.cyan, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' },
  beschreibung: { fontSize: 14, color: C.text, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginTop: 6, lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  phaseBtn: { color: '#0A1628', border: 'none', borderRadius: 12, padding: '16px', fontSize: 16, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', marginTop: 10, width: '100%', minHeight: 54 },
  stempelZeile: { display: 'flex', gap: 14, fontSize: 12.5, color: C.textDim, marginTop: 8, flexWrap: 'wrap' },
  erledigtHinweis: { marginTop: 10, textAlign: 'center', color: C.green, fontWeight: 700, fontSize: 15, padding: '12px', background: 'rgba(76,175,125,0.1)', borderRadius: 12 },

  fotoBereich: { marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12 },
  fotoKopf: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 14 },
  fotoAddBtn: { background: C.navy, color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '8px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  fotoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8, marginTop: 10 },
  fotoThumb: { position: 'relative', aspectRatio: '1 / 1', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.navy },
  fotoImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  fotoLaedt: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim, fontSize: 18 },
  fotoDel: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(10,22,40,0.8)', color: C.danger, fontSize: 13, cursor: 'pointer', lineHeight: 1, fontFamily: 'inherit' },

  hint: { color: C.textDim, fontSize: 15, padding: '24px 0', textAlign: 'center' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '12px 0' },
};
