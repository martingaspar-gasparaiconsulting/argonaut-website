'use client';

// ============================================================
// ARGONAUT OS · Compliance-Center
//  · Sofortmeldung (Schwarzarbeit): neue Beschäftigte vor Arbeitsbeginn melden.
//  · §48b Freistellungsbescheinigung: eigene + Subunternehmer, gegen 15 %
//    Bauabzugsteuer-Einbehalt. ARGONAUT bereitet vor & erinnert.
// Pfad: app/dashboard/compliance/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Sofort = { id: string; mitarbeiter_name: string; sv_nummer: string | null; geburtsdatum: string | null; betriebsnummer: string | null; beschaeftigung_ab: string | null; gemeldet: boolean; gemeldet_am: string | null; notiz: string | null };
type Frei = { id: string; art: string; inhaber: string | null; finanzamt: string | null; sicherheitsnummer: string | null; gueltig_von: string | null; gueltig_bis: string | null; notiz: string | null };

function heute() { return new Date().toISOString().slice(0, 10); }
function inTagen(iso: string | null) { if (!iso) return null; return Math.ceil((new Date(iso.slice(0, 10) + 'T00:00:00').getTime() - new Date(heute() + 'T00:00:00').getTime()) / 86400000); }
function d(iso: string | null) { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso; }

