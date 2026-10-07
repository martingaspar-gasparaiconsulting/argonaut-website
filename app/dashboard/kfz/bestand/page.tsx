'use client';

// ============================================================
// ARGONAUT OS · Paket 259 · K1 Fahrzeugbestand (Teil 1)
// Handelsbestand mit Branchen-Vorlage: Status, Sparten, Spalten, Standtage-
// Ampel und gespeicherte Suchen kommen aus lib/branchenVorlage.ts (je Branche
// vorbelegt), der Chef passt sie unter „⚙ Spalten und Einstellungen" an
// (Tabelle modul_einstellung). Preisänderungen schreibt die Datenbank selbst
// in den Preisverlauf (kfz_bestand_preis).
// Pfad: app/dashboard/kfz/bestand/page.tsx — Unterpfad von /dashboard/kfz,
// erbt dessen Freigabe (Modul „kfz").
// Andockpunkte: K1 Teil 2 (Listendruck, FIN-Verknüpfung zur Lebensakte,
// Eigene Felder), K2 Handelsakte (Klick auf ein Fahrzeug).
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties, type ReactNode } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl, centRunden } from '@/lib/zahlen';
import { vorlageFuer, mitKunde, feinschliffName, standtageAmpel, type KundenEinstellung, type Vorlage } from '@/lib/branchenVorlage';
import {
  standtage, finPruefen, ezText, ezAusEingabe, passtSuche, regelPasst, summen,
  preisNachProzent, naechsteNr, euro, psAusKw, type Bestand,
} from '@/lib/kfzBestand';

const MODUL = 'kfz-bestand';
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', navy3: '#14294A', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8',
};
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, gold: C.gold, dim: C.dim };
const SPALTEN = 'id, interne_nr, status, sparte, marke, modell, variante, fin, kennzeichen, erstzulassung, km_stand, leistung_kw, kraftstoff, farbe, farbcode, standort_id, eingang_am, verkauft_am, ek_netto, vk_brutto, besteuerung, inseriert, notiz';

type Standort = { id: string; name: string };
type Form = Record<'marke' | 'modell' | 'variante' | 'sparte' | 'status' | 'fin' | 'kennzeichen' | 'ez' | 'km' | 'kw' | 'kraftstoff' | 'farbe' | 'farbcode' | 'standort_id' | 'eingang_am' | 'ek' | 'vk' | 'besteuerung' | 'notiz', string>;

function heute(): string { return new Date().toISOString().slice(0, 10); }
function leer(v: Vorlage | null): Form {
  return { marke: '', modell: '', variante: '', sparte: v?.sparten[0] ?? '', status: 'bestand', fin: '', kennzeichen: '', ez: '', km: '', kw: '', kraftstoff: '', farbe: '', farbcode: '', standort_id: '', eingang_am: heute(), ek: '', vk: '', besteuerung: '25a', notiz: '' };
}
function ausBestand(b: Bestand): Form {
  const z = (n: number | null) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
  return {
    marke: b.marke ?? '', modell: b.modell ?? '', variante: b.variante ?? '', sparte: b.sparte ?? '', status: b.status, fin: b.fin ?? '',
    kennzeichen: b.kennzeichen ?? '', ez: b.erstzulassung ? ezText(b.erstzulassung) : '', km: z(b.km_stand), kw: z(b.leistung_kw),
    kraftstoff: b.kraftstoff ?? '', farbe: b.farbe ?? '', farbcode: b.farbcode ?? '', standort_id: b.standort_id ?? '',
    eingang_am: b.eingang_am ?? '', ek: z(b.ek_netto), vk: z(b.vk_brutto), besteuerung: b.besteuerung ?? '', notiz: b.notiz ?? '',
  };
}
function ganz(t: string): number | null { const n = leseZahl(t); return n === null || n < 0 ? null : Math.round(n); }
function geld(t: string): number | null { const n = leseZahl(t); return n === null || n < 0 ? null : centRunden(n); }

