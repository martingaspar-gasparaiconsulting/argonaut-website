'use client';

// ============================================================
// ARGONAUT OS · HR Zeiterfassung / Stempeluhr (Kern) — B3
// Punch-Clock: Kommen · Pause · Gehen · live · Tagesliste · Monatssumme
// Jeder stempelt SEINE eigene Zeit (ueber sein mitarbeiter-Profil).
// Manipulationssicher: nach "Gehen" sperrt die RLS die Zeile fuer den MA.
// Pfad: app/dashboard/zeiterfassung/page.tsx
//
// 15.08.26 · OFFLINE-FAEHIG (Thema 3, Schritt 4)
// Gestempelt wird im Keller, im Aufzug, in der Tiefgarage — also genau dort,
// wo kein Netz ist. Deshalb:
//   · Jede Buchung wird ZUERST auf dem Geraet festgehalten und dann gesendet.
//     Scheitert das Senden, wandert sie in die Warteschlange (lib/offline-
//     Warteschlange) und geht automatisch raus, sobald wieder Empfang da ist.
//   · Die Uhrzeit entsteht beim STEMPELN, nie beim Senden. Wer um 7:12 im
//     Funkloch kommt und um 9:40 Empfang hat, bucht 7:12.
//   · Neue Sitzungen bekommen ihre id schon hier (nicht von der Datenbank) —
//     nur so lassen sich Pause und Gehen einer noch nicht uebertragenen
//     Sitzung ueberhaupt zuordnen.
//   · Die Tagesliste wird lokal gespiegelt, damit die Seite auch ohne Netz
//     den richtigen Stand zeigt.
// Nichts davon aendert die Buchungslogik selbst: online laeuft alles wie bisher.
// ============================================================

