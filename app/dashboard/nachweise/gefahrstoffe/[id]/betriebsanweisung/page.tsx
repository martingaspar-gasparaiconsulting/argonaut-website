'use client';

// ============================================================
// ARGONAUT OS · Paket 329 (G2b) · Betriebsanweisung je Gefahrstoff
// Aufbau nach TRGS 555 (§ 14 GefStoffV): Kopf + fünf Abschnitte.
// „Entwurf füllen" übernimmt nur, was schon da ist (H-/P-Sätze mit dem
// Wortlaut aus dem SDB, bestätigt unter Shop → Gefahr-Angaben; sonst die
// H-Codes aus dem Verzeichnis). Leere Abschnitte schreibt der Betrieb.
// Schreiben und Freigeben nur die Geschäftsleitung (Datenbank-Wächter
// p329), lesen und drucken alle Beschäftigten. Freigeben erst nach der
// Abnahme durch den Anwalt (lib/startSperre „betriebsanweisung", R49) —
// bis dahin trägt der Druck „ENTWURF".
// Logik: lib/betriebsanweisung.ts (getestet). SQL: supabase-sql/p329-betriebsanweisung.sql
// Pfad: app/dashboard/nachweise/gefahrstoffe/[id]/betriebsanweisung/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { PIKTOGRAMME, datumDe } from '@/lib/qualitaet';
import { startFrei, startSperrGrund } from '@/lib/startSperre';
import { useFreigabeStand } from '@/lib/useFreigabeStand';
import {
  ABSCHNITTE, LEER_INHALT, SDB_ABSCHNITT, entwurf, saubererInhalt, freigabeFehler, druckHtml,
  type Inhalt, type AngabenKurz, type GefahrstoffKurz,
} from '@/lib/betriebsanweisung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 12 };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' };
const primaer: CSSProperties = { ...knopf, background: C.gold, color: C.navy, border: 'none', fontWeight: 800 };
const lab: CSSProperties = { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 700, marginTop: 8 };

type Stoff = GefahrstoffKurz & { id: string; artikel_id?: string | null };
type Anweisung = { id: string; inhalt: unknown; piktogramme: string[] | null; signalwort: string | null; status: string; version: number | null; freigegeben_am: string | null };
type Stand = { inhalt: Inhalt; piktogramme: string[]; signalwort: string };

const GLEICH = (a: Stand, b: Stand) => JSON.stringify(a) === JSON.stringify(b);