export default function CompliancePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [sofort, setSofort] = useState<Sofort[]>([]);
  const [frei, setFrei] = useState<Frei[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [sf, setSf] = useState({ mitarbeiter_name: '', sv_nummer: '', geburtsdatum: '', betriebsnummer: '', beschaeftigung_ab: heute(), notiz: '' });
  const [ff, setFf] = useState({ art: 'eigen', inhaber: '', finanzamt: '', sicherheitsnummer: '', gueltig_von: '', gueltig_bis: '', notiz: '' });

  const laden_ = useCallback(async () => {
    setLaden(true);
    try {
      const { data: s } = await supabase.from('sofortmeldungen').select('*').order('beschaeftigung_ab', { ascending: true });
      setSofort((s as Sofort[]) ?? []);
      const { data: f } = await supabase.from('freistellungen').select('*').order('gueltig_bis', { ascending: true });
      setFrei((f as Frei[]) ?? []);
    } catch (e: unknown) { setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await laden_();
    })();
  }, [laden_]);

  // --- Sofortmeldung ---
  async function sofortAnlegen() {
    if (!uid || !sf.mitarbeiter_name.trim()) { setFehler('Bitte einen Namen angeben.'); return; }
    setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('sofortmeldungen').insert({
        owner_user_id: uid, mitarbeiter_name: sf.mitarbeiter_name.trim(), sv_nummer: sf.sv_nummer.trim() || null,
        geburtsdatum: sf.geburtsdatum || null, betriebsnummer: sf.betriebsnummer.trim() || null,
        beschaeftigung_ab: sf.beschaeftigung_ab || null, notiz: sf.notiz.trim() || null,
      });
      if (error) throw error;
      setSf({ mitarbeiter_name: '', sv_nummer: '', geburtsdatum: '', betriebsnummer: '', beschaeftigung_ab: heute(), notiz: '' });
      setOk('Sofortmeldung erfasst. Jetzt über sv.net oder deine systemgeprüfte Software melden.'); await laden_();
    } catch (e: unknown) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
  }
  async function sofortGemeldet(s: Sofort) {
    try { await supabase.from('sofortmeldungen').update({ gemeldet: !s.gemeldet, gemeldet_am: !s.gemeldet ? heute() : null, updated_at: new Date().toISOString() }).eq('id', s.id); await laden_(); } catch { /* ignore */ }
  }
  async function sofortLoeschen(s: Sofort) {
    if (typeof window !== 'undefined' && !window.confirm('Eintrag löschen?')) return;
    try { await supabase.from('sofortmeldungen').delete().eq('id', s.id); await laden_(); } catch { /* ignore */ }
  }
  async function meldedatenKopieren(s: Sofort) {
    const txt = `SOFORTMELDUNG\nName: ${s.mitarbeiter_name}\nSV-Nummer: ${s.sv_nummer || '—'}\nGeburtsdatum: ${d(s.geburtsdatum)}\nBetriebsnummer: ${s.betriebsnummer || '—'}\nBeschäftigt ab: ${d(s.beschaeftigung_ab)}`;
    try { await navigator.clipboard.writeText(txt); setOk('Meldedaten kopiert — in sv.net einfügen.'); setTimeout(() => setOk(null), 2500); } catch { setFehler('Kopieren nicht möglich.'); }
  }

  // --- Freistellung §48b ---
  async function freiAnlegen() {
    if (!uid || !ff.inhaber.trim()) { setFehler('Bitte den Inhaber/das Unternehmen angeben.'); return; }
    setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('freistellungen').insert({
        owner_user_id: uid, art: ff.art, inhaber: ff.inhaber.trim() || null, finanzamt: ff.finanzamt.trim() || null,
        sicherheitsnummer: ff.sicherheitsnummer.trim() || null, gueltig_von: ff.gueltig_von || null, gueltig_bis: ff.gueltig_bis || null, notiz: ff.notiz.trim() || null,
      });
      if (error) throw error;
      setFf({ art: 'eigen', inhaber: '', finanzamt: '', sicherheitsnummer: '', gueltig_von: '', gueltig_bis: '', notiz: '' });
      setOk('Freistellungsbescheinigung gespeichert.'); await laden_();
    } catch (e: unknown) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
  }
  async function freiLoeschen(f: Frei) {
    if (typeof window !== 'undefined' && !window.confirm('Bescheinigung löschen?')) return;
    try { await supabase.from('freistellungen').delete().eq('id', f.id); await laden_(); } catch { /* ignore */ }
  }
  function freiAmpel(f: Frei): { txt: string; farbe: string } {
    const t = inTagen(f.gueltig_bis);
    if (t === null) return { txt: 'kein Ablaufdatum', farbe: C.textDim };
    if (t < 0) return { txt: `abgelaufen seit ${-t} T`, farbe: C.danger };
    if (t <= 30) return { txt: `läuft in ${t} T ab`, farbe: C.warn };
    return { txt: `gültig bis ${d(f.gueltig_bis)}`, farbe: C.green };
  }

  const inp = styles.inp;
  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>⚖️ Compliance-Center</h1>
      <p style={styles.sub}>Zwei Pflichten mit echten Folgen: die Sofortmeldung neuer Beschäftigter und die §48b-Freistellungsbescheinigung. ARGONAUT bereitet alles vor und erinnert dich rechtzeitig.</p>
      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {/* ---------- Sofortmeldung ---------- */}
      <div style={styles.card}>
        <div style={styles.cardTitel}>🧑‍🏭 Sofortmeldung (gegen Schwarzarbeit)</div>
        <div style={styles.info}>
          In bestimmten Branchen (u. a. Bau, Gaststätten, Fleisch- &amp; <b>Forstwirtschaft</b>, Gebäudereinigung, Spedition/Logistik) müssen neue Beschäftigte
          <b> spätestens bei Beschäftigungsaufnahme</b> an die Rentenversicherung gemeldet werden. Erfasse die Daten hier, dann melde über
          <b> sv.net</b> oder deine systemgeprüfte Lohnsoftware — ARGONAUT erinnert dich, solange eine Meldung offen ist.
        </div>
        <div style={styles.grid}>
          <label style={styles.lab}>Name *<input style={inp} value={sf.mitarbeiter_name} onChange={(e) => setSf((x) => ({ ...x, mitarbeiter_name: e.target.value }))} /></label>
          <label style={styles.lab}>SV-Nummer<input style={inp} value={sf.sv_nummer} onChange={(e) => setSf((x) => ({ ...x, sv_nummer: e.target.value }))} placeholder="Versicherungsnummer" /></label>
          <label style={styles.lab}>Geburtsdatum<input type="date" style={inp} value={sf.geburtsdatum} onChange={(e) => setSf((x) => ({ ...x, geburtsdatum: e.target.value }))} /></label>
          <label style={styles.lab}>Betriebsnummer<input style={inp} value={sf.betriebsnummer} onChange={(e) => setSf((x) => ({ ...x, betriebsnummer: e.target.value }))} /></label>
          <label style={styles.lab}>Beschäftigt ab<input type="date" style={inp} value={sf.beschaeftigung_ab} onChange={(e) => setSf((x) => ({ ...x, beschaeftigung_ab: e.target.value }))} /></label>
        </div>
        <button style={{ ...styles.primaer, marginTop: 10 }} onClick={sofortAnlegen}>＋ Erfassen</button>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sofort.map((s) => {
            const t = inTagen(s.beschaeftigung_ab);
            const kritisch = !s.gemeldet && t !== null && t <= 0;
            const bald = !s.gemeldet && t !== null && t > 0 && t <= 3;
            return (
              <div key={s.id} style={{ ...styles.zeile, borderColor: kritisch ? C.danger : (s.gemeldet ? 'rgba(76,175,125,0.4)' : C.border) }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{s.mitarbeiter_name} <span style={{ color: C.textDim, fontWeight: 400, fontSize: 13 }}>· ab {d(s.beschaeftigung_ab)}</span></div>
                  <div style={{ color: C.textDim, fontSize: 12.5 }}>SV {s.sv_nummer || '—'} · Betrieb {s.betriebsnummer || '—'}</div>
                </div>
                {s.gemeldet ? <span style={{ ...styles.badge, color: C.green, borderColor: C.green }}>✓ gemeldet {d(s.gemeldet_am)}</span>
                  : kritisch ? <span style={{ ...styles.badge, color: C.danger, borderColor: C.danger }}>▲ sofort melden</span>
                    : bald ? <span style={{ ...styles.badge, color: C.warn, borderColor: C.warn }}>in {t} T</span>
                      : <span style={{ ...styles.badge, color: C.textDim, borderColor: C.border }}>offen</span>}
                <button style={styles.mini} onClick={() => meldedatenKopieren(s)}>📋 Meldedaten</button>
                <button style={styles.mini} onClick={() => sofortGemeldet(s)}>{s.gemeldet ? 'Zurücksetzen' : 'Als gemeldet'}</button>
                <button style={{ ...styles.mini, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={() => sofortLoeschen(s)}>🗑</button>
              </div>
            );
          })}
          {!sofort.length && <p style={styles.dim}>Noch keine Meldungen erfasst.</p>}
        </div>
      </div>

      {/* ---------- §48b Freistellung ---------- */}
      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={styles.cardTitel}>🏗 §48b Freistellungsbescheinigung (Bauabzugsteuer)</div>
        <div style={styles.info}>
          Bei Bauleistungen muss der Auftraggeber <b>15 % Bauabzugsteuer einbehalten</b> — es sei denn, es liegt eine gültige Freistellungsbescheinigung
          nach §48b EStG vor. Hinterlege deine <b>eigene</b> (die du Kunden vorlegst) und die deiner <b>Subunternehmer</b> (damit du nicht einbehalten musst).
          ARGONAUT warnt, wenn eine abläuft.
        </div>
        <div style={styles.grid}>
          <label style={styles.lab}>Art
            <select style={inp} value={ff.art} onChange={(e) => setFf((x) => ({ ...x, art: e.target.value }))}>
              <option value="eigen">Eigene (für meine Kunden)</option>
              <option value="partner">Subunternehmer</option>
            </select>
          </label>
          <label style={styles.lab}>Inhaber / Unternehmen *<input style={inp} value={ff.inhaber} onChange={(e) => setFf((x) => ({ ...x, inhaber: e.target.value }))} /></label>
          <label style={styles.lab}>Finanzamt<input style={inp} value={ff.finanzamt} onChange={(e) => setFf((x) => ({ ...x, finanzamt: e.target.value }))} /></label>
          <label style={styles.lab}>Sicherheitsnummer<input style={inp} value={ff.sicherheitsnummer} onChange={(e) => setFf((x) => ({ ...x, sicherheitsnummer: e.target.value }))} /></label>
          <label style={styles.lab}>Gültig von<input type="date" style={inp} value={ff.gueltig_von} onChange={(e) => setFf((x) => ({ ...x, gueltig_von: e.target.value }))} /></label>
          <label style={styles.lab}>Gültig bis<input type="date" style={inp} value={ff.gueltig_bis} onChange={(e) => setFf((x) => ({ ...x, gueltig_bis: e.target.value }))} /></label>
        </div>
        <button style={{ ...styles.primaer, marginTop: 10 }} onClick={freiAnlegen}>＋ Bescheinigung speichern</button>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {frei.map((f) => {
            const a = freiAmpel(f);
            return (
              <div key={f.id} style={{ ...styles.zeile, borderColor: a.farbe === C.danger ? C.danger : C.border }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{f.inhaber || '—'} <span style={{ ...styles.tag, color: f.art === 'eigen' ? C.gold : C.cyan, borderColor: f.art === 'eigen' ? C.gold : C.cyan }}>{f.art === 'eigen' ? 'eigen' : 'Subunternehmer'}</span></div>
                  <div style={{ color: C.textDim, fontSize: 12.5 }}>{f.finanzamt || '—'}{f.sicherheitsnummer ? ` · Sich.-Nr. ${f.sicherheitsnummer}` : ''}</div>
                </div>
                <span style={{ ...styles.badge, color: a.farbe, borderColor: a.farbe }}>{a.txt}</span>
                <button style={{ ...styles.mini, color: C.danger, borderColor: 'rgba(224,102,102,0.4)' }} onClick={() => freiLoeschen(f)}>🗑</button>
              </div>
            );
          })}
          {!frei.length && <p style={styles.dim}>Noch keine Bescheinigungen hinterlegt.</p>}
        </div>
      </div>

      <div style={styles.disclaimer}>
        Hinweis: ARGONAUT unterstützt bei Erfassung, Übersicht und Erinnerung. Die eigentliche Sofortmeldung erfolgt über sv.net / systemgeprüfte
        Lohnsoftware; die §48b-Prüfung/Ausstellung läuft über das Finanzamt. Keine Rechts- oder Steuerberatung — im Zweifel Steuerberater/Fachanwalt fragen.
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 800 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginTop: 16 },
  cardTitel: { fontWeight: 800, fontSize: 17 },
  info: { background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.22)', borderRadius: 12, padding: '12px 15px', color: C.textDim, fontSize: 13, lineHeight: 1.55, margin: '10px 0 14px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: C.navy, border: '1px solid', borderRadius: 10, padding: '11px 14px', fontSize: 14 },
  badge: { border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' },
  tag: { border: '1px solid', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700, marginLeft: 6 },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 6 },
  disclaimer: { marginTop: 18, padding: '13px 16px', background: 'rgba(143,163,190,0.06)', border: `1px solid ${C.border}`, borderRadius: 12, color: C.textDim, fontSize: 12, lineHeight: 1.6 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
