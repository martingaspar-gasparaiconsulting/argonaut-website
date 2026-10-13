'use client';

// ============================================================
// ARGONAUT OS · Paket 354 (13.10.2026) · Dienstplan je Objekt
// Wochenansicht, Dienst planen (über Mitternacht möglich), Nachweis-Prüfung
// je Wachperson gegen die Vorgaben des Objekts. Fehlt ein Nachweis, ist das
// Einplanen nur mit ausdrücklicher Bestätigung möglich — der Vermerk bleibt
// am Dienst. Doppelt einplanen verhindert die Datenbank.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import {
  OBJEKT_ANFORDERUNGEN, nachweisFehlt, dienstZeit, dienstKonflikt, wochenMontag, wochenPlan, tagePlus, stundenJePerson,
  dienstplanHtml, uhrDe, datumDe, berlinTag, type Dienst, type Quali, type BetriebAngaben,
} from '@/lib/bewachung';
import { qualiLabel } from '@/lib/dispoPlus';
import { C, s, schreiben, zeige, firmaLaden, type Db, type Objekt, type Melde } from './bewachungUi';

export type Person = { id: string; name: string };
export type Vorgabe = { id: string; objekt_id: string; anforderungen: string[]; notiz: string | null };

const DIENST_FELDER = 'id, objekt_id, mitarbeiter_id, mitarbeiter_name, beginn, ende, aufgabe, notiz, status, trotz_warnung, warnung_text';

