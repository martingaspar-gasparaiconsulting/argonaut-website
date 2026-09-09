'use client';

import { useEffect, useState, useCallback, type CSSProperties } from 'react';

// ============================================================
// ARGONAUT OS · Command Center · WhatsApp-Einrichtung (G2)
//
// Hier richtet der BETREIBER den WhatsApp-Eingang je Betrieb ein. Der Kunde
// bekommt All-in-One und sieht nur seinen Posteingang — er soll weder ein
// Meta-Konto öffnen noch ein App-Secret kopieren müssen.
//
// Zugang: /admin/* liegt hinter dem Admin-Schloss (app/admin/layout.tsx),
// die Route dahinter prüft zusätzlich die Betreiber-Kennung.
// ============================================================

const C = {
  navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', textDim: '#8FA3BE',
};

type Betrieb = {
  id: string;
  name: string;
  hatToken: boolean;
  hatAppSecret: boolean;
  hatNummer: boolean;
  verbunden: boolean;
};

export default function CcWhatsapp() {
  const [betriebe, setBetriebe] = useState<Betrieb[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string>('');
  const [token, setToken] = useState('');
  const [hatSecret, setHatSecret] = useState(false);
  const [secret, setSecret] = useState('');
  const [nummer, setNummer] = useState('');
  const [encKey, setEncKey] = useState(true);
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState('');

  const ladeListe = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/whatsapp-eingang');
      const d = await r.json();
      if (d?.ok) { setBetriebe(d.betriebe ?? []); setEncKey(d.encKeyBereit !== false); }
      else setFehler(d?.error || 'Konnte die Betriebe nicht laden.');
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    }
    setLaden(false);
  }, []);

  useEffect(() => { ladeListe(); }, [ladeListe]);

  const ladeBetrieb = useCallback(async (id: string) => {
    setMeldung(null); setFehler(null); setSecret('');
    try {
      const r = await fetch(`/api/admin/whatsapp-eingang?betrieb=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (d?.ok) {
        setToken(d.webhook_token || '');
        setHatSecret(!!d.hatAppSecret);
        setNummer(d.meta_phone_number_id || '');
      } else {
        setFehler(d?.error || 'Konnte den Betrieb nicht laden.');
      }
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    }
  }, []);

  function waehle(id: string) {
    setGewaehlt(id);
    if (id) ladeBetrieb(id);
    else { setToken(''); setHatSecret(false); setNummer(''); }
  }

  async function speichere(neuerToken: boolean) {
    if (!gewaehlt) return;
    setBusy(true); setMeldung(null); setFehler(null);
    try {
      const r = await fetch('/api/admin/whatsapp-eingang', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ betrieb: gewaehlt, neuerToken, app_secret: secret }),
      });
      const d = await r.json();
      if (d?.ok) {
        setToken(d.webhook_token || '');
        setHatSecret(!!d.hatAppSecret);
        setSecret('');
        setMeldung('✓ Gespeichert.');
        ladeListe();
      } else {
        setFehler(d?.error || 'Speichern fehlgeschlagen.');
      }
    } catch {
      setFehler('Verbindung fehlgeschlagen.');
    }
    setBusy(false);
  }

  async function kopiere(text: string, was: string) {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(was);
      window.setTimeout(() => setKopiert(''), 2000);
    } catch {
      setFehler('Das Kopieren hat der Browser abgelehnt — bitte von Hand markieren.');
    }
  }

  const adresse = typeof window !== 'undefined' ? `${window.location.origin}/api/whatsapp/webhook` : '';
  const aktiv = betriebe.find((b) => b.id === gewaehlt) ?? null;
  const fertig = betriebe.filter((b) => b.hatToken && b.hatAppSecret && b.hatNummer).length;

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>

        <div style={s.kopf}>
          <div>
            <h1 style={s.h1}>💬 WhatsApp einrichten</h1>
            <p style={s.sub}>
              Je Betrieb einmal einrichten — danach empfängt und beantwortet der Kunde seine
              WhatsApp-Nachrichten in ARGONAUT, ohne selbst etwas konfigurieren zu müssen.
            </p>
          </div>
          <a href="/admin/command-center" style={s.btnGhost}>‹ Command Center</a>
        </div>

        {!encKey && (
          <div style={s.warnBox}>
            <b style={{ color: C.warn }}>⚠️ Sicherheits-Schlüssel fehlt.</b> Ohne <b>APP_ENC_KEY</b> in den
            Umgebungsvariablen lässt sich kein App-Secret verschlüsselt ablegen.
          </div>
        )}
        {fehler && <div style={s.fehlerBox}>{fehler}</div>}
        {meldung && <div style={s.okBox}>{meldung}</div>}

        {laden ? (
          <div style={s.hint}>Lädt …</div>
        ) : (
          <>
            <div style={s.kpiZeile}>
              <div style={s.kpi}><b>{betriebe.length}</b><span>Betriebe</span></div>
              <div style={s.kpi}><b style={{ color: C.green }}>{fertig}</b><span>vollständig eingerichtet</span></div>
            </div>

            <div style={s.karte}>
              <label style={s.label}>Betrieb</label>
              <select value={gewaehlt} onChange={(e) => waehle(e.target.value)} style={s.select}>
                <option value="">— Betrieb wählen —</option>
                {betriebe.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}{b.hatToken && b.hatAppSecret && b.hatNummer ? '  ✓' : ''}
                  </option>
                ))}
              </select>
            </div>

            {gewaehlt && (
              <div style={s.karte}>
                <div style={s.stand}>
                  <span style={aktiv?.hatNummer ? s.pillOk : s.pillOffen}>{aktiv?.hatNummer ? '✓' : '○'} Telefonnummer-ID</span>
                  <span style={token ? s.pillOk : s.pillOffen}>{token ? '✓' : '○'} Prüf-Token</span>
                  <span style={hatSecret ? s.pillOk : s.pillOffen}>{hatSecret ? '✓' : '○'} App-Secret</span>
                  <span style={aktiv?.verbunden ? s.pillOk : s.pillOffen}>{aktiv?.verbunden ? '✓' : '○'} Zugang verbunden</span>
                </div>

                {!aktiv?.hatNummer && (
                  <p style={s.hinweis}>
                    Für diesen Betrieb ist noch keine Telefonnummer-ID hinterlegt. Ohne sie kann der Webhook
                    eingehende Nachrichten keinem Betrieb zuordnen — sie wird beim Verbinden des Zugangs gesetzt.
                  </p>
                )}

                <div style={{ marginTop: 18 }}>
                  <label style={s.label}>1 · Webhook-Adresse bei Meta eintragen</label>
                  <div style={s.zeile}>
                    <code style={s.code}>{adresse}</code>
                    <button onClick={() => kopiere(adresse, 'adresse')} style={s.btnCyan}>
                      {kopiert === 'adresse' ? '✓ Kopiert' : 'Kopieren'}
                    </button>
                  </div>
                  <p style={s.hinweis}>
                    Dieselbe Adresse für alle Betriebe — die Zuordnung läuft über die Telefonnummer-ID
                    aus der Nachricht, nicht über die URL.
                  </p>
                </div>

                <div style={{ marginTop: 18 }}>
                  <label style={s.label}>2 · Prüf-Token (bei Meta als „Verify Token“)</label>
                  <div style={s.zeile}>
                    {token ? (
                      <>
                        <code style={{ ...s.code, color: C.gold }}>{token}</code>
                        <button onClick={() => kopiere(token, 'token')} style={s.btnCyan}>
                          {kopiert === 'token' ? '✓ Kopiert' : 'Kopieren'}
                        </button>
                        <button onClick={() => speichere(true)} disabled={busy} style={s.btnGrau}>Neu erzeugen</button>
                      </>
                    ) : (
                      <button onClick={() => speichere(true)} disabled={busy} style={s.btnGold}>
                        {busy ? 'Erzeuge…' : 'Prüf-Token erzeugen'}
                      </button>
                    )}
                  </div>
                  {token && <p style={s.hinweis}>Ein neuer Token macht den alten ungültig — Meta muss dann erneut bestätigt werden.</p>}
                </div>

                <div style={{ marginTop: 18 }}>
                  <label style={s.label}>3 · App-Secret aus dem Meta-Konto</label>
                  <input
                    type="password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={hatSecret ? '•••••••• (gespeichert — zum Ändern neu eingeben)' : 'hier einfügen'}
                    style={s.input}
                  />
                  <p style={s.hinweis}>
                    Damit prüft ARGONAUT bei jeder eingehenden Nachricht, dass sie wirklich von Meta stammt.
                    Ohne dieses Secret wird nichts gespeichert — die Webhook-Adresse ist öffentlich.
                  </p>
                  <button
                    onClick={() => speichere(false)}
                    disabled={busy || !secret.trim()}
                    style={{ ...s.btnGold, opacity: (busy || !secret.trim()) ? 0.5 : 1, marginTop: 8 }}
                  >
                    {busy ? 'Speichere…' : 'App-Secret speichern'}
                  </button>
                </div>
              </div>
            )}

            {betriebe.length > 0 && (
              <div style={s.karte}>
                <div style={s.karteTitel}>Stand über alle Betriebe</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.tabelle}>
                    <thead>
                      <tr>
                        <th style={s.th}>Betrieb</th>
                        <th style={s.th}>Nummer</th>
                        <th style={s.th}>Token</th>
                        <th style={s.th}>Secret</th>
                        <th style={s.th}>Zugang</th>
                      </tr>
                    </thead>
                    <tbody>
                      {betriebe.map((b) => (
                        <tr key={b.id} onClick={() => waehle(b.id)} style={{ cursor: 'pointer' }}>
                          <td style={s.td}>{b.name}</td>
                          <td style={s.td}>{b.hatNummer ? '✓' : '—'}</td>
                          <td style={s.td}>{b.hatToken ? '✓' : '—'}</td>
                          <td style={s.td}>{b.hatAppSecret ? '✓' : '—'}</td>
                          <td style={s.td}>{b.verbunden ? '✓' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 16 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(1.4rem, 2.4vw, 2.1rem)', fontWeight: 700, color: C.gold, margin: 0 },
  sub: { fontFamily: 'DM Sans, sans-serif', color: C.textDim, margin: '8px 0 0', maxWidth: '62ch', lineHeight: 1.6 },
  btnGhost: { background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 18px', fontFamily: 'DM Sans, sans-serif', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' },

  kpiZeile: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 },
  kpi: { background: C.navy2, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 20px', fontFamily: 'DM Sans, sans-serif', minWidth: 150 },

  karte: { background: C.navy2, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '18px 22px', marginBottom: 18, fontFamily: 'DM Sans, sans-serif' },
  karteTitel: { fontFamily: 'var(--font-syne), sans-serif', fontWeight: 700, color: '#fff', fontSize: '1.15rem', marginBottom: 12 },
  label: { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 700, marginBottom: 6 },
  select: { background: C.navy, color: '#fff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: 15, minWidth: 280, maxWidth: 460 },
  input: { background: C.navy, color: '#fff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: 15, width: '100%', maxWidth: 460, boxSizing: 'border-box' },
  zeile: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  code: { background: C.navy, color: C.cyan, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '9px 12px', fontFamily: 'ui-monospace, monospace', fontSize: 13, wordBreak: 'break-all' },
  hinweis: { color: C.textDim, fontSize: 13, lineHeight: 1.55, margin: '8px 0 0', maxWidth: '68ch' },

  stand: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  pillOk: { color: C.green, border: `1px solid ${C.green}`, borderRadius: 12, padding: '3px 12px', fontSize: 12.5, fontWeight: 700 },
  pillOffen: { color: C.textDim, border: `1px solid ${C.textDim}`, borderRadius: 12, padding: '3px 12px', fontSize: 12.5, fontWeight: 700 },

  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 20px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14.5, cursor: 'pointer' },
  btnCyan: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  btnGrau: { background: 'transparent', color: C.textDim, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '9px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' },

  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', color: C.textDim, fontSize: 11.5, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0 12px 8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  td: { padding: '11px 12px 11px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#fff' },

  hint: { color: C.textDim, fontFamily: 'DM Sans, sans-serif', padding: 20 },
  warnBox: { background: 'rgba(224,162,76,0.12)', border: `1px solid ${C.warn}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 14 },
  fehlerBox: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: `1px solid ${C.danger}55`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: 'DM Sans, sans-serif' },
  okBox: { color: C.green, background: 'rgba(76,175,125,0.1)', border: `1px solid ${C.green}55`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontFamily: 'DM Sans, sans-serif' },
};
