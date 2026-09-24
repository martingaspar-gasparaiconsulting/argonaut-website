'use client';

// ============================================================
// ARGONAUT OS · Gesprächsprotokolle mit Nachfass (Paket PG · B13)
//
// Gespräch diktieren -> Protokoll (wer macht was bis wann) -> speichern,
// eigene Aufgaben ins Cockpit, Nachfass-Termin, Nachfass-Mail (verschickt
// der Mensch selbst), PDF über die bestehende Text-PDF-Route.
// Mit Kundenkartei verknüpft: Eintrag in der Kontakt-Chronik und auf Wunsch
// Wiedervorlage beim Kontakt.
//
// Logik: lib/gespraechsProtokoll.ts (getestet). Tabelle: gespraech_protokoll.
// Unterpfad von /dashboard/crm — erbt die CRM-Freigabe.
//
// Pfad: app/dashboard/crm/gespraeche/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties, type ReactNode } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Diktat from '../../_components/Diktat';
import { heuteIso } from '@/lib/sachbearbeiter';
import { ARTEN, datumDe, type Protokoll, type ProtokollArt } from '@/lib/gespraechsProtokoll';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Kontakt = { id: string; vorname: string | null; nachname: string | null; firma: string | null; email: string | null };
type CockpitAufgabe = { titel: string; beschreibung: string; prioritaet: 'hoch' | 'normal'; faellig_am?: string };
type Ergebnis = {
  datum: string; protokoll: Protokoll; markdown: string; nachfass_am: string;
  mail: { betreff: string; text: string }; aufgaben: CockpitAufgabe[]; firma: string;
};
type Zeile = {
  id: string; art: ProtokollArt; titel: string; datum: string; ort: string | null; kontakt_id: string | null;
  protokoll_text: string; nachfass_am: string | null; nachfass_erledigt: boolean; inhalt: { mail?: { betreff: string; text: string } } | null;
};

const kName = (k: Kontakt) => [`${k.vorname ?? ''} ${k.nachname ?? ''}`.trim(), k.firma].filter(Boolean).join(' · ') || 'Ohne Namen';