import { useState, useEffect, useCallback, useRef, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { browserSpeicher, einreihen, neueId } from '@/lib/offlineWarteschlange';
import { WARTESCHLANGE_EVENT } from '../_components/OfflineSync';

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

// ---------------------------------------------------------------------------
// Lokaler Spiegel der heutigen Buchungen — damit die Seite auch ohne Netz den
// richtigen Stand zeigt und der Mitarbeiter sieht, dass sein Stempeln ankam.
// ---------------------------------------------------------------------------
const SPIEGEL_KEY = 'argonaut-zeiterfassung-';

function spiegelLesen(datum: string): Sitzung[] {
  try {
    const roh = window.localStorage.getItem(SPIEGEL_KEY + datum);
    if (!roh) return [];
    const daten = JSON.parse(roh);
    return Array.isArray(daten) ? (daten as Sitzung[]) : [];
  } catch { return []; }
}

function spiegelSchreiben(datum: string, liste: Sitzung[]): void {
  try { window.localStorage.setItem(SPIEGEL_KEY + datum, JSON.stringify(liste)); } catch { /* voll oder gesperrt */ }
}

/** Meldet der Sync-Komponente, dass etwas Neues in der Warteschlange liegt. */
function warteschlangeGeweckt(): void {
  try { window.dispatchEvent(new CustomEvent(WARTESCHLANGE_EVENT)); } catch { /* egal */ }
}

/** Kein Netz? Dann gar nicht erst versuchen — das spart dem Nutzer die Wartezeit. */
function sichtbarOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Netzproblem oder echte Ablehnung? Das ist der entscheidende Unterschied:
 * Ein Netzproblem gehoert in die Warteschlange, eine Ablehnung durch den Server
 * (fehlende Berechtigung, ungueltiger Wert) muss der Nutzer sofort erfahren.
 */
function istNetzfehler(meldung: string): boolean {
  const t = (meldung || '').toLowerCase();
  return t.includes('failed to fetch')
    || t.includes('fetch failed')
    || t.includes('networkerror')
    || t.includes('network request failed')
    || t.includes('load failed')
    || t.includes('timeout')
    || t.includes('err_internet_disconnected');
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
  const [ohneNetz, setOhneNetz] = useState(false);
  const [wartet, setWartet] = useState(0);

  // Live-Uhr (Tick jede Sekunde, nur fuer Anzeige)
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  /** Übernimmt eine Tagesliste in die Anzeige und in den lokalen Spiegel. */
  const uebernehmen = useCallback((liste: Sitzung[], spiegeln = true) => {
    const sortiert = [...liste].sort((a, b) => a.kommen_um.localeCompare(b.kommen_um));
    setHeute(sortiert);
    setOffen(sortiert.find((s) => !s.gehen_um) ?? null);
    if (spiegeln) spiegelSchreiben(heuteISO(), sortiert);
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
      const { data: heuteRows, error: heuteFehler } = await supabase.from('hr_zeiterfassung')
        .select('id,datum,kommen_um,gehen_um,pause_minuten,pause_offen_seit,notiz')
        .eq('mitarbeiter_id', m.id).eq('datum', heuteISO())
        .order('kommen_um', { ascending: true });
      if (heuteFehler) throw heuteFehler;
      uebernehmen((heuteRows as Sitzung[]) ?? []);
      setOhneNetz(false);

      // Monatssumme (alle Sitzungen ab Monatsanfang)
      const { data: monatRows } = await supabase.from('hr_zeiterfassung')
        .select('id,datum,kommen_um,gehen_um,pause_minuten,pause_offen_seit,notiz')
        .eq('mitarbeiter_id', m.id).gte('datum', monatsStart());
      const summe = ((monatRows as Sitzung[]) ?? []).reduce((s, r) => s + nettoMin(r, Date.now()), 0);
      setMonatMin(summe);
    } catch {
      // Ohne Netz: den lokalen Spiegel zeigen statt einer leeren Seite. Der
      // Mitarbeiter sieht dann genau das, was er heute selbst gestempelt hat.
      const gespiegelt = spiegelLesen(heuteISO());
      if (gespiegelt.length > 0) {
        uebernehmen(gespiegelt, false);
        setOhneNetz(true);
      } else {
        setMsg('Daten konnten nicht geladen werden.');
      }
    } finally { setLoading(false); }
  }, [uebernehmen]);

  useEffect(() => { ladeAlles(); }, [ladeAlles]);

  // Wenn die Verbindung zurückkommt, den echten Stand nachladen.
  useEffect(() => {
    const beiOnline = () => { setOhneNetz(false); ladeAlles(); };
    const beiOffline = () => setOhneNetz(true);
    window.addEventListener('online', beiOnline);
    window.addEventListener('offline', beiOffline);
    if (typeof navigator !== 'undefined' && !navigator.onLine) setOhneNetz(true);
    return () => {
      window.removeEventListener('online', beiOnline);
      window.removeEventListener('offline', beiOffline);
    };
  }, [ladeAlles]);

  async function abmelden() {
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }

  // -------------------------------------------------------------------------
  // Buchen — immer zuerst lokal, dann senden.
  //
  // Drei moegliche Ausgaenge:
  //   gesendet → die Datenbank hat es angenommen
  //   wartet   → kein Netz, liegt in der Warteschlange und geht spaeter raus
  //   fehler   → der Server hat geantwortet und abgelehnt (z.B. keine
  //              Berechtigung). Das gehoert NICHT in die Warteschlange, sonst
  //              wuerde es acht Mal vergeblich wiederholt.
  // -------------------------------------------------------------------------
  type Ausgang = { art: 'gesendet' } | { art: 'wartet' } | { art: 'fehler'; meldung: string };

  async function buchen(
    art: 'insert' | 'update',
    werte: Record<string, unknown>,
    beschreibung: string,
    jetzt: Date,
    zielId?: string,
  ): Promise<Ausgang> {
    const inSchlange = (): Ausgang => {
      einreihen(browserSpeicher(), { art, tabelle: 'hr_zeiterfassung', werte, zielId, beschreibung, jetzt });
      warteschlangeGeweckt();
      setWartet((n) => n + 1);
      setOhneNetz(true);
      return { art: 'wartet' };
    };

    if (sichtbarOffline()) return inSchlange();

    try {
      const { error } = art === 'insert'
        ? await supabase.from('hr_zeiterfassung').insert(werte)
        : await supabase.from('hr_zeiterfassung').update(werte).eq('id', String(zielId));
      if (!error) return { art: 'gesendet' };
      if (istNetzfehler(error.message)) return inSchlange();
      return { art: 'fehler', meldung: error.message };
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : '';
      if (istNetzfehler(m) || m === '') return inSchlange();
      return { art: 'fehler', meldung: m };
    }
  }

  async function kommen() {
    if (!ma || offen) return;
    setBusy(true); setMsg(null);
    try {
      const jetzt = new Date();
      const zeitpunkt = jetzt.toISOString();
      // Eigene id: nur so lassen sich Pause und Gehen einer noch nicht
      // uebertragenen Sitzung spaeter zuordnen.
      const id = neueId();
      const satz = {
        id, owner_user_id: ma.owner_user_id, mitarbeiter_id: ma.id,
        datum: heuteISO(), kommen_um: zeitpunkt,
      };

      // Sofort sichtbar machen — der Mitarbeiter soll nicht warten muessen.
      uebernehmen([...heute, {
        id, datum: heuteISO(), kommen_um: zeitpunkt, gehen_um: null,
        pause_minuten: 0, pause_offen_seit: null, notiz: null,
      }]);

      const aus = await buchen('insert', satz, `Kommen ${uhrzeit(zeitpunkt)}`, jetzt);
      if (aus.art === 'fehler') { setMsg('Einstempeln fehlgeschlagen: ' + aus.meldung); await ladeAlles(); return; }
      setMsg(aus.art === 'wartet'
        ? `Eingestempelt um ${uhrzeit(zeitpunkt)} — gespeichert, wird bei Verbindung übertragen.`
        : 'Eingestempelt. Guten Start!');
      if (aus.art === 'gesendet') await ladeAlles();
    } finally { setBusy(false); }
  }

  async function pauseStart() {
    if (!ma || !offen || offen.pause_offen_seit) return;
    setBusy(true); setMsg(null);
    try {
      const jetzt = new Date();
      const zeitpunkt = jetzt.toISOString();
      uebernehmen(heute.map((s) => (s.id === offen.id ? { ...s, pause_offen_seit: zeitpunkt } : s)));

      const aus = await buchen('update',
        { pause_offen_seit: zeitpunkt, updated_at: zeitpunkt },
        `Pause ab ${uhrzeit(zeitpunkt)}`, jetzt, offen.id);
      if (aus.art === 'fehler') { setMsg('Pause starten fehlgeschlagen: ' + aus.meldung); await ladeAlles(); return; }
      if (aus.art === 'wartet') setMsg(`Pause seit ${uhrzeit(zeitpunkt)} — gespeichert, wird bei Verbindung übertragen.`);
      else await ladeAlles();
    } finally { setBusy(false); }
  }

  async function pauseEnde() {
    if (!ma || !offen || !offen.pause_offen_seit) return;
    setBusy(true); setMsg(null);
    try {
      const jetzt = new Date();
      const zeitpunkt = jetzt.toISOString();
      const zusatz = Math.round((jetzt.getTime() - new Date(offen.pause_offen_seit).getTime()) / 60000);
      const gesamt = offen.pause_minuten + zusatz;
      uebernehmen(heute.map((s) => (s.id === offen.id ? { ...s, pause_minuten: gesamt, pause_offen_seit: null } : s)));

      const aus = await buchen('update',
        { pause_minuten: gesamt, pause_offen_seit: null, updated_at: zeitpunkt },
        `Pause beendet ${uhrzeit(zeitpunkt)} (${zusatz} Min)`, jetzt, offen.id);
      if (aus.art === 'fehler') { setMsg('Pause beenden fehlgeschlagen: ' + aus.meldung); await ladeAlles(); return; }
      if (aus.art === 'wartet') setMsg(`Pause beendet — ${zusatz} Minuten gespeichert, wird bei Verbindung übertragen.`);
      else await ladeAlles();
    } finally { setBusy(false); }
  }

  async function gehen() {
    if (!ma || !offen) return;
    if (!window.confirm('Jetzt ausstempeln? Danach kann diese Sitzung nur noch der Chef korrigieren.')) return;
    setBusy(true); setMsg(null);
    try {
      const jetzt = new Date();
      const zeitpunkt = jetzt.toISOString();
      // Falls noch in Pause: Pause sauber abschliessen
      let pauseGesamt = offen.pause_minuten;
      if (offen.pause_offen_seit) {
        pauseGesamt += Math.round((jetzt.getTime() - new Date(offen.pause_offen_seit).getTime()) / 60000);
      }
      uebernehmen(heute.map((s) => (s.id === offen.id
        ? { ...s, gehen_um: zeitpunkt, pause_minuten: pauseGesamt, pause_offen_seit: null }
        : s)));

      const aus = await buchen('update',
        { gehen_um: zeitpunkt, pause_minuten: pauseGesamt, pause_offen_seit: null, updated_at: zeitpunkt },
        `Gehen ${uhrzeit(zeitpunkt)}`, jetzt, offen.id);
      if (aus.art === 'fehler') { setMsg('Ausstempeln fehlgeschlagen: ' + aus.meldung); await ladeAlles(); return; }
      setMsg(aus.art === 'wartet'
        ? `Ausgestempelt um ${uhrzeit(zeitpunkt)} — gespeichert, wird bei Verbindung übertragen. Schönen Feierabend!`
        : 'Ausgestempelt. Schönen Feierabend!');
      if (aus.art === 'gesendet') await ladeAlles();
    } finally { setBusy(false); }
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

            {(ohneNetz || wartet > 0) && (
              <div style={styles.offlineMsg}>
                <b style={{ color: C.warn }}>Ohne Verbindung</b> — Sie können trotzdem stempeln.
                {wartet > 0 && ` ${wartet} ${wartet === 1 ? 'Buchung wartet' : 'Buchungen warten'} auf die Übertragung.`}
                {' '}Die Uhrzeit wird beim Stempeln festgehalten, nicht erst beim Senden — es wird also genau die Zeit gebucht, zu der Sie gedrückt haben.
              </div>
            )}

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
              Ohne Verbindung wird auf dem Gerät gespeichert und automatisch nachgetragen, sobald wieder Empfang da ist —
              maßgeblich ist immer die Uhrzeit, zu der Sie gestempelt haben.
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
  offlineMsg: { marginBottom: 18, color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', lineHeight: 1.55, background: 'rgba(224,162,76,0.09)', border: '1px solid rgba(224,162,76,0.35)', borderRadius: 10, padding: '12px 14px' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  hinweis: { marginTop: 18, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, lineHeight: 1.5, padding: '0 4px' },
};
