'use client';

// ============================================================
// ARGONAUT OS · Paket PS3 · Impf-Erinnerung an Halter (Tier)
//   Aus den Behandlungen mit „nächste fällig" (Tier-Fachpaket) die anstehenden
//   Wiederholungen: je Tier und Impfung zählt nur die neueste Behandlung.
//   Erinnert wird nur mit Einwilligung des Halters (je Tier festgehalten).
//   E-Mail -> landet in „Erinnerungen" und wird dort verschickt; Telefon/SMS ->
//   nur als erledigt protokolliert.
// Keine medizinische Empfehlung im Text — nur der Termin-Hinweis aus der Kartei.
// Logik: lib/kundenVorgaenge.ts (getestet). SQL: supabase-sql/ps3-kunden-vorgaenge.sql.
// Unterpfad von /dashboard/tier (erbt dessen Freigabe).
// Pfad: app/dashboard/tier/erinnerung/page.tsx
// ============================================================

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  IMPF_VORLAUF_TAGE, impfListe, impfText, heuteBerlin, datumDe,
  type TierLite, type BehandlungLite, type TierErinnerungLite,
} from '@/lib/kundenVorgaenge';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 };
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
const knopf: CSSProperties = { background: 'transparent', color: C.cyan, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' };
const primaer: CSSProperties = { ...knopf, background: C.gold, color: C.navy, border: 'none', fontWeight: 800 };
const STUFE: Record<string, string> = { ueberfaellig: C.danger, bald: C.warn, spaeter: C.green };

type Tier = TierLite & { art: string | null; halter_email: string | null; halter_telefon: string | null; erinnerung_ok_am: string | null };
type Erinnert = TierErinnerungLite & { kanal: string | null };

export default function ImpfErinnerungSeite() {
  const heute = heuteBerlin();
  const [tab, setTab] = useState<'faellig' | 'halter'>('faellig');
  const [uid, setUid] = useState<string | null>(null);
  const [besitzer, setBesitzer] = useState<string | null>(null);
  const [tiere, setTiere] = useState<Tier[]>([]);
  const [beh, setBeh] = useState<BehandlungLite[]>([]);
  const [erinnert, setErinnert] = useState<Erinnert[]>([]);
  const [sqlFehlt, setSqlFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [vorlauf, setVorlauf] = useState(IMPF_VORLAUF_TAGE);

  const laden = useCallback(async () => {
    setFehler(null);
    const t = await supabase.from('tier_tiere').select('id, name, art, halter, kontakt_id, halter_email, halter_telefon, erinnerung_ok, erinnerung_ok_am, erinnerung_widerruf_am').order('name', { ascending: true });
    if (t.error) { if (/halter_email|erinnerung_ok|tier_erinnerung/.test(t.error.message)) setSqlFehlt(true); else setFehler('Laden fehlgeschlagen: ' + t.error.message); return; }
    setTiere((t.data as Tier[]) ?? []);
    const [b, e] = await Promise.all([
      supabase.from('tier_behandlungen').select('id, tier_id, datum, art, bezeichnung, naechste_faellig').not('naechste_faellig', 'is', null),
      supabase.from('tier_erinnerung').select('behandlung_id, erinnert_am, kanal'),
    ]);
    if (e.error && /tier_erinnerung/.test(e.error.message)) { setSqlFehlt(true); return; }
    setBeh((b.data as BehandlungLite[]) ?? []);
    setErinnert((e.data as Erinnert[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id ?? null;
      setUid(id);
      if (id) {
        const { data: chef } = await supabase.rpc('mein_chef_id');
        // B1: owner_user_id ist der Betrieb (beim Mitarbeiter der Chef), nicht die angemeldete Person.
        setBesitzer(typeof chef === 'string' && chef ? chef : id);
      }
      await laden();
    })();
  }, [laden]);

  const liste = useMemo(() => impfListe(tiere, beh, erinnert, heute, vorlauf), [tiere, beh, erinnert, heute, vorlauf]);
  const offen = liste.filter((z) => !z.erinnert);

  function meldung(o: string | null, f: string | null = null) { setOk(o); setFehler(f); }

  async function erinnern(z: (typeof liste)[number], kanal: 'email' | 'telefon' | 'sms') {
    if (!besitzer) return;
    const tier = tiere.find((t) => t.id === z.tier.id);
    if (!z.darf) { meldung(null, z.grund); return; }
    if (kanal === 'email' && !(tier?.halter_email && /@/.test(tier.halter_email))) { meldung(null, 'Für den E-Mail-Weg fehlt die E-Mail des Halters (Reiter „Halter & Einwilligung").'); return; }
    setBusy(z.behandlung.id); meldung(null);
    try {
      let erinnerungId: string | null = null;
      if (kanal === 'email') {
        const t = impfText({ tier: z.tier.name, bezeichnung: z.behandlung.bezeichnung, faellig: z.faellig });
        const { data: e, error } = await supabase.from('erinnerung').insert({
          owner_user_id: besitzer, titel: t.titel, bezug_typ: 'frei', kanal: 'email', kunde_name: tier?.halter || null,
          email: tier?.halter_email, faellig_am: `${heute}T09:00`, status: 'offen', notiz: t.text,
        }).select('id').single();
        if (error) throw error;
        erinnerungId = (e as { id: string }).id;
      }
      const { error: e2 } = await supabase.from('tier_erinnerung').insert({ tier_id: z.tier.id, behandlung_id: z.behandlung.id, faellig: z.faellig, erinnert_am: heute, kanal, erinnerung_id: erinnerungId });
      if (e2) throw e2;
      meldung(kanal === 'email' ? 'Erinnerung vorgemerkt — Versand unter „Erinnerungen".' : `Als ${kanal === 'telefon' ? 'telefonisch' : 'per SMS'} erinnert protokolliert.`);
      await laden();
    } catch (err) { meldung(null, 'Speichern fehlgeschlagen: ' + (err instanceof Error ? err.message : 'Fehler')); }
    finally { setBusy(null); }
  }

  return (
    <div style={{ color: C.text, maxWidth: 1200, margin: '0 auto', padding: '8px 4px 40px' }}>
      <div style={{ color: C.gold, fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>ARGONAUT OS · Tier</div>
      <h1 style={{ margin: '4px 0 6px', fontSize: 'clamp(26px,2.25vw,36px)', fontWeight: 800 }}>💉 Impf-Erinnerung</h1>
      <p style={{ margin: '0 0 14px', color: C.textDim }}>Wer ist bald dran? Aus der Tierkartei, mit Einwilligung des Halters — per E-Mail, Telefon oder SMS. <a href="/dashboard/tier" style={{ color: C.cyan }}>← Zur Tierkartei</a></p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {([['faellig', `🔔 Anstehend${offen.length ? ` · ${offen.length}` : ''}`], ['halter', '👤 Halter & Einwilligung']] as const).map(([k, t]) => (
          <button key={k} onClick={() => { setTab(k); meldung(null); }} style={{ ...knopf, ...(tab === k ? { background: C.gold, color: C.navy, fontWeight: 800, border: 'none' } : {}) }}>{t}</button>
        ))}
      </div>

      {sqlFehlt && <div style={{ ...karte, borderColor: C.warn }}>Die Erinnerungs-Felder sind noch nicht eingerichtet (SQL von Paket PS3 fehlt).</div>}
      {fehler && <div style={{ ...karte, borderColor: C.danger, color: C.danger }}>{fehler}</div>}
      {ok && <div style={{ ...karte, borderColor: C.green, color: C.green }}>{ok}</div>}

      {!sqlFehlt && tab === 'faellig' && (
        <div style={karte}>
          <label>Vorlauf <select style={feld} value={vorlauf} onChange={(e) => setVorlauf(Number(e.target.value))}>{[7, 14, 21, 30, 60].map((t) => <option key={t} value={t}>{t} Tage</option>)}</select></label>
          {liste.length === 0 && <div style={{ color: C.textDim, marginTop: 8 }}>In diesem Zeitraum steht nichts an. Tragen Sie in der Tierkartei bei Impfungen „nächste fällig" ein.</div>}
          {liste.map((z) => (
            <div key={z.behandlung.id} style={{ borderTop: `1px solid ${C.border}`, padding: '10px 0', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', opacity: z.erinnert ? 0.6 : 1 }}>
              <div>
                <b>{z.tier.name}</b> · {z.behandlung.bezeichnung} · <span style={{ color: STUFE[z.stufe] }}>{z.tage < 0 ? `seit ${-z.tage} Tagen fällig` : z.tage === 0 ? 'heute fällig' : `fällig am ${datumDe(z.faellig)} (in ${z.tage} T.)`}</span>
                <div style={{ color: C.textDim, fontSize: 13 }}>Halter: {z.tier.halter || '—'}{z.erinnert ? ` · erinnert am ${datumDe(z.erinnert)}` : ''}</div>
                {!z.darf && <div style={{ color: C.warn, fontSize: 13 }}>⚠ {z.grund}</div>}
              </div>
              {!z.erinnert && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button style={z.darf ? primaer : knopf} disabled={!z.darf || busy === z.behandlung.id} onClick={() => erinnern(z, 'email')}>✉ E-Mail vormerken</button>
                  <button style={knopf} disabled={!z.darf || busy === z.behandlung.id} onClick={() => erinnern(z, 'telefon')}>📞 Angerufen</button>
                  <button style={knopf} disabled={!z.darf || busy === z.behandlung.id} onClick={() => erinnern(z, 'sms')}>📱 SMS gesendet</button>
                </div>
              )}
            </div>
          ))}
          <p style={{ color: C.textDim, fontSize: 12.5 }}>E-Mails verschicken Sie unter <a href="/dashboard/erinnerungen" style={{ color: C.cyan }}>Erinnerungen</a>. Ob und wann eine Wiederholungsimpfung nötig ist, entscheidet die Tierärztin/der Tierarzt — der Text nennt nur das Datum aus Ihrer Kartei.</p>
        </div>
      )}

      {!sqlFehlt && tab === 'halter' && <HalterTab tiere={tiere} heute={heute} meldung={meldung} laden={laden} />}
    </div>
  );
}

function HalterTab({ tiere, heute, meldung, laden }: { tiere: Tier[]; heute: string; meldung: (o: string | null, f?: string | null) => void; laden: () => Promise<void> }) {
  const [edit, setEdit] = useState<Record<string, { email: string; tel: string }>>({});
  const [suche, setSuche] = useState('');
  const wert = (t: Tier) => edit[t.id] ?? { email: t.halter_email ?? '', tel: t.halter_telefon ?? '' };

  async function speichern(t: Tier, extra: Record<string, unknown> = {}, text = 'Gespeichert.') {
    const w = wert(t);
    const { error } = await supabase.from('tier_tiere').update({ halter_email: w.email.trim() || null, halter_telefon: w.tel.trim() || null, ...extra }).eq('id', t.id);
    if (error) { meldung(null, 'Speichern fehlgeschlagen: ' + error.message); return; }
    meldung(text); await laden();
  }

  const sichtbar = tiere.filter((t) => !suche || `${t.name} ${t.halter ?? ''}`.toLowerCase().includes(suche.toLowerCase()));
  return (
    <div style={karte}>
      <input style={{ ...feld, width: '100%', marginBottom: 8 }} placeholder="Tier oder Halter suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      {sichtbar.map((t) => {
        const w = wert(t);
        const widerrufen = !!t.erinnerung_widerruf_am;
        return (
          <div key={t.id} style={{ borderTop: `1px solid ${C.border}`, padding: '10px 0' }}>
            <b>{t.name}</b>{t.art ? ` (${t.art})` : ''} · Halter: {t.halter || '—'}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
              <input style={{ ...feld, width: 230 }} placeholder="E-Mail des Halters" value={w.email} onChange={(e) => setEdit({ ...edit, [t.id]: { ...w, email: e.target.value } })} />
              <input style={{ ...feld, width: 170 }} placeholder="Telefon" value={w.tel} onChange={(e) => setEdit({ ...edit, [t.id]: { ...w, tel: e.target.value } })} />
              <button style={knopf} onClick={() => speichern(t)}>Speichern</button>
              {t.erinnerung_ok && !widerrufen
                ? <><span style={{ color: C.green }}>✓ Einwilligung seit {datumDe(t.erinnerung_ok_am)}</span><button style={knopf} onClick={() => speichern(t, { erinnerung_widerruf_am: heute }, 'Widerruf eingetragen.')}>Widerruf eintragen</button></>
                : <button style={primaer} onClick={() => speichern(t, { erinnerung_ok: true, erinnerung_ok_am: heute, erinnerung_widerruf_am: null }, 'Einwilligung eingetragen.')}>Halter willigt ein</button>}
              {widerrufen && <span style={{ color: C.warn }}>Widerrufen am {datumDe(t.erinnerung_widerruf_am)}</span>}
            </div>
          </div>
        );
      })}
      <p style={{ color: C.textDim, fontSize: 12.5 }}>Einwilligungstext zum Vorlesen oder Aufschreiben: „Ich bin einverstanden, dass die Praxis mich per E-Mail, Telefon oder SMS an anstehende Impfungen und Vorsorgetermine meines Tieres erinnert. Ich kann das jederzeit widerrufen." Die Einwilligung gilt je Tier — bei mehreren Tieren desselben Halters bitte jeweils eintragen.</p>
    </div>
  );
}
