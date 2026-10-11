'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseStandortCookie } from '@/lib/aktiverStandort';
import { konkreterStandort, standortOrFilter } from '@/lib/standortDaten';
import ProjekteAuge from "./ProjekteAuge";
import Leerzustand from "../_components/Leerzustand";
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from '../_components/EigeneFelder';
import type { EigenesFeld } from '@/lib/eigeneFelder';
import { NurVoll } from '../_components/Ansicht';
import { vorlageFuer, mitKunde, feinschliffName, type KundenEinstellung } from '@/lib/branchenVorlage';
import { projektAmpel, suchePasst, STATUS_FARBE } from '@/lib/projektVorlage';
import ProjektAnsicht from './ProjektAnsicht';

const MODUL = 'projekte';

// ============================================================
// ARGONAUT OS · MODUL PROJEKTE · P2 — Projekt-Liste + Anlegen
// ============================================================

const BRAND = {
  navy: '#0A1628',
  navy2: '#0F1F33',
  gold: '#C9A84C',
  cyan: '#00e5ff',
  green: '#4CAF7D',
  danger: '#E06666',
  warn: '#E0A24C',
  textDim: '#8FA3BE',
  border: 'rgba(143,163,190,0.18)',
};

const FARB_PRESETS = [
  { name: 'Cyan', wert: '#00e5ff' },
  { name: 'Gold', wert: '#C9A84C' },
  { name: 'Grün', wert: '#4CAF7D' },
  { name: 'Orange', wert: '#E0A24C' },
  { name: 'Rot', wert: '#E06666' },
  { name: 'Blau', wert: '#5A8DEE' },
];

const STATUS_META: Record<string, { label: string; farbe: string }> = {
  aktiv: { label: 'Aktiv', farbe: '#4CAF7D' },
  pausiert: { label: 'Pausiert', farbe: '#E0A24C' },
  abgeschlossen: { label: 'Abgeschlossen', farbe: '#5A8DEE' },
  abgebrochen: { label: 'Abgebrochen', farbe: '#E06666' },
};

const PRIO_META: Record<string, { label: string; farbe: string }> = {
  niedrig: { label: 'Niedrig', farbe: '#8FA3BE' },
  normal: { label: 'Normal', farbe: '#8FA3BE' },
  hoch: { label: 'Hoch', farbe: '#E0A24C' },
  dringend: { label: 'Dringend', farbe: '#E06666' },
};

function dStr(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; }
}

// Health-Ampel eines Projekts — Paket 310: Logik in lib/projektVorlage.ts,
// Schwellen aus der Branchen-Vorlage bzw. den Einstellungen des Betriebs.
function projektHealth(projekt: any, projektAufgaben: any[], heute: string, warnTage: number, warnProzent: number, statusLabel: (k: string) => string): { key: string; label: string; farbe: string } {
  const a = projektAmpel(projekt, projektAufgaben, heute, warnTage, warnProzent);
  if (a === 'neutral') return { key: 'neutral', label: statusLabel(projekt.status), farbe: projekt.status === 'abgebrochen' ? '#8FA3BE' : '#5A8DEE' };
  if (a === 'rot') return { key: 'rot', label: 'Kritisch', farbe: '#E06666' };
  if (a === 'gelb') return { key: 'gelb', label: projekt.status === 'pausiert' ? statusLabel('pausiert') : 'Achtung', farbe: '#E0A24C' };
  return { key: 'gruen', label: 'Im Plan', farbe: '#4CAF7D' };
}

function leeresProjekt(): any {
  return {
    id: null,
    name: '',
    beschreibung: '',
    status: 'aktiv',
    prioritaet: 'normal',
    start_datum: '',
    end_datum: '',
    budget: '',
    verantwortlich: '',
    farbe: '#00e5ff',
  };
}

type Projekt = any;
type Aufgabe = any;

