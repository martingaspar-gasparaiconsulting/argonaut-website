'use client';

// ============================================================
// ARGONAUT OS · Paket 264 · K4 Teil 2 — Online-Ankaufformular (ohne Login)
// /ankauf/<kennung> — Privatleute und Firmen bieten dem Betrieb ihr Fahrzeug an.
// Liest und schreibt ausschließlich über /api/oeffentlich/kfz-ankauf
// (Service-Role, Betrieb nur über die geheime Kennung). Kein Supabase im Client.
// Der Betrieb schaltet das Formular in „Ankauf und Bewertung" ein und aus.
// ============================================================

import { useEffect, useState, CSSProperties } from 'react';
import { useParams } from 'next/navigation';

const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', ok: '#4CAF7D', bad: '#E06666' };

type Form = {
  name: string; email: string; telefon: string; plz: string; ort: string; gewerblich: boolean;
  marke: string; modell: string; variante: string; erstzulassung: string; km: string; kraftstoff: string; fin: string;
  unfall: string; unfall_text: string; preis: string; beschreibung: string; datenschutz: boolean; firma_hp: string;
};
const LEER: Form = {
  name: '', email: '', telefon: '', plz: '', ort: '', gewerblich: false, marke: '', modell: '', variante: '', erstzulassung: '', km: '',
  kraftstoff: '', fin: '', unfall: 'unbekannt', unfall_text: '', preis: '', beschreibung: '', datenschutz: false, firma_hp: '',
};

