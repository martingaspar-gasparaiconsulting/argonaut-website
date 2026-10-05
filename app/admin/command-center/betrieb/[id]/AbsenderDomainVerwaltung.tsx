'use client';

// ============================================================
// ARGONAUT OS · Paket 210 (05.10.2026) · Stufe 3 B7
// Command Center → Betriebs-Akte → Reiter „Absender-Domain".
// Der Betreiber legt die eigene Domain des Betriebs bei Resend an, gibt die
// DNS-Einträge an den Betrieb weiter, prüft und schaltet frei.
// ============================================================

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { DnsTabelle, type DnsAnzeige } from '@/app/dashboard/einstellungen/AbsenderDomainKarte';

const C = { navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE' };

type Stand = {
  zeile: {
    domain: string; lokalteil: string; status: string; aktiv: boolean; dns: DnsAnzeige[]; fehler: string | null;
    angelegt_am: string | null; geprueft_am: string | null; verifiziert_am: string | null; adresse: string | null;
  } | null;
  text: string;
  anlegenMoeglich: boolean;
};

export default function AbsenderDomainVerwaltung({ betrieb }: { betrieb: string }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [domain, setDomain] = useState('');
  const [lokal, setLokal] = useState('post');

  const hole = useCallback(async () => {
    setFehler(null);
    try {
      const r = await fetch(`/api/admin/absender-domain?betrieb=${encodeURIComponent(betrieb)}`);
      const d = await r.json();
      if (d?.ok) { setStand(d as Stand); if (d.zeile?.lokalteil) setLokal(d.zeile.lokalteil); } else setFehler(d?.error || 'Stand nicht lesbar.');
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
  }, [betrieb]);
  useEffect(() => { hole(); }, [hole]);

  async function los(aktion: string, extra: Record<string, unknown> = {}, frage?: string) {
    if (frage && !window.confirm(frage)) return;
    setBusy(true); setFehler(null); setMeldung(null);
    try {
      const r = await fetch('/api/admin/absender-domain', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ betrieb, aktion, ...extra }),
      });
      const d = await r.json();
      if (d?.ok) { setStand(d as Stand); setMeldung(d.hinweis || '✓'); } else setFehler(d?.error || 'Das hat nicht geklappt.');
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    setBusy(false);
  }

  if (!stand) return fehler ? <div style={st.fehler}>{fehler}</div> : <div style={st.hint}>Lädt …</div>;
  const z = stand.zeile && stand.zeile.status !== 'entfernt' ? stand.zeile : null;

  return (
    <>
      {fehler && <div style={st.fehler}>{fehler}</div>}
      {meldung && <div style={st.ok}>{meldung}</div>}
      <div style={st.karte}>
        <div style={st.titel}>Eigene Absender-Domain</div>
        <p style={st.text}>Stand: <b style={{ color: z?.adresse ? C.green : C.gold }}>{stand.text}</b></p>

        {!z ? (
          <>
            <p style={st.text}>
              Kunden-Mails dieses Betriebs (Rechnung, Termine, Newsletter, Abläufe …) gehen heute als „Firmenname &lt;noreply@argonaut-os.com&gt;“.
              Mit eigener Domain kommen sie von z. B. rechnung@post.firma.de. Empfehlung: eine Unterdomain wie <code>post.firma.de</code> —
              dann bleibt das normale Postfach der Firma unberührt.
            </p>
            {!stand.anlegenMoeglich && (
              <div style={st.warn}>
                Noch ausgeschaltet: In Vercel die Variable <code>RESEND_EIGENE_DOMAINS</code> auf <code>an</code> setzen.
                Resend Pro enthält 10 Domains (eine ist argonaut-os.com), Scale 1.000.
              </div>
            )}
            <label style={st.label}>Domain des Betriebs</label>
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="post.mueller-elektro.de" style={st.input} />
            <label style={st.label}>Teil vor dem @</label>
            <input value={lokal} onChange={(e) => setLokal(e.target.value)} placeholder="post" style={{ ...st.input, maxWidth: 220 }} />
            <div style={{ marginTop: 12 }}>
              <button disabled={busy || !stand.anlegenMoeglich || domain.trim().length < 4} onClick={() => los('anlegen', { domain, lokalteil: lokal })} style={st.btnGold}>
                Bei Resend anlegen
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={st.text}>
              Domain <b>{z.domain}</b> · Absender <code>{z.lokalteil}@{z.domain}</code>
              {z.verifiziert_am ? ` · bestätigt am ${new Date(z.verifiziert_am).toLocaleString('de-DE')}` : ''}
            </p>
            {z.fehler && <div style={st.warn}>Letzte Prüfung: {z.fehler}</div>}
            <p style={st.text}>Diese Einträge muss der Betrieb (oder sein IT-Dienstleister) im DNS anlegen. Der Chef sieht sie auch selbst unter Einstellungen → „Absender Ihrer E-Mails“.</p>
            <DnsTabelle dns={z.dns} />
            <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button disabled={busy} onClick={() => los('pruefen')} style={st.btnCyan}>Prüfen</button>
              {z.status === 'verifiziert' && !z.aktiv && (
                <button disabled={busy} onClick={() => los('aktiv', { aktiv: true }, `Ab sofort gehen alle Kunden-Mails dieses Betriebs von ${z.lokalteil}@${z.domain}. Einschalten?`)} style={st.btnGold}>Einschalten</button>
              )}
              {z.aktiv && (
                <button disabled={busy} onClick={() => los('aktiv', { aktiv: false })} style={st.btnGhost}>Ausschalten</button>
              )}
              <button disabled={busy} onClick={() => los('entfernen', {}, 'Domain bei Resend entfernen? Der Betrieb versendet danach wieder über noreply@argonaut-os.com.')} style={st.btnGhost}>Entfernen</button>
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={st.label}>Teil vor dem @ ändern</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={lokal} onChange={(e) => setLokal(e.target.value)} style={{ ...st.input, maxWidth: 220 }} />
                <button disabled={busy || lokal === z.lokalteil} onClick={() => los('lokalteil', { lokalteil: lokal })} style={st.btnGhost}>Speichern</button>
              </div>
            </div>
          </>
        )}
        <p style={{ ...st.text, color: C.textDim, fontSize: 12, marginTop: 14 }}>
          Sicherheitsnetz: Lehnt Resend später eine Mail wegen der Domain ab (DNS-Eintrag gelöscht), geht sie automatisch über noreply@argonaut-os.com raus.
          Fällt eine Prüfung auf „nicht bestätigt“ zurück, schaltet ARGONAUT die Domain selbst aus.
        </p>
      </div>
    </>
  );
}

