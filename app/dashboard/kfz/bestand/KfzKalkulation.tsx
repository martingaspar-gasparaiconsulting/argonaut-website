'use client';

// ============================================================
// ARGONAUT OS · Paket 265 · K5 Kalkulation und Provision (Reiter in der Handelsakte)
// Plan- und Nachkalkulation je Fahrzeug: Erlös netto (§ 25a/Regel), Einkauf,
// Kosten (Plan/Ist), Standkosten, Rohertrag, Gemeinkosten, Provision
// Verkäufer und Hereinnehmer, Deckungsbeitrag. Kommission.
// Kostenposten: Tabelle kfz_bestand_kosten (Recht „kfz").
// Provisionen: Tabelle kfz_bestand_kalk — nur Chef oder „Darf abrechnen".
// Gemeinkosten-Satz: modul_einstellung „kfz-kalk" (nur Chef).
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import {
  KOSTEN_ARTEN, PROV_ARTEN, kalkulation, kostenSummen, ertragAmpel, provAus, kalkHinweise,
  type Kosten, type KalkErgebnis,
} from '@/lib/kfzKalkulation';
import { richtwerteMit, schadenBereinigen, schadenSumme } from '@/lib/kfzAnkauf';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', navy3: '#14294A', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, dim: C.dim };

type Posten = Kosten & { id: string; bezeichnung: string | null; datum: string };
type Kalk = {
  vk_erzielt: number | null; verkaeufer: string | null; hereinnehmer: string | null;
  prov_v_art: string | null; prov_v_wert: number | null; prov_h_art: string | null; prov_h_wert: number | null;
  prov_ausgezahlt_am: string | null; kommission: boolean; kommission_eigentuemer: string | null; notiz: string | null;
};
export type KalkFahrzeug = {
  id: string; owner_user_id: string; ek_netto: number | null; vk_brutto: number | null; besteuerung: string | null;
  standtageJetzt: number | null; standtagePlanStandard: number; standkostenTag: number; verkauft: boolean;
};

function eur(n: number | null | undefined, cent = true): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('de-DE', { minimumFractionDigits: cent ? 2 : 0, maximumFractionDigits: cent ? 2 : 0 }) + ' €';
}
function t(v: number | string | null | undefined): string { return v === null || v === undefined ? '' : String(v).replace('.', ','); }
function betrag(v: string): number | null { const n = leseZahl(v); return n === null || n < 0 ? null : n; }

