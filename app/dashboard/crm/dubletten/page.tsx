'use client';

// ============================================================
// ARGONAUT OS · Block 1 · I-1c-4b · Dublettenzentrale
//
// DIE EINE REGEL
//   Kein Verschmelzen ohne bewussten Blick auf beide Datensätze.
//   Keine Massenaktion. Kein "alle zusammenführen". Ein Paar, ein Dialog,
//   Feld für Feld, ein Klick.
//
// WARUM SO UMSTÄNDLICH?
//   Ein übersehener Doppelter kostet eine Minute. Ein falsch verschmolzener
//   Kunde kostet einen Kunden. Zwei Müllers in Rottenburg sehen im Listen-
//   modus identisch aus.
//
// WAS DIE SEITE NICHT TUT
//   Sie löscht nichts. Sie ruft /api/kontakte/zusammenfuehren auf, und dort
//   wird erst das Sicherheitsnetz geschrieben, dann umgehängt, dann gelöscht.
//
// Pfad: app/dashboard/crm/dubletten/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  findeInternenDubletten, zusammenfuehrungsVorschlag, verworfeneWerte,
  FELDER, SCHWELLE_SICHER,
  type Kandidat, type Vergleich, type Feldname,
} from '../../_components/dublettenLogik';
import { kandidatKurz, zonenText } from '../../_components/importLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

const K_FELDER = 'id, vorname, nachname, firma, email, telefon, strasse, plz, ort';

const FELD_LABEL: Record<Feldname, string> = {
  vorname: 'Vorname', nachname: 'Nachname', firmenname: 'Firma',
  email: 'E-Mail', telefon: 'Telefon', strasse: 'Straße', plz: 'PLZ', ort: 'Ort',
};

type Paar = { a: Kandidat; b: Kandidat; vergleich: Vergleich };

type Protokoll = {
  id: string;
  behalten_id: string;
  entfernt_id: string;
  entfernt_daten: Record<string, unknown>;
  rueckgaengig_bis: string;
  rueckgaengig_am: string | null;
  erstellt_am: string;
};

function datumHuebsch(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('de-DE') : '—';
}

