'use client';

// ============================================================
// ARGONAUT OS · Personal-Dokumente (Paket PF · B10)
//   1. Verträge & Fristen: Nachweis nach NachwG (Checkliste mit Fristen),
//      Probezeit, Befristung, Beschäftigungsbestätigung
//   2. Arbeitszeugnis: Entwurf nach vorgegebener Note (KI formuliert nur)
//   3. Stellenanzeige: Entwurf + AGG-Prüfung
//
// Logik: lib/personalDokumente.ts (getestet). Tabelle: personal_vertrag
// (nur Chef). Die Tabelle mitarbeiter wird hier NUR gelesen.
// Anwalt-Punkt R16: Vertrags-Checkliste und Zeugnis-Vorgaben absegnen.
//
// Pfad: app/dashboard/personal/dokumente/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties, type ReactNode } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { heuteIso } from '@/lib/nachweisMotor';
import {
  NACHWEIS_PUNKTE, FRIST_TEXT, NOTEN, nachweisStand, warnungen, beschaeftigungsbestaetigung,
  aggPruefung, datumDe, istIso, fristEnde, type Vertrag,
} from '@/lib/personalDokumente';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const STUFE_FARBE = { rot: C.danger, gelb: C.warn, info: C.cyan } as const;

type MA = { id: string; vorname: string | null; nachname: string | null; position: string | null; eintrittsdatum: string | null; geburtsdatum: string | null; wochenstunden: number | null; status: string | null };
type VertragZeile = Vertrag & { id?: string; mitarbeiter_id: string; notiz?: string | null; nachweis_erteilt_am?: string | null };
type Tab = 'vertraege' | 'zeugnis' | 'stelle';

const AUSGESCHIEDEN = /ausgeschieden|inaktiv|beendet|gekuendigt|gekündigt/i;
const nameVon = (m: MA) => `${m.vorname ?? ''} ${m.nachname ?? ''}`.trim() || 'Ohne Namen';

