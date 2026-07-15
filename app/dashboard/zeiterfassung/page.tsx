'use client';

// ============================================================
// ARGONAUT OS · HR Zeiterfassung / Stempeluhr (Kern) — B3
// Punch-Clock: Kommen · Pause · Gehen · live · Tagesliste · Monatssumme
// Jeder stempelt SEINE eigene Zeit (ueber sein mitarbeiter-Profil).
// Manipulationssicher: nach "Gehen" sperrt die RLS die Zeile fuer den MA.
// Pfad: app/dashboard/zeiterfassung/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useRef, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navySoft: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  cardBg: 'rgba(255,255,255,0.03)', inputBg: 'rgba(255,255,255,0.05)', danger: '#E06666', warn: '#E0A24C',
};

type Mitarbeiter = { id: string; owner_user_id: string; vorname: string; nachname: string; position: string | null };
type Sitzung = {
  id: string; datum: string; kommen_um: string; gehen_um: string | null;
  pause_minuten: number; pause_offen_seit: string | null; notiz: string | null;
};

function zwei(n: number): string { return n < 10 ? '0' + n : String(n); }
function uhrzeit(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return zwei(d.getHours()) + ':' + zwei(d.getMinutes());
}
function dauerStr(minuten: number): string {
  const m = Math.max(0, Math.round(minuten));
  const h = Math.floor(m / 60);
  return h + 'h ' + zwei(m % 60) + 'm';
}
// Netto-Arbeitszeit einer Sitzung (Pause abgezogen, laufende Pause beruecksichtigt)
function nettoMin(s: Sitzung, nowMs: number): number {
  const start = new Date(s.kommen_um).getTime();
  const ende = s.gehen_um ? new Date(s.gehen_um).getTime() : nowMs;
  const brutto = (ende - start) / 60000;
  let pause = s.pause_minuten;
  if (s.pause_offen_seit) pause += (nowMs - new Date(s.pause_offen_seit).getTime()) / 60000;
  return Math.max(0, brutto - pause);
}
function heuteISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' + zwei(d.getMonth() + 1) + '-' + zwei(d.getDate());
}
function monatsStart(): string {
  const d = new Date();
  return d.getFullYear() + '-' + zwei(d.getMonth() + 1) + '-01';
}

