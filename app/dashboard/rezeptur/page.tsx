'use client';

// ============================================================
// ARGONAUT OS · Baustein 4 · Block N · Rezeptur-/Ausbeute-Rechner
// Rezept + Zutaten (mit Rolle Mehl/Wasser) erfassen; Live-Rechner:
// Teigausbeute, Schüttwasser, Backverlust, Wareneinsatz, Kosten je
// Einheit/Portion, Verkaufspreis-Vorschlag (Food-Cost) + Skalierung.
// Reine Formeln aus lib/rezeptur (0 €, web-verifiziert, getestet).
// Pfad: app/dashboard/rezeptur/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  teigausbeute, schuettwasser, backverlust, gebaeckAusTeig, ausbeuteProzent,
  skalierungsFaktor, wareneinsatz, kostenProEinheit, kostenProPortion,
  verkaufspreisAusFoodcost, type Zutat,
} from '@/lib/rezeptur';
import { augeRezeptur } from '@/lib/auge';
import KiAuge from '../_components/KiAuge';
import { NurVoll } from '../_components/Ansicht';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

const TYPEN = [
  { w: 'teig', l: '🥖 Teig / Backwaren' },
  { w: 'wurst', l: '🥩 Wurst / Zerlegen' },
  { w: 'konditor', l: '🍰 Konditor / Portionen' },
  { w: 'getraenk', l: '🍺 Getränk / Sud' },
  { w: 'allgemein', l: '📋 Allgemein' },
];
const ROLLEN = [{ w: 'sonstige', l: 'Zutat' }, { w: 'mehl', l: 'Mehl' }, { w: 'wasser', l: 'Wasser' }];

type Rezept = {
  id: string; name: string; typ: string; basis_menge: number | null; basis_einheit: string | null;
  portionen: number | null; backverlust_prozent: number | null; foodcost_ziel: number | null; notiz: string | null;
};
type ZutatRow = { id?: string; bezeichnung: string; menge: string; einheit: string; preis_pro_einheit: string; rolle: string };

