'use client';

// ============================================================
// ARGONAUT OS · Partner-Aufträge an einem Bezug (Auftraggeber-Seite)
// Paket 278/279 (Kfz-Handelsakte, Reiter „Partner"), seit Paket 303 (N1) auch für
// Projekt, Auftrag und Objekt (/dashboard/netzwerk/bezug).
// Bei Fahrzeugen sieht der Partner die Positivliste (FIN, km, Fotos nur mit Freigabe),
// bei Projekt/Auftrag/Objekt nur dessen Namen — nie Preise, Kunde, Adresse, Notizen.
// Zugriff endet mit dem Auftrag oder beim Trennen. Schreiben: Chef oder Schreibrecht
// im Modul des Bezugs (Zugriffsregeln + Auslöser in der Datenbank).
// Partner ohne ARGONAUT per Gast-Link; Partner-Rechnungen prüfen und per Knopf übernehmen
// (Fahrzeug: Belegeingang + Fahrzeugkosten; sonst Belegeingang).
// ============================================================

import { useCallback, useEffect, useMemo, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { nichtsGeschrieben, NICHT_GESPEICHERT } from '@/lib/speichernPruefen';
import {
  aktionen, auftragPruefen, grundPruefen, partnerAuswahl, partnerSieht, statusName, statusStufe, laeuft, ueberfaellig, fehlerText,
  type Aktion, type Verbindung,
} from '@/lib/partnerNetzwerk';
import PartnerVerlauf, { type VerlaufEintrag } from '../kfz/partner/PartnerVerlauf';
import { artName, modulFuer, partnerSiehtAllgemein, type BezugTyp } from '@/lib/netzwerk';
import { euro } from '@/lib/geld';
import {
  GAST_TAGE_STANDARD, KOSTEN_ARTEN, RECHNUNG_STATUS, gastAuftragPruefen, gastLinkLage, gastLinkText, kostenArtVorschlag, rechnungStatusName,
} from '@/lib/partnerRechnung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, dim: C.dim };

export type Bezug = { typ: BezugTyp; id: string; owner_user_id: string; titel: string };
const MODUL_NAME: Record<string, string> = { kfz: 'Kfz', projekte: 'Projekte', auftraege: 'Aufträge', objektzeiten: 'Objektzeiten' };
type Auftrag = {
  id: string; nummer: string; partner_betrieb: string; titel: string; beschreibung: string | null; faellig_am: string | null;
  freigabe_fotos: boolean; freigabe_fin: boolean; freigabe_km: boolean; status: string; status_grund: string | null; erstellt_am: string;
  gast_name?: string | null; gast_kontakt?: string | null; gast_bis?: string | null; gast_gesperrt?: boolean;
};
type Rechnung = { id: string; auftrag_id: string; von_name: string | null; rechnungsnummer: string; rechnungsdatum: string; netto: number; ust_satz: number; ust_betrag: number; brutto: number; status: string; grund: string | null };
type EintragRoh = { id: string; auftrag_id: string; seite: string; von_name: string | null; art: string; text: string | null; fotos: string[] | null; erstellt_am: string };

function heute(): string { return new Date().toISOString().slice(0, 10); }
function de(iso: string | null | undefined): string { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }

export default function PartnerAuftraege({ bezug }: { bezug: Bezug }) {
  const fz = bezug;
  const istKfz = bezug.typ === 'kfz_bestand';
  const modul = modulFuer(bezug.typ) ?? 'kfz';
  const modulName = MODUL_NAME[modul] ?? modul;
  const [verb, setVerb] = useState<Verbindung[]>([]);
  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [eintraege, setEintraege] = useState<EintragRoh[]>([]);
  const [darfSchreiben, setDarfSchreiben] = useState(false);
  const [fehltSql, setFehltSql] = useState(false);
  const [neu, setNeu] = useState({ partner_betrieb: '', gast_name: '', gast_kontakt: '', titel: '', beschreibung: '', faellig_am: '', freigabe_fotos: false, freigabe_fin: false, freigabe_km: true });
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([]);
  const [mitGast, setMitGast] = useState(true);   // false = SQL 279 fehlt noch
  const [link, setLink] = useState<{ auftrag: string; text: string; link: string } | null>(null);
  const [tage, setTage] = useState<Record<string, string>>({});
  const [art, setArt] = useState<Record<string, string>>({});
  const [zurueck, setZurueck] = useState<{ id: string; text: string } | null>(null);
  const [grund, setGrund] = useState<{ auftrag: string; aktion: Aktion; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const lade = useCallback(async () => {
    const [v, a, rechte] = await Promise.all([
      supabase.from('betrieb_partner').select('*').order('erstellt_am', { ascending: false }),
      supabase.from('partner_auftrag').select('id, nummer, partner_betrieb, titel, beschreibung, faellig_am, freigabe_fotos, freigabe_fin, freigabe_km, status, status_grund, erstellt_am, gast_name, gast_kontakt, gast_bis, gast_gesperrt')
        .eq('bezug_id', fz.id).order('erstellt_am', { ascending: false }),
      supabase.rpc('mein_chef_id'),
    ]);
    // Paket 279 noch nicht eingespielt -> ohne Gast-Spalten weiter
    let roh: { data: unknown; error: unknown } = a;
    if (a.error) roh = await supabase.from('partner_auftrag').select('id, nummer, partner_betrieb, titel, beschreibung, faellig_am, freigabe_fotos, freigabe_fin, freigabe_km, status, status_grund, erstellt_am')
      .eq('bezug_id', fz.id).order('erstellt_am', { ascending: false });
    setMitGast(!a.error);
    setFehltSql(!!roh.error);
    setVerb(v.error ? [] : (((v.data as unknown) as Verbindung[]) ?? []));
    const af = roh.error ? [] : (((roh.data as unknown) as Auftrag[]) ?? []);
    setAuftraege(af);
    if (af.length && !a.error) {
      const r = await supabase.from('partner_rechnung').select('id, auftrag_id, von_name, rechnungsnummer, rechnungsdatum, netto, ust_satz, ust_betrag, brutto, status, grund')
        .in('auftrag_id', af.map((x) => x.id)).order('eingereicht_am');
      setRechnungen(r.error ? [] : (((r.data as unknown) as Rechnung[]) ?? []));
    } else setRechnungen([]);
    if (af.length) {
      const e = await supabase.from('partner_eintrag').select('id, auftrag_id, seite, von_name, art, text, fotos, erstellt_am')
        .in('auftrag_id', af.map((x) => x.id)).order('erstellt_am');
      setEintraege(e.error ? [] : (((e.data as unknown) as EintragRoh[]) ?? []));
    } else setEintraege([]);
    // Schreibrecht: Chef immer; Mitarbeiter nur mit Schreibrecht „kfz"
    if (!rechte.data) setDarfSchreiben(true);
    else {
      const d = await supabase.rpc('darf_ich_modul_aendern', { p_modul: modul });
      setDarfSchreiben(d.data === true);
    }
  }, [fz.id, modul]);

  useEffect(() => { void lade(); }, [lade]);

  const auswahl = useMemo(() => partnerAuswahl(verb, fz.owner_user_id), [verb, fz.owner_user_id]);
  const namen = useMemo(() => new Map(auswahl.map((x) => [x.betrieb, x.name])), [auswahl]);
  const vorschau = istKfz ? partnerSieht(neu) : partnerSiehtAllgemein(bezug.typ);

  async function senden() {
    if (neu.partner_betrieb === 'gast') return gastSenden();
    const p = auftragPruefen(neu, heute());
    if (!p.ok) { setMeldung({ ok: false, text: p.fehler }); return; }
    setBusy(true); setMeldung(null);
    try {
      const { data, error } = await supabase.from('partner_auftrag').insert({ ...p.felder, owner_user_id: fz.owner_user_id, bezug_typ: bezug.typ, bezug_id: fz.id }).select('id, nummer');
      if (error) throw new Error(fehlerText(error));
      if (nichtsGeschrieben(data)) throw new Error(NICHT_GESPEICHERT);
      const nr = ((data as unknown) as { nummer: string }[])[0]?.nummer ?? '';
      setNeu({ ...neu, titel: '', beschreibung: '', faellig_am: '', freigabe_fotos: false, freigabe_fin: false, freigabe_km: true });
      setMeldung({ ok: true, text: `Auftrag ${nr} an ${namen.get(p.felder.partner_betrieb) ?? 'den Partner'} gesendet. Der Partner wird in seiner Glocke benachrichtigt.` });
      await lade();
    } catch (e) {
      setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler beim Senden.' });
    } finally { setBusy(false); }
  }

  async function gastSenden() {
    const p = gastAuftragPruefen(neu, heute());
    if (!p.ok) { setMeldung({ ok: false, text: p.fehler }); return; }
    setBusy(true); setMeldung(null);
    try {
      const { data, error } = await supabase.from('partner_auftrag').insert({ ...p.felder, owner_user_id: fz.owner_user_id, bezug_typ: bezug.typ, bezug_id: fz.id }).select('id, nummer');
      if (error) throw new Error(fehlerText(error));
      if (nichtsGeschrieben(data)) throw new Error(NICHT_GESPEICHERT);
      const z = ((data as unknown) as { id: string; nummer: string }[])[0];
      setNeu({ ...neu, gast_name: '', gast_kontakt: '', titel: '', beschreibung: '', faellig_am: '', freigabe_fotos: false, freigabe_fin: false, freigabe_km: true });
      await lade();
      await gastLink({ id: z.id, nummer: z.nummer, titel: p.felder.titel } as Auftrag);
    } catch (e) {
      setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler beim Senden.' });
    } finally { setBusy(false); }
  }

  async function gastLink(a: Auftrag) {
    setBusy(true); setMeldung(null);
    try {
      const t = Number(tage[a.id] || GAST_TAGE_STANDARD);
      const r = await fetch('/api/partner/gast-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auftrag: a.id, tage: t }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || typeof j?.link !== 'string') throw new Error(j?.error || 'Link konnte nicht erstellt werden.');
      const firma = await supabase.from('profiles').select('firma_name').eq('id', fz.owner_user_id).maybeSingle();
      const name = ((firma.data as { firma_name?: string | null } | null)?.firma_name ?? '').trim();
      setLink({ auftrag: a.id, link: j.link, text: gastLinkText(name, `${a.nummer} · ${a.titel}`, j.link, String(j.bis || '')) });
      await lade();
    } catch (e) {
      setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Link konnte nicht erstellt werden.' });
    } finally { setBusy(false); }
  }

  async function gastSperren(a: Auftrag) {
    if (typeof window !== 'undefined' && !window.confirm('Gast-Link sperren? Der Partner kommt danach nicht mehr an den Auftrag. Ein neuer Link hebt die Sperre auf.')) return;
    setBusy(true); setMeldung(null);
    const { data, error } = await supabase.from('partner_auftrag').update({ gast_gesperrt: true }).eq('id', a.id).select('id');
    setBusy(false);
    if (error || nichtsGeschrieben(data)) { setMeldung({ ok: false, text: error ? fehlerText(error) : NICHT_GESPEICHERT }); return; }
    if (link?.auftrag === a.id) setLink(null);
    setMeldung({ ok: true, text: 'Gast-Link gesperrt.' });
    await lade();
  }

  async function uebernehmen(r: Rechnung, a: Auftrag) {
    const k = istKfz ? (art[r.id] || kostenArtVorschlag(a.titel)) : 'fremd';
    const frage = istKfz
      ? `Rechnung Nr. ${r.rechnungsnummer} über ${euro(r.brutto)} brutto in den Belegeingang und mit ${euro(r.netto)} netto in die Fahrzeugkosten übernehmen?`
      : `Rechnung Nr. ${r.rechnungsnummer} über ${euro(r.brutto)} brutto als Fremdleistung in den Belegeingang übernehmen?`;
    if (typeof window !== 'undefined' && !window.confirm(frage)) return;
    setBusy(true); setMeldung(null);
    const res = await fetch('/api/partner/rechnung-uebernehmen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rechnung: r.id, art: k }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMeldung({ ok: false, text: j?.error || 'Übernehmen fehlgeschlagen.' }); return; }
    setMeldung({ ok: true, text: istKfz ? `Rechnung Nr. ${r.rechnungsnummer} steht jetzt im Belegeingang und in der Kalkulation.` : `Rechnung Nr. ${r.rechnungsnummer} steht jetzt im Belegeingang (Fremdleistung).` });
    await lade();
  }

  async function zurueckweisen(r: Rechnung, text: string) {
    if (!text.trim()) { setMeldung({ ok: false, text: 'Bitte den Grund angeben (der Partner sieht ihn).' }); return; }
    setBusy(true); setMeldung(null);
    const { error } = await supabase.rpc('p279_rechnung_ablehnen', { p_rechnung: r.id, p_grund: text });
    setBusy(false);
    if (error) { setMeldung({ ok: false, text: fehlerText(error) }); return; }
    setZurueck(null);
    setMeldung({ ok: true, text: `Rechnung Nr. ${r.rechnungsnummer} zurückgewiesen.` });
    await lade();
  }

  async function kopieren(t: string) {
    try { await navigator.clipboard.writeText(t); setMeldung({ ok: true, text: 'In die Zwischenablage kopiert.' }); }
    catch { setMeldung({ ok: false, text: 'Kopieren ging nicht — bitte den Text markieren und kopieren.' }); }
  }

  async function status(a: Auftrag, akt: Aktion, grundText: string) {
    const g = grundPruefen(akt, grundText);
    if (!g.ok) { setMeldung({ ok: false, text: g.fehler }); return; }
    if (akt.rueckfrage && typeof window !== 'undefined' && !window.confirm(akt.rueckfrage)) return;
    setBusy(true); setMeldung(null);
    const { error } = await supabase.rpc('p278_status', { p_auftrag: a.id, p_neu: akt.neu, p_grund: g.grund });
    setBusy(false);
    if (error) { setMeldung({ ok: false, text: fehlerText(error) }); return; }
    setGrund(null);
    setMeldung({ ok: true, text: `Auftrag ${a.nummer}: ${statusName(akt.neu)}.` });
    await lade();
  }

  async function freigabe(a: Auftrag, feld: 'freigabe_fotos' | 'freigabe_fin' | 'freigabe_km', wert: boolean) {
    setBusy(true); setMeldung(null);
    const { data, error } = await supabase.from('partner_auftrag').update({ [feld]: wert }).eq('id', a.id).select('id');
    setBusy(false);
    if (error || nichtsGeschrieben(data)) { setMeldung({ ok: false, text: error ? fehlerText(error) : NICHT_GESPEICHERT }); return; }
    await lade();
  }

  if (fehltSql) {
    return <div style={k.karte}><h3 style={k.h3}>Partner</h3><div style={k.dim}>Das Partner-Netzwerk ist noch nicht eingerichtet (SQL Paket 278 fehlt).</div></div>;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={k.karte}>
        <h3 style={k.h3}>Auftrag an einen Partner-Betrieb</h3>
        <div style={k.dim}>{istKfz
          ? 'Lackierer, Aufbereiter, Sattler, Gutachter … Der Partner arbeitet in seinem eigenen ARGONAUT und sieht nur dieses Fahrzeug — ohne Preise und ohne Kunde.'
          : `Subunternehmer, anderes Gewerk, Freelancer, Zulieferer … Der Partner arbeitet in seinem eigenen ARGONAUT und sieht nur den Namen dieses ${artName(bezug.typ) === 'Auftrag' ? 'Auftrags' : artName(bezug.typ) === 'Objekt' ? 'Objekts' : 'Projekts'} und seine Aufgabe — ohne Kunde, Adresse und Preise.`}</div>
        {auswahl.length === 0 && (
          <div style={{ ...k.hinweis, marginTop: 10 }}>
            Noch kein Partner-Betrieb verbunden. <a href={istKfz ? '/dashboard/kfz/partner?reiter=verbindungen' : '/dashboard/netzwerk?reiter=verbindungen'} style={k.link}>Partner-Netzwerk öffnen →</a> Dort erstellt die Geschäftsleitung einen Einladungs-Code.{mitGast ? ' Partner ohne ARGONAUT erreichen Sie per Gast-Link.' : ''}
          </div>
        )}
        {(auswahl.length > 0 || mitGast) && darfSchreiben ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, marginTop: 10 }}>
              <label style={k.lab}>Partner
                <select style={k.inp} value={neu.partner_betrieb} onChange={(x) => setNeu({ ...neu, partner_betrieb: x.target.value })}>
                  <option value="">— wählen —</option>
                  {auswahl.map((p) => <option key={p.betrieb} value={p.betrieb}>{p.name}</option>)}
                  {mitGast && <option value="gast">Partner ohne ARGONAUT (Gast-Link)</option>}
                </select>
              </label>
              {neu.partner_betrieb === 'gast' && (
                <>
                  <label style={k.lab}>Name des Partners<input style={k.inp} value={neu.gast_name} maxLength={120} placeholder={istKfz ? 'z. B. Lackiererei Muster' : 'z. B. Fliesen Muster GmbH'} onChange={(x) => setNeu({ ...neu, gast_name: x.target.value })} /></label>
                  <label style={k.lab}>Kontakt (nur für Sie)<input style={k.inp} value={neu.gast_kontakt} maxLength={200} placeholder="Telefon oder E-Mail" onChange={(x) => setNeu({ ...neu, gast_kontakt: x.target.value })} /></label>
                </>
              )}
              <label style={k.lab}>Was ist zu tun?<input style={k.inp} value={neu.titel} maxLength={120} placeholder={istKfz ? 'z. B. Stoßfänger hinten lackieren' : 'z. B. Estrich im Erdgeschoss'} onChange={(x) => setNeu({ ...neu, titel: x.target.value })} /></label>
              <label style={k.lab}>Fertig bis<input type="date" style={k.inp} value={neu.faellig_am} onChange={(x) => setNeu({ ...neu, faellig_am: x.target.value })} /></label>
            </div>
            <label style={{ ...k.lab, marginTop: 8 }}>Beschreibung (optional)
              <textarea style={{ ...k.inp, minHeight: 60, fontFamily: 'inherit' }} value={neu.beschreibung} maxLength={1000} onChange={(x) => setNeu({ ...neu, beschreibung: x.target.value })} />
            </label>
            {istKfz && <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
              <label style={k.haken}><input type="checkbox" checked={neu.freigabe_km} onChange={(x) => setNeu({ ...neu, freigabe_km: x.target.checked })} />Kilometerstand zeigen</label>
              <label style={k.haken}><input type="checkbox" checked={neu.freigabe_fin} onChange={(x) => setNeu({ ...neu, freigabe_fin: x.target.checked })} />FIN zeigen</label>
              <label style={k.haken}><input type="checkbox" checked={neu.freigabe_fotos} onChange={(x) => setNeu({ ...neu, freigabe_fotos: x.target.checked })} />Fahrzeugfotos zeigen</label>
            </div>}
            <div style={{ ...k.vorschau, marginTop: 8 }}>
              <div><b style={{ color: C.ok }}>Der Partner sieht:</b> {vorschau.sieht.join(' · ')}</div>
              <div><b style={{ color: C.bad }}>Nie:</b> {vorschau.nie.join(' · ')}</div>
            </div>
            <button style={{ ...k.gold, marginTop: 10 }} disabled={busy} onClick={() => void senden()}>{neu.partner_betrieb === 'gast' ? 'Auftrag anlegen und Gast-Link erstellen' : 'Auftrag an Partner senden'}</button>
          </>
        ) : !darfSchreiben ? <div style={{ ...k.dim, marginTop: 8 }}>Aufträge an Partner vergeben nur Personen mit Schreibrecht „{modulName}".</div> : null}
        {meldung && <div style={{ marginTop: 8, fontSize: 13, color: meldung.ok ? C.ok : C.bad }}>{meldung.text}</div>}
      </div>

      {auftraege.map((a) => {
        const eig: VerlaufEintrag[] = eintraege.filter((e) => e.auftrag_id === a.id).map((e) => ({ ...e, fotos: (e.fotos ?? []).length }));
        const knoepfe = aktionen('auftraggeber', a.status, darfSchreiben);
        const offen = laeuft(a.status);
        return (
          <div key={a.id} style={k.karte}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800 }}>{a.nummer} · {a.titel}</div>
                <div style={k.dim}>an {a.gast_name ? `${a.gast_name} (Gast)` : (namen.get(a.partner_betrieb) ?? 'Partner (Verbindung getrennt)')}{a.gast_kontakt ? ` · ${a.gast_kontakt}` : ''} · erstellt {de(a.erstellt_am)} · fertig bis {de(a.faellig_am)}
                  {ueberfaellig(a, heute()) && <span style={{ color: C.bad, fontWeight: 700 }}> · überfällig</span>}</div>
              </div>
              <span style={{ ...k.badge, color: FARBE[statusStufe(a.status)], borderColor: FARBE[statusStufe(a.status)] }}>{statusName(a.status)}</span>
            </div>
            {a.beschreibung && <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, marginTop: 6 }}>{a.beschreibung}</div>}
            {a.status_grund && <div style={{ ...k.dim, marginTop: 4 }}>Grund: {a.status_grund}</div>}
            {istKfz && <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
              {(['freigabe_km', 'freigabe_fin', 'freigabe_fotos'] as const).map((f) => (
                <label key={f} style={{ ...k.haken, opacity: offen && darfSchreiben ? 1 : 0.6 }}>
                  <input type="checkbox" checked={a[f]} disabled={!offen || !darfSchreiben || busy} onChange={(x) => void freigabe(a, f, x.target.checked)} />
                  {f === 'freigabe_km' ? 'km' : f === 'freigabe_fin' ? 'FIN' : 'Fotos'} freigegeben
                </label>
              ))}
            </div>}
            {knoepfe.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {knoepfe.map((akt) => (
                  <button key={akt.neu} style={akt.neu === 'beendet' ? k.gold : k.aus} disabled={busy}
                    onClick={() => (akt.grund === 'nein' ? void status(a, akt, '') : setGrund({ auftrag: a.id, aktion: akt, text: '' }))}>{akt.text}</button>
                ))}
              </div>
            )}
            {grund && grund.auftrag === a.id && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <input style={{ ...k.inp, flex: '1 1 220px' }} value={grund.text} maxLength={300}
                  placeholder={grund.aktion.grund === 'pflicht' ? 'Grund (Pflicht)' : 'Grund (optional)'} onChange={(x) => setGrund({ ...grund, text: x.target.value })} />
                <button style={k.gold} disabled={busy} onClick={() => void status(a, grund.aktion, grund.text)}>{grund.aktion.text}</button>
                <button style={k.aus} onClick={() => setGrund(null)}>Abbrechen</button>
              </div>
            )}
            {a.gast_name && (() => {
              const lage = gastLinkLage({ gast_bis: a.gast_bis ?? null, gast_gesperrt: !!a.gast_gesperrt }, new Date().toISOString());
              const darfLink = darfSchreiben && (offen || rechnungen.some((r) => r.auftrag_id === a.id) || a.status === 'beendet');
              return (
                <div style={{ ...k.vorschau, marginTop: 10 }}>
                  <div><b>Gast-Link:</b> {lage === 'aktiv' ? `gültig bis ${de(a.gast_bis)}` : lage === 'gesperrt' ? 'gesperrt' : lage === 'abgelaufen' ? `abgelaufen am ${de(a.gast_bis)}` : 'noch keiner erstellt'}
                    <span style={k.dim}> · Der Link wird nur einmal angezeigt; ein neuer Link macht den alten ungültig.</span></div>
                  {darfLink && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select style={{ ...k.inp, padding: '6px 8px' }} value={tage[a.id] || String(GAST_TAGE_STANDARD)} onChange={(x) => setTage({ ...tage, [a.id]: x.target.value })}>
                        {[7, 14, 30, 60].map((t) => <option key={t} value={String(t)}>{t} Tage gültig</option>)}
                      </select>
                      <button style={k.aus} disabled={busy} onClick={() => void gastLink(a)}>{lage === 'keiner' ? 'Gast-Link erstellen' : 'Neuen Gast-Link erstellen'}</button>
                      {lage === 'aktiv' && <button style={k.aus} disabled={busy} onClick={() => void gastSperren(a)}>Link sperren</button>}
                    </div>
                  )}
                  {link?.auftrag === a.id && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <textarea readOnly style={{ ...k.inp, minHeight: 110, fontFamily: 'inherit', fontSize: 12.5 }} value={link.text} />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button style={k.gold} onClick={() => void kopieren(link.text)}>Text mit Link kopieren</button>
                        <button style={k.aus} onClick={() => void kopieren(link.link)}>Nur Link kopieren</button>
                      </div>
                      <div style={k.dim}>Schicken Sie den Text selbst per Mail, SMS oder WhatsApp an den Partner. Wer den Link hat, sieht diesen Auftrag.</div>
                    </div>
                  )}
                </div>
              );
            })()}
            {rechnungen.some((r) => r.auftrag_id === a.id) && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Rechnungen des Partners</div>
                {rechnungen.filter((r) => r.auftrag_id === a.id).map((r) => (
                  <div key={r.id} style={{ ...k.vorschau, marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <span><b>Nr. {r.rechnungsnummer}</b> · {de(r.rechnungsdatum)} · {r.von_name || 'Partner'}</span>
                      <span style={{ color: FARBE[RECHNUNG_STATUS[r.status]?.stufe ?? 'dim'], fontWeight: 700 }}>{rechnungStatusName(r.status)}</span>
                    </div>
                    <div>{euro(r.netto)} netto + {euro(r.ust_betrag)} USt ({r.ust_satz} %) = <b>{euro(r.brutto)}</b> brutto · <a href={`/api/partner/rechnung?r=${r.id}`} target="_blank" rel="noopener noreferrer" style={k.link}>Rechnung ansehen</a></div>
                    {r.grund && <div style={k.dim}>Grund: {r.grund}</div>}
                    {r.status === 'eingereicht' && darfSchreiben && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                        {istKfz && <select style={{ ...k.inp, padding: '6px 8px' }} value={art[r.id] || kostenArtVorschlag(a.titel)} onChange={(x) => setArt({ ...art, [r.id]: x.target.value })}>
                          {KOSTEN_ARTEN.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                        </select>}
                        <button style={k.gold} disabled={busy} onClick={() => void uebernehmen(r, a)}>{istKfz ? 'In Belegeingang und Kalkulation übernehmen' : 'In den Belegeingang übernehmen'}</button>
                        <button style={k.aus} disabled={busy} onClick={() => setZurueck({ id: r.id, text: '' })}>Zurückweisen</button>
                      </div>
                    )}
                    {zurueck?.id === r.id && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input style={{ ...k.inp, flex: '1 1 220px' }} value={zurueck.text} maxLength={300} placeholder="Grund (der Partner sieht ihn)" onChange={(x) => setZurueck({ ...zurueck, text: x.target.value })} />
                        <button style={k.gold} disabled={busy} onClick={() => void zurueckweisen(r, zurueck.text)}>Zurückweisen</button>
                        <button style={k.aus} onClick={() => setZurueck(null)}>Abbrechen</button>
                      </div>
                    )}
                  </div>
                ))}
                <div style={k.dim}>{istKfz
                  ? 'Übernehmen dürfen die Geschäftsleitung und wer „Darf abrechnen" und Schreibrecht „Kfz" hat. Die Rechnung landet als Fremdleistung im Belegeingang und netto in den Kosten dieses Fahrzeugs — nie doppelt.'
                  : `Übernehmen dürfen die Geschäftsleitung und wer „Darf abrechnen" und Schreibrecht „${modulName}" hat. Die Rechnung landet als Fremdleistung im Belegeingang — nie doppelt.`}</div>
              </div>
            )}
            <PartnerVerlauf auftragId={a.id} eintraege={eig} eigeneSeite="auftraggeber" darfSchreiben={darfSchreiben} onNeu={() => void lade()} />
          </div>
        );
      })}
    </div>
  );
}

const k: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0, color: C.text },
  h3: { margin: '0 0 6px', fontSize: 15, fontWeight: 800 },
  dim: { color: C.dim, fontSize: 12.5 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim, minWidth: 0 },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  haken: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  aus: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13 },
  badge: { border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, alignSelf: 'flex-start' },
  hinweis: { background: 'rgba(201,168,76,0.08)', border: `1px solid rgba(201,168,76,0.35)`, borderRadius: 8, padding: '10px 12px', fontSize: 13.5 },
  vorschau: { background: C.navy, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, display: 'grid', gap: 4 },
  link: { color: C.gold, textDecoration: 'none', fontWeight: 700, fontSize: 13 },
};
