'use client';

// ============================================================
// ARGONAUT OS · Paket 266 · K6 Verkaufsunterlagen (Reiter „Verkauf" in der Handelsakte)
// Ein Verkaufsvorgang je Fahrzeug (Tabelle kfz_verkauf, Doppelverkauf sperrt die
// Datenbank): Käufer, Preis, Zusatzleistungen, Inzahlungnahme aus dem Ankauf,
// Anzahlung, Zahlart, Sachmängelhaftung, Reservierung, Kaufvertrag, Übergabe.
// Sechs Unterlagen als PDF; Unterschrift über ARGONAUT-Sign (Link für den Käufer).
// GwG: Bargeld ab 10.000 € -> erst identifizieren (/dashboard/kfz/gwg), dann Vertrag.
// Status-Wechsel ziehen den Bestand-Status nach (reserviert / verkauft / zurück).
// Rechte: lesen mit „KFZ", schreiben mit Schreibrecht „KFZ", löschen nur der Chef.
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { signaturStarten } from '@/lib/signaturStart';
import {
  VERKAUF_STATUS, ZAHLARTEN, GEWAEHR, PAPIERE, DOK_ARTEN, betraege, barSumme, gwgNoetig, inzahlungVorschlag, pruefen,
  wechselErlaubt, statusLabel, bestandNachVerkauf, naechsteVerkaufNr, zusatzBereinigen, gewaehrErlaubt, dokumentInhalt,
  alsText, dateiName, geld, type Verkauf, type FahrzeugFuerVerkauf, type InzahlungFahrzeug, type Firmenkopf, type DokArt, type Zusatz,
} from '@/lib/kfzVerkauf';
import { verkaufPdf } from '@/lib/kfzVerkaufPdf';
// Paket 268 (K7): Rechnung aus dem Verkauf — § 25a / Regelsteuer / EU / Ausfuhr
import { LIEFERUNGEN, lieferungLesen, steuerfall, rechnungBauen, type Lieferung } from '@/lib/kfzRechnung';
import { sonderfallLabel } from '@/lib/steuerSonderfall';
import { useDarfAbrechnen } from '../../_components/useDarfAbrechnen';
import KfzKaufstatus from './KfzKaufstatus';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', navy3: '#14294A', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, gold: C.gold, dim: C.dim };

type Zeile = Verkauf & { id: string; owner_user_id: string; signaturen: Record<string, string> | null; storno_grund: string | null; erstellt_am: string; rechnung_id?: string | null; lieferung?: string | null; kontakt_id?: string | null };
type RechnungKurz = { id: string; rechnungsnummer: string | null; zahlungsstatus: string | null; brutto_summe: number | null };
type Ankauf = InzahlungFahrzeug & { id: string; status: string };
type SigStand = { token: string; status: string; signiert_am: string | null };
export type VerkaufFahrzeug = { id: string; owner_user_id: string; bestandStatus: string; fz: FahrzeugFuerVerkauf };

function heute(): string { return new Date().toISOString().slice(0, 10); }
function t(v: number | string | null | undefined): string { return v === null || v === undefined ? '' : String(v).replace('.', ','); }
function betrag(v: string): number | null { const n = leseZahl(v); return n === null || n < 0 ? null : n; }
function ganz(v: string): number | null { const n = leseZahl(v); return n === null || n < 0 ? null : Math.round(n); }

type Entwurf = {
  kaeufer_art: string; kaeufer_name: string; kaeufer_firma: string; kaeufer_anschrift: string; kaeufer_tel: string; kaeufer_email: string; kaeufer_ustid: string;
  ausweis_geprueft: boolean; preis: string; zusatz: { text: string; betrag: string }[]; inzahlung_ankauf_id: string; inzahlung_betrag: string;
  anzahlung: string; anzahlung_am: string; anzahlung_art: string; rest_art: string; gwg_erledigt: boolean;
  gewaehr: string; gewaehr_gesondert: boolean; angebot_gueltig_bis: string; reserviert_bis: string; vertrag_am: string; liefertermin: string; vereinbarungen: string;
  uebergabe_am: string; km_uebergabe: string; schluessel: string; papiere: string[];
};

function ausZeile(v: Zeile): Entwurf {
  return {
    kaeufer_art: v.kaeufer_art, kaeufer_name: v.kaeufer_name ?? '', kaeufer_firma: v.kaeufer_firma ?? '', kaeufer_anschrift: v.kaeufer_anschrift ?? '',
    kaeufer_tel: v.kaeufer_tel ?? '', kaeufer_email: v.kaeufer_email ?? '', kaeufer_ustid: v.kaeufer_ustid ?? '', ausweis_geprueft: !!v.ausweis_geprueft,
    preis: t(v.preis_brutto), zusatz: zusatzBereinigen(v.zusatz).map((z) => ({ text: z.text, betrag: t(z.betrag) })),
    inzahlung_ankauf_id: v.inzahlung_ankauf_id ?? '', inzahlung_betrag: t(v.inzahlung_betrag),
    anzahlung: t(v.anzahlung), anzahlung_am: v.anzahlung_am ?? '', anzahlung_art: v.anzahlung_art ?? '', rest_art: v.rest_art ?? '', gwg_erledigt: !!v.gwg_erledigt,
    gewaehr: v.gewaehr, gewaehr_gesondert: !!v.gewaehr_gesondert, angebot_gueltig_bis: v.angebot_gueltig_bis ?? '', reserviert_bis: v.reserviert_bis ?? '',
    vertrag_am: v.vertrag_am ?? '', liefertermin: v.liefertermin ?? '', vereinbarungen: v.vereinbarungen ?? '',
    uebergabe_am: v.uebergabe_am ?? '', km_uebergabe: t(v.km_uebergabe), schluessel: t(v.schluessel), papiere: v.papiere ?? [],
  };
}

