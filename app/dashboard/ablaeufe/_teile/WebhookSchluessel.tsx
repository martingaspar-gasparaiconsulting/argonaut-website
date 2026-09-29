'use client';

// ============================================================================
// ARGONAUT OS · Abläufe — Schlüssel für „Webhook senden" (Paket 167)
// Zeigt der Geschäftsleitung den Schlüssel, mit dem der Empfänger (z. B. n8n)
// die Kopfzeile X-Argonaut-Signatur prüft. Der Schlüssel kommt vom Server und
// wird nicht gespeichert.
// ============================================================================

import { useState, type CSSProperties } from 'react';

const knopf: CSSProperties = { padding: '5px 11px', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(143,163,190,0.18)', background: 'transparent', color: '#E8EDF4' };
const klein: CSSProperties = { color: '#8FA3BE', fontSize: 12.5, lineHeight: 1.5 };

export default function WebhookSchluessel({ ablaufId }: { ablaufId: string }) {
  const [schluessel, setSchluessel] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function holen() {
    if (schluessel) { setSchluessel(null); return; }
    setFehler(null);
    try {
      const r = await fetch('/api/ablaeufe/webhook-schluessel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: ablaufId }) });
      const j = await r.json() as { ok?: boolean; schluessel?: string; error?: string };
      if (!r.ok || !j.schluessel) { setFehler(j.error ?? 'Schlüssel nicht abrufbar.'); return; }
      setSchluessel(j.schluessel);
    } catch { setFehler('Schlüssel nicht abrufbar.'); }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" onClick={holen} style={knopf}>{schluessel ? 'Schlüssel verbergen' : '🔑 Webhook-Schlüssel anzeigen'}</button>
      {fehler && <div style={{ ...klein, color: '#E06666', marginTop: 6 }}>{fehler}</div>}
      {schluessel && (
        <div style={{ marginTop: 6 }}>
          <code style={{ fontSize: 12.5, wordBreak: 'break-all', color: '#C9A84C' }}>{schluessel}</code>
          <div style={klein}>
            Beim Empfänger eintragen. Jede Meldung trägt X-Argonaut-Zeit und X-Argonaut-Signatur = „sha256=" + HMAC-SHA256(Schlüssel, Zeit + „." + Inhalt).
            Meldungen mit falscher Signatur oder älter als 5 Minuten bitte verwerfen. Daten gehen nur an Empfänger mit Auftragsverarbeitungs-Vertrag (AVV).
          </div>
        </div>
      )}
    </div>
  );
}
