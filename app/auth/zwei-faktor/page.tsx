'use client';

// ============================================================================
// ARGONAUT OS · /auth/zwei-faktor — Code bei der Anmeldung (Paket 164, Stufe 1)
//
// Hierher schickt der Pfoertner (proxy.ts) jeden, der einen zweiten Faktor
// eingerichtet hat, aber in dieser Sitzung noch keinen Code eingegeben hat.
// Code aus der Authenticator-App -> Sitzung wird aal2 -> zurück zur Seite.
// Handy weg: Notfall-Code -> zweiter Faktor wird entfernt -> sofort neu einrichten.
// Texte anredefrei (Chef und Mitarbeiter landen hier).
// ============================================================================

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { codeFormat, sichererWeiter, EINRICHT_PFAD } from '@/lib/zweiFaktor';
import * as S from './_teile/stil';

export default function ZweiFaktorPruefen() {
  const [faktorId, setFaktorId] = useState<string | null>(null);
  const [weiter, setWeiter] = useState('/dashboard');
  const [code, setCode] = useState('');
  const [notfall, setNotfall] = useState(false);
  const [notfallCode, setNotfallCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    const ziel = sichererWeiter(new URLSearchParams(window.location.search).get('weiter'));
    setWeiter(ziel);
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/auth/login'; return; }
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = (data?.totp ?? []).find((f) => f.status === 'verified');
      if (!totp) { window.location.href = ziel; return; }
      setFaktorId(totp.id);
    })();
  }, []);

  async function pruefen(e: React.FormEvent) {
    e.preventDefault();
    const c = codeFormat(code);
    if (!c) { setFehler('Bitte die 6 Ziffern aus der Authenticator-App eingeben.'); return; }
    if (!faktorId) return;
    setBusy(true); setFehler(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: faktorId, code: c });
    if (error) { setFehler('Der Code passt nicht. Bitte den aktuellen Code aus der App eingeben.'); setBusy(false); return; }
    window.location.href = weiter;
  }

  async function notfallEinloesen(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setFehler(null);
    try {
      const r = await fetch('/api/zwei-faktor/notfall', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: notfallCode }) });
      const j = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) { setFehler(j.error ?? 'Notfall-Code nicht angenommen.'); setBusy(false); return; }
      await createClient().auth.refreshSession();
      window.location.href = `${EINRICHT_PFAD}?weiter=${encodeURIComponent(weiter)}`;
    } catch { setFehler('Notfall-Code gerade nicht prüfbar.'); setBusy(false); }
  }

  async function abmelden() {
    await createClient().auth.signOut();
    window.location.href = '/auth/login';
  }

  return (
    <div style={S.seite}>
      <div style={S.karte}>
        <h1 style={S.titel}>Zwei-Faktor-Anmeldung</h1>
        {!notfall ? (
          <form onSubmit={pruefen}>
            <p style={S.text}>Zum Schutz des Zugangs: den 6-stelligen Code aus der Authenticator-App eingeben.</p>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={7} placeholder="123456" style={S.eingabe} aria-label="Code aus der App" />
            <button type="submit" disabled={busy || !faktorId} style={{ ...S.knopf, opacity: busy || !faktorId ? 0.6 : 1 }}>{busy ? 'Prüft …' : 'Bestätigen'}</button>
            <div style={{ marginTop: 16 }}><button type="button" onClick={() => { setNotfall(true); setFehler(null); }} style={S.link}>Handy nicht zur Hand? Notfall-Code verwenden</button></div>
          </form>
        ) : (
          <form onSubmit={notfallEinloesen}>
            <p style={S.text}>Einen der Notfall-Codes eingeben, die bei der Einrichtung angezeigt wurden (z. B. ABCDE-FGH23). Danach ist die Zwei-Faktor-Anmeldung entfernt und wird gleich neu eingerichtet — mit dem neuen Handy.</p>
            <input value={notfallCode} onChange={(e) => setNotfallCode(e.target.value)} autoComplete="off" autoFocus maxLength={14} placeholder="XXXXX-XXXXX" style={{ ...S.eingabe, letterSpacing: 2 }} aria-label="Notfall-Code" />
            <button type="submit" disabled={busy} style={{ ...S.knopf, opacity: busy ? 0.6 : 1 }}>{busy ? 'Prüft …' : 'Notfall-Code einlösen'}</button>
            <div style={{ marginTop: 16 }}><button type="button" onClick={() => { setNotfall(false); setFehler(null); }} style={S.link}>Zurück zur Code-Eingabe</button></div>
            <p style={{ ...S.klein, marginTop: 14 }}>Keine Notfall-Codes mehr? Dann hilft der ARGONAUT-Support: support@argonaut-os.com (nach Prüfung der Identität wird die Zwei-Faktor-Anmeldung zurückgesetzt).</p>
          </form>
        )}
        {fehler && <div style={S.fehler}>{fehler}</div>}
        <div style={{ marginTop: 22, borderTop: '1px solid rgba(143,163,190,0.18)', paddingTop: 14 }}>
          <button type="button" onClick={abmelden} style={S.link}>Abmelden</button>
        </div>
      </div>
    </div>
  );
}
