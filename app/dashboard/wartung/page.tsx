'use client';

// ============================================================
// ARGONAUT OS · Phase 2 · Modul A · Block A.3 · Wartungsverträge (Chef-Ansicht)
// Liste wiederkehrender Wartungsverträge mit Fälligkeits-Ampel, Anlegen/
// Bearbeiten (Bestätigung vor jedem DB-Schreiben), Auto-Berechnung der
// nächsten Fälligkeit und aufklappbarem KI-Auge (on-demand) zur Gesamtlage.
// Nutzt bestehende Bausteine: FristAmpel, KiAuge, wartungsLogik.
// Design 1:1 wie arbeitszeit-nachweis/page.tsx (Inline-Styles, kein Tailwind).
// Pfad: app/dashboard/wartung/page.tsx
//
// Q4 (14.07.26): Die Zeilen-Ampel liest ihre Schwellen (gelb/rot) jetzt aus
// ampelSchwellen() in wartungsLogik — dieselbe Quelle wie die Kopf-Kacheln.
// Vorher wurden gelbAb/rotAb hier inline nochmal berechnet (Redundanz).
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import FristAmpel from '../_components/FristAmpel';
import KiAuge from '../_components/KiAuge';
import {
  naechsteFaelligkeitString,
  berechneNaechsteFaelligkeit,
  alsDatumString,
  sortierSchluessel,
  zaehleNachStatus,
  ampelSchwellen,
  type WartungBasis,
} from '../_components/wartungsLogik';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', line: 'rgba(201,168,76,0.18)',
  border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

// --- Datentyp: eine Zeile aus wartungsvertraege --------------------------
type WartungRow = WartungBasis & {
  id: string;
  owner_user_id: string;
  kunde_name: string | null;
  titel: string;
  beschreibung: string | null;
  vertragsnummer: string | null;
  status: string;
  beginn_am: string | null;
  intervall_monate: number;
  letzte_wartung_am: string | null;
  naechste_faelligkeit_am: string | null;
  erinnerung_tage_vorher: number;
  betrag_netto: number | null;
  notiz: string | null;
  archiviert: boolean;
};

// Leeres Formular (für "Neu anlegen")
type FormState = {
  id: string | null;
  titel: string;
  kunde_name: string;
  vertragsnummer: string;
  status: string;
  beginn_am: string;
  intervall_monate: string;
  letzte_wartung_am: string;
  erinnerung_tage_vorher: string;
  betrag_netto: string;
  beschreibung: string;
  notiz: string;
};

const LEER: FormState = {
  id: null, titel: '', kunde_name: '', vertragsnummer: '', status: 'aktiv',
  beginn_am: '', intervall_monate: '12', letzte_wartung_am: '',
  erinnerung_tage_vorher: '14', betrag_netto: '', beschreibung: '', notiz: '',
};

const STATUS_OPTIONEN = [
  { wert: 'aktiv', label: 'Aktiv' },
  { wert: 'pausiert', label: 'Pausiert' },
  { wert: 'gekuendigt', label: 'Gekündigt' },
  { wert: 'abgelaufen', label: 'Abgelaufen' },
];

