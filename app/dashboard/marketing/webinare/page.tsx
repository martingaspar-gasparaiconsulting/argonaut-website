'use client';

// ============================================================================
// ARGONAUT OS · Webinare verwalten   (Paket 5 · Punkt 3.13)
// Pfad: app/dashboard/marketing/webinare/page.tsx
//
// Der Betrieb legt ein Webinar an, setzt Termine, sieht die Anmeldungen und
// hakt nach dem Termin ab, wer da war. Alles Weitere macht der Cron
// /api/cron/webinar: Erinnerungen davor, Nachbereitung danach.
//
// WAS DIESE SEITE BEWUSST NICHT KANN:
// Eine Anmeldung löschen. Ein Interessent wird abgemeldet, nicht entfernt —
// sonst fehlt der Nachweis der Einwilligung nach Art. 7 Abs. 1 DSGVO. Die
// Datenbank hat für webinar_anmeldung deshalb gar kein DELETE-Recht.
//
// „Live schalten" prüft vorher mit fehltZumStart(), was noch fehlt — vor allem
// den Zugangslink je Termin. Ein Webinar ohne Raum fällt sonst erst eine
// Stunde vor Beginn auf, wenn niemand mehr etwas tun kann.
// ============================================================================

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  neuerSchluessel, fehltZumStart, zaehleAnmeldungen, formatiereTermin, dauerText,
  platzZahlen, naechsterTermin, seitenUrl,
  TERMIN_GEPLANT, TERMIN_ABGESAGT,
  TEILNAHME_OFFEN, TEILNAHME_TEILGENOMMEN, TEILNAHME_GEFEHLT,
  STATUS_AKTIV, STATUS_ABGEMELDET,
} from '@/lib/webinar';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Webinar = {
  id: string; key: string; titel: string; beschreibung: string; referent: string;
  aufzeichnung_url: string | null; aktiv: boolean;
};
type Termin = {
  id: string; webinar_id: string; beginnt_am: string | null; dauer_minuten: number;
  kapazitaet: number | null; zugang_url: string | null; status: string;
};
type Anmeldung = {
  id: string; webinar_id: string; termin_id: string; email: string;
  name: string | null; firma: string | null; status: string; teilnahme: string;
};

// Je eine Zeichenkette, nicht zusammengesetzt (siehe tests/selectLiteral.test.mjs).
const WEBINAR_SPALTEN = 'id, key, titel, beschreibung, referent, aufzeichnung_url, aktiv';
const TERMIN_SPALTEN = 'id, webinar_id, beginnt_am, dauer_minuten, kapazitaet, zugang_url, status';
const ANMELDUNG_SPALTEN = 'id, webinar_id, termin_id, email, name, firma, status, teilnahme';

