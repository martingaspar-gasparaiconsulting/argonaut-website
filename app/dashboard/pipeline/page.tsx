'use client';

// ============================================================
// ARGONAUT OS · CRM · Deal-Pipeline (Kanban) + gewichteter Forecast
// Vertriebschancen als Karten über Stufen (Lead → Qualifiziert → Angebot →
// Verhandlung → Gewonnen/Verloren). KPI-Strip mit Pipeline-Wert, gewichtetem
// Forecast und Win-Rate. Logik aus lib/pipeline (0 €, node-getestet).
// Tabelle: crm_deal (RLS owner + Mitarbeiter). Bestätigung vor dem Löschen.
// Paket 359 (VK1 Teil 2): eigene Pipelines mit eigenen Stufen (crm_pipeline,
// crm_pipeline_stufe; ohne Pipeline = eingebaute Standard-Pipeline), Setter und
// Closer je Deal, Filter „Zuständig" (Meine / Ohne / je Person), Verwaltung nur
// für die Geschäftsleitung. Fehlt SQL 359, bleibt alles wie bisher.
// Pfad: app/dashboard/pipeline/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import Leerzustand from '../_components/Leerzustand';
import { zaehlePipeline, dealWahrscheinlichkeit, formatEuro } from '@/lib/pipeline';
import { stufenFuer, stufeIn, ersteOffene, dealsIn, startAuswahl, sortiert, umzugWerte, type PipelineRoh, type StufeRoh } from '@/lib/pipelineEigene';
import { nachZustaendig, zustaendigText, auswahl as teamAuswahl, zuweisungPruefen, funktionName, meineRolle, type Person } from '@/lib/verkaufsteam';
import { ladeVerkaufsteam, type TeamStand } from '@/lib/verkaufsteamLaden';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';
import PipelinesVerwalten from './PipelinesVerwalten';
import { dealScore, priorisiere } from '@/lib/dealScoring';
import { augePipeline } from '@/lib/auge';
import { leseZahlOder } from '@/lib/zahlen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Deal = {
  id: string; titel: string; kontakt_id: string | null; firma: string | null;
  wert_netto: number | null; stufe: string; wahrscheinlichkeit: number | null;
  erwartetes_datum: string | null; notiz: string | null;
  pipeline_id?: string | null; setter_user_id?: string | null; closer_user_id?: string | null;
};
const WAHL_KEY = 'argonaut_pipeline_wahl';
function wahlLesen(): string | null { try { return window.localStorage.getItem(WAHL_KEY); } catch { return null; } }
function wahlMerken(v: string) { try { window.localStorage.setItem(WAHL_KEY, v); } catch { /* ohne Speicher */ } }
type Kontakt = { id: string; vorname: string | null; nachname: string | null; firma: string | null };

function num(s: string): number { return leseZahlOder(s, 0); }
function eur(n: unknown) { return formatEuro(n); }
function fmtDate(d: string | null) { return d ? d.split('-').reverse().join('.') : ''; }

const LEER = { titel: '', kontakt_id: '', firma: '', wert_netto: '', stufe: '', erwartetes_datum: '', notiz: '', setter: '', closer: '' };

