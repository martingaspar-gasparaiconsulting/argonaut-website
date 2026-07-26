'use client';

// ============================================================
// ARGONAUT OS · Aktivitäts-Timeline (je Kunde)
// Lückenlose Chronik aus vorhandenen Daten: Angebote, Rechnungen, Termine,
// Signaturen. Kein neues SQL — liest die bestehenden Tabellen zusammen.
// Perfekt für GoBD-Nachvollziehbarkeit und den schnellen Überblick.
// Pfad: app/dashboard/aktivitaet/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C', lila: '#A98CE0',
};

type Kontakt = { id: string; name: string; email: string | null };
type Ereignis = { datum: string; icon: string; titel: string; detail: string; farbe: string; href: string };

function eur(n: number | null | undefined) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function dtag(iso: string | null) { if (!iso) return ''; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }
function kontaktName(k: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return s(k.anzeigename) || [s(k.vorname), s(k.nachname)].filter(Boolean).join(' ') || s(k.name) || s(k.firmenname) || s(k.email) || 'Kontakt';
}

export default function AktivitaetPage() {
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [aktiv, setAktiv] = useState<Kontakt | null>(null);
  const [ereignisse, setEreignisse] = useState<Ereignis[]>([]);
  const [laden, setLaden] = useState(true);
  const [ladenT, setLadenT] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      try {
        const { data: k } = await supabase.from('kontakte').select('*');
        setKontakte(((k as Record<string, unknown>[]) || []).map((x) => ({ id: String(x.id), name: kontaktName(x), email: (typeof x.email === 'string' ? x.email : null) })).sort((a, b) => a.name.localeCompare(b.name)));
      } catch { setFehler('Kontakte konnten nicht geladen werden.'); }
      setLaden(false);
    })();
  }, []);

  const oeffnen = useCallback(async (k: Kontakt) => {
    setAktiv(k); setLadenT(true); setEreignisse([]);
    const ev: Ereignis[] = [];
    const versuch = async (fn: () => Promise<void>) => { try { await fn(); } catch { /* Tabelle evtl. nicht vorhanden -> überspringen */ } };

    await versuch(async () => {
      const { data } = await supabase.from('angebote').select('angebotsnummer, titel, brutto_summe, status, erstellt_am').eq('kontakt_id', k.id);
      (data as Record<string, unknown>[] || []).forEach((a) => ev.push({ datum: String(a.erstellt_am || '').slice(0, 10), icon: '📝', titel: `Angebot ${a.angebotsnummer || a.titel || ''}`, detail: `${eur(Number(a.brutto_summe))} · ${a.status || ''}`, farbe: C.cyan, href: '/dashboard/angebote' }));
    });
    await versuch(async () => {
      const { data } = await supabase.from('rechnungen').select('rechnungsnummer, brutto_summe, rechnungsdatum, zahlungsstatus, bezahlt_am').eq('kontakt_id', k.id);
      (data as Record<string, unknown>[] || []).forEach((r) => {
        ev.push({ datum: String(r.rechnungsdatum || '').slice(0, 10), icon: '🧾', titel: `Rechnung ${r.rechnungsnummer || ''}`, detail: `${eur(Number(r.brutto_summe))} · ${r.zahlungsstatus || ''}`, farbe: C.gold, href: '/dashboard/rechnungen' });
        if (r.bezahlt_am) ev.push({ datum: String(r.bezahlt_am).slice(0, 10), icon: '✅', titel: `Zahlung eingegangen`, detail: `Rechnung ${r.rechnungsnummer || ''} · ${eur(Number(r.brutto_summe))}`, farbe: C.green, href: '/dashboard/rechnungen' });
      });
    });
    await versuch(async () => {
      const { data } = await supabase.from('signatur_anfragen').select('titel, status, created_at, signiert_am').eq('kontakt_id', k.id);
      (data as Record<string, unknown>[] || []).forEach((s) => {
        ev.push({ datum: String(s.created_at || '').slice(0, 10), icon: '✍️', titel: `Signatur angefragt: ${s.titel || ''}`, detail: String(s.status || ''), farbe: C.lila, href: '/dashboard/signaturen' });
        if (s.signiert_am) ev.push({ datum: String(s.signiert_am).slice(0, 10), icon: '🖊', titel: `Signiert: ${s.titel || ''}`, detail: 'rechtsverbindlich unterschrieben', farbe: C.green, href: '/dashboard/signaturen' });
      });
    });
    if (k.email) await versuch(async () => {
      const { data } = await supabase.from('termine').select('titel, start, datum, kunde_email').ilike('kunde_email', k.email as string);
      (data as Record<string, unknown>[] || []).forEach((t) => ev.push({ datum: String(t.start || t.datum || '').slice(0, 10), icon: '📅', titel: `Termin: ${t.titel || ''}`, detail: '', farbe: C.warn, href: '/dashboard/termine' }));
    });

    ev.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
    setEreignisse(ev);
    setLadenT(false);
  }, []);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🕒 Aktivitäts-Timeline</h1>
      <p style={styles.sub}>Die lückenlose Chronik je Kunde — Angebote, Rechnungen, Zahlungen, Signaturen und Termine, chronologisch an einem Ort.</p>
      {fehler && <div style={styles.err}>{fehler}</div>}

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <div style={styles.split}>
          <div style={styles.liste}>
            {kontakte.map((k) => (
              <button key={k.id} style={{ ...styles.lvItem, ...(aktiv?.id === k.id ? styles.lvAktiv : {}) }} onClick={() => oeffnen(k)}>
                <div style={{ fontWeight: 700 }}>{k.name}</div>
                <div style={{ color: C.textDim, fontSize: 13 }}>{k.email || '—'}</div>
              </button>
            ))}
            {!kontakte.length && <p style={styles.dim}>Keine Kontakte.</p>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!aktiv ? <p style={styles.dim}>Links einen Kunden wählen.</p> : ladenT ? <p style={styles.dim}>Sammle die Chronik …</p> : (
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>{aktiv.name}</div>
                {ereignisse.length === 0 ? <p style={styles.dim}>Noch keine Vorgänge für diesen Kunden.</p> : (
                  <div style={{ position: 'relative', paddingLeft: 22 }}>
                    <div style={styles.linie} />
                    {ereignisse.map((e, i) => (
                      <a key={i} href={e.href} style={styles.ev}>
                        <span style={{ ...styles.punkt, background: e.farbe, boxShadow: `0 0 8px ${e.farbe}66` }} />
                        <span style={{ minWidth: 82, color: C.textDim, fontSize: 13 }}>{dtag(e.datum) || '—'}</span>
                        <span style={{ fontSize: 18 }}>{e.icon}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 600 }}>{e.titel}</span>
                          {e.detail && <span style={{ color: C.textDim }}> · {e.detail}</span>}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 780 },
  split: { display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) 1fr', gap: 16, marginTop: 16, alignItems: 'start' },
  liste: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '75vh', overflowY: 'auto' },
  lvItem: { textAlign: 'left', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 14px', cursor: 'pointer', color: C.text, fontFamily: 'inherit' },
  lvAktiv: { borderColor: C.gold },
  linie: { position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: C.border },
  ev: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', position: 'relative', textDecoration: 'none', color: C.text, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 8, fontSize: 14 },
  punkt: { position: 'absolute', left: -21, width: 10, height: 10, borderRadius: '50%' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
