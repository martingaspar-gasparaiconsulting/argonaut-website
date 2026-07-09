'use client';

// ============================================================
// ARGONAUT OS · Modul D+ · Block D+.4 · Werkstatt-Board + Uhrwerk
// D.3-Board (Kanban, Durchlaufzeit, Status-Log, KiAuge) ERWEITERT um:
//  - Fahrzeug-Kopplung (optional) per FIN/Kennzeichen (werkstatt_fahrzeuge)
//  - Leistungs-Positionen aus dem Katalog (suchen → übernehmen → überschreibbar)
//  - Material- & Fremdleistungs-Positionen, Live-Summe (Zeit + Betrag)
//  - KVA-Kundenfreigabe (Block 1.1): Kostenvoranschlag → Freigabe/Ablehnung,
//    Nachtrag-Erkennung, GoBD-Log (werkstatt_freigabe_log)
// Positionen werden sofort gespeichert (schnelles Arbeiten), Entfernen fragt nach.
// Kopfdaten + Archivieren + Freigabe-Schritte bestätigungspflichtig. Design 1:1 wie das Dashboard.
// Pfad: app/dashboard/werkstatt/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import KiAuge from '../_components/KiAuge';
import {
  STATUS_PHASEN, statusDef, gruppiereBoard, naechsterStatus, istAbgeschlossen,
  durchlaufzeitText, durchlaufzeitMinuten, dauerTextMinuten, dringlichkeitsAmpel,
  verweildauerJePhase, zaehleOffen,
  type StatusLogEintrag,
} from '../_components/werkstattLogik';
import {
  katalogNachPosition, positionsMinuten, positionsBetrag, auftragsSumme,
  zeitText, eur, finGueltig, finNormalisieren,
  type KatalogEintrag, type PositionBasis,
} from '../_components/leistungLogik';
import {
  freigabeDef, freigabeAmpel, erlaubteUebergaenge, uebergangErlaubt,
  hatOffenenNachtrag, nachtragDifferenz, freigabeDatumText,
  type FreigabeStatus,
} from '../_components/freigabeLogik';
import { baueNachrichten, type NachrichtVorlage } from '../_components/kundenNachrichten';
import {
  findeKonflikte, baueZeitpunkt, uhrzeit, zeitraumText,
  type BuchungBasis,
} from '../_components/buchungsLogik';
import AnhaengeBox from '../_components/AnhaengeBox';
import { werkstattAuftragPdf } from '../_components/werkstattAuftragPdf';
import MaterialEntnahme from '../_components/MaterialEntnahme';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666', lila: '#A855F7',
};

// --- DB-Typen -----------------------------------------------------------
type AuftragRow = {
  id: string; owner_user_id: string;
  nummer: string | null; titel: string; beschreibung: string | null;
  kunde_name: string | null; kennzeichen: string | null;
  status: string; prioritaet: string;
  angenommen_am: string; fertig_am: string | null; zugesagt_am: string | null;
  fahrzeug_id: string | null;
  notiz: string | null; archiviert: boolean;
  // Block 1.1 · KVA-Freigabe (additiv)
  freigabe_status: string | null;
  freigabe_am: string | null;
  freigabe_notiz: string | null;
  freigabe_summe_netto: number | null;
  rechnung_id: string | null;
  // Block 1.5 · Fahrzeug-Annahme (additiv)
  kilometerstand: number | null;
  kundenanliegen: string | null;
  annahme_zustand: string | null;
};
type FahrzeugRow = {
  id: string; owner_user_id: string; fin: string; kennzeichen: string | null;
  hersteller: string | null; modell: string | null; halter_name: string | null;
  naechste_hu: string | null;
};
type KatalogRow = KatalogEintrag & { id: string; aktiv: boolean };
type PositionRow = PositionBasis & {
  id: string; owner_user_id: string; auftrag_id: string;
  katalog_id: string | null; artikel_id: string | null; extern_firma: string | null;
};
// Block 1.4 · Bühnen-/Ressourcen-Buchung
type RessourceRow = { id: string; bezeichnung: string; typ: string | null; farbe: string | null };
type BuchungRow = BuchungBasis & {
  id: string; ressource_id: string; titel: string;
  beginn_am: string; ende_am: string; status: string;
  werkstatt_auftrag_id: string | null;
};

const PRIO_OPTIONEN = [
  { wert: 'normal', label: 'Normal' }, { wert: 'hoch', label: 'Hoch' }, { wert: 'dringend', label: 'Dringend' },
];
const ART_ERFASSUNG = [
  { wert: 'stunden', label: 'Std' }, { wert: 'minuten', label: 'Min' },
  { wert: 'aw', label: 'AW' }, { wert: 'stueck', label: 'Stück' },
];

type Form = {
  id: string | null;
  titel: string; nummer: string; kunde_name: string; kennzeichen: string;
  prioritaet: string; zugesagt_am: string; beschreibung: string; notiz: string;
  fahrzeug_id: string | null;
  // Block 1.5 · Annahme
  kilometerstand: string; kundenanliegen: string; annahme_zustand: string;
};
const LEER: Form = {
  id: null, titel: '', nummer: '', kunde_name: '', kennzeichen: '',
  prioritaet: 'normal', zugesagt_am: '', beschreibung: '', notiz: '', fahrzeug_id: null,
  kilometerstand: '', kundenanliegen: '', annahme_zustand: '',
};

