'use client';

// ============================================================
// ARGONAUT OS · HR Self-Service — /dashboard/mein-bereich
// Was der eingeladene MITARBEITER sieht (nur sich selbst):
// Stammdaten · Resturlaub · Urlaub beantragen · Krankmeldung+AU · Schulungen
// Zugriff strikt per RLS-Self-Policies abgesichert.
// Pfad: app/dashboard/mein-bereich/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties, ChangeEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const BUCKET = 'hr-dokumente';

const C = {
  navy: '#0A1628', navySoft: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  cardBg: 'rgba(255,255,255,0.03)', inputBg: 'rgba(255,255,255,0.05)', danger: '#E06666', warn: '#E0A24C',
};

type Mitarbeiter = {
  id: string; owner_user_id: string; vorname: string; nachname: string;
  email: string | null; telefon: string | null; position: string | null;
  status: string; eintrittsdatum: string | null; urlaubsanspruch_tage: number | null;
};
type Abwesenheit = { id: string; typ: string; von: string; bis: string; tage: number | null; status: string; au_vorhanden: boolean };
type Schulung = { id: string; titel: string; kategorie: string; gueltig_bis: string | null; status: string };

const STATUS_LABEL: Record<string, string> = {
  beantragt: 'Beantragt', genehmigt: 'Genehmigt', abgelehnt: 'Abgelehnt', erfasst: 'Erfasst',
  offen: 'Offen', absolviert: 'Absolviert',
};
const KAT_LABEL: Record<string, string> = {
  arbeitsschutz: 'Arbeitsschutz', mutterschutz: 'Mutterschutz', brandschutz: 'Brandschutz',
  datenschutz: 'Datenschutz', erste_hilfe: 'Erste Hilfe', sonstiges: 'Sonstiges',
};
function statusColor(s: string): string {
  if (s === 'genehmigt' || s === 'absolviert') return C.green;
  if (s === 'abgelehnt') return C.danger;
  return C.gold;
}
function dStr(d: string | null): string { if (!d) return '—'; try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; } }
function tageZwischen(von: string, bis: string): number {
  try { const a = new Date(von); const b = new Date(bis); const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1; return diff > 0 ? diff : 1; } catch { return 1; }
}
function tageBis(d: string | null): number | null { if (!d) return null; try { return Math.round((new Date(d).getTime() - Date.now()) / 86400000); } catch { return null; } }

