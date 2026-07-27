'use client';

// ============================================================
// ARGONAUT OS · Baustein 1 · Block B · Wiederkehr-Cockpit
// Zieht die vier Wiederkehr-Quellen (Wartung, Abo-Rechnungen, Mitglieder,
// eigene Vertraege) zusammen und zeigt MRR, Ausgaben/Monat und Faelligkeiten
// auf einen Blick — plus eine sortierte Gesamtliste mit Herkunft & Direktlink.
// Reine Kennzahlen kommen aus lib/wiederkehr (0 EUR, getestet).
// Pfad: app/dashboard/wiederkehr/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  normalisiereWartung,
  normalisiereAbo,
  normalisiereMitglied,
  normalisiereVertrag,
  mrr,
  ausgabenProMonat,
  zaehleFaelligkeiten,
  faelligBucket,
  type WiederkehrEintrag,
  type FaelligBucket,
} from '@/lib/wiederkehr';
import { augeWiederkehr } from '@/lib/auge';
import KiAuge from '../_components/KiAuge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666', lila: '#A98CE0',
};

const QUELLE_META: Record<WiederkehrEintrag['quelle'], { icon: string; label: string; href: string; farbe: string }> = {
  wartung:  { icon: '🔧', label: 'Wartung',        href: '/dashboard/wartung',        farbe: C.cyan },
  abo:      { icon: '🔁', label: 'Abo-Rechnung',   href: '/dashboard/abo-rechnungen', farbe: C.gold },
  mitglied: { icon: '👥', label: 'Mitglied / Abo', href: '/dashboard/mitglieder',     farbe: C.green },
  vertrag:  { icon: '📑', label: 'Vertrag',        href: '/dashboard/vertraege',      farbe: C.warn },
};

const BUCKET_META: Record<FaelligBucket, { label: string; farbe: string }> = {
  faellig: { label: 'jetzt fällig', farbe: C.danger },
  bald:    { label: 'bald fällig',  farbe: C.warn },
  ok:      { label: 'im Plan',      farbe: C.green },
  kein:    { label: '—',            farbe: C.textDim },
};

const BUCKET_RANG: Record<FaelligBucket, number> = { faellig: 0, bald: 1, ok: 2, kein: 3 };

