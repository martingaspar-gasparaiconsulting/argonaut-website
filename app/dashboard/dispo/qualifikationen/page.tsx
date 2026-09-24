'use client';

// ============================================================
// ARGONAUT OS · Paket PO · Befähigungen je Mitarbeiter (B29)
// Wer darf was: Elektrofachkraft, Gas, Kältemittel, Stapler, Hubarbeitsbühne,
// PSA gegen Absturz … mit „gültig bis". Das Dispo-Board warnt beim Zuweisen,
// wenn eine verlangte Befähigung fehlt oder abgelaufen ist, und schlägt
// passende Monteure vor. Ampel: rot abgelaufen, gelb in 60 Tagen.
// Logik: lib/dispoPlus.ts (getestet). RLS: po-dispo-plus.sql (nur Chef ändert).
// Unterpfad von /dashboard/dispo (erbt die Freigabe des Dispo-Boards).
// Pfad: app/dashboard/dispo/qualifikationen/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { QUALIFIKATIONEN, qualiLabel, qualiAmpel, ablaufWarnungen } from '@/lib/dispoPlus';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Ma = { id: string; vorname: string | null; nachname: string | null };
type Q = { id: string; mitarbeiter_id: string; art: string; gueltig_bis: string | null; nachweis: string | null };

function heuteIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function datumDe(iso: string | null | undefined): string {
  if (!iso) return 'unbefristet';
  const p = iso.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' };

export default function QualifikationenSeite() {
  const [uid, setUid] = useState<string | null>(null);
  const [istMitarbeiter, setIstMitarbeiter] = useState(false);
  const [mas, setMas] = useState<Ma[]>([]);
  const [qs, setQs] = useState<Q[]>([]);
  const [neu, setNeu] = useState<Record<string, { art: string; bis: string }>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const heute = heuteIso();

  const laden = useCallback(async () => {
    const [m, q] = await Promise.all([
      supabase.from('mitarbeiter').select('id, vorname, nachname').or(`austrittsdatum.is.null,austrittsdatum.gt.${heute}`).order('nachname', { ascending: true }),
      supabase.from('mitarbeiter_qualifikation').select('id, mitarbeiter_id, art, gueltig_bis, nachweis'),
    ]);
    if (q.error) { if (/mitarbeiter_qualifikation/.test(q.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen.'); return; }
    setMas((m.data as Ma[]) ?? []);
    setQs((q.data as Q[]) ?? []);
  }, [heute]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setUid(id);
      let chef: string | null = null;
      try { const r = await supabase.rpc('mein_chef_id'); chef = (r.data as string | null) ?? null; } catch { /* Chef */ }
      setIstMitarbeiter(!!chef && chef !== id);
      await laden();
    })();
  }, [laden]);

  const name = (id: string) => { const m = mas.find((x) => x.id === id); return m ? `${m.vorname || ''} ${m.nachname || ''}`.trim() || 'Ohne Namen' : 'Unbekannt'; };
  const warnungen = useMemo(() => ablaufWarnungen(qs.map((q) => ({ ...q, name: name(q.mitarbeiter_id) })), heute),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qs, mas, heute]);

  async function hinzufuegen(maId: string) {
    const n = neu[maId];
    if (!uid || !n?.art) return;
    setFehler(null);
    const bis = /^\d{4}-\d{2}-\d{2}$/.test(n.bis) ? n.bis : null;
    const vorhanden = qs.find((q) => q.mitarbeiter_id === maId && q.art === n.art);
    const r = vorhanden
      ? await supabase.from('mitarbeiter_qualifikation').update({ gueltig_bis: bis }).eq('id', vorhanden.id)
      : await supabase.from('mitarbeiter_qualifikation').insert({ owner_user_id: uid, mitarbeiter_id: maId, art: n.art, gueltig_bis: bis });
    if (r.error) { setFehler('Speichern fehlgeschlagen (nur der Inhaber pflegt Befähigungen).'); return; }
    setNeu((x) => ({ ...x, [maId]: { art: '', bis: '' } }));
    await laden();
  }

  async function entfernen(q: Q) {
    const { error } = await supabase.from('mitarbeiter_qualifikation').delete().eq('id', q.id);
    if (error) setFehler('Entfernen fehlgeschlagen.'); else await laden();
  }

  const farbe = (a: string) => (a === 'rot' ? C.danger : a === 'gelb' ? C.warn : a === 'gruen' ? C.green : C.textDim);

  if (sqlFehlt) {
    return <div style={{ padding: 24, color: C.text }}><div style={{ ...karte, borderColor: C.warn, color: C.warn }}>Dieser Bereich ist noch nicht eingerichtet (SQL von Paket PO fehlt).</div></div>;
  }

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 28px)', color: C.text, maxWidth: 1100, margin: '0 auto' }}>
      <a href="/dashboard/dispo" style={{ color: C.cyan, textDecoration: 'none', fontSize: 14 }}>← Dispo-Board</a>
      <h1 style={{ color: C.gold, margin: '8px 0 4px' }}>🎓 Befähigungen</h1>
      <p style={{ color: C.textDim, margin: '0 0 16px' }}>
        Wer darf was? Im Dispo-Board markieren Sie je Einsatz, was verlangt ist — dann warnt das Board beim Zuweisen und schlägt passende Monteure vor.
        Die Hinweise zu Regelwerken sind Richtwerte, keine Rechtsberatung.
      </p>
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}

      {warnungen.length > 0 && (
        <div style={{ ...karte, borderColor: C.warn }}>
          <strong>Läuft ab oder ist abgelaufen</strong>
          <div style={{ marginTop: 6, display: 'grid', gap: 4, fontSize: 14 }}>
            {warnungen.map((w, i) => (
              <div key={i} style={{ color: farbe(w.ampel) }}>
                {w.name}: {qualiLabel(w.art)} — {w.tage < 0 ? `seit ${-w.tage} Tagen abgelaufen` : w.tage === 0 ? 'läuft heute ab' : `noch ${w.tage} Tage`} ({datumDe(w.gueltig_bis)})
              </div>
            ))}
          </div>
        </div>
      )}

      {mas.length === 0 && <div style={{ ...karte, color: C.textDim }}>Noch keine Mitarbeiter angelegt.</div>}
      {mas.map((m) => {
        const eigene = qs.filter((q) => q.mitarbeiter_id === m.id).sort((a, b) => qualiLabel(a.art).localeCompare(qualiLabel(b.art), 'de'));
        const n = neu[m.id] ?? { art: '', bis: '' };
        return (
          <div key={m.id} style={karte}>
            <strong>{`${m.vorname || ''} ${m.nachname || ''}`.trim() || 'Ohne Namen'}</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {eigene.length === 0 && <span style={{ color: C.textDim, fontSize: 14 }}>Keine Befähigungen eingetragen.</span>}
              {eigene.map((q) => {
                const a = qualiAmpel(q.gueltig_bis, heute);
                return (
                  <span key={q.id} style={{ border: `1px solid ${farbe(a)}`, color: C.text, borderRadius: 999, padding: '4px 10px', fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {qualiLabel(q.art)} <span style={{ color: farbe(a) }}>· {datumDe(q.gueltig_bis)}</span>
                    {!istMitarbeiter && <button onClick={() => entfernen(q)} title="Entfernen" style={{ background: 'none', border: 'none', color: C.textDim, cursor: 'pointer', padding: 0 }}>×</button>}
                  </span>
                );
              })}
            </div>
            {!istMitarbeiter && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                <select value={n.art} onChange={(e) => setNeu((x) => ({ ...x, [m.id]: { ...n, art: e.target.value } }))} style={feld}>
                  <option value="">Befähigung wählen …</option>
                  {QUALIFIKATIONEN.map((q) => <option key={q.key} value={q.key}>{q.label}{q.hinweis ? ` (${q.hinweis})` : ''}</option>)}
                </select>
                <label style={{ color: C.textDim, fontSize: 13 }}>gültig bis <input type="date" value={n.bis} onChange={(e) => setNeu((x) => ({ ...x, [m.id]: { ...n, bis: e.target.value } }))} style={feld} /></label>
                <button disabled={!n.art} onClick={() => hinzufuegen(m.id)} style={{ background: n.art ? C.gold : 'transparent', color: n.art ? C.navy : C.textDim, border: `1px solid ${C.gold}`, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: n.art ? 'pointer' : 'default' }}>Eintragen</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
