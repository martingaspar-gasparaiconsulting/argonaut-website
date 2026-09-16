'use client';

// ============================================================
// ARGONAUT OS · Einstellungen · Passwort ändern
//
// Ändert das Passwort des eingeloggten Nutzers über die aktive Session.
//
// GEÄNDERT 16.09.2026 — bis dahin verlangte diese Seite das ALTE Passwort
// nicht. Wer ein unbeaufsichtigtes, angemeldetes Gerät erwischte, übernahm das
// Konto in zwei Feldern, ohne irgendetwas zu wissen. Es ging auch keine
// Benachrichtigung raus, und andere Sitzungen liefen unverändert weiter.
//
// Jetzt drei Schritte:
//   1. Das alte Passwort wird gegen Supabase geprüft (signInWithPassword mit
//      der eigenen Adresse — ein Browser kann das nicht selbst entscheiden).
//   2. Erst danach wird das neue gesetzt.
//   3. Danach werden ALLE ANDEREN Sitzungen beendet. Wer das Konto vorher
//      übernommen hatte, fliegt damit raus — das ist der eigentliche Zweck.
//
// Die aktuelle Sitzung bleibt bestehen: scope 'others'. Niemand meldet sich
// hier versehentlich selbst ab.
//
// Wer über eine Einladung kam und nie ein Passwort vergeben hat, kommt hier
// nicht weiter — für den steht der Weg "Passwort vergessen" in der
// Fehlermeldung. Deshalb steht er dort und nicht in einer Fußnote.
//
// Pfad: app/dashboard/einstellungen/PasswortAendern.tsx
// ============================================================

import { useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { pruefeEingabe, MIN_LAENGE, FEHLER_ALTES_PASSWORT, ERFOLG_TEXT } from '@/lib/passwortWechsel';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GOLD = '#C9A84C';
const GREEN = '#4CAF7D';

export default function PasswortAendern() {
  const [alt, setAlt] = useState('');
  const [neu, setNeu] = useState('');
  const [wdh, setWdh] = useState('');
  const [zeigen, setZeigen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    setFehler(null); setOk(false);

    const pruefung = pruefeEingabe({ alt, neu, wdh });
    if (!pruefung.ok) { setFehler(pruefung.fehler); return; }

    setBusy(true);
    try {
      // 1) Wer sind wir überhaupt? Ohne Adresse lässt sich das alte Passwort
      //    nicht prüfen — dann wird gar nichts geändert.
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email ?? '';
      if (!email) {
        setFehler('Ihre Sitzung ist abgelaufen. Bitte melden Sie sich neu an.');
        return;
      }

      // 2) Das alte Passwort prüfen. Das kann nur Supabase entscheiden.
      const { error: altFehler } = await supabase.auth.signInWithPassword({ email, password: alt });
      if (altFehler) { setFehler(FEHLER_ALTES_PASSWORT); return; }

      // 3) Erst jetzt das neue setzen.
      const { error } = await supabase.auth.updateUser({ password: neu });
      if (error) throw error;

      // 4) Alle ANDEREN Geräte abmelden. Genau hier liegt der Sinn der Übung:
      //    wer das Konto übernommen hatte, ist danach draußen. 'others' lässt
      //    die eigene Sitzung stehen — niemand sperrt sich selbst aus.
      try {
        await supabase.auth.signOut({ scope: 'others' });
      } catch {
        // Wenn das schiefgeht, ist das Passwort trotzdem geändert. Kein Grund,
        // dem Nutzer einen Fehler zu zeigen.
      }

      setOk(true); setAlt(''); setNeu(''); setWdh('');
    } catch (e: unknown) {
      setFehler('Passwort konnte nicht geändert werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); }
  }

  const card: CSSProperties = {
    background: '#0F1F33', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, padding: '22px 24px', marginTop: 28,
  };
  const label: CSSProperties = { display: 'block', fontSize: 'clamp(12.5px, 1.13vw, 18px)', color: 'rgba(255,255,255,0.55)', marginBottom: 6, fontWeight: 600 };
  const input: CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: '#0A1628', color: '#fff',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '11px 13px', fontSize: 'clamp(15px, 1.31vw, 21px)',
  };
  const btnGold: CSSProperties = {
    padding: '12px 22px', borderRadius: 8, border: 'none', background: GOLD,
    color: '#0A1628', fontWeight: 700, fontSize: 'clamp(14px, 1.25vw, 20px)', cursor: 'pointer',
  };

  return (
    <div style={card}>
      <h2 style={{ fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 900, margin: '0 0 6px' }}>🔑 Passwort ändern</h2>
      <p style={{ fontSize: 'clamp(14px, 1.25vw, 20px)', color: 'rgba(255,255,255,0.55)', margin: '0 0 18px', lineHeight: 1.6, maxWidth: 560 }}>
        Vergeben Sie hier ein neues Passwort für Ihren Zugang. Zur Sicherheit brauchen wir einmal Ihr aktuelles Passwort –
        so kann niemand Ihr Konto übernehmen, der kurz an Ihrem Rechner sitzt. Alle anderen Geräte werden danach abgemeldet.
      </p>

      <div style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
        <div>
          <label style={label} htmlFor="pw-alt">Aktuelles Passwort</label>
          <input
            id="pw-alt"
            type={zeigen ? 'text' : 'password'}
            value={alt}
            onChange={(e) => { setAlt(e.target.value); setOk(false); }}
            autoComplete="current-password"
            style={input}
          />
        </div>
        <div>
          <label style={label} htmlFor="pw-neu">Neues Passwort</label>
          <input
            id="pw-neu"
            type={zeigen ? 'text' : 'password'}
            value={neu}
            onChange={(e) => { setNeu(e.target.value); setOk(false); }}
            autoComplete="new-password"
            placeholder={`mind. ${MIN_LAENGE} Zeichen`}
            style={input}
          />
        </div>
        <div>
          <label style={label} htmlFor="pw-wdh">Neues Passwort wiederholen</label>
          <input
            id="pw-wdh"
            type={zeigen ? 'text' : 'password'}
            value={wdh}
            onChange={(e) => { setWdh(e.target.value); setOk(false); }}
            autoComplete="new-password"
            style={input}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'clamp(13px, 1.13vw, 18px)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
          <input type="checkbox" checked={zeigen} onChange={(e) => setZeigen(e.target.checked)} />
          Passwörter anzeigen
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 18 }}>
        <button style={{ ...btnGold, opacity: busy ? 0.6 : 1 }} onClick={speichern} disabled={busy}>
          {busy ? 'Ändere…' : 'Passwort ändern'}
        </button>
        {ok && <span style={{ color: GREEN, fontSize: 'clamp(13.5px, 1.19vw, 19px)', fontWeight: 600 }}>✅ {ERFOLG_TEXT}</span>}
      </div>

      {fehler && (
        <div style={{ marginTop: 16, color: '#E06666', fontSize: 'clamp(13.5px, 1.19vw, 19px)', fontWeight: 600, maxWidth: 560, lineHeight: 1.5 }}>{fehler}</div>
      )}
    </div>
  );
}
