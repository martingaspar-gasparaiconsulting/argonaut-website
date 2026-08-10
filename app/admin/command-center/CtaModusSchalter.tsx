'use client';
// ============================================================
// ARGONAUT OS · Command Center · CtaModusSchalter.tsx
// Live-Umschalter für die öffentlichen Knöpfe: „Termin vereinbaren" (Standard)
// ↔ „Sofort bestellen". Schreibt betreiber_flags.cta_modus über die Admin-Route.
// Kein Push nötig — wirkt sofort auf den Branchen-/Dossier-Seiten.
// ============================================================
import { useState } from 'react';

const C = {
  navy: '#0A1628', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', dim: 'rgba(255,255,255,0.55)', border: 'rgba(201,168,76,0.28)',
  card: 'rgba(201,168,76,0.06)',
};

type Modus = 'termin' | 'beide' | 'bestellen';

export default function CtaModusSchalter({ initial }: { initial: Modus }) {
  const [modus, setModus] = useState<Modus>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function setze(ziel: Modus) {
    if (ziel === modus || saving) return;
    if (ziel === 'bestellen' && !window.confirm('Öffentliche Knöpfe auf „Sofort bestellen" umstellen?\n\nInteressenten landen dann in der Bestellstrecke statt beim Termin. Du kannst jederzeit zurückschalten.')) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/cta-modus', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modus: ziel }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setMsg(j.error || 'Speichern fehlgeschlagen.'); }
      else { setModus(ziel); setMsg('Gespeichert — wirkt sofort auf den öffentlichen Seiten.'); }
    } catch {
      setMsg('Netzwerkfehler. Bitte erneut versuchen.');
    }
    setSaving(false);
  }

  const knopf = (ziel: Modus, icon: string, label: string, sub: string, farbe: string) => {
    const aktiv = modus === ziel;
    return (
      <button
        type="button" onClick={() => setze(ziel)} disabled={saving}
        style={{
          flex: 1, minWidth: 200, textAlign: 'left', cursor: saving ? 'default' : 'pointer',
          background: aktiv ? `${farbe}1f` : 'rgba(255,255,255,0.03)',
          border: `1.5px solid ${aktiv ? farbe : C.border}`, borderRadius: 14, padding: '14px 16px',
          color: C.text, fontFamily: 'inherit', opacity: saving && !aktiv ? 0.6 : 1,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>{icon}</span>
          <span style={{ fontWeight: 800, fontFamily: 'var(--font-syne), sans-serif', fontSize: 16 }}>{label}</span>
          {aktiv && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: farbe, border: `1px solid ${farbe}`, borderRadius: 999, padding: '2px 9px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Aktiv</span>}
        </span>
        <span style={{ display: 'block', color: C.dim, fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{sub}</span>
      </button>
    );
  };

  return (
    <section style={{ margin: '0 0 clamp(28px,4vw,48px)' }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 'clamp(16px,1.8vw,22px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 24 }}>🎚️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-syne), sans-serif', fontWeight: 800, fontSize: 'clamp(16px,1.6vw,20px)' }}>Öffentliche Knöpfe: Termin · Test · Bestellen</div>
            <div style={{ color: C.dim, fontSize: 'clamp(12px,1vw,14px)', marginTop: 3 }}>
              Steuert, welche Knöpfe die Branchen-/Dossier-Seiten zeigen. Standard: erst mal nur Termine sammeln.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {knopf('termin', '📅', 'Nur Termin', 'Nur „Termin vereinbaren" — Interessenten buchen ein Erstgespräch. Kein Kauf, du sammelst erst Erfahrung.', C.green)}
          {knopf('beide', '🔀', 'Termin + 7-Tage-Test', 'Beide Knöpfe nebeneinander: Erstgespräch UND „7 Tage kostenlos testen". So sortierst du heiße von vorsichtigen Interessenten.', C.cyan)}
          {knopf('bestellen', '🛒', 'Nur Bestellen', 'Knöpfe führen in die Bestellstrecke. Erst umlegen, wenn du bereit bist, öffentlich zu verkaufen.', C.gold)}
        </div>
        {msg && <div style={{ marginTop: 12, fontSize: 13, color: msg.startsWith('Gespeichert') ? C.green : '#E06666' }}>{msg}</div>}
      </div>
    </section>
  );
}
