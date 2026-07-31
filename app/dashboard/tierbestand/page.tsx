'use client';

// ============================================================
// ARGONAUT OS · A6 · Tierbestand / HIT-Meldung
// Tiergruppen (Bestand je Tierart + VVVO-Nr.) + meldepflichtige Bewegungen
// mit Melde-Ampel (7-Tage-Frist) + jährliche Stichtagsmeldung.
// Regel-Logik aus lib/tierbestand (0 €, node-getestet).
// Pfad: app/dashboard/tierbestand/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../_components/Leerzustand';
import {
  TIERARTEN, BEWEGUNG_ARTEN, MELDEFRIST_TAGE_STD, meldeStatus, fristRest, zaehleTierbestand,
  type MeldeStatus,
} from '@/lib/tierbestand';
import { augeTierbestand } from '@/lib/auge';
import { hitMeldelistePdf } from '@/lib/hitMeldelistePdf';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Gruppe = { id: string; tierart: string; bezeichnung: string; betriebsnummer: string | null; standort: string | null; meldefrist_tage: number; aktueller_bestand: number; status: string; notiz: string | null };
type Bewegung = { id: string; gruppe_id: string; datum: string; art: string; anzahl: number; ohrmarke: string | null; partner: string | null; gemeldet: boolean; gemeldet_am: string | null; notiz: string | null };
type Stichtag = { id: string; gruppe_id: string | null; jahr: number; stichtag: string; tierart: string | null; anzahl: number; gemeldet_am: string | null; notiz: string | null };

const ART_LABEL: Record<string, string> = { geburt: 'Geburt', zugang: 'Zugang', einfuhr: 'Einfuhr', abgang: 'Abgang', tod: 'Tod / Verendung', schlachtung: 'Schlachtung', ausfuhr: 'Ausfuhr' };
const TIERART_LABEL: Record<string, string> = { rind: 'Rind', schwein: 'Schwein', schaf: 'Schaf', ziege: 'Ziege', pferd: 'Pferd', gefluegel: 'Geflügel', sonstige: 'Sonstige' };
const MELDE_META: Record<MeldeStatus, { label: string; farbe: string }> = {
  offen: { label: 'offen', farbe: C.warn },
  ueberfaellig: { label: 'überfällig', farbe: C.danger },
  gemeldet: { label: 'gemeldet', farbe: C.green },
  spaet: { label: 'spät gemeldet', farbe: C.gold },
};

function heuteLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function num(s: string) { return parseFloat((s || '').replace(',', '.')) || 0; }
function fmtDatum(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }

export default function TierbestandPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [aussteller, setAussteller] = useState<string | null>(null);
  const [tab, setTab] = useState<'bestand' | 'bewegungen' | 'stichtag'>('bestand');
  const [gruppen, setGruppen] = useState<Gruppe[]>([]);
  const [bewegungen, setBewegungen] = useState<Bewegung[]>([]);
  const [stichtage, setStichtage] = useState<Stichtag[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const H = heuteLokal();
  const JAHR = new Date().getFullYear();

  const [ng, setNg] = useState({ tierart: 'rind', bezeichnung: '', betriebsnummer: '', standort: '', meldefrist_tage: '7', aktueller_bestand: '0' });
  const [nb, setNb] = useState({ gruppe_id: '', datum: H, art: 'zugang', anzahl: '1', ohrmarke: '', partner: '' });
  const [ns, setNs] = useState({ gruppe_id: '', jahr: String(JAHR), stichtag: `${JAHR}-01-01`, anzahl: '' });

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [g, b, s] = await Promise.all([
        supabase.from('tier_gruppe').select('*').order('bezeichnung', { ascending: true }),
        supabase.from('tier_bewegung').select('*').order('datum', { ascending: false }),
        supabase.from('tier_stichtag').select('*').order('stichtag', { ascending: false }),
      ]);
      setGruppen((g.data as Gruppe[]) ?? []);
      setBewegungen((b.data as Bewegung[]) ?? []);
      setStichtage((s.data as Stichtag[]) ?? []);
    } catch (err: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
      setAussteller(str(meta.firmenname) || str(meta.firma) || str(meta.name) || str(meta.betrieb) || null);
      setUid(id); await laden_();
    })();
  }, [laden_]);

  const kennzahlen = useMemo(() => zaehleTierbestand(gruppen, bewegungen, new Date()), [gruppen, bewegungen]);
  const gruppeById = useCallback((id: string) => gruppen.find((x) => x.id === id), [gruppen]);
  const aktiveGruppen = gruppen.filter((g) => g.status === 'aktiv');

  async function gruppeAnlegen() {
    if (!uid || !ng.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    setBusy('gruppe'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('tier_gruppe').insert({
        owner_user_id: uid, tierart: ng.tierart, bezeichnung: ng.bezeichnung.trim(), betriebsnummer: ng.betriebsnummer.trim() || null,
        standort: ng.standort.trim() || null, meldefrist_tage: Math.round(num(ng.meldefrist_tage)) || MELDEFRIST_TAGE_STD,
        aktueller_bestand: Math.round(num(ng.aktueller_bestand)), status: 'aktiv',
      });
      if (error) throw error;
      setNg({ tierart: 'rind', bezeichnung: '', betriebsnummer: '', standort: '', meldefrist_tage: '7', aktueller_bestand: '0' });
      setOk('Tiergruppe angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function bewegungAnlegen() {
    if (!uid || !nb.gruppe_id) { setFehler('Bitte eine Gruppe wählen.'); return; }
    setBusy('bewegung'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('tier_bewegung').insert({
        owner_user_id: uid, gruppe_id: nb.gruppe_id, datum: nb.datum, art: nb.art, anzahl: Math.round(num(nb.anzahl)) || 1,
        ohrmarke: nb.ohrmarke.trim() || null, partner: nb.partner.trim() || null, gemeldet: false,
      });
      if (error) throw error;
      setNb({ gruppe_id: '', datum: H, art: 'zugang', anzahl: '1', ohrmarke: '', partner: '' });
      setOk('Bewegung erfasst.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function alsGemeldet(b: Bewegung) {
    setBusy(b.id); setFehler(null);
    try {
      const { error } = await supabase.from('tier_bewegung').update({ gemeldet: true, gemeldet_am: H }).eq('id', b.id);
      if (error) throw error;
      await laden_();
    } catch (err: unknown) { setFehler('Aktualisieren fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function stichtagAnlegen() {
    if (!uid || !ns.gruppe_id) { setFehler('Bitte eine Gruppe wählen.'); return; }
    setBusy('stichtag'); setFehler(null); setOk(null);
    try {
      const g = gruppeById(ns.gruppe_id);
      const { error } = await supabase.from('tier_stichtag').insert({
        owner_user_id: uid, gruppe_id: ns.gruppe_id, jahr: Math.round(num(ns.jahr)) || JAHR, stichtag: ns.stichtag,
        tierart: g?.tierart || null, anzahl: Math.round(num(ns.anzahl)),
      });
      if (error) throw error;
      setNs({ gruppe_id: '', jahr: String(JAHR), stichtag: `${JAHR}-01-01`, anzahl: '' });
      setOk('Stichtagsmeldung erfasst.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  function meldelisteErstellen() {
    const heute = new Date();
    const offen = bewegungen.filter((b) => !b.gemeldet).map((b) => {
      const g = gruppeById(b.gruppe_id);
      const frist = g?.meldefrist_tage ?? MELDEFRIST_TAGE_STD;
      const st = meldeStatus(b.datum, false, null, frist, heute);
      return {
        datum: b.datum, gruppe: g?.bezeichnung ?? '—', tierart: TIERART_LABEL[g?.tierart ?? ''] ?? (g?.tierart ?? ''),
        vvvo: g?.betriebsnummer ?? null, art: ART_LABEL[b.art] ?? b.art, anzahl: b.anzahl, ohrmarke: b.ohrmarke,
        status: st === 'ueberfaellig' ? 'überfällig' : 'offen', fristRest: fristRest(b.datum, frist, heute),
      };
    }).sort((a, z) => a.fristRest - z.fristRest);
    if (!offen.length) { setOk('Keine offenen Meldungen — alles an HIT gemeldet.'); return; }
    hitMeldelistePdf({ stand: H, aussteller, eintraege: offen });
  }

  function MeldeBadge({ b }: { b: Bewegung }) {
    const frist = gruppeById(b.gruppe_id)?.meldefrist_tage ?? MELDEFRIST_TAGE_STD;
    const st = meldeStatus(b.datum, b.gemeldet, b.gemeldet_am, frist, new Date());
    const m = MELDE_META[st];
    return <span style={{ ...styles.badge, color: m.farbe, borderColor: m.farbe }}>{m.label}</span>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Tierbestand</div>
      <h1 style={styles.h1}>🐄 Tierbestand & HIT-Meldung</h1>
      <p style={styles.sub}>Bestände, Zu- und Abgänge und Stichtagsmeldungen an einem Ort — mit Melde-Ampel für die 7-Tage-Frist an HI-Tier, damit keine Meldung durchrutscht.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Tiere gesamt" value={String(kennzahlen.tiereGesamt)} accent={C.cyan} />
        <Kpi label="Gruppen" value={String(kennzahlen.anzahlGruppen)} accent={C.text} />
        <Kpi label="Offene Meldungen" value={String(kennzahlen.offeneMeldungen)} accent={kennzahlen.offeneMeldungen > 0 ? C.warn : C.green} />
        <Kpi label="Überfällig" value={String(kennzahlen.ueberfaellig)} accent={kennzahlen.ueberfaellig > 0 ? C.danger : C.green} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Tierbestand" regel={augeTierbestand(kennzahlen)} />
        </div>
      )}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'bestand' ? styles.tabAn : {}) }} onClick={() => setTab('bestand')}>🐄 Bestände</button>
        <button style={{ ...styles.tab, ...(tab === 'bewegungen' ? styles.tabAn : {}) }} onClick={() => setTab('bewegungen')}>🔄 Bewegungen</button>
        <button style={{ ...styles.tab, ...(tab === 'stichtag' ? styles.tabAn : {}) }} onClick={() => setTab('stichtag')}>📅 Stichtag</button>
      </div>

      {/* ---------- BESTÄNDE ---------- */}
      {tab === 'bestand' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Tiergruppe anlegen</div>
            <div style={styles.grid}>
              <label style={styles.lab}>Tierart
                <select style={styles.inp} value={ng.tierart} onChange={(e) => setNg({ ...ng, tierart: e.target.value })}>
                  {TIERARTEN.map((t) => <option key={t} value={t}>{TIERART_LABEL[t]}</option>)}
                </select>
              </label>
              <label style={styles.lab}>Bezeichnung<input style={styles.inp} value={ng.bezeichnung} onChange={(e) => setNg({ ...ng, bezeichnung: e.target.value })} placeholder="z. B. Milchvieh Stall 1" /></label>
              <label style={styles.lab}>VVVO-/Betriebsnummer<input style={styles.inp} value={ng.betriebsnummer} onChange={(e) => setNg({ ...ng, betriebsnummer: e.target.value })} /></label>
              <label style={styles.lab}>Standort<input style={styles.inp} value={ng.standort} onChange={(e) => setNg({ ...ng, standort: e.target.value })} /></label>
              <label style={styles.lab}>Aktueller Bestand (Stück)<input style={styles.inp} inputMode="numeric" value={ng.aktueller_bestand} onChange={(e) => setNg({ ...ng, aktueller_bestand: e.target.value })} /></label>
              <label style={styles.lab}>Meldefrist (Tage)<input style={styles.inp} inputMode="numeric" value={ng.meldefrist_tage} onChange={(e) => setNg({ ...ng, meldefrist_tage: e.target.value })} /></label>
            </div>
            <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'gruppe' ? 0.6 : 1 }} disabled={busy === 'gruppe'} onClick={gruppeAnlegen}>＋ Anlegen</button>
          </div>
          {laden ? <p style={styles.hint}>Lädt …</p> : (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {gruppen.length === 0 ? <Leerzustand icon="🐄" titel="Noch keine Bestände" text="Erfasse Tiergruppen je Tierart mit VVVO-Nummer." schritte={["Tiergruppe oben anlegen", "Tierart und Bestand erfassen", "Bewegungen und Stichtag melden"]} /> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Gruppe</th><th style={styles.th}>Tierart</th><th style={styles.th}>VVVO-Nr.</th><th style={{ ...styles.th, textAlign: 'right' }}>Bestand</th><th style={styles.th}>Standort</th></tr></thead>
                  <tbody>
                    {gruppen.map((g) => (
                      <tr key={g.id} style={{ opacity: g.status !== 'aktiv' ? 0.5 : 1 }}>
                        <td style={styles.td}>{g.bezeichnung}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{TIERART_LABEL[g.tierart] || g.tierart}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{g.betriebsnummer || '—'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>{g.aktueller_bestand}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{g.standort || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- BEWEGUNGEN ---------- */}
      {tab === 'bewegungen' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Bewegung erfassen <span style={styles.frist}>Meldefrist an HIT: 7 Tage</span>
              <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55`, marginLeft: 'auto' }} onClick={meldelisteErstellen}>📄 HIT-Meldeliste</button>
            </div>
            {aktiveGruppen.length === 0 ? <div style={styles.hint}>Lege zuerst im Reiter „Bestände" eine Tiergruppe an.</div> : (
              <>
                <div style={styles.grid}>
                  <label style={styles.lab}>Gruppe
                    <select style={styles.inp} value={nb.gruppe_id} onChange={(e) => setNb({ ...nb, gruppe_id: e.target.value })}>
                      <option value="">— wählen —</option>
                      {aktiveGruppen.map((g) => <option key={g.id} value={g.id}>{g.bezeichnung} ({TIERART_LABEL[g.tierart] || g.tierart})</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Ereignis
                    <select style={styles.inp} value={nb.art} onChange={(e) => setNb({ ...nb, art: e.target.value })}>
                      {BEWEGUNG_ARTEN.map((a) => <option key={a} value={a}>{ART_LABEL[a]}</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Datum<input type="date" style={styles.inp} value={nb.datum} onChange={(e) => setNb({ ...nb, datum: e.target.value })} /></label>
                  <label style={styles.lab}>Anzahl<input style={styles.inp} inputMode="numeric" value={nb.anzahl} onChange={(e) => setNb({ ...nb, anzahl: e.target.value })} /></label>
                  <label style={styles.lab}>Ohrmarke (optional)<input style={styles.inp} value={nb.ohrmarke} onChange={(e) => setNb({ ...nb, ohrmarke: e.target.value })} /></label>
                  <label style={styles.lab}>Herkunft / Ziel<input style={styles.inp} value={nb.partner} onChange={(e) => setNb({ ...nb, partner: e.target.value })} placeholder="Betrieb, Händler, TBA" /></label>
                </div>
                <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'bewegung' ? 0.6 : 1 }} disabled={busy === 'bewegung'} onClick={bewegungAnlegen}>＋ Erfassen</button>
              </>
            )}
          </div>
          {!laden && (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {bewegungen.length === 0 ? <Leerzustand icon="🔁" titel="Noch keine Bewegungen" text="Zu- und Abgänge sind meldepflichtig — die 7-Tage-Ampel behält die Frist im Blick." schritte={["Bewegung erfassen (Zugang/Abgang)", "Datum und Anzahl eintragen", "Fristgerecht an HIT melden"]} /> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Datum</th><th style={styles.th}>Gruppe</th><th style={styles.th}>Ereignis</th><th style={{ ...styles.th, textAlign: 'right' }}>Anzahl</th><th style={styles.th}>Meldung</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th></tr></thead>
                  <tbody>
                    {bewegungen.map((b) => (
                      <tr key={b.id}>
                        <td style={styles.td}>{fmtDatum(b.datum)}</td>
                        <td style={styles.td}>{gruppeById(b.gruppe_id)?.bezeichnung ?? '—'}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{ART_LABEL[b.art] || b.art}{b.ohrmarke ? <span style={{ color: C.textDim }}> · {b.ohrmarke}</span> : ''}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{b.anzahl}</td>
                        <td style={styles.td}><MeldeBadge b={b} />{b.gemeldet && b.gemeldet_am ? <span style={{ color: C.textDim, marginLeft: 6, fontSize: 'clamp(11px,0.9vw,14px)' }}>{fmtDatum(b.gemeldet_am)}</span> : null}</td>
                        <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {!b.gemeldet && <button style={{ ...styles.mini, color: C.green, borderColor: `${C.green}55` }} disabled={busy === b.id} onClick={() => alsGemeldet(b)}>✓ gemeldet</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- STICHTAG ---------- */}
      {tab === 'stichtag' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitel}>Stichtagsmeldung <span style={styles.frist}>jährlicher Bestand (z. B. Schaf/Ziege zum 01.01.)</span></div>
            {aktiveGruppen.length === 0 ? <div style={styles.hint}>Lege zuerst im Reiter „Bestände" eine Tiergruppe an.</div> : (
              <>
                <div style={styles.grid}>
                  <label style={styles.lab}>Gruppe
                    <select style={styles.inp} value={ns.gruppe_id} onChange={(e) => setNs({ ...ns, gruppe_id: e.target.value })}>
                      <option value="">— wählen —</option>
                      {aktiveGruppen.map((g) => <option key={g.id} value={g.id}>{g.bezeichnung} ({TIERART_LABEL[g.tierart] || g.tierart})</option>)}
                    </select>
                  </label>
                  <label style={styles.lab}>Jahr<input style={styles.inp} inputMode="numeric" value={ns.jahr} onChange={(e) => setNs({ ...ns, jahr: e.target.value })} /></label>
                  <label style={styles.lab}>Stichtag<input type="date" style={styles.inp} value={ns.stichtag} onChange={(e) => setNs({ ...ns, stichtag: e.target.value })} /></label>
                  <label style={styles.lab}>Bestand am Stichtag<input style={styles.inp} inputMode="numeric" value={ns.anzahl} onChange={(e) => setNs({ ...ns, anzahl: e.target.value })} /></label>
                </div>
                <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'stichtag' ? 0.6 : 1 }} disabled={busy === 'stichtag'} onClick={stichtagAnlegen}>＋ Erfassen</button>
              </>
            )}
          </div>
          {!laden && (
            <div style={{ ...styles.card, marginTop: 16, padding: 0, overflowX: 'auto' }}>
              {stichtage.length === 0 ? <Leerzustand icon="📆" titel="Noch keine Stichtagsmeldungen" text="Die jährliche Stichtagsmeldung wird hier dokumentiert." schritte={["Stichtag anlegen", "Bestand zum Stichtag erfassen", "Meldung ablegen"]} /> : (
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Stichtag</th><th style={styles.th}>Gruppe</th><th style={styles.th}>Tierart</th><th style={{ ...styles.th, textAlign: 'right' }}>Bestand</th></tr></thead>
                  <tbody>
                    {stichtage.map((s) => (
                      <tr key={s.id}>
                        <td style={styles.td}>{fmtDatum(s.stichtag)}</td>
                        <td style={styles.td}>{s.gruppe_id ? (gruppeById(s.gruppe_id)?.bezeichnung ?? '—') : '—'}</td>
                        <td style={{ ...styles.td, color: C.textDim }}>{s.tierart ? (TIERART_LABEL[s.tierart] || s.tierart) : '—'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>{s.anzahl}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div></div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: '4px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 24, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  tabs: { display: 'flex', gap: 8, margin: '4px 0 12px', flexWrap: 'wrap' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' },
  frist: { fontSize: 'clamp(11px, 1vw, 15px)', color: C.textDim, fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 720 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
