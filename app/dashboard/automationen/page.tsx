'use client';

// ============================================================================
// ARGONAUT OS · Thema 1 · Automationen — Baukasten + Liste + Protokoll
// Pfad: app/dashboard/automationen/page.tsx
//
// Der Bauplan einer Regel ist immer derselbe:
//   WENN <Ausloeser>  ·  UND <Bedingung>  ·  NACH <Wartezeit>  ·  DANN <Aktion>
//
// Die gesamte Logik (welcher Ausloeser, welche Felder, was ist gueltig) kommt
// aus lib/automation.ts — hier ist nur die Bedienoberflaeche. Ausgefuehrt wird
// nichts auf dieser Seite: das macht der Motor /api/cron/automationen.
// ============================================================================

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  TRIGGER, AKTIONEN, VORLAGEN, OPERATOR_LABEL,
  triggerDef, aktionDef, erlaubteAktionen,
  regelZusammenfassung, pruefeRegelEingabe,
  type AutomationRegel, type Bedingung, type Operator,
} from '@/lib/automation';
import { NurVoll } from '../_components/Ansicht';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type ProbeRegel = {
  id: string; name: string; aktiv: boolean; ausloeser: string; aktion: string;
  geprueft: number; faellig: number; wuerde_laufen: number; zurueckgestellt: number;
  schon_erledigt: number; beispiele: string[]; hinweis?: string;
};

type LogZeile = {
  id: string; regel_id: string | null; ziel_typ: string | null; ziel_id: string | null;
  ergebnis: string; meldung: string | null; ausgefuehrt_am: string;
};

type Formular = {
  id: string | null;
  name: string;
  beschreibung: string;
  trigger_typ: string;
  bedingung: Bedingung[];
  aktion_typ: string;
  aktion_config: Record<string, string>;
  wartezeit_tage: number;
};

const LEER: Formular = {
  id: null, name: '', beschreibung: '',
  trigger_typ: TRIGGER[0].key, bedingung: [],
  aktion_typ: 'aufgabe_anlegen', aktion_config: {}, wartezeit_tage: 3,
};

const OPERATOREN: Operator[] = ['gleich', 'ungleich', 'groesser', 'groesser_gleich', 'kleiner', 'kleiner_gleich', 'enthaelt', 'leer', 'nicht_leer'];

function fmtZeit(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// --- Stile -----------------------------------------------------------------
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 18 };
const feld: CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(10,22,40,0.7)', color: C.text, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
const beschriftung: CSSProperties = { display: 'block', fontSize: 12.5, color: C.textDim, fontWeight: 700, marginBottom: 5 };
const knopf = (art: 'gold' | 'rand' | 'rot' = 'gold'): CSSProperties => ({
  padding: '10px 16px', borderRadius: 9, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
  border: art === 'gold' ? 'none' : `1px solid ${art === 'rot' ? 'rgba(224,102,102,0.5)' : C.border}`,
  background: art === 'gold' ? C.gold : 'transparent',
  color: art === 'gold' ? C.navy : art === 'rot' ? C.danger : C.text,
});
const stufe: CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 11, padding: 14, background: 'rgba(10,22,40,0.45)' };
const stufenTitel: CSSProperties = { fontSize: 11.5, letterSpacing: 1.2, textTransform: 'uppercase', color: C.gold, fontWeight: 800, marginBottom: 9 };

