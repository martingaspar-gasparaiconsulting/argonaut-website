'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import {
  QUELLEN, MERKMALE, OPERATOREN, WERBE_STATUS_TEXT,
  merkmal, merkmaleFuer, operatorenFuer, istErlaubt,
  beschreibe, zaehle, filtere, werbeStatus, fehltZumSpeichern,
  type Regel, type Quelle, type MerkmalTyp,
} from '@/lib/segmente';

// ============================================================================
// ARGONAUT OS · MODUL 3 MARKETING · Empfängergruppen (3.15 Teil 1)
//
// Hier wird eine Gruppe gebaut, nicht verschickt. Der Versand liest die
// gespeicherte Gruppe später aus public.marketing_segment.
//
// Gerechnet wird ausschließlich in lib/segmente.ts (node-getestet); hier steht
// nur Anzeige und Datenbank. Zwei Dinge macht diese Seite bewusst:
//   · Sie liest die Regeln als deutschen Satz vor. Kästchen liest vor dem
//     Versand niemand, einen Satz schon.
//   · Sie zeigt getrennt, wer erreichbar ist und wer aus rechtlichen Gründen
//     draußen bleibt — Widerspruch, Abmeldung, fehlende Bestätigung. Eine
//     Zahl „412 Empfänger", in der 80 Widersprüche stecken, ist eine Falle.
// ============================================================================

const C = {
  navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  warn: '#E0A24C', danger: '#E06666',
  text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)',
  card: 'rgba(255,255,255,0.04)',
};

const TABELLE = 'marketing_segment';
const MAX_ZEILEN = 2000;

/** Welche Spalten je Quelle geladen werden — nur die, die es wirklich gibt. */
const SPALTEN: Record<Quelle, string> = {
  kontakte:
    'id, email, firma, vorname, nachname, ort, plz, land, position, status, quelle, '
    + 'kunde_seit, letzter_kontakt_am, betreuungs_intervall_tage, werbe_einwilligung, werbe_widerspruch_am',
  newsletter:
    'id, email, name, status, quelle, angemeldet_am, bestaetigt_am, abgemeldet_am, variante',
};

type Gespeichert = {
  id: string; name: string; quelle: string; verknuepfung: string;
  regeln: Regel[] | null; geaendert_am?: string;
};

function leereRegel(quelle: Quelle): Regel {
  const erste = merkmaleFuer(quelle)[0];
  const op = erste ? operatorenFuer(erste.typ)[0] : null;
  return { merkmal: erste?.schluessel ?? '', operator: op?.schluessel ?? 'ist', wert: '' };
}

