'use client';

// ============================================================
// ARGONAUT OS · Schnittstellen-Zentrale (Dashboard)
// EINE Übersicht für ALLE externen Anbindungen — nach Kategorie gruppiert,
// „X von Y aktiv"-Überblick, pro Anbieter eine ①②③-Anleitung.
//   · inline  → Anbieter wählen, Zugangsdaten eintragen, aktiv schalten
//   · verweis → Anleitung + „→ hier einrichten"-Sprung (wird später hereingezogen)
//   · geplant → Anbindung vorgesehen, Feld folgt
// Nur für den Chef sichtbar (enthält Geheimnisse).
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  KONNEKTOR_KATALOG, KATEGORIEN, bereicheNachKategorie, anbieterVon, istInline,
  type IntegrationTyp, type KonnektorBereich,
} from '@/lib/konnektoren';

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
    const b = KONNEKTOR_KATALOG.find((x) => x.typ === typ);
    return intg[typ] || { typ, anbieter: b?.anbieter[0]?.key || 'demo', config: {}, aktiv: false };
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

  // Überblick: wie viele echte Anbieter sind aktiv?
  const inlineBereiche = KONNEKTOR_KATALOG.filter(istInline);
  const aktivAnzahl = inlineBereiche.filter((b) => {
    const a = aktuell(b.typ);
    return a.aktiv && !anbieterVon(b.typ, a.anbieter)?.demo;
  }).length;
  const gesamt = KONNEKTOR_KATALOG.length;
  const prozent = Math.round((aktivAnzahl / Math.max(1, gesamt)) * 100);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🔌 Schnittstellen-Zentrale</h1>
      <p style={styles.sub}>
        Alle externen Dienste an einem Ort. Solange kein echter Anbieter aktiv ist, läuft jedes Modul im
        <strong> Demo-/Manuell-Modus</strong> — voll nutzbar. Zum Live-Schalten: Anbieter wählen, Zugangsdaten eintragen,
        aktivieren. <strong>Nur Sie als Inhaber</strong> sehen diese Daten.
      </p>

      {/* Überblick */}
      {!laden && (
        <div style={styles.ueberblick}>
          <div style={styles.ueberblickKopf}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>Verbindungs-Überblick</span>
            <span style={{ color: aktivAnzahl > 0 ? C.green : C.textDim, fontWeight: 800 }}>{aktivAnzahl} von {gesamt} aktiv</span>
          </div>
          <div style={styles.bar}><div style={{ ...styles.barFill, width: `${prozent}%` }} /></div>
        </div>
      )}

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {laden ? (
        <p style={styles.sub}>Lädt …</p>
      ) : (
        KATEGORIEN.map((kat) => (
          <section key={kat.id} style={{ marginTop: 26 }}>
            <h2 style={styles.h2}>{kat.icon} {kat.name}</h2>
            <div style={styles.grid}>
              {bereicheNachKategorie(kat.id).map((b) => (
                <BereichKarte
                  key={b.typ}
                  b={b}
                  a={aktuell(b.typ)}
                  busy={busy === b.typ}
                  onAnbieter={(v) => setFeld(b.typ, { anbieter: v })}
                  onConfig={(k, v) => setConfig(b.typ, k, v)}
                  onAktiv={(v) => setFeld(b.typ, { aktiv: v })}
                  onSpeichern={() => speichern(b.typ)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <div style={styles.disclaimer}>
        Sicherheitshinweis: Zugangsdaten werden ausschließlich serverseitig für die jeweilige Schnittstelle verwendet und
        sind für Mitarbeiter nicht sichtbar. Die verschlüsselte Ablage und das direkte Befüllen der noch als „→ einrichten"
        verlinkten Dienste werden in den nächsten Schritten in diese Zentrale hereingezogen.
      </div>
    </div>
  );
}

function BereichKarte({
  b, a, busy, onAnbieter, onConfig, onAktiv, onSpeichern,
}: {
  b: KonnektorBereich; a: Intg; busy: boolean;
  onAnbieter: (v: string) => void; onConfig: (k: string, v: string) => void;
  onAktiv: (v: boolean) => void; onSpeichern: () => void;
}) {
  const anb = anbieterVon(b.typ, a.anbieter);
  const istDemo = !!anb?.demo;
  const live = istInline(b) && a.aktiv && !istDemo;

  const badge = b.einrichten.modus === 'verweis'
    ? { text: '↗ separat', farbe: C.cyan }
    : b.einrichten.modus === 'geplant'
      ? { text: '○ bald', farbe: C.textDim }
      : live ? { text: '● Live', farbe: C.green } : { text: '○ Demo-Modus', farbe: C.warn };

  return (
    <div style={styles.card}>
      <div style={styles.cardKopf}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{b.icon} {b.name}</div>
        <span style={{ ...styles.badge, color: badge.farbe, borderColor: badge.farbe }}>{badge.text}</span>
      </div>
      <p style={styles.beschr}>{b.beschreibung}</p>

      {b.einrichten.modus === 'inline' && (
        <>
          <label style={styles.lab}>Anbieter
            <select style={styles.inp} value={a.anbieter} onChange={(e) => onAnbieter(e.target.value)}>
              {b.anbieter.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
            </select>
          </label>
          {anb?.hinweis && <div style={styles.hinweis}>{anb.hinweis}</div>}
          {(anb?.felder || []).map((f) => (
            <label key={f.key} style={styles.lab}>{f.label}
              <input style={styles.inp} type={f.typ === 'password' ? 'password' : 'text'}
                value={a.config[f.key] || ''} onChange={(e) => onConfig(f.key, e.target.value)}
                placeholder={f.hinweis || ''} autoComplete="off" />
              {f.hinweis && <span style={styles.feldHinweis}>{f.hinweis}</span>}
            </label>
          ))}
          {!istDemo && (
            <label style={styles.check}>
              <input type="checkbox" checked={a.aktiv} onChange={(e) => onAktiv(e.target.checked)} />
              Anbieter aktiv schalten (live)
            </label>
          )}
          <button style={{ ...styles.speichern, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={onSpeichern}>
            {busy ? 'Speichert …' : '💾 Speichern'}
          </button>
        </>
      )}

      {b.einrichten.modus === 'verweis' && (
        <>
          <div style={styles.anleitung}>{b.einrichten.anleitung}</div>
          <a href={b.einrichten.link} style={styles.verweisBtn}>→ Hier einrichten</a>
        </>
      )}

      {b.einrichten.modus === 'geplant' && b.einrichten.anleitung && (
        <div style={styles.anleitung}>{b.einrichten.anleitung}</div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  h2: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 18, fontWeight: 700, margin: '0 0 12px' },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 760 },
  ueberblick: { marginTop: 18, background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 18px' },
  ueberblickKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  bar: { height: 10, borderRadius: 999, background: 'rgba(143,163,190,0.15)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${C.green}, ${C.cyan})`, transition: 'width .3s' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 },
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 },
  cardKopf: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  badge: { display: 'inline-block', border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  beschr: { color: C.textDim, fontSize: 13.5, lineHeight: 1.5, margin: 0 },
  lab: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: C.textDim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit' },
  hinweis: { background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 12.5, color: C.text, lineHeight: 1.5 },
  feldHinweis: { color: C.textDim, fontSize: 11.5 },
  anleitung: { background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 12.5, color: C.text, lineHeight: 1.55 },
  verweisBtn: { display: 'inline-block', textAlign: 'center', background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, textDecoration: 'none', marginTop: 2 },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.text, cursor: 'pointer', marginTop: 2 },
  speichern: { marginTop: 4, background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 14 },
  disclaimer: { marginTop: 28, padding: '14px 16px', background: 'rgba(143,163,190,0.06)', border: `1px solid ${C.border}`, borderRadius: 12, color: C.textDim, fontSize: 12.5, lineHeight: 1.6 },
};
