'use client';

// ARGONAUT OS · Paket 361 (VK4 Teil 2) — Anrufe an einem Lead oder Kontakt.
// Nummer zum Antippen (tel:), Anruf mit Ergebnis erfassen (wie in der
// Anruf-Sitzung) und der Verlauf aller Anrufe mit Person, Zeit, Ergebnis,
// Rückruf und Notiz. Bei Leads zusätzlich die Uhr „Zeit bis zum ersten Anruf".
// Logik: lib/anrufSitzung.ts · Tabelle vk_anruf (SQL p360). Fehlt die Tabelle,
// zeigt die Box nur die Nummer.

import { useCallback, useEffect, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  ERGEBNISSE, telefonNorm, anrufPruefen, anrufZeile, lokalZuIso, rueckrufVorschlaege, ersteReaktion,
  ergebnis as ergebnisInfo, zeitDe, type ErgebnisKey,
} from '@/lib/anrufSitzung';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

type Anruf = { id: string; ergebnis: string; rueckruf_am: string | null; notiz: string | null; anrufer_name: string | null; user_id: string | null; erstellt_am: string };
const AMPEL: Record<string, string> = { gruen: '#4CAF7D', gelb: '#E0A24C', rot: '#E06666', grau: '#8FA3BE' };

export default function AnrufVerlauf({ leadId, kontaktId, telefon, angelegt }: { leadId?: string; kontaktId?: string; telefon?: string | null; angelegt?: string | null }) {
  const [anrufe, setAnrufe] = useState<Anruf[]>([]);
  const [bereit, setBereit] = useState(false);
  const [ich, setIch] = useState<string | null>(null);
  const [betrieb, setBetrieb] = useState<string | null>(null);
  const [offen, setOffen] = useState(false);
  const [erg, setErg] = useState<ErgebnisKey | ''>('');
  const [rueck, setRueck] = useState<string | null>(null);
  const [rueckLokal, setRueckLokal] = useState('');
  const [notiz, setNotiz] = useState('');
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async () => {
    const spalte = leadId ? 'lead_id' : 'kontakt_id';
    const id = leadId ?? kontaktId;
    if (!id) return;
    const { data, error } = await supabase.from('vk_anruf')
      .select('id, ergebnis, rueckruf_am, notiz, anrufer_name, user_id, erstellt_am')
      .eq(spalte, id).order('erstellt_am', { ascending: false }).limit(200);
    setBereit(!error);
    setAnrufe(error ? [] : ((data as Anruf[]) ?? []));
  }, [leadId, kontaktId]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setIch(id);
      if (id) {
        let chef: unknown = null;
        try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
        setBetrieb(typeof chef === 'string' && chef ? chef : id);
      }
      await laden();
    })();
  }, [laden]);

  const tel = telefonNorm(telefon);
  const ersterAnruf = anrufe.length ? anrufe[anrufe.length - 1].erstellt_am : null;
  const reaktion = leadId && angelegt ? ersteReaktion({ created_at: angelegt, erster_anruf_am: ersterAnruf, telefon }, new Date()) : null;

  async function speichern() {
    if (!betrieb || !ich || !erg) { setMeldung({ ok: false, text: 'Bitte ein Ergebnis wählen.' }); return; }
    const f = anrufPruefen(erg, rueck, notiz, new Date());
    if (f.length) { setMeldung({ ok: false, text: f.join(' ') }); return; }
    setBusy(true); setMeldung(null);
    try {
      const { error } = await supabase.from('vk_anruf').insert(anrufZeile({ typ: leadId ? 'lead' : 'kontakt', id: (leadId ?? kontaktId) as string }, erg, rueck, notiz, betrieb, ich));
      if (error) { setMeldung({ ok: false, text: /Lead|Kontakt|Rückruf|Betrieb/.test(error.message) ? error.message : 'Nicht gespeichert — fehlt SQL Paket 360?' }); return; }
      setErg(''); setRueck(null); setRueckLokal(''); setNotiz(''); setOffen(false);
      setMeldung({ ok: true, text: 'Anruf gespeichert.' });
      await laden();
    } finally { setBusy(false); }
  }

  async function zuruecknehmen(a: Anruf) {
    if (!window.confirm('Diesen Anruf zurücknehmen?')) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('vk_anruf').delete().eq('id', a.id).select('id');
      if (error || !data || (data as unknown[]).length === 0) { setMeldung({ ok: false, text: error?.message ?? 'Zurücknehmen geht nur 15 Minuten lang.' }); return; }
      await laden();
    } finally { setBusy(false); }
  }

  if (!tel && !bereit) return null;
  const jetzt = Date.now();

  return (
    <div style={st.box}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={st.titel}>☎️ Anrufe</span>
        {tel && <a href={`tel:${tel}`} style={st.anrufen}>📞 {telefon}</a>}
        {reaktion && reaktion.minuten != null && (
          <span style={{ ...st.uhr, color: AMPEL[reaktion.ampel], borderColor: AMPEL[reaktion.ampel] + '66' }}>⏱ {reaktion.text}</span>
        )}
        {bereit && <span style={st.dim}>{anrufe.length ? `${anrufe.length} Anruf${anrufe.length === 1 ? '' : 'e'}` : 'noch kein Anruf'}</span>}
        <span style={{ flex: 1 }} />
        {bereit && tel && <button style={st.knopf} onClick={() => { setOffen(!offen); setMeldung(null); }}>{offen ? 'Abbrechen' : '＋ Anruf erfassen'}</button>}
      </div>

      {offen && (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ERGEBNISSE.map((e) => (
              <button key={e.key} onClick={() => setErg(e.key)} style={{ ...st.chip, color: e.farbe, borderColor: erg === e.key ? e.farbe : 'rgba(255,255,255,0.15)', background: erg === e.key ? e.farbe + '22' : 'transparent' }}>{e.icon} {e.name}</button>
            ))}
          </div>
          {erg === 'rueckruf' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {rueckrufVorschlaege(new Date()).map((v) => (
                <button key={v.text} style={{ ...st.chip, borderColor: rueck === v.iso ? '#00e5ff' : 'rgba(255,255,255,0.15)' }} onClick={() => { setRueck(v.iso); setRueckLokal(''); }}>{v.text}</button>
              ))}
              <input type="datetime-local" style={st.inp} value={rueckLokal} onChange={(e) => { setRueckLokal(e.target.value); setRueck(lokalZuIso(e.target.value)); }} aria-label="Eigene Rückruf-Zeit" />
              {rueck && <span style={st.dim}>{zeitDe(rueck)}</span>}
            </div>
          )}
          <textarea style={{ ...st.inp, minHeight: 50 }} maxLength={2000} placeholder="Notiz (optional)" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
          <div><button style={st.primaer} disabled={busy || !erg} onClick={() => void speichern()}>{busy ? 'Speichert …' : 'Anruf speichern'}</button></div>
        </div>
      )}
      {meldung && <p style={{ margin: '8px 0 0', color: meldung.ok ? '#3ddc84' : '#E06666', fontSize: 14 }}>{meldung.text}</p>}

      {anrufe.length > 0 && (
        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          {anrufe.slice(0, 20).map((a) => {
            const e = ergebnisInfo(a.ergebnis);
            const zurueck = a.user_id === ich && jetzt - new Date(a.erstellt_am).getTime() < 15 * 60_000;
            return (
              <div key={a.id} style={st.zeile}>
                <span style={{ color: e?.farbe ?? '#8FA3BE', fontWeight: 700, minWidth: 170 }}>{e?.icon} {e?.name ?? a.ergebnis}</span>
                <span style={st.dim}>{zeitDe(a.erstellt_am)} · {a.anrufer_name ?? '—'}</span>
                {a.rueckruf_am && <span style={{ color: '#00e5ff', fontSize: 13 }}>Rückruf {zeitDe(a.rueckruf_am)}</span>}
                {a.notiz && <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13.5, flexBasis: '100%' }}>„{a.notiz}"</span>}
                {zurueck && <button style={st.link} disabled={busy} onClick={() => void zuruecknehmen(a)}>Zurücknehmen</button>}
              </div>
            );
          })}
          {anrufe.length > 20 && <span style={st.dim}>… und {anrufe.length - 20} ältere</span>}
        </div>
      )}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  box: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '16px 20px', marginBottom: 24 },
  titel: { fontSize: 12, color: '#C9A84C', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 },
  anrufen: { background: '#4CAF7D', color: '#0A1628', borderRadius: 10, padding: '7px 14px', fontWeight: 800, textDecoration: 'none', fontSize: 15 },
  uhr: { border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 13, fontWeight: 700 },
  dim: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  knopf: { background: 'transparent', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.5)', borderRadius: 10, padding: '7px 12px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  chip: { background: 'transparent', border: '1px solid', borderRadius: 999, padding: '6px 11px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 },
  inp: { background: '#0F2036', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 9, padding: '7px 10px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' },
  primaer: { background: '#C9A84C', color: '#0A1628', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 },
  zeile: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 },
  link: { background: 'none', border: 'none', color: '#C9A84C', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, padding: 0, textDecoration: 'underline' },
};
