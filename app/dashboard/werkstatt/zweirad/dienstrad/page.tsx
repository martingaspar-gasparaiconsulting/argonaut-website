'use client';

// ============================================================================
// ARGONAUT OS · /dashboard/werkstatt/zweirad/dienstrad — Dienstrad-Leasing (Paket 295, Z1)
//
// Ablauf wie in der Praxis: Angebot für den Mitarbeiter → im Leasing-Portal
// eingereicht → genehmigt (Bestell-/Auftragsnummer des Portals) → Rad aus
// dem Bestand zuordnen und übergeben (Rahmennummer, Ausweis, Einweisung) →
// Rechnung an den Leasinggeber. KEINE Schnittstelle zum Portal: Das Portal
// ist Ihr eigenes Händlerkonto, den Status setzen Sie hier von Hand.
// Preise netto in ganzen Cent, 19 % — der Endpreis fürs Portal wird genau so
// gerechnet wie die Rechnung. Logik: lib/zweirad.ts (getestet). „Sie".
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  DR_STATUS, UEBERGABE_PUNKTE, drStatusName, drWeiter, drWechselPruefen, drSumme, drKopfPruefen, drRechnungMoeglich, postenPruefen, postenAusEingabe,
  nettoAusBrutto, radName, kontaktLesen, datumDe, type DrForm, type DrPosten, type ZrKontakt,
} from '@/lib/zweirad';
import { euro } from '@/lib/geld';
import Leerzustand from '../../../_components/Leerzustand';
import { useDarfAbrechnen } from '../../../_components/useDarfAbrechnen';
import { C, s } from '../_teile/stil';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
type Rad = { id: string; marke: string; modell: string | null; rahmennummer: string | null; herkunft: string; status: string; vk_cent: number | null; akku_nr: string | null };
type Vo = {
  id: string; nummer: string | null; status: string; zweirad_id: string | null; arbeitnehmer_name: string; arbeitnehmer_kontakt_id: string | null; arbeitnehmer_telefon: string | null;
  arbeitgeber_name: string; portal: string | null; portal_nr: string | null; abholcode: string | null; leasinggeber_name: string | null; leasinggeber_anschrift: string | null;
  posten: DrPosten[]; uebergabe_check: Record<string, unknown> | null; uebergabe_am: string | null; rechnung_id: string | null; notiz: string | null; erstellt_am: string;
};
const LEER: DrForm = { arbeitnehmerName: '', arbeitnehmerKontaktId: '', arbeitnehmerTelefon: '', arbeitgeberName: '', portal: '', portalNr: '', abholcode: '', leasinggeberName: '', leasinggeberAnschrift: '', notiz: '' };
function formAus(v: Vo): DrForm {
  return {
    arbeitnehmerName: v.arbeitnehmer_name, arbeitnehmerKontaktId: v.arbeitnehmer_kontakt_id ?? '', arbeitnehmerTelefon: v.arbeitnehmer_telefon ?? '', arbeitgeberName: v.arbeitgeber_name,
    portal: v.portal ?? '', portalNr: v.portal_nr ?? '', abholcode: v.abholcode ?? '', leasinggeberName: v.leasinggeber_name ?? '', leasinggeberAnschrift: v.leasinggeber_anschrift ?? '', notiz: v.notiz ?? '',
  };
}
const OFFEN = ['angebot', 'eingereicht', 'genehmigt', 'uebergeben'];

