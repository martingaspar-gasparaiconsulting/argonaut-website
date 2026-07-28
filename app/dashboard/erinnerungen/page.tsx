'use client';

// ============================================================
// ARGONAUT OS · B-III (Teil 2) · Erinnerungen / No-Show-Prävention
// Arbeitsliste fälliger Erinnerungen je Kanal. Dockt lose an das Reservierungs-
// Modul an: „Aus Reservierung übernehmen" legt mit einem Klick eine Erinnerung
// (24 Std Vorlauf) an; die No-Show-Quote kommt live aus reservierung_vorgang.
// Reine Formeln aus lib/erinnerungen (0 €, node-getestet).
// Pfad: app/dashboard/erinnerungen/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  KANAELE, kanalInfo, BEZUG_TYPEN, STATUS_INFO, faelligAus, restStunden, bucket,
  zaehleErinnerungen, VORLAUF_STD_STD,
  type BezugTyp, type Kanal, type ErinnerungStatus,
} from '@/lib/erinnerungen';
import { augeErinnerungen } from '@/lib/auge';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const FARBE: Record<string, string> = { gold: C.gold, cyan: C.cyan, green: C.green, textDim: C.textDim, danger: C.danger, warn: C.warn };

type Erinnerung = {
  id: string; titel: string | null; bezug_typ: BezugTyp; bezug_id: string | null;
  kontakt_id: string | null; kunde_name: string | null; kanal: Kanal;
  faellig_am: string | null; termin_am: string | null; status: string;
  erledigt_am: string | null; notiz: string | null; email: string | null; gesendet_am: string | null;
};
type ResVorgang = { id: string; art: string; kunde_name: string | null; kontakt_id: string | null; von: string | null; status: string; kennzeichen: string | null };
type Kontakt = { id: string; name: string };