export default function Dienstplan({ supabase, objekt, personen, qualis, vorgabe, angaben, heute, istChef, melde, onVorgabe }: {
  supabase: Db; objekt: Objekt; personen: Person[]; qualis: Quali[]; vorgabe: Vorgabe | null; angaben: BetriebAngaben | null;
  heute: string; istChef: boolean; melde: Melde; onVorgabe: () => Promise<void>;
}) {
  const [montag, setMontag] = useState(wochenMontag(heute));
  const [dienste, setDienste] = useState<Dienst[]>([]);
  const [busy, setBusy] = useState(false);
  const [mitAbgesagten, setMitAbgesagten] = useState(false);
  const [neu, setNeu] = useState({ mitarbeiter_id: '', tag: heute, von: '18:00', bis: '06:00', aufgabe: '', notiz: '' });
  const [trotz, setTrotz] = useState(false);
  const anforderungen = vorgabe?.anforderungen ?? [];

  const lade = useCallback(async () => {
    const r = await supabase.from('wach_dienst').select(DIENST_FELDER)
      .gte('beginn', tagePlus(montag, -2) + 'T00:00:00Z').lt('beginn', tagePlus(montag, 9) + 'T00:00:00Z').order('beginn', { ascending: true }).limit(5000);
    setDienste(r.error ? [] : (((r.data as unknown) as Dienst[]) ?? []));
  }, [supabase, montag]);
  useEffect(() => { void lade(); }, [lade]);

  const hier = dienste.filter((d) => d.objekt_id === objekt.id);
  const plan = wochenPlan(hier, montag, mitAbgesagten);
  const zeit = dienstZeit(neu.tag, neu.von, neu.bis);
  const fehlt = neu.mitarbeiter_id ? nachweisFehlt(qualis, neu.mitarbeiter_id, anforderungen, neu.tag) : [];
  const konflikt = neu.mitarbeiter_id && zeit.ok ? dienstKonflikt(dienste, neu.mitarbeiter_id, zeit.beginn, zeit.ende) : null;

  async function planen() {
    if (!neu.mitarbeiter_id) { melde('Bitte eine Wachperson wählen.'); return; }
    if (!zeit.ok) { melde(zeit.fehler); return; }
    if (konflikt) { melde(`${konflikt.mitarbeiter_name ?? 'Diese Person'} ist zu der Zeit schon eingeplant (${datumDe(berlinTag(konflikt.beginn))} ${uhrDe(konflikt.beginn)}–${uhrDe(konflikt.ende)}).`); return; }
    if (fehlt.length && !trotz) { melde(`Es fehlt: ${fehlt.join(', ')}. Zum Einplanen bitte bestätigen, dass der Betrieb das verantwortet.`); return; }
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('wach_dienst').insert({
        objekt_id: objekt.id, mitarbeiter_id: neu.mitarbeiter_id, beginn: zeit.beginn, ende: zeit.ende,
        aufgabe: neu.aufgabe.trim() || null, notiz: neu.notiz.trim() || null,
        trotz_warnung: fehlt.length > 0, warnung_text: fehlt.length ? ('Fehlte beim Einplanen: ' + fehlt.join(', ')).slice(0, 500) : null,
      }).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      setTrotz(false); setNeu({ ...neu, aufgabe: '', notiz: '' });
      melde(null, `Dienst geplant: ${datumDe(neu.tag)} ${neu.von}–${neu.bis}${fehlt.length ? ' — mit Vermerk „Nachweis fehlte"' : ''}.`);
      await lade();
    } finally { setBusy(false); }
  }

  async function absagen(d: Dienst) {
    if (!window.confirm(`Dienst von ${d.mitarbeiter_name ?? '—'} am ${datumDe(berlinTag(d.beginn))} ${uhrDe(d.beginn)}–${uhrDe(d.ende)} absagen?`)) return;
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('wach_dienst').update({ status: 'abgesagt' }).eq('id', d.id).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, 'Dienst abgesagt — die Zeit ist wieder frei.'); await lade();
    } finally { setBusy(false); }
  }

  async function vorgabeSetzen(key: string, an: boolean) {
    const neuListe = an ? [...new Set([...anforderungen, key])] : anforderungen.filter((x) => x !== key);
    setBusy(true); melde(null);
    try {
      const r = vorgabe
        ? await schreiben(supabase.from('wach_objekt_vorgabe').update({ anforderungen: neuListe }).eq('id', vorgabe.id).select('id'))
        : await schreiben(supabase.from('wach_objekt_vorgabe').insert({ objekt_id: objekt.id, anforderungen: neuListe }).select('id'));
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, 'Vorgaben des Objekts gespeichert.'); await onVorgabe();
    } finally { setBusy(false); }
  }

  async function drucken() {
    const firma = await firmaLaden();
    if (!zeige(dienstplanHtml(objekt, montag, hier, firma, angaben))) melde('Das Druckfenster wurde blockiert — bitte Pop-ups für ARGONAUT erlauben.');
  }

  const stunden = stundenJePerson(plan.flatMap((t) => t.dienste));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={s.box}>
        <b style={{ color: C.gold }}>Vorgaben des Objekts · {objekt.bezeichnung ?? 'Objekt'}</b>
        <p style={s.klein}>
          Grundpflicht jeder Wachperson: Unterrichtung oder Sachkundeprüfung nach § 34a GewO und die Meldung im Bewacherregister — das prüft ARGONAUT
          immer. Verlangt dieses Objekt mehr (z. B. die Sachkundeprüfung statt der Unterrichtung), hier anhaken. Welche Tätigkeit was verlangt, entscheidet der Betrieb.
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13.5 }}>
          {OBJEKT_ANFORDERUNGEN.filter((k) => k !== 'unterrichtung_34a' && k !== 'bewacherregister').map((k) => (
            <label key={k}><input type="checkbox" disabled={busy} checked={anforderungen.includes(k)} onChange={(e) => void vorgabeSetzen(k, e.target.checked)} /> {qualiLabel(k)}</label>
          ))}
        </div>
      </div>

      <div style={s.box}>
        <b style={{ color: C.gold }}>Dienst planen</b>
        {!personen.length ? (
          <p style={s.hinweis}>Keine Wachpersonen sichtbar. Wachpersonen legt die Geschäftsleitung unter „Personal" an; planen kann, wer die Personalliste sehen darf.</p>
        ) : (<>
          <div style={{ ...s.raster, marginTop: 8 }}>
            <label style={s.feld}>Wachperson
              <select style={s.input} value={neu.mitarbeiter_id} onChange={(e) => { setNeu({ ...neu, mitarbeiter_id: e.target.value }); setTrotz(false); }}>
                <option value="">— wählen —</option>
                {personen.map((p) => <option key={p.id} value={p.id}>{p.name}{nachweisFehlt(qualis, p.id, anforderungen, neu.tag).length ? ' ⚠' : ''}</option>)}
              </select>
            </label>
            <label style={s.feld}>Tag<input style={s.input} type="date" value={neu.tag} onChange={(e) => setNeu({ ...neu, tag: e.target.value })} /></label>
            <label style={s.feld}>Von<input style={s.input} type="time" value={neu.von} onChange={(e) => setNeu({ ...neu, von: e.target.value })} /></label>
            <label style={s.feld}>Bis<input style={s.input} type="time" value={neu.bis} onChange={(e) => setNeu({ ...neu, bis: e.target.value })} /></label>
            <label style={s.feld}>Aufgabe (z. B. Objektschutz, Einlass, Streife)<input style={s.input} maxLength={120} value={neu.aufgabe} onChange={(e) => setNeu({ ...neu, aufgabe: e.target.value })} /></label>
            <label style={s.feld}>Notiz<input style={s.input} maxLength={300} value={neu.notiz} onChange={(e) => setNeu({ ...neu, notiz: e.target.value })} /></label>
          </div>
          <p style={s.klein}>{zeit.ok ? `${String(zeit.stunden).replace('.', ',')} Std.${neu.bis <= neu.von ? ' — endet am Folgetag' : ''}` : zeit.fehler}</p>
          {konflikt && <div style={s.fehler}>{konflikt.mitarbeiter_name ?? 'Diese Person'} ist zu der Zeit schon eingeplant ({datumDe(berlinTag(konflikt.beginn))} {uhrDe(konflikt.beginn)}–{uhrDe(konflikt.ende)}).</div>}
          {neu.mitarbeiter_id && !fehlt.length && <div style={s.ok}>Nachweise vollständig für dieses Objekt.</div>}
          {fehlt.length > 0 && (
            <div style={s.fehler}>
              <b>Es fehlt:</b> {fehlt.join(', ')}.
              <div style={{ marginTop: 6, fontSize: 13 }}>
                <label><input type="checkbox" checked={trotz} onChange={(e) => setTrotz(e.target.checked)} /> Trotzdem einplanen — der Betrieb verantwortet den Einsatz. Der Vermerk bleibt am Dienst.</label>
              </div>
            </div>
          )}
          <button style={{ ...s.btnGold, marginTop: 8 }} disabled={busy || !zeit.ok || !!konflikt || !neu.mitarbeiter_id} onClick={() => void planen()}>＋ Dienst planen</button>
        </>)}
      </div>

      <div style={s.box}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={s.mini} onClick={() => setMontag(tagePlus(montag, -7))}>◀</button>
          <b>Woche {datumDe(montag)} – {datumDe(tagePlus(montag, 6))}</b>
          <button style={s.mini} onClick={() => setMontag(tagePlus(montag, 7))}>▶</button>
          <button style={s.mini} onClick={() => setMontag(wochenMontag(heute))}>heute</button>
          <span style={{ flex: 1 }} />
          <label style={s.klein}><input type="checkbox" checked={mitAbgesagten} onChange={(e) => setMitAbgesagten(e.target.checked)} /> abgesagte zeigen</label>
          <button style={s.btnAus} onClick={() => void drucken()}>🖨 Dienstplan drucken</button>
        </div>
        <table style={{ ...s.tabelle, marginTop: 8 }}>
          <thead><tr><th style={s.th}>Tag</th><th style={s.th}>Zeit</th><th style={s.th}>Wachperson</th><th style={s.th}>Aufgabe</th><th style={s.th}></th></tr></thead>
          <tbody>
            {plan.map((t) => t.dienste.length ? t.dienste.map((d, i) => (
              <tr key={d.id} style={{ opacity: d.status === 'abgesagt' ? 0.45 : 1 }}>
                <td style={s.td}>{i === 0 ? `${t.name} ${datumDe(t.tag)}` : ''}</td>
                <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{uhrDe(d.beginn)}–{uhrDe(d.ende)}{berlinTag(d.ende) !== t.tag ? ' (+1)' : ''}</td>
                <td style={s.td}>{d.mitarbeiter_name ?? '—'}{d.trotz_warnung ? <div style={{ ...s.klein, color: C.bad }} title={d.warnung_text ?? ''}>⚠ trotz fehlendem Nachweis geplant</div> : null}</td>
                <td style={s.td}>{d.aufgabe ?? ''}{d.notiz ? <div style={s.klein}>{d.notiz}</div> : null}{d.status === 'abgesagt' ? <div style={s.klein}>abgesagt</div> : null}</td>
                <td style={s.td}>{d.status === 'geplant' && <button style={s.mini} disabled={busy} onClick={() => void absagen(d)}>absagen</button>}</td>
              </tr>
            )) : (
              <tr key={t.tag}><td style={s.td}>{t.name} {datumDe(t.tag)}</td><td style={{ ...s.td, color: C.dim }} colSpan={4}>—</td></tr>
            ))}
          </tbody>
        </table>
        {stunden.length > 0 && <p style={s.klein}>Stunden diese Woche: {stunden.map((x) => `${x.name} ${String(x.stunden).replace('.', ',')}`).join(' · ')}</p>}
        {!istChef && <p style={s.klein}>Absagen statt löschen — so bleibt nachvollziehbar, wer wann geplant war.</p>}
      </div>
    </div>
  );
}
