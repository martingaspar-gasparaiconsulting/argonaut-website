'use client';

// ============================================================================
// ARGONAUT OS · academy/AcademyClient.tsx — Kursliste mit Player
//
// Die Academy war bisher ein Schaufenster: Kacheln, kein Klickziel, kein
// Player. Hier kommt die Lern-Laufzeit dazu.
//
// AUFBAU: Die Serverseite laedt die GLOBALEN Kurse (fuer alle Betriebe
// gleich, per RLS nur lesbar) und reicht sie herein. Alles Betriebseigene —
// Fortschritt, eigene Kurse — laedt diese Komponente selbst, weil es an der
// Anmeldung haengt.
//
// FORTSCHRITT: wird beim Abspielen alle paar Sekunden gesichert, zusaetzlich
// bei Pause, beim Verlassen der Seite und am Ende. Nicht im Sekundentakt —
// das waeren 600 Schreibvorgaenge je Zehn-Minuten-Video.
//
// WIEDEREINSTIEG: Wer mittendrin aufgehoert hat, steigt drei Sekunden vor
// der alten Stelle wieder ein. Wer fast durch war, faengt von vorn an —
// sonst landet man beim Wiederansehen im Abspann.
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  prozentAus, istAbgeschlossen, startpunkt, sollSpeichern, dauerText,
  type Fortschritt, type KursQuelle,
} from '@/lib/academy';

/** Eigene ID für den Dateinamen im Speicher. */
function neueId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* Rückfall */ }
  return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function mb(bytes: number): string {
  return (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB';
}

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', dim: 'rgba(255,255,255,0.45)', border: 'rgba(255,255,255,0.1)', warn: '#E0A24C',
};

export type Kurs = {
  id: string;
  slug?: string | null;
  titel: string;
  beschreibung: string | null;
  kategorie: string;
  video_url: string | null;
  dauer_minuten: number | null;
  icon: string | null;
  sortierung: number;
  quelle: KursQuelle;
  /** Nur bei eigenen Kursen: Pfad im Bucket academy-videos. */
  video_pfad?: string | null;
  pflicht?: boolean;
};

const KAT_ORDER = ['Erste Schritte', 'Agenten meistern', 'Vertrieb & CRM', 'Automatisierungen'];
const KAT_FARBE: Record<string, string> = {
  'Erste Schritte': '#00e5ff',
  'Agenten meistern': '#A98CE0',
  'Vertrieb & CRM': '#4f94e8',
  'Automatisierungen': '#C9A84C',
  'Eigene Schulungen': '#4CAF7D',
};

