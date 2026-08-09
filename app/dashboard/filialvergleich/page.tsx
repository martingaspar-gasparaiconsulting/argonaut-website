'use client';

// ============================================================
// ARGONAUT OS · G4 · Filialvergleich (Chef, rein lesend)
// Echte Umsatz-/Betriebs-KPIs je Standort aus den nach standort_id getaggten
// Vorgängen: Umsatz (Rechnungen), offene Posten, Kasse, Aufträge, Team vor Ort
// (Heimat-Mitarbeiter + aktuell hierher Entsandte — Personal-Entsendung fließt
// hier als Arbeitszeit-Zurechnung ein), Leitung, abgeschaltete Module.
// Fail-open: Vorgänge OHNE standort_id (zentrale/Alt-Daten) werden keiner
// einzelnen Filiale zugerechnet und separat als „zentral/ohne Filiale" gezeigt.
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
type Ma = { id: string; vorname: string | null; nachname: string | null; leitungsrolle: string | null; standort_id: string | null };
type Ent = { mitarbeiter_id: string | null; ziel_standort_id: string | null; von_datum: string | null; bis_datum: string | null };
type Rechnung = { standort_id: string | null; brutto_summe: number | null; bezahlter_betrag: number | null; zahlungsstatus: string | null };
type KasseBeleg = { standort_id: string | null; brutto_summe: number | null; storniert: boolean | null };
type MitStandort = { standort_id: string | null };

type Zeile = {
  standort: Standort;
  umsatz: number; offen: number; kasse: number; auftraege: number;
  team: number; heimat: number; gaeste: number;
  leitungen: { name: string; rolle: string }[];
  moduleAus: number;
};

