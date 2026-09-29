'use client';

// ============================================================================
// ARGONAUT OS · Ablauf-Knöpfe auf Modulseiten (Paket 168)
// Pfad: app/dashboard/_components/AblaufKnoepfe.tsx
//
// Zeigt auf einer Kunden-, Anfrage-, Auftrags- oder Projektseite die
// eingeschalteten Knopf-Abläufe der Geschäftsleitung. Ein Klick startet den
// Ablauf mit diesem Vorgang (serverseitig geprüft, einmal je Vorgang).
// Ohne passende Abläufe (und für Mitarbeiter) erscheint nichts.
// ============================================================================

import { useEffect, useState, type CSSProperties } from 'react';

type Knopf = { id: string; name: string };

const knopfStil: CSSProperties = {
  padding: '7px 13px', borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
  border: '1px solid rgba(201,168,76,0.55)', background: 'transparent', color: '#C9A84C',
};

export default function AblaufKnoepfe({ modul, vorgangId }: { modul: string; vorgangId: string | null | undefined }) {
  const [knoepfe, setKnoepfe] = useState<Knopf[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let aus = false;
    fetch(`/api/ablaeufe/knoepfe?modul=${encodeURIComponent(modul)}`)
      .then((r) => r.json())
      .then((j: { knoepfe?: Knopf[] }) => { if (!aus) setKnoepfe(Array.isArray(j.knoepfe) ? j.knoepfe : []); })
      .catch(() => { /* ohne Knöpfe weiter */ });
    return () => { aus = true; };
  }, [modul]);

  if (!vorgangId || knoepfe.length === 0) return null;

  async function start(k: Knopf) {
    setBusy(k.id); setMeldung(null);
    try {
      const r = await fetch('/api/ablaeufe/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: k.id, vorgangId }) });
      const j = await r.json() as { ok?: boolean; status?: string; error?: string };
      setMeldung(r.ok && j.ok
        ? { ok: true, text: `„${k.name}" gestartet — Stand: ${j.status === 'fertig' ? 'fertig' : j.status === 'wartet' ? 'wartet' : j.status === 'freigabe' ? 'wartet auf Ihre Freigabe' : j.status ?? ''}. Protokoll auf der Seite Abläufe.` }
        : { ok: false, text: j.error ?? 'Start fehlgeschlagen.' });
    } catch { setMeldung({ ok: false, text: 'Start fehlgeschlagen.' }); }
    setBusy(null);
  }

  return (
    <div style={{ margin: '12px 0', padding: '10px 12px', borderRadius: 11, border: '1px solid rgba(143,163,190,0.18)', background: 'rgba(10,22,40,0.45)' }}>
      <div style={{ fontSize: 12, color: '#8FA3BE', fontWeight: 700, marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.7 }}>Abläufe</div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {knoepfe.map((k) => (
          <button key={k.id} type="button" disabled={busy !== null} onClick={() => start(k)} style={{ ...knopfStil, opacity: busy && busy !== k.id ? 0.5 : 1 }}>
            {busy === k.id ? 'Startet …' : `▶ ${k.name}`}
          </button>
        ))}
      </div>
      {meldung && <div style={{ fontSize: 12.5, marginTop: 7, color: meldung.ok ? '#4CAF7D' : '#E06666' }}>{meldung.text} <a href="/dashboard/ablaeufe" style={{ color: '#00e5ff' }}>Zu den Abläufen</a></div>}
    </div>
  );
}