/** Ein <input type="datetime-local"> liefert Ortszeit ohne Zone — in ISO wandeln. */
function lokalZuIso(wert: string): string | null {
  const s = String(wert || '').trim();
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
/** Und zurück, damit das Feld beim Bearbeiten gefüllt ist. */
function isoZuLokal(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export default function WebinareSeite() {
  const [uid, setUid] = useState<string | null>(null);
  const [webinare, setWebinare] = useState<Webinar[]>([]);
  const [termine, setTermine] = useState<Termin[]>([]);
  const [anmeldungen, setAnmeldungen] = useState<Anmeldung[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null);

  // Neues Webinar
  const [neuAuf, setNeuAuf] = useState(false);
  const [nTitel, setNTitel] = useState('');
  const [nBeschreibung, setNBeschreibung] = useState('');
  const [nReferent, setNReferent] = useState('');

  // Neuer Termin
  const [tBeginn, setTBeginn] = useState('');
  const [tDauer, setTDauer] = useState('60');
  const [tKapazitaet, setTKapazitaet] = useState('');
  const [tZugang, setTZugang] = useState('');

  const alles = useCallback(async (id: string) => {
    setLaden(true); setFehler(null);
    try {
      const [w, t, a] = await Promise.all([
        supabase.from('webinare').select(WEBINAR_SPALTEN).eq('owner_user_id', id).order('erstellt_am', { ascending: false }).limit(200),
        supabase.from('webinar_termin').select(TERMIN_SPALTEN).eq('owner_user_id', id).order('beginnt_am', { ascending: true }).limit(500),
        supabase.from('webinar_anmeldung').select(ANMELDUNG_SPALTEN).eq('owner_user_id', id).limit(5000),
      ]);
      setWebinare(((w.data as unknown as Webinar[]) ?? []));
      setTermine(((t.data as unknown as Termin[]) ?? []));
      setAnmeldungen(((a.data as unknown as Anmeldung[]) ?? []));
    } catch (e) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      await alles(id);
    })();
  }, [alles]);

  const basis = typeof window !== 'undefined' ? window.location.origin : '';

  async function webinarAnlegen() {
    if (!uid) return;
    if (!nTitel.trim()) { setFehler('Bitte geben Sie einen Titel an.'); return; }
    setBusy('neu'); setFehler(null);
    try {
      const { error } = await supabase.from('webinare').insert({
        owner_user_id: uid,
        key: neuerSchluessel(),
        titel: nTitel.trim(),
        beschreibung: nBeschreibung.trim(),
        referent: nReferent.trim(),
        aktiv: false,
      });
      if (error) throw error;
      setNTitel(''); setNBeschreibung(''); setNReferent(''); setNeuAuf(false);
      setOk('Webinar angelegt. Setzen Sie jetzt einen Termin mit Zugangslink.');
      await alles(uid);
    } catch (e) { setFehler('Anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function terminAnlegen(w: Webinar) {
    if (!uid) return;
    const iso = lokalZuIso(tBeginn);
    if (!iso) { setFehler('Bitte geben Sie Datum und Uhrzeit an.'); return; }
    setBusy('termin'); setFehler(null);
    try {
      const { error } = await supabase.from('webinar_termin').insert({
        owner_user_id: uid,
        webinar_id: w.id,
        beginnt_am: iso,
        dauer_minuten: Math.max(5, Math.floor(Number(tDauer)) || 60),
        kapazitaet: tKapazitaet.trim() === '' ? null : Math.max(1, Math.floor(Number(tKapazitaet)) || 0) || null,
        zugang_url: tZugang.trim() || null,
        status: TERMIN_GEPLANT,
      });
      if (error) throw error;
      setTBeginn(''); setTDauer('60'); setTKapazitaet(''); setTZugang('');
      setOk('Termin gesetzt.');
      await alles(uid);
    } catch (e) { setFehler('Termin anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function terminAendern(t: Termin, werte: Record<string, unknown>) {
    if (!uid) return;
    setBusy(t.id); setFehler(null);
    try {
      const { error } = await supabase.from('webinar_termin').update(werte).eq('id', t.id);
      if (error) throw error;
      await alles(uid);
    } catch (e) { setFehler('Ändern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function webinarAendern(w: Webinar, werte: Record<string, unknown>) {
    if (!uid) return;
    setBusy(w.id); setFehler(null);
    try {
      const { error } = await supabase.from('webinare').update(werte).eq('id', w.id);
      if (error) throw error;
      await alles(uid);
    } catch (e) { setFehler('Ändern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function teilnahmeSetzen(a: Anmeldung, wert: string) {
    if (!uid) return;
    setBusy(a.id); setFehler(null);
    try {
      const { error } = await supabase.from('webinar_anmeldung').update({ teilnahme: wert }).eq('id', a.id);
      if (error) throw error;
      await alles(uid);
    } catch (e) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function liveSchalten(w: Webinar) {
    const meine = termine.filter((t) => t.webinar_id === w.id);
    const fehlt = fehltZumStart(w, meine, []);
    if (fehlt.length > 0) {
      setFehler('Noch nicht startklar: ' + fehlt.join(' · '));
      return;
    }
    await webinarAendern(w, { aktiv: true });
    setOk('Webinar ist live. Die Anmeldeseite ist jetzt erreichbar.');
  }

  const jetzt = useMemo(() => new Date().toISOString(), []);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Marketing</div>
      <h1 style={styles.h1}>🎥 Webinare</h1>
      <p style={styles.sub}>
        Termin anlegen, Anmeldeseite teilen — Erinnerungen und Nachbereitung laufen von selbst.
        Der Zugangslink geht nur an bestätigte Angemeldete, einen Tag und eine Stunde vor Beginn.
      </p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button style={styles.primaer} onClick={() => setNeuAuf((v) => !v)}>
          {neuAuf ? 'Abbrechen' : '＋ Neues Webinar'}
        </button>
        <span style={{ color: C.textDim, fontSize: 13, alignSelf: 'center' }}>
          {webinare.length} Webinar{webinare.length === 1 ? '' : 'e'} · {anmeldungen.filter((a) => a.status === STATUS_AKTIV).length} bestätigte Anmeldungen
        </span>
      </div>

      {neuAuf && (
        <div style={{ ...styles.card, marginBottom: 16 }}>
          <div style={styles.cardTitel}>Neues Webinar</div>
          <label style={styles.lab}>Titel<input style={styles.inp} value={nTitel} onChange={(e) => setNTitel(e.target.value)} placeholder="z. B. Die 5 teuersten Fehler bei der Betriebsübergabe" /></label>
          <label style={styles.lab}>Worum geht es?<textarea style={styles.area} value={nBeschreibung} onChange={(e) => setNBeschreibung(e.target.value)} placeholder="Zwei bis vier Sätze. Das steht auf der Anmeldeseite." /></label>
          <label style={styles.lab}>Wer hält es?<input style={styles.inp} value={nReferent} onChange={(e) => setNReferent(e.target.value)} placeholder="Name des Referenten" /></label>
          <button style={{ ...styles.primaer, marginTop: 12, opacity: busy === 'neu' ? 0.6 : 1 }} disabled={busy === 'neu'} onClick={() => void webinarAnlegen()}>
            Anlegen
          </button>
        </div>
      )}

      {laden && <p style={{ color: C.textDim }}>Wird geladen …</p>}

      {!laden && webinare.length === 0 && !neuAuf && (
        <div style={styles.card}>
          <p style={{ color: C.textDim, margin: 0 }}>
            Noch kein Webinar angelegt. Ein Webinar ist der kürzeste Weg von „kennt uns nicht" zu „hat 45 Minuten zugehört".
          </p>
        </div>
      )}

      {webinare.map((w) => {
        const meineTermine = termine.filter((t) => t.webinar_id === w.id);
        const meineAnmeldungen = anmeldungen.filter((a) => a.webinar_id === w.id);
        const z = zaehleAnmeldungen(meineAnmeldungen);
        const fehlt = fehltZumStart(w, meineTermine, []);
        const naechster = naechsterTermin(meineTermine, jetzt);
        const istOffen = offen === w.id;

        return (
          <div key={w.id} style={{ ...styles.card, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 21px)' }}>{w.titel || '(ohne Titel)'}</span>
                  <span style={{ ...styles.badge, color: w.aktiv ? C.green : C.textDim, borderColor: w.aktiv ? C.green : C.border }}>
                    {w.aktiv ? 'live' : 'Entwurf'}
                  </span>
                </div>
                <div style={{ color: C.textDim, fontSize: 13, marginTop: 5 }}>
                  {naechster
                    ? `Nächster Termin: ${formatiereTermin(naechster.beginnt_am)}`
                    : 'Kein kommender Termin'}
                  {' · '}{z.aktiv} bestätigt{z.unbestaetigt > 0 ? ` · ${z.unbestaetigt} unbestätigt` : ''}
                  {z.bestaetigungsquote !== null ? ` · Bestätigungsquote ${z.bestaetigungsquote} %` : ''}
                  {z.teilnahmequote !== null ? ` · Teilnahmequote ${z.teilnahmequote} %` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={styles.mini} onClick={() => setOffen(istOffen ? null : w.id)}>
                  {istOffen ? 'Zuklappen' : 'Öffnen'}
                </button>
                {!w.aktiv
                  ? <button style={styles.gruen} disabled={busy === w.id} onClick={() => void liveSchalten(w)}>▶ Live schalten</button>
                  : <button style={styles.mini} disabled={busy === w.id} onClick={() => void webinarAendern(w, { aktiv: false })}>Pausieren</button>}
              </div>
            </div>

            {fehlt.length > 0 && (
              <div style={{ ...styles.warn, marginTop: 12 }}>
                <b>Noch nicht startklar:</b> {fehlt.join(' · ')}
              </div>
            )}

            {w.aktiv && (
              <div style={{ marginTop: 12, fontSize: 13.5 }}>
                <span style={{ color: C.textDim }}>Anmeldeseite: </span>
                <a href={seitenUrl(basis, w.key)} target="_blank" rel="noreferrer" style={{ color: C.cyan }}>
                  {seitenUrl(basis, w.key)}
                </a>
              </div>
            )}

            {istOffen && (
              <>
                {/* ---------------- Termine ---------------- */}
                <div style={{ ...styles.unterTitel, marginTop: 20 }}>Termine</div>
                {meineTermine.length === 0 && <p style={{ color: C.textDim, fontSize: 13.5, margin: '6px 0 0' }}>Noch kein Termin gesetzt.</p>}
                {meineTermine.map((t) => {
                  const belegt = meineAnmeldungen.filter((a) => a.termin_id === t.id && a.status !== STATUS_ABGEMELDET).length;
                  const p = platzZahlen(t.kapazitaet, belegt);
                  const abgesagt = t.status === TERMIN_ABGESAGT;
                  return (
                    <div key={t.id} style={{ ...styles.zeile, opacity: abgesagt ? 0.55 : 1 }}>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontWeight: 700 }}>
                          {formatiereTermin(t.beginnt_am) || 'Datum fehlt'}
                          {abgesagt && <span style={{ ...styles.badge, color: C.danger, borderColor: C.danger, marginLeft: 8 }}>abgesagt</span>}
                        </div>
                        <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 3 }}>
                          {dauerText(t.dauer_minuten)}
                          {' · '}{p.kapazitaet === null ? `${belegt} angemeldet (unbegrenzt)` : `${belegt} von ${p.kapazitaet}${p.ausgebucht ? ' — ausgebucht' : ''}`}
                          {!String(t.zugang_url ?? '').trim() && <span style={{ color: C.warn }}> · Zugangslink fehlt</span>}
                        </div>
                      </div>
                      <input
                        style={{ ...styles.inp, maxWidth: 260 }}
                        defaultValue={t.zugang_url ?? ''}
                        placeholder="Zugangslink (Zoom, Teams …)"
                        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (t.zugang_url ?? '')) void terminAendern(t, { zugang_url: v || null }); }}
                      />
                      {!abgesagt && (
                        <button style={styles.mini} disabled={busy === t.id}
                                onClick={() => { if (window.confirm('Diesen Termin absagen? Angemeldete erhalten keine weiteren Erinnerungen.')) void terminAendern(t, { status: TERMIN_ABGESAGT }); }}>
                          Absagen
                        </button>
                      )}
                    </div>
                  );
                })}

                <div style={{ ...styles.card, background: C.navy, marginTop: 12, padding: 14 }}>
                  <div style={{ color: C.textDim, fontSize: 12.5, marginBottom: 8 }}>Neuen Termin setzen</div>
                  <div style={styles.grid}>
                    <label style={styles.lab}>Beginn<input style={styles.inp} type="datetime-local" value={tBeginn} onChange={(e) => setTBeginn(e.target.value)} /></label>
                    <label style={styles.lab}>Dauer (Minuten)<input style={styles.inp} type="number" value={tDauer} onChange={(e) => setTDauer(e.target.value)} /></label>
                    <label style={styles.lab}>Plätze (leer = unbegrenzt)<input style={styles.inp} type="number" value={tKapazitaet} onChange={(e) => setTKapazitaet(e.target.value)} /></label>
                    <label style={styles.lab}>Zugangslink<input style={styles.inp} value={tZugang} onChange={(e) => setTZugang(e.target.value)} placeholder="https://…" /></label>
                  </div>
                  <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'termin' ? 0.6 : 1 }} disabled={busy === 'termin'} onClick={() => void terminAnlegen(w)}>
                    Termin setzen
                  </button>
                </div>

                {/* ---------------- Aufzeichnung ---------------- */}
                <div style={{ ...styles.unterTitel, marginTop: 20 }}>Aufzeichnung</div>
                <input
                  style={{ ...styles.inp, marginTop: 6 }}
                  defaultValue={w.aufzeichnung_url ?? ''}
                  placeholder="Link zur Aufzeichnung — geht mit der Nachbereitung raus"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (w.aufzeichnung_url ?? '')) void webinarAendern(w, { aufzeichnung_url: v || null }); }}
                />

                {/* ---------------- Anmeldungen ---------------- */}
                <div style={{ ...styles.unterTitel, marginTop: 20 }}>
                  Anmeldungen ({z.gesamt})
                </div>
                {meineAnmeldungen.length === 0 && <p style={{ color: C.textDim, fontSize: 13.5, margin: '6px 0 0' }}>Noch keine Anmeldung.</p>}
                {meineAnmeldungen.length > 0 && (
                  <div style={{ overflowX: 'auto', marginTop: 8 }}>
                    <table style={styles.tab}>
                      <thead><tr>
                        <th style={styles.th}>Wer</th><th style={styles.th}>Termin</th>
                        <th style={styles.th}>Status</th><th style={styles.th}>War da?</th>
                      </tr></thead>
                      <tbody>
                        {meineAnmeldungen.map((a) => {
                          const t = meineTermine.find((x) => x.id === a.termin_id);
                          return (
                            <tr key={a.id} style={{ borderTop: `1px solid ${C.border}` }}>
                              <td style={styles.td}>
                                <div>{a.name || a.email}</div>
                                <div style={{ color: C.textDim, fontSize: 12 }}>{a.name ? a.email : ''}{a.firma ? ` · ${a.firma}` : ''}</div>
                              </td>
                              <td style={{ ...styles.td, fontSize: 12.5, color: C.textDim }}>{t ? formatiereTermin(t.beginnt_am) : '—'}</td>
                              <td style={styles.td}>
                                <span style={{ ...styles.badge, color: a.status === STATUS_AKTIV ? C.green : a.status === STATUS_ABGEMELDET ? C.danger : C.warn, borderColor: a.status === STATUS_AKTIV ? C.green : a.status === STATUS_ABGEMELDET ? C.danger : C.warn }}>
                                  {a.status === STATUS_AKTIV ? 'bestätigt' : a.status === STATUS_ABGEMELDET ? 'abgemeldet' : 'unbestätigt'}
                                </span>
                              </td>
                              <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                                {[
                                  { w: TEILNAHME_TEILGENOMMEN, l: '✓ da' },
                                  { w: TEILNAHME_GEFEHLT, l: '– gefehlt' },
                                  { w: TEILNAHME_OFFEN, l: 'offen' },
                                ].map((o) => (
                                  <button
                                    key={o.w}
                                    style={{ ...styles.mini, marginRight: 5, borderColor: a.teilnahme === o.w ? C.cyan : C.border, color: a.teilnahme === o.w ? C.cyan : C.text }}
                                    disabled={busy === a.id}
                                    onClick={() => void teilnahmeSetzen(a, o.w)}
                                  >{o.l}</button>
                                ))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p style={{ color: C.textDim, fontSize: 12.5, marginTop: 10 }}>
                  „War da?" entscheidet, welchen Text die Nachbereitung bekommt — Teilnehmer und Fehlende
                  bekommen bewusst verschiedene Mails. Ohne Angabe geht der neutrale Text raus.
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px', maxWidth: 1100, margin: '0 auto' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  unterTitel: { fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.gold },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${C.border}`, padding: '10px 0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 16px)', color: C.textDim, marginBottom: 10 },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(13.5px, 1.1vw, 16px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  area: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', minHeight: 80, boxSizing: 'border-box', resize: 'vertical' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 'clamp(13.5px, 1.2vw, 17px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  gruen: { background: 'transparent', color: C.green, border: `1px solid ${C.green}66`, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700 },
  tab: { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 620 },
  th: { textAlign: 'left', color: C.textDim, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 10px', fontWeight: 700 },
  td: { padding: '10px', verticalAlign: 'middle' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  ok: { color: C.green, fontSize: 14, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
  warn: { color: C.warn, fontSize: 13.5, background: 'rgba(224,162,76,0.1)', border: `1px solid rgba(224,162,76,0.35)`, borderRadius: 10, padding: '11px 13px' },
};