export default function SegmentePage() {
  const [quelle, setQuelle] = useState<Quelle>('kontakte');
  const [name, setName] = useState('');
  const [verknuepfung, setVerknuepfung] = useState<'und' | 'oder'>('und');
  const [regeln, setRegeln] = useState<Regel[]>([]);
  const [zeilen, setZeilen] = useState<Record<string, unknown>[]>([]);
  const [gespeicherte, setGespeicherte] = useState<Gespeichert[]>([]);
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [meldung, setMeldung] = useState('');
  const [heuteIso, setHeuteIso] = useState('');

  useEffect(() => {
    setHeuteIso(new Date().toISOString().slice(0, 10));
    setRegeln([leereRegel('kontakte')]);
  }, []);

  // ---------------------------------------------------------------- Laden
  const ladeEmpfaenger = useCallback(async (q: Quelle) => {
    setLaedt(true);
    try {
      const sb = createClient();
      const tabelle = q === 'kontakte' ? 'kontakte' : 'newsletter_abonnenten';
      const { data, error } = await sb.from(tabelle).select(SPALTEN[q]).limit(MAX_ZEILEN);
      if (error) { setMeldung('Empfänger nicht lesbar: ' + error.message); setZeilen([]); }
      else setZeilen((data as unknown as Record<string, unknown>[]) ?? []);
    } catch (e) {
      setMeldung('Empfänger nicht lesbar: ' + (e instanceof Error ? e.message : 'unbekannt'));
    } finally {
      setLaedt(false);
    }
  }, []);

  const ladeSegmente = useCallback(async () => {
    try {
      const sb = createClient();
      const { data } = await sb.from(TABELLE).select('*').order('geaendert_am', { ascending: false }).limit(100);
      setGespeicherte((data as Gespeichert[]) ?? []);
    } catch { /* still — die Liste ist Beiwerk */ }
  }, []);

  useEffect(() => { void ladeEmpfaenger(quelle); }, [quelle, ladeEmpfaenger]);
  useEffect(() => { void ladeSegmente(); }, [ladeSegmente]);

  // --------------------------------------------------------------- Rechnen
  const segment = useMemo(() => ({ name, verknuepfung, regeln }), [name, verknuepfung, regeln]);
  const zahlen = useMemo(
    () => zaehle(zeilen, segment, heuteIso, quelle),
    [zeilen, segment, heuteIso, quelle],
  );
  const satz = useMemo(() => beschreibe(segment), [segment]);
  const fehlt = useMemo(() => fehltZumSpeichern(segment), [segment]);
  const beispiele = useMemo(
    () => filtere(zeilen, segment, heuteIso).slice(0, 8),
    [zeilen, segment, heuteIso],
  );

  // ------------------------------------------------------------- Bearbeiten
  function setzeRegel(i: number, teil: Partial<Regel>) {
    setRegeln((alt) => alt.map((r, x) => (x === i ? { ...r, ...teil } : r)));
  }
  function wechsleMerkmal(i: number, schluessel: string) {
    const m = merkmal(schluessel);
    const erlaubt = m ? operatorenFuer(m.typ) : [];
    const jetzt = String(regeln[i]?.operator ?? '');
    const passtNoch = erlaubt.some((o) => o.schluessel === jetzt);
    setzeRegel(i, {
      merkmal: schluessel,
      operator: passtNoch ? jetzt : (erlaubt[0]?.schluessel ?? 'ist'),
      wert: '',
    });
  }
  function wechsleQuelle(q: Quelle) {
    setQuelle(q);
    setRegeln([leereRegel(q)]);
    setBearbeitet(null);
    setMeldung('');
  }
  function laden(s: Gespeichert) {
    const q = (String(s.quelle) === 'newsletter' ? 'newsletter' : 'kontakte') as Quelle;
    setQuelle(q);
    setName(String(s.name ?? ''));
    setVerknuepfung(String(s.verknuepfung) === 'oder' ? 'oder' : 'und');
    setRegeln(Array.isArray(s.regeln) && s.regeln.length ? s.regeln : [leereRegel(q)]);
    setBearbeitet(s.id);
    setMeldung('„' + s.name + '" geladen.');
  }
  function neu() {
    setName(''); setVerknuepfung('und'); setRegeln([leereRegel(quelle)]);
    setBearbeitet(null); setMeldung('');
  }

  async function speichern() {
    if (fehlt.length > 0) return;
    setSpeichert(true); setMeldung('');
    try {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setMeldung('Nicht angemeldet.'); return; }
      const satzDaten = {
        owner_user_id: user.id,
        name: name.trim(),
        quelle,
        verknuepfung,
        regeln: regeln as unknown as object,
        geaendert_am: new Date().toISOString(),
      };
      const { error } = bearbeitet
        ? await sb.from(TABELLE).update(satzDaten).eq('id', bearbeitet)
        : await sb.from(TABELLE).insert(satzDaten);
      if (error) setMeldung('Nicht gespeichert: ' + error.message);
      else { setMeldung('Gespeichert: „' + name.trim() + '"'); await ladeSegmente(); }
    } catch (e) {
      setMeldung('Nicht gespeichert: ' + (e instanceof Error ? e.message : 'unbekannt'));
    } finally {
      setSpeichert(false);
    }
  }

  // ----------------------------------------------------------------- Stile
  const eingabe: CSSProperties = {
    background: 'rgba(0,0,0,0.25)', border: '1px solid ' + C.border,
    borderRadius: 8, padding: '9px 11px', color: C.text, fontSize: 14, fontFamily: 'inherit',
  };
  const karte: CSSProperties = {
    background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '20px 22px',
    marginBottom: 18,
  };

  const aktuelleMerkmale = merkmaleFuer(quelle);

  return (
    <main style={{ background: C.navy, minHeight: '100vh', color: C.text, padding: '28px 20px 90px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        <Link href="/dashboard/marketing" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>
          ← Marketing
        </Link>
        <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, margin: '10px 0 6px', letterSpacing: '-0.02em' }}>
          Empfängergruppen
        </h1>
        <p style={{ color: C.dim, margin: '0 0 22px', maxWidth: '70ch', lineHeight: 1.6, fontSize: 15 }}>
          Statt an alle: an die Richtigen. Eine Gruppe wird hier gebaut und gespeichert — verschickt
          wird nichts. Wer der Werbung widersprochen hat, bleibt in jeder Gruppe außen vor.
        </p>

        {/* ------------------------------------------------------- Quelle */}
        <section style={karte}>
          <p style={{ fontSize: 12, color: C.gold, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 12px' }}>
            Woher kommen die Empfänger
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {QUELLEN.map((q) => (
              <button key={q.schluessel} type="button" onClick={() => wechsleQuelle(q.schluessel)}
                style={{
                  background: quelle === q.schluessel ? C.gold : 'transparent',
                  color: quelle === q.schluessel ? C.navy : C.dim,
                  border: '1px solid ' + (quelle === q.schluessel ? C.gold : C.border),
                  borderRadius: 8, padding: '9px 16px', fontSize: 13.5, fontWeight: 600,
                  cursor: 'pointer', textAlign: 'left',
                }}>
                {q.label}
                <span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, opacity: 0.75 }}>{q.hilfe}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------- Regeln */}
        <section style={karte}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Regeln</h2>
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              {(['und', 'oder'] as const).map((v) => (
                <button key={v} type="button" onClick={() => setVerknuepfung(v)}
                  style={{
                    background: verknuepfung === v ? 'rgba(0,229,255,0.14)' : 'transparent',
                    color: verknuepfung === v ? C.cyan : C.dim,
                    border: '1px solid ' + (verknuepfung === v ? C.cyan : C.border),
                    borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  }}>
                  {v === 'und' ? 'alle Regeln' : 'eine genügt'}
                </button>
              ))}
            </div>
          </div>

          {regeln.map((r, i) => {
            const m = merkmal(r.merkmal);
            const typ: MerkmalTyp = m?.typ ?? 'text';
            const ops = operatorenFuer(typ);
            const op = OPERATOREN.find((o) => o.schluessel === String(r.operator ?? ''));
            const gesperrt = String(r.merkmal ?? '') !== '' && !istErlaubt(r.merkmal);
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: 'minmax(150px,1fr) minmax(150px,1fr) minmax(120px,1fr) auto',
                gap: 10, alignItems: 'start', marginBottom: 12,
                paddingBottom: 12, borderBottom: i < regeln.length - 1 ? '1px solid ' + C.border : 'none',
              }}>
                <label style={{ fontSize: 11.5, color: C.dim }}>
                  Merkmal
                  <select value={String(r.merkmal ?? '')} onChange={(e) => wechsleMerkmal(i, e.target.value)}
                    style={{ ...eingabe, width: '100%', marginTop: 5 }}>
                    {aktuelleMerkmale.map((x) => <option key={x.schluessel} value={x.schluessel}>{x.label}</option>)}
                  </select>
                  {m && <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'rgba(143,163,190,0.7)' }}>{m.hilfe}</span>}
                </label>

                <label style={{ fontSize: 11.5, color: C.dim }}>
                  Vergleich
                  <select value={String(r.operator ?? '')} onChange={(e) => setzeRegel(i, { operator: e.target.value })}
                    style={{ ...eingabe, width: '100%', marginTop: 5 }}>
                    {ops.map((o) => <option key={o.schluessel} value={o.schluessel}>{o.label}</option>)}
                  </select>
                </label>

                <label style={{ fontSize: 11.5, color: C.dim }}>
                  Wert
                  {op?.ohneWert
                    ? <div style={{ ...eingabe, width: '100%', marginTop: 5, color: C.dim, fontSize: 13 }}>— nicht nötig —</div>
                    : <input
                        value={String(r.wert ?? '')}
                        onChange={(e) => setzeRegel(i, { wert: e.target.value })}
                        type={typ === 'datum' && (String(r.operator) === 'vor' || String(r.operator) === 'nach' || String(r.operator) === 'ist') ? 'date' : 'text'}
                        placeholder={typ === 'datum' ? 'Tage oder Datum' : ''}
                        style={{ ...eingabe, width: '100%', marginTop: 5 }} />}
                </label>

                <button type="button" onClick={() => setRegeln((alt) => alt.filter((_, x) => x !== i))}
                  disabled={regeln.length === 1}
                  style={{
                    background: 'transparent', border: '1px solid ' + C.border, color: C.dim,
                    borderRadius: 8, padding: '9px 12px', fontSize: 13, marginTop: 21,
                    cursor: regeln.length === 1 ? 'default' : 'pointer', opacity: regeln.length === 1 ? 0.4 : 1,
                  }}>
                  ✕
                </button>

                {gesperrt && (
                  <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 12.5, color: C.danger }}>
                    Nach diesem Merkmal wird nicht segmentiert — es wäre Profilbildung. Die Regel bleibt wirkungslos.
                  </p>
                )}
              </div>
            );
          })}

          <button type="button" onClick={() => setRegeln((alt) => [...alt, leereRegel(quelle)])}
            style={{
              background: 'transparent', border: '1px dashed ' + C.border, color: C.cyan,
              borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            + Regel
          </button>
        </section>

        {/* ------------------------------------------------------ Vorschau */}
        <section style={{ ...karte, borderColor: 'rgba(0,229,255,0.28)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>Wen trifft das?</h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: C.text, margin: '0 0 18px' }}>{satz}</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {[
              { l: 'geprüft', v: zahlen.gesamt, f: C.dim },
              { l: 'passen auf die Regeln', v: zahlen.treffer, f: C.text },
              { l: 'davon erreichbar', v: zahlen.erreichbar, f: C.green },
              { l: 'ohne Einwilligung', v: zahlen.ohneEinwilligung, f: C.warn },
              { l: 'gesperrt', v: zahlen.gesperrt, f: C.danger },
              { l: 'ohne Adresse', v: zahlen.ohneAdresse, f: C.dim },
            ].map((k) => (
              <div key={k.l} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid ' + C.border, borderRadius: 12, padding: '13px 15px' }}>
                <p style={{ fontSize: 11.5, color: C.dim, margin: '0 0 5px' }}>{k.l}</p>
                <p style={{ fontSize: 21, fontWeight: 700, color: k.f, margin: 0 }}>{k.v.toLocaleString('de-DE')}</p>
              </div>
            ))}
          </div>

          {zahlen.gesperrt > 0 && (
            <p style={{ margin: '14px 0 0', fontSize: 13.5, color: C.text, lineHeight: 1.6 }}>
              <b style={{ color: C.danger }}>{zahlen.gesperrt}</b> aus dieser Gruppe bekommen nichts —
              Widerspruch, Abmeldung oder eine nie bestätigte Anmeldung. Das ist kein Fehler, sondern die Sperre.
            </p>
          )}
          {zahlen.ohneEinwilligung > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 13.5, color: C.text, lineHeight: 1.6 }}>
              <b style={{ color: C.warn }}>{zahlen.ohneEinwilligung}</b> haben keine ausdrückliche Einwilligung
              hinterlegt. Ob Sie diese nach § 7 Abs. 3 UWG als Bestandskunden anschreiben dürfen, ist eine
              Frage an Ihren Anwalt — von hier aus gehen sie nicht mit raus.
            </p>
          )}

          {laedt && <p style={{ color: C.dim, marginTop: 14 }}>lädt …</p>}

          {beispiele.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <p style={{ fontSize: 11.5, color: C.gold, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 8px' }}>
                Stichprobe
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
                  <tbody>
                    {beispiele.map((z, i) => {
                      const st = werbeStatus(z, quelle);
                      const wer = String(z.firma ?? z.name ?? [z.vorname, z.nachname].filter(Boolean).join(' ') ?? '').trim();
                      return (
                        <tr key={String(z.id ?? i)} style={{ borderTop: '1px solid ' + C.border }}>
                          <td style={{ padding: '8px 10px' }}>{wer || '—'}</td>
                          <td style={{ padding: '8px 10px', color: C.dim }}>{String(z.email ?? '—')}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: st === 'erlaubt' ? C.green : st === 'ohne_einwilligung' ? C.warn : C.danger }}>
                            {WERBE_STATUS_TEXT[st]}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ------------------------------------------------------ Speichern */}
        <section style={{ ...karte, borderColor: 'rgba(201,168,76,0.3)' }}>
          <label style={{ fontSize: 12, color: C.dim, display: 'block', marginBottom: 14 }}>
            Name der Gruppe
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Bestandskunden Region Stuttgart"
              style={{ ...eingabe, width: '100%', marginTop: 6 }} />
          </label>

          {fehlt.length > 0 && (
            <p style={{ fontSize: 13, color: C.warn, margin: '0 0 12px' }}>
              Zum Speichern fehlt noch: {fehlt.join(' · ')}
            </p>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void speichern()} disabled={speichert || fehlt.length > 0}
              style={{
                background: C.gold, color: C.navy, border: 'none', borderRadius: 10,
                padding: '12px 24px', fontSize: 14, fontWeight: 700,
                cursor: speichert || fehlt.length > 0 ? 'default' : 'pointer',
                opacity: speichert || fehlt.length > 0 ? 0.5 : 1,
              }}>
              {speichert ? 'speichert …' : bearbeitet ? 'Änderung speichern' : 'Gruppe speichern'}
            </button>
            {bearbeitet && (
              <button type="button" onClick={neu}
                style={{ background: 'transparent', border: '1px solid ' + C.border, color: C.dim, borderRadius: 10, padding: '12px 18px', fontSize: 13.5, cursor: 'pointer' }}>
                Neue Gruppe
              </button>
            )}
            {meldung && <span style={{ fontSize: 13, color: meldung.startsWith('Nicht') || meldung.includes('nicht lesbar') ? C.danger : C.green }}>{meldung}</span>}
          </div>
        </section>

        {/* ----------------------------------------------------- Gespeichert */}
        {gespeicherte.length > 0 && (
          <section style={karte}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 14px' }}>Gespeicherte Gruppen</h2>
            {gespeicherte.map((s) => (
              <div key={s.id} style={{
                display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap',
                padding: '11px 0', borderTop: '1px solid ' + C.border,
              }}>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>{s.name}</span>
                <span style={{ fontSize: 12.5, color: C.dim }}>
                  {QUELLEN.find((q) => q.schluessel === s.quelle)?.label ?? s.quelle}
                  {' · '}
                  {(s.regeln ?? []).length} {(s.regeln ?? []).length === 1 ? 'Regel' : 'Regeln'}
                </span>
                <button type="button" onClick={() => laden(s)}
                  style={{
                    marginLeft: 'auto', background: 'transparent', border: '1px solid ' + C.border,
                    color: C.cyan, borderRadius: 8, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer',
                  }}>
                  öffnen
                </button>
              </div>
            ))}
          </section>
        )}

      </div>
    </main>
  );
}
