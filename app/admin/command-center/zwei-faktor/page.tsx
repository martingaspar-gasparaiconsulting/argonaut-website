'use client';

// ============================================================
// ARGONAUT OS · Command Center · Zwei-Faktor (Paket 164 Stufe 2)
//
// Die Tür des Betreibers (Martin 29.09.2026):
//   · Hilfe-Anfragen, die beim Betreiber landen: Geschäftsleitung selbst
//     oder im Betrieb länger als 24 Stunden unerledigt
//   · Zurücksetzen per E-Mail (jeder Zugang, auch die Geschäftsleitung) —
//     nur der zweite Faktor, Daten/Zugang/Rechte bleiben
//   · Personen je Betrieb, die zurücksetzen dürfen (Standard 2 = Chef + 1)
// Vor dem Zurücksetzen die Identität prüfen (Rückruf unter bekannter Nummer).
// Zugang: /admin/* hinter dem Admin-Schloss, die Route prüft das Doppelschloss.
// ============================================================

import { useEffect, useState, useCallback, type CSSProperties } from 'react';

type Anfrage = { id: string; name: string | null; vom_chef: boolean; erstellt_am: string; owner_user_id: string };

const C = { navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D', danger: '#E06666', textDim: '#8FA3BE' };
const karte: CSSProperties = { background: C.navy2, border: '1px solid rgba(143,163,190,0.18)', borderRadius: 14, padding: 20, marginBottom: 18 };
const feld: CSSProperties = { padding: '9px 11px', borderRadius: 9, border: '1px solid rgba(143,163,190,0.3)', background: 'rgba(10,22,40,0.7)', color: '#fff', fontSize: 14, fontFamily: 'inherit' };
const knopf: CSSProperties = { padding: '9px 14px', borderRadius: 9, border: 'none', background: C.gold, color: C.navy, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' };

async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/admin/zwei-faktor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json() as Promise<{ ok?: boolean; meldung?: string; error?: string }>;
}

export default function CcZweiFaktor() {
  const [anfragen, setAnfragen] = useState<Anfrage[]>([]);
  const [mail, setMail] = useState('');
  const [grenzMail, setGrenzMail] = useState('');
  const [max, setMax] = useState(3);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    const r = await fetch('/api/admin/zwei-faktor');
    const j = await r.json() as { anfragen?: Anfrage[]; error?: string };
    if (j.anfragen) setAnfragen(j.anfragen); else if (j.error) setMeldung({ ok: false, text: j.error });
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  async function tu(body: Record<string, unknown>, frage?: string) {
    if (frage && !window.confirm(frage)) return;
    setBusy(true); setMeldung(null);
    const j: { ok?: boolean; meldung?: string; error?: string } = await post(body).catch(() => ({ ok: false, error: 'Nicht erreichbar.' }));
    setMeldung({ ok: !!j.ok, text: j.ok ? (j.meldung ?? 'Erledigt.') : (j.error ?? 'Fehler.') });
    setBusy(false);
    await laden();
  }

  return (
    <div style={{ background: C.navy, minHeight: '100vh', color: '#fff', padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <a href="/admin/command-center" style={{ color: C.textDim, textDecoration: 'none', fontSize: 14 }}>← Command Center</a>
        <h1 style={{ fontSize: 26, margin: '12px 0 4px' }}>Zwei-Faktor</h1>
        <p style={{ color: C.textDim, marginTop: 0 }}>Zurücksetzen entfernt nur den zweiten Faktor. Daten, Zugang und Rechte bleiben. Vorher die Identität prüfen (Rückruf unter bekannter Nummer).</p>
        {meldung && <div style={{ ...karte, borderColor: meldung.ok ? C.green : C.danger, color: meldung.ok ? C.green : C.danger }}>{meldung.text}</div>}

        <div style={karte}>
          <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>Hilfe-Anfragen für dich</h2>
          <div style={{ color: C.textDim, fontSize: 13, marginBottom: 8 }}>Geschäftsleitungen selbst und Anfragen, die im Betrieb länger als 24 Stunden offen sind.</div>
          {anfragen.length === 0 ? <div style={{ color: C.textDim }}>Keine offenen Anfragen.</div> : anfragen.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid rgba(143,163,190,0.18)', padding: '9px 0' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{a.name ?? 'Unbekannt'} {a.vom_chef && <span style={{ color: C.gold, fontSize: 12 }}>· Geschäftsleitung</span>}</div>
                <div style={{ color: C.textDim, fontSize: 12.5 }}>seit {new Date(a.erstellt_am).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} · Betrieb {a.owner_user_id.slice(0, 8)}</div>
              </div>
              <button type="button" disabled={busy} onClick={() => tu({ aktion: 'erledigt', id: a.id })} style={{ ...knopf, background: 'transparent', color: '#fff', border: '1px solid rgba(143,163,190,0.3)' }}>Als erledigt markieren</button>
            </div>
          ))}
        </div>

        <div style={karte}>
          <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>Zurücksetzen</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={mail} onChange={(e) => setMail(e.target.value)} placeholder="E-Mail des Zugangs" style={{ ...feld, flex: 1, minWidth: 240 }} />
            <button type="button" disabled={busy || !mail.includes('@')} onClick={() => tu({ aktion: 'zuruecksetzen', email: mail }, `Zwei-Faktor-Anmeldung von ${mail} zurücksetzen? Identität geprüft?`)} style={knopf}>Zurücksetzen</button>
          </div>
        </div>

        <div style={karte}>
          <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>Personen je Betrieb, die zurücksetzen dürfen</h2>
          <div style={{ color: C.textDim, fontSize: 13, marginBottom: 8 }}>Standard 2 (Geschäftsleitung + 1 Vertretung). Für große Betriebe erhöhen.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={grenzMail} onChange={(e) => setGrenzMail(e.target.value)} placeholder="E-Mail der Geschäftsleitung" style={{ ...feld, flex: 1, minWidth: 240 }} />
            <input type="number" min={1} max={20} value={max} onChange={(e) => setMax(Math.max(1, Math.min(20, Math.trunc(Number(e.target.value) || 1))))} style={{ ...feld, width: 80 }} />
            <button type="button" disabled={busy || !grenzMail.includes('@')} onClick={() => tu({ aktion: 'grenze', email: grenzMail, max })} style={knopf}>Speichern</button>
          </div>
        </div>
      </div>
    </div>
  );
}
