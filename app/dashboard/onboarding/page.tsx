'use client';

// ============================================================
// ARGONAUT OS · Welle 5 · Schritt 3 — Onboarding-Checkliste
// Geführte Startstrecke für Neukunden. Die meisten Schritte werden automatisch
// erkannt (Firmendaten, IBAN, erste Rechnung …); der Rest ist manuell abhakbar.
// Pfad: app/dashboard/onboarding/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)',
};

type Lage = { firma: boolean; iban: boolean; kontakte: number; rechnungen: number; angebote: number; zahlungAktiv: boolean };
type Schritt = { key: string; icon: string; titel: string; text: string; link: string; auto: (l: Lage) => boolean; optional?: boolean };

const SCHRITTE: Schritt[] = [
  { key: 'firma', icon: '🏢', titel: 'Firmendaten hinterlegen', text: 'Name, Anschrift, Steuernummer/USt-IdNr — steht auf jeder Rechnung.', link: '/dashboard/einstellungen', auto: (l) => l.firma },
  { key: 'logo', icon: '🎨', titel: 'Logo & Farben', text: 'Corporate Design für PDFs, Angebote und das Kundenportal.', link: '/dashboard/einstellungen', auto: () => false },
  { key: 'bank', icon: '🏦', titel: 'Bankverbindung & SEPA', text: 'IBAN + Gläubiger-ID — für Rechnung, GiroCode und Lastschrift.', link: '/dashboard/sepa-einzug', auto: (l) => l.iban },
  { key: 'kontakt', icon: '🤝', titel: 'Ersten Kontakt anlegen', text: 'Kunde oder Firma im CRM erfassen.', link: '/dashboard/crm', auto: (l) => l.kontakte > 0 },
  { key: 'angebot', icon: '📝', titel: 'Erstes Angebot erstellen', text: 'Angebot mit Online-Zusage und „→ zur Unterschrift".', link: '/dashboard/angebote', auto: (l) => l.angebote > 0 },
  { key: 'rechnung', icon: '🧾', titel: 'Erste Rechnung erstellen', text: 'Mit GiroCode und optionalem Online-Bezahllink.', link: '/dashboard/rechnungen', auto: (l) => l.rechnungen > 0 },
  { key: 'zahlung', icon: '💳', titel: 'Zahlungsanbieter verbinden', text: 'Eigenen Bezahllink für „Jetzt online bezahlen" (optional).', link: '/dashboard/schnittstellen', auto: (l) => l.zahlungAktiv, optional: true },
  { key: 'module', icon: '🧩', titel: 'Module & Team einrichten', text: 'Passende Module aktivieren, Mitarbeiter einladen.', link: '/dashboard/einstellungen', auto: () => false },
];

