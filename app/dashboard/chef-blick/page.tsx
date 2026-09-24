'use client';

// ============================================================
// ARGONAUT OS · Chef-Blick (Paket PP, B30)
//   1. Morgen-Briefing als Satz — zum Vorlesen (ohne KI, 0 €)
//   2. Auslastung der nächsten 8 Wochen je Monteur (Einsätze gegen Soll)
//   3. Frühwarnung je Projekt (überfällige Aufgaben, Mängel, Nachträge, Stillstand)
//   4. Bank-Mappe: Umsatz 12 Monate, Forderungen, Zahlungsdauer — druckfertig
// Sprachbefehle (B31) und der KI-Tagesbericht leben schon im Chef-Cockpit
// auf der Übersicht — hier nur verlinkt.
// Logik: lib/chefPaket.ts (getestet). Nur Chef (rechte.ts nurChef).
// Jede Abfrage für sich fail-open: fehlt eine Tabelle, bleibt der Block leer.
// Pfad: app/dashboard/chef-blick/page.tsx
// ============================================================

import { useState, useEffect, useMemo, CSSProperties } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  berlinTag, wochenListe, auslastung, projektWarnungen, morgenSatz, umsatzJeMonat, forderungen, zahlungsdauer, monatsListe,
  type Einsatz, type Monteur, type Projekt, type Aufgabe, type Mangel, type Nachtrag, type Rechnung,
} from '@/lib/chefPaket';
import { sprich, stoppeVorlesen, istVorlesenMoeglich } from '@/lib/vorlesen';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff', green: '#4CAF7D',
  text: '#E8EDF4', textDim: '#8FA3BE', border: 'rgba(143,163,190,0.18)', danger: '#E06666', warn: '#E0A24C',
};
const WOCHEN = 8;

