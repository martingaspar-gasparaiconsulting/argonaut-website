'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import {
  pruefeMenge, phase, restStunden, ergebnis, fehltZumStart, kurzstand,
  PHASE_TEXT, WARTEZEIT_STUNDEN, type Phase,
} from '@/lib/abTest';

// ============================================================================
// ARGONAUT OS · MODUL 3 MARKETING · A/B-Test für Betreffzeilen (3.15 Teil 2)
//
// Eigene Seite statt Umbau der 27-KB-Newsletter-Seite: der Test hat einen
// eigenen Ablauf über Stunden hinweg (starten → warten → Rest senden), der
// im normalen Versandformular nur im Weg stünde.
//
// Gerechnet und beurteilt wird in lib/abTest.ts und lib/mailMessung.ts, beide
// node-getestet. Diese Seite zeigt an und ruft die Route auf.
//
// Der wichtigste Satz steht ganz oben: ob die Liste für einen Test überhaupt
// reicht. Alles andere wäre eine Zahl, auf die jemand eine Entscheidung baut.
// ============================================================================

const C = {
  navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  warn: '#E0A24C', danger: '#E06666',
  text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)',
  card: 'rgba(255,255,255,0.04)',
};

type TestZeile = {
  id: string;
  betreff_a: string; betreff_b: string; inhalt: string;
  anteil: number;
  versand_a_id: string | null; versand_b_id: string | null;
  gestartet_am: string | null; rest_gesendet_am: string | null;
  genommen: string | null; war_belastbar: boolean | null;
};

type Versand = {
  id: string; betreff: string | null;
  empfaenger_anzahl: number | null; erfolg_anzahl: number | null;
  geoeffnet_anzahl: number | null; geklickt_anzahl: number | null;
};

