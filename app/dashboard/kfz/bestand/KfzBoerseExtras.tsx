'use client';

// ============================================================
// ARGONAUT OS · Paket 282 · K15b — Zusatzleistungen und Finanzierungsbeispiel
// (Teil der Börsen-Leiste im Fahrzeugbestand)
//  1) Zusatzleistungen (Katalog, max. 12): Interessenten kreuzen sie in der Börse an,
//     die Auswahl kommt mit der Anfrage. Preise rechnet immer der Server.
//  2) Finanzierungsbeispiel: Darlehensgeber, Anschrift, Sollzins, Laufzeit, Anzahlung,
//     Schlussrate. Im Inserat nur, wenn eingeschaltet, vollständig und bestätigt.
//  3) Rechner für das Verkaufsgespräch (beliebiger Preis, unverbindlich).
// Schreiben nur Geschäftsleitung (modul_einstellung „kfz-boerse", RLS 259).
// ============================================================

import { useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { leseZahl } from '@/lib/zahlen';
import { nichtsGeschrieben, NICHT_GESPEICHERT } from '@/lib/speichernPruefen';
import { BOERSE_MODUL } from '@/lib/kfzBoerse';
import {
  FINANZ_KEY, EXTRAS_KEY, EXTRAS_MAX, finanzEinstellung, boerseBereit, beispiel, pflichtZeilen, extrasLesen, einstellungHinweise, BEISPIEL_HINWEIS,
} from '@/lib/kfzFinanzierung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', ok: '#4CAF7D', warn: '#E0A84C', bad: '#E06666' };