function datumHuebsch(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function num(s: string): number | null {
  const t = s.trim().replace(',', '.'); if (t === '') return null;
  const n = Number(t); return Number.isFinite(n) ? n : null;
}

export default function WerkstattPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [auftraege, setAuftraege] = useState<AuftragRow[]>([]);
  const [fahrzeuge, setFahrzeuge] = useState<FahrzeugRow[]>([]);
  const [katalog, setKatalog] = useState<KatalogRow[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [modalAuf, setModalAuf] = useState(false);
  const [form, setForm] = useState<Form>(LEER);
  const [speichert, setSpeichert] = useState(false);
  const [gespeichertHinweis, setGespeichertHinweis] = useState(false);
  const [positionen, setPositionen] = useState<PositionRow[]>([]);
  const [log, setLog] = useState<StatusLogEintrag[]>([]);

  const [fzSuche, setFzSuche] = useState('');
  const [fzNeuAuf, setFzNeuAuf] = useState(false);
  const [fzNeu, setFzNeu] = useState({ fin: '', kennzeichen: '', hersteller: '', modell: '', halter_name: '', naechste_hu: '' });

  const [leiSuche, setLeiSuche] = useState('');
  const [leiOffen, setLeiOffen] = useState(false);

  // Block 1.4 · Bühnen-/Ressourcen-Buchung
  const [ressourcen, setRessourcen] = useState<RessourceRow[]>([]);
  const [auftragBuchungen, setAuftragBuchungen] = useState<BuchungRow[]>([]);
  const [resTagBuchungen, setResTagBuchungen] = useState<BuchungRow[]>([]);
  const [buchForm, setBuchForm] = useState({ ressource_id: '', datum: '', start: '08:00', ende: '10:00' });
  const [buchBusy, setBuchBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
    })();
  }, []);

  const laden_ = useCallback(async () => {
    if (!uid) return;
    setLaden(true); setFehler(null);
    try {
      const [aRes, fRes, kRes, rRes] = await Promise.all([
        supabase.from('werkstatt_auftraege').select('*').eq('owner_user_id', uid).eq('archiviert', false).order('angenommen_am', { ascending: true }),
        supabase.from('werkstatt_fahrzeuge').select('id, owner_user_id, fin, kennzeichen, hersteller, modell, halter_name, naechste_hu').eq('owner_user_id', uid).eq('archiviert', false),
        supabase.from('leistungskatalog').select('*').eq('owner_user_id', uid).eq('aktiv', true).order('bezeichnung', { ascending: true }),
        supabase.from('ressourcen').select('id, bezeichnung, typ, farbe').eq('owner_user_id', uid).eq('archiviert', false).order('bezeichnung', { ascending: true }),
      ]);
      if (aRes.error) throw aRes.error;
      setAuftraege((aRes.data as AuftragRow[]) ?? []);
      setFahrzeuge((fRes.data as FahrzeugRow[]) ?? []);
      setKatalog((kRes.data as KatalogRow[]) ?? []);
      setRessourcen((rRes.data as RessourceRow[]) ?? []);
    } catch (e: unknown) {
      setFehler('Daten konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setLaden(false); }
  }, [uid]);

  useEffect(() => { void laden_(); }, [laden_]);

  // --- Positionen + Log eines Auftrags laden ----------------------------
  const ladePositionen = useCallback(async (auftragId: string) => {
    const { data } = await supabase.from('werkstatt_positionen').select('*')
      .eq('auftrag_id', auftragId).order('erstellt_am', { ascending: true });
    setPositionen((data as PositionRow[]) ?? []);
  }, []);
  const ladeLog = useCallback(async (auftragId: string) => {
    const { data } = await supabase.from('werkstatt_status_log')
      .select('von_status, nach_status, geaendert_am').eq('auftrag_id', auftragId).order('geaendert_am', { ascending: true });
    setLog((data as StatusLogEintrag[]) ?? []);
  }, []);
  // Block 1.4 · Buchungen dieses Auftrags laden
  const ladeBuchungen = useCallback(async (auftragId: string) => {
    const { data } = await supabase.from('buchungen')
      .select('id, ressource_id, titel, beginn_am, ende_am, status, werkstatt_auftrag_id')
      .eq('werkstatt_auftrag_id', auftragId).order('beginn_am', { ascending: true });
    setAuftragBuchungen((data as BuchungRow[]) ?? []);
  }, []);

  // --- Modal öffnen -----------------------------------------------------
  function neu() {
    setForm(LEER); setLog([]); setPositionen([]); setFzSuche(''); setFzNeuAuf(false);
    setFzNeu({ fin: '', kennzeichen: '', hersteller: '', modell: '', halter_name: '', naechste_hu: '' });
    setLeiSuche(''); setLeiOffen(false); setGespeichertHinweis(false);
    setModalAuf(true);
  }
  async function bearbeiten(a: AuftragRow) {
    setForm({
      id: a.id, titel: a.titel, nummer: a.nummer ?? '', kunde_name: a.kunde_name ?? '',
      kennzeichen: a.kennzeichen ?? '', prioritaet: a.prioritaet ?? 'normal',
      zugesagt_am: a.zugesagt_am ?? '', beschreibung: a.beschreibung ?? '', notiz: a.notiz ?? '',
      fahrzeug_id: a.fahrzeug_id ?? null,
      kilometerstand: a.kilometerstand != null ? String(a.kilometerstand) : '',
      kundenanliegen: a.kundenanliegen ?? '', annahme_zustand: a.annahme_zustand ?? '',
    });
    setFzSuche(''); setFzNeuAuf(false); setLeiSuche(''); setLeiOffen(false); setGespeichertHinweis(false);
    setModalAuf(true);
    await Promise.all([ladePositionen(a.id), ladeLog(a.id), ladeBuchungen(a.id)]);
    // Buchungsformular vorbelegen: heute, erste Ressource
    const heute = new Date();
    const iso = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}-${String(heute.getDate()).padStart(2, '0')}`;
    setBuchForm({ ressource_id: '', datum: iso, start: '08:00', ende: '10:00' });
  }
  function setF<K extends keyof Form>(k: K, v: Form[K]) { setForm((f) => ({ ...f, [k]: v })); }

  // --- Kopfdaten speichern (Modal bleibt offen) -------------------------
  async function speichern() {
    if (!uid) return;
    if (!form.titel.trim()) { setFehler('Bitte einen Titel eingeben.'); return; }
    const istNeu = !form.id;
    if (!window.confirm(istNeu ? `Neuen Werkstatt-Auftrag anlegen?\n\n• ${form.titel}` : `Änderungen an "${form.titel}" speichern?`)) return;

    setSpeichert(true); setFehler(null);
    try {
      const payload = {
        owner_user_id: uid, titel: form.titel.trim(), nummer: form.nummer.trim() || null,
        kunde_name: form.kunde_name.trim() || null, kennzeichen: form.kennzeichen.trim() || null,
        prioritaet: form.prioritaet, zugesagt_am: form.zugesagt_am || null,
        beschreibung: form.beschreibung.trim() || null, notiz: form.notiz.trim() || null,
        fahrzeug_id: form.fahrzeug_id,
        kilometerstand: form.kilometerstand.trim() ? (num(form.kilometerstand) ?? null) : null,
        kundenanliegen: form.kundenanliegen.trim() || null,
        annahme_zustand: form.annahme_zustand.trim() || null,
        aktualisiert_am: new Date().toISOString(),
      };
      if (istNeu) {
        const { data, error } = await supabase.from('werkstatt_auftraege').insert(payload).select('id').single();
        if (error) throw error;
        setForm((f) => ({ ...f, id: (data as { id: string }).id })); // in Bearbeiten-Modus wechseln
      } else {
        const { error } = await supabase.from('werkstatt_auftraege').update(payload).eq('id', form.id);
        if (error) throw error;
      }
      setGespeichertHinweis(true);
      setTimeout(() => setGespeichertHinweis(false), 2500);
      await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  // --- Fahrzeug koppeln -------------------------------------------------
  const fzTreffer = useMemo(() => {
    const q = fzSuche.trim().toLowerCase();
    if (!q) return [];
    return fahrzeuge.filter((f) =>
      (f.fin || '').toLowerCase().includes(q) || (f.kennzeichen || '').toLowerCase().includes(q)
    ).slice(0, 6);
  }, [fzSuche, fahrzeuge]);

  async function fahrzeugKoppeln(fzId: string | null) {
    if (!form.id) { setForm((f) => ({ ...f, fahrzeug_id: fzId })); return; }
    try {
      const { error } = await supabase.from('werkstatt_auftraege')
        .update({ fahrzeug_id: fzId, aktualisiert_am: new Date().toISOString() }).eq('id', form.id);
      if (error) throw error;
      setForm((f) => ({ ...f, fahrzeug_id: fzId }));
      setFzSuche('');
      await laden_();
    } catch (e: unknown) {
      setFehler('Fahrzeug-Kopplung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }
  async function fahrzeugNeuAnlegen() {
    if (!uid) return;
    const fin = finNormalisieren(fzNeu.fin);
    if (!fin) { setFehler('Bitte eine FIN eingeben.'); return; }
    if (!finGueltig(fin)) { if (!window.confirm('Die FIN sieht ungewöhnlich aus (nicht 17 Zeichen / enthält I/O/Q). Trotzdem anlegen?')) return; }
    try {
      const { data, error } = await supabase.from('werkstatt_fahrzeuge').insert({
        owner_user_id: uid, fin, kennzeichen: fzNeu.kennzeichen.trim() || null,
        hersteller: fzNeu.hersteller.trim() || null, modell: fzNeu.modell.trim() || null,
        halter_name: fzNeu.halter_name.trim() || null,
        naechste_hu: fzNeu.naechste_hu || null,
      }).select('id').single();
      if (error) throw error;
      setFzNeuAuf(false);
      setFzNeu({ fin: '', kennzeichen: '', hersteller: '', modell: '', halter_name: '', naechste_hu: '' });
      await laden_();
      await fahrzeugKoppeln((data as { id: string }).id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('wfz_fin_owner_unique')) {
        setFehler('Ein Fahrzeug mit dieser FIN existiert bereits — bitte über die Suche auswählen.');
      } else setFehler('Fahrzeug anlegen fehlgeschlagen: ' + msg);
    }
  }
  const gekoppeltesFahrzeug = fahrzeuge.find((f) => f.id === form.fahrzeug_id) || null;

  // --- Feinschliff 1 · HU-Datum am gekoppelten Fahrzeug pflegen ---------
  const [huEingabe, setHuEingabe] = useState('');
  const [huBusy, setHuBusy] = useState(false);
  useEffect(() => {
    setHuEingabe(gekoppeltesFahrzeug?.naechste_hu ?? '');
  }, [gekoppeltesFahrzeug?.id, gekoppeltesFahrzeug?.naechste_hu]);

  /** Setzt das HU-Datum. `plusZweiJahre` = ab heute +2 Jahre (nach bestandener HU). */
  async function huSpeichern(plusZweiJahre = false) {
    if (!gekoppeltesFahrzeug) return;
    let ziel = huEingabe;
    if (plusZweiJahre) {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 2);
      ziel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (!ziel) { setFehler('Bitte ein HU-Datum wählen.'); return; }
    if (!window.confirm(`Nächste HU auf ${ziel.split('-').reverse().join('.')} setzen?`)) return;

    setHuBusy(true); setFehler(null);
    try {
      const { error } = await supabase.from('werkstatt_fahrzeuge')
        .update({ naechste_hu: ziel, aktualisiert_am: new Date().toISOString() })
        .eq('id', gekoppeltesFahrzeug.id);
      if (error) throw error;
      setHuEingabe(ziel);
      await laden_();
    } catch (e: unknown) {
      setFehler('HU-Datum konnte nicht gespeichert werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setHuBusy(false); }
  }

  // --- Positionen -------------------------------------------------------
  const leiTreffer = useMemo(() => {
    const q = leiSuche.trim().toLowerCase();
    const basis = q ? katalog.filter((k) => (k.bezeichnung || '').toLowerCase().includes(q) || (k.kategorie || '').toLowerCase().includes(q)) : katalog;
    return basis.slice(0, 8);
  }, [leiSuche, katalog]);

  async function positionEinfuegen(pos: PositionBasis, katalogId: string | null) {
    if (!uid || !form.id) { setFehler('Bitte zuerst den Auftrag speichern (Anlegen), dann Positionen hinzufügen.'); return; }
    try {
      const { error } = await supabase.from('werkstatt_positionen').insert({
        owner_user_id: uid, auftrag_id: form.id, katalog_id: katalogId,
        art: pos.art ?? 'leistung', bezeichnung: pos.bezeichnung ?? '',
        erfassungsart: pos.erfassungsart ?? 'stunden', menge: pos.menge ?? 1,
        aw_minuten: pos.aw_minuten ?? null, einzelpreis_netto: pos.einzelpreis_netto ?? null,
        extern: pos.extern ?? false, extern_firma: null,
      });
      if (error) throw error;
      await ladePositionen(form.id);
    } catch (e: unknown) {
      setFehler('Position konnte nicht hinzugefügt werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }
  function katalogUebernehmen(k: KatalogRow) {
    const pos = katalogNachPosition(k);
    void positionEinfuegen(pos, k.id);
    setLeiSuche(''); setLeiOffen(false);
  }
  function materialHinzufuegen() {
    void positionEinfuegen({ art: 'material', bezeichnung: '', erfassungsart: 'stueck', menge: 1, einzelpreis_netto: null }, null);
  }
  function fremdleistungHinzufuegen() {
    void positionEinfuegen({ art: 'fremdleistung', bezeichnung: '', erfassungsart: 'stueck', menge: 1, einzelpreis_netto: null, extern: true }, null);
  }
  async function positionAendern(id: string, patch: Partial<PositionRow>) {
    setPositionen((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      await supabase.from('werkstatt_positionen').update({ ...patch, aktualisiert_am: new Date().toISOString() }).eq('id', id);
    } catch { /* Feld-Fehler still; UI bleibt konsistent */ }
  }
  async function positionEntfernen(p: PositionRow) {
    if (!window.confirm(`Position "${p.bezeichnung || 'ohne Bezeichnung'}" entfernen?`)) return;
    try {
      const { error } = await supabase.from('werkstatt_positionen').delete().eq('id', p.id);
      if (error) throw error;
      if (form.id) await ladePositionen(form.id);
    } catch (e: unknown) {
      setFehler('Entfernen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // --- Status weiterrücken (+ Log) --------------------------------------
  async function weiterruecken(a: AuftragRow) {
    if (!uid) return;
    const naechster = naechsterStatus(a.status);
    if (!naechster) return;
    if (!window.confirm(`Auftrag "${a.titel}" weiterrücken?\n\n${statusDef(a.status).label} → ${statusDef(naechster).label}`)) return;
    try {
      const update: Record<string, unknown> = { status: naechster, aktualisiert_am: new Date().toISOString() };
      if (istAbgeschlossen(naechster) && !a.fertig_am) update.fertig_am = new Date().toISOString();
      const { error: e1 } = await supabase.from('werkstatt_auftraege').update(update).eq('id', a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('werkstatt_status_log').insert({
        owner_user_id: uid, auftrag_id: a.id, von_status: a.status, nach_status: naechster, geaendert_von: uid,
      });
      if (e2) throw e2;
      await laden_();
    } catch (e: unknown) {
      setFehler('Weiterrücken fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // --- KVA-Freigabe setzen (+ Log) · Block 1.1 --------------------------
  // Setzt freigabe_status am Auftrag und protokolliert den Schritt append-only.
  // Beim Freigeben wird die aktuelle Netto-Summe als Snapshot gespeichert —
  // Basis für die spätere Nachtrag-Erkennung.
  async function freigabeSetzen(nach: FreigabeStatus) {
    if (!uid || !form.id) return;
    const a = auftraege.find((x) => x.id === form.id);
    if (!a) return;
    const von = a.freigabe_status ?? 'kein_kva';
    if (!uebergangErlaubt(von, nach)) {
      setFehler('Dieser Freigabe-Schritt ist im aktuellen Zustand nicht möglich.');
      return;
    }

    const aktuelleSumme = summe.gesamtBetrag; // netto, kann null sein (Preise fehlen)

    // Klartext für Bestätigung + optionale Notiz
    let frage = '';
    let notizVorgabe = '';
    if (nach === 'kva_offen') frage = `Kostenvoranschlag für "${a.titel}" zur Kundenfreigabe stellen?`;
    else if (nach === 'freigegeben') frage = `Kunde hat den Kostenvoranschlag FREIGEGEBEN?\n\nDie aktuelle Summe (${aktuelleSumme != null ? eur(aktuelleSumme) + ' netto' : 'noch unvollständig'}) wird als freigegebener Stand gespeichert.`;
    else if (nach === 'abgelehnt') frage = `Kunde hat den Kostenvoranschlag ABGELEHNT?`;

    if (!window.confirm(frage)) return;

    // Notiz optional erfassen (z. B. "telefonisch durch Herrn Müller" / Ablehnungsgrund)
    const notizEingabe = window.prompt('Notiz zur Freigabe (optional — z. B. "telefonisch bestätigt durch Herrn Müller"):', notizVorgabe);
    if (notizEingabe === null) return; // Abbruch im Prompt = Vorgang abbrechen
    const notiz = notizEingabe.trim() || null;

    setSpeichert(true);
    try {
      const jetzt = new Date().toISOString();
      const update: Record<string, unknown> = {
        freigabe_status: nach,
        freigabe_am: jetzt,
        freigabe_notiz: notiz,
        aktualisiert_am: jetzt,
      };
      // Summen-Snapshot nur beim Freigeben setzen (Nachtrag-Basis).
      if (nach === 'freigegeben') update.freigabe_summe_netto = aktuelleSumme;

      const { error: e1 } = await supabase.from('werkstatt_auftraege').update(update).eq('id', a.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from('werkstatt_freigabe_log').insert({
        owner_user_id: uid, auftrag_id: a.id,
        von_status: von, nach_status: nach,
        summe_netto: nach === 'freigegeben' ? aktuelleSumme : null,
        notiz,
      });
      if (e2) throw e2;

      await laden_();
    } catch (e: unknown) {
      setFehler('Freigabe-Schritt fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  async function archivieren(a: AuftragRow) {
    if (!window.confirm(`Auftrag "${a.titel}" archivieren?\n\nDer Verlauf bleibt erhalten.`)) return;
    try {
      const { error } = await supabase.from('werkstatt_auftraege').update({ archiviert: true, aktualisiert_am: new Date().toISOString() }).eq('id', a.id);
      if (error) throw error;
      setModalAuf(false); await laden_();
    } catch (e: unknown) {
      setFehler('Archivieren fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // --- Kennzahlen -------------------------------------------------------
  const spalten = gruppiereBoard(auftraege);
  const offen = zaehleOffen(auftraege);
  const inArbeit = auftraege.filter((a) => a.status === 'in_arbeit').length;
  const abg = auftraege.filter((a) => istAbgeschlossen(a.status) && a.fertig_am);
  const oDurchlauf = abg.length > 0 ? dauerTextMinuten(Math.round(abg.reduce((s, a) => s + durchlaufzeitMinuten(a), 0) / abg.length)) : '—';

  const summe = auftragsSumme(positionen);

  // Block 1.5 · HU-Wiedervorlage: Fahrzeuge mit HU fällig in <= 60 Tagen oder überfällig
  const huTageBis = (iso: string | null): number | null => {
    if (!iso) return null;
    const ziel = new Date(iso + (iso.length <= 10 ? 'T00:00:00' : ''));
    if (isNaN(ziel.getTime())) return null;
    const heute = new Date();
    const h0 = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
    const z0 = new Date(ziel.getFullYear(), ziel.getMonth(), ziel.getDate());
    return Math.round((z0.getTime() - h0.getTime()) / 86400000);
  };
  const huFaellig = useMemo(() => {
    return fahrzeuge
      .map((f) => ({ f, tage: huTageBis(f.naechste_hu) }))
      .filter((x) => x.tage !== null && x.tage <= 60)
      .sort((a, b) => (a.tage ?? 0) - (b.tage ?? 0));
  }, [fahrzeuge]);

  // Aktueller Auftrag im Modal (für Freigabe-Panel)
  const aktAuftrag = form.id ? auftraege.find((x) => x.id === form.id) ?? null : null;
  const aktFreigabeAmpel = aktAuftrag ? freigabeAmpel(aktAuftrag, summe.gesamtBetrag) : null;
  const aktNachtrag = aktAuftrag ? hatOffenenNachtrag(aktAuftrag, summe.gesamtBetrag) : false;
  const aktNachtragDiff = aktAuftrag ? nachtragDifferenz(aktAuftrag, summe.gesamtBetrag) : 0;

  const kiKontext = auftraege.length === 0 ? '' :
    `${auftraege.length} Werkstatt-Aufträge, ${offen} offen, ${inArbeit} in Arbeit. Ø Durchlaufzeit: ${oDurchlauf}.`;

  // --- PDF erzeugen -----------------------------------------------------
  function pdfErzeugen() {
    if (!form.id) return;
    const a = auftraege.find((x) => x.id === form.id);
    if (!a) return;
    const fz = fahrzeuge.find((f) => f.id === form.fahrzeug_id) || null;
    werkstattAuftragPdf(
      {
        nummer: form.nummer || a.nummer, titel: form.titel || a.titel, status: a.status,
        kunde_name: form.kunde_name || a.kunde_name, kennzeichen: form.kennzeichen || a.kennzeichen,
        angenommen_am: a.angenommen_am, fertig_am: a.fertig_am, zugesagt_am: form.zugesagt_am || a.zugesagt_am,
        beschreibung: form.beschreibung || a.beschreibung,
        // Feinschliff 2 · Annahme-Doku ins PDF
        kilometerstand: form.kilometerstand.trim() ? (num(form.kilometerstand) ?? null) : a.kilometerstand,
        kundenanliegen: form.kundenanliegen || a.kundenanliegen,
        annahme_zustand: form.annahme_zustand || a.annahme_zustand,
      },
      fz ? { fin: fz.fin, kennzeichen: fz.kennzeichen, hersteller: fz.hersteller, modell: fz.modell, halter_name: fz.halter_name } : null,
      positionen,
    );
  }

  // --- Rechnung aus Werkstatt-Auftrag erstellen · Block 1.2 -------------
  const [rechnungBusy, setRechnungBusy] = useState(false);
  async function rechnungErstellen() {
    if (!form.id) return;
    const a = auftraege.find((x) => x.id === form.id);
    if (!a) return;

    if (positionen.length === 0) {
      setFehler('Der Auftrag hat noch keine Positionen — bitte zuerst Leistungen/Material erfassen.');
      return;
    }

    // Warnungen (nicht blockierend): offener Nachtrag / KVA nicht freigegeben
    const fStatus = a.freigabe_status ?? 'kein_kva';
    if (aktNachtrag) {
      if (!window.confirm('Achtung: Es gibt einen offenen Nachtrag über dem freigegebenen Betrag. Trotzdem eine Rechnung erstellen?')) return;
    } else if (fStatus === 'kva_offen') {
      if (!window.confirm('Der Kostenvoranschlag ist noch nicht vom Kunden freigegeben. Trotzdem eine Rechnung erstellen?')) return;
    } else if (fStatus === 'abgelehnt') {
      if (!window.confirm('Der Kostenvoranschlag wurde vom Kunden abgelehnt. Trotzdem eine Rechnung erstellen?')) return;
    } else {
      if (!window.confirm(`Aus diesem Auftrag eine Rechnung erstellen?\n\nDie Positionen werden übernommen, die Rechnung wird als „offen" angelegt.`)) return;
    }

    setRechnungBusy(true); setFehler(null);
    try {
      const res = await fetch('/api/rechnung-aus-werkstatt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auftragId: form.id }),
      });
      const daten = await res.json();
      if (!res.ok) { setFehler(daten?.error || 'Rechnung konnte nicht erstellt werden.'); setRechnungBusy(false); return; }

      const hinweis = daten.bereitsVorhanden
        ? 'Zu diesem Auftrag existiert bereits eine Rechnung. Jetzt öffnen?'
        : 'Rechnung wurde erstellt. Jetzt öffnen?';
      if (window.confirm(hinweis)) {
        router.push(`/dashboard/rechnungen/${daten.rechnungId}`);
      } else {
        await laden_();
      }
    } catch (e: unknown) {
      setFehler('Rechnung erstellen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setRechnungBusy(false); }
  }

  // --- Kunden-Nachrichten · Block 1.3 ----------------------------------
  const [nachrichtTyp, setNachrichtTyp] = useState<string | null>(null);
  const [nachrichtText, setNachrichtText] = useState<string>('');
  const [nachrichtKopiert, setNachrichtKopiert] = useState(false);

  const nachrichtVorlagen = useMemo<NachrichtVorlage[]>(() => {
    if (!aktAuftrag) return [];
    const fz = fahrzeuge.find((f) => f.id === aktAuftrag.fahrzeug_id) || null;
    const fahrzeugText = fz ? [fz.hersteller, fz.modell].filter(Boolean).join(' ') : '';
    return baueNachrichten({
      kunde_name: aktAuftrag.kunde_name,
      kennzeichen: fz?.kennzeichen || aktAuftrag.kennzeichen,
      fahrzeug_text: fahrzeugText || null,
      status: aktAuftrag.status,
      freigabe_status: aktAuftrag.freigabe_status,
      zugesagt_am: aktAuftrag.zugesagt_am,
      summe_brutto: summe.gesamtBetrag != null ? Math.round(summe.gesamtBetrag * 1.19 * 100) / 100 : null,
    });
  }, [aktAuftrag, fahrzeuge, summe.gesamtBetrag]);

  // Beim Öffnen/Wechsel: empfohlene Vorlage vorwählen
  useEffect(() => {
    if (nachrichtVorlagen.length === 0) { setNachrichtTyp(null); setNachrichtText(''); return; }
    const vorwahl = nachrichtVorlagen[0];
    setNachrichtTyp(vorwahl.typ);
    setNachrichtText(vorwahl.text);
    setNachrichtKopiert(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id]);

  function nachrichtWaehlen(v: NachrichtVorlage) {
    setNachrichtTyp(v.typ);
    setNachrichtText(v.text);
    setNachrichtKopiert(false);
  }
  async function nachrichtKopieren() {
    try {
      await navigator.clipboard.writeText(nachrichtText);
      setNachrichtKopiert(true);
      setTimeout(() => setNachrichtKopiert(false), 2500);
    } catch {
      setFehler('Kopieren nicht möglich — bitte Text manuell markieren.');
    }
  }

  // --- Bühnen-/Ressourcen-Buchung · Block 1.4 --------------------------
  // Tagesbuchungen der gewählten Ressource laden (für Live-Konfliktprüfung)
  const ladeResTag = useCallback(async (ressourceId: string, datum: string) => {
    if (!ressourceId || !datum) { setResTagBuchungen([]); return; }
    const tagStart = new Date(datum + 'T00:00:00');
    const tagEnde = new Date(datum + 'T23:59:59');
    const { data } = await supabase.from('buchungen')
      .select('id, ressource_id, titel, beginn_am, ende_am, status, werkstatt_auftrag_id')
      .eq('ressource_id', ressourceId)
      .lte('beginn_am', tagEnde.toISOString())
      .gte('ende_am', tagStart.toISOString());
    setResTagBuchungen((data as BuchungRow[]) ?? []);
  }, []);

  function setBuch<K extends keyof typeof buchForm>(k: K, v: (typeof buchForm)[K]) {
    setBuchForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'ressource_id' || k === 'datum') void ladeResTag(next.ressource_id, next.datum);
      return next;
    });
  }

  // Live-Konflikt der geplanten Bühnen-Buchung
  const buchGeplant: BuchungBasis | null = useMemo(() => {
    const s = baueZeitpunkt(buchForm.datum, buchForm.start);
    const e = baueZeitpunkt(buchForm.datum, buchForm.ende);
    if (!buchForm.ressource_id || !s || !e || e <= s) return null;
    return { ressource_id: buchForm.ressource_id, beginn_am: s, ende_am: e, status: 'geplant' };
  }, [buchForm]);

  const buchKonflikte = useMemo(() => {
    if (!buchGeplant) return [];
    return findeKonflikte(buchGeplant, resTagBuchungen as BuchungBasis[]);
  }, [buchGeplant, resTagBuchungen]);

  async function buchungAnlegen() {
    if (!uid || !form.id) return;
    const a = auftraege.find((x) => x.id === form.id);
    if (!a) return;
    if (!buchForm.ressource_id) { setFehler('Bitte eine Ressource (z. B. Bühne) wählen.'); return; }
    const s = baueZeitpunkt(buchForm.datum, buchForm.start);
    const e = baueZeitpunkt(buchForm.datum, buchForm.ende);
    if (!s || !e || e <= s) { setFehler('Bitte gültige Start-/Endzeit wählen (Ende nach Start).'); return; }
    if (buchKonflikte.length > 0) { setFehler('Die Ressource ist in dem Zeitraum bereits belegt.'); return; }

    const resName = ressourcen.find((r) => r.id === buchForm.ressource_id)?.bezeichnung ?? 'Ressource';
    const fz = fahrzeuge.find((f) => f.id === a.fahrzeug_id);
    const kennz = fz?.kennzeichen || a.kennzeichen || '';
    const titel = `${a.titel}${kennz ? ' · ' + kennz : ''}`;
    if (!window.confirm(`Bühne/Ressource buchen?\n\n• ${resName}\n• ${titel}\n• ${uhrzeit(s)}–${uhrzeit(e)} am ${buchForm.datum.split('-').reverse().join('.')}`)) return;

    setBuchBusy(true); setFehler(null);
    try {
      const { error } = await supabase.from('buchungen').insert({
        owner_user_id: uid,
        ressource_id: buchForm.ressource_id,
        titel,
        beginn_am: s.toISOString(),
        ende_am: e.toISOString(),
        status: 'geplant',
        werkstatt_auftrag_id: a.id,
        aktualisiert_am: new Date().toISOString(),
      });
      if (error) throw error;
      await ladeBuchungen(a.id);
      await ladeResTag(buchForm.ressource_id, buchForm.datum);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('23P01') || msg.toLowerCase().includes('exclusion') || msg.includes('buchung_keine_ueberschneidung')) {
        setFehler('Diese Ressource ist in dem Zeitraum bereits belegt. Bitte anderen Zeitraum wählen.');
      } else {
        setFehler('Buchung fehlgeschlagen: ' + msg);
      }
    } finally { setBuchBusy(false); }
  }

  async function buchungStornieren(b: BuchungRow) {
    if (!window.confirm(`Buchung "${b.titel}" stornieren?\n\nSie gibt den Zeitraum wieder frei.`)) return;
    try {
      const { error } = await supabase.from('buchungen').update({ status: 'storniert', aktualisiert_am: new Date().toISOString() }).eq('id', b.id);
      if (error) throw error;
      if (form.id) await ladeBuchungen(form.id);
    } catch (e: unknown) {
      setFehler('Stornieren fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  // Block 1.5 · HU-Kachel: aufklappen + Erinnerungstext kopieren
  const [huOffen, setHuOffen] = useState(false);
  async function huErinnerungKopieren(f: FahrzeugRow) {
    const fahrzeugText = [f.hersteller, f.modell].filter(Boolean).join(' ');
    // Halter als Kunde verwenden, falls vorhanden
    const vorlagen = baueNachrichten({
      kunde_name: f.halter_name,
      kennzeichen: f.kennzeichen,
      fahrzeug_text: fahrzeugText || null,
      hu_faellig: f.naechste_hu,
    });
    const hu = vorlagen.find((v) => v.typ === 'hu_erinnerung');
    if (!hu) return;
    try {
      await navigator.clipboard.writeText(hu.text);
      setFehler(null);
      window.alert('HU-Erinnerung in die Zwischenablage kopiert — jetzt per WhatsApp/SMS an den Kunden senden.');
    } catch {
      setFehler('Kopieren nicht möglich — bitte manuell aus der Fahrzeugakte übernehmen.');
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Service</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Werkstatt-Durchlauf</h1>
          <p style={styles.sub}>Aufträge führen, Leistungen erfassen, Fahrzeughistorie aufbauen — mit automatischer Durchlaufzeit.</p>
        </div>
        <button onClick={neu} style={styles.primaerBtn}>+ Neuer Auftrag</button>
      </div>

      {!laden && (
        <div style={styles.summenGrid}>
          <SummeKarte label="Aufträge" value={String(auftraege.length)} accent={C.cyan} />
          <SummeKarte label="Offen" value={String(offen)} accent={offen > 0 ? C.warn : C.green} />
          <SummeKarte label="In Arbeit" value={String(inArbeit)} accent={C.gold} />
          <SummeKarte label="Ø Durchlaufzeit" value={oDurchlauf} accent={C.green} />
        </div>
      )}

      {!laden && kiKontext && (
        <KiAuge modul="Werkstatt-Durchlauf" kontext={kiKontext} aktionHref="/dashboard/werkstatt" aktionText="Zum Werkstatt-Board" />
      )}

      {/* Block 1.5 · HU-Wiedervorlage-Kachel */}
      {!laden && huFaellig.length > 0 && (
        <div style={{ background: C.navy2, border: `1px solid ${C.warn}55`, borderRadius: 14, padding: '14px 18px', marginBottom: 18 }}>
          <button
            onClick={() => setHuOffen((o) => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'transparent', border: 'none', color: C.text, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
          >
            <span style={{ fontSize: 18 }}>🗓</span>
            <span style={{ fontWeight: 700, fontFamily: "'Syne', sans-serif", fontSize: 15 }}>
              HU-Wiedervorlage: {huFaellig.length} {huFaellig.length === 1 ? 'Fahrzeug' : 'Fahrzeuge'} fällig
            </span>
            <span style={{ marginLeft: 'auto', color: C.textDim, fontSize: 13 }}>{huOffen ? '▲' : '▼'}</span>
          </button>
          {huOffen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {huFaellig.map(({ f, tage }) => {
                const t = tage ?? 0;
                const farbe = t < 0 ? C.danger : t <= 30 ? C.warn : C.green;
                const text = t < 0 ? `${Math.abs(t)} Tage überfällig` : t === 0 ? 'heute fällig' : `in ${t} Tagen`;
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13.5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: farbe, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700 }}>{[f.hersteller, f.modell].filter(Boolean).join(' ') || 'Fahrzeug'}</span>
                    <span style={{ color: C.textDim }}>{f.kennzeichen || `FIN …${f.fin.slice(-6)}`}{f.halter_name ? ` · ${f.halter_name}` : ''}</span>
                    <span style={{ color: farbe, marginLeft: 'auto', fontWeight: 600 }}>{datumHuebsch(f.naechste_hu)} · {text}</span>
                    <button onClick={() => huErinnerungKopieren(f)} style={styles.kvaBtn} title="HU-Erinnerung als Nachricht kopieren">💬 Erinnerung</button>
                  </div>
                );
              })}
              <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 4 }}>
                Zeigt Fahrzeuge mit HU-Fälligkeit in den nächsten 60 Tagen. HU-Datum wird beim Fahrzeug im Auftrag gepflegt.
              </div>
            </div>
          )}
        </div>
      )}

      {fehler && <div style={styles.err}>{fehler}</div>}

      {laden ? (
        <div style={styles.hint}>Lädt …</div>
      ) : auftraege.length === 0 ? (
        <div style={styles.card}><div style={styles.hint}>Noch keine Aufträge. Leg oben rechts den ersten an.</div></div>
      ) : (
        <div style={styles.board}>
          {spalten.map(({ def, auftraege: liste }) => (
            <div key={def.wert} style={styles.spalte}>
              <div style={{ ...styles.spalteKopf, borderTopColor: def.farbe }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: def.farbe, display: 'inline-block' }} />
                <span style={{ fontWeight: 700 }}>{def.label}</span>
                <span style={{ color: C.textDim, fontSize: 12, marginLeft: 'auto' }}>{liste.length}</span>
              </div>
              <div style={styles.spalteBody}>
                {liste.length === 0 ? <div style={{ color: C.textDim, fontSize: 12, padding: '8px 4px' }}>—</div> : (
                  liste.map((a) => {
                    const ampel = dringlichkeitsAmpel(a);
                    const fAmpel = freigabeAmpel(a);
                    const zeigeFreigabe = (a.freigabe_status ?? 'kein_kva') !== 'kein_kva';
                    const naechster = naechsterStatus(a.status);
                    const fz = fahrzeuge.find((f) => f.id === a.fahrzeug_id);
                    return (
                      <div key={a.id} style={styles.karte}>
                        <button onClick={() => void bearbeiten(a)} style={styles.karteHaupt} title="Details / Bearbeiten">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: ampel.farbe, display: 'inline-block', flexShrink: 0 }} />
                            {zeigeFreigabe && (
                              <span
                                title={`Freigabe: ${fAmpel.label}`}
                                style={{ width: 7, height: 7, borderRadius: '50%', background: fAmpel.farbe, display: 'inline-block', flexShrink: 0, boxShadow: `0 0 0 2px ${C.navy}` }}
                              />
                            )}
                            <span style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titel}</span>
                          </div>
                          {(a.kunde_name || a.kennzeichen || fz) && (
                            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>
                              {[a.kunde_name, fz ? (fz.kennzeichen || fz.fin.slice(-6)) : a.kennzeichen].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          {zeigeFreigabe && (
                            <div style={{ fontSize: 10.5, color: fAmpel.farbe, marginBottom: 4, fontWeight: 600 }}>
                              {fAmpel.aktionNoetig ? '⚠ ' : ''}{fAmpel.label}
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                            <span style={{ color: ampel.farbe }}>{ampel.label}</span>
                            <span style={{ color: C.textDim }}>{durchlaufzeitText(a)}</span>
                          </div>
                        </button>
                        {naechster && (
                          <button onClick={() => weiterruecken(a)} style={styles.weiterBtn} title={`→ ${statusDef(naechster).label}`}>
                            → {statusDef(naechster).label}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.rechtHinweis}>
        Jeder Phasenwechsel wird protokolliert. Leistungen kommen aus dem Leistungskatalog und lassen sich je Auftrag anpassen. Fahrzeuge werden über die FIN dauerhaft geführt — auch bei Halterwechsel.
      </div>

      {/* --- Modal --------------------------------------------------- */}
      {modalAuf && (
        <div style={styles.overlay} onClick={() => !speichert && setModalAuf(false)}>
          <div style={{ ...styles.modal, maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ ...styles.modalTitel, margin: 0 }}>{form.id ? 'Auftrag bearbeiten' : 'Neuer Werkstatt-Auftrag'}</h2>
              {gespeichertHinweis && <span style={{ color: C.green, fontSize: 13 }}>✓ gespeichert</span>}
            </div>

            {/* Feinschliff 4 · Fehler auch im Modal sichtbar (nicht nur oben auf der Seite) */}
            {fehler && <div style={{ ...styles.err, marginBottom: 16 }}>{fehler}</div>}

            {/* Kopfdaten */}
            <div style={styles.formGrid}>
              <Feld label="Titel *" voll>
                <input style={styles.input} value={form.titel} onChange={(e) => setF('titel', e.target.value)} placeholder="z. B. Großer Service / Reparatur Motorsäge" />
              </Feld>
              <Feld label="Kunde">
                <input style={styles.input} value={form.kunde_name} onChange={(e) => setF('kunde_name', e.target.value)} />
              </Feld>
              <Feld label="Auftrags-Nr.">
                <input style={styles.input} value={form.nummer} onChange={(e) => setF('nummer', e.target.value)} />
              </Feld>
              <Feld label="Priorität">
                <select style={styles.input} value={form.prioritaet} onChange={(e) => setF('prioritaet', e.target.value)}>
                  {PRIO_OPTIONEN.map((o) => <option key={o.wert} value={o.wert}>{o.label}</option>)}
                </select>
              </Feld>
              <Feld label="Zugesagt bis">
                <input type="date" style={styles.input} value={form.zugesagt_am} onChange={(e) => setF('zugesagt_am', e.target.value)} />
              </Feld>
              <Feld label="Beschreibung" voll>
                <textarea style={{ ...styles.input, minHeight: 50, resize: 'vertical' }} value={form.beschreibung} onChange={(e) => setF('beschreibung', e.target.value)} />
              </Feld>
            </div>

            {!form.id ? (
              <div style={styles.infoBox}>Kopfdaten unten mit „Anlegen" speichern — danach kannst du Fahrzeug und Leistungen hinzufügen.</div>
            ) : (
              <>
                {/* Fahrzeug-Annahme · Block 1.5 */}
                <div style={styles.sektion}>
                  <div style={styles.sektionTitel}>📋 Annahme</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={styles.lbl}>Kilometerstand</label>
                      <input style={styles.input} inputMode="numeric" value={form.kilometerstand}
                        onChange={(e) => setF('kilometerstand', e.target.value)} placeholder="z. B. 84500" />
                    </div>
                    <div>
                      <label style={styles.lbl}>Kundenanliegen (O-Ton)</label>
                      <input style={styles.input} value={form.kundenanliegen}
                        onChange={(e) => setF('kundenanliegen', e.target.value)} placeholder='z. B. "bremst mit Geräusch"' />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={styles.lbl}>Zustand bei Annahme (Haftungsschutz)</label>
                      <textarea style={{ ...styles.input, minHeight: 48, resize: 'vertical' }} value={form.annahme_zustand}
                        onChange={(e) => setF('annahme_zustand', e.target.value)} placeholder="z. B. Kratzer Stoßstange hinten links, Tank halb voll" />
                    </div>
                  </div>
                </div>

                {/* Fahrzeug (optional) */}
                <div style={styles.sektion}>
                  <div style={styles.sektionTitel}>🚗 Fahrzeug <span style={{ color: C.textDim, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
                  {gekoppeltesFahrzeug ? (
                    <>
                      <div style={styles.fzKarte}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{[gekoppeltesFahrzeug.hersteller, gekoppeltesFahrzeug.modell].filter(Boolean).join(' ') || 'Fahrzeug'}</div>
                          <div style={{ fontSize: 12, color: C.textDim }}>FIN {gekoppeltesFahrzeug.fin}{gekoppeltesFahrzeug.kennzeichen ? ` · ${gekoppeltesFahrzeug.kennzeichen}` : ''}</div>
                        </div>
                        <button onClick={() => fahrzeugKoppeln(null)} style={styles.miniBtnGhost}>Entkoppeln</button>
                      </div>

                      {/* Feinschliff 1 · HU-Datum pflegen */}
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 180px' }}>
                          <label style={styles.lbl}>Nächste HU (TÜV)</label>
                          <input type="date" style={styles.input} value={huEingabe} onChange={(e) => setHuEingabe(e.target.value)} />
                        </div>
                        <button onClick={() => void huSpeichern(false)} disabled={huBusy} style={{ ...styles.miniBtn, marginBottom: 1 }}>
                          {huBusy ? 'Speichert …' : 'HU speichern'}
                        </button>
                        <button onClick={() => void huSpeichern(true)} disabled={huBusy} style={{ ...styles.miniBtnGhost, marginBottom: 1, marginLeft: 0 }} title="HU heute bestanden → nächste HU in 2 Jahren">
                          ✓ HU bestanden (+2 J.)
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <input style={styles.input} value={fzSuche} onChange={(e) => setFzSuche(e.target.value)} placeholder="Fahrzeug suchen (FIN oder Kennzeichen) …" />
                      {fzTreffer.length > 0 && (
                        <div style={styles.dropdown}>
                          {fzTreffer.map((f) => (
                            <button key={f.id} onClick={() => fahrzeugKoppeln(f.id)} style={styles.dropdownItem}>
                              <span style={{ fontWeight: 600 }}>{[f.hersteller, f.modell].filter(Boolean).join(' ') || 'Fahrzeug'}</span>
                              <span style={{ color: C.textDim, fontSize: 12 }}> · {f.kennzeichen || f.fin}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {!fzNeuAuf ? (
                        <button onClick={() => setFzNeuAuf(true)} style={{ ...styles.miniBtnGhost, marginTop: 8, marginLeft: 0 }}>+ Neues Fahrzeug anlegen</button>
                      ) : (
                        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <Feld label="FIN *"><input style={styles.input} value={fzNeu.fin} onChange={(e) => setFzNeu((f) => ({ ...f, fin: e.target.value }))} placeholder="17-stellig" /></Feld>
                          <Feld label="Kennzeichen"><input style={styles.input} value={fzNeu.kennzeichen} onChange={(e) => setFzNeu((f) => ({ ...f, kennzeichen: e.target.value }))} /></Feld>
                          <Feld label="Hersteller"><input style={styles.input} value={fzNeu.hersteller} onChange={(e) => setFzNeu((f) => ({ ...f, hersteller: e.target.value }))} placeholder="z. B. Mercedes-Benz" /></Feld>
                          <Feld label="Modell"><input style={styles.input} value={fzNeu.modell} onChange={(e) => setFzNeu((f) => ({ ...f, modell: e.target.value }))} placeholder="z. B. C-Klasse" /></Feld>
                          <Feld label="Nächste HU (TÜV)"><input type="date" style={styles.input} value={fzNeu.naechste_hu} onChange={(e) => setFzNeu((f) => ({ ...f, naechste_hu: e.target.value }))} /></Feld>
                          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setFzNeuAuf(false)} style={styles.miniBtnGhost}>Abbrechen</button>
                            <button onClick={fahrzeugNeuAnlegen} style={styles.miniBtn}>Anlegen & koppeln</button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Leistungen / Positionen */}
                <div style={styles.sektion}>
                  <div style={styles.sektionTitel}>🧰 Leistungen &amp; Material</div>
                  <div style={{ position: 'relative' }}>
                    <input style={styles.input} value={leiSuche}
                      onFocus={() => setLeiOffen(true)}
                      onChange={(e) => { setLeiSuche(e.target.value); setLeiOffen(true); }}
                      placeholder="▾ Leistung aus Katalog suchen & übernehmen …" />
                    {leiOffen && (
                      <div style={styles.dropdown}>
                        {leiTreffer.length === 0 ? (
                          <div style={{ padding: '10px 12px', color: C.textDim, fontSize: 13 }}>Keine passende Leistung. Katalog unter „Leistungskatalog" pflegen.</div>
                        ) : leiTreffer.map((k) => (
                          <button key={k.id} onClick={() => katalogUebernehmen(k)} style={styles.dropdownItem}>
                            <span style={{ fontWeight: 600 }}>{k.bezeichnung}</span>
                            <span style={{ color: C.textDim, fontSize: 12 }}>
                              {' · '}{k.kategorie || 'ohne Kat.'}{k.stundensatz_netto != null ? ` · ${eur(k.stundensatz_netto)}/h` : (k.festpreis_netto != null ? ` · ${eur(k.festpreis_netto)}` : '')}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={materialHinzufuegen} style={styles.miniBtnGhost}>+ Material</button>
                    <button onClick={fremdleistungHinzufuegen} style={styles.miniBtnGhost}>+ Fremdleistung</button>
                    {leiOffen && <button onClick={() => setLeiOffen(false)} style={{ ...styles.miniBtnGhost, marginLeft: 'auto' }}>Liste schließen</button>}
                  </div>

                  {positionen.length > 0 && (
                    <div style={{ overflowX: 'auto', marginTop: 12 }}>
                      <table style={styles.posTable}>
                        <thead>
                          <tr>
                            <th style={styles.posTh}>Bezeichnung</th>
                            <th style={{ ...styles.posTh, width: 80 }}>Menge</th>
                            <th style={{ ...styles.posTh, width: 90 }}>Einheit</th>
                            <th style={{ ...styles.posTh, width: 100, textAlign: 'right' }}>Satz/Preis</th>
                            <th style={{ ...styles.posTh, width: 90, textAlign: 'right' }}>Zeit</th>
                            <th style={{ ...styles.posTh, width: 90, textAlign: 'right' }}>Betrag</th>
                            <th style={{ ...styles.posTh, width: 36 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {positionen.map((p) => {
                            const min = positionsMinuten(p);
                            const betrag = positionsBetrag(p);
                            return (
                              <tr key={p.id}>
                                <td style={styles.posTd}>
                                  <input style={styles.posInput} defaultValue={p.bezeichnung ?? ''} onBlur={(e) => positionAendern(p.id, { bezeichnung: e.target.value })} />
                                  {p.extern && <span style={styles.externBadge}>extern</span>}
                                  {p.art === 'material' && (
                                    <div style={{ marginTop: 5 }}>
                                      <MaterialEntnahme positionId={p.id} auftragId={form.id!} menge={typeof p.menge === 'number' ? p.menge : 1} onGebucht={() => { /* Bestand aktualisiert im Lager */ }} />
                                    </div>
                                  )}
                                </td>
                                <td style={styles.posTd}>
                                  <input style={{ ...styles.posInput, textAlign: 'right' }} defaultValue={String(p.menge ?? 1)} onBlur={(e) => positionAendern(p.id, { menge: num(e.target.value) ?? 0 })} />
                                </td>
                                <td style={styles.posTd}>
                                  <select style={styles.posInput} value={p.erfassungsart ?? 'stunden'} onChange={(e) => positionAendern(p.id, { erfassungsart: e.target.value })}>
                                    {ART_ERFASSUNG.map((o) => <option key={o.wert} value={o.wert}>{o.label}</option>)}
                                  </select>
                                </td>
                                <td style={styles.posTd}>
                                  <input style={{ ...styles.posInput, textAlign: 'right' }} defaultValue={p.einzelpreis_netto != null ? String(p.einzelpreis_netto) : ''} placeholder="—" onBlur={(e) => positionAendern(p.id, { einzelpreis_netto: num(e.target.value) })} />
                                </td>
                                <td style={{ ...styles.posTd, textAlign: 'right', color: C.textDim }}>{min > 0 ? zeitText(min) : '—'}</td>
                                <td style={{ ...styles.posTd, textAlign: 'right', color: C.gold }}>{betrag != null ? eur(betrag) : '—'}</td>
                                <td style={{ ...styles.posTd, textAlign: 'center' }}>
                                  <button onClick={() => positionEntfernen(p)} style={styles.xBtn} title="Entfernen">✕</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Live-Summe */}
                  <div style={styles.summeZeile}>
                    <span>Summe: <strong>{zeitText(summe.gesamtMinuten)}</strong> Arbeitszeit</span>
                    <span style={{ color: C.gold }}>
                      {summe.gesamtBetrag != null ? eur(summe.gesamtBetrag) + ' netto' : 'Betrag unvollständig (Preise fehlen)'}
                    </span>
                  </div>
                </div>

                {/* KVA-Kundenfreigabe · Block 1.1 */}
                {aktAuftrag && aktFreigabeAmpel && (() => {
                  const von = aktAuftrag.freigabe_status ?? 'kein_kva';
                  const naechste = erlaubteUebergaenge(von);
                  const def = freigabeDef(von);
                  return (
                    <div style={styles.sektion}>
                      <div style={styles.sektionTitel}>📋 Kostenvoranschlag &amp; Kundenfreigabe</div>

                      {/* Status-Zeile mit Ampel */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <span style={{ width: 11, height: 11, borderRadius: '50%', background: aktFreigabeAmpel.farbe, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: aktFreigabeAmpel.farbe }}>{aktFreigabeAmpel.label}</span>
                        {aktAuftrag.freigabe_am && (
                          <span style={{ color: C.textDim, fontSize: 12, marginLeft: 'auto' }}>
                            {freigabeDatumText(aktAuftrag.freigabe_am)}
                          </span>
                        )}
                      </div>

                      {/* Nachtrag-Warnung */}
                      {aktNachtrag && (
                        <div style={styles.nachtragBox}>
                          ⚠ <strong>Nachtrag offen:</strong> Die aktuelle Summe liegt {eur(aktNachtragDiff)} netto über dem freigegebenen Stand
                          {aktAuftrag.freigabe_summe_netto != null ? ` (freigegeben: ${eur(aktAuftrag.freigabe_summe_netto)} netto)` : ''}.
                          Vor Weiterarbeit erneut vom Kunden freigeben lassen.
                        </div>
                      )}

                      {/* Hinweis / Notiz */}
                      {!aktNachtrag && (
                        <div style={{ fontSize: 13, color: C.textDim, marginBottom: 10 }}>{aktFreigabeAmpel.hinweis}</div>
                      )}
                      {aktAuftrag.freigabe_notiz && (
                        <div style={{ fontSize: 12.5, color: C.text, marginBottom: 10, fontStyle: 'italic' }}>
                          „{aktAuftrag.freigabe_notiz}"
                        </div>
                      )}

                      {/* Aktions-Buttons je nach erlaubten Übergängen */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {naechste.includes('kva_offen') && (
                          <button onClick={() => freigabeSetzen('kva_offen')} disabled={speichert} style={styles.kvaBtn}>
                            {von === 'kein_kva' ? 'KVA zur Freigabe stellen' : (aktNachtrag ? 'Nachtrag zur Freigabe stellen' : 'Erneut zur Freigabe stellen')}
                          </button>
                        )}
                        {naechste.includes('freigegeben') && (
                          <button onClick={() => freigabeSetzen('freigegeben')} disabled={speichert} style={styles.freigebenBtn}>
                            ✓ Kunde hat freigegeben
                          </button>
                        )}
                        {naechste.includes('abgelehnt') && (
                          <button onClick={() => freigabeSetzen('abgelehnt')} disabled={speichert} style={styles.ablehnenBtn}>
                            ✕ Kunde hat abgelehnt
                          </button>
                        )}
                      </div>

                      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.5 }}>
                        Jeder Freigabe-Schritt wird protokolliert. Bei zusätzlichen Positionen über dem freigegebenen Betrag meldet das System hier automatisch einen Nachtrag — die Board-Karte zeigt nur den reinen Freigabe-Status.
                      </div>
                    </div>
                  );
                })()}

                {/* Kunden-Nachrichten · Block 1.3 */}
                {aktAuftrag && nachrichtVorlagen.length > 0 && (
                  <div style={styles.sektion}>
                    <div style={styles.sektionTitel}>💬 Kunden-Info</div>
                    <div style={{ fontSize: 12.5, color: C.textDim, marginBottom: 10 }}>
                      Fertige Nachricht wählen, bei Bedarf anpassen, kopieren und per WhatsApp/SMS senden.
                    </div>

                    {/* Vorlagen-Auswahl */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      {nachrichtVorlagen.map((v) => (
                        <button
                          key={v.typ}
                          onClick={() => nachrichtWaehlen(v)}
                          style={{
                            ...styles.miniBtnGhost, marginLeft: 0,
                            ...(nachrichtTyp === v.typ ? { color: C.cyan, borderColor: 'rgba(0,229,255,0.4)', background: 'rgba(0,229,255,0.08)' } : {}),
                            ...(v.passtZurLage ? { fontWeight: 700 } : {}),
                          }}
                          title={v.passtZurLage ? 'Passt zur aktuellen Lage' : ''}
                        >
                          {v.passtZurLage ? '★ ' : ''}{v.titel}
                        </button>
                      ))}
                    </div>

                    {/* Editierbarer Text */}
                    <textarea
                      style={{ ...styles.input, minHeight: 130, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }}
                      value={nachrichtText}
                      onChange={(e) => { setNachrichtText(e.target.value); setNachrichtKopiert(false); }}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                      <button onClick={nachrichtKopieren} style={styles.kvaBtn}>📋 Kopieren</button>
                      {nachrichtKopiert && <span style={{ color: C.green, fontSize: 13 }}>✓ in Zwischenablage</span>}
                      <span style={{ color: C.textDim, fontSize: 11.5, marginLeft: 'auto' }}>„[Ihre Werkstatt]" einmal durch Ihren Betriebsnamen ersetzen.</span>
                    </div>
                  </div>
                )}

                {/* Bühnen-/Ressourcen-Buchung · Block 1.4 */}
                {aktAuftrag && (
                  <div style={styles.sektion}>
                    <div style={styles.sektionTitel}>🔧 Bühne / Termin</div>

                    {ressourcen.length === 0 ? (
                      <div style={{ fontSize: 13, color: C.textDim }}>
                        Noch keine Ressourcen angelegt. Lege im Modul „Buchungen" z. B. „Hebebühne 1" an — danach kannst du sie hier terminieren.
                      </div>
                    ) : (
                      <>
                        {/* bereits gebuchte Termine dieses Auftrags */}
                        {auftragBuchungen.filter((b) => b.status !== 'storniert').length > 0 && (
                          <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {auftragBuchungen.filter((b) => b.status !== 'storniert').map((b) => {
                              const res = ressourcen.find((r) => r.id === b.ressource_id);
                              return (
                                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px' }}>
                                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: res?.farbe || C.cyan, display: 'inline-block', flexShrink: 0 }} />
                                  <span style={{ fontWeight: 700 }}>{res?.bezeichnung || 'Ressource'}</span>
                                  <span style={{ color: C.textDim }}>{zeitraumText(b.beginn_am, b.ende_am)}</span>
                                  <button onClick={() => buchungStornieren(b)} style={{ ...styles.miniBtnGhost, marginLeft: 'auto' }}>Stornieren</button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* neue Buchung */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={styles.lbl}>Ressource / Bühne</label>
                            <select style={styles.input} value={buchForm.ressource_id} onChange={(e) => setBuch('ressource_id', e.target.value)}>
                              <option value="">— wählen —</option>
                              {ressourcen.map((r) => <option key={r.id} value={r.id}>{r.bezeichnung}{r.typ ? ` (${r.typ})` : ''}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={styles.lbl}>Datum</label>
                            <input type="date" style={styles.input} value={buchForm.datum} onChange={(e) => setBuch('datum', e.target.value)} />
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <label style={styles.lbl}>Von</label>
                              <input type="time" style={styles.input} value={buchForm.start} onChange={(e) => setBuch('start', e.target.value)} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <label style={styles.lbl}>Bis</label>
                              <input type="time" style={styles.input} value={buchForm.ende} onChange={(e) => setBuch('ende', e.target.value)} />
                            </div>
                          </div>
                        </div>

                        {/* Live-Konflikt */}
                        {buchForm.ressource_id && buchKonflikte.length > 0 && (
                          <div style={{ ...styles.nachtragBox, background: 'rgba(224,102,102,0.12)', borderColor: 'rgba(224,102,102,0.4)', marginTop: 10 }}>
                            ⚠ Belegt in diesem Zeitraum: {buchKonflikte.map((k) => `${k.titel || 'Buchung'} (${uhrzeit(k.beginn_am)}–${uhrzeit(k.ende_am)})`).join(', ')}
                          </div>
                        )}
                        {buchForm.ressource_id && buchKonflikte.length === 0 && (
                          <div style={{ fontSize: 12.5, color: C.green, marginTop: 8 }}>✓ Zeitraum frei</div>
                        )}

                        <div style={{ marginTop: 10 }}>
                          <button onClick={buchungAnlegen} disabled={buchBusy || buchKonflikte.length > 0 || !buchForm.ressource_id} style={{ ...styles.kvaBtn, opacity: (buchBusy || buchKonflikte.length > 0 || !buchForm.ressource_id) ? 0.5 : 1 }}>
                            {buchBusy ? 'Bucht …' : '+ Bühne/Termin buchen'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Anhänge am Auftrag (Fotos vom Besuch, Belege) */}
                <div style={styles.sektion}>
                  <AnhaengeBox bezug="auftrag" bezugId={form.id} titel="Anhänge zum Auftrag (Fotos, Belege)" />
                </div>

                {/* Verweildauer je Phase */}
                {(() => {
                  const a = auftraege.find((x) => x.id === form.id);
                  if (!a) return null;
                  const phasen = verweildauerJePhase(a, log);
                  if (phasen.length === 0) return null;
                  return (
                    <div style={styles.sektion}>
                      <div style={styles.sektionTitel}>⏱ Durchlauf · gesamt {durchlaufzeitText(a)}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {phasen.map((ph) => (
                          <div key={ph.status} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: ph.farbe, display: 'inline-block' }} />
                            <span style={{ minWidth: 110 }}>{ph.label}</span>
                            <span style={{ color: C.textDim }}>{dauerTextMinuten(ph.minuten)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            <div style={styles.modalAktionen}>
              {form.id && (
                <button onClick={() => { const a = auftraege.find((x) => x.id === form.id); if (a) archivieren(a); }} disabled={speichert}
                  style={{ ...styles.ghostBtn, color: C.textDim, marginRight: 'auto' }}>Archivieren</button>
              )}
              {form.id && (
                <button onClick={pdfErzeugen} disabled={speichert} style={styles.ghostBtn}>🖨 Als PDF</button>
              )}
              {form.id && (
                <button onClick={rechnungErstellen} disabled={speichert || rechnungBusy || positionen.length === 0}
                  title={positionen.length === 0 ? 'Erst Leistungen/Material erfassen' : ''}
                  style={{ ...styles.rechnungBtn, opacity: (speichert || rechnungBusy || positionen.length === 0) ? 0.5 : 1, cursor: positionen.length === 0 ? 'not-allowed' : 'pointer' }}>
                  {rechnungBusy ? 'Erstellt …' : (auftraege.find((x) => x.id === form.id)?.rechnung_id ? '🧾 Rechnung öffnen' : '🧾 Rechnung erstellen')}
                </button>
              )}
              <button onClick={() => setModalAuf(false)} disabled={speichert} style={styles.ghostBtn}>{form.id ? 'Schließen' : 'Abbrechen'}</button>
              <button onClick={speichern} disabled={speichert} style={{ ...styles.primaerBtn, opacity: speichert ? 0.6 : 1 }}>
                {speichert ? 'Speichert …' : (form.id ? 'Kopfdaten speichern' : 'Anlegen')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Feld({ label, children, voll }: { label: string; children: React.ReactNode; voll?: boolean }) {
  return (
    <div style={{ gridColumn: voll ? '1 / -1' : 'auto' }}>
      <label style={styles.lbl}>{label}</label>
      {children}
    </div>
  );
}
function SummeKarte({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={styles.summeBox}>
      <div style={styles.summeLabel}>{label}</div>
      <div style={{ ...styles.summeValue, color: accent || C.text }}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 14, maxWidth: 680, lineHeight: 1.5 },

  primaerBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtn: { background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', marginLeft: 6 },

  // KVA-Freigabe-Buttons (Block 1.1)
  kvaBtn: { background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  freigebenBtn: { background: 'rgba(76,175,125,0.14)', color: C.green, border: `1px solid rgba(76,175,125,0.35)`, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  ablehnenBtn: { background: 'rgba(224,102,102,0.12)', color: C.danger, border: `1px solid rgba(224,102,102,0.32)`, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  rechnungBtn: { background: 'rgba(201,168,76,0.14)', color: C.gold, border: `1px solid rgba(201,168,76,0.4)`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  nachtragBox: { background: 'rgba(201,168,76,0.12)', border: `1px solid rgba(201,168,76,0.4)`, borderRadius: 10, padding: '11px 13px', fontSize: 13, color: C.text, marginBottom: 10, lineHeight: 1.5 },

  summenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  summeLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800 },

  board: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(190px, 1fr))', gap: 12, overflowX: 'auto', paddingBottom: 8 },
  spalte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, display: 'flex', flexDirection: 'column', minHeight: 200 },
  spalteKopf: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderTop: '3px solid', borderTopLeftRadius: 14, borderTopRightRadius: 14, fontSize: 14 },
  spalteBody: { padding: '4px 10px 12px', display: 'flex', flexDirection: 'column', gap: 8 },
  karte: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' },
  karteHaupt: { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: C.text, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  weiterBtn: { display: 'block', width: '100%', background: 'rgba(0,229,255,0.08)', color: C.cyan, border: 'none', borderTop: `1px solid ${C.border}`, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  hint: { color: C.textDim, fontSize: 14, padding: '14px 0' },
  err: { color: C.danger, fontSize: 14, background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  rechtHinweis: { marginTop: 16, fontSize: 12, color: C.textDim, lineHeight: 1.5, maxWidth: 760 },
  infoBox: { marginTop: 16, padding: '12px 14px', background: 'rgba(0,229,255,0.08)', border: `1px solid rgba(0,229,255,0.25)`, borderRadius: 10, fontSize: 13.5, color: C.text },

  sektion: { marginTop: 18, padding: 16, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12 },
  sektionTitel: { fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 12, color: C.text, textTransform: 'uppercase', letterSpacing: 1 },
  fzKarte: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' },

  dropdown: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 10, marginTop: 6, overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,0.4)' },
  dropdownItem: { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `1px solid rgba(143,163,190,0.08)`, color: C.text, padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 },

  posTable: { width: '100%', borderCollapse: 'collapse', minWidth: 560 },
  posTh: { textAlign: 'left', padding: '6px 8px', fontSize: 10.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  posTd: { padding: '5px 8px', fontSize: 13, borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'middle' },
  posInput: { width: '100%', boxSizing: 'border-box', background: C.navy2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 13, fontFamily: 'inherit' },
  externBadge: { marginLeft: 6, fontSize: 10, color: C.lila, border: `1px solid ${C.lila}`, borderRadius: 5, padding: '1px 5px' },
  xBtn: { background: 'transparent', color: C.textDim, border: 'none', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' },
  summeZeile: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 14 },

  lbl: { display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 640, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, margin: '0 0 18px', color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, alignItems: 'center' },
};
