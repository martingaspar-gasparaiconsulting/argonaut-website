'use client';

// ============================================================
// ARGONAUT OS · Paket PS3 · Nachkauf-Erinnerung (Beauty)
//   Produktverkauf an die Kundin erfassen (mit Reichweite), rechtzeitig vor dem
//   Aufbrauchen erinnern — nur wenn erlaubt: Einwilligung ODER Bestandskunden-
//   Ausnahme § 7 Abs. 3 UWG (Hinweis auf Widerspruch beim Kauf + in jeder Mail).
//   Die Erinnerung landet in „Erinnerungen" und wird dort per E-Mail verschickt.
// Keine Gesundheits- oder Wirkversprechen im Text (HWG).
// Logik: lib/kundenVorgaenge.ts (getestet). SQL: supabase-sql/ps3-kunden-vorgaenge.sql.
// Unterpfad von /dashboard/wellness (erbt dessen Freigabe).
// Pfad: app/dashboard/wellness/nachkauf/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  REICHWEITE_VORSCHLAEGE, NACHKAUF_VORLAUF_TAGE, WIDERSPRUCH_HINWEIS,
  nachkaufListe, nachkaufText, aufgebrauchtAm, heuteBerlin, datumDe,
  type NachkaufVerkauf,
} from '@/lib/kundenVorgaenge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' };
const primaer: CSSProperties = { ...knopf, background: C.gold, color: C.navy, border: 'none', fontWeight: 800 };
const lab: CSSProperties = { display: 'block', color: C.textDim, fontSize: 13, fontWeight: 700, marginTop: 8 };
const raster: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 };

type Kunde = { id: string; name: string; email: string | null };
type Produkt = { id: string; bezeichnung: string; reichweite_tage: number; aktiv: boolean };
type Verkauf = NachkaufVerkauf & { erinnerung_id?: string | null };