export default function OnboardingPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [lage, setLage] = useState<Lage>({ firma: false, iban: false, kontakte: 0, rechnungen: 0, angebote: 0, zahlungAktiv: false });
  const [manuell, setManuell] = useState<Set<string>>(new Set());
  const [laden, setLaden] = useState(true);

  const laden_ = useCallback(async (id: string) => {
    const { data: p } = await supabase.from('profiles').select('firma_name, sepa_iban').eq('id', id).maybeSingle();
    const zaehle = async (tab: string) => {
      try { const { count } = await supabase.from(tab).select('*', { count: 'exact', head: true }); return count || 0; } catch { return 0; }
    };
    const [kontakte, rechnungen, angebote] = await Promise.all([zaehle('kontakte'), zaehle('rechnungen'), zaehle('angebote')]);
    let zahlungAktiv = false;
    try {
      const { data: zi } = await supabase.from('betrieb_integrationen').select('anbieter, aktiv').eq('typ', 'zahlung').maybeSingle();
      zahlungAktiv = !!zi && zi.aktiv === true && zi.anbieter !== 'kein';
    } catch { /* optional */ }
    setLage({ firma: !!(p?.firma_name && String(p.firma_name).trim()), iban: !!(p?.sepa_iban && String(p.sepa_iban).trim()), kontakte, rechnungen, angebote, zahlungAktiv });

    try {
      const { data: os } = await supabase.from('onboarding_schritte').select('schritt_key, erledigt');
      setManuell(new Set(((os as Array<{ schritt_key: string; erledigt: boolean }>) || []).filter((x) => x.erledigt).map((x) => x.schritt_key)));
    } catch { /* Tabelle evtl. noch nicht eingespielt */ }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setLaden(false); return; }
      setUid(id); await laden_(id); setLaden(false);
    })();
  }, [laden_]);

  function erledigt(s: Schritt) { return s.auto(lage) || manuell.has(s.key); }
  const fertig = SCHRITTE.filter(erledigt).length;
  const prozent = Math.round((fertig / SCHRITTE.length) * 100);

  async function toggle(s: Schritt) {
    if (!uid) return;
    const istManuell = manuell.has(s.key);
    if (istManuell) {
      await supabase.from('onboarding_schritte').delete().eq('owner_user_id', uid).eq('schritt_key', s.key);
      setManuell((m) => { const n = new Set(m); n.delete(s.key); return n; });
    } else {
      await supabase.from('onboarding_schritte').upsert({ owner_user_id: uid, schritt_key: s.key, erledigt: true, erledigt_am: new Date().toISOString() }, { onConflict: 'owner_user_id,schritt_key' });
      setManuell((m) => new Set(m).add(s.key));
    }
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🚀 Erste Schritte mit ARGONAUT</h1>
      <p style={styles.sub}>Deine geführte Startstrecke. Vieles erkennt ARGONAUT automatisch — den Rest hakst du selbst ab.</p>

      <div style={styles.fortschritt}>
        <div style={styles.balken}><div style={{ ...styles.balkenFill, width: `${prozent}%` }} /></div>
        <div style={styles.fortText}>{fertig} von {SCHRITTE.length} erledigt · <b style={{ color: prozent === 100 ? C.green : C.gold }}>{prozent}%</b></div>
      </div>

      {prozent === 100 && <div style={styles.fertigBox}>🎉 Stark — dein ARGONAUT ist startklar! Alle Grundschritte sind erledigt.</div>}

      {laden ? <p style={styles.dim}>Lädt …</p> : (
        <div style={styles.liste}>
          {SCHRITTE.map((s) => {
            const done = erledigt(s);
            const autoDone = s.auto(lage);
            return (
              <div key={s.key} style={{ ...styles.zeile, borderColor: done ? 'rgba(76,175,125,0.5)' : C.border }}>
                <div style={{ ...styles.check, background: done ? C.green : 'transparent', borderColor: done ? C.green : C.textDim }}>{done ? '✓' : ''}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{s.icon} {s.titel} {s.optional && <span style={styles.opt}>optional</span>}</div>
                  <div style={{ color: C.textDim, fontSize: 13 }}>{s.text}</div>
                </div>
                <a href={s.link} style={styles.oeffnen}>Öffnen ›</a>
                {autoDone
                  ? <span style={styles.autoBadge}>automatisch erkannt</span>
                  : <button style={styles.hakBtn} onClick={() => toggle(s)}>{manuell.has(s.key) ? 'Haken entfernen' : 'Als erledigt'}</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 760 },
  fortschritt: { marginTop: 18 },
  balken: { height: 12, background: 'rgba(143,163,190,0.15)', borderRadius: 999, overflow: 'hidden' },
  balkenFill: { height: '100%', background: `linear-gradient(90deg, ${C.gold}, ${C.green})`, borderRadius: 999, transition: 'width .3s' },
  fortText: { color: C.textDim, fontSize: 13, marginTop: 7 },
  fertigBox: { marginTop: 14, background: 'rgba(76,175,125,0.1)', border: `1px solid ${C.green}`, borderRadius: 12, padding: '13px 16px', color: C.text, fontSize: 15, fontWeight: 600 },
  liste: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 },
  zeile: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', background: C.navy2, border: '1px solid', borderRadius: 14, padding: '14px 16px' },
  check: { width: 26, height: 26, borderRadius: '50%', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.navy, fontWeight: 800, flexShrink: 0 },
  opt: { fontSize: 11, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 999, padding: '1px 8px', fontWeight: 600, marginLeft: 4 },
  oeffnen: { color: C.cyan, textDecoration: 'none', fontWeight: 700, fontSize: 13.5, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 13px', whiteSpace: 'nowrap' },
  autoBadge: { color: C.green, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  hakBtn: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 13px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  dim: { color: C.textDim, fontSize: 14, marginTop: 12 },
};