export default function MeinBereichPage() {
  const [ma, setMa] = useState<Mitarbeiter | null>(null);
  const [abw, setAbw] = useState<Abwesenheit[]>([]);
  const [schul, setSchul] = useState<Schulung[]>([]);
  const [loading, setLoading] = useState(true);
  const [kontoOhneProfil, setKontoOhneProfil] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Urlaub-Form
  const [uVon, setUVon] = useState(''); const [uBis, setUBis] = useState(''); const [uSaving, setUSaving] = useState(false);
  // Krank-Form
  const [kVon, setKVon] = useState(''); const [kBis, setKBis] = useState(''); const [kSaving, setKSaving] = useState(false);
  const [auFile, setAuFile] = useState<File | null>(null);

  const ladeAlles = useCallback(async () => {
    setLoading(true); setMsg(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) { setKontoOhneProfil(true); setLoading(false); return; }

      const { data: maRow } = await supabase.from('mitarbeiter')
        .select('id,owner_user_id,vorname,nachname,email,telefon,position,status,eintrittsdatum,urlaubsanspruch_tage')
        .eq('auth_user_id', uid).maybeSingle();

      if (!maRow) { setKontoOhneProfil(true); setLoading(false); return; }
      const m = maRow as Mitarbeiter;
      setMa(m);

      const { data: abwRows } = await supabase.from('hr_abwesenheiten')
        .select('id,typ,von,bis,tage,status,au_vorhanden').eq('mitarbeiter_id', m.id).order('von', { ascending: false });
      setAbw((abwRows as Abwesenheit[]) ?? []);

      const { data: schulRows } = await supabase.from('hr_schulungen')
        .select('id,titel,kategorie,gueltig_bis,status').eq('mitarbeiter_id', m.id).order('gueltig_bis', { ascending: true });
      setSchul((schulRows as Schulung[]) ?? []);
    } catch {
      setMsg('Daten konnten nicht geladen werden.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { ladeAlles(); }, [ladeAlles]);

  async function abmelden() {
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }

  async function urlaubBeantragen() {
    if (!ma) return;
    setMsg(null);
    if (!uVon || !uBis) { setMsg('Bitte Von- und Bis-Datum angeben.'); return; }
    setUSaving(true);
    try {
      const { error } = await supabase.from('hr_abwesenheiten').insert({
        owner_user_id: ma.owner_user_id, mitarbeiter_id: ma.id, typ: 'urlaub',
        von: uVon, bis: uBis, tage: tageZwischen(uVon, uBis), status: 'beantragt',
      });
      if (error) throw error;
      setUVon(''); setUBis(''); setMsg('Urlaubsantrag eingereicht — dein Vorgesetzter prüft ihn.');
      ladeAlles();
    } catch (e: unknown) { setMsg('Antrag fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setUSaving(false); }
  }

  async function krankMelden() {
    if (!ma) return;
    setMsg(null);
    if (!kVon || !kBis) { setMsg('Bitte Von- und Bis-Datum angeben.'); return; }
    setKSaving(true);
    try {
      let auHochgeladen = false;
      // optional: AU-Datei hochladen
      if (auFile) {
        const sauber = auFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const pfad = `${ma.owner_user_id}/mitarbeiter/${ma.id}/${Date.now()}-AU-${sauber}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(pfad, auFile);
        if (upErr) throw upErr;
        await supabase.from('hr_dokumente').insert({
          owner_user_id: ma.owner_user_id, mitarbeiter_id: ma.id, dateiname: auFile.name,
          storage_pfad: pfad, groesse_bytes: auFile.size, mime_type: auFile.type || null, kategorie: 'sonstiges',
        });
        auHochgeladen = true;
      }
      const { error } = await supabase.from('hr_abwesenheiten').insert({
        owner_user_id: ma.owner_user_id, mitarbeiter_id: ma.id, typ: 'krankheit',
        von: kVon, bis: kBis, tage: tageZwischen(kVon, kBis), status: 'erfasst', au_vorhanden: auHochgeladen,
      });
      if (error) throw error;
      setKVon(''); setKBis(''); setAuFile(null);
      setMsg('Krankmeldung erfasst' + (auHochgeladen ? ' inkl. AU-Bescheinigung.' : '.'));
      ladeAlles();
    } catch (e: unknown) { setMsg('Meldung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); } finally { setKSaving(false); }
  }

  // Resturlaub
  const jahr = new Date().getFullYear();
  const anspruch = ma?.urlaubsanspruch_tage ?? 30;
  const genommen = abw.filter((r) => r.typ === 'urlaub' && r.status === 'genehmigt' && new Date(r.von).getFullYear() === jahr).reduce((s, r) => s + (r.tage ?? 0), 0);
  const rest = anspruch - genommen;
  const krankTage = abw.filter((r) => r.typ === 'krankheit' && new Date(r.von).getFullYear() === jahr).reduce((s, r) => s + (r.tage ?? 0), 0);

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontWeight: 900, letterSpacing: '0.15em', fontSize: 16 }}>ARGONAUT</span>
          <span style={{ fontSize: 10, color: C.gold, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>Mein Bereich</span>
        </div>
        <button style={styles.ghostBtn} onClick={abmelden}>Abmelden</button>
      </div>

      <div style={styles.wrap}>
        {loading && <div style={styles.stateBox}>Lädt …</div>}

        {!loading && kontoOhneProfil && (
          <div style={styles.stateBox}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 }}>Kein Mitarbeiter-Profil verknüpft</div>
            <div>Dieser Zugang ist noch keinem Mitarbeiter-Profil zugeordnet. Bitte wende dich an deinen Vorgesetzten.</div>
          </div>
        )}

        {!loading && ma && (
          <>
            <div style={{ marginBottom: 24 }}>
              <div style={styles.eyebrow}>Willkommen</div>
              <h1 style={styles.h1}>{ma.vorname} {ma.nachname}</h1>
              <p style={styles.sub}>{ma.position || 'Mitarbeiter'} · seit {dStr(ma.eintrittsdatum)}</p>
            </div>

            {msg && <div style={styles.infoMsg}>{msg}</div>}

            <div style={styles.statGrid}>
              <Stat label="Urlaubsanspruch" value={`${anspruch} Tage`} />
              <Stat label="Genommen" value={`${genommen} Tage`} />
              <Stat label="Resturlaub" value={`${rest} Tage`} accent={rest <= 5 ? C.warn : C.green} />
              <Stat label={`Krank ${jahr}`} value={`${krankTage} Tage`} />
            </div>

            <div style={styles.twoCol}>
              {/* Urlaub beantragen */}
              <section style={styles.card}>
                <h2 style={styles.cardTitle}>Urlaub beantragen</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Field label="Von"><input type="date" style={styles.input} value={uVon} onChange={(e) => setUVon(e.target.value)} /></Field>
                  <Field label="Bis"><input type="date" style={styles.input} value={uBis} onChange={(e) => setUBis(e.target.value)} /></Field>
                  <button style={{ ...styles.primaryBtn, opacity: uSaving ? 0.6 : 1 }} onClick={urlaubBeantragen} disabled={uSaving}>{uSaving ? 'Sendet …' : 'Antrag einreichen'}</button>
                </div>
              </section>

              {/* Krankmeldung */}
              <section style={styles.card}>
                <h2 style={styles.cardTitle}>Krankmeldung</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Field label="Von"><input type="date" style={styles.input} value={kVon} onChange={(e) => setKVon(e.target.value)} /></Field>
                  <Field label="Bis"><input type="date" style={styles.input} value={kBis} onChange={(e) => setKBis(e.target.value)} /></Field>
                  <Field label="AU-Bescheinigung (optional)">
                    <input type="file" style={styles.fileInput} onChange={(e: ChangeEvent<HTMLInputElement>) => setAuFile(e.target.files?.[0] ?? null)} />
                  </Field>
                  <button style={{ ...styles.primaryBtn, opacity: kSaving ? 0.6 : 1 }} onClick={krankMelden} disabled={kSaving}>{kSaving ? 'Sendet …' : 'Krankheit melden'}</button>
                </div>
              </section>
            </div>

            {/* Meine Anträge */}
            <section style={{ ...styles.card, marginTop: 18 }}>
              <h2 style={styles.cardTitle}>Meine Anträge & Meldungen</h2>
              {abw.length === 0 && <div style={styles.listHint}>Noch keine Einträge.</div>}
              {abw.map((r) => (
                <div key={r.id} style={styles.row}>
                  <div>
                    <div style={styles.rowName}>{r.typ === 'urlaub' ? 'Urlaub' : 'Krankheit'} · {dStr(r.von)}–{dStr(r.bis)}</div>
                    <div style={styles.rowMeta}>{r.tage ?? 0} Tage{r.typ === 'krankheit' ? (r.au_vorhanden ? ' · AU liegt vor' : ' · keine AU') : ''}</div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </section>

            {/* Meine Schulungen */}
            <section style={{ ...styles.card, marginTop: 18 }}>
              <h2 style={styles.cardTitle}>Meine Schulungen</h2>
              {schul.length === 0 && <div style={styles.listHint}>Keine Schulungen hinterlegt.</div>}
              {schul.map((s) => {
                const tb = tageBis(s.gueltig_bis);
                const abgelaufen = tb !== null && tb < 0;
                const bald = tb !== null && tb >= 0 && tb <= 30;
                return (
                  <div key={s.id} style={styles.row}>
                    <div>
                      <div style={styles.rowName}>{s.titel}</div>
                      <div style={styles.rowMeta}>
                        <span style={styles.katBadge}>{KAT_LABEL[s.kategorie] || s.kategorie}</span>
                        {s.gueltig_bis ? `gültig bis ${dStr(s.gueltig_bis)}` : 'ohne Ablauf'}
                        {abgelaufen && <span style={{ color: C.danger, fontWeight: 700 }}> · abgelaufen</span>}
                        {bald && <span style={{ color: C.warn, fontWeight: 700 }}> · läuft bald ab</span>}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                );
              })}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: accent ? `${accent}12` : C.cardBg, border: `1px solid ${accent ? `${accent}33` : C.line}`, borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ?? C.text }}>{value}</div>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const col = statusColor(status);
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: col, background: `${col}1A`, border: `1px solid ${col}40`, flexShrink: 0 }}>{STATUS_LABEL[status] || status}</span>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span style={{ fontSize: 12, color: C.textDim, fontWeight: 600 }}>{label}</span>{children}</label>;
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif" },
  topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 28px', borderBottom: `1px solid ${C.line}`, background: 'rgba(10,22,40,0.95)', position: 'sticky', top: 0, zIndex: 10 },
  wrap: { maxWidth: 900, margin: '0 auto', padding: '32px 28px 64px' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 700, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 0', fontSize: 15 },
  stateBox: { padding: 40, textAlign: 'center', color: C.textDim, fontSize: 15 },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 22 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 },
  card: { background: C.navySoft, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, margin: '0 0 14px', color: C.text },
  input: { background: C.inputBg, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', color: C.text, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none', width: '100%', boxSizing: 'border-box' },
  fileInput: { color: C.textDim, fontSize: 13 },
  primaryBtn: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginTop: 4 },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  infoMsg: { marginBottom: 18, color: C.text, fontSize: 14, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px' },
  listHint: { color: C.textDim, fontSize: 14, padding: '8px 0' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  rowName: { fontWeight: 600, color: C.text, fontSize: 14 },
  rowMeta: { color: C.textDim, fontSize: 12, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  katBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: C.gold, background: 'rgba(201,168,76,0.12)', border: `1px solid ${C.line}` },
};
