'use client';

// ============================================================================
// ARGONAUT OS · Abläufe — Übersicht, Einschalten, Freigaben, Probelauf, Protokoll
// Pfad: app/dashboard/ablaeufe/page.tsx (Paket 157, 28.09.2026)
//
// Paket 157 bringt den Motor (/api/cron/ablaeufe) und diese erste Seite:
//   · bisherige Automationen per Knopf als Ablauf übernehmen (startet AUS)
//   · einschalten — die alte Regel wird dabei ausgeschaltet (nie beide aktiv)
//   · Freigaben für den Chef (Geld-Schritte warten hier)
//   · Probelauf (rechnet nur) und Protokoll je Lauf
// Paket 158: Karten-Baukasten (AblaufEditor), Vorlagen-Galerie je Branche, Fassungen.
// ============================================================================

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  pruefeAblauf, regelZuAblauf, ausloeserText, schrittText,
  type Ablauf, type Schritt,
} from '@/lib/ablauf';
import type { AutomationRegel } from '@/lib/automation';
import { nichtsGeschrieben, NICHT_GESPEICHERT } from '@/lib/speichernPruefen';
import Leerzustand from '../_components/Leerzustand';
import AblaufEditor, { type Entwurf } from './_teile/AblaufEditor';
import { ABLAUF_VORLAGEN, GRUPPEN, vorlagenFuer, type BranchenGruppe, type AblaufVorlage } from '@/lib/ablaufVorlagen';
import { neueFassungNoetig, kopie, enthaeltAktion } from '@/lib/ablaufEditor';
import AblaufErgebnisse from './_teile/AblaufErgebnisse';
import WebhookSchluessel from './_teile/WebhookSchluessel';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type AblaufZeile = Ablauf & { id: string; owner_user_id: string; version: number; alt_regel_id: string | null; zuletzt_lauf_am: string | null };
type LaufZeile = {
  id: string; ablauf_id: string; ziel_typ: string | null; ziel_id: string | null; status: string; pfad: string | null;
  weiter_am: string | null; meldung: string | null; gestartet_am: string; kontext: { tabelle?: string; slot?: string } | null;
  /** S2 (Paket 162): wer hat freigegeben/abgelehnt/abgebrochen — setzt die Datenbank (SQL p162). */
  entschieden_von_name?: string | null; entschieden_am?: string | null;
};
type VersionZeile = { id: string; version: number; name: string | null; ausloeser: Ablauf['ausloeser']; schritte: Schritt[]; gespeichert_am: string };
type ProtokollZeile = { id: string; pfad: string | null; schritt_typ: string | null; ergebnis: string; meldung: string | null; zeit: string; erstellt_von_name?: string | null };
type Probe = {
  ok: boolean; error?: string; geprueft?: number; faellig?: number; wuerde_starten?: number; zurueckgestellt?: number; hinweis?: string;
  beispiele?: { vorgang: string; schritte: { pfad: string; text: string }[]; danach: string }[];
};

const STATUS_TEXT: Record<string, string> = {
  laeuft: 'läuft', wartet: 'wartet', freigabe: 'wartet auf Freigabe', fertig: 'fertig', gestoppt: 'gestoppt', abgebrochen: 'abgebrochen', fehler: 'Fehler',
};
const STATUS_FARBE: Record<string, string> = {
  laeuft: C.cyan, wartet: C.cyan, freigabe: C.gold, fertig: C.green, gestoppt: C.textDim, abgebrochen: C.textDim, fehler: C.danger,
};
const ZIEL_TEXT: Record<string, string> = { rechnung: 'Rechnung', angebot: 'Angebot', aufgabe: 'Aufgabe', kontakt: 'Kunde', projekt: 'Projekt', zeitplan: 'Zeitplan', knopf: 'Per Knopf' };

function fmtZeit(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function vorgangName(s: Record<string, unknown> | undefined): string {
  if (!s) return '';
  const name = [s.vorname, s.nachname].filter(Boolean).join(' ');
  return String(s.rechnungsnummer ?? s.angebotsnummer ?? s.titel ?? s.name ?? (name || s.firma) ?? '');
}

const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 18 };
const knopf = (art: 'gold' | 'rand' | 'rot' = 'gold'): CSSProperties => ({
  padding: '9px 14px', borderRadius: 9, fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
  border: art === 'gold' ? 'none' : `1px solid ${art === 'rot' ? 'rgba(224,102,102,0.5)' : C.border}`,
  background: art === 'gold' ? C.gold : 'transparent',
  color: art === 'gold' ? C.navy : art === 'rot' ? C.danger : C.text,
});
const klein: CSSProperties = { color: C.textDim, fontSize: 12.5, lineHeight: 1.5 };

