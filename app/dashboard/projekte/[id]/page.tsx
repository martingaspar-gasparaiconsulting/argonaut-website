'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · MODUL PROJEKTE · P3 — Projekt-Detailseite
// Kopf + Reiter-Geruest (Aufgaben/Kalender folgen additiv)
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

const REITER = [
  { key: 'uebersicht', label: 'Übersicht' },
  { key: 'aufgaben', label: 'Aufgaben' },
  { key: 'kalender', label: 'Kalender' },
  { key: 'einstellungen', label: 'Einstellungen' },
];

const SPALTEN = [
  { key: 'todo', label: 'To-Do', farbe: '#8FA3BE' },
  { key: 'in_arbeit', label: 'In Arbeit', farbe: '#00e5ff' },
  { key: 'review', label: 'Review', farbe: '#E0A24C' },
  { key: 'fertig', label: 'Fertig', farbe: '#4CAF7D' },
];

const PRIO_RANG: Record<string, number> = { dringend: 0, hoch: 1, normal: 2, niedrig: 3 };
const STATUS_RANG: Record<string, number> = { todo: 0, in_arbeit: 1, review: 2, fertig: 3 };
function spalteLabel(key: string): string { return SPALTEN.find((s) => s.key === key)?.label || key; }

function dStr(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; }
}

type Projekt = any;
type Aufgabe = any;

