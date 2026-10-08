'use client';

// ============================================================
// ARGONAUT OS · Paket 272 · K11a — Anfrage-Formular der Fahrzeugbörse
// Schickt ausschließlich an /api/oeffentlich/kfz-boerse-anfrage (Kennung +
// Fahrzeug-ID). Kein Supabase im Browser. Spam-Falle firma_hp.
// ============================================================

import { useState, type CSSProperties } from 'react';
import { WUENSCHE, textAuf } from '@/lib/kfzBoerse';

type Form = { name: string; email: string; telefon: string; wunsch: string; nachricht: string; datenschutz: boolean; firma_hp: string };
const LEER: Form = { name: '', email: '', telefon: '', wunsch: 'info', nachricht: '', datenschutz: false, firma_hp: '' };

export default function AnfrageFormular({ k, id, firma, akzent, hinweis }: { k: string; id: string; firma: string | null; akzent: string; hinweis: string }) {
  const [f, setF] = useState<Form>(LEER);
  const [stand, setStand] = useState<'offen' | 'gesendet'>('offen');
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function senden() {
    setFehler(null);
    if (!f.name.trim()) { setFehler('Bitte geben Sie Ihren Namen an.'); return; }
    if (!f.email.trim() && !f.telefon.trim()) { setFehler('Bitte geben Sie eine E-Mail-Adresse oder Telefonnummer an.'); return; }
    if (!f.datenschutz) { setFehler('Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/oeffentlich/kfz-boerse-anfrage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, k, id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFehler((j as { error?: string }).error || 'Senden fehlgeschlagen. Bitte versuchen Sie es später erneut.'); return; }
      setStand('gesendet');
    } catch { setFehler('Keine Verbindung. Bitte versuchen Sie es erneut.'); }
    finally { setBusy(false); }
  }

  if (stand === 'gesendet') {
    return (
      <div style={s.ok} role="status">
        <b>Vielen Dank, Ihre Anfrage ist eingegangen.</b>
        <p style={{ margin: '6px 0 0' }}>{firma ?? 'Wir'} {firma ? 'meldet sich' : 'melden uns'} so schnell wie möglich bei Ihnen.</p>
      </div>
    );
  }

  const feld = (key: 'name' | 'email' | 'telefon', label: string, typ: string, auto: string) => (
    <label style={s.lab}>{label}
      <input style={s.inp} type={typ} autoComplete={auto} maxLength={key === 'email' ? 160 : key === 'telefon' ? 40 : 120}
        value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </label>
  );

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="radiogroup" aria-label="Ihr Anliegen">
        {WUENSCHE.map((w) => (
          <button key={w.key} type="button" role="radio" aria-checked={f.wunsch === w.key} onClick={() => setF({ ...f, wunsch: w.key })}
            style={f.wunsch === w.key ? { ...s.chip, borderColor: akzent, background: akzent, color: textAuf(akzent) } : s.chip}>{w.label}</button>
        ))}
      </div>
      {feld('name', 'Name *', 'text', 'name')}
      {feld('email', 'E-Mail', 'email', 'email')}
      {feld('telefon', 'Telefon', 'tel', 'tel')}
      <div style={s.klein}>E-Mail oder Telefon genügt.</div>
      <label style={s.lab}>Ihre Nachricht
        <textarea style={{ ...s.inp, minHeight: 90, resize: 'vertical' }} maxLength={1500} value={f.nachricht} onChange={(e) => setF({ ...f, nachricht: e.target.value })} />
      </label>
      {/* Spam-Falle: für Menschen unsichtbar */}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.firma_hp} onChange={(e) => setF({ ...f, firma_hp: e.target.value })} style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
      <label style={s.haken}>
        <input type="checkbox" checked={f.datenschutz} onChange={(e) => setF({ ...f, datenschutz: e.target.checked })} style={{ marginTop: 3 }} />
        <span>Ich bin einverstanden, dass {firma ?? 'der Betrieb'} meine Angaben zur Beantwortung dieser Anfrage speichert und mich dazu kontaktiert. *</span>
      </label>
      <details style={s.klein}>
        <summary style={{ cursor: 'pointer' }}>Hinweise zum Datenschutz</summary>
        <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>{hinweis}</p>
      </details>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      <button type="button" disabled={busy} onClick={() => void senden()}
        style={{ ...s.senden, background: akzent, color: textAuf(akzent), opacity: busy ? 0.6 : 1 }}>{busy ? 'Wird gesendet …' : 'Anfrage senden'}</button>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  lab: { display: 'grid', gap: 4, fontSize: 13, color: '#5B6676' },
  inp: { border: '1px solid #D5DCE5', borderRadius: 8, padding: '10px 12px', fontSize: 15, color: '#111827', background: '#fff', minWidth: 0, fontFamily: 'inherit' },
  chip: { border: '1px solid #D5DCE5', background: '#fff', color: '#111827', borderRadius: 999, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  klein: { fontSize: 12.5, color: '#5B6676' },
  haken: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45, color: '#111827' },
  fehler: { background: '#FDECEC', border: '1px solid #E06666', borderRadius: 8, padding: '8px 12px', fontSize: 14 },
  ok: { background: '#E9F7EF', border: '1px solid #4CAF7D', borderRadius: 10, padding: '12px 14px', fontSize: 14 },
  senden: { border: 0, borderRadius: 10, padding: '12px 18px', fontWeight: 800, cursor: 'pointer', fontSize: 15 },
};
