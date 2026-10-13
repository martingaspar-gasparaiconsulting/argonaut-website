'use client';

// ============================================================
// ARGONAUT OS · Paket 354 (13.10.2026) · Betrieb & Nachweise
// Pflichtangaben des Betriebs (Erlaubnis nach § 34a GewO, Registriernummer
// im Bewacherregister) und die Nachweise der Wachpersonen (Unterrichtung,
// Sachkunde, Bewacher-ID) — gespeichert in mitarbeiter_qualifikation, also
// dieselben Einträge wie unter Dispo → Qualifikationen.
// ARGONAUT meldet nichts ans Bewacherregister — das bleibt beim Betrieb.
// ============================================================

import { useState, useEffect } from 'react';
import { angabenPruefen, angabenVollstaendig, nachweisStand, EINSTELLUNG_MODUL, type BetriebAngaben, type Quali } from '@/lib/bewachung';
import { qualiLabel, qualiAmpel } from '@/lib/dispoPlus';
import { C, s, Feld, schreiben, type Db, type Melde } from './bewachungUi';
import type { Person } from './Dienstplan';

const ARTEN = ['unterrichtung_34a', 'sachkunde_34a', 'bewacherregister'] as const;
const AMPEL: Record<string, string> = { gruen: C.ok, gelb: C.warn, rot: C.bad, unbefristet: C.ok };

