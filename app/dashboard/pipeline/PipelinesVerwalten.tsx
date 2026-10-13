'use client';

// ARGONAUT OS · Paket 359 (13.10.2026) · VK1 Teil 2 — eigene Pipelines verwalten.
// Nur Geschäftsleitung (Datenbank-Regel p359_owner_all). Gewonnen/Verloren legt
// die Datenbank je Pipeline selbst an; hier lassen sie sich nur umbenennen.
// Logik: lib/pipelineEigene.ts · SQL: supabase-sql/p359-eigene-pipelines.sql

import { useState, CSSProperties } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  VORLAGEN, vorlageStufen, pipelinePruefen, stufePruefen, schluesselAus, verschieben, stufeLoeschbar, sortiert, pipelineZahlen,
  type PipelineRoh, type StufeRoh,
} from '@/lib/pipelineEigene';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666',
};

type DealKurz = { pipeline_id?: string | null; stufe?: string | null };

export default function PipelinesVerwalten({ supabase, pipelines, stufen, deals, onGeaendert }: {
  supabase: SupabaseClient; pipelines: PipelineRoh[]; stufen: StufeRoh[]; deals: DealKurz[]; onGeaendert: () => Promise<void> | void;
}) {
  const [neuName, setNeuName] = useState('');
  const [neuVorlage, setNeuVorlage] = useState<string>('neukunden');
  const [offen, setOffen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [namen, setNamen] = useState<Record<string, string>>({});
  const [stufeEdit, setStufeEdit] = useState<Record<string, { name: string; w: string }>>({});
  const [neueStufe, setNeueStufe] = useState({ name: '', w: '20' });

  const fehler = (t: string) => setMeldung({ ok: false, text: t });
  const gut = (t: string) => setMeldung({ ok: true, text: t });
  const dbText = (m: string, sonst: string) => (/Pipeline|Stufe|Deals|Gewonnen|inaktiv|Schlüssel/.test(m) ? m : sonst);

  async function lauf(f: () => Promise<void>) {
    setBusy(true); setMeldung(null);
    try { await f(); await onGeaendert(); } finally { setBusy(false); }
  }

  function anlegen() {
    const f = pipelinePruefen(neuName, pipelines);
    if (f.length) { fehler(f.join(' ')); return; }
    void lauf(async () => {
      const { data, error } = await supabase.from('crm_pipeline')
        .insert({ name: neuName.trim(), position: pipelines.length }).select('id').single();
      if (error || !data) { fehler(dbText(error?.message ?? '', 'Nicht angelegt — dafür ist SQL Paket 359 nötig (nur die Geschäftsleitung legt Pipelines an).')); return; }
      const id = (data as { id: string }).id;
      const zeilen = vorlageStufen(neuVorlage, id);
      if (zeilen.length) {
        const { error: e2 } = await supabase.from('crm_pipeline_stufe').insert(zeilen);
        if (e2) { fehler('Pipeline angelegt, Stufen aber nicht: ' + e2.message); return; }
      }
      setNeuName(''); setOffen(id);
      gut(`Pipeline „${neuName.trim()}" angelegt.`);
    });
  }

  function umbenennen(p: PipelineRoh) {
    const name = (namen[p.id] ?? p.name).trim();
    const f = pipelinePruefen(name, pipelines, p.id);
    if (f.length) { fehler(f.join(' ')); return; }
    void lauf(async () => {
      const { data, error } = await supabase.from('crm_pipeline').update({ name }).eq('id', p.id).select('id');
      if (error) { fehler(dbText(error.message, 'Nicht gespeichert.')); return; }
      if (nichtsGeschrieben(data)) { fehler('Nicht gespeichert — das darf nur die Geschäftsleitung.'); return; }
      gut('Name gespeichert.');
    });
  }

  function alsStart(p: PipelineRoh | null) {
    void lauf(async () => {
      // Erst die alte Start-Ansicht lösen (eindeutig je Betrieb), dann die neue setzen.
      const { error } = await supabase.from('crm_pipeline').update({ standard: false }).eq('standard', true);
      if (error) { fehler(dbText(error.message, 'Nicht gespeichert.')); return; }
      if (p) {
        const { error: e2 } = await supabase.from('crm_pipeline').update({ standard: true }).eq('id', p.id);
        if (e2) { fehler(dbText(e2.message, 'Nicht gespeichert.')); return; }
      }
      gut(p ? `„${p.name}" öffnet jetzt als Erstes.` : 'Die eingebaute Standard-Pipeline öffnet jetzt als Erstes.');
    });
  }

  function aktivSetzen(p: PipelineRoh, aktiv: boolean) {
    void lauf(async () => {
      const werte = aktiv ? { aktiv } : { aktiv, standard: false };
      const { error } = await supabase.from('crm_pipeline').update(werte).eq('id', p.id);
      if (error) { fehler(dbText(error.message, 'Nicht gespeichert.')); return; }
      gut(aktiv ? 'Pipeline wieder aktiv.' : 'Pipeline inaktiv — bestehende Deals bleiben, neue kommen nicht mehr hinein.');
    });
  }

  function loeschen(p: PipelineRoh) {
    const z = pipelineZahlen(p.id, deals);
    if (z.gesamt) { fehler(`„${p.name}" hat noch ${z.gesamt} Deal(s). Bitte zuerst verschieben oder die Pipeline auf inaktiv setzen.`); return; }
    if (!window.confirm(`Pipeline „${p.name}" mit allen Stufen wirklich löschen?`)) return;
    void lauf(async () => {
      const { error } = await supabase.from('crm_pipeline').delete().eq('id', p.id);
      if (error) { fehler(dbText(error.message, 'Nicht gelöscht.')); return; }
      gut('Pipeline gelöscht.');
    });
  }

  function stufeSpeichern(s: StufeRoh) {
    const e = stufeEdit[s.id ?? ''] ?? { name: s.name, w: String(s.wahrscheinlichkeit ?? '') };
    const p = stufePruefen({ name: e.name, wahrscheinlichkeit: e.w }, s.art);
    if (p.fehler.length) { fehler(p.fehler.join(' ')); return; }
    void lauf(async () => {
      const { data, error } = await supabase.from('crm_pipeline_stufe')
        .update({ name: e.name.trim(), wahrscheinlichkeit: p.wahrscheinlichkeit }).eq('id', s.id as string).select('id');
      if (error) { fehler(dbText(error.message, 'Nicht gespeichert.')); return; }
      if (nichtsGeschrieben(data)) { fehler('Nicht gespeichert — das darf nur die Geschäftsleitung.'); return; }
      gut('Stufe gespeichert.');
    });
  }

  function stufeNeu(pipelineId: string, eigene: StufeRoh[]) {
    const p = stufePruefen({ name: neueStufe.name, wahrscheinlichkeit: neueStufe.w });
    if (p.fehler.length) { fehler(p.fehler.join(' ')); return; }
    const offeneZahl = eigene.filter((s) => s.art === 'offen').length;
    void lauf(async () => {
      const { error } = await supabase.from('crm_pipeline_stufe').insert({
        pipeline_id: pipelineId, schluessel: schluesselAus(neueStufe.name, eigene.map((s) => s.schluessel)),
        name: neueStufe.name.trim(), wahrscheinlichkeit: p.wahrscheinlichkeit, art: 'offen', position: offeneZahl,
      });
      if (error) { fehler(dbText(error.message, 'Nicht angelegt.')); return; }
      setNeueStufe({ name: '', w: '20' });
      gut('Stufe angelegt.');
    });
  }

  function stufeSchieben(eigene: StufeRoh[], s: StufeRoh, r: -1 | 1) {
    const neu = verschieben(eigene, s.schluessel, r);
    if (!neu.length) return;
    void lauf(async () => {
      for (const x of neu) {
        const ziel = eigene.find((y) => y.schluessel === x.schluessel);
        if (!ziel?.id) continue;
        const { error } = await supabase.from('crm_pipeline_stufe').update({ position: x.position }).eq('id', ziel.id);
        if (error) { fehler(dbText(error.message, 'Reihenfolge nicht gespeichert.')); return; }
      }
    });
  }

  function stufeWeg(s: StufeRoh) {
    const grund = stufeLoeschbar(s, deals);
    if (grund) { fehler(grund); return; }
    if (!window.confirm(`Stufe „${s.name}" löschen?`)) return;
    void lauf(async () => {
      const { error } = await supabase.from('crm_pipeline_stufe').delete().eq('id', s.id as string);
      if (error) { fehler(dbText(error.message, 'Nicht gelöscht.')); return; }
      gut('Stufe gelöscht.');
    });
  }

  const liste = sortiert(pipelines);
  const startGesetzt = pipelines.some((p) => p.standard && p.aktiv !== false);

  return (
    <div style={st.card}>
      <div style={st.titel}>⚙️ Pipelines verwalten</div>
      <p style={st.hint}>
        Eigene Pipelines mit eigenen Stufen, z. B. für Neukunden, Bestandskunden oder je Auftraggeber. „Gewonnen" und „Verloren"
        hat jede Pipeline automatisch (umbenennen geht, löschen nicht) — so zählen Provisionen, Aufträge und Berichte überall richtig.
        Die eingebaute Standard-Pipeline mit den 6 Stufen bleibt immer da.
      </p>

      <div style={st.zeile}>
        <input style={{ ...st.inp, flex: 2 }} placeholder="Name der neuen Pipeline, z. B. Neukunden" value={neuName} onChange={(e) => setNeuName(e.target.value)} />
        <select style={{ ...st.inp, flex: 2 }} value={neuVorlage} onChange={(e) => setNeuVorlage(e.target.value)}>
          {VORLAGEN.map((v) => <option key={v.key} value={v.key}>Vorlage: {v.name} — {v.text}</option>)}
        </select>
        <button style={st.primaer} disabled={busy} onClick={anlegen}>＋ Pipeline anlegen</button>
      </div>

      {meldung && <div style={{ ...st.meld, color: meldung.ok ? C.green : C.danger }}>{meldung.text}</div>}

      <div style={st.pl}>
        <div style={st.plKopf}>
          <strong>Standard (eingebaut)</strong>
          <span style={st.dim}>Lead · Qualifiziert · Angebot · Verhandlung · Gewonnen · Verloren · {pipelineZahlen(null, deals).gesamt} Deals</span>
          <span style={{ flex: 1 }} />
          {startGesetzt
            ? <button style={st.knopf} disabled={busy} onClick={() => alsStart(null)}>Als Start-Ansicht</button>
            : <span style={st.badge}>Start-Ansicht</span>}
        </div>
      </div>

      {liste.map((p) => {
        const eigene = stufen.filter((s) => s.pipeline_id === p.id);
        const offeneSt = eigene.filter((s) => s.art === 'offen').sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        const ende = ['gewonnen', 'verloren'].map((k) => eigene.find((s) => s.schluessel === k)).filter(Boolean) as StufeRoh[];
        const z = pipelineZahlen(p.id, deals);
        const auf = offen === p.id;
        return (
          <div key={p.id} style={{ ...st.pl, opacity: p.aktiv === false ? 0.65 : 1 }}>
            <div style={st.plKopf}>
              <input style={{ ...st.inp, maxWidth: 260 }} value={namen[p.id] ?? p.name} onChange={(e) => setNamen({ ...namen, [p.id]: e.target.value })} aria-label="Name der Pipeline" />
              {(namen[p.id] ?? p.name) !== p.name && <button style={st.knopf} disabled={busy} onClick={() => umbenennen(p)}>Name speichern</button>}
              <span style={st.dim}>{offeneSt.length} Stufen · {z.offen} offen · {z.gewonnen} gewonnen · {z.verloren} verloren</span>
              <span style={{ flex: 1 }} />
              {p.standard ? <span style={st.badge}>Start-Ansicht</span>
                : p.aktiv !== false && <button style={st.knopf} disabled={busy} onClick={() => alsStart(p)}>Als Start-Ansicht</button>}
              <button style={st.knopf} disabled={busy} onClick={() => aktivSetzen(p, p.aktiv === false)}>{p.aktiv === false ? 'Wieder aktiv' : 'Inaktiv setzen'}</button>
              <button style={st.knopf} onClick={() => setOffen(auf ? null : p.id)}>{auf ? 'Stufen zu' : 'Stufen bearbeiten'}</button>
              <button style={{ ...st.knopf, color: C.danger, borderColor: C.danger + '55' }} disabled={busy} onClick={() => loeschen(p)}>Löschen</button>
            </div>

            {auf && (
              <div style={{ marginTop: 10 }}>
                {[...offeneSt, ...ende].map((s, i) => {
                  const e = stufeEdit[s.id ?? ''] ?? { name: s.name, w: String(s.wahrscheinlichkeit ?? '') };
                  const geaendert = e.name !== s.name || (s.art === 'offen' && e.w !== String(s.wahrscheinlichkeit ?? ''));
                  return (
                    <div key={s.id ?? s.schluessel} style={st.stufe}>
                      <span style={{ ...st.dim, width: 22 }}>{s.art === 'offen' ? i + 1 : s.art === 'gewonnen' ? '✓' : '✕'}</span>
                      <input style={{ ...st.inp, flex: 2 }} value={e.name} aria-label="Name der Stufe"
                        onChange={(ev) => setStufeEdit({ ...stufeEdit, [s.id ?? '']: { ...e, name: ev.target.value } })} />
                      {s.art === 'offen'
                        ? <label style={st.mini}><input style={{ ...st.inp, width: 70 }} inputMode="numeric" value={e.w} aria-label="Wahrscheinlichkeit in Prozent"
                            onChange={(ev) => setStufeEdit({ ...stufeEdit, [s.id ?? '']: { ...e, w: ev.target.value } })} /> %</label>
                        : <span style={{ ...st.dim, width: 92 }}>{s.art === 'gewonnen' ? '100 %' : '0 %'}</span>}
                      {geaendert && <button style={st.knopf} disabled={busy} onClick={() => stufeSpeichern(s)}>Speichern</button>}
                      {s.art === 'offen' && <>
                        <button style={st.knopf} disabled={busy || i === 0} onClick={() => stufeSchieben(eigene, s, -1)} aria-label="nach oben">↑</button>
                        <button style={st.knopf} disabled={busy || i === offeneSt.length - 1} onClick={() => stufeSchieben(eigene, s, 1)} aria-label="nach unten">↓</button>
                        <button style={{ ...st.knopf, color: C.danger }} disabled={busy} onClick={() => stufeWeg(s)} aria-label="Stufe löschen">✕</button>
                      </>}
                    </div>
                  );
                })}
                <div style={{ ...st.stufe, borderStyle: 'dashed' }}>
                  <span style={{ ...st.dim, width: 22 }}>＋</span>
                  <input style={{ ...st.inp, flex: 2 }} placeholder="Neue Stufe, z. B. Termin vereinbart" value={neueStufe.name} onChange={(e) => setNeueStufe({ ...neueStufe, name: e.target.value })} />
                  <label style={st.mini}><input style={{ ...st.inp, width: 70 }} inputMode="numeric" value={neueStufe.w} onChange={(e) => setNeueStufe({ ...neueStufe, w: e.target.value })} aria-label="Wahrscheinlichkeit in Prozent" /> %</label>
                  <button style={st.primaer} disabled={busy} onClick={() => stufeNeu(p.id, eigene)}>Stufe anlegen</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  card: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 },
  titel: { fontWeight: 800, fontSize: 'clamp(16px, 1.4vw, 22px)', marginBottom: 6 },
  hint: { color: C.textDim, fontSize: 14, lineHeight: 1.5, margin: '0 0 12px', maxWidth: 900 },
  zeile: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 10px', fontSize: 15, fontFamily: 'inherit', minWidth: 0, boxSizing: 'border-box' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  knopf: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  badge: { fontSize: 12, fontWeight: 800, color: C.gold, border: `1px solid ${C.gold}66`, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' },
  pl: { background: C.navy, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8 },
  plKopf: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  dim: { color: C.textDim, fontSize: 13 },
  stufe: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', border: `1px solid ${C.border}`, borderRadius: 10, padding: '6px 8px', marginBottom: 6 },
  mini: { display: 'flex', alignItems: 'center', gap: 4, color: C.textDim, fontSize: 13 },
  meld: { fontSize: 14, margin: '0 0 10px' },
};
