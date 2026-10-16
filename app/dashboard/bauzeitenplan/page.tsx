'use client';

// ============================================================
// ARGONAUT OS · Bauzeitenplan (HW-2, Paket 399, 16.10.2026)
// Vorgänge (Gewerke) je Projekt mit Dauer in Arbeitstagen, Abhängigkeiten
// („fängt an, wenn … fertig ist") und Wartezeit danach (z. B. Estrich
// trocknen). Der Plan rechnet Start/Ende, Bauende und den kritischen Weg;
// Balkenansicht nach Wochen, Fortschritt je Vorgang, Druck.
// Chef plant; Mitarbeiter sehen den Plan und tragen den Fortschritt ein.
// Logik: lib/bauzeitenplan.ts (getestet). SQL: p399.
// Pfad: app/dashboard/bauzeitenplan/page.tsx
// ============================================================

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { feiertagsSet } from '@/lib/feiertage';
import { heuteIso, datumDe } from '@/lib/nachweisMotor';
import { planBerechnen, pruefeVorgang, bildetKreis, stand, STAND_TEXT, istIso, PLAN_VORLAGEN, vorlageReihenfolge, type Vorgang, type Eingabe } from '@/lib/bauzeitenplan';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666', blau: '#5B8DEF',
};
const STAND_FARBE: Record<string, string> = { fertig: C.green, ueberfaellig: C.danger, hinter_plan: C.warn, laeuft: C.blau, geplant: C.textDim };

type Projekt = { id: string; name: string | null; start_datum: string | null };
type Zeile = Vorgang & { fortschritt: number };
const LEER: Eingabe = { titel: '', gewerk: '', firma: '', start_wunsch: '', dauer_tage: '', puffer_tage: '', vorgaenger: [] };

