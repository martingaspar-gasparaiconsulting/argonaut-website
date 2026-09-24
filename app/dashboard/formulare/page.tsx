'use client';

// ============================================================
// ARGONAUT OS · Formulare & Checklisten (Paket PL, B23)
// Eigene Vorlagen bauen (12 Feldtypen: Text, Zahl, Datum, Auswahl,
// Prüfpunkt i. O./n. i. O., Foto, Unterschrift …) oder eine Startvorlage
// übernehmen (Übergabe, Abnahme, Fahrzeug, Tagescheck, Kundendienst).
// Ausfüllen auf dem Handy, Entwurf zwischenspeichern, abschließen, PDF.
// Jedes ausgefüllte Formular speichert eine KOPIE der Felder — spätere
// Änderungen an der Vorlage verändern alte Protokolle nicht.
// Logik: lib/formularBaukasten.ts (getestet), PDF: lib/formularPdf.ts.
// RLS + Speicher: supabase-sql/pl-formulare.sql. Kein KI-Aufruf.
//
// Pfad: app/dashboard/formulare/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef, CSSProperties, PointerEvent, ChangeEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { verkleinereBild } from '@/lib/bildKlein';
import {
  FELD_TYPEN, KATEGORIEN, STARTVORLAGEN, feldTyp, neueFeldId, leseOptionen, pruefeVorlage, pruefeWerte, ergebnis,
  fortschritt, wertText, type Feld, type FeldTyp, type Werte,
} from '@/lib/formularBaukasten';
import { formularPdf } from '@/lib/formularPdf';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const BUCKET = 'formulare';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Vorlage = { id: string; titel: string; kategorie: string; beschreibung: string | null; felder: Feld[]; version: number; aktiv: boolean };
type Eintrag = {
  id: string; vorlage_id: string | null; vorlage_titel: string; vorlage_version: number; felder: Feld[]; werte: Werte;
  projekt_id: string | null; bezug: string | null; status: string; ergebnis: string | null; erstellt_von: string | null;
  erstellt_von_name: string | null; erstellt_am: string; abgeschlossen_am: string | null;
};
type Projekt = { id: string; name: string | null };
type Editor = { id: string | null; titel: string; kategorie: string; beschreibung: string; felder: (Feld & { optionenText?: string })[] };

