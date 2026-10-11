'use client';

// ============================================================
// ARGONAUT OS · Chef-Blick · „Was ARGONAUT Ihnen gespart hat" (Paket 309, SP1)
// Nur messbare Werte aus dem eigenen Datenbestand — nichts geschätzt:
//   Skonto (eingangsbelege.skonto_abzug) · Verzugszinsen (mahnung_historie,
//   nur „geltend gemacht", nicht in der Summe) · ersetzte Programme
//   (import_altsystem_wahl + eingetragene Altkosten) · THG-Prämie
//   (ersparnis_angabe) · Importe statt Abtippen (import_jobs, als Anzahl).
// Teilen (Social Media) erst nach Einwilligung des Betriebs
// (modul_einstellung „ersparnis"); geteilt werden nur Summen.
// Logik: lib/ersparnis.ts (getestet). Jede Abfrage fail-open.
// Pfad: app/dashboard/chef-blick/ErsparnisKarte.tsx
// ============================================================

import { useCallback, useEffect, useMemo, useState, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  skonto, verzug, programme, thg, importe, gesamtCent, hatWerte, euroText, teilenText, angabePruefen, volleMonate,
  ERSPARNIS_MODUL, type Angabe, type Gesamt, type BelegZeile, type MahnZeile, type ImportZeile,
} from '@/lib/ersparnis';
import { altsystem } from '@/lib/altsysteme';
import { zahlText } from '@/lib/zahlen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.gold}`, borderRadius: 12, padding: 16, marginBottom: 16 };
const knopf = (farbe: string, voll = false): CSSProperties => ({
  background: voll ? farbe : 'transparent', color: voll ? C.navy : farbe, border: `1px solid ${farbe}`,
  borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
});
const feld: CSSProperties = { background: C.navy, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', fontSize: 14, minWidth: 0 };
const datumDe = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—');

type AngabeZeile = Angabe & { id: string; notiz: string | null };

async function sicher<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try { const r = await p; return r.error ? [] : ((r.data as T[]) ?? []); } catch { return []; }
}

