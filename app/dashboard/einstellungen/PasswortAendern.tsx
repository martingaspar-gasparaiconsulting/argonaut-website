'use client';

// ============================================================
// ARGONAUT OS · Einstellungen · Passwort ändern
// Ändert das Passwort des eingeloggten Nutzers über die aktive Session
// (supabase.auth.updateUser). Braucht KEINE E-Mail -> funktioniert auch,
// wenn der Mailversand gerade klemmt.
// Pfad: app/dashboard/einstellungen/PasswortAendern.tsx
// ============================================================

import { useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GOLD = '#C9A84C';
const GREEN = '#4CAF7D';

export default function PasswortAendern() {
  const [neu, setNeu] = useState('');
  const [wdh, setWdh] = useState('');
  const [zeigen, setZeigen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    setFehler(null); setOk(false);
    if (neu.length < 8) { setFehler('Das Passwort muss mindestens 8 Zeichen haben.'); return; }
    if (neu !== wdh) { setFehler('Die beiden Passwörter stimmen nicht überein.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: neu });
      if (error) throw error;
      setOk(true); setNeu(''); setWdh('');
    } catch (e: unknown) {
      setFehler('Passwort konnte nicht geändert werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); }
  }

  const card: CSSProperties = {
    background: '#0F1F33', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, padding: '22px 24px', marginTop: 28,
  };
  const label: CSSProperties = { display: 'block', fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginBottom: 6, fontWeight: 600 };
  const input: CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: '#0A1628', color: '#fff',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '11px 13px', fontSize: 15,
  };
  const btnGold: CSSProperties = {
    padding: '12px 22px', borderRadius: 8, border: 'none', background: GOLD,
    color: '#0A1628', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  };

  return (
    <div style={card}>
      <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 6px' }}>🔑 Passwort ändern</h2>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', margin: '0 0 18px', lineHeight: 1.6, maxWidth: 560 }}>
        Vergib direkt hier ein neues Passwort für deinen Zugang. Du bist eingeloggt – es wird keine E-Mail benötigt.
      </p>

      <div style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
        <div>
          <label style={label}>Neues Passwort</label>
          <input
            type={zeigen ? 'text' : 'password'}
            value={neu}
            onChange={(e) => { setNeu(e.target.value); setOk(false); }}
            autoComplete="new-password"
            placeholder="mind. 8 Zeichen"
            style={input}
          />
        </div>
        <div>
          <label style={label}>Neues Passwort wiederholen</label>
          <input
            type={zeigen ? 'text' : 'password'}
            value={wdh}
            onChange={(e) => { setWdh(e.target.value); setOk(false); }}
            autoComplete="new-password"
            style={input}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
          <input type="checkbox" checked={zeigen} onChange={(e) => setZeigen(e.target.checked)} />
          Passwörter anzeigen
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 18 }}>
        <button style={{ ...btnGold, opacity: busy ? 0.6 : 1 }} onClick={speichern} disabled={busy}>
          {busy ? 'Ändere…' : 'Passwort ändern'}
        </button>
        {ok && <span style={{ color: GREEN, fontSize: 13.5, fontWeight: 600 }}>✅ Passwort geändert. Es gilt ab sofort.</span>}
      </div>

      {fehler && (
        <div style={{ marginTop: 16, color: '#E06666', fontSize: 13.5, fontWeight: 600 }}>{fehler}</div>
      )}
    </div>
  );
}