export default function BetriebNachweise({ supabase, ich, istChef, angaben, personen, qualis, heute, melde, onGeaendert }: {
  supabase: Db; ich: string | null; istChef: boolean; angaben: BetriebAngaben; personen: Person[]; qualis: (Quali & { id?: string })[];
  heute: string; melde: Melde; onGeaendert: () => Promise<void>;
}) {
  const [a, setA] = useState<BetriebAngaben>(angaben);
  const [n, setN] = useState({ mitarbeiter_id: '', art: 'unterrichtung_34a', gueltig_bis: '', nachweis: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setA(angaben); }, [angaben]);

  async function angabenSpeichern() {
    const p = angabenPruefen(a, heute);
    if (!p.ok) { melde(p.fehler.join(' ')); return; }
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('modul_einstellung').upsert({
        owner_user_id: ich, modul: EINSTELLUNG_MODUL, aktualisiert_am: new Date().toISOString(),
        einstellung: { erlaubnis_nr: a.erlaubnis_nr.trim(), erlaubnis_behoerde: a.erlaubnis_behoerde.trim(), erlaubnis_datum: a.erlaubnis_datum, register_nr: a.register_nr.trim() },
      }, { onConflict: 'owner_user_id,modul' }).select('id'), 'Nicht gespeichert — die Pflichtangaben trägt die Geschäftsleitung ein.');
      if (!r.ok) { melde(r.fehler); return; }
      melde(null, 'Pflichtangaben gespeichert — sie stehen jetzt auf Dienstplan und Nachweis.'); await onGeaendert();
    } finally { setBusy(false); }
  }

  async function nachweisSpeichern() {
    if (!n.mitarbeiter_id) { melde('Bitte eine Wachperson wählen.'); return; }
    if (n.gueltig_bis && !/^\d{4}-\d{2}-\d{2}$/.test(n.gueltig_bis)) { melde('Gültig bis: bitte ein Datum wählen oder leer lassen.'); return; }
    if (n.art === 'bewacherregister' && !n.nachweis.trim()) { melde('Bitte die Bewacher-ID aus dem Bewacherregister eintragen.'); return; }
    if (n.nachweis.trim().length > 200) { melde('Nachweis: höchstens 200 Zeichen.'); return; }
    setBusy(true); melde(null);
    try {
      const r = await schreiben(supabase.from('mitarbeiter_qualifikation').upsert({
        owner_user_id: ich, mitarbeiter_id: n.mitarbeiter_id, art: n.art, gueltig_bis: n.gueltig_bis || null, nachweis: n.nachweis.trim() || null,
      }, { onConflict: 'mitarbeiter_id,art' }).select('id'), 'Nicht gespeichert — Nachweise trägt die Geschäftsleitung ein.');
      if (!r.ok) { melde(r.fehler); return; }
      setN({ ...n, gueltig_bis: '', nachweis: '' });
      melde(null, `${qualiLabel(n.art)} gespeichert.`); await onGeaendert();
    } finally { setBusy(false); }
  }

  const eintrag = (pid: string, art: string) => qualis.find((q) => q.mitarbeiter_id === pid && q.art === art);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ ...s.box, borderColor: angabenVollstaendig(angaben) ? C.border : C.bad }}>
        <b style={{ color: C.gold }}>Pflichtangaben des Betriebs</b>
        <p style={s.klein}>
          Erlaubnis nach § 34a GewO und die Registriernummer Ihres Betriebs im Bewacherregister. Beides steht auf Dienstplan und Nachweis für den
          Auftraggeber. Meldungen ans Bewacherregister (neue Wachpersonen, Abmeldungen) machen Sie dort selbst — ARGONAUT meldet nichts.
        </p>
        <div style={s.raster}>
          <Feld label="Erlaubnis § 34a GewO — Nummer / Aktenzeichen *" w={a.erlaubnis_nr} max={80} on={(x) => setA({ ...a, erlaubnis_nr: x })} />
          <Feld label="Erteilt von (Behörde)" w={a.erlaubnis_behoerde} max={160} on={(x) => setA({ ...a, erlaubnis_behoerde: x })} />
          <Feld label="Erteilt am" typ="date" w={a.erlaubnis_datum} on={(x) => setA({ ...a, erlaubnis_datum: x })} />
          <Feld label="Registriernummer Bewacherregister *" w={a.register_nr} max={80} on={(x) => setA({ ...a, register_nr: x })} />
        </div>
        {istChef
          ? <button style={{ ...s.btnGold, marginTop: 8 }} disabled={busy} onClick={() => void angabenSpeichern()}>Pflichtangaben speichern</button>
          : <p style={s.klein}>Eintragen kann nur die Geschäftsleitung.</p>}
      </div>

      <div style={s.box}>
        <b style={{ color: C.gold }}>Nachweise der Wachpersonen</b>
        <p style={s.klein}>
          Jede Wachperson braucht die Unterrichtung oder die Sachkundeprüfung nach § 34a GewO und eine Bewacher-ID aus dem Bewacherregister.
          Fehlt etwas, warnt der Dienstplan beim Einplanen. Dieselben Einträge stehen auch unter Dispo → Qualifikationen.
        </p>
        {!personen.length ? <p style={s.hinweis}>Keine Wachpersonen sichtbar — die Personalliste sieht nur, wer das Recht dazu hat.</p> : (
          <table style={{ ...s.tabelle, marginTop: 6 }}>
            <thead><tr><th style={s.th}>Wachperson</th>{ARTEN.map((k) => <th key={k} style={s.th}>{qualiLabel(k)}</th>)}<th style={s.th}>Stand</th></tr></thead>
            <tbody>
              {personen.map((p) => {
                const st = nachweisStand(qualis, p.id, heute);
                return (
                  <tr key={p.id}>
                    <td style={s.td}>{p.name}</td>
                    {ARTEN.map((k) => {
                      const q = eintrag(p.id, k);
                      if (!q) return <td key={k} style={{ ...s.td, color: C.dim }}>—</td>;
                      const amp = qualiAmpel(q.gueltig_bis, heute);
                      return (
                        <td key={k} style={s.td}>
                          <span style={{ color: AMPEL[amp] }}>●</span> {k === 'bewacherregister' ? (q.nachweis ?? 'ohne ID') : q.gueltig_bis ? `bis ${q.gueltig_bis.split('-').reverse().join('.')}` : 'vorhanden'}
                        </td>
                      );
                    })}
                    <td style={s.td}>{st.ok ? <span style={{ color: C.ok }}>vollständig</span> : <span style={{ color: C.bad }}>fehlt: {st.fehlt.join(', ')}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {istChef && personen.length > 0 && (<>
          <h3 style={s.h3}>Nachweis eintragen oder ändern</h3>
          <div style={s.raster}>
            <label style={s.feld}>Wachperson
              <select style={s.input} value={n.mitarbeiter_id} onChange={(e) => setN({ ...n, mitarbeiter_id: e.target.value })}>
                <option value="">— wählen —</option>{personen.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label style={s.feld}>Nachweis
              <select style={s.input} value={n.art} onChange={(e) => setN({ ...n, art: e.target.value })}>
                {ARTEN.map((k) => <option key={k} value={k}>{qualiLabel(k)}</option>)}
              </select>
            </label>
            <Feld label={n.art === 'bewacherregister' ? 'Bewacher-ID *' : 'Bescheinigung (z. B. IHK-Nummer)'} w={n.nachweis} max={200} on={(x) => setN({ ...n, nachweis: x })} />
            <Feld label="Gültig bis (leer = unbefristet)" typ="date" w={n.gueltig_bis} on={(x) => setN({ ...n, gueltig_bis: x })} />
          </div>
          <button style={{ ...s.btnGold, marginTop: 8 }} disabled={busy} onClick={() => void nachweisSpeichern()}>Nachweis speichern</button>
        </>)}
      </div>
    </div>
  );
}