export default function KfzKalkulation({ f }: { f: KalkFahrzeug }) {
  const [istChef, setIstChef] = useState(false);
  const [posten, setPosten] = useState<Posten[]>([]);
  const [kalk, setKalk] = useState<Kalk | null>(null);
  const [kalkErlaubt, setKalkErlaubt] = useState(true);
  const [gk, setGk] = useState<number>(0);
  const [gkEntwurf, setGkEntwurf] = useState('');
  const [ankauf, setAnkauf] = useState<{ nr: string | null; schaeden: number; aufbereitung: number; sonstige: number; standtage: number | null } | null>(null);
  const [neu, setNeu] = useState({ art: 'aufbereitung', bezeichnung: '', betrag: '', plan: false });
  const [ent, setEnt] = useState({ vk_erzielt: '', verkaeufer: '', hereinnehmer: '', vArt: '', vWert: '', hArt: '', hWert: '', kommission: false, eigentuemer: '', ausgezahlt: '' });
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null);

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const chef = !!u?.user?.id && u.user.id === f.owner_user_id;
    setIstChef(chef);
    let darf = chef;
    if (!chef) { try { darf = (await supabase.rpc('darf_ich_abrechnen')).data === true; } catch { darf = false; } }
    setKalkErlaubt(darf);
    const [k, kc, e, a] = await Promise.all([
      supabase.from('kfz_bestand_kosten').select('id, art, bezeichnung, betrag_netto, plan, datum').eq('bestand_id', f.id).order('datum'),
      supabase.from('kfz_bestand_kalk').select('*').eq('bestand_id', f.id).maybeSingle(),
      supabase.from('modul_einstellung').select('modul, einstellung').eq('owner_user_id', f.owner_user_id).in('modul', ['kfz-kalk', 'kfz-ankauf']),
      supabase.from('kfz_ankauf').select('nr, schaeden, aufbereitung, sonstige_kosten, standtage_plan').eq('bestand_id', f.id).limit(1),
    ]);
    if (k.error) { setFehler('Kosten lassen sich nicht laden. Ist SQL Paket 265 ausgeführt?'); return; }
    setPosten(((k.data as unknown) as Posten[]) ?? []);
    const x = (kc.data as unknown as Kalk | null) ?? null;
    setKalk(x);
    setEnt({
      vk_erzielt: t(x?.vk_erzielt), verkaeufer: x?.verkaeufer ?? '', hereinnehmer: x?.hereinnehmer ?? '',
      vArt: x?.prov_v_art ?? '', vWert: t(x?.prov_v_wert), hArt: x?.prov_h_art ?? '', hWert: t(x?.prov_h_wert),
      kommission: !!x?.kommission, eigentuemer: x?.kommission_eigentuemer ?? '', ausgezahlt: x?.prov_ausgezahlt_am ?? '',
    });
    const einst = (((e.data as unknown) as { modul: string; einstellung: Record<string, unknown> }[]) ?? []);
    const kk = einst.find((r) => r.modul === 'kfz-kalk')?.einstellung ?? {};
    const g = Number((kk as { gemeinkostenProzent?: unknown }).gemeinkostenProzent);
    setGk(Number.isFinite(g) && g >= 0 && g <= 100 ? g : 0);
    setGkEntwurf(Number.isFinite(g) && g > 0 ? t(g) : '');
    const ar = ((a.data as unknown) as { nr: string | null; schaeden: unknown; aufbereitung: number | null; sonstige_kosten: number | null; standtage_plan: number | null }[] | null)?.[0];
    if (ar) {
      const rw = richtwerteMit((einst.find((r) => r.modul === 'kfz-ankauf')?.einstellung as { richtwerte?: unknown } | undefined)?.richtwerte);
      setAnkauf({ nr: ar.nr, schaeden: schadenSumme(schadenBereinigen(ar.schaeden), rw), aufbereitung: Number(ar.aufbereitung ?? 0), sonstige: Number(ar.sonstige_kosten ?? 0), standtage: ar.standtage_plan });
    } else setAnkauf(null);
  }, [f.id, f.owner_user_id]);

  useEffect(() => { void lade(); }, [lade]);

  const summen = useMemo(() => kostenSummen(posten), [posten]);
  const provV = provAus(ent.vArt || null, betrag(ent.vWert));
  const provH = provAus(ent.hArt || null, betrag(ent.hWert));
  const planTage = ankauf?.standtage ?? f.standtagePlanStandard;
  const plan: KalkErgebnis = kalkulation({ besteuerung: f.besteuerung, ek: f.ek_netto, vk: f.vk_brutto, kosten: summen.plan, standtage: f.verkauft ? f.standtageJetzt : Math.max(planTage, f.standtageJetzt ?? 0), standkostenTag: f.standkostenTag, gemeinkostenProzent: gk, provV, provH });
  const vkIst = betrag(ent.vk_erzielt);
  const nach: KalkErgebnis = kalkulation({ besteuerung: f.besteuerung, ek: f.ek_netto, vk: vkIst, kosten: summen.ist, standtage: f.standtageJetzt, standkostenTag: f.standkostenTag, gemeinkostenProzent: gk, provV, provH });
  const hinweise = kalkHinweise({ provV, provH, besteuerung: f.besteuerung, kommission: ent.kommission });

  async function postenNeu() {
    const b = betrag(neu.betrag);
    if (b === null) { setFehler('Bitte einen Betrag (netto) eintragen.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('kfz_bestand_kosten').insert({ owner_user_id: f.owner_user_id, bestand_id: f.id, art: neu.art, bezeichnung: neu.bezeichnung.trim() || null, betrag_netto: b, plan: neu.plan });
      if (error) { setFehler('Speichern fehlgeschlagen (Schreibrecht „KFZ"?).'); return; }
      setNeu({ ...neu, bezeichnung: '', betrag: '' }); setOk(neu.plan ? 'Planposten erfasst.' : 'Kosten erfasst.'); await lade();
    } finally { setBusy(false); }
  }

  async function ausAnkauf() {
    if (!ankauf) return;
    const zeilen = [
      ankauf.schaeden > 0 ? { art: 'reparatur', bezeichnung: `Schäden laut Ankauf ${ankauf.nr ?? ''}`.trim(), betrag_netto: ankauf.schaeden } : null,
      ankauf.aufbereitung > 0 ? { art: 'aufbereitung', bezeichnung: `Aufbereitung laut Ankauf ${ankauf.nr ?? ''}`.trim(), betrag_netto: ankauf.aufbereitung } : null,
      ankauf.sonstige > 0 ? { art: 'sonstiges', bezeichnung: `Sonstiges laut Ankauf ${ankauf.nr ?? ''}`.trim(), betrag_netto: ankauf.sonstige } : null,
    ].filter(Boolean).map((z) => ({ ...(z as object), owner_user_id: f.owner_user_id, bestand_id: f.id, plan: true }));
    if (!zeilen.length) { setOk('Im Ankauf stehen keine Kosten.'); return; }
    setBusy(true); setFehler(null);
    try {
      const { error } = await supabase.from('kfz_bestand_kosten').insert(zeilen);
      if (error) { setFehler('Übernehmen fehlgeschlagen (Schreibrecht „KFZ"?).'); return; }
      setOk('Planwerte aus dem Ankauf übernommen.'); await lade();
    } finally { setBusy(false); }
  }

  async function postenWeg(id: string) {
    setLoeschFrage(null); setBusy(true);
    try {
      const { error } = await supabase.from('kfz_bestand_kosten').delete().eq('id', id);
      if (error) { setFehler('Löschen nicht erlaubt (Schreibrecht „KFZ"?).'); return; }
      await lade();
    } finally { setBusy(false); }
  }

  async function erledigt(p: Posten) {
    setBusy(true);
    try {
      const { error } = await supabase.from('kfz_bestand_kosten').update({ plan: false, datum: new Date().toISOString().slice(0, 10) }).eq('id', p.id);
      if (error) { setFehler('Ändern nicht erlaubt (Schreibrecht „KFZ"?).'); return; }
      await lade();
    } finally { setBusy(false); }
  }

  async function kalkSpeichern() {
    const v = betrag(ent.vWert), h = betrag(ent.hWert);
    if ((ent.vWert.trim() && v === null) || (ent.hWert.trim() && h === null)) { setFehler('Provision bitte als Zahl eintragen.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('kfz_bestand_kalk').upsert({
        bestand_id: f.id, owner_user_id: f.owner_user_id, vk_erzielt: betrag(ent.vk_erzielt),
        verkaeufer: ent.verkaeufer.trim() || null, hereinnehmer: ent.hereinnehmer.trim() || null,
        prov_v_art: ent.vArt || null, prov_v_wert: ent.vArt ? v : null, prov_h_art: ent.hArt || null, prov_h_wert: ent.hArt ? h : null,
        prov_ausgezahlt_am: ent.ausgezahlt || null, kommission: ent.kommission, kommission_eigentuemer: ent.kommission ? (ent.eigentuemer.trim() || null) : null,
        aktualisiert_am: new Date().toISOString(),
      }, { onConflict: 'bestand_id' });
      if (error) { setFehler('Speichern nicht erlaubt. Provisionen pflegt die Geschäftsleitung oder wer „Darf abrechnen" hat.'); return; }
      setOk('Kalkulation gespeichert.'); await lade();
    } finally { setBusy(false); }
  }

  async function gkSpeichern() {
    const g = gkEntwurf.trim() ? leseZahl(gkEntwurf) : 0;
    if (g === null || g < 0 || g > 100) { setFehler('Gemeinkosten bitte als Prozent zwischen 0 und 100.'); return; }
    setBusy(true); setFehler(null);
    try {
      const { data } = await supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', f.owner_user_id).eq('modul', 'kfz-kalk').maybeSingle();
      const alt = ((data as { einstellung?: Record<string, unknown> } | null)?.einstellung) ?? {};
      const { error } = await supabase.from('modul_einstellung').upsert({ owner_user_id: f.owner_user_id, modul: 'kfz-kalk', einstellung: { ...alt, gemeinkostenProzent: g }, aktualisiert_am: new Date().toISOString() }, { onConflict: 'owner_user_id,modul' });
      if (error) { setFehler('Gemeinkosten ließen sich nicht speichern.'); return; }
      setOk('Gemeinkosten-Satz gespeichert (gilt für alle Fahrzeuge).'); await lade();
    } finally { setBusy(false); }
  }

  const zeile = (name: string, p: number | null, n: number | null, opt?: { minus?: boolean; fett?: boolean; farbe?: string }) => (
    <tr key={name}><td style={{ ...s.td, fontWeight: opt?.fett ? 800 : 400 }}>{name}</td>
      <td style={{ ...s.tdR, fontWeight: opt?.fett ? 800 : 400, color: opt?.farbe }}>{p === null ? '—' : (opt?.minus && p > 0 ? '− ' : '') + eur(p)}</td>
      <td style={{ ...s.tdR, fontWeight: opt?.fett ? 800 : 400, color: opt?.farbe }}>{n === null ? '—' : (opt?.minus && n > 0 ? '− ' : '') + eur(n)}</td></tr>
  );
  const ap = ertragAmpel(plan), an = ertragAmpel(nach);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok} role="status">{ok}</div>}

      <div style={s.raster}>
        <div style={s.karte}>
          <h3 style={s.h3}>Plan und Nachkalkulation</h3>
          <table style={s.tab}><thead><tr><th style={s.th}></th><th style={s.thR}>Plan</th><th style={s.thR}>Nach (Ist)</th></tr></thead>
            <tbody>
              {zeile('Verkaufspreis brutto', f.vk_brutto, vkIst)}
              {zeile(f.besteuerung === 'regel' ? 'Umsatzsteuer 19 %' : 'Umsatzsteuer auf die Differenz (§ 25a)', plan.ust, nach.ust, { minus: true })}
              {zeile('Erlös netto', plan.erloesNetto, nach.erloesNetto, { fett: true })}
              {zeile(ent.kommission ? 'Auszahlung an Eigentümer' : 'Einkauf', plan.ek, nach.vollstaendig ? nach.ek : null, { minus: true })}
              {zeile('Kosten netto', plan.kosten, nach.vollstaendig ? nach.kosten : summen.ist, { minus: true })}
              {zeile('Standkosten', plan.standkosten, nach.vollstaendig ? nach.standkosten : null, { minus: true })}
              {zeile('Rohertrag', plan.rohertrag, nach.rohertrag, { fett: true })}
              {zeile(`Gemeinkosten (${t(gk)} %)`, plan.gemeinkosten, nach.gemeinkosten, { minus: true })}
              {zeile('Provision Verkäufer', plan.provVerkaeufer, nach.provVerkaeufer, { minus: true })}
              {zeile('Provision Hereinnehmer', plan.provHereinnehmer, nach.provHereinnehmer, { minus: true })}
              {zeile('Deckungsbeitrag', plan.deckungsbeitrag, nach.deckungsbeitrag, { fett: true })}
              <tr><td style={s.td}>Marge vom Erlös</td>
                <td style={{ ...s.tdR, color: FARBE[ap] }}>{plan.margeProzent === null ? '—' : `${t(plan.margeProzent)} %`}</td>
                <td style={{ ...s.tdR, color: FARBE[an] }}>{nach.margeProzent === null ? '—' : `${t(nach.margeProzent)} %`}</td></tr>
            </tbody></table>
          <div style={{ ...s.dim, marginTop: 8 }}>
            {plan.fehlt.length ? `Für den Plan fehlt: ${plan.fehlt.join(', ')} (Stammdaten). ` : ''}
            Plan mit {f.verkauft ? 'den tatsächlichen' : `${Math.max(planTage, f.standtageJetzt ?? 0)} geplanten`} Standtagen, Nach mit {f.standtageJetzt ?? '—'} Tagen bis {f.verkauft ? 'zum Verkauf' : 'heute'}. Nach erscheint, sobald der erzielte Preis eingetragen ist. Richtrechnung mit 19 % — die Rechnung entsteht mit dem Baustein Fahrzeugrechnung.
          </div>
          {hinweise.map((h, i) => <div key={i} style={{ ...s.hinweis, marginTop: 6 }}>{h}</div>)}
        </div>

        <div style={s.karte}>
          <h3 style={s.h3}>Verkauf und Provision</h3>
          {!kalkErlaubt ? <div style={s.dim}>Provisionen und erzielte Preise sieht die Geschäftsleitung oder wer das Recht „Darf abrechnen" hat.</div> : (
            <>
              <div style={s.feldRaster}>
                <label style={s.lab}>Erzielter Verkaufspreis (brutto)<input style={s.inp} inputMode="decimal" value={ent.vk_erzielt} onChange={(e) => setEnt({ ...ent, vk_erzielt: e.target.value })} /></label>
                <label style={s.lab}>Verkäufer<input style={s.inp} value={ent.verkaeufer} onChange={(e) => setEnt({ ...ent, verkaeufer: e.target.value })} /></label>
                <label style={s.lab}>Provision Verkäufer<select style={s.inp} value={ent.vArt} onChange={(e) => setEnt({ ...ent, vArt: e.target.value })}><option value="">keine</option>{PROV_ARTEN.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
                {ent.vArt && <label style={s.lab}>{ent.vArt === 'fest' ? 'Betrag (€)' : 'Satz (%)'}<input style={s.inp} inputMode="decimal" value={ent.vWert} onChange={(e) => setEnt({ ...ent, vWert: e.target.value })} /></label>}
                <label style={s.lab}>Hereinnehmer (hat angekauft)<input style={s.inp} value={ent.hereinnehmer} onChange={(e) => setEnt({ ...ent, hereinnehmer: e.target.value })} /></label>
                <label style={s.lab}>Provision Hereinnehmer<select style={s.inp} value={ent.hArt} onChange={(e) => setEnt({ ...ent, hArt: e.target.value })}><option value="">keine</option>{PROV_ARTEN.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
                {ent.hArt && <label style={s.lab}>{ent.hArt === 'fest' ? 'Betrag (€)' : 'Satz (%)'}<input style={s.inp} inputMode="decimal" value={ent.hWert} onChange={(e) => setEnt({ ...ent, hWert: e.target.value })} /></label>}
                <label style={s.lab}>Provision ausgezahlt am<input type="date" style={s.inp} value={ent.ausgezahlt} onChange={(e) => setEnt({ ...ent, ausgezahlt: e.target.value })} /></label>
              </div>
              <label style={{ ...s.haken, marginTop: 10 }}><input type="checkbox" checked={ent.kommission} onChange={(e) => setEnt({ ...ent, kommission: e.target.checked })} /> Kommissionsfahrzeug (verkauft im Auftrag des Eigentümers)</label>
              {ent.kommission && <label style={{ ...s.lab, marginTop: 8 }}>Eigentümer<input style={s.inp} value={ent.eigentuemer} onChange={(e) => setEnt({ ...ent, eigentuemer: e.target.value })} /></label>}
              <button style={{ ...s.gold, marginTop: 12, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void kalkSpeichern()}>💾 Speichern</button>
            </>
          )}
          {istChef && (
            <div style={{ marginTop: 14, borderTop: `1px dashed ${C.border}`, paddingTop: 10 }}>
              <label style={s.lab}>Gemeinkosten in % vom Erlös netto (gilt für alle Fahrzeuge, nur Geschäftsleitung)
                <span style={{ display: 'flex', gap: 8 }}><input style={{ ...s.inp, width: 110 }} inputMode="decimal" value={gkEntwurf} onChange={(e) => setGkEntwurf(e.target.value)} placeholder="z. B. 4" />
                  <button style={s.btn} disabled={busy} onClick={() => void gkSpeichern()}>Übernehmen</button></span></label>
            </div>
          )}
        </div>
      </div>

      <div style={s.karte}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <h3 style={s.h3}>Kosten am Fahrzeug</h3>
          <span style={s.dim}>Ist {eur(summen.ist)} · Plan gesamt {eur(summen.plan)}</span>
        </div>
        {ankauf && <div style={{ ...s.hinweis, marginBottom: 10 }}>Aus Ankauf {ankauf.nr ?? ''}: Schäden {eur(ankauf.schaeden)}, Aufbereitung {eur(ankauf.aufbereitung)}, Sonstiges {eur(ankauf.sonstige)}. <button style={{ ...s.btn, marginLeft: 8 }} disabled={busy} onClick={() => void ausAnkauf()}>Als Planposten übernehmen</button></div>}
        <div style={s.feldRaster}>
          <label style={s.lab}>Art<select style={s.inp} value={neu.art} onChange={(e) => setNeu({ ...neu, art: e.target.value })}>{KOSTEN_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select></label>
          <label style={s.lab}>Bezeichnung<input style={s.inp} value={neu.bezeichnung} maxLength={160} onChange={(e) => setNeu({ ...neu, bezeichnung: e.target.value })} placeholder="z. B. Bremsen vorn" /></label>
          <label style={s.lab}>Betrag netto (€)<input style={s.inp} inputMode="decimal" value={neu.betrag} onChange={(e) => setNeu({ ...neu, betrag: e.target.value })} /></label>
          <label style={{ ...s.haken, alignSelf: 'end' }}><input type="checkbox" checked={neu.plan} onChange={(e) => setNeu({ ...neu, plan: e.target.checked })} /> nur geplant</label>
        </div>
        <button style={{ ...s.gold, marginTop: 10, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void postenNeu()}>＋ Kosten erfassen</button>
        {posten.length > 0 && (
          <table style={{ ...s.tab, marginTop: 12 }}><tbody>
            {posten.map((p) => (
              <tr key={p.id}>
                <td style={s.td}>{p.datum.split('-').reverse().join('.')}</td>
                <td style={s.td}>{KOSTEN_ARTEN.find((a) => a.key === p.art)?.name ?? p.art}{p.bezeichnung ? ` · ${p.bezeichnung}` : ''}</td>
                <td style={s.td}>{p.plan ? <span style={{ ...s.pill, color: C.info }}>Plan</span> : <span style={{ ...s.pill, color: C.ok }}>Ist</span>}</td>
                <td style={s.tdR}>{eur(p.betrag_netto)}</td>
                <td style={{ ...s.tdR, whiteSpace: 'nowrap' }}>
                  {p.plan && <button style={s.mini} disabled={busy} onClick={() => void erledigt(p)}>✓ angefallen</button>}
                  {loeschFrage === p.id
                    ? <><button style={{ ...s.mini, color: C.bad }} onClick={() => void postenWeg(p.id)}>Ja, weg</button><button style={s.mini} onClick={() => setLoeschFrage(null)}>Nein</button></>
                    : <button style={s.mini} aria-label="Posten löschen" onClick={() => setLoeschFrage(p.id)}>🗑</button>}
                </td>
              </tr>
            ))}
          </tbody></table>
        )}
        <div style={{ ...s.dim, marginTop: 8 }}>„nur geplant" zählt nur im Plan. „✓ angefallen" macht daraus Ist-Kosten; ein Planposten zählt nicht doppelt, sobald dieselbe Art als Ist erfasst ist.</div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0 },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 },
  feldRaster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 },
  h3: { margin: '0 0 10px', fontSize: 15, fontWeight: 800 },
  dim: { color: C.dim, fontSize: 13 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  haken: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 },
  btn: { background: C.navy3, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
  mini: { background: 'none', border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '2px 8px', marginLeft: 4, cursor: 'pointer', fontSize: 12 },
  pill: { display: 'inline-block', border: '1px solid currentColor', borderRadius: 999, padding: '1px 8px', fontSize: 11.5, fontWeight: 600 },
  tab: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 11.5, color: C.dim },
  thR: { textAlign: 'right', padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 11.5, color: C.dim },
  td: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5 },
  tdR: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px' },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, borderRadius: 8, padding: '8px 12px' },
  hinweis: { background: 'rgba(95,168,232,0.08)', border: '1px solid rgba(95,168,232,0.35)', borderRadius: 10, padding: '8px 12px', fontSize: 13.5 },
};
