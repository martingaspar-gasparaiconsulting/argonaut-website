'use client';

// ============================================================
// ARGONAUT OS · Command Center · Freigabe-Zentrale (Paket 345/346, A0 Teil 1+2)
//
// Alle Sperren auf einen Blick: Start-Schalter, Import-Sperren, Bestellstrecke
// und Zahlung, Kasse, Fachdossiers — mit Stand, was aus ist, Anwalt-Frage.
// Freigeben nur mit Vermerk, Datum der Anwalt-Antwort und Haken „Mitziehen
// erledigt". Seit Teil 2 (Paket 346) WIRKT die Freigabe: sofort auf diesem
// Server, auf allen anderen nach spätestens einer Minute.
// Ausblenden statt Löschen, in drei getrennten Schritten: Klick → Rückfrage
// bestätigen → Namen eintippen.
// Zugang: /admin/* hinter dem Admin-Schloss; die Route verlangt zusätzlich den
// bestätigten zweiten Faktor. Rechnen und Prüfen: lib/freigabeZentrale.ts.
// ============================================================

import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import { GRUPPE_TEXT, AKTION_TEXT, MIN_VERMERK, ausblendenBereit, freigebenPruefen, uebersicht, type ZeileMitStand, type Gruppe } from '@/lib/freigabeZentrale';

type Protokoll = { id: string; schluessel: string; aktion: string; vermerk: string | null; am: string };