function datumDe(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = iso.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function dataUrlVon(blob: Blob): Promise<string> {
  return new Promise((ja, nein) => { const r = new FileReader(); r.onload = () => ja(String(r.result)); r.onerror = () => nein(new Error('lesen')); r.readAsDataURL(blob); });
}

export default function FormularSeite() {
  const [uid, setUid] = useState<string | null>(null);
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [meinName, setMeinName] = useState('');
  const [istMitarbeiter, setIstMitarbeiter] = useState(false);
  const [firma, setFirma] = useState('');
  const [vorlagen, setVorlagen] = useState<Vorlage[]>([]);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [ansicht, setAnsicht] = useState<'liste' | 'vorlagen'>('liste');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [offen, setOffen] = useState<Eintrag | null>(null);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    const [v, e] = await Promise.all([
      supabase.from('formular_vorlage').select('*').order('titel', { ascending: true }),
      supabase.from('formular_eintrag').select('*').order('erstellt_am', { ascending: false }).limit(200),
    ]);
    if (v.error) { setFehler(/formular_vorlage/.test(v.error.message) ? 'Die Formulare sind noch nicht eingerichtet (SQL von Paket PL fehlt).' : 'Laden fehlgeschlagen.'); return; }
    setVorlagen((v.data as Vorlage[]) ?? []);
    setEintraege((e.data as Eintrag[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user;
      setUid(u?.id ?? null);
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      setMeinName(String(meta.full_name ?? meta.name ?? '').trim() || String(u?.email ?? '').split('@')[0]);
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstMitarbeiter(!!chef && chef !== u?.id);
      setBetrieb(chef || u?.id || null);
      const { data: p } = await supabase.from('projekte').select('id, name').eq('archiviert', false);
      setProjekte((p as Projekt[]) ?? []);
      if (u?.id) {
        try {
          const { data: ci } = await supabase.from('web_ci').select('firma').eq('owner_user_id', chef || u.id).maybeSingle();
          setFirma(String((ci as { firma?: string | null } | null)?.firma ?? '').trim());
        } catch { /* egal */ }
      }
      await laden();
    })();
  }, [laden]);

  // Fotos des offenen Formulars nachladen
  useEffect(() => {
    if (!offen) return;
    const pfade: string[] = [];
    for (const f of offen.felder) if (f.typ === 'foto' && Array.isArray(offen.werte[f.id])) pfade.push(...(offen.werte[f.id] as string[]));
    const fehlend = pfade.filter((p) => !fotoUrls[p]);
    if (!fehlend.length) return;
    (async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(fehlend, 3600);
      const neu: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) neu[d.path] = d.signedUrl;
      setFotoUrls((a) => ({ ...a, ...neu }));
    })();
  }, [offen, fotoUrls]);

  // --- Vorlagen ------------------------------------------------------------
  function vorlageNeu(start?: (typeof STARTVORLAGEN)[number]) {
    setEditor({
      id: null, titel: start?.titel ?? '', kategorie: start?.kategorie ?? 'checkliste', beschreibung: start?.beschreibung ?? '',
      felder: (start?.felder ?? [{ id: 'f1', typ: 'text' as FeldTyp, label: '' }]).map((f) => ({ ...f, optionenText: (f.optionen ?? []).join(', ') })),
    });
  }
  function vorlageBearbeiten(v: Vorlage) {
    setEditor({ id: v.id, titel: v.titel, kategorie: v.kategorie, beschreibung: v.beschreibung ?? '', felder: v.felder.map((f) => ({ ...f, optionenText: (f.optionen ?? []).join(', ') })) });
  }
  function feldAendern(i: number, patch: Partial<Feld & { optionenText?: string }>) {
    if (!editor) return;
    setEditor({ ...editor, felder: editor.felder.map((f, k) => (k === i ? { ...f, ...patch } : f)) });
  }
  function feldVerschieben(i: number, r: -1 | 1) {
    if (!editor) return;
    const j = i + r; if (j < 0 || j >= editor.felder.length) return;
    const n = [...editor.felder]; [n[i], n[j]] = [n[j], n[i]];
    setEditor({ ...editor, felder: n });
  }
  async function vorlageSpeichern() {
    if (!editor || !uid) return;
    const r = pruefeVorlage(editor.titel, editor.felder.map((f) => ({ ...f, optionen: f.optionenText !== undefined ? leseOptionen(f.optionenText) : f.optionen })));
    if (r.fehler.length) { setFehler(r.fehler.join(' ')); return; }
    setBusy(true); setFehler(null);
    try {
      const zeile = { titel: editor.titel.trim().slice(0, 200), kategorie: editor.kategorie, beschreibung: editor.beschreibung.trim() || null, felder: r.felder, aktualisiert_am: new Date().toISOString() };
      if (editor.id) {
        const alt = vorlagen.find((v) => v.id === editor.id);
        const { error } = await supabase.from('formular_vorlage').update({ ...zeile, version: (alt?.version ?? 1) + 1 }).eq('id', editor.id);
        if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
      } else {
        const { error } = await supabase.from('formular_vorlage').insert({ ...zeile, owner_user_id: uid });
        if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
      }
      setEditor(null); setOk('Vorlage gespeichert. Bereits ausgefüllte Formulare bleiben unverändert.'); await laden();
    } finally { setBusy(false); }
  }
  async function vorlageAktiv(v: Vorlage) {
    await supabase.from('formular_vorlage').update({ aktiv: !v.aktiv }).eq('id', v.id);
    await laden();
  }

  // --- Ausfüllen -----------------------------------------------------------
  async function starten(v: Vorlage) {
    if (!uid) return;
    setBusy(true); setFehler(null);
    try {
      const zeile: Record<string, unknown> = {
        vorlage_id: v.id, vorlage_titel: v.titel, vorlage_version: v.version, felder: v.felder, werte: {},
        erstellt_von: uid, erstellt_von_name: meinName || null,
      };
      if (!istMitarbeiter) zeile.owner_user_id = uid;
      const { data, error } = await supabase.from('formular_eintrag').insert(zeile).select('*').single();
      if (error || !data) { setFehler('Formular konnte nicht angelegt werden.'); return; }
      setOffen(data as Eintrag); await laden();
    } finally { setBusy(false); }
  }

  function wertSetzen(feldId: string, wert: unknown) {
    if (!offen) return;
    setOffen({ ...offen, werte: { ...offen.werte, [feldId]: wert } });
  }

  const darfBearbeiten = !!offen && offen.status === 'entwurf' && (!istMitarbeiter || offen.erstellt_von === uid);

  async function speichern(abschliessen: boolean) {
    if (!offen) return;
    const fehlerListe = pruefeWerte(offen.felder, offen.werte, abschliessen);
    if (fehlerListe.length) { setFehler(fehlerListe.join(' ')); return; }
    if (abschliessen && !window.confirm('Formular abschließen? Danach kann es nicht mehr geändert werden.')) return;
    setBusy(true); setFehler(null);
    try {
      const e = ergebnis(offen.felder, offen.werte);
      const patch: Record<string, unknown> = {
        werte: offen.werte, bezug: offen.bezug?.trim() || null, projekt_id: offen.projekt_id || null,
        ergebnis: e.gesamt, aktualisiert_am: new Date().toISOString(),
      };
      if (abschliessen) { patch.status = 'abgeschlossen'; patch.abgeschlossen_am = new Date().toISOString(); }
      const { data, error } = await supabase.from('formular_eintrag').update(patch).eq('id', offen.id).select('*').single();
      if (error || !data) { setFehler('Speichern fehlgeschlagen.'); return; }
      setOffen(data as Eintrag); setOk(abschliessen ? 'Formular abgeschlossen.' : 'Entwurf gespeichert.'); await laden();
    } finally { setBusy(false); }
  }

  async function fotoHinzu(feld: Feld, e: ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    e.target.value = '';
    if (!datei || !offen || !betrieb || !UUID.test(betrieb)) return;
    setBusy(true); setFehler(null);
    try {
      const klein = await verkleinereBild(datei, 1600, 0.82);
      const endung = klein.type === 'image/webp' ? 'webp' : klein.type === 'image/png' ? 'png' : klein.type === 'image/jpeg' ? 'jpg' : null;
      if (!endung) { setFehler('Bitte ein Foto (JPG, PNG, WebP).'); return; }
      const pfad = `${betrieb}/formulare/${offen.id}/${Date.now()}.${endung}`;
      const up = await supabase.storage.from(BUCKET).upload(pfad, klein, { upsert: false, contentType: klein.type });
      if (up.error) { setFehler('Foto konnte nicht hochgeladen werden.'); return; }
      const alt = Array.isArray(offen.werte[feld.id]) ? (offen.werte[feld.id] as string[]) : [];
      wertSetzen(feld.id, [...alt, pfad]);
    } finally { setBusy(false); }
  }

  async function pdf(ei: Eintrag) {
    setBusy(true);
    try {
      const pfade: string[] = [];
      for (const f of ei.felder) if (f.typ === 'foto' && Array.isArray(ei.werte[f.id])) pfade.push(...(ei.werte[f.id] as string[]));
      const fotos: Record<string, string> = {};
      if (pfade.length) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrls(pfade, 600);
        for (const d of data ?? []) {
          if (!d.path || !d.signedUrl) continue;
          try { const b = await (await fetch(d.signedUrl)).blob(); fotos[d.path] = await dataUrlVon(b); } catch { /* ohne dieses Foto */ }
        }
      }
      formularPdf({
        titel: ei.vorlage_titel, bezug: [ei.bezug, projekte.find((p) => p.id === ei.projekt_id)?.name].filter(Boolean).join(' · ') || null,
        firma, erstellt_von: ei.erstellt_von_name, datum: ei.abgeschlossen_am ?? ei.erstellt_am, status: ei.status,
        felder: ei.felder, werte: ei.werte, fotos,
      });
    } finally { setBusy(false); }
  }

  async function loeschen(ei: Eintrag) {
    if (!window.confirm(`„${ei.vorlage_titel}" vom ${datumDe(ei.erstellt_am)} löschen?`)) return;
    const { error } = await supabase.from('formular_eintrag').delete().eq('id', ei.id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    setOffen(null); await laden();
  }

  const aktive = useMemo(() => vorlagen.filter((v) => v.aktiv), [vorlagen]);

  // --- Anzeige: offenes Formular ------------------------------------------
  if (offen) {
    const fs = fortschritt(offen.felder, offen.werte);
    const erg = ergebnis(offen.felder, offen.werte);
    return (
      <div style={s.page}>
        <button style={s.zurueckBtn} onClick={() => { setOffen(null); setOk(null); setFehler(null); }}>← Übersicht</button>
        <h1 style={s.h1}>📋 {offen.vorlage_titel}</h1>
        <div style={s.dim}>
          {offen.status === 'abgeschlossen' ? `Abgeschlossen am ${datumDe(offen.abgeschlossen_am)}` : `Entwurf · ${fs.gefuellt} von ${fs.gesamt} Feldern${fs.pflichtOffen ? ` · ${fs.pflichtOffen} Pflichtfelder offen` : ''}`}
          {offen.erstellt_von_name ? ` · ${offen.erstellt_von_name}` : ''}
        </div>
        {erg.gesamt && <div style={{ ...s.badge, marginTop: 8, color: erg.gesamt === 'io' ? C.green : erg.gesamt === 'nio' ? C.danger : C.warn, borderColor: 'currentColor' }}>
          {erg.gesamt === 'io' ? 'Alle Prüfpunkte i. O.' : erg.gesamt === 'nio' ? `${erg.nio} Prüfpunkt(e) n. i. O.` : `${erg.offen} Prüfpunkt(e) offen`}
        </div>}
        {ok && <div style={s.ok}>{ok}</div>}
        {fehler && <div style={s.err}>{fehler}</div>}

        <div style={s.card}>
          <div style={s.row}>
            <label style={{ ...s.lab, flex: 2 }}>Bezug (Kunde, Objekt, Auftrag)<input style={s.inp} disabled={!darfBearbeiten} value={offen.bezug ?? ''} onChange={(e) => setOffen({ ...offen, bezug: e.target.value })} /></label>
            <label style={{ ...s.lab, flex: 1 }}>Baustelle / Projekt<select style={s.inp} disabled={!darfBearbeiten} value={offen.projekt_id ?? ''} onChange={(e) => setOffen({ ...offen, projekt_id: e.target.value || null })}>
              <option value="">—</option>{projekte.map((p) => <option key={p.id} value={p.id}>{p.name || 'Projekt ohne Name'}</option>)}
            </select></label>
          </div>
        </div>

        <div style={s.card}>
          {offen.felder.map((f) => <FeldEingabe key={f.id} feld={f} wert={offen.werte[f.id]} aktiv={darfBearbeiten} fotoUrls={fotoUrls}
            onWert={(w) => wertSetzen(f.id, w)} onFoto={(e) => fotoHinzu(f, e)} />)}
        </div>

        <div style={s.leiste}>
          {darfBearbeiten && <button style={{ ...s.klein, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => speichern(false)}>💾 Entwurf speichern</button>}
          {darfBearbeiten && <button style={{ ...s.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => speichern(true)}>✔ Abschließen</button>}
          <button style={s.klein} disabled={busy} onClick={() => pdf(offen)}>📄 PDF</button>
          {!istMitarbeiter && <button style={{ ...s.klein, color: C.danger }} onClick={() => loeschen(offen)}>🗑</button>}
        </div>
      </div>
    );
  }

  // --- Anzeige: Vorlagen-Editor --------------------------------------------
  if (editor) {
    return (
      <div style={s.page}>
        <button style={s.zurueckBtn} onClick={() => setEditor(null)}>← Übersicht</button>
        <h1 style={s.h1}>{editor.id ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</h1>
        {fehler && <div style={s.err}>{fehler}</div>}
        <div style={s.card}>
          <div style={s.row}>
            <label style={{ ...s.lab, flex: 2 }}>Titel<input style={s.inp} value={editor.titel} onChange={(e) => setEditor({ ...editor, titel: e.target.value })} placeholder="z. B. Übergabe Bad" /></label>
            <label style={{ ...s.lab, flex: 1 }}>Art<select style={s.inp} value={editor.kategorie} onChange={(e) => setEditor({ ...editor, kategorie: e.target.value })}>
              {KATEGORIEN.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select></label>
          </div>
          <label style={s.lab}>Beschreibung<input style={s.inp} value={editor.beschreibung} onChange={(e) => setEditor({ ...editor, beschreibung: e.target.value })} /></label>
        </div>
        <div style={s.card}>
          <div style={{ fontWeight: 800 }}>Felder</div>
          {editor.felder.map((f, i) => (
            <div key={f.id + i} style={s.feldZeile}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button style={s.mini} onClick={() => feldVerschieben(i, -1)}>▲</button>
                <button style={s.mini} onClick={() => feldVerschieben(i, 1)}>▼</button>
              </div>
              <select style={{ ...s.inp, width: 190 }} value={f.typ} onChange={(e) => feldAendern(i, { typ: e.target.value as FeldTyp })}>
                {FELD_TYPEN.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <input style={{ ...s.inp, flex: 1, minWidth: 180 }} value={f.label} placeholder={f.typ === 'hinweis' ? 'Hinweistext' : 'Beschriftung'} onChange={(e) => feldAendern(i, { label: e.target.value })} />
              {(f.typ === 'auswahl' || f.typ === 'mehrfach') && <input style={{ ...s.inp, flex: 1, minWidth: 160 }} value={f.optionenText ?? ''} placeholder="Möglichkeiten, mit Komma getrennt" onChange={(e) => feldAendern(i, { optionenText: e.target.value })} />}
              {feldTyp(f.typ)?.eingabe && <label style={s.check}><input type="checkbox" checked={!!f.pflicht} onChange={(e) => feldAendern(i, { pflicht: e.target.checked })} /> Pflicht</label>}
              <button style={{ ...s.mini, color: C.danger }} onClick={() => setEditor({ ...editor, felder: editor.felder.filter((_, k) => k !== i) })}>✕</button>
            </div>
          ))}
          <button style={s.dazu} onClick={() => setEditor({ ...editor, felder: [...editor.felder, { id: neueFeldId(editor.felder.map((x) => x.id)), typ: 'pruefpunkt', label: '' }] })}>＋ Feld</button>
        </div>
        <div style={s.leiste}>
          <button style={{ ...s.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={vorlageSpeichern}>💾 Vorlage speichern</button>
          <button style={s.klein} onClick={() => setEditor(null)}>Abbrechen</button>
        </div>
      </div>
    );
  }

  // --- Anzeige: Übersicht --------------------------------------------------
  return (
    <div style={s.page}>
      <h1 style={s.h1}>📋 Formulare &amp; Checklisten</h1>
      <p style={s.sub}>Eigene Protokolle für Übergabe, Abnahme, Prüfung und Kundendienst — auf dem Handy ausfüllen, mit Foto und Unterschrift, als PDF.</p>
      {ok && <div style={s.ok}>{ok}</div>}
      {fehler && <div style={s.err}>{fehler}</div>}

      <div style={s.tabs}>
        <button style={{ ...s.tab, ...(ansicht === 'liste' ? s.tabAn : {}) }} onClick={() => setAnsicht('liste')}>Ausfüllen</button>
        {!istMitarbeiter && <button style={{ ...s.tab, ...(ansicht === 'vorlagen' ? s.tabAn : {}) }} onClick={() => setAnsicht('vorlagen')}>Vorlagen verwalten</button>}
      </div>

      {ansicht === 'liste' && (
        <>
          <div style={s.card}>
            <div style={{ fontWeight: 800 }}>Neues Formular</div>
            <div style={s.leiste}>
              {aktive.map((v) => <button key={v.id} style={s.klein} disabled={busy} onClick={() => starten(v)}>＋ {v.titel}</button>)}
              {!aktive.length && <div style={s.dim}>{istMitarbeiter ? 'Noch keine Vorlagen — die legt die Geschäftsleitung an.' : 'Noch keine Vorlagen. Unter „Vorlagen verwalten" eine Startvorlage übernehmen.'}</div>}
            </div>
          </div>
          <div style={s.liste}>
            {eintraege.map((ei) => {
              const fs = fortschritt(ei.felder, ei.werte);
              return (
                <button key={ei.id} style={s.zeile} onClick={() => setOffen(ei)}>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700 }}>{ei.vorlage_titel}{ei.bezug ? ` · ${ei.bezug}` : ''}</div>
                    <div style={s.dim}>{datumDe(ei.erstellt_am)}{ei.erstellt_von_name ? ` · ${ei.erstellt_von_name}` : ''}{ei.status === 'entwurf' ? ` · ${fs.gefuellt}/${fs.gesamt} ausgefüllt` : ''}</div>
                  </div>
                  {ei.ergebnis && <span style={{ ...s.badge, color: ei.ergebnis === 'io' ? C.green : ei.ergebnis === 'nio' ? C.danger : C.warn }}>{ei.ergebnis === 'io' ? 'i. O.' : ei.ergebnis === 'nio' ? 'n. i. O.' : 'offen'}</span>}
                  <span style={{ ...s.badge, color: ei.status === 'abgeschlossen' ? C.green : C.textDim }}>{ei.status === 'abgeschlossen' ? 'abgeschlossen' : 'Entwurf'}</span>
                </button>
              );
            })}
            {!eintraege.length && !fehler && <div style={s.dim}>Noch keine ausgefüllten Formulare.</div>}
          </div>
        </>
      )}

      {ansicht === 'vorlagen' && !istMitarbeiter && (
        <>
          <div style={s.card}>
            <div style={{ fontWeight: 800 }}>Startvorlagen übernehmen und anpassen</div>
            <div style={s.leiste}>
              {STARTVORLAGEN.map((sv) => <button key={sv.titel} style={s.klein} title={sv.beschreibung} onClick={() => vorlageNeu(sv)}>＋ {sv.titel}</button>)}
              <button style={s.primaer} onClick={() => vorlageNeu()}>＋ Leere Vorlage</button>
            </div>
          </div>
          <div style={s.liste}>
            {vorlagen.map((v) => (
              <div key={v.id} style={{ ...s.zeile, cursor: 'default' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{v.titel} <span style={s.dim}>· Version {v.version}</span></div>
                  <div style={s.dim}>{KATEGORIEN.find((k) => k.key === v.kategorie)?.label ?? v.kategorie} · {v.felder.length} Felder{v.aktiv ? '' : ' · ausgeblendet'}</div>
                </div>
                <button style={s.klein} onClick={() => vorlageBearbeiten(v)}>✏️ Bearbeiten</button>
                <button style={s.klein} onClick={() => vorlageAktiv(v)}>{v.aktiv ? 'Ausblenden' : 'Einblenden'}</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ein Feld zum Ausfüllen
// ---------------------------------------------------------------------------
function FeldEingabe({ feld, wert, aktiv, fotoUrls, onWert, onFoto }: {
  feld: Feld; wert: unknown; aktiv: boolean; fotoUrls: Record<string, string>;
  onWert: (w: unknown) => void; onFoto: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const label = <div style={{ fontSize: 13.5, fontWeight: 700 }}>{feld.label}{feld.pflicht ? <span style={{ color: C.danger }}> *</span> : null}</div>;
  if (feld.typ === 'ueberschrift') return <div style={{ fontWeight: 800, fontSize: 16, marginTop: 10, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>{feld.label}</div>;
  if (feld.typ === 'hinweis') return <div style={{ ...s.dim, fontStyle: 'italic' }}>ℹ️ {feld.label}</div>;
  if (!aktiv) {
    if (feld.typ === 'unterschrift' && typeof wert === 'string' && wert.startsWith('data:image/png')) {
      return <div>{label}<img src={wert} alt="Unterschrift" style={{ height: 60, background: '#fff', borderRadius: 6, marginTop: 4 }} /></div>;
    }
    if (feld.typ === 'foto' && Array.isArray(wert)) {
      return <div>{label}<div style={s.leiste}>{(wert as string[]).map((p) => fotoUrls[p] ? <a key={p} href={fotoUrls[p]} target="_blank" rel="noreferrer"><img src={fotoUrls[p]} alt="Foto" style={s.foto} /></a> : null)}</div></div>;
    }
    return <div>{label}<div style={{ fontSize: 14.5, marginTop: 2 }}>{wertText(feld, wert)}</div></div>;
  }
  switch (feld.typ) {
    case 'text': return <label style={s.lab}>{label}<input style={s.inp} value={String(wert ?? '')} onChange={(e) => onWert(e.target.value)} /></label>;
    case 'textlang': return <label style={s.lab}>{label}<textarea style={{ ...s.inp, minHeight: 70 }} value={String(wert ?? '')} onChange={(e) => onWert(e.target.value)} /></label>;
    case 'zahl': return <label style={s.lab}>{label}<input style={s.inp} inputMode="decimal" value={String(wert ?? '')} onChange={(e) => onWert(e.target.value)} /></label>;
    case 'datum': return <label style={s.lab}>{label}<input type="date" style={s.inp} value={String(wert ?? '')} onChange={(e) => onWert(e.target.value)} /></label>;
    case 'auswahl': return <label style={s.lab}>{label}<select style={s.inp} value={String(wert ?? '')} onChange={(e) => onWert(e.target.value)}><option value="">—</option>{(feld.optionen ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select></label>;
    case 'mehrfach': {
      const liste = Array.isArray(wert) ? (wert as string[]) : [];
      return <div>{label}<div style={s.leiste}>{(feld.optionen ?? []).map((o) => (
        <label key={o} style={s.check}><input type="checkbox" checked={liste.includes(o)} onChange={(e) => onWert(e.target.checked ? [...liste, o] : liste.filter((x) => x !== o))} /> {o}</label>
      ))}</div></div>;
    }
    case 'ja_nein':
    case 'pruefpunkt': {
      const wahl = feld.typ === 'ja_nein' ? [['ja', 'Ja', C.green], ['nein', 'Nein', C.danger]] : [['io', 'i. O.', C.green], ['nio', 'n. i. O.', C.danger], ['entfaellt', 'entfällt', C.textDim]];
      return <div>{label}<div style={s.leiste}>{wahl.map(([k, t, farbe]) => (
        <button key={k} style={{ ...s.wahl, borderColor: wert === k ? farbe : C.border, background: wert === k ? farbe : 'transparent', color: wert === k ? C.navy : C.text }} onClick={() => onWert(wert === k ? '' : k)}>{t}</button>
      ))}</div></div>;
    }
    case 'foto': {
      const liste = Array.isArray(wert) ? (wert as string[]) : [];
      return <div>{label}<div style={s.leiste}>
        {liste.map((p) => <span key={p} style={{ position: 'relative' }}>
          {fotoUrls[p] ? <img src={fotoUrls[p]} alt="Foto" style={s.foto} /> : <span style={{ ...s.foto, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>📷</span>}
          <button style={{ ...s.mini, position: 'absolute', top: 2, right: 2 }} onClick={() => onWert(liste.filter((x) => x !== p))}>✕</button>
        </span>)}
        <label style={s.klein}>📷 Foto<input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFoto} /></label>
      </div></div>;
    }
    case 'unterschrift': return <div>{label}<Unterschrift wert={typeof wert === 'string' ? wert : ''} onWert={onWert} /></div>;
    default: return null;
  }
}

function Unterschrift({ wert, onWert }: { wert: string; onWert: (w: string) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const zeichnet = useRef(false);
  const [leerFlaeche, setLeerFlaeche] = useState(true);
  function punkt(e: PointerEvent<HTMLCanvasElement>) {
    const c = ref.current; if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function start(e: PointerEvent<HTMLCanvasElement>) {
    const ctx = ref.current?.getContext('2d'); const p = punkt(e); if (!ctx || !p) return;
    zeichnet.current = true; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#0A1628';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ref.current?.setPointerCapture(e.pointerId);
  }
  function zug(e: PointerEvent<HTMLCanvasElement>) {
    if (!zeichnet.current) return;
    const ctx = ref.current?.getContext('2d'); const p = punkt(e); if (!ctx || !p) return;
    ctx.lineTo(p.x, p.y); ctx.stroke(); setLeerFlaeche(false);
  }
  function ende() { zeichnet.current = false; }
  function leeren() { const c = ref.current; c?.getContext('2d')?.clearRect(0, 0, c.width, c.height); setLeerFlaeche(true); }
  if (wert) {
    return <div style={s.leiste}><img src={wert} alt="Unterschrift" style={{ height: 70, background: '#fff', borderRadius: 6 }} /><button style={s.klein} onClick={() => onWert('')}>Neu unterschreiben</button></div>;
  }
  return (
    <div>
      <canvas ref={ref} width={600} height={180} onPointerDown={start} onPointerMove={zug} onPointerUp={ende} onPointerLeave={ende}
        style={{ width: '100%', maxWidth: 480, height: 144, background: '#fff', borderRadius: 8, touchAction: 'none', display: 'block', marginTop: 4 }} />
      <div style={s.leiste}>
        <button style={s.klein} onClick={leeren}>Löschen</button>
        <button style={{ ...s.klein, opacity: leerFlaeche ? 0.5 : 1 }} disabled={leerFlaeche} onClick={() => { const d = ref.current?.toDataURL('image/png'); if (d) onWert(d); }}>✔ Unterschrift übernehmen</button>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueckBtn: { background: 'transparent', color: C.textDim, border: 'none', fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'inherit' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  sub: { color: C.textDim, fontSize: 14.5, margin: '6px 0 0' },
  tabs: { display: 'flex', gap: 8, margin: '16px 0 6px', flexWrap: 'wrap' },
  tab: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  tabAn: { background: C.gold, color: C.navy, borderColor: C.gold },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 },
  leiste: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 },
  liste: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', color: C.text, cursor: 'pointer', fontFamily: 'inherit', flexWrap: 'wrap' },
  feldZeile: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderBottom: `1px solid ${C.border}`, paddingBottom: 8 },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 12.5, fontWeight: 700 },
  dim: { color: C.textDim, fontSize: 13 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.text, cursor: 'pointer' },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  wahl: { border: '1px solid', borderRadius: 10, padding: '10px 16px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', minWidth: 80 },
  foto: { width: 96, height: 72, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}`, background: C.navy },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  klein: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 },
  mini: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '2px 7px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
  dazu: { background: 'transparent', color: C.text, border: `1px dashed ${C.border}`, borderRadius: 9, padding: '8px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