export default function AbTestPage() {
  const [betreffA, setBetreffA] = useState('');
  const [betreffB, setBetreffB] = useState('');
  const [inhalt, setInhalt] = useState('');
  const [abonnenten, setAbonnenten] = useState(0);
  const [tests, setTests] = useState<TestZeile[]>([]);
  const [versendungen, setVersendungen] = useState<Record<string, Versand>>({});
  const [laedt, setLaedt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState('');
  const [jetztIso, setJetztIso] = useState('');

  useEffect(() => {
    setJetztIso(new Date().toISOString());
    const uhr = setInterval(() => setJetztIso(new Date().toISOString()), 60_000);
    return () => clearInterval(uhr);
  }, []);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const sb = createClient();

      const { count } = await sb
        .from('newsletter_abonnenten')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'aktiv');
      setAbonnenten(count ?? 0);

      const { data: testRoh } = await sb
        .from('newsletter_ab_test').select('*')
        .order('erstellt_am', { ascending: false }).limit(20);
      const liste = (testRoh as TestZeile[]) ?? [];
      setTests(liste);

      const ids = liste.flatMap((t) => [t.versand_a_id, t.versand_b_id]).filter(Boolean) as string[];
      if (ids.length > 0) {
        const { data: vRoh } = await sb
          .from('newsletter_versand')
          .select('id, betreff, empfaenger_anzahl, erfolg_anzahl, geoeffnet_anzahl, geklickt_anzahl')
          .in('id', ids);
        const karte: Record<string, Versand> = {};
        for (const v of (vRoh as Versand[]) ?? []) karte[v.id] = v;
        setVersendungen(karte);
      }
    } catch (e) {
      setMeldung('Konnte nicht laden: ' + (e instanceof Error ? e.message : 'unbekannt'));
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => { void laden(); }, [laden]);

  const befund = useMemo(() => pruefeMenge(abonnenten), [abonnenten]);
  const fehlt = useMemo(
    () => [...fehltZumStart(betreffA, betreffB, abonnenten), ...(inhalt.trim().length < 10 ? ['der Inhalt'] : [])],
    [betreffA, betreffB, abonnenten, inhalt],
  );

  async function ruf(koerper: Record<string, unknown>) {
    setBusy(true); setMeldung('');
    try {
      const r = await fetch('/api/newsletter-ab-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(koerper),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) setMeldung(d?.error || 'Hat nicht geklappt.');
      else {
        setMeldung(
          koerper.aktion === 'starten'
            ? `Gestartet: ${d.gruppeA} mit der ersten, ${d.gruppeB} mit der zweiten Betreffzeile. In ${WARTEZEIT_STUNDEN} Stunden auswerten.`
            : `Rest verschickt an ${d.gesendet}. ${d.satz ?? ''}`,
        );
        setBetreffA(''); setBetreffB(''); setInhalt('');
        await laden();
      }
    } catch (e) {
      setMeldung('Hat nicht geklappt: ' + (e instanceof Error ? e.message : 'unbekannt'));
    } finally {
      setBusy(false);
    }
  }

  const eingabe: CSSProperties = {
    width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid ' + C.border,
    borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 14, fontFamily: 'inherit',
  };
  const karte: CSSProperties = {
    background: C.card, border: '1px solid ' + C.border, borderRadius: 14,
    padding: '20px 22px', marginBottom: 18,
  };

  function phaseFarbe(p: Phase): string {
    if (p === 'auswertbar') return C.green;
    if (p === 'wartet') return C.warn;
    if (p === 'abgeschlossen') return C.dim;
    return C.dim;
  }

  return (
    <main style={{ background: C.navy, minHeight: '100vh', color: C.text, padding: '28px 20px 90px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        <Link href="/dashboard/marketing" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>
          ← Marketing
        </Link>
        <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, margin: '10px 0 6px', letterSpacing: '-0.02em' }}>
          Zwei Betreffzeilen testen
        </h1>
        <p style={{ color: C.dim, margin: '0 0 22px', maxWidth: '70ch', lineHeight: 1.6, fontSize: 15 }}>
          Derselbe Inhalt, zwei Betreffzeilen, je an einen Teil der Liste. Nach {WARTEZEIT_STUNDEN} Stunden
          bekommt der Rest die bessere. Gemessen werden nur Summen — nie, wer geöffnet hat.
        </p>

        {/* ---------------------------------------------------- Mengenbefund */}
        <section style={{
          ...karte,
          borderColor: befund.moeglich ? 'rgba(76,175,125,0.3)' : 'rgba(224,162,76,0.4)',
          background: befund.moeglich ? 'rgba(76,175,125,0.06)' : 'rgba(224,162,76,0.07)',
        }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
            <b style={{ color: befund.moeglich ? C.green : C.warn }}>
              {abonnenten.toLocaleString('de-DE')} aktive Empfänger.
            </b>{' '}
            {befund.satz}
          </p>
        </section>

        {/* --------------------------------------------------------- Neu */}
        {befund.moeglich && (
          <section style={{ ...karte, borderColor: 'rgba(201,168,76,0.3)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>Neuer Test</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: C.dim }}>
                Erste Betreffzeile
                <input value={betreffA} onChange={(e) => setBetreffA(e.target.value)}
                  placeholder="z. B. Drei Fehler, die Ihre Abnahme verzögern"
                  style={{ ...eingabe, marginTop: 6 }} />
              </label>
              <label style={{ fontSize: 12, color: C.dim }}>
                Zweite Betreffzeile
                <input value={betreffB} onChange={(e) => setBetreffB(e.target.value)}
                  placeholder="z. B. Ihre Abnahme dauert zu lange? Das liegt meist hieran"
                  style={{ ...eingabe, marginTop: 6 }} />
              </label>
            </div>

            <label style={{ fontSize: 12, color: C.dim, display: 'block', marginBottom: 14 }}>
              Inhalt — für beide Varianten gleich
              <textarea value={inhalt} onChange={(e) => setInhalt(e.target.value)}
                rows={8}
                placeholder="Der Text des Newsletters. Nur die Betreffzeile wird getestet, sonst wäre nicht klar, woran der Unterschied lag."
                style={{ ...eingabe, marginTop: 6, resize: 'vertical', lineHeight: 1.6 }} />
            </label>

            {fehlt.length > 0 && (
              <p style={{ fontSize: 13, color: C.warn, margin: '0 0 12px' }}>
                Zum Start fehlt noch: {fehlt.join(' · ')}
              </p>
            )}

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" disabled={busy || fehlt.length > 0}
                onClick={() => void ruf({ aktion: 'starten', betreff_a: betreffA, betreff_b: betreffB, inhalt })}
                style={{
                  background: C.gold, color: C.navy, border: 'none', borderRadius: 10,
                  padding: '12px 24px', fontSize: 14, fontWeight: 700,
                  cursor: busy || fehlt.length > 0 ? 'default' : 'pointer',
                  opacity: busy || fehlt.length > 0 ? 0.5 : 1,
                }}>
                {busy ? 'läuft …' : `Test starten (${befund.jeGruppe} + ${befund.jeGruppe} Empfänger)`}
              </button>
              {meldung && (
                <span style={{ fontSize: 13, color: meldung.startsWith('Gestartet') || meldung.startsWith('Rest') ? C.green : C.danger }}>
                  {meldung}
                </span>
              )}
            </div>
          </section>
        )}

        {!befund.moeglich && meldung && (
          <p style={{ fontSize: 13, color: C.danger, marginBottom: 18 }}>{meldung}</p>
        )}

        {/* ------------------------------------------------------- Läufe */}
        {laedt && <p style={{ color: C.dim }}>lädt …</p>}

        {tests.map((t) => {
          const wo = phase(t, jetztIso);
          const va = t.versand_a_id ? versendungen[t.versand_a_id] : undefined;
          const vb = t.versand_b_id ? versendungen[t.versand_b_id] : undefined;
          const e = ergebnis(va, vb);
          const offen = restStunden(t, jetztIso);

          return (
            <section key={t.id} style={karte}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: phaseFarbe(wo), letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {PHASE_TEXT[wo]}
                </span>
                <span style={{ fontSize: 12.5, color: C.dim, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                  {kurzstand(e)}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                {[
                  { titel: t.betreff_a, v: va, ist: 'a' as const },
                  { titel: t.betreff_b, v: vb, ist: 'b' as const },
                ].map((s) => (
                  <div key={s.ist} style={{
                    background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '14px 16px',
                    border: '1px solid ' + (e.sieger === s.ist ? C.green : C.border),
                  }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px', lineHeight: 1.45 }}>
                      {s.titel}
                      {e.sieger === s.ist && <span style={{ color: C.green, fontWeight: 700 }}> ✓</span>}
                    </p>
                    <p style={{ fontSize: 12.5, color: C.dim, margin: 0 }}>
                      {(s.v?.erfolg_anzahl ?? 0).toLocaleString('de-DE')} zugestellt ·{' '}
                      {(s.v?.geoeffnet_anzahl ?? 0).toLocaleString('de-DE')} geöffnet ·{' '}
                      {(s.v?.geklickt_anzahl ?? 0).toLocaleString('de-DE')} geklickt
                    </p>
                  </div>
                ))}
              </div>

              <p style={{ fontSize: 13.5, color: C.text, lineHeight: 1.6, margin: '14px 0 0' }}>{e.satz}</p>

              {wo === 'wartet' && offen != null && (
                <p style={{ fontSize: 13, color: C.warn, margin: '10px 0 0' }}>
                  Noch etwa {offen} {offen === 1 ? 'Stunde' : 'Stunden'} — vorher sehen Sie nur die Postfächer,
                  die zufällig gerade offen waren.
                </p>
              )}

              {wo === 'auswertbar' && (
                <button type="button" disabled={busy}
                  onClick={() => void ruf({ aktion: 'rest', test_id: t.id })}
                  style={{
                    marginTop: 14, background: 'transparent', border: '1px solid ' + C.green, color: C.green,
                    borderRadius: 10, padding: '11px 20px', fontSize: 13.5, fontWeight: 700,
                    cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
                  }}>
                  Rest mit der {e.empfehlung === 'a' ? 'ersten' : 'zweiten'} Betreffzeile senden
                </button>
              )}

              {wo === 'abgeschlossen' && (
                <p style={{ fontSize: 13, color: C.dim, margin: '10px 0 0' }}>
                  Der Rest ging mit der {t.genommen === 'b' ? 'zweiten' : 'ersten'} Betreffzeile raus
                  {t.war_belastbar === false && ' — als Setzung, nicht als Ergebnis'}.
                </p>
              )}
            </section>
          );
        })}

        {!laedt && tests.length === 0 && (
          <p style={{ color: C.dim, fontSize: 14 }}>Noch kein Test gelaufen.</p>
        )}

      </div>
    </main>
  );
}