const C = { navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', info: '#5FA8E8', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)' };
const STAND: Record<string, [string, string]> = { aus: ['gesperrt', C.danger], freigegeben: ['freigegeben (Zentrale)', C.warn], an: ['frei (Code)', C.green], info: ['gesperrt · im Code', C.textDim] };
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 12 };
const feld: CSSProperties = { padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(143,163,190,0.3)', background: 'rgba(10,22,40,0.7)', color: '#fff', fontSize: 14, fontFamily: 'inherit' };
const knopf: CSSProperties = { padding: '8px 13px', borderRadius: 9, border: 'none', background: C.gold, color: C.navy, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 };
const knopfAus: CSSProperties = { padding: '7px 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 };

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
}
const zeit = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

type Form = { schluessel: string; vermerk: string; anwalt_frage: string; anwalt_antwort_datum: string; mitgezogen: boolean };
type Weg = { schluessel: string; bestaetigt: boolean; getippt: string };

export default function CcFreigaben() {
  const [zeilen, setZeilen] = useState<ZeileMitStand[]>([]);
  const [protokoll, setProtokoll] = useState<Protokoll[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [laedt, setLaedt] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [weg, setWeg] = useState<Weg | null>(null);
  const [zeigeAusgeblendet, setZeigeAusgeblendet] = useState(false);

  const laden = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/freigaben', { cache: 'no-store' });
      const j = await r.json() as { ok?: boolean; zeilen?: ZeileMitStand[]; protokoll?: Protokoll[]; error?: string; sqlFehlt?: boolean };
      if (j.zeilen) setZeilen(j.zeilen);
      setProtokoll(j.protokoll ?? []);
      setSqlFehlt(!!j.sqlFehlt);
      setFehler(j.ok || j.sqlFehlt ? null : (j.error ?? 'Nicht erreichbar.'));
    } catch { setFehler('Nicht erreichbar.'); }
    setLaedt(false);
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  async function senden(body: Record<string, unknown>) {
    setBusy(true); setMeldung(null);
    try {
      const r = await fetch('/api/admin/freigaben', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json() as { ok?: boolean; meldung?: string; error?: string };
      setMeldung({ ok: !!j.ok, text: j.ok ? (j.meldung ?? 'Erledigt.') : (j.error ?? 'Fehler.') });
      if (j.ok) { setForm(null); setWeg(null); }
      await laden();
    } catch { setMeldung({ ok: false, text: 'Nicht erreichbar.' }); }
    setBusy(false);
  }

  const ue = uebersicht(zeilen);
  const gruppen = (Object.keys(GRUPPE_TEXT) as Gruppe[]).map((g) => ({ g, liste: zeilen.filter((z) => z.gruppe === g && (zeigeAusgeblendet || !z.ausgeblendet)) })).filter((x) => x.liste.length);
  const formFehler = form ? freigebenPruefen(form, heute()) : [];
  const titelVon = (k: string) => zeilen.find((z) => z.schluessel === k)?.titel ?? k;

  return (
    <div style={{ background: C.navy, minHeight: '100vh', color: '#fff', padding: '28px 20px', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <a href="/admin/command-center" style={{ color: C.textDim, textDecoration: 'none', fontSize: 14 }}>← Command Center</a>
        <h1 style={{ fontSize: 26, margin: '12px 0 4px' }}>🔐 Freigabe-Zentrale</h1>
        <p style={{ color: C.textDim, marginTop: 0, lineHeight: 1.55 }}>
          Alles, was bis zur rechtlichen Prüfung gesperrt ist, auf einen Blick. Freigeben nur mit Vermerk und Datum der Anwalt-Antwort.
          <b style={{ color: C.warn }}> Achtung:</b> Eine Freigabe hier <b>wirkt</b> — sofort, auf allen Servern spätestens nach einer Minute. „Wieder sperren“ nimmt sie genauso schnell zurück.
          Die acht Schritte zum Öffnen stehen im Sperr-Gedächtnis (docs/ARGONAUT-SPERR-GEDAECHTNIS.md).
        </p>
        {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
        {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Übersicht kommt aus dem Code. Freigeben und Protokoll gehen erst, wenn SQL Paket 345 gelaufen ist.</div>}
        {meldung && <div style={{ ...karte, borderColor: meldung.ok ? C.green : C.danger, color: meldung.ok ? C.green : C.danger }}>{meldung.text}</div>}

        {!laedt && !fehler && (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            {[['Schalter und Sperren', ue.gesamt, '#fff'], ['gesperrt', ue.aus, C.danger], ['freigegeben (Zentrale)', ue.freigegeben, C.warn], ['frei (Code)', ue.an, C.green]].map(([t, n, f]) => (
              <div key={String(t)} style={{ ...karte, marginBottom: 0 }}><div style={{ color: C.textDim, fontSize: 13 }}>{t}</div><b style={{ fontSize: 22, color: String(f) }}>{n}</b></div>
            ))}
          </div>
          <label style={{ color: C.textDim, fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
            <input type="checkbox" checked={zeigeAusgeblendet} onChange={(e) => setZeigeAusgeblendet(e.target.checked)} /> Ausgeblendete zeigen ({ue.ausgeblendet})
          </label>

          {gruppen.map(({ g, liste }) => (
            <div key={g} style={{ marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, color: C.gold, margin: '6px 0 8px' }}>{GRUPPE_TEXT[g]}</h2>
              {liste.map((z) => {
                const [txt, farbe] = STAND[z.stand] ?? [z.stand, C.textDim];
                const offenForm = form?.schluessel === z.schluessel;
                const offenWeg = weg?.schluessel === z.schluessel;
                return (
                  <div key={z.schluessel} style={{ ...karte, opacity: z.ausgeblendet ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <b>{z.titel}</b>
                      <span style={{ border: `1px solid ${farbe}`, color: farbe, borderRadius: 999, padding: '1px 9px', fontSize: 12, fontWeight: 700 }}>{txt}</span>
                      <code style={{ color: C.textDim, fontSize: 12 }}>{z.schluessel}</code>
                    </div>
                    <div style={{ color: C.textDim, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                      Aus: {z.aus || '—'} · Anwalt: {z.anwalt || '—'}
                      {z.hinweis && <div>Öffnen: {z.hinweis}</div>}
                      {z.db?.an && <div style={{ color: C.warn }}>Freigegeben am {zeit(z.db.geaendert_am)} · Anwalt-Antwort vom {z.db.anwalt_antwort_datum ?? '—'}{z.db.anwalt_frage ? ` (${z.db.anwalt_frage})` : ''}: {z.db.vermerk}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {z.schaltbar && z.stand === 'aus' && !offenForm && <button style={knopf} disabled={busy || sqlFehlt} onClick={() => { setForm({ schluessel: z.schluessel, vermerk: '', anwalt_frage: z.anwalt, anwalt_antwort_datum: '', mitgezogen: false }); setWeg(null); setMeldung(null); }}>Freigeben …</button>}
                      {z.stand === 'freigegeben' && <button style={knopfAus} disabled={busy} onClick={() => { if (window.confirm(`„${z.titel}" wieder sperren? Wirkt sofort, auf allen Servern spätestens nach einer Minute.`)) void senden({ aktion: 'sperren', schluessel: z.schluessel }); }}>Wieder sperren</button>}
                      {!z.ausgeblendet && !offenWeg && z.stand !== 'freigegeben' && <button style={knopfAus} disabled={busy || sqlFehlt} onClick={() => { setWeg({ schluessel: z.schluessel, bestaetigt: false, getippt: '' }); setForm(null); }}>Ausblenden …</button>}
                      {z.ausgeblendet && <button style={knopfAus} disabled={busy} onClick={() => void senden({ aktion: 'einblenden', schluessel: z.schluessel })}>Wieder einblenden</button>}
                    </div>

                    {offenForm && form && (
                      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                        <label style={{ display: 'grid', gap: 4, fontSize: 13, color: C.textDim }}>Vermerk (mind. {MIN_VERMERK} Zeichen): welche Anwalt-Antwort, was eingebaut ist
                          <textarea style={{ ...feld, minHeight: 70 }} maxLength={1000} value={form.vermerk} onChange={(e) => setForm({ ...form, vermerk: e.target.value })} />
                        </label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <label style={{ display: 'grid', gap: 4, fontSize: 13, color: C.textDim }}>Anwalt-Frage<input style={feld} maxLength={120} value={form.anwalt_frage} onChange={(e) => setForm({ ...form, anwalt_frage: e.target.value })} /></label>
                          <label style={{ display: 'grid', gap: 4, fontSize: 13, color: C.textDim }}>Datum der Anwalt-Antwort<input style={feld} type="date" max={heute()} value={form.anwalt_antwort_datum} onChange={(e) => setForm({ ...form, anwalt_antwort_datum: e.target.value })} /></label>
                        </div>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: '#fff', lineHeight: 1.45 }}>
                          <input type="checkbox" checked={form.mitgezogen === true} onChange={(e) => setForm({ ...form, mitgezogen: e.target.checked })} />
                          <span>Die Punkte „Mitziehen beim Öffnen“ zu diesem Bereich im Sperr-Gedächtnis sind erledigt (Texte, Datenschutz, AGB usw.).</span>
                        </label>
                        {formFehler.length > 0 && <div style={{ color: C.warn, fontSize: 13 }}>{formFehler.join(' ')}</div>}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button style={knopf} disabled={busy || formFehler.length > 0} onClick={() => { if (window.confirm(`„${z.titel}" jetzt freigeben? Der Bereich ist dann für alle Betriebe offen — sofort, auf allen Servern spätestens nach einer Minute.`)) void senden({ aktion: 'freigeben', ...form }); }}>Jetzt freigeben</button>
                          <button style={knopfAus} onClick={() => setForm(null)}>Abbrechen</button>
                        </div>
                      </div>
                    )}

                    {offenWeg && weg && (
                      <div style={{ marginTop: 10, display: 'grid', gap: 8, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                        {!weg.bestaetigt ? (<>
                          <div style={{ fontSize: 13 }}>Schritt 2 von 3: „{z.titel}" aus der Liste ausblenden? Der Schalter im Code bleibt, Sie können ihn jederzeit zurückholen.</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button style={knopfAus} onClick={() => setWeg({ ...weg, bestaetigt: true })}>Ja, weiter</button>
                            <button style={knopfAus} onClick={() => setWeg(null)}>Abbrechen</button>
                          </div>
                        </>) : (<>
                          <label style={{ display: 'grid', gap: 4, fontSize: 13, color: C.textDim }}>Schritt 3 von 3: Bitte den Namen genau eintippen: <b style={{ color: '#fff' }}>{z.titel}</b>
                            <input style={feld} value={weg.getippt} autoComplete="off" onPaste={(e) => e.preventDefault()} onChange={(e) => setWeg({ ...weg, getippt: e.target.value })} />
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button style={{ ...knopf, background: C.danger, color: '#fff' }} disabled={busy || !ausblendenBereit({ geklickt: true, bestaetigt: weg.bestaetigt, getippt: weg.getippt }, z.titel)}
                              onClick={() => void senden({ aktion: 'ausblenden', schluessel: z.schluessel, getippt: weg.getippt })}>Ausblenden</button>
                            <button style={knopfAus} onClick={() => setWeg(null)}>Abbrechen</button>
                          </div>
                        </>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <h2 style={{ fontSize: 16, color: C.gold, margin: '18px 0 8px' }}>Protokoll</h2>
          {!protokoll.length ? <p style={{ color: C.textDim, fontSize: 13 }}>Noch keine Änderung.</p> : (
            <div style={karte}>
              {protokoll.map((p) => (
                <div key={p.id} style={{ fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.textDim }}>{zeit(p.am)}</span> · <b>{titelVon(p.schluessel)}</b> · {AKTION_TEXT[p.aktion] ?? p.aktion}
                  {p.vermerk && p.aktion === 'freigeben' ? <span style={{ color: C.textDim }}> — {p.vermerk}</span> : null}
                </div>
              ))}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}
