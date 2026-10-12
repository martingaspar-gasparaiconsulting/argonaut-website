'use client';

// ============================================================
// ARGONAUT OS · Paket 340 (12.10.2026) · BV3a Manufaktur Teil 2
// Kalkulation mit Reifeverlust je Reife-Charge (Teil der Reife-Uhr).
// Plan (erwarteter Verlust, Ziel-Reifezeit) gegen Ist (gewogene Endmenge),
// Einstandspreis je verkaufsfähiger Einheit, Preis-Vorschlag aus der
// Wunsch-Marge — reine Rechnung, keine Marktpreise.
// Tabelle reife_kalk: nur Geschäftsleitung oder „Darf abrechnen"
// (die Seite blendet diesen Block sonst aus; die Sperre sitzt im SQL).
// Rechnen: lib/reifeKalk.ts (Tests: tests/reifeKalkP340.test.mjs).
// ============================================================

import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { nichtsGeschrieben, NICHT_GESPEICHERT } from '@/lib/speichernPruefen';
import { vorlage } from '@/lib/reife';
import {
  MWST_SAETZE, kalkStartwerte, kalkPruefen, planKalk, istKalk, verlustGrenze, einstandAbweichung, margeAmpel, preisEinheit,
  type ReifeKalk, type KalkCharge, type KalkAntwort, type KalkErgebnis,
} from '@/lib/reifeKalk';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };
const AMPEL: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad };

const euro = (n: number | null | undefined) => n === null || n === undefined ? '—' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const zahl = (n: number | null | undefined, st = 1) => n === null || n === undefined ? '—' : n.toLocaleString('de-DE', { maximumFractionDigits: st });
const txt = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const leer = (t: string) => (t.trim() ? leseZahl(t) : null);

type Form = { ek_art: string; ek: string; tag: string; sonst: string; parier: string; verlust: string; marge: string; mwst: string; vk: string };
function formAus(k: ReifeKalk): Form {
  return {
    ek_art: k.ek_art ?? 'je_einheit', ek: txt(k.ek_wert), tag: txt(k.kosten_tag), sonst: txt(k.kosten_sonst),
    parier: txt(k.parier_prozent), verlust: txt(k.erwarteter_verlust), marge: txt(k.marge_prozent),
    mwst: String(k.mwst_satz ?? 7), vk: txt(k.vk_preis),
  };
}

/** Formular -> Kalkulation (ungültige Zahl = null, die Prüfung meldet das beim Speichern). */
function kalkAus(f: Form): ReifeKalk {
  return {
    ek_art: f.ek_art, ek_wert: leer(f.ek), kosten_tag: leer(f.tag), kosten_sonst: leer(f.sonst),
    parier_prozent: leer(f.parier), erwarteter_verlust: leer(f.verlust), marge_prozent: leer(f.marge),
    mwst_satz: leseZahl(f.mwst), vk_preis: leer(f.vk),
  };
}

