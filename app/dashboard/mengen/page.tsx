'use client';

// ============================================================
// ARGONAUT OS · Mengen-Abrechnung (MO4, Paket 396, 16.10.2026)
// Leistungen nach Einheit erfassen (Std, km, ha, Tag, m³ …) mit Preis je
// Einheit, Zuschlag und Steuersatz — Tarif auf Wunsch aus dem
// Leistungskatalog. Offene Leistungen je Kunde werden mit einem Klick zur
// Sammelrechnung (/api/rechnung-aus-mengen). Mitarbeiter sehen nur ihre
// eigenen Erfassungen; abrechnen darf nur, wer abrechnen darf.
// Logik: lib/mengenAbrechnung.ts (getestet). SQL: p396.
// Pfad: app/dashboard/mengen/page.tsx
// ============================================================

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { useDarfAbrechnen } from '../_components/useDarfAbrechnen';
import { heuteIso, datumDe } from '@/lib/nachweisMotor';
import {
  EINHEITEN, TAKTE, pruefeLeistung, tarifAusKatalog, zeileNetto, offeneJeKunde, effektiverPreis, type Leistung, type Eingabe,
} from '@/lib/mengenAbrechnung';
import { leseVorbelegung, bezugFuerSpeichern, anStorniertenRechnungen, type MengenVorbelegung, type RechnungKurz } from '@/lib/mengenWeiter';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', warn: '#E0A24C', danger: '#E06666',
};

type Zeile = Leistung & { id: string; erfasst_von_name: string | null };
type Kontakt = { id: string; name: string };
type Katalog = { id: string; bezeichnung: string; einheit: string | null; einheitspreis_netto: unknown; stundensatz_netto: unknown; festpreis_netto: unknown; mwst_satz: unknown };