export default function AnkaufFormularPage() {
  const params = useParams();
  const k = String((params as Record<string, string | string[]>)?.kennung ?? '');
  const [stand, setStand] = useState<'laedt' | 'aus' | 'offen' | 'gesendet'>('laedt');
  const [firma, setFirma] = useState<string | null>(null);
  const [f, setF] = useState<Form>(LEER);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/oeffentlich/kfz-ankauf?k=${encodeURIComponent(k)}`, { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.aktiv) { setFirma(j.firma ?? null); setStand('offen'); } else setStand('aus');
      } catch { setStand('aus'); }
    })();
  }, [k]);

  async function senden() {
    setFehler(null);
    if (!f.datenschutz) { setFehler('Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/oeffentlich/kfz-ankauf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, k }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFehler(j.error || 'Senden fehlgeschlagen. Bitte versuchen Sie es später erneut.'); return; }
      setStand('gesendet');
    } catch { setFehler('Keine Verbindung. Bitte versuchen Sie es erneut.'); }
    finally { setBusy(false); }
  }

  const feld = (key: keyof Form, label: string, extra?: { typ?: string; ph?: string; mode?: 'numeric' | 'decimal' | 'email' | 'tel'; auto?: string }) => (
    <label style={s.lab}>{label}
      <input style={s.inp} type={extra?.typ ?? 'text'} placeholder={extra?.ph} inputMode={extra?.mode} autoComplete={extra?.auto}
        value={f[key] as string} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </label>
  );

  return (
    <main style={s.page}>
      <div style={s.box}>
        <div style={s.eyebrow}>{firma ?? 'Fahrzeug-Ankauf'}</div>
        <h1 style={s.h1}>Fahrzeug anbieten</h1>
        {stand === 'laedt' && <p style={s.dim}>Lädt …</p>}
        {stand === 'aus' && <p style={s.dim}>Dieses Formular ist gerade nicht verfügbar. Bitte wenden Sie sich direkt an den Betrieb.</p>}
        {stand === 'gesendet' && (
          <div style={s.ok} role="status">
            <b>Vielen Dank, Ihr Angebot ist eingegangen.</b>
            <p style={{ margin: '6px 0 0' }}>{firma ?? 'Der Betrieb'} prüft Ihre Angaben und meldet sich bei Ihnen. Ein verbindliches Angebot erhalten Sie erst nach der Besichtigung des Fahrzeugs.</p>
          </div>
        )}
        {stand === 'offen' && (
          <>
            <p style={s.dim}>Beschreiben Sie Ihr Fahrzeug. {firma ?? 'Der Betrieb'} meldet sich mit einer ersten Einschätzung und einem Termin zur Besichtigung. Pflichtfelder sind mit * markiert.</p>
            <h2 style={s.h2}>Ihr Fahrzeug</h2>
            <div style={s.raster}>
              {feld('marke', 'Marke *')}{feld('modell', 'Modell *')}{feld('variante', 'Ausführung / Motor')}
              {feld('erstzulassung', 'Erstzulassung', { ph: 'MM/JJJJ' })}{feld('km', 'Kilometerstand *', { mode: 'numeric' })}{feld('kraftstoff', 'Kraftstoff')}
              {feld('fin', 'FIN (optional)', { ph: '17 Zeichen' })}{feld('preis', 'Ihre Preisvorstellung in € (optional)', { mode: 'decimal' })}
              <label style={s.lab}>Unfälle oder Vorschäden<select style={s.inp} value={f.unfall} onChange={(e) => setF({ ...f, unfall: e.target.value })}>
                <option value="unbekannt">weiß ich nicht</option><option value="keine_bekannt">keine bekannt</option><option value="ja">ja</option></select></label>
            </div>
            {f.unfall === 'ja' && <label style={{ ...s.lab, marginTop: 10 }}>Welche?<input style={s.inp} maxLength={300} value={f.unfall_text} onChange={(e) => setF({ ...f, unfall_text: e.target.value })} /></label>}
            <label style={{ ...s.lab, marginTop: 10 }}>Zustand, Ausstattung, Besonderheiten<textarea style={{ ...s.inp, minHeight: 90 }} maxLength={1500} value={f.beschreibung} onChange={(e) => setF({ ...f, beschreibung: e.target.value })} /></label>

            <h2 style={s.h2}>Ihre Kontaktdaten</h2>
            <div style={s.raster}>
              {feld('name', 'Name *', { auto: 'name' })}{feld('email', 'E-Mail', { typ: 'email', mode: 'email', auto: 'email' })}{feld('telefon', 'Telefon', { typ: 'tel', mode: 'tel', auto: 'tel' })}
              {feld('plz', 'PLZ', { mode: 'numeric', auto: 'postal-code' })}{feld('ort', 'Ort', { auto: 'address-level2' })}
            </div>
            <div style={{ ...s.dim, marginTop: 6 }}>E-Mail oder Telefon genügt.</div>
            <label style={{ ...s.haken, marginTop: 10 }}><input type="checkbox" checked={f.gewerblich} onChange={(e) => setF({ ...f, gewerblich: e.target.checked })} /> Ich verkaufe als Unternehmen (mit Rechnung und Umsatzsteuer)</label>
            {/* Spam-Falle: für Menschen unsichtbar */}
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.firma_hp} onChange={(e) => setF({ ...f, firma_hp: e.target.value })} style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
            <label style={{ ...s.haken, marginTop: 10 }}><input type="checkbox" checked={f.datenschutz} onChange={(e) => setF({ ...f, datenschutz: e.target.checked })} /> <span>Ich bin einverstanden, dass {firma ?? 'der Betrieb'} meine Angaben zur Bearbeitung dieses Angebots speichert und mich dazu kontaktiert. Werbung erhalte ich dadurch nicht. *</span></label>
            {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
            <button style={{ ...s.gold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void senden()}>{busy ? 'Wird gesendet …' : 'Fahrzeug unverbindlich anbieten'}</button>
          </>
        )}
      </div>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: '32px 16px 60px' },
  box: { maxWidth: 760, margin: '0 auto', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 20px' },
  eyebrow: { color: C.gold, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 },
  h1: { fontSize: 28, fontWeight: 800, margin: '6px 0 8px' },
  h2: { fontSize: 16, fontWeight: 800, margin: '20px 0 10px' },
  dim: { color: C.dim, fontSize: 14, margin: '4px 0' },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 },
  lab: { display: 'grid', gap: 4, fontSize: 13, color: C.dim },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '10px 12px', fontSize: 15, minWidth: 0 },
  haken: { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.45 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 10, padding: '12px 18px', fontWeight: 800, cursor: 'pointer', marginTop: 16, fontSize: 15 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px', marginTop: 12 },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, borderRadius: 10, padding: '12px 14px', marginTop: 10 },
};