const st: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: '1px solid rgba(201,168,76,0.18)', borderRadius: 12, padding: 20, marginBottom: 16 },
  titel: { fontFamily: 'DM Sans, sans-serif', fontWeight: 700, color: C.gold, fontSize: 16, marginBottom: 10 },
  text: { fontFamily: 'DM Sans, sans-serif', color: '#E8EDF4', fontSize: 14, lineHeight: 1.6, margin: '0 0 8px' },
  label: { display: 'block', fontSize: 12, color: C.textDim, margin: '12px 0 4px' },
  input: { width: '100%', maxWidth: 420, padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(143,163,190,0.25)', background: 'rgba(255,255,255,0.04)', color: '#E8EDF4', fontSize: 14 },
  btnGold: { padding: '9px 16px', borderRadius: 8, border: 'none', background: C.gold, color: '#0A1628', fontWeight: 700, cursor: 'pointer' },
  btnCyan: { padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.cyan}`, background: 'transparent', color: C.cyan, fontWeight: 700, cursor: 'pointer' },
  btnGhost: { padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(143,163,190,0.35)', background: 'transparent', color: C.textDim, cursor: 'pointer' },
  hint: { color: C.textDim, padding: 12 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.danger}`, color: C.danger, borderRadius: 8, padding: '10px 14px', marginBottom: 12 },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.green}`, color: C.green, borderRadius: 8, padding: '10px 14px', marginBottom: 12 },
  warn: { background: 'rgba(224,162,76,0.1)', border: `1px solid ${C.warn}`, color: C.warn, borderRadius: 8, padding: '10px 14px', margin: '8px 0', fontSize: 13 },
};
