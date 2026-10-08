'use client';

// ============================================================
// ARGONAUT OS · Paket 278 · K18 Partner-Netzwerk  (/dashboard/kfz/partner)
//
// Drei Reiter:
//  1) Aufträge von Partnern — was MEIN Betrieb als Partner bekommen hat
//     (gelesen über rpc p278_eingang / p278_eingang_detail: nur Positivliste
//     des Fahrzeugs, nur solange der Auftrag läuft und die Verbindung besteht)
//  2) Meine Aufträge an Partner — Überblick über alle Fahrzeuge (eigene Tabelle, RLS)
//  3) Verbindungen — Einladungs-Code erstellen, Code eingeben, trennen
//     (nur Geschäftsleitung; rpc p278_einladen / p278_annehmen / p278_trennen)
// Sprung von der Glocke: ?auftrag=<id> öffnet den Auftrag im Reiter 1.
// ============================================================

import { useCallback, useEffect, useMemo, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Leerzustand from '../../_components/Leerzustand';
import {
  aktionen, codeNorm, einladungsText, fahrzeugZeilen, fehlerText, grundPruefen, partnerName, statusName, statusStufe, ueberfaellig, verbindungLage,
  type Aktion, type PartnerFahrzeug, type Verbindung,
} from '@/lib/partnerNetzwerk';
import PartnerVerlauf, { type VerlaufEintrag } from './PartnerVerlauf';
import RechnungEinreichen, { type EingereichteRechnung } from './RechnungEinreichen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);
const C = { navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.25)', ok: '#4CAF7D', warn: '#E0A24C', bad: '#E06666', info: '#5FA8E8' };
const FARBE: Record<string, string> = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info, dim: C.dim };

type Reiter = 'eingang' | 'ausgang' | 'verbindungen';
type Kopf = { id: string; nummer: string; titel: string; faellig_am: string | null; status: string; status_grund: string | null; erstellt_am: string; fahrzeug_titel: string | null; auftraggeber: string | null; aktiv: boolean };
type Detail = Kopf & { beschreibung: string | null; darf_schreiben: boolean; fahrzeug?: PartnerFahrzeug; fotos?: string[]; eintraege?: VerlaufEintrag[] };
type Ausgang = { id: string; nummer: string; titel: string; status: string; faellig_am: string | null; erstellt_am: string; partner_betrieb: string; bezug_id: string; fahrzeug_titel: string | null };

function heute(): string { return new Date().toISOString().slice(0, 10); }
function de(iso: string | null | undefined): string { if (!iso) return '—'; const p = iso.slice(0, 10).split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }

export default function PartnerNetzwerkSeite() {
  const [reiter, setReiter] = useState<Reiter>('eingang');
  const [ich, setIch] = useState<string | null>(null);
  const [chef, setChef] = useState(false);
  const [firma, setFirma] = useState('');
  const [verb, setVerb] = useState<Verbindung[]>([]);
  const [eingang, setEingang] = useState<Kopf[]>([]);
  const [ausgang, setAusgang] = useState<Ausgang[]>([]);
  const [offen, setOffen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  // Paket 279: Rechnungen zum geöffneten Auftrag (null = SQL 279 fehlt)
  const [rech, setRech] = useState<{ erlaubt: boolean; rechnungen: EingereichteRechnung[] } | null>(null);
  const [fehltSql, setFehltSql] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const [notiz, setNotiz] = useState('');
  const [neuerCode, setNeuerCode] = useState<{ code: string; bis: string } | null>(null);
  const [codeEingabe, setCodeEingabe] = useState('');
  const [grund, setGrund] = useState<{ aktion: Aktion; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const a = q.get('auftrag');
      const r = q.get('reiter');
      if (a && /^[0-9a-f-]{36}$/i.test(a)) { setReiter('eingang'); setOffen(a); }
      else if (r === 'ausgang' || r === 'verbindungen') setReiter(r);
    } catch { /* ohne Adresszeile weiter */ }
  }, []);

  const lade = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [c, v, e, a, p] = await Promise.all([
      supabase.rpc('mein_chef_id'),
      supabase.from('betrieb_partner').select('*').order('erstellt_am', { ascending: false }),
      supabase.rpc('p278_eingang'),
      supabase.from('partner_auftrag').select('id, nummer, titel, status, faellig_am, erstellt_am, partner_betrieb, bezug_id, fahrzeug_titel').order('erstellt_am', { ascending: false }).limit(300),
      supabase.from('profiles').select('firma_name').eq('id', user.id).maybeSingle(),
    ]);
    const chefId = typeof c.data === 'string' && c.data ? c.data : null;
    setIch(chefId ?? user.id);
    setChef(!chefId);
    setFirma(((p.data as { firma_name?: string | null } | null)?.firma_name ?? '').trim());
    setFehltSql(!!v.error || !!e.error);
    setVerb(v.error ? [] : (((v.data as unknown) as Verbindung[]) ?? []));
    setEingang(e.error ? [] : (((e.data as unknown) as Kopf[]) ?? []));
    setAusgang(a.error ? [] : (((a.data as unknown) as Ausgang[]) ?? []));
    setGeladen(true);
  }, []);

  const ladeDetail = useCallback(async (id: string) => {
    const [{ data, error }, r] = await Promise.all([
      supabase.rpc('p278_eingang_detail', { p_auftrag: id }),
      supabase.rpc('p279_meine_rechnungen', { p_auftrag: id }),
    ]);
    setRech(r.error || !r.data ? null : (r.data as { erlaubt: boolean; rechnungen: EingereichteRechnung[] }));
    if (error) { setMeldung({ ok: false, text: fehlerText(error) }); setDetail(null); return; }
    setDetail((data as Detail | null) ?? null);
  }, []);

  useEffect(() => { void lade(); }, [lade]);
  useEffect(() => { if (offen) void ladeDetail(offen); else setDetail(null); }, [offen, ladeDetail]);

  const namen = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of verb) {
      const anderer = v.anfrager_betrieb === ich ? v.partner_betrieb : v.anfrager_betrieb;
      if (anderer && !m.has(anderer)) m.set(anderer, partnerName(v, ich));
    }
    return m;
  }, [verb, ich]);

  const jetzt = new Date().toISOString();
  const verbunden = verb.filter((v) => verbindungLage(v, jetzt) === 'verbunden');
  const einladungen = verb.filter((v) => verbindungLage(v, jetzt) === 'einladung_offen' && v.anfrager_betrieb === ich);
  const frueher = verb.filter((v) => ['getrennt', 'einladung_abgelaufen'].includes(verbindungLage(v, jetzt)));
  const laufendEin = eingang.filter((x) => x.aktiv).length;

  async function einladen() {
    setBusy(true); setMeldung(null);
    const { data, error } = await supabase.rpc('p278_einladen', { p_notiz: notiz });
    setBusy(false);
    if (error) { setMeldung({ ok: false, text: fehlerText(error) }); return; }
    const d = data as { code: string; code_bis: string };
    setNeuerCode({ code: d.code, bis: d.code_bis }); setNotiz('');
    await lade();
  }

  async function annehmen() {
    const c = codeNorm(codeEingabe);
    if (!c) { setMeldung({ ok: false, text: 'Der Code hat 12 Zeichen, z. B. 3F9A-0C21-B7D4.' }); return; }
    setBusy(true); setMeldung(null);
    const { data, error } = await supabase.rpc('p278_annehmen', { p_code: c });
    setBusy(false);
    if (error) { setMeldung({ ok: false, text: fehlerText(error) }); return; }
    setCodeEingabe('');
    setMeldung({ ok: true, text: `Verbunden mit ${(data as { partner?: string } | null)?.partner || 'dem Partner-Betrieb'}.` });
    await lade();
  }

  async function trennen(v: Verbindung) {
    const lage = verbindungLage(v, new Date().toISOString());
    const frage = lage === 'verbunden'
      ? `Verbindung mit ${partnerName(v, ich)} trennen? Laufende Aufträge in beide Richtungen enden sofort, der Partner sieht keine Fahrzeugdaten mehr.`
      : 'Einladung zurückziehen? Der Code wird ungültig.';
    if (typeof window !== 'undefined' && !window.confirm(frage)) return;
    setBusy(true); setMeldung(null);
    const { data, error } = await supabase.rpc('p278_trennen', { p_id: v.id });
    setBusy(false);
    if (error) { setMeldung({ ok: false, text: fehlerText(error) }); return; }
    const n = (data as { auftraege?: number } | null)?.auftraege ?? 0;
    setMeldung({ ok: true, text: lage === 'verbunden' ? `Getrennt.${n ? ` ${n} laufende Aufträge wurden beendet.` : ''}` : 'Einladung zurückgezogen.' });
    await lade();
  }

  async function status(akt: Aktion, grundText: string) {
    if (!detail) return;
    const g = grundPruefen(akt, grundText);
    if (!g.ok) { setMeldung({ ok: false, text: g.fehler }); return; }
    if (akt.rueckfrage && typeof window !== 'undefined' && !window.confirm(akt.rueckfrage)) return;
    setBusy(true); setMeldung(null);
    const { error } = await supabase.rpc('p278_status', { p_auftrag: detail.id, p_neu: akt.neu, p_grund: g.grund });
    setBusy(false);
    if (error) { setMeldung({ ok: false, text: fehlerText(error) }); return; }
    setGrund(null);
    setMeldung({ ok: true, text: `Auftrag ${detail.nummer}: ${statusName(akt.neu)}.` });
    await Promise.all([lade(), ladeDetail(detail.id)]);
  }

  async function kopieren(t: string) {
    try { await navigator.clipboard.writeText(t); setMeldung({ ok: true, text: 'In die Zwischenablage kopiert.' }); }
    catch { setMeldung({ ok: false, text: 'Kopieren ging nicht — bitte den Text markieren und kopieren.' }); }
  }

  return (
    <div style={s.seite}>
      <h1 style={s.h1}>🤝 Partner-Netzwerk</h1>
      <div style={s.sogehts}>
        <b>So geht&apos;s:</b> Die Geschäftsleitung erstellt unter „Verbindungen" einen Einladungs-Code und gibt ihn dem Partner-Betrieb (Lackierer, Aufbereiter, Gutachter …).
        Der Partner gibt den Code in seinem ARGONAUT ein — fertig. Danach vergeben Sie in der Handelsakte (Reiter „Partner") Aufträge am Fahrzeug — Partner ohne ARGONAUT bekommen einen Gast-Link.
        Der Partner sieht nur dieses Fahrzeug, nie Preise oder Kunden, und nur solange der Auftrag läuft. Beide Seiten schreiben Einträge mit Fotos — nicht änderbar. Ihre Rechnung reichen Sie im Auftrag ein; der Auftraggeber übernimmt sie in Belegeingang und Kalkulation.
        Trennen ist jederzeit möglich.
      </div>

      {fehltSql && <div style={s.warn}>Das Partner-Netzwerk ist noch nicht eingerichtet (SQL Paket 278 fehlt).</div>}

      <div style={s.reiter} role="tablist">
        {([['eingang', `Aufträge von Partnern${laufendEin ? ` (${laufendEin})` : ''}`], ['ausgang', 'Meine Aufträge an Partner'], ['verbindungen', `Verbindungen (${verbunden.length})`]] as [Reiter, string][]).map(([key, name]) => (
          <button key={key} role="tab" aria-selected={reiter === key} style={reiter === key ? s.reiterAn : s.reiterAus} onClick={() => { setReiter(key); setMeldung(null); }}>{name}</button>
        ))}
      </div>
      {meldung && <div style={{ margin: '0 0 10px', fontSize: 13.5, color: meldung.ok ? C.ok : C.bad }}>{meldung.text}</div>}

      {/* 1) Eingang ---------------------------------------------------------------- */}
      {reiter === 'eingang' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {geladen && eingang.length === 0 && (
            <Leerzustand icon="🤝" titel="Noch keine Aufträge von Partnern" text="Wenn ein verbundener Betrieb Ihnen einen Auftrag an einem Fahrzeug gibt, erscheint er hier — mit Glocke." />
          )}
          {eingang.map((x) => (
            <div key={x.id} style={{ ...s.karte, borderColor: offen === x.id ? C.gold : C.border }}>
              <button style={s.zeileKnopf} onClick={() => setOffen(offen === x.id ? null : x.id)}>
                <div style={{ textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{x.titel}</div>
                  <div style={s.dim}>{x.auftraggeber || 'Partner'} · {x.nummer} · {x.fahrzeug_titel || 'Fahrzeug'} · fertig bis {de(x.faellig_am)}
                    {ueberfaellig(x, heute()) && <span style={{ color: C.bad, fontWeight: 700 }}> · überfällig</span>}</div>
                </div>
                <span style={{ ...s.badge, color: FARBE[statusStufe(x.status)], borderColor: FARBE[statusStufe(x.status)] }}>{statusName(x.status)}</span>
              </button>
              {offen === x.id && detail && detail.id === x.id && (
                <div style={{ marginTop: 10 }}>
                  {detail.beschreibung && <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, marginBottom: 8 }}>{detail.beschreibung}</div>}
                  {detail.status_grund && <div style={{ ...s.dim, marginBottom: 6 }}>Grund: {detail.status_grund}</div>}
                  {!detail.aktiv ? (
                    <div style={s.dim}>Dieser Auftrag ist abgeschlossen (oder die Verbindung getrennt). Fahrzeugdaten und Verlauf sind nicht mehr sichtbar.</div>
                  ) : (
                    <>
                      <div style={s.tabelle}>
                        {fahrzeugZeilen(detail.fahrzeug).map(([a, b]) => (
                          <div key={a} style={{ display: 'contents' }}><span style={s.dim}>{a}</span><span style={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>{b}</span></div>
                        ))}
                      </div>
                      {(detail.fotos ?? []).length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          {(detail.fotos ?? []).map((m) => (
                            <a key={m} href={`/api/partner/fahrzeugbild?a=${detail.id}&m=${m}`} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`/api/partner/fahrzeugbild?a=${detail.id}&m=${m}`} alt="Fahrzeugfoto" style={s.bild} loading="lazy" />
                            </a>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        {aktionen('partner', detail.status, detail.darf_schreiben).map((akt) => (
                          <button key={akt.neu} style={akt.neu === 'abgelehnt' ? s.aus : s.gold} disabled={busy}
                            onClick={() => (akt.grund === 'nein' ? void status(akt, '') : setGrund({ aktion: akt, text: '' }))}>{akt.text}</button>
                        ))}
                      </div>
                      {grund && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                          <input style={{ ...s.inp, flex: '1 1 220px' }} value={grund.text} maxLength={300}
                            placeholder={grund.aktion.grund === 'pflicht' ? 'Grund (Pflicht)' : 'Notiz zur Fertigmeldung (optional)'} onChange={(e) => setGrund({ ...grund, text: e.target.value })} />
                          <button style={s.gold} disabled={busy} onClick={() => void status(grund.aktion, grund.text)}>{grund.aktion.text}</button>
                          <button style={s.aus} onClick={() => setGrund(null)}>Abbrechen</button>
                        </div>
                      )}
                      <PartnerVerlauf auftragId={detail.id} eintraege={detail.eintraege ?? []} eigeneSeite="partner"
                        darfSchreiben={detail.darf_schreiben} onNeu={() => void ladeDetail(detail.id)} />
                    </>
                  )}
                  {rech && (rech.erlaubt || rech.rechnungen.length > 0) && (
                    <RechnungEinreichen rechnungen={rech.rechnungen} erlaubt={rech.erlaubt} onNeu={() => void ladeDetail(detail.id)}
                      senden={async (fd) => {
                        fd.append('auftrag', detail.id);
                        const res = await fetch('/api/partner/rechnung', { method: 'POST', body: fd });
                        const j = await res.json().catch(() => ({}));
                        return res.ok ? { ok: true, text: 'Rechnung eingereicht. Der Auftraggeber prüft sie und übernimmt sie in seine Buchhaltung.' } : { ok: false, text: j?.error || 'Die Rechnung wurde nicht angenommen.' };
                      }} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 2) Ausgang ----------------------------------------------------------------- */}
      {reiter === 'ausgang' && (
        <div style={s.karte}>
          {ausgang.length === 0 ? (
            <div style={s.dim}>Noch keine Aufträge an Partner. Aufträge vergeben Sie in der Handelsakte eines Fahrzeugs, Reiter „Partner".</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {ausgang.map((a) => (
                <div key={a.id} style={s.zeile}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{a.nummer} · {a.titel}</div>
                    <div style={s.dim}>{a.fahrzeug_titel || 'Fahrzeug'} · an {namen.get(a.partner_betrieb) ?? 'Partner'} · fertig bis {de(a.faellig_am)}
                      {ueberfaellig(a, heute()) && <span style={{ color: C.bad, fontWeight: 700 }}> · überfällig</span>}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ ...s.badge, color: FARBE[statusStufe(a.status)], borderColor: FARBE[statusStufe(a.status)] }}>{statusName(a.status)}</span>
                    <a href={`/dashboard/kfz/bestand/${a.bezug_id}?reiter=partner`} style={s.link}>Zur Akte →</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3) Verbindungen --------------------------------------------------------------- */}
      {reiter === 'verbindungen' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {chef ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              <div style={s.karte}>
                <h3 style={s.h3}>Partner einladen</h3>
                <div style={s.dim}>Code erstellen und dem Partner-Betrieb geben (Mail, Telefon, WhatsApp). 14 Tage gültig, nur einmal verwendbar.</div>
                <label style={{ ...s.lab, marginTop: 8 }}>Für wen? (nur für Sie)<input style={s.inp} value={notiz} maxLength={200} placeholder="z. B. Lackiererei Muster" onChange={(e) => setNotiz(e.target.value)} /></label>
                <button style={{ ...s.gold, marginTop: 8 }} disabled={busy} onClick={() => void einladen()}>Einladungs-Code erstellen</button>
                {neuerCode && (
                  <div style={{ ...s.codeBox, marginTop: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: C.gold }}>{neuerCode.code}</div>
                    <div style={s.dim}>gültig bis {de(neuerCode.bis)}</div>
                    <button style={{ ...s.aus, marginTop: 6 }} onClick={() => void kopieren(einladungsText(firma, neuerCode.code, neuerCode.bis))}>Einladungstext kopieren</button>
                  </div>
                )}
              </div>
              <div style={s.karte}>
                <h3 style={s.h3}>Code eingeben</h3>
                <div style={s.dim}>Sie haben einen Code von einem anderen Betrieb bekommen? Hier eingeben — danach sind Sie verbunden.</div>
                <input style={{ ...s.inp, marginTop: 8, letterSpacing: 2, textTransform: 'uppercase' }} value={codeEingabe} maxLength={20} placeholder="XXXX-XXXX-XXXX" onChange={(e) => setCodeEingabe(e.target.value)} />
                <button style={{ ...s.gold, marginTop: 8 }} disabled={busy} onClick={() => void annehmen()}>Verbinden</button>
              </div>
            </div>
          ) : <div style={s.hinweis}>Verbinden und Trennen macht die Geschäftsleitung.</div>}

          <div style={s.karte}>
            <h3 style={s.h3}>Verbundene Betriebe</h3>
            {verbunden.length === 0 && <div style={s.dim}>Noch keine Verbindung.</div>}
            {verbunden.map((v) => (
              <div key={v.id} style={s.zeile}>
                <div><div style={{ fontWeight: 700 }}>{partnerName(v, ich)}</div><div style={s.dim}>verbunden seit {de(v.angenommen_am)} · {v.anfrager_betrieb === ich ? 'von Ihnen eingeladen' : 'hat Sie eingeladen'}</div></div>
                {chef && <button style={s.aus} disabled={busy} onClick={() => void trennen(v)}>Trennen</button>}
              </div>
            ))}
          </div>

          {einladungen.length > 0 && (
            <div style={s.karte}>
              <h3 style={s.h3}>Offene Einladungen</h3>
              {einladungen.map((v) => (
                <div key={v.id} style={s.zeile}>
                  <div><div style={{ fontWeight: 700, letterSpacing: 1 }}>{v.code}</div><div style={s.dim}>{v.notiz || 'ohne Notiz'} · gültig bis {de(v.code_bis)}</div></div>
                  {chef && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {v.code && v.code_bis && <button style={s.aus} onClick={() => void kopieren(einladungsText(firma, v.code as string, v.code_bis as string))}>Text kopieren</button>}
                      <button style={s.aus} disabled={busy} onClick={() => void trennen(v)}>Zurückziehen</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {frueher.length > 0 && (
            <div style={s.karte}>
              <h3 style={s.h3}>Früher</h3>
              {frueher.map((v) => (
                <div key={v.id} style={s.zeile}>
                  <div style={s.dim}>{v.status === 'getrennt' ? `${partnerName(v, ich)} — getrennt am ${de(v.getrennt_am)}` : `Einladung ${v.notiz ? `für ${v.notiz} ` : ''}abgelaufen`}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  seite: { padding: '20px 16px 60px', maxWidth: 1100, margin: '0 auto', color: C.text },
  h1: { fontSize: 22, fontWeight: 800, margin: '0 0 10px' },
  h3: { margin: '0 0 6px', fontSize: 15, fontWeight: 800 },
  sogehts: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 13.5, color: C.dim, lineHeight: 1.5 },
  warn: { background: 'rgba(224,102,102,0.1)', border: `1px solid ${C.bad}`, borderRadius: 8, padding: '10px 12px', marginTop: 10, fontSize: 13.5 },
  hinweis: { background: 'rgba(201,168,76,0.08)', border: `1px solid rgba(201,168,76,0.35)`, borderRadius: 8, padding: '10px 12px', fontSize: 13.5 },
  reiter: { display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 10px' },
  reiterAn: { background: C.navy2, border: `1px solid ${C.gold}`, color: C.gold, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  reiterAus: { background: C.navy2, border: `1px solid ${C.border}`, color: C.dim, borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  karte: { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, minWidth: 0 },
  zeileKnopf: { display: 'flex', justifyContent: 'space-between', gap: 10, width: '100%', background: 'transparent', border: 'none', color: C.text, cursor: 'pointer', padding: 0, flexWrap: 'wrap' },
  zeile: { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', borderTop: `1px solid ${C.border}`, padding: '8px 0' },
  dim: { color: C.dim, fontSize: 12.5 },
  lab: { display: 'grid', gap: 4, fontSize: 12.5, color: C.dim, minWidth: 0 },
  inp: { background: C.navy, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 14, minWidth: 0, width: '100%', boxSizing: 'border-box' },
  gold: { background: C.gold, border: `1px solid ${C.gold}`, color: C.navy, borderRadius: 8, padding: '7px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  aus: { background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13 },
  badge: { border: '1px solid', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, alignSelf: 'flex-start', whiteSpace: 'nowrap' },
  tabelle: { display: 'grid', gridTemplateColumns: 'minmax(110px, auto) 1fr', gap: '4px 12px', background: C.navy, borderRadius: 8, padding: '8px 10px' },
  bild: { width: 110, height: 80, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}`, background: C.navy },
  codeBox: { background: C.navy, border: `1px dashed ${C.gold}`, borderRadius: 10, padding: '10px 12px' },
  link: { color: C.gold, textDecoration: 'none', fontWeight: 700, fontSize: 13 },
};