function jetztLokal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function fmtZeit(iso: string | null) { if (!iso) return '—'; return iso.length >= 16 ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}. ${iso.slice(11, 16)}` : iso.slice(0, 10); }
function kontaktName(k: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return s(k.anzeigename) || [s(k.vorname), s(k.nachname)].filter(Boolean).join(' ') || s(k.name) || s(k.firmenname) || s(k.firma) || s(k.email) || 'Kontakt';
}
const RES_ART_LABEL: Record<string, string> = { tischreservierung: 'Tischreservierung', einlagerung: 'Einlagerung', vorbestellung: 'Vorbestellung' };

const LEER_NE = {
  bezug_typ: 'frei' as BezugTyp, bezug_id: '', kanal: 'telefon' as Kanal, kontakt_id: '',
  kunde_name: '', titel: '', faellig_am: jetztLokal(), termin_am: '', notiz: '', email: '',
};

export default function ErinnerungenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [erinnerungen, setErinnerungen] = useState<Erinnerung[]>([]);
  const [resVorgaenge, setResVorgaenge] = useState<ResVorgang[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [laden, setLaden] = useState(true);
  const [nurOffen, setNurOffen] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ne, setNe] = useState({ ...LEER_NE });

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [e, r, k] = await Promise.all([
        supabase.from('erinnerung').select('*').order('faellig_am', { ascending: true }),
        supabase.from('reservierung_vorgang').select('id,art,kunde_name,kontakt_id,von,status,kennzeichen').order('von', { ascending: true }),
        supabase.from('kontakte').select('*'),
      ]);
      setErinnerungen((e.data as Erinnerung[]) ?? []);
      setResVorgaenge((r.data as ResVorgang[]) ?? []);
      setKontakte(((k.data as Record<string, unknown>[]) ?? []).map((x) => ({ id: String(x.id), name: kontaktName(x) })).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_();
    })();
  }, [laden_]);

  const kennzahlen = useMemo(() => zaehleErinnerungen(erinnerungen, new Date()), [erinnerungen]);
  const noShows = useMemo(() => resVorgaenge.filter((v) => v.art === 'tischreservierung' && v.status === 'no_show').length, [resVorgaenge]);

  // Offene Reservierungen/Vorgänge in der Zukunft, für die Schnellanlage.
  const offeneRes = useMemo(() => {
    const jetzt = Date.now();
    return resVorgaenge.filter((v) =>
      v.von && new Date(v.von).getTime() >= jetzt - 3600000 &&
      !['storniert', 'no_show', 'ausgelagert', 'abgeholt', 'entsorgt', 'erschienen'].includes(v.status),
    );
  }, [resVorgaenge]);

  function kontaktWahl(id: string) {
    const k = kontakte.find((x) => x.id === id);
    setNe((f) => ({ ...f, kontakt_id: id, kunde_name: k ? k.name : f.kunde_name }));
  }

  function ausReservierung(id: string) {
    const v = resVorgaenge.find((x) => x.id === id);
    if (!v) { setNe((f) => ({ ...f, bezug_id: '' })); return; }
    const label = RES_ART_LABEL[v.art] ?? 'Vorgang';
    setNe((f) => ({
      ...f,
      bezug_typ: 'reservierung', bezug_id: v.id,
      kontakt_id: v.kontakt_id ?? '', kunde_name: v.kunde_name ?? f.kunde_name,
      termin_am: v.von ? v.von.slice(0, 16) : '',
      faellig_am: v.von ? faelligAus(v.von, VORLAUF_STD_STD) : f.faellig_am,
      titel: `Erinnerung: ${label}${v.kennzeichen ? ' ' + v.kennzeichen : ''}`,
    }));
  }

  async function anlegen() {
    if (!uid) return;
    if (!ne.faellig_am) { setFehler('Bitte einen Fälligkeitszeitpunkt angeben.'); return; }
    if (!ne.kunde_name.trim() && !ne.kontakt_id && !ne.titel.trim()) { setFehler('Bitte Titel oder Kunde angeben.'); return; }
    setBusy('anlegen'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('erinnerung').insert({
        owner_user_id: uid, titel: ne.titel.trim() || null, bezug_typ: ne.bezug_typ,
        bezug_id: ne.bezug_id || null, kontakt_id: ne.kontakt_id || null,
        kunde_name: ne.kunde_name.trim() || null, kanal: ne.kanal,
        faellig_am: ne.faellig_am, termin_am: ne.termin_am || null, status: 'offen',
        notiz: ne.notiz.trim() || null, email: ne.email.trim() || null,
      });
      if (error) throw error;
      setNe({ ...LEER_NE, faellig_am: jetztLokal() });
      setOk('Erinnerung angelegt.'); await laden_();
    } catch (err: unknown) { setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function setzeStatus(e: Erinnerung, status: ErinnerungStatus) {
    setBusy(e.id); setFehler(null);
    try {
      const { error } = await supabase.from('erinnerung')
        .update({ status, erledigt_am: status === 'erledigt' ? new Date().toISOString() : null })
        .eq('id', e.id);
      if (error) throw error;
      await laden_();
    } catch (err: unknown) { setFehler('Status fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function senden(e: Erinnerung) {
    if (!e.email || !e.email.includes('@')) { setFehler('Für den E-Mail-Versand fehlt eine gültige Empfänger-E-Mail (Erinnerung bearbeiten).'); return; }
    setBusy(e.id); setFehler(null); setOk(null);
    try {
      const res = await fetch('/api/erinnerung-senden', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ erinnerungId: e.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setFehler(j?.error || 'Versand fehlgeschlagen.'); return; }
      setOk('E-Mail versendet.'); await laden_();
    } catch (err: unknown) { setFehler('Fehler: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  const kontaktName_ = (id: string | null) => kontakte.find((k) => k.id === id)?.name ?? null;
  const liste = useMemo(() => nurOffen ? erinnerungen.filter((e) => (e.status ?? 'offen') === 'offen') : erinnerungen, [erinnerungen, nurOffen]);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Erinnerungen</div>
      <h1 style={styles.h1}>🔔 Erinnerungen & No-Show-Prävention</h1>
      <p style={styles.sub}>Wer rechtzeitig erinnert, hat weniger No-Shows. Lege Erinnerungen per Telefon, E-Mail, SMS, WhatsApp oder Brief an — oder übernimm eine Reservierung mit einem Klick (24 Std Vorlauf). Die Arbeitsliste zeigt, was jetzt dran ist.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={styles.kpis}>
        <Kpi label="Fällig jetzt" value={String(kennzahlen.faelligJetzt)} accent={kennzahlen.faelligJetzt ? C.warn : C.text} />
        <Kpi label="Heute" value={String(kennzahlen.heute)} accent={C.cyan} />
        <Kpi label="Diese Woche" value={String(kennzahlen.dieseWoche)} accent={C.text} />
        <Kpi label="Offen gesamt" value={String(kennzahlen.offen)} accent={C.gold} />
        <Kpi label="No-Shows (Reservierung)" value={String(noShows)} accent={noShows ? C.danger : C.green} />
      </div>
      {!laden && (
        <div style={{ marginBottom: 14 }}>
          <KiAuge modul="Erinnerungen" regel={augeErinnerungen(kennzahlen)} />
        </div>
      )}

      {/* ---------- NEUE ERINNERUNG ---------- */}
      <div style={styles.card}>
        <div style={styles.cardTitel}>Neue Erinnerung</div>
        {offeneRes.length > 0 && (
          <label style={{ ...styles.lab, marginBottom: 12 }}>Aus Reservierung übernehmen (optional)
            <select style={styles.inp} value={ne.bezug_id} onChange={(e) => ausReservierung(e.target.value)}>
              <option value="">— frei anlegen —</option>
              {offeneRes.map((v) => <option key={v.id} value={v.id}>{RES_ART_LABEL[v.art] ?? v.art} · {v.kunde_name || 'Kunde'} · {fmtZeit(v.von)}</option>)}
            </select>
          </label>
        )}
        <div style={styles.grid}>
          <label style={styles.lab}>Titel<input style={styles.inp} value={ne.titel} onChange={(e) => setNe({ ...ne, titel: e.target.value })} placeholder="z. B. Reservierung bestätigen" /></label>
          <label style={styles.lab}>Kanal
            <select style={styles.inp} value={ne.kanal} onChange={(e) => setNe({ ...ne, kanal: e.target.value as Kanal })}>
              {KANAELE.map((k) => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Kunde (Kontakt)
            <select style={styles.inp} value={ne.kontakt_id} onChange={(e) => kontaktWahl(e.target.value)}>
              <option value="">— kein Kontakt —</option>
              {kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Kunde (Freitext)<input style={styles.inp} value={ne.kunde_name} onChange={(e) => setNe({ ...ne, kunde_name: e.target.value })} /></label>
          <label style={styles.lab}>E-Mail (für Versand)<input style={styles.inp} type="email" value={ne.email} onChange={(e) => setNe({ ...ne, email: e.target.value })} placeholder="kunde@example.com" /></label>
          <label style={styles.lab}>Fällig am (erinnern)<input type="datetime-local" style={styles.inp} value={ne.faellig_am} onChange={(e) => setNe({ ...ne, faellig_am: e.target.value })} /></label>
          <label style={styles.lab}>Termin am (optional)<input type="datetime-local" style={styles.inp} value={ne.termin_am} onChange={(e) => setNe({ ...ne, termin_am: e.target.value })} /></label>
          <label style={styles.lab}>Bezug
            <select style={styles.inp} value={ne.bezug_typ} onChange={(e) => setNe({ ...ne, bezug_typ: e.target.value as BezugTyp })}>
              {BEZUG_TYPEN.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </label>
          <label style={{ ...styles.lab, gridColumn: '1 / -1' }}>Notiz (optional)<input style={styles.inp} value={ne.notiz} onChange={(e) => setNe({ ...ne, notiz: e.target.value })} /></label>
        </div>
        <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'anlegen' ? 0.6 : 1 }} disabled={busy === 'anlegen'} onClick={anlegen}>＋ Erinnerung anlegen</button>
      </div>

      {/* ---------- ARBEITSLISTE ---------- */}
      <div style={{ display: 'flex', gap: 8, margin: '16px 0 10px' }}>
        <button style={{ ...styles.tab, ...(nurOffen ? styles.tabAn : {}) }} onClick={() => setNurOffen(true)}>Offen</button>
        <button style={{ ...styles.tab, ...(!nurOffen ? styles.tabAn : {}) }} onClick={() => setNurOffen(false)}>Alle</button>
      </div>

      {laden ? <p style={styles.hint}>Lädt …</p> : (
        <div style={{ ...styles.card, padding: 0, overflowX: 'auto' }}>
          {liste.length === 0 ? <div style={{ padding: 20, color: C.textDim }}>{nurOffen ? 'Keine offenen Erinnerungen — sauber.' : 'Noch keine Erinnerungen.'}</div> : (
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>Fällig</th><th style={styles.th}>Titel</th><th style={styles.th}>Kunde</th>
                <th style={styles.th}>Kanal</th><th style={styles.th}>Status</th><th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th>
              </tr></thead>
              <tbody>
                {liste.map((e) => {
                  const st = (e.status ?? 'offen') as ErinnerungStatus;
                  const si = STATUS_INFO[st] ?? STATUS_INFO.offen;
                  const ki = kanalInfo(e.kanal);
                  const b = e.faellig_am && st === 'offen' ? bucket(e.faellig_am, new Date()) : null;
                  const rest = e.faellig_am && st === 'offen' ? restStunden(e.faellig_am, new Date()) : null;
                  const faelligFarbe = b === 'ueberfaellig' ? C.danger : b === 'heute' ? C.warn : C.textDim;
                  return (
                    <tr key={e.id} style={{ opacity: st === 'entfallen' ? 0.5 : 1 }}>
                      <td style={{ ...styles.td, color: faelligFarbe, whiteSpace: 'nowrap' }}>
                        {fmtZeit(e.faellig_am)}
                        {b === 'ueberfaellig' && <div style={{ fontSize: 12 }}>überfällig{rest != null ? ` (${Math.abs(rest)} h)` : ''}</div>}
                        {b === 'heute' && <div style={{ fontSize: 12 }}>heute</div>}
                      </td>
                      <td style={styles.td}>{e.titel || '—'}{e.termin_am ? <div style={{ color: C.textDim, fontSize: 13 }}>Termin: {fmtZeit(e.termin_am)}</div> : ''}{e.notiz ? <div style={{ color: C.textDim, fontSize: 13 }}>{e.notiz}</div> : ''}</td>
                      <td style={{ ...styles.td, color: C.textDim }}>{e.kunde_name || kontaktName_(e.kontakt_id) || '—'}</td>
                      <td style={styles.td}>{ki.icon} <span style={{ color: C.textDim, fontSize: 13 }}>{ki.label}</span></td>
                      <td style={styles.td}><span style={{ ...styles.badge, color: FARBE[si.farbe], borderColor: FARBE[si.farbe] }}>{si.label}</span></td>
                      <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {st === 'offen' && e.kanal === 'email' && <button style={{ ...styles.mini, color: C.cyan, borderColor: `${C.cyan}55` }} disabled={busy === e.id} onClick={() => senden(e)}>✉ Senden</button>}
                        {st === 'offen' && <button style={{ ...styles.mini, color: C.green, borderColor: `${C.green}55` }} disabled={busy === e.id} onClick={() => setzeStatus(e, 'erledigt')}>✓ Erinnert</button>}
                        {st === 'offen' && <button style={styles.mini} disabled={busy === e.id} onClick={() => setzeStatus(e, 'entfallen')}>Entfällt</button>}
                        {st !== 'offen' && <button style={{ ...styles.mini, color: C.gold, borderColor: `${C.gold}55` }} disabled={busy === e.id} onClick={() => setzeStatus(e, 'offen')}>↺ Offen</button>}
                        {e.gesendet_am && <div style={{ color: C.green, fontSize: 12 }}>✓ gesendet {fmtZeit(e.gesendet_am)}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
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
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '4px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 24, fontWeight: 800, lineHeight: 1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '8px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 'clamp(12px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6, marginBottom: 4, whiteSpace: 'nowrap' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 760 },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, whiteSpace: 'nowrap' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
