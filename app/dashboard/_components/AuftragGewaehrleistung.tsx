'use client';

// ============================================================================
// ARGONAUT OS · AuftragGewaehrleistung — LK2 (16.10.2026)
// Karte am Auftrag: Gewährleistung starten (Abnahme + Art der Leistung →
// Fristende), Stand mit Ampel, Begehung 3 Monate vor Ende als Termin,
// Mängel in der Frist direkt melden. Tabellen bau_gewaehrleistung /
// bau_maengelruege (Paket PI, nur Geschäftsleitung per RLS).
// Spalten auftrag_id/begehung_am ab SQL p392 — vorher Zuordnung über die
// Auftragsnummer in der Bezeichnung, Begehung ohne Erledigt-Vermerk.
// Logik: lib/gewaehrleistungAuftrag.ts (getestet).
// ============================================================================

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { gewaehrleistungStatus, regelwerk } from '@/lib/bauAblaeufe';
import { heuteIso, datumDe } from '@/lib/nachweisMotor';
import {
  REGELWERKE, begehungStatus, begehungTerminUrl, pruefeStart, gwAusAuftrag, gehoertZuAuftrag, type AuftragKurz,
} from '@/lib/gewaehrleistungAuftrag';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = { navy: '#0A1628', navy2: '#0F1F33', gold: '#C9A84C', green: '#4CAF7D', danger: '#E06666', warn: '#E0A24C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)' };

type Gw = {
  id: string; bezeichnung: string; kunde_name: string | null; abnahme_am: string; regelwerk: string; monate: number | null;
  auftrag_id?: string | null; begehung_am?: string | null;
};
type Ruege = { id: string; gewaehrleistung_id: string; eingang_am: string; beschreibung: string; status: string };