function plusTage(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function tageZwischen(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
function montagVon(iso: string): string {
  const wt = new Date(iso + 'T00:00:00Z').getUTCDay();
  return plusTage(iso, wt === 0 ? -6 : 1 - wt);
}

export default function BauzeitenplanSeite() {
  const heute = heuteIso(new Date());
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [projektId, setProjektId] = useState('');
  const [baubeginn, setBaubeginn] = useState(heute);
  const [bundesland, setBundesland] = useState<string | null>(null);
  const [istChef, setIstChef] = useState(false);
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [form, setForm] = useState<Eingabe>(LEER);
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vorlageId, setVorlageId] = useState('');

  useEffect(() => {
    (async () => {
      const { data: chef } = await supabase.rpc('mein_chef_id');
      setIstChef(!chef);
      const { data: u } = await supabase.auth.getUser();
      const betrieb = (chef as string | null) || u?.user?.id || '';
      const [p, e] = await Promise.all([
        supabase.from('projekte').select('id, name, start_datum').order('created_at', { ascending: false }).limit(500),
        supabase.from('hr_einstellungen').select('bundesland').eq('owner_user_id', betrieb).maybeSingle(),
      ]);
      const liste = ((p.data as Projekt[]) ?? []);
      setProjekte(liste);
      setBundesland(((e.data as { bundesland?: string | null } | null)?.bundesland) ?? null);
      const ausAdresse = new URLSearchParams(window.location.search).get('projekt') ?? '';
      const start = liste.find((x) => x.id === ausAdresse) ?? liste[0];
      if (start) { setProjektId(start.id); if (istIso(start.start_datum)) setBaubeginn(start.start_datum); }
    })();
  }, []);

  const laden = useCallback(async () => {
    if (!projektId) { setZeilen([]); return; }
    const { data, error } = await supabase.from('bau_zeitplan').select('*').eq('projekt_id', projektId).order('sortierung').order('erstellt_am');
    if (error) { setZeilen(null); setFehler(/bau_zeitplan/.test(error.message) ? 'Der Bauzeitenplan wird gerade eingerichtet (SQL Paket 399 fehlt noch).' : 'Laden fehlgeschlagen.'); return; }
    setFehler(null);
    setZeilen(((data as Zeile[]) ?? []).map((z) => ({ ...z, vorgaenger: z.vorgaenger ?? [] })));
  }, [projektId]);
  useEffect(() => { void laden(); }, [laden]);

  function projektWaehlen(id: string) {
    setProjektId(id); setBearbeite(null); setForm(LEER); setOk(null);
    const p = projekte.find((x) => x.id === id);
    setBaubeginn(istIso(p?.start_datum) ? (p!.start_datum as string) : heute);
  }

  const feiertage = useMemo(() => {
    const von = istIso(baubeginn) ? baubeginn : heute;
    return feiertagsSet(plusTage(von, -7), plusTage(von, 365 * 4), bundesland);
  }, [baubeginn, bundesland, heute]);
  const plan = useMemo(() => planBerechnen(zeilen ?? [], baubeginn, feiertage), [zeilen, baubeginn, feiertage]);

  async function speichern() {
    if (!istChef) return;
    const p = pruefeVorgang(form, bearbeite);
    if (p.fehler || !p.zeile) { setFehler(p.fehler); return; }
    if (bearbeite && bildetKreis(zeilen ?? [], bearbeite, p.zeile.vorgaenger ?? [])) { setFehler('Diese Abhängigkeit würde einen Kreis bilden — der Vorgang würde am Ende auf sich selbst warten.'); return; }
    setBusy(true); setFehler(null);
    try {
      const res = bearbeite
        ? await supabase.from('bau_zeitplan').update(p.zeile).eq('id', bearbeite).select('id')
        : await supabase.from('bau_zeitplan').insert({ ...p.zeile, projekt_id: projektId, sortierung: (zeilen?.length ?? 0) + 1 }).select('id');
      if (res.error || !res.data?.length) { setFehler('Speichern fehlgeschlagen.'); return; }
      setOk(bearbeite ? 'Vorgang geändert — der Plan ist neu gerechnet.' : `„${p.zeile.titel}" eingeplant.`);
      setForm(LEER); setBearbeite(null);
      await laden();
    } finally { setBusy(false); }
  }

  async function vorlageEinfuegen() {
    if (!istChef || !projektId) return;
    const v = PLAN_VORLAGEN.find((x) => x.id === vorlageId);
    const reihe = v ? vorlageReihenfolge(v) : null;
    if (!v || !reihe) return;
    const schon = (zeilen ?? []).length;
    if (!window.confirm(`Vorlage „${v.name}" mit ${reihe.length} Vorgängen ${schon ? 'zusätzlich zu den vorhandenen ' : ''}einplanen? Die Dauern sind Startwerte — bitte danach an Ihre Baustelle anpassen.`)) return;
    setBusy(true); setFehler(null); setOk(null);
    const ids = new Map<string, string>();
    let n = 0;
    try {
      for (const x of reihe) {
        const { data, error } = await supabase.from('bau_zeitplan').insert({
          projekt_id: projektId, titel: x.titel, gewerk: x.gewerk, dauer_tage: x.dauer, puffer_tage: x.puffer ?? 0,
          vorgaenger: (x.nach ?? []).map((k) => ids.get(k)).filter(Boolean), sortierung: schon + n + 1,
          notiz: 'Aus Vorlage — Dauer ist ein Startwert',
        }).select('id').single();
        if (error || !data) { setFehler(`Vorlage nur teilweise eingeplant (${n} von ${reihe.length}) — bitte prüfen.`); break; }
        ids.set(x.key, (data as { id: string }).id); n++;
      }
      if (n === reihe.length) setOk(`Vorlage „${v.name}" eingeplant (${n} Vorgänge). Dauern und Firmen jetzt an die Baustelle anpassen.`);
      setVorlageId('');
      await laden();
    } finally { setBusy(false); }
  }

  function bearbeiten(z: Zeile) {
    setBearbeite(z.id); setOk(null); setFehler(null);
    setForm({ titel: z.titel, gewerk: z.gewerk ?? '', firma: z.firma ?? '', start_wunsch: z.start_wunsch ?? '', dauer_tage: String(z.dauer_tage), puffer_tage: z.puffer_tage ? String(z.puffer_tage) : '', vorgaenger: z.vorgaenger ?? [] });
  }

  async function loeschen(z: Zeile) {
    if (!istChef) return;
    const abh = (zeilen ?? []).filter((x) => (x.vorgaenger ?? []).includes(z.id));
    if (abh.length) { setFehler(`„${z.titel}" ist Vorgänger von ${abh.map((x) => `„${x.titel}"`).join(', ')} — bitte dort zuerst die Abhängigkeit lösen.`); return; }
    if (!window.confirm(`Vorgang „${z.titel}" aus dem Plan löschen?`)) return;
    const { error } = await supabase.from('bau_zeitplan').delete().eq('id', z.id);
    if (error) { setFehler('Löschen fehlgeschlagen.'); return; }
    await laden();
  }

  async function fortschritt(z: Zeile, wert: string) {
    const f = Math.max(0, Math.min(100, Math.trunc(Number(wert) || 0)));
    const { data, error } = await supabase.from('bau_zeitplan').update({ fortschritt: f }).eq('id', z.id).select('id');
    if (error || !data?.length) { setFehler('Fortschritt konnte nicht gespeichert werden.'); return; }
    setZeilen((zs) => (zs ?? []).map((x) => (x.id === z.id ? { ...x, fortschritt: f } : x)));
  }

  // Balkenansicht: Wochen-Raster ab Montag der Bauwoche
  const sortiert = useMemo(() => [...(zeilen ?? [])].sort((a, b) => {
    const pa = plan.zeilen.get(a.id), pb = plan.zeilen.get(b.id);
    return (pa?.start ?? '').localeCompare(pb?.start ?? '') || (a.sortierung ?? 0) - (b.sortierung ?? 0);
  }), [zeilen, plan]);
  const rasterStart = montagVon(istIso(baubeginn) ? baubeginn : heute);
  const rasterTage = plan.ende ? Math.max(7, tageZwischen(rasterStart, plan.ende) + 1) : 28;
  const wochen = Math.ceil(rasterTage / 7);
  const pxTag = Math.max(6, Math.min(28, Math.floor(760 / (wochen * 7))));
  const titelVon = (id: string) => zeilen?.find((x) => x.id === id)?.titel ?? '?';
  const projektName = projekte.find((p) => p.id === projektId)?.name ?? '';

  return (
    <div style={s.page}>
      <style>{`@media print { nav, aside, header, .kein-druck { display: none !important; } body { background: #fff !important; } }`}</style>
      <h1 style={s.h1}>📅 Bauzeitenplan</h1>
      <p style={s.sub}>Gewerke mit Dauer und Abhängigkeiten planen — Start, Ende und Bauende rechnet ARGONAUT in Arbeitstagen (ohne Wochenenden und Feiertage). Rot markiert ist der kritische Weg: verschiebt sich dort etwas, verschiebt sich das Bauende.</p>
      {ok && <div style={s.ok} className="kein-druck">{ok}</div>}
      {fehler && <div style={s.err}>{fehler}</div>}

      <div style={s.card}>
        <div style={s.row}>
          <label style={{ ...s.lab, flex: 2, minWidth: 220 }}>Projekt<select style={s.inp} value={projektId} onChange={(e) => projektWaehlen(e.target.value)}>
            {!projekte.length && <option value="">— erst unter Projekte ein Projekt anlegen —</option>}
            {projekte.map((p) => <option key={p.id} value={p.id}>{p.name || 'Projekt'}</option>)}
          </select></label>
          <label style={s.lab}>Baubeginn<input type="date" style={s.inp} value={baubeginn} onChange={(e) => setBaubeginn(e.target.value)} /></label>
          <div style={{ ...s.dim, alignSelf: 'center' }}>{plan.ende ? <>Bauende laut Plan: <b style={{ color: C.gold }}>{datumDe(plan.ende)}</b></> : ''}{!bundesland ? ' · Feiertage: nur bundesweite (Bundesland unter Personal-Einstellungen hinterlegen)' : ''}</div>
          <button style={s.klein} className="kein-druck" onClick={() => window.print()}>🖨 Drucken</button>
        </div>
      </div>

      {zeilen !== null && projektId && istChef && (
        <div style={s.card} className="kein-druck">
          {!bearbeite && (
            <div style={s.row}>
              <label style={{ ...s.lab, flex: 1, minWidth: 220 }}>Typischen Ablauf als Vorlage einfügen<select style={s.inp} value={vorlageId} onChange={(e) => setVorlageId(e.target.value)}>
                <option value="">— Vorlage wählen —</option>{PLAN_VORLAGEN.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.schritte.length} Vorgänge)</option>)}
              </select></label>
              <button style={{ ...s.klein, opacity: busy || !vorlageId ? 0.6 : 1 }} disabled={busy || !vorlageId} onClick={vorlageEinfuegen}>📋 Einfügen</button>
            </div>
          )}
          <div style={{ fontWeight: 800 }}>{bearbeite ? 'Vorgang ändern' : 'Vorgang einplanen'}</div>
          <div style={s.row}>
            <label style={{ ...s.lab, flex: 2, minWidth: 180 }}>Vorgang<input style={s.inp} value={form.titel} placeholder="z. B. Rohbau, Dachstuhl, Estrich" onChange={(e) => setForm({ ...form, titel: e.target.value })} /></label>
            <label style={{ ...s.lab, flex: 1, minWidth: 140 }}>Gewerk<input style={s.inp} value={form.gewerk} placeholder="z. B. Zimmerer" onChange={(e) => setForm({ ...form, gewerk: e.target.value })} /></label>
            <label style={{ ...s.lab, flex: 1, minWidth: 140 }}>Firma<input style={s.inp} value={form.firma} placeholder="eigene oder Subunternehmer" onChange={(e) => setForm({ ...form, firma: e.target.value })} /></label>
          </div>
          <div style={s.row}>
            <label style={s.lab}>Dauer (Arbeitstage)<input style={{ ...s.inp, width: 90 }} inputMode="numeric" value={form.dauer_tage} onChange={(e) => setForm({ ...form, dauer_tage: e.target.value })} /></label>
            <label style={s.lab}>Wartezeit davor (Tage)<input style={{ ...s.inp, width: 90 }} inputMode="numeric" value={form.puffer_tage} placeholder="0" onChange={(e) => setForm({ ...form, puffer_tage: e.target.value })} /></label>
            <label style={s.lab}>Frühester Start (optional)<input type="date" style={s.inp} value={form.start_wunsch} onChange={(e) => setForm({ ...form, start_wunsch: e.target.value })} /></label>
          </div>
          {(zeilen ?? []).filter((z) => z.id !== bearbeite).length > 0 && (
            <div style={s.lab}>Fängt an, wenn fertig ist:
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {(zeilen ?? []).filter((z) => z.id !== bearbeite).map((z) => {
                  const an = (form.vorgaenger ?? []).includes(z.id);
                  return (
                    <label key={z.id} style={{ ...s.check, border: `1px solid ${an ? C.gold : C.border}`, borderRadius: 8, padding: '4px 8px' }}>
                      <input type="checkbox" checked={an} onChange={(e) => setForm({ ...form, vorgaenger: e.target.checked ? [...(form.vorgaenger ?? []), z.id] : (form.vorgaenger ?? []).filter((x) => x !== z.id) })} />{z.titel}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <div style={s.row}>
            <button style={{ ...s.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={speichern}>{bearbeite ? '💾 Ändern' : '＋ Einplanen'}</button>
            {bearbeite && <button style={s.klein} onClick={() => { setBearbeite(null); setForm(LEER); }}>Abbrechen</button>}
          </div>
        </div>
      )}

      {zeilen !== null && projektId && (
        <div style={s.card}>
          <div style={{ fontWeight: 800 }}>{projektName ? `Plan: ${projektName}` : 'Plan'}</div>
          {plan.fehler && <div style={s.err}>{plan.fehler}</div>}
          {!zeilen.length && <div style={s.dim}>{istChef ? 'Noch keine Vorgänge — oben den ersten einplanen (z. B. Baustelleneinrichtung).' : 'Für dieses Projekt ist noch kein Bauzeitenplan angelegt.'}</div>}
          {!!zeilen.length && !plan.fehler && (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 300 + wochen * 7 * pxTag }}>
                <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>
                  <div style={{ width: 300, flexShrink: 0, ...s.dim }}>Vorgang</div>
                  {Array.from({ length: wochen }, (_, w) => (
                    <div key={w} style={{ width: 7 * pxTag, flexShrink: 0, fontSize: 11, color: C.textDim, borderLeft: `1px solid ${C.border}`, paddingLeft: 3 }}>KW ab {datumDe(plusTage(rasterStart, w * 7)).slice(0, 6)}</div>
                  ))}
                </div>
                {sortiert.map((z) => {
                  const pz = plan.zeilen.get(z.id);
                  if (!pz) return null;
                  const st = stand(pz, z.fortschritt, heute, feiertage);
                  const links = tageZwischen(rasterStart, pz.start) * pxTag;
                  const breite = (tageZwischen(pz.start, pz.ende) + 1) * pxTag;
                  return (
                    <div key={z.id} style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${C.border}`, minHeight: 44 }}>
                      <div style={{ width: 300, flexShrink: 0, paddingRight: 8 }}>
                        <div style={{ fontWeight: 700 }}>{pz.kritisch ? '🔴 ' : ''}{z.titel}{z.gewerk ? <span style={s.dim}> · {z.gewerk}</span> : null}</div>
                        <div style={s.dim}>
                          {datumDe(pz.start)} – {datumDe(pz.ende)} · {z.dauer_tage} AT{z.puffer_tage ? ` · +${z.puffer_tage} warten` : ''}{!pz.kritisch ? ` · ${pz.luft} AT Luft` : ''}
                          {z.firma ? ` · ${z.firma}` : ''}
                        </div>
                        {!!(z.vorgaenger ?? []).length && <div style={s.dim}>nach: {(z.vorgaenger ?? []).map(titelVon).join(', ')}</div>}
                        <div className="kein-druck" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                          <span style={{ fontSize: 12, color: STAND_FARBE[st] }}>● {STAND_TEXT[st]}</span>
                          <input style={{ ...s.inp, width: 56, padding: '3px 6px', fontSize: 13 }} inputMode="numeric" defaultValue={String(z.fortschritt ?? 0)} onBlur={(e) => { if (e.target.value !== String(z.fortschritt ?? 0)) void fortschritt(z, e.target.value); }} aria-label="Fortschritt in Prozent" /><span style={s.dim}>%</span>
                          {istChef && <button style={{ ...s.klein, padding: '3px 8px' }} onClick={() => bearbeiten(z)}>✏️</button>}
                          {istChef && <button style={{ ...s.klein, padding: '3px 8px', color: C.danger }} onClick={() => loeschen(z)}>🗑</button>}
                        </div>
                      </div>
                      <div style={{ position: 'relative', height: 22, width: wochen * 7 * pxTag, flexShrink: 0 }}>
                        <div title={`${z.titel}: ${datumDe(pz.start)} – ${datumDe(pz.ende)}`} style={{ position: 'absolute', left: links, width: breite, top: 0, bottom: 0, borderRadius: 5, background: pz.kritisch ? 'rgba(224,102,102,0.35)' : 'rgba(201,168,76,0.3)', border: `1px solid ${pz.kritisch ? C.danger : C.gold}`, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.max(0, Math.min(100, z.fortschritt ?? 0))}%`, height: '100%', background: pz.kritisch ? C.danger : C.gold, opacity: 0.8 }} />
                        </div>
                        {heute >= rasterStart && tageZwischen(rasterStart, heute) < wochen * 7 && (
                          <div style={{ position: 'absolute', left: tageZwischen(rasterStart, heute) * pxTag, top: -6, bottom: -6, width: 2, background: C.blau }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div style={s.dim}>AT = Arbeitstage · 🔴 kritischer Weg · blaue Linie = heute · Balkenfüllung = Fortschritt</div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 12 },
  h1: { fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  sub: { color: C.textDim, fontSize: 14.5, margin: 0 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  dim: { color: C.textDim, fontSize: 13 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.text },
  klein: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
};