export default function ErsparnisKarte({ firma }: { firma: string }) {
  const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const [uid, setUid] = useState<string | null>(null);
  const [belege, setBelege] = useState<BelegZeile[]>([]);
  const [mahn, setMahn] = useState<MahnZeile[]>([]);
  const [systeme, setSysteme] = useState<string[]>([]);
  const [angaben, setAngaben] = useState<AngabeZeile[]>([]);
  const [angabenDa, setAngabenDa] = useState(false);
  const [jobs, setJobs] = useState<ImportZeile[]>([]);
  const [teilen, setTeilen] = useState<{ teilen_erlaubt?: boolean; teilen_am?: string } & Record<string, unknown>>({});
  const [laedt, setLaedt] = useState(true);
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const id = data?.user?.id ?? null;
    setUid(id);
    const [b, m, w, j] = await Promise.all([
      sicher<BelegZeile>(supabase.from('eingangsbelege').select('skonto_abzug, bezahlt_am').not('skonto_abzug', 'is', null).limit(5000)),
      sicher<MahnZeile>(supabase.from('mahnung_historie').select('rechnung_id, zins_betrag, pauschale_betrag').limit(10000)),
      sicher<{ systeme: string[] | null }>(supabase.from('import_altsystem_wahl').select('systeme').limit(1)),
      sicher<ImportZeile>(supabase.from('import_jobs').select('status, zeilen_ok').limit(5000)),
    ]);
    setBelege(b); setMahn(m); setJobs(j);
    setSysteme((w[0]?.systeme ?? []).filter((k) => typeof k === 'string'));
    try {
      const r = await supabase.from('ersparnis_angabe').select('id, art, bezeichnung, altsystem_key, betrag_cent, je, ab, notiz').order('ab', { ascending: false });
      setAngabenDa(!r.error);
      setAngaben(r.error ? [] : ((r.data as AngabeZeile[]) ?? []));
    } catch { setAngabenDa(false); }
    if (id) {
      try {
        const r = await supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', id).eq('modul', ERSPARNIS_MODUL).maybeSingle();
        setTeilen(((r.data as { einstellung?: Record<string, unknown> } | null)?.einstellung ?? {}) as typeof teilen);
      } catch { /* ohne Einstellung: nicht freigegeben */ }
    }
    setLaedt(false);
  }, []);

  useEffect(() => { void laden(); }, [laden]);

  const g: Gesamt = useMemo(() => ({
    skonto: skonto(belege, heute),
    verzug: verzug(mahn),
    programme: programme(systeme, angaben, heute, (k) => altsystem(k)?.name),
    thg: thg(angaben, heute),
    importe: importe(jobs),
  }), [belege, mahn, systeme, angaben, jobs, heute]);
  const summe = gesamtCent(g);
  const progSumme = g.programme.reduce((s, p) => s + (p.gespartCent ?? 0), 0);
  const thgListe = angaben.filter((a) => a.art === 'thg');
  const erlaubt = teilen.teilen_erlaubt === true;

  function melde(text: string, gut: boolean) { if (gut) { setOk(text); setFehler(null); } else { setFehler(text); setOk(null); } }

  async function programmSpeichern(key: string, name: string, betrag: string, ab: string) {
    const p = angabePruefen({ art: 'altprogramm', bezeichnung: name, altsystem_key: key, betrag, ab }, heute);
    if (!p.ok) { melde(p.fehler, false); return; }
    const vorhanden = angaben.find((a) => a.art === 'altprogramm' && a.altsystem_key === key);
    const r = vorhanden
      ? await supabase.from('ersparnis_angabe').update({ betrag_cent: p.zeile.betrag_cent, ab: p.zeile.ab, bezeichnung: p.zeile.bezeichnung }).eq('id', vorhanden.id)
      : await supabase.from('ersparnis_angabe').insert({ ...p.zeile, owner_user_id: uid });
    if (r.error) { melde('Speichern fehlgeschlagen: ' + r.error.message, false); return; }
    melde(`${name}: gespeichert.`, true);
    await laden();
  }

  async function angabeLoeschen(id: string) {
    const r = await supabase.from('ersparnis_angabe').delete().eq('id', id);
    if (r.error) { melde('Löschen fehlgeschlagen: ' + r.error.message, false); return; }
    melde('Angabe gelöscht.', true);
    await laden();
  }

  async function thgSpeichern(bez: string, betrag: string, ab: string): Promise<boolean> {
    const p = angabePruefen({ art: 'thg', bezeichnung: bez, betrag, ab }, heute);
    if (!p.ok) { melde(p.fehler, false); return false; }
    const r = await supabase.from('ersparnis_angabe').insert({ ...p.zeile, owner_user_id: uid });
    if (r.error) { melde('Speichern fehlgeschlagen: ' + r.error.message, false); return false; }
    melde('THG-Prämie eingetragen.', true);
    await laden();
    return true;
  }

  async function einwilligung(an: boolean) {
    if (!uid) return;
    const r0 = await supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', uid).eq('modul', ERSPARNIS_MODUL).maybeSingle();
    const aktuell = ((r0.data as { einstellung?: Record<string, unknown> } | null)?.einstellung ?? {}) as Record<string, unknown>;
    const neu = { ...aktuell, teilen_erlaubt: an, teilen_am: new Date().toISOString() };
    const r = await supabase.from('modul_einstellung').upsert({ owner_user_id: uid, modul: ERSPARNIS_MODUL, einstellung: neu, aktualisiert_am: new Date().toISOString() }, { onConflict: 'owner_user_id,modul' });
    if (r.error) { melde('Speichern fehlgeschlagen: ' + r.error.message, false); return; }
    setTeilen(neu);
    melde(an ? 'Teilen freigegeben.' : 'Freigabe zum Teilen zurückgenommen.', true);
  }

  async function textKopieren() {
    try { await navigator.clipboard.writeText(teilenText(g, firma)); melde('Text kopiert — einfügen, wo Sie ihn teilen möchten.', true); }
    catch { melde('Kopieren nicht möglich — bitte den Text unten markieren und kopieren.', false); }
  }

  function bildLaden() {
    const cv = document.createElement('canvas');
    cv.width = 1080; cv.height = 1080;
    const x = cv.getContext('2d');
    if (!x) return;
    x.fillStyle = C.navy; x.fillRect(0, 0, 1080, 1080);
    x.strokeStyle = C.gold; x.lineWidth = 6; x.strokeRect(40, 40, 1000, 1000);
    x.fillStyle = C.gold; x.font = 'bold 54px sans-serif'; x.fillText('Was ARGONAUT', 90, 170); x.fillText('uns gespart hat', 90, 235);
    const zeilen = teilenText(g, firma).split('\n');
    let y = 330;
    for (const z of zeilen) {
      x.fillStyle = z.startsWith('•') ? C.text : C.cyan;
      x.font = z.startsWith('•') ? '36px sans-serif' : 'bold 38px sans-serif';
      // einfacher Umbruch nach Wörtern
      const worte = z.split(' ');
      let teil = '';
      for (const w of worte) {
        const probe = teil ? teil + ' ' + w : w;
        if (x.measureText(probe).width > 900 && teil) { x.fillText(teil, 90, y); y += 50; teil = w; } else teil = probe;
      }
      if (teil) { x.fillText(teil, 90, y); y += 64; }
      if (y > 960) break;
    }
    x.fillStyle = C.textDim; x.font = '26px sans-serif'; x.fillText('argonaut-os.com · nur belegte Werte, nichts geschätzt', 90, 1000);
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = 'argonaut-ersparnis.png';
    a.click();
  }

  return (
    <div style={karte}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong>💰 Was ARGONAUT Ihnen gespart hat</strong>
        <button style={knopf(C.gold)} onClick={() => setOffen(!offen)}>{offen ? 'Schließen' : '✏️ Angaben & Teilen'}</button>
      </div>
      <div style={{ color: C.textDim, fontSize: 13, margin: '4px 0 12px' }}>
        Nur belegte Werte aus Ihrem ARGONAUT — nichts geschätzt, keine Pauschalen. Wo ein Wert fehlt, steht, woher er kommt.
      </div>

      {laedt ? <div style={{ color: C.textDim }}>Lädt …</div> : (
        <>
          <div style={{ fontSize: 15, marginBottom: 12 }}>
            Nachweislich im Betrieb geblieben: <b style={{ color: C.gold, fontSize: 22 }}>{euroText(summe)}</b>
            <span style={{ color: C.textDim, fontSize: 13 }}> · Skonto + abgelöste Programme + THG-Prämie</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <Kachel titel="Skonto genutzt" wert={euroText(g.skonto.gesamtCent)}
              unter={g.skonto.anzahl ? `${g.skonto.anzahl} Belege · letzte 12 Monate ${euroText(g.skonto.zwoelfMonateCent)}` : 'Beim Bezahlen eines Belegs unter Zahlungen eintragen'}
              link={g.skonto.anzahl ? undefined : '/dashboard/zahlungen'} />
            <Kachel titel="Abgelöste Programme" wert={g.programme.length ? euroText(progSumme) : '—'}
              unter={g.programme.length
                ? `${g.programme.length} ${g.programme.length === 1 ? 'Programm' : 'Programme'} laut Umzug${g.programme.some((p) => p.monatCent === null) ? ' · Kosten teils noch nicht eingetragen' : ''}`
                : 'Im Import-Center „Aus welchem System ziehen Sie um?" anhaken'}
              link={g.programme.length ? undefined : '/dashboard/import'} />
            <Kachel titel="THG-Prämie erhalten" wert={euroText(g.thg.gesamtCent)}
              unter={g.thg.anzahl ? `${g.thg.anzahl} ${g.thg.anzahl === 1 ? 'Auszahlung' : 'Auszahlungen'}` : 'Ausgezahlte Prämien unter „Angaben" eintragen'} />
            <Kachel titel="Übernommen statt abgetippt" wert={g.importe.datensaetze ? g.importe.datensaetze.toLocaleString('de-DE') : '—'}
              unter={g.importe.dateien ? `Datensätze aus ${g.importe.dateien} ${g.importe.dateien === 1 ? 'Datei' : 'Dateien'} (Import-Center)` : 'Noch keine Importe'} />
            <Kachel titel="Verzugszinsen geltend gemacht" wert={euroText(g.verzug.summeCent)}
              unter={g.verzug.rechnungen ? `Zinsen ${euroText(g.verzug.zinsenCent)} + Pauschalen ${euroText(g.verzug.pauschalenCent)} · ${g.verzug.rechnungen} ${g.verzug.rechnungen === 1 ? 'Rechnung' : 'Rechnungen'} · nicht in der Summe (ob gezahlt, zeigt der Zahlungseingang)` : 'Aus dem Mahnwesen — bisher keine'}
              farbe={C.textDim} />
          </div>
          {!hatWerte(g) && <div style={{ color: C.textDim, marginTop: 10 }}>Noch keine belegten Werte. Sie füllen sich, sobald Sie mit Skonto bezahlen, mahnen, importieren oder Angaben eintragen.</div>}
        </>
      )}

      {offen && !laedt && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 14, display: 'grid', gap: 18 }}>
          {fehler && <div style={{ color: C.danger }}>{fehler}</div>}
          {ok && <div style={{ color: C.green }}>{ok}</div>}
          {!angabenDa && <div style={{ color: C.warn }}>Die Angaben-Tabelle fehlt noch (SQL Paket 309). Skonto, Mahnungen und Importe werden trotzdem gezählt.</div>}

          <div>
            <b>🔁 Abgelöste Programme</b>
            <div style={{ color: C.textDim, fontSize: 13, margin: '4px 0 8px' }}>Was das alte Programm im Monat gekostet hat und ab wann Sie es nicht mehr bezahlen. Gezählt werden nur volle Monate.</div>
            {g.programme.length === 0 ? <div style={{ color: C.textDim }}>Noch keine Programme gewählt — im <a href="/dashboard/import" style={{ color: C.cyan }}>Import-Center</a> anhaken.</div> : (
              <div style={{ display: 'grid', gap: 8 }}>
                {g.programme.map((p) => (
                  <ProgrammZeile key={p.key} name={p.name} monatCent={p.monatCent} ab={p.ab} heute={heute} aus={!angabenDa}
                    onSpeichern={(b, ab) => programmSpeichern(p.key, p.name, b, ab)}
                    onLoeschen={() => { const a = angaben.find((x) => x.art === 'altprogramm' && x.altsystem_key === p.key); if (a) void angabeLoeschen(a.id); }} />
                ))}
              </div>
            )}
          </div>

          <div>
            <b>⚡ THG-Prämie</b>
            <div style={{ color: C.textDim, fontSize: 13, margin: '4px 0 8px' }}>Nur ausgezahlte Prämien eintragen — Fahrzeug oder Kennzeichen, Betrag und Auszahlungstag.</div>
            {thgListe.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '4px 0' }}>
                <span style={{ flex: 1, minWidth: 160 }}>{a.bezeichnung}</span>
                <span>{euroText(Number(a.betrag_cent) || 0)}</span>
                <span style={{ color: C.textDim }}>{datumDe(a.ab)}</span>
                <button style={knopf(C.danger)} onClick={() => angabeLoeschen(a.id)}>Löschen</button>
              </div>
            ))}
            {angabenDa && <ThgNeu onSpeichern={thgSpeichern} heute={heute} />}
          </div>

          <div>
            <b>📣 Teilen (z. B. LinkedIn)</b>
            <div style={{ color: C.textDim, fontSize: 13, margin: '4px 0 8px' }}>Geteilt werden nur Summen — keine Namen von Kunden, Lieferanten oder Mitarbeitern. Erst nach Ihrer Einwilligung; zurücknehmen geht jederzeit.</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={erlaubt} onChange={(e) => einwilligung(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2 }} />
              <span>Ich willige ein, dass diese Summen für meinen Betrieb{firma ? ` (${firma})` : ''} als Text oder Bild zum Teilen erstellt werden.{teilen.teilen_am ? <span style={{ color: C.textDim }}> · zuletzt geändert {datumDe(String(teilen.teilen_am).slice(0, 10))}</span> : null}</span>
            </label>
            {erlaubt && (
              <div style={{ marginTop: 10 }}>
                <pre style={{ whiteSpace: 'pre-wrap', background: C.navy, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontFamily: 'inherit', fontSize: 14, margin: '0 0 8px' }}>{teilenText(g, firma)}</pre>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={knopf(C.gold, true)} onClick={textKopieren}>📋 Text kopieren</button>
                  <button style={knopf(C.cyan)} onClick={bildLaden}>🖼 Bild herunterladen</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Kachel({ titel, wert, unter, link, farbe }: { titel: string; wert: string; unter: string; link?: string; farbe?: string }) {
  const inhalt = (
    <>
      <div style={{ color: C.textDim, fontSize: 12 }}>{titel}</div>
      <div style={{ fontWeight: 800, fontSize: 18, color: farbe || C.text }}>{wert}</div>
      <div style={{ color: C.textDim, fontSize: 12, marginTop: 2 }}>{unter}{link ? ' →' : ''}</div>
    </>
  );
  const stil: CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', textDecoration: 'none', color: C.text, display: 'block' };
  return link ? <a href={link} style={stil}>{inhalt}</a> : <div style={stil}>{inhalt}</div>;
}

function ProgrammZeile({ name, monatCent, ab, heute, aus, onSpeichern, onLoeschen }: {
  name: string; monatCent: number | null; ab: string | null; heute: string; aus: boolean;
  onSpeichern: (betrag: string, ab: string) => void; onLoeschen: () => void;
}) {
  const [betrag, setBetrag] = useState(monatCent !== null ? zahlText(monatCent / 100, 2) : '');
  const [datum, setDatum] = useState(ab ?? '');
  useEffect(() => { setBetrag(monatCent !== null ? zahlText(monatCent / 100, 2) : ''); setDatum(ab ?? ''); }, [monatCent, ab]);
  const monate = ab ? volleMonate(ab, heute) : 0;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
      <span style={{ flex: 1, minWidth: 150, fontWeight: 600 }}>{name}</span>
      <label style={{ fontSize: 13, color: C.textDim }}>€ / Monat <input style={{ ...feld, width: 100 }} inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} disabled={aus} /></label>
      <label style={{ fontSize: 13, color: C.textDim }}>nicht mehr bezahlt ab <input style={feld} type="date" value={datum} onChange={(e) => setDatum(e.target.value)} disabled={aus} /></label>
      <button style={knopf(C.gold)} onClick={() => onSpeichern(betrag, datum)} disabled={aus}>Speichern</button>
      {monatCent !== null && <button style={knopf(C.danger)} onClick={onLoeschen}>Löschen</button>}
      {monatCent !== null && <span style={{ width: '100%', fontSize: 12, color: C.textDim }}>{monate} volle {monate === 1 ? 'Monat' : 'Monate'} × {euroText(monatCent)} = {euroText(monatCent * monate)}</span>}
    </div>
  );
}

function ThgNeu({ onSpeichern, heute }: { onSpeichern: (bez: string, betrag: string, ab: string) => Promise<boolean>; heute: string }) {
  const [bez, setBez] = useState('');
  const [betrag, setBetrag] = useState('');
  const [ab, setAb] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
      <input style={{ ...feld, flex: 1, minWidth: 160 }} placeholder="Fahrzeug / Kennzeichen" value={bez} onChange={(e) => setBez(e.target.value)} />
      <input style={{ ...feld, width: 110 }} placeholder="Betrag €" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} />
      <input style={feld} type="date" max={heute} value={ab} onChange={(e) => setAb(e.target.value)} />
      <button style={knopf(C.gold, true)} onClick={async () => { if (await onSpeichern(bez, betrag, ab)) { setBez(''); setBetrag(''); setAb(''); } }}>Eintragen</button>
    </div>
  );
}
