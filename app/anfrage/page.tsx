'use client';

import { useState, type CSSProperties } from 'react';

type FormState = {
  name: string;
  telefon: string;
  email: string;
  dienstleistung: string;
  menge: string;
  einheit: string;
  wunschtermin: string;
  nachricht: string;
  privacy: boolean;
};

const START: FormState = {
  name: '',
  telefon: '',
  email: '',
  dienstleistung: '',
  menge: '',
  einheit: '',
  wunschtermin: '',
  nachricht: '',
  privacy: false,
};

const DIENSTLEISTUNGEN = ['Holzernte', 'Forstarbeiten', 'Brennholz', 'Baumfällung', 'Sonstiges'];
const EINHEITEN = ['SRM', 'FM', 'RM', 'ha', 'Sonstiges'];

const css = [
  '.arg-anfrage input, .arg-anfrage select, .arg-anfrage textarea {',
  '  width: 100%; box-sizing: border-box; background: #0A1628;',
  '  color: #E8EDF2; border: 1px solid #21344A; border-radius: 10px;',
  '  padding: 12px 14px; font-size: 15px; font-family: inherit; outline: none;',
  '  transition: border-color .15s ease, box-shadow .15s ease;',
  '}',
  '.arg-anfrage select { appearance: none; cursor: pointer; }',
  '.arg-anfrage input:focus, .arg-anfrage select:focus, .arg-anfrage textarea:focus {',
  '  border-color: #00e5ff; box-shadow: 0 0 0 3px rgba(0,229,255,0.15);',
  '}',
  '.arg-anfrage input::placeholder, .arg-anfrage textarea::placeholder { color: #5B6B7C; }',
  '.arg-anfrage .arg-btn:hover:not(:disabled) { filter: brightness(1.08); }',
  '.arg-anfrage .arg-btn:disabled { opacity: .6; cursor: not-allowed; }',
  '.arg-anfrage a { color: #C9A84C; }',
].join('\n');

const wrap: CSSProperties = {
  minHeight: '100vh',
  background: 'radial-gradient(1200px 600px at 50% -10%, #12243B 0%, #0A1628 60%)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '48px 16px',
  fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
  color: '#E8EDF2',
};

const card: CSSProperties = {
  width: '100%',
  maxWidth: 560,
  background: '#0F1F33',
  border: '1px solid #1C3048',
  borderRadius: 18,
  padding: 32,
  boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
};

const brand: CSSProperties = {
  fontFamily: 'var(--font-syne), system-ui, sans-serif',
  letterSpacing: 3,
  fontSize: 13,
  fontWeight: 700,
  color: '#C9A84C',
  textTransform: 'uppercase',
};

const h1: CSSProperties = {
  fontFamily: 'var(--font-syne), system-ui, sans-serif',
  fontSize: 28,
  fontWeight: 700,
  margin: '10px 0 6px',
  color: '#FFFFFF',
};

const sub: CSSProperties = { color: '#9AA7B5', fontSize: 15, margin: '0 0 24px', lineHeight: 1.5 };
const label: CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#C3D0DD', margin: '0 0 6px' };
const star: CSSProperties = { color: '#C9A84C' };
const fieldGap: CSSProperties = { marginBottom: 16 };
const row: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

const btn: CSSProperties = {
  width: '100%',
  marginTop: 8,
  padding: '14px 18px',
  fontSize: 16,
  fontWeight: 700,
  fontFamily: 'var(--font-syne), system-ui, sans-serif',
  color: '#0A1628',
  background: 'linear-gradient(90deg, #C9A84C, #E2C870)',
  border: 'none',
  borderRadius: 12,
  cursor: 'pointer',
};

const fehlerBox: CSSProperties = {
  background: 'rgba(229,72,72,0.12)',
  border: '1px solid rgba(229,72,72,0.4)',
  color: '#F2B8B8',
  borderRadius: 10,
  padding: '10px 14px',
  fontSize: 14,
  marginBottom: 16,
};

const checkRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, margin: '4px 0 8px' };

