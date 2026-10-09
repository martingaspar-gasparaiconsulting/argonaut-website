'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/rechtliche-freigaben — Rechts-Freigaben-Zentrale (Paket 287, RF1)
//
// Je heikler Funktion: was sie tut, warum sie eine Freigabe braucht, die
// Voraussetzungen als Häkchen (mit „Vorlage folgt" bis zur Prüfung durch den
// Anwalt), Betriebsrat, Zweck, Anbieter. Erst nach der Bestätigung durch die
// Geschäftsleitung ist die Funktion nutzbar; die Freigabe gilt 12 Monate.
// Entscheidung am Server (/api/rechts-freigaben). Kundentext mit „Sie".
// ============================================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { datumDe, ZWECK_MAX, DIENSTLEISTER_MAX, type FreigabeStand, type Haken } from '@/lib/rechtsFreigaben';

const C = { navy: '#0A1628', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };

type Nachweis = { name: string | null; am: string; fassung: string | null; haken: string[]; betriebsrat: string | null; zweck: string | null; dienstleister: string | null; widerrufenAm: string | null };
type Funktion = {
  key: string; titel: string; wofuer: string; warum: string; wo: string; verfuegbar: boolean;
  haken: Haken[]; betriebsrat: boolean; zweck: boolean; dienstleister: boolean;
  stand: FreigabeStand; sperrText: string | null; nachweis: Nachweis | null;
};
type Antwort = { ok: boolean; rolle?: 'chef' | 'mitarbeiter'; bereit?: boolean; funktionen?: Funktion[]; error?: string };

const STUFE: Record<FreigabeStand['stufe'], { text: string; farbe: string }> = {
  offen: { text: 'gesperrt — noch nicht bestätigt', farbe: C.dim },
  frei: { text: 'freigegeben', farbe: C.ok },
  abgelaufen: { text: 'gesperrt — abgelaufen', farbe: C.bad },
  neue_fassung: { text: 'gesperrt — neu bestätigen', farbe: C.warn },
  widerrufen: { text: 'gesperrt — widerrufen', farbe: C.bad },
};