export default function AutomationenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [regeln, setRegeln] = useState<AutomationRegel[]>([]);
  const [log, setLog] = useState<LogZeile[]>([]);
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [f, setF] = useState<Formular>({ ...LEER });
  const [formOffen, setFormOffen] = useState(false);
  const [probe, setProbe] = useState<ProbeRegel[] | null>(null);
  const [probeZeit, setProbeZeit] = useState<string | null>(null);

  const alles = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [r, l] = await Promise.all([
        supabase.from('automation_regeln').select('*').order('erstellt_am', { ascending: false }),
        supabase.from('automation_log').select('id,regel_id,ziel_typ,ziel_id,ergebnis,meldung,ausgefuehrt_am').order('ausgefuehrt_am', { ascending: false }).limit(50),
      ]);
      if (r.error) throw r.error;
      setRegeln((r.data as AutomationRegel[]) ?? []);
      setLog((l.data as LogZeile[]) ?? []);
      setProbe(null); setProbeZeit(null);   // nach jeder Änderung ist ein alter Probelauf hinfällig
    } catch (err: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await alles();
    })();
  }, [alles]);

  const t = useMemo(() => triggerDef(f.trigger_typ), [f.trigger_typ]);
  const a = useMemo(() => aktionDef(f.aktion_typ), [f.aktion_typ]);
  const moeglicheAktionen = useMemo(() => erlaubteAktionen(f.trigger_typ), [f.trigger_typ]);

  const vorschau = useMemo(() => regelZusammenfassung({
    id: 'vorschau', owner_user_id: '', name: f.name || 'Neue Automation',
    trigger_typ: f.trigger_typ, bedingung: f.bedingung, aktion_typ: f.aktion_typ,
    aktion_config: f.aktion_config, wartezeit_tage: f.wartezeit_tage, aktiv: true,
  }), [f]);

  const aktiveZahl = useMemo(() => regeln.filter((r) => r.aktiv).length, [regeln]);
  const laeufe7 = useMemo(() => {
    const grenze = Date.now() - 7 * 86400000;
    return log.filter((l) => new Date(l.ausgefuehrt_am).getTime() >= grenze).length;
  }, [log]);
  const regelName = useCallback((id: string | null) => regeln.find((r) => r.id === id)?.name ?? '—', [regeln]);

  // --- Formular-Helfer -----------------------------------------------------

  function wechsleTrigger(key: string) {
    const neuT = triggerDef(key);
    const erlaubt = erlaubteAktionen(key);
    setF((v) => ({
      ...v,
      trigger_typ: key,
      bedingung: [],                                        // Felder passen sonst nicht mehr
      aktion_typ: erlaubt.some((x) => x.key === v.aktion_typ) ? v.aktion_typ : erlaubt[0].key,
      name: v.name || (neuT ? neuT.label : ''),
    }));
  }

  function wechsleAktion(key: string) {
    const neuA = aktionDef(key);
    const cfg: Record<string, string> = {};
    for (const fd of neuA?.felder ?? []) if (fd.standard !== undefined) cfg[fd.key] = String(fd.standard);
    setF((v) => ({ ...v, aktion_typ: key, aktion_config: cfg }));
  }

  function setzeConfig(key: string, wert: string) {
    setF((v) => ({ ...v, aktion_config: { ...v.aktion_config, [key]: wert } }));
  }

  function bedingungHinzu() {
    const erstes = t?.felder[0];
    if (!erstes) return;
    setF((v) => ({ ...v, bedingung: [...v.bedingung, { feld: erstes.key, operator: 'gleich', wert: '' }] }));
  }

  function bedingungAendern(i: number, teil: Partial<Bedingung>) {
    setF((v) => ({ ...v, bedingung: v.bedingung.map((b, j) => (j === i ? { ...b, ...teil } : b)) }));
  }

  function bedingungWeg(i: number) {
    setF((v) => ({ ...v, bedingung: v.bedingung.filter((_, j) => j !== i) }));
  }

  function vorlageLaden(i: number) {
    const v = VORLAGEN[i];
    if (!v) return;
    const cfg: Record<string, string> = {};
    for (const [k, w] of Object.entries(v.aktion_config)) cfg[k] = String(w);
    setF({
      id: null, name: v.name, beschreibung: v.beschreibung,
      trigger_typ: v.trigger_typ, bedingung: v.bedingung.map((b) => ({ ...b })),
      aktion_typ: v.aktion_typ, aktion_config: cfg, wartezeit_tage: v.wartezeit_tage,
    });
    setFormOffen(true); setFehler(null); setOk(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bearbeiten(r: AutomationRegel) {
    const cfg: Record<string, string> = {};
    for (const [k, w] of Object.entries((r.aktion_config ?? {}) as Record<string, unknown>)) cfg[k] = String(w ?? '');
    setF({
      id: r.id, name: r.name, beschreibung: r.beschreibung ?? '',
      trigger_typ: r.trigger_typ, bedingung: Array.isArray(r.bedingung) ? r.bedingung.map((b) => ({ ...b })) : [],
      aktion_typ: r.aktion_typ, aktion_config: cfg, wartezeit_tage: r.wartezeit_tage,
    });
    setFormOffen(true); setFehler(null); setOk(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- Probelauf: zeigt, was passieren wuerde. Fuehrt nichts aus. ----------

  async function probelauf() {
    setBusy('probe'); setFehler(null); setOk(null);
    try {
      const antwort = await fetch('/api/automationen/probe', { cache: 'no-store' });
      const daten = await antwort.json() as { ok: boolean; error?: string; zeitpunkt?: string; regeln?: ProbeRegel[] };
      if (!antwort.ok || !daten.ok) throw new Error(daten.error || 'Probelauf fehlgeschlagen');
      setProbe(daten.regeln ?? []);
      setProbeZeit(daten.zeitpunkt ?? null);
    } catch (err: unknown) {
      setFehler('Probelauf fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  // --- Speichern / Schalten / Loeschen --------------------------------------

  async function speichern() {
    if (!uid) return;
    const probe = pruefeRegelEingabe({
      name: f.name, trigger_typ: f.trigger_typ, bedingung: f.bedingung,
      aktion_typ: f.aktion_typ, aktion_config: f.aktion_config, wartezeit_tage: f.wartezeit_tage,
    });
    if (probe.length > 0) { setFehler(probe.join(' · ')); setOk(null); return; }

    setBusy('speichern'); setFehler(null); setOk(null);
    try {
      const satz = {
        owner_user_id: uid,
        name: f.name.trim(),
        beschreibung: f.beschreibung.trim() || null,
        trigger_typ: f.trigger_typ,
        trigger_config: {},
        bedingung: f.bedingung,
        aktion_typ: f.aktion_typ,
        aktion_config: f.aktion_config,
        wartezeit_tage: Math.max(0, Math.trunc(Number(f.wartezeit_tage) || 0)),
      };
      if (f.id) {
        const { error } = await supabase.from('automation_regeln').update(satz).eq('id', f.id);
        if (error) throw error;
        setOk('Automation gespeichert.');
      } else {
        const { error } = await supabase.from('automation_regeln').insert({ ...satz, aktiv: true });
        if (error) throw error;
        setOk('Automation angelegt — sie ist ab sofort aktiv.');
      }
      setF({ ...LEER }); setFormOffen(false); await alles();
    } catch (err: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  async function schalten(r: AutomationRegel) {
    setBusy(r.id); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('automation_regeln').update({ aktiv: !r.aktiv }).eq('id', r.id);
      if (error) throw error;
      setOk(r.aktiv ? `„${r.name}" pausiert.` : `„${r.name}" ist wieder aktiv.`);
      await alles();
    } catch (err: unknown) {
      setFehler('Umschalten fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  async function loeschen(r: AutomationRegel) {
    if (typeof window !== 'undefined' && !window.confirm(`Automation „${r.name}" wirklich loeschen? Das Protokoll dazu verschwindet mit.`)) return;
    setBusy(r.id); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('automation_regeln').delete().eq('id', r.id);
      if (error) throw error;
      setOk('Automation geloescht.');
      if (f.id === r.id) { setF({ ...LEER }); setFormOffen(false); }
      await alles();
    } catch (err: unknown) {
      setFehler('Loeschen fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  // --- Ansicht --------------------------------------------------------------

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 4px 60px', color: C.text }}>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 27, fontWeight: 800, margin: '0 0 6px' }}>⚡ Automationen</h1>
        <p style={{ color: C.textDim, fontSize: 14.5, margin: 0, maxWidth: 760, lineHeight: 1.55 }}>
          Hier stellen Sie Regeln ein, die Ihr Betrieb danach von allein abarbeitet. Eine Regel ist immer nach
          demselben Muster gebaut: <b style={{ color: C.text }}>Wenn</b> etwas passiert, <b style={{ color: C.text }}>dann</b> soll etwas
          geschehen — auf Wunsch erst nach ein paar Tagen Wartezeit. Nichts wird sofort ausgeloest: der Motor prueft
          einmal taeglich, was faellig ist, und protokolliert jeden Schritt.
        </p>
      </div>

      {/* Kennzahlen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Aktive Automationen', wert: String(aktiveZahl), farbe: C.green },
          { label: 'Angelegt insgesamt', wert: String(regeln.length), farbe: C.cyan },
          { label: 'Ausgefuehrt (7 Tage)', wert: String(laeufe7), farbe: C.gold },
          { label: 'Zuletzt gelaufen', wert: log[0] ? fmtZeit(log[0].ausgefuehrt_am) : 'noch nie', farbe: C.textDim },
        ].map((k) => (
          <div key={k.label} style={{ ...karte, marginBottom: 0, padding: 14 }}>
            <div style={{ fontSize: 11.5, color: C.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>{k.label}</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: k.farbe, marginTop: 5 }}>{k.wert}</div>
          </div>
        ))}
      </div>

      {fehler && <div style={{ ...karte, borderColor: 'rgba(224,102,102,0.5)', color: C.danger, fontSize: 14 }}>⚠️ {fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: 'rgba(76,175,125,0.5)', color: C.green, fontSize: 14 }}>✓ {ok}</div>}

      {/* Vorlagen */}
      <div style={karte}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Fertige Vorlagen</h2>
          <button type="button" onClick={() => { setF({ ...LEER }); setFormOffen(true); }} style={knopf('rand')}>
            ＋ Leere Automation
          </button>
        </div>
        <p style={{ color: C.textDim, fontSize: 13.5, margin: '0 0 14px' }}>
          Ein Klick uebernimmt die Vorlage in den Baukasten. Sie koennen dort alles noch aendern, bevor gespeichert wird.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(265px,1fr))', gap: 11 }}>
          {VORLAGEN.map((v, i) => (
            <button
              key={v.name} type="button" onClick={() => vorlageLaden(i)}
              style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${C.border}`, borderRadius: 11, padding: 13, background: 'rgba(10,22,40,0.5)', color: C.text, fontFamily: 'inherit' }}
            >
              <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 5 }}>{v.name}</div>
              <div style={{ color: C.textDim, fontSize: 12.5, lineHeight: 1.5 }}>{v.beschreibung}</div>
              <div style={{ color: C.cyan, fontSize: 11.5, marginTop: 8, fontWeight: 700 }}>
                {triggerDef(v.trigger_typ)?.label} → {aktionDef(v.aktion_typ)?.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Baukasten */}
      {formOffen && (
        <div style={{ ...karte, borderColor: 'rgba(201,168,76,0.45)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{f.id ? 'Automation bearbeiten' : 'Neue Automation bauen'}</h2>
            <button type="button" onClick={() => { setF({ ...LEER }); setFormOffen(false); }} style={knopf('rand')}>Abbrechen</button>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={beschriftung}>Name der Automation</label>
            <input value={f.name} onChange={(e) => setF((v) => ({ ...v, name: e.target.value }))} placeholder="z.B. Freundliche Zahlungserinnerung" style={feld} />
          </div>

          <NurVoll>
            <div style={{ marginBottom: 14 }}>
              <label style={beschriftung}>Notiz für Sie selbst (optional)</label>
              <input value={f.beschreibung} onChange={(e) => setF((v) => ({ ...v, beschreibung: e.target.value }))} placeholder="Wofür ist diese Regel gedacht?" style={feld} />
            </div>
          </NurVoll>

          <div style={{ display: 'grid', gap: 12 }}>

            {/* WENN */}
            <div style={stufe}>
              <div style={stufenTitel}>1 · Wenn das passiert</div>
              <select value={f.trigger_typ} onChange={(e) => wechsleTrigger(e.target.value)} style={feld}>
                {TRIGGER.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              {t && <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 7, lineHeight: 1.5 }}>{t.hinweis}</div>}
            </div>

            {/* UND (Experten) */}
            <NurVoll>
              <div style={stufe}>
                <div style={stufenTitel}>2 · Und nur wenn (optional)</div>
                {f.bedingung.length === 0 && (
                  <div style={{ color: C.textDim, fontSize: 13, marginBottom: 10 }}>
                    Ohne Bedingung gilt die Regel für alle Fälle. Mit Bedingung grenzen Sie ein — z.B. nur ab 500 € Rechnungsbetrag.
                  </div>
                )}
                {f.bedingung.map((b, i) => {
                  const fd = t?.felder.find((x) => x.key === b.feld);
                  const ohneWert = b.operator === 'leer' || b.operator === 'nicht_leer';
                  return (
                    <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                      <select value={b.feld} onChange={(e) => bedingungAendern(i, { feld: e.target.value, wert: '' })} style={{ ...feld, width: 'auto', flex: '1 1 170px' }}>
                        {(t?.felder ?? []).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select>
                      <select value={b.operator} onChange={(e) => bedingungAendern(i, { operator: e.target.value as Operator })} style={{ ...feld, width: 'auto', flex: '1 1 150px' }}>
                        {OPERATOREN.map((o) => <option key={o} value={o}>{OPERATOR_LABEL[o]}</option>)}
                      </select>
                      {!ohneWert && (
                        fd?.typ === 'auswahl' && fd.optionen ? (
                          <select value={String(b.wert ?? '')} onChange={(e) => bedingungAendern(i, { wert: e.target.value })} style={{ ...feld, width: 'auto', flex: '1 1 150px' }}>
                            <option value="">— wählen —</option>
                            {fd.optionen.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            value={String(b.wert ?? '')} onChange={(e) => bedingungAendern(i, { wert: e.target.value })}
                            placeholder={fd?.typ === 'zahl' ? 'z.B. 500' : 'Wert'}
                            style={{ ...feld, width: 'auto', flex: '1 1 150px' }}
                          />
                        )
                      )}
                      <button type="button" onClick={() => bedingungWeg(i)} style={{ ...knopf('rot'), padding: '9px 12px' }}>✕</button>
                    </div>
                  );
                })}
                <button type="button" onClick={bedingungHinzu} style={{ ...knopf('rand'), padding: '8px 13px', fontSize: 13.5 }}>＋ Bedingung</button>
              </div>
            </NurVoll>

            {/* WARTEZEIT */}
            <div style={stufe}>
              <div style={stufenTitel}>3 · Erst nach dieser Wartezeit</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="number" min={0} max={365} value={f.wartezeit_tage}
                  onChange={(e) => setF((v) => ({ ...v, wartezeit_tage: Math.max(0, Math.min(365, Number(e.target.value) || 0)) }))}
                  style={{ ...feld, width: 110 }}
                />
                <span style={{ color: C.textDim, fontSize: 13.5 }}>
                  Tage {f.wartezeit_tage === 0 ? '— die Regel greift sofort, sobald der Fall eintritt.' : `— die Regel greift ${f.wartezeit_tage} Tage nach dem Auslöser.`}
                </span>
              </div>
            </div>

            {/* DANN */}
            <div style={stufe}>
              <div style={stufenTitel}>4 · Dann tu das</div>
              <select value={f.aktion_typ} onChange={(e) => wechsleAktion(e.target.value)} style={feld}>
                {moeglicheAktionen.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              {a && <div style={{ color: C.textDim, fontSize: 12.5, margin: '7px 0 12px', lineHeight: 1.5 }}>{a.hinweis}</div>}

              <div style={{ display: 'grid', gap: 11 }}>
                {(a?.felder ?? []).map((fd) => {
                  const wert = f.aktion_config[fd.key] ?? '';
                  if (fd.key === 'adresse' && f.aktion_config.an !== 'feste_adresse') return null;
                  return (
                    <div key={fd.key}>
                      <label style={beschriftung}>{fd.label}{fd.pflicht ? ' *' : ''}</label>
                      {fd.typ === 'mehrzeilig' ? (
                        <textarea value={wert} onChange={(e) => setzeConfig(fd.key, e.target.value)} rows={fd.key === 'text' ? 7 : 3} style={{ ...feld, resize: 'vertical' }} />
                      ) : fd.typ === 'auswahl' && fd.optionen ? (
                        <select value={wert} onChange={(e) => setzeConfig(fd.key, e.target.value)} style={feld}>
                          {fd.optionen.map((o) => <option key={o} value={o}>{o === 'kunde' ? 'an den Kunden' : o === 'feste_adresse' ? 'an eine feste Adresse' : o}</option>)}
                        </select>
                      ) : (
                        <input type={fd.typ === 'zahl' ? 'number' : 'text'} value={wert} onChange={(e) => setzeConfig(fd.key, e.target.value)} style={feld} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 9, background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.22)', fontSize: 12.5, color: C.textDim, lineHeight: 1.6 }}>
                <b style={{ color: C.cyan }}>Platzhalter für Texte:</b>{' '}
                <code>{'{{name}}'}</code> Kunde · <code>{'{{betrag}}'}</code> Summe · <code>{'{{nummer}}'}</code> Beleg-Nr. ·{' '}
                <code>{'{{datum}}'}</code> Auslöse-Datum · <code>{'{{tage}}'}</code> vergangene Tage · <code>{'{{heute}}'}</code> heutiges Datum.
                Beim Ausführen werden sie automatisch ersetzt.
              </div>
            </div>
          </div>

          {/* Vorschau + Speichern */}
          <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)' }}>
            <div style={{ fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', color: C.gold, fontWeight: 800, marginBottom: 6 }}>So liest sich Ihre Regel</div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>{vorschau}</div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" onClick={speichern} disabled={busy === 'speichern'} style={{ ...knopf('gold'), opacity: busy === 'speichern' ? 0.6 : 1 }}>
              {busy === 'speichern' ? 'Speichert …' : f.id ? 'Änderungen speichern' : 'Automation anlegen'}
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div style={karte}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Ihre Automationen</h2>
          {regeln.length > 0 && (
            <button type="button" onClick={probelauf} disabled={busy === 'probe'} style={{ ...knopf('rand'), opacity: busy === 'probe' ? 0.6 : 1 }}>
              {busy === 'probe' ? 'Prüft …' : '🔍 Probelauf — was würde jetzt passieren?'}
            </button>
          )}
        </div>

        {/* Ergebnis des Probelaufs */}
        {probe && (
          <div style={{ marginBottom: 16, border: '1px solid rgba(0,229,255,0.3)', borderRadius: 11, padding: 14, background: 'rgba(0,229,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.cyan }}>Probelauf — es wurde nichts ausgeführt</div>
              <button type="button" onClick={() => { setProbe(null); setProbeZeit(null); }} style={{ ...knopf('rand'), padding: '6px 11px', fontSize: 13 }}>Schließen</button>
            </div>
            <div style={{ color: C.textDim, fontSize: 12.5, marginBottom: 12 }}>
              Stand {fmtZeit(probeZeit)} · Es wurde nur gerechnet: keine Mail verschickt, keine Aufgabe angelegt, kein Status geändert.
            </div>
            {probe.length === 0 ? (
              <div style={{ color: C.textDim, fontSize: 13.5 }}>Keine Automationen zum Prüfen.</div>
            ) : (
              <div style={{ display: 'grid', gap: 9 }}>
                {probe.map((p) => (
                  <div key={p.id} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: 11, background: 'rgba(10,22,40,0.5)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>{p.name}</span>
                      <span style={{ fontWeight: 800, fontSize: 14, color: p.wuerde_laufen > 0 ? C.gold : C.textDim }}>
                        {p.wuerde_laufen > 0 ? `${p.wuerde_laufen}× würde laufen` : 'nichts zu tun'}
                      </span>
                    </div>
                    <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 5 }}>
                      {p.geprueft} geprüft · {p.faellig} fällig · {p.schon_erledigt} bereits erledigt
                      {p.zurueckgestellt > 0 && <span style={{ color: C.warn }}> · {p.zurueckgestellt} auf morgen verschoben (Tages-Deckel)</span>}
                    </div>
                    {p.hinweis && <div style={{ color: C.warn, fontSize: 12.5, marginTop: 5 }}>{p.hinweis}</div>}
                    {p.beispiele.length > 0 && (
                      <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: C.text, fontSize: 12.5, lineHeight: 1.7 }}>
                        {p.beispiele.map((b, i) => <li key={i}>{b}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {laden ? (
          <div style={{ color: C.textDim, fontSize: 14 }}>Lädt …</div>
        ) : regeln.length === 0 ? (
          <div style={{ color: C.textDim, fontSize: 14, lineHeight: 1.6 }}>
            Noch keine Automation angelegt. Nehmen Sie oben eine Vorlage — die „Freundliche Zahlungserinnerung" ist
            der beste Einstieg und bringt erfahrungsgemäß am schnellsten Geld herein.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {regeln.map((r) => (
              <div key={r.id} style={{ border: `1px solid ${r.aktiv ? 'rgba(76,175,125,0.35)' : C.border}`, borderRadius: 11, padding: 13, background: 'rgba(10,22,40,0.45)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 320px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: 15 }}>{r.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 20, background: r.aktiv ? 'rgba(76,175,125,0.16)' : 'rgba(143,163,190,0.14)', color: r.aktiv ? C.green : C.textDim }}>
                        {r.aktiv ? 'aktiv' : 'pausiert'}
                      </span>
                    </div>
                    <div style={{ color: C.textDim, fontSize: 13, marginTop: 6, lineHeight: 1.55 }}>{regelZusammenfassung(r)}</div>
                    {r.beschreibung && <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 5, fontStyle: 'italic' }}>{r.beschreibung}</div>}
                    <NurVoll>
                      <div style={{ color: C.textDim, fontSize: 11.5, marginTop: 6 }}>
                        Zuletzt gelaufen: {fmtZeit(r.zuletzt_lauf_am ?? null)}
                      </div>
                    </NurVoll>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => schalten(r)} disabled={busy === r.id} style={{ ...knopf('rand'), padding: '8px 13px', fontSize: 13.5 }}>
                      {r.aktiv ? 'Pausieren' : 'Aktivieren'}
                    </button>
                    <button type="button" onClick={() => bearbeiten(r)} style={{ ...knopf('rand'), padding: '8px 13px', fontSize: 13.5 }}>Bearbeiten</button>
                    <button type="button" onClick={() => loeschen(r)} disabled={busy === r.id} style={{ ...knopf('rot'), padding: '8px 13px', fontSize: 13.5 }}>Löschen</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Protokoll */}
      <div style={karte}>
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Protokoll</h2>
        <p style={{ color: C.textDim, fontSize: 13.5, margin: '0 0 12px' }}>
          Jede Ausführung wird festgehalten — so ist jederzeit nachvollziehbar, was das System in Ihrem Namen getan hat.
        </p>
        {log.length === 0 ? (
          <div style={{ color: C.textDim, fontSize: 14 }}>Noch nichts ausgeführt.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ color: C.textDim, textAlign: 'left' }}>
                  <th style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}` }}>Zeitpunkt</th>
                  <th style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}` }}>Automation</th>
                  <th style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}` }}>Betrifft</th>
                  <th style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}` }}>Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{fmtZeit(l.ausgefuehrt_am)}</td>
                    <td style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}` }}>{regelName(l.regel_id)}</td>
                    <td style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}`, color: C.textDim }}>{l.ziel_typ ?? '—'}</td>
                    <td style={{ padding: '7px 8px', borderBottom: `1px solid ${C.border}`, color: l.ergebnis === 'ok' ? C.green : l.ergebnis === 'fehler' ? C.danger : C.textDim }}>
                      {l.ergebnis === 'ok' ? '✓ erledigt' : l.ergebnis === 'fehler' ? '⚠️ Fehler' : 'übersprungen'}
                      {l.meldung ? ` — ${l.meldung}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ ...karte, borderColor: 'rgba(0,229,255,0.25)', background: 'rgba(0,229,255,0.05)' }}>
        <div style={{ fontSize: 13.5, color: C.textDim, lineHeight: 1.65 }}>
          <b style={{ color: C.cyan }}>Gut zu wissen:</b> Der Motor läuft einmal täglich und arbeitet dabei nur ab, was
          wirklich fällig ist. Jede Automation greift pro Vorgang <b style={{ color: C.text }}>genau einmal</b> — eine Rechnung
          kann also nicht zweimal dieselbe Mahnung bekommen. Alles, was ausgeführt wird, steht im Protokoll.
          Pausieren Sie eine Regel, passiert ab sofort nichts mehr; bereits Erledigtes bleibt erhalten.
        </div>
      </div>
    </div>
  );
}
