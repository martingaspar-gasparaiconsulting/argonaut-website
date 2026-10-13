'use client';

// ARGONAUT OS · Paket 362 (VK11) — Erlaubnis-Ampel vor einem Anruf.
// Grün: Rückruf auf eigene Anfrage oder Einwilligung liegt vor.
// Gelb: Firma — Grund für mutmaßliches Interesse festhalten.
// Rot: gesperrt, oder Verbraucher ohne Einwilligung (Ausweg nur „kein Werbeanruf" mit Anlass).
// Grau: noch nicht eingeordnet (Verbraucher oder Firma?).
// Meldet nach oben, ob gewählt/gespeichert werden darf und mit welcher Erlaubnis.
// Logik: lib/anrufErlaubnis.ts. Texte prüft der Anwalt (R61).

import { useEffect, useState, CSSProperties } from 'react';
import { freigabe, type Ampel, type Erlaubnis } from '@/lib/anrufErlaubnis';

export type Freigabe = { ok: true; erlaubnis: Erlaubnis; grund: string | null } | { ok: false; fehler: string };
const FARBE = { gruen: '#4CAF7D', gelb: '#E0A24C', rot: '#E06666', grau: '#8FA3BE' } as const;

export default function ErlaubnisAmpel({ ampel, onFreigabe, onEinordnen, schluessel }: {
  ampel: Ampel; onFreigabe: (f: Freigabe) => void; onEinordnen?: (verbraucher: boolean) => void; schluessel: string;
}) {
  const [grund, setGrund] = useState(ampel.grundVorschlag ?? '');
  const [kein, setKein] = useState(false);

  // Neue Person → Eingaben zurücksetzen.
  useEffect(() => { setGrund(ampel.grundVorschlag ?? ''); setKein(false); }, [schluessel, ampel.grundVorschlag]);
  useEffect(() => { onFreigabe(freigabe(ampel, { keinWerbeanruf: kein, grund })); }, [ampel, kein, grund, onFreigabe]);

  const f = FARBE[ampel.farbe];
  const zeigtGrund = (ampel.braucht === 'grund' && ampel.erlaubnis === 'mutmasslich') || kein;
  return (
    <div style={{ ...st.box, borderColor: f + '88', background: f + '14' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...st.punkt, background: f }} aria-hidden />
        <b style={{ color: f }}>{ampel.titel}</b>
        <span style={st.text}>{ampel.text}</span>
      </div>
      {ampel.braucht === 'einordnung' && onEinordnen && !kein && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button style={st.knopf} onClick={() => onEinordnen(true)}>👤 Verbraucher (Privatperson)</button>
          <button style={st.knopf} onClick={() => onEinordnen(false)}>🏢 Firma / Gewerbe</button>
        </div>
      )}
      {ampel.ausweg && (
        <label style={st.haken}>
          <input type="checkbox" checked={kein} onChange={(e) => setKein(e.target.checked)} />
          Kein Werbeanruf – z. B. Rückfrage zu einem laufenden Auftrag oder Termin
        </label>
      )}
      {zeigtGrund && (
        <input style={st.inp} value={grund} maxLength={500} onChange={(e) => setGrund(e.target.value)}
          placeholder={kein ? 'Anlass, z. B. Rückfrage zum Auftrag 2026-014' : 'Grund für das Interesse, z. B. Bestandskunde, Wartung fällig'} aria-label="Grund" />
      )}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  box: { border: '1px solid', borderRadius: 12, padding: '10px 12px', marginTop: 12 },
  punkt: { width: 12, height: 12, borderRadius: 999, display: 'inline-block' },
  text: { color: 'rgba(232,237,244,0.85)', fontSize: 13.5, lineHeight: 1.45, flex: '1 1 300px' },
  knopf: { background: 'transparent', color: '#E8EDF4', border: '1px solid rgba(143,163,190,0.35)', borderRadius: 10, padding: '7px 12px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  haken: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13.5, color: 'rgba(232,237,244,0.85)', cursor: 'pointer' },
  inp: { marginTop: 8, width: '100%', boxSizing: 'border-box', background: '#0A1628', color: '#E8EDF4', border: '1px solid rgba(143,163,190,0.25)', borderRadius: 9, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' },
};