export default function RechtlicheFreigabenPage() {
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [haken, setHaken] = useState<string[]>([]);
  const [betriebsrat, setBetriebsrat] = useState<'' | 'einbezogen' | 'keiner'>('');
  const [zweck, setZweck] = useState('');
  const [anbieter, setAnbieter] = useState('');
  const [rueckfrage, setRueckfrage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async () => {
    try {
      const r = await fetch('/api/rechts-freigaben', { cache: 'no-store' });
      setDaten(await r.json() as Antwort);
    } catch { setDaten({ ok: false, error: 'Gerade nicht erreichbar.' }); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  function oeffnen(f: Funktion) {
    setOffen(offen === f.key ? null : f.key);
    setHaken([]); setBetriebsrat(''); setMeldung(null);
    setZweck(f.nachweis?.zweck ?? ''); setAnbieter(f.nachweis?.dienstleister ?? '');
  }

  async function senden(body: Record<string, unknown>) {
    setBusy(true); setMeldung(null);
    try {
      const r = await fetch('/api/rechts-freigaben', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json() as { ok?: boolean; meldung?: string; error?: string };
      setMeldung({ ok: !!j.ok, text: j.ok ? (j.meldung ?? 'Erledigt.') : (j.error ?? 'Fehler.') });
      if (j.ok) { setOffen(null); setRueckfrage(null); }
    } catch { setMeldung({ ok: false, text: 'Gerade nicht erreichbar.' }); }
    setBusy(false);
    await laden();
  }

  const istChef = daten?.rolle === 'chef';
  const liste = daten?.funktionen ?? [];
  const frei = liste.filter((f) => f.stand.aktiv).length;
  const bald = liste.filter((f) => f.stand.aktiv && f.stand.bald);

  return (
    <div style={s.page}>
      <a href="/dashboard" style={s.zurueck}>← Dashboard</a>
      <h1 style={s.h1}>⚖️ Rechtliche Freigaben</h1>
      <p style={s.dim}>
        So geht&apos;s: Manche Funktionen berühren Rechte von Mitarbeitern oder Kunden — etwa Ortung, Auswertungen je Mitarbeiter oder Kameras.
        Sie sind gesperrt, bis die Geschäftsleitung hier die Voraussetzungen bestätigt hat. Festgehalten werden wer, wann, welche Fassung und welche Angaben.
        Eine Freigabe gilt 12 Monate und lässt sich jederzeit widerrufen.
      </p>
      <div style={s.hinweis}>
        ARGONAUT OS prüft nicht, ob Ihre Unterlagen ausreichen, und ersetzt keine Rechtsberatung. Es hält fest, was Sie bestätigen, und gibt die Funktion erst danach frei.
        Vorlagen für Hinweistexte, Einwilligungen und Betriebsvereinbarungen folgen nach rechtlicher Prüfung.
      </div>

      {!daten && <p style={s.dim}>Lädt …</p>}
      {daten && !daten.ok && <p style={{ ...s.dim, color: C.bad }}>{daten.error ?? 'Fehler beim Laden.'}</p>}
      {daten?.ok && daten.bereit === false && istChef && (
        <p style={{ ...s.dim, color: C.warn }}>Die Freigaben sind noch nicht eingerichtet (SQL zu Paket 287 fehlt). Bis dahin bleiben alle Funktionen gesperrt.</p>
      )}
      {daten?.ok && !istChef && (
        <p style={{ ...s.dim, color: C.warn }}>Freigaben bestätigt nur die Geschäftsleitung. Hier sehen Sie, welche Funktionen nutzbar sind.</p>
      )}

      {daten?.ok && (
        <div style={s.kacheln}>
          <div style={s.kachel}><b style={s.zahl}>{frei}</b><span style={s.dim}>von {liste.length} freigegeben</span></div>
          <div style={s.kachel}><b style={{ ...s.zahl, color: bald.length ? C.warn : C.text }}>{bald.length}</b><span style={s.dim}>laufen in 30 Tagen ab</span></div>
        </div>
      )}
      {meldung && <p style={{ ...s.dim, color: meldung.ok ? C.ok : C.bad, fontWeight: 700 }}>{meldung.text}</p>}

      {liste.map((f) => {
        const st = STUFE[f.stand.stufe];
        const auf = offen === f.key;
        return (
          <div key={f.key} style={{ ...s.karte, borderColor: f.stand.aktiv ? 'rgba(201,168,76,0.55)' : C.border }}>
            <div style={s.kopf}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{f.titel}</div>
                <div style={s.klein}>{f.wofuer}</div>
              </div>
              <span style={{ ...s.marke, color: st.farbe, borderColor: st.farbe }}>{st.text}</span>
            </div>
            <div style={{ ...s.klein, marginTop: 6 }}><b style={{ color: C.text }}>Wo:</b> {f.wo}{f.verfuegbar ? '' : ' — Sie können die Freigabe schon vorab bestätigen.'}</div>
            <div style={{ ...s.klein, marginTop: 4 }}><b style={{ color: C.text }}>Warum eine Freigabe:</b> {f.warum}</div>
            {f.stand.aktiv && f.stand.gueltigBis && (
              <div style={{ ...s.klein, marginTop: 6, color: f.stand.bald ? C.warn : C.ok }}>
                Gültig bis {datumDe(f.stand.gueltigBis)}{f.stand.bald ? ` — noch ${f.stand.restTage} Tag${f.stand.restTage === 1 ? '' : 'e'}, bitte neu bestätigen` : ''}
              </div>
            )}
            {f.nachweis && (
              <div style={{ ...s.klein, marginTop: 6 }}>
                Nachweis: bestätigt von {f.nachweis.name ?? '—'} am {datumDe(f.nachweis.am)} · Fassung {f.nachweis.fassung ?? '—'}
                {f.nachweis.betriebsrat ? ` · Betriebsrat: ${f.nachweis.betriebsrat === 'einbezogen' ? 'einbezogen' : 'keiner vorhanden'}` : ''}
                {f.nachweis.dienstleister ? ` · Anbieter: ${f.nachweis.dienstleister}` : ''}
                {f.nachweis.zweck ? ` · Zweck: ${f.nachweis.zweck}` : ''}
                {f.nachweis.widerrufenAm ? ` · widerrufen am ${datumDe(f.nachweis.widerrufenAm)}` : ''}
              </div>
            )}

            {istChef && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button type="button" style={{ ...s.knopf, background: C.gold, color: C.navy }} onClick={() => oeffnen(f)} disabled={busy}>
                  {auf ? 'Schließen' : f.stand.aktiv ? 'Neu bestätigen' : 'Voraussetzungen bestätigen'}
                </button>
                {f.stand.aktiv && (rueckfrage === f.key ? (
                  <>
                    <span style={{ ...s.klein, alignSelf: 'center' }}>Wirklich widerrufen? Die Funktion ist danach sofort gesperrt.</span>
                    <button type="button" style={{ ...s.knopf, background: C.bad, color: '#fff' }} disabled={busy} onClick={() => void senden({ aktion: 'widerrufen', funktion: f.key })}>Ja, widerrufen</button>
                    <button type="button" style={{ ...s.knopf, background: 'transparent', color: C.dim, border: `1px solid ${C.border}` }} onClick={() => setRueckfrage(null)}>Abbrechen</button>
                  </>
                ) : (
                  <button type="button" style={{ ...s.knopf, background: 'transparent', color: C.bad, border: `1px solid ${C.bad}` }} disabled={busy} onClick={() => setRueckfrage(f.key)}>Widerrufen</button>
                ))}
              </div>
            )}

            {istChef && auf && (
              <div style={s.formular}>
                {f.haken.map((h) => (
                  <label key={h.key} style={s.haken}>
                    <input type="checkbox" checked={haken.includes(h.key)}
                      onChange={(e) => setHaken(e.target.checked ? [...haken, h.key] : haken.filter((x) => x !== h.key))} />
                    <span>{h.text}{h.vorlage && <span style={{ color: C.dim }}> ({h.vorlage})</span>}</span>
                  </label>
                ))}
                {f.betriebsrat && (
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '6px 0' }}>
                    <span style={s.klein}>Betriebsrat:</span>
                    <label style={s.haken}><input type="radio" name={`br-${f.key}`} checked={betriebsrat === 'einbezogen'} onChange={() => setBetriebsrat('einbezogen')} /> einbezogen (z. B. Betriebsvereinbarung)</label>
                    <label style={s.haken}><input type="radio" name={`br-${f.key}`} checked={betriebsrat === 'keiner'} onChange={() => setBetriebsrat('keiner')} /> kein Betriebsrat vorhanden</label>
                  </div>
                )}
                {f.zweck && (
                  <label style={s.feld}>Zweck
                    <textarea value={zweck} maxLength={ZWECK_MAX} rows={2} onChange={(e) => setZweck(e.target.value)} style={s.eingabe} placeholder="Wofür wird die Funktion genutzt?" />
                  </label>
                )}
                {f.dienstleister && (
                  <label style={s.feld}>Anbieter bzw. Vertragspartner
                    <input value={anbieter} maxLength={DIENSTLEISTER_MAX} onChange={(e) => setAnbieter(e.target.value)} style={s.eingabe} />
                  </label>
                )}
                <button type="button" disabled={busy} style={{ ...s.knopf, background: C.gold, color: C.navy, marginTop: 8 }}
                  onClick={() => void senden({ aktion: 'freigeben', funktion: f.key, haken, betriebsrat: betriebsrat || null, zweck, dienstleister: anbieter })}>
                  {busy ? 'Speichert …' : 'Bestätigen und für 12 Monate freigeben'}
                </button>
              </div>
            )}
            {!istChef && !f.stand.aktiv && f.sperrText && <div style={{ ...s.klein, marginTop: 6, color: C.warn }}>{f.sperrText}</div>}
          </div>
        );
      })}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, padding: '20px 16px 60px', fontFamily: 'DM Sans, system-ui, sans-serif', maxWidth: 1000, margin: '0 auto' },
  zurueck: { color: C.dim, textDecoration: 'none', fontSize: 13.5 },
  h1: { fontSize: 24, margin: '10px 0 6px' },
  dim: { color: C.dim, fontSize: 14, lineHeight: 1.55, margin: '4px 0 10px' },
  hinweis: { background: 'rgba(95,168,232,0.08)', border: '1px solid rgba(95,168,232,0.35)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, lineHeight: 1.55, color: C.text, margin: '6px 0 14px' },
  kacheln: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, margin: '6px 0 14px' },
  kachel: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', display: 'grid', gap: 2 },
  zahl: { fontSize: 26, fontWeight: 800 },
  karte: { background: 'rgba(255,255,255,0.04)', border: '1px solid', borderRadius: 14, padding: '16px 18px', margin: '12px 0' },
  kopf: { display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' },
  klein: { color: C.dim, fontSize: 13.5, lineHeight: 1.5 },
  marke: { border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  knopf: { padding: '9px 14px', borderRadius: 9, fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', border: 'none' },
  formular: { marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: 'grid', gap: 8 },
  haken: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.5, cursor: 'pointer' },
  feld: { display: 'grid', gap: 4, fontSize: 13.5, color: C.dim },
  eingabe: { background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' },
};