export default function AuftragGewaehrleistung({ auftrag, kontaktId, vorschlagAbnahme }: { auftrag: AuftragKurz; kontaktId?: string | null; vorschlagAbnahme?: string | null }) {
  const heute = heuteIso(new Date());
  const [liste, setListe] = useState<Gw[] | null>(null);
  const [ruegen, setRuegen] = useState<Ruege[]>([]);
  const [spalten, setSpalten] = useState(false);
  const [form, setForm] = useState<{ abnahme_am: string; regelwerk: string; monate: string } | null>(null);
  const [mangel, setMangel] = useState<{ gw: string; text: string } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Nur id + Nummer als Abhängigkeit — das Objekt wird bei jedem Rendern neu gebaut.
  const auftragId = auftrag.id;
  const auftragNr = auftrag.auftragsnummer ?? null;
  const laden = useCallback(async () => {
    const probe = await supabase.from('bau_gewaehrleistung').select('auftrag_id, begehung_am').limit(1);
    const mitSpalte = !probe.error;
    setSpalten(mitSpalte);
    const q = supabase.from('bau_gewaehrleistung').select('*').order('abnahme_am', { ascending: false });
    const { data, error } = mitSpalte ? await q.eq('auftrag_id', auftragId) : await q.limit(500);
    if (error) { setListe(null); return; }
    const eigene = ((data as Gw[]) ?? []).filter((g) => gehoertZuAuftrag(g, { id: auftragId, auftragsnummer: auftragNr }));
    setListe(eigene);
    if (eigene.length) {
      const r = await supabase.from('bau_maengelruege').select('id, gewaehrleistung_id, eingang_am, beschreibung, status').in('gewaehrleistung_id', eigene.map((g) => g.id)).order('eingang_am', { ascending: false });
      setRuegen((r.data as Ruege[]) ?? []);
    } else setRuegen([]);
  }, [auftragId, auftragNr]);

  useEffect(() => { void laden(); }, [laden]);

  const offeneRuegen = useMemo(() => ruegen.filter((r) => r.status !== 'behoben' && r.status !== 'abgelehnt'), [ruegen]);

  if (liste === null) return null; // keine Rechte (nur Geschäftsleitung) oder Tabelle fehlt — Karte ausblenden

  async function starten() {
    if (!form) return;
    const p = pruefeStart(form, heute);
    if (p.fehler || p.monate == null) { setFehler(p.fehler); return; }
    setBusy(true); setFehler(null);
    try {
      const { error } = await supabase.from('bau_gewaehrleistung').insert(gwAusAuftrag(auftrag, form, p.monate, spalten));
      if (error) { setFehler('Gewährleistung konnte nicht gespeichert werden.'); return; }
      setForm(null); setOk('Gewährleistung gestartet.'); await laden();
    } finally { setBusy(false); }
  }

  async function begehungErledigt(g: Gw) {
    setBusy(true); setFehler(null);
    try {
      const { error } = await supabase.from('bau_gewaehrleistung').update({ begehung_am: heute, aktualisiert_am: new Date().toISOString() }).eq('id', g.id);
      if (error) { setFehler('Vermerk konnte nicht gespeichert werden.'); return; }
      setOk('Begehung als erledigt vermerkt.'); await laden();
    } finally { setBusy(false); }
  }

  async function mangelMelden() {
    if (!mangel) return;
    const text = mangel.text.trim();
    if (text.length < 5) { setFehler('Bitte den Mangel kurz beschreiben.'); return; }
    setBusy(true); setFehler(null);
    try {
      const { error } = await supabase.from('bau_maengelruege').insert({ gewaehrleistung_id: mangel.gw, eingang_am: heute, beschreibung: text.slice(0, 2000), status: 'gemeldet', schriftlich: true });
      if (error) { setFehler('Mangel konnte nicht gespeichert werden.'); return; }
      setMangel(null); setOk('Mangel erfasst — Bearbeitung unter Nachträge & Gewährleistung.'); await laden();
    } finally { setBusy(false); }
  }

  const rw = form ? regelwerk(form.regelwerk) : null;

  return (
    <div style={s.karte}>
      <div style={s.label}>🛡 Gewährleistung</div>
      {ok && <div style={{ color: C.green, fontSize: 14 }}>{ok}</div>}
      {fehler && <div style={{ color: C.danger, fontSize: 14 }}>{fehler}</div>}

      {liste.map((g) => {
        const st = gewaehrleistungStatus(g, heute);
        const b = begehungStatus(g, heute);
        const farbe = st.status === 'laeuft' ? C.green : st.status === 'endet_bald' ? C.warn : st.status === 'abgelaufen' ? C.dim : C.danger;
        const eigene = ruegen.filter((r) => r.gewaehrleistung_id === g.id);
        return (
          <div key={g.id} style={{ borderLeft: `4px solid ${farbe}`, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 700 }}>{regelwerk(g.regelwerk)?.label ?? g.regelwerk} · {g.monate ?? '—'} Monate</div>
            <div style={s.dim}>Abnahme {datumDe(g.abnahme_am)} · Ende <b style={{ color: farbe }}>{datumDe(st.ende)}</b>{st.tage != null && st.tage >= 0 ? ` · noch ${st.tage} Tage` : ''}</div>
            <div style={{ fontSize: 13.5, color: b.status === 'jetzt' ? C.warn : b.status === 'verpasst' ? C.danger : C.dim }}>{b.text}</div>
            <div style={s.leiste}>
              {(b.status === 'jetzt' || b.status === 'spaeter') && <a style={s.knopf} href={begehungTerminUrl(g, b.ende, kontaktId)}>📅 Begehung als Termin</a>}
              {spalten && b.status === 'jetzt' && <button style={s.knopf} disabled={busy} onClick={() => begehungErledigt(g)}>✓ Begehung erledigt</button>}
              {st.status !== 'abgelaufen' && <button style={s.knopf} onClick={() => setMangel({ gw: g.id, text: '' })}>⚠ Mangel melden</button>}
              <a style={s.knopf} href="/dashboard/bau-lv/ablaeufe">Alle Gewährleistungen →</a>
            </div>
            {eigene.length > 0 && <div style={s.dim}>{eigene.length} Mängel gemeldet{offeneRuegen.filter((r) => r.gewaehrleistung_id === g.id).length ? ` · ${offeneRuegen.filter((r) => r.gewaehrleistung_id === g.id).length} offen` : ' · alle erledigt'}</div>}
            {mangel?.gw === g.id && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea style={{ ...s.inp, minHeight: 60 }} value={mangel.text} placeholder="Was meldet der Kunde? (Ort, Art, seit wann)" onChange={(e) => setMangel({ ...mangel, text: e.target.value })} />
                <div style={s.leiste}><button style={s.primaer} disabled={busy} onClick={mangelMelden}>Mangel speichern</button><button style={s.knopf} onClick={() => setMangel(null)}>Abbrechen</button></div>
              </div>
            )}
          </div>
        );
      })}

      {!liste.length && !form && (
        <div style={s.leiste}>
          <span style={s.dim}>Noch keine Gewährleistung zu diesem Auftrag.</span>
          <button style={s.primaer} onClick={() => setForm({ abnahme_am: vorschlagAbnahme && vorschlagAbnahme <= heute ? vorschlagAbnahme : heute, regelwerk: 'bgb_bauwerk', monate: '' })}>＋ Gewährleistung starten</button>
        </div>
      )}
      {form && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={s.leiste}>
            <label style={s.lab}>Abnahme am<input type="date" style={s.inp} value={form.abnahme_am} onChange={(e) => setForm({ ...form, abnahme_am: e.target.value })} /></label>
            <label style={s.lab}>Art der Leistung<select style={s.inp} value={form.regelwerk} onChange={(e) => setForm({ ...form, regelwerk: e.target.value })}>
              {REGELWERKE.map((r) => <option key={r.key} value={r.key}>{r.label}{r.monate ? ` (${r.monate} Monate)` : ''}</option>)}
            </select></label>
            {rw && rw.monate === null && <label style={s.lab}>Frist (Monate)<input style={{ ...s.inp, width: 90 }} inputMode="numeric" value={form.monate} onChange={(e) => setForm({ ...form, monate: e.target.value })} /></label>}
          </div>
          {rw && <div style={s.dim}>{rw.grundlage} Vorschlag — maßgeblich ist Ihr Vertrag.</div>}
          <div style={s.leiste}><button style={s.primaer} disabled={busy} onClick={starten}>Gewährleistung starten</button><button style={s.knopf} onClick={() => setForm(null)}>Abbrechen</button></div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12, color: C.text },
  label: { color: C.dim, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' },
  dim: { color: C.dim, fontSize: 13.5 },
  leiste: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' },
  lab: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: C.dim },
  inp: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 11px', fontSize: 14.5, fontFamily: 'inherit' },
  knopf: { background: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 12px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' },
  primaer: { background: C.gold, color: C.navy, border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
};
