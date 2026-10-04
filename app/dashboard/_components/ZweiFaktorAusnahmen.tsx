'use client';

// ============================================================================
// ARGONAUT OS · Ausnahmen von der Zwei-Faktor-Pflicht (Paket 203 · B4)
// Pfad: app/dashboard/_components/ZweiFaktorAusnahmen.tsx
//
// Teil der Karte „Zwei-Faktor für alle Pflicht" (nur Geschäftsleitung).
// Einzelne Mitarbeiter (z. B. ohne Diensthandy) ausnehmen — mit Grund,
// optional befristet. Entscheidung am Server (/api/zwei-faktor/ausnahme).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { ausnahmeText, heuteBerlin, MAX_TAGE } from '@/lib/zweiFaktorAusnahme';

type Stand = {
  rolle: 'chef' | null; bereit?: boolean; aal2?: boolean;
  mitarbeiter?: { id: string; name: string }[];
  ausnahmen?: { mitarbeiterId: string; grund: string; bis: string | null; angelegtAm: string }[];
};

const knopf = { padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', border: 'none' } as const;
const feld = { background: '#0A1628', color: '#E8EDF4', border: '1px solid rgba(143,163,190,0.3)', borderRadius: 8, padding: '7px 9px', fontSize: 13.5, fontFamily: 'inherit' } as const;

export default function ZweiFaktorAusnahmen() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [wer, setWer] = useState('');
  const [grund, setGrund] = useState('');
  const [bis, setBis] = useState('');
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async () => {
    try { const r = await fetch('/api/zwei-faktor/ausnahme'); setStand(await r.json() as Stand); } catch { setStand(null); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  if (!stand || stand.rolle !== 'chef' || !stand.bereit) return null;
  const name = (id: string) => stand.mitarbeiter?.find((m) => m.id === id)?.name ?? 'Mitarbeiter';
  const ohneAusnahme = (stand.mitarbeiter ?? []).filter((m) => !(stand.ausnahmen ?? []).some((a) => a.mitarbeiterId === m.id));

  async function senden(body: Record<string, unknown>) {
    setBusy(true); setMeldung(null);
    try {
      const r = await fetch('/api/zwei-faktor/ausnahme', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json() as { ok?: boolean; meldung?: string; error?: string };
      setMeldung({ ok: !!j.ok, text: j.ok ? (j.meldung ?? 'Erledigt.') : (j.error ?? 'Fehler.') });
      if (j.ok) { setWer(''); setGrund(''); setBis(''); }
    } catch { setMeldung({ ok: false, text: 'Gerade nicht erreichbar.' }); }
    setBusy(false);
    await laden();
  }

  return (
    <div style={{ borderTop: '1px solid rgba(143,163,190,0.15)', paddingTop: 12, marginTop: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 14.5 }}>Ausnahmen (z. B. ohne Diensthandy)</div>
      <div style={{ color: '#8FA3BE', fontSize: 12.5, margin: '3px 0 8px', lineHeight: 1.5 }}>
        Ausgenommene Mitarbeiter melden sich auch bei eingeschalteter Pflicht nur mit Passwort an. Grund und Zeitpunkt werden gespeichert. Vertretungen, die Zwei-Faktor zurücksetzen dürfen, lassen sich nicht ausnehmen.
      </div>
      {(stand.ausnahmen ?? []).length === 0 && <div style={{ fontSize: 13.5, color: '#8FA3BE', marginBottom: 8 }}>Keine Ausnahmen.</div>}
      {(stand.ausnahmen ?? []).map((a) => (
        <div key={a.mitarbeiterId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 13.5, padding: '5px 0', flexWrap: 'wrap' }}>
          <span><b>{name(a.mitarbeiterId)}</b> · {ausnahmeText(a)}</span>
          <button type="button" disabled={busy || !stand.aal2} onClick={() => { if (window.confirm(`Ausnahme für ${name(a.mitarbeiterId)} aufheben?`)) void senden({ aktion: 'aus', mitarbeiterId: a.mitarbeiterId }); }}
            style={{ ...knopf, background: 'transparent', color: '#E06666', border: '1px solid rgba(224,102,102,0.5)', opacity: stand.aal2 ? 1 : 0.5 }}>Aufheben</button>
        </div>
      ))}
      {ohneAusnahme.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <select value={wer} onChange={(e) => setWer(e.target.value)} style={feld}>
            <option value="">Mitarbeiter wählen …</option>
            {ohneAusnahme.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input value={grund} onChange={(e) => setGrund(e.target.value)} maxLength={200} placeholder="Grund, z. B. kein Diensthandy" style={{ ...feld, minWidth: 220 }} />
          <label style={{ fontSize: 12.5, color: '#8FA3BE', display: 'flex', alignItems: 'center', gap: 6 }}>
            gilt bis (optional)
            <input type="date" value={bis} min={heuteBerlin()} onChange={(e) => setBis(e.target.value)} style={feld} title={`höchstens ${MAX_TAGE} Tage`} />
          </label>
          <button type="button" disabled={busy || !stand.aal2 || !wer || grund.trim().length < 5}
            onClick={() => void senden({ aktion: 'an', mitarbeiterId: wer, grund, bis })}
            style={{ ...knopf, background: '#C9A84C', color: '#0A1628', opacity: (!stand.aal2 || !wer || grund.trim().length < 5) ? 0.5 : 1 }}>
            {busy ? 'Speichert …' : 'Ausnahme speichern'}
          </button>
        </div>
      )}
      {meldung && <div style={{ fontSize: 13.5, marginTop: 8, color: meldung.ok ? '#4CAF7D' : '#E06666' }}>{meldung.text}</div>}
    </div>
  );
}