export default function PersonalDokumentePage() {
  const [tab, setTab] = useState<Tab>('vertraege');
  const [uid, setUid] = useState<string | null>(null);
  const [firma, setFirma] = useState('');
  const [ma, setMa] = useState<MA[]>([]);
  const [vertraege, setVertraege] = useState<Record<string, VertragZeile>>({});
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [tabelleFehlt, setTabelleFehlt] = useState(false);
  const heute = heuteIso(new Date());

  const load = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setFehler('Bitte neu einloggen.'); return; }
      setUid(user.id);
      const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', user.id).maybeSingle();
      setFirma((p as { firma_name?: string } | null)?.firma_name ?? '');
      const { data: m, error: e1 } = await supabase.from('mitarbeiter')
        .select('id,vorname,nachname,position,eintrittsdatum,geburtsdatum,wochenstunden,status')
        .order('nachname', { ascending: true });
      if (e1) throw e1;
      setMa((m as MA[]) ?? []);
      const { data: v, error: e2 } = await supabase.from('personal_vertrag').select('*');
      if (e2) {
        if (/personal_vertrag/.test(e2.message)) setTabelleFehlt(true); else throw e2;
      } else {
        setTabelleFehlt(false);
        const map: Record<string, VertragZeile> = {};
        for (const r of (v as VertragZeile[]) ?? []) map[r.mitarbeiter_id] = r;
        setVertraege(map);
      }
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Laden fehlgeschlagen.');
    } finally { setLaden(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={S.page}>
      <div style={S.eyebrow}>ARGONAUT OS · HR</div>
      <h1 style={S.h1}>Personal-Dokumente</h1>
      <p style={S.sub}>Nachweis der Arbeitsbedingungen, Fristen, Zeugnisse und Stellenanzeigen. <a href="/dashboard/personal" style={{ color: C.cyan }}>← zurück zu Personal</a></p>

      <div style={S.hinweis}>
        Arbeitshilfe, keine Rechtsberatung. Grundlage: Nachweisgesetz, Teilzeit- und Befristungsgesetz, § 622 BGB, § 109 GewO, AGG.
        Vertragsmuster und Zeugnisse bitte vor der ersten Nutzung von Ihrem Anwalt prüfen lassen.
      </div>

      <div style={S.tabs}>
        {([['vertraege', '📄 Verträge & Fristen'], ['zeugnis', '🎓 Arbeitszeugnis'], ['stelle', '📣 Stellenanzeige']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...S.tab, ...(tab === k ? S.tabAktiv : {}) }}>{l}</button>
        ))}
      </div>

      {fehler && <div style={S.fehler}>{fehler}</div>}
      {laden ? <p style={{ color: C.textDim }}>Lädt …</p> : (
        <>
          {tab === 'vertraege' && (tabelleFehlt
            ? <div style={S.fehler}>Die Tabelle personal_vertrag fehlt noch. Bitte zuerst das SQL aus Paket PF in Supabase ausführen.</div>
            : <Vertraege ma={ma} vertraege={vertraege} uid={uid} firma={firma} heute={heute} onGespeichert={load} />)}
          {tab === 'zeugnis' && <Zeugnis ma={ma} vertraege={vertraege} firma={firma} />}
          {tab === 'stelle' && <Stelle firma={firma} />}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 1. Verträge & Fristen
// ------------------------------------------------------------
function Vertraege({ ma, vertraege, uid, firma, heute, onGespeichert }: {
  ma: MA[]; vertraege: Record<string, VertragZeile>; uid: string | null; firma: string; heute: string; onGespeichert: () => void;
}) {
  const [offen, setOffen] = useState<string | null>(null);
  const [alle, setAlle] = useState(false);
  const aktive = ma.filter((m) => alle || !AUSGESCHIEDEN.test(String(m.status ?? '')));
  if (!ma.length) return <p style={{ color: C.textDim }}>Noch keine Mitarbeitenden angelegt. Das geht unter Personal.</p>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <label style={{ ...S.check, color: C.textDim, fontSize: 13 }}><input type="checkbox" checked={alle} onChange={(e) => setAlle(e.target.checked)} /> auch Ausgeschiedene zeigen</label>
      {aktive.map((m) => {
        const v: VertragZeile = vertraege[m.id] ?? { mitarbeiter_id: m.id, beginn: m.eintrittsdatum };
        const eff: Vertrag = { ...v, beginn: v.beginn || m.eintrittsdatum };
        const stand = nachweisStand(eff, heute);
        const w = warnungen(eff, heute).filter((x) => x.stufe !== 'info');
        const rot = stand.ueberfaellig.length > 0 || w.some((x) => x.stufe === 'rot');
        const gelb = !rot && (w.length > 0 || stand.offen.length > 0);
        return (
          <div key={m.id} style={{ ...S.karte, borderLeft: `4px solid ${rot ? C.danger : gelb ? C.warn : C.green}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{nameVon(m)}</div>
                <div style={{ color: C.textDim, fontSize: 13 }}>
                  {m.position || 'Ohne Position'} · seit {datumDe(eff.beginn)} · Nachweis {stand.erledigt}/{stand.gesamt}
                  {stand.ueberfaellig.length > 0 && <span style={{ color: C.danger }}> · {stand.ueberfaellig.length} überfällig</span>}
                  {v.befristet && <span> · befristet bis {datumDe(v.befristet_bis)}</span>}
                </div>
                {w.map((x, i) => <div key={i} style={{ color: STUFE_FARBE[x.stufe], fontSize: 13, marginTop: 4 }}>{x.stufe === 'rot' ? '⛔' : '⚠️'} {x.text}</div>)}
              </div>
              <button style={S.knopf2} onClick={() => setOffen(offen === m.id ? null : m.id)}>{offen === m.id ? 'Schließen' : 'Bearbeiten'}</button>
            </div>
            {offen === m.id && <VertragForm m={m} v={v} uid={uid} firma={firma} heute={heute} onGespeichert={() => { onGespeichert(); }} />}
          </div>
        );
      })}
    </div>
  );
}

function VertragForm({ m, v, uid, firma, heute, onGespeichert }: {
  m: MA; v: VertragZeile; uid: string | null; firma: string; heute: string; onGespeichert: () => void;
}) {
  const [f, setF] = useState({
    beginn: v.beginn || m.eintrittsdatum || '',
    probezeit_monate: v.probezeit_monate != null ? String(v.probezeit_monate) : '6',
    befristet: !!v.befristet,
    befristet_bis: v.befristet_bis || '',
    sachgrund: v.sachgrund || '',
    erstbefristung_beginn: v.erstbefristung_beginn || '',
    verlaengerungen: String(v.verlaengerungen ?? 0),
    abruf: !!v.abruf,
    altersversorgung: !!v.altersversorgung,
    punkte: new Set<string>(Array.isArray(v.nachweis_punkte) ? v.nachweis_punkte : []),
    notiz: v.notiz || '',
  });
  const [speichert, setSpeichert] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [ort, setOrt] = useState('');
  const [ungekuendigt, setUngekuendigt] = useState(true);
  const [bestaetigung, setBestaetigung] = useState<string | null>(null);

  const eff: Vertrag = {
    beginn: f.beginn || null, probezeit_monate: Number(f.probezeit_monate) || 0, befristet: f.befristet,
    befristet_bis: f.befristet_bis || null, sachgrund: f.sachgrund, erstbefristung_beginn: f.erstbefristung_beginn || null,
    verlaengerungen: Number(f.verlaengerungen) || 0, abruf: f.abruf, altersversorgung: f.altersversorgung, nachweis_punkte: [...f.punkte],
  };
  const stand = nachweisStand(eff, heute);
  const alle = warnungen(eff, heute);
  const ueber = new Set(stand.ueberfaellig.map((p) => p.key));
  const relevant = NACHWEIS_PUNKTE.filter((p) => !p.nurWenn || (p.nurWenn === 'befristet' ? f.befristet : p.nurWenn === 'abruf' ? f.abruf : f.altersversorgung));

  const umschalten = (k: string) => setF((alt) => { const n = new Set(alt.punkte); if (n.has(k)) n.delete(k); else n.add(k); return { ...alt, punkte: n }; });

  async function speichern() {
    if (!uid) return;
    for (const [feld, wert] of [['Beginn', f.beginn], ['Befristet bis', f.befristet_bis], ['Erste Befristung ab', f.erstbefristung_beginn]] as const) {
      if (wert && !istIso(wert)) { setMeldung(`${feld}: bitte ein gültiges Datum wählen.`); return; }
    }
    const pz = Number(f.probezeit_monate);
    if (!Number.isInteger(pz) || pz < 0 || pz > 12) { setMeldung('Probezeit: 0 bis 12 Monate.'); return; }
    const vl = Number(f.verlaengerungen);
    if (!Number.isInteger(vl) || vl < 0 || vl > 20) { setMeldung('Verlängerungen: ganze Zahl von 0 bis 20.'); return; }
    setSpeichert(true); setMeldung(null);
    const alleErteilt = relevant.every((p) => f.punkte.has(p.key));
    const zeile = {
      owner_user_id: uid, mitarbeiter_id: m.id,
      beginn: f.beginn || null, probezeit_monate: pz, befristet: f.befristet,
      befristet_bis: f.befristet ? (f.befristet_bis || null) : null,
      sachgrund: f.befristet ? (f.sachgrund.trim() || null) : null,
      erstbefristung_beginn: f.befristet ? (f.erstbefristung_beginn || null) : null,
      verlaengerungen: f.befristet ? vl : 0,
      abruf: f.abruf, altersversorgung: f.altersversorgung,
      nachweis_punkte: [...f.punkte],
      nachweis_erteilt_am: alleErteilt ? (v.nachweis_erteilt_am || heute) : null,
      notiz: f.notiz.trim() || null,
      aktualisiert_am: new Date().toISOString(),
    };
    const { error } = await supabase.from('personal_vertrag').upsert(zeile, { onConflict: 'owner_user_id,mitarbeiter_id' });
    setSpeichert(false);
    if (error) { setMeldung(`Speichern fehlgeschlagen: ${error.message}`); return; }
    setMeldung('Gespeichert.');
    onGespeichert();
  }

  function bestaetigen() {
    setBestaetigung(beschaeftigungsbestaetigung({
      firma, ort, heute, name: nameVon(m), geburtsdatum: m.geburtsdatum, position: m.position,
      beginn: f.beginn || m.eintrittsdatum, befristet: f.befristet, befristet_bis: f.befristet_bis || null,
      wochenstunden: m.wochenstunden, gekuendigt: ungekuendigt ? false : undefined,
    }));
  }

  const pzEnde = f.beginn && istIso(f.beginn) && Number(f.probezeit_monate) > 0 ? fristEnde(f.beginn, Math.min(6, Number(f.probezeit_monate))) : null;

  return (
    <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
      <div style={S.raster}>
        <Feld label="Beginn des Arbeitsverhältnisses"><input type="date" value={f.beginn} onChange={(e) => setF({ ...f, beginn: e.target.value })} style={S.input} /></Feld>
        <Feld label={`Probezeit (Monate)${pzEnde ? ` — endet ${datumDe(pzEnde)}` : ''}`}><input type="number" min={0} max={12} value={f.probezeit_monate} onChange={(e) => setF({ ...f, probezeit_monate: e.target.value })} style={S.input} /></Feld>
        <Feld label="Befristet?"><label style={S.check}><input type="checkbox" checked={f.befristet} onChange={(e) => setF({ ...f, befristet: e.target.checked })} /> Ja, befristeter Vertrag</label></Feld>
        <Feld label="Arbeit auf Abruf / Altersversorgung">
          <label style={S.check}><input type="checkbox" checked={f.abruf} onChange={(e) => setF({ ...f, abruf: e.target.checked })} /> Abruf</label>
          <label style={S.check}><input type="checkbox" checked={f.altersversorgung} onChange={(e) => setF({ ...f, altersversorgung: e.target.checked })} /> betriebl. Altersversorgung</label>
        </Feld>
        {f.befristet && <>
          <Feld label="Befristet bis"><input type="date" value={f.befristet_bis} onChange={(e) => setF({ ...f, befristet_bis: e.target.value })} style={S.input} /></Feld>
          <Feld label="Sachgrund (leer = ohne Sachgrund)"><input value={f.sachgrund} placeholder="z. B. Elternzeitvertretung" onChange={(e) => setF({ ...f, sachgrund: e.target.value })} style={S.input} /></Feld>
          <Feld label="Erste Befristung ab (falls verlängert)"><input type="date" value={f.erstbefristung_beginn} onChange={(e) => setF({ ...f, erstbefristung_beginn: e.target.value })} style={S.input} /></Feld>
          <Feld label="Anzahl Verlängerungen"><input type="number" min={0} max={20} value={f.verlaengerungen} onChange={(e) => setF({ ...f, verlaengerungen: e.target.value })} style={S.input} /></Feld>
        </>}
      </div>

      {alle.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          {alle.map((x, i) => <div key={i} style={{ color: STUFE_FARBE[x.stufe], fontSize: 13 }}>{x.stufe === 'rot' ? '⛔' : x.stufe === 'gelb' ? '⚠️' : 'ℹ️'} {x.text}</div>)}
        </div>
      )}

      <div>
        <div style={S.zwischen}>Nachweis der Arbeitsbedingungen (§ 2 NachwG) — {stand.erledigt} von {stand.gesamt} schriftlich erteilt</div>
        <p style={{ color: C.textDim, fontSize: 12, margin: '4px 0 8px' }}>
          Haken setzen, sobald die Angabe dem Mitarbeiter nachweislich vorliegt (meist im Arbeitsvertrag). Seit 01.01.2025 genügt oft Textform (E-Mail) mit Empfangsbestätigung —
          nicht in Branchen nach § 2a SchwarzArbG (u. a. Bau): dort weiter schriftlich mit Unterschrift. Bitte mit dem Anwalt klären.
        </p>
        <div style={{ display: 'grid', gap: 6 }}>
          {relevant.map((p) => (
            <label key={p.key} style={{ ...S.check, alignItems: 'flex-start', color: ueber.has(p.key) ? C.danger : C.text }}>
              <input type="checkbox" checked={f.punkte.has(p.key)} onChange={() => umschalten(p.key)} style={{ marginTop: 3 }} />
              <span>{p.text} <span style={{ color: ueber.has(p.key) ? C.danger : C.textDim, fontSize: 12 }}>· {FRIST_TEXT[p.frist]}{ueber.has(p.key) ? ' — überfällig' : ''}</span></span>
            </label>
          ))}
        </div>
      </div>

      <Feld label="Notiz"><textarea value={f.notiz} onChange={(e) => setF({ ...f, notiz: e.target.value })} style={{ ...S.input, minHeight: 60 }} /></Feld>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={S.knopf} disabled={speichert} onClick={speichern}>{speichert ? 'Speichert …' : 'Speichern'}</button>
        {meldung && <span style={{ color: meldung === 'Gespeichert.' ? C.green : C.danger, fontSize: 13 }}>{meldung}</span>}
      </div>

      <div style={S.box}>
        <div style={S.zwischen}>Beschäftigungsbestätigung</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <input value={ort} placeholder="Ort (z. B. Böblingen)" onChange={(e) => setOrt(e.target.value)} style={{ ...S.input, maxWidth: 220 }} />
          <label style={S.check}><input type="checkbox" checked={ungekuendigt} onChange={(e) => setUngekuendigt(e.target.checked)} /> ungekündigt bestätigen</label>
          <button style={S.knopf2} onClick={bestaetigen}>Erstellen</button>
        </div>
        {bestaetigung && <Ausgabe text={bestaetigung} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 2. Arbeitszeugnis
// ------------------------------------------------------------
function Zeugnis({ ma, vertraege, firma }: { ma: MA[]; vertraege: Record<string, VertragZeile>; firma: string }) {
  const [maId, setMaId] = useState('');
  const [f, setF] = useState({
    zeugnisArt: 'end', qualifiziert: true, note: 2, name: '', geschlecht: 'd', position: '', beginn: '', ende: '',
    aufgaben: '', staerken: '', austrittsgrund: 'eigener_wunsch',
  });
  const [laeuft, setLaeuft] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  function waehle(id: string) {
    setMaId(id);
    const m = ma.find((x) => x.id === id);
    if (m) setF((a) => ({ ...a, name: nameVon(m), position: m.position || '', beginn: vertraege[id]?.beginn || m.eintrittsdatum || '' }));
  }

  async function entwerfen() {
    setLaeuft(true); setFehler(null); setText(null);
    try {
      const res = await fetch('/api/personal-text', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ art: 'zeugnis', ...f, firma }) });
      const j = await res.json();
      if (!j.ok) setFehler(j.error || 'Fehler.'); else setText(j.text);
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    setLaeuft(false);
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={S.hinweis}>
        Sie geben die Note vor — die KI formuliert nur in der üblichen Zeugnissprache. Sie bewertet niemanden.
        Ein Zeugnis muss wohlwollend und wahr sein (§ 109 GewO). Bitte den Entwurf vollständig lesen und anpassen.
      </div>
      <div style={S.raster}>
        <Feld label="Mitarbeiter (füllt Name, Position, Beginn)">
          <select value={maId} onChange={(e) => waehle(e.target.value)} style={S.input}>
            <option value="">— auswählen oder unten eintragen —</option>
            {ma.map((m) => <option key={m.id} value={m.id}>{nameVon(m)}</option>)}
          </select>
        </Feld>
        <Feld label="Art">
          <select value={f.zeugnisArt} onChange={(e) => setF({ ...f, zeugnisArt: e.target.value })} style={S.input}>
            <option value="end">Endzeugnis</option><option value="zwischen">Zwischenzeugnis</option>
          </select>
        </Feld>
        <Feld label="Umfang">
          <select value={f.qualifiziert ? 'q' : 'e'} onChange={(e) => setF({ ...f, qualifiziert: e.target.value === 'q' })} style={S.input}>
            <option value="q">Qualifiziert (mit Leistung und Verhalten)</option><option value="e">Einfach (nur Art und Dauer)</option>
          </select>
        </Feld>
        {f.qualifiziert && (
          <Feld label="Gesamtnote (von Ihnen)">
            <select value={f.note} onChange={(e) => setF({ ...f, note: Number(e.target.value) })} style={S.input}>
              {NOTEN.map((n) => <option key={n.note} value={n.note}>{n.note} — {n.label} („{n.formel}")</option>)}
            </select>
          </Feld>
        )}
        <Feld label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={S.input} /></Feld>
        <Feld label="Anrede">
          <select value={f.geschlecht} onChange={(e) => setF({ ...f, geschlecht: e.target.value })} style={S.input}>
            <option value="w">Frau</option><option value="m">Herr</option><option value="d">ohne Anrede (Vor- und Nachname)</option>
          </select>
        </Feld>
        <Feld label="Position"><input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} style={S.input} /></Feld>
        <Feld label="Beginn"><input type="date" value={f.beginn} onChange={(e) => setF({ ...f, beginn: e.target.value })} style={S.input} /></Feld>
        {f.zeugnisArt === 'end' && <>
          <Feld label="Austritt"><input type="date" value={f.ende} onChange={(e) => setF({ ...f, ende: e.target.value })} style={S.input} /></Feld>
          <Feld label="Austrittsgrund">
            <select value={f.austrittsgrund} onChange={(e) => setF({ ...f, austrittsgrund: e.target.value })} style={S.input}>
              <option value="eigener_wunsch">auf eigenen Wunsch</option>
              <option value="einvernehmlich">im gegenseitigen Einvernehmen</option>
              <option value="befristung">Ablauf der Befristung</option>
              <option value="arbeitgeber">Kündigung durch uns (wird nicht genannt)</option>
              <option value="keine_angabe">keine Angabe</option>
            </select>
          </Feld>
        </>}
      </div>
      <Feld label="Aufgaben (Stichpunkte reichen)"><textarea value={f.aufgaben} onChange={(e) => setF({ ...f, aufgaben: e.target.value })} style={{ ...S.input, minHeight: 90 }} placeholder="z. B. Leitung einer 4er-Kolonne, Aufmaß, Einweisung Azubis" /></Feld>
      {f.qualifiziert && <Feld label="Besondere Stärken / Erfolge (optional)"><textarea value={f.staerken} onChange={(e) => setF({ ...f, staerken: e.target.value })} style={{ ...S.input, minHeight: 60 }} /></Feld>}
      <div><button style={S.knopf} disabled={laeuft} onClick={entwerfen}>{laeuft ? 'Entwirft …' : '✍️ Zeugnis entwerfen'}</button></div>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      {text && <Ausgabe text={text} bearbeitbar />}
    </div>
  );
}

// ------------------------------------------------------------
// 3. Stellenanzeige
// ------------------------------------------------------------
function Stelle({ firma }: { firma: string }) {
  const [f, setF] = useState({ titel: '', ort: '', umfang: 'Vollzeit', aufgaben: '', anforderungen: '', angebot: '' });
  const [laeuft, setLaeuft] = useState(false);
  const [text, setText] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const funde = useMemo(() => (text ? aggPruefung(text) : []), [text]);

  async function entwerfen() {
    setLaeuft(true); setFehler(null);
    try {
      const res = await fetch('/api/personal-text', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ art: 'stelle', ...f, firma }) });
      const j = await res.json();
      if (!j.ok) setFehler(j.error || 'Fehler.'); else setText(j.text);
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    setLaeuft(false);
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={S.raster}>
        <Feld label="Stellentitel"><input value={f.titel} placeholder="z. B. Maurer" onChange={(e) => setF({ ...f, titel: e.target.value })} style={S.input} /></Feld>
        <Feld label="Ort"><input value={f.ort} onChange={(e) => setF({ ...f, ort: e.target.value })} style={S.input} /></Feld>
        <Feld label="Umfang"><input value={f.umfang} onChange={(e) => setF({ ...f, umfang: e.target.value })} style={S.input} /></Feld>
      </div>
      <Feld label="Aufgaben"><textarea value={f.aufgaben} onChange={(e) => setF({ ...f, aufgaben: e.target.value })} style={{ ...S.input, minHeight: 70 }} /></Feld>
      <Feld label="Anforderungen"><textarea value={f.anforderungen} onChange={(e) => setF({ ...f, anforderungen: e.target.value })} style={{ ...S.input, minHeight: 70 }} /></Feld>
      <Feld label="Was Sie bieten (Lohn, Fahrzeug, Werkzeug …)"><textarea value={f.angebot} onChange={(e) => setF({ ...f, angebot: e.target.value })} style={{ ...S.input, minHeight: 60 }} /></Feld>
      <div><button style={S.knopf} disabled={laeuft} onClick={entwerfen}>{laeuft ? 'Entwirft …' : '✍️ Anzeige entwerfen'}</button></div>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      {text && <>
        <div style={{ ...S.box, borderColor: funde.length ? C.warn : C.green }}>
          <div style={S.zwischen}>{funde.length ? `⚠️ AGG-Prüfung: ${funde.length} Hinweis(e)` : '✅ AGG-Prüfung: keine auffälligen Formulierungen gefunden'}</div>
          {funde.map((x, i) => <div key={i} style={{ color: C.warn, fontSize: 13, marginTop: 4 }}>• {x}</div>)}
          <div style={{ color: C.textDim, fontSize: 12, marginTop: 6 }}>Die Prüfung sucht bekannte Stolperwörter. Sie ersetzt keinen Blick durch eine Fachperson. Sie läuft bei jeder Änderung neu.</div>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ ...S.input, minHeight: 320, fontFamily: 'inherit' }} />
        <div><button style={S.knopf2} onClick={() => navigator.clipboard?.writeText(text)}>📋 Kopieren</button></div>
      </>}
    </div>
  );
}

// ------------------------------------------------------------
function Ausgabe({ text, bearbeitbar }: { text: string; bearbeitbar?: boolean }) {
  const [t, setT] = useState(text);
  useEffect(() => { setT(text); }, [text]);
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      <textarea value={t} readOnly={!bearbeitbar} onChange={(e) => setT(e.target.value)} style={{ ...S.input, minHeight: bearbeitbar ? 380 : 260, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }} />
      <div><button style={S.knopf2} onClick={() => navigator.clipboard?.writeText(t)}>📋 Kopieren</button></div>
    </div>
  );
}

function Feld({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display: 'grid', gap: 4 }}><span style={{ color: C.textDim, fontSize: 12 }}>{label}</span>{children}</label>;
}

const S: Record<string, CSSProperties> = {
  page: { padding: '24px 20px', color: C.text, maxWidth: 1100, margin: '0 auto' },
  eyebrow: { color: C.gold, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  h1: { fontSize: 28, margin: '4px 0' },
  sub: { color: C.textDim, marginTop: 0 },
  hinweis: { background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: C.textDim, margin: '12px 0' },
  tabs: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' },
  tab: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer' },
  tabAktiv: { color: C.navy, background: C.gold, borderColor: C.gold, fontWeight: 600 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 },
  box: { border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  check: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 },
  zwischen: { fontWeight: 600, fontSize: 14 },
  knopf: { background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  knopf2: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer' },
  fehler: { color: C.danger, background: 'rgba(224,102,102,0.08)', border: `1px solid ${C.danger}`, borderRadius: 8, padding: '10px 12px', margin: '8px 0' },
};
