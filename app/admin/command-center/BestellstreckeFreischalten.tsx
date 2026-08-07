'use client';

import { useState } from 'react';

// ============================================================================
// ARGONAUT OS · Command Center · BestellstreckeFreischalten.tsx
// Erinnerungs-/Freischalt-Kachel für die Bestellstrecke. Aufklappbare Checkliste
// mit Haken (nur lokal, deine Merkhilfe). Der eigentliche Schalter bleibt
// lib/flags.ts BESTELLSTRECKE_LIVE — wird gemeinsam umgelegt, wenn alles passt.
// Wird nur angezeigt, solange die Strecke dunkel ist (Gate in der CC-Seite).
// ============================================================================

const C = {
  navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', dim: 'rgba(255,255,255,0.55)', border: 'rgba(201,168,76,0.28)',
  card: 'rgba(201,168,76,0.06)',
};

const SCHRITTE: { titel: string; detail: string }[] = [
  { titel: '/buchen komplett durchgeklickt', detail: 'Alle 8 Schritte geprüft: Paket/Preis, Laufzeit-Rabatt, AGB/AVV und die SEPA-Maske stimmen.' },
  { titel: 'Rechtlich abgesegnet', detail: 'Button-Lösung „zahlungspflichtig bestellen", Widerrufsbelehrung und AGB sitzen — im Zweifel vom Anwalt bestätigt.' },
  { titel: 'Geldfluss verstanden', detail: 'Noch kein automatischer SEPA-Einzug: Bestellungen kommen als Mandat + Order rein (Mail an info@ + Tabelle oeffentliche_bestellungen). Einzug später scharf (Gläubiger-ID + SEPA-Env-Vars).' },
  { titel: 'Dein persönliches Go erreicht', detail: 'Genug Kunden/Gespräche geführt, Rechnungen laufen, Schuldenfrei-Ziel erreicht — du bist bereit, öffentlich zu verkaufen.' },
];

export default function BestellstreckeFreischalten() {
  const [offen, setOffen] = useState(false);
  const [haken, setHaken] = useState<boolean[]>(SCHRITTE.map(() => false));
  const anzahl = haken.filter(Boolean).length;
  const alle = anzahl === SCHRITTE.length;

  const toggle = (i: number) => setHaken((alt) => alt.map((h, k) => (k === i ? !h : h)));

  return (
    <section style={{ margin: '0 0 clamp(28px,4vw,48px)' }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
        {/* Kopf / Auslöser */}
        <button
          type="button"
          onClick={() => setOffen((o) => !o)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 'clamp(16px,1.8vw,22px)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: C.text, fontFamily: 'inherit' }}
        >
          <span style={{ fontSize: 26, lineHeight: 1 }}>🚀</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 'clamp(16px,1.6vw,20px)' }}>
              Bestellstrecke freischalten
            </span>
            <span style={{ display: 'block', color: C.dim, fontSize: 'clamp(12px,1vw,14px)', marginTop: 3 }}>
              Fertig gebaut, aber noch dunkel. Öffne die Checkliste, wenn du bereit bist, öffentlich zu verkaufen.
            </span>
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 999, padding: '3px 10px', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            🔒 dunkel
          </span>
          <span style={{ color: C.dim, fontSize: 20, transform: offen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>⌄</span>
        </button>

        {/* Checkliste */}
        {offen && (
          <div style={{ padding: '0 clamp(16px,1.8vw,22px) clamp(16px,1.8vw,22px)', borderTop: `1px solid ${C.border}` }}>
            <div style={{ color: C.dim, fontSize: 13, margin: '14px 0 12px' }}>
              Deine Checkliste vor dem Scharfstellen ({anzahl}/{SCHRITTE.length}):
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {SCHRITTE.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggle(i)}
                  style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', background: haken[i] ? 'rgba(76,175,125,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${haken[i] ? 'rgba(76,175,125,0.4)' : C.border}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', color: C.text, fontFamily: 'inherit' }}
                >
                  <span style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${haken[i] ? C.green : C.dim}`, background: haken[i] ? C.green : 'transparent', color: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, flexShrink: 0, marginTop: 1 }}>
                    {haken[i] ? '✓' : ''}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5 }}>{s.titel}</span>
                    <span style={{ display: 'block', color: C.dim, fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>{s.detail}</span>
                  </span>
                </button>
              ))}
            </div>

            {/* Abschluss */}
            <div style={{ marginTop: 16, borderRadius: 12, padding: '14px 16px', background: alle ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${alle ? C.gold : C.border}` }}>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-syne), sans-serif', fontSize: 15, color: alle ? C.gold : C.text }}>
                {alle ? '✅ Alles abgehakt — bereit zum Scharfstellen' : 'Wenn alle Haken sitzen:'}
              </div>
              <div style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.6, marginTop: 6 }}>
                Sag mir einfach <b style={{ color: C.text }}>„go Bestellstrecke"</b>. Dann lege ich den Schalter um
                (<code style={{ color: C.gold }}>BESTELLSTRECKE_LIVE = true</code>) und setze den öffentlichen
                „Jetzt buchen"-Link — ein Push, und du bist live. Nichts wird automatisch abgebucht; es kommen nur
                Bestellungen + SEPA-Mandate rein, die du dann bearbeitest.
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
