'use client';

// ============================================================================
// ARGONAUT OS · Karte „Zwei-Faktor im Team" (Paket 164 Stufe 2)
// Pfad: app/dashboard/_components/ZweiFaktorTeamKarte.tsx
//
// Nur für Geschäftsleitung und deren Vertretung (sonst erscheint nichts):
//   · Hilfe-Anfragen oben, Zurücksetzen je Mitarbeiter (nur der zweite
//     Faktor — Daten, Zugang und Rechte bleiben)
//   · Chef: Vertretung bestimmen (Standard: 1 Person neben dem Chef)
// Alle Entscheidungen fallen am Server (/api/zwei-faktor/team). Anredefrei.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { EINRICHT_PFAD } from '@/lib/zweiFaktor';

type Zeile = { id: string; name: string; helfer: boolean; hilfe: boolean };
type Team = { rolle: 'chef' | 'helfer' | null; aal2?: boolean; plaetze?: number; belegt?: number; mitarbeiter?: Zeile[] };

const knopf = { padding: '6px 11px', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(143,163,190,0.3)', background: 'transparent', color: '#E8EDF4' } as const;

export default function ZweiFaktorTeamKarte() {
  const [team, setTeam] = useState<Team | null>(null);
  const [suche, setSuche] = useState('');
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async () => {
    try {
      const r = await fetch('/api/zwei-faktor/team');
      setTeam(await r.json() as Team);
    } catch { setTeam(null); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  if (!team || !team.rolle) return null;

  async function tu(body: Record<string, unknown>, frage?: string) {
    if (frage && !window.confirm(frage)) return;
    setBusy(true); setMeldung(null);
    try {
      const r = await fetch('/api/zwei-faktor/team', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json() as { ok?: boolean; meldung?: string; error?: string };
      setMeldung({ ok: !!j.ok, text: j.ok ? (j.meldung ?? 'Erledigt.') : (j.error ?? 'Fehler.') });
    } catch { setMeldung({ ok: false, text: 'Gerade nicht erreichbar.' }); }
    setBusy(false);
    await laden();
  }

  const liste = (team.mitarbeiter ?? [])
    .filter((m) => !suche.trim() || m.name.toLowerCase().includes(suche.trim().toLowerCase()))
    .sort((a, b) => Number(b.hilfe) - Number(a.hilfe));
  const anfragen = (team.mitarbeiter ?? []).filter((m) => m.hilfe).length;

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${anfragen > 0 ? 'rgba(224,162,76,0.6)' : 'rgba(143,163,190,0.18)'}`, borderRadius: 14, padding: '18px 20px', margin: '18px 0' }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>👥 Zwei-Faktor im Team{anfragen > 0 ? ` · ${anfragen} Hilfe-Anfrage${anfragen === 1 ? '' : 'n'}` : ''}</div>
      <div style={{ color: '#8FA3BE', fontSize: 13.5, margin: '4px 0 10px', lineHeight: 1.5 }}>
        Handy und Notfall-Codes verloren? Zurücksetzen entfernt nur den zweiten Faktor — Daten, Zugang und Rechte bleiben; beim nächsten Anmelden wird neu eingerichtet.
        {team.rolle === 'chef' && ` Vertretungen: ${team.belegt ?? 0} von ${team.plaetze ?? 1}.`}
      </div>
      {!team.aal2 && (
        <div style={{ color: '#E0A24C', fontSize: 13.5, marginBottom: 10 }}>
          Zurücksetzen und Vertretung bestimmen nur mit eigener, bestätigter Zwei-Faktor-Anmeldung. <a href={`${EINRICHT_PFAD}?weiter=/dashboard/einstellungen`} style={{ color: '#00e5ff' }}>Einrichten bzw. Code bestätigen</a>
        </div>
      )}
      {meldung && <div style={{ fontSize: 13.5, marginBottom: 8, color: meldung.ok ? '#4CAF7D' : '#E06666' }}>{meldung.text}</div>}
      {(team.mitarbeiter ?? []).length > 8 && (
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name suchen …" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 9, border: '1px solid rgba(143,163,190,0.3)', background: 'rgba(10,22,40,0.7)', color: '#fff', marginBottom: 8, fontFamily: 'inherit' }} />
      )}
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {liste.length === 0 ? <div style={{ color: '#8FA3BE', fontSize: 13.5 }}>Keine Mitarbeiter mit Zugang.</div> : liste.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid rgba(143,163,190,0.12)', padding: '7px 0' }}>
            <div style={{ fontSize: 14 }}>
              {m.name}
              {m.helfer && <span style={{ color: '#C9A84C', fontSize: 12 }}> · Vertretung</span>}
              {m.hilfe && <span style={{ color: '#E0A24C', fontSize: 12, fontWeight: 800 }}> · bittet um Hilfe</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" disabled={busy || !team.aal2} onClick={() => tu({ aktion: 'zuruecksetzen', mitarbeiterId: m.id }, `Zwei-Faktor-Anmeldung von ${m.name} zurücksetzen? Vorher sicherstellen, dass die Anfrage wirklich von ${m.name} kommt.`)} style={{ ...knopf, opacity: team.aal2 ? 1 : 0.5 }}>Zurücksetzen</button>
              {team.rolle === 'chef' && (
                <button type="button" disabled={busy || !team.aal2} onClick={() => tu({ aktion: 'helfer', mitarbeiterId: m.id, an: !m.helfer })} style={{ ...knopf, opacity: team.aal2 ? 1 : 0.5 }}>{m.helfer ? 'Vertretung entfernen' : 'Als Vertretung'}</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