/** Schritte als eingerückte Liste (Wenn/Sonst sichtbar). */
function SchrittListe({ schritte, tiefe = 0 }: { schritte: Schritt[]; tiefe?: number }) {
  return (
    <div>
      {schritte.map((s, i) => (
        <div key={s.id || i} style={{ marginLeft: tiefe * 18 }}>
          <div style={{ fontSize: 13.5, padding: '3px 0', color: s.typ === 'aktion' && s.aktion === 'freigabe_chef' ? C.gold : C.text }}>
            {i + 1}. {schrittText(s)}
          </div>
          {s.typ === 'wenn' && (
            <>
              <div style={{ ...klein, marginLeft: 18 }}>Dann:</div>
              {s.dann.length > 0 ? <SchrittListe schritte={s.dann} tiefe={tiefe + 2} /> : <div style={{ ...klein, marginLeft: 36 }}>—</div>}
              <div style={{ ...klein, marginLeft: 18 }}>Sonst:</div>
              {s.sonst.length > 0 ? <SchrittListe schritte={s.sonst} tiefe={tiefe + 2} /> : <div style={{ ...klein, marginLeft: 36 }}>—</div>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AblaeufePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [chef, setChef] = useState(false);
  const [ablaeufe, setAblaeufe] = useState<AblaufZeile[]>([]);
  const [regeln, setRegeln] = useState<AutomationRegel[]>([]);
  const [laeufe, setLaeufe] = useState<LaufZeile[]>([]);
  const [vorgaenge, setVorgaenge] = useState<Record<string, Record<string, unknown>>>({});
  const [laden, setLaden] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [probe, setProbe] = useState<Record<string, Probe>>({});
  const [protokoll, setProtokoll] = useState<{ laufId: string; zeilen: ProtokollZeile[] } | null>(null);
  const [editor, setEditor] = useState<Entwurf | null>(null);
  const [gruppe, setGruppe] = useState<BranchenGruppe>('alle');
  const [versionen, setVersionen] = useState<{ ablaufId: string; zeilen: VersionZeile[] } | null>(null);

  const alles = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const [a, r, lMit] = await Promise.all([
        supabase.from('ablaeufe').select('*').order('erstellt_am', { ascending: false }),
        supabase.from('automation_regeln').select('*').order('erstellt_am', { ascending: false }),
        supabase.from('ablauf_laeufe').select('id,ablauf_id,ziel_typ,ziel_id,status,pfad,weiter_am,meldung,gestartet_am,kontext,entschieden_von_name,entschieden_am')
          .eq('probe', false).order('gestartet_am', { ascending: false }).limit(100),
      ]);
      if (a.error) throw a.error;
      // S2: Ohne SQL p162 fehlen die Nachweis-Spalten — dann wie bisher laden,
      // damit Freigaben nie unsichtbar werden.
      const l = lMit.error
        ? await supabase.from('ablauf_laeufe').select('id,ablauf_id,ziel_typ,ziel_id,status,pfad,weiter_am,meldung,gestartet_am,kontext')
          .eq('probe', false).order('gestartet_am', { ascending: false }).limit(100)
        : lMit;
      const lz = (l.data as LaufZeile[]) ?? [];
      setAblaeufe((a.data as AblaufZeile[]) ?? []);
      setRegeln((r.data as AutomationRegel[]) ?? []);
      setLaeufe(lz);
      // Namen der Vorgänge (Rechnungsnummer, Titel …) für Freigaben und Läufe
      const jeTabelle = new Map<string, string[]>();
      for (const x of lz) {
        const t = x.kontext?.tabelle;
        if (t && x.ziel_id) jeTabelle.set(t, [...(jeTabelle.get(t) ?? []), x.ziel_id]);
      }
      const namen: Record<string, Record<string, unknown>> = {};
      await Promise.all(Array.from(jeTabelle.entries()).map(async ([t, ids]) => {
        const { data } = await supabase.from(t).select('*').in('id', Array.from(new Set(ids)));
        for (const z of (data ?? []) as Record<string, unknown>[]) namen[String(z.id)] = z;
      }));
      setVorgaenge(namen);
    } catch (err: unknown) {
      setFehler('Laden fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setLaden(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      const { data: chefId } = await supabase.rpc('mein_chef_id');
      setUid(id); setChef(!chefId);
      await alles();
    })();
  }, [alles]);

  const ablaufName = useCallback((id: string) => ablaeufe.find((a) => a.id === id)?.name ?? '—', [ablaeufe]);
  const freigaben = useMemo(() => laeufe.filter((l) => l.status === 'freigabe'), [laeufe]);
  const offeneRegeln = useMemo(() => regeln.filter((r) => !ablaeufe.some((a) => a.alt_regel_id === r.id)), [regeln, ablaeufe]);

  async function tu(schluessel: string, arbeit: () => Promise<string>) {
    setBusy(schluessel); setFehler(null); setOk(null);
    try { setOk(await arbeit()); await alles(); }
    catch (err: unknown) { setFehler(err instanceof Error ? err.message : 'Fehler'); }
    finally { setBusy(null); }
  }

  // --- Übernehmen: alte Regel -> Ablauf (startet AUS, alte Regel läuft weiter) ---
  function uebernehmen(r: AutomationRegel) {
    return tu('ueb-' + r.id, async () => {
      if (!uid) throw new Error('Nicht angemeldet.');
      const { ablauf, hinweise } = regelZuAblauf(r);
      const { data, error } = await supabase.from('ablaeufe').insert({
        owner_user_id: uid, name: ablauf.name, beschreibung: ablauf.beschreibung ?? null,
        ausloeser: ablauf.ausloeser, schritte: ablauf.schritte, aktiv: false, version: 1, alt_regel_id: r.id,
      }).select('id').single();
      if (error) throw new Error(error.code === '23505' ? 'Diese Automation wurde schon übernommen.' : 'Übernehmen fehlgeschlagen: ' + error.message);
      const v = await supabase.from('ablauf_versionen').insert({
        owner_user_id: uid, ablauf_id: (data as { id: string }).id, version: 1, name: ablauf.name, ausloeser: ablauf.ausloeser, schritte: ablauf.schritte,
      });
      if (v.error) throw new Error('Fassung 1 nicht gespeichert: ' + v.error.message);
      return `„${ablauf.name}" ist jetzt ein Ablauf (noch ausgeschaltet — die alte Automation läuft weiter, bis Sie den Ablauf einschalten).${hinweise.length ? ' ' + hinweise.join(' ') : ''}`;
    });
  }

  // --- Einschalten: erst die alte Regel aus, dann der Ablauf an — nie beide aktiv ---
  function einschalten(a: AblaufZeile) {
    return tu('an-' + a.id, async () => {
      const p = pruefeAblauf(a);
      if (!p.aktivierbar) throw new Error('Noch nicht einschaltbar: ' + [...p.fehler, ...p.hinweise].join(' · '));
      if (a.alt_regel_id) {
        const alt = await supabase.from('automation_regeln').update({ aktiv: false }).eq('id', a.alt_regel_id);
        if (alt.error) throw new Error('Die alte Automation ließ sich nicht ausschalten: ' + alt.error.message);
      }
      const { data, error } = await supabase.from('ablaeufe').update({ aktiv: true, geaendert_am: new Date().toISOString() }).eq('id', a.id).select('id');
      if (error) throw error;
      if (nichtsGeschrieben(data)) throw new Error(NICHT_GESPEICHERT);
      return `„${a.name}" ist eingeschaltet.${a.alt_regel_id ? ' Die alte Automation ist ausgeschaltet.' : ''} Der Motor prüft stündlich.`;
    });
  }

  function ausschalten(a: AblaufZeile) {
    return tu('aus-' + a.id, async () => {
      const { data, error } = await supabase.from('ablaeufe').update({ aktiv: false, geaendert_am: new Date().toISOString() }).eq('id', a.id).select('id');
      if (error) throw error;
      if (nichtsGeschrieben(data)) throw new Error(NICHT_GESPEICHERT);
      return `„${a.name}" ist ausgeschaltet. Wartende Läufe bleiben stehen, bis Sie ihn wieder einschalten.`;
    });
  }

  // --- Freigabe / Ablehnen / Abbrechen ------------------------------------------
  function entscheiden(l: LaufZeile, art: 'freigeben' | 'ablehnen' | 'abbrechen') {
    return tu(art + '-' + l.id, async () => {
      if (!uid) throw new Error('Nicht angemeldet.');
      if (art === 'ablehnen' || art === 'abbrechen') {
        const text = art === 'ablehnen' ? 'Freigabe abgelehnt' : 'Von der Geschäftsleitung abgebrochen';
        if (typeof window !== 'undefined' && !window.confirm(`${text}? Der Lauf endet, die folgenden Schritte entfallen.`)) return 'Nichts geändert.';
        const { data, error } = await supabase.from('ablauf_laeufe')
          .update({ status: 'abgebrochen', meldung: text, weiter_am: null, beendet_am: new Date().toISOString() })
          .eq('id', l.id).in('status', ['freigabe', 'wartet']).select('id');
        if (error) throw error;
        if (nichtsGeschrieben(data)) throw new Error('Der Lauf hat sich inzwischen geändert — bitte neu laden.');
        await supabase.from('ablauf_protokoll').insert({ owner_user_id: uid, lauf_id: l.id, ablauf_id: l.ablauf_id, pfad: l.pfad, schritt_typ: 'freigabe', ergebnis: 'uebersprungen', meldung: text });
        return text + '.';
      }
      const { data, error } = await supabase.from('ablauf_laeufe')
        .update({ status: 'wartet', weiter_am: new Date().toISOString(), meldung: 'Freigegeben' })
        .eq('id', l.id).eq('status', 'freigabe').select('id');
      if (error) throw error;
      if (nichtsGeschrieben(data)) throw new Error('Der Lauf wartet nicht mehr auf eine Freigabe — bitte neu laden.');
      await supabase.from('ablauf_protokoll').insert({ owner_user_id: uid, lauf_id: l.id, ablauf_id: l.ablauf_id, pfad: l.pfad, schritt_typ: 'freigabe', ergebnis: 'ok', meldung: 'Freigegeben durch die Geschäftsleitung' });
      return 'Freigegeben — der Ablauf geht beim nächsten Durchgang des Motors weiter (spätestens in einer Stunde).';
    });
  }

  // --- Baukasten: neu, aus Vorlage, bearbeiten, Fassung wiederherstellen, speichern ---
  function oeffne(e: Entwurf) {
    setEditor(e); setFehler(null); setOk(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const leer = (): Entwurf => ({ name: '', beschreibung: '', ausloeser: { art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 3, filter: null }, schritte: [] });
  const ausVorlage = (v: AblaufVorlage): Entwurf => ({ ...kopie(v.ablauf), vorlage_key: v.key });
  const zumBearbeiten = (a: AblaufZeile): Entwurf => ({
    id: a.id, version: a.version, aktiv: a.aktiv, name: a.name, beschreibung: a.beschreibung ?? '', ausloeser: kopie(a.ausloeser), schritte: kopie(a.schritte),
  });

  function speichern(e: Entwurf) {
    return tu('speichern', async () => {
      if (!uid) throw new Error('Nicht angemeldet.');
      const p = pruefeAblauf(e);
      if (p.fehler.length > 0) throw new Error(p.fehler.join(' · '));
      const name = e.name.trim();
      if (!e.id) {
        const { data, error } = await supabase.from('ablaeufe').insert({
          owner_user_id: uid, name, beschreibung: e.beschreibung?.trim() || null, ausloeser: e.ausloeser, schritte: e.schritte,
          aktiv: false, version: 1, vorlage_key: e.vorlage_key ?? null,
        }).select('id').single();
        if (error) throw new Error('Anlegen fehlgeschlagen: ' + error.message);
        const v = await supabase.from('ablauf_versionen').insert({ owner_user_id: uid, ablauf_id: (data as { id: string }).id, version: 1, name, ausloeser: e.ausloeser, schritte: e.schritte });
        if (v.error) throw new Error('Fassung 1 nicht gespeichert: ' + v.error.message);
        setEditor(null);
        return `„${name}" ist angelegt — ausgeschaltet. Jetzt „🔍 Probelauf", dann „Einschalten".`;
      }
      const alt = ablaeufe.find((a) => a.id === e.id);
      if (!alt) throw new Error('Ablauf nicht mehr vorhanden — bitte neu laden.');
      if (!neueFassungNoetig(alt, { ...e, name })) {
        const { data, error } = await supabase.from('ablaeufe').update({ beschreibung: e.beschreibung?.trim() || null, geaendert_am: new Date().toISOString() }).eq('id', alt.id).select('id');
        if (error) throw error;
        if (nichtsGeschrieben(data)) throw new Error(NICHT_GESPEICHERT);
        setEditor(null);
        return 'Gespeichert (keine inhaltliche Änderung, Fassung bleibt).';
      }
      if (alt.aktiv && !p.aktivierbar) throw new Error('Der Ablauf ist eingeschaltet — so wäre er nicht mehr lauffähig. Bitte erst ausschalten oder die Hinweise beheben.');
      const neu = Number(alt.version) + 1;
      // Nur speichern, wenn niemand zwischendurch eine neue Fassung angelegt hat.
      const { data, error } = await supabase.from('ablaeufe').update({
        name, beschreibung: e.beschreibung?.trim() || null, ausloeser: e.ausloeser, schritte: e.schritte, version: neu, geaendert_am: new Date().toISOString(),
      }).eq('id', alt.id).eq('version', alt.version).select('id');
      if (error) throw error;
      if (nichtsGeschrieben(data)) throw new Error('Der Ablauf wurde inzwischen geändert — bitte neu laden.');
      const v = await supabase.from('ablauf_versionen').insert({ owner_user_id: uid, ablauf_id: alt.id, version: neu, name, ausloeser: e.ausloeser, schritte: e.schritte });
      if (v.error) throw new Error('Gespeichert, aber die Fassung fehlt im Verlauf: ' + v.error.message);
      setEditor(null);
      return `Fassung ${neu} gespeichert. Laufende Läufe arbeiten mit ihrer Fassung zu Ende.`;
    });
  }

  function jetztStarten(a: AblaufZeile) {
    return tu('start-' + a.id, async () => {
      const antwort = await fetch('/api/ablaeufe/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) });
      const daten = await antwort.json() as { ok: boolean; error?: string; status?: string };
      if (!antwort.ok || !daten.ok) throw new Error(daten.error || 'Start fehlgeschlagen');
      return `„${a.name}" gestartet — Stand: ${STATUS_TEXT[daten.status ?? ''] ?? daten.status}. Details unter „Letzte Läufe" → „Protokoll".`;
    });
  }

  async function zeigeVersionen(a: AblaufZeile) {
    if (versionen?.ablaufId === a.id) { setVersionen(null); return; }
    const { data, error } = await supabase.from('ablauf_versionen').select('id,version,name,ausloeser,schritte,gespeichert_am').eq('ablauf_id', a.id).order('version', { ascending: false });
    if (error) { setFehler('Fassungen: ' + error.message); return; }
    setVersionen({ ablaufId: a.id, zeilen: (data as VersionZeile[]) ?? [] });
  }

  async function probelauf(a: AblaufZeile) {
    setBusy('probe-' + a.id); setFehler(null); setOk(null);
    try {
      const antwort = await fetch(`/api/ablaeufe/probe?id=${encodeURIComponent(a.id)}`, { cache: 'no-store' });
      const daten = await antwort.json() as Probe;
      if (!antwort.ok || !daten.ok) throw new Error(daten.error || 'Probelauf fehlgeschlagen');
      setProbe((p) => ({ ...p, [a.id]: daten }));
    } catch (err: unknown) {
      setFehler('Probelauf fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  async function zeigeProtokoll(l: LaufZeile) {
    if (protokoll?.laufId === l.id) { setProtokoll(null); return; }
    const mit = await supabase.from('ablauf_protokoll').select('id,pfad,schritt_typ,ergebnis,meldung,zeit,erstellt_von_name').eq('lauf_id', l.id).order('zeit', { ascending: true });
    // S2: Rueckfall ohne Nachweis-Spalte (vor SQL p162)
    const { data, error } = mit.error
      ? await supabase.from('ablauf_protokoll').select('id,pfad,schritt_typ,ergebnis,meldung,zeit').eq('lauf_id', l.id).order('zeit', { ascending: true })
      : mit;
    if (error) { setFehler('Protokoll: ' + error.message); return; }
    setProtokoll({ laufId: l.id, zeilen: (data as ProtokollZeile[]) ?? [] });
  }

  // S2 (Paket 162): Nachweis am einzelnen Lauf — wer hat entschieden, wann.
  function entschiedenText(l: LaufZeile): string {
    if (!l.entschieden_von_name) return '';
    return ` · entschieden von ${l.entschieden_von_name}${l.entschieden_am ? ` (${fmtZeit(l.entschieden_am)})` : ''}`;
  }

  function laufZeile(l: LaufZeile, mitEntscheidung: boolean) {
    const v = l.ziel_id ? vorgaenge[l.ziel_id] : undefined;
    const vorgang = l.ziel_typ === 'zeitplan' ? `Zeitplan ${l.kontext?.slot ?? ''}`
      : l.ziel_typ === 'knopf' ? 'Per Knopf gestartet'
      : `${ZIEL_TEXT[l.ziel_typ ?? ''] ?? 'Vorgang'} ${vorgangName(v) || (l.ziel_id ?? '').slice(0, 8)}`;
    const link = l.ziel_typ === 'rechnung' && l.ziel_id ? `/dashboard/rechnungen/${l.ziel_id}` : null;
    return (
      <div key={l.id} style={{ borderTop: `1px solid ${C.border}`, padding: '10px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{ablaufName(l.ablauf_id)} · {link ? <a href={link} style={{ color: C.cyan }}>{vorgang}</a> : vorgang}</div>
            <div style={klein}>
              Gestartet {fmtZeit(l.gestartet_am)} · <span style={{ color: STATUS_FARBE[l.status] ?? C.textDim, fontWeight: 700 }}>{STATUS_TEXT[l.status] ?? l.status}</span>
              {l.status === 'wartet' && l.weiter_am ? ` bis ${fmtZeit(l.weiter_am)}` : ''}{l.meldung ? ` · ${l.meldung}` : ''}
              {entschiedenText(l)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {mitEntscheidung && chef && (
              <>
                <button type="button" disabled={busy !== null} onClick={() => entscheiden(l, 'freigeben')} style={knopf('gold')}>✓ Freigeben</button>
                <button type="button" disabled={busy !== null} onClick={() => entscheiden(l, 'ablehnen')} style={knopf('rot')}>✕ Ablehnen</button>
              </>
            )}
            {!mitEntscheidung && chef && l.status === 'wartet' && (
              <button type="button" disabled={busy !== null} onClick={() => entscheiden(l, 'abbrechen')} style={knopf('rot')}>Abbrechen</button>
            )}
            <button type="button" onClick={() => zeigeProtokoll(l)} style={knopf('rand')}>{protokoll?.laufId === l.id ? 'Protokoll zu' : 'Protokoll'}</button>
          </div>
        </div>
        {protokoll?.laufId === l.id && (
          <div style={{ marginTop: 8, padding: 10, borderRadius: 9, background: 'rgba(10,22,40,0.5)' }}>
            {protokoll.zeilen.length === 0 ? <div style={klein}>Noch keine Einträge.</div> : protokoll.zeilen.map((p) => (
              <div key={p.id} style={{ fontSize: 12.5, padding: '2px 0', color: p.ergebnis === 'fehler' ? C.danger : C.text }}>
                {fmtZeit(p.zeit)} · Schritt {p.pfad ?? '—'} · {p.ergebnis} · {p.meldung}{p.erstellt_von_name ? ` · ${p.erstellt_von_name}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 4px 60px', color: C.text }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 27, fontWeight: 800, margin: '0 0 6px' }}>🔀 Abläufe</h1>
        <p style={{ color: C.textDim, fontSize: 14.5, margin: 0, maxWidth: 780, lineHeight: 1.55 }}>
          Ein Ablauf ist eine Kette von Schritten, die Ihr Betrieb von allein abarbeitet: ein Auslöser (z. B. „Rechnung ist überfällig"),
          danach Aktionen, Wartezeiten und Wenn/Sonst. Schritte, die Geld betreffen, warten auf Ihre Freigabe. Der Motor prüft stündlich
          und schreibt jeden Schritt ins Protokoll.
        </p>
      </div>

      <div style={{ ...karte, borderColor: 'rgba(201,168,76,0.35)' }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>So geht&apos;s</div>
        <div style={{ ...klein, fontSize: 13.5 }}>
          1. Unter „Vorlagen für Ihre Branche" eine Vorlage anklicken oder „＋ Leerer Ablauf" — mit „＋" zwischen den Karten kommen Aktionen, Warten und Wenn/Sonst dazu. Bisherige Automationen ziehen mit „→ Als Ablauf übernehmen" um. Neue Abläufe starten ausgeschaltet.<br />
          2. „🔍 Probelauf" zeigt, was jetzt passieren würde. Es wird nichts ausgeführt.<br />
          3. „Einschalten" — die alte Automation wird dabei ausgeschaltet, damit nichts doppelt läuft. Bereits Erledigtes wird nicht wiederholt.<br />
          4. Wartet ein Lauf auf Sie, steht er unter „Freigaben für Sie": „✓ Freigeben" oder „✕ Ablehnen".
        </div>
      </div>

      {!chef && !laden && (
        <div style={{ ...karte, color: C.warn, fontSize: 14 }}>Abläufe ein- und ausschalten und Freigaben erteilen: nur die Geschäftsleitung. Hier ist der aktuelle Stand zu sehen.</div>
      )}
      {fehler && <div style={{ ...karte, borderColor: 'rgba(224,102,102,0.5)', color: C.danger, fontSize: 14 }}>⚠️ {fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: 'rgba(76,175,125,0.5)', color: C.green, fontSize: 14 }}>✓ {ok}</div>}

      {editor && chef && (
        <AblaufEditor key={editor.id ?? editor.vorlage_key ?? 'neu'} start={editor} busy={busy === 'speichern'} onSpeichern={speichern} onAbbrechen={() => setEditor(null)} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Abläufe', wert: String(ablaeufe.length), farbe: C.cyan },
          { label: 'Eingeschaltet', wert: String(ablaeufe.filter((a) => a.aktiv).length), farbe: C.green },
          { label: 'Warten auf Freigabe', wert: String(freigaben.length), farbe: C.gold },
          { label: 'Laufen / warten', wert: String(laeufe.filter((l) => l.status === 'wartet' || l.status === 'laeuft').length), farbe: C.textDim },
        ].map((k) => (
          <div key={k.label} style={{ ...karte, marginBottom: 0, padding: 14 }}>
            <div style={{ fontSize: 11.5, color: C.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>{k.label}</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: k.farbe, marginTop: 5 }}>{k.wert}</div>
          </div>
        ))}
      </div>

      {freigaben.length > 0 && (
        <div style={{ ...karte, borderColor: 'rgba(201,168,76,0.6)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Freigaben für Sie</h2>
          <div style={klein}>Diese Läufe halten vor einem Schritt, der Geld oder Forderungen betrifft. Nichts passiert ohne Ihr „Freigeben".</div>
          {freigaben.map((l) => laufZeile(l, true))}
        </div>
      )}

      {chef && <AblaufErgebnisse supabase={supabase} />}

      {chef && !editor && (
        <div style={karte}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Vorlagen für Ihre Branche</h2>
            <button type="button" onClick={() => oeffne(leer())} style={knopf('rand')}>＋ Leerer Ablauf</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {GRUPPEN.map((g) => (
              <button key={g.key} type="button" onClick={() => setGruppe(g.key)} style={{ ...knopf(gruppe === g.key ? 'gold' : 'rand'), padding: '5px 11px', fontSize: 12.5 }}>{g.label}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(265px,1fr))', gap: 11 }}>
            {vorlagenFuer(gruppe).map((v) => (
              <button key={v.key} type="button" onClick={() => oeffne(ausVorlage(v))}
                style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${C.border}`, borderRadius: 11, padding: 13, background: 'rgba(10,22,40,0.5)', color: C.text, fontFamily: 'inherit' }}>
                <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 5 }}>{v.name}</div>
                <div style={klein}>{v.beschreibung}</div>
                <div style={{ color: C.cyan, fontSize: 11.5, marginTop: 8, fontWeight: 700 }}>{ausloeserText(v.ablauf.ausloeser)} · {v.ablauf.schritte.length} Schritte</div>
              </button>
            ))}
          </div>
          <div style={{ ...klein, marginTop: 8 }}>{ABLAUF_VORLAGEN.length} Vorlagen. Ein Klick öffnet eine Kopie im Baukasten — gespeichert wird erst mit „Ablauf anlegen", und zwar ausgeschaltet.</div>
        </div>
      )}

      <div style={karte}>
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 12px' }}>Ihre Abläufe</h2>
        {laden ? <div style={klein}>Lädt …</div> : ablaeufe.length === 0 ? (
          <Leerzustand
            icon="🔀"
            titel="Noch keine Abläufe"
            text="Starten Sie mit einer Vorlage für Ihre Branche, bauen Sie eine eigene Kette oder übernehmen Sie eine bisherige Automation."
            schritte={['Oben eine Vorlage anklicken oder „＋ Leerer Ablauf"', 'Schritte mit „＋" ergänzen, „Ablauf anlegen (ausgeschaltet)"', '„🔍 Probelauf", dann „Einschalten"']}
            aktionText="＋ Leerer Ablauf"
            onAktion={() => oeffne(leer())}
          />
        ) : ablaeufe.map((a) => {
          const p = pruefeAblauf(a);
          const pr = probe[a.id];
          return (
            <div key={a.id} style={{ border: `1px solid ${a.aktiv ? 'rgba(76,175,125,0.45)' : C.border}`, borderRadius: 11, padding: 14, marginBottom: 12, background: 'rgba(10,22,40,0.45)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15.5 }}>{a.name} <span style={{ fontSize: 12, color: a.aktiv ? C.green : C.textDim }}>{a.aktiv ? '● eingeschaltet' : '○ ausgeschaltet'}</span></div>
                  <div style={klein}>Auslöser: {ausloeserText(a.ausloeser)} · Fassung {a.version} · zuletzt geprüft {fmtZeit(a.zuletzt_lauf_am)}{a.alt_regel_id ? ' · aus einer Automation übernommen' : ''}</div>
                </div>
                {chef && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {a.aktiv && a.ausloeser.art === 'knopf' && !a.ausloeser.modul && (
                      <button type="button" disabled={busy !== null} onClick={() => jetztStarten(a)} style={knopf('gold')}>▶ Jetzt starten</button>
                    )}
                    <button type="button" disabled={busy !== null} onClick={() => oeffne(zumBearbeiten(a))} style={knopf('rand')}>Bearbeiten</button>
                    <button type="button" onClick={() => zeigeVersionen(a)} style={knopf('rand')}>{versionen?.ablaufId === a.id ? 'Fassungen zu' : 'Fassungen'}</button>
                    <button type="button" disabled={busy !== null} onClick={() => probelauf(a)} style={knopf('rand')}>{busy === 'probe-' + a.id ? 'Rechnet …' : '🔍 Probelauf'}</button>
                    {a.aktiv
                      ? <button type="button" disabled={busy !== null} onClick={() => ausschalten(a)} style={knopf('rand')}>Ausschalten</button>
                      : <button type="button" disabled={busy !== null || !p.aktivierbar} onClick={() => einschalten(a)} style={knopf('gold')}>Einschalten</button>}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 10 }}><SchrittListe schritte={a.schritte} /></div>
              {chef && enthaeltAktion(a.schritte, 'webhook_senden') && <WebhookSchluessel ablaufId={a.id} />}
              {p.fehler.map((f) => <div key={f} style={{ fontSize: 12.5, color: C.danger, marginTop: 4 }}>⚠️ {f}</div>)}
              {p.hinweise.map((h) => <div key={h} style={{ fontSize: 12.5, color: C.warn, marginTop: 4 }}>ℹ️ {h}</div>)}
              {versionen?.ablaufId === a.id && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: 'rgba(10,22,40,0.5)' }}>
                  {versionen.zeilen.length === 0 ? <div style={klein}>Noch keine gespeicherte Fassung.</div> : versionen.zeilen.map((v) => (
                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '4px 0' }}>
                      <div style={{ fontSize: 13 }}>Fassung {v.version}{v.version === a.version ? ' (aktuell)' : ''} · {fmtZeit(v.gespeichert_am)} · {v.name ?? a.name} · {Array.isArray(v.schritte) ? v.schritte.length : 0} Schritte</div>
                      {v.version !== a.version && (
                        <button type="button" onClick={() => oeffne({ ...zumBearbeiten(a), name: v.name ?? a.name, ausloeser: kopie(v.ausloeser), schritte: kopie(v.schritte) })}
                          style={{ ...knopf('rand'), padding: '4px 10px', fontSize: 12.5 }}>Diese Fassung wiederherstellen</button>
                      )}
                    </div>
                  ))}
                  <div style={{ ...klein, marginTop: 4 }}>Wiederherstellen öffnet die alte Fassung im Baukasten; gespeichert wird sie als neue Fassung.</div>
                </div>
              )}
              {pr && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.2)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    Probelauf: {pr.hinweis ?? `${pr.geprueft ?? 0} geprüft · ${pr.faellig ?? 0} fällig · ${pr.wuerde_starten ?? 0} würden jetzt starten${pr.zurueckgestellt ? ` · ${pr.zurueckgestellt} wegen Deckel später` : ''}`}
                  </div>
                  {(pr.beispiele ?? []).map((b, i) => (
                    <div key={i} style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 13, color: C.cyan }}>{b.vorgang}</div>
                      {b.schritte.map((s) => <div key={s.pfad} style={{ ...klein, marginLeft: 12 }}>Schritt {s.pfad}: {s.text}</div>)}
                      <div style={{ ...klein, marginLeft: 12 }}>Danach: {b.danach}</div>
                    </div>
                  ))}
                  <div style={{ ...klein, marginTop: 6 }}>Es wurde nichts ausgeführt.</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {chef && (
        <div style={karte}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Bisherige Automationen übernehmen</h2>
          <div style={{ ...klein, marginBottom: 8 }}>Die alte Automation läuft weiter, bis Sie den neuen Ablauf einschalten. Geld-Schritte (Mahnstufe) bekommen eine Freigabe durch Sie davor.</div>
          {offeneRegeln.length === 0 ? <div style={klein}>Alle Automationen sind übernommen — oder es gibt noch keine.</div> : offeneRegeln.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderTop: `1px solid ${C.border}`, padding: '9px 0' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                <div style={klein}>{r.aktiv ? 'läuft derzeit' : 'pausiert'}</div>
              </div>
              <button type="button" disabled={busy !== null} onClick={() => uebernehmen(r)} style={knopf('rand')}>→ Als Ablauf übernehmen</button>
            </div>
          ))}
        </div>
      )}

      <div style={karte}>
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Letzte Läufe</h2>
        {laeufe.length === 0 ? <div style={klein}>Noch keine Läufe.</div> : laeufe.filter((l) => l.status !== 'freigabe').slice(0, 50).map((l) => laufZeile(l, false))}
      </div>
    </div>
  );
}