export default function ProjektDetailPage() {
  const params = useParams();
  const projektId = String(params?.id || '');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState('');
  const [projekt, setProjekt] = useState<Projekt | null>(null);
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [beteiligte, setBeteiligte] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [reiter, setReiter] = useState('uebersicht');

  // Beteiligten-Verwaltung
  const [beteiligteModal, setBeteiligteModal] = useState(false);
  const [personModal, setPersonModal] = useState<any | null>(null);
  const [personSpeichern, setPersonSpeichern] = useState(false);
  // Team-Verwaltung
  const [teamModal, setTeamModal] = useState<any | null>(null);
  const [teamSpeichern, setTeamSpeichern] = useState(false);
  // Drag&Drop Zuweisung (Karte -> Person/Team)
  const [zuweisDrag, setZuweisDrag] = useState<string | null>(null);
  const [zuweisOver, setZuweisOver] = useState<string | null>(null);
  // Unteraufgaben + Kommentare (im Aufgaben-Dialog)
  const [unterAufgaben, setUnterAufgaben] = useState<any[]>([]);
  const [neueUnterAufgabe, setNeueUnterAufgabe] = useState('');
  const [kommentare, setKommentare] = useState<any[]>([]);
  const [neuerKommentar, setNeuerKommentar] = useState('');
  const [detailLaden, setDetailLaden] = useState(false);
  const [unterMap, setUnterMap] = useState<Record<string, { erl: number; ges: number }>>({});
  const [vorlageSpeichern, setVorlageSpeichern] = useState(false);
  const [berichtLaeuft, setBerichtLaeuft] = useState(false);
  // Kalender-Ansicht: angezeigter Monat (1. des Monats)
  const [kalMonat, setKalMonat] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  // Aufgaben-Modal + Drag&Drop
  const [aufgabeModal, setAufgabeModal] = useState<any | null>(null);
  const [speichern, setSpeichern] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverSpalte, setDragOverSpalte] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState('');
  // Aufgaben-Ansicht: Kanban oder Liste
  const [aufgabenAnsicht, setAufgabenAnsicht] = useState<'kanban' | 'liste'>('kanban');
  const [sortFeld, setSortFeld] = useState<'faellig' | 'prio' | 'status' | 'titel'>('faellig');

  const ladeDaten = useCallback(async () => {
    setLaden(true);
    setFehler('');
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setOwnerId(uid);

      const [projRes, aufgRes, betRes, teamRes] = await Promise.all([
        supabase.from('projekte').select('*').eq('id', projektId).eq('owner_user_id', uid).maybeSingle(),
        supabase.from('aufgaben').select('*').eq('projekt_id', projektId).eq('owner_user_id', uid)
          .is('parent_id', null)
          .order('sortierung', { ascending: true }).order('erstellt_am', { ascending: true }),
        supabase.from('projekt_beteiligte').select('*').eq('owner_user_id', uid).eq('aktiv', true)
          .order('name', { ascending: true }),
        supabase.from('projekt_teams').select('*').eq('owner_user_id', uid).eq('aktiv', true)
          .order('name', { ascending: true }),
      ]);
      if (!projRes.data) { setFehler('Projekt nicht gefunden.'); setLaden(false); return; }
      setProjekt(projRes.data);
      setAufgaben(aufgRes.data || []);
      setBeteiligte(betRes.data || []);
      setTeams(teamRes.data || []);

      // Unteraufgaben-Zaehlung je Hauptaufgabe (fuer Karten-Badge)
      const { data: subRows } = await supabase.from('aufgaben')
        .select('parent_id,erledigt').eq('projekt_id', projektId).eq('owner_user_id', uid)
        .not('parent_id', 'is', null);
      const map: Record<string, { erl: number; ges: number }> = {};
      (subRows || []).forEach((s: any) => {
        if (!s.parent_id) return;
        if (!map[s.parent_id]) map[s.parent_id] = { erl: 0, ges: 0 };
        map[s.parent_id].ges += 1;
        if (s.erledigt) map[s.parent_id].erl += 1;
      });
      setUnterMap(map);
    } catch (e: any) {
      setFehler(e?.message || 'Fehler beim Laden.');
    } finally {
      setLaden(false);
    }
  }, [supabase, projektId]);

  useEffect(() => { void ladeDaten(); }, [ladeDaten]);

  // --- Aufgaben: anlegen / bearbeiten / loeschen ---
  function leereAufgabe(status: string): any {
    return { id: null, titel: '', beschreibung: '', status, prioritaet: 'normal', faellig_am: '', zuweisung: '' };
  }
  function oeffneNeueAufgabe(status: string) {
    setUnterAufgaben([]); setKommentare([]); setNeueUnterAufgabe(''); setNeuerKommentar('');
    setAufgabeModal(leereAufgabe(status));
  }
  function oeffneAufgabe(a: Aufgabe) {
    const zuweisung = a.team_id ? `t:${a.team_id}` : (a.mitarbeiter_id ? `p:${a.mitarbeiter_id}` : '');
    setUnterAufgaben([]); setKommentare([]); setNeueUnterAufgabe(''); setNeuerKommentar('');
    setAufgabeModal({
      id: a.id, titel: a.titel || '', beschreibung: a.beschreibung || '',
      status: a.status || 'todo', prioritaet: a.prioritaet || 'normal', faellig_am: a.faellig_am || '',
      zuweisung,
    });
    if (a.id) void ladeAufgabenDetail(a.id);
  }

  async function ladeAufgabenDetail(aufgabeId: string) {
    setDetailLaden(true);
    try {
      const [uaRes, kRes] = await Promise.all([
        supabase.from('aufgaben').select('id,titel,erledigt,status,sortierung').eq('parent_id', aufgabeId)
          .order('sortierung', { ascending: true }).order('erstellt_am', { ascending: true }),
        supabase.from('aufgaben_kommentare').select('*').eq('aufgabe_id', aufgabeId)
          .order('erstellt_am', { ascending: true }),
      ]);
      setUnterAufgaben(uaRes.data || []);
      setKommentare(kRes.data || []);
    } catch { /* ignore */ } finally {
      setDetailLaden(false);
    }
  }

  async function unterAufgabeHinzufuegen() {
    if (!aufgabeModal?.id || !neueUnterAufgabe.trim()) return;
    try {
      const res = await supabase.from('aufgaben').insert({
        owner_user_id: ownerId, projekt_id: projektId, parent_id: aufgabeModal.id,
        titel: neueUnterAufgabe.trim(), status: 'todo', erledigt: false,
      });
      if (res.error) throw res.error;
      setNeueUnterAufgabe('');
      await ladeAufgabenDetail(aufgabeModal.id);
    } catch (e: any) { alert('Hinzufügen fehlgeschlagen: ' + (e?.message || 'Fehler')); }
  }

  async function unterAufgabeToggle(ua: any) {
    try {
      const neu = !ua.erledigt;
      const res = await supabase.from('aufgaben').update({ erledigt: neu, status: neu ? 'fertig' : 'todo' }).eq('id', ua.id);
      if (res.error) throw res.error;
      if (aufgabeModal?.id) await ladeAufgabenDetail(aufgabeModal.id);
    } catch (e: any) { alert('Aktualisieren fehlgeschlagen: ' + (e?.message || 'Fehler')); }
  }

  async function unterAufgabeLoeschen(id: string) {
    try {
      const res = await supabase.from('aufgaben').delete().eq('id', id);
      if (res.error) throw res.error;
      if (aufgabeModal?.id) await ladeAufgabenDetail(aufgabeModal.id);
    } catch (e: any) { alert('Löschen fehlgeschlagen: ' + (e?.message || 'Fehler')); }
  }

  async function kommentarHinzufuegen() {
    if (!aufgabeModal?.id || !neuerKommentar.trim()) return;
    try {
      const res = await supabase.from('aufgaben_kommentare').insert({
        owner_user_id: ownerId, aufgabe_id: aufgabeModal.id, text: neuerKommentar.trim(), autor: 'Ich',
      });
      if (res.error) throw res.error;
      setNeuerKommentar('');
      await ladeAufgabenDetail(aufgabeModal.id);
    } catch (e: any) { alert('Speichern fehlgeschlagen: ' + (e?.message || 'Fehler')); }
  }

  async function kommentarLoeschen(id: string) {
    try {
      const res = await supabase.from('aufgaben_kommentare').delete().eq('id', id);
      if (res.error) throw res.error;
      if (aufgabeModal?.id) await ladeAufgabenDetail(aufgabeModal.id);
    } catch (e: any) { alert('Löschen fehlgeschlagen: ' + (e?.message || 'Fehler')); }
  }

  async function speichereAufgabe() {
    if (!aufgabeModal) return;
    if (!aufgabeModal.titel.trim()) { alert('Bitte einen Titel eingeben.'); return; }
    setSpeichern(true);
    try {
      const z = aufgabeModal.zuweisung || '';
      const datensatz = {
        owner_user_id: ownerId,
        projekt_id: projektId,
        titel: aufgabeModal.titel.trim(),
        beschreibung: aufgabeModal.beschreibung || null,
        status: aufgabeModal.status,
        prioritaet: aufgabeModal.prioritaet,
        faellig_am: aufgabeModal.faellig_am || null,
        mitarbeiter_id: z.startsWith('p:') ? z.slice(2) : null,
        team_id: z.startsWith('t:') ? z.slice(2) : null,
        erledigt: aufgabeModal.status === 'fertig',
      };
      let res;
      if (aufgabeModal.id) {
        res = await supabase.from('aufgaben').update(datensatz).eq('id', aufgabeModal.id);
      } else {
        res = await supabase.from('aufgaben').insert(datensatz);
      }
      if (res.error) throw res.error;
      setAufgabeModal(null);
      await ladeDaten();
    } catch (e: any) {
      alert('Speichern fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setSpeichern(false);
    }
  }

  async function loescheAufgabe() {
    if (!aufgabeModal?.id) return;
    if (!confirm('Aufgabe wirklich löschen?')) return;
    setSpeichern(true);
    try {
      const res = await supabase.from('aufgaben').delete().eq('id', aufgabeModal.id);
      if (res.error) throw res.error;
      setAufgabeModal(null);
      await ladeDaten();
    } catch (e: any) {
      alert('Löschen fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setSpeichern(false);
    }
  }

  // --- Drag & Drop zwischen Spalten ---
  function onDragStartTask(e: React.DragEvent, a: Aufgabe) {
    setDraggingTaskId(a.id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', a.id); } catch { /* ignore */ }
  }
  function onDragEndTask() { setDraggingTaskId(null); setDragOverSpalte(null); }

  async function onDropSpalte(status: string) {
    const id = draggingTaskId;
    setDragOverSpalte(null);
    setDraggingTaskId(null);
    if (!id) return;
    const a = aufgaben.find((x) => x.id === id);
    if (!a || a.status === status) return;
    try {
      const res = await supabase.from('aufgaben')
        .update({ status, erledigt: status === 'fertig' })
        .eq('id', id);
      if (res.error) throw res.error;
      await ladeDaten();
    } catch (e: any) {
      alert('Verschieben fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  }

  // --- Beteiligte: anlegen / bearbeiten / deaktivieren ---
  function beteiligterById(id: string | null | undefined): any | null {
    if (!id) return null;
    return beteiligte.find((b) => b.id === id) || null;
  }
  function teamById(id: string | null | undefined): any | null {
    if (!id) return null;
    return teams.find((t) => t.id === id) || null;
  }
  // Liefert die Zuweisung einer Aufgabe (Person ODER Team) einheitlich
  function zustaendigerVon(a: Aufgabe): { name: string; farbe: string; istTeam: boolean; istExtern: boolean } | null {
    if (a.team_id) {
      const t = teamById(a.team_id);
      if (t) return { name: t.name, farbe: t.farbe, istTeam: true, istExtern: t.typ === 'extern' };
    }
    if (a.mitarbeiter_id) {
      const b = beteiligterById(a.mitarbeiter_id);
      if (b) return { name: b.name, farbe: b.farbe, istTeam: false, istExtern: b.typ === 'extern' };
    }
    return null;
  }
  async function aufgabeZuweisen(aufgabeId: string, ziel: string) {
    // ziel: 'p:<id>' | 't:<id>' | ''
    const datensatz = {
      mitarbeiter_id: ziel.startsWith('p:') ? ziel.slice(2) : null,
      team_id: ziel.startsWith('t:') ? ziel.slice(2) : null,
    };
    try {
      const res = await supabase.from('aufgaben').update(datensatz).eq('id', aufgabeId);
      if (res.error) throw res.error;
      await ladeDaten();
    } catch (e: any) {
      alert('Zuweisen fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  }
  function leerePerson(): any {
    return { id: null, name: '', rolle: '', typ: 'intern', kostentyp: '', kostensatz: '', firma_name: '', farbe: '#5A8DEE' };
  }
  function oeffnePersonNeu() { setPersonModal(leerePerson()); }
  function oeffnePersonBearbeiten(b: any) {
    setPersonModal({
      id: b.id, name: b.name || '', rolle: b.rolle || '', typ: b.typ || 'intern',
      kostentyp: b.kostentyp || '', kostensatz: b.kostensatz ?? '', firma_name: b.firma_name || '', farbe: b.farbe || '#5A8DEE',
    });
  }

  async function speicherePerson() {
    if (!personModal) return;
    if (!personModal.name.trim()) { alert('Bitte einen Namen eingeben.'); return; }
    setPersonSpeichern(true);
    try {
      const datensatz = {
        owner_user_id: ownerId,
        name: personModal.name.trim(),
        rolle: personModal.rolle || null,
        typ: personModal.typ,
        kostentyp: personModal.kostentyp || null,
        kostensatz: personModal.kostensatz === '' ? null : Number(personModal.kostensatz),
        firma_name: personModal.typ === 'extern' ? (personModal.firma_name || null) : null,
        farbe: personModal.farbe || '#5A8DEE',
      };
      let res;
      if (personModal.id) {
        res = await supabase.from('projekt_beteiligte').update(datensatz).eq('id', personModal.id);
      } else {
        res = await supabase.from('projekt_beteiligte').insert(datensatz);
      }
      if (res.error) throw res.error;
      setPersonModal(null);
      await ladeDaten();
    } catch (e: any) {
      alert('Speichern fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setPersonSpeichern(false);
    }
  }

  async function deaktivierePerson() {
    if (!personModal?.id) return;
    if (!confirm('Beteiligten entfernen? Er verschwindet aus der Auswahl. Bereits zugewiesene Aufgaben bleiben bestehen.')) return;
    setPersonSpeichern(true);
    try {
      const res = await supabase.from('projekt_beteiligte').update({ aktiv: false }).eq('id', personModal.id);
      if (res.error) throw res.error;
      setPersonModal(null);
      await ladeDaten();
    } catch (e: any) {
      alert('Entfernen fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setPersonSpeichern(false);
    }
  }

  // --- Teams: anlegen / bearbeiten / deaktivieren ---
  function leeresTeam(): any {
    return { id: null, name: '', typ: 'intern', firma_name: '', farbe: '#C9A84C' };
  }
  function oeffneTeamNeu() { setTeamModal(leeresTeam()); }
  function oeffneTeamBearbeiten(t: any) {
    setTeamModal({ id: t.id, name: t.name || '', typ: t.typ || 'intern', firma_name: t.firma_name || '', farbe: t.farbe || '#C9A84C' });
  }

  async function speichereTeam() {
    if (!teamModal) return;
    if (!teamModal.name.trim()) { alert('Bitte einen Team-Namen eingeben.'); return; }
    setTeamSpeichern(true);
    try {
      const datensatz = {
        owner_user_id: ownerId,
        name: teamModal.name.trim(),
        typ: teamModal.typ,
        firma_name: teamModal.typ === 'extern' ? (teamModal.firma_name || null) : null,
        farbe: teamModal.farbe || '#C9A84C',
      };
      let res;
      if (teamModal.id) {
        res = await supabase.from('projekt_teams').update(datensatz).eq('id', teamModal.id);
      } else {
        res = await supabase.from('projekt_teams').insert(datensatz);
      }
      if (res.error) throw res.error;
      setTeamModal(null);
      await ladeDaten();
    } catch (e: any) {
      alert('Speichern fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setTeamSpeichern(false);
    }
  }

  async function deaktiviereTeam() {
    if (!teamModal?.id) return;
    if (!confirm('Team entfernen? Mitglieder und bereits zugewiesene Aufgaben bleiben bestehen.')) return;
    setTeamSpeichern(true);
    try {
      // Team deaktivieren + Mitglieder lösen (team_id -> null), nicht-destruktiv
      await supabase.from('projekt_beteiligte').update({ team_id: null }).eq('team_id', teamModal.id);
      const res = await supabase.from('projekt_teams').update({ aktiv: false }).eq('id', teamModal.id);
      if (res.error) throw res.error;
      setTeamModal(null);
      await ladeDaten();
    } catch (e: any) {
      alert('Entfernen fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setTeamSpeichern(false);
    }
  }

  // Person einem Team zuordnen / lösen
  async function personTeamSetzen(personId: string, teamId: string | null) {
    try {
      const res = await supabase.from('projekt_beteiligte').update({ team_id: teamId }).eq('id', personId);
      if (res.error) throw res.error;
      await ladeDaten();
    } catch (e: any) {
      alert('Zuordnung fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  }

  // --- Projekt als Vorlage speichern ---
  async function alsVorlageSpeichern() {
    if (!projekt) return;
    const name = prompt('Name der Vorlage:', projekt.name + ' (Vorlage)');
    if (name === null) return;
    if (!name.trim()) { alert('Bitte einen Namen eingeben.'); return; }
    setVorlageSpeichern(true);
    try {
      // 1) Vorlage anlegen
      const vRes = await supabase.from('projekt_vorlagen').insert({
        owner_user_id: ownerId,
        name: name.trim(),
        beschreibung: projekt.beschreibung || null,
        prioritaet: projekt.prioritaet || 'normal',
        farbe: projekt.farbe || '#00e5ff',
      }).select('id').single();
      if (vRes.error) throw vRes.error;
      const vorlageId = vRes.data.id;

      // 2) Aufgaben (Top-Level) als Standard-Aufgaben uebernehmen (ohne Termine/Zuweisung)
      if (aufgaben.length > 0) {
        const rows = aufgaben.map((a, i) => ({
          owner_user_id: ownerId,
          vorlage_id: vorlageId,
          titel: a.titel,
          beschreibung: a.beschreibung || null,
          status: a.status || 'todo',
          prioritaet: a.prioritaet || 'normal',
          sortierung: i,
        }));
        const aRes = await supabase.from('vorlagen_aufgaben').insert(rows);
        if (aRes.error) throw aRes.error;
      }
      alert(`Vorlage „${name.trim()}" gespeichert — mit ${aufgaben.length} Standard-Aufgabe${aufgaben.length === 1 ? '' : 'n'}. Du findest sie auf der Projekte-Übersicht unter „Aus Vorlage erstellen".`);
    } catch (e: any) {
      alert('Speichern fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setVorlageSpeichern(false);
    }
  }

  // --- KI-Statusbericht als PDF ---
  async function statusberichtErzeugen() {
    if (!projekt) return;
    setBerichtLaeuft(true);
    try {
      // Auslastung (Teams + Personen) zusammenstellen
      const auslastung = [
        ...teams.map((t) => ({
          name: t.name, istTeam: true,
          offen: aufgaben.filter((a) => a.team_id === t.id && !a.erledigt && a.status !== 'fertig').length,
          gesamt: aufgaben.filter((a) => a.team_id === t.id).length,
        })),
        ...beteiligte.map((b) => ({
          name: b.name, istTeam: false,
          offen: aufgaben.filter((a) => a.mitarbeiter_id === b.id && !a.erledigt && a.status !== 'fertig').length,
          gesamt: aufgaben.filter((a) => a.mitarbeiter_id === b.id).length,
        })),
      ].filter((z) => z.gesamt > 0);

      const res = await fetch('/api/projekt-statusbericht', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projekt: {
            name: projekt.name, beschreibung: projekt.beschreibung, status: projekt.status,
            prioritaet: projekt.prioritaet, start_datum: projekt.start_datum, end_datum: projekt.end_datum,
            budget: projekt.budget, verantwortlich: projekt.verantwortlich,
          },
          aufgaben: aufgaben.map((a) => ({
            titel: a.titel, status: a.status, prioritaet: a.prioritaet, faellig_am: a.faellig_am, erledigt: a.erledigt,
          })),
          auslastung,
        }),
      });

      if (!res.ok) {
        let msg = 'Bericht-Erstellung fehlgeschlagen.';
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
        alert(msg);
        setBerichtLaeuft(false);
        return;
      }

      // PDF herunterladen
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Statusbericht_${String(projekt.name).replace(/[^a-zA-Z0-9äöüÄÖÜ ]/g, '').replace(/\s+/g, '_').slice(0, 60)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Fehler: ' + (e?.message || 'Unbekannt'));
    } finally {
      setBerichtLaeuft(false);
    }
  }

  // --- Styles ---
  const card: React.CSSProperties = {
    background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 18,
  };
  const btnGhost: React.CSSProperties = {
    background: 'transparent', color: BRAND.textDim, border: `1px solid ${BRAND.border}`,
    borderRadius: 10, padding: '8px 14px', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif', textDecoration: 'none', display: 'inline-block',
  };
  const btn: React.CSSProperties = {
    background: BRAND.cyan, color: BRAND.navy, border: 'none', borderRadius: 10,
    padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
  };
  const inputStil: React.CSSProperties = {
    width: '100%', background: BRAND.navy, color: '#fff', border: `1px solid ${BRAND.border}`,
    borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
  };
  const labelStil: React.CSSProperties = {
    display: 'block', color: BRAND.textDim, fontSize: 12, fontWeight: 600, marginBottom: 5, fontFamily: 'DM Sans, sans-serif',
  };

  if (laden) {
    return (
      <div style={{ background: BRAND.navy, minHeight: '100vh', color: '#fff', padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ ...card, color: BRAND.textDim }}>Lade Projekt…</div>
      </div>
    );
  }

  if (fehler || !projekt) {
    return (
      <div style={{ background: BRAND.navy, minHeight: '100vh', color: '#fff', padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>
        <a href="/dashboard/projekte" style={{ ...btnGhost, marginBottom: 16 }}>← Zur Übersicht</a>
        <div style={{ ...card, borderColor: BRAND.danger, color: BRAND.danger, marginTop: 16 }}>{fehler || 'Projekt nicht gefunden.'}</div>
      </div>
    );
  }

  const sm = STATUS_META[projekt.status] || STATUS_META.aktiv;
  const pm = PRIO_META[projekt.prioritaet] || PRIO_META.normal;

  const gesamt = aufgaben.length;
  const erledigt = aufgaben.filter((a) => a.erledigt || a.status === 'fertig').length;
  const offen = gesamt - erledigt;
  const pct = gesamt > 0 ? Math.round((erledigt / gesamt) * 100) : 0;
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const ueberfaellig = aufgaben.filter((a) => !a.erledigt && a.status !== 'fertig' && a.faellig_am && new Date(a.faellig_am) < heute).length;

  return (
    <div style={{ background: BRAND.navy, minHeight: '100vh', color: '#fff', padding: '28px 24px', fontFamily: 'DM Sans, sans-serif' }}>
      <a href="/dashboard/projekte" style={{ ...btnGhost, marginBottom: 16 }}>← Zur Übersicht</a>

      {/* Projekt-Kopf */}
      <div style={{ ...card, borderLeft: `4px solid ${projekt.farbe || BRAND.cyan}`, marginTop: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800 }}>{projekt.name}</h1>
              <span style={{ fontSize: 11, fontWeight: 700, color: sm.farbe, background: sm.farbe + '22', border: `1px solid ${sm.farbe}55`, borderRadius: 999, padding: '3px 10px' }}>{sm.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: pm.farbe, background: pm.farbe + '22', border: `1px solid ${pm.farbe}55`, borderRadius: 999, padding: '3px 10px' }}>{pm.label}</span>
            </div>
            {projekt.beschreibung && (
              <p style={{ margin: '0 0 10px', color: BRAND.textDim, fontSize: 14, lineHeight: 1.5 }}>{projekt.beschreibung}</p>
            )}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: BRAND.textDim }}>
              <span>📅 {dStr(projekt.start_datum)} – {dStr(projekt.end_datum)}</span>
              {projekt.verantwortlich && <span>👤 {projekt.verantwortlich}</span>}
              {projekt.budget != null && <span>💶 {Number(projekt.budget).toLocaleString('de-DE')} €</span>}
            </div>
          </div>
        </div>

        {/* Fortschritt */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: BRAND.textDim, marginBottom: 5 }}>
            <span>Fortschritt</span>
            <span>{erledigt}/{gesamt} Aufgaben · {pct}%</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? BRAND.green : BRAND.cyan, borderRadius: 999, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      </div>

      {/* Reiter-Leiste */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 18, borderBottom: `1px solid ${BRAND.border}`, paddingBottom: 0 }}>
        {REITER.map((r) => {
          const aktiv = reiter === r.key;
          return (
            <button
              key={r.key}
              onClick={() => setReiter(r.key)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '10px 16px', fontSize: 14, fontWeight: 700,
                fontFamily: 'DM Sans, sans-serif',
                color: aktiv ? BRAND.cyan : BRAND.textDim,
                borderBottom: `2px solid ${aktiv ? BRAND.cyan : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Reiter-Inhalt */}
      {reiter === 'uebersicht' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 18 }}>
            <StatKachel label="Aufgaben gesamt" wert={String(gesamt)} farbe={BRAND.cyan} />
            <StatKachel label="Offen" wert={String(offen)} farbe={BRAND.warn} />
            <StatKachel label="Erledigt" wert={String(erledigt)} farbe={BRAND.green} />
            <StatKachel label="Überfällig" wert={String(ueberfaellig)} farbe={ueberfaellig > 0 ? BRAND.danger : BRAND.textDim} />
          </div>

          {/* Mini-Auslastung */}
          <div style={{ ...card }}>
            <h3 style={{ margin: '0 0 12px', fontFamily: 'Syne, sans-serif', fontSize: 16 }}>Auslastung der Beteiligten</h3>
            {(() => {
              const offeneAufgaben = aufgaben.filter((a) => !a.erledigt && a.status !== 'fertig');
              const personenZeilen = beteiligte.map((b) => ({
                id: b.id, name: b.name, farbe: b.farbe, istTeam: false, istExtern: b.typ === 'extern',
                offen: offeneAufgaben.filter((a) => a.mitarbeiter_id === b.id).length,
                gesamt: aufgaben.filter((a) => a.mitarbeiter_id === b.id).length,
              }));
              const teamZeilen = teams.map((t) => ({
                id: t.id, name: t.name, farbe: t.farbe, istTeam: true, istExtern: t.typ === 'extern',
                offen: offeneAufgaben.filter((a) => a.team_id === t.id).length,
                gesamt: aufgaben.filter((a) => a.team_id === t.id).length,
              }));
              const zeilen = [...teamZeilen, ...personenZeilen].filter((z) => z.gesamt > 0);
              const nichtZugewiesen = offeneAufgaben.filter((a) => !a.mitarbeiter_id && !a.team_id).length;
              if (zeilen.length === 0 && nichtZugewiesen === 0) {
                return <div style={{ color: BRAND.textDim, fontSize: 13 }}>Noch keine Aufgaben zugewiesen.</div>;
              }
              const maxOffen = Math.max(1, ...zeilen.map((z) => z.offen));
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {zeilen.sort((a, b) => b.offen - a.offen).map((z) => (
                    <div key={(z.istTeam ? 't' : 'p') + z.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 170, flexShrink: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: z.farbe, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {z.istTeam ? '👥 ' : ''}{z.name}{z.istExtern ? ' (Sub)' : ''}
                        </span>
                      </div>
                      <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 999, height: 18, overflow: 'hidden', position: 'relative' }}>
                        <div style={{ height: '100%', width: `${(z.offen / maxOffen) * 100}%`, background: z.farbe, borderRadius: 999, minWidth: z.offen > 0 ? 4 : 0 }} />
                      </div>
                      <div style={{ width: 90, flexShrink: 0, fontSize: 12, color: BRAND.textDim, textAlign: 'right' }}>
                        {z.offen} offen / {z.gesamt}
                      </div>
                    </div>
                  ))}
                  {nichtZugewiesen > 0 && (
                    <div style={{ fontSize: 13, color: BRAND.warn, marginTop: 4 }}>
                      ⚠ {nichtZugewiesen} offene Aufgabe{nichtZugewiesen === 1 ? '' : 'n'} ohne Zuständigen
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {reiter === 'aufgaben' && (
        <div>
          {/* Umschalter Kanban / Liste */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 0, border: `1px solid ${BRAND.border}`, borderRadius: 10, overflow: 'hidden' }}>
              {(['kanban', 'liste'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setAufgabenAnsicht(v)}
                  style={{
                    background: aufgabenAnsicht === v ? BRAND.cyan : 'transparent',
                    color: aufgabenAnsicht === v ? BRAND.navy : BRAND.textDim,
                    border: 'none', padding: '8px 16px', cursor: 'pointer', fontWeight: 700,
                    fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  {v === 'kanban' ? '▦ Board' : '☰ Liste'}
                </button>
              ))}
            </div>
            {aufgabenAnsicht === 'liste' && (
              <>
                <span style={{ color: BRAND.textDim, fontSize: 13 }}>Sortieren:</span>
                <select
                  value={sortFeld}
                  onChange={(e) => setSortFeld(e.target.value as any)}
                  style={{ ...inputStil, width: 'auto', padding: '7px 10px' }}
                >
                  <option value="faellig">Fälligkeit</option>
                  <option value="prio">Priorität</option>
                  <option value="status">Status</option>
                  <option value="titel">Titel (A–Z)</option>
                </select>
              </>
            )}
            <div style={{ flex: 1 }} />
            <button style={btnGhost} onClick={() => setBeteiligteModal(true)}>👥 Beteiligte</button>
            <button style={btn} onClick={() => oeffneNeueAufgabe('todo')}>+ Aufgabe</button>
          </div>

          {aufgabenAnsicht === 'kanban' ? (
            <div>
              {(beteiligte.length > 0 || teams.length > 0) && (
                <div style={{ ...card, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: BRAND.textDim, marginBottom: 8 }}>
                    Zuweisen per Ziehen: Aufgaben-Karte auf eine Person oder ein Team ziehen.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {teams.map((t) => {
                      const over = zuweisOver === `t:${t.id}`;
                      return (
                        <div
                          key={t.id}
                          onDragOver={(e) => { if (!draggingTaskId) return; e.preventDefault(); setZuweisOver(`t:${t.id}`); }}
                          onDragLeave={() => setZuweisOver((p) => (p === `t:${t.id}` ? null : p))}
                          onDrop={() => { if (draggingTaskId) aufgabeZuweisen(draggingTaskId, `t:${t.id}`); setZuweisOver(null); }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999,
                            background: over ? t.farbe : t.farbe + '22', color: over ? BRAND.navy : '#fff',
                            border: `1.5px solid ${t.farbe}`, fontSize: 13, fontWeight: 700,
                            transform: over ? 'scale(1.06)' : 'none', transition: 'transform 0.1s ease',
                          }}
                        >
                          👥 {t.name}{t.typ === 'extern' ? ' (Sub)' : ''}
                        </div>
                      );
                    })}
                    {beteiligte.map((b) => {
                      const over = zuweisOver === `p:${b.id}`;
                      return (
                        <div
                          key={b.id}
                          onDragOver={(e) => { if (!draggingTaskId) return; e.preventDefault(); setZuweisOver(`p:${b.id}`); }}
                          onDragLeave={() => setZuweisOver((p) => (p === `p:${b.id}` ? null : p))}
                          onDrop={() => { if (draggingTaskId) aufgabeZuweisen(draggingTaskId, `p:${b.id}`); setZuweisOver(null); }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999,
                            background: over ? b.farbe : 'transparent', color: over ? BRAND.navy : '#fff',
                            border: `1.5px solid ${b.farbe}`, fontSize: 13, fontWeight: 600,
                            transform: over ? 'scale(1.06)' : 'none', transition: 'transform 0.1s ease',
                          }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.farbe, display: 'inline-block' }} />
                          {b.name}{b.typ === 'extern' ? ' (Sub)' : ''}
                        </div>
                      );
                    })}
                    {/* Zuweisung loesen */}
                    <div
                      onDragOver={(e) => { if (!draggingTaskId) return; e.preventDefault(); setZuweisOver('none'); }}
                      onDragLeave={() => setZuweisOver((p) => (p === 'none' ? null : p))}
                      onDrop={() => { if (draggingTaskId) aufgabeZuweisen(draggingTaskId, ''); setZuweisOver(null); }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999,
                        background: zuweisOver === 'none' ? BRAND.danger : 'transparent', color: zuweisOver === 'none' ? '#fff' : BRAND.textDim,
                        border: `1.5px dashed ${BRAND.border}`, fontSize: 13, fontWeight: 600,
                      }}
                    >
                      ✕ niemand
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, alignItems: 'start' }}>
                {SPALTEN.map((sp) => {
                const spaltenAufgaben = aufgaben.filter((a) => a.status === sp.key);
                const istDropZiel = dragOverSpalte === sp.key;
                return (
                  <div
                    key={sp.key}
                    onDragOver={(e) => { if (!draggingTaskId) return; e.preventDefault(); setDragOverSpalte(sp.key); }}
                    onDragLeave={() => setDragOverSpalte((p) => (p === sp.key ? null : p))}
                    onDrop={() => onDropSpalte(sp.key)}
                    style={{
                      background: istDropZiel ? 'rgba(0,229,255,0.08)' : BRAND.navy2,
                      border: `1px solid ${istDropZiel ? BRAND.cyan : BRAND.border}`,
                      borderRadius: 14, padding: 12, minHeight: 120,
                      transition: 'background 0.12s ease, border 0.12s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: sp.farbe, display: 'inline-block' }} />
                        <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'Syne, sans-serif' }}>{sp.label}</span>
                        <span style={{ fontSize: 12, color: BRAND.textDim }}>{spaltenAufgaben.length}</span>
                      </div>
                    </div>

                    {spaltenAufgaben.map((a) => {
                      const pm = PRIO_META[a.prioritaet] || PRIO_META.normal;
                      const ueberfaellig = a.faellig_am && a.status !== 'fertig' && new Date(a.faellig_am) < new Date(new Date().toDateString());
                      return (
                        <div
                          key={a.id}
                          draggable
                          onDragStart={(e) => onDragStartTask(e, a)}
                          onDragEnd={onDragEndTask}
                          onClick={() => oeffneAufgabe(a)}
                          style={{
                            background: BRAND.navy, border: `1px solid ${BRAND.border}`,
                            borderLeft: `3px solid ${pm.farbe}`, borderRadius: 8,
                            padding: '10px 12px', marginBottom: 8, cursor: 'grab',
                            opacity: draggingTaskId === a.id ? 0.4 : 1,
                          }}
                        >
                          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: a.beschreibung ? 4 : 0 }}>{a.titel}</div>
                          {a.beschreibung && (
                            <div style={{ fontSize: 12, color: BRAND.textDim, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {a.beschreibung}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, fontSize: 11, alignItems: 'center' }}>
                            <span style={{ color: pm.farbe, fontWeight: 700 }}>● {pm.label}</span>
                            {a.faellig_am && (
                              <span style={{ color: ueberfaellig ? BRAND.danger : BRAND.textDim, fontWeight: ueberfaellig ? 700 : 400 }}>
                                📅 {dStr(a.faellig_am)}{ueberfaellig ? ' (überfällig)' : ''}
                              </span>
                            )}
                            {(() => {
                              const z = zustaendigerVon(a);
                              if (!z) return null;
                              return (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: z.farbe, fontWeight: 600 }}>
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: z.farbe, display: 'inline-block' }} />
                                  {z.istTeam ? '👥 ' : ''}{z.name}{z.istExtern ? ' (Sub)' : ''}
                                </span>
                              );
                            })()}
                            {(() => {
                              const u = unterMap[a.id];
                              if (!u || u.ges === 0) return null;
                              const fertig = u.erl === u.ges;
                              return (
                                <span style={{ color: fertig ? BRAND.green : BRAND.textDim, fontWeight: 600 }}>
                                  ☑ {u.erl}/{u.ges}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}

                    <button
                      onClick={() => oeffneNeueAufgabe(sp.key)}
                      style={{
                        width: '100%', background: 'transparent', border: `1px dashed ${BRAND.border}`,
                        borderRadius: 8, color: BRAND.textDim, padding: '8px 0', cursor: 'pointer',
                        fontSize: 13, fontFamily: 'DM Sans, sans-serif', marginTop: 2,
                      }}
                    >
                      + Aufgabe
                    </button>
                  </div>
                );
              })}
            </div>
            </div>
          ) : (
            <AufgabenListe
              aufgaben={aufgaben}
              beteiligte={beteiligte}
              teams={teams}
              sortFeld={sortFeld}
              onOeffnen={oeffneAufgabe}
              onStatusWechsel={async (id, status) => {
                try {
                  const res = await supabase.from('aufgaben').update({ status, erledigt: status === 'fertig' }).eq('id', id);
                  if (res.error) throw res.error;
                  await ladeDaten();
                } catch (e: any) { alert('Aktualisieren fehlgeschlagen: ' + (e?.message || 'Fehler')); }
              }}
            />
          )}
        </div>
      )}

      {reiter === 'kalender' && (
        <ProjektKalender
          aufgaben={aufgaben}
          monat={kalMonat}
          setMonat={setKalMonat}
          onOeffnen={oeffneAufgabe}
        />
      )}

      {reiter === 'einstellungen' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...card }}>
            <h3 style={{ margin: '0 0 8px', fontFamily: 'Syne, sans-serif', fontSize: 16 }}>📄 KI-Statusbericht</h3>
            <p style={{ margin: '0 0 14px', color: BRAND.textDim, fontSize: 13, lineHeight: 1.5 }}>
              Erstellt auf Knopfdruck einen professionellen Fortschrittsbericht als PDF — mit Kennzahlen,
              erledigten und offenen Punkten, Überfälligem und einem Ausblick. Ideal für Kunden oder die Geschäftsführung.
            </p>
            <button style={{ ...btn, background: BRAND.cyan }} onClick={statusberichtErzeugen} disabled={berichtLaeuft}>
              {berichtLaeuft ? 'Erstellt Bericht…' : '📄 Statusbericht als PDF'}
            </button>
          </div>

          <div style={{ ...card }}>
            <h3 style={{ margin: '0 0 8px', fontFamily: 'Syne, sans-serif', fontSize: 16 }}>Als Vorlage speichern</h3>
            <p style={{ margin: '0 0 14px', color: BRAND.textDim, fontSize: 13, lineHeight: 1.5 }}>
              Speichert dieses Projekt als wiederverwendbare Blaupause — mit Beschreibung, Priorität, Farbe und allen
              Aufgaben (ohne Termine und Zuweisungen). Aus der Vorlage erstellst du später mit einem Klick neue,
              gleich strukturierte Projekte.
            </p>
            <button style={btn} onClick={alsVorlageSpeichern} disabled={vorlageSpeichern}>
              {vorlageSpeichern ? 'Speichert…' : '📋 Als Vorlage speichern'}
            </button>
          </div>

          <div style={{ ...card, color: BRAND.textDim, fontSize: 13 }}>
            Weitere Projekt-Einstellungen (Bearbeiten/Archivieren) findest du auf der Übersicht über „Bearbeiten".
          </div>
        </div>
      )}

      {/* ===== Aufgaben-Modal ===== */}
      {aufgabeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
          onClick={() => setAufgabeModal(null)}>
          <div style={{ ...card, width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontFamily: 'Syne, sans-serif', fontSize: 20 }}>
              {aufgabeModal.id ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
            </h2>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStil}>Titel *</label>
              <input style={inputStil} value={aufgabeModal.titel} onChange={(e) => setAufgabeModal({ ...aufgabeModal, titel: e.target.value })} placeholder="z.B. Material bestellen" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStil}>Beschreibung</label>
              <textarea style={{ ...inputStil, minHeight: 64, resize: 'vertical' }} value={aufgabeModal.beschreibung} onChange={(e) => setAufgabeModal({ ...aufgabeModal, beschreibung: e.target.value })} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Spalte</label>
                <select style={inputStil} value={aufgabeModal.status} onChange={(e) => setAufgabeModal({ ...aufgabeModal, status: e.target.value })}>
                  {SPALTEN.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Priorität</label>
                <select style={inputStil} value={aufgabeModal.prioritaet} onChange={(e) => setAufgabeModal({ ...aufgabeModal, prioritaet: e.target.value })}>
                  {Object.keys(PRIO_META).map((s) => <option key={s} value={s}>{PRIO_META[s].label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Fällig am</label>
                <input type="date" style={inputStil} value={aufgabeModal.faellig_am} onChange={(e) => setAufgabeModal({ ...aufgabeModal, faellig_am: e.target.value })} />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStil}>Zuständig</label>
              <select style={inputStil} value={aufgabeModal.zuweisung} onChange={(e) => setAufgabeModal({ ...aufgabeModal, zuweisung: e.target.value })}>
                <option value="">— niemand —</option>
                {teams.length > 0 && (
                  <optgroup label="Teams">
                    {teams.map((t) => (
                      <option key={t.id} value={`t:${t.id}`}>👥 {t.name}{t.typ === 'extern' ? ' (Subunternehmer-Team)' : ''}</option>
                    ))}
                  </optgroup>
                )}
                {beteiligte.length > 0 && (
                  <optgroup label="Personen">
                    {beteiligte.map((b) => (
                      <option key={b.id} value={`p:${b.id}`}>{b.name}{b.rolle ? ` · ${b.rolle}` : ''}{b.typ === 'extern' ? ' (Sub)' : ''}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              {beteiligte.length === 0 && teams.length === 0 && (
                <div style={{ fontSize: 12, color: BRAND.textDim, marginTop: 5 }}>
                  Noch keine Beteiligten/Teams. Lege sie über „👥 Beteiligte" an.
                </div>
              )}
            </div>

            {/* Unteraufgaben + Kommentare nur bei bestehender Aufgabe */}
            {aufgabeModal.id && (
              <>
                {/* Unteraufgaben / Checkliste */}
                <div style={{ borderTop: `1px solid ${BRAND.border}`, paddingTop: 16, marginBottom: 16 }}>
                  {(() => {
                    const erl = unterAufgaben.filter((u) => u.erledigt).length;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <label style={{ ...labelStil, margin: 0 }}>Unteraufgaben / Checkliste</label>
                        {unterAufgaben.length > 0 && (
                          <span style={{ fontSize: 12, color: erl === unterAufgaben.length ? BRAND.green : BRAND.textDim }}>
                            {erl}/{unterAufgaben.length} erledigt
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {unterAufgaben.length > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 999, height: 5, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{ height: '100%', width: `${Math.round((unterAufgaben.filter((u) => u.erledigt).length / unterAufgaben.length) * 100)}%`, background: BRAND.green, borderRadius: 999 }} />
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {unterAufgaben.map((ua) => (
                      <div key={ua.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: BRAND.navy, border: `1px solid ${BRAND.border}`, borderRadius: 8 }}>
                        <input type="checkbox" checked={!!ua.erledigt} onChange={() => unterAufgabeToggle(ua)} style={{ cursor: 'pointer', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 14, color: ua.erledigt ? BRAND.textDim : '#fff', textDecoration: ua.erledigt ? 'line-through' : 'none' }}>{ua.titel}</span>
                        <button onClick={() => unterAufgabeLoeschen(ua.id)} style={{ background: 'transparent', border: 'none', color: BRAND.textDim, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px' }} title="Löschen">×</button>
                      </div>
                    ))}
                    {detailLaden && unterAufgaben.length === 0 && <div style={{ fontSize: 12, color: BRAND.textDim }}>Lade…</div>}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      style={{ ...inputStil, flex: 1 }}
                      placeholder="Neuer Teilschritt…"
                      value={neueUnterAufgabe}
                      onChange={(e) => setNeueUnterAufgabe(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); unterAufgabeHinzufuegen(); } }}
                    />
                    <button style={btnGhost} onClick={unterAufgabeHinzufuegen}>+ Hinzufügen</button>
                  </div>
                </div>

                {/* Kommentare */}
                <div style={{ borderTop: `1px solid ${BRAND.border}`, paddingTop: 16, marginBottom: 18 }}>
                  <label style={{ ...labelStil, marginBottom: 10 }}>Kommentare / Verlauf</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                    {kommentare.length === 0 && !detailLaden && (
                      <div style={{ fontSize: 13, color: BRAND.textDim }}>Noch keine Kommentare.</div>
                    )}
                    {kommentare.map((k) => (
                      <div key={k.id} style={{ background: BRAND.navy, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 12, color: BRAND.cyan, fontWeight: 700 }}>{k.autor || 'Ich'}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: BRAND.textDim }}>
                              {(() => { try { return new Date(k.erstellt_am).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } })()}
                            </span>
                            <button onClick={() => kommentarLoeschen(k.id)} style={{ background: 'transparent', border: 'none', color: BRAND.textDim, cursor: 'pointer', fontSize: 15, lineHeight: 1 }} title="Löschen">×</button>
                          </span>
                        </div>
                        <div style={{ fontSize: 14, marginTop: 4, whiteSpace: 'pre-wrap' }}>{k.text}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <textarea
                      style={{ ...inputStil, flex: 1, minHeight: 40, resize: 'vertical' }}
                      placeholder="Kommentar schreiben…"
                      value={neuerKommentar}
                      onChange={(e) => setNeuerKommentar(e.target.value)}
                    />
                    <button style={btn} onClick={kommentarHinzufuegen}>Senden</button>
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
              <div>
                {aufgabeModal.id && (
                  <button style={{ ...btnGhost, color: BRAND.danger, borderColor: BRAND.danger }} onClick={loescheAufgabe} disabled={speichern}>Löschen</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={btnGhost} onClick={() => setAufgabeModal(null)} disabled={speichern}>Abbrechen</button>
                <button style={btn} onClick={speichereAufgabe} disabled={speichern}>{speichern ? 'Speichert…' : 'Speichern'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Beteiligte-Verwaltung ===== */}
      {beteiligteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
          onClick={() => setBeteiligteModal(false)}>
          <div style={{ ...card, width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontSize: 20 }}>Beteiligte</h2>
              <button style={btn} onClick={oeffnePersonNeu}>+ Neuer Beteiligter</button>
            </div>
            <p style={{ margin: '0 0 14px', color: BRAND.textDim, fontSize: 13 }}>
              Eigene Mitarbeiter (intern) und Subunternehmer (extern) — betriebsweit, in jedem Projekt zuweisbar.
            </p>
            {beteiligte.length === 0 ? (
              <div style={{ color: BRAND.textDim, fontSize: 13, padding: 20, textAlign: 'center' }}>
                Noch keine Beteiligten. Leg mit „+ Neuer Beteiligter" los.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {beteiligte.map((b) => {
                  const team = teamById(b.team_id);
                  return (
                    <div key={b.id} onClick={() => oeffnePersonBearbeiten(b)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: BRAND.navy, border: `1px solid ${BRAND.border}`, borderLeft: `3px solid ${b.farbe}`, borderRadius: 8, cursor: 'pointer' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: b.farbe, display: 'inline-block', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {b.name}
                          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: b.typ === 'extern' ? BRAND.warn : BRAND.green, background: (b.typ === 'extern' ? BRAND.warn : BRAND.green) + '22', borderRadius: 999, padding: '2px 8px' }}>
                            {b.typ === 'extern' ? 'Subunternehmer' : 'Intern'}
                          </span>
                          {team && (
                            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: team.farbe, background: team.farbe + '22', borderRadius: 999, padding: '2px 8px' }}>
                              👥 {team.name}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: BRAND.textDim, marginTop: 2 }}>
                          {b.rolle || '—'}
                          {b.typ === 'extern' && b.firma_name ? ` · ${b.firma_name}` : ''}
                          {b.kostentyp ? ` · ${b.kostentyp === 'stundenlohn' ? 'Stundenlohn' : b.kostentyp === 'tagessatz' ? 'Tagessatz' : 'Pauschale'}${b.kostensatz != null ? ` ${Number(b.kostensatz).toLocaleString('de-DE')} €` : ''}` : ''}
                        </div>
                      </div>
                      <span style={{ color: BRAND.textDim, fontSize: 13 }}>bearbeiten ›</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Teams-Sektion */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 0 12px' }}>
              <h2 style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontSize: 18 }}>Teams</h2>
              <button style={btnGhost} onClick={oeffneTeamNeu}>+ Neues Team</button>
            </div>
            <p style={{ margin: '0 0 12px', color: BRAND.textDim, fontSize: 13 }}>
              Fasse Beteiligte zu Teams zusammen (intern oder Subunternehmer-Team) und weise Aufgaben dem ganzen Team zu.
            </p>
            {teams.length === 0 ? (
              <div style={{ color: BRAND.textDim, fontSize: 13, padding: 16, textAlign: 'center' }}>
                Noch keine Teams. Leg mit „+ Neues Team" los.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {teams.map((t) => {
                  const mitglieder = beteiligte.filter((b) => b.team_id === t.id);
                  return (
                    <div key={t.id} style={{ padding: '12px', background: BRAND.navy, border: `1px solid ${BRAND.border}`, borderLeft: `3px solid ${t.farbe}`, borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.farbe, display: 'inline-block' }} />
                          👥 {t.name}
                          <span style={{ fontSize: 11, fontWeight: 700, color: t.typ === 'extern' ? BRAND.warn : BRAND.green, background: (t.typ === 'extern' ? BRAND.warn : BRAND.green) + '22', borderRadius: 999, padding: '2px 8px' }}>
                            {t.typ === 'extern' ? 'Subunternehmer-Team' : 'Intern'}
                          </span>
                        </div>
                        <button style={{ ...btnGhost, padding: '5px 10px', fontSize: 12 }} onClick={() => oeffneTeamBearbeiten(t)}>bearbeiten</button>
                      </div>
                      {t.typ === 'extern' && t.firma_name && (
                        <div style={{ fontSize: 12, color: BRAND.textDim, marginTop: 4 }}>{t.firma_name}</div>
                      )}
                      {/* Mitglieder verwalten */}
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, color: BRAND.textDim, marginBottom: 6 }}>Mitglieder ({mitglieder.length}):</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {beteiligte.map((b) => {
                            const drin = b.team_id === t.id;
                            return (
                              <button
                                key={b.id}
                                onClick={() => personTeamSetzen(b.id, drin ? null : t.id)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999,
                                  background: drin ? b.farbe + '22' : 'transparent',
                                  border: `1px solid ${drin ? b.farbe : BRAND.border}`,
                                  color: drin ? '#fff' : BRAND.textDim, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                                }}
                                title={drin ? 'Aus Team entfernen' : 'Zum Team hinzufügen'}
                              >
                                {drin ? '☑' : '☐'} {b.name}
                              </button>
                            );
                          })}
                          {beteiligte.length === 0 && <span style={{ fontSize: 12, color: BRAND.textDim }}>Erst Beteiligte anlegen.</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={btnGhost} onClick={() => setBeteiligteModal(false)}>Schließen</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Person-Editor ===== */}
      {personModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60 }}
          onClick={() => setPersonModal(null)}>
          <div style={{ ...card, width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontFamily: 'Syne, sans-serif', fontSize: 20 }}>
              {personModal.id ? 'Beteiligten bearbeiten' : 'Neuer Beteiligter'}
            </h2>

            {/* Typ-Schalter */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStil}>Art</label>
              <div style={{ display: 'flex', gap: 0, border: `1px solid ${BRAND.border}`, borderRadius: 10, overflow: 'hidden' }}>
                {([['intern', 'Eigener Mitarbeiter'], ['extern', 'Subunternehmer']] as const).map(([wert, label]) => (
                  <button key={wert} onClick={() => setPersonModal({ ...personModal, typ: wert })}
                    style={{ flex: 1, background: personModal.typ === wert ? BRAND.cyan : 'transparent', color: personModal.typ === wert ? BRAND.navy : BRAND.textDim, border: 'none', padding: '9px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Name *</label>
                <input style={inputStil} value={personModal.name} onChange={(e) => setPersonModal({ ...personModal, name: e.target.value })} placeholder="z.B. Max Müller" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Rolle</label>
                <input style={inputStil} value={personModal.rolle} onChange={(e) => setPersonModal({ ...personModal, rolle: e.target.value })} placeholder="z.B. Baggerfahrer" />
              </div>
            </div>

            {personModal.typ === 'extern' && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStil}>Fremdfirma</label>
                <input style={inputStil} value={personModal.firma_name} onChange={(e) => setPersonModal({ ...personModal, firma_name: e.target.value })} placeholder="z.B. Kranverleih Schmidt GmbH" />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Kostenmodell</label>
                <select style={inputStil} value={personModal.kostentyp} onChange={(e) => setPersonModal({ ...personModal, kostentyp: e.target.value })}>
                  <option value="">— offen —</option>
                  <option value="stundenlohn">Stundenlohn</option>
                  <option value="tagessatz">Tagessatz</option>
                  <option value="pauschale">Pauschale</option>
                </select>
              </div>
              <div style={{ width: 140 }}>
                <label style={labelStil}>Satz (€)</label>
                <input type="number" min={0} style={inputStil} value={personModal.kostensatz} onChange={(e) => setPersonModal({ ...personModal, kostensatz: e.target.value })} />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStil}>Farbe</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['#5A8DEE', '#00e5ff', '#4CAF7D', '#E0A24C', '#E06666', '#C9A84C'].map((f) => (
                  <button key={f} onClick={() => setPersonModal({ ...personModal, farbe: f })}
                    style={{ width: 30, height: 30, borderRadius: '50%', background: f, border: personModal.farbe === f ? '3px solid #fff' : '2px solid transparent', cursor: 'pointer' }} />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
              <div>
                {personModal.id && (
                  <button style={{ ...btnGhost, color: BRAND.danger, borderColor: BRAND.danger }} onClick={deaktivierePerson} disabled={personSpeichern}>Entfernen</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={btnGhost} onClick={() => setPersonModal(null)} disabled={personSpeichern}>Abbrechen</button>
                <button style={btn} onClick={speicherePerson} disabled={personSpeichern}>{personSpeichern ? 'Speichert…' : 'Speichern'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Team-Editor ===== */}
      {teamModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60 }}
          onClick={() => setTeamModal(null)}>
          <div style={{ ...card, width: 440, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontFamily: 'Syne, sans-serif', fontSize: 20 }}>
              {teamModal.id ? 'Team bearbeiten' : 'Neues Team'}
            </h2>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStil}>Art</label>
              <div style={{ display: 'flex', gap: 0, border: `1px solid ${BRAND.border}`, borderRadius: 10, overflow: 'hidden' }}>
                {([['intern', 'Internes Team'], ['extern', 'Subunternehmer-Team']] as const).map(([wert, label]) => (
                  <button key={wert} onClick={() => setTeamModal({ ...teamModal, typ: wert })}
                    style={{ flex: 1, background: teamModal.typ === wert ? BRAND.cyan : 'transparent', color: teamModal.typ === wert ? BRAND.navy : BRAND.textDim, border: 'none', padding: '9px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStil}>Team-Name *</label>
              <input style={inputStil} value={teamModal.name} onChange={(e) => setTeamModal({ ...teamModal, name: e.target.value })} placeholder="z.B. Team Erdarbeiten" />
            </div>

            {teamModal.typ === 'extern' && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStil}>Fremdfirma</label>
                <input style={inputStil} value={teamModal.firma_name} onChange={(e) => setTeamModal({ ...teamModal, firma_name: e.target.value })} placeholder="z.B. Kranverleih Schmidt GmbH" />
              </div>
            )}

            <div style={{ marginBottom: 18 }}>
              <label style={labelStil}>Farbe</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['#C9A84C', '#00e5ff', '#4CAF7D', '#E0A24C', '#E06666', '#5A8DEE'].map((f) => (
                  <button key={f} onClick={() => setTeamModal({ ...teamModal, farbe: f })}
                    style={{ width: 30, height: 30, borderRadius: '50%', background: f, border: teamModal.farbe === f ? '3px solid #fff' : '2px solid transparent', cursor: 'pointer' }} />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
              <div>
                {teamModal.id && (
                  <button style={{ ...btnGhost, color: BRAND.danger, borderColor: BRAND.danger }} onClick={deaktiviereTeam} disabled={teamSpeichern}>Entfernen</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={btnGhost} onClick={() => setTeamModal(null)} disabled={teamSpeichern}>Abbrechen</button>
                <button style={btn} onClick={speichereTeam} disabled={teamSpeichern}>{teamSpeichern ? 'Speichert…' : 'Speichern'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatKachel({ label, wert, farbe }: { label: string; wert: string; farbe: string }) {
  return (
    <div style={{ background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: '20px 18px' }}>
      <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 30, fontWeight: 800, color: farbe }}>{wert}</div>
      <div style={{ fontSize: 13, color: BRAND.textDim, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function ProjektKalender({
  aufgaben, monat, setMonat, onOeffnen,
}: {
  aufgaben: Aufgabe[];
  monat: Date;
  setMonat: (d: Date) => void;
  onOeffnen: (a: Aufgabe) => void;
}) {
  const jahr = monat.getFullYear();
  const mon = monat.getMonth();
  const heute = new Date(new Date().toDateString());
  const zwei = (n: number) => (n < 10 ? '0' + n : '' + n);
  const tagKey = (d: Date) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;

  // Aufgaben nach Datum gruppieren (nur mit Faelligkeit)
  const proTag: Record<string, Aufgabe[]> = {};
  aufgaben.forEach((a) => {
    if (!a.faellig_am) return;
    const key = String(a.faellig_am).slice(0, 10);
    if (!proTag[key]) proTag[key] = [];
    proTag[key].push(a);
  });

  // Raster: Montag als erster Wochentag
  const ersterTag = new Date(jahr, mon, 1);
  const offset = (ersterTag.getDay() + 6) % 7; // Mo=0
  const tageImMonat = new Date(jahr, mon + 1, 0).getDate();
  const zellen: (Date | null)[] = [];
  for (let i = 0; i < offset; i++) zellen.push(null);
  for (let t = 1; t <= tageImMonat; t++) zellen.push(new Date(jahr, mon, t));
  while (zellen.length % 7 !== 0) zellen.push(null);

  const monatsName = monat.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const ohneDatum = aufgaben.filter((a) => !a.faellig_am).length;

  const navBtn: React.CSSProperties = {
    background: 'transparent', color: '#fff', border: `1px solid ${BRAND.border}`,
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 13,
  };

  return (
    <div style={{ background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 16 }}>
      {/* Kopf */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontSize: 18, textTransform: 'capitalize' }}>{monatsName}</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={navBtn} onClick={() => setMonat(new Date(jahr, mon - 1, 1))}>‹ Voriger</button>
          <button style={navBtn} onClick={() => { const d = new Date(); setMonat(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Heute</button>
          <button style={navBtn} onClick={() => setMonat(new Date(jahr, mon + 1, 1))}>Nächster ›</button>
        </div>
      </div>

      {/* Wochentage */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 12, color: BRAND.textDim, fontWeight: 700, padding: '4px 0' }}>{w}</div>
        ))}
      </div>

      {/* Tage */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {zellen.map((tag, i) => {
          if (!tag) return <div key={i} style={{ minHeight: 90, background: 'transparent' }} />;
          const key = tagKey(tag);
          const tagsAufgaben = proTag[key] || [];
          const istHeute = tag.getTime() === heute.getTime();
          const istWE = tag.getDay() === 0 || tag.getDay() === 6;
          return (
            <div key={i} style={{
              minHeight: 90, background: istWE ? 'rgba(255,255,255,0.02)' : BRAND.navy,
              border: `1px solid ${istHeute ? BRAND.cyan : BRAND.border}`, borderRadius: 8, padding: 6,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{ fontSize: 12, fontWeight: istHeute ? 800 : 600, color: istHeute ? BRAND.cyan : BRAND.textDim }}>
                {tag.getDate()}
              </div>
              {tagsAufgaben.slice(0, 4).map((a) => {
                const pm = PRIO_META[a.prioritaet] || PRIO_META.normal;
                const ueberfaellig = a.status !== 'fertig' && tag < heute;
                const fertig = a.status === 'fertig';
                return (
                  <div
                    key={a.id}
                    onClick={() => onOeffnen(a)}
                    title={a.titel}
                    style={{
                      fontSize: 11, padding: '2px 5px', borderRadius: 4, cursor: 'pointer',
                      background: fertig ? 'rgba(76,175,125,0.15)' : pm.farbe + '22',
                      borderLeft: `2px solid ${fertig ? BRAND.green : pm.farbe}`,
                      color: fertig ? BRAND.textDim : '#fff',
                      textDecoration: fertig ? 'line-through' : 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      fontWeight: ueberfaellig ? 700 : 400,
                    }}
                  >
                    {ueberfaellig ? '⚠ ' : ''}{a.titel}
                  </div>
                );
              })}
              {tagsAufgaben.length > 4 && (
                <div style={{ fontSize: 10, color: BRAND.textDim }}>+{tagsAufgaben.length - 4} weitere</div>
              )}
            </div>
          );
        })}
      </div>

      {ohneDatum > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: BRAND.textDim }}>
          {ohneDatum} Aufgabe{ohneDatum === 1 ? '' : 'n'} ohne Fälligkeitsdatum (nicht im Kalender sichtbar).
        </div>
      )}
    </div>
  );
}

function AufgabenListe({
  aufgaben, beteiligte, teams, sortFeld, onOeffnen, onStatusWechsel,
}: {
  aufgaben: Aufgabe[];
  beteiligte: any[];
  teams: any[];
  sortFeld: 'faellig' | 'prio' | 'status' | 'titel';
  onOeffnen: (a: Aufgabe) => void;
  onStatusWechsel: (id: string, status: string) => void | Promise<void>;
}) {
  const zustaendig = (a: Aufgabe): { name: string; farbe: string; istTeam: boolean; istExtern: boolean } | null => {
    if (a.team_id) {
      const t = teams.find((x) => x.id === a.team_id);
      if (t) return { name: t.name, farbe: t.farbe, istTeam: true, istExtern: t.typ === 'extern' };
    }
    if (a.mitarbeiter_id) {
      const b = beteiligte.find((x) => x.id === a.mitarbeiter_id);
      if (b) return { name: b.name, farbe: b.farbe, istTeam: false, istExtern: b.typ === 'extern' };
    }
    return null;
  };
  const heute = new Date(new Date().toDateString());
  const sortiert = [...aufgaben].sort((a, b) => {
    if (sortFeld === 'faellig') {
      const av = a.faellig_am ? new Date(a.faellig_am).getTime() : Infinity;
      const bv = b.faellig_am ? new Date(b.faellig_am).getTime() : Infinity;
      return av - bv;
    }
    if (sortFeld === 'prio') return (PRIO_RANG[a.prioritaet] ?? 9) - (PRIO_RANG[b.prioritaet] ?? 9);
    if (sortFeld === 'status') return (STATUS_RANG[a.status] ?? 9) - (STATUS_RANG[b.status] ?? 9);
    return String(a.titel).localeCompare(String(b.titel), 'de');
  });

  if (sortiert.length === 0) {
    return (
      <div style={{ background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 40, textAlign: 'center', color: BRAND.textDim }}>
        Noch keine Aufgaben. Leg mit „+ Aufgabe" los.
      </div>
    );
  }

  const zellKopf: React.CSSProperties = {
    textAlign: 'left', padding: '10px 12px', fontSize: 12, color: BRAND.textDim,
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: `1px solid ${BRAND.border}`,
  };
  const zelle: React.CSSProperties = { padding: '10px 12px', fontSize: 14, borderBottom: `1px solid rgba(143,163,190,0.10)` };

  return (
    <div style={{ background: BRAND.navy2, border: `1px solid ${BRAND.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              <th style={zellKopf}>Aufgabe</th>
              <th style={zellKopf}>Zuständig</th>
              <th style={zellKopf}>Priorität</th>
              <th style={zellKopf}>Fällig</th>
              <th style={{ ...zellKopf, width: 150 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sortiert.map((a) => {
              const pm = PRIO_META[a.prioritaet] || PRIO_META.normal;
              const ueberfaellig = a.faellig_am && a.status !== 'fertig' && new Date(a.faellig_am) < heute;
              return (
                <tr key={a.id} style={{ cursor: 'pointer' }}>
                  <td style={zelle} onClick={() => onOeffnen(a)}>
                    <div style={{ fontWeight: 600, color: a.status === 'fertig' ? BRAND.textDim : '#fff', textDecoration: a.status === 'fertig' ? 'line-through' : 'none' }}>{a.titel}</div>
                    {a.beschreibung && (
                      <div style={{ fontSize: 12, color: BRAND.textDim, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 }}>{a.beschreibung}</div>
                    )}
                  </td>
                  <td style={zelle} onClick={() => onOeffnen(a)}>
                    {(() => {
                      const z = zustaendig(a);
                      if (!z) return <span style={{ color: BRAND.textDim, fontSize: 13 }}>—</span>;
                      return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: z.farbe, fontWeight: 600, fontSize: 13 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: z.farbe, display: 'inline-block' }} />
                          {z.istTeam ? '👥 ' : ''}{z.name}{z.istExtern ? ' (Sub)' : ''}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={zelle} onClick={() => onOeffnen(a)}>
                    <span style={{ color: pm.farbe, fontWeight: 700, fontSize: 13 }}>● {pm.label}</span>
                  </td>
                  <td style={{ ...zelle, color: ueberfaellig ? BRAND.danger : BRAND.textDim, fontWeight: ueberfaellig ? 700 : 400, fontSize: 13, whiteSpace: 'nowrap' }} onClick={() => onOeffnen(a)}>
                    {a.faellig_am ? dStr(a.faellig_am) : '—'}{ueberfaellig ? ' ⚠' : ''}
                  </td>
                  <td style={zelle}>
                    <select
                      value={a.status}
                      onChange={(e) => onStatusWechsel(a.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: BRAND.navy, color: '#fff', border: `1px solid ${BRAND.border}`,
                        borderRadius: 8, padding: '6px 8px', fontSize: 13, fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
                      }}
                    >
                      {SPALTEN.map((s) => <option key={s.key} value={s.key}>{spalteLabel(s.key)}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
