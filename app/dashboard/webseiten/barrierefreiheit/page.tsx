'use client';

// ============================================================
// ARGONAUT OS · Barrierefreiheits-Check (Paket PR · K04)
// Barrierefreiheitsstärkungsgesetz (BFSG) für Website und Shop:
//   1. Bin ich betroffen?  (B2C, Online-Vertrag, Kleinstunternehmen)
//   2. Farben des CI       (WCAG-Kontrast, Vorschlag übernehmen)
//   3. Seiten prüfen       (fertiges HTML jeder Seite automatisch prüfen)
//   4. Von Hand prüfen     (was keine Maschine kann)
//   5. Erklärung           (Anlage 3 BFSG) — wird auf JEDER Seite verankert
//                          und im Fuß verlinkt (web_ci.barrierefreiheit_text)
// Logik: lib/barrierefreiheit.ts (getestet). Kein KI-Aufruf.
// Pfad: app/dashboard/webseiten/barrierefreiheit/page.tsx (Unterpfad, nur Chef)
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { seiteHtml, type CiWeb, type Block } from '@/lib/webBloecke';
import {
  betroffenheit, ciKontraste, pruefeHtml, erklaerungText, HANDPRUEFUNG, ERFUELLT_VORSCHLAEGE, BFSG_STAND, MLBF,
  type Befund,
} from '@/lib/barrierefreiheit';
import { leseZahl, zahlFeld } from '@/lib/zahlen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Seite = { slug: string; titel: string; status: string; bloecke: Block[] };
type Angaben = { verbraucher: boolean | null; online_vertrag: boolean | null; beschaeftigte: string; umsatz_mio: string; leistung: string; erfuellt: string[]; barrieren: string; geprueft_am: string | null };
const LEER: Angaben = { verbraucher: null, online_vertrag: null, beschaeftigte: '', umsatz_mio: '', leistung: '', erfuellt: [], barrieren: '', geprueft_am: null };

function heuteBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function de(t: string) { return `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`; }
function zahl(s: string): number | null { return leseZahl(s); }

