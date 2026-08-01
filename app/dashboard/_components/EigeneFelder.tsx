'use client';

// ============================================================
// ARGONAUT OS · Wiederverwendbare „Eigene Felder"-Bausteine
// Ein Betrieb legt sich je Modul eigene Spalten an. Diese Datei liefert:
//   • ladeFelder / ladeWerte / speichereWerte  — Datenzugriff (RLS-Client)
//   • <EigeneFelderManager>  — Felder anlegen/entfernen (Verwaltung)
//   • <EigeneFelderInputs>   — die Felder im Anlegen-Formular
//   • <EigeneFelderAnzeige>  — die Werte in einer Liste/Detailzeile
// Einbau in ein Modul: Manager + Inputs + Anzeige einsetzen, modul-Key wählen
// (z. B. 'verein_mitglieder'). Nichts Geheimes — normaler RLS-Client genügt.
// Pfad: app/dashboard/_components/EigeneFelder.tsx
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { FELD_TYPEN, feldTypLabel, parseOptionen, formatWert, istFeldTyp, type EigenesFeld, type FeldTyp } from '@/lib/eigeneFelder';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666',
};

// ---------------- Datenzugriff ----------------

export async function ladeFelder(modul: string): Promise<EigenesFeld[]> {
  const { data } = await supabase.from('eigenes_feld')
    .select('id, modul, label, feld_typ, optionen, reihenfolge, aktiv')
    .eq('modul', modul).eq('aktiv', true)
    .order('reihenfolge', { ascending: true });
  const rows = (data as unknown as Array<Record<string, unknown>>) ?? [];
  return rows.map((r) => ({
    id: String(r.id), modul: String(r.modul), label: String(r.label),
    feld_typ: (istFeldTyp(r.feld_typ) ? r.feld_typ : 'text') as FeldTyp,
    optionen: Array.isArray(r.optionen) ? (r.optionen as string[]) : [],
    reihenfolge: Number(r.reihenfolge) || 0, aktiv: r.aktiv !== false,
  }));
}

/** datensatzId -> { feldId -> wert } */
export async function ladeWerte(modul: string, datensatzIds: string[]): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  const ids = datensatzIds.filter(Boolean);
  if (!ids.length) return out;
  const { data } = await supabase.from('eigenes_feld_wert')
    .select('datensatz_id, feld_id, wert').eq('modul', modul).in('datensatz_id', ids);
  const rows = (data as unknown as Array<Record<string, unknown>>) ?? [];
  for (const r of rows) {
    const dsid = String(r.datensatz_id); const fid = String(r.feld_id);
    (out[dsid] ??= {})[fid] = (r.wert ?? '').toString();
  }
  return out;
}

export async function speichereWerte(modul: string, datensatzId: string | null | undefined, ownerId: string | null | undefined, werte: Record<string, string>): Promise<void> {
  if (!datensatzId) return;
  for (const [feldId, roh] of Object.entries(werte)) {
    const w = (roh ?? '').toString().trim();
    if (!w) {
      await supabase.from('eigenes_feld_wert').delete().eq('feld_id', feldId).eq('datensatz_id', datensatzId);
    } else {
      await supabase.from('eigenes_feld_wert').upsert(
        { owner_user_id: ownerId, modul, datensatz_id: datensatzId, feld_id: feldId, wert: w, aktualisiert_am: new Date().toISOString() },
        { onConflict: 'feld_id,datensatz_id' },
      );
    }
  }
}

// ---------------- Verwaltung ----------------