export default function DublettenPage() {
  const [kontakte, setKontakte] = useState<Kandidat[]>([]);
  const [protokoll, setProtokoll] = useState<Protokoll[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);

  const [offenesPaar, setOffenesPaar] = useState<Paar | null>(null);
  const [wahl, setWahl] = useState<Partial<Record<Feldname, 'a' | 'b'>>>({});
  const [laeuft, setLaeuft] = useState(false);

  function melde(t: string) {
    setErfolg(t); setFehler(null);
    setTimeout(() => setErfolg(null), 4000);
  }

  const alles = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { setFehler('Nicht angemeldet.'); return; }

      const [kRes, pRes] = await Promise.all([
        supabase.from('kontakte').select(K_FELDER),
        supabase.from('zusammenfuehrungen').select('*')
          .order('erstellt_am', { ascending: false }).limit(20),
      ]);

      if (kRes.error) throw kRes.error;

      setKontakte(((kRes.data as unknown as Array<Record<string, string | null>>) ?? []).map((k) => ({
        id: k.id as string,
        vorname: k.vorname, nachname: k.nachname, firmenname: k.firma,
        email: k.email, telefon: k.telefon, strasse: k.strasse, plz: k.plz, ort: k.ort,
      })));
      setProtokoll((pRes.data as Protokoll[]) ?? []);
    } catch (e: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => { void alles(); }, [alles]);

  // --- Paare finden -----------------------------------------------------
  const paare = useMemo<Paar[]>(
    () => findeInternenDubletten(kontakte).map((p) => ({
      a: kontakte[p.a], b: kontakte[p.b], vergleich: p.vergleich,
    })),
    [kontakte],
  );

  const sichere = paare.filter((p) => p.vergleich.zone === 'sicher').length;

  // --- Dialog öffnen ----------------------------------------------------
  function oeffne(p: Paar) {
    const vorschlaege = zusammenfuehrungsVorschlag(p.a, p.b);
    const w: Partial<Record<Feldname, 'a' | 'b'>> = {};
    for (const v of vorschlaege) w[v.feld] = v.empfehlung;
    setWahl(w);
    setOffenesPaar(p);
  }

  const vorschlaege = useMemo(
    () => (offenesPaar ? zusammenfuehrungsVorschlag(offenesPaar.a, offenesPaar.b) : []),
    [offenesPaar],
  );

  const verworfen = useMemo(
    () => (offenesPaar ? verworfeneWerte(offenesPaar.a, offenesPaar.b, wahl) : []),
    [offenesPaar, wahl],
  );

  // --- Verschmelzen ------------------------------------------------------
  async function verschmelzen() {
    if (!offenesPaar) return;
    const { a, b } = offenesPaar;

    const text =
      `Diese beiden Kontakte zu einem verschmelzen?\n\n` +
      `Bleibt:      ${kandidatKurz(a)}\n` +
      `Verschwindet: ${kandidatKurz(b)}\n\n` +
      `Aktivitäten, Tags und Verkaufschancen werden übertragen.\n` +
      (verworfen.length > 0 ? `Abweichende Werte wandern in eine Notiz.\n` : '') +
      `\n30 Tage lang rückgängig zu machen.`;

    if (!window.confirm(text)) return;

    setLaeuft(true); setFehler(null);
    try {
      const res = await fetch('/api/kontakte/zusammenfuehren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ behalten_id: a.id, entfernt_id: b.id, wahl }),
      });
      const d = await res.json();
      if (!res.ok || !d?.ok) { setFehler(d?.error ?? 'Zusammenführen fehlgeschlagen.'); return; }

      const u = d.uebertragen ?? {};
      setOffenesPaar(null);
      await alles();
      melde(
        `Zusammengeführt. Übertragen: ${u.aktivitaeten ?? 0} Aktivität(en), ` +
        `${u.tags ?? 0} Tag(s), ${u.verkaufschancen ?? 0} Verkaufschance(n). ` +
        `Rückgängig bis ${datumHuebsch(d.rueckgaengig_bis)}.`,
      );
    } catch {
      setFehler('Zusammenführen fehlgeschlagen. Bitte erneut versuchen.');
    } finally { setLaeuft(false); }
  }

  // --- Rückgängig --------------------------------------------------------
  async function rueckgaengig(p: Protokoll) {
    const name = [p.entfernt_daten.vorname, p.entfernt_daten.nachname].filter(Boolean).join(' ') || 'Kontakt';
    if (!window.confirm(
      `Zusammenführung rückgängig machen?\n\n„${name}" wird wiederhergestellt.\n\n` +
      'Der verbliebene Kontakt behält seine aktuellen Werte — dort könnte seither ' +
      'weitergearbeitet worden sein.'
    )) return;

    setLaeuft(true); setFehler(null);
    try {
      const res = await fetch('/api/kontakte/zusammenfuehren/rueckgaengig', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zusammenfuehrung_id: p.id }),
      });
      const d = await res.json();
      if (!res.ok || !d?.ok) { setFehler(d?.error ?? 'Rückgängig machen fehlgeschlagen.'); return; }

      await alles();
      melde(d.hinweis ?? 'Wiederhergestellt.');
    } catch {
      setFehler('Rückgängig machen fehlgeschlagen.');
    } finally { setLaeuft(false); }
  }

  // ----------------------------------------------------------------------
  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · CRM</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Doppelte Kontakte</h1>
          <p style={styles.sub}>
            Zwei Zeilen, ein Mensch. Jedes Paar wird einzeln geprüft und Feld für Feld
            zusammengeführt — nichts geschieht automatisch, nichts geht verloren.
          </p>
        </div>
        <a href="/dashboard/crm" style={styles.ghostBtn}>← Zum CRM</a>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {erfolg && <div style={styles.okBox}>{erfolg}</div>}

      {laden ? (
        <div style={styles.hint}>Sucht nach Doppelten …</div>
      ) : (
        <>
          <div style={styles.zahlenGrid}>
            <Zahl label="Kontakte" wert={kontakte.length} farbe={C.cyan} />
            <Zahl label="Mögliche Paare" wert={paare.length} farbe={paare.length ? C.warn : C.green} />
            <Zahl label="Davon sehr sicher" wert={sichere} farbe={sichere ? C.warn : C.green} />
          </div>

          {/* --- Paare --- */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Gefundene Paare</h2>

            {paare.length === 0 ? (
              <div style={styles.hint}>
                ✓ Keine Doppelten gefunden. Bei {kontakte.length} Kontakten spricht nichts dafür,
                dass jemand zweimal erfasst ist.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {paare.map((p, i) => (
                  <div key={i} style={{
                    ...styles.paarZeile,
                    borderColor: p.vergleich.emailKonflikt ? 'rgba(224,102,102,0.35)'
                      : p.vergleich.zone === 'sicher' ? 'rgba(224,162,76,0.4)' : C.border,
                  }}>
                    <div style={{ minWidth: 0, flex: '1 1 340px' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{kandidatKurz(p.a)}</div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.textDim }}>{kandidatKurz(p.b)}</div>
                      <div style={{ fontSize: 12, marginTop: 6, color: p.vergleich.emailKonflikt ? C.danger : C.textDim }}>
                        <strong style={{ color: p.vergleich.punkte >= SCHWELLE_SICHER ? C.warn : C.textDim }}>
                          {p.vergleich.punkte} Punkte
                        </strong>
                        {' · '}{zonenText(p.vergleich.zone)}
                        {p.vergleich.emailKonflikt && ' · ⚠ verschiedene E-Mail-Adressen'}
                      </div>
                      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 4 }}>
                        {p.vergleich.signale.map((s) => s.erklaerung).join(' · ')}
                      </div>
                    </div>
                    <button onClick={() => oeffne(p)} disabled={laeuft} style={styles.goldBtn}>Prüfen →</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* --- Protokoll --- */}
          {protokoll.length > 0 && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Zuletzt zusammengeführt</h2>
              <div style={{ fontSize: 12.5, color: C.textDim, marginBottom: 12 }}>
                30 Tage lang rückgängig zu machen. Danach bleibt nur das Protokoll.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {protokoll.map((p) => {
                  const name = [p.entfernt_daten.vorname, p.entfernt_daten.nachname]
                    .filter(Boolean).join(' ') || 'Unbenannt';
                  const abgelaufen = new Date(p.rueckgaengig_bis).getTime() < Date.now();
                  const erledigt = Boolean(p.rueckgaengig_am);

                  return (
                    <div key={p.id} style={styles.protokollZeile}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5 }}>
                          <strong>{name}</strong> wurde entfernt
                        </div>
                        <div style={{ fontSize: 11.5, color: C.textDim }}>
                          {datumHuebsch(p.erstellt_am)}
                          {erledigt ? ' · bereits rückgängig gemacht'
                            : abgelaufen ? ' · Frist abgelaufen'
                            : ` · rückgängig bis ${datumHuebsch(p.rueckgaengig_bis)}`}
                        </div>
                      </div>
                      {!erledigt && !abgelaufen && (
                        <button onClick={() => rueckgaengig(p)} disabled={laeuft} style={styles.ghostBtn}>
                          Rückgängig
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ============ DIALOG: Feld für Feld ============ */}
      {offenesPaar && (
        <div style={styles.overlay} onClick={() => !laeuft && setOffenesPaar(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>Zusammenführen</h2>
            <p style={{ fontSize: 13, color: C.textDim, margin: '6px 0 16px', lineHeight: 1.55 }}>
              Links bleibt bestehen, rechts verschwindet. Für jedes Feld entscheidest du,
              welcher Wert gewinnt. Abweichendes wandert in eine Notiz — <strong>nichts geht verloren</strong>.
            </p>

            {offenesPaar.vergleich.emailKonflikt && (
              <div style={styles.warnBox}>
                ⚠ <strong>Verschiedene E-Mail-Adressen.</strong> Das sind mit hoher Wahrscheinlichkeit
                zwei verschiedene Personen. Bitte genau prüfen, bevor du fortfährst.
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table style={styles.tabelle}>
                <thead>
                  <tr>
                    <th style={styles.th}>Feld</th>
                    <th style={styles.th}>Bleibt</th>
                    <th style={styles.th}>Verschwindet</th>
                  </tr>
                </thead>
                <tbody>
                  {vorschlaege.map((v) => {
                    const gewaehlt = wahl[v.feld] ?? v.empfehlung;
                    const beideLeer = !v.wertA && !v.wertB;
                    if (beideLeer) return null;
                    return (
                      <tr key={v.feld}>
                        <td style={{ ...styles.td, color: C.textDim, fontSize: 12 }}>
                          {FELD_LABEL[v.feld]}
                          {v.konflikt && <div style={{ color: C.warn, fontSize: 11 }}>⚠ abweichend</div>}
                        </td>
                        {(['a', 'b'] as const).map((seite) => {
                          const wert = seite === 'a' ? v.wertA : v.wertB;
                          const aktiv = gewaehlt === seite;
                          return (
                            <td key={seite} style={styles.td}>
                              <label style={{ ...styles.wahlBox, ...(aktiv ? styles.wahlAktiv : {}), opacity: wert ? 1 : 0.4 }}>
                                <input type="radio" name={v.feld} checked={aktiv} disabled={!wert}
                                  onChange={() => setWahl((w) => ({ ...w, [v.feld]: seite }))} />
                                <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{wert || '—'}</span>
                              </label>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {verworfen.length > 0 && (
              <div style={styles.infoBox}>
                <strong>Wandert in die Notiz</strong>
                {verworfen.map((v, i) => <div key={i} style={{ color: C.textDim, fontSize: 12.5 }}>· {v}</div>)}
              </div>
            )}

            <div style={styles.infoBox}>
              Aktivitäten, Tags und Verkaufschancen des verschwindenden Kontakts werden
              <strong> übertragen, nicht gelöscht</strong>. 30 Tage lang rückgängig zu machen.
            </div>

            <div style={styles.aktionen}>
              <button onClick={() => setOffenesPaar(null)} disabled={laeuft} style={styles.ghostBtn}>Abbrechen</button>
              <button onClick={verschmelzen} disabled={laeuft}
                style={{ ...styles.goldBtn, opacity: laeuft ? 0.6 : 1 }}>
                {laeuft ? 'Führt zusammen …' : 'Zusammenführen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Zahl({ label, wert, farbe }: { label: string; wert: number; farbe: string }) {
  return (
    <div style={styles.zahlBox}>
      <div style={styles.zahlLabel}>{label}</div>
      <div style={{ ...styles.zahlWert, color: farbe }}>{wert}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 640, lineHeight: 1.5 },

  zahlenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 18 },
  zahlBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  zahlLabel: { fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  zahlWert: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 18 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: C.text, textTransform: 'uppercase', letterSpacing: 1 },

  paarZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 15px', flexWrap: 'wrap' },
  protokollZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 13px', flexWrap: 'wrap' },

  tabelle: { width: '100%', borderCollapse: 'collapse', minWidth: 520 },
  th: { textAlign: 'left', padding: '7px 8px', fontSize: 10.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '6px 8px', fontSize: 13, borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },

  wahlBox: { display: 'flex', alignItems: 'center', gap: 8, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 13 },
  wahlAktiv: { borderColor: 'rgba(201,168,76,0.5)', background: 'rgba(201,168,76,0.08)' },

  aktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' },
  goldBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 14px', fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' },

  hint: { color: C.textDim, fontSize: 14, padding: '14px 0', lineHeight: 1.6 },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16, lineHeight: 1.5 },
  okBox: { color: C.green, fontSize: 13.5, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16, lineHeight: 1.55 },
  infoBox: { marginTop: 14, padding: '11px 13px', background: 'rgba(0,229,255,0.07)', border: `1px solid rgba(0,229,255,0.22)`, borderRadius: 10, fontSize: 13, color: C.text, lineHeight: 1.6 },
  warnBox: { marginBottom: 14, padding: '11px 13px', background: 'rgba(224,162,76,0.09)', border: `1px solid rgba(224,162,76,0.35)`, borderRadius: 10, fontSize: 13, color: C.text, lineHeight: 1.6 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid rgba(201,168,76,0.18)`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 720, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: C.text, margin: 0 },
};
