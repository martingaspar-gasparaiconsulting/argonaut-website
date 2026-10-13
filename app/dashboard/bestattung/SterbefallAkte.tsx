'use client';

// ============================================================
// ARGONAUT OS · Paket 352 (13.10.2026) · A4a Fachpaket Bestatter
// Die aufgeklappte Sterbefall-Akte: Reiter Akte, Checkliste,
// Kostenvoranschlag, Partner. Druck von Kostenvoranschlag und Vollmacht.
// Die Vollmacht gibt es NUR mit dem eigenen Text des Betriebs
// („Meine Rechtstexte" → bestattung.vollmacht) — nie mit ARGONAUT-Wortlaut.
// Beträge je Zeile und 0 % bei Auslagen setzt die Datenbank (SQL p352).
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { leseZahl } from '@/lib/zahlen';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';
import { euro } from '@/lib/geld';
import { ladeDokumentText } from '@/lib/rechtsTexteLaden';
import { partnerAuswahl, type Verbindung } from '@/lib/partnerNetzwerk';
import {
  BESTATTUNGSARTEN, STATUS, FAMILIENSTAND, PARTNER_ROLLEN, PARTNER_STATUS, POSTEN_ARTEN, MWST_SAETZE,
  aktePruefen, aufgabeLage, postenAusKatalog, postenPruefen, kvSumme, zeilenBetrag, kvHtml, vollmachtHtml, platzhalterWerte,
  rolleName, postenArtName, datumDe, zeitDe, verstorbenName,
  type Aufgabe, type AkteEingabe, type KatalogLeistung, type Posten, type Firmenkopf, type FallDruck, type EigenerText,
} from '@/lib/bestattung';
import { C, Feld, s } from './bestattungUi';

export type Fall = {
  id: string; nummer: string | null; verstorben_vorname: string | null; verstorben_nachname: string; geburtsname: string | null;
  geburtsdatum: string | null; sterbedatum: string | null; sterbeort: string | null; letzte_anschrift: string | null; familienstand: string | null;
  feier: string | null; bestattungsart: string; friedhof: string | null; grabart: string | null; trauerfeier_am: string | null; beisetzung_am: string | null;
  kontakt_id: string | null; auftraggeber_name: string; auftraggeber_verhaeltnis: string | null; auftraggeber_tel: string | null;
  auftraggeber_mail: string | null; auftraggeber_anschrift: string | null; status: string; notiz: string | null; erstellt_am: string;
};
type AufgabeZeile = Aufgabe & { id: string; sterbefall_id: string; stelle?: string | null; position?: number; notiz?: string | null };
type PostenZeile = Posten & { id: string; leistung_id: string | null; position: number; gesamt_netto: number };
type PartnerZeile = { id: string; rolle: string; name: string; kontakt_id: string | null; netzwerk_betrieb: string | null; telefon: string | null; termin_am: string | null; status: string; notiz: string | null };
type Kontakt = { id: string; name: string | null; email: string | null; telefon: string | null };
type Reiter = 'akte' | 'checkliste' | 'kv' | 'partner';

const TEXT_FELDER = ['verstorben_vorname', 'verstorben_nachname', 'geburtsname', 'geburtsdatum', 'sterbedatum', 'sterbeort', 'letzte_anschrift', 'familienstand',
  'feier', 'bestattungsart', 'friedhof', 'grabart', 'auftraggeber_name', 'auftraggeber_verhaeltnis', 'auftraggeber_tel', 'auftraggeber_mail', 'auftraggeber_anschrift', 'notiz', 'status'] as const;
type Form = Record<(typeof TEXT_FELDER)[number] | 'trauerfeier_am' | 'beisetzung_am', string>;