const t = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
function heute(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

export default function KfzBoerseExtras({ betrieb, istChef, roh, onGespeichert }: { betrieb: string; istChef: boolean; roh: Record<string, unknown>; onGespeichert: () => void }) {
  const extras = extrasLesen(roh[EXTRAS_KEY]);
  const fe = finanzEinstellung(roh[FINANZ_KEY]);
  const [ex, setEx] = useState<{ text: string; betrag: string }[] | null>(null);
  const [fin, setFin] = useState<Record<string, string | boolean> | null>(null);
  const [rechner, setRechner] = useState({ preis: '', anzahlung: '', schluss: '', monate: '' });
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function schreiben(teil: Record<string, unknown>, meldung: string): Promise<boolean> {
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('modul_einstellung').upsert(
        { owner_user_id: betrieb, modul: BOERSE_MODUL, einstellung: { ...roh, ...teil }, aktualisiert_am: new Date().toISOString() },
        { onConflict: 'owner_user_id,modul' }).select('id');
      if (error || nichtsGeschrieben(data)) { setFehler(`${NICHT_GESPEICHERT} (nur Geschäftsleitung)`); return false; }
      setOk(meldung); onGespeichert(); return true;
    } finally { setBusy(false); }
  }

  async function extrasSpeichern() {
    if (!ex) return;
    const liste = ex.map((z) => ({ text: z.text, betrag: leseZahl(z.betrag) })).filter((z) => z.text.trim() || z.betrag !== null);
    const sauber = extrasLesen(liste);
    if (sauber.length !== liste.length) { setFehler('Jede Zeile braucht einen Text (bis 80 Zeichen) und einen Preis von 0 bis 100.000 €; kein Text doppelt.'); return; }
    if (await schreiben({ [EXTRAS_KEY]: sauber.map((z) => ({ text: z.text, betrag: z.betrag })) }, 'Zusatzleistungen gespeichert.')) setEx(null);
  }

  async function finSpeichern() {
    if (!fin) return;
    const neu = {
      aktiv: fin.aktiv === true, bank: String(fin.bank ?? ''), anschrift: String(fin.anschrift ?? ''),
      sollzins: leseZahl(String(fin.sollzins ?? '')), monate: leseZahl(String(fin.monate ?? '')),
      anzahlungProzent: leseZahl(String(fin.anzahlungProzent ?? '')), schlussProzent: leseZahl(String(fin.schlussProzent ?? '')),
      hinweis: String(fin.hinweis ?? ''), geprueftAm: fin.geprueft === true ? (fe.geprueftAm ?? heute()) : null,
    };
    const gelesen = finanzEinstellung(neu);
    if (String(fin.sollzins ?? '').trim() && gelesen.sollzins === null) { setFehler('Sollzins bitte zwischen 0 und 25 % eintragen.'); return; }
    if (await schreiben({ [FINANZ_KEY]: gelesen }, 'Finanzierungsbeispiel gespeichert.')) setFin(null);
  }

  const vorschauPreis = 20000;
  const vorschau = beispiel(vorschauPreis, fe);
  const rPreis = leseZahl(rechner.preis);
  const rb = beispiel(rPreis, fe, { anzahlung: leseZahl(rechner.anzahlung), schluss: leseZahl(rechner.schluss), monate: leseZahl(rechner.monate) });
  const hinweise = einstellungHinweise(fe);

  return (
    <div style={{ display: 'grid', gap: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
      {fehler && <div style={k.fehler} role="alert">{fehler}</div>}
      {ok && <div style={k.ok}>{ok}</div>}

      {/* 1) Zusatzleistungen */}
      <div>
        <div style={k.zeile}><b>🧩 Zusatzleistungen zum Ankreuzen</b>{istChef && !ex && <button style={k.btn} onClick={() => setEx(extras.length ? extras.map((x) => ({ text: x.text, betrag: t(x.betrag) })) : [{ text: '', betrag: '' }])}>✎ Bearbeiten</button>}</div>
        {!ex ? (
          extras.length
            ? <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13.5 }}>{extras.map((x) => <li key={x.key}>{x.text} · {eur(x.betrag)}</li>)}</ul>
            : <div style={k.dim}>Noch keine. Beispiele: Winterräder auf Alufelge, Garantieverlängerung 24 Monate, Zulassungsservice, Überführung, Tankfüllung. Interessenten kreuzen sie in der Börse an; die Auswahl steht dann in der Anfrage.</div>
        ) : (
          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            {ex.map((z, i) => (
              <div key={i} style={k.zeile}>
                <input style={{ ...k.inp, flex: '1 1 240px' }} maxLength={80} placeholder="Leistung" value={z.text} onChange={(e) => setEx(ex.map((y, j) => j === i ? { ...y, text: e.target.value } : y))} />
                <input style={{ ...k.inp, width: 120 }} inputMode="decimal" placeholder="Preis brutto" value={z.betrag} onChange={(e) => setEx(ex.map((y, j) => j === i ? { ...y, betrag: e.target.value } : y))} />
                <button style={k.btn} onClick={() => setEx(ex.filter((_, j) => j !== i))}>Entfernen</button>
              </div>
            ))}
            <div style={k.zeile}>
              {ex.length < EXTRAS_MAX && <button style={k.btn} onClick={() => setEx([...ex, { text: '', betrag: '' }])}>+ Leistung</button>}
              <button style={k.gold} disabled={busy} onClick={() => void extrasSpeichern()}>Speichern</button>
              <button style={k.btn} onClick={() => setEx(null)}>Abbrechen</button>
            </div>
            <div style={k.dim}>Preise inklusive Umsatzsteuer. Ändern Sie den Text einer Leistung, gilt sie als neue Leistung.</div>
          </div>
        )}
      </div>

      {/* 2) Finanzierungsbeispiel */}
      <div>
        <div style={k.zeile}>
          <b>💳 Finanzierungsbeispiel im Inserat</b>
          <span style={{ ...k.pill, color: boerseBereit(fe) ? C.ok : C.dim }}>{boerseBereit(fe) ? 'wird angezeigt' : 'aus'}</span>
          {istChef && !fin && <button style={k.btn} onClick={() => setFin({ aktiv: fe.aktiv, bank: fe.bank ?? '', anschrift: fe.anschrift ?? '', sollzins: t(fe.sollzins), monate: String(fe.monate), anzahlungProzent: t(fe.anzahlungProzent), schlussProzent: t(fe.schlussProzent), hinweis: fe.hinweis ?? '', geprueft: !!fe.geprueftAm })}>✎ Bearbeiten</button>}
        </div>
        <div style={k.dim}>
          ARGONAUT vermittelt keine Kredite. Sie tragen die Konditionen Ihres Darlehensgebers ein; im Inserat erscheint dann ein Rechenbeispiel mit allen Pflichtangaben
          (Barzahlungspreis, Anzahlung, Nettodarlehensbetrag, Laufzeit, Sollzins, effektiver Jahreszins, Raten, Gesamtbetrag, Darlehensgeber). Der effektive Jahreszins wird aus den Raten
          berechnet (ohne Gebühren). Weicht das Beispiel Ihrer Bank ab, gelten deren Angaben — bitte dann hier anpassen.
        </div>
        {hinweise.length > 0 && !fin && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: C.warn }}>{hinweise.map((h) => <li key={h}>{h}</li>)}</ul>}
        {fin && (
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <label style={k.haken}><input type="checkbox" checked={fin.aktiv === true} onChange={(e) => setFin({ ...fin, aktiv: e.target.checked })} /> Im Inserat zeigen</label>
            <div style={k.raster}>
              <label style={k.lab}>Darlehensgeber (Bank)<input style={k.inp} maxLength={120} value={String(fin.bank)} onChange={(e) => setFin({ ...fin, bank: e.target.value })} /></label>
              <label style={k.lab}>Anschrift des Darlehensgebers<input style={k.inp} maxLength={200} value={String(fin.anschrift)} onChange={(e) => setFin({ ...fin, anschrift: e.target.value })} /></label>
              <label style={k.lab}>Gebundener Sollzins p. a. (%)<input style={k.inp} inputMode="decimal" value={String(fin.sollzins)} onChange={(e) => setFin({ ...fin, sollzins: e.target.value })} /></label>
              <label style={k.lab}>Laufzeit (Monate, 6–120)<input style={k.inp} inputMode="numeric" value={String(fin.monate)} onChange={(e) => setFin({ ...fin, monate: e.target.value })} /></label>
              <label style={k.lab}>Anzahlung (% vom Preis)<input style={k.inp} inputMode="decimal" value={String(fin.anzahlungProzent)} onChange={(e) => setFin({ ...fin, anzahlungProzent: e.target.value })} /></label>
              <label style={k.lab}>Schlussrate (% vom Preis, 0 = keine)<input style={k.inp} inputMode="decimal" value={String(fin.schlussProzent)} onChange={(e) => setFin({ ...fin, schlussProzent: e.target.value })} /></label>
            </div>
            <label style={k.lab}>Eigener Hinweis (optional, z. B. Ihre Rolle als Vermittler)<input style={k.inp} maxLength={300} value={String(fin.hinweis)} onChange={(e) => setFin({ ...fin, hinweis: e.target.value })} /></label>
            <label style={k.haken}><input type="checkbox" checked={fin.geprueft === true} onChange={(e) => setFin({ ...fin, geprueft: e.target.checked })} /> Ich bestätige: Die Konditionen stammen vom Darlehensgeber und gelten für dieses Beispiel.</label>
            <div style={k.zeile}><button style={k.gold} disabled={busy} onClick={() => void finSpeichern()}>Speichern</button><button style={k.btn} onClick={() => setFin(null)}>Abbrechen</button></div>
          </div>
        )}
        {vorschau && !fin && (
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13.5, color: C.gold }}>So sieht es bei einem Fahrzeug für {eur(vorschauPreis)} aus</summary>
            <Tabelle zeilen={pflichtZeilen(vorschau, fe)} />
          </details>
        )}
      </div>

      {/* 3) Rechner fürs Verkaufsgespräch */}
      {fe.sollzins !== null && (
        <div>
          <b>🧮 Rechner fürs Verkaufsgespräch</b>
          <div style={{ ...k.raster, marginTop: 6 }}>
            <label style={k.lab}>Fahrzeugpreis brutto<input style={k.inp} inputMode="decimal" value={rechner.preis} onChange={(e) => setRechner({ ...rechner, preis: e.target.value })} /></label>
            <label style={k.lab}>Anzahlung (leer = {t(fe.anzahlungProzent)} %)<input style={k.inp} inputMode="decimal" value={rechner.anzahlung} onChange={(e) => setRechner({ ...rechner, anzahlung: e.target.value })} /></label>
            <label style={k.lab}>Schlussrate (leer = {t(fe.schlussProzent)} %)<input style={k.inp} inputMode="decimal" value={rechner.schluss} onChange={(e) => setRechner({ ...rechner, schluss: e.target.value })} /></label>
            <label style={k.lab}>Laufzeit Monate (leer = {fe.monate})<input style={k.inp} inputMode="numeric" value={rechner.monate} onChange={(e) => setRechner({ ...rechner, monate: e.target.value })} /></label>
          </div>
          {rPreis !== null && !rb && <div style={{ ...k.dim, color: C.warn, marginTop: 6 }}>Mit diesen Werten bleibt nichts zu finanzieren oder die Schlussrate ist zu hoch.</div>}
          {rb && <Tabelle zeilen={pflichtZeilen(rb, fe)} />}
          <div style={{ ...k.dim, marginTop: 4 }}>{BEISPIEL_HINWEIS}</div>
        </div>
      )}
    </div>
  );
}

function Tabelle({ zeilen }: { zeilen: [string, string][] }) {
  return (
    <table style={{ width: '100%', maxWidth: 520, borderCollapse: 'collapse', marginTop: 6, fontSize: 13.5 }}><tbody>
      {zeilen.map(([a, b]) => <tr key={a}><td style={{ padding: '4px 8px 4px 0', color: C.dim, borderBottom: `1px solid ${C.border}` }}>{a}</td><td style={{ padding: '4px 0', textAlign: 'right', borderBottom: `1px solid ${C.border}`, fontVariantNumeric: 'tabular-nums' }}>{b}</td></tr>)}
    </tbody></table>
  );
}

const k: Record<string, CSSProperties> = {
  zeile: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  raster: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 },
  pill: { display: 'inline-block', border: '1px solid currentColor', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600 },
  dim: { color: C.dim, fontSize: 13, lineHeight: 1.5 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim },
  btn: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '7px 12px', fontWeight: 600, cursor: 'pointer' },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer' },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 13.5, minWidth: 0 },
  haken: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px' },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, borderRadius: 8, padding: '8px 12px' },
};
