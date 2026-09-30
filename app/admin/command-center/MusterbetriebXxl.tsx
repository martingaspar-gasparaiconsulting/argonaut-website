'use client';

// ============================================================================
// ARGONAUT OS · app/admin/command-center/MusterbetriebXxl.tsx — Paket 179
//
// Kachel im Command Center: „Musterbetrieb XXL anlegen / löschen".
// Ein Konto mit ALLEN Modulen und Beispieldaten in jedem Modul — für den
// Testtag. Das Passwort wird zufällig erzeugt und nur EINMAL hier angezeigt.
// Löschen fragt zweimal (Knopf → Bestätigen), ohne Browser-Dialog.
// ============================================================================

import { useEffect, useState } from 'react';

const C = {
  gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D', rot: '#e06666',
  text: '#E8EDF4', dim: 'rgba(255,255,255,0.55)', border: 'rgba(201,168,76,0.16)', card: 'rgba(255,255,255,0.04)',
};

const GRUPPEN: Record<string, string> = {
  basis: 'Kunden, Angebote, Rechnungen, Anschlüsse', personal: 'Personal & Zeit', auftraege: 'Aufträge, Einsätze, Termine, Aufgaben',
  finanzen: 'Finanzen', crm: 'CRM, Marketing, Leads', lager: 'Lager, Einkauf, Fuhrpark', bau: 'Bau', branchen: 'Branchen-Module (Werkstatt, Gastro, Hotel, Immobilien, Bildung …)',
};

type Status = { vorhanden: boolean; gueltig?: boolean; email: string; datensaetze?: number };
type Bericht = {
  email?: string; passwort?: string; module?: number; datensaetze?: number; entfernt?: number;
  kontoGeloescht?: boolean; gruppen?: Record<string, number>; hinweise?: string[];
};

export default function MusterbetriebXxl() {
  const [st, setSt] = useState<Status | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const [bericht, setBericht] = useState<Bericht | null>(null);
  const [sicher, setSicher] = useState(false);

  async function rufe(aktion: 'status' | 'anlegen' | 'loeschen') {
    const r = await fetch('/api/admin/musterbetrieb-xxl', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `Fehler ${r.status}`);
    return j;
  }

  async function laden() {
    try { setSt(await rufe('status')); } catch (e) { setFehler(e instanceof Error ? e.message : 'Status nicht lesbar'); }
  }
  useEffect(() => { void laden(); }, []);

  async function los(aktion: 'anlegen' | 'loeschen') {
    if (laeuft) return;
    setLaeuft(true); setFehler(''); setSicher(false);
    try {
      setBericht(await rufe(aktion));
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLaeuft(false);
    }
  }

  const knopf = (farbe: string) => ({
    background: 'transparent', color: farbe, border: `1px solid ${farbe}`, borderRadius: 10,
    padding: '10px 18px', fontWeight: 700, cursor: laeuft ? 'wait' : 'pointer', fontSize: 14,
  } as const);

  return (
    <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 'clamp(18px,1.8vw,24px)', marginBottom: 'clamp(20px,3vw,32px)' }}>
      <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 'clamp(16px,1.5vw,21px)', color: C.text }}>
        Musterbetrieb XXL
      </div>
      <p style={{ color: C.dim, fontSize: 14, margin: '6px 0 14px', lineHeight: 1.55 }}>
        Ein Testkonto mit allen Modulen und Beispieldaten in jedem Modul (Personal, Aufträge, Termine, Finanzen, CRM, Lager, Bau und die Branchen-Module).
        Alle Personen und Adressen sind erfunden, es geht keine Mail raus. Löschen entfernt genau das, was hier angelegt wurde.
      </p>

      {st && (
        <p style={{ fontSize: 14, color: st.vorhanden ? C.green : C.dim, margin: '0 0 14px' }}>
          {st.vorhanden
            ? `Vorhanden: ${st.email} · ${st.datensaetze ?? 0} Beispiel-Datensätze${st.gueltig === false ? ' · ACHTUNG: Kennzeichen fehlt' : ''}`
            : 'Noch nicht angelegt.'}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {!st?.vorhanden && (
          <button type="button" disabled={laeuft} onClick={() => los('anlegen')} style={knopf(C.gold)}>
            {laeuft ? 'Wird angelegt …' : 'Musterbetrieb XXL anlegen'}
          </button>
        )}
        {st?.vorhanden && !sicher && (
          <button type="button" disabled={laeuft} onClick={() => setSicher(true)} style={knopf(C.rot)}>
            Musterbetrieb XXL löschen
          </button>
        )}
        {st?.vorhanden && sicher && (
          <>
            <button type="button" disabled={laeuft} onClick={() => los('loeschen')} style={knopf(C.rot)}>
              {laeuft ? 'Wird gelöscht …' : 'Ja, Konto und alle Beispieldaten löschen'}
            </button>
            <button type="button" disabled={laeuft} onClick={() => setSicher(false)} style={knopf(C.dim)}>Abbrechen</button>
          </>
        )}
      </div>

      {fehler && <p style={{ color: C.rot, fontSize: 14, marginTop: 12 }}>{fehler}</p>}

      {bericht && (
        <div style={{ marginTop: 16, fontSize: 14, color: C.text, lineHeight: 1.6 }}>
          {bericht.passwort && (
            <div style={{ border: `1px solid ${C.gold}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div>Anmeldung: <b>{bericht.email}</b></div>
              <div>Passwort: <b style={{ fontFamily: 'monospace', userSelect: 'all' }}>{bericht.passwort}</b></div>
              <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>Wird nur jetzt angezeigt — bitte notieren. Neu erzeugen: löschen und wieder anlegen.</div>
            </div>
          )}
          {typeof bericht.datensaetze === 'number' && (
            <div>{bericht.datensaetze} Datensätze · {bericht.module} Module freigeschaltet</div>
          )}
          {bericht.gruppen && (
            <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
              {Object.entries(bericht.gruppen).map(([g, n]) => <li key={g}>{GRUPPEN[g] || g}: {n}</li>)}
            </ul>
          )}
          {typeof bericht.entfernt === 'number' && (
            <div>{bericht.entfernt} Datensätze entfernt · Konto {bericht.kontoGeloescht ? 'gelöscht' : 'NICHT gelöscht'}</div>
          )}
          {!!bericht.hinweise?.length && (
            <div style={{ color: C.rot, marginTop: 8 }}>
              Hinweise:
              <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{bericht.hinweise.map((h) => <li key={h}>{h}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