export default function AnfragePage() {
  const [form, setForm] = useState<FormState>(START);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [fehler, setFehler] = useState('');

  const update = (feld: keyof FormState, wert: string | boolean) =>
    setForm((p) => ({ ...p, [feld]: wert }) as FormState);

  async function absenden() {
    setFehler('');
    if (!form.name.trim()) { setFehler('Bitte geben Sie Ihren Namen an.'); return; }
    if (!form.telefon.trim()) { setFehler('Bitte geben Sie eine Telefonnummer an.'); return; }
    if (!form.privacy) { setFehler('Bitte stimmen Sie der Datenschutzerklärung zu.'); return; }

    setStatus('sending');

    const payload: Record<string, string | boolean> = {
      name: form.name.trim(),
      telefon: form.telefon.trim(),
      privacy: true,
    };
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.dienstleistung) payload.dienstleistung = form.dienstleistung;
    if (form.menge.trim()) payload.menge = form.menge.trim();
    if (form.einheit) payload.einheit = form.einheit;
    if (form.wunschtermin.trim()) payload.wunschtermin = form.wunschtermin.trim();
    if (form.nachricht.trim()) payload.nachricht = form.nachricht.trim();

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Der Server hat die Anfrage abgelehnt.');
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler. Bitte erneut versuchen.');
    }
  }

  if (status === 'success') {
    return (
      <main className="arg-anfrage" style={wrap}>
        <style>{css}</style>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={brand}>ARGONAUT</div>
          <div style={{ fontSize: 46, margin: '14px 0 6px', color: '#00e5ff' }}>✓</div>
          <h1 style={h1}>Vielen Dank!</h1>
          <p style={sub}>
            Ihre Anfrage ist eingegangen. Wir melden uns in Kürze persönlich bei Ihnen.
          </p>
        </div>
      </main>
    );
  }

  const sending = status === 'sending';

  return (
    <main className="arg-anfrage" style={wrap}>
      <style>{css}</style>
      <div style={card}>
        <div style={brand}>ARGONAUT</div>
        <h1 style={h1}>Projektanfrage</h1>
        <p style={sub}>
          Erzählen Sie uns kurz von Ihrem Vorhaben. Wir melden uns umgehend mit den nächsten Schritten.
        </p>

        {fehler ? <div style={fehlerBox}>{fehler}</div> : null}

        <div style={fieldGap}>
          <label style={label}>Name <span style={star}>*</span></label>
          <input
            type="text"
            value={form.name}
            placeholder="Ihr Name"
            onChange={(e) => update('name', e.target.value)}
          />
        </div>

        <div style={fieldGap}>
          <label style={label}>Telefon <span style={star}>*</span></label>
          <input
            type="tel"
            value={form.telefon}
            placeholder="z. B. 0151 23456789"
            onChange={(e) => update('telefon', e.target.value)}
          />
        </div>

        <div style={fieldGap}>
          <label style={label}>E-Mail</label>
          <input
            type="email"
            value={form.email}
            placeholder="optional"
            onChange={(e) => update('email', e.target.value)}
          />
        </div>

        <div style={fieldGap}>
          <label style={label}>Dienstleistung</label>
          <select value={form.dienstleistung} onChange={(e) => update('dienstleistung', e.target.value)}>
            <option value="">Bitte wählen</option>
            {DIENSTLEISTUNGEN.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div style={{ ...fieldGap, ...row }}>
          <div>
            <label style={label}>Menge</label>
            <input
              type="text"
              value={form.menge}
              placeholder="z. B. 30"
              onChange={(e) => update('menge', e.target.value)}
            />
          </div>
          <div>
            <label style={label}>Einheit</label>
            <select value={form.einheit} onChange={(e) => update('einheit', e.target.value)}>
              <option value="">Bitte wählen</option>
              {EINHEITEN.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={fieldGap}>
          <label style={label}>Wunschtermin</label>
          <input
            type="text"
            value={form.wunschtermin}
            placeholder="z. B. ab August, im Herbst oder 30.08.2026"
            onChange={(e) => update('wunschtermin', e.target.value)}
          />
        </div>

        <div style={fieldGap}>
          <label style={label}>Nachricht</label>
          <textarea
            rows={4}
            value={form.nachricht}
            placeholder="Beschreiben Sie kurz Ihr Vorhaben"
            onChange={(e) => update('nachricht', e.target.value)}
          />
        </div>

        <div style={checkRow}>
          <input
            id="privacy"
            type="checkbox"
            style={{ width: 18, height: 18, marginTop: 2, accentColor: '#C9A84C' }}
            checked={form.privacy}
            onChange={(e) => update('privacy', e.target.checked)}
          />
          <label htmlFor="privacy" style={{ ...label, margin: 0, fontWeight: 400, color: '#9AA7B5' }}>
            Ich habe die <a href="/datenschutz" target="_blank" rel="noreferrer">Datenschutzerklärung</a> gelesen und stimme der Verarbeitung meiner Daten zu. <span style={star}>*</span>
          </label>
        </div>

        <button className="arg-btn" style={btn} disabled={sending} onClick={absenden}>
          {sending ? 'Wird gesendet …' : 'Anfrage senden'}
        </button>
      </div>
    </main>
  );
}
