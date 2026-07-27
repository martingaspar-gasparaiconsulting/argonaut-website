'use client';

// ============================================================
// ARGONAUT OS · Onboarding C · Glied 1 · Nutzer & Tarif (Kunden-Seite)
// Der CHEF legt selbst fest, welcher Sitz-Typ jeder Mitarbeiter ist
// (Voll- / Standard- / Self-Service-Nutzer). Reiser-Prinzip: Selbstbedienung.
// Der Tarif-Rechner (Glied 2) und die Auto-Rechnung (Glied 3) docken hier an.
// Pfad: app/dashboard/nutzer-tarif/page.tsx
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

type Typ = 'voll' | 'standard' | 'self_service';
type Ma = { id: string; vorname: string | null; nachname: string | null; email: string | null; nutzer_typ: Typ; auth_user_id: string | null };

const TYPEN: { key: Typ; label: string; hinweis: string }[] = [
  { key: 'voll', label: 'Voll-Nutzer', hinweis: 'Voller Zugriff auf alle freigegebenen Module' },
  { key: 'standard', label: 'Standard-Nutzer', hinweis: 'Operativer Alltag ohne sensible Bereiche' },
  { key: 'self_service', label: 'Self-Service', hinweis: 'Nur Mein Bereich & Stempeluhr' },
];
function typLabel(t: Typ) { return TYPEN.find((x) => x.key === t)?.label ?? t; }

function name(m: Ma) {
  const n = `${m.vorname ?? ''} ${m.nachname ?? ''}`.trim();
  return n || m.email || 'Mitarbeiter';
}

export default function NutzerTarifPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [liste, setListe] = useState<Ma[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState<string | null>(null);

  const ladeListe = useCallback(async () => {
    const { data, error } = await supabase
      .from('mitarbeiter')
      .select('id, vorname, nachname, email, nutzer_typ, auth_user_id')
      .order('nachname', { ascending: true });
    if (error) { setFehler('Mitarbeiter konnten nicht geladen werden.'); return; }
    setListe((data as Ma[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeListe(); setLaden(false);
    })();
  }, [ladeListe]);

  async function typSetzen(m: Ma, neu: Typ) {
    setOk(null); setFehler(null); setSpeichert(m.id);
    // optimistisch
    setListe((l) => l.map((x) => (x.id === m.id ? { ...x, nutzer_typ: neu } : x)));
    const { error } = await supabase.from('mitarbeiter').update({ nutzer_typ: neu }).eq('id', m.id);
    if (error) {
      setFehler('Konnte nicht gespeichert werden.');
      await ladeListe(); // zurücksetzen
    } else {
      setOk(`${name(m)} → ${typLabel(neu)} gespeichert.`);
    }
    setSpeichert(null);
  }

  // Zählung inkl. Chef (+1 Voll-Nutzer, hat immer vollen Zugriff).
  const zVoll = liste.filter((m) => m.nutzer_typ === 'voll').length + 1;
  const zStandard = liste.filter((m) => m.nutzer_typ === 'standard').length;
  const zSelf = liste.filter((m) => m.nutzer_typ === 'self_service').length;
  const gesamt = zVoll + zStandard + zSelf;

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>👥 Nutzer &amp; Tarif</h1>
      <p style={styles.sub}>
        Legen Sie fest, welchen Sitz-Typ jeder Mitarbeiter hat. Sie behalten jederzeit die volle Kontrolle —
        Änderungen greifen sofort. (Die Tarif-Berechnung folgt im nächsten Schritt.)
      </p>

      {!laden && (
        <div style={styles.kpiGrid}>
          <Kpi label="Nutzer gesamt" value={String(gesamt)} accent={C.cyan} />
          <Kpi label="Voll-Nutzer" value={String(zVoll)} accent={C.gold} />
          <Kpi label="Standard-Nutzer" value={String(zStandard)} accent={C.text} />
          <Kpi label="Self-Service" value={String(zSelf)} accent={C.green} />
        </div>
      )}

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Ihre Mitarbeiter</div>
        <div style={styles.chefZeile}>
          <div>
            <div style={{ fontWeight: 700 }}>Sie (Inhaber)</div>
            <div style={{ fontSize: 13, color: C.textDim }}>immer Voll-Nutzer</div>
          </div>
          <span style={styles.chefBadge}>Voll-Nutzer</span>
        </div>

        {laden ? <p style={styles.dim}>Lädt …</p> : liste.length === 0 ? (
          <p style={styles.dim}>Noch keine Mitarbeiter angelegt. Legen Sie diese unter „Rechte" bzw. „Personal" an.</p>
        ) : liste.map((m) => (
          <div key={m.id} style={styles.zeile}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name(m)}</div>
              <div style={{ fontSize: 13, color: C.textDim }}>
                {m.email || '—'}{!m.auth_user_id ? ' · noch kein Login' : ''}
              </div>
            </div>
            <select
              style={{ ...styles.select, opacity: speichert === m.id ? 0.5 : 1 }}
              value={m.nutzer_typ}
              disabled={speichert === m.id}
              onChange={(e) => typSetzen(m, e.target.value as Typ)}
              title={TYPEN.find((t) => t.key === m.nutzer_typ)?.hinweis}
            >
              {TYPEN.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div style={styles.hinweis}>
        ℹ️ <b>Voll-Nutzer</b> = voller Zugriff · <b>Standard-Nutzer</b> = operativer Alltag ·
        <b> Self-Service</b> = nur Mein Bereich &amp; Stempeluhr. Welche Module jeder konkret sieht,
        stellen Sie weiterhin unter „Rechte" ein — hier geht es nur um den Sitz-Typ für Ihren Tarif.
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={styles.kpiBox}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{ ...styles.kpiValue, color: accent || C.text }}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 640 },

  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 },
  kpiBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' },
  kpiLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  kpiValue: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 30, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  chefZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: C.navy, border: `1px solid ${C.gold}55`, borderRadius: 10, padding: '10px 14px' },
  chefBadge: { background: `${C.gold}22`, color: C.gold, border: `1px solid ${C.gold}66`, borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' },
  zeile: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, paddingBottom: 8 },
  select: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', flexShrink: 0 },
  hinweis: { marginTop: 14, fontSize: 13, color: C.textDim, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.6 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