/** Entwurf -> Datenbankfelder (nur gültige Werte). */
function zuFeldern(e: Entwurf): Record<string, unknown> {
  const zusatz: Zusatz[] = zusatzBereinigen(e.zusatz.map((z) => ({ text: z.text, betrag: betrag(z.betrag) ?? NaN })));
  const leer = (s: string) => s.trim() || null;
  return {
    kaeufer_art: e.kaeufer_art === 'unternehmer' ? 'unternehmer' : 'verbraucher',
    kaeufer_name: leer(e.kaeufer_name)?.slice(0, 120) ?? null, kaeufer_firma: leer(e.kaeufer_firma)?.slice(0, 120) ?? null,
    kaeufer_anschrift: leer(e.kaeufer_anschrift)?.slice(0, 300) ?? null, kaeufer_tel: leer(e.kaeufer_tel)?.slice(0, 40) ?? null,
    kaeufer_email: leer(e.kaeufer_email)?.slice(0, 160) ?? null, kaeufer_ustid: e.kaeufer_art === 'unternehmer' ? (leer(e.kaeufer_ustid)?.replace(/\s/g, '').slice(0, 20) ?? null) : null,
    ausweis_geprueft: e.ausweis_geprueft, preis_brutto: betrag(e.preis), zusatz,
    inzahlung_ankauf_id: e.inzahlung_ankauf_id || null, inzahlung_betrag: e.inzahlung_ankauf_id ? betrag(e.inzahlung_betrag) : null,
    anzahlung: betrag(e.anzahlung), anzahlung_am: e.anzahlung_am || null, anzahlung_art: e.anzahlung_art || null, rest_art: e.rest_art || null,
    gwg_erledigt: e.gwg_erledigt, gewaehr: gewaehrErlaubt(e.kaeufer_art, e.gewaehr) ? e.gewaehr : 'gesetzlich',
    gewaehr_gesondert: e.kaeufer_art === 'verbraucher' && e.gewaehr === 'ein_jahr' ? e.gewaehr_gesondert : false,
    angebot_gueltig_bis: e.angebot_gueltig_bis || null, reserviert_bis: e.reserviert_bis || null, vertrag_am: e.vertrag_am || null,
    liefertermin: e.liefertermin || null, vereinbarungen: leer(e.vereinbarungen)?.slice(0, 2000) ?? null,
    uebergabe_am: e.uebergabe_am || null, km_uebergabe: ganz(e.km_uebergabe), schluessel: ganz(e.schluessel),
    papiere: e.papiere.filter((p) => PAPIERE.includes(p)),
  };
}

