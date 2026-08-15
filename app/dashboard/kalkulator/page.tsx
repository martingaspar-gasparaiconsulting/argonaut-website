'use client';

// ============================================================================
// ARGONAUT OS · Branchen-Kalkulator · /dashboard/kalkulator
//
// Die Frage vor jedem Angebot: "Was kostet mich das — und was muss ich
// verlangen?" Vier Schritte:
//
//   1 Gewerk waehlen   → Startwerte laden (oder die eigenen, wenn vorhanden)
//   2 Menge angeben    → 80 m², 200 Stueck, ein Auftrag
//   3 Positionen       → Material, Zeit, Energie, Fremdleistung anpassen
//   4 Ergebnis         → rechnet live mit, waehrend getippt wird
//
// Gerechnet wird in lib/kalkulator.ts (node-getestet, 71 Tests). Diese Seite
// ist nur die Bedienung. Eigene Werte lassen sich als Normwerte merken —
// beim naechsten Mal kommt dann die eigene Zahl statt der Vorlage.
// ============================================================================

import { useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  GEWERKE, gewerkDef, ausVorlage, rechne, beiWunschpreis, pruefeKalkulation, befund,
  euro, zahl, ZUSCHLAEGE_STANDARD,
  type Kalkulation, type Posten, type PostenArt,
} from '@/lib/kalkulator';
import { NurVoll } from '../_components/Ansicht';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

const ART_LABEL: Record<PostenArt, string> = {
  material: 'Material', zeit: 'Zeit', energie: 'Energie', fremd: 'Fremdleistung',
};
const ART_FARBE: Record<PostenArt, string> = {
  material: C.cyan, zeit: C.gold, energie: C.warn, fremd: C.dim,
};
const ARTEN: PostenArt[] = ['material', 'zeit', 'energie', 'fremd'];

type GespeicherteKalkulation = {
  id: string; name: string; gewerk: string | null; menge: number; einheit: string;
  posten: Posten[]; zuschlaege: Kalkulation['zuschlaege']; ergebnis: Record<string, unknown>;
  erstellt_am: string;
};

type Norm = {
  id: string; gewerk: string; schluessel: string; bezeichnung: string; art: string;
  wert: number; einheit: string; bezug: string; preis_je_einheit: number | null; quelle: string;
};

function neueId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* Rückfall */ }
  return 'p' + Math.random().toString(36).slice(2, 11);
}

