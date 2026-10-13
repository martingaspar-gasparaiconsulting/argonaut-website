'use client';

// ============================================================
// ARGONAUT OS · Paket 353 (13.10.2026) · Nachweis für den Auftraggeber
// Kontrollgänge im Zeitraum (wann, wer, welche Punkte, was fehlte) und auf
// Wunsch das Wachbuch mit Nachträgen. Standortdaten stehen NICHT im Nachweis.
// ============================================================

import { useState } from 'react';
import { nachweisHtml, zeitraumPruefen, type Kontrollpunkt, type Rundgang, type Scan, type Eintrag } from '@/lib/bewachung';
import { C, s, firmaLaden, zeige, inStuecken, type Db, type Objekt, type Melde } from './bewachungUi';

function tagVerschieben(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function Nachweis({ supabase, objekt, punkte, heute, melde }: {
  supabase: Db; objekt: Objekt; punkte: Kontrollpunkt[]; heute: string; melde: Melde;
}) {
  const [von, setVon] = useState(tagVerschieben(heute, -6));
  const [bis, setBis] = useState(heute);
  const [mitWachbuch, setMitWachbuch] = useState(true);
  const [busy, setBusy] = useState(false);

  async function erstellen() {
    const z = zeitraumPruefen(von, bis);
    if (!z.ok) { melde(z.fehler); return; }
    setBusy(true); melde(null);
    try {
      // Einen Tag Puffer je Seite (Berliner Zeit vs. UTC) — die Druckansicht filtert genau nach Berliner Tag.
      const ab = tagVerschieben(von, -1) + 'T00:00:00Z';
      const bisZ = tagVerschieben(bis, 1) + 'T23:59:59Z';
      const r = await supabase.from('wach_rundgang').select('id, objekt_id, mitarbeiter_name, gestartet_am, beendet_am, status, notiz')
        .eq('objekt_id', objekt.id).gte('gestartet_am', ab).lte('gestartet_am', bisZ).order('gestartet_am', { ascending: true }).limit(5000);
      if (r.error) { melde('Die Rundgänge konnten nicht geladen werden (Recht „Bewachung"?).'); return; }
      const rundgaenge = ((r.data as unknown) as Rundgang[]) ?? [];
      const scans = await inStuecken<Scan & { rundgang_id: string }>(rundgaenge.map((x) => x.id),
        (teil) => supabase.from('wach_scan').select('rundgang_id, kontrollpunkt_id, gescannt_am').in('rundgang_id', teil).order('gescannt_am', { ascending: true }).limit(10000));
      if (!scans) { melde('Die Scans konnten nicht geladen werden.'); return; }
      let eintraege: Eintrag[] = [];
      if (mitWachbuch) {
        const e = await supabase.from('wachbuch_eintrag').select('id, objekt_id, art, text, ereignis_am, bezug_id, rundgang_id, erfasst_am, erfasst_name')
          .eq('objekt_id', objekt.id).gte('erfasst_am', ab).order('erfasst_am', { ascending: true }).limit(10000);
        if (e.error) { melde('Das Wachbuch konnte nicht geladen werden.'); return; }
        eintraege = ((e.data as unknown) as Eintrag[]) ?? [];
      }
      const firma = await firmaLaden();
      const html = nachweisHtml({ objekt, von, bis, erstellt: new Date().toISOString(), rundgaenge, punkte, scans, eintraege, mitWachbuch }, firma);
      if (!zeige(html)) { melde('Das Druckfenster wurde blockiert — bitte Pop-ups für ARGONAUT erlauben.'); return; }
      melde(null, `Nachweis geöffnet: ${rundgaenge.length} Rundgänge${firma?.name ? '' : ' — Ihre Firmendaten fehlen darin (Einstellungen → Firmendaten)'}.`);
    } finally { setBusy(false); }
  }

  return (
    <div style={s.box}>
      <b style={{ color: C.gold }}>Nachweis für den Auftraggeber · {objekt.bezeichnung ?? 'Objekt'}</b>
      <p style={s.klein}>
        Die Druckansicht listet jeden Kontrollgang im Zeitraum mit Beginn, Ende, Wachkraft, den gescannten Punkten mit Uhrzeit und den nicht erreichten
        Punkten — auf Wunsch mit dem Wachbuch und seinen Nachträgen. Standortdaten stehen nicht im Nachweis. Als PDF speichern Sie über „Drucken".
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={s.feld}>Von<input style={s.input} type="date" value={von} onChange={(e) => setVon(e.target.value)} /></label>
        <label style={s.feld}>Bis<input style={s.input} type="date" value={bis} onChange={(e) => setBis(e.target.value)} /></label>
        <label style={s.klein}><input type="checkbox" checked={mitWachbuch} onChange={(e) => setMitWachbuch(e.target.checked)} /> mit Wachbuch</label>
        <button style={s.btnGold} disabled={busy} onClick={() => void erstellen()}>🖨 Nachweis erstellen</button>
      </div>
      <p style={s.klein}>Höchstens drei Monate auf einmal.</p>
    </div>
  );
}
