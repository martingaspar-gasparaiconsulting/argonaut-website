'use client';

// ============================================================
// ARGONAUT OS · Bündel 15 · Schnittstellen / Konnektoren (Dashboard)
// Pro Bereich (Kasse/TSE, Shop) den externen Anbieter wählen, Zugangsdaten
// eintragen und aktiv schalten. Läuft nichts Echtes -> Demo-/Manuell-Modus.
// Nur für den Chef sichtbar (enthält Geheimnisse).
// Pfad: app/dashboard/schnittstellen/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { KONNEKTOR_KATALOG, anbieterVon, type IntegrationTyp } from '@/lib/konnektoren';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Intg = { typ: string; anbieter: string; config: Record<string, string>; aktiv: boolean };

export default function SchnittstellenPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [intg, setIntg] = useState<Record<string, Intg>>({});
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const laden_ = useCallback(async () => {
    const { data } = await supabase.from('betrieb_integrationen').select('typ, anbieter, config, aktiv');
    const map: Record<string, Intg> = {};
    ((data as Intg[]) ?? []).forEach((r) => { map[r.typ] = { ...r, config: (r.config || {}) as Record<string, string> }; });
    setIntg(map);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id);
      await laden_();
      setLaden(false);
    })();
  }, [laden_]);

  function aktuell(typ: string): Intg {
    return intg[typ] || { typ, anbieter: KONNEKTOR_KATALOG.find((b) => b.typ === typ)?.anbieter[0].key || 'demo', config: {}, aktiv: false };
  }
  function setFeld(typ: string, patch: Partial<Intg>) {
    setIntg((m) => ({ ...m, [typ]: { ...aktuell(typ), ...patch } }));
  }
  function setConfig(typ: string, key: string, wert: string) {
    const a = aktuell(typ);
    setIntg((m) => ({ ...m, [typ]: { ...a, config: { ...a.config, [key]: wert } } }));
  }

  async function speichern(typ: IntegrationTyp) {
    if (!uid) return;
    const a = aktuell(typ);
    const anb = anbieterVon(typ, a.anbieter);
    const istDemo = !!anb?.demo;
    // Bei echtem Anbieter: Pflichtfelder prüfen, bevor "aktiv" erlaubt ist.
    if (a.aktiv && !istDemo) {
      const fehlt = (anb?.felder || []).filter((f) => !(a.config[f.key] || '').trim());
      if (fehlt.length) { setFehler(`Bitte alle Felder ausfüllen: ${fehlt.map((f) => f.label).join(', ')}`); return; }
    }
    setBusy(typ); setFehler(null); setOk(null);
    try {
      const { error } = await supabase.from('betrieb_integrationen')
        .upsert({
          owner_user_id: uid, typ, anbieter: a.anbieter, config: a.config,
          aktiv: istDemo ? false : a.aktiv, aktualisiert_am: new Date().toISOString(),
        }, { onConflict: 'owner_user_id,typ' });
      if (error) { setFehler('Speichern fehlgeschlagen.'); return; }
      await laden_();
      setOk(`„${KONNEKTOR_KATALOG.find((b) => b.typ === typ)?.name}" gespeichert.`);
    } finally { setBusy(null); }
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🔌 Schnittstellen</h1>
      <p style={styles.sub}>
        Hier verbinden Sie ARGONAUT mit externen Diensten. Solange kein echter Anbieter aktiv ist, läuft jedes Modul
        im <strong>Demo-/Manuell-Modus</strong> — voll nutzbar zum Testen. Zum Live-Schalten wählen Sie den Anbieter,
        tragen die Zugangsdaten ein und aktivieren ihn. <strong>Nur Sie als Inhaber</strong> sehen diese Daten.
      </p>

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {laden ? (
        <p style={styles.sub}>Lädt …</p>
      ) : (
        <div style={styles.grid}>
          {KONNEKTOR_KATALOG.map((b) => {
            const a = aktuell(b.typ);
            const anb = anbieterVon(b.typ, a.anbieter);
            const istDemo = !!anb?.demo;
            const live = a.aktiv && !istDemo;
            return (
              <div key={b.typ} style={styles.card}>
                <div style={styles.cardKopf}>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{b.icon} {b.name}</div>
                  <span style={{ ...styles.badge, color: live ? C.green : C.warn, borderColor: live ? C.green : C.warn }}>
                    {live ? '● Live' : '○ Demo-Modus'}
                  </span>
                </div>
                <p style={styles.beschr}>{b.beschreibung}</p>

                <label style={styles.lab}>Anbieter
                  <select style={styles.inp} value={a.anbieter}
                    onChange={(e) => setFeld(b.typ, { anbieter: e.target.value })}>
                    {b.anbieter.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                  </select>
                </label>

                {anb?.hinweis && <div style={styles.hinweis}>{anb.hinweis}</div>}

                {(anb?.felder || []).map((f) => (
                  <label key={f.key} style={styles.lab}>{f.label}
                    <input style={styles.inp} type={f.typ === 'password' ? 'password' : 'text'}
                      value={a.config[f.key] || ''} onChange={(e) => setConfig(b.typ, f.key, e.target.value)}
                      placeholder={f.hinweis || ''} autoComplete="off" />
                    {f.hinweis && <span style={styles.feldHinweis}>{f.hinweis}</span>}
                  </label>
                ))}

                {!istDemo && (
                  <label style={styles.check}>
                    <input type="checkbox" checked={a.aktiv} onChange={(e) => setFeld(b.typ, { aktiv: e.target.checked })} />
                    Anbieter aktiv schalten (live)
                  </label>
                )}

                <button style={{ ...styles.speichern, opacity: busy === b.typ ? 0.6 : 1 }} disabled={busy === b.typ} onClick={() => speichern(b.typ)}>
                  {busy === b.typ ? 'Speichert …' : '💾 Speichern'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={styles.disclaimer}>
        Sicherheitshinweis: Zugangsdaten werden verschlüsselt gespeichert und ausschließlich serverseitig für die
        jeweilige Schnittstelle verwendet — sie sind für Mitarbeiter nicht sichtbar. Zur TSE: Die technische
        Sicherheitseinrichtung muss gesetzlich (KassenSichV) von einem zertifizierten Anbieter stammen; ARGONAUT
        stellt die Kasse und bindet die zertifizierte TSE über diese Schnittstelle an.
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 940, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 760 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginTop: 18 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 },
  cardKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  beschr: { color: C.textDim, fontSize: 13.5, lineHeight: 1.5, margin: 0 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit' },
  hinweis: { background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 12.5, color: C.text, lineHeight: 1.5 },
  feldHinweis: { color: C.textDim, fontSize: 11.5 },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.text, cursor: 'pointer', marginTop: 2 },
  speichern: { marginTop: 4, background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 14 },
  disclaimer: { marginTop: 24, padding: '14px 16px', background: 'rgba(143,163,190,0.06)', border: `1px solid ${C.border}`, borderRadius: 12, color: C.textDim, fontSize: 12.5, lineHeight: 1.6 },
};
