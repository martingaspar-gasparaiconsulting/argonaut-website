'use client';

// ============================================================
// ARGONAUT OS · Welle 5 · ARGONAUT-Sign — Signaturen verwalten
// Dokument zur Unterschrift anlegen -> Link teilen -> Status verfolgen ->
// signiertes PDF laden. Pfad: app/dashboard/signaturen/page.tsx
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
type Anfrage = {
  id: string; token: string; titel: string; empfaenger_name: string | null; empfaenger_email: string | null;
  status: string; signiert_am: string | null; created_at: string;
};

const STATUS: Record<string, { l: string; f: string }> = {
  entwurf: { l: 'Entwurf', f: C.textDim }, gesendet: { l: 'Gesendet', f: C.cyan },
  angesehen: { l: 'Angesehen', f: C.lila }, signiert: { l: 'Signiert', f: C.green }, abgelehnt: { l: 'Abgelehnt', f: C.danger },
};
function d(iso: string | null) { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return iso; } }
function kontaktName(k: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return s(k.anzeigename) || [s(k.vorname), s(k.nachname)].filter(Boolean).join(' ') || s(k.name) || s(k.firmenname) || s(k.email) || 'Kontakt';
}

export default function SignaturenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [liste, setListe] = useState<Anfrage[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ titel: '', kontakt_id: '', empfaenger_name: '', empfaenger_email: '', dokument: '' });
  const [letzterLink, setLetzterLink] = useState<string | null>(null);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data: aData } = await supabase.from('signatur_anfragen').select('id, token, titel, empfaenger_name, empfaenger_email, status, signiert_am, created_at').order('created_at', { ascending: false });
      setListe((aData as Anfrage[]) ?? []);
      const { data: kData } = await supabase.from('kontakte').select('*');
      setKontakte(((kData as Record<string, unknown>[]) || []).map((k) => ({ id: String(k.id), name: kontaktName(k), email: (typeof k.email === 'string' ? k.email : null) })).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_();
    })();
  }, [laden_]);

  function kontaktWahl(id: string) {
    const k = kontakte.find((x) => x.id === id);
    setForm((f) => ({ ...f, kontakt_id: id, empfaenger_name: k ? k.name : f.empfaenger_name, empfaenger_email: k?.email || f.empfaenger_email }));
  }

  function linkVon(token: string) { return (typeof window !== 'undefined' ? window.location.origin : '') + '/signieren/' + token; }

  async function anlegen() {
    if (!uid) return;
    if (!form.titel.trim()) { setFehler('Bitte einen Titel angeben.'); return; }
    if (!form.dokument.trim()) { setFehler('Bitte den Dokumenttext eingeben.'); return; }
    setBusy(true); setFehler(null); setOk(null); setLetzterLink(null);
    try {
      const token = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Math.random().toString(36).slice(2) + Date.now().toString(36));
      const { error } = await supabase.from('signatur_anfragen').insert({
        owner_user_id: uid, token, titel: form.titel.trim(), kontakt_id: form.kontakt_id || null,
        empfaenger_name: form.empfaenger_name.trim() || null, empfaenger_email: form.empfaenger_email.trim() || null,
        dokument: form.dokument, status: 'gesendet',
      });
      if (error) throw error;
      const link = linkVon(token);
      setLetzterLink(link);
      setOk('Signatur-Anfrage angelegt. Link kopieren und dem Empfänger schicken.');
      setForm({ titel: '', kontakt_id: '', empfaenger_name: '', empfaenger_email: '', dokument: '' });
      await laden_();
    } catch (e: unknown) {
      setFehler('Anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setBusy(false); }
  }

  async function kopieren(text: string) {
    try { await navigator.clipboard.writeText(text); setOk('Link kopiert.'); setTimeout(() => setOk(null), 2000); }
    catch { setFehler('Konnte nicht kopieren — Link bitte manuell markieren.'); }
  }
  async function loeschen(a: Anfrage) {
    if (typeof window !== 'undefined' && !window.confirm(`Anfrage „${a.titel}" löschen?`)) return;
    try { await supabase.from('signatur_anfragen').delete().eq('id', a.id); await laden_(); } catch { /* ignore */ }
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>✍️ ARGONAUT-Sign · Signaturen</h1>
      <p style={styles.sub}>Dokument zur Unterschrift anlegen, Link teilen, Status verfolgen und das signierte PDF mit Prüfprotokoll laden. Ohne externen Dienst — alles aus einer Hand.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}
      {letzterLink && (
        <div style={styles.linkBox}>
          <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-all', fontSize: 13 }}>{letzterLink}</span>
          <button style={styles.primaer} onClick={() => kopieren(letzterLink)}>📋 Link kopieren</button>
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.cardTitel}>➕ Neue Signatur-Anfrage</div>
        <div style={styles.grid2}>
          <label style={styles.lab}>Titel *<input style={styles.inp} value={form.titel} onChange={(e) => setForm((f) => ({ ...f, titel: e.target.value }))} placeholder="z. B. Wartungsvertrag 2026" /></label>
          <label style={styles.lab}>Kontakt (optional)
            <select style={styles.inp} value={form.kontakt_id} onChange={(e) => kontaktWahl(e.target.value)}>
              <option value="">— kein Kontakt —</option>
              {kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </label>
          <label style={styles.lab}>Empfänger-Name<input style={styles.inp} value={form.empfaenger_name} onChange={(e) => setForm((f) => ({ ...f, empfaenger_name: e.target.value }))} /></label>
          <label style={styles.lab}>Empfänger-E-Mail<input style={styles.inp} value={form.empfaenger_email} onChange={(e) => setForm((f) => ({ ...f, empfaenger_email: e.target.value }))} placeholder="für den Nachweis" /></label>
        </div>
        <label style={{ ...styles.lab, marginTop: 12 }}>Dokumenttext *
          <textarea style={{ ...styles.inp, minHeight: 160, resize: 'vertical', lineHeight: 1.6 }} value={form.dokument} onChange={(e) => setForm((f) => ({ ...f, dokument: e.target.value }))} placeholder="Der vollständige Text des Vertrags / der Vereinbarung. Zeilenumbrüche bleiben erhalten." />
        </label>
        <button style={{ ...styles.primaer, marginTop: 12, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={anlegen}>{busy ? 'Legt an …' : '✍️ Anfrage anlegen & Link erzeugen'}</button>
      </div>

      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={styles.cardTitel}>Anfragen</div>
        {laden ? <p style={styles.dim}>Lädt …</p> : liste.length === 0 ? <p style={styles.dim}>Noch keine Signatur-Anfragen.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {liste.map((a) => {
              const st = STATUS[a.status] || { l: a.status, f: C.textDim };
              return (
                <div key={a.id} style={styles.zeile}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{a.titel}</div>
                    <div style={{ color: C.textDim, fontSize: 13 }}>{a.empfaenger_name || '—'} · angelegt {d(a.created_at)}{a.signiert_am ? ` · signiert ${d(a.signiert_am)}` : ''}</div>
                  </div>
                  <span style={{ ...styles.badge, color: st.f, borderColor: st.f }}>{st.l}</span>
                  {a.status !== 'signiert' && <button style={styles.mini} onClick={() => kopieren(linkVon(a.token))}>🔗 Link</button>}
                  <a style={styles.mini} href={`/api/signatur-pdf?token=${encodeURIComponent(a.token)}`} target="_blank" rel="noreferrer">⬇ PDF</a>
                  <button style={{ ...styles.mini, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={() => loeschen(a)}>Löschen</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 780 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 14 },
  cardTitel: { fontWeight: 800, fontSize: 17 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  linkBox: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginTop: 12 },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', fontSize: 14 },
  badge: { border: '1px solid', borderRadius: 999, padding: '2px 10px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-block' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
