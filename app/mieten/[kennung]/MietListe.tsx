'use client';

// ============================================================
// ARGONAUT OS · Paket 294 · V2b — Mietflotte + Formular „Unverbindlich anfragen"
// Schickt ausschließlich an /api/oeffentlich/miet-anfrage (Kennung + Fahrzeug-ID).
// Kein Supabase im Browser. Spam-Falle firma_hp. Ob das Fahrzeug frei ist,
// prüft der Server — nach außen nur „frei" oder „vergeben", nie wer.
// ============================================================

import { useMemo, useState, type CSSProperties } from 'react';
import { textAuf } from '@/lib/kfzBoerse';
import { ARTEN } from '@/lib/fahrzeugMiete';
import { konditionen, vorschau, euroText, MAX_TAGE_ANFRAGE, type MietFahrzeugOeffentlich } from '@/lib/mietOnline';

type Form = { von: string; bis: string; name: string; email: string; telefon: string; nachricht: string; datenschutz: boolean; firma_hp: string };
const ART_NAME: Record<string, string> = Object.fromEntries(ARTEN.map((a) => [a.key, a.label]));

function lokal(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function morgenUm(stunde: number, plusTage: number): string {
  const d = new Date(); d.setDate(d.getDate() + plusTage); d.setHours(stunde, 0, 0, 0);
  return lokal(d.getTime());
}

export default function MietListe({ k, flotte, ku, firma, akzent, hinweis }: { k: string; flotte: MietFahrzeugOeffentlich[]; ku: boolean; firma: string | null; akzent: string; hinweis: string }) {
  const [wahl, setWahl] = useState<string | null>(null);
  const [f, setF] = useState<Form>(() => ({ von: '', bis: '', name: '', email: '', telefon: '', nachricht: '', datenschutz: false, firma_hp: '' }));
  const [stand, setStand] = useState<'offen' | 'gesendet'>('offen');
  const [nr, setNr] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fz = flotte.find((x) => x.id === wahl) ?? null;
  const vor = useMemo(() => (fz && f.von && f.bis ? vorschau(fz, new Date(f.von).toISOString(), new Date(f.bis).toISOString(), ku) : null), [fz, f.von, f.bis, ku]);

  async function senden() {
    if (!fz) return;
    setFehler(null);
    if (!f.name.trim()) { setFehler('Bitte geben Sie Ihren Namen an.'); return; }
    if (!f.email.trim() && !f.telefon.trim()) { setFehler('Bitte geben Sie eine E-Mail-Adresse oder Telefonnummer an.'); return; }
    if (!f.datenschutz) { setFehler('Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/oeffentlich/miet-anfrage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, von: f.von ? new Date(f.von).toISOString() : '', bis: f.bis ? new Date(f.bis).toISOString() : '', k, fahrzeugId: fz.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFehler((j as { error?: string }).error || 'Senden fehlgeschlagen. Bitte versuchen Sie es später erneut.'); return; }
      setNr((j as { nr?: string }).nr ?? null);
      setStand('gesendet');
    } catch { setFehler('Keine Verbindung. Bitte versuchen Sie es erneut.'); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="bx-raster">
        {flotte.map((x) => (
          <div key={x.id} style={{ background: '#fff', border: `1px solid ${wahl === x.id ? akzent : '#E2E7EE'}`, borderRadius: 14, padding: 16, display: 'grid', gap: 8, alignContent: 'start' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{x.bezeichnung}</div>
              <div style={s.klein}>{ART_NAME[x.art] ?? x.art}</div>
            </div>
            <table style={{ borderCollapse: 'collapse', fontSize: 13.5 }}>
              <tbody>
                {konditionen(x, ku).map((z) => (
                  <tr key={z.label}><td style={{ color: '#5B6676', padding: '3px 10px 3px 0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{z.label}</td><td style={{ padding: '3px 0', fontWeight: z.label === 'Tag' ? 800 : 500 }}>{z.wert}</td></tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={() => { setWahl(x.id); setStand('offen'); setFehler(null); if (!f.von || !f.bis) setF({ ...f, von: morgenUm(9, 1), bis: morgenUm(9, 2) }); }}
              style={{ ...s.senden, background: akzent, color: textAuf(akzent), justifySelf: 'start', padding: '9px 14px', fontSize: 14 }}>Unverbindlich anfragen</button>
          </div>
        ))}
      </div>

      {fz && stand === 'gesendet' && (
        <div style={s.ok} role="status">
          <b>Vielen Dank, Ihre Anfrage{nr ? ` ${nr}` : ''} ist eingegangen.</b>
          <p style={{ margin: '6px 0 0' }}>Sie ist unverbindlich und noch keine Buchung. {firma ?? 'Wir'} {firma ? 'meldet sich' : 'melden uns'} so schnell wie möglich bei Ihnen.</p>
        </div>
      )}

      {fz && stand === 'offen' && (
        <div style={{ background: '#fff', border: '1px solid #E2E7EE', borderRadius: 14, padding: 16, display: 'grid', gap: 10, maxWidth: 640 }} id="anfrage">
          <div style={{ fontWeight: 800, fontSize: 17 }}>Anfrage: {fz.bezeichnung}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <label style={s.lab}>Abholung *<input style={s.inp} type="datetime-local" value={f.von} onChange={(e) => setF({ ...f, von: e.target.value })} /></label>
            <label style={s.lab}>Rückgabe *<input style={s.inp} type="datetime-local" value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} /></label>
          </div>
          {vor && (
            <div style={s.klein}>
              {vor.tage} Miettag{vor.tage === 1 ? '' : 'e'} · Mietpreis <b style={{ color: '#111827' }}>{euroText(vor.endpreis_cent)}</b>
              {vor.frei_km === null ? ' · km frei' : ` · ${vor.frei_km.toLocaleString('de-DE')} km frei`}
              {' '}— Vorschau ohne Mehrkilometer, Tank und Zusatzfahrer{fz.kaution_cent > 0 ? `, zzgl. Kaution ${euroText(fz.kaution_cent)}` : ''}. Online bis {MAX_TAGE_ANFRAGE} Tage.
            </div>
          )}
          <label style={s.lab}>Name *<input style={s.inp} autoComplete="name" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label style={s.lab}>E-Mail<input style={s.inp} type="email" autoComplete="email" maxLength={160} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label style={s.lab}>Telefon<input style={s.inp} type="tel" autoComplete="tel" maxLength={40} value={f.telefon} onChange={(e) => setF({ ...f, telefon: e.target.value })} /></label>
          <div style={s.klein}>E-Mail oder Telefon genügt.</div>
          <label style={s.lab}>Ihre Nachricht
            <textarea style={{ ...s.inp, minHeight: 80, resize: 'vertical' }} maxLength={1000} value={f.nachricht} onChange={(e) => setF({ ...f, nachricht: e.target.value })} />
          </label>
          {/* Spam-Falle: für Menschen unsichtbar */}
          <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.firma_hp} onChange={(e) => setF({ ...f, firma_hp: e.target.value })} style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
          <label style={s.haken}>
            <input type="checkbox" checked={f.datenschutz} onChange={(e) => setF({ ...f, datenschutz: e.target.checked })} style={{ marginTop: 3 }} />
            <span>Ich bin einverstanden, dass {firma ?? 'der Vermieter'} meine Angaben zur Beantwortung dieser Anfrage speichert und mich dazu kontaktiert. *</span>
          </label>
          <details style={s.klein}>
            <summary style={{ cursor: 'pointer' }}>Hinweise zum Datenschutz</summary>
            <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>{hinweis}</p>
          </details>
          <div style={s.klein}>Ihre Anfrage ist unverbindlich und keine Buchung. Online wird nichts bezahlt. Es gelten die Mietbedingungen des Vermieters.</div>
          {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
          <button type="button" disabled={busy} onClick={() => void senden()}
            style={{ ...s.senden, background: akzent, color: textAuf(akzent), opacity: busy ? 0.6 : 1 }}>{busy ? 'Wird gesendet …' : 'Unverbindlich anfragen'}</button>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  lab: { display: 'grid', gap: 4, fontSize: 13, color: '#5B6676' },
  inp: { border: '1px solid #D5DCE5', borderRadius: 8, padding: '10px 12px', fontSize: 15, color: '#111827', background: '#fff', minWidth: 0, fontFamily: 'inherit' },
  klein: { fontSize: 12.5, color: '#5B6676' },
  haken: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45, color: '#111827' },
  fehler: { background: '#FDECEC', border: '1px solid #E06666', borderRadius: 8, padding: '8px 12px', fontSize: 14 },
  ok: { background: '#E9F7EF', border: '1px solid #4CAF7D', borderRadius: 10, padding: '12px 14px', fontSize: 14, maxWidth: 640 },
  senden: { border: 0, borderRadius: 10, padding: '12px 18px', fontWeight: 800, cursor: 'pointer', fontSize: 15 },
};
