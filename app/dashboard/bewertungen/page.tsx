'use client';

// ============================================================
// ARGONAUT OS · Bündel 7 · Bewertungsmanagement (Chef-Ansicht)
// Kunden per E-Mail um eine Bewertung bitten, Ergebnisse sammeln, freigeben.
// Öffentliche Abgabe läuft über /bewerten/<token>. Pfad: app/dashboard/bewertungen/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Anfrage = {
  id: string; kunde_name: string | null; kunde_email: string | null; token: string;
  status: string; sterne: number | null; text: string | null; veroeffentlicht: boolean;
  erstellt_am: string; abgegeben_am: string | null;
};

function datumHuebsch(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function sterneText(n: number | null): string { return '★'.repeat(Math.max(0, n ?? 0)) + '☆'.repeat(Math.max(0, 5 - (n ?? 0))); }

export default function BewertungenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [firma, setFirma] = useState('');
  const [liste, setListe] = useState<Anfrage[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [kopiert, setKopiert] = useState<string | null>(null);

  const linkBasis = typeof window !== 'undefined' ? window.location.origin : 'https://www.argonaut-os.com';

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', id).maybeSingle();
      setFirma((p?.firma_name as string) || '');
    })();
  }, []);

  const laden_ = useCallback(async () => {
    if (!uid) return;
    setLaden(true); setFehler(null);
    try {
      const { data, error } = await supabase.from('bewertungsanfragen').select('*').order('erstellt_am', { ascending: false });
      if (error) throw error;
      setListe((data as Anfrage[]) ?? []);
    } catch (e: unknown) {
      setFehler('Bewertungen konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid]);

  useEffect(() => { void laden_(); }, [laden_]);

  async function einladen() {
    if (!uid) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setFehler('Bitte eine gültige E-Mail angeben.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const token = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.round(Math.random() * 1e9);
      const { error } = await supabase.from('bewertungsanfragen').insert({
        owner_user_id: uid, kunde_name: name.trim() || null, kunde_email: email.trim(),
        token, status: 'offen', quelle: 'manuell',
      });
      if (error) throw error;
      const link = `${linkBasis}/bewerten/${token}`;
      const res = await fetch('/api/bewertung-senden', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ an: email.trim(), kundeName: name.trim(), betrieb: firma, link }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { setOk('Anfrage angelegt — Mail-Versand meldete: ' + (j?.error || 'Fehler') + '. Link kannst du manuell teilen.'); }
      else setOk('Einladung an ' + email.trim() + ' gesendet.');
      setName(''); setEmail('');
      await laden_();
    } catch (e: unknown) {
      setFehler('Einladen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); }
  }

  async function veroeffentlichen(a: Anfrage, wert: boolean) {
    try {
      const { error } = await supabase.from('bewertungsanfragen').update({ veroeffentlicht: wert }).eq('id', a.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) {
      setFehler('Konnte nicht speichern: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }
  async function loeschen(a: Anfrage) {
    if (!window.confirm('Diese Bewertung/Anfrage löschen?')) return;
    try {
      const { error } = await supabase.from('bewertungsanfragen').delete().eq('id', a.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) {
      setFehler('Löschen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }
  function kopiere(token: string) {
    const link = `${linkBasis}/bewerten/${token}`;
    try { void navigator.clipboard.writeText(link); setKopiert(token); setTimeout(() => setKopiert(null), 1600); } catch { /* ignore */ }
  }

  const offene = useMemo(() => liste.filter((a) => a.status !== 'abgegeben'), [liste]);
  const abgegebene = useMemo(() => liste.filter((a) => a.status === 'abgegeben'), [liste]);
  const schnitt = useMemo(() => {
    const mitStern = abgegebene.filter((a) => (a.sterne ?? 0) > 0);
    if (!mitStern.length) return null;
    return (mitStern.reduce((s, a) => s + (a.sterne ?? 0), 0) / mitStern.length);
  }, [abgegebene]);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Vertrieb</div>
      <h1 style={styles.h1}>Bewertungen</h1>
      <p style={styles.sub}>Bitte zufriedene Kunden per E-Mail um eine Bewertung, sammle die Rückmeldungen und gib die besten frei.</p>

      {/* Kennzahlen */}
      <div style={styles.summenGrid}>
        <SummeKarte label="Ø Sterne" value={schnitt != null ? schnitt.toFixed(1) : '—'} accent={C.gold} />
        <SummeKarte label="Abgegeben" value={String(abgegebene.length)} accent={C.green} />
        <SummeKarte label="Offen" value={String(offene.length)} accent={offene.length > 0 ? C.warn : C.green} />
        <SummeKarte label="Veröffentlicht" value={String(abgegebene.filter((a) => a.veroeffentlicht).length)} accent={C.cyan} />
      </div>

      {/* Einladen */}
      <div style={styles.card}>
        <h2 style={styles.cardTitel}>Kunde um Bewertung bitten</h2>
        {fehler && <div style={styles.err}>{fehler}</div>}
        {ok && <div style={styles.ok}>{ok}</div>}
        <div style={styles.formGrid}>
          <div><label style={styles.lbl}>Name (optional)</label><input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label style={styles.lbl}>E-Mail *</label><input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kunde@example.com" /></div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button onClick={einladen} disabled={busy} style={{ ...styles.primaer, opacity: busy ? 0.6 : 1 }}>{busy ? 'Sendet …' : '✉️ Einladung senden'}</button>
        </div>
      </div>

      {/* Abgegebene Bewertungen */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <h2 style={styles.cardTitel}>Abgegebene Bewertungen</h2>
        {laden ? <div style={styles.hint}>Lädt …</div> : abgegebene.length === 0 ? (
          <div style={styles.hint}>Noch keine Bewertungen. Lade oben deinen ersten Kunden ein.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {abgegebene.map((a) => (
              <div key={a.id} style={styles.bewBox}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ color: C.gold, fontSize: 'clamp(16px, 1.5vw, 22px)', letterSpacing: 2 }}>{sterneText(a.sterne)}</div>
                  <div style={{ color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)' }}>{a.kunde_name || 'Kunde'} · {datumHuebsch(a.abgegeben_am)}</div>
                </div>
                {a.text && <div style={{ marginTop: 8, lineHeight: 1.5, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>„{a.text}"</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={() => veroeffentlichen(a, !a.veroeffentlicht)}
                    style={a.veroeffentlicht ? styles.miniBtnAktiv : styles.miniBtn}>
                    {a.veroeffentlicht ? '✓ Veröffentlicht' : 'Veröffentlichen'}
                  </button>
                  <button onClick={() => loeschen(a)} style={styles.miniBtnGhost}>Löschen</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Offene Anfragen */}
      {offene.length > 0 && (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <h2 style={styles.cardTitel}>Warten auf Antwort ({offene.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {offene.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{a.kunde_name || a.kunde_email || 'Kunde'}</div>
                  <div style={{ color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)' }}>eingeladen {datumHuebsch(a.erstellt_am)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => kopiere(a.token)} style={styles.miniBtnGhost}>{kopiert === a.token ? '✓ Link kopiert' : 'Link kopieren'}</button>
                  <button onClick={() => loeschen(a)} style={styles.miniBtnGhost}>Löschen</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummeKarte({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={styles.summeBox}>
      <div style={styles.summeLabel}>{label}</div>
      <div style={{ ...styles.summeValue, color: accent || C.text }}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 20px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 680, lineHeight: 1.5 },
  summenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 18 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  summeLabel: { fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(24px, 2.13vw, 34px)', fontWeight: 800 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(17px, 1.5vw, 24px)', fontWeight: 700, margin: '0 0 14px', color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  lbl: { display: 'block', fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit' },
  primaer: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  bewBox: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  miniBtn: { background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 'clamp(13px, 1.13vw, 18px)', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtnAktiv: { background: 'rgba(76,175,125,0.15)', color: C.green, border: `1px solid ${C.green}`, borderRadius: 8, padding: '6px 12px', fontSize: 'clamp(13px, 1.13vw, 18px)', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 'clamp(13px, 1.13vw, 18px)', fontFamily: 'inherit', cursor: 'pointer' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '14px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 },
};