const LEER_ZUTAT: ZutatRow = { bezeichnung: '', menge: '', einheit: 'kg', preis_pro_einheit: '', rolle: 'sonstige' };
function num(s: string) { const n = parseFloat((s || '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function eur(n: number | null) { return n == null ? '—' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function z1(n: number | null) { return n == null ? '—' : n.toLocaleString('de-DE', { maximumFractionDigits: 2 }); }

export default function RezepturRechner() {
  const [uid, setUid] = useState<string | null>(null);
  const [rezepte, setRezepte] = useState<Rezept[]>([]);
  const [aktivId, setAktivId] = useState('');
  const [eck, setEck] = useState<Rezept | null>(null);
  const [zutaten, setZutaten] = useState<ZutatRow[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chargeBusy, setChargeBusy] = useState(false);
  const [neuName, setNeuName] = useState('');
  const [neuTyp, setNeuTyp] = useState('teig');
  const [zielMenge, setZielMenge] = useState('');

  const ladeRezepte = useCallback(async () => {
    const { data } = await supabase.from('rezepturen').select('*').eq('archiviert', false).order('name', { ascending: true });
    setRezepte((data as Rezept[]) ?? []);
  }, []);

  const ladeZutaten = useCallback(async (rid: string) => {
    const { data } = await supabase.from('rezeptur_zutaten').select('*').eq('rezeptur_id', rid).order('position', { ascending: true });
    const rows = ((data as Record<string, unknown>[]) ?? []).map((z) => ({
      id: String(z.id), bezeichnung: String(z.bezeichnung ?? ''), menge: z.menge != null ? String(z.menge) : '',
      einheit: String(z.einheit ?? 'kg'), preis_pro_einheit: z.preis_pro_einheit != null ? String(z.preis_pro_einheit) : '',
      rolle: String(z.rolle ?? 'sonstige'),
    }));
    setZutaten(rows.length ? rows : [{ ...LEER_ZUTAT }]);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeRezepte(); setLaden(false);
    })();
  }, [ladeRezepte]);

  useEffect(() => {
    const r = rezepte.find((x) => x.id === aktivId) ?? null;
    setEck(r);
    if (aktivId) void ladeZutaten(aktivId); else setZutaten([]);
    setZielMenge('');
  }, [aktivId, rezepte, ladeZutaten]);

  async function rezeptAnlegen() {
    if (!uid || !neuName.trim()) { setFehler('Bitte einen Rezeptnamen angeben.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('rezepturen').insert({
        owner_user_id: uid, name: neuName.trim(), typ: neuTyp, basis_einheit: 'kg',
      }).select('*').single();
      if (error || !data) throw error ?? new Error('Fehler');
      setNeuName(''); await ladeRezepte(); setAktivId((data as Rezept).id); setOk('Rezept angelegt.');
    } catch (e: unknown) { setFehler('Anlegen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(false); }
  }

  async function eckSpeichern() {
    if (!eck || !uid) return;
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('rezepturen').update({
        name: eck.name, typ: eck.typ, basis_menge: eck.basis_menge, basis_einheit: eck.basis_einheit,
        portionen: eck.portionen, backverlust_prozent: eck.backverlust_prozent, foodcost_ziel: eck.foodcost_ziel,
        aktualisiert_am: new Date().toISOString(),
      }).eq('id', eck.id);
      if (error) throw error;
      await ladeRezepte(); setOk('Eckdaten gespeichert.');
    } catch (e: unknown) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(false); }
  }

  async function zutatenSpeichern() {
    if (!eck || !uid) return;
    setBusy(true); setFehler(null); setOk(null);
    try {
      // Einfach & sicher: bestehende Zutaten ersetzen.
      await supabase.from('rezeptur_zutaten').delete().eq('rezeptur_id', eck.id);
      const rows = zutaten
        .filter((z) => z.bezeichnung.trim() || num(z.menge) > 0)
        .map((z, i) => ({
          owner_user_id: uid, rezeptur_id: eck.id, position: i + 1,
          bezeichnung: z.bezeichnung.trim() || 'Zutat', menge: num(z.menge) || null,
          einheit: z.einheit.trim() || 'kg', preis_pro_einheit: z.preis_pro_einheit.trim() ? num(z.preis_pro_einheit) : null,
          rolle: z.rolle || 'sonstige',
        }));
      if (rows.length) { const { error } = await supabase.from('rezeptur_zutaten').insert(rows); if (error) throw error; }
      await ladeZutaten(eck.id); setOk('Zutaten gespeichert.');
    } catch (e: unknown) { setFehler('Speichern fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler')); }
    finally { setBusy(false); }
  }

  // --- Rezeptur → Charge (Block O · Andock ans Lebensmittel-Fachpaket) ---
  async function chargeErzeugen() {
    if (!eck || !uid) return;
    const menge = Number(eck.basis_menge) || 0;
    if (menge <= 0) { setFehler('Bitte zuerst eine Ausbeute-Menge in den Eckdaten setzen und speichern.'); return; }
    if (!window.confirm(`Charge aus „${eck.name}" erzeugen?\n\n• ${z1(menge)} ${eck.basis_einheit || ''}\n\nSie erscheint im 🥫 Lebensmittel-Modul (Chargen/MHD).`)) return;
    setChargeBusy(true); setFehler(null); setOk(null);
    try {
      const d = new Date();
      const nr = `RZ-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
      const { error } = await supabase.from('lm_chargen').insert({
        owner_user_id: uid, bezeichnung: eck.name, charge_nr: nr, menge, einheit: eck.basis_einheit || 'kg',
        notiz: `Aus Rezeptur „${eck.name}" erzeugt.`,
      });
      if (error) throw error;
      setOk(`Charge ${nr} erzeugt — im 🥫 Lebensmittel-Modul unter Chargen.`);
    } catch (e: unknown) {
      setFehler('Charge fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'));
    } finally { setChargeBusy(false); }
  }

  function setZ(i: number, patch: Partial<ZutatRow>) { setZutaten((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x))); }
  function zutatDazu() { setZutaten((r) => [...r, { ...LEER_ZUTAT }]); }
  function zutatWeg(i: number) { setZutaten((r) => (r.length > 1 ? r.filter((_, k) => k !== i) : r)); }
  function setEckF<K extends keyof Rezept>(k: K, v: Rezept[K]) { setEck((e) => (e ? { ...e, [k]: v } : e)); }

  // --- Live-Rechner (aus lib/rezeptur) ---
  const rechner = useMemo(() => {
    const zObj: Zutat[] = zutaten.map((z) => ({ bezeichnung: z.bezeichnung, menge: num(z.menge), einheit: z.einheit, preis_pro_einheit: num(z.preis_pro_einheit) }));
    const mehl = zutaten.filter((z) => z.rolle === 'mehl').reduce((s, z) => s + num(z.menge), 0);
    const wasser = zutaten.filter((z) => z.rolle === 'wasser').reduce((s, z) => s + num(z.menge), 0);
    const einsatzGesamt = zObj.reduce((s, z) => s + (Number(z.menge) || 0), 0);
    const we = wareneinsatz(zObj);
    const basis = Number(eck?.basis_menge) || 0;
    const bv = eck?.backverlust_prozent != null ? Number(eck.backverlust_prozent) : null;
    return {
      we,
      ta: mehl > 0 ? teigausbeute(mehl, wasser) : null,
      hydration: mehl > 0 ? schuettwasser(mehl, teigausbeute(mehl, wasser) ?? 100) : null,
      mehl, wasser, einsatzGesamt,
      kostenEinheit: basis > 0 ? kostenProEinheit(we, basis) : null,
      kostenPortion: eck?.portionen ? kostenProPortion(we, Number(eck.portionen)) : null,
      gebaeck: basis > 0 && bv != null ? gebaeckAusTeig(basis, bv) : null,
      ausbeute: basis > 0 && einsatzGesamt > 0 ? ausbeuteProzent(einsatzGesamt, basis) : null,
      vk: eck?.foodcost_ziel && eck.portionen ? verkaufspreisAusFoodcost(kostenProPortion(we, Number(eck.portionen)) ?? 0, Number(eck.foodcost_ziel)) : null,
    };
  }, [zutaten, eck]);

  const faktor = useMemo(() => {
    const basis = Number(eck?.basis_menge) || 0;
    const ziel = num(zielMenge);
    return basis > 0 && ziel > 0 ? skalierungsFaktor(ziel, basis) : null;
  }, [zielMenge, eck]);

  return (
    <div style={styles.page}>
      <div style={styles.eyebrow}>ARGONAUT OS · Rezeptur</div>
      <h1 style={styles.h1}>🧮 Rezeptur- & Ausbeute-Rechner</h1>
      <p style={styles.sub}>Rezepte mit Zutaten pflegen — und live Teigausbeute, Schüttwasser, Backverlust, Wareneinsatz, Kosten je Portion und Verkaufspreis rechnen. Für Bäcker, Metzger, Konditor, Brauer & Küche.</p>

      {fehler && <div style={styles.err}>{fehler}</div>}
      {ok && <div style={styles.ok}>{ok}</div>}

      {/* Rezept wählen / anlegen */}
      <div style={styles.card}>
        <div style={styles.grid2}>
          <label style={styles.lab}>Rezept
            <select style={styles.inp} value={aktivId} onChange={(e) => setAktivId(e.target.value)}>
              <option value="">— wählen —</option>
              {rezepte.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ ...styles.lab, flex: 1, minWidth: 140 }}>Neues Rezept
              <input style={styles.inp} value={neuName} onChange={(e) => setNeuName(e.target.value)} placeholder="z. B. Bauernbrot" />
            </label>
            <select style={{ ...styles.inp, maxWidth: 170 }} value={neuTyp} onChange={(e) => setNeuTyp(e.target.value)}>
              {TYPEN.map((t) => <option key={t.w} value={t.w}>{t.l}</option>)}
            </select>
            <button onClick={rezeptAnlegen} disabled={busy} style={styles.primaer}>+ Anlegen</button>
          </div>
        </div>
      </div>

      {eck && (
        <>
          {/* Eckdaten */}
          <div style={{ ...styles.card, marginTop: 16 }}>
            <div style={styles.cardTitel}>Eckdaten</div>
            <div style={styles.grid3}>
              <label style={styles.lab}>Name<input style={styles.inp} value={eck.name} onChange={(e) => setEckF('name', e.target.value)} /></label>
              <label style={styles.lab}>Typ
                <select style={styles.inp} value={eck.typ} onChange={(e) => setEckF('typ', e.target.value)}>{TYPEN.map((t) => <option key={t.w} value={t.w}>{t.l}</option>)}</select>
              </label>
              <label style={styles.lab}>Ausbeute-Menge
                <div style={{ display: 'flex', gap: 6 }}>
                  <input style={styles.inp} inputMode="decimal" value={eck.basis_menge ?? ''} onChange={(e) => setEckF('basis_menge', e.target.value === '' ? null : num(e.target.value))} placeholder="z. B. 16" />
                  <input style={{ ...styles.inp, maxWidth: 70 }} value={eck.basis_einheit ?? ''} onChange={(e) => setEckF('basis_einheit', e.target.value)} placeholder="kg" />
                </div>
              </label>
              <NurVoll>
                <label style={styles.lab}>Portionen<input style={styles.inp} inputMode="numeric" value={eck.portionen ?? ''} onChange={(e) => setEckF('portionen', e.target.value === '' ? null : Math.round(num(e.target.value)))} placeholder="optional" /></label>
              </NurVoll>
              <NurVoll>
                <label style={styles.lab}>Backverlust %<input style={styles.inp} inputMode="decimal" value={eck.backverlust_prozent ?? ''} onChange={(e) => setEckF('backverlust_prozent', e.target.value === '' ? null : num(e.target.value))} placeholder="z. B. 12" /></label>
              </NurVoll>
              <NurVoll>
                <label style={styles.lab}>Ziel Food-Cost %<input style={styles.inp} inputMode="decimal" value={eck.foodcost_ziel ?? ''} onChange={(e) => setEckF('foodcost_ziel', e.target.value === '' ? null : num(e.target.value))} placeholder="z. B. 30" /></label>
              </NurVoll>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <button onClick={eckSpeichern} disabled={busy} style={styles.primaer}>💾 Eckdaten speichern</button>
              <button onClick={chargeErzeugen} disabled={chargeBusy} style={{ ...styles.mini, borderColor: `${C.cyan}55`, color: C.cyan }} title="Aus diesem Rezept eine Charge fürs Lebensmittel-Modul erzeugen">{chargeBusy ? '…' : '🏷 Charge erzeugen'}</button>
            </div>
          </div>

          {/* Zutaten */}
          <div style={{ ...styles.card, marginTop: 16 }}>
            <div style={styles.cardTitel}>Zutaten</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {zutaten.map((z, i) => (
                <div key={i} style={styles.zRow}>
                  <input style={{ ...styles.inp, flex: 1, minWidth: 120 }} value={z.bezeichnung} onChange={(e) => setZ(i, { bezeichnung: e.target.value })} placeholder="Zutat" />
                  <input style={{ ...styles.inp, width: 80 }} inputMode="decimal" value={z.menge} onChange={(e) => setZ(i, { menge: e.target.value })} placeholder="Menge" />
                  <input style={{ ...styles.inp, width: 64 }} value={z.einheit} onChange={(e) => setZ(i, { einheit: e.target.value })} placeholder="kg" />
                  <input style={{ ...styles.inp, width: 92 }} inputMode="decimal" value={z.preis_pro_einheit} onChange={(e) => setZ(i, { preis_pro_einheit: e.target.value })} placeholder="€/Einh." />
                  <select style={{ ...styles.inp, width: 100 }} value={z.rolle} onChange={(e) => setZ(i, { rolle: e.target.value })}>{ROLLEN.map((r) => <option key={r.w} value={r.w}>{r.l}</option>)}</select>
                  <button onClick={() => zutatWeg(i)} style={styles.weg} title="Entfernen">✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
              <button onClick={zutatDazu} style={styles.mini}>＋ Zutat</button>
              <button onClick={zutatenSpeichern} disabled={busy} style={styles.primaer}>💾 Zutaten speichern</button>
            </div>
          </div>

          {/* Live-Rechner */}
          <div style={{ ...styles.card, marginTop: 16 }}>
            <div style={styles.cardTitel}>📊 Live-Rechner</div>
            <div style={styles.rGrid}>
              <RKachel label="Wareneinsatz" value={eur(rechner.we)} accent={C.gold} />
              {eck.typ === 'teig' && <RKachel label="Teigausbeute (TA)" value={rechner.ta != null ? z1(rechner.ta) : '— (Mehl markieren)'} accent={C.cyan} />}
              {eck.typ === 'teig' && rechner.ta != null && <RKachel label="Schüttwasser lt. TA" value={`${z1(rechner.hydration)} ${eck.basis_einheit || ''}`} accent={C.cyan} sub={`Mehl ${z1(rechner.mehl)} · Wasser ${z1(rechner.wasser)}`} />}
              {rechner.gebaeck != null && <RKachel label="Gebäck nach Backverlust" value={`${z1(rechner.gebaeck)} ${eck.basis_einheit || ''}`} accent={C.warn} />}
              {rechner.ausbeute != null && <RKachel label="Ausbeute" value={`${z1(rechner.ausbeute)} %`} accent={C.green} sub={`Einsatz ${z1(rechner.einsatzGesamt)} → ${z1(eck.basis_menge)}`} />}
              {rechner.kostenEinheit != null && <RKachel label={`Kosten je ${eck.basis_einheit || 'Einheit'}`} value={eur(rechner.kostenEinheit)} accent={C.gold} />}
              {rechner.kostenPortion != null && <RKachel label="Kosten je Portion" value={eur(rechner.kostenPortion)} accent={C.gold} />}
              {rechner.vk != null && <RKachel label={`Verkaufspreis-Vorschlag (${z1(eck.foodcost_ziel)}% FC)`} value={eur(rechner.vk)} accent={C.green} sub="netto, je Portion" />}
            </div>
          </div>

          {/* Regel-Auge */}
          <div style={{ marginTop: 16 }}>
            <KiAuge modul="Rezeptur" regel={augeRezeptur({ we: rechner.we, kostenPortion: rechner.kostenPortion, foodcostZiel: eck.foodcost_ziel != null ? Number(eck.foodcost_ziel) : null, vk: rechner.vk, hatZutaten: zutaten.some((z) => z.bezeichnung.trim() || num(z.menge) > 0) })} />
          </div>

          {/* Skalierung */}
          <div style={{ ...styles.card, marginTop: 16 }}>
            <div style={styles.cardTitel}>🔁 Skalierung</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 6 }}>
              <label style={styles.lab}>Ziel-Ausbeute ({eck.basis_einheit || 'Einheit'})
                <input style={{ ...styles.inp, maxWidth: 160 }} inputMode="decimal" value={zielMenge} onChange={(e) => setZielMenge(e.target.value)} placeholder={eck.basis_menge ? `Basis ${z1(eck.basis_menge)}` : 'Basis-Menge setzen'} />
              </label>
              {faktor != null && <div style={{ color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>Faktor <b style={{ color: C.gold }}>× {z1(faktor)}</b></div>}
            </div>
            {faktor != null && (
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>Zutat</th><th style={{ ...styles.th, textAlign: 'right' }}>Original</th><th style={{ ...styles.th, textAlign: 'right' }}>Skaliert</th></tr></thead>
                  <tbody>
                    {zutaten.filter((z) => z.bezeichnung.trim() || num(z.menge) > 0).map((z, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{z.bezeichnung || 'Zutat'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: C.textDim }}>{z1(num(z.menge))} {z.einheit}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>{z1(num(z.menge) * faktor)} {z.einheit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RKachel({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div style={styles.rBox}>
      <div style={styles.rLabel}>{label}</div>
      <div style={{ ...styles.rValue, color: accent || C.text }}>{value}</div>
      {sub && <div style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: C.navy, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", padding: '28px 24px 64px' },
  eyebrow: { fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: 2, textTransform: 'uppercase', color: C.gold, fontWeight: 600, marginBottom: 6 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 'clamp(28px, 2.5vw, 40px)', fontWeight: 800, margin: 0, color: C.text },
  sub: { color: C.textDim, margin: '8px 0 18px', fontSize: 'clamp(14px, 1.25vw, 20px)', maxWidth: 780, lineHeight: 1.5 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 },
  cardTitel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 6 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 'clamp(14px, 1.2vw, 19px)', fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  zRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  weg: { background: 'transparent', color: C.danger, border: `1px solid rgba(224,102,102,0.4)`, borderRadius: 8, padding: '8px 11px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 'clamp(13.5px, 1.2vw, 19px)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  mini: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 'clamp(12.5px, 1.1vw, 17px)', cursor: 'pointer', fontFamily: 'inherit' },
  rGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginTop: 10 },
  rBox: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  rLabel: { fontSize: 'clamp(11.5px, 1vw, 16px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  rValue: { fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 'clamp(20px, 1.8vw, 29px)', fontWeight: 800 },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 420 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 'clamp(11px, 0.94vw, 15px)', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` },
  td: { padding: '9px 10px', fontSize: 'clamp(14px, 1.25vw, 20px)', borderBottom: '1px solid rgba(143,163,190,0.08)' },
  err: { color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(224,102,102,0.1)', border: `1px solid rgba(224,102,102,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '0 0 14px' },
  ok: { color: C.green, fontSize: 'clamp(14px, 1.25vw, 20px)', background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '12px 14px', margin: '0 0 14px' },
};