export default function ZeiterfassungPage() {
  const [ma, setMa] = useState<Mitarbeiter | null>(null);
  const [kontoOhneProfil, setKontoOhneProfil] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [offen, setOffen] = useState<Sitzung | null>(null);
  const [heute, setHeute] = useState<Sitzung[]>([]);
  const [monatMin, setMonatMin] = useState(0);

  // Live-Uhr (Tick jede Sekunde, nur fuer Anzeige)
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const ladeAlles = useCallback(async () => {
    setLoading(true); setMsg(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) { setKontoOhneProfil(true); setLoading(false); return; }

      const { data: maRow } = await supabase.from('mitarbeiter')
        .select('id,owner_user_id,vorname,nachname,position')
        .eq('auth_user_id', uid).maybeSingle();
      if (!maRow) { setKontoOhneProfil(true); setLoading(false); return; }
      const m = maRow as Mitarbeiter;
      setMa(m);

      // Heutige Sitzungen
      const { data: heuteRows } = await supabase.from('hr_zeiterfassung')
        .select('id,datum,kommen_um,gehen_um,pause_minuten,pause_offen_seit,notiz')
        .eq('mitarbeiter_id', m.id).eq('datum', heuteISO())
        .order('kommen_um', { ascending: true });
      const liste = (heuteRows as Sitzung[]) ?? [];
      setHeute(liste);
      setOffen(liste.find((s) => !s.gehen_um) ?? null);

      // Monatssumme (alle Sitzungen ab Monatsanfang)
      const { data: monatRows } = await supabase.from('hr_zeiterfassung')
        .select('id,datum,kommen_um,gehen_um,pause_minuten,pause_offen_seit,notiz')
        .eq('mitarbeiter_id', m.id).gte('datum', monatsStart());
      const summe = ((monatRows as Sitzung[]) ?? []).reduce((s, r) => s + nettoMin(r, Date.now()), 0);
      setMonatMin(summe);
    } catch {
      setMsg('Daten konnten nicht geladen werden.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { ladeAlles(); }, [ladeAlles]);

  async function abmelden() {
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }

  async function kommen() {
    if (!ma || offen) return;
    setBusy(true); setMsg(null);
    try {
      const { error } = await supabase.from('hr_zeiterfassung').insert({
        owner_user_id: ma.owner_user_id, mitarbeiter_id: ma.id,
        datum: heuteISO(), kommen_um: new Date().toISOString(),
      });
      if (error) throw error;
      setMsg('Eingestempelt. Guten Start!');
      await ladeAlles();
    } catch (e: unknown) { setMsg('Einstempeln fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setBusy(false); }
  }

  async function pauseStart() {
    if (!ma || !offen || offen.pause_offen_seit) return;
    setBusy(true); setMsg(null);
    try {
      const { error } = await supabase.from('hr_zeiterfassung')
        .update({ pause_offen_seit: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', offen.id);
      if (error) throw error;
      await ladeAlles();
    } catch (e: unknown) { setMsg('Pause starten fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setBusy(false); }
  }

  async function pauseEnde() {
    if (!ma || !offen || !offen.pause_offen_seit) return;
    setBusy(true); setMsg(null);
    try {
      const zusatz = Math.round((Date.now() - new Date(offen.pause_offen_seit).getTime()) / 60000);
      const { error } = await supabase.from('hr_zeiterfassung')
        .update({ pause_minuten: offen.pause_minuten + zusatz, pause_offen_seit: null, updated_at: new Date().toISOString() })
        .eq('id', offen.id);
      if (error) throw error;
      await ladeAlles();
    } catch (e: unknown) { setMsg('Pause beenden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setBusy(false); }
  }

  async function gehen() {
    if (!ma || !offen) return;
    if (!window.confirm('Jetzt ausstempeln? Danach kann diese Sitzung nur noch der Chef korrigieren.')) return;
    setBusy(true); setMsg(null);
    try {
      // Falls noch in Pause: Pause sauber abschliessen
      let pauseGesamt = offen.pause_minuten;
      if (offen.pause_offen_seit) {
        pauseGesamt += Math.round((Date.now() - new Date(offen.pause_offen_seit).getTime()) / 60000);
      }
      const { error } = await supabase.from('hr_zeiterfassung')
        .update({ gehen_um: new Date().toISOString(), pause_minuten: pauseGesamt, pause_offen_seit: null, updated_at: new Date().toISOString() })
        .eq('id', offen.id);
      if (error) throw error;
      setMsg('Ausgestempelt. Schönen Feierabend!');
      await ladeAlles();
    } catch (e: unknown) { setMsg('Ausstempeln fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setBusy(false); }
  }

  // Anzeige-Status
  const inPause = !!offen?.pause_offen_seit;
  const liveSitzung = offen ? nettoMin(offen, now) : 0;
  const heuteSumme = heute.reduce((s, r) => s + nettoMin(r, now), 0);
  const aktuellePause = inPause && offen?.pause_offen_seit
    ? (now - new Date(offen.pause_offen_seit).getTime()) / 60000 : 0;

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontWeight: 900, letterSpacing: '0.15em', fontSize: 'clamp(16px, 1.38vw, 22px)' }}>ARGONAUT</span>
          <span style={{ fontSize: 'clamp(10px, 0.88vw, 14px)', color: C.gold, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>Zeiterfassung</span>
        </div>
        <button style={styles.ghostBtn} onClick={abmelden}>Abmelden</button>
      </div>

      <div style={styles.wrap}>
        {loading && <div style={styles.stateBox}>Lädt …</div>}

        {!loading && kontoOhneProfil && (
          <div style={styles.stateBox}>
            <div style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 700, color: C.text, marginBottom: 8 }}>Kein Mitarbeiter-Profil für Zeiterfassung</div>
            <div>Dieser Zugang ist keinem Mitarbeiter-Profil zugeordnet. Zum Stempeln wird ein Mitarbeiter-Profil benötigt.</div>
          </div>
        )}

        {!loading && ma && (
          <>
            <div style={{ marginBottom: 24 }}>
              <div style={styles.eyebrow}>Stempeluhr</div>
              <h1 style={styles.h1}>{ma.vorname} {ma.nachname}</h1>
              <p style={styles.sub}>{ma.position || 'Mitarbeiter'} · {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
            </div>

            {msg && <div style={styles.infoMsg}>{msg}</div>}

            {/* Live-Status */}
            <section style={styles.clockCard}>
              <div style={styles.liveClock}>{zwei(new Date(now).getHours())}:{zwei(new Date(now).getMinutes())}:{zwei(new Date(now).getSeconds())}</div>
              <div style={styles.statusZeile}>
                {!offen && <span style={{ color: C.textDim }}>Nicht eingestempelt</span>}
                {offen && !inPause && <span style={{ color: C.green, fontWeight: 700 }}>● Arbeitszeit läuft · seit {uhrzeit(offen.kommen_um)}</span>}
                {offen && inPause && <span style={{ color: C.warn, fontWeight: 700 }}>❚❚ In Pause · seit {uhrzeit(offen.pause_offen_seit)}</span>}
              </div>

              {offen && (
                <div style={styles.liveGrid}>
                  <div style={styles.liveStat}>
                    <div style={styles.liveStatLabel}>Heutige Arbeitszeit</div>
                    <div style={styles.liveStatValue}>{dauerStr(liveSitzung)}</div>
                  </div>
                  <div style={styles.liveStat}>
                    <div style={styles.liveStatLabel}>Pause heute</div>
                    <div style={styles.liveStatValue}>{dauerStr((offen.pause_minuten || 0) + aktuellePause)}</div>
                  </div>
                </div>
              )}

              {/* Aktions-Buttons */}
              <div style={styles.btnRow}>
                {!offen && (
                  <button style={{ ...styles.bigBtn, ...styles.btnKommen, opacity: busy ? 0.6 : 1 }} onClick={kommen} disabled={busy}>
                    ▶ Kommen
                  </button>
                )}
                {offen && !inPause && (
                  <>
                    <button style={{ ...styles.bigBtn, ...styles.btnPause, opacity: busy ? 0.6 : 1 }} onClick={pauseStart} disabled={busy}>❚❚ Pause</button>
                    <button style={{ ...styles.bigBtn, ...styles.btnGehen, opacity: busy ? 0.6 : 1 }} onClick={gehen} disabled={busy}>■ Gehen</button>
                  </>
                )}
                {offen && inPause && (
                  <>
                    <button style={{ ...styles.bigBtn, ...styles.btnKommen, opacity: busy ? 0.6 : 1 }} onClick={pauseEnde} disabled={busy}>▶ Pause beenden</button>
                    <button style={{ ...styles.bigBtn, ...styles.btnGehen, opacity: busy ? 0.6 : 1 }} onClick={gehen} disabled={busy}>■ Gehen</button>
                  </>
                )}
              </div>
            </section>

            {/* Monatssumme */}
            <div style={styles.statGrid}>
              <Stat label="Arbeitszeit heute" value={dauerStr(heuteSumme)} accent={C.cyan} />
              <Stat label={`Summe ${new Date().toLocaleDateString('de-DE', { month: 'long' })}`} value={dauerStr(monatMin)} />
              <Stat label="Sitzungen heute" value={String(heute.length)} />
            </div>

            {/* Tagesliste */}
            <section style={{ ...styles.card, marginTop: 18 }}>
              <h2 style={styles.cardTitle}>Heutige Buchungen</h2>
              {heute.length === 0 && <div style={styles.listHint}>Heute noch nicht gestempelt.</div>}
              {heute.map((s) => (
                <div key={s.id} style={styles.row}>
                  <div>
                    <div style={styles.rowName}>{uhrzeit(s.kommen_um)} – {uhrzeit(s.gehen_um)}</div>
                    <div style={styles.rowMeta}>
                      {s.pause_minuten > 0 && <span>Pause {dauerStr(s.pause_minuten)}</span>}
                      {!s.gehen_um && <span style={{ color: C.green, fontWeight: 700 }}>● läuft</span>}
                    </div>
                  </div>
                  <div style={styles.rowDauer}>{dauerStr(nettoMin(s, now))}</div>
                </div>
              ))}
            </section>

            <div style={styles.hinweis}>
              Hinweis: Buchungen werden täglich erfasst (Beginn, Ende, Dauer, Pausen) und für ca. 2 Jahre aufbewahrt.
              Eine abgeschlossene Sitzung kann nur noch über den Chef korrigiert werden.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={styles.statBox}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{ ...styles.statValue, color: accent || C.text }}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif" },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 28px', borderBottom: `1px solid ${C.line}`, background: 'rgba(10,22,40,0.95)', position: 'sticky', top: 0, zIndex: 10 },
  wrap: { maxWidth: 760, margin: '0 auto', padding: '32px 28px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(32px, 2.81vw, 45px)', fontWeight: 700, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 0', fontSize: 'clamp(15px, 1.31vw, 21px)' },
  stateBox: { padding: 40, textAlign: 'center', color: C.textDim, fontSize: 'clamp(15px, 1.31vw, 21px)' },

  clockCard: { background: C.navySoft, border: `1px solid ${C.line}`, borderRadius: 16, padding: '28px 24px', textAlign: 'center', marginBottom: 22 },
  liveClock: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(52px, 4.56vw, 73px)', fontWeight: 800, letterSpacing: '0.04em', color: C.text, lineHeight: 1 },
  statusZeile: { marginTop: 10, fontSize: 'clamp(15px, 1.31vw, 21px)' },
  liveGrid: { display: 'flex', justifyContent: 'center', gap: 36, margin: '20px 0 6px' },
  liveStat: { textAlign: 'center' },
  liveStatLabel: { fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  liveStatValue: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(24px, 2.13vw, 34px)', fontWeight: 700, color: C.cyan },

  btnRow: { display: 'flex', gap: 12, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' },
  bigBtn: { border: 'none', borderRadius: 12, padding: '16px 28px', fontSize: 'clamp(17px, 1.5vw, 24px)', fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", minWidth: 150 },
  btnKommen: { background: C.green, color: '#04130b' },
  btnPause: { background: C.warn, color: '#1a1304' },
  btnGehen: { background: C.danger, color: '#1a0606' },

  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 22 },
  statBox: { background: C.cardBg, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' },
  statLabel: { fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  statValue: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(22px, 1.94vw, 31px)', fontWeight: 700 },

  card: { background: C.navySoft, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 },
  cardTitle: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(18px, 1.56vw, 25px)', fontWeight: 700, margin: '0 0 14px', color: C.text },
  listHint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '8px 0' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  rowName: { fontWeight: 600, color: C.text, fontSize: 'clamp(15px, 1.31vw, 21px)' },
  rowMeta: { color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  rowDauer: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(18px, 1.56vw, 25px)', fontWeight: 700, color: C.cyan },

  infoMsg: { marginBottom: 18, color: C.text, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  hinweis: { marginTop: 18, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, lineHeight: 1.5, padding: '0 4px' },
};