export default function KfzVerkauf({ f, onGeaendert }: { f: VerkaufFahrzeug; onGeaendert: () => void }) {
  const [istChef, setIstChef] = useState(false);
  const [liste, setListe] = useState<Zeile[]>([]);
  const [ankaeufe, setAnkaeufe] = useState<Ankauf[]>([]);
  const [sig, setSig] = useState<Record<string, SigStand>>({});
  const [e, setE] = useState<Entwurf | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fehlerListe, setFehlerListe] = useState<string[]>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [storno, setStorno] = useState<string | null>(null);
  const [loeschFrage, setLoeschFrage] = useState(false);
  // Paket 268 (K7)
  const darfAbrechnen = useDarfAbrechnen();
  const [lieferung, setLieferung] = useState<Lieferung>('inland');
  const [eigeneUstId, setEigeneUstId] = useState<string | undefined>(undefined);
  const [rechnung, setRechnung] = useState<RechnungKurz | null>(null);
  const [rHinweise, setRHinweise] = useState<string[]>([]);

  const aktiv = liste.find((x) => x.status !== 'storniert') ?? null;
  const alte = liste.filter((x) => x.status === 'storniert');

  const lade = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    setIstChef(!!u?.user?.id && u.user.id === f.owner_user_id);
    const { data, error } = await supabase.from('kfz_verkauf').select('*').eq('bestand_id', f.id).order('erstellt_am', { ascending: false });
    if (error) { setFehler('Verkäufe lassen sich nicht laden. Ist SQL Paket 266 ausgeführt?'); return; }
    const zeilen = ((data as unknown) as Zeile[]) ?? [];
    setListe(zeilen);
    const a = zeilen.find((x) => x.status !== 'storniert') ?? null;
    setE(a ? ausZeile(a) : null);
    // Paket 268: Lieferort und vorhandene Rechnung
    setLieferung(lieferungLesen(a?.lieferung));
    if (a?.rechnung_id) {
      const rq = await supabase.from('rechnungen').select('id, rechnungsnummer, zahlungsstatus, brutto_summe').eq('id', a.rechnung_id).maybeSingle();
      setRechnung(((rq.data as unknown) as RechnungKurz | null) ?? null);
    } else setRechnung(null);
    const ak = await supabase.from('kfz_ankauf').select('id, nr, status, bestand_id, marke, modell, fin, kennzeichen, km_stand, verkaeufer_art, ankaufpreis, angebot')
      .in('status', ['offen', 'angeboten', 'angekauft']).order('erstellt_am', { ascending: false }).limit(200);
    // das eigene Fahrzeug (aus dessen Ankauf) kann nicht in Zahlung gehen
    setAnkaeufe((((ak.data as unknown) as (Ankauf & { bestand_id: string | null })[]) ?? []).filter((x) => x.bestand_id !== f.id));
    const tokens = Object.values(a?.signaturen ?? {}).filter((x): x is string => typeof x === 'string' && x.length > 8);
    if (tokens.length) {
      const s = await supabase.from('signatur_anfragen').select('token, status, signiert_am').in('token', tokens);
      const m: Record<string, SigStand> = {};
      for (const r of ((s.data as unknown) as SigStand[]) ?? []) m[r.token] = r;
      setSig(m);
    } else setSig({});
  }, [f.id, f.owner_user_id]);

  useEffect(() => { void lade(); }, [lade]);
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/betrieb-firmendaten', { cache: 'no-store' });
        if (!r.ok) return;
        const j = (await r.json()) as { firma?: Record<string, string | null> };
        setEigeneUstId(j.firma?.firma_ust_id ?? '');
      } catch { /* ohne Firmendaten prüft der Server */ }
    })();
  }, []);

  async function rechnungErstellen() {
    if (!aktiv) return;
    setBusy(true); setFehler(null); setFehlerListe([]); setOk(null); setRHinweise([]);
    try {
      const res = await fetch('/api/rechnung-aus-kfz-verkauf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verkaufId: aktiv.id, lieferung }),
      });
      const j = (await res.json().catch(() => ({}))) as { rechnungId?: string; bereitsVorhanden?: boolean; error?: string; fehler?: string[]; hinweise?: string[] };
      if (!res.ok || !j.rechnungId) {
        if (Array.isArray(j.fehler) && j.fehler.length) setFehlerListe(j.fehler); else setFehler(j.error || 'Rechnung konnte nicht erstellt werden.');
        return;
      }
      setRHinweise(Array.isArray(j.hinweise) ? j.hinweise : []);
      setOk(j.bereitsVorhanden ? 'Zu diesem Verkauf gibt es schon eine Rechnung.' : 'Rechnung erstellt. Prüfen Sie sie und erzeugen Sie dort das PDF.');
      await lade();
    } finally { setBusy(false); }
  }

  async function anlegen() {
    setBusy(true); setFehler(null); setOk(null);
    try {
      for (let versuch = 0; versuch < 2; versuch++) {
        const { data: nrs } = await supabase.from('kfz_verkauf').select('nr').limit(5000);
        const nr = naechsteVerkaufNr((((nrs as unknown) as { nr: string | null }[]) ?? []).map((x) => x.nr));
        const { error } = await supabase.from('kfz_verkauf').insert({
          owner_user_id: f.owner_user_id, bestand_id: f.id, nr, preis_brutto: f.fz.vk_brutto && f.fz.vk_brutto > 0 ? f.fz.vk_brutto : null,
          angebot_gueltig_bis: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        });
        if (!error) { setOk(`Verkaufsvorgang ${nr} angelegt.`); await lade(); return; }
        if (/ein_laufender/.test(error.message)) { setFehler('Für dieses Fahrzeug läuft schon ein Verkauf.'); await lade(); return; }
        if (versuch === 1) { setFehler('Anlegen fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ" und ist SQL Paket 266 ausgeführt?'); return; }
      }
    } finally { setBusy(false); }
  }

  async function speichern(extra: Record<string, unknown> = {}, meldung = 'Gespeichert.'): Promise<boolean> {
    if (!aktiv || !e) return false;
    setBusy(true); setFehler(null); setOk(null); setFehlerListe([]);
    try {
      const { error } = await supabase.from('kfz_verkauf').update({ ...zuFeldern(e), ...extra, aktualisiert_am: new Date().toISOString() }).eq('id', aktiv.id);
      if (error) {
        setFehler(/inzahlung_uq/.test(error.message) ? 'Dieses in Zahlung genommene Fahrzeug ist schon in einem anderen laufenden Verkauf verrechnet.' : 'Speichern fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ"?');
        return false;
      }
      if (e.inzahlung_ankauf_id) await supabase.from('kfz_ankauf').update({ quelle: 'inzahlungnahme' }).eq('id', e.inzahlung_ankauf_id).neq('quelle', 'online');
      setOk(meldung); await lade(); return true;
    } finally { setBusy(false); }
  }

  async function statusSetzen(ziel: string, grund?: string) {
    if (!aktiv || !e) return;
    const entwurf = { ...aktiv, ...(zuFeldern(e) as Partial<Verkauf>) } as Verkauf;
    const p = pruefen(entwurf, f.fz, ziel, heute());
    if (p.fehler.length) { setFehlerListe(p.fehler); setOk(null); return; }
    const extra: Record<string, unknown> = { status: ziel };
    if (ziel === 'vertrag' && !e.vertrag_am) extra.vertrag_am = heute();
    if (ziel === 'uebergeben' && !e.uebergabe_am) extra.uebergabe_am = heute();
    if (ziel === 'storniert') extra.storno_grund = (grund ?? '').trim().slice(0, 300) || null;
    const gut = await speichern(extra, `Status: ${statusLabel(ziel)}.`);
    if (!gut) return;
    setStorno(null);
    const patch = bestandNachVerkauf(ziel, f.bestandStatus, heute(), (extra.vertrag_am as string) || e.vertrag_am || null);
    if (patch) {
      const { error } = await supabase.from('kfz_bestand').update({ ...patch, aktualisiert_am: new Date().toISOString() }).eq('id', f.id);
      if (error) setFehler('Der Verkauf ist gespeichert, der Status im Bestand aber nicht. Bitte im Bestand von Hand setzen.');
    }
    if (ziel === 'vertrag') {
      // Erlös in die Kalkulation (nur wenn dort noch keiner steht; Recht „Darf abrechnen" — sonst still)
      try {
        const k = await supabase.from('kfz_bestand_kalk').select('vk_erzielt').eq('bestand_id', f.id).maybeSingle();
        const bisher = (k.data as { vk_erzielt: number | null } | null)?.vk_erzielt ?? null;
        if (!k.error && bisher === null) await supabase.from('kfz_bestand_kalk').upsert({ bestand_id: f.id, owner_user_id: f.owner_user_id, vk_erzielt: betraege(entwurf).fahrzeug, aktualisiert_am: new Date().toISOString() }, { onConflict: 'bestand_id' });
      } catch { /* Kalkulation ist optional */ }
    }
    onGeaendert();
  }

  async function firmaHolen(): Promise<Firmenkopf | null> {
    try {
      const r = await fetch('/api/betrieb-firmendaten', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = (await r.json()) as { firma?: Record<string, string | null> };
      const x = j.firma ?? {};
      return { name: x.firma_name ?? null, strasse: x.firma_strasse ?? null, plz: x.firma_plz ?? null, ort: x.firma_ort ?? null, telefon: x.firma_telefon ?? null, email: x.firma_email ?? null };
    } catch { return null; }
  }

  async function inhalt(art: DokArt) {
    if (!aktiv) return null;
    const firma = await firmaHolen();
    const inz = ankaeufe.find((a) => a.id === aktiv.inzahlung_ankauf_id) ?? null;
    return { d: dokumentInhalt(art, aktiv, f.fz, firma, inz, heute()), firma };
  }

  async function drucken(art: DokArt) {
    setFehler(null); setOk(null); setLink(null);
    const r = await inhalt(art); if (!r) return;
    verkaufPdf(r.d, dateiName(art, aktiv?.nr ?? null));
    if (!r.firma?.name) setOk('PDF erstellt. Ihre Firmendaten fehlen darin (Einstellungen → Firmendaten) — bitte von Hand eintragen.');
  }

  async function zurUnterschrift(art: DokArt) {
    if (!aktiv) return;
    setBusy(true); setFehler(null); setOk(null); setLink(null);
    try {
      const r = await inhalt(art); if (!r) return;
      const name = DOK_ARTEN.find((d) => d.key === art)?.label ?? art;
      const s = await signaturStarten(supabase, f.owner_user_id, {
        titel: `${name} ${aktiv.nr ?? ''}`.trim(), empfaenger_name: aktiv.kaeufer_firma || aktiv.kaeufer_name, empfaenger_email: aktiv.kaeufer_email,
        dokument: alsText(r.d), aufbewahrung_jahre: 10,
      });
      if (!s.ok || !s.token) { setFehler('Die Unterschrifts-Anfrage ließ sich nicht anlegen.'); return; }
      const neu = { ...(aktiv.signaturen ?? {}), [art]: s.token };
      await supabase.from('kfz_verkauf').update({ signaturen: neu, aktualisiert_am: new Date().toISOString() }).eq('id', aktiv.id);
      try { await navigator.clipboard.writeText(s.link || ''); } catch { /* egal */ }
      setLink(s.link || null);
      setOk(`Unterschrifts-Link für „${name}" erstellt und kopiert. Schicken Sie ihn dem Käufer oder öffnen Sie ihn am Tablet.`);
      await lade();
    } finally { setBusy(false); }
  }

  async function loeschen() {
    if (!aktiv || !istChef) return;
    setLoeschFrage(false); setBusy(true); setFehler(null);
    try {
      const { data: weg, error } = await supabase.from('kfz_verkauf').delete().eq('id', aktiv.id).select('id');
      if (error || !weg || !(weg as unknown[]).length) { setFehler('Löschen fehlgeschlagen.'); return; }
      const patch = bestandNachVerkauf('storniert', f.bestandStatus, heute(), null);
      if (patch) await supabase.from('kfz_bestand').update({ ...patch, aktualisiert_am: new Date().toISOString() }).eq('id', f.id);
      setOk('Verkaufsvorgang gelöscht.'); await lade(); onGeaendert();
    } finally { setBusy(false); }
  }

  if (!aktiv || !e) {
    return (
      <div style={s.karte}>
        {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
        {ok && <div style={s.ok} role="status">{ok}</div>}
        <h3 style={s.h3}>Verkauf</h3>
        <div style={s.dim}>Noch kein laufender Verkauf. Legen Sie einen Vorgang an, sobald es einen Interessenten gibt: daraus entstehen Angebot, Reservierung, Kaufvertrag, Zulassungsvollmacht und Empfangsbestätigung.</div>
        <button style={{ ...s.gold, marginTop: 10, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void anlegen()}>＋ Verkaufsvorgang anlegen</button>
        {alte.length > 0 && <AlteVorgaenge alte={alte} />}
      </div>
    );
  }

  const entwurf = { ...aktiv, ...(zuFeldern(e) as Partial<Verkauf>) } as Verkauf;
  const b = betraege(entwurf);
  const bar = barSumme(entwurf);
  const gwg = gwgNoetig(entwurf);
  const naechste = (['reserviert', 'vertrag', 'uebergeben', 'angebot'] as const).filter((z) => wechselErlaubt(aktiv.status, z));
  const vorschau = naechste.length ? pruefen(entwurf, f.fz, naechste.includes('vertrag') ? 'vertrag' : naechste[0], heute()) : { fehler: [], hinweise: pruefen(entwurf, f.fz, aktiv.status, heute()).hinweise };
  const st = VERKAUF_STATUS.find((x) => x.key === aktiv.status);
  const gesperrt = aktiv.status === 'uebergeben';
  const set = (p: Partial<Entwurf>) => setE({ ...e, ...p });

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={s.karte}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <h3 style={{ ...s.h3, margin: 0 }}>Verkauf {aktiv.nr ?? ''} <span style={{ ...s.pill, color: FARBE[st?.farbe ?? 'dim'], marginLeft: 6 }}>{statusLabel(aktiv.status)}</span></h3>
          <div style={s.reihe}>
            {naechste.map((z) => <button key={z} style={z === 'vertrag' ? s.gold : s.btn} disabled={busy} onClick={() => void statusSetzen(z)}>{z === 'reserviert' ? '🔖 Reservieren' : z === 'vertrag' ? '✓ Kaufvertrag abschließen' : z === 'uebergeben' ? '🔑 Übergeben' : '↩ Zurück zu Angebot'}</button>)}
            {wechselErlaubt(aktiv.status, 'storniert') && <button style={s.btnRot} disabled={busy} onClick={() => setStorno('')}>✕ Stornieren</button>}
          </div>
        </div>
        {storno !== null && (
          <div style={{ ...s.frage, marginTop: 10 }}>
            <label style={s.lab}>Grund für das Storno (bleibt im Verlauf)<input style={s.inp} value={storno} maxLength={300} onChange={(ev) => setStorno(ev.target.value)} placeholder="z. B. Käufer hat abgesagt" /></label>
            <div style={{ ...s.reihe, marginTop: 8 }}><button style={s.btnRot} disabled={busy} onClick={() => void statusSetzen('storniert', storno)}>Ja, stornieren</button><button style={s.btn} onClick={() => setStorno(null)}>Abbrechen</button></div>
            <div style={{ ...s.dim, marginTop: 6 }}>Das Fahrzeug geht zurück in den Bestand. Unterschriebene Unterlagen bleiben in ARGONAUT-Sign erhalten.</div>
          </div>
        )}
        {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
        {fehlerListe.length > 0 && <div style={s.fehler} role="alert"><b>Noch nicht möglich:</b><ul style={{ margin: '6px 0 0 18px', padding: 0 }}>{fehlerListe.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        {ok && <div style={s.ok} role="status">{ok}{link && <div style={{ ...s.mono, marginTop: 4, wordBreak: 'break-all' }}>{link}</div>}</div>}
        {gwg && (
          <div style={{ ...s.fehler, borderColor: e.gwg_erledigt ? C.ok : C.bad, background: e.gwg_erledigt ? 'rgba(76,175,125,0.10)' : 'rgba(224,102,102,0.12)' }}>
            <b>Bargeld {geld(bar)}</b> — ab 10.000 € muss der Käufer nach dem Geldwäschegesetz identifiziert und das festgehalten werden. Bar-Anzahlung und Restzahlung zählen zusammen.
            <div style={{ ...s.reihe, marginTop: 8 }}>
              <a href="/dashboard/kfz/gwg" style={{ ...s.btn, textDecoration: 'none' }}>🛂 Zur GwG-Identifizierung</a>
              <label style={s.haken}><input type="checkbox" disabled={gesperrt} checked={e.gwg_erledigt} onChange={(ev) => set({ gwg_erledigt: ev.target.checked })} /> Identifizierung erledigt</label>
            </div>
          </div>
        )}
        {vorschau.hinweise.length > 0 && <div style={s.hinweis}>{vorschau.hinweise.map((h, i) => <div key={i}>● {h}</div>)}</div>}
        {aktiv.status === 'reserviert' && aktiv.reserviert_bis && aktiv.reserviert_bis < heute() && <div style={{ ...s.hinweis, borderColor: C.warn }}>Die Reservierung ist am {aktiv.reserviert_bis.split('-').reverse().join('.')} abgelaufen.</div>}
      </div>

      <div style={s.raster}>
        <div style={s.karte}>
          <h3 style={s.h3}>Käufer</h3>
          <div style={s.feldRaster}>
            <label style={s.lab}>Käufer ist<select style={s.inp} disabled={gesperrt} value={e.kaeufer_art} onChange={(ev) => set({ kaeufer_art: ev.target.value, gewaehr: gewaehrErlaubt(ev.target.value, e.gewaehr) ? e.gewaehr : 'gesetzlich' })}><option value="verbraucher">Privatperson (Verbraucher)</option><option value="unternehmer">Unternehmen</option></select></label>
            <label style={s.lab}>Name<input style={s.inp} disabled={gesperrt} value={e.kaeufer_name} maxLength={120} onChange={(ev) => set({ kaeufer_name: ev.target.value })} /></label>
            {e.kaeufer_art === 'unternehmer' && <label style={s.lab}>Firma<input style={s.inp} disabled={gesperrt} value={e.kaeufer_firma} maxLength={120} onChange={(ev) => set({ kaeufer_firma: ev.target.value })} /></label>}
            {e.kaeufer_art === 'unternehmer' && <label style={s.lab}>USt-IdNr.<input style={s.inp} disabled={gesperrt} value={e.kaeufer_ustid} maxLength={20} onChange={(ev) => set({ kaeufer_ustid: ev.target.value })} /></label>}
            <label style={s.lab}>Telefon<input style={s.inp} disabled={gesperrt} value={e.kaeufer_tel} maxLength={40} onChange={(ev) => set({ kaeufer_tel: ev.target.value })} /></label>
            <label style={s.lab}>E-Mail<input style={s.inp} disabled={gesperrt} type="email" value={e.kaeufer_email} maxLength={160} onChange={(ev) => set({ kaeufer_email: ev.target.value })} /></label>
          </div>
          <label style={{ ...s.lab, marginTop: 8 }}>Anschrift<textarea style={{ ...s.inp, minHeight: 56 }} disabled={gesperrt} value={e.kaeufer_anschrift} maxLength={300} onChange={(ev) => set({ kaeufer_anschrift: ev.target.value })} placeholder={'Straße Nr.\nPLZ Ort'} /></label>
          <label style={{ ...s.haken, marginTop: 8 }}><input type="checkbox" disabled={gesperrt} checked={e.ausweis_geprueft} onChange={(ev) => set({ ausweis_geprueft: ev.target.checked })} /> Ausweis geprüft (die Nummer wird nicht gespeichert)</label>
        </div>

        <div style={s.karte}>
          <h3 style={s.h3}>Preis und Zahlung</h3>
          <div style={s.feldRaster}>
            <label style={s.lab}>Fahrzeugpreis brutto<input style={s.inp} disabled={gesperrt} inputMode="decimal" value={e.preis} onChange={(ev) => set({ preis: ev.target.value })} /></label>
            <label style={s.lab}>Anzahlung<input style={s.inp} disabled={gesperrt} inputMode="decimal" value={e.anzahlung} onChange={(ev) => set({ anzahlung: ev.target.value })} /></label>
            <label style={s.lab}>Anzahlung am<input type="date" style={s.inp} disabled={gesperrt} value={e.anzahlung_am} onChange={(ev) => set({ anzahlung_am: ev.target.value })} /></label>
            <label style={s.lab}>Anzahlung per<select style={s.inp} disabled={gesperrt} value={e.anzahlung_art} onChange={(ev) => set({ anzahlung_art: ev.target.value })}><option value="">—</option>{ZAHLARTEN.filter((z) => z.key !== 'finanzierung').map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}</select></label>
            <label style={s.lab}>Restzahlung per<select style={s.inp} disabled={gesperrt} value={e.rest_art} onChange={(ev) => set({ rest_art: ev.target.value })}><option value="">—</option>{ZAHLARTEN.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}</select></label>
          </div>
          <div style={{ ...s.tag, marginTop: 12 }}>Zusatzleistungen (brutto)</div>
          {e.zusatz.map((z, i) => (
            <div key={i} style={{ ...s.reihe, marginBottom: 6 }}>
              <input style={{ ...s.inp, flex: 2 }} disabled={gesperrt} value={z.text} maxLength={120} onChange={(ev) => set({ zusatz: e.zusatz.map((x, j) => j === i ? { ...x, text: ev.target.value } : x) })} aria-label="Leistung" />
              <input style={{ ...s.inp, width: 110 }} disabled={gesperrt} inputMode="decimal" value={z.betrag} onChange={(ev) => set({ zusatz: e.zusatz.map((x, j) => j === i ? { ...x, betrag: ev.target.value } : x) })} aria-label="Betrag" />
              {!gesperrt && <button style={s.btn} aria-label="Entfernen" onClick={() => set({ zusatz: e.zusatz.filter((_, j) => j !== i) })}>✕</button>}
            </div>
          ))}
          {!gesperrt && e.zusatz.length < 10 && <div style={s.reihe}>{['Zulassung', 'Überführung', 'Neue HU', 'Tankfüllung'].map((x) => <button key={x} style={s.chip} onClick={() => set({ zusatz: [...e.zusatz, { text: x, betrag: '' }] })}>＋ {x}</button>)}<button style={s.chip} onClick={() => set({ zusatz: [...e.zusatz, { text: '', betrag: '' }] })}>＋ Eigene</button></div>}

          <div style={{ ...s.tag, marginTop: 12 }}>Inzahlungnahme</div>
          <div style={s.feldRaster}>
            <label style={s.lab}>Fahrzeug aus dem Ankauf<select style={s.inp} disabled={gesperrt} value={e.inzahlung_ankauf_id} onChange={(ev) => {
              const a = ankaeufe.find((x) => x.id === ev.target.value);
              const v = a ? inzahlungVorschlag(a) : null;
              set({ inzahlung_ankauf_id: ev.target.value, inzahlung_betrag: ev.target.value ? (e.inzahlung_betrag || t(v)) : '' });
            }}><option value="">keine</option>{ankaeufe.map((a) => <option key={a.id} value={a.id}>{a.nr ?? '—'} · {[a.marke, a.modell].filter(Boolean).join(' ') || 'ohne Angabe'}{a.kennzeichen ? ` · ${a.kennzeichen}` : ''}</option>)}</select></label>
            {e.inzahlung_ankauf_id && <label style={s.lab}>Anrechnung brutto<input style={s.inp} disabled={gesperrt} inputMode="decimal" value={e.inzahlung_betrag} onChange={(ev) => set({ inzahlung_betrag: ev.target.value })} /></label>}
          </div>
          {e.inzahlung_ankauf_id && <div style={{ ...s.dim, marginTop: 4 }}>Vorschlag aus dem Ankauf (vereinbarter Preis, sonst Angebot; bei Unternehmen mit Umsatzsteuer). Den Ankauf selbst schließen Sie unter <a href={`/dashboard/kfz/ankauf/${e.inzahlung_ankauf_id}`} style={{ color: C.info }}>Ankauf und Bewertung</a> ab.</div>}
          {!ankaeufe.length && <div style={{ ...s.dim, marginTop: 4 }}>Ein Fahrzeug, das der Käufer in Zahlung gibt, legen Sie zuerst unter <a href="/dashboard/kfz/ankauf" style={{ color: C.info }}>Ankauf und Bewertung</a> an (Woher: Inzahlungnahme).</div>}

          <table style={{ ...s.tab, marginTop: 12 }}><tbody>
            <tr><td style={s.td}>Fahrzeugpreis</td><td style={s.tdR}>{geld(b.fahrzeug)}</td></tr>
            {b.zusatz > 0 && <tr><td style={s.td}>Zusatzleistungen</td><td style={s.tdR}>{geld(b.zusatz)}</td></tr>}
            {b.inzahlung > 0 && <tr><td style={s.td}>Inzahlungnahme</td><td style={s.tdR}>- {geld(b.inzahlung)}</td></tr>}
            {b.anzahlung > 0 && <tr><td style={s.td}>Anzahlung</td><td style={s.tdR}>- {geld(b.anzahlung)}</td></tr>}
            <tr><td style={{ ...s.td, fontWeight: 800 }}>{b.rest >= 0 ? 'Noch zu zahlen' : 'Auszahlung an Käufer'}</td><td style={{ ...s.tdR, fontWeight: 800, color: C.gold }}>{geld(Math.abs(b.rest))}</td></tr>
          </tbody></table>
          <div style={{ ...s.dim, marginTop: 6 }}>{f.fz.besteuerung === '25a' ? 'Differenzbesteuert (§ 25a): keine Umsatzsteuer im Vertrag ausgewiesen.' : f.fz.besteuerung === 'regel' ? 'Regelsteuer: Der Vertrag nennt die enthaltene Umsatzsteuer.' : 'Besteuerung offen — bitte in den Stammdaten festlegen.'} Die Rechnung folgt mit dem nächsten Ausbau.</div>
        </div>

        <div style={s.karte}>
          <h3 style={s.h3}>Vertrag und Termine</h3>
          <label style={s.lab}>Sachmängelhaftung<select style={s.inp} disabled={gesperrt} value={e.gewaehr} onChange={(ev) => set({ gewaehr: ev.target.value })}>{GEWAEHR.filter((g) => !g.nurUnternehmer || e.kaeufer_art === 'unternehmer').map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select></label>
          {e.kaeufer_art === 'verbraucher' && e.gewaehr === 'ein_jahr' && (
            <label style={{ ...s.haken, marginTop: 8, alignItems: 'flex-start' }}><input type="checkbox" disabled={gesperrt} checked={e.gewaehr_gesondert} onChange={(ev) => set({ gewaehr_gesondert: ev.target.checked })} /> <span>Gesondert vereinbart: Der Käufer wurde <b>vor</b> seiner Unterschrift eigens auf die Verkürzung hingewiesen. Im Kaufvertrag steht dafür ein eigener Abschnitt mit eigener Unterschrift.</span></label>
          )}
          <div style={{ ...s.feldRaster, marginTop: 10 }}>
            <label style={s.lab}>Angebot gültig bis<input type="date" style={s.inp} disabled={gesperrt} value={e.angebot_gueltig_bis} onChange={(ev) => set({ angebot_gueltig_bis: ev.target.value })} /></label>
            <label style={s.lab}>Reserviert bis<input type="date" style={s.inp} disabled={gesperrt} value={e.reserviert_bis} onChange={(ev) => set({ reserviert_bis: ev.target.value })} /></label>
            <label style={s.lab}>Kaufvertrag vom<input type="date" style={s.inp} disabled={gesperrt} value={e.vertrag_am} onChange={(ev) => set({ vertrag_am: ev.target.value })} /></label>
            <label style={s.lab}>Übergabe geplant<input type="date" style={s.inp} disabled={gesperrt} value={e.liefertermin} onChange={(ev) => set({ liefertermin: ev.target.value })} /></label>
          </div>
          <label style={{ ...s.lab, marginTop: 8 }}>Weitere Vereinbarungen<textarea style={{ ...s.inp, minHeight: 70 }} disabled={gesperrt} value={e.vereinbarungen} maxLength={2000} onChange={(ev) => set({ vereinbarungen: ev.target.value })} placeholder="z. B. Neue Bremsbeläge vorn vor Übergabe" /></label>
        </div>

        <div style={s.karte}>
          <h3 style={s.h3}>Übergabe</h3>
          <div style={s.feldRaster}>
            <label style={s.lab}>Übergeben am<input type="date" style={s.inp} disabled={gesperrt} value={e.uebergabe_am} onChange={(ev) => set({ uebergabe_am: ev.target.value })} /></label>
            <label style={s.lab}>Kilometerstand<input style={s.inp} disabled={gesperrt} inputMode="numeric" value={e.km_uebergabe} onChange={(ev) => set({ km_uebergabe: ev.target.value })} placeholder={f.fz.km_stand !== null ? String(f.fz.km_stand) : ''} /></label>
            <label style={s.lab}>Schlüssel<input style={s.inp} disabled={gesperrt} inputMode="numeric" value={e.schluessel} onChange={(ev) => set({ schluessel: ev.target.value })} /></label>
          </div>
          <div style={{ ...s.tag, marginTop: 10 }}>Unterlagen</div>
          <div style={{ display: 'grid', gap: 4 }}>{PAPIERE.map((p) => (
            <label key={p} style={s.haken}><input type="checkbox" disabled={gesperrt} checked={e.papiere.includes(p)} onChange={(ev) => set({ papiere: ev.target.checked ? [...e.papiere, p] : e.papiere.filter((x) => x !== p) })} /> {p}</label>
          ))}</div>
        </div>
      </div>

      {!gesperrt && <div><button style={{ ...s.gold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void speichern()}>💾 Verkauf speichern</button></div>}

      <div style={s.karte}>
        <h3 style={s.h3}>Unterlagen</h3>
        <div style={{ ...s.dim, marginBottom: 10 }}>Die Unterlagen nutzen den <b>gespeicherten</b> Stand — erst speichern, dann drucken. „✍ Unterschrift" legt in ARGONAUT-Sign einen Link an, den der Käufer am Handy, am Tablet im Autohaus oder am Rechner unterschreibt.</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {DOK_ARTEN.map((d) => {
            const token = (aktiv.signaturen ?? {})[d.key];
            const stand = token ? sig[token] : undefined;
            const leerAnz = d.key === 'anzahlung' && !(aktiv.anzahlung && aktiv.anzahlung > 0);
            return (
              <div key={d.key} style={s.dokZeile}>
                <span style={{ fontWeight: 700 }}>{d.label}</span>
                <span style={{ ...s.dim, flex: 1 }}>{leerAnz ? 'erst mit Anzahlung' : stand ? (stand.status === 'signiert' ? `✓ unterschrieben${stand.signiert_am ? ` am ${stand.signiert_am.slice(0, 10).split('-').reverse().join('.')}` : ''}` : stand.status === 'angesehen' ? 'Link geöffnet, noch nicht unterschrieben' : 'Link verschickt') : ''}</span>
                <button style={s.btn} disabled={leerAnz} onClick={() => void drucken(d.key)}>🖨 PDF</button>
                {d.sign && <button style={s.btn} disabled={busy || leerAnz} onClick={() => void zurUnterschrift(d.key)}>✍ {token ? 'Neuer Link' : 'Unterschrift'}</button>}
              </div>
            );
          })}
        </div>
        <div style={{ ...s.hinweis, marginTop: 10 }}>Die Vertragstexte sind Vorlagen von ARGONAUT. Bitte lassen Sie sie vor dem ersten Einsatz von Ihrem Anwalt prüfen. Unterschriebene Fassungen finden Sie unter <a href="/dashboard/signaturen" style={{ color: C.info }}>Signaturen</a>.</div>
      </div>

      {(aktiv.status === 'vertrag' || aktiv.status === 'uebergeben') && (() => {
        const gueltig = rechnung && rechnung.zahlungsstatus !== 'storniert';
        const fall = steuerfall(f.fz.besteuerung, lieferung, aktiv, eigeneUstId === undefined ? 'vorhanden' : eigeneUstId, f.fz, heute());
        const vorschau = fall.fehler.length ? null : rechnungBauen(aktiv, f.fz, fall.sonderfall, null, null);
        return (
          <div style={s.karte}>
            <h3 style={s.h3}>Rechnung</h3>
            {gueltig ? (
              <div style={s.reihe}>
                <span>Rechnung <b>{rechnung.rechnungsnummer ?? '—'}</b> · {geld(Number(rechnung.brutto_summe) || 0)} · {rechnung.zahlungsstatus}</span>
                <a href={`/dashboard/rechnungen/${rechnung.id}`} style={{ ...s.btn, textDecoration: 'none' }}>🧾 Rechnung öffnen</a>
              </div>
            ) : darfAbrechnen === false ? (
              <div style={s.dim}>Rechnungen erstellt die Geschäftsleitung oder wer „Darf abrechnen" hat.</div>
            ) : (
              <>
                {rechnung && rechnung.zahlungsstatus === 'storniert' && <div style={{ ...s.dim, marginBottom: 8 }}>Die bisherige Rechnung {rechnung.rechnungsnummer ?? ''} ist storniert — Sie können eine neue erstellen.</div>}
                <div style={{ ...s.tag }}>Wohin geht das Fahrzeug?</div>
                <div style={{ ...s.reihe, marginBottom: 8 }}>
                  {LIEFERUNGEN.map((l) => (
                    <button key={l.key} title={l.text} style={{ ...s.chip, ...(lieferung === l.key ? { borderColor: C.gold, color: C.gold } : {}) }} onClick={() => setLieferung(l.key)}>{l.label}</button>
                  ))}
                </div>
                <div style={s.dim}>{LIEFERUNGEN.find((l) => l.key === lieferung)?.text}</div>
                {fall.fehler.length > 0 && <div style={s.fehler}>{fall.fehler.map((x) => <div key={x}>• {x}</div>)}</div>}
                {vorschau && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ ...s.dim, marginBottom: 6 }}>Steuerfall: <b style={{ color: C.text }}>{fall.sonderfall ? sonderfallLabel(fall.sonderfall) : 'Regelbesteuerung, 19 % Umsatzsteuer'}</b></div>
                    <table style={s.tab}><tbody>
                      {vorschau.posten.map((p, i) => (
                        <tr key={i}><td style={s.td}>{p.bezeichnung}</td><td style={s.tdR}>{p.mwst_satz === 0 ? (fall.sonderfall === 'diff25a' ? '§ 25a' : 'steuerfrei') : `${p.mwst_satz} %`}</td><td style={s.tdR}>{geld(p.gesamt_netto)}</td></tr>
                      ))}
                      {vorschau.steuer > 0 && <tr><td style={s.td}>Umsatzsteuer</td><td style={s.tdR}></td><td style={s.tdR}>{geld(vorschau.steuer)}</td></tr>}
                      <tr><td style={{ ...s.td, fontWeight: 800 }}>Rechnungsbetrag</td><td style={s.tdR}></td><td style={{ ...s.tdR, fontWeight: 800 }}>{geld(vorschau.brutto)}</td></tr>
                      {vorschau.vorab > 0 && <tr><td style={s.td}>Vorab verrechnet (Anzahlung, Inzahlungnahme)</td><td style={s.tdR}></td><td style={s.tdR}>− {geld(vorschau.vorab)}</td></tr>}
                      {vorschau.vorab > 0 && <tr><td style={{ ...s.td, fontWeight: 700 }}>Noch zu zahlen</td><td style={s.tdR}></td><td style={{ ...s.tdR, fontWeight: 700 }}>{geld(vorschau.rest)}</td></tr>}
                    </tbody></table>
                    {[...fall.hinweise, ...vorschau.hinweise].length > 0 && <div style={s.hinweis}>{[...fall.hinweise, ...vorschau.hinweise].map((x) => <div key={x}>• {x}</div>)}</div>}
                    <div style={{ ...s.dim, margin: '6px 0' }}>Die Inzahlungnahme mindert den Rechnungsbetrag nicht — sie steht als Zahlungshinweis auf der Rechnung. Grundlage ist der <b>gespeicherte</b> Stand des Verkaufs.</div>
                    <button style={{ ...s.gold, opacity: busy || darfAbrechnen !== true ? 0.6 : 1 }} disabled={busy || darfAbrechnen !== true} onClick={() => void rechnungErstellen()}>🧾 Rechnung erstellen</button>
                  </div>
                )}
              </>
            )}
            {rHinweise.length > 0 && <div style={s.hinweis}>{rHinweise.map((x) => <div key={x}>• {x}</div>)}</div>}
          </div>
        );
      })()}

      {/* Paket 281 (K15a): Käufer als Kontakt + Kaufstatus-Link fürs Kundenportal */}
      <KfzKaufstatus v={aktiv} onGeaendert={() => { void lade(); }} />

      {istChef && (aktiv.status === 'angebot') && (
        <div style={s.karte}>
          {!loeschFrage ? <button style={s.btnRot} onClick={() => setLoeschFrage(true)}>🗑 Vorgang löschen</button> : (
            <div style={s.frage}>Verkaufsvorgang {aktiv.nr} wirklich löschen? Das lässt sich nicht rückgängig machen.
              <div style={{ ...s.reihe, marginTop: 8 }}><button style={s.btnRot} disabled={busy} onClick={() => void loeschen()}>Ja, löschen</button><button style={s.btn} onClick={() => setLoeschFrage(false)}>Abbrechen</button></div>
            </div>
          )}
        </div>
      )}
      {alte.length > 0 && <AlteVorgaenge alte={alte} />}
    </div>
  );
}

