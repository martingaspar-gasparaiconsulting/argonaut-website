'use client';

// ============================================================
// ARGONAUT OS · Firmen-Wissen: Freigabe fürs Team (Paket PG · B14)
//
// Der Chef entscheidet PRO DOKUMENT, was Mitarbeiter im Wissens-Chat finden
// dürfen. Standard: NICHTS ist freigegeben. Vertraulich klingende Dateien
// (Vertrag, Lohn, Bank, Steuer, Zeugnis …) brauchen eine ausdrückliche
// zweite Bestätigung.
//
// Durchgesetzt wird die Freigabe in der DATENBANK (RLS auf documents und
// document_chunks über documents.fuer_team) — diese Seite setzt nur den
// Schalter. Mitarbeiter können freigegebene Dokumente nur lesen.
//
// Pfad: app/dashboard/documents/wissen/page.tsx (Unterpfad von Dokumente)
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { sensiblerName } from '@/lib/firmenWissen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};

type Doc = { id: string; file_name: string; status: string | null; created_at: string; fuer_team: boolean | null };

export default function FirmenWissenPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [spalteFehlt, setSpalteFehlt] = useState(false);
  const [rueckfrage, setRueckfrage] = useState<string | null>(null);
  const [filter, setFilter] = useState<'alle' | 'frei' | 'zu'>('alle');
  const [suche, setSuche] = useState('');

  const load = useCallback(async () => {
    setLaden(true); setFehler(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setFehler('Bitte neu einloggen.'); setLaden(false); return; }
    const { data, error } = await supabase.from('documents')
      .select('id,file_name,status,created_at,fuer_team').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) {
      if (/fuer_team/.test(error.message)) setSpalteFehlt(true); else setFehler(error.message);
    } else { setSpalteFehlt(false); setDocs((data as Doc[]) ?? []); }
    setLaden(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setze(d: Doc, wert: boolean) {
    setFehler(null);
    const { error } = await supabase.from('documents').update({ fuer_team: wert }).eq('id', d.id);
    if (error) { setFehler(`Nicht gespeichert: ${error.message}`); return; }
    setRueckfrage(null);
    setDocs((alt) => alt.map((x) => (x.id === d.id ? { ...x, fuer_team: wert } : x)));
  }

  function freigeben(d: Doc) {
    if (sensiblerName(d.file_name) && rueckfrage !== d.id) { setRueckfrage(d.id); return; }
    setze(d, true);
  }

  const frei = docs.filter((d) => d.fuer_team).length;
  const q = suche.trim().toLowerCase();
  const liste = docs
    .filter((d) => (filter === 'alle' ? true : filter === 'frei' ? !!d.fuer_team : !d.fuer_team))
    .filter((d) => !q || d.file_name.toLowerCase().includes(q));

  return (
    <div style={S.page}>
      <div style={S.eyebrow}>ARGONAUT OS · Dokumente</div>
      <h1 style={S.h1}>Firmen-Wissen fürs Team</h1>
      <p style={S.sub}>
        Hier legen Sie fest, welche Dokumente Ihre Mitarbeiter im <a href="/dashboard/chat" style={{ color: C.cyan }}>Wissens-Chat</a> finden und öffnen dürfen.
        {' '}<a href="/dashboard/documents" style={{ color: C.cyan }}>← zu den Dokumenten</a>
      </p>

      <div style={S.hinweis}>
        <strong>Standard: nichts ist freigegeben.</strong> Geben Sie nur frei, was jeder im Betrieb lesen darf — z. B. Handbuch,
        Arbeitsanweisungen, Preislisten, Sicherheitsregeln, Checklisten. <strong>Nicht</strong> freigeben: Arbeitsverträge,
        Lohn- und Gehaltslisten, Bank- und Steuerunterlagen, Zeugnisse, Zugangsdaten. Mitarbeiter können freigegebene Dokumente
        nur lesen, nicht ändern oder löschen.
      </div>

      {spalteFehlt && <div style={S.fehler}>Die Freigabe-Spalte fehlt noch. Bitte zuerst das SQL aus Paket PG Teil 2 in Supabase ausführen.</div>}
      {fehler && <div style={S.fehler}>{fehler}</div>}

      {!spalteFehlt && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '14px 0' }}>
            <span style={{ color: C.textDim, fontSize: 14 }}>{frei} von {docs.length} freigegeben</span>
            {(['alle', 'frei', 'zu'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{ ...S.tab, ...(filter === f ? S.tabAktiv : {}) }}>
                {f === 'alle' ? 'Alle' : f === 'frei' ? 'Freigegeben' : 'Nicht freigegeben'}
              </button>
            ))}
            <input value={suche} placeholder="Dateiname suchen" onChange={(e) => setSuche(e.target.value)} style={{ ...S.input, maxWidth: 240 }} />
          </div>

          {laden ? <p style={{ color: C.textDim }}>Lädt …</p>
            : docs.length === 0 ? <p style={{ color: C.textDim }}>Noch keine Dokumente hochgeladen. Das geht unter <a href="/dashboard/documents" style={{ color: C.cyan }}>Dokumente</a>.</p>
            : (
              <div style={{ display: 'grid', gap: 8 }}>
                {liste.map((d) => {
                  const warnung = sensiblerName(d.file_name);
                  return (
                    <div key={d.id} style={{ ...S.karte, borderLeft: `4px solid ${d.fuer_team ? C.green : C.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{d.file_name}</div>
                          <div style={{ color: C.textDim, fontSize: 13 }}>
                            {new Date(d.created_at).toLocaleDateString('de-DE')}
                            {d.status ? ` · ${d.status}` : ''}
                            {warnung && <span style={{ color: C.warn }}> · klingt vertraulich ({warnung})</span>}
                          </div>
                        </div>
                        {d.fuer_team
                          ? <button style={S.knopfAus} onClick={() => setze(d, false)}>✓ Freigegeben — zurücknehmen</button>
                          : <button style={S.knopf2} onClick={() => freigeben(d)}>Fürs Team freigeben</button>}
                      </div>
                      {rueckfrage === d.id && (
                        <div style={{ ...S.fehler, marginTop: 10 }}>
                          ⚠️ „{d.file_name}" klingt nach <strong>{warnung}</strong>. Freigegeben kann es JEDER Mitarbeiter im Wissens-Chat finden und öffnen.
                          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                            <button style={S.knopfRot} onClick={() => setze(d, true)}>Trotzdem freigeben</button>
                            <button style={S.knopf2} onClick={() => setRueckfrage(null)}>Nicht freigeben</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          <p style={{ color: C.textDim, fontSize: 12, marginTop: 16 }}>
            Hinweis: Der Chat findet ein Dokument erst, wenn es fertig ausgelesen ist. Neu hochgeladene Dateien brauchen dafür einen Moment.
          </p>
        </>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { padding: '24px 20px', color: C.text, maxWidth: 1000, margin: '0 auto' },
  eyebrow: { color: C.gold, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  h1: { fontSize: 28, margin: '4px 0' },
  sub: { color: C.textDim, marginTop: 0 },
  hinweis: { background: 'rgba(0,229,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: C.textDim, margin: '12px 0', lineHeight: 1.5 },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 },
  tab: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 },
  tabAktiv: { color: C.navy, background: C.gold, borderColor: C.gold, fontWeight: 600 },
  input: { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  knopf2: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14 },
  knopfAus: { background: 'rgba(76,175,125,0.15)', color: C.green, border: `1px solid ${C.green}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14 },
  knopfRot: { background: C.danger, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  fehler: { color: C.danger, background: 'rgba(224,102,102,0.08)', border: `1px solid ${C.danger}`, borderRadius: 8, padding: '10px 12px', margin: '8px 0' },
};