export function EigeneFelderManager({ modul, ownerId, onChange }: { modul: string; ownerId: string; onChange?: () => void }) {
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [offen, setOffen] = useState(false);
  const [label, setLabel] = useState('');
  const [typ, setTyp] = useState<FeldTyp>('text');
  const [optionen, setOptionen] = useState('');
  const [busy, setBusy] = useState(false);

  const nachladen = useCallback(async () => { setFelder(await ladeFelder(modul)); }, [modul]);
  useEffect(() => { void nachladen(); }, [nachladen]);

  async function hinzufuegen() {
    if (!label.trim() || busy) return;
    setBusy(true);
    try {
      await supabase.from('eigenes_feld').insert({
        owner_user_id: ownerId, modul, label: label.trim(), feld_typ: typ,
        optionen: typ === 'auswahl' ? parseOptionen(optionen) : [], reihenfolge: felder.length,
      });
      setLabel(''); setOptionen(''); setTyp('text');
      await nachladen(); onChange?.();
    } finally { setBusy(false); }
  }
  async function entfernen(id: string) {
    if (!window.confirm('Dieses eigene Feld und alle seine Einträge wirklich entfernen?')) return;
    await supabase.from('eigenes_feld').delete().eq('id', id);
    await nachladen(); onChange?.();
  }

  return (
    <div style={s.box}>
      <button style={s.kopf} onClick={() => setOffen((o) => !o)}>
        <span>⚙️ Eigene Felder {felder.length > 0 && <span style={s.zahl}>{felder.length}</span>}</span>
        <span style={{ color: C.textDim }}>{offen ? '▾' : '▸'}</span>
      </button>
      {offen && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: C.textDim, fontSize: 13, marginBottom: 10 }}>Lege dir eigene Spalten an — sie erscheinen dann im Formular und in der Liste. Nur du siehst deine Felder.</div>
          {felder.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {felder.map((f) => (
                <div key={f.id} style={s.zeile}>
                  <span style={{ fontWeight: 700 }}>{f.label}</span>
                  <span style={s.typBadge}>{feldTypLabel(f.feld_typ)}</span>
                  {f.feld_typ === 'auswahl' && f.optionen.length > 0 && <span style={{ color: C.textDim, fontSize: 12 }}>{f.optionen.join(' · ')}</span>}
                  <span style={{ flex: 1 }} />
                  <button style={s.weg} onClick={() => entfernen(f.id)}>entfernen</button>
                </div>
              ))}
            </div>
          )}
          <div style={s.form}>
            <input style={{ ...s.inp, flex: 1, minWidth: 140 }} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Feldname, z. B. Sparte" />
            <select style={s.inp} value={typ} onChange={(e) => setTyp(e.target.value as FeldTyp)}>
              {FELD_TYPEN.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            {typ === 'auswahl' && <input style={{ ...s.inp, flex: 1, minWidth: 160 }} value={optionen} onChange={(e) => setOptionen(e.target.value)} placeholder="Optionen mit Komma: Fußball, Turnen, Tennis" />}
            <button style={{ ...s.add, opacity: busy || !label.trim() ? 0.6 : 1 }} disabled={busy || !label.trim()} onClick={hinzufuegen}>＋ Feld</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Formularfelder ----------------

export function EigeneFelderInputs({ felder, werte, setWert, inpStyle, labStyle }: {
  felder: EigenesFeld[]; werte: Record<string, string>; setWert: (feldId: string, wert: string) => void;
  inpStyle?: CSSProperties; labStyle?: CSSProperties;
}) {
  if (!felder.length) return null;
  const inp = inpStyle ?? s.inp;
  const lab = labStyle ?? s.lab;
  return (
    <>
      {felder.map((f) => (
        <label key={f.id} style={lab}>{f.label}
          {f.feld_typ === 'auswahl' ? (
            <select style={inp} value={werte[f.id] ?? ''} onChange={(e) => setWert(f.id, e.target.value)}>
              <option value="">—</option>
              {f.optionen.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.feld_typ === 'ja_nein' ? (
            <select style={inp} value={werte[f.id] ?? ''} onChange={(e) => setWert(f.id, e.target.value)}>
              <option value="">—</option><option value="ja">Ja</option><option value="nein">Nein</option>
            </select>
          ) : (
            <input style={inp} type={f.feld_typ === 'datum' ? 'date' : 'text'} inputMode={f.feld_typ === 'zahl' ? 'decimal' : undefined}
              value={werte[f.id] ?? ''} onChange={(e) => setWert(f.id, e.target.value)} />
          )}
        </label>
      ))}
    </>
  );
}

// ---------------- Anzeige (Liste/Detail) ----------------

export function EigeneFelderAnzeige({ felder, werte }: { felder: EigenesFeld[]; werte: Record<string, string> | undefined }) {
  const gefuellt = felder.filter((f) => (werte?.[f.id] ?? '').toString().trim() !== '');
  if (!gefuellt.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      {gefuellt.map((f) => (
        <span key={f.id} style={s.chip}><b style={{ color: C.textDim, fontWeight: 600 }}>{f.label}:</b> {formatWert(f.feld_typ, werte?.[f.id])}</span>
      ))}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  box: { background: C.navy2, border: `1px dashed ${C.border}`, borderRadius: 12, padding: '12px 14px', marginTop: 12 },
  kopf: { display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', border: 'none', color: C.text, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 },
  zahl: { background: C.gold, color: C.navy, borderRadius: 999, padding: '0 8px', fontSize: 12, fontWeight: 800, marginLeft: 6 },
  zeile: { display: 'flex', gap: 8, alignItems: 'center', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', flexWrap: 'wrap' },
  typBadge: { fontSize: 11, color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 999, padding: '1px 8px', fontWeight: 700 },
  weg: { background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  form: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', minWidth: 0 },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.textDim },
  add: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  chip: { background: 'rgba(143,163,190,0.1)', borderRadius: 999, padding: '2px 10px', fontSize: 12.5, color: C.text },
};
