'use client';

// ============================================================================
// ARGONAUT OS · /auth/zwei-faktor/einrichten — Zwei-Faktor einrichten (Paket 164, Stufe 1)
//
// 1. „Einrichten starten" -> QR-Code (+ Schlüssel zum Abtippen) für eine
//    Authenticator-App (Google/Microsoft Authenticator, 1Password …)
// 2. Code aus der App bestätigen -> Faktor aktiv, Sitzung aal2
// 3. Zehn Notfall-Codes erscheinen EINMAL — aufschreiben/ausdrucken
// Eingerichtet: neue Notfall-Codes erzeugen oder (Stufe 1) wieder entfernen —
// beides nur nach Code-Bestätigung (aal2). Texte anredefrei.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { codeFormat, sichererWeiter, PRUEF_PFAD } from '@/lib/zweiFaktor';
import * as S from '../_teile/stil';

type Stand = 'laedt' | 'aus' | 'qr' | 'codes' | 'an';

export default function ZweiFaktorEinrichten() {
  const [stand, setStand] = useState<Stand>('laedt');
  const [aal2, setAal2] = useState(false);
  const [faktorId, setFaktorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [geheim, setGeheim] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [verwahrt, setVerwahrt] = useState(false);
  const [weiter, setWeiter] = useState('/dashboard');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '/auth/login'; return; }
    const { data } = await supabase.auth.mfa.listFactors();
    const aktiv = (data?.totp ?? []).find((f) => f.status === 'verified');
    const { data: stufe } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal2(stufe?.currentLevel === 'aal2');
    setFaktorId(aktiv?.id ?? null);
    setStand(aktiv ? 'an' : 'aus');
  }, []);

  useEffect(() => {
    setWeiter(sichererWeiter(new URLSearchParams(window.location.search).get('weiter')));
    void laden();
  }, [laden]);

  async function starten() {
    setBusy(true); setFehler(null);
    const supabase = createClient();
    // Halbfertige Versuche von früher aufräumen (nur unbestätigte Faktoren).
    const { data: alle } = await supabase.auth.mfa.listFactors();
    for (const f of alle?.all ?? []) {
      if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `ARGONAUT ${new Date().toISOString().slice(0, 16)}` });
    setBusy(false);
    if (error || !data) { setFehler('Die Einrichtung lässt sich gerade nicht starten. Bitte später erneut versuchen.'); return; }
    setFaktorId(data.id);
    setQr(data.totp.qr_code);
    setGeheim(data.totp.secret);
    setStand('qr');
  }

  async function neueCodes(): Promise<boolean> {
    const r = await fetch('/api/zwei-faktor/notfall-codes', { method: 'POST' });
    const j = await r.json().catch(() => ({})) as { ok?: boolean; codes?: string[]; error?: string };
    if (!r.ok || !j.codes) { setFehler(j.error ?? 'Notfall-Codes gerade nicht erzeugbar.'); return false; }
    setCodes(j.codes); setVerwahrt(false); setStand('codes');
    return true;
  }

  async function bestaetigen(e: React.FormEvent) {
    e.preventDefault();
    const c = codeFormat(code);
    if (!c || !faktorId) { setFehler('Bitte die 6 Ziffern aus der App eingeben.'); return; }
    setBusy(true); setFehler(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: faktorId, code: c });
    if (error) { setFehler('Der Code passt nicht. Uhrzeit des Handys prüfen und den aktuellen Code eingeben.'); setBusy(false); return; }
    await fetch('/api/zwei-faktor/ereignis', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ art: 'eingerichtet' }) }).catch(() => undefined);
    setAal2(true);
    await neueCodes();
    setBusy(false);
  }

  async function entfernen() {
    if (!faktorId) return;
    if (!window.confirm('Zwei-Faktor-Anmeldung wirklich entfernen? Danach genügt wieder das Passwort.')) return;
    setBusy(true); setFehler(null);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: faktorId });
    if (error) { setFehler('Entfernen ging nicht — zuerst den Code aus der App bestätigen.'); setBusy(false); return; }
    await supabase.auth.refreshSession();
    await fetch('/api/zwei-faktor/ereignis', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ art: 'entfernt' }) }).catch(() => undefined);
    setBusy(false); setMeldung('Zwei-Faktor-Anmeldung entfernt.');
    await laden();
  }

  function kopieren() {
    navigator.clipboard?.writeText(codes.join('\n')).then(() => setMeldung('Notfall-Codes kopiert.'), () => setMeldung('Kopieren ging nicht — bitte abschreiben.'));
  }

  return (
    <div style={S.seite}>
      <div style={S.karte}>
        <h1 style={S.titel}>Zwei-Faktor-Anmeldung</h1>

        {stand === 'laedt' && <p style={S.text}>Lädt …</p>}

        {stand === 'aus' && (<>
          <p style={S.text}>Mit der Zwei-Faktor-Anmeldung reicht ein gestohlenes Passwort nicht mehr: Bei jeder Anmeldung kommt zusätzlich ein 6-stelliger Code aus einer App auf dem Handy dazu.</p>
          <p style={S.klein}>Benötigt: eine Authenticator-App, z. B. Google Authenticator, Microsoft Authenticator oder 1Password.</p>
          <button type="button" onClick={starten} disabled={busy} style={{ ...S.knopf, opacity: busy ? 0.6 : 1 }}>{busy ? 'Startet …' : 'Einrichten starten'}</button>
          <button type="button" onClick={() => { window.location.href = weiter; }} style={S.knopfRand}>Später</button>
        </>)}

        {stand === 'qr' && (
          <form onSubmit={bestaetigen}>
            <p style={S.text}>1. Die Authenticator-App öffnen und diesen QR-Code scannen.</p>
            {qr && <div style={{ background: '#fff', borderRadius: 12, padding: 12, width: 200, margin: '0 auto 12px' }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={qr} alt="QR-Code für die Authenticator-App" width={176} height={176} style={{ display: 'block' }} /></div>}
            {geheim && <p style={{ ...S.klein, textAlign: 'center', wordBreak: 'break-all' }}>Scannen geht nicht? Schlüssel von Hand eintragen:<br /><code style={{ color: '#C9A84C', fontSize: 13 }}>{geheim}</code></p>}
            <p style={{ ...S.text, marginTop: 14 }}>2. Den 6-stelligen Code aus der App eingeben.</p>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" style={S.eingabe} aria-label="Code aus der App" />
            <button type="submit" disabled={busy} style={{ ...S.knopf, opacity: busy ? 0.6 : 1 }}>{busy ? 'Prüft …' : 'Bestätigen und einschalten'}</button>
          </form>
        )}

        {stand === 'codes' && (<>
          <p style={{ ...S.gut, marginTop: 0 }}>✓ Zwei-Faktor-Anmeldung ist eingeschaltet.</p>
          <p style={S.text}>Notfall-Codes — für den Fall, dass das Handy verloren geht. Jeder Code gilt einmal. <strong>Die Codes erscheinen nur dieses eine Mal.</strong> Ausdrucken oder sicher aufbewahren (nicht auf dem Handy mit der App).</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontFamily: 'monospace', fontSize: 15, background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
            {codes.map((c) => <div key={c} style={{ textAlign: 'center' }}>{c}</div>)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={kopieren} style={{ ...S.knopfRand, marginTop: 0 }}>Kopieren</button>
            <button type="button" onClick={() => window.print()} style={{ ...S.knopfRand, marginTop: 0 }}>Drucken</button>
          </div>
          <label style={{ ...S.klein, display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={verwahrt} onChange={(e) => setVerwahrt(e.target.checked)} /> Notfall-Codes sind sicher aufbewahrt.
          </label>
          <button type="button" disabled={!verwahrt} onClick={() => { window.location.href = weiter; }} style={{ ...S.knopf, opacity: verwahrt ? 1 : 0.5, cursor: verwahrt ? 'pointer' : 'not-allowed' }}>Fertig</button>
        </>)}

        {stand === 'an' && (<>
          <p style={{ ...S.gut, marginTop: 0 }}>✓ Zwei-Faktor-Anmeldung ist eingeschaltet.</p>
          {!aal2 ? (
            <p style={S.text}>Zum Ändern zuerst den Code aus der App bestätigen: <a href={`${PRUEF_PFAD}?weiter=/dashboard`} style={{ color: '#00e5ff' }}>Code eingeben</a></p>
          ) : (<>
            <p style={S.text}>Neue Notfall-Codes ersetzen die alten vollständig.</p>
            <button type="button" onClick={async () => { setBusy(true); setFehler(null); await neueCodes(); setBusy(false); }} disabled={busy} style={{ ...S.knopf, opacity: busy ? 0.6 : 1 }}>Neue Notfall-Codes erzeugen</button>
            <button type="button" onClick={entfernen} disabled={busy} style={{ ...S.knopfRand, color: '#E06666', borderColor: 'rgba(224,102,102,0.5)' }}>Zwei-Faktor-Anmeldung entfernen</button>
          </>)}
          <button type="button" onClick={() => { window.location.href = weiter; }} style={S.knopfRand}>Zurück</button>
        </>)}

        {fehler && <div style={S.fehler}>{fehler}</div>}
        {meldung && <div style={S.gut}>{meldung}</div>}
      </div>
    </div>
  );
}
