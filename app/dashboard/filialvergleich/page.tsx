'use client';

// ============================================================
// ARGONAUT OS · G4 · Filialvergleich (Chef, rein lesend)
// Struktur-Übersicht je Standort aus den vorhandenen Multistandort-Daten:
// zugeordnete Mitarbeiter, Leitungskräfte, abgeschaltete Module, Status.
// Umsatz-/Betriebs-KPIs je Filiale folgen, sobald die Modul-Datensätze
// selbst nach standort_id getaggt sind (spätere Schicht).
// Pfad: app/dashboard/filialvergleich/page.tsx
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

type Standort = { id: string; name: string; ist_hauptsitz: boolean; aktiv: boolean };
type Ma = { id: string; vorname: string | null; nachname: string | null; leitungsrolle: string | null };

type Zeile = {
  standort: Standort;
  mitarbeiter: number;
  leitungen: { name: string; rolle: string }[];
  moduleAus: number;
};

function maName(m: Ma) {
  return `${m.vorname ?? ''} ${m.nachname ?? ''}`.trim() || 'Mitarbeiter';
}

export default function FilialvergleichPage() {
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden_ = useCallback(async () => {
    const [rSt, rMa, rMst, rMod] = await Promise.all([
      supabase.from('standorte').select('id, name, ist_hauptsitz, aktiv').order('ist_hauptsitz', { ascending: false }).order('name', { ascending: true }),
      supabase.from('mitarbeiter').select('id, vorname, nachname, leitungsrolle'),
      supabase.from('mitarbeiter_standorte').select('mitarbeiter_id, standort_id'),
      supabase.from('standort_module').select('standort_id, aktiv'),
    ]);
    if (rSt.error || rMa.error || rMst.error || rMod.error) { setFehler('Daten konnten nicht geladen werden.'); return; }

    const standorte = (rSt.data as Standort[]) ?? [];
    const maById: Record<string, Ma> = {};
    ((rMa.data as Ma[]) ?? []).forEach((m) => { maById[m.id] = m; });

    const mstBySt: Record<string, string[]> = {};
    ((rMst.data as { mitarbeiter_id: string; standort_id: string }[]) ?? []).forEach((z) => {
      (mstBySt[z.standort_id] ??= []).push(z.mitarbeiter_id);
    });

    const ausBySt: Record<string, number> = {};
    ((rMod.data as { standort_id: string; aktiv: boolean }[]) ?? []).forEach((z) => {
      if (z.aktiv === false) ausBySt[z.standort_id] = (ausBySt[z.standort_id] ?? 0) + 1;
    });

    setZeilen(standorte.map((s) => {
      const maIds = mstBySt[s.id] ?? [];
      const leitungen = maIds
        .map((id) => maById[id])
        .filter((m): m is Ma => !!m && !!m.leitungsrolle)
        .map((m) => ({ name: maName(m), rolle: m.leitungsrolle as string }));
      return { standort: s, mitarbeiter: maIds.length, leitungen, moduleAus: ausBySt[s.id] ?? 0 };
    }));
  }, []);

  useEffect(() => { (async () => { await laden_(); setLaden(false); })(); }, [laden_]);

  const gesamtMa = zeilen.reduce((a, z) => a + z.mitarbeiter, 0);
  const gesamtLeitung = zeilen.reduce((a, z) => a + z.leitungen.length, 0);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>📊 Filialvergleich</h1>
      <p style={styles.sub}>
        Struktur-Überblick über alle Standorte auf einen Blick. Umsatz- und Betriebszahlen je Filiale
        kommen dazu, sobald die einzelnen Vorgänge nach Standort erfasst werden.
      </p>

      {fehler && <div style={styles.err}>{fehler}</div>}

      {!laden && zeilen.length === 0 ? (
        <div style={styles.warnBox}>
          ⚠️ Noch keine Standorte angelegt. Legen Sie sie unter <b>🏢 Standorte &amp; Filialen</b> an.
        </div>
      ) : (
        <>
          {!laden && (
            <div style={styles.kpiGrid}>
              <Kpi label="Standorte" value={String(zeilen.length)} accent={C.cyan} />
              <Kpi label="Mitarbeiter zugeordnet" value={String(gesamtMa)} accent={C.gold} />
              <Kpi label="Leitungskräfte" value={String(gesamtLeitung)} accent={C.green} />
            </div>
          )}

          {laden ? <p style={styles.dim}>Lädt …</p> : (
            <div style={styles.card}>
              <div style={styles.kopf}>
                <div style={{ flex: 2, minWidth: 140 }}>Standort</div>
                <div style={styles.zahlSpalte}>Mitarbeiter</div>
                <div style={styles.zahlSpalte}>Module aus</div>
                <div style={{ flex: 2, minWidth: 160 }}>Leitung</div>
              </div>
              {zeilen.map((z) => (
                <div key={z.standort.id} style={{ ...styles.zeile, opacity: z.standort.aktiv ? 1 : 0.55 }}>
                  <div style={{ flex: 2, minWidth: 140 }}>
                    <div style={styles.nameZeile}>
                      <span style={{ fontWeight: 700 }}>{z.standort.name}</span>
                      {z.standort.ist_hauptsitz && <span style={styles.badgeGold}>Hauptsitz</span>}
                      {!z.standort.aktiv && <span style={styles.badgeGrau}>inaktiv</span>}
                    </div>
                  </div>
                  <div style={{ ...styles.zahlSpalte, ...styles.zahlWert }}>{z.mitarbeiter}</div>
                  <div style={{ ...styles.zahlSpalte, ...styles.zahlWert, color: z.moduleAus ? C.warn : C.textDim }}>{z.moduleAus}</div>
                  <div style={{ flex: 2, minWidth: 160 }}>
                    {z.leitungen.length === 0 ? <span style={{ color: C.textDim, fontSize: 13 }}>—</span> : (
                      <div style={styles.chipWrap}>
                        {z.leitungen.map((l, i) => (
                          <span key={i} style={styles.chip} title={l.name}>{l.rolle}: {l.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div style={styles.hinweis}>
        ℹ️ „Module aus" = Zahl der an dieser Filiale gezielt abgeschalteten Module (aus 🧩 Filial-Module).
        „Mitarbeiter" zählt alle, die diesem Standort zugeordnet sind (Gebiets-Rollen decken mehrere ab).
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
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 660 },

  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 },
  kpiBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' },
  kpiLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  kpiValue: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 30, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  kopf: { display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, paddingBottom: 6, borderBottom: `1px solid ${C.border}` },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 8, flexWrap: 'wrap' },
  zahlSpalte: { flex: 1, minWidth: 80, textAlign: 'center' as const },
  zahlWert: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 20, fontWeight: 800 },
  nameZeile: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },

  chipWrap: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  chip: { display: 'inline-block', background: `${C.cyan}14`, color: C.text, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 999, padding: '3px 9px', fontSize: 12, fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  badgeGold: { background: `${C.gold}22`, color: C.gold, border: `1px solid ${C.gold}66`, borderRadius: 8, padding: '3px 9px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  badgeGrau: { background: 'rgba(143,163,190,0.14)', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '3px 9px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },

  warnBox: { marginTop: 12, fontSize: 14, color: C.warn, background: 'rgba(224,162,76,0.08)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '12px 14px', lineHeight: 1.5 },
  hinweis: { marginTop: 14, fontSize: 13, color: C.textDim, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.6 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