export default function DienstradPage() {
  const darfAbrechnen = useDarfAbrechnen();
  const [vo, setVo] = useState<Vo[]>([]);
  const [raeder, setRaeder] = useState<Rad[]>([]);
  const [kontakte, setKontakte] = useState<ZrKontakt[]>([]);
  const [tab, setTab] = useState<'laufend' | 'alle'>('laufend');
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [neu, setNeu] = useState<DrForm | null>(null);
  const [offenId, setOffenId] = useState<string | null>(null);
  const [kopf, setKopf] = useState<DrForm | null>(null);
  const [zeile, setZeile] = useState({ bezeichnung: '', menge: '1', betrag: '', brutto: true });

  const lade = useCallback(async () => {
    const [v, r, k] = await Promise.all([
      supabase.from('dienstrad_vorgang').select('*').order('erstellt_am', { ascending: false }).limit(2000),
      supabase.from('zweirad').select('id, marke, modell, rahmennummer, herkunft, status, vk_cent, akku_nr').eq('herkunft', 'bestand').limit(5000),
      supabase.from('kontakte').select('*').limit(1000),
    ]);
    if (v.error) setFehler('Dienstrad-Leasing ist noch nicht eingerichtet (SQL zu Paket 295 fehlt) oder Ihnen fehlt das Recht „Werkstatt".');
    setVo(((v.data as Vo[] | null) ?? []).map((x) => ({ ...x, posten: Array.isArray(x.posten) ? x.posten : [] })));
    setRaeder((r.data as Rad[] | null) ?? []);
    setKontakte(((k.data as Record<string, unknown>[] | null) ?? []).map(kontaktLesen).sort((a, b) => a.name.localeCompare(b.name, 'de')));
    setLaden(false);
  }, []);
  useEffect(() => {
    void lade();
    try {
      const q = new URLSearchParams(window.location.search).get('vorgang');
      if (q && /^[0-9a-f-]{36}$/i.test(q)) { setOffenId(q); setTab('alle'); }
    } catch { /* ohne Adresse weiter */ }
  }, [lade]);

  const offen = useMemo(() => vo.find((v) => v.id === offenId) ?? null, [vo, offenId]);
  useEffect(() => { setKopf(offen ? formAus(offen) : null); }, [offen]);
  const radVon = useCallback((id: string | null) => (id ? raeder.find((r) => r.id === id) ?? null : null), [raeder]);
  const liste = useMemo(() => (tab === 'laufend' ? vo.filter((v) => OFFEN.includes(v.status)) : vo), [vo, tab]);
  const zahlen = useMemo(() => ({
    angebot: vo.filter((v) => v.status === 'angebot' || v.status === 'eingereicht').length,
    genehmigt: vo.filter((v) => v.status === 'genehmigt').length,
    abzurechnen: vo.filter((v) => v.status === 'uebergeben').length,
    umsatz: vo.filter((v) => v.status === 'abgerechnet').reduce((x, v) => x + drSumme(v.posten).netto_cent, 0),
  }), [vo]);
  // Räder, die noch frei sind (Bestand/reserviert, an keinem laufenden Vorgang)
  const freieRaeder = useMemo(() => raeder.filter((r) => (r.status === 'bestand' || r.status === 'reserviert')
    && !vo.some((v) => v.zweirad_id === r.id && v.status !== 'storniert' && v.id !== offenId)), [raeder, vo, offenId]);

  function fehlerText(error: { message?: string; code?: string } | null, standard: string): string {
    const m = `${error?.code ?? ''} ${error?.message ?? ''}`;
    if (/row-level|permission/i.test(m)) return 'Dafür braucht es das Schreibrecht „Werkstatt".';
    if (error?.message && /[äöüÄÖÜß]|Rad|Portal|Vorgang|Rechnung/.test(error.message)) return error.message;
    return standard;
  }

  async function anlegen() {
    if (!neu) return;
    const p = drKopfPruefen(neu);
    if (!p.ok) { setFehler(p.grund); return; }
    setBusy(true); setFehler(null); setOk(null);
    const { data, error } = await supabase.from('dienstrad_vorgang').insert(p.zeile).select('id, nummer');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler(fehlerText(error, 'Vorgang nicht angelegt.')); return; }
    setNeu(null); setOk(`Vorgang ${data[0].nummer} angelegt — tragen Sie jetzt die Positionen des Angebots ein.`);
    await lade(); setOffenId(data[0].id);
  }

  async function aendern(v: Vo, felder: Record<string, unknown>, okText: string): Promise<boolean> {
    setBusy(true); setFehler(null); setOk(null);
    const { data, error } = await supabase.from('dienstrad_vorgang').update(felder).eq('id', v.id).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler(fehlerText(error, 'Nicht gespeichert.')); return false; }
    setOk(okText); await lade(); return true;
  }

  async function kopfSpeichern(v: Vo) {
    if (!kopf) return;
    const p = drKopfPruefen(kopf);
    if (!p.ok) { setFehler(p.grund); return; }
    await aendern(v, p.zeile, 'Angaben gespeichert.');
  }

  async function postenNeu(v: Vo) {
    const p = postenAusEingabe(zeile.bezeichnung, zeile.menge, zeile.betrag, zeile.brutto);
    if (!p.ok) { setFehler(p.grund); return; }
    const liste = [...v.posten, p.posten];
    const pp = postenPruefen(liste);
    if (!pp.ok) { setFehler(pp.grund); return; }
    if (await aendern(v, { posten: pp.posten }, p.exakt ? 'Position übernommen.' : 'Position übernommen. Hinweis: Dieser Bruttobetrag lässt sich mit 19 % nicht centgenau treffen — maßgeblich ist der Endpreis unten.')) {
      setZeile({ bezeichnung: '', menge: '1', betrag: '', brutto: zeile.brutto });
    }
  }

  async function postenWeg(v: Vo, i: number) {
    const liste = v.posten.filter((_, j) => j !== i);
    await aendern(v, { posten: liste }, 'Position entfernt.');
  }

  async function radZuordnen(v: Vo, radId: string) {
    await aendern(v, { zweirad_id: radId || null }, radId ? 'Rad zugeordnet.' : 'Zuordnung gelöst.');
  }

  async function radPreisUebernehmen(v: Vo) {
    const r = radVon(v.zweirad_id);
    if (!r || r.vk_cent === null) { setFehler('Das Rad hat keinen Verkaufspreis.'); return; }
    const nb = nettoAusBrutto(r.vk_cent);
    const liste = [{ bezeichnung: radName(r).slice(0, 200), menge: 1, netto_cent: nb.netto_cent }, ...v.posten];
    const pp = postenPruefen(liste);
    if (!pp.ok) { setFehler(pp.grund); return; }
    await aendern(v, { posten: pp.posten }, 'Verkaufspreis des Rads als erste Position übernommen.');
  }

  async function wechseln(v: Vo, nach: string) {
    const r = radVon(v.zweirad_id);
    const p = drWechselPruefen(v, nach, r ? { id: r.id, herkunft: r.herkunft, status: r.status, rahmennummer: r.rahmennummer } : null);
    if (!p.ok) { setFehler(p.grund); return; }
    const texte: Record<string, string> = {
      eingereicht: 'Als „im Portal eingereicht" markiert. Sobald das Portal genehmigt, tragen Sie die Auftragsnummer ein.',
      angebot: 'Zurück auf „Angebot".',
      genehmigt: 'Genehmigt — das Rad ist für den Mitarbeiter reserviert, die Positionen sind jetzt fest.',
      uebergeben: 'Übergeben. Das Rad steht auf „verkauft". Als Nächstes die Rechnung an den Leasinggeber.',
      storniert: 'Storniert — ein reserviertes Rad ist wieder frei.',
    };
    await aendern(v, { status: nach }, texte[nach] ?? 'Gespeichert.');
  }

  async function haken(v: Vo, key: string, an: boolean) {
    await aendern(v, { uebergabe_check: { ...(v.uebergabe_check ?? {}), [key]: an } }, 'Gespeichert.');
  }

  async function rechnung(v: Vo) {
    if (v.rechnung_id && v.status === 'abgerechnet') { window.location.href = `/dashboard/rechnungen/${v.rechnung_id}`; return; }
    const m = drRechnungMoeglich(v);
    if (!m.ok) { setFehler(m.grund); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const res = await fetch('/api/rechnung-aus-dienstrad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vorgangId: v.id }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok && !(res.status === 409 && j.rechnungId)) throw new Error(j.error || 'Fehler');
      setOk(res.status === 409 ? 'Für diesen Vorgang gibt es bereits eine Rechnung.' : 'Rechnung an den Leasinggeber erstellt. Laden Sie sie im Portal hoch bzw. senden Sie sie wie dort verlangt.');
      await lade();
    } catch (e) { setFehler('Rechnung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(false); }
  }

  async function kopieren(v: Vo) {
    const r = radVon(v.zweirad_id);
    const sm = drSumme(v.posten);
    const t = [
      `Dienstrad ${v.nummer ?? ''} · ${v.arbeitnehmer_name} (${v.arbeitgeber_name})`,
      r ? `Rad: ${radName(r)}${r.rahmennummer ? ` · Rahmennummer ${r.rahmennummer}` : ''}${r.akku_nr ? ` · Akku ${r.akku_nr}` : ''}` : 'Rad: noch nicht zugeordnet',
      ...v.posten.map((p) => `${p.menge} × ${p.bezeichnung}: ${euro((p.menge * p.netto_cent) / 100)} netto`),
      `Summe netto ${euro(sm.netto_cent / 100)} · 19 % USt ${euro(sm.steuer_cent / 100)} · Endpreis ${euro(sm.brutto_cent / 100)}`,
    ].join('\n');
    try { await navigator.clipboard.writeText(t); setOk('Angaben fürs Portal kopiert.'); } catch { setFehler('Kopieren ging nicht.'); }
  }

  async function loeschen(v: Vo) {
    if (!window.confirm(`Vorgang ${v.nummer} löschen?`)) return;
    setBusy(true); setFehler(null);
    const { data, error } = await supabase.from('dienstrad_vorgang').delete().eq('id', v.id).select('id');
    setBusy(false);
    if (error || !data || data.length === 0) { setFehler('Nicht gelöscht — löschen darf nur der Chef, und übergebene Vorgänge bleiben erhalten.'); return; }
    setOffenId(null); setOk('Vorgang gelöscht.'); await lade();
  }

  const kopfFeld = (k: keyof DrForm, label: string, gesperrt = false, extra: Record<string, unknown> = {}) => kopf && (
    <label style={s.feld}>{label}<input value={kopf[k]} disabled={gesperrt} style={s.eingabe} onChange={(e) => setKopf({ ...kopf, [k]: e.target.value })} {...extra} /></label>
  );

  return (
    <div style={s.page}>
      <a href="/dashboard/werkstatt/zweirad" style={s.zurueck}>← Zweirad &amp; E-Bike</a>
      <h1 style={s.h1}>💼 Dienstrad-Leasing</h1>
      <p style={s.dim}>
        So geht&apos;s: Für den Mitarbeiter eines Arbeitgebers legen Sie einen Vorgang an und tragen die Positionen ein (Rad, Zubehör, Service).
        Den Endpreis übernehmen Sie in Ihr Händlerkonto beim Leasing-Portal — ARGONAUT ist mit keinem Portal verbunden, den Stand setzen Sie hier von Hand.
        Nach der Genehmigung ordnen Sie das Rad aus Ihrem Bestand zu, übergeben es mit Rahmennummer und stellen die Rechnung an den Leasinggeber.
      </p>
      {fehler && <p style={{ ...s.dim, color: C.bad, fontWeight: 700 }}>{fehler}</p>}
      {ok && <p style={{ ...s.dim, color: C.ok, fontWeight: 700 }}>{ok}</p>}
      {laden && <p style={s.dim}>Lädt …</p>}

      {!laden && (
        <>
          <div style={s.kacheln}>
            <div style={s.kachel}><b style={s.zahl}>{zahlen.angebot}</b><span style={s.dim}>Angebote / im Portal</span></div>
            <div style={s.kachel}><b style={s.zahl}>{zahlen.genehmigt}</b><span style={s.dim}>genehmigt, Übergabe offen</span></div>
            <div style={{ ...s.kachel, borderColor: zahlen.abzurechnen ? C.warn : C.border }}><b style={{ ...s.zahl, color: zahlen.abzurechnen ? C.warn : C.text }}>{zahlen.abzurechnen}</b><span style={s.dim}>übergeben, Rechnung offen</span></div>
            <div style={s.kachel}><b style={s.zahl}>{euro(zahlen.umsatz / 100)}</b><span style={s.dim}>abgerechnet (netto)</span></div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 12px' }}>
            {([['laufend', '⏳ Laufend'], ['alle', '📋 Alle']] as [typeof tab, string][]).map(([k, l]) => (
              <button key={k} type="button" style={tab === k ? s.tabAn : s.tab} onClick={() => setTab(k)}>{l}</button>
            ))}
            {!neu && <button type="button" style={{ ...s.btnGold, marginLeft: 'auto' }} onClick={() => { setNeu({ ...LEER }); setOffenId(null); setOk(null); }}>＋ Neuer Vorgang</button>}
          </div>

          {neu && (
            <div style={s.box}>
              <b style={{ color: C.gold }}>Neuer Dienstrad-Vorgang</b>
              <div style={s.raster}>
                <label style={s.feld}>Mitarbeiter aus Kontakten
                  <select value={neu.arbeitnehmerKontaktId} style={s.eingabe} onChange={(e) => {
                    const k = kontakte.find((x) => x.id === e.target.value);
                    setNeu({ ...neu, arbeitnehmerKontaktId: e.target.value, arbeitnehmerName: k ? k.name : neu.arbeitnehmerName, arbeitnehmerTelefon: k?.telefon ?? neu.arbeitnehmerTelefon });
                  }}>
                    <option value="">— neu / Freitext —</option>
                    {kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                </label>
                <label style={s.feld}>Mitarbeiter (Nutzer) *<input value={neu.arbeitnehmerName} maxLength={120} style={s.eingabe} onChange={(e) => setNeu({ ...neu, arbeitnehmerName: e.target.value })} /></label>
                <label style={s.feld}>Telefon<input value={neu.arbeitnehmerTelefon} maxLength={40} style={s.eingabe} onChange={(e) => setNeu({ ...neu, arbeitnehmerTelefon: e.target.value })} /></label>
                <label style={s.feld}>Arbeitgeber *<input value={neu.arbeitgeberName} maxLength={160} style={s.eingabe} onChange={(e) => setNeu({ ...neu, arbeitgeberName: e.target.value })} /></label>
                <label style={s.feld}>Leasing-Portal<input value={neu.portal} maxLength={80} placeholder="Name des Portals" style={s.eingabe} onChange={(e) => setNeu({ ...neu, portal: e.target.value })} /></label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" style={s.btnGold} disabled={busy} onClick={() => void anlegen()}>💾 Anlegen</button>
                <button type="button" style={s.btnAus} onClick={() => setNeu(null)}>Abbrechen</button>
              </div>
            </div>
          )}

          {vo.length === 0 && !neu && (
            <Leerzustand icon="💼" titel="Noch keine Dienstrad-Vorgänge" text="Legen Sie den ersten Vorgang an, sobald ein Mitarbeiter ein Rad über seinen Arbeitgeber leasen möchte." aktionText="＋ Neuer Vorgang" onAktion={() => setNeu({ ...LEER })} />
          )}

          {vo.length > 0 && (liste.length === 0 ? <p style={s.dim}>Keine laufenden Vorgänge.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.tabelle}>
                <thead><tr><th style={s.th}>Nr.</th><th style={s.th}>Mitarbeiter · Arbeitgeber</th><th style={s.th}>Portal · Auftrag</th><th style={s.th}>Rad</th><th style={s.th}>Endpreis</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
                <tbody>
                  {liste.map((v) => {
                    const r = radVon(v.zweirad_id);
                    return (
                      <tr key={v.id} style={offenId === v.id ? { background: 'rgba(201,168,76,0.08)' } : undefined}>
                        <td style={s.td}>{v.nummer}<div style={{ color: C.dim, fontSize: 12 }}>{datumDe(v.erstellt_am)}</div></td>
                        <td style={s.td}><b>{v.arbeitnehmer_name}</b><div style={{ color: C.dim, fontSize: 12.5 }}>{v.arbeitgeber_name}</div></td>
                        <td style={s.td}>{v.portal ?? '—'}<div style={{ color: C.dim, fontSize: 12.5 }}>{v.portal_nr ?? ''}</div></td>
                        <td style={s.td}>{r ? radName(r, true) : '—'}</td>
                        <td style={s.td}>{v.posten.length ? euro(drSumme(v.posten).brutto_cent / 100) : '—'}</td>
                        <td style={s.td}><span style={s.marke}>{drStatusName(v.status)}</span></td>
                        <td style={s.td}><button type="button" style={s.link} onClick={() => { setOffenId(offenId === v.id ? null : v.id); setNeu(null); setOk(null); setFehler(null); }}>{offenId === v.id ? 'schließen' : 'öffnen'}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {offen && kopf && (() => {
            const v = offen;
            const r = radVon(v.zweirad_id);
            const sm = drSumme(v.posten);
            const postenOffen = v.status === 'angebot' || v.status === 'eingereicht';
            const fest = v.status === 'uebergeben' || v.status === 'abgerechnet' || v.status === 'storniert';
            return (
              <div style={{ ...s.box, borderColor: C.gold }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ color: C.gold, fontSize: 16 }}>{v.nummer} · {v.arbeitnehmer_name}</b>
                  <span style={s.marke}>{drStatusName(v.status)}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '10px 0' }}>
                  {DR_STATUS.filter((x) => x.key !== 'storniert').map((x, i) => {
                    const idx = DR_STATUS.findIndex((y) => y.key === v.status);
                    const erreicht = v.status !== 'storniert' && i <= idx;
                    return <span key={x.key} style={{ ...s.marke, color: erreicht ? C.navy : C.dim, background: erreicht ? C.gold : 'transparent' }}>{i + 1}. {x.label}</span>;
                  })}
                </div>

                <h2 style={{ ...s.h2, marginTop: 6 }}>Angaben</h2>
                <div style={s.raster}>
                  {kopfFeld('arbeitnehmerName', 'Mitarbeiter (Nutzer) *', fest, { maxLength: 120 })}
                  {kopfFeld('arbeitnehmerTelefon', 'Telefon', v.status === 'storniert' || v.status === 'abgerechnet', { maxLength: 40 })}
                  {kopfFeld('arbeitgeberName', 'Arbeitgeber *', fest, { maxLength: 160 })}
                  {kopfFeld('portal', 'Leasing-Portal', fest, { maxLength: 80 })}
                  {kopfFeld('portalNr', 'Bestell- / Auftragsnummer des Portals', fest, { maxLength: 60 })}
                  {kopfFeld('abholcode', 'Abholcode (falls vom Portal vergeben)', v.status === 'storniert' || v.status === 'abgerechnet', { maxLength: 40 })}
                  {kopfFeld('leasinggeberName', 'Leasinggeber (Rechnungsempfänger)', v.status === 'storniert' || v.status === 'abgerechnet', { maxLength: 160 })}
                  <label style={s.feld}>Anschrift Leasinggeber<textarea rows={3} maxLength={400} value={kopf.leasinggeberAnschrift} disabled={v.status === 'storniert' || v.status === 'abgerechnet'} style={s.eingabe} onChange={(e) => setKopf({ ...kopf, leasinggeberAnschrift: e.target.value })} /></label>
                  {kopfFeld('notiz', 'Notiz', v.status === 'storniert' || v.status === 'abgerechnet', { maxLength: 1000 })}
                </div>
                {v.status !== 'storniert' && v.status !== 'abgerechnet' && <button type="button" style={{ ...s.btnAus, marginTop: 8 }} disabled={busy} onClick={() => void kopfSpeichern(v)}>💾 Angaben speichern</button>}

                <h2 style={s.h2}>Rad</h2>
                {fest || v.status === 'storniert' ? (
                  <p style={s.dim}>{r ? <a href={`/dashboard/werkstatt/zweirad/${r.id}`} style={s.link}>{radName(r, true)}</a> : 'Kein Rad zugeordnet.'}</p>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={v.zweirad_id ?? ''} style={{ ...s.eingabe, minWidth: 280 }} disabled={busy} onChange={(e) => void radZuordnen(v, e.target.value)}>
                      <option value="">— noch kein Rad —</option>
                      {r && !freieRaeder.some((x) => x.id === r.id) && <option value={r.id}>{radName(r, true)}</option>}
                      {freieRaeder.map((x) => <option key={x.id} value={x.id}>{radName(x, true)}{x.vk_cent !== null ? ` · ${euro(x.vk_cent / 100)}` : ''}</option>)}
                    </select>
                    {r && postenOffen && r.vk_cent !== null && <button type="button" style={s.btnAus} disabled={busy} onClick={() => void radPreisUebernehmen(v)}>Verkaufspreis als Position</button>}
                    {r && !r.rahmennummer && <span style={{ color: C.warn, fontSize: 13 }}>Rahmennummer fehlt — in der <a href={`/dashboard/werkstatt/zweirad/${r.id}`} style={s.link}>Rad-Akte</a> nachtragen.</span>}
                  </div>
                )}

                <h2 style={s.h2}>Positionen {postenOffen ? '' : '(vom Portal genehmigt — fest)'}</h2>
                {v.posten.length > 0 && (
                  <table style={s.tabelle}>
                    <thead><tr><th style={s.th}>Menge</th><th style={s.th}>Bezeichnung</th><th style={{ ...s.th, textAlign: 'right' }}>Einzel netto</th><th style={{ ...s.th, textAlign: 'right' }}>Summe netto</th><th style={s.th}></th></tr></thead>
                    <tbody>
                      {v.posten.map((p, i) => (
                        <tr key={i}>
                          <td style={s.td}>{p.menge}</td>
                          <td style={s.td}>{p.bezeichnung}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{euro(p.netto_cent / 100)}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{euro((p.menge * p.netto_cent) / 100)}</td>
                          <td style={s.td}>{postenOffen && <button type="button" style={s.link} disabled={busy} onClick={() => void postenWeg(v, i)}>entfernen</button>}</td>
                        </tr>
                      ))}
                      <tr><td style={s.td} colSpan={3}>Summe netto</td><td style={{ ...s.td, textAlign: 'right' }}>{euro(sm.netto_cent / 100)}</td><td style={s.td} /></tr>
                      <tr><td style={s.td} colSpan={3}>Umsatzsteuer 19 %</td><td style={{ ...s.td, textAlign: 'right' }}>{euro(sm.steuer_cent / 100)}</td><td style={s.td} /></tr>
                      <tr><td style={{ ...s.td, fontWeight: 800, color: C.gold }} colSpan={3}>Endpreis fürs Portal (so steht er auch auf der Rechnung)</td><td style={{ ...s.td, textAlign: 'right', fontWeight: 800, color: C.gold }}>{euro(sm.brutto_cent / 100)}</td><td style={s.td} /></tr>
                    </tbody>
                  </table>
                )}
                {postenOffen && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
                    <label style={{ ...s.feld, flex: '2 1 220px' }}>Bezeichnung<input value={zeile.bezeichnung} maxLength={200} placeholder="z. B. Fahrradschloss, Inspektionspaket" style={s.eingabe} onChange={(e) => setZeile({ ...zeile, bezeichnung: e.target.value })} /></label>
                    <label style={{ ...s.feld, flex: '0 1 80px' }}>Menge<input value={zeile.menge} inputMode="numeric" style={s.eingabe} onChange={(e) => setZeile({ ...zeile, menge: e.target.value })} /></label>
                    <label style={{ ...s.feld, flex: '1 1 120px' }}>Betrag (€)<input value={zeile.betrag} inputMode="decimal" style={s.eingabe} onChange={(e) => setZeile({ ...zeile, betrag: e.target.value })} /></label>
                    <label style={{ ...s.feld, flex: '0 1 120px' }}>ist
                      <select value={zeile.brutto ? 'b' : 'n'} style={s.eingabe} onChange={(e) => setZeile({ ...zeile, brutto: e.target.value === 'b' })}><option value="b">brutto</option><option value="n">netto</option></select>
                    </label>
                    <button type="button" style={s.btnAus} disabled={busy} onClick={() => void postenNeu(v)}>＋ Position</button>
                  </div>
                )}
                {v.posten.length > 0 && <button type="button" style={{ ...s.btnAus, marginTop: 10 }} onClick={() => void kopieren(v)}>📋 Angaben fürs Portal kopieren</button>}

                {v.status === 'genehmigt' && (
                  <>
                    <h2 style={s.h2}>Übergabe</h2>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {UEBERGABE_PUNKTE.map((p) => (
                        <label key={p.key} style={{ fontSize: 14 }}>
                          <input type="checkbox" disabled={busy} checked={(v.uebergabe_check ?? {})[p.key] === true} onChange={(e) => void haken(v, p.key, e.target.checked)} /> {p.label}{p.pflicht ? ' *' : ''}
                        </label>
                      ))}
                    </div>
                  </>
                )}
                {v.uebergabe_am && <p style={s.dim}>Übergeben am {datumDe(v.uebergabe_am)}.</p>}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  {drWeiter(v.status).map((n) => (
                    <button key={n} type="button" style={n === 'storniert' ? { ...s.btnAus, color: C.bad } : n === 'angebot' ? s.btnAus : s.btnGold} disabled={busy} onClick={() => void wechseln(v, n)}>
                      {n === 'eingereicht' ? '📤 Im Portal eingereicht' : n === 'genehmigt' ? '✅ Vom Portal genehmigt' : n === 'uebergeben' ? '🚲 Rad übergeben' : n === 'angebot' ? '↩ Zurück zum Angebot' : '✖ Stornieren'}
                    </button>
                  ))}
                  {(v.status === 'uebergeben' || v.status === 'abgerechnet') && darfAbrechnen !== false && (
                    <button type="button" style={s.btnGold} disabled={busy} onClick={() => void rechnung(v)}>{v.status === 'abgerechnet' && v.rechnung_id ? '🧾 Rechnung öffnen' : '🧾 Rechnung an den Leasinggeber'}</button>
                  )}
                  {(v.status === 'angebot' || v.status === 'storniert') && <button type="button" style={{ ...s.btnAus, marginLeft: 'auto', color: C.dim }} disabled={busy} onClick={() => void loeschen(v)}>Löschen</button>}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
