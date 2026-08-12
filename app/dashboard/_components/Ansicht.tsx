'use client';

// ============================================================================
// ARGONAUT OS · _components/Ansicht.tsx — Fokus-/Detail-Umschalter (Client)
//
// Ein Baustein für die ganze App: useAnsicht() liest die aktuelle Ansicht
// (Einfach/Voll), <NurVoll> / <NurEinfach> blenden Experten-Blöcke ein/aus,
// <AnsichtSchalter/> ist der Schalter (kommt in die Einstellungen). Die Wahl
// liegt pro Browser in localStorage; Änderungen wirken sofort überall (Event).
// Muster: einmal gebaut, dann Modul für Modul mit <NurVoll> markieren.
// ============================================================================

import { useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import { type Ansicht, ANSICHT_KEY, ANSICHT_EVENT, ANSICHT_STANDARD, leseAnsicht } from '@/lib/ansicht';

/** Aktuelle Ansicht synchron lesen (SSR-sicher: Standard außerhalb des Browsers). */
export function aktuelleAnsicht(): Ansicht {
  if (typeof window === 'undefined') return ANSICHT_STANDARD;
  try { return leseAnsicht(window.localStorage.getItem(ANSICHT_KEY)); } catch { return ANSICHT_STANDARD; }
}

/** Ansicht setzen — speichert und benachrichtigt alle offenen Ansichten sofort. */
export function setzeAnsicht(v: Ansicht): void {
  try { window.localStorage.setItem(ANSICHT_KEY, v); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(ANSICHT_EVENT, { detail: v })); } catch { /* ignore */ }
}

/** Hook: liefert die aktuelle Ansicht und aktualisiert bei Änderung. */
export function useAnsicht(): Ansicht {
  // Start immer mit Standard, damit Server- und erste Client-Ausgabe gleich sind
  // (kein Hydration-Mismatch); echter Wert kommt im ersten Effect.
  const [a, setA] = useState<Ansicht>(ANSICHT_STANDARD);
  useEffect(() => {
    setA(aktuelleAnsicht());
    const beiWechsel = () => setA(aktuelleAnsicht());
    window.addEventListener(ANSICHT_EVENT, beiWechsel);
    window.addEventListener('storage', beiWechsel);
    return () => {
      window.removeEventListener(ANSICHT_EVENT, beiWechsel);
      window.removeEventListener('storage', beiWechsel);
    };
  }, []);
  return a;
}

/** Zeigt seine Kinder nur im Voll-Modus (Experten-/Detailfelder). */
export function NurVoll({ children }: { children: ReactNode }) {
  return useAnsicht() === 'voll' ? <>{children}</> : null;
}

/** Zeigt seine Kinder nur im Einfach-Modus. */
export function NurEinfach({ children }: { children: ReactNode }) {
  return useAnsicht() === 'einfach' ? <>{children}</> : null;
}

const C = {
  navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: 'rgba(255,255,255,0.6)', border: 'rgba(255,255,255,0.12)',
};

/** Der Umschalter für die Einstellungen — mit kleiner Live-Vorschau. */
export function AnsichtSchalter() {
  const a = useAnsicht();
  const seg = (wert: Ansicht, titel: string, unter: string): CSSProperties => ({
    flex: 1, textAlign: 'left', cursor: 'pointer', borderRadius: 10, padding: '12px 14px',
    border: `1px solid ${a === wert ? C.gold : C.border}`,
    background: a === wert ? 'rgba(201,168,76,0.14)' : 'rgba(10,22,40,0.4)',
    color: C.text, fontFamily: 'inherit',
  });
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setzeAnsicht('einfach')} style={seg('einfach', 'Einfach', '')}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>😊 Einfach {a === 'einfach' && <span style={{ color: C.gold }}>· aktiv</span>}</div>
          <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 3 }}>Nur das Nötigste — eine ruhige, klare Maske. Ideal zum Einstieg.</div>
        </button>
        <button type="button" onClick={() => setzeAnsicht('voll')} style={seg('voll', 'Voll', '')}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>🚀 Voll {a === 'voll' && <span style={{ color: C.gold }}>· aktiv</span>}</div>
          <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 3 }}>Alle Felder und Experten-Funktionen — das volle Potenzial.</div>
        </button>
      </div>

      {/* Live-Vorschau: zeigt sofort, was der Schalter bewirkt. */}
      <div style={{ marginTop: 14, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', background: 'rgba(10,22,40,0.4)' }}>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.textDim, fontWeight: 700, marginBottom: 8 }}>Vorschau</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
          <div>✓ Basis-Feld (immer sichtbar)</div>
          <div>✓ Basis-Feld (immer sichtbar)</div>
          <NurVoll>
            <div style={{ color: C.cyan }}>＋ Experten-Feld — nur im Voll-Modus</div>
            <div style={{ color: C.cyan }}>＋ Experten-Feld — nur im Voll-Modus</div>
          </NurVoll>
          <NurEinfach>
            <div style={{ color: C.textDim, fontStyle: 'italic' }}>… weitere Experten-Felder sind ausgeblendet (auf „Voll" schalten zum Anzeigen)</div>
          </NurEinfach>
        </div>
      </div>
    </div>
  );
}
