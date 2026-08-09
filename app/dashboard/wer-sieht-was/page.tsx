'use client';
// ============================================================
// ARGONAUT OS · Chef-Schalttisch „Wer sieht was" (Block D · #6)
// Übersicht für den Chef: welcher Mitarbeiter sieht welche Module — berechnet
// aus derselben Rechte-Logik wie Menü und proxy (gebuchte Module × Mitarbeiter-
// Rechte × Sitz-Typ). Rein lesend; geändert wird in „Rechte" und „Filial-Module".
// ============================================================
import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { sichtbareNavLinks, nurNachNutzerTyp, MODULE_NACH_GRUPPE } from '@/lib/rechte';
import { gebuchteModulKeys, type TenantModulRow } from '@/lib/tenantModule';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)', danger: '#E06666', warn: '#E0A24C',
  cardBg: 'rgba(255,255,255,0.03)', inputBg: 'rgba(255,255,255,0.05)',
};

type Ma = { id: string; vorname: string | null; nachname: string | null; nutzer_typ: string | null; standort_id: string | null; leitungsrolle: string | null };
type Standort = { id: string; name: string };

const TYP_LABEL: Record<string, string> = { voll: 'Voll', standard: 'Standard', self_service: 'Self-Service' };
const TYP_FARBE: Record<string, string> = { voll: '#4CAF7D', standard: '#00e5ff', self_service: '#8FA3BE' };

type Person = {
  ma: Ma;
  sichtbar: Set<string>;
  anzahl: number;
};

