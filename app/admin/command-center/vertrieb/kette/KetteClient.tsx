'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import {
  werte, summiere, kette, zeit, beurteileZeit, hebelRangliste,
  bedarfFuerKunden, montagVon, wochenLabel, kanalLabel, KANAELE, BELASTBAR_AB,
  ausAktivitaeten, wochenZeitraum,
  type WochenZeile,
} from '@/lib/vertriebsKette';
import { zahlAusFeld, zahlFeld } from '@/lib/zahlen';

// ============================================================================
// ARGONAUT OS · Command Center · vertrieb/kette/KetteClient.tsx
//
// Eintragen und auswerten. Gerechnet wird ausschliesslich in
// lib/vertriebsKette.ts (node-getestet) — hier steht nur Anzeige und Formular.
//
// Zwei Dinge macht diese Seite bewusst anders als ein uebliches Dashboard:
//   · Sie schweigt lieber. Quoten aus zu wenigen Ereignissen werden grau
//     gezeigt und als „noch nicht belastbar" beschriftet, statt als Erkenntnis.
//   · Sie rechnet Zeit mit. Der Stundensatz unten ist die Zahl, an der
//     „selbst machen oder abgeben" haengt.
// ============================================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', warn: '#E0A24C', danger: '#E06666',
  text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)',
  card: 'rgba(255,255,255,0.04)',
};

const TABELLE = 'vertrieb_woche';

type Zeile = WochenZeile & { id?: string };

type Formular = {
  woche: string; kanal: string;
  beitraege: string; ansprachen: string;
  reaktionen: string; antworten: string; gespraeche: string;
  eintragungen: string; termine_gebucht: string; termine_gehalten: string;
  kunden: string; umsatz: string;
  min_inhalte: string; min_ansprache: string; min_gespraeche: string; min_termine: string;
  notiz: string;
};

function leeresFormular(woche: string): Formular {
  return {
    woche, kanal: 'gesamt',
    beitraege: '', ansprachen: '', reaktionen: '', antworten: '', gespraeche: '',
    eintragungen: '', termine_gebucht: '', termine_gehalten: '', kunden: '', umsatz: '',
    min_inhalte: '', min_ansprache: '', min_gespraeche: '', min_termine: '', notiz: '',
  };
}