export default function ReifeKalkBox({ charge, gespeichert, letzteMenge, heute, onGespeichert }: {
  charge: KalkCharge & { id: string; nummer: string };
  gespeichert: ReifeKalk | null;
  letzteMenge: number | null;
  heute: string;
  onGespeichert: () => void | Promise<void>;
}) {
  const [f, setF] = useState<Form>(formAus(gespeichert ?? kalkStartwerte(charge.art)));
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setF(formAus(gespeichert ?? kalkStartwerte(charge.art))); }, [gespeichert, charge.art]);

  const k = kalkAus(f);
  const plan = planKalk(charge, k);
  const ist = istKalk(charge, k, letzteMenge, heute);
  const pe = preisEinheit(charge.einheit);
  const abw = einstandAbweichung(plan, ist);
  const grenze = verlustGrenze(charge, k, charge.ziel_tage ?? 0);
  const ohneVerlust = !vorlage(charge.art).verlust;

  async function speichern() {
    for (const [wert, name] of [[f.ek, 'Einkauf'], [f.tag, 'Reifekosten je Tag'], [f.sonst, 'Sonstige Kosten'], [f.parier, 'Parierverlust'], [f.verlust, 'Erwarteter Reifeverlust'], [f.marge, 'Wunsch-Marge'], [f.vk, 'Verkaufspreis']] as const) {
      if (wert.trim() && leseZahl(wert) === null) { setMeldung({ ok: false, text: `${name}: bitte als Zahl eintragen.` }); return; }
    }
    const r = kalkPruefen({ ...k, ek_art: f.ek_art });
    if (!r.ok) { setMeldung({ ok: false, text: r.fehler }); return; }
    setBusy(true); setMeldung(null);
    try {
      const { data, error } = await supabase.from('reife_kalk').upsert({ charge_id: charge.id, ...r.felder }, { onConflict: 'charge_id' }).select('charge_id');
      if (error || nichtsGeschrieben(data)) { setMeldung({ ok: false, text: NICHT_GESPEICHERT }); return; }
      setMeldung({ ok: true, text: 'Kalkulation gespeichert.' });
      await onGespeichert();
    } finally { setBusy(false); }
  }

  const feld = (label: string, key: keyof Form, hilfe?: string) => (
    <label style={s.feld} title={hilfe}>{label}
      <input style={s.input} inputMode="decimal" value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </label>
  );

  return (
    <div style={s.box}>
      <b style={{ fontSize: 14 }}>💶 Kalkulation mit Reifeverlust</b>
      <p style={{ ...s.klein, margin: '4px 0 10px' }}>
        Alle Beträge netto. Der Preis-Vorschlag ist reine Rechnung aus Ihren Kosten und Ihrer Wunsch-Marge — Sie entscheiden den Preis.
        Sichtbar nur für die Geschäftsleitung und Mitarbeiter mit „Darf abrechnen".
      </p>
      <div style={s.raster}>
        <label style={s.feld}>Einkauf netto
          <span style={{ display: 'flex', gap: 4 }}>
            <input style={{ ...s.input, flex: 1, minWidth: 0 }} inputMode="decimal" value={f.ek} onChange={(e) => setF({ ...f, ek: e.target.value })} />
            <select style={s.input} value={f.ek_art} onChange={(e) => setF({ ...f, ek_art: e.target.value })}>
              <option value="je_einheit">je {charge.einheit}</option>
              <option value="gesamt">gesamt</option>
            </select>
          </span>
        </label>
        {feld('Reifekosten je Tag (€)', 'tag', 'Strom, Reifeschrank, Platz — je Reifetag für diese Charge')}
        {feld('Sonstige Kosten gesamt (€)', 'sonst', 'Arbeit, Verpackung, Etiketten, Prüfung')}
        {!ohneVerlust && feld('Erwarteter Reifeverlust (%)', 'verlust', 'Gewichtsverlust beim Reifen laut Erfahrung')}
        {feld('Parierverlust (%)', 'parier', 'Abschnitt nach dem Reifen, z. B. Kruste beim Dry-Aged')}
        {feld('Wunsch-Marge (% vom Netto-Preis)', 'marge')}
        <label style={s.feld}>Umsatzsteuer
          <select style={s.input} value={f.mwst} onChange={(e) => setF({ ...f, mwst: e.target.value })}>
            {MWST_SAETZE.map((m) => <option key={m} value={String(m)}>{m} %</option>)}
          </select>
        </label>
        {feld(`Ihr Verkaufspreis brutto je ${pe.einheit} (€)`, 'vk')}
      </div>

      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={s.tabelle}>
          <thead>
            <tr><th style={s.th} /><th style={s.th}>Plan</th><th style={s.th}>Ist{ist.vorlaeufig ? ' (vorläufig)' : ''}</th></tr>
          </thead>
          <tbody>
            {zeile('Reifetage', plan, ist, (e) => zahl(e.tage, 0))}
            {zeile('Kosten gesamt', plan, ist, (e) => euro(e.kostenGesamt))}
            {zeile(`Menge nach Reifung (${charge.einheit})`, plan, ist, (e) => zahl(e.endMenge, 3))}
            {zeile(`Verkaufsfähig (${pe.einheit})`, plan, ist, (e) => zahl(e.verkaufsMenge, 3))}
            {zeile('Ausbeute', plan, ist, (e) => `${zahl(e.ausbeuteProzent)} %`)}
            {zeile(`Einstandspreis je ${pe.einheit}`, plan, ist, (e) => <b>{euro(e.einstand)}</b>)}
            {zeile(`Preis-Vorschlag brutto je ${pe.einheit}`, plan, ist, (e) => e.vorschlagBrutto === null ? '—' : <span style={{ color: C.gold }}>{euro(e.vorschlagBrutto)}</span>)}
            {zeile('Rohertrag je Einheit', plan, ist, (e) => euro(e.rohertragJe))}
            {zeile('Marge mit Ihrem Preis', plan, ist, (e) => {
              const a = margeAmpel(e, k.marge_prozent);
              return e.margeIst === null ? '—' : <span style={{ color: a ? AMPEL[a] : C.text }}>{zahl(e.margeIst)} % (Aufschlag {zahl(e.aufschlag)} %)</span>;
            })}
            {zeile('Rohertrag der Charge', plan, ist, (e) => euro(e.deckung))}
          </tbody>
        </table>
      </div>
      {!plan.ok && <p style={{ ...s.klein, color: C.warn }}>Plan: {plan.grund}</p>}
      {!ist.ok && <p style={s.klein}>Ist: {ist.grund}</p>}
      {ist.ok && ist.vorlaeufig && <p style={s.klein}>Ist vorläufig: letzte Wiegung, Parierverlust laut Eingabe, Reifekosten bis heute.</p>}
      {abw !== null && (
        <p style={{ ...s.klein, color: abw > 5 ? C.warn : C.dim }}>
          Einstand Ist gegen Plan: {abw > 0 ? '+' : ''}{zahl(abw)} %{abw > 5 ? ' — teurer als geplant (mehr Verlust oder länger gereift?)' : ''}
        </p>
      )}
      {grenze !== null && (
        <p style={{ ...s.klein, color: grenze < 0 ? C.bad : C.dim }}>
          {grenze < 0 ? 'Ihr Preis deckt die Kosten nicht einmal ohne jeden Verlust.' : `Ihr Preis deckt die Kosten bis zu ${zahl(grenze)} % Gesamtverlust (Reifen + Parieren, bei Ziel-Reifezeit).`}
        </p>
      )}

      {meldung && <p style={{ ...s.klein, color: meldung.ok ? C.ok : C.bad }} role={meldung.ok ? undefined : 'alert'}>{meldung.text}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button style={s.btnGold} disabled={busy} onClick={() => void speichern()}>Kalkulation speichern</button>
        {plan.ok && plan.e.vorschlagBrutto !== null && (
          <button style={s.btnAus} disabled={busy} onClick={() => setF({ ...f, vk: txt(plan.ok ? plan.e.vorschlagBrutto : null) })}>Plan-Vorschlag als Preis übernehmen</button>
        )}
      </div>
    </div>
  );
}

function zeile(label: string, plan: KalkAntwort, ist: KalkAntwort, wert: (e: KalkErgebnis) => ReactNode) {
  return (
    <tr>
      <td style={{ ...s.td, color: C.dim }}>{label}</td>
      <td style={s.td}>{plan.ok ? wert(plan.e) : '—'}</td>
      <td style={s.td}>{ist.ok ? wert(ist.e) : '—'}</td>
    </tr>
  );
}

const s: Record<string, CSSProperties> = {
  box: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
  klein: { color: C.dim, fontSize: 12, lineHeight: 1.45, margin: '6px 0 0' },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 },
  feld: { display: 'grid', gap: 4, fontSize: 13, color: C.dim },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 14, fontFamily: 'inherit' },
  tabelle: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: { textAlign: 'left', color: C.dim, fontWeight: 600, padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' },
  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  btnAus: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer' },
};
