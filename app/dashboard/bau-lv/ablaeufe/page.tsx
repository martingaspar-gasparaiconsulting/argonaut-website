'use client';

// ============================================================
// ARGONAUT OS · Bau-Abläufe: Nachträge & Gewährleistung (Paket PI, B16)
//
// Reiter "Nachträge": vom Mehraufwand auf der Baustelle bis zur Abrechnung —
//   entdeckt -> angekündigt -> angeboten -> beauftragt/abgelehnt -> abgerechnet.
//   Beauftragte Nachträge wandern auf Knopfdruck ins Leistungsverzeichnis
//   (bau_lv_positionen mit ist_nachtrag) und damit in die Rechnung aus dem LV.
// Reiter "Gewährleistung": je Abnahme das Ende der Frist, die Rückgabe der
//   Sicherheit und die Mängelrügen danach.
// Musterschreiben: feste Texte aus lib/bauAblaeufe.ts — ANWALT-PLATZHALTER,
//   kopieren erst nach Prüf-Haken. Kein KI-Aufruf.
//
// Unterpfad von /dashboard/bau-lv: wer Bau & LV darf, darf hierher.
// Mitarbeiter melden Mehraufwand (Status "entdeckt", ohne Preis) und sehen
// Mängelrügen; alles andere macht der Chef (RLS in supabase-sql/pi-bau-ablaeufe.sql).
//
// Pfad: app/dashboard/bau-lv/ablaeufe/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../../_components/Leerzustand';
import { heuteIso } from '@/lib/nachweisMotor';
import {
  NACHTRAG_ARTEN, NACHTRAG_STATUS, REGELWERKE, RUEGE_STATUS, MUSTER, HINWEIS_ANWALT,
  nachtragArt, statusLabel, ruegeStatusLabel, regelwerk, naechsteNummer, nachtragBetrag, pruefeNachtrag,
  naechsterSchritt, nachtragZahlen, sortiereNachtraege, lvUebernahmeMoeglich, gewaehrleistungStatus,
  sicherheitRueckgabeAb, pruefeGewaehrleistung, pruefeRuege, ruegeOffen, gewaehrleistungZahlen,
  musterschreiben, offenePlatzhalter, datumDe, euro,
  type Hinweis, type Musterart, type MusterDaten, type NachtragPosition, type NachtragStatus, type RuegeStatus,
} from '@/lib/bauAblaeufe';
import { leseZahl, zahlFeld } from '@/lib/zahlen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const STUFE_FARBE: Record<string, string> = { rot: C.danger, gelb: C.warn, info: C.textDim };
const STATUS_FARBE: Record<string, string> = {
  entdeckt: C.warn, angekuendigt: C.cyan, angeboten: C.cyan, beauftragt: C.green, abgelehnt: C.danger, abgerechnet: C.textDim,
  gemeldet: C.warn, geprueft: C.cyan, termin: C.cyan, behoben: C.green,
  laeuft: C.green, endet_bald: C.warn, abgelaufen: C.textDim, unvollstaendig: C.danger,
};
const GW_LABEL: Record<string, string> = { laeuft: 'läuft', endet_bald: 'endet bald', abgelaufen: 'abgelaufen', unvollstaendig: 'Angaben fehlen' };

type LV = { id: string; titel: string; kunde_name: string | null; status: string; projekt_id?: string | null };
type Projekt = { id: string; name: string | null };
type Abnahme = { id: string; titel: string; datum: string; lv_id: string | null; projekt_id: string | null };
type Nachtrag = {
  id: string; owner_user_id: string; projekt_id: string | null; lv_id: string | null; nummer: string | null; titel: string;
  art: string; vertragsart: string; status: string; beschreibung: string | null; ursache: string | null;
  entdeckt_am: string | null; angekuendigt_am: string | null; ausfuehrung_ab: string | null; angeboten_am: string | null;
  antwort_bis: string | null; beauftragt_am: string | null; beauftragt_durch: string | null; abgelehnt_am: string | null;
  positionen: NachtragPosition[] | null; betrag_netto: number | string | null; in_lv_uebernommen: boolean; notiz: string | null;
};
type Gewaehrleistung = {
  id: string; projekt_id: string | null; lv_id: string | null; abnahme_id: string | null; bezeichnung: string; kunde_name: string | null;
  abnahme_am: string; regelwerk: string; monate: number | null; sicherheit_art: string; sicherheit_betrag: number | string | null;
  sicherheit_rueckgabe_am: string | null; sicherheit_zurueck_am: string | null; notiz: string | null;
};
type Ruege = {
  id: string; gewaehrleistung_id: string; eingang_am: string; schriftlich: boolean; beschreibung: string; frist_kunde: string | null;
  status: string; termin_am: string | null; behoben_am: string | null; abgenommen_am: string | null; ergebnis: string | null;
};

type PosForm = { kurztext: string; menge: string; einheit: string; einzelpreis: string };
type NForm = {
  id: string | null; titel: string; art: string; vertragsart: string; status: string; lv_id: string; projekt_id: string;
  beschreibung: string; ursache: string; entdeckt_am: string; angekuendigt_am: string; ausfuehrung_ab: string;
  angeboten_am: string; antwort_bis: string; beauftragt_am: string; beauftragt_durch: string; abgelehnt_am: string;
  positionen: PosForm[]; notiz: string;
};
type GForm = {
  id: string | null; abnahme_id: string; lv_id: string; projekt_id: string; bezeichnung: string; kunde_name: string; abnahme_am: string;
  regelwerk: string; monate: string; sicherheit_art: string; sicherheit_betrag: string; sicherheit_rueckgabe_am: string; notiz: string;
};
type RForm = { id: string | null; gewaehrleistung_id: string; eingang_am: string; schriftlich: boolean; beschreibung: string; frist_kunde: string; status: string; termin_am: string; behoben_am: string; abgenommen_am: string; ergebnis: string };

const LEER_POS: PosForm = { kurztext: '', menge: '1', einheit: 'Stk', einzelpreis: '' };

function zahl(s: string): number | null { return leseZahl(s); }
function zuText(n: number | string | null | undefined): string {
  if (n == null || n === '') return '';
  return String(n).replace('.', ',');
}
function plusTage(iso: string, tage: number): string {
  const [j, m, t] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + tage));
  return d.toISOString().slice(0, 10);
}