export default function BarrierefreiheitSeite() {
  const [uid, setUid] = useState<string | null>(null);
  const [ci, setCi] = useState<(CiWeb & { barrierefreiheit_text?: string | null }) | null>(null);
  const [seiten, setSeiten] = useState<Seite[]>([]);
  const [a, setA] = useState<Angaben>(LEER);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const heute = heuteBerlin();

  const laden = useCallback(async (id: string) => {
    const [c, w, b] = await Promise.all([
      supabase.from('web_ci').select('*').eq('owner_user_id', id).maybeSingle(),
      supabase.from('web_seiten').select('slug, titel, status, bloecke').eq('owner_user_id', id).order('sortierung', { ascending: true }),
      supabase.from('bfsg_angaben').select('*').eq('owner_user_id', id).maybeSingle(),
    ]);
    setCi((c.data as CiWeb) ?? null);
    setSeiten(((w.data as Seite[]) ?? []).map((x) => ({ ...x, bloecke: Array.isArray(x.bloecke) ? x.bloecke : [] })));
    setSqlFehlt(!!(b.error && /bfsg_angaben/.test(b.error.message)));
    const d = b.data as Record<string, unknown> | null;
    if (d) setA({
      verbraucher: (d.verbraucher as boolean | null) ?? null, online_vertrag: (d.online_vertrag as boolean | null) ?? null,
      beschaeftigte: d.beschaeftigte != null ? zahlFeld(d.beschaeftigte) : '', umsatz_mio: d.umsatz_mio != null ? zahlFeld(d.umsatz_mio).replace('.', ',') : '',
      leistung: zahlFeld(d.leistung ?? ''), erfuellt: Array.isArray(d.erfuellt) ? (d.erfuellt as string[]) : [], barrieren: zahlFeld(d.barrieren ?? ''),
      geprueft_am: (d.geprueft_am as string | null) ?? null,
    });
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); return; }
      setUid(id); await laden(id);
    })();
  }, [laden]);

  const bt = betroffenheit({ verbraucher: a.verbraucher, onlineVertrag: a.online_vertrag, beschaeftigte: zahl(a.beschaeftigte), umsatzMio: zahl(a.umsatz_mio) });
  const kontraste = useMemo(() => ciKontraste(ci ?? {}), [ci]);
  const befunde = useMemo(() => {
    if (!ci) return [] as Array<{ seite: Seite; befunde: Befund[] }>;
    return seiten.map((sx) => ({ seite: sx, befunde: pruefeHtml(seiteHtml({ titel: sx.titel, bloecke: sx.bloecke }, ci, new Date().getFullYear())) }));
  }, [seiten, ci]);
  const anschrift = ci ? [ci.strasse, [ci.plz, ci.ort].filter(Boolean).join(' ')].filter((x) => String(x ?? '').trim()).join(', ') : '';
  const text = erklaerungText({
    firma: ci?.firma ?? '', anschrift, email: ci?.email, telefon: ci?.telefon, leistung: a.leistung,
    stand: de(a.geprueft_am || heute), erfuellt: a.erfuellt, barrieren: a.barrieren.split('\n'),
  });
  const rot = befunde.reduce((n, b) => n + b.befunde.filter((x) => x.schwere === 'rot').length, 0) + kontraste.filter((k) => !k.ok).length;

  function meldung(o: string | null, f: string | null = null) { setOk(o); setFehler(f); }

  async function angabenSpeichern(extra: Partial<Angaben> = {}) {
    if (!uid) return false;
    const x = { ...a, ...extra };
    const { error } = await supabase.from('bfsg_angaben').upsert({
      owner_user_id: uid, verbraucher: x.verbraucher, online_vertrag: x.online_vertrag, beschaeftigte: zahl(x.beschaeftigte),
      umsatz_mio: zahl(x.umsatz_mio), leistung: x.leistung.trim() || null, erfuellt: x.erfuellt, barrieren: x.barrieren.trim() || null,
      geprueft_am: x.geprueft_am, aktualisiert_am: new Date().toISOString(),
    }, { onConflict: 'owner_user_id' });
    if (error) { meldung(null, /bfsg_angaben/.test(error.message) ? 'SQL von Paket PR fehlt.' : 'Speichern fehlgeschlagen.'); return false; }
    return true;
  }

  async function farbeUebernehmen(feld: string, wert: string) {
    if (!uid || !ci) return;
    if (!window.confirm(`Farbe ${wert} übernehmen? Sie gilt dann auf allen Ihren Seiten.`)) return;
    const { error } = await supabase.from('web_ci').update({ [feld]: wert }).eq('owner_user_id', uid);
    if (error) { meldung(null, 'Farbe konnte nicht gespeichert werden.'); return; }
    meldung('Farbe übernommen.'); await laden(uid);
  }

  async function erklaerungAufSeiten(an: boolean) {
    if (!uid || !ci) { meldung(null, 'Bitte zuerst den Webauftritt anlegen.'); return; }
    if (an) {
      if (!a.leistung.trim()) { meldung(null, 'Bitte zuerst kurz beschreiben, was Sie auf der Website anbieten.'); return; }
      if (!(await angabenSpeichern({ geprueft_am: heute }))) return;
      setA({ ...a, geprueft_am: heute });
    }
    const neuText = an ? erklaerungText({ firma: ci.firma ?? '', anschrift, email: ci.email, telefon: ci.telefon, leistung: a.leistung, stand: de(heute), erfuellt: a.erfuellt, barrieren: a.barrieren.split('\n') }) : null;
    const { error } = await supabase.from('web_ci').update({ barrierefreiheit_text: neuText }).eq('owner_user_id', uid);
    if (error) { meldung(null, /barrierefreiheit_text/.test(error.message) ? 'SQL von Paket PR fehlt.' : 'Speichern fehlgeschlagen.'); return; }
    meldung(an ? 'Die Erklärung steht jetzt auf allen Ihren Seiten (Link „Barrierefreiheit" im Fuß). Veröffentlichte Seiten zeigen sie nach spätestens einer Minute.' : 'Die Erklärung wurde von den Seiten genommen.');
    await laden(uid);
  }

  const aktivText = String(ci?.barrierefreiheit_text ?? '').trim();

  return (
    <div style={s.page}>
      <a href="/dashboard/webseiten" style={s.zurueck}>← Website-Bauer</a>
      <h1 style={s.h1}>♿ Barrierefreiheit (BFSG)</h1>
      <p style={s.sub}>Seit dem 28.06.2025 müssen Online-Shops und Buchungsstrecken für Verbraucher barrierefrei sein (Barrierefreiheitsstärkungsgesetz). Hier prüfen Sie, ob Sie betroffen sind, was an Ihren Seiten auffällt und stellen die vorgeschriebene Erklärung auf Ihre Website.</p>
      {sqlFehlt && <div style={s.err}>Noch nicht eingerichtet (SQL von Paket PR fehlt).</div>}
      {ok && <div style={s.ok}>{ok}</div>}
      {fehler && <div style={s.err}>{fehler}</div>}

      {/* 1. Betroffen? */}
      <div style={s.card}>
        <b>1 · Bin ich betroffen?</b>
        <div style={s.row}>
          <label style={s.lab}>Verkaufen oder buchen Sie online an Privatkunden?
            <select style={s.inp} value={a.verbraucher === null ? '' : a.verbraucher ? 'ja' : 'nein'} onChange={(e) => setA({ ...a, verbraucher: e.target.value === '' ? null : e.target.value === 'ja' })}>
              <option value="">— bitte wählen —</option><option value="ja">Ja, auch an Privatkunden</option><option value="nein">Nein, nur an Firmen (B2B)</option>
            </select>
          </label>
          <label style={s.lab}>Wird auf der Website ein Vertrag geschlossen?
            <select style={s.inp} value={a.online_vertrag === null ? '' : a.online_vertrag ? 'ja' : 'nein'} onChange={(e) => setA({ ...a, online_vertrag: e.target.value === '' ? null : e.target.value === 'ja' })}>
              <option value="">— bitte wählen —</option><option value="ja">Ja (Shop, verbindliche Buchung)</option><option value="nein">Nein (nur Infos, Anfrage)</option>
            </select>
          </label>
          <label style={s.lab}>Beschäftigte<input style={{ ...s.inp, width: 100 }} inputMode="numeric" value={a.beschaeftigte} onChange={(e) => setA({ ...a, beschaeftigte: e.target.value })} /></label>
          <label style={s.lab}>Umsatz oder Bilanzsumme (Mio. €)<input style={{ ...s.inp, width: 120 }} inputMode="decimal" value={a.umsatz_mio} onChange={(e) => setA({ ...a, umsatz_mio: e.target.value })} placeholder="z. B. 1,2" /></label>
          <button style={s.mini} onClick={() => void angabenSpeichern().then((g) => g && meldung('Angaben gespeichert.'))}>Speichern</button>
        </div>
        <div style={{ ...s.box, borderColor: bt.ergebnis === 'betroffen' ? C.warn : bt.ergebnis === 'unklar' ? C.border : C.green }}>
          <b>{bt.ergebnis === 'betroffen' ? 'Betroffen' : bt.ergebnis === 'ausgenommen' ? 'Ausgenommen (Kleinstunternehmen)' : bt.ergebnis === 'nicht_betroffen' ? 'Nicht betroffen' : 'Noch offen'}</b> — {bt.text}
        </div>
      </div>

      {/* 2. Farben */}
      <div style={s.card}>
        <b>2 · Farben Ihres Auftritts (Kontrast)</b>
        {!ci && <div style={s.dim}>Noch kein Webauftritt angelegt — dann gelten die Standardfarben.</div>}
        {kontraste.map((k) => (
          <div key={k.id} style={s.zeile}>
            <span style={{ ...s.muster, background: k.hinten, color: k.vorne }}>Aa</span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700 }}>{k.ok ? '✓' : '✗'} {k.wo}</div>
              <div style={s.klein}>Kontrast {k.wert ?? '—'} : 1 · nötig {k.ziel} : 1</div>
            </div>
            {!k.ok && k.vorschlag && (
              <>
                <span style={{ ...s.muster, background: k.id === 'knopf' || k.id === 'titel' ? k.vorschlag : '#FFFFFF', color: k.id === 'knopf' || k.id === 'titel' ? '#FFFFFF' : k.vorschlag }}>Aa</span>
                {ci && <button style={s.mini} onClick={() => void farbeUebernehmen(k.feld, k.vorschlag as string)}>Vorschlag {k.vorschlag} übernehmen</button>}
              </>
            )}
            {!k.ok && !k.vorschlag && <span style={{ ...s.klein, color: C.warn, maxWidth: 320 }}>Die Zweitfarbe steht auf Weiß und auf der Hauptfarbe — beides zugleich reicht selten. Kleine Oberzeilen im Titelbereich möglichst kurz halten.</span>}
          </div>
        ))}
      </div>

      {/* 3. Seiten */}
      <div style={s.card}>
        <b>3 · Ihre Seiten automatisch geprüft</b>
        {!seiten.length && <div style={s.dim}>Noch keine Seite im Website-Bauer gespeichert.</div>}
        {befunde.map(({ seite, befunde: bf }) => (
          <div key={seite.slug} style={s.zeile}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700 }}>{bf.length === 0 ? '✓' : bf.some((x) => x.schwere === 'rot') ? '⛔' : '⚠'} {seite.titel || seite.slug} <span style={s.klein}>({seite.status === 'live' ? 'veröffentlicht' : 'Entwurf'})</span></div>
              {bf.length === 0 && <div style={s.klein}>Nichts automatisch Erkennbares gefunden.</div>}
              {offen === seite.slug && bf.map((x) => (
                <div key={x.id} style={{ marginTop: 8 }}>
                  <div style={{ color: x.schwere === 'rot' ? C.danger : C.warn, fontWeight: 700 }}>{x.titel} ({x.anzahl}×) <span style={s.klein}>WCAG {x.wcag}</span></div>
                  {x.beispiel && <div style={{ ...s.klein, fontFamily: 'ui-monospace, monospace' }}>{x.beispiel}</div>}
                  <div style={{ fontSize: 13.5 }}>{x.vorschlag}</div>
                </div>
              ))}
            </div>
            {bf.length > 0 && <button style={s.mini} onClick={() => setOffen(offen === seite.slug ? null : seite.slug)}>{offen === seite.slug ? 'Zuklappen' : `${bf.length} Befund(e) ansehen`}</button>}
          </div>
        ))}
        <div style={s.hint}>Geprüft wird der Seitenaufbau aus dem Website-Bauer. Inhalte, die erst im Browser nachgeladen werden (Warenkorb, Buchungskalender, Chat), prüfen Sie von Hand.</div>
      </div>

      {/* 4. Handprüfung */}
      <div style={s.card}>
        <b>4 · Von Hand prüfen (einmal im Jahr und nach größeren Änderungen)</b>
        <ul style={s.liste}>{HANDPRUEFUNG.map((h, i) => <li key={i}>{h}</li>)}</ul>
      </div>

      {/* 5. Erklärung */}
      <div style={s.card}>
        <b>5 · Informationen zur Barrierefreiheit (Pflicht, Anlage 3 BFSG)</b>
        <label style={s.lab}>Was bieten Sie auf der Website an, und wie läuft eine Bestellung oder Buchung ab?
          <textarea style={{ ...s.inp, minHeight: 70 }} value={a.leistung} onChange={(e) => setA({ ...a, leistung: e.target.value })} placeholder="z. B. Online-Shop für Gartengeräte. Sie legen Artikel in den Warenkorb, geben Ihre Adresse ein und bezahlen per Überweisung oder Karte." />
        </label>
        <div style={s.lab}>Was haben Sie selbst geprüft und ist erfüllt? (Nur Angekreuztes erscheint in der Erklärung.)</div>
        {ERFUELLT_VORSCHLAEGE.map((e) => (
          <label key={e} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <input type="checkbox" checked={a.erfuellt.includes(e)} onChange={(x) => setA({ ...a, erfuellt: x.target.checked ? [...a.erfuellt, e] : a.erfuellt.filter((y) => y !== e) })} /> {e}
          </label>
        ))}
        <label style={s.lab}>Bekannte Einschränkungen (eine je Zeile, ehrlich — z. B. „Ältere PDF-Preislisten sind nicht barrierefrei")
          <textarea style={{ ...s.inp, minHeight: 60 }} value={a.barrieren} onChange={(e) => setA({ ...a, barrieren: e.target.value })} />
        </label>
        <details><summary style={{ cursor: 'pointer', color: C.cyan }}>Vorschau der Erklärung</summary><pre style={s.vorschau}>{text}</pre></details>
        <div style={s.knoepfe}>
          <button style={s.primaer} onClick={() => void erklaerungAufSeiten(true)}>{aktivText ? 'Erklärung aktualisieren' : 'Erklärung auf alle Seiten stellen'}</button>
          {aktivText && <button style={s.mini} onClick={() => void erklaerungAufSeiten(false)}>Von den Seiten nehmen</button>}
          <button style={s.mini} onClick={() => { try { void navigator.clipboard.writeText(text); meldung('Text kopiert.'); } catch { /* egal */ } }}>📋 Kopieren</button>
        </div>
        {aktivText ? <div style={{ ...s.klein, color: C.green }}>✓ Steht auf Ihren Seiten (Stand {a.geprueft_am ? de(a.geprueft_am) : '—'}), im Fuß verlinkt.</div> : <div style={{ ...s.klein, color: rot ? C.warn : C.textDim }}>Noch nicht auf Ihren Seiten.</div>}
        <div style={s.hint}>Zuständige Behörde: {MLBF.name}, {MLBF.anschrift}. Hilfe zur Selbstkontrolle, keine Rechtsberatung (Stand {BFSG_STAND}). Eine vollständige Prüfung nach WCAG ersetzt das nicht.</div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1060, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  zurueck: { color: C.textDim, fontSize: 13.5, textDecoration: 'none' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0' },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  mini: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 11px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  knoepfe: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${C.border}`, paddingTop: 8 },
  muster: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 32, borderRadius: 8, fontWeight: 800, border: `1px solid ${C.border}` },
  klein: { color: C.textDim, fontSize: 13 },
  hint: { color: C.textDim, fontSize: 12.5, lineHeight: 1.5 },
  box: { background: 'rgba(0,229,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 14, lineHeight: 1.5 },
  liste: { margin: '4px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.6 },
  vorschau: { whiteSpace: 'pre-wrap', background: '#fff', color: '#111', borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit' },
  dim: { color: C.textDim, fontSize: 14 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