export default function ProjektePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('alle');
  // Paket 310 (BV2a): Branchen-Vorlage — Wörter, Status-Namen, Kartenfelder, Warnschwellen, Suchen
  const [branche, setBranche] = useState('');
  const [einstellung, setEinstellung] = useState<KundenEinstellung | null>(null);
  const [betrieb, setBetrieb] = useState('');
  const [istChef, setIstChef] = useState(false);
  const [suche, setSuche] = useState<string | null>(null);
  const [zeigeAnsicht, setZeigeAnsicht] = useState(false);
  const [zeigeArchiv, setZeigeArchiv] = useState(false);

  const [modal, setModal] = useState<any | null>(null);
  const [speichern, setSpeichern] = useState(false);

  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nmExtra, setNmExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});

  // Vorlagen
  const [vorlagen, setVorlagen] = useState<any[]>([]);
  const [vorlagenModal, setVorlagenModal] = useState(false);
  const [ausVorlage, setAusVorlage] = useState<any | null>(null); // {vorlage, name}
  const [erstellen, setErstellen] = useState(false);

  // KI-Projekt-Setup
  const [kiModal, setKiModal] = useState(false);
  const [kiBeschreibung, setKiBeschreibung] = useState('');
  const [kiLaeuft, setKiLaeuft] = useState(false);
  const [kiFehler, setKiFehler] = useState('');
  const [kiVorschlag, setKiVorschlag] = useState<any | null>(null); // {name, beschreibung, prioritaet, aufgaben[]}
  const [kiErstellen, setKiErstellen] = useState(false);

  const ladeDaten = useCallback(async () => {
    setLaden(true);
    setFehler('');
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setOwnerId(uid);
      // Paket 310: Betrieb (Chef) bestimmen, Branche und Ansicht-Einstellungen laden (fail-open)
      let chefId = uid;
      try { const { data: c } = await supabase.rpc('mein_chef_id'); if (typeof c === 'string' && c) chefId = c; } catch { /* Chef selbst */ }
      setBetrieb(chefId); setIstChef(chefId === uid);
      try {
        const [pr, me] = await Promise.all([
          supabase.from('profiles').select('branche').eq('id', chefId).maybeSingle(),
          supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', chefId).eq('modul', MODUL).maybeSingle(),
        ]);
        setBranche(String((pr.data as { branche?: string | null } | null)?.branche ?? ''));
        setEinstellung(((me.data as { einstellung?: KundenEinstellung } | null)?.einstellung) ?? null);
      } catch { /* ohne Vorlage-Einstellung: Grund-Vorlage */ }

      // Filial-Zuschnitt (fail-open): aktiver Standort zeigt seine + Standort-lose Projekte.
      const sid = konkreterStandort(leseStandortCookie());
      let pq = supabase.from('projekte').select('*');
      if (sid) pq = pq.or(standortOrFilter(sid));
      const [projRes, aufgRes, vorlRes, vAufgRes] = await Promise.all([
        pq.order('erstellt_am', { ascending: false }),
        supabase.from('aufgaben').select('id,projekt_id,erledigt,status,faellig_am'),
        supabase.from('projekt_vorlagen').select('*')
          .order('erstellt_am', { ascending: false }),
        supabase.from('vorlagen_aufgaben').select('id,vorlage_id')
      ]);
      const projRows = projRes.data || [];
      setProjekte(projRows);
      setAufgaben(aufgRes.data || []);
      setFelder(await ladeFelder(MODUL));
      setWerteMap(await ladeWerte(MODUL, projRows.map((r: any) => r.id)));
      // Vorlagen mit Aufgaben-Anzahl anreichern
      const zaehl: Record<string, number> = {};
      (vAufgRes.data || []).forEach((r: any) => { zaehl[r.vorlage_id] = (zaehl[r.vorlage_id] || 0) + 1; });
      setVorlagen((vorlRes.data || []).map((v: any) => ({ ...v, anzahlAufgaben: zaehl[v.id] || 0 })));
    } catch (e: any) {
      setFehler(e?.message || 'Fehler beim Laden.');
    } finally {
      setLaden(false);
    }
  }, [supabase]);

  useEffect(() => { void ladeDaten(); }, [ladeDaten]);

  // Fortschritt eines Projekts aus erledigten Aufgaben
  function fortschritt(projektId: string): { erledigt: number; gesamt: number; pct: number } {
    const eigene = aufgaben.filter((a) => a.projekt_id === projektId);
    const gesamt = eigene.length;
    const erledigt = eigene.filter((a) => a.erledigt || a.status === 'fertig').length;
    const pct = gesamt > 0 ? Math.round((erledigt / gesamt) * 100) : 0;
    return { erledigt, gesamt, pct };
  }

  const vorlage = useMemo(() => {
    const v = vorlageFuer(MODUL, branche);
    return v ? mitKunde(v, einstellung) : null;
  }, [branche, einstellung]);
  const fein = useMemo(() => feinschliffName(MODUL, branche), [branche]);
  const heuteTag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const warnTage = vorlage?.warnTage ?? 14;
  const warnProzent = vorlage?.warnProzent ?? 70;
  const statusMeta = (k: string): { label: string; farbe: string } => {
    const v = vorlage?.status.find((x) => x.key === k);
    if (v) return { label: v.label, farbe: STATUS_FARBE[v.farbe] || STATUS_META.aktiv.farbe };
    return STATUS_META[k] || STATUS_META.aktiv;
  };
  const sichtbar = (k: string): boolean => vorlage?.spalten.find((x) => x.key === k)?.sichtbar ?? true;
  const einheit = vorlage?.einheit || 'Projekt';
  const titel = vorlage?.titel || 'Projekte';
  const ampelVon = (p: any) => projektHealth(p, aufgaben.filter((a) => a.projekt_id === p.id), heuteTag, warnTage, warnProzent, (k) => statusMeta(k).label);

  function oeffneNeu() { setNmExtra({}); setModal(leeresProjekt()); }  function oeffneBearbeiten(p: Projekt) {
    setNmExtra(werteMap[p.id] ? { ...werteMap[p.id] } : {});
    setModal({
      id: p.id,
      name: p.name || '',
      beschreibung: p.beschreibung || '',
      status: p.status || 'aktiv',
      prioritaet: p.prioritaet || 'normal',
      start_datum: p.start_datum || '',
      end_datum: p.end_datum || '',
      budget: p.budget ?? '',
      verantwortlich: p.verantwortlich || '',
      farbe: p.farbe || '#00e5ff',
    });
  }

  async function speichereProjekt() {
    if (!modal) return;
    if (!modal.name.trim()) { alert('Bitte einen Projektnamen eingeben.'); return; }
    setSpeichern(true);
    try {
      const datensatz = {
        owner_user_id: ownerId,
        name: modal.name.trim(),
        beschreibung: modal.beschreibung || null,
        status: modal.status,
        prioritaet: modal.prioritaet,
        start_datum: modal.start_datum || null,
        end_datum: modal.end_datum || null,
        budget: modal.budget === '' ? null : Number(modal.budget),
        verantwortlich: modal.verantwortlich || null,
        farbe: modal.farbe || '#00e5ff',
      };
      let datensatzId = modal.id as string | null;
      if (modal.id) {
        const res = await supabase.from('projekte').update(datensatz).eq('id', modal.id);
        if (res.error) throw res.error;
      } else {
        const res = await supabase.from('projekte').insert({ ...datensatz, standort_id: konkreterStandort(leseStandortCookie()) }).select('id').single();
        if (res.error) throw res.error;
        datensatzId = (res.data as { id: string }).id;
      }
      if (datensatzId) { try { await speichereWerte(MODUL, datensatzId, ownerId, nmExtra); } catch { /* eigene Felder optional */ } }
      setModal(null);
      setNmExtra({});
      await ladeDaten();
    } catch (e: any) {
      alert('Speichern fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setSpeichern(false);
    }
  }

  async function archivWechsel(p: Projekt) {
    const neu = !p.archiviert;
    if (neu && !confirm('Projekt archivieren? Es verschwindet aus der aktiven Liste (nicht gelöscht).')) return;
    try {
      const res = await supabase.from('projekte').update({ archiviert: neu }).eq('id', p.id);
      if (res.error) throw res.error;
      await ladeDaten();
    } catch (e: any) {
      alert('Aktion fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  }

  // --- Aus Vorlage ein neues Projekt erstellen ---
  function oeffneAusVorlage(v: any) {
    setVorlagenModal(false);
    setAusVorlage({ vorlage: v, name: (v.name || '').replace(/\s*\(Vorlage\)\s*$/i, '') });
  }

  async function erstelleAusVorlage() {
    if (!ausVorlage) return;
    const v = ausVorlage.vorlage;
    if (!ausVorlage.name.trim()) { alert('Bitte einen Projektnamen eingeben.'); return; }
    setErstellen(true);
    try {
      // 1) Projekt anlegen
      const pRes = await supabase.from('projekte').insert({
        owner_user_id: ownerId,
        standort_id: konkreterStandort(leseStandortCookie()),
        name: ausVorlage.name.trim(),
        beschreibung: v.beschreibung || null,
        status: 'aktiv',
        prioritaet: v.prioritaet || 'normal',
        farbe: v.farbe || '#00e5ff',
      }).select('id').single();
      if (pRes.error) throw pRes.error;
      const projektId = pRes.data.id;

      // 2) Standard-Aufgaben der Vorlage laden und uebernehmen
      const { data: vAufg } = await supabase.from('vorlagen_aufgaben')
        .select('*').eq('vorlage_id', v.id).order('sortierung', { ascending: true });
      if (vAufg && vAufg.length > 0) {
        const rows = vAufg.map((a: any, i: number) => ({
          owner_user_id: ownerId,
          projekt_id: projektId,
          titel: a.titel,
          beschreibung: a.beschreibung || null,
          status: a.status || 'todo',
          prioritaet: a.prioritaet || 'normal',
          sortierung: i,
          erledigt: a.status === 'fertig',
        }));
        const aRes = await supabase.from('aufgaben').insert(rows);
        if (aRes.error) throw aRes.error;
      }
      // 3) Direkt ins neue Projekt springen
      window.location.href = `/dashboard/projekte/${projektId}`;
    } catch (e: any) {
      alert('Erstellen fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
      setErstellen(false);
    }
  }

  async function loescheVorlage(v: any) {
    if (!confirm(`Vorlage „${v.name}" löschen? (Bereits erstellte Projekte bleiben bestehen.)`)) return;
    try {
      const res = await supabase.from('projekt_vorlagen').delete().eq('id', v.id);
      if (res.error) throw res.error;
      await ladeDaten();
    } catch (e: any) {
      alert('Löschen fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  }

  // --- KI-Projekt-Setup ---
  function oeffneKi() {
    setKiBeschreibung(''); setKiFehler(''); setKiVorschlag(null); setKiModal(true);
  }

  async function kiVorschlagErzeugen() {
    if (kiBeschreibung.trim().length < 3) { setKiFehler('Bitte beschreibe das Projekt etwas genauer.'); return; }
    setKiLaeuft(true); setKiFehler('');
    try {
      const res = await fetch('/api/projekt-ki-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beschreibung: kiBeschreibung.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setKiFehler(data?.error || 'KI-Anfrage fehlgeschlagen.'); setKiLaeuft(false); return; }
      setKiVorschlag({
        name: data.name || 'Neues Projekt',
        beschreibung: data.beschreibung || '',
        prioritaet: data.prioritaet || 'normal',
        aufgaben: Array.isArray(data.aufgaben) ? data.aufgaben : [],
      });
    } catch (e: any) {
      setKiFehler('Verbindungsfehler: ' + (e?.message || 'Unbekannt'));
    } finally {
      setKiLaeuft(false);
    }
  }

  function kiAufgabeEntfernen(index: number) {
    if (!kiVorschlag) return;
    setKiVorschlag({ ...kiVorschlag, aufgaben: kiVorschlag.aufgaben.filter((_: any, i: number) => i !== index) });
  }
  function kiAufgabeTitel(index: number, titel: string) {
    if (!kiVorschlag) return;
    const neu = kiVorschlag.aufgaben.map((a: any, i: number) => (i === index ? { ...a, titel } : a));
    setKiVorschlag({ ...kiVorschlag, aufgaben: neu });
  }

  async function kiProjektErstellen() {
    if (!kiVorschlag) return;
    if (!kiVorschlag.name.trim()) { setKiFehler('Bitte einen Projektnamen angeben.'); return; }
    setKiErstellen(true); setKiFehler('');
    try {
      const pRes = await supabase.from('projekte').insert({
        owner_user_id: ownerId,
        standort_id: konkreterStandort(leseStandortCookie()),
        name: kiVorschlag.name.trim(),
        beschreibung: kiVorschlag.beschreibung || null,
        status: 'aktiv',
        prioritaet: kiVorschlag.prioritaet || 'normal',
        farbe: '#00e5ff',
      }).select('id').single();
      if (pRes.error) throw pRes.error;
      const projektId = pRes.data.id;

      const aufgabenListe = kiVorschlag.aufgaben.filter((a: any) => a.titel && a.titel.trim());
      if (aufgabenListe.length > 0) {
        const rows = aufgabenListe.map((a: any, i: number) => ({
          owner_user_id: ownerId,
          projekt_id: projektId,
          titel: a.titel.trim(),
          status: a.status || 'todo',
          prioritaet: a.prioritaet || 'normal',
          sortierung: i,
          erledigt: a.status === 'fertig',
        }));
        const aRes = await supabase.from('aufgaben').insert(rows);
        if (aRes.error) throw aRes.error;
      }
      window.location.href = `/dashboard/projekte/${projektId}`;
    } catch (e: any) {
      setKiFehler('Erstellen fehlgeschlagen: ' + (e?.message || 'Unbekannt'));
      setKiErstellen(false);
    }
  }

  // --- Styles ---
  const card: React.CSSProperties = {
    background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 18,
  };
  const btn: React.CSSProperties = {
    background: BRAND.cyan, color: BRAND.navy, border: 'none', borderRadius: 10,
    padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
  };
  const btnGhost: React.CSSProperties = {
    background: 'transparent', color: BRAND.textDim, border: `1px solid ${BRAND.border}`,
    borderRadius: 10, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
  };
  const inputStil: React.CSSProperties = {
    width: '100%', background: BRAND.navy, color: '#fff', border: `1px solid ${BRAND.border}`,
    borderRadius: 8, padding: '9px 10px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
  };
  const labelStil: React.CSSProperties = {
    display: 'block', color: BRAND.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)', fontWeight: 600, marginBottom: 5, fontFamily: 'DM Sans, sans-serif',
  };

  const gefiltert = projekte.filter((p) => {
    if (p.archiviert !== zeigeArchiv) return false;
    if (filterStatus !== 'alle' && p.status !== filterStatus) return false;
    if (suche) {
      const r = vorlage?.suchen.find((x) => x.key === suche)?.regel ?? '';
      if (!suchePasst(r, p, projektAmpel(p, aufgaben.filter((a) => a.projekt_id === p.id), heuteTag, warnTage, warnProzent), heuteTag)) return false;
    }
    return true;
  });

  return (
    <div style={{ background: BRAND.navy, minHeight: '100vh', color: '#fff', padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>
      {/* Kopf */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
        <div>
          <p style={{ margin: 0, fontSize: 'clamp(13px, 1.13vw, 18px)', color: BRAND.gold, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
            ARGONAUT OS · {titel}{fein ? ` · Vorlage ${fein}` : ''}
          </p>
          <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(28px, 2.44vw, 39px)', fontWeight: 800 }}>
            {titel}
          </h1>
          <p style={{ margin: '4px 0 0', color: BRAND.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
            Alle {titel}, Status und Fortschritt an einem Ort.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={{ ...btn, background: BRAND.cyan }} onClick={oeffneKi}>✨ KI-Projekt</button>
          {vorlagen.length > 0 && (
            <button style={btnGhost} onClick={() => setVorlagenModal(true)}>📋 Aus Vorlage erstellen</button>
          )}
          <button style={btn} onClick={oeffneNeu}>+ {einheit} anlegen</button>
        </div>
      </div>

      {/* KI-Auge: was heißt die Projekt-Lage gerade für mich? */}
      <ProjekteAuge />

      {/* Mini-Übersicht: Portfolio-Health */}
      {(() => {
        const aktive = projekte.filter((p) => !p.archiviert && p.status !== 'abgeschlossen' && p.status !== 'abgebrochen');
        if (aktive.length === 0) return null;
        let gruen = 0, gelb = 0, rot = 0;
        aktive.forEach((p) => {
          const h = ampelVon(p);
          if (h.key === 'rot') rot++; else if (h.key === 'gelb') gelb++; else if (h.key === 'gruen') gruen++;
        });
        const kachel = (zahl: number, label: string, farbe: string) => (
          <div style={{ flex: 1, minWidth: 120, background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderLeft: `3px solid ${farbe}`, borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(26px, 2.25vw, 36px)', fontWeight: 800, color: farbe }}>{zahl}</div>
            <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: BRAND.textDim }}>{label}</div>
          </div>
        );
        return (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            {kachel(aktive.length, `Aktive ${titel}`, BRAND.cyan)}
            {kachel(gruen, '🟢 Im Plan', '#4CAF7D')}
            {kachel(gelb, '🟡 Achtung', '#E0A24C')}
            {kachel(rot, '🔴 Kritisch', '#E06666')}
          </div>
        );
      })()}

      {/* Filterleiste */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
        {['alle', 'aktiv', 'pausiert', 'abgeschlossen', 'abgebrochen'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            style={{
              ...btnGhost, padding: '6px 14px',
              color: filterStatus === s ? BRAND.navy : BRAND.textDim,
              background: filterStatus === s ? BRAND.gold : 'transparent',
              borderColor: filterStatus === s ? BRAND.gold : BRAND.border,
              fontWeight: 700,
            }}
          >
            {s === 'alle' ? 'Alle' : statusMeta(s).label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setZeigeArchiv(!zeigeArchiv)}
          style={{ ...btnGhost, color: zeigeArchiv ? BRAND.gold : BRAND.textDim }}
        >
          {zeigeArchiv ? `← Aktive ${titel}` : 'Archiv ansehen'}
        </button>
        <button onClick={() => setZeigeAnsicht(!zeigeAnsicht)} style={{ ...btnGhost, color: zeigeAnsicht ? BRAND.gold : BRAND.textDim }}>
          ⚙️ Ansicht
        </button>
      </div>

      {/* Paket 310: gespeicherte Suchen der Branchen-Vorlage */}
      {vorlage && vorlage.suchen.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
          <span style={{ color: BRAND.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)' }}>🔎 Schnellsuche:</span>
          {vorlage.suchen.map((x) => (
            <button key={x.key} onClick={() => setSuche(suche === x.key ? null : x.key)}
              style={{ ...btnGhost, padding: '5px 12px', color: suche === x.key ? BRAND.navy : BRAND.textDim, background: suche === x.key ? BRAND.cyan : 'transparent', borderColor: suche === x.key ? BRAND.cyan : BRAND.border, fontWeight: 600 }}>
              {x.name}
            </button>
          ))}
          {suche && <button onClick={() => setSuche(null)} style={{ ...btnGhost, padding: '5px 12px', color: BRAND.textDim }}>✕ Suche aufheben</button>}
        </div>
      )}

      {zeigeAnsicht && vorlage && betrieb && (
        <ProjektAnsicht vorlage={vorlage} einstellung={einstellung} betrieb={betrieb} istChef={istChef} fein={fein}
          onGespeichert={(e) => setEinstellung(e)} onSchliessen={() => setZeigeAnsicht(false)} />
      )}

      {ownerId && (
        <div style={{ marginBottom: 18 }}>
          <EigeneFelderManager modul={MODUL} ownerId={ownerId} onChange={ladeDaten} />
        </div>
      )}

      {fehler && (
        <div style={{ ...card, borderColor: BRAND.danger, color: BRAND.danger, marginBottom: 16 }}>{fehler}</div>
      )}

      {laden ? (
        <div style={{ ...card, color: BRAND.textDim }}>Lade Projekte…</div>
      ) : gefiltert.length === 0 ? (
        zeigeArchiv ? (
          <div style={{ ...card, color: BRAND.textDim, textAlign: 'center', padding: 40 }}>Keine archivierten {titel}.</div>
        ) : (suche || filterStatus !== 'alle') && projekte.some((p) => !p.archiviert) ? (
          <div style={{ ...card, color: BRAND.textDim, textAlign: 'center', padding: 40 }}>Keine Treffer für diese Auswahl.</div>
        ) : (
          <Leerzustand
            icon="📁"
            titel={`Noch keine ${titel}`}
            text="Planen Sie Ihre Vorhaben als Projekte — mit Aufgaben, Terminen und Verantwortlichen an einem Ort."
            schritte={["Projekt mit Enddatum anlegen", "Aufgaben und Verantwortliche zuweisen", "Fortschritt und Fristen im Blick behalten"]}
          />
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {gefiltert.map((p) => {
            const fp = fortschritt(p.id);
            const sm = statusMeta(p.status);
            const pm = PRIO_META[p.prioritaet] || PRIO_META.normal;
            const health = ampelVon(p);
            return (
              <div key={p.id} style={{ ...card, borderLeft: `4px solid ${p.farbe || BRAND.cyan}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <a href={`/dashboard/projekte/${p.id}`} style={{ color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 'clamp(17px, 1.5vw, 24px)', fontFamily: 'var(--font-dm-sans), sans-serif' }}>
                    {p.name}
                  </a>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <span title={`Status: ${health.label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'clamp(11px, 0.94vw, 15px)', fontWeight: 700, color: health.farbe, background: health.farbe + '22', border: `1px solid ${health.farbe}55`, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: health.farbe, display: 'inline-block' }} />
                      {health.label}
                    </span>
                    <span style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', fontWeight: 700, color: sm.farbe, background: sm.farbe + '22', border: `1px solid ${sm.farbe}55`, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                      {sm.label}
                    </span>
                  </div>
                </div>

                {p.beschreibung && sichtbar('beschreibung') && (
                  <p style={{ margin: 0, color: BRAND.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.beschreibung}
                  </p>
                )}

                {/* Fortschritt */}
                {sichtbar('fortschritt') && <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'clamp(12px, 1.06vw, 17px)', color: BRAND.textDim, marginBottom: 4 }}>
                    <span>Fortschritt</span>
                    <span>{fp.erledigt}/{fp.gesamt} Aufgaben · {fp.pct}%</span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 999, height: 7, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${fp.pct}%`, background: fp.pct === 100 ? BRAND.green : BRAND.cyan, borderRadius: 999 }} />
                  </div>
                </div>}

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 'clamp(12px, 1.06vw, 17px)', color: BRAND.textDim }}>
                  {sichtbar('zeitraum') && <span>📅 {dStr(p.start_datum)} – {dStr(p.end_datum)}</span>}
                  {sichtbar('prioritaet') && <span style={{ color: pm.farbe }}>● {pm.label}</span>}
                  {p.verantwortlich && sichtbar('verantwortlich') && <span>👤 {p.verantwortlich}</span>}
                  {p.budget != null && sichtbar('budget') && <span>💶 {Number(p.budget).toLocaleString('de-DE')} €</span>}
                </div>

                {sichtbar('eigene') && <EigeneFelderAnzeige felder={felder} werte={werteMap[p.id]} />}

                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <a href={`/dashboard/projekte/${p.id}`} style={{ ...btn, padding: '7px 14px', fontSize: 'clamp(13px, 1.13vw, 18px)', textDecoration: 'none', display: 'inline-block' }}>
                    Öffnen
                  </a>
                  <button style={{ ...btnGhost, padding: '7px 12px', fontSize: 'clamp(13px, 1.13vw, 18px)' }} onClick={() => oeffneBearbeiten(p)}>Bearbeiten</button>
                  <button style={{ ...btnGhost, padding: '7px 12px', fontSize: 'clamp(13px, 1.13vw, 18px)' }} onClick={() => archivWechsel(p)}>
                    {p.archiviert ? 'Wiederherstellen' : 'Archivieren'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Projekt-Modal ===== */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
          onClick={() => setModal(null)}>
          <div style={{ ...card, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(20px, 1.75vw, 28px)' }}>
              {modal.id ? `${einheit} bearbeiten` : `${einheit} anlegen`}
            </h2>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStil}>Projektname *</label>
              <input style={inputStil} value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} placeholder="z.B. Gartenanlage Kunde Müller" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStil}>Beschreibung</label>
              <textarea style={{ ...inputStil, minHeight: 64, resize: 'vertical' }} value={modal.beschreibung} onChange={(e) => setModal({ ...modal, beschreibung: e.target.value })} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Status</label>
                <select style={inputStil} value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value })}>
                  {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}
                </select>
              </div>
              <NurVoll>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Priorität</label>
                <select style={inputStil} value={modal.prioritaet} onChange={(e) => setModal({ ...modal, prioritaet: e.target.value })}>
                  {Object.keys(PRIO_META).map((s) => <option key={s} value={s}>{PRIO_META[s].label}</option>)}
                </select>
              </div>
              </NurVoll>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Start</label>
                <input type="date" style={inputStil} value={modal.start_datum} onChange={(e) => setModal({ ...modal, start_datum: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Ende</label>
                <input type="date" style={inputStil} value={modal.end_datum} onChange={(e) => setModal({ ...modal, end_datum: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Verantwortlich</label>
                <input style={inputStil} value={modal.verantwortlich} onChange={(e) => setModal({ ...modal, verantwortlich: e.target.value })} placeholder="Name" />
              </div>
              <NurVoll>
              <div style={{ width: 140 }}>
                <label style={labelStil}>Budget (€)</label>
                <input type="number" min={0} style={inputStil} value={modal.budget} onChange={(e) => setModal({ ...modal, budget: e.target.value })} />
              </div>
              </NurVoll>
            </div>

            <NurVoll>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStil}>Farbe</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {FARB_PRESETS.map((f) => (
                  <button key={f.wert} onClick={() => setModal({ ...modal, farbe: f.wert })} title={f.name}
                    style={{ width: 30, height: 30, borderRadius: '50%', background: f.wert, border: modal.farbe === f.wert ? '3px solid #fff' : '2px solid transparent', cursor: 'pointer' }} />
                ))}
              </div>
            </div>

            {felder.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
                <EigeneFelderInputs felder={felder} werte={nmExtra} setWert={(fid, w) => setNmExtra((s) => ({ ...s, [fid]: w }))} inpStyle={inputStil} labStyle={labelStil} />
              </div>
            )}
            </NurVoll>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={btnGhost} onClick={() => setModal(null)} disabled={speichern}>Abbrechen</button>
              <button style={btn} onClick={speichereProjekt} disabled={speichern}>{speichern ? 'Speichert…' : 'Speichern'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Vorlagen-Liste ===== */}
      {vorlagenModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
          onClick={() => setVorlagenModal(false)}>
          <div style={{ ...card, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(20px, 1.75vw, 28px)' }}>Aus Vorlage erstellen</h2>
            <p style={{ margin: '0 0 16px', color: BRAND.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
              Wähle eine Vorlage — daraus entsteht ein neues Projekt mit allen Standard-Aufgaben.
            </p>
            {vorlagen.length === 0 ? (
              <div style={{ color: BRAND.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', padding: 20, textAlign: 'center' }}>
                Noch keine Vorlagen. Öffne ein Projekt → Reiter „Einstellungen" → „Als Vorlage speichern".
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {vorlagen.map((v) => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px', background: BRAND.navy, border: `1px solid ${BRAND.border}`, borderLeft: `3px solid ${v.farbe}`, borderRadius: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 'clamp(15px, 1.31vw, 21px)' }}>{v.name}</div>
                      <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: BRAND.textDim, marginTop: 2 }}>
                        {v.anzahlAufgaben} Standard-Aufgabe{v.anzahlAufgaben === 1 ? '' : 'n'}
                        {v.beschreibung ? ` · ${v.beschreibung.slice(0, 60)}${v.beschreibung.length > 60 ? '…' : ''}` : ''}
                      </div>
                    </div>
                    <button style={btn} onClick={() => oeffneAusVorlage(v)}>Verwenden</button>
                    <button style={{ ...btnGhost, padding: '8px 10px', color: BRAND.danger, borderColor: BRAND.danger }} onClick={() => loescheVorlage(v)} title="Vorlage löschen">🗑</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={btnGhost} onClick={() => setVorlagenModal(false)}>Schließen</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Aus Vorlage: Name wählen ===== */}
      {ausVorlage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60 }}
          onClick={() => !erstellen && setAusVorlage(null)}>
          <div style={{ ...card, width: 440, maxWidth: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(20px, 1.75vw, 28px)' }}>Neues Projekt aus Vorlage</h2>
            <p style={{ margin: '0 0 16px', color: BRAND.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
              Vorlage „{ausVorlage.vorlage.name}" → {ausVorlage.vorlage.anzahlAufgaben} Aufgabe{ausVorlage.vorlage.anzahlAufgaben === 1 ? '' : 'n'} werden übernommen.
            </p>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStil}>Projektname *</label>
              <input style={inputStil} value={ausVorlage.name} autoFocus
                onChange={(e) => setAusVorlage({ ...ausVorlage, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); erstelleAusVorlage(); } }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={btnGhost} onClick={() => setAusVorlage(null)} disabled={erstellen}>Abbrechen</button>
              <button style={btn} onClick={erstelleAusVorlage} disabled={erstellen}>{erstellen ? 'Erstellt…' : 'Projekt erstellen'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== KI-Projekt-Setup ===== */}
      {kiModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
          onClick={() => !kiLaeuft && !kiErstellen && setKiModal(false)}>
          <div style={{ ...card, width: 600, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(20px, 1.75vw, 28px)' }}>✨ KI-Projekt-Setup</h2>
            <p style={{ margin: '0 0 16px', color: BRAND.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
              Beschreiben Sie kurz, worum es geht — die KI erstellt Ihnen einen Projektnamen und eine sinnvolle Aufgabenliste als Vorschlag. Sie prüfen alles, bevor das Projekt angelegt wird.
            </p>

            {!kiVorschlag ? (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStil}>Projektbeschreibung</label>
                  <textarea
                    style={{ ...inputStil, minHeight: 100, resize: 'vertical' }}
                    placeholder="z.B. Garten neu anlegen für Kunde Müller: alte Fläche roden, Boden vorbereiten, Rasen und Beete anlegen, Bewässerung installieren. Etwa 3 Wochen."
                    value={kiBeschreibung}
                    onChange={(e) => setKiBeschreibung(e.target.value)}
                    autoFocus
                  />
                </div>
                {kiFehler && <div style={{ ...card, borderColor: BRAND.danger, color: BRAND.danger, fontSize: 'clamp(13px, 1.13vw, 18px)', marginBottom: 14 }}>{kiFehler}</div>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button style={btnGhost} onClick={() => setKiModal(false)} disabled={kiLaeuft}>Abbrechen</button>
                  <button style={{ ...btn, background: BRAND.cyan }} onClick={kiVorschlagErzeugen} disabled={kiLaeuft}>
                    {kiLaeuft ? 'KI denkt nach…' : '✨ Vorschlag erzeugen'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStil}>Projektname</label>
                  <input style={inputStil} value={kiVorschlag.name} onChange={(e) => setKiVorschlag({ ...kiVorschlag, name: e.target.value })} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStil}>Beschreibung</label>
                  <textarea style={{ ...inputStil, minHeight: 48, resize: 'vertical' }} value={kiVorschlag.beschreibung} onChange={(e) => setKiVorschlag({ ...kiVorschlag, beschreibung: e.target.value })} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStil}>Priorität</label>
                  <select style={{ ...inputStil, width: 'auto' }} value={kiVorschlag.prioritaet} onChange={(e) => setKiVorschlag({ ...kiVorschlag, prioritaet: e.target.value })}>
                    {Object.keys(PRIO_META).map((s) => <option key={s} value={s}>{PRIO_META[s].label}</option>)}
                  </select>
                </div>

                <label style={labelStil}>Vorgeschlagene Aufgaben ({kiVorschlag.aufgaben.length}) — Sie können anpassen oder löschen</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: 280, overflowY: 'auto' }}>
                  {kiVorschlag.aufgaben.map((a: any, i: number) => {
                    const pm = PRIO_META[a.prioritaet] || PRIO_META.normal;
                    const sm = STATUS_META[a.status] || STATUS_META.aktiv;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: BRAND.navy, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                        <input style={{ ...inputStil, flex: 1, padding: '6px 8px' }} value={a.titel} onChange={(e) => kiAufgabeTitel(i, e.target.value)} />
                        <span style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', color: pm.farbe, fontWeight: 700, whiteSpace: 'nowrap' }}>● {pm.label}</span>
                        <span style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', color: BRAND.textDim, whiteSpace: 'nowrap' }}>{sm.label}</span>
                        <button onClick={() => kiAufgabeEntfernen(i)} style={{ background: 'transparent', border: 'none', color: BRAND.textDim, cursor: 'pointer', fontSize: 'clamp(16px, 1.38vw, 22px)', padding: '0 4px' }} title="Entfernen">×</button>
                      </div>
                    );
                  })}
                  {kiVorschlag.aufgaben.length === 0 && <div style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: BRAND.textDim }}>Keine Aufgaben — Sie können sie später im Projekt anlegen.</div>}
                </div>

                {kiFehler && <div style={{ ...card, borderColor: BRAND.danger, color: BRAND.danger, fontSize: 'clamp(13px, 1.13vw, 18px)', marginBottom: 14 }}>{kiFehler}</div>}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                  <button style={btnGhost} onClick={() => setKiVorschlag(null)} disabled={kiErstellen}>← Neu beschreiben</button>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button style={btnGhost} onClick={() => setKiModal(false)} disabled={kiErstellen}>Abbrechen</button>
                    <button style={btn} onClick={kiProjektErstellen} disabled={kiErstellen}>{kiErstellen ? 'Erstellt…' : 'Projekt erstellen'}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
