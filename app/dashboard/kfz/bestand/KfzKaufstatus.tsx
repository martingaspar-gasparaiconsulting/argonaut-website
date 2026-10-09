'use client';

// ============================================================
// ARGONAUT OS · Paket 281 · K15a Kaufstatus für den Käufer (Karte im Reiter „Verkauf")
// 1) Käufer mit einem Kontakt verknüpfen — vorhandener Kontakt nur bei eindeutig
//    gleicher E-Mail vorgeschlagen, sonst neu anlegen oder von Hand suchen.
//    (Vorher blieb kfz_verkauf.kontakt_id immer leer: Rechnung und Portal kannten den Käufer nicht.)
// 2) Portal-Link des Kontakts erstellen bzw. anzeigen: /portal/<token> zeigt den Kauf ab „reserviert".
// Logik: lib/kfzKaufstatus.ts. Schreibt kfz_verkauf.kontakt_id (Recht „KFZ" ändern),
// kontakte (Recht Kontakte) und portal_zugaenge — immer für den Betrieb.
// ============================================================

import { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { nichtsGeschrieben, NICHT_GESPEICHERT } from '@/lib/speichernPruefen';
import { kontaktVorschlag, kontaktAusKaeufer, portalSichtbar, type KontaktMini } from '@/lib/kfzKaufstatus';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666' };

export type KaufstatusVerkauf = {
  id: string; owner_user_id: string; nr: string | null; status: string; kontakt_id?: string | null;
  kaeufer_name: string | null; kaeufer_firma: string | null; kaeufer_email: string | null; kaeufer_tel: string | null; kaeufer_anschrift: string | null;
};
type Zugang = { id: string; token: string; aktiv: boolean };

function kName(k: KontaktMini): string {
  return [`${k.vorname ?? ''} ${k.nachname ?? ''}`.trim(), k.firma].filter(Boolean).join(' · ') || k.email || 'Kontakt';
}
function muster(t: string): string { return t.replace(/[\\%_]/g, (x) => '\\' + x); }

export default function KfzKaufstatus({ v, onGeaendert }: { v: KaufstatusVerkauf; onGeaendert: () => void }) {
  const [kontakt, setKontakt] = useState<KontaktMini | null>(null);
  const [zugang, setZugang] = useState<Zugang | null>(null);
  const [vorschlag, setVorschlag] = useState<ReturnType<typeof kontaktVorschlag>>({ art: 'keiner' });
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<KontaktMini[]>([]);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);

  const lade = useCallback(async () => {
    setFehler(null);
    if (v.kontakt_id) {
      const k = await supabase.from('kontakte').select('id, vorname, nachname, firma, email').eq('id', v.kontakt_id).maybeSingle();
      setKontakt(((k.data as unknown) as KontaktMini | null) ?? null);
      const z = await supabase.from('portal_zugaenge').select('id, token, aktiv').eq('kontakt_id', v.kontakt_id).maybeSingle();
      setZugang(((z.data as unknown) as Zugang | null) ?? null);
      return;
    }
    setKontakt(null); setZugang(null);
    const mail = String(v.kaeufer_email ?? '').trim();
    if (mail.includes('@')) {
      const r = await supabase.from('kontakte').select('id, vorname, nachname, firma, email').eq('owner_user_id', v.owner_user_id).ilike('email', muster(mail)).limit(5);
      setVorschlag(kontaktVorschlag(mail, ((r.data as unknown) as KontaktMini[]) ?? []));
    } else setVorschlag({ art: 'keiner' });
  }, [v.kontakt_id, v.kaeufer_email, v.owner_user_id]);
  useEffect(() => { void lade(); }, [lade]);

  async function verknuepfen(id: string | null, meldung: string) {
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('kfz_verkauf').update({ kontakt_id: id, aktualisiert_am: new Date().toISOString() }).eq('id', v.id).select('id');
      if (error || nichtsGeschrieben(data)) { setFehler(`${NICHT_GESPEICHERT} (Schreibrecht „KFZ"?)`); return; }
      setOk(meldung); setTreffer([]); setSuche('');
      onGeaendert();
    } finally { setBusy(false); }
  }

  async function neuAnlegen() {
    const neu = kontaktAusKaeufer(v);
    if (!neu) { setFehler('Bitte im Verkauf zuerst Name oder Firma des Käufers eintragen und speichern.'); return; }
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('kontakte').insert({ ...neu, owner_user_id: v.owner_user_id }).select('id').single();
      if (error || !data) { setFehler('Der Kontakt ließ sich nicht anlegen (Recht „Kontakte"?).'); return; }
      setBusy(false);
      await verknuepfen((data as { id: string }).id, 'Käufer als neuer Kontakt angelegt und verknüpft.');
    } finally { setBusy(false); }
  }

  async function suchen() {
    // Zeichen, die den Such-Filter zerlegen würden, fallen weg
    const q = suche.replace(/[,()"*]/g, ' ').trim();
    if (q.length < 2) { setTreffer([]); return; }
    const m = muster(q);
    const r = await supabase.from('kontakte').select('id, vorname, nachname, firma, email').eq('owner_user_id', v.owner_user_id)
      .or(`nachname.ilike.%${m}%,vorname.ilike.%${m}%,firma.ilike.%${m}%,email.ilike.%${m}%`).limit(8);
    const liste = ((r.data as unknown) as KontaktMini[]) ?? [];
    setTreffer(liste);
    setOk(liste.length ? null : 'Kein passender Kontakt gefunden.');
  }

  async function linkErstellen() {
    if (!v.kontakt_id) return;
    setBusy(true); setFehler(null); setOk(null);
    try {
      const { data, error } = await supabase.from('portal_zugaenge').insert({ owner_user_id: v.owner_user_id, kontakt_id: v.kontakt_id }).select('id, token, aktiv').single();
      if (error || !data) { await lade(); setFehler('Der Link ließ sich nicht erstellen (Recht „Kundenportal"?). Gibt es schon einen, steht er jetzt hier.'); return; }
      setZugang(data as unknown as Zugang); setOk('Kaufstatus-Link erstellt.');
    } finally { setBusy(false); }
  }

  const url = zugang && typeof window !== 'undefined' ? `${window.location.origin}/portal/${zugang.token}` : '';
  async function kopieren() {
    try { await navigator.clipboard.writeText(url); setKopiert(true); setTimeout(() => setKopiert(false), 2000); } catch { setFehler('Kopieren ging nicht — bitte den Link markieren und kopieren.'); }
  }

  return (
    <div style={s.karte}>
      <h3 style={s.h3}>Kaufstatus für den Käufer</h3>
      <div style={{ ...s.dim, marginBottom: 10 }}>
        Der Käufer sieht im Kundenportal ohne Anmeldung, wie weit sein Kauf ist: Reservierung, Kaufvertrag, Zulassung, Übergabe-Termin,
        Kaufpreis mit Anzahlung und Restbetrag und wo der Fahrzeugbrief liegt. Er sieht nie Einkauf, Kalkulation, FIN oder Notizen.
      </div>
      {fehler && <div style={s.fehler}>{fehler}</div>}
      {ok && <div style={s.ok}>{ok}</div>}

      {kontakt ? (
        <>
          <div style={s.reihe}>
            <span>Kontakt: <b>{kName(kontakt)}</b>{kontakt.email ? <span style={s.dim}> · {kontakt.email}</span> : null}</span>
            <button style={s.btn} disabled={busy} onClick={() => void verknuepfen(null, 'Verknüpfung gelöst.')}>Andere Person …</button>
          </div>
          <div style={{ marginTop: 12 }}>
            {!zugang ? (
              <button style={s.gold} disabled={busy} onClick={() => void linkErstellen()}>🔗 Kaufstatus-Link erstellen</button>
            ) : !zugang.aktiv ? (
              <div style={s.hinweis}>Der Portal-Link dieses Kunden ist deaktiviert. Wieder einschalten unter <a href="/dashboard/portal" style={{ color: C.gold }}>Kundenportal</a>.</div>
            ) : (
              <>
                <div style={{ ...s.mono, wordBreak: 'break-all', marginBottom: 8 }}>{url}</div>
                <div style={s.reihe}>
                  <button style={s.gold} onClick={() => void kopieren()}>{kopiert ? '✓ Kopiert' : 'Link kopieren'}</button>
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...s.btn, textDecoration: 'none' }}>Ansehen wie der Käufer</a>
                </div>
                <div style={{ ...s.dim, marginTop: 6 }}>Schicken Sie den Link selbst per Mail oder Nachricht. Über denselben Link sieht der Kunde auch seine Rechnungen und Termine bei Ihnen.</div>
              </>
            )}
            {!portalSichtbar(v.status) && <div style={{ ...s.dim, marginTop: 8, color: C.warn }}>Im Portal erscheint der Kauf ab „reserviert" — ein Angebot noch nicht.</div>}
          </div>
        </>
      ) : (
        <>
          {vorschlag.art === 'treffer' && (
            <div style={s.reihe}>
              <span>Gleiche E-Mail im Kontakt <b>{kName(vorschlag.kontakt)}</b></span>
              <button style={s.gold} disabled={busy} onClick={() => void verknuepfen(vorschlag.kontakt.id, 'Käufer mit dem vorhandenen Kontakt verknüpft.')}>Verknüpfen</button>
            </div>
          )}
          {vorschlag.art === 'mehrdeutig' && <div style={s.hinweis}>{vorschlag.anzahl} Kontakte haben diese E-Mail — bitte unten von Hand den richtigen wählen.</div>}
          <div style={{ ...s.reihe, marginTop: 10 }}>
            <button style={vorschlag.art === 'treffer' ? s.btn : s.gold} disabled={busy} onClick={() => void neuAnlegen()}>+ Käufer als neuen Kontakt anlegen</button>
          </div>
          <div style={{ ...s.reihe, marginTop: 10 }}>
            <input style={s.inp} placeholder="Vorhandenen Kontakt suchen (Name, Firma, E-Mail)" value={suche} onChange={(e) => setSuche(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void suchen(); }} />
            <button style={s.btn} onClick={() => void suchen()}>Suchen</button>
          </div>
          {treffer.map((k) => (
            <div key={k.id} style={{ ...s.reihe, padding: '6px 0', borderBottom: `1px dashed ${C.border}` }}>
              <span>{kName(k)}{k.email ? <span style={s.dim}> · {k.email}</span> : null}</span>
              <button style={s.btn} disabled={busy} onClick={() => void verknuepfen(k.id, 'Käufer verknüpft.')}>Diesen nehmen</button>
            </div>
          ))}
          <div style={{ ...s.dim, marginTop: 8 }}>Vorgeschlagen wird ein vorhandener Kontakt nur bei gleicher E-Mail — gleiche Namen reichen nicht, damit nie eine fremde Person den Kauf sieht. Rechnungen, die Sie danach aus dem Verkauf erstellen, hängen am selben Kontakt.</div>
        </>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0 },
  h3: { margin: '0 0 10px', fontSize: 15, fontWeight: 800 },
  dim: { color: C.dim, fontSize: 13 },
  mono: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 },
  reihe: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  btn: { background: C.navy2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0, flex: 1 },
  fehler: { background: 'rgba(224,102,102,0.12)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  ok: { background: 'rgba(76,175,125,0.12)', border: `1px solid ${C.ok}`, borderRadius: 8, padding: '8px 12px', margin: '10px 0' },
  hinweis: { background: 'rgba(95,168,232,0.08)', border: '1px solid rgba(95,168,232,0.35)', borderRadius: 10, padding: '8px 12px', fontSize: 13.5, margin: '6px 0' },
};
