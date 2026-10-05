'use client';

// ============================================================
// ARGONAUT OS · Paket 210 (05.10.2026) · Stufe 3 B7
// Eigene Absender-Adresse: zeigt dem Chef, von welcher Adresse die Mails
// seines Betriebs an Kunden gehen, und — wenn eine eigene Domain
// eingerichtet wird — die DNS-Einträge für den Domain-Anbieter.
// Anlegen und Einschalten macht ARGONAUT (Command Center).
//
// Pfad: app/dashboard/einstellungen/AbsenderDomainKarte.tsx
// ============================================================

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

const C = {
  navy2: '#0F2036', gold: '#C9A84C', green: '#4CAF7D', text: '#E8EDF4', textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

export type DnsAnzeige = { art: string; typ: string; name: string; wert: string; prioritaet?: number; status: string };

export type AbsenderStand = {
  zeile: { domain: string; lokalteil: string; status: string; aktiv: boolean; dns: DnsAnzeige[]; geprueft_am: string | null; adresse: string | null } | null;
  text: string;
};

const STATUS: Record<string, { text: string; farbe: string }> = {
  ok: { text: '✓ gefunden', farbe: C.green },
  wartet: { text: 'noch nicht gefunden', farbe: C.warn },
  fehler: { text: '✗ falsch', farbe: C.danger },
  empfohlen: { text: 'empfohlen', farbe: C.textDim },
};

/** DNS-Tabelle mit Kopier-Knöpfen — auch im Command Center benutzt. */
export function DnsTabelle({ dns }: { dns: DnsAnzeige[] }) {
  const [kopiert, setKopiert] = useState<string | null>(null);
  async function kopiere(t: string, k: string) {
    try { await navigator.clipboard.writeText(t); setKopiert(k); setTimeout(() => setKopiert(null), 1500); } catch { /* ohne Zwischenablage */ }
  }
  if (!dns || dns.length === 0) return null;
  return (
    <div style={{ overflowX: 'auto', marginTop: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
        <thead>
          <tr>{['Zweck', 'Typ', 'Name', 'Wert', 'Stand'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {dns.map((z, i) => {
            const s = STATUS[z.status] ?? STATUS.wartet;
            return (
              <tr key={i}>
                <td style={st.td}>{z.art}</td>
                <td style={st.td}>{z.typ}{typeof z.prioritaet === 'number' ? ` (Prio ${z.prioritaet})` : ''}</td>
                <td style={st.td}>
                  <code style={st.code}>{z.name}</code>{' '}
                  <button type="button" style={st.mini} onClick={() => kopiere(z.name, `n${i}`)}>{kopiert === `n${i}` ? '✓' : 'Kopieren'}</button>
                </td>
                <td style={{ ...st.td, maxWidth: 280 }}>
                  <code style={{ ...st.code, wordBreak: 'break-all' }}>{z.wert}</code>{' '}
                  <button type="button" style={st.mini} onClick={() => kopiere(z.wert, `w${i}`)}>{kopiert === `w${i}` ? '✓' : 'Kopieren'}</button>
                </td>
                <td style={{ ...st.td, color: s.farbe, whiteSpace: 'nowrap' }}>{s.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AbsenderDomainKarte() {
  const [stand, setStand] = useState<AbsenderStand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hole = useCallback(async () => {
    try {
      const r = await fetch('/api/absender-domain');
      const d = await r.json();
      if (d?.ok) setStand(d as AbsenderStand); else if (r.status !== 403) setFehler(d?.error || 'Stand nicht lesbar.');
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
  }, []);
  useEffect(() => { hole(); }, [hole]);

  async function pruefen() {
    setBusy(true); setFehler(null); setMeldung(null);
    try {
      const r = await fetch('/api/absender-domain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aktion: 'pruefen' }) });
      const d = await r.json();
      if (d?.ok) { setStand(d as AbsenderStand); setMeldung(d.hinweis || 'Geprüft.'); } else setFehler(d?.error || 'Prüfung nicht möglich.');
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    setBusy(false);
  }

  if (!stand && !fehler) return null;
  const z = stand?.zeile ?? null;
  return (
    <section style={st.karte}>
      <h2 style={st.titel}>Absender Ihrer E-Mails</h2>
      {fehler && <p style={{ ...st.text, color: C.danger }}>{fehler}</p>}
      {meldung && <p style={{ ...st.text, color: C.green }}>{meldung}</p>}
      {!z ? (
        <p style={st.text}>
          Rechnungen, Terminbestätigungen, Newsletter und andere Mails an Ihre Kunden tragen Ihren Firmennamen und gehen über die
          geprüfte Adresse <b>noreply@argonaut-os.com</b>; Antworten Ihrer Kunden landen in Ihrem eigenen Postfach.
          Sie möchten stattdessen eine Adresse Ihrer eigenen Domain (z. B. rechnung@ihre-firma.de)? Schreiben Sie uns — wir richten sie
          mit Ihnen ein. Dafür trägt Ihr Domain-Anbieter oder IT-Dienstleister drei bis vier DNS-Einträge ein.
        </p>
      ) : (
        <>
          <p style={st.text}>
            <b style={{ color: z.adresse ? C.green : C.warn }}>{stand?.text}</b>
            {z.adresse ? '' : ` · Domain: ${z.domain}`}
          </p>
          {!z.adresse && (
            <p style={st.text}>
              Bitte lassen Sie diese Einträge bei Ihrem Domain-Anbieter (z. B. IONOS, Strato, All-Inkl) im DNS der Domain <b>{z.domain}</b> anlegen.
              Bis alles bestätigt ist, gehen Ihre Mails ganz normal über noreply@argonaut-os.com — es geht nichts verloren.
            </p>
          )}
          <DnsTabelle dns={z.dns} />
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" disabled={busy} onClick={pruefen} style={st.btn}>{busy ? 'Prüft …' : 'Jetzt prüfen'}</button>
            {z.geprueft_am && <span style={{ color: C.textDim, fontSize: 13 }}>Zuletzt geprüft: {new Date(z.geprueft_am).toLocaleString('de-DE')}</span>}
          </div>
        </>
      )}
    </section>
  );
}

const st: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 24px', marginTop: 24 },
  titel: { fontSize: 18, fontWeight: 700, color: C.gold, margin: '0 0 10px' },
  text: { color: C.text, fontSize: 14, lineHeight: 1.6, margin: '0 0 8px' },
  th: { textAlign: 'left', color: C.textDim, fontWeight: 500, padding: '6px 8px', borderBottom: `1px solid ${C.border}` },
  td: { color: C.text, padding: '8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
  code: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 },
  mini: { fontSize: 11, padding: '2px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, cursor: 'pointer' },
  btn: { padding: '9px 16px', borderRadius: 8, border: 'none', background: C.gold, color: '#0A1628', fontWeight: 700, cursor: 'pointer' },
};