/** Aus einer Bezeichnung einen stabilen Schlüssel machen (für die Normwerte). */
function schluesselAus(bezeichnung: string, art: string): string {
  const rein = String(bezeichnung || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
  return `${art}_${rein || 'position'}`;
}

function fmtZeit(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function dauer(minuten: number): string {
  const m = Math.max(0, Math.round(minuten));
  return m < 60 ? `${m} Min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} Min`;
}

export default function KalkulatorPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [gewerk, setGewerk] = useState<string>('');
  const [k, setK] = useState<Kalkulation | null>(null);
  const [name, setName] = useState('');
  const [wunsch, setWunsch] = useState('');
  const [gespeichert, setGespeichert] = useState<GespeicherteKalkulation[]>([]);
  const [normen, setNormen] = useState<Norm[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const [kalk, norm] = await Promise.all([
      supabase.from('kalkulationen').select('*').order('erstellt_am', { ascending: false }).limit(30),
      supabase.from('kalkulator_normen').select('*').limit(500),
    ]);
    setGespeichert((kalk.data as GespeicherteKalkulation[]) ?? []);
    setNormen((norm.data as Norm[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUid(data?.user?.id ?? null);
      await laden();
    })();
  }, [laden]);

  // --- Live-Ergebnis ---------------------------------------------------------
  const e = useMemo(() => (k ? rechne(k) : null), [k]);
  const probe = useMemo(() => (k ? pruefeKalkulation(k) : []), [k]);
  const urteil = useMemo(() => (e ? befund(e) : null), [e]);
  const rueckwaerts = useMemo(() => {
    if (!k || !wunsch.trim()) return null;
    return beiWunschpreis(k, zahl(wunsch));
  }, [k, wunsch]);

  // --- Gewerk wählen ---------------------------------------------------------
  function gewerkWaehlen(key: string) {
    const vorlage = ausVorlage(key, neueId);
    if (!vorlage) return;

    // Eigene Normwerte schlagen die Vorlage — was der Betrieb selbst gemessen
    // hat, ist immer besser als ein Startwert von uns.
    const eigene = normen.filter((n) => n.gewerk === key);
    if (eigene.length > 0) {
      vorlage.posten = vorlage.posten.map((p) => {
        const treffer = eigene.find((n) => n.schluessel === schluesselAus(p.bezeichnung, p.art));
        if (!treffer) return p;
        return {
          ...p,
          menge_je_einheit: Number(treffer.wert),
          preis_je_einheit: treffer.preis_je_einheit !== null ? Number(treffer.preis_je_einheit) : p.preis_je_einheit,
        };
      });
    }

    setGewerk(key);
    setK(vorlage);
    setName(gewerkDef(key)?.label ?? 'Kalkulation');
    setWunsch(''); setFehler(null);
    setOk(eigene.length > 0 ? `${eigene.length} eigene Normwerte übernommen.` : null);
  }

  function leerStarten() {
    setGewerk('');
    setK({ menge: 1, einheit: 'Stk', posten: [], zuschlaege: { ...ZUSCHLAEGE_STANDARD } });
    setName('Eigene Kalkulation');
    setWunsch(''); setFehler(null); setOk(null);
  }

  // --- Posten bearbeiten -----------------------------------------------------
  function postenAendern(id: string, teil: Partial<Posten>) {
    setK((v) => (v ? { ...v, posten: v.posten.map((p) => (p.id === id ? { ...p, ...teil } : p)) } : v));
  }
  function postenHinzu(art: PostenArt) {
    const vorgabe: Record<PostenArt, { einheit: string; preis: number }> = {
      material: { einheit: 'Stk', preis: 0 },
      zeit: { einheit: 'min', preis: 0.95 },
      energie: { einheit: 'kWh', preis: 0.32 },
      fremd: { einheit: 'Stk', preis: 0 },
    };
    setK((v) => (v ? {
      ...v,
      posten: [...v.posten, {
        id: neueId(), art, bezeichnung: '', menge_je_einheit: 0,
        einheit: vorgabe[art].einheit, preis_je_einheit: vorgabe[art].preis,
      }],
    } : v));
  }
  function postenWeg(id: string) {
    setK((v) => (v ? { ...v, posten: v.posten.filter((p) => p.id !== id) } : v));
  }
  function zuschlagAendern(feld: keyof Kalkulation['zuschlaege'], wert: string) {
    setK((v) => (v ? { ...v, zuschlaege: { ...v.zuschlaege, [feld]: zahl(wert, 0) } } : v));
  }

  // --- Speichern -------------------------------------------------------------
  async function speichern() {
    if (!uid || !k || !e) return;
    if (probe.length > 0) { setFehler(probe.join(' · ')); return; }
    setBusy('speichern'); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('kalkulationen').insert({
        owner_user_id: uid,
        name: name.trim() || 'Kalkulation',
        gewerk: gewerk || null,
        menge: k.menge, einheit: k.einheit,
        posten: k.posten, zuschlaege: k.zuschlaege,
        ergebnis: {
          einzelkosten: e.einzelkosten, selbstkosten: e.selbstkosten,
          angebotspreis_netto: e.angebotspreis_netto, je_einheit: e.je_einheit,
          marge_prozent: e.marge_prozent, zeit_minuten: e.zeit_minuten, energie_kwh: e.energie_kwh,
        },
      });
      if (error) throw error;
      setOk('Kalkulation gespeichert.');
      await laden();
    } catch (err: unknown) {
      setFehler('Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  /** Die aktuellen Zeilen als eigene Normwerte hinterlegen. */
  async function alsNormenMerken() {
    if (!uid || !k || !gewerk) return;
    setBusy('normen'); setFehler(null); setOk(null);
    try {
      const saetze = k.posten
        .filter((p) => String(p.bezeichnung ?? '').trim())
        .map((p) => ({
          owner_user_id: uid, gewerk,
          schluessel: schluesselAus(p.bezeichnung, p.art),
          bezeichnung: p.bezeichnung, art: p.art,
          wert: zahl(p.menge_je_einheit), einheit: p.einheit,
          bezug: k.einheit, preis_je_einheit: zahl(p.preis_je_einheit),
          quelle: 'eigen', aktualisiert_am: new Date().toISOString(),
        }));
      if (saetze.length === 0) { setFehler('Keine Positionen zum Merken.'); return; }
      const { error } = await supabase.from('kalkulator_normen')
        .upsert(saetze, { onConflict: 'owner_user_id,gewerk,schluessel' });
      if (error) throw error;
      setOk(`${saetze.length} Werte als Ihre Normwerte gemerkt — beim nächsten Mal sind sie sofort da.`);
      await laden();
    } catch (err: unknown) {
      setFehler('Merken fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler'));
    } finally { setBusy(null); }
  }

  function ladenAus(g: GespeicherteKalkulation) {
    setK({
      menge: Number(g.menge), einheit: g.einheit,
      posten: Array.isArray(g.posten) ? g.posten : [],
      zuschlaege: { ...ZUSCHLAEGE_STANDARD, ...(g.zuschlaege || {}) },
    });
    setGewerk(g.gewerk ?? '');
    setName(g.name);
    setWunsch(''); setFehler(null); setOk(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loeschen(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Diese Kalkulation löschen?')) return;
    await supabase.from('kalkulationen').delete().eq('id', id);
    await laden();
  }

  const gw = gewerk ? gewerkDef(gewerk) : undefined;

  // ==========================================================================

  return (
    <div style={s.seite}>
      <h1 style={s.h1}>🧮 Kalkulator</h1>
      <p style={s.unter}>
        Was kostet mich ein Auftrag wirklich — und was muss ich verlangen, damit etwas übrig bleibt?
        Material, Arbeitszeit, Maschinenstrom und Fremdleistungen ergeben zusammen Ihre Selbstkosten.
        Alles rechnet live mit, während Sie tippen.
      </p>

      {fehler && <div style={s.fehlerKasten}>⚠️ {fehler}</div>}
      {ok && <div style={s.okKasten}>✓ {ok}</div>}

      {/* --- 1 Gewerk --- */}
      <div style={s.block}>
        <div style={s.blockTitel}>1 · Für welches Gewerk?</div>
        <div style={s.gewerkGrid}>
          {GEWERKE.map((g) => (
            <button
              key={g.key} type="button" onClick={() => gewerkWaehlen(g.key)}
              style={{
                ...s.gewerkKarte,
                borderColor: gewerk === g.key ? C.gold : C.border,
                background: gewerk === g.key ? 'rgba(201,168,76,0.12)' : 'rgba(10,22,40,0.5)',
              }}
            >
              <div style={{ fontSize: 21 }}>{g.icon}</div>
              <div style={{ fontWeight: 800, fontSize: 14, marginTop: 3 }}>{g.label}</div>
              <div style={{ color: C.dim, fontSize: 11.5, marginTop: 2 }}>je {g.einheit}</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 11 }}>
          <button type="button" onClick={leerStarten} style={s.knopfRand}>＋ Leer beginnen</button>
        </div>
        {gw && <div style={{ color: C.dim, fontSize: 12.5, marginTop: 10, lineHeight: 1.55 }}>{gw.hinweis}</div>}
      </div>

      {k && (
        <>
          {/* --- 2 Menge --- */}
          <div style={s.block}>
            <div style={s.blockTitel}>2 · Wieviel wird gemacht?</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 130px' }}>
                <label style={s.label}>Menge</label>
                <input
                  value={String(k.menge)} inputMode="decimal"
                  onChange={(ev) => setK({ ...k, menge: zahl(ev.target.value, 0) })}
                  style={s.feld}
                />
              </div>
              <div style={{ flex: '1 1 110px' }}>
                <label style={s.label}>Einheit</label>
                <input value={k.einheit} onChange={(ev) => setK({ ...k, einheit: ev.target.value })} style={s.feld} />
              </div>
              <div style={{ flex: '2 1 240px' }}>
                <label style={s.label}>Name der Kalkulation</label>
                <input value={name} onChange={(ev) => setName(ev.target.value)} style={s.feld} />
              </div>
            </div>
          </div>

          {/* --- 3 Positionen --- */}
          <div style={s.block}>
            <div style={s.blockTitel}>3 · Was steckt in einer Einheit?</div>
            <p style={s.hinweisText}>
              Alle Angaben beziehen sich auf <b style={{ color: C.text }}>eine {k.einheit}</b> — also z.B. wieviel Farbe
              auf einen Quadratmeter geht. Die Gesamtmenge rechnet der Kalkulator selbst hoch.
            </p>

            <div style={{ overflowX: 'auto' }}>
              <table style={s.tabelle}>
                <thead>
                  <tr>
                    <th style={s.th}>Art</th>
                    <th style={s.th}>Bezeichnung</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>je {k.einheit}</th>
                    <th style={s.th}>Einheit</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Preis/Einheit</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Kosten gesamt</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {k.posten.map((p) => {
                    const zeileGesamt = (zahl(p.menge_je_einheit) * (1 + (p.art === 'material' ? zahl(p.verschnitt_prozent) : 0) / 100)) * zahl(p.preis_je_einheit) * zahl(k.menge);
                    return (
                      <tr key={p.id}>
                        <td style={s.td}>
                          <select value={p.art} onChange={(ev) => postenAendern(p.id, { art: ev.target.value as PostenArt })} style={{ ...s.feldKlein, color: ART_FARBE[p.art], fontWeight: 700 }}>
                            {ARTEN.map((a) => <option key={a} value={a} style={{ color: C.text }}>{ART_LABEL[a]}</option>)}
                          </select>
                        </td>
                        <td style={s.td}>
                          <input value={p.bezeichnung} onChange={(ev) => postenAendern(p.id, { bezeichnung: ev.target.value })} style={{ ...s.feldKlein, minWidth: 160 }} />
                        </td>
                        <td style={s.td}>
                          <input value={String(p.menge_je_einheit)} inputMode="decimal" onChange={(ev) => postenAendern(p.id, { menge_je_einheit: zahl(ev.target.value, 0) })} style={{ ...s.feldKlein, width: 82, textAlign: 'right' }} />
                        </td>
                        <td style={s.td}>
                          <input value={p.einheit} onChange={(ev) => postenAendern(p.id, { einheit: ev.target.value })} style={{ ...s.feldKlein, width: 66 }} />
                        </td>
                        <td style={s.td}>
                          <input value={String(p.preis_je_einheit)} inputMode="decimal" onChange={(ev) => postenAendern(p.id, { preis_je_einheit: zahl(ev.target.value, 0) })} style={{ ...s.feldKlein, width: 88, textAlign: 'right' }} />
                        </td>
                        <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{euro(zeileGesamt)}</td>
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          <button type="button" onClick={() => postenWeg(p.id)} style={s.knopfWeg}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                  {k.posten.length === 0 && (
                    <tr><td colSpan={7} style={{ ...s.td, color: C.dim }}>Noch keine Position — unten hinzufügen oder oben ein Gewerk wählen.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Verschnitt nur im Voll-Modus — im Alltag stört er, in der Werkstatt zählt er */}
            <NurVoll>
              {k.posten.some((p) => p.art === 'material') && (
                <div style={s.verschnittKasten}>
                  <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: C.gold, fontWeight: 800, marginBottom: 8 }}>
                    Verschnitt, Bruch, Reste
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {k.posten.filter((p) => p.art === 'material').map((p) => (
                      <div key={p.id} style={{ flex: '1 1 190px' }}>
                        <label style={s.label}>{p.bezeichnung || 'Material'}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <input value={String(p.verschnitt_prozent ?? 0)} inputMode="decimal" onChange={(ev) => postenAendern(p.id, { verschnitt_prozent: zahl(ev.target.value, 0) })} style={{ ...s.feldKlein, width: 74, textAlign: 'right' }} />
                          <span style={{ color: C.dim, fontSize: 13 }}>%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </NurVoll>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {ARTEN.map((a) => (
                <button key={a} type="button" onClick={() => postenHinzu(a)} style={{ ...s.knopfRand, fontSize: 13, padding: '8px 12px', color: ART_FARBE[a] }}>
                  ＋ {ART_LABEL[a]}
                </button>
              ))}
            </div>
          </div>

          {/* --- Zuschläge (Voll) --- */}
          <NurVoll>
            <div style={s.block}>
              <div style={s.blockTitel}>Zuschläge</div>
              <p style={s.hinweisText}>
                Gemeinkosten decken Werkstatt, Fahrzeuge, Büro und Versicherungen. Skonto und Rabatt werden
                <b style={{ color: C.text }}> herausgerechnet, nicht aufgeschlagen</b> — sonst bleibt nach Abzug
                weniger übrig als kalkuliert.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 11 }}>
                {([
                  ['gemeinkosten_prozent', 'Gemeinkosten %'],
                  ['wagnis_gewinn_prozent', 'Wagnis + Gewinn %'],
                  ['skonto_prozent', 'Skonto %'],
                  ['rabatt_prozent', 'Rabatt %'],
                  ['mwst_satz', 'MwSt %'],
                ] as const).map(([feld, label]) => (
                  <div key={feld}>
                    <label style={s.label}>{label}</label>
                    <input value={String(k.zuschlaege[feld])} inputMode="decimal" onChange={(ev) => zuschlagAendern(feld, ev.target.value)} style={s.feld} />
                  </div>
                ))}
              </div>
            </div>
          </NurVoll>

          {/* --- 4 Ergebnis --- */}
          {e && (
            <div style={{ ...s.block, borderColor: 'rgba(201,168,76,0.45)' }}>
              <div style={s.blockTitel}>4 · Das Ergebnis</div>

              <div style={s.grossGrid}>
                <div style={s.grossKarte}>
                  <div style={s.grossLabel}>Selbstkosten je {k.einheit}</div>
                  <div style={{ ...s.grossWert, color: C.cyan }}>{euro(e.je_einheit.selbstkosten)}</div>
                  <div style={s.grossUnter}>gesamt {euro(e.selbstkosten)}</div>
                </div>
                <div style={{ ...s.grossKarte, borderColor: 'rgba(201,168,76,0.5)', background: 'rgba(201,168,76,0.09)' }}>
                  <div style={s.grossLabel}>Angebotspreis je {k.einheit}</div>
                  <div style={{ ...s.grossWert, color: C.gold }}>{euro(e.je_einheit.angebotspreis_netto)}</div>
                  <div style={s.grossUnter}>netto · gesamt {euro(e.angebotspreis_netto)}</div>
                </div>
                <div style={s.grossKarte}>
                  <div style={s.grossLabel}>Marge</div>
                  <div style={{ ...s.grossWert, color: e.marge_prozent >= 12 ? C.green : e.marge_prozent > 0 ? C.warn : C.danger }}>
                    {e.marge_prozent} %
                  </div>
                  <div style={s.grossUnter}>{euro(e.gewinn_je_einheit)} je {k.einheit}</div>
                </div>
              </div>

              {urteil && (
                <div style={{
                  ...s.befundKasten,
                  borderColor: urteil.ton === 'gut' ? 'rgba(76,175,125,0.45)' : urteil.ton === 'achtung' ? 'rgba(224,162,76,0.45)' : 'rgba(224,102,102,0.5)',
                  background: urteil.ton === 'gut' ? 'rgba(76,175,125,0.08)' : urteil.ton === 'achtung' ? 'rgba(224,162,76,0.08)' : 'rgba(224,102,102,0.08)',
                  color: urteil.ton === 'gut' ? C.green : urteil.ton === 'achtung' ? C.warn : C.danger,
                }}>
                  {urteil.ton === 'gut' ? '✓' : '⚠️'} {urteil.text}
                </div>
              )}

              {/* Aufschlüsselung */}
              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table style={s.tabelle}>
                  <tbody>
                    {([
                      ['Material', e.material, ART_FARBE.material],
                      ['Arbeitszeit', e.zeit, ART_FARBE.zeit],
                      ['Energie', e.energie, ART_FARBE.energie],
                      ['Fremdleistung', e.fremd, ART_FARBE.fremd],
                    ] as const).filter(([, betrag]) => betrag > 0).map(([label, betrag, farbe]) => (
                      <tr key={label}>
                        <td style={{ ...s.td, color: farbe, fontWeight: 700 }}>{label}</td>
                        <td style={{ ...s.td, textAlign: 'right' }}>{euro(betrag)}</td>
                        <td style={{ ...s.td, textAlign: 'right', color: C.dim, width: 90 }}>
                          {e.einzelkosten > 0 ? Math.round((betrag / e.einzelkosten) * 100) : 0} %
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ ...s.td, fontWeight: 800 }}>Einzelkosten</td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 800 }}>{euro(e.einzelkosten)}</td>
                      <td style={s.td}></td>
                    </tr>
                    <NurVollZeile label={`+ Gemeinkosten ${k.zuschlaege.gemeinkosten_prozent} %`} wert={euro(e.gemeinkosten)} />
                    <tr>
                      <td style={{ ...s.td, fontWeight: 800 }}>= Selbstkosten</td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 800 }}>{euro(e.selbstkosten)}</td>
                      <td style={s.td}></td>
                    </tr>
                    <NurVollZeile label={`+ Wagnis und Gewinn ${k.zuschlaege.wagnis_gewinn_prozent} %`} wert={euro(e.wagnis_gewinn)} />
                    {(k.zuschlaege.skonto_prozent > 0 || k.zuschlaege.rabatt_prozent > 0) && (
                      <NurVollZeile
                        label={`+ Skonto/Rabatt herausgerechnet (${k.zuschlaege.skonto_prozent} % / ${k.zuschlaege.rabatt_prozent} %)`}
                        wert={euro(e.angebotspreis_netto - e.barverkaufspreis)}
                      />
                    )}
                    <tr style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ ...s.td, fontWeight: 800, color: C.gold }}>= Angebotspreis netto</td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 800, color: C.gold }}>{euro(e.angebotspreis_netto)}</td>
                      <td style={s.td}></td>
                    </tr>
                    <tr>
                      <td style={{ ...s.td, color: C.dim }}>+ MwSt {k.zuschlaege.mwst_satz} %</td>
                      <td style={{ ...s.td, textAlign: 'right', color: C.dim }}>{euro(e.mwst)}</td>
                      <td style={s.td}></td>
                    </tr>
                    <tr>
                      <td style={{ ...s.td, fontWeight: 700 }}>= brutto</td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>{euro(e.angebotspreis_brutto)}</td>
                      <td style={s.td}></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Zeit und Energie */}
              {(e.zeit_minuten > 0 || e.energie_kwh > 0) && (
                <div style={s.kennzahlReihe}>
                  {e.zeit_minuten > 0 && (
                    <div style={s.kennzahl}>
                      <div style={s.grossLabel}>Arbeitszeit gesamt</div>
                      <div style={{ fontSize: 19, fontWeight: 800, color: C.gold }}>{dauer(e.zeit_minuten)}</div>
                      <div style={s.grossUnter}>{e.zeit_minuten_je_einheit} Min je {k.einheit}</div>
                    </div>
                  )}
                  {e.energie_kwh > 0 && (
                    <div style={s.kennzahl}>
                      <div style={s.grossLabel}>Stromverbrauch</div>
                      <div style={{ fontSize: 19, fontWeight: 800, color: C.warn }}>{e.energie_kwh} kWh</div>
                      <div style={s.grossUnter}>{e.energie_kwh_je_einheit} kWh je {k.einheit}</div>
                    </div>
                  )}
                  <div style={s.kennzahl}>
                    <div style={s.grossLabel}>Deckungsbeitrag</div>
                    <div style={{ fontSize: 19, fontWeight: 800, color: C.green }}>{euro(e.deckungsbeitrag)}</div>
                    <div style={s.grossUnter}>nach Einzelkosten</div>
                  </div>
                </div>
              )}

              {/* Wunschpreis rückwärts */}
              <NurVoll>
                <div style={s.wunschKasten}>
                  <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: C.cyan, fontWeight: 800, marginBottom: 7 }}>
                    Der Kunde nennt einen Preis — trägt sich das?
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input value={wunsch} inputMode="decimal" placeholder="Wunschpreis netto, gesamt"
                      onChange={(ev) => setWunsch(ev.target.value)} style={{ ...s.feld, maxWidth: 220 }} />
                    {rueckwaerts && (
                      <div style={{ fontSize: 13.5, color: rueckwaerts.traegt_sich ? C.green : C.danger, fontWeight: 700 }}>
                        {rueckwaerts.traegt_sich
                          ? `Trägt sich: ${euro(rueckwaerts.gewinn)} Gewinn (${rueckwaerts.marge_prozent} % Marge)`
                          : `Sie zahlen ${euro(Math.abs(rueckwaerts.gewinn))} drauf — Selbstkosten sind ${euro(rueckwaerts.selbstkosten)}`}
                      </div>
                    )}
                  </div>
                </div>
              </NurVoll>

              {probe.length > 0 && (
                <div style={{ ...s.fehlerKasten, marginTop: 14 }}>
                  {probe.map((f, i) => <div key={i}>⚠️ {f}</div>)}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button type="button" onClick={speichern} disabled={busy !== null || probe.length > 0}
                  style={{ ...s.knopfGold, opacity: busy !== null || probe.length > 0 ? 0.5 : 1 }}>
                  {busy === 'speichern' ? 'Speichert …' : 'Kalkulation speichern'}
                </button>
                {gewerk && (
                  <button type="button" onClick={alsNormenMerken} disabled={busy !== null} style={s.knopfRand}>
                    {busy === 'normen' ? 'Merkt …' : 'Als meine Normwerte merken'}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* --- Gespeicherte --- */}
      {gespeichert.length > 0 && (
        <div style={s.block}>
          <div style={s.blockTitel}>Ihre Kalkulationen</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tabelle}>
              <thead>
                <tr>
                  <th style={s.th}>Name</th>
                  <th style={s.th}>Menge</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Angebot netto</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Marge</th>
                  <th style={s.th}>Wann</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {gespeichert.map((g) => {
                  const erg = (g.ergebnis ?? {}) as { angebotspreis_netto?: number; marge_prozent?: number };
                  return (
                    <tr key={g.id}>
                      <td style={{ ...s.td, fontWeight: 700 }}>{g.name}</td>
                      <td style={{ ...s.td, color: C.dim }}>{g.menge} {g.einheit}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{euro(zahl(erg.angebotspreis_netto))}</td>
                      <td style={{ ...s.td, textAlign: 'right', color: zahl(erg.marge_prozent) >= 12 ? C.green : C.warn }}>
                        {zahl(erg.marge_prozent)} %
                      </td>
                      <td style={{ ...s.td, color: C.dim, whiteSpace: 'nowrap' }}>{fmtZeit(g.erstellt_am)}</td>
                      <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button type="button" onClick={() => ladenAus(g)} style={{ ...s.knopfRand, padding: '6px 11px', fontSize: 12.5 }}>Öffnen</button>{' '}
                        <button type="button" onClick={() => loeschen(g.id)} style={{ ...s.knopfWeg, padding: '6px 10px' }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={s.fussHinweis}>
        Die mitgelieferten Werte sind <b style={{ color: C.text }}>Startwerte</b>, keine amtlichen Vorgaben — sie ersparen
        Ihnen das leere Blatt. Sobald Sie einmal mit Ihren eigenen Zahlen gerechnet haben, merken Sie sie sich über
        „Als meine Normwerte merken". Ab dann rechnet der Kalkulator mit <b style={{ color: C.text }}>Ihren</b> Werten.
      </div>
    </div>
  );
}

/** Zwischenzeile der Aufschlüsselung, die nur im Voll-Modus erscheint. */
function NurVollZeile({ label, wert }: { label: string; wert: string }) {
  return (
    <NurVoll>
      <tr>
        <td style={{ ...s.td, color: C.dim }}>{label}</td>
        <td style={{ ...s.td, textAlign: 'right', color: C.dim }}>{wert}</td>
        <td style={s.td}></td>
      </tr>
    </NurVoll>
  );
}

const s: Record<string, CSSProperties> = {
  seite: { maxWidth: 1100, margin: '0 auto', padding: '8px 4px 64px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 28, fontWeight: 800, margin: 0, color: C.gold },
  unter: { color: C.dim, fontSize: 14.5, lineHeight: 1.6, margin: '8px 0 20px', maxWidth: 840 },

  block: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', marginBottom: 14 },
  blockTitel: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: C.gold, fontWeight: 800, marginBottom: 11 },
  hinweisText: { color: C.dim, fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' },

  gewerkGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 9 },
  gewerkKarte: { textAlign: 'left', cursor: 'pointer', border: '1px solid', borderRadius: 11, padding: 11, color: C.text, fontFamily: 'inherit' },

  label: { display: 'block', fontSize: 12, color: C.dim, fontWeight: 700, marginBottom: 4 },
  feld: { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(10,22,40,0.7)', color: C.text, fontSize: 14, fontFamily: 'inherit' },
  feldKlein: { padding: '7px 9px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'rgba(10,22,40,0.7)', color: C.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' },

  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: { textAlign: 'left', color: C.dim, fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.6, padding: '7px 7px', borderBottom: `1px solid ${C.border}` },
  td: { padding: '7px 7px', borderBottom: `1px solid rgba(143,163,190,0.08)`, verticalAlign: 'middle' },

  verschnittKasten: { marginTop: 13, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 13px', background: 'rgba(10,22,40,0.45)' },
  wunschKasten: { marginTop: 14, border: '1px solid rgba(0,229,255,0.28)', borderRadius: 10, padding: '11px 13px', background: 'rgba(0,229,255,0.06)' },
  befundKasten: { marginTop: 13, border: '1px solid', borderRadius: 10, padding: '11px 13px', fontSize: 13.5, fontWeight: 700, lineHeight: 1.5 },

  grossGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 11 },
  grossKarte: { border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 15px', background: 'rgba(10,22,40,0.5)' },
  grossLabel: { fontSize: 11.5, color: C.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7 },
  grossWert: { fontSize: 25, fontWeight: 800, marginTop: 5, lineHeight: 1.1 },
  grossUnter: { color: C.dim, fontSize: 12, marginTop: 4 },

  kennzahlReihe: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(165px,1fr))', gap: 10, marginTop: 14 },
  kennzahl: { border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 13px', background: 'rgba(10,22,40,0.45)' },

  knopfGold: { padding: '11px 17px', borderRadius: 9, border: 'none', background: C.gold, color: C.navy, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  knopfRand: { padding: '10px 14px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' },
  knopfWeg: { padding: '6px 9px', borderRadius: 7, border: '1px solid rgba(224,102,102,0.4)', background: 'transparent', color: C.danger, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },

  fehlerKasten: { border: '1px solid rgba(224,102,102,0.5)', borderRadius: 12, padding: '12px 14px', background: 'rgba(224,102,102,0.07)', color: C.danger, fontSize: 13.5, lineHeight: 1.6, marginBottom: 14 },
  okKasten: { border: '1px solid rgba(76,175,125,0.5)', borderRadius: 12, padding: '12px 14px', background: 'rgba(76,175,125,0.07)', color: C.green, fontSize: 13.5, marginBottom: 14 },
  fussHinweis: { marginTop: 18, background: 'rgba(0,229,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 15px', color: C.dim, fontSize: 13, lineHeight: 1.6 },
};