function statusLabel(s: string): string {
  return STATUS_OPTIONEN.find((o) => o.wert === s)?.label || s;
}
function eur(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function datumHuebsch(iso: string | null): string {
  if (!iso) return '—';
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

// --- Prüfprotokoll ---------------------------------------------------------
type Pruefpunkt = { punkt: string; ok: boolean; bemerkung: string };
type HistorieRow = {
  id: string; wartungsvertrag_id: string; durchgefuehrt_am: string;
  pruefer: string | null; ergebnis: string; pruefpunkte: Pruefpunkt[] | null;
  bemerkung: string | null; naechste_faelligkeit_am: string | null; erstellt_am: string;
};

// Fertige Vorlagen — der Handwerker wählt eine und hat sofort die Punkte.
const PRUEF_VORLAGEN: { key: string; label: string; punkte: string[] }[] = [
  { key: 'dguv', label: 'DGUV V3 · Elektrische Geräte (E-Check)', punkte: [
    'Sichtprüfung Gehäuse & Leitungen', 'Schutzleiterwiderstand', 'Isolationswiderstand', 'Ersatzableitstrom / Schutzleiterstrom', 'Funktionsprüfung',
  ] },
  { key: 'heizung', label: 'Heizung / Anlage', punkte: [
    'Sichtprüfung Anlage', 'Dichtheit geprüft', 'Funktionstest', 'Verschleiß-/Filterteile geprüft', 'Einstellwerte kontrolliert',
  ] },
  { key: 'allgemein', label: 'Allgemeine Wartung', punkte: [
    'Sichtprüfung', 'Funktionsprüfung', 'Verschleißteile geprüft',
  ] },
];
const ERGEBNIS_OPTIONEN = [
  { wert: 'bestanden', label: '✅ Bestanden', farbe: '#4CAF7D' },
  { wert: 'mangel', label: '⚠️ Mangel festgestellt', farbe: '#E0A24C' },
  { wert: 'nachpruefung', label: '🔁 Nachprüfung nötig', farbe: '#E06666' },
];
function ergebnisInfo(w: string) {
  return ERGEBNIS_OPTIONEN.find((o) => o.wert === w) ?? { wert: w, label: w, farbe: '#8FA3BE' };
}

type ProtokollForm = {
  durchgefuehrt_am: string; pruefer: string; ergebnis: string;
  punkte: Pruefpunkt[]; bemerkung: string;
};

export default function WartungPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [liste, setListe] = useState<WartungRow[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zeigeArchiv, setZeigeArchiv] = useState(false);

  // Modal-Zustand
  const [modalAuf, setModalAuf] = useState(false);
  const [form, setForm] = useState<FormState>(LEER);
  const [speichert, setSpeichert] = useState(false);

  // Prüfprotokoll-Modal
  const [protokollFor, setProtokollFor] = useState<WartungRow | null>(null);
  const [protokollForm, setProtokollForm] = useState<ProtokollForm>({ durchgefuehrt_am: '', pruefer: '', ergebnis: 'bestanden', punkte: [], bemerkung: '' });
  const [protokollBusy, setProtokollBusy] = useState(false);

  // Historie-Modal
  const [historieFor, setHistorieFor] = useState<WartungRow | null>(null);
  const [historieRows, setHistorieRows] = useState<HistorieRow[]>([]);
  const [historieBusy, setHistorieBusy] = useState(false);

  // Angemeldeten Chef ermitteln
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
      // Kein owner_user_id-Filter mehr: RLS entscheidet, welche Zeilen sichtbar sind.
    // Chef sieht seine (Policy auth.uid()=owner_user_id), Mitarbeiter die seines
    // Chefs (Policy owner_user_id=mein_chef_id()). Genau wie ERP/Inventar.
      const { data, error } = await supabase
        .from('wartungsvertraege')
        .select('*')
        .eq('archiviert', zeigeArchiv)
        .order('naechste_faelligkeit_am', { ascending: true, nullsFirst: false });
      if (error) throw error;
      const rows = (data as WartungRow[]) ?? [];
      // Dringendste zuerst (nutzt wartungsLogik)
      rows.sort((a, b) => sortierSchluessel(a) - sortierSchluessel(b));
      setListe(rows);
    } catch (e: unknown) {
      setFehler('Verträge konnten nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
      setListe([]);
    } finally { setLaden(false); }
  }, [uid, zeigeArchiv]);

  useEffect(() => { void laden_(); }, [laden_]);

  // --- Modal öffnen: leer (neu) oder befüllt (bearbeiten) -----------------
  function neuOeffnen() { setForm(LEER); setModalAuf(true); }
  function bearbeiten(r: WartungRow) {
    setForm({
      id: r.id,
      titel: r.titel ?? '',
      kunde_name: r.kunde_name ?? '',
      vertragsnummer: r.vertragsnummer ?? '',
      status: r.status ?? 'aktiv',
      beginn_am: r.beginn_am ?? '',
      intervall_monate: String(r.intervall_monate ?? 12),
      letzte_wartung_am: r.letzte_wartung_am ?? '',
      erinnerung_tage_vorher: String(r.erinnerung_tage_vorher ?? 14),
      betrag_netto: r.betrag_netto != null ? String(r.betrag_netto) : '',
      beschreibung: r.beschreibung ?? '',
      notiz: r.notiz ?? '',
    });
    setModalAuf(true);
  }

  function setF<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // --- Speichern (mit Bestätigung vor DB-Schreiben) -----------------------
  async function speichern() {
    if (!uid) return;
    if (!form.titel.trim()) { setFehler('Bitte einen Titel eingeben.'); return; }

    const intervall = parseInt(form.intervall_monate, 10);
    const erinnerung = parseInt(form.erinnerung_tage_vorher, 10);
    const betrag = form.betrag_netto.trim() === '' ? null : Number(form.betrag_netto.replace(',', '.'));

    // Nächste Fälligkeit aus den Formulardaten berechnen
    const basis: WartungBasis = {
      beginn_am: form.beginn_am || null,
      letzte_wartung_am: form.letzte_wartung_am || null,
      intervall_monate: Number.isFinite(intervall) && intervall > 0 ? intervall : 12,
      erinnerung_tage_vorher: Number.isFinite(erinnerung) ? erinnerung : 14,
      status: form.status,
    };
    const naechste = naechsteFaelligkeitString(basis);

    const istNeu = !form.id;
    const frage = istNeu
      ? `Neuen Wartungsvertrag anlegen?\n\n• ${form.titel}\n• Intervall: alle ${basis.intervall_monate} Monate\n• Nächste Fälligkeit: ${naechste ? datumHuebsch(naechste) : 'noch offen (kein Startdatum)'}`
      : `Änderungen speichern?\n\n• ${form.titel}\n• Nächste Fälligkeit: ${naechste ? datumHuebsch(naechste) : 'noch offen (kein Startdatum)'}`;
    if (!window.confirm(frage)) return;

    setSpeichert(true); setFehler(null);
    try {
      const payload = {
        owner_user_id: uid,
        titel: form.titel.trim(),
        kunde_name: form.kunde_name.trim() || null,
        vertragsnummer: form.vertragsnummer.trim() || null,
        status: form.status,
        beginn_am: form.beginn_am || null,
        intervall_monate: basis.intervall_monate,
        letzte_wartung_am: form.letzte_wartung_am || null,
        naechste_faelligkeit_am: naechste,
        erinnerung_tage_vorher: basis.erinnerung_tage_vorher,
        betrag_netto: betrag != null && Number.isFinite(betrag) ? betrag : null,
        beschreibung: form.beschreibung.trim() || null,
        notiz: form.notiz.trim() || null,
        aktualisiert_am: new Date().toISOString(),
      };

      if (istNeu) {
        const { error } = await supabase.from('wartungsvertraege').insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('wartungsvertraege').update(payload).eq('id', form.id);
        if (error) throw error;
      }
      setModalAuf(false);
      setForm(LEER);
      await laden_();
    } catch (e: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setSpeichert(false); }
  }

  // --- Prüfprotokoll: Modal öffnen ---------------------------------------
  function protokollOeffnen(r: WartungRow) {
    setProtokollFor(r);
    setProtokollForm({ durchgefuehrt_am: alsDatumString(new Date()) ?? '', pruefer: '', ergebnis: 'bestanden', punkte: [], bemerkung: '' });
  }
  function vorlageWaehlen(key: string) {
    const v = PRUEF_VORLAGEN.find((x) => x.key === key);
    setProtokollForm((f) => ({ ...f, punkte: v ? v.punkte.map((p) => ({ punkt: p, ok: true, bemerkung: '' })) : [] }));
  }
  function punktSetzen(i: number, teil: Partial<Pruefpunkt>) {
    setProtokollForm((f) => ({ ...f, punkte: f.punkte.map((p, idx) => (idx === i ? { ...p, ...teil } : p)) }));
  }
  function punktEntfernen(i: number) {
    setProtokollForm((f) => ({ ...f, punkte: f.punkte.filter((_, idx) => idx !== i) }));
  }
  function punktHinzu() {
    setProtokollForm((f) => ({ ...f, punkte: [...f.punkte, { punkt: '', ok: true, bemerkung: '' }] }));
  }

  // --- Prüfprotokoll speichern: Historie-Eintrag + Fälligkeit fortschreiben
  async function protokollSpeichern() {
    if (!uid || !protokollFor) return;
    const r = protokollFor;
    const durchgefuehrt = protokollForm.durchgefuehrt_am || alsDatumString(new Date()) || '';
    const basis: WartungBasis = { ...r, letzte_wartung_am: durchgefuehrt };
    const naechste = naechsteFaelligkeitString(basis);
    const punkte = protokollForm.punkte.filter((p) => p.punkt.trim() !== '');
    setProtokollBusy(true); setFehler(null);
    try {
      const { error: hErr } = await supabase.from('wartungshistorie').insert({
        owner_user_id: uid,
        wartungsvertrag_id: r.id,
        durchgefuehrt_am: durchgefuehrt,
        pruefer: protokollForm.pruefer.trim() || null,
        ergebnis: protokollForm.ergebnis,
        pruefpunkte: punkte,
        bemerkung: protokollForm.bemerkung.trim() || null,
        naechste_faelligkeit_am: naechste,
        erstellt_von: uid,
      });
      if (hErr) throw hErr;
      const { error: vErr } = await supabase.from('wartungsvertraege')
        .update({ letzte_wartung_am: durchgefuehrt, naechste_faelligkeit_am: naechste, erinnerung_gesendet_am: null, aktualisiert_am: new Date().toISOString() })
        .eq('id', r.id);
      if (vErr) throw vErr;
      setProtokollFor(null);
      await laden_();
    } catch (e: unknown) {
      setFehler('Protokoll konnte nicht gespeichert werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setProtokollBusy(false); }
  }

  // --- Historie eines Vertrags laden -------------------------------------
  async function historieOeffnen(r: WartungRow) {
    setHistorieFor(r); setHistorieRows([]); setHistorieBusy(true); setFehler(null);
    try {
      const { data, error } = await supabase.from('wartungshistorie')
        .select('id, wartungsvertrag_id, durchgefuehrt_am, pruefer, ergebnis, pruefpunkte, bemerkung, naechste_faelligkeit_am, erstellt_am')
        .eq('wartungsvertrag_id', r.id)
        .order('durchgefuehrt_am', { ascending: false });
      if (error) throw error;
      setHistorieRows((data as HistorieRow[]) ?? []);
    } catch (e: unknown) {
      setFehler('Historie konnte nicht geladen werden: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setHistorieBusy(false); }
  }

  // --- Archivieren (kein hartes Löschen) ----------------------------------
  async function archivieren(r: WartungRow) {
    if (!window.confirm(`Vertrag "${r.titel}" archivieren?\n\nEr wird ausgeblendet, aber nicht gelöscht und kann über "Archiv anzeigen" wieder eingeblendet werden.`)) return;
    try {
      const { error } = await supabase.from('wartungsvertraege')
        .update({ archiviert: true, aktualisiert_am: new Date().toISOString() }).eq('id', r.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) {
      setFehler('Archivieren fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }
  async function reaktivieren(r: WartungRow) {
    try {
      const { error } = await supabase.from('wartungsvertraege')
        .update({ archiviert: false, aktualisiert_am: new Date().toISOString() }).eq('id', r.id);
      if (error) throw error;
      await laden_();
    } catch (e: unknown) {
      setFehler('Reaktivieren fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    }
  }

  const summe = zaehleNachStatus(liste);
  const kiKontext = liste.length === 0
    ? ''
    : `${liste.length} aktive Wartungsverträge. ${summe.rot} überfällig oder in ≤7 Tagen fällig, ${summe.gelb} in Erinnerungsfenster, ${summe.gruen} unkritisch.`;

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Service</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.h1}>Wartungsverträge</h1>
          <p style={styles.sub}>Wiederkehrende Wartungen mit automatischer Fälligkeits-Berechnung und Erinnerungs-Ampel.</p>
        </div>
        <button onClick={neuOeffnen} style={styles.primaerBtn}>+ Neuer Vertrag</button>
      </div>

      {/* Kopf-Kacheln */}
      {!laden && !zeigeArchiv && (
        <div style={styles.summenGrid}>
          <SummeKarte label="Verträge" value={String(liste.length)} accent={C.cyan} />
          <SummeKarte label="Überfällig / dringend" value={String(summe.rot)} accent={summe.rot > 0 ? C.danger : C.green} />
          <SummeKarte label="Bald fällig" value={String(summe.gelb)} accent={summe.gelb > 0 ? C.warn : C.green} />
          <SummeKarte label="Unkritisch" value={String(summe.gruen)} accent={C.green} />
        </div>
      )}

      {/* KI-Auge zur Gesamtlage (on-demand, startet erst beim Aufklappen) */}
      {!laden && !zeigeArchiv && kiKontext && (
        <KiAuge
          modul="Wartungsverträge"
          kontext={kiKontext}
          aktionHref="/dashboard/wartung"
          aktionText="Zu den Wartungsverträgen"
        />
      )}

      {/* Archiv-Umschalter */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <button onClick={() => setZeigeArchiv((v) => !v)} style={styles.ghostBtn}>
          {zeigeArchiv ? '← Zurück zu aktiven Verträgen' : 'Archiv anzeigen'}
        </button>
      </div>

      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Liste */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>{zeigeArchiv ? 'Archivierte Verträge' : 'Aktuelle Verträge · dringendste zuerst'}</h2>
        {laden ? (
          <div style={styles.hint}>Lädt …</div>
        ) : liste.length === 0 ? (
          <div style={styles.hint}>
            {zeigeArchiv ? 'Keine archivierten Verträge.' : 'Noch keine Wartungsverträge angelegt. Leg oben rechts den ersten an.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Vertrag</th>
                  <th style={styles.th}>Kunde</th>
                  <th style={styles.th}>Intervall</th>
                  <th style={styles.th}>Nächste Fälligkeit</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Netto</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((r) => {
                  const aktiv = r.status === 'aktiv';
                  const anzeigeDatum = aktiv
                    ? (r.naechste_faelligkeit_am ?? alsDatumString(berechneNaechsteFaelligkeit(r)))
                    : null;
                  // Q4: Schwellen aus der EINEN Quelle (wie die Kopf-Kacheln), nicht mehr inline.
                  const { gelbAb, rotAb } = ampelSchwellen(r);
                  return (
                    <tr key={r.id}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: 600 }}>{r.titel}</div>
                        <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, marginTop: 2 }}>
                          {r.vertragsnummer ? `Nr. ${r.vertragsnummer} · ` : ''}{statusLabel(r.status)}
                        </div>
                      </td>
                      <td style={styles.td}>{r.kunde_name || '—'}</td>
                      <td style={styles.td}>alle {r.intervall_monate} Mon.</td>
                      <td style={styles.td}>
                        <div style={{ marginBottom: 4 }}>{datumHuebsch(anzeigeDatum)}</div>
                        <FristAmpel datum={anzeigeDatum} gelbAbTagen={gelbAb} rotAbTagen={rotAb} dunkel variante="punkt" />
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{eur(r.betrag_netto)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {!zeigeArchiv && aktiv && (
                          <button onClick={() => protokollOeffnen(r)} style={styles.miniBtn} title="Wartung durchführen & Prüfprotokoll erfassen">✓ Wartung + Protokoll</button>
                        )}
                        <button onClick={() => historieOeffnen(r)} style={styles.miniBtnGhost} title="Bisherige Wartungen & Protokolle">Historie</button>
                        <button onClick={() => bearbeiten(r)} style={styles.miniBtnGhost}>Bearbeiten</button>
                        {zeigeArchiv ? (
                          <button onClick={() => reaktivieren(r)} style={styles.miniBtnGhost}>Reaktivieren</button>
                        ) : (
                          <button onClick={() => archivieren(r)} style={styles.miniBtnGhost}>Archiv</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={styles.rechtHinweis}>
        Die nächste Fälligkeit wird automatisch aus letzter Wartung (bzw. Vertragsbeginn) und Intervall berechnet und bei „✓ Gewartet" fortgeschrieben.
      </div>

      {/* --- Modal: Anlegen/Bearbeiten --------------------------------- */}
      {modalAuf && (
        <div style={styles.overlay} onClick={() => !speichert && setModalAuf(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>{form.id ? 'Vertrag bearbeiten' : 'Neuer Wartungsvertrag'}</h2>

            <div style={styles.formGrid}>
              <Feld label="Titel *" voll>
                <input style={styles.input} value={form.titel} onChange={(e) => setF('titel', e.target.value)} placeholder="z. B. Wartung Heizungsanlage Halle 2" />
              </Feld>
              <Feld label="Kunde">
                <input style={styles.input} value={form.kunde_name} onChange={(e) => setF('kunde_name', e.target.value)} placeholder="Name (frei)" />
              </Feld>
              <Feld label="Vertragsnummer">
                <input style={styles.input} value={form.vertragsnummer} onChange={(e) => setF('vertragsnummer', e.target.value)} />
              </Feld>
              <Feld label="Status">
                <select style={styles.input} value={form.status} onChange={(e) => setF('status', e.target.value)}>
                  {STATUS_OPTIONEN.map((o) => <option key={o.wert} value={o.wert}>{o.label}</option>)}
                </select>
              </Feld>
              <Feld label="Intervall (Monate)">
                <input type="number" min={1} style={styles.input} value={form.intervall_monate} onChange={(e) => setF('intervall_monate', e.target.value)} />
              </Feld>
              <Feld label="Vertragsbeginn">
                <input type="date" style={styles.input} value={form.beginn_am} onChange={(e) => setF('beginn_am', e.target.value)} />
              </Feld>
              <Feld label="Letzte Wartung">
                <input type="date" style={styles.input} value={form.letzte_wartung_am} onChange={(e) => setF('letzte_wartung_am', e.target.value)} />
              </Feld>
              <Feld label="Erinnerung (Tage vorher)">
                <input type="number" min={0} style={styles.input} value={form.erinnerung_tage_vorher} onChange={(e) => setF('erinnerung_tage_vorher', e.target.value)} />
              </Feld>
              <Feld label="Betrag netto (€)">
                <input style={styles.input} value={form.betrag_netto} onChange={(e) => setF('betrag_netto', e.target.value)} placeholder="z. B. 1200" />
              </Feld>
              <Feld label="Beschreibung" voll>
                <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} value={form.beschreibung} onChange={(e) => setF('beschreibung', e.target.value)} />
              </Feld>
              <Feld label="Interne Notiz" voll>
                <textarea style={{ ...styles.input, minHeight: 50, resize: 'vertical' }} value={form.notiz} onChange={(e) => setF('notiz', e.target.value)} />
              </Feld>
            </div>

            <div style={styles.modalAktionen}>
              <button onClick={() => setModalAuf(false)} disabled={speichert} style={styles.ghostBtn}>Abbrechen</button>
              <button onClick={speichern} disabled={speichert} style={{ ...styles.primaerBtn, opacity: speichert ? 0.6 : 1 }}>
                {speichert ? 'Speichert …' : (form.id ? 'Speichern' : 'Anlegen')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Modal: Wartung durchführen + Prüfprotokoll ---------------- */}
      {protokollFor && (
        <div style={styles.overlay} onClick={() => !protokollBusy && setProtokollFor(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>Wartung + Prüfprotokoll</h2>
            <p style={{ color: C.textDim, fontSize: 'clamp(13.5px, 1.19vw, 19px)', margin: '0 0 16px' }}>
              {protokollFor.titel}{protokollFor.kunde_name ? ` · ${protokollFor.kunde_name}` : ''}
            </p>

            <div style={styles.formGrid}>
              <Feld label="Durchgeführt am">
                <input type="date" style={styles.input} value={protokollForm.durchgefuehrt_am} onChange={(e) => setProtokollForm((f) => ({ ...f, durchgefuehrt_am: e.target.value }))} />
              </Feld>
              <Feld label="Prüfer / Monteur">
                <input style={styles.input} value={protokollForm.pruefer} onChange={(e) => setProtokollForm((f) => ({ ...f, pruefer: e.target.value }))} placeholder="Name" />
              </Feld>
              <Feld label="Prüf-Vorlage (füllt die Punkte)" voll>
                <select style={styles.input} onChange={(e) => vorlageWaehlen(e.target.value)} defaultValue="">
                  <option value="">— Vorlage wählen —</option>
                  {PRUEF_VORLAGEN.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                </select>
              </Feld>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={styles.lbl}>Prüfpunkte</label>
                <button onClick={punktHinzu} style={styles.miniBtnGhost}>+ Punkt</button>
              </div>
              {protokollForm.punkte.length === 0 ? (
                <div style={{ ...styles.hint, padding: '6px 0' }}>Wähle oben eine Vorlage oder füge einzelne Punkte hinzu.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {protokollForm.punkte.map((p, i) => (
                    <div key={i} style={styles.punktZeile}>
                      <button onClick={() => punktSetzen(i, { ok: !p.ok })} title={p.ok ? 'in Ordnung' : 'Mangel'}
                        style={{ ...styles.okBtn, background: p.ok ? 'rgba(76,175,125,0.15)' : 'rgba(224,102,102,0.15)', color: p.ok ? C.green : C.danger, borderColor: p.ok ? C.green : C.danger }}>
                        {p.ok ? '✓' : '✗'}
                      </button>
                      <input style={{ ...styles.input, flex: 2, minWidth: 0 }} value={p.punkt} onChange={(e) => punktSetzen(i, { punkt: e.target.value })} placeholder="Prüfpunkt" />
                      <input style={{ ...styles.input, flex: 2, minWidth: 0 }} value={p.bemerkung} onChange={(e) => punktSetzen(i, { bemerkung: e.target.value })} placeholder="Bemerkung (optional)" />
                      <button onClick={() => punktEntfernen(i)} style={styles.punktDel} title="Entfernen">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ ...styles.formGrid, marginTop: 16 }}>
              <Feld label="Gesamtergebnis">
                <select style={styles.input} value={protokollForm.ergebnis} onChange={(e) => setProtokollForm((f) => ({ ...f, ergebnis: e.target.value }))}>
                  {ERGEBNIS_OPTIONEN.map((o) => <option key={o.wert} value={o.wert}>{o.label}</option>)}
                </select>
              </Feld>
              <Feld label="Bemerkung" voll>
                <textarea style={{ ...styles.input, minHeight: 54, resize: 'vertical' }} value={protokollForm.bemerkung} onChange={(e) => setProtokollForm((f) => ({ ...f, bemerkung: e.target.value }))} placeholder="Festgestellte Mängel, empfohlene Maßnahmen …" />
              </Feld>
            </div>

            <div style={styles.modalAktionen}>
              <button onClick={() => setProtokollFor(null)} disabled={protokollBusy} style={styles.ghostBtn}>Abbrechen</button>
              <button onClick={protokollSpeichern} disabled={protokollBusy} style={{ ...styles.primaerBtn, opacity: protokollBusy ? 0.6 : 1 }}>
                {protokollBusy ? 'Speichert …' : 'Protokoll speichern & Fälligkeit fortschreiben'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Modal: Historie ------------------------------------------- */}
      {historieFor && (
        <div style={styles.overlay} onClick={() => setHistorieFor(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitel}>Historie · {historieFor.titel}</h2>
            {historieBusy ? (
              <div style={styles.hint}>Lädt …</div>
            ) : historieRows.length === 0 ? (
              <div style={styles.hint}>Noch keine Wartung dokumentiert. Über „✓ Wartung + Protokoll" den ersten Eintrag anlegen.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {historieRows.map((h) => {
                  const ei = ergebnisInfo(h.ergebnis);
                  return (
                    <div key={h.id} style={styles.histBox}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700 }}>{datumHuebsch(h.durchgefuehrt_am)}{h.pruefer ? ` · ${h.pruefer}` : ''}</div>
                        <span style={{ ...styles.ergebnisBadge, color: ei.farbe, borderColor: ei.farbe }}>{ei.label}</span>
                      </div>
                      {Array.isArray(h.pruefpunkte) && h.pruefpunkte.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {h.pruefpunkte.map((p, i) => (
                            <div key={i} style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: C.text }}>
                              <span style={{ color: p.ok ? C.green : C.danger, fontWeight: 700 }}>{p.ok ? '✓' : '✗'}</span> {p.punkt}
                              {p.bemerkung ? <span style={{ color: C.textDim }}> — {p.bemerkung}</span> : null}
                            </div>
                          ))}
                        </div>
                      )}
                      {h.bemerkung && <div style={{ marginTop: 8, color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', lineHeight: 1.5 }}>{h.bemerkung}</div>}
                      <div style={{ marginTop: 8, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim }}>
                        Nächste Fälligkeit danach: {datumHuebsch(h.naechste_faelligkeit_am)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={styles.modalAktionen}>
              <button onClick={() => setHistorieFor(null)} style={styles.ghostBtn}>Schließen</button>
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
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(30px, 2.63vw, 42px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '6px 0 22px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 640, lineHeight: 1.5 },

  primaerBtn: { background: C.gold, color: '#0A1628', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 16px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit', cursor: 'pointer' },
  miniBtn: { background: 'rgba(0,229,255,0.12)', color: C.cyan, border: `1px solid rgba(0,229,255,0.3)`, borderRadius: 8, padding: '5px 10px', fontSize: 'clamp(12.5px, 1.13vw, 18px)', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', marginLeft: 6 },
  miniBtnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 'clamp(12.5px, 1.13vw, 18px)', fontFamily: 'inherit', cursor: 'pointer', marginLeft: 6 },

  summenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 },
  summeBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' },
  summeLabel: { fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  summeValue: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(24px, 2.13vw, 34px)', fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitle: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(17px, 1.5vw, 24px)', fontWeight: 700, margin: '0 0 14px', color: C.text },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '11px 10px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)', verticalAlign: 'top' },

  hint: { color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)', padding: '14px 0' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  rechtHinweis: { marginTop: 16, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, lineHeight: 1.5, maxWidth: 720 },

  // Modal
  overlay: { position: 'fixed', inset: 0, background: 'rgba(4,10,20,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { background: C.navy2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: '100%', maxWidth: 640, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
  modalTitel: { fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 800, margin: '0 0 18px', color: C.text },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  lbl: { display: 'block', fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 'clamp(14px, 1.25vw, 20px)', fontFamily: 'inherit' },
  modalAktionen: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 },

  punktZeile: { display: 'flex', alignItems: 'center', gap: 8 },
  okBtn: { flexShrink: 0, width: 40, height: 40, borderRadius: 10, border: '1px solid', fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  punktDel: { flexShrink: 0, width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.danger, fontSize: 'clamp(13px, 1.13vw, 18px)', cursor: 'pointer', fontFamily: 'inherit' },
  histBox: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' },
  ergebnisBadge: { fontSize: 'clamp(12px, 1.06vw, 17px)', fontWeight: 700, border: '1px solid', borderRadius: 999, padding: '3px 12px', whiteSpace: 'nowrap' },
};