export default function BetriebsanweisungSeite() {
  const params = useParams();
  const id = String((params as Record<string, string | string[]>)?.id ?? '');
  const [stoff, setStoff] = useState<Stoff | null>(null);
  const [angaben, setAngaben] = useState<AngabenKurz>(null);
  const [ba, setBa] = useState<Anweisung | null>(null);
  const [stand, setStand] = useState<Stand>({ inhalt: { ...LEER_INHALT }, piktogramme: [], signalwort: '' });
  const [gespeichert, setGespeichert] = useState<Stand>({ inhalt: { ...LEER_INHALT }, piktogramme: [], signalwort: '' });
  const [firma, setFirma] = useState('');
  const [istChef, setIstChef] = useState(false);
  const [hinweise, setHinweise] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const freigabe = useFreigabeStand().start; // Paket 346: Code ODER Freigabe-Zentrale
  const freigabeOffen = startFrei('betriebsanweisung', freigabe);

  const laden = useCallback(async () => {
    if (!id) return;
    const g = await supabase.from('gefahrstoff').select('id, bezeichnung, hersteller, arbeitsbereiche, h_saetze, piktogramme, signalwort, artikel_id').eq('id', id).maybeSingle();
    if (g.error || !g.data) { setFehler('Der Gefahrstoff wurde nicht gefunden.'); setGeladen(true); return; }
    const s = g.data as Stoff;
    setStoff(s);
    // Gefahr-Angaben am Artikel (Paket 325) — nur lesbar mit Shop-Recht, sonst ohne
    if (s.artikel_id) {
      const a = await supabase.from('artikel_gefahr').select('h_saetze, p_saetze, piktogramme, signalwort, status').eq('artikel_id', s.artikel_id).maybeSingle();
      setAngaben(a.error ? null : ((a.data as AngabenKurz) ?? null));
    } else setAngaben(null);
    const b = await supabase.from('betriebsanweisung').select('id, inhalt, piktogramme, signalwort, status, version, freigegeben_am').eq('gefahrstoff_id', id).maybeSingle();
    if (b.error) { if (/betriebsanweisung/.test(b.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen.'); setGeladen(true); return; }
    const x = (b.data as Anweisung | null) ?? null;
    setBa(x);
    const neu: Stand = x
      ? { inhalt: saubererInhalt(x.inhalt), piktogramme: x.piktogramme ?? [], signalwort: x.signalwort ?? '' }
      : { inhalt: { ...LEER_INHALT, arbeitsbereich: String(s.arbeitsbereiche ?? '').trim().slice(0, 300) }, piktogramme: s.piktogramme ?? [], signalwort: s.signalwort ?? '' };
    setStand(neu);
    setGespeichert(x ? neu : { inhalt: { ...LEER_INHALT }, piktogramme: [], signalwort: '' });
    setGeladen(true);
  }, [id]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const eigen = data?.user?.id ?? null;
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstChef(!chef || chef === eigen);
      const pid = chef || eigen;
      if (pid) {
        try {
          const p = await supabase.from('profiles').select('firma_name, firma').eq('id', pid).maybeSingle();
          const d = (p.data ?? {}) as { firma_name?: string | null; firma?: string | null };
          setFirma(String(d.firma_name || d.firma || '').trim());
        } catch { /* ohne Firmenname */ }
      }
      await laden();
    })();
  }, [laden]);

  const geaendert = !GLEICH(stand, gespeichert) || !ba;
  const freigegeben = ba?.status === 'freigegeben';
  const luecken = freigabeFehler(stand.inhalt);

  function setze<K extends keyof Inhalt>(k: K, v: string) {
    setStand({ ...stand, inhalt: { ...stand.inhalt, [k]: v } });
  }

  function fuellen() {
    if (!stoff) return;
    const schon = ABSCHNITTE.some((a) => stand.inhalt[a.key].trim());
    if (schon && !window.confirm('Die fünf Abschnitte mit dem Entwurf überschreiben? Kopf (Arbeitsbereich, Tätigkeit, Notruf, Ersthelfer) bleibt.')) return;
    const e = entwurf(stoff, angaben);
    setStand({
      inhalt: { ...stand.inhalt, ...Object.fromEntries(ABSCHNITTE.map((a) => [a.key, e.inhalt[a.key]])), arbeitsbereich: stand.inhalt.arbeitsbereich || e.inhalt.arbeitsbereich },
      piktogramme: e.piktogramme.length ? e.piktogramme : stand.piktogramme,
      signalwort: e.signalwort ?? stand.signalwort,
    });
    setHinweise(e.hinweise);
    setOk(null);
  }

  async function speichern() {
    if (!stoff) return;
    setFehler(null); setOk(null); setBusy(true);
    const zeile = {
      gefahrstoff_id: stoff.id,
      inhalt: saubererInhalt(stand.inhalt),
      piktogramme: [...new Set(stand.piktogramme)].filter((k) => PIKTOGRAMME.some((p) => p.key === k)).sort(),
      signalwort: stand.signalwort === 'Gefahr' || stand.signalwort === 'Achtung' ? stand.signalwort : null,
    };
    const r = await supabase.from('betriebsanweisung').upsert(zeile, { onConflict: 'gefahrstoff_id' }).select('id');
    setBusy(false);
    if (r.error || !r.data?.length) {
      setFehler(/betriebsanweisung|p329/.test(r.error?.message ?? '') && !/Geschaeftsleitung|gehoert/.test(r.error?.message ?? '')
        ? 'Speichern fehlgeschlagen — bitte zuerst das SQL von Paket 329 ausführen.'
        : 'Speichern fehlgeschlagen.');
      return;
    }
    setOk(freigegeben && !GLEICH(stand, gespeichert) ? 'Gespeichert — die Änderung ist wieder ein Entwurf und muss neu freigegeben werden.' : 'Entwurf gespeichert.');
    await laden();
  }

  async function freigeben() {
    if (!ba || !freigabeOffen) return;
    if (geaendert) { setFehler('Bitte zuerst speichern.'); return; }
    if (luecken.length) { setFehler('Noch nicht freigabefähig: ' + luecken.join(' ')); return; }
    if (!window.confirm('Betriebsanweisung freigeben? Danach bitte die Beschäftigten unterweisen (§ 14 Abs. 2 GefStoffV) und die Unterweisung unter Nachweise festhalten.')) return;
    setFehler(null); setOk(null); setBusy(true);
    const r = await supabase.from('betriebsanweisung').update({ status: 'freigegeben' }).eq('id', ba.id).select('id');
    setBusy(false);
    if (r.error || !r.data?.length) { setFehler('Freigeben fehlgeschlagen.'); return; }
    setOk('Freigegeben. Das Datum „Betriebsanweisung erstellt am" im Verzeichnis ist gesetzt.');
    await laden();
  }

  function drucken() {
    if (!stoff) return;
    const html = druckHtml({
      firma: firma || '—', stoff: String(stoff.bezeichnung ?? ''), hersteller: stoff.hersteller ?? null,
      inhalt: saubererInhalt(stand.inhalt), piktogramme: stand.piktogramme, signalwort: stand.signalwort === 'Gefahr' || stand.signalwort === 'Achtung' ? stand.signalwort : null,
      freigegeben: freigabeOffen && freigegeben && !geaendert, freigegebenAm: ba?.freigegeben_am ? datumDe(ba.freigegeben_am.slice(0, 10)) : null, version: ba?.version ?? null,
    });
    const w = window.open('', '_blank');
    if (!w) { setFehler('Das Druckfenster wurde blockiert — bitte Pop-ups für ARGONAUT erlauben.'); return; }
    w.document.write(html);
    w.document.close(); w.focus(); w.print();
  }

  const nurLesen = !istChef;

  return (
    <div style={{ color: C.text, maxWidth: 1000, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Arbeitsschutz</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(24px,2.1vw,34px)', fontWeight: 800 }}>📋 Betriebsanweisung{stoff?.bezeichnung ? ` · ${stoff.bezeichnung}` : ''}</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>
        Aufbau nach TRGS 555 (§ 14 GefStoffV). ARGONAUT füllt nur vor, was schon vorliegt — den Rest schreiben Sie aus dem Sicherheitsdatenblatt und Ihrer Gefährdungsbeurteilung.{' '}
        <a href="/dashboard/nachweise/gefahrstoffe" style={{ color: C.cyan }}>Zurück zum Gefahrstoffverzeichnis</a>
      </p>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Betriebsanweisungen sind noch nicht eingerichtet (SQL von Paket 329 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}
      {!geladen && <div style={{ ...karte, color: C.textDim }}>Lädt …</div>}

      {geladen && stoff && !sqlFehlt && (
        <>
          <div style={{ ...karte, borderColor: freigegeben && !geaendert ? C.green : C.warn, fontSize: 14 }}>
            {ba
              ? (freigegeben && !geaendert
                ? <span style={{ color: C.green }}>✓ Freigegeben{ba.freigegeben_am ? ` am ${datumDe(ba.freigegeben_am.slice(0, 10))}` : ''} · Version {ba.version ?? 1}</span>
                : <span style={{ color: C.warn }}>Entwurf{ba.version ? ` (zuletzt freigegeben: Version ${ba.version})` : ''}{geaendert ? ' · ungespeicherte Änderungen' : ''}</span>)
              : <span style={{ color: C.warn }}>Noch keine Betriebsanweisung angelegt.</span>}
            {!freigabeOffen && <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>{startSperrGrund('betriebsanweisung', freigabe)}</div>}
            <div style={{ color: C.textDim, fontSize: 13, marginTop: 6 }}>Der Entwurf ersetzt keine Gefährdungsbeurteilung. Prüfen Sie jeden Abschnitt am aktuellen Sicherheitsdatenblatt.</div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {!nurLesen && <button style={knopf} disabled={busy} onClick={fuellen} title="H- und P-Sätze aus den Gefahr-Angaben bzw. dem Verzeichnis übernehmen">✨ Entwurf füllen</button>}
            {!nurLesen && <button style={primaer} disabled={busy || !geaendert} onClick={() => void speichern()}>{busy ? 'Speichert …' : '💾 Speichern'}</button>}
            {!nurLesen && ba && !(freigegeben && !geaendert) && (
              <button style={{ ...knopf, ...(freigabeOffen && !geaendert && !luecken.length ? { borderColor: C.green, color: C.green } : { color: C.textDim }) }}
                disabled={busy || !freigabeOffen || geaendert || luecken.length > 0} onClick={() => void freigeben()}
                title={!freigabeOffen ? String(startSperrGrund('betriebsanweisung', freigabe)) : geaendert ? 'Bitte zuerst speichern' : luecken.join(' ')}>✅ Freigeben</button>
            )}
            <button style={knopf} onClick={drucken}>🖨 Drucken</button>
          </div>

          {hinweise.length > 0 && (
            <div style={{ ...karte, borderColor: C.warn }}>
              {hinweise.map((h) => <div key={h} style={{ color: C.warn, fontSize: 13.5 }}>⚠ {h}</div>)}
            </div>
          )}

          <div style={karte}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <label style={lab}>Arbeitsbereich<input style={feld} readOnly={nurLesen} maxLength={300} value={stand.inhalt.arbeitsbereich} placeholder="z. B. Lackierkabine Halle 2" onChange={(e) => setze('arbeitsbereich', e.target.value)} /></label>
              <label style={lab}>Tätigkeit<input style={feld} readOnly={nurLesen} maxLength={300} value={stand.inhalt.taetigkeit} placeholder="z. B. Spritzlackieren, Umfüllen" onChange={(e) => setze('taetigkeit', e.target.value)} /></label>
              <label style={lab}>Notruf<input style={feld} readOnly={nurLesen} maxLength={200} value={stand.inhalt.notruf} onChange={(e) => setze('notruf', e.target.value)} /></label>
              <label style={lab}>Ersthelfer (Name, Telefon)<input style={feld} readOnly={nurLesen} maxLength={200} value={stand.inhalt.ersthelfer} onChange={(e) => setze('ersthelfer', e.target.value)} /></label>
              <label style={lab}>Signalwort
                <select style={feld} disabled={nurLesen} value={stand.signalwort} onChange={(e) => setStand({ ...stand, signalwort: e.target.value })}>
                  <option value="">—</option><option value="Gefahr">Gefahr</option><option value="Achtung">Achtung</option>
                </select>
              </label>
            </div>
            <div style={lab}>Piktogramme</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {PIKTOGRAMME.map((p) => {
                const an = stand.piktogramme.includes(p.key);
                if (nurLesen && !an) return null;
                return <button key={p.key} disabled={nurLesen} style={{ ...knopf, ...(an ? { background: C.gold, color: C.navy, border: 'none', fontWeight: 800 } : {}) }}
                  onClick={() => setStand({ ...stand, piktogramme: an ? stand.piktogramme.filter((x) => x !== p.key) : [...stand.piktogramme, p.key] })}>{p.key} {p.label}</button>;
              })}
            </div>
          </div>

          {ABSCHNITTE.map((a) => (
            <div key={a.key} style={karte}>
              <div style={{ background: '#e8551e', color: '#fff', fontWeight: 800, padding: '4px 10px', borderRadius: 6, display: 'inline-block' }}>{a.nr}. {a.titel}</div>
              <span style={{ color: C.textDim, fontSize: 12.5, marginLeft: 8 }}>SDB Abschnitt {SDB_ABSCHNITT[a.key]}</span>
              <textarea style={{ ...feld, minHeight: 110, marginTop: 8, resize: 'vertical' }} readOnly={nurLesen} maxLength={3000}
                value={stand.inhalt[a.key]} onChange={(e) => setze(a.key, e.target.value)} />
            </div>
          ))}

          {!nurLesen && luecken.length > 0 && (
            <div style={{ ...karte, fontSize: 13.5 }}>
              <div style={{ color: C.textDim, fontWeight: 700, marginBottom: 4 }}>Vor der Freigabe noch offen</div>
              {luecken.map((l) => <div key={l} style={{ color: C.warn }}>• {l}</div>)}
            </div>
          )}

          <p style={{ color: C.textDim, fontSize: 12.5 }}>
            Hilfe zur Dokumentation — keine Rechtsberatung. Maßgeblich sind Gefährdungsbeurteilung, Sicherheitsdatenblatt und die Beratung durch Fachkraft für Arbeitssicherheit bzw. Berufsgenossenschaft.
            Unterweisung (§ 14 Abs. 2 GefStoffV): unter <a href="/dashboard/nachweise" style={{ color: C.cyan }}>Nachweise → Arbeitsschutz</a> mit Unterschrift festhalten.
          </p>
        </>
      )}
    </div>
  );
}