const num = (v: number | null | undefined) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
function heuteISO(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function maName(m: Ma) { return `${m.vorname ?? ''} ${m.nachname ?? ''}`.trim() || 'Mitarbeiter'; }

export default function FilialvergleichPage() {
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [ohneFiliale, setOhneFiliale] = useState<{ umsatz: number; kasse: number; auftraege: number }>({ umsatz: 0, kasse: 0, auftraege: 0 });
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [rSt, rMa, rEnt, rRe, rKa, rAu, rMod] = await Promise.all([
      supabase.from('standorte').select('id, name, ist_hauptsitz, aktiv').order('ist_hauptsitz', { ascending: false }).order('name', { ascending: true }),
      supabase.from('mitarbeiter').select('id, vorname, nachname, leitungsrolle, standort_id'),
      supabase.from('personal_entsendung').select('mitarbeiter_id, ziel_standort_id, von_datum, bis_datum'),
      supabase.from('rechnungen').select('standort_id, brutto_summe, bezahlter_betrag, zahlungsstatus'),
      supabase.from('kassen_belege').select('standort_id, brutto_summe, storniert'),
      supabase.from('auftraege').select('standort_id'),
      supabase.from('standort_module').select('standort_id, aktiv'),
    ]);
    if (rSt.error) { setFehler('Daten konnten nicht geladen werden.'); return; }

    const standorte = (rSt.data as Standort[]) ?? [];
    const mitarbeiter = (rMa.data as Ma[]) ?? [];
    const heute = heuteISO();

    // Aktive Entsendungen (Zeitraum enthält heute)
    const entAktiv = ((rEnt.data as Ent[]) ?? []).filter((e) => e.von_datum && e.von_datum <= heute && (!e.bis_datum || e.bis_datum >= heute));
    const entsandtWeg = new Set(entAktiv.map((e) => e.mitarbeiter_id).filter((x): x is string => !!x));
    const gaesteJeStandort: Record<string, number> = {};
    entAktiv.forEach((e) => { if (e.ziel_standort_id) gaesteJeStandort[e.ziel_standort_id] = (gaesteJeStandort[e.ziel_standort_id] ?? 0) + 1; });

    // Umsatz (Rechnungen) je Standort — storniert ausgenommen
    const umsatzJe: Record<string, number> = {}; const offenJe: Record<string, number> = {};
    let umsatzOhne = 0;
    ((rRe.data as Rechnung[]) ?? []).forEach((r) => {
      if (r.zahlungsstatus === 'storniert') return;
      const brutto = num(r.brutto_summe);
      const off = Math.max(brutto - num(r.bezahlter_betrag), 0);
      if (r.standort_id) {
        umsatzJe[r.standort_id] = (umsatzJe[r.standort_id] ?? 0) + brutto;
        if (r.zahlungsstatus !== 'bezahlt') offenJe[r.standort_id] = (offenJe[r.standort_id] ?? 0) + off;
      } else { umsatzOhne += brutto; }
    });

    // Kasse je Standort — storniert ausgenommen
    const kasseJe: Record<string, number> = {}; let kasseOhne = 0;
    ((rKa.data as KasseBeleg[]) ?? []).forEach((k) => {
      if (k.storniert) return;
      const brutto = num(k.brutto_summe);
      if (k.standort_id) kasseJe[k.standort_id] = (kasseJe[k.standort_id] ?? 0) + brutto;
      else kasseOhne += brutto;
    });

    // Aufträge je Standort (Anzahl)
    const aufJe: Record<string, number> = {}; let aufOhne = 0;
    ((rAu.data as MitStandort[]) ?? []).forEach((a) => {
      if (a.standort_id) aufJe[a.standort_id] = (aufJe[a.standort_id] ?? 0) + 1; else aufOhne += 1;
    });

    // Abgeschaltete Module je Standort
    const ausJe: Record<string, number> = {};
    ((rMod.data as { standort_id: string; aktiv: boolean }[]) ?? []).forEach((z) => { if (z.aktiv === false) ausJe[z.standort_id] = (ausJe[z.standort_id] ?? 0) + 1; });

    setOhneFiliale({ umsatz: umsatzOhne, kasse: kasseOhne, auftraege: aufOhne });

    setZeilen(standorte.map((s) => {
      const heimatMa = mitarbeiter.filter((m) => m.standort_id === s.id);
      const heimatDa = heimatMa.filter((m) => !entsandtWeg.has(m.id)).length;
      const gaeste = gaesteJeStandort[s.id] ?? 0;
      const leitungen = heimatMa.filter((m) => !!m.leitungsrolle).map((m) => ({ name: maName(m), rolle: m.leitungsrolle as string }));
      return {
        standort: s,
        umsatz: umsatzJe[s.id] ?? 0, offen: offenJe[s.id] ?? 0, kasse: kasseJe[s.id] ?? 0, auftraege: aufJe[s.id] ?? 0,
        team: heimatDa + gaeste, heimat: heimatDa, gaeste,
        leitungen, moduleAus: ausJe[s.id] ?? 0,
      };
    }));
  }, []);

  useEffect(() => { (async () => { await load(); setLaden(false); })(); }, [load]);

  const gesUmsatz = zeilen.reduce((a, z) => a + z.umsatz, 0);
  const gesKasse = zeilen.reduce((a, z) => a + z.kasse, 0);
  const gesOffen = zeilen.reduce((a, z) => a + z.offen, 0);
  const gesTeam = zeilen.reduce((a, z) => a + z.team, 0);
  const bester = zeilen.reduce<Zeile | null>((b, z) => (!b || (z.umsatz + z.kasse) > (b.umsatz + b.kasse) ? z : b), null);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>📊 Filialvergleich</h1>
      <p style={styles.sub}>Umsatz und Betrieb je Filiale auf einen Blick — aus den nach Standort erfassten Vorgängen.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}

      {!laden && zeilen.length === 0 ? (
        <div style={styles.warnBox}>⚠️ Noch keine Standorte angelegt. Lege sie unter <b>🏢 Standorte &amp; Filialen</b> an.</div>
      ) : laden ? <p style={styles.dim}>Lädt …</p> : (
        <>
          <div style={styles.kpiGrid}>
            <Kpi label="Umsatz (Rechnungen)" value={eur(gesUmsatz)} accent={C.gold} />
            <Kpi label="Kassen-Umsatz" value={eur(gesKasse)} accent={C.green} />
            <Kpi label="Offene Posten" value={eur(gesOffen)} accent={gesOffen > 0 ? C.warn : C.textDim} />
            <Kpi label="Team vor Ort" value={String(gesTeam)} accent={C.cyan} />
          </div>

          {bester && (gesUmsatz + gesKasse) > 0 && (
            <div style={styles.leadBox}>🏆 Stärkste Filiale nach Umsatz: <b style={{ color: C.gold }}>{bester.standort.name}</b> ({eur(bester.umsatz + bester.kasse)})</div>
          )}

          <div style={styles.card}>
            <div style={styles.kopf}>
              <div style={{ flex: 2, minWidth: 150 }}>Standort</div>
              <div style={styles.zahlSpalte}>Umsatz</div>
              <div style={styles.zahlSpalte}>Offen</div>
              <div style={styles.zahlSpalte}>Kasse</div>
              <div style={styles.zahlSpalte}>Aufträge</div>
              <div style={styles.zahlSpalte}>Team</div>
              <div style={styles.zahlSpalte}>Mod. aus</div>
            </div>
            {zeilen.map((z) => (
              <div key={z.standort.id} style={{ ...styles.zeile, opacity: z.standort.aktiv ? 1 : 0.55 }}>
                <div style={{ flex: 2, minWidth: 150 }}>
                  <div style={styles.nameZeile}>
                    <span style={{ fontWeight: 700 }}>{z.standort.name}</span>
                    {z.standort.ist_hauptsitz && <span style={styles.badgeGold}>Hauptsitz</span>}
                    {!z.standort.aktiv && <span style={styles.badgeGrau}>inaktiv</span>}
                  </div>
                  {z.leitungen.length > 0 && (
                    <div style={styles.chipWrap}>
                      {z.leitungen.map((l, i) => <span key={i} style={styles.chip} title={l.name}>{l.rolle}: {l.name}</span>)}
                    </div>
                  )}
                </div>
                <div style={{ ...styles.zahlSpalte, ...styles.zahlWert }}>{eur(z.umsatz)}</div>
                <div style={{ ...styles.zahlSpalte, ...styles.zahlWert, color: z.offen > 0 ? C.warn : C.textDim }}>{eur(z.offen)}</div>
                <div style={{ ...styles.zahlSpalte, ...styles.zahlWert, color: C.green }}>{eur(z.kasse)}</div>
                <div style={{ ...styles.zahlSpalte, ...styles.zahlWert }}>{z.auftraege}</div>
                <div style={{ ...styles.zahlSpalte, ...styles.zahlWert }} title={`${z.heimat} vor Ort${z.gaeste ? ` + ${z.gaeste} zu Gast` : ''}`}>
                  {z.team}{z.gaeste > 0 && <span style={styles.gastPlus}> +{z.gaeste}</span>}
                </div>
                <div style={{ ...styles.zahlSpalte, ...styles.zahlWert, color: z.moduleAus ? C.warn : C.textDim, fontSize: 18 }}>{z.moduleAus}</div>
              </div>
            ))}
          </div>

          {(ohneFiliale.umsatz > 0 || ohneFiliale.kasse > 0 || ohneFiliale.auftraege > 0) && (
            <div style={styles.hinweis}>
              ℹ️ Ohne Filiale zugeordnet (zentral / Alt-Daten, keiner Filiale zugerechnet): Umsatz {eur(ohneFiliale.umsatz)} · Kasse {eur(ohneFiliale.kasse)} · Aufträge {ohneFiliale.auftraege}.
            </div>
          )}
          <div style={styles.hinweis}>
            ℹ️ „Team" = Mitarbeiter mit Heimat-Filiale hier, plus aktuell hierher <b>Entsandte</b> (zu Gast), minus die von hier Entsandten — so zählt die Arbeitszeit der Filiale, in der jemand gerade arbeitet. „Umsatz" = fakturierte Rechnungen (ohne stornierte); „Offen" = noch nicht bezahlt.
          </div>
        </>
      )}
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
  page: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 680 },

  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 16 },
  kpiBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' },
  kpiLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  kpiValue: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800 },

  leadBox: { marginTop: 12, fontSize: 14, color: C.text, background: 'rgba(201,168,76,0.08)', border: `1px solid rgba(201,168,76,0.3)`, borderRadius: 10, padding: '10px 14px' },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, overflowX: 'auto' },
  kopf: { display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, paddingBottom: 6, borderBottom: `1px solid ${C.border}`, minWidth: 720 },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${C.border}`, paddingBottom: 8, minWidth: 720 },
  zahlSpalte: { flex: 1, minWidth: 78, textAlign: 'right' as const },
  zahlWert: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 15, fontWeight: 800 },
  nameZeile: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  gastPlus: { color: C.cyan, fontSize: 12, fontWeight: 700 },

  chipWrap: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  chip: { display: 'inline-block', background: `${C.cyan}14`, color: C.text, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  badgeGold: { background: `${C.gold}22`, color: C.gold, border: `1px solid ${C.gold}66`, borderRadius: 8, padding: '3px 9px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  badgeGrau: { background: 'rgba(143,163,190,0.14)', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '3px 9px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },

  warnBox: { marginTop: 12, fontSize: 14, color: C.warn, background: 'rgba(224,162,76,0.08)', border: '1px solid rgba(224,162,76,0.3)', borderRadius: 10, padding: '12px 14px', lineHeight: 1.5 },
  hinweis: { marginTop: 12, fontSize: 13, color: C.textDim, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.6 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