const karte: CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 };
const knopf = (farbe: string, voll = false): CSSProperties => ({
  background: voll ? farbe : 'transparent', color: voll ? C.navy : farbe, border: `1px solid ${farbe}`,
  borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
});
const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const monatDe = (m: string) => {
  const namen = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  return `${namen[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;
};

async function sicher<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try { const r = await p; return r.error ? [] : ((r.data as T[]) ?? []); } catch { return []; }
}

export default function ChefBlick() {
  const heute = berlinTag(new Date().toISOString()) as string;
  const wochen = useMemo(() => wochenListe(heute, WOCHEN), [heute]);
  const [name, setName] = useState('');
  const [firma, setFirma] = useState('');
  const [monteure, setMonteure] = useState<Monteur[]>([]);
  const [einsaetze, setEinsaetze] = useState<Einsatz[]>([]);
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [maengel, setMaengel] = useState<Mangel[]>([]);
  const [nachtraege, setNachtraege] = useState<Nachtrag[]>([]);
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [spricht, setSpricht] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id;
      if (uid) {
        const { data: p } = await supabase.from('profiles').select('full_name, firma_name').eq('id', uid).maybeSingle();
        const pr = (p ?? {}) as { full_name?: string | null; firma_name?: string | null };
        setName(String(pr.full_name ?? '').trim().split(' ')[0] || '');
        setFirma(String(pr.firma_name ?? '').trim());
      }
      const von = new Date(Date.UTC(+wochen[0].montag.slice(0, 4), +wochen[0].montag.slice(5, 7) - 1, +wochen[0].montag.slice(8, 10)) - 86_400_000).toISOString();
      const bis = new Date(Date.UTC(+wochen[WOCHEN - 1].sonntag.slice(0, 4), +wochen[WOCHEN - 1].sonntag.slice(5, 7) - 1, +wochen[WOCHEN - 1].sonntag.slice(8, 10)) + 2 * 86_400_000).toISOString();
      const abMonat = monatsListe(heute, 13)[0] + '-01';
      const [ma, ei, pj, mg, nt, r1, r2] = await Promise.all([
        sicher<{ id: string; vorname: string | null; nachname: string | null; wochenstunden: number | null }>(
          supabase.from('mitarbeiter').select('id, vorname, nachname, wochenstunden').or(`austrittsdatum.is.null,austrittsdatum.gt.${heute}`).order('nachname', { ascending: true })),
        sicher<Einsatz>(supabase.from('einsaetze').select('mitarbeiter_id, beginn_am, ende_am, status, inhaber_einsatz').gte('beginn_am', von).lte('beginn_am', bis).limit(3000)),
        sicher<Projekt>(supabase.from('projekte').select('id, name').eq('archiviert', false)),
        sicher<Mangel>(supabase.from('maengel').select('projekt_id, status, frist')),
        sicher<Nachtrag>(supabase.from('bau_nachtrag').select('projekt_id, status, antwort_bis')),
        sicher<Rechnung & { id: string }>(supabase.from('rechnungen').select('id, rechnungsdatum, faelligkeitsdatum, brutto_summe, zahlungsstatus, bezahlt_am').gte('rechnungsdatum', abMonat).limit(5000)),
        sicher<Rechnung & { id: string }>(supabase.from('rechnungen').select('id, rechnungsdatum, faelligkeitsdatum, brutto_summe, zahlungsstatus, bezahlt_am').is('bezahlt_am', null).neq('zahlungsstatus', 'storniert').limit(5000)),
      ]);
      setMonteure(ma.map((m) => ({ id: m.id, name: `${m.vorname || ''} ${m.nachname || ''}`.trim() || 'Ohne Namen', wochenstunden: m.wochenstunden })));
      setEinsaetze(ei);
      setProjekte(pj);
      setMaengel(mg);
      setNachtraege(nt);
      const alle = new Map<string, Rechnung>();
      for (const r of [...r1, ...r2]) alle.set(r.id, r);
      setRechnungen([...alle.values()]);
      if (pj.length) {
        setAufgaben(await sicher<Aufgabe>(supabase.from('aufgaben').select('projekt_id, titel, erledigt, status, faellig_am, erstellt_am').in('projekt_id', pj.map((p) => p.id)).limit(5000)));
      }
      setLaedt(false);
    })();
  }, [heute, wochen]);

  const last = useMemo(() => auslastung(monteure, einsaetze, wochen), [monteure, einsaetze, wochen]);
  const warnungen = useMemo(() => projektWarnungen({ projekte, aufgaben, maengel, nachtraege, heute }), [projekte, aufgaben, maengel, nachtraege, heute]);
  const umsatz = useMemo(() => umsatzJeMonat(rechnungen, heute, 12), [rechnungen, heute]);
  const ford = useMemo(() => forderungen(rechnungen, heute), [rechnungen, heute]);
  const dauer = useMemo(() => zahlungsdauer(rechnungen, heute, 12), [rechnungen, heute]);
  const heuteEinsaetze = einsaetze.filter((e) => (e.status ?? '') !== 'abgesagt' && berlinTag(e.beginn_am) === heute);
  const satz = morgenSatz({
    name,
    einsaetzeHeute: heuteEinsaetze.length,
    ohneMonteurHeute: heuteEinsaetze.filter((e) => !e.mitarbeiter_id && !e.inhaber_einsatz).length,
    rechnungenUeberfaellig: ford.anzahlUeberfaellig,
    ueberfaelligSumme: ford.ueberfaellig,
    warnProjekte: warnungen.filter((w) => w.signale.some((s) => s.schwere === 3)).map((w) => String(w.projekt.name || 'ohne Namen')),
    wocheQuote: last.summe[0]?.quote ?? null,
  });
  const umsatzSumme = umsatz.reduce((s, u) => s + u.summe, 0);
  const maxUmsatz = Math.max(1, ...umsatz.map((u) => u.summe));

  function vorlesen() {
    if (spricht) { stoppeVorlesen(); setSpricht(false); return; }
    if (sprich(satz)) setSpricht(true);
  }

  const zellFarbe = (a: string) => (a === 'rot' ? 'rgba(224,102,102,0.28)' : a === 'gelb' ? 'rgba(224,162,76,0.25)' : a === 'gruen' ? 'rgba(76,175,125,0.18)' : 'transparent');

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 28px)', color: C.text, maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        #bank-mappe-druck { }
        @media print {
          body * { visibility: hidden !important; }
          #bank-mappe-druck, #bank-mappe-druck * { visibility: visible !important; color: #000 !important; background: transparent !important; border-color: #999 !important; }
          #bank-mappe-druck { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
          .kein-druck { display: none !important; }
        }
      `}</style>
      <h1 style={{ color: C.gold, margin: '0 0 4px' }}>🧭 Chef-Blick</h1>
      <p style={{ color: C.textDim, margin: '0 0 16px' }}>Was heute anliegt, wie voll die nächsten Wochen sind, welche Projekte Aufmerksamkeit brauchen — und die Zahlen fürs Bankgespräch.</p>

      <div style={{ ...karte, borderColor: C.gold }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <strong>☀️ Morgen-Briefing</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {istVorlesenMoeglich() && <button style={knopf(C.gold, true)} onClick={vorlesen} disabled={laedt}>{spricht ? '⏹ Stopp' : '🔊 Vorlesen'}</button>}
            <a href="/dashboard" style={{ ...knopf(C.cyan), textDecoration: 'none' }}>🎙 Sprachbefehle & KI-Bericht im Cockpit</a>
          </div>
        </div>
        <p style={{ fontSize: 17, lineHeight: 1.6, margin: '10px 0 0' }}>{laedt ? 'Lädt …' : satz}</p>
      </div>

      <div style={karte}>
        <strong>📅 Auslastung der nächsten {WOCHEN} Wochen</strong>
        <div style={{ color: C.textDim, fontSize: 13, margin: '4px 0 10px' }}>Geplante Einsatzstunden gegen die Wochenstunden aus der Personalakte. Grün unter 80 %, gelb bis 100 %, rot darüber.</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 6, color: C.textDim }}>Monteur</th>
                {wochen.map((w) => <th key={w.montag} style={{ padding: 6, color: C.textDim, whiteSpace: 'nowrap' }}>KW {w.kw}</th>)}
              </tr>
            </thead>
            <tbody>
              {last.zeilen.map((z) => (
                <tr key={z.monteur.id}>
                  <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{z.monteur.name}{!z.monteur.wochenstunden && <span style={{ color: C.textDim, fontSize: 12 }}> · ohne Soll</span>}</td>
                  {z.zellen.map((c, i) => (
                    <td key={i} title={c.soll ? `${c.stunden} h von ${c.soll} h` : `${c.stunden} h`} style={{ padding: 6, textAlign: 'center', background: zellFarbe(c.ampel), border: `1px solid ${C.border}` }}>
                      {c.stunden > 0 ? (c.quote !== null ? `${c.quote} %` : `${c.stunden} h`) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
              {last.ohne.some((h) => h > 0) && (
                <tr>
                  <td style={{ padding: 6, color: C.warn }}>ohne Monteur</td>
                  {last.ohne.map((h, i) => <td key={i} style={{ padding: 6, textAlign: 'center', color: C.warn, border: `1px solid ${C.border}` }}>{h > 0 ? `${h} h` : ''}</td>)}
                </tr>
              )}
              <tr>
                <td style={{ padding: 6, fontWeight: 700 }}>Gesamt</td>
                {last.summe.map((c, i) => <td key={i} style={{ padding: 6, textAlign: 'center', fontWeight: 700, background: zellFarbe(c.ampel), border: `1px solid ${C.border}` }}>{c.quote !== null ? `${c.quote} %` : `${c.stunden} h`}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        {monteure.length === 0 && !laedt && <div style={{ color: C.textDim, marginTop: 8 }}>Noch keine Mitarbeiter angelegt.</div>}
      </div>

      <div style={karte}>
        <strong>🚨 Frühwarnung je Projekt</strong>
        {warnungen.length === 0 ? (
          <div style={{ color: C.green, marginTop: 8 }}>{laedt ? 'Lädt …' : 'Kein Projekt mit Auffälligkeiten.'}</div>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {warnungen.map((w) => {
              const farbe = w.signale[0].schwere === 3 ? C.danger : w.signale[0].schwere === 2 ? C.warn : C.textDim;
              return (
                <a key={w.projekt.id} href={`/dashboard/projekte/${w.projekt.id}`} style={{ textDecoration: 'none', color: C.text, border: `1px solid ${C.border}`, borderLeft: `4px solid ${farbe}`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 700 }}>{w.projekt.name || 'Projekt ohne Namen'}</div>
                  <div style={{ fontSize: 14, color: C.textDim }}>{w.signale.map((s) => s.text).join(' · ')}</div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      <div style={karte} id="bank-mappe-druck">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <strong>🏦 Bank-Mappe{firma ? ` · ${firma}` : ''}</strong>
          <button className="kein-druck" style={knopf(C.gold)} onClick={() => window.print()}>🖨 Drucken / als PDF speichern</button>
        </div>
        <div style={{ color: C.textDim, fontSize: 13, margin: '4px 0 12px' }}>
          Stand {heute.split('-').reverse().join('.')}. Rechnungsumsatz brutto nach Rechnungsdatum aus ARGONAUT — keine BWA. Für das Bankgespräch zusätzlich BWA und Summen- und Saldenliste vom Steuerberater beilegen.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
          <Kennzahl titel="Umsatz 12 Monate (brutto)" wert={eur(umsatzSumme)} />
          <Kennzahl titel="Offene Forderungen" wert={`${eur(ford.offen)} · ${ford.anzahlOffen}`} />
          <Kennzahl titel="davon überfällig" wert={`${eur(ford.ueberfaellig)} · ${ford.anzahlUeberfaellig}`} farbe={ford.ueberfaellig > 0 ? C.warn : undefined} />
          <Kennzahl titel="älter als 90 Tage" wert={eur(ford.aelter90)} farbe={ford.aelter90 > 0 ? C.danger : undefined} />
          <Kennzahl titel="Ø Tage bis zur Zahlung" wert={dauer === null ? '—' : `${dauer} Tage`} />
          <Kennzahl titel="Mitarbeiter (aktiv)" wert={String(monteure.length)} />
        </div>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
          <thead><tr><th style={{ textAlign: 'left', padding: 6, color: C.textDim }}>Monat</th><th style={{ textAlign: 'right', padding: 6, color: C.textDim }}>Rechnungen</th><th style={{ textAlign: 'right', padding: 6, color: C.textDim }}>Umsatz brutto</th><th className="kein-druck" /></tr></thead>
          <tbody>
            {umsatz.map((u) => (
              <tr key={u.monat}>
                <td style={{ padding: 6, borderTop: `1px solid ${C.border}` }}>{monatDe(u.monat)}</td>
                <td style={{ padding: 6, textAlign: 'right', borderTop: `1px solid ${C.border}` }}>{u.anzahl}</td>
                <td style={{ padding: 6, textAlign: 'right', borderTop: `1px solid ${C.border}` }}>{eur(u.summe)}</td>
                <td className="kein-druck" style={{ padding: 6, width: '35%', borderTop: `1px solid ${C.border}` }}>
                  <div style={{ height: 8, width: `${(u.summe / maxUmsatz) * 100}%`, background: C.gold, borderRadius: 4 }} />
                </td>
              </tr>
            ))}
            <tr><td style={{ padding: 6, fontWeight: 700 }}>Summe</td><td style={{ padding: 6, textAlign: 'right', fontWeight: 700 }}>{umsatz.reduce((s, u) => s + u.anzahl, 0)}</td><td style={{ padding: 6, textAlign: 'right', fontWeight: 700 }}>{eur(umsatzSumme)}</td><td className="kein-druck" /></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kennzahl({ titel, wert, farbe }: { titel: string; wert: string; farbe?: string }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ color: C.textDim, fontSize: 12 }}>{titel}</div>
      <div style={{ fontWeight: 800, fontSize: 18, color: farbe || C.text }}>{wert}</div>
    </div>
  );
}