export default function WerSiehtWasPage() {
  const [personen, setPersonen] = useState<Person[]>([]);
  const [standortName, setStandortName] = useState<Record<string, string>>({});
  const [gesamtModule, setGesamtModule] = useState(0);
  const [offen, setOffen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setFehler(null);
    try {
      const [rMa, rRe, rSt, rTm] = await Promise.all([
        supabase.from('mitarbeiter').select('id, vorname, nachname, nutzer_typ, standort_id, leitungsrolle'),
        supabase.from('mitarbeiter_rechte').select('mitarbeiter_id, module'),
        supabase.from('standorte').select('id, name'),
        supabase.from('tenant_module').select('modul_key, aktiv'),
      ]);
      if (rMa.error) throw rMa.error;

      const gebucht = gebuchteModulKeys((rTm.data as TenantModulRow[] | null) ?? null);
      const rechteByMa: Record<string, string[]> = {};
      ((rRe.data as { mitarbeiter_id: string; module: string[] | null }[]) ?? []).forEach((r) => { rechteByMa[r.mitarbeiter_id] = (r.module as string[]) || []; });

      const stName: Record<string, string> = {};
      ((rSt.data as Standort[]) ?? []).forEach((s) => { stName[s.id] = s.name; });
      setStandortName(stName);

      // Gesamtzahl buchbarer Module (Nenner) — auf gebuchte eingeschränkt.
      const alleKeys = new Set<string>();
      MODULE_NACH_GRUPPE.forEach((g) => g.items.forEach((it) => { if (!gebucht || gebucht.has(it.key)) alleKeys.add(it.key); }));
      setGesamtModule(alleKeys.size);

      const liste: Person[] = ((rMa.data as Ma[]) ?? []).map((ma) => {
        let links = sichtbareNavLinks(false, new Set(rechteByMa[ma.id] ?? []), null);
        links = nurNachNutzerTyp(links, ma.nutzer_typ);
        const sichtbar = new Set<string>();
        links.forEach((l) => { if (l.modul && (!gebucht || gebucht.has(l.modul))) sichtbar.add(l.modul); });
        return { ma, sichtbar, anzahl: sichtbar.size };
      }).sort((a, b) => b.anzahl - a.anzahl);

      setPersonen(liste);
    } catch (e: unknown) {
      setFehler('Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const maName = (m: Ma) => `${m.vorname ?? ''} ${m.nachname ?? ''}`.trim() || 'Mitarbeiter';

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>ARGONAUT OS · Chef-Schalttisch</div>
          <h1 style={styles.h1}>Wer sieht was</h1>
          <p style={styles.sub}>Auf einen Blick, welcher Mitarbeiter welche Module sieht — berechnet aus gebuchten Modulen, Mitarbeiter-Rechten und Sitz-Typ. Ändern kannst du das in „Rechte" (je Mitarbeiter) und „Filial-Module" (je Filiale).</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href="/dashboard/rechte" style={styles.linkBtn}>🔑 Rechte je Mitarbeiter</a>
          <a href="/dashboard/filial-module" style={styles.linkBtnGhost}>🧩 Module je Filiale</a>
        </div>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {loading && <div style={styles.stateBox}>Lädt …</div>}
      {!loading && !fehler && personen.length === 0 && (
        <div style={styles.stateBox}>Noch keine Mitarbeitenden angelegt. Sobald du Personen einlädst und ihnen Rechte gibst, erscheinen sie hier.</div>
      )}

      {!loading && !fehler && personen.length > 0 && (
        <>
          <div style={styles.kpiRow}>
            <span style={styles.kpiPill}>{personen.length} Mitarbeiter</span>
            <span style={styles.kpiPill}>{gesamtModule} Module verfügbar</span>
            <span style={styles.kpiPill}>{personen.filter((p) => p.ma.nutzer_typ === 'voll' || !p.ma.nutzer_typ).length}× Vollzugang</span>
          </div>

          <div style={styles.list}>
            {personen.map((p) => {
              const auf = offen === p.ma.id;
              const typ = p.ma.nutzer_typ || 'voll';
              return (
                <div key={p.ma.id} style={styles.pCard}>
                  <button style={styles.pHead} onClick={() => setOffen(auf ? null : p.ma.id)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 700, color: C.text }}>{maName(p.ma)}</span>
                      <span style={{ ...styles.typBadge, color: TYP_FARBE[typ] || C.textDim, borderColor: (TYP_FARBE[typ] || C.textDim) + '66' }}>{TYP_LABEL[typ] || typ}</span>
                      {p.ma.leitungsrolle && <span style={styles.leitBadge}>{p.ma.leitungsrolle}</span>}
                      {p.ma.standort_id && standortName[p.ma.standort_id] && <span style={styles.filBadge}>🏢 {standortName[p.ma.standort_id]}</span>}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={styles.count}><b style={{ color: p.anzahl === 0 ? C.danger : C.gold }}>{p.anzahl}</b> / {gesamtModule}</span>
                      <span style={{ color: C.textDim }}>{auf ? '▲' : '▼'}</span>
                    </span>
                  </button>
                  {auf && (
                    <div style={styles.pBody}>
                      {p.anzahl === 0 ? (
                        <div style={{ color: C.textDim, fontSize: 14 }}>
                          {typ === 'self_service' ? 'Self-Service: sieht nur den eigenen Bereich (Mein Bereich, Zeiterfassung, Einsätze) — keine Fachmodule.' : 'Noch keine Module freigegeben. Unter „Rechte je Mitarbeiter" zuweisen.'}
                        </div>
                      ) : MODULE_NACH_GRUPPE.map((g) => {
                        const sichtbareItems = g.items.filter((it) => p.sichtbar.has(it.key));
                        if (sichtbareItems.length === 0) return null;
                        return (
                          <div key={g.key} style={{ marginBottom: 10 }}>
                            <div style={styles.groupTitle}>{g.label}</div>
                            <div style={styles.chipWrap}>
                              {sichtbareItems.map((it) => <span key={it.key} style={styles.modChip}>{it.label}</span>)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={styles.hinweis}>
            ℹ️ Der Chef (du) sieht alle gebuchten Module. Der aktive Filial-Umschalter im Kopf blendet zusätzlich Module aus, die an der gewählten Filiale abgeschaltet sind (siehe „Module je Filiale"). „Sitz-Typ": <b>Voll</b> = alles Zugewiesene, <b>Standard</b> = ohne sensible Bereiche, <b>Self-Service</b> = nur eigener Bereich.
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { padding: 'clamp(16px, 2.4vw, 40px)', color: C.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 1100, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 },
  eyebrow: { fontSize: 'clamp(11px, 0.95vw, 14px)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.7)' },
  h1: { fontSize: 'clamp(26px, 3vw, 44px)', fontWeight: 800, margin: '4px 0 6px' },
  sub: { fontSize: 'clamp(13px, 1.15vw, 18px)', color: C.textDim, maxWidth: 720, margin: 0 },
  linkBtn: { padding: '10px 16px', borderRadius: 10, background: C.gold, color: C.navy, fontWeight: 800, textDecoration: 'none', fontSize: 'clamp(12px, 1vw, 15px)', whiteSpace: 'nowrap' },
  linkBtnGhost: { padding: '10px 16px', borderRadius: 10, border: `1px solid ${C.line}`, color: C.text, fontWeight: 700, textDecoration: 'none', fontSize: 'clamp(12px, 1vw, 15px)', whiteSpace: 'nowrap' },
  kpiRow: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  kpiPill: { padding: '8px 14px', borderRadius: 999, background: 'rgba(201,168,76,0.12)', border: `1px solid ${C.line}`, color: C.gold, fontWeight: 700, fontSize: 'clamp(12px, 1vw, 15px)' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  pCard: { background: C.cardBg, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' },
  pHead: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: C.text, fontFamily: "'DM Sans', sans-serif", textAlign: 'left' },
  pBody: { padding: '4px 16px 16px', borderTop: `1px solid ${C.line}` },
  typBadge: { padding: '2px 9px', borderRadius: 999, border: '1px solid', fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.03)' },
  leitBadge: { padding: '2px 9px', borderRadius: 999, border: `1px solid rgba(201,168,76,0.4)`, color: C.gold, background: 'rgba(201,168,76,0.1)', fontSize: 12, fontWeight: 700 },
  filBadge: { padding: '2px 9px', borderRadius: 999, border: `1px solid rgba(0,229,255,0.3)`, color: C.cyan, background: 'rgba(0,229,255,0.08)', fontSize: 12, fontWeight: 700 },
  count: { fontSize: 'clamp(13px, 1.1vw, 16px)', color: C.textDim, whiteSpace: 'nowrap' },
  groupTitle: { fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.6)', marginBottom: 6 },
  chipWrap: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  modChip: { padding: '3px 10px', borderRadius: 8, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', color: C.text, fontSize: 12, fontWeight: 600 },
  stateBox: { padding: 40, textAlign: 'center', color: C.textDim, fontSize: 'clamp(14px, 1.2vw, 18px)' },
  hinweis: { marginTop: 16, fontSize: 13, color: C.textDim, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.6 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 14 },
};
