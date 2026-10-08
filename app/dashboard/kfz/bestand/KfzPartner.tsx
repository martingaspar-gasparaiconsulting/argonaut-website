'use client';

// ============================================================
// ARGONAUT OS · Paket 278 · K18 Reiter „Partner" in der Handelsakte
// Auftrag am Fahrzeug an einen verbundenen Partner-Betrieb (Lackierer,
// Aufbereiter, Gutachter …). Der Partner sieht nur dieses Fahrzeug und nur
// die Positivliste (FIN, km, Fotos nur mit Freigabe) — nie Preise, Kunde,
// Kennzeichen, Notizen. Zugriff endet mit dem Auftrag oder beim Trennen.
// Schreiben: Chef oder Schreibrecht „kfz" (RLS + Auslöser Paket 278).
// Ohne SQL 278 Hinweis statt Absturz.
// ============================================================

import { useCallback, useEffect, useMemo, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { nichtsGeschrieben, NICHT_GESPEICHERT } from '@/lib/speichernPruefen';
import {
  aktionen, auftragPruefen, grundPruefen, partnerAuswahl, partnerSieht, statusName, statusStufe, laeuft, ueberfaellig, fehlerText,
  type Aktion, type Verbindung,
} from '@/lib/partnerNetzwerk';
import PartnerVerlauf, { type VerlaufEintrag } from '../partner/PartnerVerlauf';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, dim: C.dim };

type Fz = { id: string; owner_user_id: string; marke: string | null; modell: string | null; fin: string | null; km_stand: number | null };
type Auftrag = {
  id: string; nummer: string; partner_betrieb: string; titel: string; beschreibung: string | null; faellig_am: string | null;
  freigabe_fotos: boolean; freigabe_fin: boolean; freigabe_km: boolean; status: string; status_grund: string | null; erstellt_am: string;
};
type EintragRoh = { id: string; auftrag_id: string; seite: string; von_name: string | null; art: string; text: string | null; fotos: string[] | null; erstellt_am: string };

function heute(): string { return new Date().toISOString().slice(0, 10); }
function de(iso: string | null | undefined): string { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }

export default function KfzPartner({ fz }: { fz: Fz }) {
  const [verb, setVerb] = useState<Verbindung[]>([]);
  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [eintraege, setEintraege] = useState<EintragRoh[]>([]);
  const [darfSchreiben, setDarfSchreiben] = useState(false);
  const [fehltSql, setFehltSql] = useState(false);
  const [neu, setNeu] = useState({ partner_betrieb: '', titel: '', beschreibung: '', faellig_am: '', freigabe_fotos: false, freigabe_fin: false, freigabe_km: true });
  const [grund, setGrund] = useState<{ auftrag: string; aktion: Aktion; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const lade = useCallback(async () => {
    const [v, a, rechte] = await Promise.all([
      supabase.from('betrieb_partner').select('*').order('erstellt_am', { ascending: false }),
      supabase.from('partner_auftrag').select('id, nummer, partner_betrieb, titel, beschreibung, faellig_am, freigabe_fotos, freigabe_fin, freigabe_km, status, status_grund, erstellt_am')
        .eq('bezug_id', fz.id).order('erstellt_am', { ascending: false }),
      supabase.rpc('mein_chef_id'),
    ]);
    setFehltSql(!!a.error);
    setVerb(v.error ? [] : (((v.data as unknown) as Verbindung[]) ?? []));
    const af = a.error ? [] : (((a.data as unknown) as Auftrag[]) ?? []);
    setAuftraege(af);
    if (af.length) {
      const e = await supabase.from('partner_eintrag').select('id, auftrag_id, seite, von_name, art, text, fotos, erstellt_am')
        .in('auftrag_id', af.map((x) => x.id)).order('erstellt_am');
      setEintraege(e.error ? [] : (((e.data as unknown) as EintragRoh[]) ?? []));
    } else setEintraege([]);
    // Schreibrecht: Chef immer; Mitarbeiter nur mit Schreibrecht „kfz"
    if (!rechte.data) setDarfSchreiben(true);
    else {
      const d = await supabase.rpc('darf_ich_modul_aendern', { p_modul: 'kfz' });
      setDarfSchreiben(d.data === true);
    }
  }, [fz.id]);

  useEffect(() => { void lade(); }, [lade]);

  const auswahl = useMemo(() => partnerAuswahl(verb, fz.owner_user_id), [verb, fz.owner_user_id]);
  const namen = useMemo(() => new Map(auswahl.map((x) => [x.betrieb, x.name])), [auswahl]);
  const vorschau = partnerSieht(neu);

  async function senden() {
    const p = auftragPruefen(neu, heute());
    if (!p.ok) { setMeldung({ ok: false, text: p.fehler }); return; }
    setBusy(true); setMeldung(null);
    try {
      const { data, error } = await supabase.from('partner_auftrag').insert({ ...p.felder, owner_user_id: fz.owner_user_id, bezug_typ: 'kfz_bestand', bezug_id: fz.id }).select('id, nummer');
      if (error) throw new Error(fehlerText(error));
      if (nichtsGeschrieben(data)) throw new Error(NICHT_GESPEICHERT);
      const nr = ((data as unknown) as { nummer: string }[])[0]?.nummer ?? '';
      setNeu({ partner_betrieb: neu.partner_betrieb, titel: '', beschreibung: '', faellig_am: '', freigabe_fotos: false, freigabe_fin: false, freigabe_km: true });
      setMeldung({ ok: true, text: `Auftrag ${nr} an ${namen.get(p.felder.partner_betrieb) ?? 'den Partner'} gesendet. Der Partner wird in seiner Glocke benachrichtigt.` });
      await lade();
    } catch (e) {
      setMeldung({ ok: false, text: e instanceof Error ? e.message : 'Fehler beim Senden.' });
    } finally { setBusy(false); }
  }

  async function status(a: Auftrag, akt: Aktion, grundText: string) {
    const g = grundPruefen(akt, grundText);
    if (!g.ok) { setMeldung({ ok: false, text: g.fehler }); return; }
    if (akt.rueckfrage && typeof window !== 'undefined' && !window.confirm(akt.rueckfrage)) return;
    setBusy(true); setMeldung(null);
    const { error } = await supabase.rpc('p278_status', { p_auftrag: a.id, p_neu: akt.neu, p_grund: g.grund });
    setBusy(false);
    if (error) { setMeldung({ ok: false, text: fehlerText(error) }); return; }
    setGrund(null);
    setMeldung({ ok: true, text: `Auftrag ${a.nummer}: ${statusName(akt.neu)}.` });
    await lade();
  }

  async function freigabe(a: Auftrag, feld: 'freigabe_fotos' | 'freigabe_fin' | 'freigabe_km', wert: boolean) {
    setBusy(true); setMeldung(null);
    const { data, error } = await supabase.from('partner_auftrag').update({ [feld]: wert }).eq('id', a.id).select('id');
    setBusy(false);
    if (error || nichtsGeschrieben(data)) { setMeldung({ ok: false, text: error ? fehlerText(error) : NICHT_GESPEICHERT }); return; }
    await lade();
  }

  if (fehltSql) {
    return <div style={k.karte}><h3 style={k.h3}>Partner</h3><div style={k.dim}>Das Partner-Netzwerk ist noch nicht eingerichtet (SQL Paket 278 fehlt).</div></div>;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={k.karte}>
        <h3 style={k.h3}>Auftrag an einen Partner-Betrieb</h3>
        <div style={k.dim}>Lackierer, Aufbereiter, Sattler, Gutachter … Der Partner arbeitet in seinem eigenen ARGONAUT und sieht nur dieses Fahrzeug — ohne Preise und ohne Kunde.</div>
        {auswahl.length === 0 ? (
          <div style={{ ...k.hinweis, marginTop: 10 }}>
            Noch kein Partner verbunden. <a href="/dashboard/kfz/partner?reiter=verbindungen" style={k.link}>Partner-Netzwerk öffnen →</a> Dort erstellt die Geschäftsleitung einen Einladungs-Code.
          </div>
        ) : darfSchreiben ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, marginTop: 10 }}>
              <label style={k.lab}>Partner
                <select style={k.inp} value={neu.partner_betrieb} onChange={(x) => setNeu({ ...neu, partner_betrieb: x.target.value })}>
                  <option value="">— wählen —</option>
                  {auswahl.map((p) => <option key={p.betrieb} value={p.betrieb}>{p.name}</option>)}
                </select>
              </label>
              <label style={k.lab}>Was ist zu tun?<input style={k.inp} value={neu.titel} maxLength={120} placeholder="z. B. Stoßfänger hinten lackieren" onChange={(x) => setNeu({ ...neu, titel: x.target.value })} /></label>
              <label style={k.lab}>Fertig bis<input type="date" style={k.inp} value={neu.faellig_am} onChange={(x) => setNeu({ ...neu, faellig_am: x.target.value })} /></label>
            </div>
            <label style={{ ...k.lab, marginTop: 8 }}>Beschreibung (optional)
              <textarea style={{ ...k.inp, minHeight: 60, fontFamily: 'inherit' }} value={neu.beschreibung} maxLength={1000} onChange={(x) => setNeu({ ...neu, beschreibung: x.target.value })} />
            </label>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
              <label style={k.haken}><input type="checkbox" checked={neu.freigabe_km} onChange={(x) => setNeu({ ...neu, freigabe_km: x.target.checked })} />Kilometerstand zeigen</label>
              <label style={k.haken}><input type="checkbox" checked={neu.freigabe_fin} onChange={(x) => setNeu({ ...neu, freigabe_fin: x.target.checked })} />FIN zeigen</label>
              <label style={k.haken}><input type="checkbox" checked={neu.freigabe_fotos} onChange={(x) => setNeu({ ...neu, freigabe_fotos: x.target.checked })} />Fahrzeugfotos zeigen</label>
            </div>
            <div style={{ ...k.vorschau, marginTop: 8 }}>
              <div><b style={{ color: C.ok }}>Der Partner sieht:</b> {vorschau.sieht.join(' · ')}</div>
              <div><b style={{ color: C.bad }}>Nie:</b> {vorschau.nie.join(' · ')}</div>
            </div>
            <button style={{ ...k.gold, marginTop: 10 }} disabled={busy} onClick={() => void senden()}>Auftrag an Partner senden</button>
          </>
        ) : <div style={{ ...k.dim, marginTop: 8 }}>Aufträge an Partner vergeben nur Personen mit Schreibrecht „Kfz".</div>}
        {meldung && <div style={{ marginTop: 8, fontSize: 13, color: meldung.ok ? C.ok : C.bad }}>{meldung.text}</div>}
      </div>

      {auftraege.map((a) => {
        const eig: VerlaufEintrag[] = eintraege.filter((e) => e.auftrag_id === a.id).map((e) => ({ ...e, fotos: (e.fotos ?? []).length }));
        const knoepfe = aktionen('auftraggeber', a.status, darfSchreiben);
        const offen = laeuft(a.status);
        return (
          <div key={a.id} style={k.karte}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800 }}>{a.nummer} · {a.titel}</div>
                <div style={k.dim}>an {namen.get(a.partner_betrieb) ?? 'Partner (Verbindung getrennt)'} · erstellt {de(a.erstellt_am)} · fertig bis {de(a.faellig_am)}
                  {ueberfaellig(a, heute()) && <span style={{ color: C.bad, fontWeight: 700 }}> · überfällig</span>}</div>
              </div>
              <span style={{ ...k.badge, color: FARBE[statusStufe(a.status)], borderColor: FARBE[statusStufe(a.status)] }}>{statusName(a.status)}</span>
            </div>
            {a.beschreibung && <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, marginTop: 6 }}>{a.beschreibung}</div>}
            {a.status_grund && <div style={{ ...k.dim, marginTop: 4 }}>Grund: {a.status_grund}</div>}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
              {(['freigabe_km', 'freigabe_fin', 'freigabe_fotos'] as const).map((f) => (
                <label key={f} style={{ ...k.haken, opacity: offen && darfSchreiben ? 1 : 0.6 }}>
                  <input type="checkbox" checked={a[f]} disabled={!offen || !darfSchreiben || busy} onChange={(x) => void freigabe(a, f, x.target.checked)} />
                  {f === 'freigabe_km' ? 'km' : f === 'freigabe_fin' ? 'FIN' : 'Fotos'} freigegeben
                </label>
              ))}
            </div>
            {knoepfe.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {knoepfe.map((akt) => (
                  <button key={akt.neu} style={akt.neu === 'beendet' ? k.gold : k.aus} disabled={busy}
                    onClick={() => (akt.grund === 'nein' ? void status(a, akt, '') : setGrund({ auftrag: a.id, aktion: akt, text: '' }))}>{akt.text}</button>
                ))}
              </div>
            )}
            {grund && grund.auftrag === a.id && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <input style={{ ...k.inp, flex: '1 1 220px' }} value={grund.text} maxLength={300}
                  placeholder={grund.aktion.grund === 'pflicht' ? 'Grund (Pflicht)' : 'Grund (optional)'} onChange={(x) => setGrund({ ...grund, text: x.target.value })} />
                <button style={k.gold} disabled={busy} onClick={() => void status(a, grund.aktion, grund.text)}>{grund.aktion.text}</button>
                <button style={k.aus} onClick={() => setGrund(null)}>Abbrechen</button>
              </div>
            )}
            <PartnerVerlauf auftragId={a.id} eintraege={eig} eigeneSeite="auftraggeber" darfSchreiben={darfSchreiben} onNeu={() => void lade()} />
          </div>
        );
      })}
    </div>
  );
}

const k: Record<string, CSSProperties> = {
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0, color: C.text },
  h3: { margin: '0 0 6px', fontSize: 15, fontWeight: 800 },
  dim: { color: C.dim, fontSize: 12.5 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim, minWidth: 0 },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0 },
  haken: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  aus: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13 },
  badge: { border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, alignSelf: 'flex-start' },
  hinweis: { background: 'rgba(201,168,76,0.08)', border: `1px solid rgba(201,168,76,0.35)`, borderRadius: 8, padding: '10px 12px', fontSize: 13.5 },
  vorschau: { background: C.navy, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, display: 'grid', gap: 4 },
  link: { color: C.gold, textDecoration: 'none', fontWeight: 700, fontSize: 13 },
};