function n(v: string): number {
  const x = zahlAusFeld(String(v ?? '').trim());
  return Number.isFinite(x) && x > 0 ? x : 0;
}
function zahlDe(v: number | null, nachkomma = 0): string {
  if (v == null) return '—';
  return v.toLocaleString('de-DE', { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma });
}
function euro(v: number | null): string {
  if (v == null) return '—';
  return v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
function prozentDe(v: number | null): string {
  if (v == null) return '—';
  return v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';
}

const FELDER_ZAHL: { schluessel: keyof Formular; label: string; hilfe: string }[] = [
  { schluessel: 'beitraege', label: 'Beiträge', hilfe: 'veröffentlichte Posts, Videos, Artikel' },
  { schluessel: 'ansprachen', label: 'Ansprachen', hilfe: 'Anrufe, Nachrichten, Vernetzungen' },
  { schluessel: 'reaktionen', label: 'Reaktionen', hilfe: 'Kommentare, Likes, Profilbesuche' },
  { schluessel: 'antworten', label: 'Antworten', hilfe: 'jemand hat zurückgeschrieben' },
  { schluessel: 'gespraeche', label: 'Gespräche', hilfe: 'echter Dialog, mehr als eine Nachricht' },
  { schluessel: 'eintragungen', label: 'Anfragen', hilfe: 'Formular, Eintragung, konkretes Interesse' },
  { schluessel: 'termine_gebucht', label: 'Termine gebucht', hilfe: 'Termin steht im Kalender' },
  { schluessel: 'termine_gehalten', label: 'Termine gehalten', hilfe: 'Termin hat stattgefunden' },
  { schluessel: 'kunden', label: 'Kunden', hilfe: 'unterschrieben' },
  { schluessel: 'umsatz', label: 'Umsatz daraus (€)', hilfe: 'was diese Kunden gebracht haben' },
];

const FELDER_ZEIT: { schluessel: keyof Formular; label: string; hilfe: string }[] = [
  { schluessel: 'min_inhalte', label: 'Inhalte', hilfe: 'Beiträge schreiben, Videos schneiden' },
  { schluessel: 'min_ansprache', label: 'Ansprache', hilfe: 'Listen bauen, anschreiben, anrufen' },
  { schluessel: 'min_gespraeche', label: 'Gespräche', hilfe: 'Nachfassen, Chatten, Telefonate' },
  { schluessel: 'min_termine', label: 'Termine', hilfe: 'Vorbereitung, Termin, Nachbereitung' },
];

export default function KetteClient() {
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [meldung, setMeldung] = useState<string>('');
  const [speichert, setSpeichert] = useState(false);
  const [holt, setHolt] = useState(false);
  const [heuteIso, setHeuteIso] = useState('');
  const [form, setForm] = useState<Formular>(leeresFormular(''));
  const [wochenFenster, setWochenFenster] = useState(4);
  const [kanalFilter, setKanalFilter] = useState('alle');
  const [vergleich, setVergleich] = useState('90');
  const [zielKunden, setZielKunden] = useState('4');

  // „heute" kommt aus dem Browser, nicht aus der Logik — die rechnet nur mit
  // dem, was hereingereicht wird.
  useEffect(() => {
    const iso = new Date().toISOString().slice(0, 10);
    setHeuteIso(iso);
    setForm(leeresFormular(montagVon(iso)));
  }, []);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const sb = createClient();
      const { data, error } = await sb.from(TABELLE).select('*').order('woche', { ascending: false }).limit(400);
      if (error) { setMeldung('Konnte nicht laden: ' + error.message); setZeilen([]); }
      else setZeilen((data as Zeile[]) ?? []);
    } catch (e) {
      setMeldung('Konnte nicht laden: ' + (e instanceof Error ? e.message : 'unbekannt'));
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => { void laden(); }, [laden]);

  // Beim Wechsel von Woche oder Kanal die bereits erfassten Zahlen vorbelegen,
  // damit Nachtragen kein Ueberschreiben mit Leere wird.
  useEffect(() => {
    if (!form.woche) return;
    const vorhanden = zeilen.find((z) => String(z.woche).slice(0, 10) === form.woche && String(z.kanal) === form.kanal);
    if (!vorhanden) return;
    setForm((f) => ({
      ...f,
      beitraege: zahlFeld(vorhanden.beitraege ?? ''), ansprachen: zahlFeld(vorhanden.ansprachen ?? ''),
      reaktionen: zahlFeld(vorhanden.reaktionen ?? ''), antworten: zahlFeld(vorhanden.antworten ?? ''),
      gespraeche: zahlFeld(vorhanden.gespraeche ?? ''), eintragungen: zahlFeld(vorhanden.eintragungen ?? ''),
      termine_gebucht: zahlFeld(vorhanden.termine_gebucht ?? ''), termine_gehalten: zahlFeld(vorhanden.termine_gehalten ?? ''),
      kunden: zahlFeld(vorhanden.kunden ?? ''), umsatz: zahlFeld(vorhanden.umsatz ?? ''),
      min_inhalte: zahlFeld(vorhanden.min_inhalte ?? ''), min_ansprache: zahlFeld(vorhanden.min_ansprache ?? ''),
      min_gespraeche: zahlFeld(vorhanden.min_gespraeche ?? ''), min_termine: zahlFeld(vorhanden.min_termine ?? ''),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.woche, form.kanal, zeilen.length]);

  const gefiltert = useMemo(() => {
    if (!heuteIso) return [];
    const grenze = new Date(montagVon(heuteIso) + 'T00:00:00Z');
    grenze.setUTCDate(grenze.getUTCDate() - (wochenFenster - 1) * 7);
    const grenzeIso = grenze.toISOString().slice(0, 10);
    return zeilen.filter((z) => {
      const w = String(z.woche).slice(0, 10);
      if (w < grenzeIso) return false;
      if (kanalFilter !== 'alle' && String(z.kanal) !== kanalFilter) return false;
      return true;
    });
  }, [zeilen, wochenFenster, kanalFilter, heuteIso]);

  const summe = useMemo(() => summiere(gefiltert), [gefiltert]);
  const stufen = useMemo(() => kette(summe), [summe]);
  const zeitwerte = useMemo(() => zeit(summe), [summe]);
  const urteil = useMemo(() => beurteileZeit(zeitwerte.stundensatz, vergleich), [zeitwerte.stundensatz, vergleich]);
  const hebel = useMemo(() => hebelRangliste(summe, 5), [summe]);
  const bedarf = useMemo(() => bedarfFuerKunden(zielKunden, summe), [zielKunden, summe]);

  const maxStufe = Math.max(1, ...stufen.map((s) => s.anzahl));

  const setzeFeld = (schluessel: keyof Formular, wert: string) =>
    setForm((f): Formular => ({ ...f, [schluessel]: wert }));

  // Holt die im Akquise-Cockpit erfassten Einzel-Aktivitäten dieser Woche und
  // schlägt daraus vier Zahlen vor. Überschrieben wird nur, was das Cockpit
  // wirklich weiß — Beiträge, Anfragen, gehaltene Termine, Kunden, Umsatz und
  // alle Zeiten bleiben unangetastet.
  async function ausCockpitHolen() {
    if (!form.woche) return;
    const [von, bis] = wochenZeitraum(form.woche);
    if (!von || !bis) { setMeldung('Diese Woche kann ich nicht lesen.'); return; }
    setHolt(true);
    setMeldung('');
    try {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setMeldung('Nicht angemeldet.'); return; }
      const { data, error } = await sb
        .from('vertrieb_aktivitaet')
        .select('art, ergebnis')
        .eq('owner_user_id', user.id)
        .gte('erstellt_am', von)
        .lt('erstellt_am', bis)
        .limit(5000);
      if (error) { setMeldung('Akquise-Cockpit nicht lesbar: ' + error.message); return; }
      const a = ausAktivitaeten(data ?? []);
      if (a.ansprachen === 0) {
        setMeldung('Für ' + wochenLabel(form.woche) + ' steht im Akquise-Cockpit nichts.');
        return;
      }
      setForm((f): Formular => ({
        ...f,
        ansprachen: zahlFeld(a.ansprachen),
        reaktionen: zahlFeld(a.reaktionen),
        gespraeche: zahlFeld(a.gespraeche),
        termine_gebucht: zahlFeld(a.termineGebucht),
      }));
      setMeldung(
        a.ansprachen + ' Aktivitäten übernommen · ' + a.reaktionen + ' Reaktionen · '
        + a.gespraeche + ' Gespräche · ' + a.termineGebucht + ' Termine'
        + (a.ohneErgebnis > 0 ? ' (' + a.ohneErgebnis + ' ohne verwertbares Ergebnis)' : '')
        + '. Bitte prüfen — das Cockpit trennt nach Art, nicht nach Kanal.',
      );
    } catch (e) {
      setMeldung('Akquise-Cockpit nicht lesbar: ' + (e instanceof Error ? e.message : 'unbekannt'));
    } finally {
      setHolt(false);
    }
  }

  async function speichern() {
    if (!form.woche) return;
    setSpeichert(true);
    setMeldung('');
    try {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setMeldung('Nicht angemeldet.'); return; }
      const satz = {
        owner_user_id: user.id,
        woche: form.woche,
        kanal: form.kanal || 'gesamt',
        beitraege: n(form.beitraege), ansprachen: n(form.ansprachen),
        reaktionen: n(form.reaktionen), antworten: n(form.antworten), gespraeche: n(form.gespraeche),
        eintragungen: n(form.eintragungen), termine_gebucht: n(form.termine_gebucht),
        termine_gehalten: n(form.termine_gehalten), kunden: n(form.kunden), umsatz: n(form.umsatz),
        min_inhalte: n(form.min_inhalte), min_ansprache: n(form.min_ansprache),
        min_gespraeche: n(form.min_gespraeche), min_termine: n(form.min_termine),
        notiz: form.notiz.trim() || null,
        geaendert_am: new Date().toISOString(),
      };
      const { error } = await sb.from(TABELLE).upsert(satz, { onConflict: 'owner_user_id,woche,kanal' });
      if (error) setMeldung('Nicht gespeichert: ' + error.message);
      else { setMeldung('Gespeichert — ' + wochenLabel(form.woche) + ' · ' + kanalLabel(form.kanal)); await laden(); }
    } catch (e) {
      setMeldung('Nicht gespeichert: ' + (e instanceof Error ? e.message : 'unbekannt'));
    } finally {
      setSpeichert(false);
    }
  }

  const eingabe: CSSProperties = {
    width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid ' + C.border,
    borderRadius: 8, padding: '9px 11px', color: C.text, fontSize: 14, fontFamily: 'inherit',
  };
  const karte: CSSProperties = {
    background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '20px 22px',
  };

  return (
    <main style={{ background: C.navy, minHeight: '100vh', color: C.text, padding: '28px 20px 90px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* Kopf */}
        <Link href="/admin/command-center/vertrieb" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>
          ← Vertrieb &amp; Pipeline
        </Link>
        <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, margin: '10px 0 6px', letterSpacing: '-0.02em' }}>
          Meine Vertriebs-Kette
        </h1>
        <p style={{ color: C.dim, margin: 0, maxWidth: '70ch', lineHeight: 1.6, fontSize: 15 }}>
          Was ging raus, was kam zurück — und was hat es an Zeit gekostet. Einmal pro Woche eintragen,
          unten steht die Rechnung. Quoten aus weniger als {BELASTBAR_AB} Ereignissen werden grau gezeigt:
          die sind noch Zufall, keine Erkenntnis.
        </p>

        {/* Zeitraum */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '22px 0 18px' }}>
          {[4, 8, 12, 26].map((w) => (
            <button key={w} type="button" onClick={() => setWochenFenster(w)}
              style={{
                background: wochenFenster === w ? C.gold : 'transparent',
                color: wochenFenster === w ? C.navy : C.dim,
                border: '1px solid ' + (wochenFenster === w ? C.gold : C.border),
                borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
              {w} Wochen
            </button>
          ))}
          <select value={kanalFilter} onChange={(e) => setKanalFilter(e.target.value)}
            style={{ ...eingabe, width: 'auto', marginLeft: 'auto' }}>
            <option value="alle">Alle Kanäle</option>
            {KANAELE.map((k) => <option key={k.schluessel} value={k.schluessel}>{k.label}</option>)}
          </select>
        </div>

        {laedt && <p style={{ color: C.dim }}>lädt …</p>}
        {!laedt && gefiltert.length === 0 && (
          <div style={{ ...karte, borderColor: 'rgba(201,168,76,0.35)' }}>
            <p style={{ margin: 0, color: C.text }}>
              Für diesen Zeitraum ist noch nichts eingetragen. Tragen Sie unten die letzte Woche ein —
              ab der dritten Woche fängt die Rechnung an, etwas zu taugen.
            </p>
          </div>
        )}

        {/* ---------------------------------------------------------- Kette */}
        {gefiltert.length > 0 && (
          <section style={{ ...karte, marginBottom: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Die Kette</h2>
            <p style={{ color: C.dim, fontSize: 13, margin: '0 0 18px' }}>
              {gefiltert.length} {gefiltert.length === 1 ? 'Eintrag' : 'Einträge'} · zusammengezählt
            </p>

            {stufen.map((s) => (
              <div key={s.schluessel} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 5 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{s.label}</span>
                  <span style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                    {s.quote != null && (
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: s.belastbar ? C.cyan : C.dim,
                      }}>
                        {prozentDe(s.quote)}
                        <span style={{ color: C.dim, fontWeight: 400 }}> {s.quoteLabel}</span>
                        {!s.belastbar && <span style={{ color: C.dim, fontWeight: 400 }}> · noch Zufall</span>}
                      </span>
                    )}
                    <span style={{ fontSize: 17, fontWeight: 700, color: C.gold, minWidth: 60, textAlign: 'right' }}>
                      {zahlDe(s.anzahl)}
                    </span>
                  </span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: Math.max(1, (s.anzahl / maxStufe) * 100) + '%',
                    background: s.belastbar || s.quote == null
                      ? `linear-gradient(90deg, ${C.cyan}, ${C.green})`
                      : 'rgba(143,163,190,0.35)',
                    borderRadius: 99,
                  }} />
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ----------------------------------------------------------- Zeit */}
        {gefiltert.length > 0 && (
          <section style={{ ...karte, marginBottom: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Was es an Zeit gekostet hat</h2>
            <p style={{ color: C.dim, fontSize: 13, margin: '0 0 18px' }}>
              Die zweite Währung. Geld kann man nachlegen, Stunden nicht.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {[
                { l: 'Stunden gesamt', v: zahlDe(zeitwerte.stundenGesamt, 1), e: 'Std', f: C.text },
                { l: 'je Gespräch', v: zahlDe(zeitwerte.minJeGespraech, 0), e: 'Min', f: C.text },
                { l: 'je gehaltenem Termin', v: zahlDe(zeitwerte.minJeGehaltenemTermin, 0), e: 'Min', f: C.text },
                { l: 'je gewonnenem Kunden', v: zahlDe(zeitwerte.stundenJeKunde, 1), e: 'Std', f: C.gold },
              ].map((k) => (
                <div key={k.l} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid ' + C.border, borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontSize: 12, color: C.dim, margin: '0 0 6px' }}>{k.l}</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: k.f, margin: 0 }}>
                    {k.v} <span style={{ fontSize: 13, fontWeight: 400, color: C.dim }}>{k.e}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* Stundensatz + Urteil */}
            <div style={{ marginTop: 16, padding: '18px 20px', borderRadius: 12, background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.28)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 12, color: C.gold, margin: '0 0 4px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>
                    Ihr Stundensatz im Vertrieb
                  </p>
                  <p style={{ fontSize: 30, fontWeight: 800, margin: 0, color: C.text }}>
                    {euro(zeitwerte.stundensatz)} <span style={{ fontSize: 14, fontWeight: 400, color: C.dim }}>je eingesetzter Stunde</span>
                  </p>
                </div>
                <label style={{ fontSize: 13, color: C.dim }}>
                  Vergleich (€/Std)
                  <input value={vergleich} onChange={(e) => setVergleich(e.target.value)} inputMode="decimal"
                    style={{ ...eingabe, width: 110, marginTop: 6 }} />
                </label>
              </div>
              <p style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.6, color: C.text }}>
                {urteil.urteil === 'offen' && <span style={{ color: C.dim }}>Sobald Umsatz, Zeit und ein Vergleichswert stehen, steht hier das Urteil.</span>}
                {urteil.urteil === 'lohnt' && <><b style={{ color: C.green }}>Ihre Zeit ist hier gut angelegt.</b> Die Vertriebsstunde bringt das {zahlDe(urteil.faktor, 1)}-fache des Vergleichswerts.</>}
                {urteil.urteil === 'grenzwertig' && <><b style={{ color: C.warn }}>Es trägt sich, mehr nicht.</b> Faktor {zahlDe(urteil.faktor, 1)} — bei der nächsten Auslastungsspitze ist das der erste Kandidat zum Abgeben.</>}
                {urteil.urteil === 'abgeben' && <><b style={{ color: C.danger }}>Diese Stunde verdient anderswo mehr.</b> Faktor {zahlDe(urteil.faktor, 1)} — der Teil gehört an jemanden abgegeben oder durch bezahlte Reichweite ersetzt.</>}
              </p>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------- Hebel */}
        {hebel.length > 0 && (
          <section style={{ ...karte, marginBottom: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Wo fünf Punkte am meisten bringen</h2>
            <p style={{ color: C.dim, fontSize: 13, margin: '0 0 16px', maxWidth: '70ch', lineHeight: 1.55 }}>
              Keine Meinung, sondern Rechnung: jede Quote wird einzeln um fünf Prozentpunkte angehoben,
              alle anderen bleiben. Oben steht, was die meisten Kunden bringt.
            </p>
            {hebel.map((h, i) => (
              <div key={h.schluessel} style={{
                display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 0',
                borderTop: i === 0 ? 'none' : '1px solid ' + C.border,
              }}>
                <span style={{ color: i === 0 ? C.gold : C.dim, fontWeight: 700, fontSize: 13, minWidth: 20 }}>{i + 1}.</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{h.quoteLabel}</span>
                  <span style={{ color: C.dim, fontSize: 13 }}> — heute {prozentDe(h.quote)}{!h.belastbar && ' · noch Zufall'}</span>
                </span>
                <span style={{ color: h.gewinn > 0 ? C.green : C.dim, fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>
                  +{zahlDe(h.gewinn, 2)} Kunden
                </span>
              </div>
            ))}
          </section>
        )}

        {/* ----------------------------------------------------------- Ziel */}
        {gefiltert.length > 0 && (
          <section style={{ ...karte, marginBottom: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Rückwärts gerechnet</h2>
            <p style={{ color: C.dim, fontSize: 13, margin: '0 0 16px' }}>
              Mit Ihren eigenen gemessenen Quoten — nicht mit Richtwerten aus dem Internet.
            </p>
            <label style={{ fontSize: 13, color: C.dim, display: 'inline-block', marginBottom: 14 }}>
              Ziel: Kunden im Zeitraum
              <input value={zielKunden} onChange={(e) => setZielKunden(e.target.value)} inputMode="numeric"
                style={{ ...eingabe, width: 110, marginTop: 6 }} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {[
                { l: 'gehaltene Termine', v: bedarf.gehalten },
                { l: 'gebuchte Termine', v: bedarf.gebucht },
                { l: 'Anfragen', v: bedarf.eintragungen },
                { l: 'Gespräche', v: bedarf.gespraeche },
                { l: 'Reaktionen', v: bedarf.reaktionen },
                { l: 'Beiträge & Ansprachen', v: bedarf.hinaus },
              ].map((k) => (
                <div key={k.l} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid ' + C.border, borderRadius: 12, padding: '12px 14px' }}>
                  <p style={{ fontSize: 12, color: C.dim, margin: '0 0 4px' }}>{k.l}</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: k.v == null ? C.dim : C.cyan, margin: 0 }}>{zahlDe(k.v)}</p>
                </div>
              ))}
            </div>
            <p style={{ margin: '14px 0 0', fontSize: 14, color: C.text }}>
              Zeitbedarf nach bisherigem Verbrauch: <b style={{ color: C.gold }}>{zahlDe(bedarf.stunden, 1)} Stunden</b>.
              {bedarf.hinaus == null && <span style={{ color: C.dim }}> Eine Stufe der Kette ist noch nicht gefüllt — deshalb bricht die Rechnung oben ab, statt zu raten.</span>}
            </p>
          </section>
        )}

        {/* -------------------------------------------------------- Eingabe */}
        <section style={{ ...karte, marginBottom: 18, borderColor: 'rgba(201,168,76,0.3)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Woche eintragen</h2>
          <p style={{ color: C.dim, fontSize: 13, margin: '0 0 18px' }}>
            Leere Felder zählen als null. Eine bereits erfasste Woche wird beim Wechsel oben vorbelegt.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: C.dim }}>
              Woche (Montag)
              <input type="date" value={form.woche}
                onChange={(e) => setForm({ ...form, woche: montagVon(e.target.value) || e.target.value })}
                style={{ ...eingabe, marginTop: 6 }} />
            </label>
            <label style={{ fontSize: 12, color: C.dim }}>
              Kanal
              <select value={form.kanal} onChange={(e) => setForm({ ...form, kanal: e.target.value })}
                style={{ ...eingabe, marginTop: 6 }}>
                {KANAELE.map((k) => <option key={k.schluessel} value={k.schluessel}>{k.label}</option>)}
              </select>
            </label>
          </div>

          {/* Brücke zum Akquise-Cockpit: wer jeden Anruf einzeln tippt, soll ihn
              am Freitag nicht noch einmal zählen. Der Knopf schlägt nur vor —
              vier Felder, der Rest bleibt Handarbeit. */}
          <div style={{
            display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
            padding: '12px 14px', marginBottom: 18, borderRadius: 12,
            background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.22)',
          }}>
            <button type="button" onClick={() => void ausCockpitHolen()} disabled={holt || !form.woche}
              style={{
                background: 'transparent', color: C.cyan, border: '1px solid ' + C.cyan,
                borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700,
                cursor: holt ? 'default' : 'pointer', opacity: holt ? 0.6 : 1, whiteSpace: 'nowrap',
              }}>
              {holt ? 'liest …' : '↓ Aus dem Akquise-Cockpit holen'}
            </button>
            <span style={{ fontSize: 12.5, color: C.dim, flex: 1, minWidth: 220, lineHeight: 1.5 }}>
              Füllt Ansprachen, Reaktionen, Gespräche und gebuchte Termine aus dem, was Sie
              unter <Link href="/dashboard/akquise" style={{ color: C.cyan }}>Akquise</Link> schon
              einzeln erfasst haben. Beiträge, Anfragen, gehaltene Termine, Kunden, Umsatz und
              alle Zeiten bleiben Ihre Eingabe.
            </span>
          </div>

          <p style={{ fontSize: 12, color: C.gold, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 10px' }}>Stückzahlen</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
            {FELDER_ZAHL.map((f) => (
              <label key={f.schluessel} style={{ fontSize: 12, color: C.dim }}>
                {f.label}
                <input value={String(form[f.schluessel])} inputMode="decimal"
                  onChange={(e) => setzeFeld(f.schluessel, e.target.value)}
                  placeholder="0" style={{ ...eingabe, marginTop: 6 }} />
                <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'rgba(143,163,190,0.7)' }}>{f.hilfe}</span>
              </label>
            ))}
          </div>

          <p style={{ fontSize: 12, color: C.gold, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 10px' }}>Zeit in Minuten</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
            {FELDER_ZEIT.map((f) => (
              <label key={f.schluessel} style={{ fontSize: 12, color: C.dim }}>
                {f.label}
                <input value={String(form[f.schluessel])} inputMode="numeric"
                  onChange={(e) => setzeFeld(f.schluessel, e.target.value)}
                  placeholder="0" style={{ ...eingabe, marginTop: 6 }} />
                <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'rgba(143,163,190,0.7)' }}>{f.hilfe}</span>
              </label>
            ))}
          </div>

          <label style={{ fontSize: 12, color: C.dim, display: 'block', marginBottom: 16 }}>
            Notiz (was war besonders in dieser Woche?)
            <input value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })}
              placeholder="Urlaub, Messe, Kampagne …" style={{ ...eingabe, marginTop: 6 }} />
          </label>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void speichern()} disabled={speichert || !form.woche}
              style={{
                background: C.gold, color: C.navy, border: 'none', borderRadius: 10,
                padding: '12px 24px', fontSize: 14, fontWeight: 700,
                cursor: speichert ? 'default' : 'pointer', opacity: speichert ? 0.6 : 1,
              }}>
              {speichert ? 'speichert …' : 'Woche speichern'}
            </button>
            {meldung && <span style={{ fontSize: 13, color: meldung.startsWith('Gespeichert') ? C.green : C.danger }}>{meldung}</span>}
          </div>
        </section>

        {/* ----------------------------------------------------- Wochenliste */}
        {zeilen.length > 0 && (
          <section style={karte}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 14px' }}>Eingetragene Wochen</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
                <thead>
                  <tr style={{ color: C.dim, textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600 }}>Woche</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600 }}>Kanal</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600 }}>hinaus</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600 }}>Gespräche</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600 }}>gehalten</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600 }}>Kunden</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600 }}>Stunden</th>
                  </tr>
                </thead>
                <tbody>
                  {zeilen.slice(0, 30).map((z, i) => {
                    const w = werte(z);
                    const std = (w.minInhalte + w.minAnsprache + w.minGespraeche + w.minTermine) / 60;
                    return (
                      <tr key={String(z.id ?? i)} style={{ borderTop: '1px solid ' + C.border, textAlign: 'right' }}>
                        <td style={{ textAlign: 'left', padding: '9px 10px' }}>{wochenLabel(String(z.woche).slice(0, 10))}</td>
                        <td style={{ textAlign: 'left', padding: '9px 10px', color: C.dim }}>{kanalLabel(z.kanal)}</td>
                        <td style={{ padding: '9px 10px' }}>{zahlDe(w.beitraege + w.ansprachen)}</td>
                        <td style={{ padding: '9px 10px' }}>{zahlDe(w.gespraeche)}</td>
                        <td style={{ padding: '9px 10px' }}>{zahlDe(w.termineGehalten)}</td>
                        <td style={{ padding: '9px 10px', color: w.kunden > 0 ? C.green : C.dim, fontWeight: 700 }}>{zahlDe(w.kunden)}</td>
                        <td style={{ padding: '9px 10px', color: C.dim }}>{zahlDe(std, 1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