export default function AcademyClient({ globaleKurse }: { globaleKurse: Kurs[] }) {
  const [uid, setUid] = useState<string | null>(null);
  const [chefId, setChefId] = useState<string | null>(null);
  const [eigene, setEigene] = useState<Kurs[]>([]);
  const [fortschritt, setFortschritt] = useState<Record<string, Fortschritt>>({});
  const [offen, setOffen] = useState<Kurs | null>(null);
  const [quelleUrl, setQuelleUrl] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const video = useRef<HTMLVideoElement | null>(null);
  const zuletztGespeichert = useRef(0);
  const aktuellerStand = useRef({ sekunden: 0, laenge: 0 });

  // Eigene Schulungen anlegen (nur der Chef)
  const [verwaltung, setVerwaltung] = useState(false);
  const [neu, setNeu] = useState({ titel: '', beschreibung: '', kategorie: 'Eigene Schulungen', pflicht: false, video_url: '' });
  const [datei, setDatei] = useState<File | null>(null);
  const [dateiDauer, setDateiDauer] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const schluessel = (k: Kurs) => `${k.quelle}:${k.id}`;

  // --- Laden ---------------------------------------------------------------
  const alles = useCallback(async () => {
    setLaden(true);
    try {
      const { data: nutzer } = await supabase.auth.getUser();
      const id = nutzer?.user?.id ?? null;
      setUid(id);
      if (!id) { setLaden(false); return; }

      // Wer ist mein Chef? Mitarbeiter sehen die Kurse ihres Betriebs.
      const { data: ma } = await supabase.from('mitarbeiter')
        .select('owner_user_id').eq('auth_user_id', id).maybeSingle();
      const chef = (ma as { owner_user_id?: string } | null)?.owner_user_id ?? id;
      setChefId(chef);

      const [eig, fort] = await Promise.all([
        supabase.from('academy_kurse_eigen')
          .select('id,titel,beschreibung,kategorie,video_pfad,video_url,dauer_minuten,icon,sortierung,pflicht')
          .eq('aktiv', true).order('sortierung'),
        supabase.from('academy_fortschritt')
          .select('kurs_id,kurs_quelle,sekunden,laenge_sekunden,prozent,abgeschlossen,abgeschlossen_am')
          .eq('user_id', id),
      ]);

      setEigene(((eig.data as Array<Omit<Kurs, 'quelle'>>) ?? []).map((k) => ({ ...k, quelle: 'eigen' as KursQuelle })));

      const map: Record<string, Fortschritt> = {};
      for (const f of ((fort.data as Fortschritt[]) ?? [])) map[`${f.kurs_quelle}:${f.kurs_id}`] = f;
      setFortschritt(map);
    } catch {
      setFehler('Die Kurse konnten nicht geladen werden.');
    } finally { setLaden(false); }
  }, []);

  useEffect(() => { alles(); }, [alles]);

  // --- Fortschritt sichern --------------------------------------------------
  const sichern = useCallback(async (kurs: Kurs, sekunden: number, laenge: number, erzwingen = false) => {
    if (!uid) return;
    if (!erzwingen && !sollSpeichern(zuletztGespeichert.current, sekunden, laenge)) return;
    zuletztGespeichert.current = sekunden;

    const fertig = istAbgeschlossen(sekunden, laenge);
    const satz = {
      owner_user_id: chefId ?? uid,
      user_id: uid,
      kurs_id: kurs.id,
      kurs_quelle: kurs.quelle,
      sekunden: Math.round(sekunden),
      laenge_sekunden: Math.round(laenge),
      prozent: prozentAus(sekunden, laenge),
      abgeschlossen: fertig,
      abgeschlossen_am: fertig ? new Date().toISOString() : null,
      zuletzt_am: new Date().toISOString(),
    };

    try {
      const { error } = await supabase.from('academy_fortschritt')
        .upsert(satz, { onConflict: 'user_id,kurs_id,kurs_quelle' });
      if (error) return;
      setFortschritt((v) => ({ ...v, [schluessel(kurs)]: { ...satz } as Fortschritt }));
    } catch { /* Fortschritt ist nett, aber nichts, wofuer man den Kurs abbricht */ }
  }, [uid, chefId]);

  // --- Kurs öffnen ----------------------------------------------------------
  async function oeffnen(k: Kurs) {
    setFehler(null);
    setOffen(k);
    zuletztGespeichert.current = 0;
    aktuellerStand.current = { sekunden: 0, laenge: 0 };

    // Eigene Videos liegen im nicht-öffentlichen Bucket — dafür braucht es
    // einen signierten Link, der nach zwei Stunden verfällt.
    if (k.quelle === 'eigen' && k.video_pfad) {
      const { data, error } = await supabase.storage.from('academy-videos')
        .createSignedUrl(k.video_pfad, 7200);
      if (error || !data?.signedUrl) {
        setFehler('Das Video konnte nicht geöffnet werden.');
        setQuelleUrl(null);
        return;
      }
      setQuelleUrl(data.signedUrl);
      return;
    }
    setQuelleUrl(k.video_url ?? null);
  }

  function schliessen() {
    const v = video.current;
    if (v && offen && aktuellerStand.current.laenge > 0) {
      sichern(offen, v.currentTime, aktuellerStand.current.laenge, true);
    }
    setOffen(null);
    setQuelleUrl(null);
  }

  // Beim Verlassen der Seite den Stand nicht verlieren.
  useEffect(() => {
    function beiVerlassen() {
      const v = video.current;
      if (v && offen && aktuellerStand.current.laenge > 0) {
        sichern(offen, v.currentTime, aktuellerStand.current.laenge, true);
      }
    }
    window.addEventListener('pagehide', beiVerlassen);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') beiVerlassen();
    });
    return () => window.removeEventListener('pagehide', beiVerlassen);
  }, [offen, sichern]);

  // --- Eigene Schulungen anlegen (nur der Chef) ------------------------------

  const istChef = !!uid && uid === chefId;

  /** Länge des Videos schon im Browser messen — dann steht sie in der Kachel,
   *  bevor irgendjemand den Kurs geöffnet hat. */
  function dateiWaehlen(f: File) {
    setDatei(f);
    setDateiDauer(0);
    setOk(null); setFehler(null);
    try {
      const url = URL.createObjectURL(f);
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        setDateiDauer(probe.duration || 0);
        URL.revokeObjectURL(url);
      };
      probe.onerror = () => URL.revokeObjectURL(url);
      probe.src = url;
    } catch { /* Dauer ist nett, aber nicht nötig */ }
  }

  async function kursAnlegen() {
    if (!uid) return;
    if (!neu.titel.trim()) { setFehler('Bitte einen Titel vergeben.'); return; }
    if (!datei && !neu.video_url.trim()) { setFehler('Bitte ein Video hochladen oder einen Link angeben.'); return; }

    setBusy('anlegen'); setFehler(null); setOk(null);
    let hochgeladenerPfad: string | null = null;

    try {
      if (datei) {
        const endung = (datei.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
        // Der erste Pfadteil MUSS die eigene Benutzer-ID sein — so verlangt es
        // die Storage-Policy, und so kann niemand in fremden Ordnern landen.
        const pfad = `${uid}/${neueId()}.${endung}`;
        const { error: upFehler } = await supabase.storage.from('academy-videos')
          .upload(pfad, datei, { cacheControl: '3600', upsert: false, contentType: datei.type || 'video/mp4' });
        if (upFehler) throw upFehler;
        hochgeladenerPfad = pfad;
      }

      const { error } = await supabase.from('academy_kurse_eigen').insert({
        owner_user_id: uid,
        titel: neu.titel.trim(),
        beschreibung: neu.beschreibung.trim() || null,
        kategorie: neu.kategorie.trim() || 'Eigene Schulungen',
        video_pfad: hochgeladenerPfad,
        video_url: hochgeladenerPfad ? null : (neu.video_url.trim() || null),
        dauer_minuten: dateiDauer > 0 ? Math.max(1, Math.round(dateiDauer / 60)) : 0,
        pflicht: neu.pflicht,
        aktiv: true,
      });
      if (error) {
        // Kein verwaistes Video im Speicher zurücklassen.
        if (hochgeladenerPfad) await supabase.storage.from('academy-videos').remove([hochgeladenerPfad]);
        throw error;
      }

      setOk(`„${neu.titel.trim()}" ist angelegt${neu.pflicht ? ' — als Pflichtschulung für alle' : ''}.`);
      setNeu({ titel: '', beschreibung: '', kategorie: 'Eigene Schulungen', pflicht: false, video_url: '' });
      setDatei(null); setDateiDauer(0);
      await alles();
    } catch (err: unknown) {
      setFehler('Anlegen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  async function kursUmschalten(k: Kurs, feld: 'pflicht' | 'aktiv', wert: boolean) {
    if (!istChef) return;
    setBusy(k.id);
    try {
      await supabase.from('academy_kurse_eigen').update({ [feld]: wert, aktualisiert_am: new Date().toISOString() }).eq('id', k.id);
      await alles();
    } finally { setBusy(null); }
  }

  async function kursLoeschen(k: Kurs) {
    if (!istChef) return;
    if (typeof window !== 'undefined' && !window.confirm(
      `Schulung „${k.titel}" löschen? Das Video wird mit entfernt, der Fortschritt der Mitarbeiter geht verloren.`
    )) return;
    setBusy(k.id); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('academy_kurse_eigen').delete().eq('id', k.id);
      if (error) throw error;
      if (k.video_pfad) await supabase.storage.from('academy-videos').remove([k.video_pfad]);
      setOk('Schulung gelöscht.');
      await alles();
    } catch (err: unknown) {
      setFehler('Löschen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  // --- Gruppierung ----------------------------------------------------------
  const alleKurse = useMemo(() => [...globaleKurse, ...eigene], [globaleKurse, eigene]);

  const gruppen = useMemo(() => {
    const map: Record<string, Kurs[]> = {};
    for (const k of alleKurse) {
      const kat = k.kategorie || 'Weitere';
      if (!map[kat]) map[kat] = [];
      (map[kat] as Kurs[]).push(k);
    }
    const bekannt = KAT_ORDER.filter((k) => map[k]?.length);
    const rest = Object.keys(map).filter((k) => !KAT_ORDER.includes(k)).sort();
    return [...bekannt, ...rest].map((kat) => ({ kat, kurse: map[kat] ?? [] }));
  }, [alleKurse]);

  const zahlen = useMemo(() => {
    const spielbar = alleKurse.filter((k) => k.video_url || k.video_pfad);
    const fertig = Object.values(fortschritt).filter((f) => f.abgeschlossen).length;
    const angefangen = Object.values(fortschritt).filter((f) => !f.abgeschlossen && f.sekunden > 5).length;
    return { gesamt: alleKurse.length, spielbar: spielbar.length, fertig, angefangen };
  }, [alleKurse, fortschritt]);

  // ==========================================================================

  return (
    <>
      {/* Fortschritts-Streifen */}
      <div style={s.streifen}>
        <Zahl wert={zahlen.gesamt} label="Kurse" farbe={C.text} />
        <Zahl wert={zahlen.spielbar} label="abspielbar" farbe={C.cyan} />
        <Zahl wert={zahlen.fertig} label="abgeschlossen" farbe={C.green} />
        {zahlen.angefangen > 0 && <Zahl wert={zahlen.angefangen} label="angefangen" farbe={C.warn} />}
      </div>

      {fehler && <div style={s.fehler}>⚠️ {fehler}</div>}
      {ok && <div style={s.erfolg}>✓ {ok}</div>}

      {/* --- Eigene Schulungen (nur der Chef) --- */}
      {istChef && (
        <div style={s.verwaltungKasten}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15.5 }}>🎬 Eigene Schulungen</div>
              <div style={{ color: C.dim, fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>
                Das Wissen aus Ihrem Betrieb festhalten: einmal aufnehmen, statt es jedem Neuen einzeln zu erklären.
              </div>
            </div>
            <button type="button" onClick={() => { setVerwaltung((v) => !v); setFehler(null); setOk(null); }} style={s.randKnopf}>
              {verwaltung ? 'Schließen' : '＋ Schulung anlegen'}
            </button>
          </div>

          {verwaltung && (
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <div>
                <label style={s.label}>Titel *</label>
                <input value={neu.titel} onChange={(ev) => setNeu({ ...neu, titel: ev.target.value })}
                  placeholder="z.B. Kettensäge warten — Schritt für Schritt" style={s.feld} />
              </div>

              <div>
                <label style={s.label}>Worum geht es?</label>
                <input value={neu.beschreibung} onChange={(ev) => setNeu({ ...neu, beschreibung: ev.target.value })}
                  placeholder="Ein Satz, der erklärt, was der Kollege danach kann" style={s.feld} />
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px' }}>
                  <label style={s.label}>Bereich</label>
                  <input value={neu.kategorie} onChange={(ev) => setNeu({ ...neu, kategorie: ev.target.value })} style={s.feld} />
                </div>
              </div>

              <div>
                <label style={s.label}>Video hochladen</label>
                <input
                  type="file" accept="video/*"
                  onChange={(ev) => { const f = ev.target.files?.[0]; if (f) dateiWaehlen(f); }}
                  disabled={busy !== null}
                  style={s.dateiFeld}
                />
                {datei && (
                  <div style={{ color: C.dim, fontSize: 12.5, marginTop: 7 }}>
                    <b style={{ color: C.text }}>{datei.name}</b> · {mb(datei.size)}
                    {dateiDauer > 0 && ` · ${dauerText(dateiDauer)}`}
                    {datei.size > 314572800 && (
                      <span style={{ color: C.warn }}> — größer als 300 MB, das nimmt der Speicher nicht an. Bitte in Kapitel teilen.</span>
                    )}
                  </div>
                )}
                <div style={{ color: C.dim, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
                  Mit dem Handy quer aufnehmen reicht völlig. Bis 300 MB je Datei — das sind rund 10 Minuten
                  in guter Qualität. Die Videos sind <b style={{ color: C.text }}>nicht öffentlich</b> und nur für Ihren Betrieb sichtbar.
                </div>
              </div>

              <div>
                <label style={s.label}>… oder ein Link zu einem Video</label>
                <input value={neu.video_url} onChange={(ev) => setNeu({ ...neu, video_url: ev.target.value })}
                  placeholder="https://…" style={s.feld} disabled={!!datei} />
              </div>

              <label style={s.pflichtZeile}>
                <input type="checkbox" checked={neu.pflicht} onChange={(ev) => setNeu({ ...neu, pflicht: ev.target.checked })}
                  style={{ width: 17, height: 17, cursor: 'pointer' }} />
                <span>
                  <b>Pflichtschulung</b>{' '}
                  <span style={{ color: C.dim }}>— erscheint bei allen Mitarbeitern hervorgehoben und zählt in der Chef-Übersicht als offen, bis sie gesehen wurde.</span>
                </span>
              </label>

              <div>
                <button type="button" onClick={kursAnlegen} disabled={busy !== null}
                  style={{ ...s.goldKnopf, opacity: busy !== null ? 0.6 : 1 }}>
                  {busy === 'anlegen' ? (datei ? 'Video wird hochgeladen …' : 'Legt an …') : 'Schulung anlegen'}
                </button>
                {busy === 'anlegen' && datei && (
                  <div style={{ color: C.dim, fontSize: 12.5, marginTop: 8 }}>
                    Das kann bei {mb(datei.size)} einen Moment dauern — bitte die Seite nicht schließen.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Liste der eigenen Schulungen */}
          {eigene.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', color: C.dim, fontWeight: 800, marginBottom: 9 }}>
                Ihre {eigene.length} {eigene.length === 1 ? 'Schulung' : 'Schulungen'}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {eigene.map((k) => (
                  <div key={k.id} style={s.eigenZeile}>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{k.icon} {k.titel}</div>
                      <div style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>
                        {k.kategorie}
                        {k.dauer_minuten ? ` · ${k.dauer_minuten} Min` : ''}
                        {k.video_pfad ? ' · eigenes Video' : k.video_url ? ' · Link' : ' · noch ohne Video'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => kursUmschalten(k, 'pflicht', !k.pflicht)}
                        disabled={busy !== null}
                        style={{ ...s.kleinKnopf, borderColor: k.pflicht ? 'rgba(224,162,76,0.5)' : C.border, color: k.pflicht ? C.warn : C.text }}>
                        {k.pflicht ? '● Pflicht' : '○ Pflicht'}
                      </button>
                      <button type="button" onClick={() => kursLoeschen(k)} disabled={busy !== null}
                        style={{ ...s.kleinKnopf, color: '#E06666', borderColor: 'rgba(224,102,102,0.4)' }}>
                        Löschen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {laden && <div style={{ color: C.dim, fontSize: 15, padding: '20px 0' }}>Lädt …</div>}

      {gruppen.map(({ kat, kurse }) => (
        <section key={kat} style={{ marginBottom: 44 }}>
          <h2 style={{ ...s.katTitel, color: KAT_FARBE[kat] ?? C.gold }}>{kat}</h2>
          <div style={s.grid}>
            {kurse.map((k) => {
              const f = fortschritt[schluessel(k)];
              const p = f ? f.prozent : 0;
              const spielbar = !!(k.video_url || k.video_pfad);
              return (
                <button
                  key={schluessel(k)} type="button"
                  onClick={() => spielbar && oeffnen(k)}
                  disabled={!spielbar}
                  style={{ ...s.karte, cursor: spielbar ? 'pointer' : 'default', opacity: spielbar ? 1 : 0.55 }}
                >
                  <div style={s.vorschau}>
                    <span style={{ fontSize: 40 }}>{k.icon || '🎬'}</span>
                    {spielbar && <span style={s.playKnopf}>▶</span>}
                    {f?.abgeschlossen && <span style={s.hakenEcke}>✓</span>}
                  </div>

                  <div style={{ padding: '14px 16px 16px' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: 15.5, lineHeight: 1.35 }}>{k.titel}</span>
                      {k.pflicht && <span style={s.pflichtBadge}>Pflicht</span>}
                    </div>
                    {k.beschreibung && (
                      <div style={{ color: C.dim, fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>{k.beschreibung}</div>
                    )}

                    {/* Fortschrittsbalken */}
                    {p > 0 && (
                      <div style={s.balkenAussen}>
                        <div style={{ ...s.balkenInnen, width: `${p}%`, background: f?.abgeschlossen ? C.green : C.cyan }} />
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 9 }}>
                      <span style={{ color: C.dim, fontSize: 12 }}>
                        {k.dauer_minuten ? `${k.dauer_minuten} Min` : ''}
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        color: !spielbar ? C.dim : f?.abgeschlossen ? C.green : p > 0 ? C.cyan : C.gold,
                      }}>
                        {!spielbar ? 'Bald verfügbar' : f?.abgeschlossen ? '✓ Abgeschlossen' : p > 0 ? `${p} % — weiter` : '▶ Ansehen'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {/* --- Player --- */}
      {offen && (
        <div style={s.overlay} onClick={(ev) => { if (ev.target === ev.currentTarget) schliessen(); }}>
          <div style={s.playerKasten}>
            <div style={s.playerKopf}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{offen.titel}</div>
                {offen.beschreibung && <div style={{ color: C.dim, fontSize: 12.5, marginTop: 3 }}>{offen.beschreibung}</div>}
              </div>
              <button type="button" onClick={schliessen} style={s.schliessen}>✕</button>
            </div>

            {quelleUrl ? (
              <video
                ref={video}
                src={quelleUrl}
                controls
                playsInline
                preload="metadata"
                style={{ width: '100%', maxHeight: '65vh', background: '#000', display: 'block' }}
                onLoadedMetadata={(ev) => {
                  const v = ev.currentTarget;
                  const laenge = v.duration || 0;
                  aktuellerStand.current = { sekunden: 0, laenge };
                  const start = startpunkt(fortschritt[schluessel(offen)]);
                  if (start > 0 && start < laenge) { v.currentTime = start; zuletztGespeichert.current = start; }
                }}
                onTimeUpdate={(ev) => {
                  const v = ev.currentTarget;
                  const laenge = v.duration || aktuellerStand.current.laenge;
                  aktuellerStand.current = { sekunden: v.currentTime, laenge };
                  sichern(offen, v.currentTime, laenge);
                }}
                onPause={(ev) => sichern(offen, ev.currentTarget.currentTime, ev.currentTarget.duration || 0, true)}
                onEnded={(ev) => sichern(offen, ev.currentTarget.duration || 0, ev.currentTarget.duration || 0, true)}
              />
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: C.dim }}>Video wird vorbereitet …</div>
            )}

            <div style={s.playerFuss}>
              {(() => {
                const f = fortschritt[schluessel(offen)];
                if (!f) return <span style={{ color: C.dim, fontSize: 12.5 }}>Ihr Fortschritt wird automatisch gemerkt.</span>;
                if (f.abgeschlossen) return <span style={{ color: C.green, fontSize: 12.5, fontWeight: 700 }}>✓ Abgeschlossen</span>;
                return (
                  <span style={{ color: C.dim, fontSize: 12.5 }}>
                    {f.prozent} % gesehen{f.laenge_sekunden > 0 ? ` · noch ${dauerText(f.laenge_sekunden - f.sekunden)}` : ''}
                  </span>
                );
              })()}
              <button type="button" onClick={schliessen} style={s.fertigKnopf}>Schließen</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Zahl({ wert, label, farbe }: { wert: number; label: string; farbe: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 20, fontWeight: 800, color: farbe }}>{wert}</span>
      <span style={{ color: C.dim, fontSize: 13 }}>{label}</span>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  streifen: {
    display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center',
    background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
    borderRadius: 14, padding: '14px 18px', marginBottom: 32,
  },
  fehler: { border: '1px solid rgba(224,102,102,0.5)', borderRadius: 12, padding: '12px 14px', background: 'rgba(224,102,102,0.07)', color: '#E06666', fontSize: 14, marginBottom: 20 },
  erfolg: { border: '1px solid rgba(76,175,125,0.5)', borderRadius: 12, padding: '12px 14px', background: 'rgba(76,175,125,0.07)', color: C.green, fontSize: 14, marginBottom: 20 },

  verwaltungKasten: {
    background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
    borderRadius: 16, padding: '16px 18px', marginBottom: 32,
  },
  label: { display: 'block', fontSize: 12, color: C.dim, fontWeight: 700, marginBottom: 5 },
  feld: {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9,
    border: `1px solid ${C.border}`, background: 'rgba(10,22,40,0.7)', color: C.text,
    fontSize: 14, fontFamily: 'inherit',
  },
  dateiFeld: {
    width: '100%', boxSizing: 'border-box', padding: '13px', borderRadius: 10,
    border: `1px dashed ${C.border}`, background: 'rgba(10,22,40,0.7)', color: C.text,
    fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
  },
  pflichtZeile: { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.55, cursor: 'pointer' },
  eigenZeile: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 13px', background: 'rgba(10,22,40,0.4)',
  },
  goldKnopf: { padding: '11px 17px', borderRadius: 9, border: 'none', background: C.gold, color: C.navy, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  randKnopf: { padding: '10px 15px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' },
  kleinKnopf: { padding: '6px 11px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  katTitel: { fontSize: 'clamp(17px, 1.5vw, 22px)', fontWeight: 800, margin: '0 0 16px', letterSpacing: '0.02em' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 },

  karte: {
    textAlign: 'left', padding: 0, overflow: 'hidden',
    background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
    borderRadius: 16, color: C.text, fontFamily: 'inherit',
    display: 'flex', flexDirection: 'column',
  },
  vorschau: {
    position: 'relative', height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, rgba(0,229,255,0.08), rgba(201,168,76,0.08))',
    borderBottom: `1px solid ${C.border}`,
  },
  playKnopf: {
    position: 'absolute', right: 12, bottom: 12,
    width: 34, height: 34, borderRadius: '50%', background: 'rgba(10,22,40,0.8)',
    border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, color: C.gold,
  },
  hakenEcke: {
    position: 'absolute', left: 12, top: 12,
    width: 26, height: 26, borderRadius: '50%', background: 'rgba(76,175,125,0.9)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#04130b', fontWeight: 900,
  },
  pflichtBadge: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
    color: C.warn, background: 'rgba(224,162,76,0.14)', border: '1px solid rgba(224,162,76,0.35)',
    borderRadius: 20, padding: '2px 8px',
  },

  balkenAussen: { height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  balkenInnen: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },

  overlay: {
    position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(4,10,20,0.86)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  playerKasten: {
    width: '100%', maxWidth: 900, background: C.navy2,
    border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  },
  playerKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '14px 16px' },
  schliessen: {
    flexShrink: 0, width: 32, height: 32, borderRadius: 8,
    border: `1px solid ${C.border}`, background: 'transparent', color: C.text,
    fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
  },
  playerFuss: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 16px', flexWrap: 'wrap' },
  fertigKnopf: {
    padding: '9px 15px', borderRadius: 9, border: 'none', background: C.gold,
    color: C.navy, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
  },
};
