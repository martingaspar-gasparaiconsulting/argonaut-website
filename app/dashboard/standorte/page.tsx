'use client';

// ============================================================
// ARGONAUT OS · G1 · Standorte & Filialen (Chef-Verwaltung)
// Der CHEF legt hier seine Standorte an: ein Hauptsitz + beliebig viele
// Filialen. Grundlage für Multistandort — G2 (Filialleiter-Rolle),
// G3 (Filial-Umschalter + Daten-Zuschnitt) und G4 (Filialvergleich)
// docken an den hier gepflegten Standorten an.
// Pfad: app/dashboard/standorte/page.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Standort = {
  id: string;
  name: string;
  ist_hauptsitz: boolean;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  aktiv: boolean;
};

type FormState = { name: string; strasse: string; plz: string; ort: string; telefon: string; ist_hauptsitz: boolean };
const LEER: FormState = { name: '', strasse: '', plz: '', ort: '', telefon: '', ist_hauptsitz: false };

function adresse(s: Standort) {
  const zeile = [s.strasse, [s.plz, s.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return zeile || '—';
}

export default function StandortePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [liste, setListe] = useState<Standort[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(LEER);
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [loeschId, setLoeschId] = useState<string | null>(null);

  const ladeListe = useCallback(async () => {
    const { data, error } = await supabase
      .from('standorte')
      .select('id, name, ist_hauptsitz, strasse, plz, ort, telefon, aktiv')
      .order('ist_hauptsitz', { ascending: false })
      .order('name', { ascending: true });
    if (error) { setFehler('Standorte konnten nicht geladen werden.'); return; }
    setListe((data as Standort[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      if (!id) { setFehler('Nicht angemeldet.'); setLaden(false); return; }
      setUid(id); await ladeListe(); setLaden(false);
    })();
  }, [ladeListe]);

  function setzeFeld<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function bearbeitenStart(s: Standort) {
    setBearbeitet(s.id);
    setForm({
      name: s.name ?? '', strasse: s.strasse ?? '', plz: s.plz ?? '',
      ort: s.ort ?? '', telefon: s.telefon ?? '', ist_hauptsitz: s.ist_hauptsitz,
    });
    setOk(null); setFehler(null); setLoeschId(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bearbeitenAbbrechen() { setBearbeitet(null); setForm(LEER); }

  async function speichern() {
    setOk(null); setFehler(null);
    const name = form.name.trim();
    if (!name) { setFehler('Bitte einen Namen für den Standort angeben.'); return; }
    if (!uid) { setFehler('Nicht angemeldet.'); return; }
    setSpeichert(true);

    // Nur EIN Hauptsitz: wird dieser Standort Hauptsitz, alle anderen zurücksetzen.
    if (form.ist_hauptsitz) {
      let q = supabase.from('standorte').update({ ist_hauptsitz: false }).eq('owner_user_id', uid);
      if (bearbeitet) q = q.neq('id', bearbeitet);
      const { error: e0 } = await q;
      if (e0) { setFehler('Hauptsitz konnte nicht aktualisiert werden.'); setSpeichert(false); return; }
    }

    const werte = {
      name,
      strasse: form.strasse.trim() || null,
      plz: form.plz.trim() || null,
      ort: form.ort.trim() || null,
      telefon: form.telefon.trim() || null,
      ist_hauptsitz: form.ist_hauptsitz,
    };

    if (bearbeitet) {
      const { error } = await supabase.from('standorte').update(werte).eq('id', bearbeitet);
      if (error) { setFehler('Konnte nicht gespeichert werden.'); setSpeichert(false); return; }
      setOk(`Standort „${name}" gespeichert.`);
    } else {
      const { error } = await supabase.from('standorte').insert({ ...werte, owner_user_id: uid, aktiv: true });
      if (error) { setFehler('Konnte nicht angelegt werden.'); setSpeichert(false); return; }
      setOk(`Standort „${name}" angelegt.`);
    }
    setForm(LEER); setBearbeitet(null); setSpeichert(false);
    await ladeListe();
  }

  async function aktivUmschalten(s: Standort) {
    setOk(null); setFehler(null);
    setListe((l) => l.map((x) => (x.id === s.id ? { ...x, aktiv: !x.aktiv } : x)));
    const { error } = await supabase.from('standorte').update({ aktiv: !s.aktiv }).eq('id', s.id);
    if (error) { setFehler('Konnte nicht geändert werden.'); await ladeListe(); }
  }

  async function alsHauptsitz(s: Standort) {
    if (!uid) return;
    setOk(null); setFehler(null);
    const { error: e0 } = await supabase.from('standorte')
      .update({ ist_hauptsitz: false }).eq('owner_user_id', uid).neq('id', s.id);
    if (e0) { setFehler('Konnte nicht geändert werden.'); return; }
    const { error } = await supabase.from('standorte').update({ ist_hauptsitz: true }).eq('id', s.id);
    if (error) { setFehler('Konnte nicht geändert werden.'); return; }
    setOk(`„${s.name}" ist jetzt der Hauptsitz.`);
    await ladeListe();
  }

  async function loeschen(s: Standort) {
    setOk(null); setFehler(null);
    const { error } = await supabase.from('standorte').delete().eq('id', s.id);
    if (error) { setFehler('Konnte nicht gelöscht werden.'); setLoeschId(null); return; }
    setLoeschId(null);
    if (bearbeitet === s.id) bearbeitenAbbrechen();
    setOk(`Standort „${s.name}" gelöscht.`);
    await ladeListe();
  }

  const zGesamt = liste.length;
  const zAktiv = liste.filter((s) => s.aktiv).length;
  const hatHauptsitz = liste.some((s) => s.ist_hauptsitz);

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>🏢 Standorte &amp; Filialen</h1>
      <p style={styles.sub}>
        Legen Sie hier Ihre Standorte an. Ein Standort ist Ihr Hauptsitz, jeder weitere ist eine Filiale.
        Auf diesen Standorten bauen später die Filial-Rollen, der Umschalter und die Auswertungen auf.
      </p>

      {!laden && (
        <div style={styles.kpiGrid}>
          <Kpi label="Standorte" value={String(zGesamt)} accent={C.cyan} />
          <Kpi label="Aktiv" value={String(zAktiv)} accent={C.green} />
          <Kpi label="Hauptsitz" value={hatHauptsitz ? 'gesetzt' : 'fehlt'} accent={hatHauptsitz ? C.gold : C.warn} />
        </div>
      )}

      {ok && <div style={styles.ok}>{ok}</div>}
      {fehler && <div style={styles.err}>{fehler}</div>}

      {/* Formular: anlegen / bearbeiten */}
      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>{bearbeitet ? 'Standort bearbeiten' : 'Neuen Standort anlegen'}</div>
        <div style={styles.formGrid}>
          <div style={{ gridColumn: '1 / -1' }}>
            <Feld label="Name *" value={form.name} onChange={(v) => setzeFeld('name', v)} placeholder="z. B. Hauptsitz München" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Feld label="Straße & Nr." value={form.strasse} onChange={(v) => setzeFeld('strasse', v)} placeholder="Musterstraße 1" />
          </div>
          <Feld label="PLZ" value={form.plz} onChange={(v) => setzeFeld('plz', v)} placeholder="80331" />
          <Feld label="Ort" value={form.ort} onChange={(v) => setzeFeld('ort', v)} placeholder="München" />
          <Feld label="Telefon" value={form.telefon} onChange={(v) => setzeFeld('telefon', v)} placeholder="089 123456" />
          <label style={styles.check}>
            <input type="checkbox" checked={form.ist_hauptsitz} onChange={(e) => setzeFeld('ist_hauptsitz', e.target.checked)} />
            <span>Als Hauptsitz festlegen</span>
          </label>
        </div>
        <div style={styles.formBtns}>
          <button style={{ ...styles.btnGold, opacity: speichert ? 0.6 : 1 }} disabled={speichert} onClick={speichern}>
            {speichert ? 'Speichert …' : bearbeitet ? 'Änderungen speichern' : '+ Standort anlegen'}
          </button>
          {bearbeitet && (
            <button style={styles.btnGhost} disabled={speichert} onClick={bearbeitenAbbrechen}>Abbrechen</button>
          )}
        </div>
      </div>

      {/* Liste */}
      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>Ihre Standorte</div>
        {laden ? <p style={styles.dim}>Lädt …</p> : liste.length === 0 ? (
          <p style={styles.dim}>Noch keine Standorte angelegt. Legen Sie oben Ihren Hauptsitz an.</p>
        ) : liste.map((s) => (
          <div key={s.id} style={{ ...styles.zeile, opacity: s.aktiv ? 1 : 0.55 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={styles.nameZeile}>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                {s.ist_hauptsitz && <span style={styles.badgeGold}>Hauptsitz</span>}
                {!s.aktiv && <span style={styles.badgeGrau}>inaktiv</span>}
              </div>
              <div style={{ fontSize: 13, color: C.textDim }}>{adresse(s)}{s.telefon ? ` · ☎ ${s.telefon}` : ''}</div>
            </div>
            <div style={styles.aktionen}>
              <button style={styles.btnMini} onClick={() => bearbeitenStart(s)}>Bearbeiten</button>
              {!s.ist_hauptsitz && <button style={styles.btnMini} onClick={() => alsHauptsitz(s)}>Als Hauptsitz</button>}
              <button style={styles.btnMini} onClick={() => aktivUmschalten(s)}>{s.aktiv ? 'Deaktivieren' : 'Aktivieren'}</button>
              {loeschId === s.id ? (
                <>
                  <button style={styles.btnDanger} onClick={() => loeschen(s)}>Wirklich löschen</button>
                  <button style={styles.btnMini} onClick={() => setLoeschId(null)}>Abbrechen</button>
                </>
              ) : (
                <button style={styles.btnMiniDanger} onClick={() => { setLoeschId(s.id); setOk(null); setFehler(null); }}>Löschen</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.hinweis}>
        ℹ️ Genau <b>ein Hauptsitz</b>: Legen Sie einen weiteren als Hauptsitz fest, wird der bisherige automatisch
        zur Filiale. Die Zuordnung von Mitarbeitern und der Umschalter zwischen Standorten folgen im nächsten Schritt.
      </div>
    </div>
  );
}

function Feld({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={styles.feld}>
      <span style={styles.feldLabel}>{label}</span>
      <input style={styles.input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={styles.kpiBox}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{ ...styles.kpiValue, color: accent || C.text }}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '8px 4px 60px', color: C.text, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' },
  h1: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 26, fontWeight: 800, margin: 0 },
  sub: { color: C.textDim, fontSize: 15, lineHeight: 1.5, margin: '8px 0 0', maxWidth: 640 },

  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 },
  kpiBox: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px' },
  kpiLabel: { fontSize: 12, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  kpiValue: { fontFamily: 'var(--font-syne), sans-serif', fontSize: 30, fontWeight: 800 },

  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
  feld: { display: 'flex', flexDirection: 'column', gap: 5 },
  feldLabel: { fontSize: 12, color: C.textDim, fontWeight: 600 },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.text, alignSelf: 'end', paddingBottom: 4 },
  formBtns: { display: 'flex', gap: 10, flexWrap: 'wrap' },

  btnGold: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer' },
  btnGhost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },

  zeile: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, paddingBottom: 10, flexWrap: 'wrap' },
  nameZeile: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  aktionen: { display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 },
  btnMini: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 11px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnMiniDanger: { background: C.navy, color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '7px 11px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnDanger: { background: C.danger, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 11px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },

  badgeGold: { background: `${C.gold}22`, color: C.gold, border: `1px solid ${C.gold}66`, borderRadius: 8, padding: '3px 9px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  badgeGrau: { background: 'rgba(143,163,190,0.14)', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '3px 9px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },

  hinweis: { marginTop: 14, fontSize: 13, color: C.textDim, background: 'rgba(0,229,255,0.06)', border: `1px solid rgba(0,229,255,0.2)`, borderRadius: 10, padding: '12px 14px', lineHeight: 1.6 },
  dim: { color: C.textDim, fontSize: 14, marginTop: 8 },
  ok: { color: C.green, background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
  err: { color: C.danger, background: 'rgba(224,102,102,0.1)', border: '1px solid rgba(224,102,102,0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: 14 },
};
