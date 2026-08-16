'use client';

// ============================================================================
// ARGONAUT OS · app/dashboard/finanzen/_components/UstErsatzSatz.tsx
//
// Der Umschalter fuer Zahlungen ohne Rechnungsbezug.
//
// WARUM ES DIESEN SCHALTER GIBT
// Wenn eine Zahlung keiner Rechnung zugeordnet ist, kennt niemand den
// Steuersatz. Das System kann ihn aus den bisherigen Rechnungen ABLEITEN —
// aber ein Landwirt hat 7 % auf Rohware und 19 % auf Verarbeitetes, ein
// Kleinunternehmer nach § 19 gar keine. Deshalb ist der abgeleitete Wert
// ein Vorschlag; entscheiden muss der Betrieb.
//
// WO ER STEHT
// Der Schalter selbst nur in der EUER — dort ist der Steuerbezug am
// deutlichsten. Die Wahl liegt in profiles und wirkt sofort auf BWA,
// Kennzahlen und Export mit. Die zeigen denselben Baustein ohne Schalter,
// damit dort wenigstens sichtbar ist, WOMIT gerechnet wurde.
//
// Logik: lib/zahlungAufteilung.ts (node-getestet).
// ============================================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  ermittleErsatzSatz, satzOptionen, hinweisText,
  type RechnungSummen, type ErsatzSatz, type ZahlungsSummen,
} from '@/lib/zahlungAufteilung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', warn: '#E0A24C',
};

type Props = {
  /** Die Rechnungen des Betriebs — Grundlage der Ableitung. */
  rechnungen: RechnungSummen[];
  /** Wird gerufen, sobald der geltende Satz feststeht oder sich ändert. */
  onSatz: (satz: number, ersatz: ErsatzSatz) => void;
  /** Summen des angezeigten Zeitraums — für den Hinweis. Optional. */
  summen?: ZahlungsSummen | null;
  /** true = mit Auswahlfeld (nur EÜR). false = nur Anzeige. */
  schalter?: boolean;
};

export default function UstErsatzSatz({ rechnungen, onSatz, summen, schalter = false }: Props) {
  const [wert, setWert] = useState<string>('');      // '' = automatisch
  const [geladen, setGeladen] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  // Gespeicherte Wahl holen.
  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u?.user) { setGeladen(true); return; }
        setUid(u.user.id);
        const { data } = await supabase
          .from('profiles').select('zahlung_ersatz_ust_satz').eq('id', u.user.id).maybeSingle();
        const gespeichert = (data as { zahlung_ersatz_ust_satz?: number | null } | null)?.zahlung_ersatz_ust_satz;
        setWert(gespeichert === null || gespeichert === undefined ? '' : String(gespeichert));
      } catch {
        // Spalte noch nicht eingespielt oder kein Profil — dann eben automatisch.
      }
      setGeladen(true);
    })();
  }, []);

  const ersatz = ermittleErsatzSatz(wert === '' ? null : wert, rechnungen);

  // Nach oben melden, sobald der Wert feststeht. `onSatz` bewusst nicht in
  // den Abhängigkeiten: die aufrufende Seite gibt oft eine frische Funktion
  // herein, das würde eine Endlosschleife auslösen.
  const melden = useCallback(() => {
    if (geladen) onSatz(ersatz.satz, ersatz);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geladen, ersatz.satz, ersatz.herkunft]);
  useEffect(() => { melden(); }, [melden]);

  const waehlen = async (neu: string) => {
    setWert(neu);
    if (!uid) return;
    setSpeichert(true);
    try {
      await supabase.from('profiles')
        .update({ zahlung_ersatz_ust_satz: neu === '' ? null : Number(neu) })
        .eq('id', uid);
    } catch { /* Anzeige stimmt trotzdem, nur nicht gespeichert */ }
    setSpeichert(false);
  };

  const hinweis = summen ? hinweisText(summen, ersatz) : '';
  if (!geladen) return null;
  if (!schalter && !hinweis) return null;   // nichts zu sagen, nichts anzeigen

  return (
    <div style={{ ...s.kasten, borderColor: hinweis ? C.warn : C.border }}>
      {schalter && (
        <div style={s.reihe}>
          <label style={{ flex: 1, minWidth: 240 }}>
            <span style={s.label}>Zahlungen ohne Rechnungsbezug rechnen mit</span>
            <select style={s.in} value={wert} onChange={(e) => waehlen(e.target.value)}>
              {satzOptionen(ermittleErsatzSatz(null, rechnungen)).map((o) => (
                <option key={o.wert} value={o.wert}>{o.label}</option>
              ))}
            </select>
          </label>
          {speichert && <span style={{ color: C.textDim, fontSize: 13 }}>speichert …</span>}
        </div>
      )}

      <p style={s.text}>
        {schalter ? ersatz.erklaerung : (
          <>Nicht zugeordnete Zahlungen werden {ersatz.satz > 0 ? `mit ${ersatz.satz} %` : 'ohne Umsatzsteuer'} gerechnet.</>
        )}
      </p>

      {hinweis && <p style={{ ...s.text, color: C.warn, marginTop: 6 }}>{hinweis}</p>}

      {schalter && (
        <p style={{ ...s.text, color: C.textDim, marginTop: 6 }}>
          Bei gemischten Steuersätzen — etwa 7 % auf unverarbeitete und 19 % auf verarbeitete
          Erzeugnisse — ist die Zuordnung der Zahlung zur jeweiligen Rechnung der genaue Weg.
          Diese Einstellung greift nur, wo diese Zuordnung fehlt.
        </p>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  kasten: {
    background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12,
    padding: '12px 16px', margin: '12px 0',
    color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
  },
  reihe: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' },
  label: { display: 'block', color: C.textDim, fontSize: 12.5, marginBottom: 4 },
  in: {
    background: C.navy, border: `1px solid ${C.border}`, borderRadius: 9,
    padding: '8px 12px', color: C.text, fontFamily: 'inherit', fontSize: 14,
    width: '100%', boxSizing: 'border-box',
  },
  text: { color: C.textDim, fontSize: 13.5, lineHeight: 1.5, margin: '8px 0 0' },
};