export default function GespraechePage() {
  const heute = heuteIso(new Date());
  const [liste, setListe] = useState<Zeile[]>([]);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [laden, setLaden] = useState(true);
  const [tabelleFehlt, setTabelleFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [neu, setNeu] = useState(false);

  const load = useCallback(async () => {
    setLaden(true); setFehler(null);
    try {
      const { data, error } = await supabase.from('gespraech_protokoll')
        .select('id,art,titel,datum,ort,kontakt_id,protokoll_text,nachfass_am,nachfass_erledigt,inhalt')
        .order('datum', { ascending: false }).limit(200);
      if (error) {
        if (/gespraech_protokoll/.test(error.message)) setTabelleFehlt(true); else throw error;
      } else { setTabelleFehlt(false); setListe((data as Zeile[]) ?? []); }
      const { data: k } = await supabase.from('kontakte').select('id,vorname,nachname,firma,email').order('nachname', { ascending: true }).limit(1000);
      setKontakte((k as Kontakt[]) ?? []);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Laden fehlgeschlagen.');
    } finally { setLaden(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const faellig = liste.filter((z) => !z.nachfass_erledigt && z.nachfass_am && z.nachfass_am <= heute);
  const kontaktMap = useMemo(() => Object.fromEntries(kontakte.map((k) => [k.id, k])), [kontakte]);

  async function nachfassErledigt(id: string) {
    const { error } = await supabase.from('gespraech_protokoll').update({ nachfass_erledigt: true, aktualisiert_am: new Date().toISOString() }).eq('id', id);
    if (error) { setFehler(`Nicht gespeichert: ${error.message}`); return; }
    load();
  }

  return (
    <div style={S.page}>
      <div style={S.eyebrow}>ARGONAUT OS · Vertrieb</div>
      <h1 style={S.h1}>Gesprächsprotokolle</h1>
      <p style={S.sub}>Gespräch diktieren — Protokoll, Aufgaben und Nachfass-Mail entstehen daraus. <a href="/dashboard/crm" style={{ color: C.cyan }}>← zurück zum CRM</a></p>

      {fehler && <div style={S.fehler}>{fehler}</div>}
      {tabelleFehlt && <div style={S.fehler}>Die Tabelle gespraech_protokoll fehlt noch. Bitte zuerst das SQL aus Paket PG in Supabase ausführen.</div>}

      {!tabelleFehlt && (
        <>
          {!neu
            ? <button style={S.knopf} onClick={() => setNeu(true)}>🎙 Neues Gespräch protokollieren</button>
            : <NeuesProtokoll kontakte={kontakte} heute={heute} onFertig={() => { setNeu(false); load(); }} onAbbruch={() => setNeu(false)} />}

          {faellig.length > 0 && (
            <div style={{ ...S.box, borderColor: C.warn, marginTop: 18 }}>
              <div style={S.zwischen}>⏰ Nachfassen fällig ({faellig.length})</div>
              {faellig.map((z) => (
                <div key={z.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 8, fontSize: 14 }}>
                  <span style={{ color: z.nachfass_am! < heute ? C.danger : C.warn }}>
                    {datumDe(z.nachfass_am)} · {z.titel}{z.kontakt_id && kontaktMap[z.kontakt_id] ? ` · ${kName(kontaktMap[z.kontakt_id])}` : ''}
                  </span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button style={S.knopf2} onClick={() => setOffen(z.id)}>Öffnen</button>
                    <button style={S.knopf2} onClick={() => nachfassErledigt(z.id)}>✓ Nachgefasst</button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 22, display: 'grid', gap: 10 }}>
            {laden ? <p style={{ color: C.textDim }}>Lädt …</p>
              : liste.length === 0 ? <p style={{ color: C.textDim }}>Noch keine Protokolle.</p>
              : liste.map((z) => (
                <div key={z.id} style={S.karte}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{z.titel}</div>
                      <div style={{ color: C.textDim, fontSize: 13 }}>
                        {ARTEN.find((a) => a.key === z.art)?.kurz} · {datumDe(z.datum)}{z.ort ? ` · ${z.ort}` : ''}
                        {z.kontakt_id && kontaktMap[z.kontakt_id] ? ` · ${kName(kontaktMap[z.kontakt_id])}` : ''}
                        {z.nachfass_am && !z.nachfass_erledigt ? ` · Nachfass ${datumDe(z.nachfass_am)}` : z.nachfass_erledigt ? ' · nachgefasst ✓' : ''}
                      </div>
                    </div>
                    <button style={S.knopf2} onClick={() => setOffen(offen === z.id ? null : z.id)}>{offen === z.id ? 'Schließen' : 'Ansehen'}</button>
                  </div>
                  {offen === z.id && <Ansicht z={z} kontakt={z.kontakt_id ? kontaktMap[z.kontakt_id] : undefined} />}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
function NeuesProtokoll({ kontakte, heute, onFertig, onAbbruch }: { kontakte: Kontakt[]; heute: string; onFertig: () => void; onAbbruch: () => void }) {
  const [art, setArt] = useState<ProtokollArt>('kunde');
  const [datum, setDatum] = useState(heute);
  const [ort, setOrt] = useState('');
  const [teilnehmer, setTeilnehmer] = useState('');
  const [suche, setSuche] = useState('');
  const [kontaktId, setKontaktId] = useState('');
  const [roh, setRoh] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erg, setErg] = useState<Ergebnis | null>(null);

  const kontakt = kontakte.find((k) => k.id === kontaktId);
  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (q ? kontakte.filter((k) => kName(k).toLowerCase().includes(q)) : kontakte).slice(0, 50);
  }, [suche, kontakte]);

  async function erstellen() {
    setLaeuft(true); setFehler(null); setErg(null);
    try {
      const anrede = kontakt && (kontakt.vorname || kontakt.nachname) ? `Guten Tag ${`${kontakt.vorname ?? ''} ${kontakt.nachname ?? ''}`.trim()}` : '';
      const res = await fetch('/api/gespraech-protokoll', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ art, datum, ort, teilnehmer, roh, anrede, kontakt: kontakt ? kName(kontakt) : '' }),
      });
      const j = await res.json();
      if (!j.ok) setFehler(j.error || 'Fehler.'); else setErg(j as Ergebnis);
    } catch { setFehler('Verbindung fehlgeschlagen.'); }
    setLaeuft(false);
  }

  return (
    <div style={{ ...S.karte, display: 'grid', gap: 14 }}>
      <div style={S.raster}>
        <Feld label="Art">
          <select value={art} onChange={(e) => setArt(e.target.value as ProtokollArt)} style={S.input}>
            {ARTEN.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </Feld>
        <Feld label="Datum der Besprechung"><input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={S.input} /></Feld>
        <Feld label="Ort (optional)"><input value={ort} onChange={(e) => setOrt(e.target.value)} style={S.input} /></Feld>
        <Feld label="Teilnehmer (optional)"><input value={teilnehmer} placeholder="z. B. Frau Keller, Herr Brenner" onChange={(e) => setTeilnehmer(e.target.value)} style={S.input} /></Feld>
      </div>
      <div style={S.raster}>
        <Feld label="Kontakt aus dem CRM suchen (optional)"><input value={suche} placeholder="Name oder Firma" onChange={(e) => setSuche(e.target.value)} style={S.input} /></Feld>
        <Feld label="Kontakt">
          <select value={kontaktId} onChange={(e) => setKontaktId(e.target.value)} style={S.input}>
            <option value="">— ohne Kontakt —</option>
            {kontakt && !treffer.some((k) => k.id === kontakt.id) && <option value={kontakt.id}>{kName(kontakt)}</option>}
            {treffer.map((k) => <option key={k.id} value={k.id}>{kName(k)}</option>)}
          </select>
        </Feld>
      </div>
      <Feld label="Was wurde besprochen? (diktieren oder eintippen — Stichpunkte reichen)">
        <textarea value={roh} onChange={(e) => setRoh(e.target.value)} style={{ ...S.input, minHeight: 160 }}
          placeholder="z. B. Termin bei Familie Keller. Bad soll bis Weihnachten fertig sein. Frau Keller schickt bis Freitag die Fliesenauswahl. Herr Brenner misst Montag auf." />
      </Feld>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Diktat wert={roh} onWert={setRoh} />
        <button style={S.knopf} disabled={laeuft} onClick={erstellen}>{laeuft ? 'Erstellt …' : '📝 Protokoll erstellen'}</button>
        <button style={S.knopf2} onClick={onAbbruch}>Abbrechen</button>
      </div>
      {fehler && <div style={S.fehler}>{fehler}</div>}
      {erg && <Vorschlag erg={erg} art={art} ort={ort} roh={roh} kontakt={kontakt} onFertig={onFertig} />}
    </div>
  );
}

// ------------------------------------------------------------
function Vorschlag({ erg, art, ort, roh, kontakt, onFertig }: { erg: Ergebnis; art: ProtokollArt; ort: string; roh: string; kontakt?: Kontakt; onFertig: () => void }) {
  const [text, setText] = useState(erg.markdown);
  const [nachfass, setNachfass] = useState(erg.nachfass_am);
  const [betreff, setBetreff] = useState(erg.mail.betreff);
  const [mail, setMail] = useState(erg.mail.text);
  const [auswahl, setAuswahl] = useState<boolean[]>(erg.aufgaben.map(() => true));
  const [wv, setWv] = useState(!!kontakt);
  const [speichert, setSpeichert] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  async function speichern() {
    if (!text.trim()) { setMeldung('Das Protokoll ist leer.'); return; }
    if (nachfass && !/^\d{4}-\d{2}-\d{2}$/.test(nachfass)) { setMeldung('Bitte ein gültiges Nachfass-Datum wählen.'); return; }
    setSpeichert(true); setMeldung(null);
    const teile: string[] = [];
    const { error } = await supabase.from('gespraech_protokoll').insert({
      art, titel: erg.protokoll.titel, datum: erg.datum, ort: ort.trim() || null, kontakt_id: kontakt?.id ?? null,
      teilnehmer: erg.protokoll.teilnehmer, inhalt: { protokoll: erg.protokoll, mail: { betreff, text: mail } },
      protokoll_text: text, roh, nachfass_am: nachfass || null,
    });
    if (error) { setSpeichert(false); setMeldung(`Speichern fehlgeschlagen: ${error.message}`); return; }
    teile.push('Protokoll gespeichert');

    // Eigene Aufgaben ins Cockpit (bestehende Aktion)
    const gewaehlt = erg.aufgaben.filter((_, i) => auswahl[i]);
    if (gewaehlt.length) {
      try {
        const r = await fetch('/api/cockpit-action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aktion: { typ: 'aufgabe_anlegen', aufgaben: gewaehlt } }) });
        const j = await r.json();
        teile.push(r.ok && j?.ok ? `${gewaehlt.length} Aufgabe(n) angelegt` : 'Aufgaben NICHT angelegt');
      } catch { teile.push('Aufgaben NICHT angelegt'); }
    }

    // Kontakt-Chronik + Wiedervorlage
    if (kontakt) {
      const { error: e1 } = await supabase.from('kontakt_aktivitaeten').insert({
        kontakt_id: kontakt.id, typ: 'termin', ki_generiert: true,
        inhalt: `Gesprächsprotokoll: ${erg.protokoll.titel}${erg.protokoll.zusammenfassung ? ` — ${erg.protokoll.zusammenfassung}` : ''}`.slice(0, 2000),
        aktivitaet_am: new Date(`${erg.datum}T12:00:00`).toISOString(),
      });
      teile.push(e1 ? 'Chronik-Eintrag NICHT gespeichert' : 'in der Kontakt-Chronik vermerkt');
      if (wv && nachfass) {
        const { error: e2 } = await supabase.from('kontakte').update({ naechster_kontakt_am: new Date(`${nachfass}T09:00:00`).toISOString() }).eq('id', kontakt.id);
        teile.push(e2 ? 'Wiedervorlage NICHT gesetzt' : `Wiedervorlage ${datumDe(nachfass)}`);
      }
    }
    setSpeichert(false);
    setMeldung(teile.join(' · '));
    setTimeout(onFertig, 1800);
  }

  return (
    <div style={{ display: 'grid', gap: 14, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
      {erg.protokoll.hinweise.length > 0 && (
        <div style={{ ...S.box, borderColor: C.warn }}>
          <div style={S.zwischen}>⚠️ Bitte prüfen</div>
          {erg.protokoll.hinweise.map((h, i) => <div key={i} style={{ color: C.warn, fontSize: 13, marginTop: 4 }}>• {h}</div>)}
        </div>
      )}
      <Feld label={`Protokoll: ${erg.protokoll.titel} (bearbeitbar)`}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ ...S.input, minHeight: 280, fontFamily: 'inherit' }} />
      </Feld>
      <PdfKnopf titel={erg.protokoll.titel} datum={erg.datum} text={text} />

      {erg.aufgaben.length > 0 && (
        <div style={S.box}>
          <div style={S.zwischen}>Unsere Aufgaben ins Cockpit übernehmen</div>
          {erg.aufgaben.map((a, i) => (
            <label key={i} style={{ ...S.check, marginTop: 6 }}>
              <input type="checkbox" checked={auswahl[i]} onChange={(e) => setAuswahl((alt) => alt.map((x, j) => (j === i ? e.target.checked : x)))} />
              <span>{a.titel}{a.faellig_am ? <span style={{ color: C.textDim }}> · fällig {datumDe(a.faellig_am)}</span> : <span style={{ color: C.textDim }}> · ohne Frist</span>}</span>
            </label>
          ))}
        </div>
      )}

      <div style={S.box}>
        <div style={S.zwischen}>Nachfass</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <input type="date" value={nachfass} onChange={(e) => setNachfass(e.target.value)} style={{ ...S.input, maxWidth: 180 }} />
          {kontakt && <label style={S.check}><input type="checkbox" checked={wv} onChange={(e) => setWv(e.target.checked)} /> auch als Wiedervorlage bei {kName(kontakt)}</label>}
        </div>
        <div style={{ marginTop: 10 }}><Feld label="Betreff"><input value={betreff} onChange={(e) => setBetreff(e.target.value)} style={S.input} /></Feld></div>
        <div style={{ marginTop: 10 }}><Feld label="Zusammenfassung an den Gesprächspartner (wird NICHT automatisch verschickt)">
          <textarea value={mail} onChange={(e) => setMail(e.target.value)} style={{ ...S.input, minHeight: 220, fontFamily: 'inherit' }} />
        </Feld></div>
        <MailKnoepfe email={kontakt?.email ?? ''} betreff={betreff} text={mail} />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={S.knopf} disabled={speichert} onClick={speichern}>{speichert ? 'Speichert …' : '💾 Speichern'}</button>
        {meldung && <span style={{ color: /NICHT|fehlgeschlagen|leer|gültig/.test(meldung) ? C.danger : C.green, fontSize: 13 }}>{meldung}</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
function Ansicht({ z, kontakt }: { z: Zeile; kontakt?: Kontakt }) {
  const m = z.inhalt?.mail;
  return (
    <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
      <pre style={S.pre}>{z.protokoll_text}</pre>
      <PdfKnopf titel={z.titel} datum={z.datum} text={z.protokoll_text} />
      {m && (
        <div style={S.box}>
          <div style={S.zwischen}>Nachfass-Mail</div>
          <pre style={{ ...S.pre, marginTop: 8 }}>{m.betreff}{'\n\n'}{m.text}</pre>
          <MailKnoepfe email={kontakt?.email ?? ''} betreff={m.betreff} text={m.text} />
        </div>
      )}
    </div>
  );
}

function PdfKnopf({ titel, datum, text }: { titel: string; datum: string; text: string }) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  async function pdf() {
    setLaeuft(true); setFehler(null);
    try {
      const res = await fetch('/api/text-motor/pdf', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ titel: `Protokoll: ${titel}`, untertitel: datumDe(datum), kapitel: [{ titel: 'Besprechungsprotokoll', text }] }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setFehler(j.error || 'PDF fehlgeschlagen.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Protokoll-${datum}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { setFehler('PDF fehlgeschlagen.'); } finally { setLaeuft(false); }
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <button style={S.knopf2} disabled={laeuft} onClick={pdf}>{laeuft ? 'PDF …' : '📄 Als PDF'}</button>
      {fehler && <span style={{ color: C.danger, fontSize: 13 }}>{fehler}</span>}
    </div>
  );
}

function MailKnoepfe({ email, betreff, text }: { email: string; betreff: string; text: string }) {
  const [kopiert, setKopiert] = useState(false);
  const link = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
      <button style={S.knopf2} onClick={() => { navigator.clipboard?.writeText(`${betreff}\n\n${text}`); setKopiert(true); setTimeout(() => setKopiert(false), 1500); }}>{kopiert ? '✓ Kopiert' : '📋 Kopieren'}</button>
      <a href={link} style={{ ...S.knopf2, textDecoration: 'none', display: 'inline-block' }}>✉️ Im Mailprogramm öffnen{email ? '' : ' (ohne Empfänger)'}</a>
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
  sub: { color: C.textDim, marginTop: 0, marginBottom: 18 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 },
  box: { border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  check: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 },
  zwischen: { fontWeight: 600, fontSize: 14 },
  pre: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, margin: 0, color: C.text, background: C.navy, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 },
  knopf: { background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' },
  knopf2: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14 },
  fehler: { color: C.danger, background: 'rgba(224,102,102,0.08)', border: `1px solid ${C.danger}`, borderRadius: 8, padding: '10px 12px', margin: '8px 0' },
};