function AlteVorgaenge({ alte }: { alte: Zeile[] }) {
  return (
    <div style={{ ...s.karte, marginTop: 10 }}>
      <div style={s.tag}>Frühere Vorgänge</div>
      {alte.map((a) => <div key={a.id} style={{ ...s.dim, padding: '4px 0' }}>{a.nr ?? '—'} · {a.kaeufer_firma || a.kaeufer_name || 'ohne Käufer'} · storniert{a.storno_grund ? `: ${a.storno_grund}` : ''}</div>)}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  h3: { margin: '0 0 10px', fontSize: 15, fontWeight: 800 },
  dim: { color: C.dim, fontSize: 13 },
  mono: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 },
  pill: { display: 'inline-block', border: '1px solid currentColor', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  reihe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  btn: { background: C.navy2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  btnRot: { background: 'transparent', border: `1px solid ${C.bad}`, color: C.bad, borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
  chip: { border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, borderRadius: 999, padding: '4px 12px', fontSize: 12.5, cursor: 'pointer' },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  hinweis: { background: 'rgba(95,168,232,0.08)', border: '1px solid rgba(95,168,232,0.35)', borderRadius: 10, padding: '8px 12px', fontSize: 13.5, margin: '6px 0', display: 'grid', gap: 4 },
  frage: { background: C.navy3, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 },
  feldRaster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  tag: { fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.dim, fontWeight: 700, marginBottom: 6 },
  haken: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 },
  tab: { width: '100%', borderCollapse: 'collapse' },
  td: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5 },
  tdR: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 13.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  dokZeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderBottom: `1px dashed ${C.border}` },
};
