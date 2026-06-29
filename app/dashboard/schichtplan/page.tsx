'use client';

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · HR · BLOCK 6 — Schichtplanung Grundgeruest
// Cockpit-Seite (Chef): Wochenraster Mo-So x Mitarbeiter
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
  { name: 'Gruen', wert: '#4CAF7D' },
  { name: 'Orange', wert: '#E0A24C' },
  { name: 'Rot', wert: '#E06666' },
  { name: 'Blau', wert: '#5A8DEE' },
];

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// --- Datums-Helfer (alles lokal, niemals toISOString fuer date) ---
function montagDerWoche(d: Date): Date {
  const x = new Date(d);
  const tag = x.getDay(); // 0=So, 1=Mo, ... 6=Sa
  const diff = tag === 0 ? -6 : 1 - tag;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addTage(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${t}`;
}

function tagMonat(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

function kalenderwoche(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const tag = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - tag);
  const jahrStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - jahrStart.getTime()) / 86400000 + 1) / 7);
}

// Uhrzeit "HH:MM:SS" oder "HH:MM" -> "HH:MM"
function hhmm(t: string | null | undefined): string {
  if (!t) return '';
  return t.slice(0, 5);
}

// Netto-Dauer in Stunden (Pause abgezogen, ueber Mitternacht beruecksichtigt)
function dauerStunden(beginn: string, ende: string, pauseMin: number): number {
  const [bh, bm] = hhmm(beginn).split(':').map(Number);
  const [eh, em] = hhmm(ende).split(':').map(Number);
  let min = (eh * 60 + em) - (bh * 60 + bm);
  if (min <= 0) min += 24 * 60; // ueber Mitternacht
  min -= pauseMin || 0;
  return Math.max(0, min) / 60;
}

// Mitarbeiter-Name robust ermitteln (Schema-unabhaengig)
function maName(m: any): string {
  if (!m) return 'Unbesetzt';
  const v = m.vorname || m.first_name || '';
  const n = m.nachname || m.name || m.last_name || '';
  const voll = `${v} ${n}`.trim();
  if (voll) return voll;
  return m.voller_name || m.email || 'Mitarbeiter';
}

type Schicht = any;
type Mitarbeiter = any;
type Vorlage = any;

// Leere Formular-Vorlage fuer eine Schicht
function leereSchicht(datum: string, maId: string): any {
  return {
    id: null,
    mitarbeiter_id: maId,
    datum,
    beginn_um: '',
    ende_um: '',
    pause_minuten: 0,
    rolle: '',
    notiz: '',
    farbe: '#00e5ff',
  };
}

export default function SchichtplanPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string>('');
  const [ownerId, setOwnerId] = useState<string>('');
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [schichten, setSchichten] = useState<Schicht[]>([]);
  const [vorlagen, setVorlagen] = useState<Vorlage[]>([]);
  const [wochenStart, setWochenStart] = useState<Date>(montagDerWoche(new Date()));

  // Schicht-Modal
  const [schichtModal, setSchichtModal] = useState<any | null>(null);
  const [speichern, setSpeichern] = useState(false);

  // Vorlagen-Modal
  const [vorlagenModal, setVorlagenModal] = useState(false);
  const [neueVorlage, setNeueVorlage] = useState<any>({
    name: '', beginn_um: '', ende_um: '', pause_minuten: 0, farbe: '#00e5ff',
  });

  // Drag & Drop (Schicht verschieben)
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Offene Tausch-Anfragen (Chef-Bearbeitung)
  const [tauschAntraege, setTauschAntraege] = useState<any[]>([]);

  const wochenTage: Date[] = Array.from({ length: 7 }, (_, i) => addTage(wochenStart, i));

  const ladeDaten = useCallback(async () => {
    setLaden(true);
    setFehler('');
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        setFehler('Nicht angemeldet.');
        setLaden(false);
        return;
      }
      setOwnerId(uid);

      const von = ymd(wochenStart);
      const bis = ymd(addTage(wochenStart, 6));

      const [maRes, schichtRes, vorlagenRes] = await Promise.all([
        supabase.from('mitarbeiter').select('*').eq('owner_user_id', uid),
        supabase.from('hr_schichten').select('*')
          .eq('owner_user_id', uid)
          .gte('datum', von).lte('datum', bis),
        supabase.from('hr_schicht_vorlagen').select('*').eq('owner_user_id', uid),
      ]);

      const maListe = (maRes.data || []).slice().sort(
        (a: any, b: any) => maName(a).localeCompare(maName(b), 'de'),
      );
      setMitarbeiter(maListe);
      setSchichten(schichtRes.data || []);
      setVorlagen(vorlagenRes.data || []);

      // Offene Tausch-Anfragen laden (unabhaengig von der angezeigten Woche)
      const { data: tauschRows } = await supabase
        .from('hr_schicht_tausch')
        .select('id,schicht_id,von_mitarbeiter_id,grund,erstellt_am,status')
        .eq('owner_user_id', uid)
        .eq('status', 'beantragt')
        .order('erstellt_am', { ascending: true });

      const tListe = tauschRows || [];
      const schichtIds = tListe.map((t: any) => t.schicht_id).filter(Boolean);
      let schichtMap: Record<string, any> = {};
      if (schichtIds.length > 0) {
        const { data: tSchichten } = await supabase
          .from('hr_schichten')
          .select('id,datum,beginn_um,ende_um')
          .in('id', schichtIds);
        (tSchichten || []).forEach((s: any) => { schichtMap[s.id] = s; });
      }
      const angereichert = tListe.map((t: any) => {
        const s = schichtMap[t.schicht_id];
        const ma = maListe.find((m: any) => m.id === t.von_mitarbeiter_id);
        return {
          ...t,
          ma_name: ma ? maName(ma) : 'Mitarbeiter',
          datum: s?.datum || null,
          beginn_um: s?.beginn_um || null,
          ende_um: s?.ende_um || null,
          schicht_existiert: !!s,
        };
      });
      setTauschAntraege(angereichert);
    } catch (e: any) {
      setFehler(e?.message || 'Fehler beim Laden.');
    } finally {
      setLaden(false);
    }
  }, [supabase, wochenStart]);

  useEffect(() => {
    void ladeDaten();
  }, [ladeDaten]);

  // Schichten einer Zelle (Mitarbeiter x Tag) holen
  function schichtenFuer(maId: string | null, datum: string): Schicht[] {
    return schichten
      .filter((s) => (maId === null ? !s.mitarbeiter_id : s.mitarbeiter_id === maId) && s.datum === datum)
      .sort((a, b) => hhmm(a.beginn_um).localeCompare(hhmm(b.beginn_um)));
  }

  // Summe der Netto-Stunden aller Schichten eines Mitarbeiters in der angezeigten Woche
  function wochenStundenFuer(maId: string | null): number {
    return schichten
      .filter((s) => (maId === null ? !s.mitarbeiter_id : s.mitarbeiter_id === maId))
      .reduce((sum, s) => sum + dauerStunden(s.beginn_um, s.ende_um, s.pause_minuten || 0), 0);
  }

  // --- Drag & Drop: Schicht in andere Zelle ziehen (Tag/Mitarbeiter wechseln) ---
  function zellKey(maId: string | null, datum: string): string {
    return `${maId ?? ''}|${datum}`;
  }

  function onDragStartSchicht(e: React.DragEvent, s: Schicht) {
    setDraggingId(s.id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', s.id); } catch { /* ignore */ }
  }

  function onDragEndSchicht() {
    setDraggingId(null);
    setDragOverKey(null);
  }

  async function onDropZelle(maId: string | null, datum: string) {
    const id = draggingId;
    setDragOverKey(null);
    setDraggingId(null);
    if (!id) return;
    const s = schichten.find((x) => x.id === id);
    if (!s) return;
    const zielMa = maId; // null = Unbesetzt
    const unveraendert = s.datum === datum && (s.mitarbeiter_id || null) === (zielMa || null);
    if (unveraendert) return;
    try {
      const res = await supabase
        .from('hr_schichten')
        .update({ datum, mitarbeiter_id: zielMa })
        .eq('id', id);
      if (res.error) throw res.error;
      await ladeDaten();
    } catch (e: any) {
      alert('Verschieben fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  }

  // --- Tausch-Anfragen: genehmigen / ablehnen ---
  async function tauschGenehmigen(antrag: any) {
    if (!confirm('Antrag genehmigen? Die Schicht wird freigegeben (landet in "Unbesetzt") und kann per Ziehen einem anderen Mitarbeiter zugewiesen werden.')) return;
    try {
      // Schicht freigeben (nicht-destruktiv: nur Zuordnung entfernen)
      if (antrag.schicht_existiert && antrag.schicht_id) {
        const r1 = await supabase.from('hr_schichten')
          .update({ mitarbeiter_id: null })
          .eq('id', antrag.schicht_id);
        if (r1.error) throw r1.error;
      }
      const r2 = await supabase.from('hr_schicht_tausch')
        .update({ status: 'genehmigt', entschieden_am: new Date().toISOString(), entschieden_von: 'Chef (Cockpit)' })
        .eq('id', antrag.id);
      if (r2.error) throw r2.error;
      await ladeDaten();
    } catch (e: any) {
      alert('Genehmigen fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  }

  async function tauschAblehnen(antrag: any) {
    const notiz = window.prompt('Optional: kurzer Grund der Ablehnung (kann leer bleiben):', '');
    if (notiz === null) return; // Abbrechen
    try {
      const r = await supabase.from('hr_schicht_tausch')
        .update({
          status: 'abgelehnt',
          chef_notiz: notiz || null,
          entschieden_am: new Date().toISOString(),
          entschieden_von: 'Chef (Cockpit)',
        })
        .eq('id', antrag.id);
      if (r.error) throw r.error;
      await ladeDaten();
    } catch (e: any) {
      alert('Ablehnen fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  }

  // Schicht-Modal oeffnen (neu oder bearbeiten)
  function oeffneNeu(maId: string | null, datum: string) {
    setSchichtModal(leereSchicht(datum, maId || ''));
  }
  function oeffneBearbeiten(s: Schicht) {
    setSchichtModal({
      id: s.id,
      mitarbeiter_id: s.mitarbeiter_id || '',
      datum: s.datum,
      beginn_um: hhmm(s.beginn_um),
      ende_um: hhmm(s.ende_um),
      pause_minuten: s.pause_minuten || 0,
      rolle: s.rolle || '',
      notiz: s.notiz || '',
      farbe: s.farbe || '#00e5ff',
    });
  }

  // Vorlage auf das Schicht-Formular anwenden
  function wendeVorlageAn(v: Vorlage) {
    if (!schichtModal) return;
    setSchichtModal({
      ...schichtModal,
      beginn_um: hhmm(v.beginn_um),
      ende_um: hhmm(v.ende_um),
      pause_minuten: v.pause_minuten || 0,
      farbe: v.farbe || schichtModal.farbe,
      rolle: schichtModal.rolle || v.name,
    });
  }

  async function speichereSchicht() {
    if (!schichtModal) return;
    if (!schichtModal.beginn_um || !schichtModal.ende_um) {
      alert('Bitte Beginn und Ende eintragen.');
      return;
    }
    setSpeichern(true);
    try {
      const datensatz = {
        owner_user_id: ownerId,
        mitarbeiter_id: schichtModal.mitarbeiter_id || null,
        datum: schichtModal.datum,
        beginn_um: schichtModal.beginn_um,
        ende_um: schichtModal.ende_um,
        pause_minuten: Number(schichtModal.pause_minuten) || 0,
        rolle: schichtModal.rolle || null,
        notiz: schichtModal.notiz || null,
        farbe: schichtModal.farbe || '#00e5ff',
      };

      let res;
      if (schichtModal.id) {
        res = await supabase.from('hr_schichten').update(datensatz).eq('id', schichtModal.id);
      } else {
        res = await supabase.from('hr_schichten').insert(datensatz);
      }
      if (res.error) throw res.error;

      setSchichtModal(null);
      await ladeDaten();
    } catch (e: any) {
      alert('Speichern fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setSpeichern(false);
    }
  }

  async function loescheSchicht() {
    if (!schichtModal?.id) return;
    if (!confirm('Diese Schicht wirklich loeschen?')) return;
    setSpeichern(true);
    try {
      const res = await supabase.from('hr_schichten').delete().eq('id', schichtModal.id);
      if (res.error) throw res.error;
      setSchichtModal(null);
      await ladeDaten();
    } catch (e: any) {
      alert('Loeschen fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setSpeichern(false);
    }
  }

  // Datensatz aus dem aktuellen Formular bauen (fuer Kopier-Aktionen)
  function schichtDatensatzAus(datum: string) {
    return {
      owner_user_id: ownerId,
      mitarbeiter_id: schichtModal.mitarbeiter_id || null,
      datum,
      beginn_um: schichtModal.beginn_um,
      ende_um: schichtModal.ende_um,
      pause_minuten: Number(schichtModal.pause_minuten) || 0,
      rolle: schichtModal.rolle || null,
      notiz: schichtModal.notiz || null,
      farbe: schichtModal.farbe || '#00e5ff',
    };
  }

  // Diese Schicht auf alle leeren Tage der angezeigten Woche kopieren (gleicher Mitarbeiter)
  async function aufGanzeWocheKopieren() {
    if (!schichtModal) return;
    if (!schichtModal.beginn_um || !schichtModal.ende_um) {
      alert('Bitte Beginn und Ende eintragen.');
      return;
    }
    const maId = schichtModal.mitarbeiter_id || null;
    setSpeichern(true);
    try {
      const neu: any[] = [];
      for (let i = 0; i < 7; i++) {
        const datum = ymd(addTage(wochenStart, i));
        const schonDa = schichten.some(
          (s) => (maId === null ? !s.mitarbeiter_id : s.mitarbeiter_id === maId) && s.datum === datum,
        );
        if (schonDa) continue;
        neu.push(schichtDatensatzAus(datum));
      }
      if (neu.length === 0) {
        alert('In dieser Woche sind bei diesem Mitarbeiter schon an allen Tagen Schichten eingetragen.');
        setSpeichern(false);
        return;
      }
      const res = await supabase.from('hr_schichten').insert(neu);
      if (res.error) throw res.error;
      setSchichtModal(null);
      await ladeDaten();
    } catch (e: any) {
      alert('Kopieren fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setSpeichern(false);
    }
  }

  // Identische Kopie am selben Tag/Mitarbeiter anlegen (danach per Drag&Drop verschieben)
  async function duplizieren() {
    if (!schichtModal) return;
    if (!schichtModal.beginn_um || !schichtModal.ende_um) {
      alert('Bitte Beginn und Ende eintragen.');
      return;
    }
    setSpeichern(true);
    try {
      const res = await supabase.from('hr_schichten').insert(schichtDatensatzAus(schichtModal.datum));
      if (res.error) throw res.error;
      setSchichtModal(null);
      await ladeDaten();
    } catch (e: any) {
      alert('Duplizieren fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setSpeichern(false);
    }
  }

  async function speichereVorlage() {
    if (!neueVorlage.name || !neueVorlage.beginn_um || !neueVorlage.ende_um) {
      alert('Bitte Name, Beginn und Ende eintragen.');
      return;
    }
    try {
      const res = await supabase.from('hr_schicht_vorlagen').insert({
        owner_user_id: ownerId,
        name: neueVorlage.name,
        beginn_um: neueVorlage.beginn_um,
        ende_um: neueVorlage.ende_um,
        pause_minuten: Number(neueVorlage.pause_minuten) || 0,
        farbe: neueVorlage.farbe || '#00e5ff',
      });
      if (res.error) throw res.error;
      setNeueVorlage({ name: '', beginn_um: '', ende_um: '', pause_minuten: 0, farbe: '#00e5ff' });
      await ladeDaten();
    } catch (e: any) {
      alert('Vorlage speichern fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  }

  async function loescheVorlage(id: string) {
    if (!confirm('Vorlage wirklich loeschen?')) return;
    try {
      const res = await supabase.from('hr_schicht_vorlagen').delete().eq('id', id);
      if (res.error) throw res.error;
      await ladeDaten();
    } catch (e: any) {
      alert('Loeschen fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  }

  // --- Styles ---
  const card: React.CSSProperties = {
    background: BRAND.navy2,
    border: `1px solid ${BRAND.border}`,
    borderRadius: 14,
    padding: 18,
  };
  const btn: React.CSSProperties = {
    background: BRAND.cyan,
    color: BRAND.navy,
    border: 'none',
    borderRadius: 10,
    padding: '10px 16px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
  };
  const btnGhost: React.CSSProperties = {
    background: 'transparent',
    color: BRAND.textDim,
    border: `1px solid ${BRAND.border}`,
    borderRadius: 10,
    padding: '8px 14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
  };
  const inputStil: React.CSSProperties = {
    width: '100%',
    background: BRAND.navy,
    color: '#fff',
    border: `1px solid ${BRAND.border}`,
    borderRadius: 8,
    padding: '9px 10px',
    fontSize: 14,
    fontFamily: 'DM Sans, sans-serif',
    boxSizing: 'border-box',
  };
  const labelStil: React.CSSProperties = {
    display: 'block',
    color: BRAND.textDim,
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 5,
    fontFamily: 'DM Sans, sans-serif',
  };

  const heute = ymd(new Date());

  return (
    <div style={{
      background: BRAND.navy, minHeight: '100vh', color: '#fff',
      padding: '28px 24px', fontFamily: 'DM Sans, sans-serif',
    }}>
      {/* Kopf */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 14, marginBottom: 22,
      }}>
        <div>
          <h1 style={{
            margin: 0, fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 800,
            color: '#fff',
          }}>
            Schichtplanung
          </h1>
          <p style={{ margin: '4px 0 0', color: BRAND.textDim, fontSize: 14 }}>
            Wochenplan &middot; Schichten anlegen, ziehen zum Verschieben, klicken zum Bearbeiten
          </p>
        </div>
        <button style={btnGhost} onClick={() => setVorlagenModal(true)}>
          &#9881; Schichtarten verwalten
        </button>
      </div>

      {/* Wochen-Umschalter */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18,
        flexWrap: 'wrap',
      }}>
        <button style={btnGhost} onClick={() => setWochenStart(addTage(wochenStart, -7))}>
          &#9664; Vorige
        </button>
        <div style={{
          fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18,
          minWidth: 240, textAlign: 'center',
        }}>
          KW {kalenderwoche(wochenStart)} &middot; {tagMonat(wochenStart)} &ndash; {tagMonat(addTage(wochenStart, 6))}
        </div>
        <button style={btnGhost} onClick={() => setWochenStart(addTage(wochenStart, 7))}>
          N&auml;chste &#9654;
        </button>
        <button style={{ ...btnGhost, color: BRAND.gold }} onClick={() => setWochenStart(montagDerWoche(new Date()))}>
          Heute
        </button>
      </div>

      {fehler && (
        <div style={{
          ...card, borderColor: BRAND.danger, color: BRAND.danger, marginBottom: 16,
        }}>
          {fehler}
        </div>
      )}

      {!laden && tauschAntraege.length > 0 && (
        <div style={{
          ...card, marginBottom: 16,
          borderColor: 'rgba(224,162,76,0.5)',
          background: 'rgba(224,162,76,0.06)',
        }}>
          <div style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16,
            color: BRAND.warn, marginBottom: 12,
          }}>
            🔔 Offene Tausch-Anfragen ({tauschAntraege.length})
          </div>
          {tauschAntraege.map((a) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, flexWrap: 'wrap',
              padding: '10px 0', borderTop: `1px solid ${BRAND.border}`,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {a.ma_name} möchte abgeben:{' '}
                  {a.datum
                    ? `${a.datum.split('-').reverse().join('.')} · ${hhmm(a.beginn_um)}–${hhmm(a.ende_um)}`
                    : '(Schicht nicht mehr vorhanden)'}
                </div>
                {a.grund && (
                  <div style={{ fontSize: 12, color: BRAND.textDim, marginTop: 2 }}>Grund: {a.grund}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  style={{ ...btn, background: BRAND.green, padding: '8px 14px' }}
                  onClick={() => tauschGenehmigen(a)}
                >
                  Genehmigen
                </button>
                <button
                  style={{ ...btnGhost, color: BRAND.danger, borderColor: BRAND.danger }}
                  onClick={() => tauschAblehnen(a)}
                >
                  Ablehnen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {laden ? (
        <div style={{ ...card, color: BRAND.textDim }}>Lade Schichtplan&hellip;</div>
      ) : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
            <thead>
              <tr>
                <th style={{
                  position: 'sticky', left: 0, zIndex: 2, background: BRAND.navy2,
                  textAlign: 'left', padding: '14px 16px', color: BRAND.textDim,
                  fontSize: 13, fontWeight: 700, borderBottom: `1px solid ${BRAND.border}`,
                  minWidth: 170,
                }}>
                  Mitarbeiter
                </th>
                {wochenTage.map((d, i) => {
                  const istHeute = ymd(d) === heute;
                  return (
                    <th key={i} style={{
                      textAlign: 'center', padding: '12px 8px',
                      borderBottom: `1px solid ${BRAND.border}`,
                      borderLeft: `1px solid ${BRAND.border}`,
                      background: istHeute ? 'rgba(0,229,255,0.08)' : 'transparent',
                      minWidth: 100,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: istHeute ? BRAND.cyan : '#fff' }}>
                        {WOCHENTAGE[i]}
                      </div>
                      <div style={{ fontSize: 12, color: BRAND.textDim }}>{tagMonat(d)}</div>
                    </th>
                  );
                })}
                <th style={{
                  position: 'sticky', right: 0, zIndex: 2, background: BRAND.navy2,
                  textAlign: 'center', padding: '12px 12px', color: BRAND.gold,
                  fontSize: 13, fontWeight: 700, borderBottom: `1px solid ${BRAND.border}`,
                  borderLeft: `1px solid ${BRAND.border}`, minWidth: 90,
                }}>
                  &sum; Woche
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Mitarbeiter-Zeilen + Unbesetzt-Zeile */}
              {[...mitarbeiter, null].map((m, ri) => {
                const maId = m ? m.id : null;
                const istUnbesetzt = m === null;
                return (
                  <tr key={ri}>
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 1, background: BRAND.navy2,
                      padding: '12px 16px', borderBottom: `1px solid ${BRAND.border}`,
                      fontWeight: 600, fontSize: 14,
                      color: istUnbesetzt ? BRAND.warn : '#fff',
                    }}>
                      {istUnbesetzt ? '\u26A0 Unbesetzt' : maName(m)}
                      {!istUnbesetzt && m.arbeitszeit_modell && (
                        <div style={{ fontSize: 11, color: BRAND.textDim, fontWeight: 500, marginTop: 2 }}>
                          {m.arbeitszeit_modell}
                        </div>
                      )}
                    </td>
                    {wochenTage.map((d, ci) => {
                      const datum = ymd(d);
                      const zellSchichten = schichtenFuer(maId, datum);
                      const istDropZiel = dragOverKey === zellKey(maId, datum);
                      return (
                        <td
                          key={ci}
                          onDragOver={(e) => {
                            if (!draggingId) return;
                            e.preventDefault();
                            setDragOverKey(zellKey(maId, datum));
                          }}
                          onDragLeave={() => {
                            setDragOverKey((prev) => (prev === zellKey(maId, datum) ? null : prev));
                          }}
                          onDrop={() => onDropZelle(maId, datum)}
                          style={{
                            verticalAlign: 'top', padding: 6,
                            borderBottom: `1px solid ${BRAND.border}`,
                            borderLeft: `1px solid ${BRAND.border}`,
                            minWidth: 100,
                            background: istDropZiel ? 'rgba(0,229,255,0.12)' : 'transparent',
                            outline: istDropZiel ? `2px dashed ${BRAND.cyan}` : 'none',
                            outlineOffset: '-2px',
                            transition: 'background 0.12s ease',
                          }}>
                          {zellSchichten.map((s) => (
                            <button
                              key={s.id}
                              draggable
                              onDragStart={(e) => onDragStartSchicht(e, s)}
                              onDragEnd={onDragEndSchicht}
                              onClick={() => oeffneBearbeiten(s)}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                background: (s.farbe || '#00e5ff') + '22',
                                borderLeft: `3px solid ${s.farbe || '#00e5ff'}`,
                                border: 'none',
                                borderRadius: 6, padding: '6px 8px', marginBottom: 5,
                                cursor: 'grab', color: '#fff',
                                opacity: draggingId === s.id ? 0.4 : 1,
                                fontFamily: 'DM Sans, sans-serif',
                              }}
                              title={s.notiz || 'Zum Verschieben ziehen, zum Bearbeiten klicken'}
                            >
                              <div style={{ fontSize: 12, fontWeight: 700 }}>
                                {hhmm(s.beginn_um)}&ndash;{hhmm(s.ende_um)}
                              </div>
                              {s.rolle && (
                                <div style={{ fontSize: 11, color: BRAND.textDim }}>{s.rolle}</div>
                              )}
                              <div style={{ fontSize: 10, color: BRAND.textDim }}>
                                {dauerStunden(s.beginn_um, s.ende_um, s.pause_minuten || 0).toFixed(1)} h
                                {s.pause_minuten > 0 ? ` · ${s.pause_minuten} Min Pause` : ''}
                              </div>
                            </button>
                          ))}
                          <button
                            onClick={() => oeffneNeu(maId, datum)}
                            style={{
                              width: '100%', background: 'transparent',
                              border: `1px dashed ${BRAND.border}`, borderRadius: 6,
                              color: BRAND.textDim, padding: '4px 0', cursor: 'pointer',
                              fontSize: 16, lineHeight: 1, fontFamily: 'DM Sans, sans-serif',
                            }}
                            title="Schicht hinzufuegen"
                          >
                            +
                          </button>
                        </td>
                      );
                    })}
                    <td style={{
                      position: 'sticky', right: 0, zIndex: 1, background: BRAND.navy2,
                      textAlign: 'center', padding: '12px',
                      borderBottom: `1px solid ${BRAND.border}`,
                      borderLeft: `1px solid ${BRAND.border}`,
                      fontWeight: 700, fontSize: 14, color: BRAND.gold,
                    }}>
                      {wochenStundenFuer(maId).toFixed(1)} h
                    </td>
                  </tr>
                );
              })}
              {mitarbeiter.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 20, color: BRAND.textDim, textAlign: 'center' }}>
                    Noch keine Mitarbeiter angelegt. Schichten lassen sich trotzdem in der
                    Zeile &bdquo;Unbesetzt&ldquo; planen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Schicht-Modal ===== */}
      {schichtModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20, zIndex: 50,
        }} onClick={() => setSchichtModal(null)}>
          <div style={{ ...card, width: 460, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontFamily: 'Syne, sans-serif', fontSize: 20 }}>
              {schichtModal.id ? 'Schicht bearbeiten' : 'Neue Schicht'}
            </h2>

            {/* Schnellwahl Vorlage */}
            {vorlagen.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStil}>Schichtart uebernehmen</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {vorlagen.map((v) => (
                    <button key={v.id} onClick={() => wendeVorlageAn(v)} style={{
                      ...btnGhost, padding: '6px 10px', fontSize: 12,
                      borderLeft: `3px solid ${v.farbe || '#00e5ff'}`,
                    }}>
                      {v.name} ({hhmm(v.beginn_um)}&ndash;{hhmm(v.ende_um)})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={labelStil}>Mitarbeiter</label>
              <select
                style={inputStil}
                value={schichtModal.mitarbeiter_id}
                onChange={(e) => setSchichtModal({ ...schichtModal, mitarbeiter_id: e.target.value })}
              >
                <option value="">&#9888; Unbesetzt</option>
                {mitarbeiter.map((m) => (
                  <option key={m.id} value={m.id}>{maName(m)}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStil}>Datum</label>
              <input
                type="date" style={inputStil}
                value={schichtModal.datum}
                onChange={(e) => setSchichtModal({ ...schichtModal, datum: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Beginn</label>
                <input
                  type="time" style={inputStil}
                  value={schichtModal.beginn_um}
                  onChange={(e) => setSchichtModal({ ...schichtModal, beginn_um: e.target.value })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStil}>Ende</label>
                <input
                  type="time" style={inputStil}
                  value={schichtModal.ende_um}
                  onChange={(e) => setSchichtModal({ ...schichtModal, ende_um: e.target.value })}
                />
              </div>
              <div style={{ width: 90 }}>
                <label style={labelStil}>Pause (Min)</label>
                <input
                  type="number" min={0} style={inputStil}
                  value={schichtModal.pause_minuten}
                  onChange={(e) => setSchichtModal({ ...schichtModal, pause_minuten: e.target.value })}
                />
              </div>
            </div>

            {schichtModal.beginn_um && schichtModal.ende_um && (
              <div style={{ marginBottom: 12, color: BRAND.cyan, fontSize: 13, fontWeight: 600 }}>
                Netto-Arbeitszeit: {dauerStunden(schichtModal.beginn_um, schichtModal.ende_um, Number(schichtModal.pause_minuten) || 0).toFixed(2)} h
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={labelStil}>Rolle / Bezeichnung (optional)</label>
              <input
                type="text" style={inputStil}
                placeholder="z.B. Fruehschicht, Maschinenfuehrer"
                value={schichtModal.rolle}
                onChange={(e) => setSchichtModal({ ...schichtModal, rolle: e.target.value })}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStil}>Notiz (optional)</label>
              <textarea
                style={{ ...inputStil, minHeight: 56, resize: 'vertical' }}
                value={schichtModal.notiz}
                onChange={(e) => setSchichtModal({ ...schichtModal, notiz: e.target.value })}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStil}>Farbe</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {FARB_PRESETS.map((f) => (
                  <button
                    key={f.wert}
                    onClick={() => setSchichtModal({ ...schichtModal, farbe: f.wert })}
                    title={f.name}
                    style={{
                      width: 30, height: 30, borderRadius: '50%', background: f.wert,
                      border: schichtModal.farbe === f.wert ? '3px solid #fff' : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>

            {schichtModal.id && (
              <div style={{
                marginBottom: 18, paddingTop: 14,
                borderTop: `1px solid ${BRAND.border}`,
              }}>
                <label style={labelStil}>Kopieren</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    style={{ ...btnGhost, color: BRAND.cyan, borderColor: 'rgba(0,229,255,0.4)' }}
                    onClick={aufGanzeWocheKopieren} disabled={speichern}
                    title="Diese Schicht auf alle freien Tage dieser Woche legen (gleicher Mitarbeiter)"
                  >
                    📋 Auf ganze Woche
                  </button>
                  <button
                    style={btnGhost}
                    onClick={duplizieren} disabled={speichern}
                    title="Identische Kopie am selben Tag anlegen (danach per Ziehen verschieben)"
                  >
                    ⧉ Duplizieren
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
              <div>
                {schichtModal.id && (
                  <button
                    style={{ ...btnGhost, color: BRAND.danger, borderColor: BRAND.danger }}
                    onClick={loescheSchicht} disabled={speichern}
                  >
                    L&ouml;schen
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={btnGhost} onClick={() => setSchichtModal(null)} disabled={speichern}>
                  Abbrechen
                </button>
                <button style={btn} onClick={speichereSchicht} disabled={speichern}>
                  {speichern ? 'Speichert\u2026' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Vorlagen-Modal (Schichtarten verwalten) ===== */}
      {vorlagenModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20, zIndex: 50,
        }} onClick={() => setVorlagenModal(false)}>
          <div style={{ ...card, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 6px', fontFamily: 'Syne, sans-serif', fontSize: 20 }}>
              Schichtarten verwalten
            </h2>
            <p style={{ margin: '0 0 16px', color: BRAND.textDim, fontSize: 13 }}>
              Lege deine wiederkehrenden Schichten einmalig an &ndash; danach beim Planen mit einem Klick &uuml;bernehmen.
            </p>

            {/* Bestehende Vorlagen */}
            {vorlagen.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                {vorlagen.map((v) => (
                  <div key={v.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', marginBottom: 6, borderRadius: 8,
                    background: BRAND.navy, borderLeft: `3px solid ${v.farbe || '#00e5ff'}`,
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{v.name}</div>
                      <div style={{ fontSize: 12, color: BRAND.textDim }}>
                        {hhmm(v.beginn_um)}&ndash;{hhmm(v.ende_um)} &middot; {v.pause_minuten || 0} Min Pause
                      </div>
                    </div>
                    <button
                      style={{ ...btnGhost, color: BRAND.danger, borderColor: BRAND.danger, padding: '5px 10px' }}
                      onClick={() => loescheVorlage(v.id)}
                    >
                      L&ouml;schen
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Neue Vorlage */}
            <div style={{ borderTop: `1px solid ${BRAND.border}`, paddingTop: 16 }}>
              <label style={labelStil}>Neue Schichtart</label>
              <input
                type="text" style={{ ...inputStil, marginBottom: 10 }}
                placeholder="Name, z.B. Spaetschicht"
                value={neueVorlage.name}
                onChange={(e) => setNeueVorlage({ ...neueVorlage, name: e.target.value })}
              />
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStil}>Beginn</label>
                  <input
                    type="time" style={inputStil}
                    value={neueVorlage.beginn_um}
                    onChange={(e) => setNeueVorlage({ ...neueVorlage, beginn_um: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStil}>Ende</label>
                  <input
                    type="time" style={inputStil}
                    value={neueVorlage.ende_um}
                    onChange={(e) => setNeueVorlage({ ...neueVorlage, ende_um: e.target.value })}
                  />
                </div>
                <div style={{ width: 90 }}>
                  <label style={labelStil}>Pause (Min)</label>
                  <input
                    type="number" min={0} style={inputStil}
                    value={neueVorlage.pause_minuten}
                    onChange={(e) => setNeueVorlage({ ...neueVorlage, pause_minuten: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStil}>Farbe</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {FARB_PRESETS.map((f) => (
                    <button
                      key={f.wert}
                      onClick={() => setNeueVorlage({ ...neueVorlage, farbe: f.wert })}
                      title={f.name}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: f.wert,
                        border: neueVorlage.farbe === f.wert ? '3px solid #fff' : '2px solid transparent',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              </div>
              <button style={btn} onClick={speichereVorlage}>+ Schichtart speichern</button>
            </div>

            <div style={{ marginTop: 18, textAlign: 'right' }}>
              <button style={btnGhost} onClick={() => setVorlagenModal(false)}>Schliessen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