function euro(n: number): string { return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function kontaktName(k: Record<string, unknown>): string {
  const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return t(k.anzeigename) || [t(k.vorname), t(k.nachname)].filter(Boolean).join(' ') || t(k.name) || t(k.firmenname) || t(k.firma) || t(k.email) || 'Kontakt';
}

const LEER = (heute: string): Eingabe & { katalog: string } => ({ datum: heute, kontakt_id: '', empfaenger_name: '', bezeichnung: '', menge: '', einheit: 'Std', einzelpreis: '', zuschlag_prozent: '', mwst_satz: '19', takt: 0, katalog: '' });

export default function MengenSeite() {
  const router = useRouter();
  const darfAbrechnen = useDarfAbrechnen();
  const heute = heuteIso(new Date());
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [katalog, setKatalog] = useState<Katalog[]>([]);
  const [form, setForm] = useState(LEER(heute));
  const [meinName, setMeinName] = useState('');
  const [nurOffen, setNurOffen] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vorbelegung, setVorbelegung] = useState<MengenVorbelegung | null>(null);
  const [rechnungen, setRechnungen] = useState<RechnungKurz[]>([]);

  const laden = useCallback(async () => {
    const { data, error } = await supabase.from('mengen_leistung').select('*').order('datum', { ascending: false }).limit(1000);
    if (error) { setZeilen(null); setFehler(/mengen_leistung/.test(error.message) ? 'Die Mengen-Abrechnung wird gerade eingerichtet (SQL Paket 396 fehlt noch).' : 'Laden fehlgeschlagen.'); return; }
    const rows = (data as Zeile[]) ?? [];
    setZeilen(rows);
    // MO4 Teil 3: Status der verknüpften Rechnungen (stornierte geben Leistungen frei)
    const rIds = [...new Set(rows.map((z) => z.rechnung_id).filter((x): x is string => !!x))];
    if (rIds.length) {
      const { data: rs } = await supabase.from('rechnungen').select('id, zahlungsstatus, rechnungsnummer').in('id', rIds.slice(0, 500));
      setRechnungen((rs as RechnungKurz[]) ?? []);
    } else setRechnungen([]);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const meta = (u?.user?.user_metadata ?? {}) as Record<string, unknown>;
      setMeinName(String(meta.full_name ?? meta.name ?? '').trim() || String(u?.user?.email ?? '').split('@')[0]);
      const [k, l] = await Promise.all([
        supabase.from('kontakte').select('*').limit(2000),
        supabase.from('leistungskatalog').select('id, bezeichnung, einheit, einheitspreis_netto, stundensatz_netto, festpreis_netto, mwst_satz, aktiv').limit(500),
      ]);
      setKontakte(((k.data as Record<string, unknown>[]) ?? []).map((x) => ({ id: String(x.id), name: kontaktName(x) })).sort((a, b) => a.name.localeCompare(b.name, 'de')));
      setKatalog(((l.data as (Katalog & { aktiv?: boolean })[]) ?? []).filter((x) => x.aktiv !== false));
      // MO4 Teil 3: Vorbelegung aus dem Auftrag (?bezug=auftrag:<id>&kontakt=… bzw. &kunde=…)
      const v = leseVorbelegung(typeof window !== 'undefined' ? window.location.search : '');
      if (v) { setVorbelegung(v); setForm((f) => ({ ...f, kontakt_id: v.kontakt_id, empfaenger_name: v.empfaenger_name })); }
      await laden();
    })();
  }, [laden]);

  const namen = useMemo(() => new Map(kontakte.map((k) => [k.id, k.name])), [kontakte]);
  const kunde = (z: Pick<Leistung, 'kontakt_id' | 'empfaenger_name'>) => (z.kontakt_id ? namen.get(z.kontakt_id) ?? 'Kontakt' : z.empfaenger_name || '—');
  const offen = useMemo(() => offeneJeKunde(zeilen ?? []), [zeilen]);
  const sichtbar = useMemo(() => (zeilen ?? []).filter((z) => !nurOffen || !z.abgerechnet), [zeilen, nurOffen]);

  function katalogWaehlen(id: string) {
    const k = katalog.find((x) => x.id === id);
    if (!k) { setForm({ ...form, katalog: '' }); return; }
    const t = tarifAusKatalog(k);
    setForm({ ...form, katalog: id, bezeichnung: t.bezeichnung, einheit: t.einheit, einzelpreis: t.einzelpreis, mwst_satz: t.mwst_satz });
  }

  async function speichern() {
    const p = pruefeLeistung(form, heute);
    if (p.fehler || !p.zeile) { setFehler(p.fehler); return; }
    setBusy(true); setFehler(null);
    try {
      const { error } = await supabase.from('mengen_leistung').insert({ ...p.zeile, ...bezugFuerSpeichern(vorbelegung), leistungskatalog_id: form.katalog || null, erfasst_von_name: meinName || null });
      if (error) { setFehler('Leistung konnte nicht gespeichert werden.'); return; }
      setOk(`Erfasst: ${p.zeile.menge.toString().replace('.', ',')} ${p.zeile.einheit} ${p.zeile.bezeichnung}.`);
      setForm({ ...LEER(heute), kontakt_id: form.kontakt_id, empfaenger_name: form.empfaenger_name, datum: form.datum });
      await laden();
    } finally { setBusy(false); }
  }

  async function loeschen(z: Zeile) {
    if (z.abgerechnet) return;
    if (!window.confirm(`„${z.bezeichnung}" vom ${datumDe(z.datum)} löschen?`)) return;
    const { error } = await supabase.from('mengen_leistung').delete().eq('id', z.id);
    if (error) { setFehler('Löschen fehlgeschlagen (nur die Geschäftsleitung darf löschen).'); return; }
    await laden();
  }

  async function sammelrechnung(ids: string[], name: string) {
    if (darfAbrechnen === false) { setFehler('Abrechnen darf nur die Geschäftsleitung oder wer „darf abrechnen“ hat.'); return; }
    if (!window.confirm(`Sammelrechnung für ${name} mit ${ids.length} Leistung(en) erstellen?`)) return;
    setBusy(true); setFehler(null);
    try {
      const r = await fetch('/api/rechnung-aus-mengen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.rechnungId) { setFehler(j.error || 'Rechnung konnte nicht erstellt werden.'); await laden(); return; }
      router.push(`/dashboard/rechnungen/${j.rechnungId}`);
    } finally { setBusy(false); }
  }

  const storniert = useMemo(() => anStorniertenRechnungen(zeilen ?? [], rechnungen), [zeilen, rechnungen]);
  const stornoIds = useMemo(() => new Set(storniert.map((g) => g.rechnung_id)), [storniert]);

  async function wiederFreigeben(rechnungId: string, nummer: string, anzahl: number) {
    if (darfAbrechnen === false) { setFehler('Freigeben darf nur die Geschäftsleitung oder wer „darf abrechnen“ hat.'); return; }
    if (!window.confirm(`${anzahl} Leistung(en) der stornierten Rechnung ${nummer || ''} wieder freigeben? Die Rechnung selbst bleibt storniert und unverändert.`)) return;
    setBusy(true); setFehler(null); setOk(null);
    try {
      const r = await fetch('/api/mengen-freigeben', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rechnungId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFehler(j.error || 'Freigeben fehlgeschlagen.'); return; }
      setOk(`${j.freigegeben ?? 0} Leistung(en) sind wieder offen und können neu abgerechnet werden.`);
      await laden();
    } finally { setBusy(false); }
  }

  const vorschau = useMemo(() => {
    const p = pruefeLeistung(form, heute);
    return p.zeile ? zeileNetto(p.zeile) : null;
  }, [form, heute]);

  return (
    <div style={s.page}>
      <h1 style={s.h1}>📏 Mengen-Abrechnung</h1>
      <p style={s.sub}>Leistungen nach Stunde, Kilometer, Hektar, Tag oder Kubikmeter erfassen — und am Monatsende je Kunde als eine Sammelrechnung abrechnen.</p>
      {ok && <div style={s.ok}>{ok}</div>}
      {fehler && <div style={s.err}>{fehler}</div>}

      {zeilen !== null && (
        <div style={s.card}>
          <div style={{ fontWeight: 800 }}>Leistung erfassen</div>
          {vorbelegung?.bezug_typ && (
            <div style={s.dim}>
              📎 Wird gespeichert für {vorbelegung.bezug_typ === 'auftrag' ? 'Auftrag' : vorbelegung.bezug_typ === 'objekt' ? 'Objekt' : vorbelegung.bezug_typ === 'projekt' ? 'Projekt' : 'Vorgang'}{vorbelegung.bezug_label ? ` „${vorbelegung.bezug_label}“` : ''}
              {' · '}<button style={{ ...s.klein, padding: '2px 8px', fontSize: 12 }} onClick={() => setVorbelegung(null)}>lösen</button>
            </div>
          )}
          <div style={s.row}>
            <label style={s.lab}>Datum<input type="date" style={s.inp} value={form.datum} max={heute} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></label>
            <label style={{ ...s.lab, flex: 2, minWidth: 200 }}>Kunde<select style={s.inp} value={form.kontakt_id} onChange={(e) => setForm({ ...form, kontakt_id: e.target.value })}>
              <option value="">— Name eintragen —</option>{kontakte.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select></label>
            {!form.kontakt_id && <label style={{ ...s.lab, flex: 2, minWidth: 180 }}>Name des Kunden<input style={s.inp} value={form.empfaenger_name} onChange={(e) => setForm({ ...form, empfaenger_name: e.target.value })} /></label>}
          </div>
          <div style={s.row}>
            {katalog.length > 0 && <label style={{ ...s.lab, flex: 2, minWidth: 200 }}>Aus Leistungskatalog<select style={s.inp} value={form.katalog} onChange={(e) => katalogWaehlen(e.target.value)}>
              <option value="">— frei —</option>{katalog.map((k) => <option key={k.id} value={k.id}>{k.bezeichnung}</option>)}
            </select></label>}
            <label style={{ ...s.lab, flex: 3, minWidth: 220 }}>Leistung<input style={s.inp} value={form.bezeichnung} placeholder="z. B. Mähen Grünfläche, Anfahrt, Baggerarbeiten" onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })} /></label>
          </div>
          <div style={s.row}>
            <label style={s.lab}>Menge<input style={{ ...s.inp, width: 100 }} inputMode="decimal" value={form.menge} onChange={(e) => setForm({ ...form, menge: e.target.value })} /></label>
            <label style={s.lab}>Einheit<select style={s.inp} value={form.einheit} onChange={(e) => setForm({ ...form, einheit: e.target.value })}>{EINHEITEN.map((x) => <option key={x}>{x}</option>)}</select></label>
            {form.einheit === 'Std' && <label style={s.lab}>Takt<select style={s.inp} value={form.takt} onChange={(e) => setForm({ ...form, takt: Number(e.target.value) })}>{TAKTE.map((t) => <option key={t.minuten} value={t.minuten}>{t.label}</option>)}</select></label>}
            <label style={s.lab}>Preis je Einheit (netto)<input style={{ ...s.inp, width: 120 }} inputMode="decimal" value={form.einzelpreis} onChange={(e) => setForm({ ...form, einzelpreis: e.target.value })} /></label>
            <label style={s.lab}>Zuschlag %<input style={{ ...s.inp, width: 80 }} inputMode="decimal" value={form.zuschlag_prozent} placeholder="0" onChange={(e) => setForm({ ...form, zuschlag_prozent: e.target.value })} /></label>
            <label style={s.lab}>USt %<select style={s.inp} value={form.mwst_satz} onChange={(e) => setForm({ ...form, mwst_satz: e.target.value })}><option value="19">19</option><option value="7">7</option><option value="0">0</option></select></label>
            <div style={{ ...s.dim, alignSelf: 'center' }}>{vorschau != null ? `= ${euro(vorschau)} netto` : ''}</div>
            <button style={{ ...s.primaer, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={speichern}>＋ Erfassen</button>
          </div>
        </div>
      )}

      {zeilen !== null && darfAbrechnen && storniert.length > 0 && (
        <div style={s.card}>
          <div style={{ fontWeight: 800 }}>Stornierte Sammelrechnungen</div>
          <div style={s.dim}>Diese Leistungen hängen noch an einer stornierten Rechnung. Nach dem Freigeben sind sie wieder offen und können neu abgerechnet werden.</div>
          {storniert.map((g) => (
            <div key={g.rechnung_id} style={s.zeile}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700 }}>Rechnung {g.nummer || '(ohne Nummer)'} · storniert</div>
                <div style={s.dim}>{g.ids.length} Leistung(en)</div>
              </div>
              <a style={s.klein} href={`/dashboard/rechnungen/${g.rechnung_id}`}>🧾 Ansehen</a>
              <button style={s.klein} disabled={busy} onClick={() => wiederFreigeben(g.rechnung_id, g.nummer, g.ids.length)}>↩ Leistungen wieder freigeben</button>
            </div>
          ))}
        </div>
      )}

      {zeilen !== null && darfAbrechnen && offen.length > 0 && (
        <div style={s.card}>
          <div style={{ fontWeight: 800 }}>Offen zur Abrechnung</div>
          {offen.map((g) => (
            <div key={g.schluessel} style={s.zeile}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700 }}>{kunde(g)}</div>
                <div style={s.dim}>{g.anzahl} Leistung(en) · {datumDe(g.von)}{g.von !== g.bis ? ` – ${datumDe(g.bis)}` : ''}</div>
              </div>
              <div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{euro(g.netto)} netto</div>
              <button style={s.klein} disabled={busy} onClick={() => sammelrechnung(g.ids, kunde(g))}>🧾 Sammelrechnung</button>
            </div>
          ))}
        </div>
      )}

      {zeilen !== null && (
        <div style={s.card}>
          <div style={s.row}>
            <div style={{ fontWeight: 800, flex: 1 }}>Erfasste Leistungen</div>
            <label style={s.check}><input type="checkbox" checked={nurOffen} onChange={(e) => setNurOffen(e.target.checked)} /> nur offene</label>
          </div>
          {sichtbar.map((z) => (
            <div key={z.id} style={s.zeile}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700 }}>{z.bezeichnung}</div>
                <div style={s.dim}>{datumDe(z.datum)} · {kunde(z)}{z.erfasst_von_name ? ` · ${z.erfasst_von_name}` : ''}</div>
              </div>
              <div style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                <div>{String(z.menge).replace('.', ',')} {z.einheit} × {euro(effektiverPreis(z.einzelpreis, z.zuschlag_prozent))}</div>
                <div style={{ fontWeight: 800 }}>{euro(zeileNetto(z))}</div>
              </div>
              {z.abgerechnet
                ? (z.rechnung_id ? <a style={s.klein} href={`/dashboard/rechnungen/${z.rechnung_id}`}>{stornoIds.has(z.rechnung_id) ? '🧾 Rechnung (storniert)' : '🧾 Rechnung'}</a> : <span style={s.dim}>abgerechnet</span>)
                : <button style={{ ...s.klein, color: C.danger }} onClick={() => loeschen(z)}>🗑</button>}
            </div>
          ))}
          {!sichtbar.length && <div style={s.dim}>{nurOffen ? 'Keine offenen Leistungen.' : 'Noch keine Leistungen erfasst.'}</div>}
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 12 },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: '6px 0 0' },
  sub: { color: C.textDim, fontSize: 14.5, margin: 0 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 15, fontFamily: 'inherit', minWidth: 0 },
  dim: { color: C.textDim, fontSize: 13 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: C.text },
  zeile: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${C.border}`, paddingTop: 10 },
  klein: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 14 },
};