export default function PipelineSeite() {
  const [uid, setUid] = useState<string | null>(null);
  const [besitzer, setBesitzer] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [formAuf, setFormAuf] = useState(false);
  const [form, setForm] = useState({ ...LEER });
  const [pipelines, setPipelines] = useState<PipelineRoh[]>([]);
  const [stufenRoh, setStufenRoh] = useState<StufeRoh[]>([]);
  const [eigeneBereit, setEigeneBereit] = useState(false);
  const [wahl, setWahl] = useState<string | null>(null);
  const [zFilter, setZFilter] = useState<string>('alle');
  const [stand, setStand] = useState<TeamStand | null>(null);
  const [verwalten, setVerwalten] = useState(false);
  const [dealAuf, setDealAuf] = useState<string | null>(null);

  const laden_ = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [d, k, pl, st] = await Promise.all([
        supabase.from('crm_deal').select('*').order('erstellt_am', { ascending: false }),
        supabase.from('kontakte').select('id, vorname, nachname, firma').order('nachname', { ascending: true }),
        supabase.from('crm_pipeline').select('id, name, beschreibung, standard, position, aktiv'),
        supabase.from('crm_pipeline_stufe').select('id, pipeline_id, schluessel, name, wahrscheinlichkeit, art, position, farbe').limit(5000),
      ]);
      setDeals((d.data as Deal[]) ?? []);
      setKontakte((k.data as Kontakt[]) ?? []);
      // Fehlt SQL 359, gibt es nur die Standard-Pipeline — wie bisher.
      setEigeneBereit(!pl.error && !st.error);
      const plListe = pl.error ? [] : ((pl.data as PipelineRoh[]) ?? []);
      setPipelines(plListe);
      setStufenRoh(st.error ? [] : ((st.data as StufeRoh[]) ?? []));
      setWahl((alt) => {
        if (alt !== null && (alt === '' || plListe.some((p) => p.id === alt))) return alt;
        return startAuswahl(plListe, wahlLesen());
      });
    } catch (e) {
      setFehler('Laden fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      const { data: chef } = await supabase.rpc('mein_chef_id');
      // B1: owner_user_id ist der Betrieb (beim Mitarbeiter der Chef), nicht die angemeldete Person.
      setBesitzer(typeof chef === 'string' && chef ? chef : id);
      setUid(id);
      setStand(await ladeVerkaufsteam(supabase));
      await laden_();
    })();
  }, [laden_]);

  const aktuelle = wahl ?? '';
  const stufen = useMemo(() => stufenFuer(aktuelle || null, stufenRoh), [aktuelle, stufenRoh]);
  const offeneStufen = useMemo(() => stufen.filter((s) => s.offen), [stufen]);
  const team: Person[] = stand?.team ?? [];
  const ich = stand?.ich ?? uid;
  const sicht = useMemo(() => nachZustaendig(dealsIn(deals, aktuelle || null), zFilter, ich), [deals, aktuelle, zFilter, ich]);
  const pipelineName = aktuelle ? (pipelines.find((p) => p.id === aktuelle)?.name ?? 'Pipeline') : 'Standard';
  const auswahlListe = useMemo(() => sortiert(pipelines).filter((p) => p.aktiv !== false || p.id === aktuelle), [pipelines, aktuelle]);
  function wahlSetzen(v: string) { setWahl(v); wahlMerken(v); setForm((f) => ({ ...f, stufe: '' })); }
  const kpi = useMemo(() => zaehlePipeline(sicht), [sicht]);
  const heute = useMemo(() => new Date(), []);
  const scores = useMemo(() => {
    const m = new Map<string, ReturnType<typeof dealScore>>();
    sicht.forEach((d) => m.set(d.id, dealScore(d, heute)));
    return m;
  }, [sicht, heute]);
  const topDeals = useMemo(() => priorisiere(sicht, heute).slice(0, 3), [sicht, heute]);
  const kontaktName = useCallback((id: string | null) => {
    if (!id) return '';
    const k = kontakte.find((x) => x.id === id);
    if (!k) return '';
    return [k.vorname, k.nachname].filter(Boolean).join(' ').trim() || (k.firma ?? '');
  }, [kontakte]);
  const dealsNachStufe = useCallback((stufe: string) => sicht.filter((d) => d.stufe === stufe), [sicht]);

  async function anlegen() {
    if (!uid || !form.titel.trim()) { setFehler('Bitte einen Titel angeben.'); return; }
    const zust = { setter_user_id: form.setter || null, closer_user_id: form.closer || null };
    if (zust.setter_user_id || zust.closer_user_id) {
      const zf = zuweisungPruefen(zust, team, stand?.frei ?? false);
      if (zf.length) { setFehler(zf.join(' ')); return; }
    }
    const stufe = stufeIn(stufen, form.stufe || ersteOffene(stufen));
    setBusy('anlegen'); setFehler(null);
    try {
      const zeile: Record<string, unknown> = {
        owner_user_id: besitzer ?? uid, titel: form.titel.trim(), kontakt_id: form.kontakt_id || null,
        firma: form.firma.trim() || null, wert_netto: num(form.wert_netto), stufe: stufe.key,
        wahrscheinlichkeit: stufe.wahrscheinlichkeit,
        erwartetes_datum: form.erwartetes_datum || null, notiz: form.notiz.trim() || null,
      };
      // Nur setzen, was gebraucht wird — ohne SQL 358/359 bleibt das Anlegen wie bisher.
      if (aktuelle) zeile.pipeline_id = aktuelle;
      if (zust.setter_user_id) zeile.setter_user_id = zust.setter_user_id;
      if (zust.closer_user_id) zeile.closer_user_id = zust.closer_user_id;
      const { error } = await supabase.from('crm_deal').insert(zeile);
      if (error) throw error;
      setForm({ ...LEER }); setFormAuf(false); await laden_();
    } catch (e) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function stufeSetzen(d: Deal, stufe: string) {
    setBusy(d.id); setFehler(null);
    try {
      const { error } = await supabase.from('crm_deal')
        .update({ stufe, wahrscheinlichkeit: stufeIn(stufen, stufe).wahrscheinlichkeit, aktualisiert_am: new Date().toISOString() })
        .eq('id', d.id);
      if (error) throw error;
      await laden_();
    } catch (e) { setFehler('Verschieben fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function zustaendigSpeichern(d: Deal, setter: string, closer: string, ziel: string) {
    const neu = { setter_user_id: setter || null, closer_user_id: closer || null };
    const aenderung: Record<string, unknown> = {};
    if (neu.setter_user_id !== (d.setter_user_id ?? null) || neu.closer_user_id !== (d.closer_user_id ?? null)) {
      const zf = zuweisungPruefen(neu, team, stand?.frei ?? false);
      if (zf.length) { setFehler(zf.join(' ')); return; }
      Object.assign(aenderung, neu);
    }
    if (ziel !== (d.pipeline_id ?? '')) Object.assign(aenderung, umzugWerte(ziel, stufenRoh));
    if (!Object.keys(aenderung).length) { setDealAuf(null); return; }
    aenderung.aktualisiert_am = new Date().toISOString();
    setBusy(d.id); setFehler(null);
    try {
      const { data, error } = await supabase.from('crm_deal').update(aenderung).eq('id', d.id).select('id');
      if (error) { setFehler(/Pipeline|Stufe|Setter|Closer|Zuständige|gehört nicht|inaktiv/.test(error.message) ? error.message : 'Nicht gespeichert — dafür ist das Schreibrecht „Deal-Pipeline" nötig (und SQL Paket 358/359).'); return; }
      if (nichtsGeschrieben(data)) { setFehler('Nicht gespeichert — dafür ist das Schreibrecht „Deal-Pipeline" nötig.'); return; }
      setDealAuf(null);
      await laden_();
    } finally { setBusy(null); }
  }

  async function loeschen(d: Deal) {
    if (!window.confirm(`Deal „${d.titel}" wirklich löschen?`)) return;
    setBusy(d.id);
    try {
      const { error } = await supabase.from('crm_deal').delete().eq('id', d.id);
      if (error) throw error;
      await laden_();
    } catch (e) { setFehler('Löschen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  const ueberfaelligAnzahl = useMemo(
    () => [...scores.values()].filter((s) => s.gruende.some((g) => g.includes('überfällig'))).length,
    [scores],
  );
  const augeRegel = augePipeline({
    offen: kpi.offen, pipelineWert: kpi.pipelineWert, gewichtet: kpi.gewichtet, winRate: kpi.winRate,
    gewonnen: kpi.gewonnen, verloren: kpi.verloren,
    topTitel: topDeals[0]?.deal.titel, topScore: topDeals[0]?.score.score, ueberfaellig: ueberfaelligAnzahl,
  });

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Vertrieb</div>
      <div style={styles.kopf}>
        <div>
          <h1 style={styles.h1}>📊 Deal-Pipeline</h1>
          <p style={styles.sub}>Ihre Vertriebschancen als Karten über die Stufen. Verschieben Sie einen Deal weiter, und der gewichtete Forecast rechnet sich automatisch mit der Abschlusswahrscheinlichkeit.</p>
        </div>
        <button style={styles.primaer} onClick={() => setFormAuf((v) => !v)}>{formAuf ? 'Abbrechen' : '＋ Neuer Deal'}</button>
      </div>

      <div style={styles.leiste}>
        {eigeneBereit && (
          <label style={styles.leisteLab}>Pipeline
            <select style={styles.leisteSel} value={aktuelle} onChange={(e) => wahlSetzen(e.target.value)}>
              <option value="">Standard</option>
              {auswahlListe.map((p) => <option key={p.id} value={p.id}>{p.name}{p.aktiv === false ? ' (inaktiv)' : ''}</option>)}
            </select>
          </label>
        )}
        {team.length > 0 && !stand?.frei && (
          <label style={styles.leisteLab}>Zuständig
            <select style={styles.leisteSel} value={zFilter} onChange={(e) => setZFilter(e.target.value)}>
              <option value="alle">Alle</option>
              <option value="meine">Meine Deals</option>
              <option value="ohne">Ohne Zuständige</option>
              {team.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}{p.funktion ? ` · ${funktionName(p.funktion)}` : ''}</option>)}
            </select>
          </label>
        )}
        {eigeneBereit && stand?.istChef && (
          <button style={styles.leisteKnopf} onClick={() => setVerwalten((v) => !v)}>{verwalten ? 'Verwaltung schließen' : '⚙️ Pipelines verwalten'}</button>
        )}
        {(pipelines.length > 0 || zFilter !== 'alle') && <span style={styles.leisteInfo}>{pipelineName} · {sicht.length} Deal{sicht.length === 1 ? '' : 's'}</span>}
      </div>

      {verwalten && stand?.istChef && (
        <PipelinesVerwalten supabase={supabase} pipelines={pipelines} stufen={stufenRoh} deals={deals} onGeaendert={laden_} />
      )}

      {fehler && <div style={styles.err}>{fehler}</div>}

      <div style={styles.kpis}>
        <Kpi label="Pipeline-Wert (offen)" value={eur(kpi.pipelineWert)} accent={C.cyan} />
        <Kpi label="Gewichteter Forecast" value={eur(kpi.gewichtet)} accent={C.gold} />
        <Kpi label="Offene Deals" value={String(kpi.offen)} accent={C.text} />
        <Kpi label="Win-Rate" value={`${kpi.winRate} %`} accent={kpi.winRate >= 50 ? C.green : C.warn} sub={`${kpi.gewonnen} gewonnen · ${kpi.verloren} verloren`} />
        <Kpi label="Gewonnen (Wert)" value={eur(kpi.gewonnenWert)} accent={C.green} />
      </div>

      {!laden && <div style={{ marginBottom: 14 }}><KiAuge modul="Deal-Pipeline" regel={augeRegel} /></div>}

      {formAuf && (
        <div style={styles.card}>
          <div style={styles.cardTitel}>Neuer Deal{aktuelle ? ` · ${pipelineName}` : ''}</div>
          <div style={styles.grid}>
            <label style={styles.lab}>Titel *<input style={styles.inp} value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} placeholder="z. B. Angebot Heizungssanierung" /></label>
            <label style={styles.lab}>Kontakt
              <select style={styles.inp} value={form.kontakt_id} onChange={(e) => setForm({ ...form, kontakt_id: e.target.value })}>
                <option value="">— optional —</option>
                {kontakte.map((k) => <option key={k.id} value={k.id}>{[k.vorname, k.nachname].filter(Boolean).join(' ') || k.firma || 'Kontakt'}</option>)}
              </select>
            </label>
            <label style={styles.lab}>Firma<input style={styles.inp} value={form.firma} onChange={(e) => setForm({ ...form, firma: e.target.value })} /></label>
            <label style={styles.lab}>Wert netto (€)<input style={styles.inp} inputMode="decimal" value={form.wert_netto} onChange={(e) => setForm({ ...form, wert_netto: e.target.value })} placeholder="0" /></label>
            <label style={styles.lab}>Stufe
              <select style={styles.inp} value={form.stufe || ersteOffene(stufen)} onChange={(e) => setForm({ ...form, stufe: e.target.value })}>
                {stufen.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.wahrscheinlichkeit} %)</option>)}
              </select>
            </label>
            {team.length > 0 && !stand?.frei && <>
              <label style={styles.lab}>Setter
                <select style={styles.inp} value={form.setter} onChange={(e) => setForm({ ...form, setter: e.target.value })}>
                  <option value="">— niemand —</option>
                  {teamAuswahl(team, 'setter').map((p) => <option key={p.user_id} value={p.user_id}>{p.name}{p.funktion ? ` · ${funktionName(p.funktion)}` : ''}</option>)}
                </select>
              </label>
              <label style={styles.lab}>Closer
                <select style={styles.inp} value={form.closer} onChange={(e) => setForm({ ...form, closer: e.target.value })}>
                  <option value="">— niemand —</option>
                  {teamAuswahl(team, 'closer').map((p) => <option key={p.user_id} value={p.user_id}>{p.name}{p.funktion ? ` · ${funktionName(p.funktion)}` : ''}</option>)}
                </select>
              </label>
            </>}
            <label style={styles.lab}>Erwarteter Abschluss<input type="date" style={styles.inp} value={form.erwartetes_datum} onChange={(e) => setForm({ ...form, erwartetes_datum: e.target.value })} /></label>
            <label style={{ ...styles.lab, gridColumn: '1 / -1' }}>Notiz<input style={styles.inp} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></label>
          </div>
          <button style={{ ...styles.primaer, marginTop: 10, opacity: busy === 'anlegen' ? 0.6 : 1 }} disabled={busy === 'anlegen'} onClick={anlegen}>＋ Deal anlegen</button>
        </div>
      )}

      {laden ? (
        <div style={styles.hint}>Lädt …</div>
      ) : deals.length === 0 && !aktuelle ? (
        <Leerzustand icon="📊" titel="Noch keine Deals" text="Legen Sie die erste Vertriebschance an — ARGONAUT zeigt Ihnen Pipeline-Wert und gewichteten Forecast." schritte={["Oben „＋ Neuer Deal“ anlegen", "Wert und Stufe erfassen", "Deal durch die Stufen ziehen bis „Gewonnen“"]} aktionText="＋ Neuer Deal" onAktion={() => setFormAuf(true)} />
      ) : (
        <div style={styles.board}>
          {offeneStufen.length === 0 && (
            <div style={styles.spalteLeer}>Diese Pipeline hat noch keine offenen Stufen — unter „⚙️ Pipelines verwalten" anlegen.</div>
          )}
          {offeneStufen.map((s) => {
            const ds = dealsNachStufe(s.key);
            const summe = ds.reduce((a, d) => a + (Number(d.wert_netto) || 0), 0);
            return (
              <div key={s.key} style={styles.spalte}>
                <div style={{ ...styles.spalteKopf, borderColor: s.farbe + '55' }}>
                  <span style={{ fontWeight: 800, color: s.farbe }}>{s.label}</span>
                  <span style={styles.spalteMeta}>{ds.length} · {eur(summe)}</span>
                </div>
                {ds.length === 0 ? <div style={styles.spalteLeer}>—</div> : ds.map((d) => {
                  const sc = scores.get(d.id);
                  return (
                  <div key={d.id} style={styles.deal}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{d.titel}</div>
                      {sc && <span style={{ ...styles.scorePill, background: sc.farbe + '22', color: sc.farbe, border: `1px solid ${sc.farbe}66` }} title={sc.gruende.join(' · ')}>🔥 {sc.score}</span>}
                    </div>
                    <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>
                      {(d.firma || kontaktName(d.kontakt_id) || '—')}{d.erwartetes_datum ? ` · ${fmtDate(d.erwartetes_datum)}` : ''}
                    </div>
                    {zustaendigText(d, team) && (
                      <div style={{ color: C.textDim, fontSize: 12, marginTop: 4 }}>👤 {zustaendigText(d, team)}{meineRolle(d, ich) ? ' · eigener Deal' : ''}</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <span style={{ fontWeight: 800, color: C.gold }}>{eur(d.wert_netto)}</span>
                      <span style={{ color: C.textDim, fontSize: 12 }}>{dealWahrscheinlichkeit(d)} %</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                      <select style={styles.selMini} value={d.stufe} disabled={busy === d.id} onChange={(e) => stufeSetzen(d, e.target.value)}>
                        {stufen.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
                      </select>
                      {(team.length > 0 || pipelines.length > 0) && !stand?.frei && (
                        <button style={styles.miniK} title="Zuständige und Pipeline" disabled={busy === d.id} onClick={() => setDealAuf(dealAuf === d.id ? null : d.id)}>👤</button>
                      )}
                      <button style={styles.miniX} disabled={busy === d.id} onClick={() => loeschen(d)}>✕</button>
                    </div>
                    {dealAuf === d.id && (
                      <DealZustaendig d={d} team={team} ich={ich} pipelines={auswahlListe} busy={busy === d.id}
                        onSpeichern={(s1, c1, z1) => void zustaendigSpeichern(d, s1, c1, z1)} onAbbrechen={() => setDealAuf(null)} />
                    )}
                  </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {(kpi.gewonnen > 0 || kpi.verloren > 0) && !laden && (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <div style={styles.cardTitel}>Entschieden</div>
          <div style={{ color: C.textDim, fontSize: 13, marginBottom: 8 }}>Über das Stufen-Menü einer Karte lässt sich ein Deal auf „{stufeIn(stufen, 'gewonnen').label}" oder „{stufeIn(stufen, 'verloren').label}" setzen.</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <span style={{ color: C.green }}>✓ {stufeIn(stufen, 'gewonnen').label}: <b>{kpi.gewonnen}</b> · {eur(kpi.gewonnenWert)}</span>
            <span style={{ color: C.danger }}>✕ {stufeIn(stufen, 'verloren').label}: <b>{kpi.verloren}</b></span>
          </div>
        </div>
      )}
    </div>
  );
}

function DealZustaendig({ d, team, ich, pipelines, busy, onSpeichern, onAbbrechen }: {
  d: Deal; team: Person[]; ich: string | null; pipelines: PipelineRoh[]; busy: boolean;
  onSpeichern: (setter: string, closer: string, ziel: string) => void; onAbbrechen: () => void;
}) {
  const [s, setS] = useState(d.setter_user_id ?? '');
  const [c, setC] = useState(d.closer_user_id ?? '');
  const [z, setZ] = useState(d.pipeline_id ?? '');
  const opt = (p: Person) => <option key={p.user_id} value={p.user_id}>{p.name}{p.funktion ? ` · ${funktionName(p.funktion)}` : ''}{p.aktiv ? '' : ' (inaktiv)'}</option>;
  return (
    <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8, display: 'grid', gap: 6 }}>
      {team.length > 0 && <>
        <label style={styles.miniLab}>Setter
          <select style={styles.selMini} value={s} onChange={(e) => setS(e.target.value)}>
            <option value="">— niemand —</option>
            {teamAuswahl(team, 'setter', d.setter_user_id).map(opt)}
          </select>
        </label>
        <label style={styles.miniLab}>Closer
          <select style={styles.selMini} value={c} onChange={(e) => setC(e.target.value)}>
            <option value="">— niemand —</option>
            {teamAuswahl(team, 'closer', d.closer_user_id).map(opt)}
          </select>
        </label>
      </>}
      {pipelines.length > 0 && (
        <label style={styles.miniLab}>In Pipeline
          <select style={styles.selMini} value={z} onChange={(e) => setZ(e.target.value)}>
            <option value="">Standard</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      {z !== (d.pipeline_id ?? '') && <div style={{ color: C.textDim, fontSize: 11.5 }}>Beim Verschieben startet der Deal in der ersten Stufe der Ziel-Pipeline.</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        {ich && !s && <button style={styles.miniK} onClick={() => setS(ich)}>Ich übernehme</button>}
        <span style={{ flex: 1 }} />
        <button style={styles.miniK} onClick={onAbbrechen}>Abbrechen</button>
        <button style={{ ...styles.miniK, background: C.gold, color: C.navy, fontWeight: 800 }} disabled={busy} onClick={() => onSpeichern(s, c, z)}>Speichern</button>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (<div style={styles.kpi}><div style={{ ...styles.kWert, color: accent || C.text }}>{value}</div><div style={styles.kLabel}>{label}</div>{sub ? <div style={styles.kSub}>{sub}</div> : null}</div>);
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, margin: '8px 0 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 820, lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, margin: '10px 0 12px' },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', textAlign: 'center' },
  kWert: { fontSize: 22, fontWeight: 800, lineHeight: 1.1 },
  kLabel: { color: C.textDim, fontSize: 11.5, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  kSub: { color: C.textDim, fontSize: 11, marginTop: 3 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 18px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 18px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  board: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginTop: 4 },
  spalte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, minHeight: 120 },
  spalteKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid', paddingBottom: 8, marginBottom: 10 },
  spalteMeta: { color: C.textDim, fontSize: 12 },
  spalteLeer: { color: C.textDim, fontSize: 13, textAlign: 'center', padding: '18px 0' },
  deal: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', marginBottom: 8 },
  scorePill: { flexShrink: 0, fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap', lineHeight: 1.4 },
  selMini: { flex: 1, background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 8px', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' },
  miniK: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 9px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  miniLab: { display: 'grid', gap: 3, fontSize: 11.5, color: C.textDim },
  leiste: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', margin: '0 0 12px' },
  leisteLab: { display: 'grid', gap: 4, fontSize: 12, color: C.gold, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 },
  leisteSel: { background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 10px', fontSize: 15, fontFamily: 'inherit', minWidth: 180 },
  leisteKnopf: { background: 'transparent', color: C.gold, border: `1px solid ${C.gold}66`, borderRadius: 10, padding: '8px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  leisteInfo: { color: C.textDim, fontSize: 13, paddingBottom: 9 },
  miniX: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '4px 9px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '10px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' },
};