export default function FahrzeugbestandPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [besitzer, setBesitzer] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [branche, setBranche] = useState<string | null>(null);
  const [einstellung, setEinstellung] = useState<KundenEinstellung | null>(null);
  const [liste, setListe] = useState<Bestand[]>([]);
  const [standorte, setStandorte] = useState<Standort[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suche, setSuche] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fSparte, setFSparte] = useState('');
  const [fStandort, setFStandort] = useState('');
  const [aktiveSuche, setAktiveSuche] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<'liste' | 'karten'>('liste');
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [formOffen, setFormOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(leer(null));
  const [einstOffen, setEinstOffen] = useState(false);
  const [entwurf, setEntwurf] = useState<KundenEinstellung>({});
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null);
  const [prozent, setProzent] = useState('-2');

  const vorlage = useMemo(() => {
    const v = vorlageFuer(MODUL, branche);
    return v ? mitKunde(v, einstellung) : null;
  }, [branche, einstellung]);
  const fein = useMemo(() => feinschliffName(MODUL, branche), [branche]);
  const tag = heute();

  const ladeAlles = useCallback(async (betrieb: string) => {
    const [b, s, e, p] = await Promise.all([
      supabase.from('kfz_bestand').select(SPALTEN).order('eingang_am', { ascending: true, nullsFirst: false }),
      supabase.from('standorte').select('id, name').eq('aktiv', true).order('name'),
      supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', betrieb).eq('modul', MODUL).maybeSingle(),
      supabase.from('profiles').select('branche').eq('id', betrieb).maybeSingle(),
    ]);
    if (b.error) setFehler('Der Fahrzeugbestand ist noch nicht eingerichtet (SQL Paket 259 fehlt) oder Ihnen fehlt das Recht „KFZ".');
    setListe(((b.data as unknown) as Bestand[]) ?? []);
    setStandorte(((s.data as unknown) as Standort[]) ?? []);
    setEinstellung(((e.data as { einstellung?: KundenEinstellung } | null)?.einstellung) ?? null);
    setBranche(((p.data as { branche?: string | null } | null)?.branche) ?? null);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      const { data: chef } = await supabase.rpc('mein_chef_id');
      const betrieb = typeof chef === 'string' && chef ? chef : id;
      setUid(id); setBesitzer(betrieb); setIstChef(betrieb === id);
      await ladeAlles(betrieb);
      setLaden(false);
    })();
  }, [ladeAlles]);

  useEffect(() => { if (vorlage && !formOffen) setForm(leer(vorlage)); }, [vorlage, formOffen]);

  const standortName = useCallback((id: string | null) => standorte.find((s) => s.id === id)?.name ?? '—', [standorte]);
  const statusInfo = useCallback((key: string) => vorlage?.status.find((s) => s.key === key) ?? { key, label: key, farbe: 'dim' as const }, [vorlage]);

  const gefiltert = useMemo(() => {
    const regel = aktiveSuche ? vorlage?.suchen.find((s) => s.key === aktiveSuche)?.regel ?? null : null;
    return liste.filter((b) => passtSuche(b, suche)
      && (!fStatus || b.status === fStatus) && (!fSparte || b.sparte === fSparte) && (!fStandort || b.standort_id === fStandort)
      && (!regel || regelPasst(b, regel, tag))
      && (fStatus || regel ? true : b.status !== 'archiv'));
  }, [liste, suche, fStatus, fSparte, fStandort, aktiveSuche, vorlage, tag]);
  const sum = useMemo(() => summen(gefiltert, tag), [gefiltert, tag]);
  const sichtbar = (k: string) => vorlage?.spalten.find((s) => s.key === k)?.sichtbar ?? false;

  function neuOeffnen() { setBearbeite(null); setForm(leer(vorlage)); setFormOffen(true); setFehler(null); setOk(null); }
  function bearbeiten(b: Bestand) { setBearbeite(b.id); setForm(ausBestand(b)); setFormOffen(true); setFehler(null); setOk(null); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }); }

  async function speichern() {
    if (!uid || !besitzer) return;
    if (!form.marke.trim() && !form.modell.trim()) { setFehler('Bitte mindestens Marke oder Modell angeben.'); return; }
    const f = finPruefen(form.fin);
    if (!f.ok) { setFehler(f.fehler); return; }
    const ez = form.ez.trim() ? ezAusEingabe(form.ez) : null;
    if (form.ez.trim() && !ez) { setFehler('Erstzulassung bitte als Monat/Jahr eingeben, z. B. 03/2022.'); return; }
    const zeile = {
      status: form.status || 'bestand', sparte: form.sparte || null, marke: form.marke.trim() || null, modell: form.modell.trim() || null,
      variante: form.variante.trim() || null, fin: f.fin, kennzeichen: form.kennzeichen.trim().toUpperCase() || null, erstzulassung: ez,
      km_stand: ganz(form.km), leistung_kw: ganz(form.kw), kraftstoff: form.kraftstoff.trim() || null, farbe: form.farbe.trim() || null,
      farbcode: form.farbcode.trim() || null, standort_id: form.standort_id || null, eingang_am: form.eingang_am || null,
      verkauft_am: form.status === 'verkauft' ? (liste.find((x) => x.id === bearbeite)?.verkauft_am ?? tag) : null,
      ek_netto: geld(form.ek), vk_brutto: geld(form.vk), besteuerung: form.besteuerung || null, notiz: form.notiz.trim() || null,
      aktualisiert_am: new Date().toISOString(),
    };
    setBusy(true); setFehler(null); setOk(null);
    try {
      if (bearbeite) {
        const { error } = await supabase.from('kfz_bestand').update(zeile).eq('id', bearbeite);
        if (error) { setFehler('Speichern fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ"?'); return; }
        setOk('Fahrzeug gespeichert.');
      } else {
        const nr = naechsteNr(liste.map((x) => x.interne_nr));
        const { error } = await supabase.from('kfz_bestand').insert({ ...zeile, owner_user_id: besitzer, interne_nr: nr });
        if (error) { setFehler(/duplicate|unique/i.test(error.message) ? 'Diese interne Nummer gibt es schon. Bitte die Seite neu laden.' : 'Speichern fehlgeschlagen. Haben Sie das Schreibrecht für „KFZ"?'); return; }
        setOk(`Fahrzeug ${nr} aufgenommen.`);
      }
      setFormOffen(false); setBearbeite(null);
      await ladeAlles(besitzer);
    } finally { setBusy(false); }
  }

  async function loeschen(id: string) {
    if (!besitzer) return;
    const { error } = await supabase.from('kfz_bestand').delete().eq('id', id);
    setLoeschFrage(null);
    if (error) { setFehler('Löschen fehlgeschlagen. Nur die Geschäftsleitung kann Fahrzeuge löschen.'); return; }
    setListe((l) => l.filter((x) => x.id !== id));
    setOk('Fahrzeug gelöscht. Tipp: Statt zu löschen können Sie es auf „Archiv" setzen.');
  }

  async function massen(art: 'status' | 'standort' | 'preis', wert: string) {
    if (!besitzer || auswahl.size === 0) return;
    const ids = Array.from(auswahl);
    setBusy(true); setFehler(null); setOk(null);
    let fehlerZahl = 0; let uebersprungen = 0;
    try {
      for (const id of ids) {
        const b = liste.find((x) => x.id === id);
        if (!b) continue;
        let patch: Record<string, unknown>;
        if (art === 'status') patch = { status: wert, verkauft_am: wert === 'verkauft' ? (b.verkauft_am ?? tag) : null };
        else if (art === 'standort') patch = { standort_id: wert || null };
        else {
          const p = leseZahl(wert);
          const neu = p === null ? null : preisNachProzent(b.vk_brutto, p);
          if (neu === null) { uebersprungen += 1; continue; }
          patch = { vk_brutto: neu };
        }
        const { error } = await supabase.from('kfz_bestand').update({ ...patch, aktualisiert_am: new Date().toISOString() }).eq('id', id);
        if (error) fehlerZahl += 1;
      }
      await ladeAlles(besitzer);
      setAuswahl(new Set());
      if (fehlerZahl) setFehler(`${fehlerZahl} von ${ids.length} Fahrzeugen konnten nicht geändert werden (Schreibrecht „KFZ"?).`);
      else setOk(`${ids.length - uebersprungen} Fahrzeuge geändert${uebersprungen ? `, ${uebersprungen} ohne Verkaufspreis übersprungen` : ''}.`);
    } finally { setBusy(false); }
  }

  function einstOeffnen() {
    if (!vorlage) return;
    setEntwurf({
      spaltenSichtbar: Object.fromEntries(vorlage.spalten.map((s) => [s.key, s.sichtbar])),
      ampel: { ...vorlage.ampel },
      statusLabels: Object.fromEntries(vorlage.status.map((s) => [s.key, s.label])),
      sparten: [...vorlage.sparten],
      standkostenTag: vorlage.standkostenTag,
      suchen: einstellung?.suchen ?? [],
    });
    setEinstOffen(true);
  }

  async function einstSpeichern() {
    if (!besitzer) return;
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('modul_einstellung').upsert(
        { owner_user_id: besitzer, modul: MODUL, einstellung: entwurf, aktualisiert_am: new Date().toISOString() },
        { onConflict: 'owner_user_id,modul' },
      );
      if (error) { setFehler('Einstellungen speichern fehlgeschlagen. Nur die Geschäftsleitung kann die Vorlage anpassen.'); return; }
      setEinstellung(entwurf); setEinstOffen(false); setOk('Einstellungen gespeichert. Sie gelten für alle im Betrieb.');
    } finally { setBusy(false); }
  }

  async function sucheMerken() {
    const name = suche.trim() || [fStatus && statusInfo(fStatus).label, fSparte].filter(Boolean).join(' · ');
    const teile = [fStatus && `status=${fStatus}`, fSparte && `sparte=${fSparte}`, fStandort && `standort=${fStandort}`].filter(Boolean);
    if (!teile.length) { setFehler('Wählen Sie zuerst Status, Sparte oder Standort, dann lässt sich die Suche speichern.'); return; }
    const neu = { key: 'eigen-' + Date.now().toString(36), name: name || 'Eigene Suche', regel: teile.join('&') };
    const e: KundenEinstellung = { ...(einstellung ?? {}), suchen: [...(einstellung?.suchen ?? []), neu] };
    const { error } = await supabase.from('modul_einstellung').upsert(
      { owner_user_id: besitzer, modul: MODUL, einstellung: e, aktualisiert_am: new Date().toISOString() },
      { onConflict: 'owner_user_id,modul' },
    );
    if (error) { setFehler('Suche speichern fehlgeschlagen. Nur die Geschäftsleitung kann Suchen für alle speichern.'); return; }
    setEinstellung(e); setOk(`Suche „${neu.name}" gespeichert.`);
  }

  function umschalten(id: string) {
    setAuswahl((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  if (!vorlage) return null;
  const alleGewaehlt = gefiltert.length > 0 && gefiltert.every((b) => auswahl.has(b.id));

  return (
    <div style={s.page}>
      <div style={s.kopf}>
        <div style={{ minWidth: 0 }}>
          <a href="/dashboard/kfz" style={s.zurueck}>← KFZ-Fachpaket</a>
          <h1 style={s.h1}>🚘 {vorlage.titel}</h1>
          <div style={s.dim}>Vorlage: {fein ?? 'Kfz-Handel'}{einstellung ? ' · angepasst' : ''}</div>
        </div>
        <div style={s.knopfReihe}>
          {istChef && <button style={s.btn} onClick={einstOeffnen}>⚙ Spalten und Einstellungen</button>}
          <button style={s.gold} onClick={neuOeffnen}>＋ {vorlage.einheit} aufnehmen</button>
        </div>
      </div>

      {fehler && <div style={s.fehler} role="alert">{fehler}</div>}
      {ok && <div style={s.ok} role="status">{ok}</div>}

      {formOffen && (
        <div style={s.karte}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>{bearbeite ? `${vorlage.einheit} bearbeiten` : `Neues ${vorlage.einheit}`}</div>
          <div style={s.raster}>
            <Feld l="Marke" v={form.marke} on={(v) => setForm({ ...form, marke: v })} />
            <Feld l="Modell" v={form.modell} on={(v) => setForm({ ...form, modell: v })} />
            <Feld l="Ausführung" v={form.variante} on={(v) => setForm({ ...form, variante: v })} ph="z. B. AMG Line" />
            <Wahl l="Sparte" v={form.sparte} on={(v) => setForm({ ...form, sparte: v })} opt={vorlage.sparten.map((x) => [x, x])} />
            <Wahl l="Status" v={form.status} on={(v) => setForm({ ...form, status: v })} opt={vorlage.status.map((x) => [x.key, x.label])} />
            <Feld l="FIN (17 Zeichen)" v={form.fin} on={(v) => setForm({ ...form, fin: v })} mono />
            <Feld l="Kennzeichen" v={form.kennzeichen} on={(v) => setForm({ ...form, kennzeichen: v })} ph="leer = ohne" />
            <Feld l="Erstzulassung" v={form.ez} on={(v) => setForm({ ...form, ez: v })} ph="MM/JJJJ" />
            <Feld l="Kilometer" v={form.km} on={(v) => setForm({ ...form, km: v })} num />
            <Feld l="Leistung (kW)" v={form.kw} on={(v) => setForm({ ...form, kw: v })} num />
            <Feld l="Kraftstoff" v={form.kraftstoff} on={(v) => setForm({ ...form, kraftstoff: v })} ph="Benzin, Diesel, Elektro …" />
            <Feld l="Farbe" v={form.farbe} on={(v) => setForm({ ...form, farbe: v })} />
            <Feld l="Farbcode" v={form.farbcode} on={(v) => setForm({ ...form, farbcode: v })} mono />
            <Wahl l="Standort" v={form.standort_id} on={(v) => setForm({ ...form, standort_id: v })} opt={[['', '—'], ...standorte.map((x) => [x.id, x.name] as [string, string])]} />
            <label style={s.lab}>Eingang<input type="date" style={s.inp} value={form.eingang_am} onChange={(e) => setForm({ ...form, eingang_am: e.target.value })} /></label>
            <Feld l="Einkaufspreis netto (€)" v={form.ek} on={(v) => setForm({ ...form, ek: v })} num />
            <Feld l="Verkaufspreis brutto (€)" v={form.vk} on={(v) => setForm({ ...form, vk: v })} num />
            <Wahl l="Besteuerung" v={form.besteuerung} on={(v) => setForm({ ...form, besteuerung: v })} opt={[['25a', 'differenzbesteuert (§ 25a)'], ['regel', 'Regelsteuer'], ['', 'noch offen']]} />
          </div>
          <label style={{ ...s.lab, marginTop: 8 }}>Notiz<textarea style={{ ...s.inp, minHeight: 60 }} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} /></label>
          <div style={{ ...s.knopfReihe, marginTop: 10 }}>
            <button style={{ ...s.gold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={speichern}>💾 Speichern</button>
            <button style={s.btn} onClick={() => { setFormOffen(false); setBearbeite(null); }}>Abbrechen</button>
            {bearbeite && istChef && (loeschFrage === bearbeite
              ? <><span style={s.dim}>Wirklich löschen? Das lässt sich nicht rückgängig machen.</span><button style={s.rot} onClick={() => loeschen(bearbeite)}>Ja, löschen</button><button style={s.btn} onClick={() => setLoeschFrage(null)}>Nein</button></>
              : <button style={s.btn} onClick={() => setLoeschFrage(bearbeite)}>🗑 Löschen</button>)}
          </div>
          <div style={{ ...s.dim, marginTop: 8 }}>Jede Änderung am Verkaufspreis landet automatisch im Preisverlauf.</div>
        </div>
      )}

      {einstOffen && (
        <div style={s.karte}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>⚙ Spalten und Einstellungen</div>
          <div style={{ ...s.dim, marginBottom: 10 }}>Die Vorlage für Ihre Branche ist der Start. Was Sie hier ändern, gilt für alle im Betrieb und bleibt bei Updates erhalten.</div>
          <div style={s.raster}>
            <div>
              <div style={s.tag}>Sichtbare Spalten</div>
              {vorlage.spalten.map((sp) => (
                <label key={sp.key} style={s.haken}>
                  <input type="checkbox" checked={entwurf.spaltenSichtbar?.[sp.key] ?? sp.sichtbar}
                    onChange={(e) => setEntwurf({ ...entwurf, spaltenSichtbar: { ...(entwurf.spaltenSichtbar ?? {}), [sp.key]: e.target.checked } })} /> {sp.label}
                </label>
              ))}
            </div>
            <div>
              <div style={s.tag}>Status umbenennen</div>
              {vorlage.status.map((st) => (
                <input key={st.key} style={{ ...s.inp, marginBottom: 6 }} value={entwurf.statusLabels?.[st.key] ?? st.label}
                  onChange={(e) => setEntwurf({ ...entwurf, statusLabels: { ...(entwurf.statusLabels ?? {}), [st.key]: e.target.value } })} aria-label={`Status ${st.label}`} />
              ))}
            </div>
            <div>
              <div style={s.tag}>Standtage-Ampel</div>
              <label style={s.lab}>Grün bis (Tage)<input style={s.inp} inputMode="numeric" value={String(entwurf.ampel?.gruenBis ?? '')}
                onChange={(e) => setEntwurf({ ...entwurf, ampel: { ...(entwurf.ampel ?? {}), gruenBis: ganz(e.target.value) ?? 0 } })} /></label>
              <label style={s.lab}>Gelb bis (Tage)<input style={s.inp} inputMode="numeric" value={String(entwurf.ampel?.gelbBis ?? '')}
                onChange={(e) => setEntwurf({ ...entwurf, ampel: { ...(entwurf.ampel ?? {}), gelbBis: ganz(e.target.value) ?? 0 } })} /></label>
              <label style={s.lab}>Standkosten je Tag (€, Planwert)<input style={s.inp} inputMode="decimal" value={String(entwurf.standkostenTag ?? '')}
                onChange={(e) => setEntwurf({ ...entwurf, standkostenTag: geld(e.target.value) ?? 0 })} /></label>
              <label style={s.lab}>Sparten (mit Komma getrennt)<input style={s.inp} value={(entwurf.sparten ?? []).join(', ')}
                onChange={(e) => setEntwurf({ ...entwurf, sparten: e.target.value.split(',').map((x) => x.trim()) })} /></label>
            </div>
          </div>
          {(entwurf.suchen ?? []).length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={s.tag}>Eigene gespeicherte Suchen</div>
              {(entwurf.suchen ?? []).map((x) => (
                <span key={x.key} style={s.chip}>{x.name} <button style={s.chipX} aria-label={`${x.name} entfernen`} onClick={() => setEntwurf({ ...entwurf, suchen: (entwurf.suchen ?? []).filter((y) => y.key !== x.key) })}>✕</button></span>
              ))}
            </div>
          )}
          <div style={{ ...s.knopfReihe, marginTop: 10 }}>
            <button style={{ ...s.gold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={einstSpeichern}>💾 Einstellungen speichern</button>
            <button style={s.btn} onClick={() => setEinstOffen(false)}>Abbrechen</button>
          </div>
        </div>
      )}

      <div style={s.leiste}>
        <input style={{ ...s.inp, flex: '1 1 240px' }} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen: Marke, Modell, Kennzeichen, FIN, Nr. …" aria-label="Bestand durchsuchen" />
        <select style={s.inp} value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Status"><option value="">Alle im Bestand</option>{vorlage.status.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
        <select style={s.inp} value={fSparte} onChange={(e) => setFSparte(e.target.value)} aria-label="Sparte"><option value="">Alle Sparten</option>{vorlage.sparten.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        {standorte.length > 0 && <select style={s.inp} value={fStandort} onChange={(e) => setFStandort(e.target.value)} aria-label="Standort"><option value="">Alle Standorte</option>{standorte.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
        <div style={s.seg}>
          <button style={ansicht === 'liste' ? s.segAn : s.segAus} onClick={() => setAnsicht('liste')}>Liste</button>
          <button style={ansicht === 'karten' ? s.segAn : s.segAus} onClick={() => setAnsicht('karten')}>Karten</button>
        </div>
      </div>

      <div style={s.chips}>
        <span style={s.tag}>Gespeicherte Suchen</span>
        {vorlage.suchen.map((x) => (
          <button key={x.key} style={aktiveSuche === x.key ? s.chipAn : s.chip} onClick={() => setAktiveSuche(aktiveSuche === x.key ? null : x.key)}>{x.name}</button>
        ))}
        {istChef && <button style={s.chip} onClick={sucheMerken}>＋ Aktuelle Auswahl speichern</button>}
      </div>

      <div style={s.summe}>
        <span><b>{sum.anzahl}</b> {sum.anzahl === 1 ? vorlage.einheit : vorlage.einheitPlural} im Bestand</span>
        {sichtbar('ek') && <span>Einkaufswert <b>{euro(sum.ekSumme)}</b>{sum.ohneEk > 0 ? ` (${sum.ohneEk} ohne EK)` : ''}</span>}
        <span>Verkaufswert <b>{euro(sum.vkSumme)}</b></span>
        <span>Ø Standtage <b>{sum.standtageSchnitt ?? '—'}</b></span>
      </div>

      {auswahl.size > 0 && (
        <div style={s.massen}>
          <b style={{ color: C.gold }}>{auswahl.size} ausgewählt</b>
          <select style={s.inp} defaultValue="" onChange={(e) => { if (e.target.value) massen('status', e.target.value); e.target.value = ''; }} aria-label="Status setzen">
            <option value="">Status setzen …</option>{vorlage.status.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
          {standorte.length > 0 && (
            <select style={s.inp} defaultValue="-" onChange={(e) => { if (e.target.value !== '-') massen('standort', e.target.value); e.target.value = '-'; }} aria-label="Standort setzen">
              <option value="-">Standort setzen …</option><option value="">ohne Standort</option>{standorte.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          <span style={s.dim}>Preis ändern um</span>
          <input style={{ ...s.inp, width: 70 }} value={prozent} onChange={(e) => setProzent(e.target.value)} aria-label="Prozent" inputMode="decimal" /><span style={s.dim}>%</span>
          <button style={s.btn} disabled={busy} onClick={() => massen('preis', prozent)}>Preise ändern</button>
          <button style={s.btn} onClick={() => setAuswahl(new Set())}>Auswahl aufheben</button>
        </div>
      )}

      {laden ? <p style={s.dim}>Lädt …</p> : gefiltert.length === 0 ? (
        <div style={s.karte}>
          <div style={{ fontWeight: 700 }}>{liste.length === 0 ? `Noch kein ${vorlage.einheit} im Bestand.` : 'Keine Treffer für diese Auswahl.'}</div>
          <div style={s.dim}>{liste.length === 0 ? `Über „＋ ${vorlage.einheit} aufnehmen" legen Sie das erste an. Status, Sparten und Ampel sind für Ihre Branche schon vorbelegt.` : 'Filter oder gespeicherte Suche zurücksetzen.'}</div>
        </div>
      ) : ansicht === 'liste' ? (
        <div style={s.tabBox}>
          <table style={s.tab}>
            <thead><tr>
              <th style={s.th}><input type="checkbox" checked={alleGewaehlt} aria-label="Alle auswählen" onChange={(e) => setAuswahl(e.target.checked ? new Set(gefiltert.map((b) => b.id)) : new Set())} /></th>
              {vorlage.spalten.filter((x) => x.sichtbar).map((x) => <th key={x.key} style={x.key === 'vk' || x.key === 'ek' ? s.thR : s.th}>{x.label}</th>)}
            </tr></thead>
            <tbody>
              {gefiltert.map((b) => {
                const st = statusInfo(b.status);
                const t = standtage(b, tag);
                const amp = standtageAmpel(t, vorlage.ampel);
                const ps = psAusKw(b.leistung_kw);
                const zelle: Record<string, ReactNode> = {
                  fahrzeug: <div><b>{[b.marke, b.modell].filter(Boolean).join(' ') || '—'}</b><div style={s.klein}>{b.interne_nr ?? ''}{b.variante ? ` · ${b.variante}` : ''}{b.sparte ? ` · ${b.sparte}` : ''}{ps ? ` · ${ps} PS` : ''}</div></div>,
                  status: <span style={{ ...s.pill, color: FARBE[st.farbe] }}>{st.label}</span>,
                  ez_km: <span>{ezText(b.erstzulassung)}<div style={s.klein}>{b.km_stand !== null ? `${b.km_stand.toLocaleString('de-DE')} km` : '—'}</div></span>,
                  kennzeichen: <span style={s.mono}>{b.kennzeichen ?? '—'}</span>,
                  standort: standortName(b.standort_id),
                  vk: <b>{euro(b.vk_brutto)}</b>,
                  ek: euro(b.ek_netto),
                  standtage: <span style={{ ...s.pill, color: FARBE[amp] }}>{t === null ? (b.status === 'zulauf' ? 'Zulauf' : '—') : `${t} Tage`}</span>,
                  fin: <span style={s.mono}>{b.fin ?? '—'}</span>,
                  farbe: <span>{b.farbe ?? '—'}{b.farbcode ? <div style={s.klein}>{b.farbcode}</div> : null}</span>,
                  besteuerung: b.besteuerung === '25a' ? '§ 25a' : b.besteuerung === 'regel' ? 'Regelsteuer' : '—',
                };
                return (
                  <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => bearbeiten(b)}>
                    <td style={s.td} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={auswahl.has(b.id)} onChange={() => umschalten(b.id)} aria-label={`${b.marke ?? ''} ${b.modell ?? ''} auswählen`} /></td>
                    {vorlage.spalten.filter((x) => x.sichtbar).map((x) => <td key={x.key} style={x.key === 'vk' || x.key === 'ek' ? s.tdR : s.td}>{zelle[x.key] ?? '—'}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={s.karten}>
          {gefiltert.map((b) => {
            const st = statusInfo(b.status);
            const t = standtage(b, tag);
            return (
              <div key={b.id} style={s.fzKarte} onClick={() => bearbeiten(b)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') bearbeiten(b); }}>
                <div style={s.bild}>{(b.marke ?? vorlage.einheit).toUpperCase()}</div>
                <div style={{ padding: '10px 12px', display: 'grid', gap: 4 }}>
                  <b>{[b.marke, b.modell].filter(Boolean).join(' ') || '—'}</b>
                  <div style={s.zeile}><span style={s.klein}>{ezText(b.erstzulassung)} · {b.km_stand !== null ? `${b.km_stand.toLocaleString('de-DE')} km` : '—'}</span><span style={{ ...s.pill, color: FARBE[st.farbe] }}>{st.label}</span></div>
                  <div style={s.zeile}><b style={{ color: C.gold, fontSize: 17 }}>{euro(b.vk_brutto)}</b><span style={{ ...s.pill, color: FARBE[standtageAmpel(t, vorlage.ampel)] }}>{t === null ? '—' : `${t} T`}</span></div>
                  <div style={s.zeile}><span style={s.klein}>{standortName(b.standort_id)}</span><span style={s.mono}>{b.kennzeichen ?? b.interne_nr ?? ''}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ ...s.dim, marginTop: 12 }}>Verkauft und Archiv zählen nicht zum Bestand. Wählen Sie oben den Status, um sie zu sehen.</div>
    </div>
  );
}

function Feld({ l, v, on, ph, num, mono }: { l: string; v: string; on: (v: string) => void; ph?: string; num?: boolean; mono?: boolean }) {
  return <label style={s.lab}>{l}<input style={{ ...s.inp, ...(mono ? { fontFamily: 'ui-monospace, Consolas, monospace' } : {}) }} value={v} placeholder={ph} inputMode={num ? 'decimal' : undefined} onChange={(e) => on(e.target.value)} /></label>;
}
function Wahl({ l, v, on, opt }: { l: string; v: string; on: (v: string) => void; opt: [string, string][] }) {
  return <label style={s.lab}>{l}<select style={s.inp} value={v} onChange={(e) => on(e.target.value)}>{opt.map(([k, t]) => <option key={k || 'leer'} value={k}>{t}</option>)}</select></label>;
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1240, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  kopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  zurueck: { color: C.dim, fontSize: 13, textDecoration: 'none' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '4px 0 0' },
  dim: { color: C.dim, fontSize: 13 },
  klein: { color: C.dim, fontSize: 12 },
  mono: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 },
  knopfReihe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  btn: { background: C.navy2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
  rot: { background: C.bad, border: `1px solid ${C.bad}`, color: '#fff', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px', marginBottom: 10 },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, borderRadius: 8, padding: '8px 12px', marginBottom: 10 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  tag: { fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.dim, fontWeight: 700, marginBottom: 6 },
  haken: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, padding: '3px 0' },
  leiste: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  seg: { display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' },
  segAn: { background: C.navy3, color: C.gold, border: 0, padding: '8px 12px', fontWeight: 600, cursor: 'pointer' },
  segAus: { background: C.navy2, color: C.dim, border: 0, padding: '8px 12px', fontWeight: 600, cursor: 'pointer' },
  chips: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 },
  chip: { border: `1px solid ${C.border}`, background: 'transparent', color: C.dim, borderRadius: 999, padding: '4px 12px', fontSize: 12.5, cursor: 'pointer' },
  chipAn: { border: `1px solid ${C.gold}`, background: 'rgba(201,168,76,0.14)', color: C.gold, borderRadius: 999, padding: '4px 12px', fontSize: 12.5, cursor: 'pointer' },
  chipX: { background: 'none', border: 0, color: C.dim, cursor: 'pointer', marginLeft: 4 },
  summe: { display: 'flex', gap: 20, flexWrap: 'wrap', color: C.dim, fontSize: 13, marginBottom: 10 },
  massen: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: C.navy3, border: `1px solid ${C.gold}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12 },
  tabBox: { overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 },
  tab: { width: '100%', borderCollapse: 'collapse', minWidth: 900 },
  th: { textAlign: 'left', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.dim, fontWeight: 600, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: C.navy2, whiteSpace: 'nowrap' },
  thR: { textAlign: 'right', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.dim, fontWeight: 600, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: C.navy2, whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'middle', fontSize: 14 },
  tdR: { padding: '10px 12px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'middle', fontSize: 14, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  pill: { display: 'inline-block', border: '1px solid currentColor', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  karten: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 },
  fzKarte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', cursor: 'pointer' },
  bild: { aspectRatio: '16 / 9', maxWidth: '100%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #14294A, #2a3f63)', color: 'rgba(255,255,255,0.7)', fontWeight: 700, letterSpacing: '0.08em' },
  zeile: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
};