export default function BauAblaeufeSeite() {
  const heute = heuteIso(new Date());
  const [uid, setUid] = useState<string | null>(null);
  const [istMitarbeiter, setIstMitarbeiter] = useState(false);
  const [firma, setFirma] = useState('');
  const [tab, setTab] = useState<'nachtraege' | 'gewaehrleistung'>('nachtraege');
  const [nachtraege, setNachtraege] = useState<Nachtrag[]>([]);
  const [lvs, setLvs] = useState<LV[]>([]);
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [abnahmen, setAbnahmen] = useState<Abnahme[]>([]);
  const [gws, setGws] = useState<Gewaehrleistung[]>([]);
  const [ruegen, setRuegen] = useState<Ruege[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'offen' | 'alle'>('offen');
  const [nForm, setNForm] = useState<NForm | null>(null);
  const [gForm, setGForm] = useState<GForm | null>(null);
  const [rForm, setRForm] = useState<RForm | null>(null);
  const [muster, setMuster] = useState<{ art: Musterart; daten: MusterDaten; betreff: string; text: string; geprueft: boolean } | null>(null);

  const laden = useCallback(async () => {
    const [n, l, p] = await Promise.all([
      supabase.from('bau_nachtrag').select('*').order('erstellt_am', { ascending: false }),
      supabase.from('bau_lv').select('id, titel, kunde_name, status, projekt_id').order('erstellt_am', { ascending: false }),
      supabase.from('projekte').select('id, name').eq('archiviert', false),
    ]);
    if (n.error) {
      setFehler(/bau_nachtrag/.test(n.error.message) ? 'Die Bau-Abläufe sind noch nicht eingerichtet (SQL von Paket PI fehlt).' : 'Laden fehlgeschlagen.');
      return;
    }
    setNachtraege((n.data as Nachtrag[]) ?? []);
    setLvs((l.data as LV[]) ?? []);
    setProjekte((p.data as Projekt[]) ?? []);
    const [g, r, a] = await Promise.all([
      supabase.from('bau_gewaehrleistung').select('*').order('abnahme_am', { ascending: false }),
      supabase.from('bau_maengelruege').select('*').order('eingang_am', { ascending: false }),
      supabase.from('bau_abnahmen').select('id, titel, datum, lv_id, projekt_id').order('datum', { ascending: false }),
    ]);
    setGws((g.data as Gewaehrleistung[]) ?? []);
    setRuegen((r.data as Ruege[]) ?? []);
    setAbnahmen((a.data as Abnahme[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setUid(id);
      try {
        const { data: chef } = await supabase.rpc('mein_chef_id');
        setIstMitarbeiter(!!chef && chef !== id);
      } catch { /* dann Chef-Ansicht; RLS schuetzt ohnehin */ }
      if (id) {
        try {
          const { data: ci } = await supabase.from('web_ci').select('firma').eq('owner_user_id', id).maybeSingle();
          setFirma(String((ci as { firma?: string | null } | null)?.firma ?? '').trim());
        } catch { /* egal */ }
      }
      await laden();
    })();
  }, [laden]);

  const lvName = useCallback((id: string | null) => lvs.find((l) => l.id === id)?.titel ?? null, [lvs]);
  const projektName = useCallback((id: string | null) => projekte.find((p) => p.id === id)?.name ?? null, [projekte]);

  const nZahlen = useMemo(() => nachtragZahlen(nachtraege, heute), [nachtraege, heute]);
  const nListe = useMemo(() => {
    const s = sortiereNachtraege(nachtraege, heute);
    return filter === 'offen' ? s.filter((n) => n.status !== 'abgerechnet' && n.status !== 'abgelehnt') : s;
  }, [nachtraege, heute, filter]);
  const gZahlen = useMemo(() => gewaehrleistungZahlen(gws, ruegen, heute), [gws, ruegen, heute]);

  function melde(text: string) { setOk(text); setFehler(null); }

  // --- Nachträge -----------------------------------------------------------

  function neuerNachtrag() {
    setNForm({
      id: null, titel: '', art: 'zusaetzlich', vertragsart: 'unklar', status: 'entdeckt', lv_id: '', projekt_id: '',
      beschreibung: '', ursache: '', entdeckt_am: heute, angekuendigt_am: '', ausfuehrung_ab: '', angeboten_am: '',
      antwort_bis: '', beauftragt_am: '', beauftragt_durch: '', abgelehnt_am: '', positionen: [{ ...LEER_POS }], notiz: '',
    });
  }
  function nachtragBearbeiten(n: Nachtrag) {
    setNForm({
      id: n.id, titel: n.titel, art: n.art, vertragsart: n.vertragsart, status: n.status, lv_id: n.lv_id ?? '', projekt_id: n.projekt_id ?? '',
      beschreibung: n.beschreibung ?? '', ursache: n.ursache ?? '', entdeckt_am: n.entdeckt_am ?? '', angekuendigt_am: n.angekuendigt_am ?? '',
      ausfuehrung_ab: n.ausfuehrung_ab ?? '', angeboten_am: n.angeboten_am ?? '', antwort_bis: n.antwort_bis ?? '',
      beauftragt_am: n.beauftragt_am ?? '', beauftragt_durch: n.beauftragt_durch ?? '', abgelehnt_am: n.abgelehnt_am ?? '',
      positionen: (n.positionen && n.positionen.length ? n.positionen : [LEER_POS]).map((p) => ({
        kurztext: String(p.kurztext ?? ''), menge: zuText(p.menge as number), einheit: zahlFeld(p.einheit ?? ''), einzelpreis: zuText(p.einzelpreis as number),
      })),
      notiz: n.notiz ?? '',
    });
  }

  async function nachtragSpeichern() {
    if (!nForm || !uid) return;
    setFehler(null); setOk(null);
    if (!nForm.titel.trim()) { setFehler('Bitte eine Kurzbezeichnung angeben.'); return; }
    const positionen = nForm.positionen
      .filter((p) => p.kurztext.trim())
      .map((p) => ({ kurztext: p.kurztext.trim().slice(0, 300), menge: zahl(p.menge), einheit: p.einheit.trim().slice(0, 20), einzelpreis: istMitarbeiter ? null : zahl(p.einzelpreis) }));
    for (const p of nForm.positionen) {
      if (p.kurztext.trim() && p.menge.trim() && zahl(p.menge) == null) { setFehler(`Menge bei „${p.kurztext.trim()}" ist nicht lesbar.`); return; }
      if (!istMitarbeiter && p.kurztext.trim() && p.einzelpreis.trim() && zahl(p.einzelpreis) == null) { setFehler(`Preis bei „${p.kurztext.trim()}" ist nicht lesbar.`); return; }
    }
    const summe = istMitarbeiter ? null : nachtragBetrag(positionen).betrag;
    const lv = lvs.find((l) => l.id === nForm.lv_id);
    const basis = {
      titel: nForm.titel.trim().slice(0, 200), art: nForm.art, vertragsart: nForm.vertragsart,
      lv_id: nForm.lv_id || null, projekt_id: nForm.projekt_id || lv?.projekt_id || null,
      beschreibung: nForm.beschreibung.trim() || null, ursache: nForm.ursache.trim() || null,
      ausfuehrung_ab: nForm.ausfuehrung_ab || null, positionen, notiz: nForm.notiz.trim() || null,
    };
    setBusy(true);
    try {
      if (istMitarbeiter) {
        // Mitarbeiter melden nur neu — Status entdeckt, kein Preis (RLS prueft das auch).
        const { error } = await supabase.from('bau_nachtrag').insert({ ...basis, status: 'entdeckt', entdeckt_am: heute, betrag_netto: null, erstellt_von: uid });
        if (error) { setFehler('Meldung konnte nicht gespeichert werden.'); return; }
        melde('Mehraufwand gemeldet — die Geschäftsleitung kümmert sich um Ankündigung und Angebot.');
      } else {
        const zeile = {
          ...basis, status: nForm.status,
          entdeckt_am: nForm.entdeckt_am || heute, angekuendigt_am: nForm.angekuendigt_am || null,
          angeboten_am: nForm.angeboten_am || null, antwort_bis: nForm.antwort_bis || null,
          beauftragt_am: nForm.beauftragt_am || null, beauftragt_durch: nForm.beauftragt_durch.trim() || null,
          abgelehnt_am: nForm.abgelehnt_am || null, betrag_netto: summe, aktualisiert_am: new Date().toISOString(),
        };
        if (nForm.id) {
          const { error } = await supabase.from('bau_nachtrag').update(zeile).eq('id', nForm.id);
          if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
        } else {
          const nummer = naechsteNummer(nachtraege.map((n) => n.nummer));
          const { error } = await supabase.from('bau_nachtrag').insert({ ...zeile, nummer, owner_user_id: uid, erstellt_von: uid });
          if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
        }
        melde('Nachtrag gespeichert.');
      }
      setNForm(null);
      await laden();
    } finally { setBusy(false); }
  }

  /** Schnell-Knopf: Status weiterschalten und das passende Datum auf heute setzen. */
  async function statusSetzen(n: Nachtrag, status: NachtragStatus) {
    const patch: Record<string, unknown> = { status, aktualisiert_am: new Date().toISOString() };
    if (status === 'angekuendigt' && !n.angekuendigt_am) patch.angekuendigt_am = heute;
    if (status === 'angeboten') {
      if (nachtragBetrag(n.positionen).betrag == null) { setFehler('Vor dem Angebot bitte alle Positionen mit Menge und Preis erfassen (Bearbeiten).'); return; }
      if (!n.angeboten_am) patch.angeboten_am = heute;
      if (!n.antwort_bis) patch.antwort_bis = plusTage(heute, 14);
    }
    if (status === 'beauftragt' && !n.beauftragt_am) patch.beauftragt_am = heute;
    if (status === 'abgelehnt' && !n.abgelehnt_am) patch.abgelehnt_am = heute;
    const { error } = await supabase.from('bau_nachtrag').update(patch).eq('id', n.id);
    if (error) { setFehler('Status konnte nicht geändert werden.'); return; }
    melde(`${n.nummer ?? 'Nachtrag'}: ${statusLabel(status)}.${status === 'beauftragt' ? ' Bitte noch eintragen, wer beauftragt hat.' : ''}`);
    await laden();
  }

  async function nachtragLoeschen(n: Nachtrag) {
    if (!window.confirm(`Nachtrag ${n.nummer ?? ''} „${n.titel}" wirklich löschen? Die Nummer wird nicht neu vergeben.`)) return;
    const { error } = await supabase.from('bau_nachtrag').delete().eq('id', n.id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    await laden();
  }

  /** Beauftragten Nachtrag als Nachtragspositionen ins LV schreiben. */
  async function insLv(n: Nachtrag) {
    if (!uid) return;
    const lv = lvs.find((l) => l.id === n.lv_id);
    const pruef = lvUebernahmeMoeglich(n, lv?.status);
    if (!pruef.ok) { setFehler(pruef.grund); return; }
    setBusy(true); setFehler(null);
    try {
      const { data: vorhanden } = await supabase.from('bau_lv_positionen').select('id').eq('lv_id', n.lv_id as string);
      let pos = ((vorhanden as { id: string }[]) ?? []).length;
      const zeilen = (n.positionen ?? []).filter((p) => String(p.kurztext ?? '').trim()).map((p) => {
        const menge = Number(p.menge) || 0;
        const ep = Number(p.einzelpreis) || 0;
        pos += 1;
        return {
          owner_user_id: uid, lv_id: n.lv_id, ordnungszahl: n.nummer ? `${n.nummer}.${pos}` : null, kurztext: String(p.kurztext).trim(),
          menge, einheit: String(p.einheit ?? '').trim() || 'Stk', einzelpreis: ep, mwst_satz: 19,
          gesamt_netto: Math.round(menge * ep * 100) / 100, ist_nachtrag: true,
          nachtrag_grund: `${n.nummer ?? 'Nachtrag'} ${n.titel}`.slice(0, 200), position: pos,
        };
      });
      const { error } = await supabase.from('bau_lv_positionen').insert(zeilen);
      if (error) { setFehler('Übernahme ins LV fehlgeschlagen.'); return; }
      const { data: alle } = await supabase.from('bau_lv_positionen').select('gesamt_netto').eq('lv_id', n.lv_id as string);
      const summe = ((alle as { gesamt_netto: number }[]) ?? []).reduce((s, p) => s + (Number(p.gesamt_netto) || 0), 0);
      await supabase.from('bau_lv').update({ netto_summe: Math.round(summe * 100) / 100, aktualisiert_am: new Date().toISOString() }).eq('id', n.lv_id as string);
      await supabase.from('bau_nachtrag').update({ in_lv_uebernommen: true, aktualisiert_am: new Date().toISOString() }).eq('id', n.id);
      melde(`${n.nummer ?? 'Nachtrag'} steht jetzt im LV „${lv?.titel ?? ''}" (MwSt. 19 % — im LV bei Bedarf anpassen).`);
      await laden();
    } finally { setBusy(false); }
  }

  // --- Gewährleistung ------------------------------------------------------

  function neueGewaehrleistung(ab?: Abnahme) {
    const lv = ab?.lv_id ? lvs.find((l) => l.id === ab.lv_id) : undefined;
    setGForm({
      id: null, abnahme_id: ab?.id ?? '', lv_id: ab?.lv_id ?? '', projekt_id: ab?.projekt_id ?? lv?.projekt_id ?? '',
      bezeichnung: ab ? (lv?.titel ? `${lv.titel} – ${ab.titel}` : ab.titel) : '', kunde_name: lv?.kunde_name ?? '',
      abnahme_am: ab?.datum ?? '', regelwerk: 'individuell', monate: '', sicherheit_art: 'keine', sicherheit_betrag: '', sicherheit_rueckgabe_am: '', notiz: '',
    });
  }
  function gwBearbeiten(g: Gewaehrleistung) {
    setGForm({
      id: g.id, abnahme_id: g.abnahme_id ?? '', lv_id: g.lv_id ?? '', projekt_id: g.projekt_id ?? '', bezeichnung: g.bezeichnung,
      kunde_name: g.kunde_name ?? '', abnahme_am: g.abnahme_am, regelwerk: g.regelwerk, monate: g.monate != null ? zahlFeld(g.monate) : '',
      sicherheit_art: g.sicherheit_art, sicherheit_betrag: zuText(g.sicherheit_betrag), sicherheit_rueckgabe_am: g.sicherheit_rueckgabe_am ?? '', notiz: g.notiz ?? '',
    });
  }
  async function gwSpeichern() {
    if (!gForm || !uid) return;
    setFehler(null); setOk(null);
    if (!gForm.bezeichnung.trim()) { setFehler('Bitte eine Bezeichnung angeben.'); return; }
    if (!gForm.abnahme_am) { setFehler('Das Abnahmedatum ist Pflicht — ab da läuft die Gewährleistung.'); return; }
    const monate = zahl(gForm.monate);
    if (monate == null || monate < 1 || monate > 360) { setFehler('Bitte die Gewährleistungsfrist in Monaten eintragen (1 bis 360) — sie steht im Vertrag.'); return; }
    const betrag = zahl(gForm.sicherheit_betrag);
    if (gForm.sicherheit_betrag.trim() && betrag == null) { setFehler('Der Betrag der Sicherheit ist nicht lesbar.'); return; }
    const zeile = {
      abnahme_id: gForm.abnahme_id || null, lv_id: gForm.lv_id || null, projekt_id: gForm.projekt_id || null,
      bezeichnung: gForm.bezeichnung.trim().slice(0, 200), kunde_name: gForm.kunde_name.trim() || null, abnahme_am: gForm.abnahme_am,
      regelwerk: gForm.regelwerk, monate: Math.round(monate), sicherheit_art: gForm.sicherheit_art,
      sicherheit_betrag: gForm.sicherheit_art === 'keine' ? null : (betrag != null ? Math.round(betrag * 100) / 100 : null),
      sicherheit_rueckgabe_am: gForm.sicherheit_art === 'keine' ? null : (gForm.sicherheit_rueckgabe_am || null),
      notiz: gForm.notiz.trim() || null, aktualisiert_am: new Date().toISOString(),
    };
    setBusy(true);
    try {
      const res = gForm.id
        ? await supabase.from('bau_gewaehrleistung').update(zeile).eq('id', gForm.id)
        : await supabase.from('bau_gewaehrleistung').insert({ ...zeile, owner_user_id: uid });
      if (res.error) { setFehler('Speichern fehlgeschlagen.'); return; }
      setGForm(null); melde('Gewährleistung gespeichert.'); await laden();
    } finally { setBusy(false); }
  }
  async function sicherheitZurueck(g: Gewaehrleistung) {
    const { error } = await supabase.from('bau_gewaehrleistung').update({ sicherheit_zurueck_am: heute, aktualisiert_am: new Date().toISOString() }).eq('id', g.id);
    if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
    melde('Rückgabe der Sicherheit eingetragen.'); await laden();
  }
  async function gwLoeschen(g: Gewaehrleistung) {
    if (!window.confirm(`„${g.bezeichnung}" samt aller Mängelrügen löschen?`)) return;
    const { error } = await supabase.from('bau_gewaehrleistung').delete().eq('id', g.id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    await laden();
  }

  function neueRuege(g: Gewaehrleistung) {
    setRForm({ id: null, gewaehrleistung_id: g.id, eingang_am: heute, schriftlich: true, beschreibung: '', frist_kunde: '', status: 'gemeldet', termin_am: '', behoben_am: '', abgenommen_am: '', ergebnis: '' });
  }
  function ruegeBearbeiten(r: Ruege) {
    setRForm({
      id: r.id, gewaehrleistung_id: r.gewaehrleistung_id, eingang_am: r.eingang_am, schriftlich: r.schriftlich, beschreibung: r.beschreibung,
      frist_kunde: r.frist_kunde ?? '', status: r.status, termin_am: r.termin_am ?? '', behoben_am: r.behoben_am ?? '', abgenommen_am: r.abgenommen_am ?? '', ergebnis: r.ergebnis ?? '',
    });
  }
  async function ruegeSpeichern() {
    if (!rForm || !uid) return;
    if (!rForm.beschreibung.trim()) { setFehler('Bitte den gemeldeten Mangel beschreiben.'); return; }
    if (!rForm.eingang_am) { setFehler('Bitte das Eingangsdatum der Rüge eintragen.'); return; }
    const zeile = {
      gewaehrleistung_id: rForm.gewaehrleistung_id, eingang_am: rForm.eingang_am, schriftlich: rForm.schriftlich,
      beschreibung: rForm.beschreibung.trim().slice(0, 2000), frist_kunde: rForm.frist_kunde || null, status: rForm.status,
      termin_am: rForm.termin_am || null, behoben_am: rForm.behoben_am || (rForm.status === 'behoben' ? heute : null),
      abgenommen_am: rForm.abgenommen_am || null, ergebnis: rForm.ergebnis.trim() || null, aktualisiert_am: new Date().toISOString(),
    };
    setBusy(true);
    try {
      const res = rForm.id
        ? await supabase.from('bau_maengelruege').update(zeile).eq('id', rForm.id)
        : await supabase.from('bau_maengelruege').insert({ ...zeile, owner_user_id: uid });
      if (res.error) { setFehler('Speichern fehlgeschlagen.'); return; }
      setRForm(null); melde('Mängelrüge gespeichert.'); await laden();
    } finally { setBusy(false); }
  }

  // --- Musterschreiben -----------------------------------------------------

  function musterOeffnen(art: Musterart, daten: MusterDaten) {
    const m = musterschreiben(art, daten);
    setMuster({ art, daten, betreff: m.betreff, text: m.text, geprueft: false });
  }
  function musterFuerNachtrag(n: Nachtrag, art: Musterart) {
    const lv = lvs.find((l) => l.id === n.lv_id);
    musterOeffnen(art, {
      firma, kunde: lv?.kunde_name, bauvorhaben: lv?.titel ?? projektName(n.projekt_id), nummer: n.nummer, titel: n.titel,
      beschreibung: n.beschreibung, ursache: n.ursache, vertragsart: n.vertragsart,
      datum: art === 'nachfass' ? n.angeboten_am : art === 'behinderung' ? (n.ausfuehrung_ab ?? n.entdeckt_am) : null,
      frist: n.antwort_bis, betrag: nachtragBetrag(n.positionen).betrag, positionen: n.positionen,
    });
  }
  function musterFuerGw(g: Gewaehrleistung, art: Musterart, r?: Ruege) {
    musterOeffnen(art, {
      firma, kunde: g.kunde_name, bauvorhaben: g.bezeichnung, vertragsart: g.regelwerk.startsWith('vob') ? 'vob' : g.regelwerk.startsWith('bgb') ? 'bgb' : 'unklar',
      abnahme_am: g.abnahme_am, sicherheit_art: g.sicherheit_art, sicherheit_betrag: zahl(zuText(g.sicherheit_betrag)),
      eingang_am: r?.eingang_am, termin_am: r?.termin_am, beschreibung: r?.beschreibung, ursache: r?.ergebnis,
    });
  }
  async function kopieren() {
    if (!muster) return;
    try { await navigator.clipboard.writeText(`${muster.betreff}\n\n${muster.text}`); melde('Text kopiert.'); }
    catch { setFehler('Kopieren nicht möglich — bitte den Text markieren und selbst kopieren.'); }
  }
  async function alsPdf() {
    if (!muster) return;
    setBusy(true);
    try {
      const res = await fetch('/api/text-motor/pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titel: muster.betreff, kapitel: [{ titel: '', text: muster.text }] }),
      });
      if (!res.ok) { setFehler('Das PDF konnte gerade nicht erzeugt werden.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'schreiben.pdf'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally { setBusy(false); }
  }

  const musterPlatzhalter = muster ? offenePlatzhalter(`${muster.betreff}\n${muster.text}`) : [];

  // --- Anzeige -------------------------------------------------------------

  function Hinweise({ liste }: { liste: Hinweis[] }) {
    if (!liste.length) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {liste.map((h, i) => <div key={i} style={{ fontSize: 13, color: STUFE_FARBE[h.stufe], lineHeight: 1.4 }}>{h.stufe === 'rot' ? '⛔ ' : h.stufe === 'gelb' ? '⚠️ ' : 'ℹ️ '}{h.text}</div>)}
      </div>
    );
  }

  return (
    <div style={s.page}>
      <a href="/dashboard/bau-lv" style={s.zurueck}>← Bau &amp; LV</a>
      <h1 style={s.h1}>🧷 Nachträge &amp; Gewährleistung</h1>
      <p style={s.sub}>Mehraufwand sauber ankündigen, anbieten und abrechnen — und nach der Abnahme Fristen, Sicherheiten und Mängelrügen im Blick behalten.</p>
      <div style={s.anwalt}>⚖️ {HINWEIS_ANWALT}</div>

      <div style={s.tabs}>
        <button style={{ ...s.tab, ...(tab === 'nachtraege' ? s.tabAn : {}) }} onClick={() => setTab('nachtraege')}>📝 Nachträge{nZahlen.offenAnzahl ? ` (${nZahlen.offenAnzahl})` : ''}</button>
        <button style={{ ...s.tab, ...(tab === 'gewaehrleistung' ? s.tabAn : {}) }} onClick={() => setTab('gewaehrleistung')}>🛡 Gewährleistung{gZahlen.offeneRuegen ? ` (${gZahlen.offeneRuegen})` : ''}</button>
      </div>

      {ok && <div style={s.ok}>{ok}</div>}
      {fehler && <div style={s.err}>{fehler}</div>}

      {tab === 'nachtraege' && (
        <>
          {!istMitarbeiter && (
            <div style={s.kpis}>
              <div style={s.kpi}><div style={s.kpiZahl}>{euro(nZahlen.offenBetrag)}</div><div style={s.kpiText}>offen ({nZahlen.offenAnzahl}){nZahlen.offenOhneBetrag ? ` · ${nZahlen.offenOhneBetrag} ohne Betrag` : ''}</div></div>
              <div style={s.kpi}><div style={{ ...s.kpiZahl, color: C.green }}>{euro(nZahlen.beauftragtBetrag)}</div><div style={s.kpiText}>beauftragt / abgerechnet</div></div>
              <div style={s.kpi}><div style={s.kpiZahl}>{nZahlen.quote == null ? '—' : `${nZahlen.quote} %`}</div><div style={s.kpiText}>Annahmequote</div></div>
              <div style={s.kpi}><div style={{ ...s.kpiZahl, color: nZahlen.rot ? C.danger : C.text }}>{nZahlen.rot}</div><div style={s.kpiText}>brauchen sofort Aufmerksamkeit</div></div>
            </div>
          )}

          <div style={s.leiste}>
            <button style={s.primaer} onClick={neuerNachtrag}>{istMitarbeiter ? '＋ Mehraufwand melden' : '＋ Neuer Nachtrag'}</button>
            <select style={s.inp} value={filter} onChange={(e) => setFilter(e.target.value as 'offen' | 'alle')}>
              <option value="offen">Nur offene und beauftragte</option>
              <option value="alle">Alle</option>
            </select>
          </div>

          {nListe.length === 0 && !fehler && (
            <Leerzustand icon="📝" titel="Keine offenen Nachträge"
              text="Sobald auf der Baustelle etwas anders läuft als beauftragt: hier festhalten — bevor die Arbeit beginnt."
              schritte={['Mehraufwand erfassen', 'Ankündigen', 'Angebot schicken', 'Beauftragung festhalten', 'Ins LV übernehmen']} />
          )}

          <div style={s.liste}>
            {nListe.map((n) => {
              const art = nachtragArt(n.art);
              const hinweise = pruefeNachtrag(n, heute);
              const b = nachtragBetrag(n.positionen);
              const lv = lvs.find((l) => l.id === n.lv_id);
              const uebernahme = lvUebernahmeMoeglich(n, lv?.status);
              return (
                <div key={n.id} style={s.card}>
                  <div style={s.kopf}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{n.nummer ? `${n.nummer} · ` : ''}{n.titel}</div>
                      <div style={s.dim}>{art?.label ?? n.art}{lv ? ` · LV „${lv.titel}"` : n.projekt_id ? ` · ${projektName(n.projekt_id) ?? ''}` : ''} · entdeckt {datumDe(n.entdeckt_am)}</div>
                    </div>
                    <span style={{ ...s.badge, color: STATUS_FARBE[n.status], borderColor: STATUS_FARBE[n.status] }}>{statusLabel(n.status)}</span>
                    {!istMitarbeiter && <div style={{ fontWeight: 800, minWidth: 110, textAlign: 'right' }}>{b.betrag != null ? euro(b.betrag) : <span style={{ color: C.textDim }}>ohne Betrag</span>}</div>}
                  </div>
                  {n.beschreibung && <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{n.beschreibung}</div>}
                  {!istMitarbeiter && <div style={{ fontSize: 13.5 }}>➡️ <b>Nächster Schritt:</b> {naechsterSchritt(n)}</div>}
                  {!istMitarbeiter && <Hinweise liste={hinweise} />}
                  {!istMitarbeiter && (
                    <div style={s.knoepfe}>
                      <button style={s.klein} onClick={() => nachtragBearbeiten(n)}>✏️ Bearbeiten</button>
                      {n.status === 'entdeckt' && <button style={s.klein} onClick={() => musterFuerNachtrag(n, n.art === 'behinderung' ? 'behinderung' : 'mehrkosten')}>✉️ {n.art === 'behinderung' ? 'Behinderungsanzeige' : 'Mehrkosten-Anzeige'}</button>}
                      {n.status === 'entdeckt' && <button style={s.klein} onClick={() => statusSetzen(n, 'angekuendigt')}>✔ Angekündigt</button>}
                      {(n.status === 'entdeckt' || n.status === 'angekuendigt') && n.art !== 'behinderung' && <button style={s.klein} onClick={() => musterFuerNachtrag(n, 'angebot')}>✉️ Angebot</button>}
                      {(n.status === 'entdeckt' || n.status === 'angekuendigt') && <button style={s.klein} onClick={() => statusSetzen(n, 'angeboten')}>✔ Angeboten</button>}
                      {n.status === 'angeboten' && <button style={s.klein} onClick={() => musterFuerNachtrag(n, 'nachfass')}>✉️ Erinnerung</button>}
                      {n.status === 'angeboten' && <button style={{ ...s.klein, color: C.green }} onClick={() => statusSetzen(n, 'beauftragt')}>✔ Beauftragt</button>}
                      {n.status === 'angeboten' && <button style={{ ...s.klein, color: C.danger }} onClick={() => statusSetzen(n, 'abgelehnt')}>✕ Abgelehnt</button>}
                      {n.status === 'beauftragt' && n.lv_id && !n.in_lv_uebernommen && (
                        <button style={{ ...s.klein, color: uebernahme.ok ? C.gold : C.textDim }} disabled={busy}
                          title={uebernahme.grund ?? ''} onClick={() => insLv(n)}>📐 Ins LV übernehmen</button>
                      )}
                      {n.status === 'beauftragt' && <button style={s.klein} onClick={() => statusSetzen(n, 'abgerechnet')}>✔ Abgerechnet</button>}
                      {n.in_lv_uebernommen && <span style={{ ...s.dim, marginTop: 0 }}>✓ im LV</span>}
                      <button style={{ ...s.klein, color: C.danger }} onClick={() => nachtragLoeschen(n)}>🗑</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'gewaehrleistung' && (
        <>
          {istMitarbeiter ? (
            <div style={s.card}>
              <div style={s.dim}>Fristen und Sicherheiten pflegt die Geschäftsleitung. Hier sehen Sie die gemeldeten Mängel und die Termine.</div>
              {ruegen.filter(ruegeOffen).map((r) => (
                <div key={r.id} style={s.zeile}>
                  <div style={{ flex: 1 }}>{r.beschreibung}</div>
                  <span style={{ ...s.badge, color: STATUS_FARBE[r.status], borderColor: STATUS_FARBE[r.status] }}>{ruegeStatusLabel(r.status)}</span>
                  <div style={s.dim}>{r.termin_am ? `Termin ${datumDe(r.termin_am)}` : 'noch kein Termin'}</div>
                </div>
              ))}
              {!ruegen.filter(ruegeOffen).length && <div style={s.dim}>Keine offenen Mängel.</div>}
            </div>
          ) : (
            <>
              <div style={s.kpis}>
                <div style={s.kpi}><div style={s.kpiZahl}>{gZahlen.laufend}</div><div style={s.kpiText}>laufend{gZahlen.endetBald ? ` · ${gZahlen.endetBald} enden in 90 Tagen` : ''}</div></div>
                <div style={s.kpi}><div style={{ ...s.kpiZahl, color: gZahlen.sicherheitFaellig ? C.gold : C.text }}>{euro(gZahlen.sicherheitFaelligBetrag)}</div><div style={s.kpiText}>Sicherheiten zurückzuholen ({gZahlen.sicherheitFaellig})</div></div>
                <div style={s.kpi}><div style={s.kpiZahl}>{gZahlen.offeneRuegen}</div><div style={s.kpiText}>offene Mängelrügen</div></div>
                <div style={s.kpi}><div style={{ ...s.kpiZahl, color: gZahlen.ruegenRot ? C.danger : C.text }}>{gZahlen.ruegenRot}</div><div style={s.kpiText}>Kundenfrist überschritten</div></div>
              </div>

              <div style={s.leiste}>
                <button style={s.primaer} onClick={() => neueGewaehrleistung()}>＋ Gewährleistung erfassen</button>
                {abnahmen.filter((a) => !gws.some((g) => g.abnahme_id === a.id)).length > 0 && (
                  <select style={s.inp} value="" onChange={(e) => { const a = abnahmen.find((x) => x.id === e.target.value); if (a) neueGewaehrleistung(a); }}>
                    <option value="">Aus Abnahmeprotokoll übernehmen …</option>
                    {abnahmen.filter((a) => !gws.some((g) => g.abnahme_id === a.id)).map((a) => (
                      <option key={a.id} value={a.id}>{datumDe(a.datum)} · {a.titel}{a.lv_id && lvName(a.lv_id) ? ` · ${lvName(a.lv_id)}` : ''}</option>
                    ))}
                  </select>
                )}
              </div>

              {gws.length === 0 && (
                <Leerzustand icon="🛡" titel="Noch keine Gewährleistung erfasst"
                  text="Nach jeder Abnahme hier eintragen: Ab wann läuft die Frist, wie lange, und welche Sicherheit liegt beim Kunden."
                  schritte={['Abnahme übernehmen', 'Frist laut Vertrag', 'Sicherheit eintragen']} />
              )}

              <div style={s.liste}>
                {gws.map((g) => {
                  const st = gewaehrleistungStatus(g, heute);
                  const sicher = sicherheitRueckgabeAb(g);
                  const eigene = ruegen.filter((r) => r.gewaehrleistung_id === g.id);
                  return (
                    <div key={g.id} style={s.card}>
                      <div style={s.kopf}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ fontWeight: 800, fontSize: 16 }}>{g.bezeichnung}</div>
                          <div style={s.dim}>{g.kunde_name ? `${g.kunde_name} · ` : ''}Abnahme {datumDe(g.abnahme_am)} · {regelwerk(g.regelwerk)?.label ?? g.regelwerk}{g.monate ? ` · ${g.monate} Monate` : ''}</div>
                        </div>
                        <span style={{ ...s.badge, color: STATUS_FARBE[st.status], borderColor: STATUS_FARBE[st.status] }}>{GW_LABEL[st.status]}</span>
                        <div style={{ textAlign: 'right', minWidth: 130 }}>
                          <div style={{ fontWeight: 800 }}>bis {datumDe(st.ende)}</div>
                          {sicher.datum && <div style={s.dim}>{g.sicherheit_zurueck_am ? `Sicherheit zurück ${datumDe(g.sicherheit_zurueck_am)}` : `Sicherheit ab ${datumDe(sicher.datum)}`}</div>}
                        </div>
                      </div>
                      <Hinweise liste={pruefeGewaehrleistung(g, heute)} />
                      <div style={s.knoepfe}>
                        <button style={s.klein} onClick={() => gwBearbeiten(g)}>✏️ Bearbeiten</button>
                        <button style={s.klein} onClick={() => neueRuege(g)}>＋ Mängelrüge</button>
                        {sicher.datum && !g.sicherheit_zurueck_am && <button style={s.klein} onClick={() => musterFuerGw(g, 'sicherheit_zurueck')}>✉️ Sicherheit zurückfordern</button>}
                        {sicher.datum && !g.sicherheit_zurueck_am && <button style={{ ...s.klein, color: C.green }} onClick={() => sicherheitZurueck(g)}>✔ Sicherheit zurück</button>}
                        <button style={{ ...s.klein, color: C.danger }} onClick={() => gwLoeschen(g)}>🗑</button>
                      </div>
                      {eigene.map((r) => (
                        <div key={r.id} style={s.ruege}>
                          <div style={s.kopf}>
                            <div style={{ flex: 1, minWidth: 200 }}>
                              <div style={{ fontWeight: 700 }}>{r.beschreibung}</div>
                              <div style={s.dim}>Eingang {datumDe(r.eingang_am)}{r.schriftlich ? ' (schriftlich)' : ' (mündlich)'}{r.frist_kunde ? ` · Frist Kunde ${datumDe(r.frist_kunde)}` : ''}{r.termin_am ? ` · Termin ${datumDe(r.termin_am)}` : ''}</div>
                            </div>
                            <span style={{ ...s.badge, color: STATUS_FARBE[r.status], borderColor: STATUS_FARBE[r.status] }}>{ruegeStatusLabel(r.status)}</span>
                          </div>
                          <Hinweise liste={pruefeRuege(r, g, heute)} />
                          <div style={s.knoepfe}>
                            <button style={s.klein} onClick={() => ruegeBearbeiten(r)}>✏️ Bearbeiten</button>
                            {ruegeOffen(r) && <button style={s.klein} onClick={() => musterFuerGw(g, 'ruege_eingang', r)}>✉️ Eingang bestätigen</button>}
                            {(r.status === 'geprueft' || r.status === 'termin' || r.status === 'abgelehnt') && <button style={s.klein} onClick={() => musterFuerGw(g, 'ruege_ablehnung', r)}>✉️ Kein Mangel</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ---------- Formular Nachtrag ---------- */}
      {nForm && (
        <div style={s.schleier} onClick={() => setNForm(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{istMitarbeiter ? 'Mehraufwand melden' : nForm.id ? 'Nachtrag bearbeiten' : 'Neuer Nachtrag'}</div>
            <label style={s.lab}>Kurzbezeichnung<input style={s.inp} value={nForm.titel} onChange={(e) => setNForm({ ...nForm, titel: e.target.value })} placeholder="z. B. Zusätzliche Kernbohrung Küche" /></label>
            <div style={s.row}>
              <label style={{ ...s.lab, flex: 1 }}>Art<select style={s.inp} value={nForm.art} onChange={(e) => setNForm({ ...nForm, art: e.target.value })}>
                {NACHTRAG_ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select></label>
              {!istMitarbeiter && <label style={{ ...s.lab, flex: 1 }}>Vertrag<select style={s.inp} value={nForm.vertragsart} onChange={(e) => setNForm({ ...nForm, vertragsart: e.target.value })}>
                <option value="unklar">unklar</option><option value="vob">VOB/B vereinbart</option><option value="bgb">BGB-Bauvertrag</option>
              </select></label>}
            </div>
            <div style={s.dim}>{nachtragArt(nForm.art)?.kurz} {!istMitarbeiter && <><br />{nachtragArt(nForm.art)?.grundlage}</>}</div>
            <div style={s.row}>
              <label style={{ ...s.lab, flex: 1 }}>Leistungsverzeichnis<select style={s.inp} value={nForm.lv_id} onChange={(e) => setNForm({ ...nForm, lv_id: e.target.value })}>
                <option value="">— keins —</option>{lvs.map((l) => <option key={l.id} value={l.id}>{l.titel}{l.kunde_name ? ` · ${l.kunde_name}` : ''}</option>)}
              </select></label>
              <label style={{ ...s.lab, flex: 1 }}>Baustelle / Projekt<select style={s.inp} value={nForm.projekt_id} onChange={(e) => setNForm({ ...nForm, projekt_id: e.target.value })}>
                <option value="">— keins —</option>{projekte.map((p) => <option key={p.id} value={p.id}>{p.name || 'Projekt ohne Name'}</option>)}
              </select></label>
            </div>
            <label style={s.lab}>Was genau ist zusätzlich oder anders?<textarea style={{ ...s.inp, minHeight: 70 }} value={nForm.beschreibung} onChange={(e) => setNForm({ ...nForm, beschreibung: e.target.value })} /></label>
            <label style={s.lab}>Anlass (wer hat was angeordnet, was war vorgefunden?)<input style={s.inp} value={nForm.ursache} onChange={(e) => setNForm({ ...nForm, ursache: e.target.value })} placeholder="z. B. Bauleiter Herr Müller am 23.09. vor Ort" /></label>
            <label style={s.lab}>Ausführung ab (geplant oder begonnen)<input type="date" style={s.inp} value={nForm.ausfuehrung_ab} onChange={(e) => setNForm({ ...nForm, ausfuehrung_ab: e.target.value })} /></label>

            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>Positionen</div>
            {nForm.positionen.map((p, i) => (
              <div key={i} style={s.posForm}>
                <input style={{ ...s.inp, flex: 3, minWidth: 160 }} value={p.kurztext} placeholder="Leistung" onChange={(e) => setNForm({ ...nForm, positionen: nForm.positionen.map((x, k) => k === i ? { ...x, kurztext: e.target.value } : x) })} />
                <input style={{ ...s.inp, width: 80 }} value={p.menge} placeholder="Menge" onChange={(e) => setNForm({ ...nForm, positionen: nForm.positionen.map((x, k) => k === i ? { ...x, menge: e.target.value } : x) })} />
                <input style={{ ...s.inp, width: 70 }} value={p.einheit} placeholder="Einheit" onChange={(e) => setNForm({ ...nForm, positionen: nForm.positionen.map((x, k) => k === i ? { ...x, einheit: e.target.value } : x) })} />
                {!istMitarbeiter && <input style={{ ...s.inp, width: 110, borderColor: p.kurztext.trim() && !p.einzelpreis.trim() ? C.danger : C.border }} value={p.einzelpreis} placeholder="EP netto €" onChange={(e) => setNForm({ ...nForm, positionen: nForm.positionen.map((x, k) => k === i ? { ...x, einzelpreis: e.target.value } : x) })} />}
                <button style={s.weg} onClick={() => setNForm({ ...nForm, positionen: nForm.positionen.filter((_, k) => k !== i) })}>✕</button>
              </div>
            ))}
            <button style={s.dazu} onClick={() => setNForm({ ...nForm, positionen: [...nForm.positionen, { ...LEER_POS }] })}>＋ Position</button>
            {!istMitarbeiter && (() => {
              const b = nachtragBetrag(nForm.positionen.map((p) => ({ kurztext: p.kurztext, menge: zahl(p.menge), einheit: p.einheit, einzelpreis: zahl(p.einzelpreis) })));
              return <div style={{ fontSize: 14 }}>Summe netto: <b>{b.betrag != null ? euro(b.betrag) : '—'}</b>{b.fehlend ? <span style={{ color: C.danger }}> · bei {b.fehlend} Position(en) fehlt der Preis — Preise trägt ein Mensch ein, nichts wird geschätzt</span> : null}</div>;
            })()}

            {!istMitarbeiter && (
              <>
                <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>Ablauf</div>
                <div style={s.row}>
                  <label style={{ ...s.lab, flex: 1 }}>Status<select style={s.inp} value={nForm.status} onChange={(e) => setNForm({ ...nForm, status: e.target.value })}>
                    {NACHTRAG_STATUS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select></label>
                  <label style={{ ...s.lab, flex: 1 }}>Entdeckt am<input type="date" style={s.inp} value={nForm.entdeckt_am} onChange={(e) => setNForm({ ...nForm, entdeckt_am: e.target.value })} /></label>
                  <label style={{ ...s.lab, flex: 1 }}>Angekündigt am<input type="date" style={s.inp} value={nForm.angekuendigt_am} onChange={(e) => setNForm({ ...nForm, angekuendigt_am: e.target.value })} /></label>
                </div>
                <div style={s.row}>
                  <label style={{ ...s.lab, flex: 1 }}>Angeboten am<input type="date" style={s.inp} value={nForm.angeboten_am} onChange={(e) => setNForm({ ...nForm, angeboten_am: e.target.value })} /></label>
                  <label style={{ ...s.lab, flex: 1 }}>Antwort bis<input type="date" style={s.inp} value={nForm.antwort_bis} onChange={(e) => setNForm({ ...nForm, antwort_bis: e.target.value })} /></label>
                  <label style={{ ...s.lab, flex: 1 }}>Abgelehnt am<input type="date" style={s.inp} value={nForm.abgelehnt_am} onChange={(e) => setNForm({ ...nForm, abgelehnt_am: e.target.value })} /></label>
                </div>
                <div style={s.row}>
                  <label style={{ ...s.lab, flex: 1 }}>Beauftragt am<input type="date" style={s.inp} value={nForm.beauftragt_am} onChange={(e) => setNForm({ ...nForm, beauftragt_am: e.target.value })} /></label>
                  <label style={{ ...s.lab, flex: 2 }}>Beauftragt durch (Name, Form)<input style={s.inp} value={nForm.beauftragt_durch} onChange={(e) => setNForm({ ...nForm, beauftragt_durch: e.target.value })} placeholder="z. B. Frau Schmidt per E-Mail" /></label>
                </div>
                <label style={s.lab}>Interne Notiz<input style={s.inp} value={nForm.notiz} onChange={(e) => setNForm({ ...nForm, notiz: e.target.value })} /></label>
              </>
            )}
            <div style={s.knoepfe}>
              <button style={{ ...s.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={nachtragSpeichern}>💾 {istMitarbeiter ? 'Melden' : 'Speichern'}</button>
              <button style={s.klein} onClick={() => setNForm(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Formular Gewährleistung ---------- */}
      {gForm && (
        <div style={s.schleier} onClick={() => setGForm(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{gForm.id ? 'Gewährleistung bearbeiten' : 'Gewährleistung erfassen'}</div>
            <label style={s.lab}>Bezeichnung (Bauvorhaben)<input style={s.inp} value={gForm.bezeichnung} onChange={(e) => setGForm({ ...gForm, bezeichnung: e.target.value })} /></label>
            <div style={s.row}>
              <label style={{ ...s.lab, flex: 2 }}>Auftraggeber<input style={s.inp} value={gForm.kunde_name} onChange={(e) => setGForm({ ...gForm, kunde_name: e.target.value })} /></label>
              <label style={{ ...s.lab, flex: 1 }}>Abnahme am<input type="date" style={s.inp} value={gForm.abnahme_am} onChange={(e) => setGForm({ ...gForm, abnahme_am: e.target.value })} /></label>
            </div>
            <div style={s.row}>
              <label style={{ ...s.lab, flex: 2 }}>Regelwerk (Vorschlag)<select style={s.inp} value={gForm.regelwerk} onChange={(e) => {
                const r = regelwerk(e.target.value);
                setGForm({ ...gForm, regelwerk: e.target.value, monate: r?.monate ? zahlFeld(r.monate) : gForm.monate });
              }}>
                {REGELWERKE.map((r) => <option key={r.key} value={r.key}>{r.label}{r.monate ? ` (${r.monate / 12} Jahre)` : ''}</option>)}
              </select></label>
              <label style={{ ...s.lab, flex: 1 }}>Frist in Monaten<input style={s.inp} value={gForm.monate} onChange={(e) => setGForm({ ...gForm, monate: e.target.value })} placeholder="laut Vertrag" /></label>
            </div>
            <div style={s.dim}>{regelwerk(gForm.regelwerk)?.grundlage} Maßgeblich ist, was im Vertrag steht.</div>
            <div style={s.row}>
              <label style={{ ...s.lab, flex: 1 }}>Sicherheit<select style={s.inp} value={gForm.sicherheit_art} onChange={(e) => setGForm({ ...gForm, sicherheit_art: e.target.value })}>
                <option value="keine">keine</option><option value="einbehalt">Einbehalt</option><option value="buergschaft">Bürgschaft</option>
              </select></label>
              {gForm.sicherheit_art !== 'keine' && <label style={{ ...s.lab, flex: 1 }}>Betrag €<input style={s.inp} value={gForm.sicherheit_betrag} onChange={(e) => setGForm({ ...gForm, sicherheit_betrag: e.target.value })} /></label>}
              {gForm.sicherheit_art !== 'keine' && <label style={{ ...s.lab, flex: 1 }}>Rückgabe laut Vertrag (falls geregelt)<input type="date" style={s.inp} value={gForm.sicherheit_rueckgabe_am} onChange={(e) => setGForm({ ...gForm, sicherheit_rueckgabe_am: e.target.value })} /></label>}
            </div>
            <label style={s.lab}>Notiz<input style={s.inp} value={gForm.notiz} onChange={(e) => setGForm({ ...gForm, notiz: e.target.value })} /></label>
            <div style={s.knoepfe}>
              <button style={{ ...s.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={gwSpeichern}>💾 Speichern</button>
              <button style={s.klein} onClick={() => setGForm(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Formular Mängelrüge ---------- */}
      {rForm && (
        <div style={s.schleier} onClick={() => setRForm(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{rForm.id ? 'Mängelrüge bearbeiten' : 'Mängelrüge erfassen'}</div>
            <label style={s.lab}>Was meldet der Kunde?<textarea style={{ ...s.inp, minHeight: 70 }} value={rForm.beschreibung} onChange={(e) => setRForm({ ...rForm, beschreibung: e.target.value })} /></label>
            <div style={s.row}>
              <label style={{ ...s.lab, flex: 1 }}>Eingang am<input type="date" style={s.inp} value={rForm.eingang_am} onChange={(e) => setRForm({ ...rForm, eingang_am: e.target.value })} /></label>
              <label style={{ ...s.lab, flex: 1 }}>Frist des Kunden<input type="date" style={s.inp} value={rForm.frist_kunde} onChange={(e) => setRForm({ ...rForm, frist_kunde: e.target.value })} /></label>
              <label style={{ ...s.check, flex: 1 }}><input type="checkbox" checked={rForm.schriftlich} onChange={(e) => setRForm({ ...rForm, schriftlich: e.target.checked })} /> schriftlich eingegangen</label>
            </div>
            <div style={s.row}>
              <label style={{ ...s.lab, flex: 1 }}>Status<select style={s.inp} value={rForm.status} onChange={(e) => setRForm({ ...rForm, status: e.target.value as RuegeStatus })}>
                {RUEGE_STATUS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select></label>
              <label style={{ ...s.lab, flex: 1 }}>Termin<input type="date" style={s.inp} value={rForm.termin_am} onChange={(e) => setRForm({ ...rForm, termin_am: e.target.value })} /></label>
              <label style={{ ...s.lab, flex: 1 }}>Behoben am<input type="date" style={s.inp} value={rForm.behoben_am} onChange={(e) => setRForm({ ...rForm, behoben_am: e.target.value })} /></label>
              <label style={{ ...s.lab, flex: 1 }}>Nacharbeit abgenommen am<input type="date" style={s.inp} value={rForm.abgenommen_am} onChange={(e) => setRForm({ ...rForm, abgenommen_am: e.target.value })} /></label>
            </div>
            <label style={s.lab}>Ergebnis der Prüfung / Begründung<input style={s.inp} value={rForm.ergebnis} onChange={(e) => setRForm({ ...rForm, ergebnis: e.target.value })} placeholder="z. B. Verschleiß durch Nutzung, Leistung eines anderen Gewerks" /></label>
            <div style={s.knoepfe}>
              <button style={{ ...s.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={ruegeSpeichern}>💾 Speichern</button>
              <button style={s.klein} onClick={() => setRForm(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Musterschreiben ---------- */}
      {muster && (
        <div style={s.schleier} onClick={() => setMuster(null)}>
          <div style={s.fenster} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>✉️ {MUSTER.find((m) => m.key === muster.art)?.label}</div>
            <div style={s.anwalt}>⚖️ Mustertext — Anwalt-Platzhalter. Vor dem ersten Versand von Ihrem Anwalt prüfen lassen und an Ihren Vertrag anpassen.</div>
            <label style={s.lab}>Betreff<input style={s.inp} value={muster.betreff} onChange={(e) => setMuster({ ...muster, betreff: e.target.value, geprueft: false })} /></label>
            <label style={s.lab}>Text<textarea style={{ ...s.inp, minHeight: 280, fontSize: 14, lineHeight: 1.5 }} value={muster.text} onChange={(e) => setMuster({ ...muster, text: e.target.value, geprueft: false })} /></label>
            {musterPlatzhalter.length > 0 && <div style={{ color: C.warn, fontSize: 13 }}>⚠️ Noch {musterPlatzhalter.length} offene Platzhalter: {musterPlatzhalter.slice(0, 6).join(', ')}{musterPlatzhalter.length > 6 ? ' …' : ''}</div>}
            <label style={s.check}><input type="checkbox" checked={muster.geprueft} onChange={(e) => setMuster({ ...muster, geprueft: e.target.checked })} /> Ich habe den Text geprüft und an den Einzelfall angepasst.</label>
            <div style={s.knoepfe}>
              <button style={{ ...s.primaer, opacity: muster.geprueft && !musterPlatzhalter.length ? 1 : 0.5 }} disabled={!muster.geprueft || musterPlatzhalter.length > 0} onClick={kopieren}>📋 Kopieren</button>
              <a style={{ ...s.klein, pointerEvents: muster.geprueft && !musterPlatzhalter.length ? 'auto' : 'none', opacity: muster.geprueft && !musterPlatzhalter.length ? 1 : 0.5, textDecoration: 'none' }}
                href={`mailto:?subject=${encodeURIComponent(muster.betreff)}&body=${encodeURIComponent(muster.text)}`}>📧 Als E-Mail öffnen</a>
              <button style={{ ...s.klein, opacity: muster.geprueft && !musterPlatzhalter.length ? 1 : 0.5 }} disabled={!muster.geprueft || musterPlatzhalter.length > 0 || busy} onClick={alsPdf}>📄 PDF</button>
              <button style={s.klein} onClick={() => setMuster(null)}>Schließen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.textDim, fontSize: 13, textDecoration: 'none' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  sub: { color: C.textDim, fontSize: 14.5, margin: '6px 0 0', maxWidth: 760 },
  anwalt: { background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.35)', color: C.gold, borderRadius: 10, padding: '9px 13px', fontSize: 13, marginTop: 12, lineHeight: 1.45 },
  tabs: { display: 'flex', gap: 8, margin: '16px 0 6px', flexWrap: 'wrap' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 },
  kpi: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' },
  kpiZahl: { fontSize: 22, fontWeight: 800 },
  kpiText: { color: C.textDim, fontSize: 12.5, marginTop: 2 },
  leiste: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 },
  kopf: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', borderTop: `1px solid ${C.border}`, paddingTop: 8, flexWrap: 'wrap' },
  ruege: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 },
  knoepfe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700 },
  dim: { color: C.textDim, fontSize: 13, marginTop: 2 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.text, cursor: 'pointer' },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  posForm: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  klein: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 12px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  dazu: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '8px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' },
  weg: { background: 'transparent', color: C.danger, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer' },
  schleier: { position: 'fixed', inset: 0, background: 'rgba(5,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 12px', overflowY: 'auto', zIndex: 50 },
  fenster: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 10 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
