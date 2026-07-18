'use client';

// ============================================================
// ARGONAUT OS · Bündel 6 · Öffentliche Buchungsseite (ohne Login)
// /buchen/<slug> — Kunde wählt Terminart + freien Slot und bucht selbst.
// Liest & schreibt ausschließlich über /api/oeffentlich/buchung (Service-Role,
// betriebsscharf, serverseitige Kapazitätsprüfung). Kein Supabase im Client.
// ============================================================

import { useEffect, useMemo, useState, CSSProperties } from 'react';
import { useParams } from 'next/navigation';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#c9a84c', teal: '#7aa3b3',
  text: '#EAF1F6', textDim: '#9fb3bd', border: 'rgba(122,163,179,0.18)', green: '#4CAF7D', danger: '#E06666',
};

type SlotDto = { datum: string; beginn: string; ende: string; mitarbeiter_id: string | null };
type ArtDto = { id: string; name: string | null };

function uhr(iso: string) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function tagLang(datum: string) {
  const [y, m, d] = datum.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });
}

export default function BuchenSeite() {
  const params = useParams();
  const slug = String((params?.slug as string) || '').toLowerCase();

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [betrieb, setBetrieb] = useState<string>('');
  const [arten, setArten] = useState<ArtDto[]>([]);
  const [artId, setArtId] = useState<string>('');
  const [slots, setSlots] = useState<SlotDto[]>([]);

  const [gewaehlt, setGewaehlt] = useState<SlotDto | null>(null);
  const [form, setForm] = useState({ name: '', email: '', telefon: '', notiz: '' });
  const [senden, setSenden] = useState(false);
  const [gebucht, setGebucht] = useState<SlotDto | null>(null);

  async function ladeSlots(gewaehlteArt?: string) {
    setLaden(true); setFehler(null);
    try {
      const q = new URLSearchParams({ slug, tage: '21' });
      if (gewaehlteArt) q.set('artId', gewaehlteArt);
      const res = await fetch(`/api/oeffentlich/buchung?${q.toString()}`);
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Buchungsseite nicht verfügbar.'); setLaden(false); return; }
      setBetrieb(j.betrieb || '');
      setArten(j.arten || []);
      setArtId(j.artId || (j.arten?.[0]?.id ?? ''));
      setSlots(j.slots || []);
    } catch {
      setFehler('Verbindung fehlgeschlagen. Bitte später erneut versuchen.');
    } finally { setLaden(false); }
  }

  useEffect(() => { if (slug) void ladeSlots(); /* eslint-disable-next-line */ }, [slug]);

  const proTag = useMemo(() => {
    const m = new Map<string, SlotDto[]>();
    for (const s of slots) { const a = m.get(s.datum) ?? []; a.push(s); m.set(s.datum, a); }
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [slots]);

  async function buchen() {
    if (!gewaehlt) return;
    if (!form.name.trim()) { setFehler('Bitte deinen Namen angeben.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setFehler('Bitte eine gültige E-Mail angeben.'); return; }
    setSenden(true); setFehler(null);
    try {
      const res = await fetch('/api/oeffentlich/buchung', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug, artId, beginn_am: gewaehlt.beginn, ende_am: gewaehlt.ende, mitarbeiter_id: gewaehlt.mitarbeiter_id,
          kunde_name: form.name.trim(), kunde_email: form.email.trim(), telefon: form.telefon.trim(), notiz: form.notiz.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok) { setFehler(j?.error || 'Buchung fehlgeschlagen.'); if (res.status === 409) await ladeSlots(artId); return; }
      setGebucht(gewaehlt); setGewaehlt(null);
    } catch {
      setFehler('Verbindung fehlgeschlagen. Bitte erneut versuchen.');
    } finally { setSenden(false); }
  }

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.brand}>🔱 ARGONAUT OS</div>

        {gebucht ? (
          <div style={styles.card}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <h1 style={styles.h1}>Termin gebucht!</h1>
            <p style={styles.sub}>
              {tagLang(gebucht.datum)} · {uhr(gebucht.beginn)}–{uhr(gebucht.ende)} Uhr bei {betrieb}.
            </p>
            <p style={{ ...styles.sub, marginTop: 6 }}>Eine Bestätigung ist an <b>{form.email}</b> unterwegs.</p>
            <button style={styles.ghost} onClick={() => { setGebucht(null); void ladeSlots(artId); }}>Weiteren Termin buchen</button>
          </div>
        ) : (
          <>
            <h1 style={styles.h1}>Termin buchen{betrieb ? <> bei <span style={{ color: C.gold }}>{betrieb}</span></> : ''}</h1>

            {arten.length > 1 && (
              <div style={{ margin: '14px 0 4px' }}>
                <label style={styles.lbl}>Leistung / Terminart</label>
                <select style={styles.input} value={artId} onChange={(e) => { setArtId(e.target.value); setGewaehlt(null); void ladeSlots(e.target.value); }}>
                  {arten.map((a) => <option key={a.id} value={a.id}>{a.name || 'Termin'}</option>)}
                </select>
              </div>
            )}

            {fehler && <div style={styles.err}>{fehler}</div>}

            {laden ? (
              <div style={styles.hint}>Freie Termine werden geladen …</div>
            ) : proTag.length === 0 ? (
              <div style={styles.card}><p style={styles.sub}>Aktuell sind keine freien Termine verfügbar. Bitte später erneut vorbeischauen.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 12 }}>
                {proTag.map(([datum, liste]) => (
                  <div key={datum}>
                    <div style={styles.tagTitel}>{tagLang(datum)}</div>
                    <div style={styles.slotGrid}>
                      {liste.map((s) => (
                        <button key={s.beginn + (s.mitarbeiter_id ?? '')} onClick={() => { setGewaehlt(s); setFehler(null); }}
                          style={{ ...styles.slotBtn, ...(gewaehlt?.beginn === s.beginn && (gewaehlt?.mitarbeiter_id ?? null) === (s.mitarbeiter_id ?? null) ? styles.slotAktiv : {}) }}>
                          {uhr(s.beginn)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {gewaehlt && (
              <div style={{ ...styles.card, marginTop: 20 }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>
                  Gewählt: {tagLang(gewaehlt.datum)} · {uhr(gewaehlt.beginn)}–{uhr(gewaehlt.ende)} Uhr
                </div>
                <div style={styles.formGrid}>
                  <div style={{ gridColumn: '1 / -1' }}><label style={styles.lbl}>Name *</label><input style={styles.input} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                  <div><label style={styles.lbl}>E-Mail *</label><input style={styles.input} type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
                  <div><label style={styles.lbl}>Telefon</label><input style={styles.input} value={form.telefon} onChange={(e) => setForm((f) => ({ ...f, telefon: e.target.value }))} /></div>
                  <div style={{ gridColumn: '1 / -1' }}><label style={styles.lbl}>Anmerkung</label><textarea style={{ ...styles.input, minHeight: 54, resize: 'vertical' }} value={form.notiz} onChange={(e) => setForm((f) => ({ ...f, notiz: e.target.value }))} /></div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
                  <button style={styles.ghost} onClick={() => setGewaehlt(null)} disabled={senden}>Zurück</button>
                  <button style={{ ...styles.primaer, opacity: senden ? 0.6 : 1 }} onClick={buchen} disabled={senden}>{senden ? 'Bucht …' : 'Verbindlich buchen'}</button>
                </div>
              </div>
            )}
          </>
        )}

        <div style={styles.footer}>Buchung bereitgestellt über ARGONAUT OS</div>
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100dvh', background: C.navy, color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', padding: '32px 16px 64px' },
  wrap: { maxWidth: 640, margin: '0 auto' },
  brand: { color: C.gold, letterSpacing: '0.22em', textTransform: 'uppercase', fontSize: 13, fontWeight: 700, marginBottom: 18 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 700, margin: 0, lineHeight: 1.1 },
  sub: { color: C.textDim, fontSize: 'clamp(15px, 1.4vw, 19px)', lineHeight: 1.5, margin: '8px 0 0' },
  lbl: { display: 'block', fontSize: 13, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 13px', fontSize: 16, fontFamily: 'inherit' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginTop: 14 },
  tagTitel: { fontWeight: 700, fontSize: 'clamp(15px, 1.4vw, 19px)', color: C.text, marginBottom: 8, textTransform: 'capitalize' },
  slotGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 },
  slotBtn: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 6px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  slotAktiv: { background: 'rgba(201,168,76,0.16)', borderColor: C.gold, color: C.gold },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ghost: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 18px', fontSize: 16, fontFamily: 'inherit', cursor: 'pointer', marginTop: 14 },
  hint: { color: C.textDim, fontSize: 16, padding: '20px 0' },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '12px 14px', margin: '14px 0', fontSize: 15 },
  footer: { marginTop: 40, textAlign: 'center', color: C.textDim, fontSize: 12, opacity: 0.7 },
};