function eur(n: number | null): string {
  return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function datumHuebsch(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function heuteLokal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WiederkehrCockpit() {
  const [uid, setUid] = useState<string | null>(null);
  const [eintraege, setEintraege] = useState<WiederkehrEintrag[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [quelleFilter, setQuelleFilter] = useState<string>('');
  const heute = heuteLokal();

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      // Vier Quellen parallel. RLS entscheidet, welche Zeilen sichtbar sind.
      const [w, a, m, v] = await Promise.all([
        supabase.from('wartungsvertraege').select('*').eq('archiviert', false),
        supabase.from('abo_rechnungen').select('*'),
        supabase.from('mitglieder').select('*'),
        supabase.from('vertraege').select('*'),
      ]);
      const alle: WiederkehrEintrag[] = [
        ...((w.data as Record<string, unknown>[]) ?? []).map(normalisiereWartung),
        ...((a.data as Record<string, unknown>[]) ?? []).map(normalisiereAbo),
        ...((m.data as Record<string, unknown>[]) ?? []).map(normalisiereMitglied),
        ...((v.data as Record<string, unknown>[]) ?? []).map(normalisiereVertrag),
      ];
      setEintraege(alle);
    } catch (e: unknown) {
      setFehler('Wiederkehr-Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
      setEintraege([]);
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

  // --- Kennzahlen (aus lib/wiederkehr) ---
  const kMrr = useMemo(() => mrr(eintraege), [eintraege]);
  const kAusgaben = useMemo(() => ausgabenProMonat(eintraege), [eintraege]);
  const kFaellig = useMemo(() => zaehleFaelligkeiten(eintraege, heute), [eintraege, heute]);
  const aktiveEinnahmen = useMemo(
    () => eintraege.filter((e) => e.aktiv && e.richtung === 'einnahme').length,
    [eintraege]
  );

  // --- Liste: gefiltert + sortiert (dringendste zuerst, dann groesster Monatswert) ---
  const liste = useMemo(() => {
    const gefiltert = quelleFilter ? eintraege.filter((e) => e.quelle === quelleFilter) : eintraege;
    return [...gefiltert].sort((a, b) => {
      const ra = BUCKET_RANG[faelligBucket(a, heute)];
      const rb = BUCKET_RANG[faelligBucket(b, heute)];
      if (ra !== rb) return ra - rb;
      return b.monatswert - a.monatswert;
    });
  }, [eintraege, quelleFilter, heute]);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Wiederkehr</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>🔁 Wiederkehr-Cockpit</h1>
          <p style={styles.sub}>
            Alles Wiederkehrende an einem Ort: Wartungsverträge, Abo-Rechnungen, Mitglieder-Beiträge und laufende
            eigene Verträge — mit monatlich wiederkehrendem Umsatz (MRR) und Fälligkeiten auf einen Blick.
          </p>
        </div>
        <button onClick={() => void laden_()} style={styles.ghostBtn}>↻ Aktualisieren</button>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* KPI-Kacheln */}
      <div style={styles.kpiGrid}>
        <Kpi label="Umsatz / Monat (MRR, netto)" value={eur(kMrr)} accent={C.gold} gross />
        <Kpi label="Jetzt fällig" value={String(kFaellig.faellig)} accent={kFaellig.faellig > 0 ? C.danger : C.green} />
        <Kpi label="Bald fällig (≤ 14 T.)" value={String(kFaellig.bald)} accent={kFaellig.bald > 0 ? C.warn : C.green} />
        <Kpi label="Aktive Einnahmequellen" value={String(aktiveEinnahmen)} accent={C.cyan} />
        <Kpi label="Ausgaben / Monat (Verträge)" value={eur(kAusgaben)} accent={C.warn} />
      </div>

      {/* Regel-Auge: sagt in Klartext, was die Wiederkehr-Lage bedeutet (0 €, ohne KI-Aufruf). */}
      {!laden && (
        <div style={{ marginTop: 18 }}>
          <KiAuge
            modul="Wiederkehr"
            regel={augeWiederkehr({ mrr: kMrr, faellig: kFaellig.faellig, bald: kFaellig.bald, ausgaben: kAusgaben, aktiveEinnahmen })}
          />
        </div>
      )}

      {/* Filter nach Quelle */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '18px 0 14px' }}>
        <FilterChip aktiv={quelleFilter === ''} onClick={() => setQuelleFilter('')} label={`Alle (${eintraege.length})`} farbe={C.text} />
        {(Object.keys(QUELLE_META) as WiederkehrEintrag['quelle'][]).map((q) => {
          const anzahl = eintraege.filter((e) => e.quelle === q).length;
          const meta = QUELLE_META[q];
          return (
            <FilterChip key={q} aktiv={quelleFilter === q} onClick={() => setQuelleFilter(q)} label={`${meta.icon} ${meta.label} (${anzahl})`} farbe={meta.farbe} />
          );
        })}
      </div>

      {/* Gesamtliste */}
      <div style={styles.card}>
        {laden ? (
          <div style={styles.hint}>Lädt …</div>
        ) : liste.length === 0 ? (
          <div style={styles.hint}>
            Noch nichts Wiederkehrendes erfasst. Lege Wartungsverträge, Abo-Rechnungen, Mitglieder oder Verträge an —
            sie erscheinen dann automatisch hier.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Quelle</th>
                  <th style={styles.th}>Bezeichnung</th>
                  <th style={styles.th}>Partner</th>
                  <th style={styles.th}>Turnus</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Betrag netto</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>≈ / Monat</th>
                  <th style={styles.th}>Nächste Fälligkeit</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((e) => {
                  const meta = QUELLE_META[e.quelle];
                  const bucket = faelligBucket(e, heute);
                  const bm = BUCKET_META[bucket];
                  const turnus = e.intervallMonate === 0 ? 'einmalig' : e.intervallMonate === 1 ? 'monatlich' : `alle ${e.intervallMonate} Mon.`;
                  return (
                    <tr key={`${e.quelle}-${e.id}`} style={{ opacity: e.aktiv ? 1 : 0.5 }}>
                      <td style={styles.td}>
                        <a href={meta.href} style={{ ...styles.quelleBadge, color: meta.farbe, borderColor: `${meta.farbe}66` }}>
                          {meta.icon} {meta.label}
                        </a>
                      </td>
                      <td style={styles.td}>
                        <span style={{ fontWeight: 600 }}>{e.titel}</span>
                        {e.richtung === 'ausgabe' && <span style={styles.ausgabeTag}>Ausgabe</span>}
                        {!e.aktiv && <span style={styles.inaktivTag}>inaktiv</span>}
                      </td>
                      <td style={{ ...styles.td, color: C.textDim }}>{e.partner || '—'}</td>
                      <td style={{ ...styles.td, color: C.textDim }}>{turnus}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{eur(e.betragNetto)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: e.richtung === 'ausgabe' ? C.warn : C.gold, fontWeight: 700 }}>
                        {e.monatswert > 0 ? eur(e.monatswert) : '—'}
                      </td>
                      <td style={styles.td}>
                        {e.naechsteFaelligkeit ? (
                          <>
                            <div>{datumHuebsch(e.naechsteFaelligkeit)}</div>
                            <div style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', color: bm.farbe, fontWeight: 600 }}>{bm.label}</div>
                          </>
                        ) : (
                          <span style={{ color: C.textDim }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={styles.rechtHinweis}>
        „≈ / Monat" rechnet jeden Turnus auf einen Monatswert herunter (Jahres-/Quartalsbeträge geteilt) — so ist der MRR über
        alle Quellen vergleichbar. Einmalige Verträge zählen nicht als wiederkehrend.
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, gross }: { label: string; value: string; accent?: string; gross?: boolean }) {
  return (
    <div style={styles.kpiBox}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{ ...styles.kpiValue, color: accent || C.text, fontSize: gross ? 'clamp(26px, 2.3vw, 37px)' : 'clamp(24px, 2.13vw, 34px)' }}>{value}</div>
    </div>
  );
}

function FilterChip({ aktiv, onClick, label, farbe }: { aktiv: boolean; onClick: () => void; label: string; farbe: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: aktiv ? `${farbe}22` : 'transparent',
        color: aktiv ? farbe : C.textDim,
        border: `1px solid ${aktiv ? farbe : C.border}`,
        borderRadius: 999, padding: '6px 14px', fontSize: 'clamp(12.5px, 1.06vw, 17px)',
        fontWeight: aktiv ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 22px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 760, lineHeight: 1.5 },

  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },

  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  kpiBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  kpiLabel: { fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  kpiValue: { fontFamily: 'var(--font-dm-sans), sans-serif', fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 820 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '11px 10px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'top' },
  quelleBadge: { display: 'inline-block', fontSize: 'clamp(11.5px, 1vw, 16px)', fontWeight: 700, border: '1px solid', borderRadius: 999, padding: '3px 10px', textDecoration: 'none', whiteSpace: 'nowrap' },
  ausgabeTag: { marginLeft: 8, fontSize: 'clamp(10.5px, 0.9vw, 14px)', color: C.warn, border: `1px solid ${C.warn}55`, borderRadius: 6, padding: '1px 6px' },
  inaktivTag: { marginLeft: 8, fontSize: 'clamp(10.5px, 0.9vw, 14px)', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 6, padding: '1px 6px' },

  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '14px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '16px 0' },
  rechtHinweis: { marginTop: 16, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, lineHeight: 1.5, maxWidth: 760 },
};