const oderNull = (t: string) => (t.trim() ? t.trim() : null);
/** Zeitstempel → Wert für <input type="datetime-local"> (Ortszeit des Browsers). */
function zuEingabe(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}
function ausEingabe(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
const komma = (n: number) => String(n).replace('.', ',');

export default function SterbefallAkte({ supabase, fall, aufgaben, istChef, ich, kontakte, heute, onGeaendert, melde }: {
  supabase: SupabaseClient; fall: Fall; aufgaben: AufgabeZeile[]; istChef: boolean; ich: string | null; kontakte: Kontakt[]; heute: string;
  onGeaendert: () => Promise<void>; melde: (f: string | null, o?: string | null) => void;
}) {
  const [reiter, setReiter] = useState<Reiter>('checkliste');
  const [form, setForm] = useState<Form | null>(null);
  const [posten, setPosten] = useState<PostenZeile[]>([]);
  const [partner, setPartner] = useState<PartnerZeile[]>([]);
  const [katalog, setKatalog] = useState<KatalogLeistung[]>([]);
  const [netzwerk, setNetzwerk] = useState<{ betrieb: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [neuAufgabe, setNeuAufgabe] = useState({ titel: '', stelle: '', faellig: '' });
  const [neuPosten, setNeuPosten] = useState({ art: 'leistung', leistung_id: '', bezeichnung: '', menge: '1', einheit: 'Stk', preis: '', mwst: 19 });
  const [neuPartner, setNeuPartner] = useState({ rolle: 'florist', name: '', kontakt_id: '', netzwerk_betrieb: '', telefon: '', termin: '', notiz: '' });
  const gesperrt = fall.status === 'abgeschlossen' || fall.status === 'storniert';

  const ladeTeile = useCallback(async () => {
    const [p, pa] = await Promise.all([
      supabase.from('sterbefall_posten').select('id, art, leistung_id, bezeichnung, menge, einheit, einzelpreis_netto, mwst_satz, gesamt_netto, position').eq('sterbefall_id', fall.id).order('position', { ascending: true }),
      supabase.from('sterbefall_partner').select('id, rolle, name, kontakt_id, netzwerk_betrieb, telefon, termin_am, status, notiz').eq('sterbefall_id', fall.id).order('rolle', { ascending: true }),
    ]);
    setPosten((((p.data as unknown) as PostenZeile[]) ?? []).map((x) => ({ ...x, menge: Number(x.menge), einzelpreis_netto: Number(x.einzelpreis_netto), mwst_satz: Number(x.mwst_satz), gesamt_netto: Number(x.gesamt_netto) })));
    setPartner(((pa.data as unknown) as PartnerZeile[]) ?? []);
  }, [supabase, fall.id]);

  useEffect(() => {
    void ladeTeile();
    void (async () => {
      // Leistungskatalog und Netzwerk-Partner: fehlt das Recht, geht es ohne
      const [k, v] = await Promise.all([
        supabase.from('leistungskatalog').select('id, bezeichnung, erfassungsart, standard_wert, aw_minuten, stundensatz_netto, festpreis_netto, einheit, einheitspreis_netto, mwst_satz, aktiv').eq('aktiv', true).order('bezeichnung', { ascending: true }).limit(2000),
        supabase.from('betrieb_partner').select('*').limit(500),
      ]);
      setKatalog(k.error ? [] : (((k.data as unknown) as KatalogLeistung[]) ?? []));
      setNetzwerk(v.error ? [] : partnerAuswahl(((v.data as unknown) as Verbindung[]) ?? [], ich));
    })();
  }, [supabase, ich, ladeTeile]);

  async function schreibe(q: PromiseLike<{ data: unknown; error: { message: string } | null }>, okText: string, fehlText = 'Nicht gespeichert — dafür brauchen Sie das Schreibrecht „Bestattung".') {
    setBusy(true); melde(null);
    try {
      const { data, error } = await q;
      if (error) { melde(/Akte|Kontakt|Leistung|abgeschlossen|wandert|Betrieb/.test(error.message) ? error.message : fehlText); return false; }
      if (nichtsGeschrieben(data)) { melde(fehlText); return false; }
      melde(null, okText); await ladeTeile(); await onGeaendert(); return true;
    } finally { setBusy(false); }
  }

  // --- Akte ändern -------------------------------------------------------------------
  function bearbeiten() {
    const f: Partial<Form> = {};
    for (const k of TEXT_FELDER) f[k] = String((fall as Record<string, unknown>)[k] ?? '');
    f.trauerfeier_am = zuEingabe(fall.trauerfeier_am);
    f.beisetzung_am = zuEingabe(fall.beisetzung_am);
    setForm(f as Form); setReiter('akte');
  }

  async function akteSpeichern() {
    if (!form) return;
    const e: AkteEingabe = { ...form, geburtsdatum: oderNull(form.geburtsdatum), sterbedatum: oderNull(form.sterbedatum) };
    const r = aktePruefen(e, heute);
    if (!r.ok) { melde(r.fehler.join(' ')); return; }
    const felder: Record<string, string | null> = {};
    for (const k of TEXT_FELDER) felder[k] = oderNull(form[k]);
    felder.trauerfeier_am = ausEingabe(form.trauerfeier_am);
    felder.beisetzung_am = ausEingabe(form.beisetzung_am);
    if (await schreibe(supabase.from('sterbefall').update(felder).eq('id', fall.id).select('id'), 'Akte gespeichert.')) setForm(null);
  }

  async function statusSetzen(st: string) {
    if (st === 'storniert' && !window.confirm('Sterbefall stornieren? Der Kostenvoranschlag lässt sich danach nicht mehr ändern.')) return;
    await schreibe(supabase.from('sterbefall').update({ status: st }).eq('id', fall.id).select('id'), `Status: ${STATUS.find((x) => x.key === st)?.name ?? st}.`);
  }

  async function akteLoeschen() {
    if (!window.confirm(`Sterbefall ${fall.nummer ?? ''} (${verstorbenName(fall)}) mit Checkliste, Kostenvoranschlag und Partnern endgültig löschen?`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('sterbefall').delete().eq('id', fall.id).select('id');
      if (error || nichtsGeschrieben(data)) { melde('Löschen darf nur die Geschäftsleitung — sonst bitte „stornieren".'); return; }
      melde(null, 'Sterbefall gelöscht.'); await onGeaendert();
    } finally { setBusy(false); }
  }

  // --- Checkliste ----------------------------------------------------------------------
  async function abhaken(a: AufgabeZeile) {
    await schreibe(supabase.from('sterbefall_aufgabe').update({ erledigt_am: a.erledigt_am ? null : new Date().toISOString() }).eq('id', a.id).select('id'),
      a.erledigt_am ? `„${a.titel}" wieder offen.` : `„${a.titel}" erledigt.`);
  }
  async function faelligSetzen(a: AufgabeZeile, wert: string) {
    await schreibe(supabase.from('sterbefall_aufgabe').update({ faellig_am: wert || null }).eq('id', a.id).select('id'), `Fällig für „${a.titel}" gespeichert.`);
  }
  async function aufgabeAnlegen() {
    const t = neuAufgabe.titel.trim();
    if (!t || t.length > 160) { melde('Bitte die Aufgabe benennen (bis 160 Zeichen).'); return; }
    const pos = Math.max(0, ...aufgaben.map((a) => a.position ?? 0)) + 1;
    if (await schreibe(supabase.from('sterbefall_aufgabe').insert({ sterbefall_id: fall.id, titel: t, stelle: oderNull(neuAufgabe.stelle), faellig_am: neuAufgabe.faellig || null, position: pos }).select('id'),
      `„${t}" ergänzt.`)) setNeuAufgabe({ titel: '', stelle: '', faellig: '' });
  }
  async function aufgabeEntfernen(a: AufgabeZeile) {
    if (!window.confirm(`„${a.titel}" aus der Checkliste dieses Sterbefalls entfernen?`)) return;
    await schreibe(supabase.from('sterbefall_aufgabe').delete().eq('id', a.id).select('id'), `„${a.titel}" entfernt.`, 'Entfernen darf nur die Geschäftsleitung.');
  }

  // --- Kostenvoranschlag -----------------------------------------------------------------
  function ausKatalog(id: string) {
    const k = katalog.find((x) => x.id === id);
    if (!k) { setNeuPosten({ ...neuPosten, leistung_id: '' }); return; }
    const p = postenAusKatalog(k);
    if (!p) { melde(`„${k.bezeichnung ?? 'Leistung'}" hat im Leistungskatalog keinen Preis — bitte den Preis hier eintragen.`); setNeuPosten({ ...neuPosten, leistung_id: k.id, bezeichnung: k.bezeichnung ?? '', preis: '' }); return; }
    melde(null);
    setNeuPosten({ art: 'leistung', leistung_id: k.id, bezeichnung: p.bezeichnung, menge: komma(p.menge), einheit: p.einheit, preis: komma(p.einzelpreis_netto), mwst: p.mwst_satz });
  }
  async function postenAnlegen() {
    const menge = leseZahl(neuPosten.menge), preis = leseZahl(neuPosten.preis);
    const mwst = neuPosten.art === 'auslage' ? 0 : neuPosten.mwst;
    const r = postenPruefen({ art: neuPosten.art, bezeichnung: neuPosten.bezeichnung, menge, einheit: neuPosten.einheit, einzelpreis_netto: preis, mwst_satz: mwst });
    if (!r.ok) { melde(r.fehler.join(' ')); return; }
    const pos = Math.max(0, ...posten.map((p) => p.position)) + 1;
    if (await schreibe(supabase.from('sterbefall_posten').insert({
      sterbefall_id: fall.id, art: neuPosten.art, leistung_id: neuPosten.art === 'leistung' && neuPosten.leistung_id ? neuPosten.leistung_id : null,
      bezeichnung: neuPosten.bezeichnung.trim(), menge, einheit: neuPosten.einheit.trim(), einzelpreis_netto: preis, mwst_satz: mwst, position: pos,
    }).select('id'), `„${neuPosten.bezeichnung.trim()}" im Kostenvoranschlag.`)) {
      setNeuPosten({ art: neuPosten.art, leistung_id: '', bezeichnung: '', menge: '1', einheit: 'Stk', preis: '', mwst: neuPosten.mwst });
    }
  }
  async function postenEntfernen(p: PostenZeile) {
    if (!window.confirm(`„${p.bezeichnung}" aus dem Kostenvoranschlag entfernen?`)) return;
    await schreibe(supabase.from('sterbefall_posten').delete().eq('id', p.id).select('id'), `„${p.bezeichnung}" entfernt.`, 'Entfernen darf nur die Geschäftsleitung.');
  }

  // --- Partner ----------------------------------------------------------------------------
  function partnerQuelle(art: 'kontakt' | 'netzwerk', id: string) {
    if (art === 'kontakt') {
      const k = kontakte.find((x) => x.id === id);
      setNeuPartner({ ...neuPartner, kontakt_id: id, netzwerk_betrieb: '', name: k?.name ?? neuPartner.name, telefon: k?.telefon ?? neuPartner.telefon });
    } else {
      const n = netzwerk.find((x) => x.betrieb === id);
      setNeuPartner({ ...neuPartner, netzwerk_betrieb: id, kontakt_id: '', name: n?.name ?? neuPartner.name });
    }
  }
  async function partnerAnlegen() {
    const n = neuPartner.name.trim();
    if (!n || n.length > 120) { melde('Bitte den Namen des Partners eintragen (bis 120 Zeichen).'); return; }
    if (neuPartner.telefon.trim().length > 40 || neuPartner.notiz.trim().length > 300) { melde('Telefon bis 40, Notiz bis 300 Zeichen.'); return; }
    if (await schreibe(supabase.from('sterbefall_partner').insert({
      sterbefall_id: fall.id, rolle: neuPartner.rolle, name: n, kontakt_id: neuPartner.kontakt_id || null, netzwerk_betrieb: neuPartner.netzwerk_betrieb || null,
      telefon: oderNull(neuPartner.telefon), termin_am: ausEingabe(neuPartner.termin), notiz: oderNull(neuPartner.notiz),
    }).select('id'), `${rolleName(neuPartner.rolle)} „${n}" eingetragen.`)) {
      setNeuPartner({ rolle: neuPartner.rolle, name: '', kontakt_id: '', netzwerk_betrieb: '', telefon: '', termin: '', notiz: '' });
    }
  }
  async function partnerStatus(p: PartnerZeile, st: string) {
    await schreibe(supabase.from('sterbefall_partner').update({ status: st }).eq('id', p.id).select('id'), `${p.name}: ${PARTNER_STATUS.find((x) => x.key === st)?.name ?? st}.`);
  }
  async function partnerEntfernen(p: PartnerZeile) {
    if (!window.confirm(`${p.name} aus diesem Sterbefall entfernen?`)) return;
    await schreibe(supabase.from('sterbefall_partner').delete().eq('id', p.id).select('id'), `${p.name} entfernt.`, 'Entfernen darf nur die Geschäftsleitung — sonst „abgesagt" setzen.');
  }

  // --- Drucken --------------------------------------------------------------------------------
  async function firmaLaden(): Promise<Firmenkopf | null> {
    try {
      const r = await fetch('/api/betrieb-firmendaten', { cache: 'no-store' });
      if (!r.ok) return null;
      const x = ((await r.json()) as { firma?: Record<string, string | null> }).firma ?? {};
      return { name: x.firma_name ?? null, strasse: x.firma_strasse ?? null, plz: x.firma_plz ?? null, ort: x.firma_ort ?? null, telefon: x.firma_telefon ?? null, email: x.firma_email ?? null };
    } catch { return null; }
  }
  function zeige(html: string) {
    const w = window.open('', '_blank');
    if (!w) { melde('Das Druckfenster wurde blockiert — bitte Pop-ups für ARGONAUT erlauben.'); return; }
    w.document.write(html); w.document.close();
  }
  const druckFall: FallDruck = fall;
  async function kvDrucken() {
    const firma = await firmaLaden();
    const dt = await ladeDokumentText(supabase, ich, 'bestattung.auftrag', platzhalterWerte(druckFall, firma, heute));
    const bed: EigenerText = dt.eigen ? { eigen: true, text: dt.text, stand: dt.stand } : { eigen: false, hinweis: dt.hinweis };
    zeige(kvHtml(druckFall, posten, firma, heute, bed));
    if (!firma?.name) melde(null, 'Kostenvoranschlag geöffnet. Ihre Firmendaten fehlen darin (Einstellungen → Firmendaten, beim Mitarbeiter das Recht „Rechnungen").');
  }
  async function vollmachtDrucken() {
    const firma = await firmaLaden();
    const dt = await ladeDokumentText(supabase, ich, 'bestattung.vollmacht', platzhalterWerte(druckFall, firma, heute));
    const text: EigenerText = dt.eigen ? { eigen: true, text: dt.text, stand: dt.stand } : { eigen: false, hinweis: dt.hinweis };
    const v = vollmachtHtml(druckFall, firma, heute, text);
    if (!v.ok) { melde(`${v.hinweis} Die Vollmacht entsteht nur mit Ihrem eigenen Text — die Geschäftsleitung hinterlegt ihn unter „📜 Meine Rechtstexte" (Bereich Bestattung).`); return; }
    zeige(v.html);
  }

  const summe = kvSumme(posten);
  const reiterKnopf = (r: Reiter, text: string) => <button style={reiter === r ? s.reiterAn : s.reiterAus} onClick={() => setReiter(r)}>{text}</button>;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {reiterKnopf('checkliste', `Checkliste (${aufgaben.filter((a) => !a.erledigt_am).length} offen)`)}
        {reiterKnopf('kv', `Kostenvoranschlag (${posten.length})`)}
        {reiterKnopf('partner', `Partner (${partner.length})`)}
        {reiterKnopf('akte', 'Akte')}
        <span style={{ flex: 1 }} />
        <button style={s.btnAus} disabled={busy} onClick={() => void kvDrucken()}>🖨 Kostenvoranschlag</button>
        <button style={s.btnAus} disabled={busy} onClick={() => void vollmachtDrucken()}>🖨 Vollmacht</button>
      </div>

      {/* ---------------- Checkliste ---------------- */}
      {reiter === 'checkliste' && (
        <div style={s.innen}>
          {!aufgaben.length && <p style={s.dim}>Keine Aufgaben — ergänzen Sie unten die erste.</p>}
          {aufgaben.length > 0 && (
            <table style={s.tabelle}>
              <thead><tr><th style={s.th}></th><th style={s.th}>Aufgabe</th><th style={s.th}>Stelle</th><th style={s.th}>Fällig</th><th style={s.th}></th></tr></thead>
              <tbody>
                {aufgaben.map((a) => {
                  const l = aufgabeLage(a, heute);
                  return (
                    <tr key={a.id}>
                      <td style={s.td}><input type="checkbox" checked={!!a.erledigt_am} disabled={busy} onChange={() => void abhaken(a)} aria-label={`${a.titel} erledigt`} /></td>
                      <td style={{ ...s.td, textDecoration: a.erledigt_am ? 'line-through' : 'none', color: a.erledigt_am ? C.dim : C.text }}>
                        {a.titel}{a.erledigt_am ? <span style={s.klein}> · erledigt {datumDe(a.erledigt_am)}</span> : null}
                      </td>
                      <td style={s.td}>{a.stelle ?? '—'}</td>
                      <td style={s.td}>
                        <input type="date" style={{ ...s.input, padding: '3px 6px', fontSize: 12.5, borderColor: l === 'ueberfaellig' ? C.bad : l === 'heute' ? C.gold : C.border }}
                          defaultValue={a.faellig_am ?? ''} onBlur={(e) => { if ((e.target.value || null) !== a.faellig_am) void faelligSetzen(a, e.target.value); }} />
                        {l === 'ueberfaellig' && <span style={{ color: C.bad, fontSize: 12 }}> überfällig</span>}
                      </td>
                      <td style={s.td}>{istChef && <button style={s.mini} disabled={busy} onClick={() => void aufgabeEntfernen(a)}>entfernen</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div style={{ ...s.raster, marginTop: 10 }}>
            <Feld label="Weitere Aufgabe" w={neuAufgabe.titel} max={160} span on={(x) => setNeuAufgabe({ ...neuAufgabe, titel: x })} />
            <Feld label="Stelle" w={neuAufgabe.stelle} max={80} on={(x) => setNeuAufgabe({ ...neuAufgabe, stelle: x })} />
            <Feld label="Fällig am" typ="date" w={neuAufgabe.faellig} on={(x) => setNeuAufgabe({ ...neuAufgabe, faellig: x })} />
          </div>
          <button style={{ ...s.btnGold, marginTop: 8 }} disabled={busy} onClick={() => void aufgabeAnlegen()}>＋ Aufgabe</button>
        </div>
      )}

      {/* ---------------- Kostenvoranschlag ---------------- */}
      {reiter === 'kv' && (
        <div style={s.innen}>
          {gesperrt && <div style={s.hinweis}>Die Akte ist {fall.status === 'storniert' ? 'storniert' : 'abgeschlossen'} — der Kostenvoranschlag bleibt, wie er ist.</div>}
          {!posten.length && <p style={s.dim}>Noch keine Positionen. Übernehmen Sie Leistungen aus Ihrem Leistungskatalog oder tragen Sie Zeilen frei ein.</p>}
          {posten.length > 0 && (
            <table style={s.tabelle}>
              <thead><tr><th style={s.th}>Art</th><th style={s.th}>Bezeichnung</th><th style={s.th}>Menge</th><th style={s.th}>Einzelpreis netto</th><th style={s.th}>USt</th><th style={s.th}>Betrag netto</th><th style={s.th}></th></tr></thead>
              <tbody>
                {posten.map((p) => (
                  <tr key={p.id}>
                    <td style={{ ...s.td, color: p.art === 'auslage' ? C.info : C.dim, fontSize: 12 }}>{postenArtName(p.art)}</td>
                    <td style={s.td}>{p.bezeichnung}</td>
                    <td style={s.td}>{komma(p.menge)} {p.einheit}</td>
                    <td style={s.td}>{euro(p.einzelpreis_netto)}</td>
                    <td style={s.td}>{p.mwst_satz} %</td>
                    <td style={s.td}>{euro(zeilenBetrag(p))}</td>
                    <td style={s.td}>{istChef && !gesperrt && <button style={s.mini} disabled={busy} onClick={() => void postenEntfernen(p)}>entfernen</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {posten.length > 0 && (
            <div style={{ display: 'grid', gap: 2, justifyItems: 'end', marginTop: 8, fontSize: 13.5 }}>
              <div>Summe netto: <b>{euro(summe.netto)}</b></div>
              {summe.gruppen.map((g) => <div key={g.satz} style={s.klein}>USt {g.satz} % auf {euro(g.netto)}: {euro(g.steuer)}</div>)}
              <div>Leistungen brutto: <b>{euro(summe.brutto)}</b></div>
              {summe.anzahlAuslagen > 0 && <div>Auslagen für Dritte (ohne USt): <b>{euro(summe.auslagen)}</b></div>}
              <div style={{ color: C.gold, fontSize: 15 }}>Voraussichtlich gesamt: <b>{euro(summe.gesamt)}</b></div>
            </div>
          )}
          {!gesperrt && (<>
            <h3 style={s.h3}>Position hinzufügen</h3>
            <div style={s.raster}>
              <label style={s.feld}>Art
                <select style={s.input} value={neuPosten.art} onChange={(e) => setNeuPosten({ ...neuPosten, art: e.target.value, leistung_id: e.target.value === 'leistung' ? neuPosten.leistung_id : '' })}>
                  {POSTEN_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
                </select>
              </label>
              {neuPosten.art === 'leistung' && (
                <label style={{ ...s.feld, gridColumn: 'span 2' }}>Aus dem Leistungskatalog
                  <select style={s.input} value={neuPosten.leistung_id} onChange={(e) => ausKatalog(e.target.value)}>
                    <option value="">{katalog.length ? '— frei eintragen —' : '— Leistungskatalog leer oder ohne Recht —'}</option>
                    {katalog.map((k) => <option key={k.id} value={k.id}>{k.bezeichnung ?? 'Leistung'}</option>)}
                  </select>
                </label>
              )}
              <Feld label="Bezeichnung" w={neuPosten.bezeichnung} max={200} span on={(x) => setNeuPosten({ ...neuPosten, bezeichnung: x })} />
              <Feld label="Menge" w={neuPosten.menge} on={(x) => setNeuPosten({ ...neuPosten, menge: x })} />
              <Feld label="Einheit" w={neuPosten.einheit} max={20} on={(x) => setNeuPosten({ ...neuPosten, einheit: x })} />
              <Feld label={neuPosten.art === 'auslage' ? 'Betrag (€)' : 'Einzelpreis netto (€)'} w={neuPosten.preis} on={(x) => setNeuPosten({ ...neuPosten, preis: x })} />
              {neuPosten.art !== 'auslage' && (
                <label style={s.feld}>Umsatzsteuer
                  <select style={s.input} value={neuPosten.mwst} onChange={(e) => setNeuPosten({ ...neuPosten, mwst: Number(e.target.value) })}>
                    {MWST_SAETZE.map((x) => <option key={x} value={x}>{x} %</option>)}
                  </select>
                </label>
              )}
            </div>
            <p style={s.klein}>
              Auslagen für Dritte (z. B. Friedhofs- und Standesamtsgebühren) stehen im Kostenvoranschlag getrennt und immer ohne Umsatzsteuer.
              Ob ein Betrag als Auslage gilt, klären Sie bitte mit Ihrer Steuerberatung. Den Betrag je Zeile rechnet ARGONAUT.
            </p>
            <button style={s.btnGold} disabled={busy} onClick={() => void postenAnlegen()}>＋ Position</button>
          </>)}
        </div>
      )}

      {/* ---------------- Partner ---------------- */}
      {reiter === 'partner' && (
        <div style={s.innen}>
          {!partner.length && <p style={s.dim}>Noch keine Partner — tragen Sie unten Steinmetz, Florist, Trauerredner und andere Beteiligte ein.</p>}
          {partner.length > 0 && (
            <table style={s.tabelle}>
              <thead><tr><th style={s.th}>Rolle</th><th style={s.th}>Name</th><th style={s.th}>Telefon</th><th style={s.th}>Termin</th><th style={s.th}>Status</th><th style={s.th}></th></tr></thead>
              <tbody>
                {partner.map((p) => (
                  <tr key={p.id}>
                    <td style={s.td}>{PARTNER_ROLLEN.find((r) => r.key === p.rolle)?.icon} {rolleName(p.rolle)}</td>
                    <td style={s.td}>{p.name}{p.netzwerk_betrieb ? <span style={s.klein}> · im Betriebs-Netzwerk</span> : null}{p.notiz ? <div style={s.klein}>{p.notiz}</div> : null}</td>
                    <td style={s.td}>{p.telefon ? <a href={`tel:${p.telefon}`} style={{ color: C.text }}>{p.telefon}</a> : '—'}</td>
                    <td style={s.td}>{zeitDe(p.termin_am)}</td>
                    <td style={s.td}>
                      <select style={{ ...s.input, padding: '3px 6px', fontSize: 12.5 }} value={p.status} disabled={busy} onChange={(e) => void partnerStatus(p, e.target.value)}>
                        {PARTNER_STATUS.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                      </select>
                    </td>
                    <td style={s.td}>{istChef && <button style={s.mini} disabled={busy} onClick={() => void partnerEntfernen(p)}>entfernen</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3 style={s.h3}>Partner eintragen</h3>
          <div style={s.raster}>
            <label style={s.feld}>Rolle
              <select style={s.input} value={neuPartner.rolle} onChange={(e) => setNeuPartner({ ...neuPartner, rolle: e.target.value })}>
                {PARTNER_ROLLEN.map((r) => <option key={r.key} value={r.key}>{r.icon} {r.name}</option>)}
              </select>
            </label>
            {netzwerk.length > 0 && (
              <label style={s.feld}>Aus dem Betriebs-Netzwerk
                <select style={s.input} value={neuPartner.netzwerk_betrieb} onChange={(e) => partnerQuelle('netzwerk', e.target.value)}>
                  <option value="">—</option>{netzwerk.map((n) => <option key={n.betrieb} value={n.betrieb}>{n.name}</option>)}
                </select>
              </label>
            )}
            {kontakte.length > 0 && (
              <label style={s.feld}>Aus Kontakten
                <select style={s.input} value={neuPartner.kontakt_id} onChange={(e) => partnerQuelle('kontakt', e.target.value)}>
                  <option value="">—</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.name ?? 'ohne Namen'}</option>)}
                </select>
              </label>
            )}
            <Feld label="Name" w={neuPartner.name} max={120} on={(x) => setNeuPartner({ ...neuPartner, name: x })} />
            <Feld label="Telefon" w={neuPartner.telefon} max={40} on={(x) => setNeuPartner({ ...neuPartner, telefon: x })} />
            <Feld label="Termin" typ="datetime-local" w={neuPartner.termin} on={(x) => setNeuPartner({ ...neuPartner, termin: x })} />
            <Feld label="Notiz (z. B. Gesteck, Musikwunsch)" w={neuPartner.notiz} max={300} span on={(x) => setNeuPartner({ ...neuPartner, notiz: x })} />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <button style={s.btnGold} disabled={busy} onClick={() => void partnerAnlegen()}>＋ Partner</button>
            <a href="/dashboard/netzwerk" style={s.mini}>🤝 Betriebs-Netzwerk öffnen</a>
            <span style={s.klein}>Partner im Netzwerk sind ARGONAUT-Betriebe, mit denen Sie verbunden sind. Hier wird nur notiert, wer beteiligt ist — Daten des Sterbefalls gehen dabei nicht an den Partner.</span>
          </div>
        </div>
      )}

      {/* ---------------- Akte ---------------- */}
      {reiter === 'akte' && (
        <div style={s.innen}>
          {!form && (<>
            <table style={s.tabelle}><tbody>
              <tr><td style={s.th}>Verstorbene Person</td><td style={s.td}>{verstorbenName(fall)}</td></tr>
              <tr><td style={s.th}>Geboren / verstorben</td><td style={s.td}>{datumDe(fall.geburtsdatum)} / {datumDe(fall.sterbedatum)}{fall.sterbeort ? ` in ${fall.sterbeort}` : ''}</td></tr>
              <tr><td style={s.th}>Letzte Anschrift</td><td style={s.td}>{fall.letzte_anschrift ?? '—'}</td></tr>
              <tr><td style={s.th}>Familienstand</td><td style={s.td}>{FAMILIENSTAND.find((x) => x.key === fall.familienstand)?.name ?? '—'}</td></tr>
              <tr><td style={s.th}>Bestattung</td><td style={s.td}>{BESTATTUNGSARTEN.find((x) => x.key === fall.bestattungsart)?.name}{fall.feier ? ` · ${fall.feier}` : ''}</td></tr>
              <tr><td style={s.th}>Friedhof / Grab</td><td style={s.td}>{fall.friedhof ?? '—'}{fall.grabart ? ` · ${fall.grabart}` : ''}</td></tr>
              <tr><td style={s.th}>Trauerfeier</td><td style={s.td}>{zeitDe(fall.trauerfeier_am)}</td></tr>
              <tr><td style={s.th}>Beisetzung</td><td style={s.td}>{zeitDe(fall.beisetzung_am)}</td></tr>
              <tr><td style={s.th}>Auftraggeber</td><td style={s.td}>{fall.auftraggeber_name}{fall.auftraggeber_verhaeltnis ? ` (${fall.auftraggeber_verhaeltnis})` : ''}<br />
                <span style={s.klein}>{[fall.auftraggeber_tel, fall.auftraggeber_mail, fall.auftraggeber_anschrift].filter(Boolean).join(' · ') || '—'}</span></td></tr>
              {fall.notiz && <tr><td style={s.th}>Notiz</td><td style={s.td}>{fall.notiz}</td></tr>}
            </tbody></table>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
              <button style={s.btnGold} onClick={bearbeiten}>Akte ändern</button>
              <label style={s.klein}>Status{' '}
                <select style={{ ...s.input, padding: '4px 8px' }} value={fall.status} disabled={busy} onChange={(e) => void statusSetzen(e.target.value)}>
                  {STATUS.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                </select>
              </label>
              <span style={{ flex: 1 }} />
              {istChef && <button style={s.mini} disabled={busy} onClick={() => void akteLoeschen()}>Sterbefall löschen</button>}
            </div>
          </>)}
          {form && (<>
            <div style={s.raster}>
              <Feld label="Vorname" w={form.verstorben_vorname} max={80} on={(x) => setForm({ ...form, verstorben_vorname: x })} />
              <Feld label="Nachname *" w={form.verstorben_nachname} max={80} on={(x) => setForm({ ...form, verstorben_nachname: x })} />
              <Feld label="Geburtsname" w={form.geburtsname} max={80} on={(x) => setForm({ ...form, geburtsname: x })} />
              <Feld label="Geburtsdatum" typ="date" w={form.geburtsdatum} on={(x) => setForm({ ...form, geburtsdatum: x })} />
              <Feld label="Sterbedatum" typ="date" w={form.sterbedatum} on={(x) => setForm({ ...form, sterbedatum: x })} />
              <Feld label="Sterbeort" w={form.sterbeort} max={160} on={(x) => setForm({ ...form, sterbeort: x })} />
              <label style={s.feld}>Familienstand
                <select style={s.input} value={form.familienstand} onChange={(e) => setForm({ ...form, familienstand: e.target.value })}>
                  <option value="">—</option>{FAMILIENSTAND.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                </select>
              </label>
              <Feld label="Letzte Anschrift" w={form.letzte_anschrift} max={300} span on={(x) => setForm({ ...form, letzte_anschrift: x })} />
              <label style={s.feld}>Bestattungsart *
                <select style={s.input} value={form.bestattungsart} onChange={(e) => setForm({ ...form, bestattungsart: e.target.value })}>
                  {BESTATTUNGSARTEN.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                </select>
              </label>
              <Feld label="Art der Feier" w={form.feier} max={120} on={(x) => setForm({ ...form, feier: x })} />
              <Feld label="Friedhof bzw. Ort der Beisetzung" w={form.friedhof} max={160} on={(x) => setForm({ ...form, friedhof: x })} />
              <Feld label="Grabart" w={form.grabart} max={120} on={(x) => setForm({ ...form, grabart: x })} />
              <Feld label="Trauerfeier" typ="datetime-local" w={form.trauerfeier_am} on={(x) => setForm({ ...form, trauerfeier_am: x })} />
              <Feld label="Beisetzung" typ="datetime-local" w={form.beisetzung_am} on={(x) => setForm({ ...form, beisetzung_am: x })} />
              <Feld label="Auftraggeber *" w={form.auftraggeber_name} max={120} on={(x) => setForm({ ...form, auftraggeber_name: x })} />
              <Feld label="Verhältnis" w={form.auftraggeber_verhaeltnis} max={60} on={(x) => setForm({ ...form, auftraggeber_verhaeltnis: x })} />
              <Feld label="Telefon" w={form.auftraggeber_tel} max={40} on={(x) => setForm({ ...form, auftraggeber_tel: x })} />
              <Feld label="E-Mail" w={form.auftraggeber_mail} max={160} on={(x) => setForm({ ...form, auftraggeber_mail: x })} />
              <Feld label="Anschrift Auftraggeber" w={form.auftraggeber_anschrift} max={300} span on={(x) => setForm({ ...form, auftraggeber_anschrift: x })} />
              <Feld label="Notiz" w={form.notiz} max={1000} span on={(x) => setForm({ ...form, notiz: x })} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button style={s.btnGold} disabled={busy} onClick={() => void akteSpeichern()}>Speichern</button>
              <button style={s.btnAus} onClick={() => setForm(null)}>Abbrechen</button>
            </div>
          </>)}
        </div>
      )}
    </div>
  );
}