export default function NachkaufSeite() {
  const heute = heuteBerlin();
  const [tab, setTab] = useState<'faellig' | 'verkauf' | 'produkte'>('faellig');
  const [uid, setUid] = useState<string | null>(null);
  const [firma, setFirma] = useState('');
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [produkte, setProdukte] = useState<Produkt[]>([]);
  const [verkaeufe, setVerkaeufe] = useState<Verkauf[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [nurFaellig, setNurFaellig] = useState(true);

  const laden = useCallback(async () => {
    setFehler(null);
    const v = await supabase.from('nachkauf_verkauf').select('*').order('verkauft_am', { ascending: false });
    if (v.error) { if (/nachkauf_verkauf/.test(v.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + v.error.message); return; }
    setVerkaeufe((v.data as Verkauf[]) ?? []);
    const [k, p] = await Promise.all([
      supabase.from('wellness_kunden').select('id, name, email').order('name', { ascending: true }),
      supabase.from('nachkauf_produkt').select('*').order('bezeichnung', { ascending: true }),
    ]);
    setKunden((k.data as Kunde[]) ?? []);
    setProdukte((p.data as Produkt[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setUid(id);
      try {
        let chef: string | null = null;
        try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
        const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', chef || id || '').maybeSingle();
        setFirma(String((p as { firma_name?: string } | null)?.firma_name ?? ''));
      } catch { /* optional */ }
      await laden();
    })();
  }, [laden]);

  const widerspruch = useMemo(() => new Set(verkaeufe.filter((v) => v.widerspruch_am).map((v) => v.kunde_id)), [verkaeufe]);
  const liste = useMemo(() => nachkaufListe(verkaeufe, heute, widerspruch), [verkaeufe, heute, widerspruch]);
  const name = (id: string) => kunden.find((k) => k.id === id)?.name ?? 'Kundin';
  const faelligAnzahl = liste.filter((z) => z.faellig).length;

  function meldung(o: string | null, f: string | null = null) { setOk(o); setFehler(f); }

  async function vormerken(z: (typeof liste)[number]) {
    if (!uid) return;
    if (!z.darf.ok) { meldung(null, z.darf.grund); return; }
    setBusy(z.verkauf.id); meldung(null);
    try {
      const t = nachkaufText({ produkt: z.verkauf.produkt, verkauftAm: z.verkauf.verkauft_am, firma });
      const tag = z.erinnernAb > heute ? z.erinnernAb : heute;
      const { data: e, error } = await supabase.from('erinnerung').insert({
        owner_user_id: uid, titel: t.titel, bezug_typ: 'frei', kanal: 'email', kunde_name: name(z.verkauf.kunde_id),
        email: z.verkauf.email, faellig_am: `${tag}T09:00`, status: 'offen', notiz: t.text,
      }).select('id').single();
      if (error) throw error;
      const { error: e2 } = await supabase.from('nachkauf_verkauf').update({ erinnert_am: heute, erinnerung_id: (e as { id: string }).id }).eq('id', z.verkauf.id);
      if (e2) throw e2;
      meldung(`Erinnerung für ${datumDe(tag)} vorgemerkt — Versand unter „Erinnerungen".`);
      await laden();
    } catch (err) { meldung(null, 'Vormerken fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  async function widersprechen(kundeId: string) {
    if (!window.confirm(`Widerspruch von ${name(kundeId)} eintragen? Danach bekommt sie keine Nachkauf-Erinnerungen mehr.`)) return;
    setBusy(kundeId);
    const { error } = await supabase.from('nachkauf_verkauf').update({ widerspruch_am: heute }).eq('kunde_id', kundeId).is('widerspruch_am', null);
    setBusy(null);
    if (error) meldung(null, 'Speichern fehlgeschlagen: ' + error.message); else { meldung('Widerspruch eingetragen.'); await laden(); }
  }

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Beauty</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>🧴 Nachkauf-Erinnerung</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Kurz bevor die Creme leer ist, kommt die freundliche Erinnerung — rechtssicher nur an Kundinnen, bei denen es erlaubt ist. <a href="/dashboard/wellness" style={{ color: C.cyan }}>← Zur Kundenkartei</a></p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {([['faellig', `🔔 Fällig${faelligAnzahl ? ` · ${faelligAnzahl}` : ''}`], ['verkauf', '＋ Verkauf erfassen'], ['produkte', '🧴 Produkte & Reichweite']] as const).map(([k, t]) => (
          <button key={k} onClick={() => { setTab(k); meldung(null); }} style={{ ...knopf, ...(tab === k ? { background: C.gold, color: C.navy, fontWeight: 800, border: 'none' } : {}) }}>{t}</button>
        ))}
      </div>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Nachkauf-Tabellen sind noch nicht eingerichtet (SQL von Paket PS3 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && tab === 'faellig' && (
        <div style={karte}>
          <label style={{ display: 'block', marginBottom: 8 }}><input type="checkbox" checked={nurFaellig} onChange={(e) => setNurFaellig(e.target.checked)} /> Nur fällige (ab {NACHKAUF_VORLAUF_TAGE} Tage vor dem voraussichtlichen Ende)</label>
          {liste.filter((z) => !nurFaellig || z.faellig).length === 0 && <div style={{ color: C.textDim }}>Nichts fällig.</div>}
          {liste.filter((z) => !nurFaellig || z.faellig).map((z) => (
            <div key={z.verkauf.id} style={{ borderTop: `1px solid ${C.border}`, padding: '10px 0', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <b>{name(z.verkauf.kunde_id)}</b> · {z.verkauf.produkt}{Number(z.verkauf.menge) > 1 ? ` ×${z.verkauf.menge}` : ''}
                <div style={{ color: C.textDim, fontSize: 13 }}>gekauft {datumDe(z.verkauf.verkauft_am)} · voraussichtlich leer {datumDe(z.aufgebraucht)} · erinnern ab {datumDe(z.erinnernAb)}</div>
                <div style={{ color: z.darf.ok ? C.green : C.warn, fontSize: 13 }}>{z.darf.ok ? '✓ ' : '⚠ '}{z.darf.grund}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button style={z.darf.ok ? primaer : knopf} disabled={!z.darf.ok || busy === z.verkauf.id} onClick={() => vormerken(z)}>🔔 Erinnerung vormerken</button>
                {!widerspruch.has(z.verkauf.kunde_id) && <button style={knopf} disabled={busy === z.verkauf.kunde_id} onClick={() => widersprechen(z.verkauf.kunde_id)}>Widerspruch</button>}
              </div>
            </div>
          ))}
          <p style={{ color: C.textDim, fontSize: 12.5 }}>Vorgemerkte Erinnerungen verschicken Sie unter <a href="/dashboard/erinnerungen" style={{ color: C.cyan }}>Erinnerungen</a> (Kanal E-Mail). Jede Mail enthält den Hinweis: „{WIDERSPRUCH_HINWEIS}"</p>
        </div>
      )}

      {!sqlFehlt && tab === 'verkauf' && <VerkaufErfassen kunden={kunden} produkte={produkte} heute={heute} meldung={meldung} laden={laden} />}
      {!sqlFehlt && tab === 'produkte' && <Produkte produkte={produkte} meldung={meldung} laden={laden} />}

      <p style={{ color: C.textDim, fontSize: 12.5 }}>Rechtlicher Rahmen: E-Mail-Werbung nur mit Einwilligung oder als Bestandskunden-Werbung nach § 7 Abs. 3 UWG — E-Mail beim Kauf erhalten, nur für eigene ähnliche Produkte, beim Kauf und in jeder Mail auf das jederzeitige Widerspruchsrecht hingewiesen, kein Widerspruch. Keine Rechtsberatung.</p>
    </div>
  );
}

function VerkaufErfassen({ kunden, produkte, heute, meldung, laden }: { kunden: Kunde[]; produkte: Produkt[]; heute: string; meldung: (o: string | null, f?: string | null) => void; laden: () => Promise<void> }) {
  const [f, setF] = useState({ kunde_id: '', produkt_id: '', produkt: '', reichweite: '', menge: '1', verkauft_am: heute, email: '', hinweis: false, einwilligung: false });
  const [busy, setBusy] = useState(false);
  const p = produkte.find((x) => x.id === f.produkt_id);
  const reich = p ? p.reichweite_tage : Number(f.reichweite) || 0;
  const leer = aufgebrauchtAm({ verkauft_am: f.verkauft_am, reichweite_tage: reich, menge: Number(f.menge) || 1 });

  async function speichern() {
    if (!f.kunde_id) { meldung(null, 'Bitte die Kundin wählen.'); return; }
    const produkt = p?.bezeichnung ?? f.produkt.trim();
    if (!produkt) { meldung(null, 'Bitte ein Produkt wählen oder eintragen.'); return; }
    if (!(reich > 0)) { meldung(null, 'Bitte die Reichweite in Tagen angeben.'); return; }
    setBusy(true);
    const { error } = await supabase.from('nachkauf_verkauf').insert({
      kunde_id: f.kunde_id, produkt_id: p?.id ?? null, produkt, menge: Math.max(1, Math.round(Number(f.menge) || 1)), reichweite_tage: reich,
      verkauft_am: f.verkauft_am, email: f.email.trim() || null, hinweis_widerspruch: f.hinweis, einwilligung_werbung: f.einwilligung,
    });
    setBusy(false);
    if (error) { meldung(null, 'Speichern fehlgeschlagen: ' + error.message); return; }
    meldung(`Verkauf gespeichert${leer ? ` — voraussichtlich leer am ${datumDe(leer)}` : ''}.`);
    setF({ ...f, produkt_id: '', produkt: '', reichweite: '', menge: '1', hinweis: false, einwilligung: false });
    await laden();
  }

  return (
    <div style={karte}>
      <div style={raster}>
        <div>
          <label style={lab}>Kundin</label>
          <select style={feld} value={f.kunde_id} onChange={(e) => { const k = kunden.find((x) => x.id === e.target.value); setF({ ...f, kunde_id: e.target.value, email: k?.email ?? '' }); }}>
            <option value="">— wählen —</option>{kunden.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lab}>Produkt</label>
          <select style={feld} value={f.produkt_id} onChange={(e) => setF({ ...f, produkt_id: e.target.value })}>
            <option value="">— frei eintragen —</option>{produkte.filter((x) => x.aktiv !== false).map((x) => <option key={x.id} value={x.id}>{x.bezeichnung} ({x.reichweite_tage} Tage)</option>)}
          </select>
        </div>
        {!p && <div><label style={lab}>Produktname</label><input style={feld} value={f.produkt} onChange={(e) => setF({ ...f, produkt: e.target.value })} /></div>}
        {!p && <div><label style={lab}>Reichweite (Tage)</label><input style={feld} value={f.reichweite} onChange={(e) => setF({ ...f, reichweite: e.target.value })} /></div>}
        <div><label style={lab}>Menge</label><input style={feld} value={f.menge} onChange={(e) => setF({ ...f, menge: e.target.value })} /></div>
        <div><label style={lab}>Verkauft am</label><input type="date" style={feld} value={f.verkauft_am} onChange={(e) => setF({ ...f, verkauft_am: e.target.value })} /></div>
        <div><label style={lab}>E-Mail</label><input style={feld} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      </div>
      <div style={{ ...karte, background: C.navy, marginTop: 10 }}>
        <b>Darf erinnert werden?</b>
        <label style={{ display: 'block', marginTop: 6 }}><input type="checkbox" checked={f.hinweis} onChange={(e) => setF({ ...f, hinweis: e.target.checked })} /> Ich habe beim Kauf auf das Widerspruchsrecht hingewiesen: „Wir erinnern Sie per E-Mail, wenn das Produkt voraussichtlich aufgebraucht ist. Sie können dem jederzeit widersprechen."</label>
        <label style={{ display: 'block', marginTop: 6 }}><input type="checkbox" checked={f.einwilligung} onChange={(e) => setF({ ...f, einwilligung: e.target.checked })} /> Die Kundin hat ausdrücklich in Werbung per E-Mail eingewilligt</label>
        {!f.hinweis && !f.einwilligung && <div style={{ color: C.warn, fontSize: 13, marginTop: 6 }}>Ohne einen der beiden Haken wird der Verkauf gespeichert, aber keine Erinnerung verschickt.</div>}
      </div>
      {leer && <div style={{ color: C.textDim, marginTop: 6 }}>Voraussichtlich aufgebraucht am {datumDe(leer)}.</div>}
      <button style={{ ...primaer, marginTop: 10 }} disabled={busy} onClick={speichern}>{busy ? '…' : 'Verkauf speichern'}</button>
    </div>
  );
}

function Produkte({ produkte, meldung, laden }: { produkte: Produkt[]; meldung: (o: string | null, f?: string | null) => void; laden: () => Promise<void> }) {
  const [neu, setNeu] = useState({ bezeichnung: '', tage: '' });
  async function anlegen(bezeichnung: string, tage: number) {
    if (!bezeichnung.trim() || !(tage > 0)) { meldung(null, 'Bitte Bezeichnung und Reichweite angeben.'); return; }
    const { error } = await supabase.from('nachkauf_produkt').insert({ bezeichnung: bezeichnung.trim(), reichweite_tage: Math.round(tage), aktiv: true });
    if (error) { meldung(null, 'Speichern fehlgeschlagen: ' + error.message); return; }
    setNeu({ bezeichnung: '', tage: '' }); meldung('Produkt angelegt.'); await laden();
  }
  async function umschalten(p: Produkt) {
    const { error } = await supabase.from('nachkauf_produkt').update({ aktiv: !p.aktiv }).eq('id', p.id);
    if (error) meldung(null, 'Speichern fehlgeschlagen: ' + error.message); else await laden();
  }
  const fehlend = REICHWEITE_VORSCHLAEGE.filter((v) => !produkte.some((p) => p.bezeichnung.toLowerCase() === v.produkt.toLowerCase()));
  return (
    <div style={karte}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...feld, width: 260 }} placeholder="Produkt, z. B. Serum 30 ml" value={neu.bezeichnung} onChange={(e) => setNeu({ ...neu, bezeichnung: e.target.value })} />
        <input style={{ ...feld, width: 140 }} placeholder="Reichweite Tage" value={neu.tage} onChange={(e) => setNeu({ ...neu, tage: e.target.value })} />
        <button style={primaer} onClick={() => anlegen(neu.bezeichnung, Number(neu.tage))}>＋ Anlegen</button>
      </div>
      {produkte.map((p) => (
        <div key={p.id} style={{ borderTop: `1px solid ${C.border}`, padding: '8px 0', display: 'flex', justifyContent: 'space-between', opacity: p.aktiv === false ? 0.5 : 1 }}>
          <span>{p.bezeichnung} · {p.reichweite_tage} Tage</span>
          <button style={knopf} onClick={() => umschalten(p)}>{p.aktiv === false ? 'Aktivieren' : 'Ausblenden'}</button>
        </div>
      ))}
      {fehlend.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ color: C.textDim, fontSize: 13 }}>Vorschläge (Richtwerte bei täglicher Anwendung — bitte an Ihre Produkte anpassen):</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {fehlend.map((v) => <button key={v.produkt} style={knopf} onClick={() => anlegen(v.produkt, v.tage)}>＋ {v.produkt} ({v.tage} T.)</button>)}
          </div>
        </div>
      )}
    </div>
  );
}
