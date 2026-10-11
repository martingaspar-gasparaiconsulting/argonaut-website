// ============================================================================
// ARGONAUT OS · Paket 320 (Q1) · Prüfzertifikat je Charge — Druckansicht
// /dashboard/chargen/<Charge>/zertifikat?pruefung=…&art=coa|abnahme31&kunde=…&bestellung=…&menge=…&freigabe=…&funktion=…&abnahme=…
// Server-Seite (Anmeldung, Datenbank-Regeln gelten). Firmendaten über
// ladeBetriebProfil (beim Mitarbeiter die des Chefs). Druck/PDF über den Browser.
// Fail-closed: lib/chargenZertifikat.zertifikatPruefen — ohne Freigabe oder mit
// einem Merkmal außerhalb der Spezifikation gibt es KEIN Zertifikat, nur die Gründe.
// Unterpfad von /dashboard/chargen (erbt dessen Freigabe).
// ============================================================================

import type { CSSProperties } from 'react';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { ladeBetriebProfil } from '@/lib/betriebProfil';
import {
  ZERT_ARTEN, zertArt, zertifikatPruefen, bestePruefung, spezText, istText, merkmalOk, zertNummer, feldText, erklaerung,
  type MerkmalZ, type PruefungZ,
} from '@/lib/chargenZertifikat';
import DruckKnopf from '../../../verleih/fahrzeuge/[id]/vertrag/DruckKnopf';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function de(iso: unknown): string {
  const s = typeof iso === 'string' ? iso.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  const p = s.split('-');
  return `${p[2]}.${p[1]}.${p[0]}`;
}
function t(x: unknown): string { return typeof x === 'string' ? x : ''; }

export default async function ZertifikatSeite({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: los } = await supabase.from('charge_los').select('id, charge_nr, bezeichnung, artikel_id, herstell_datum, mhd, status, einheit').eq('id', id).maybeSingle();
  if (!los) notFound();
  const [pr, profil, art] = await Promise.all([
    supabase.from('charge_pruefung').select('id, los_id, art, datum, pruefer').eq('los_id', id).order('datum', { ascending: true }),
    ladeBetriebProfil(supabase, user.id),
    los.artikel_id ? supabase.from('artikel').select('bezeichnung, artikelnummer').eq('id', los.artikel_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const pruefungen = ((pr.data ?? []) as PruefungZ[]);
  const ids = pruefungen.map((p) => p.id);
  const mr = ids.length ? await supabase.from('charge_merkmal').select('id, pruefung_id, merkmal, sollwert, toleranz_minus, toleranz_plus, istwert, einheit').in('pruefung_id', ids).order('id', { ascending: true }) : { data: [] };
  const merkmaleJe: Record<string, MerkmalZ[]> = {};
  for (const m of ((mr.data ?? []) as (MerkmalZ & { pruefung_id: string })[])) (merkmaleJe[m.pruefung_id] ||= []).push(m);

  const gewaehlt = feldText(q.pruefung, 40);
  const pruefung = (gewaehlt && pruefungen.find((p) => p.id === gewaehlt)) || bestePruefung(pruefungen, merkmaleJe);
  const merkmale = pruefung ? merkmaleJe[pruefung.id] ?? [] : [];
  const zArt = zertArt(feldText(q.art, 20));
  const kunde = feldText(q.kunde, 120);
  const bestellung = feldText(q.bestellung, 60);
  const menge = feldText(q.menge, 40);
  const freigabe = feldText(q.freigabe, 80);
  const funktion = feldText(q.funktion, 60);
  const abnahme = feldText(q.abnahme, 80);

  const pr2 = zertifikatPruefen(los.status, pruefung, merkmale);
  const gruende = [...pr2.gruende];
  if (!freigabe) gruende.push('Bitte angeben, wer das Zertifikat freigibt (Name).');
  if (zArt === 'abnahme31' && !abnahme) gruende.push('Für ein Abnahmeprüfzeugnis 3.1 bitte den Abnahmebeauftragten angeben (vom Fertigungsbereich unabhängig).');
  const ok = gruende.length === 0;

  const artInfo = ZERT_ARTEN.find((a) => a.key === zArt) ?? ZERT_ARTEN[0];
  const firma = t(profil.firma_name) || t(profil.firma);
  const aussteller = [firma, t(profil.firma_strasse), [t(profil.firma_plz), t(profil.firma_ort)].filter(Boolean).join(' '), [t(profil.firma_telefon), t(profil.firma_email)].filter(Boolean).join(' · ')].filter(Boolean);
  const produkt = t(art.data?.bezeichnung) || t(los.bezeichnung) || '—';
  const nummer = zertNummer(los.charge_nr, pruefung?.datum, zArt);
  const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

  const zelle: CSSProperties = { border: '1px solid #bbb', padding: '6px 8px', verticalAlign: 'top', fontSize: 12.5 };
  const kopf: CSSProperties = { ...zelle, background: '#f2efe6', fontWeight: 700, width: '30%' };
  const h2: CSSProperties = { fontSize: 14, margin: '18px 0 6px', borderBottom: '2px solid #C9A84C', paddingBottom: 3 };

  return (
    <div style={{ background: '#e9e9e9', minHeight: '100vh', padding: '20px 12px' }}>
      <style>{'@media print { body * { visibility: hidden !important; } #zertifikat, #zertifikat * { visibility: visible !important; } #zertifikat { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; margin: 0 !important; } .nicht-drucken { display: none !important; } }'}</style>
      <div className="nicht-drucken" style={{ maxWidth: 820, margin: '0 auto 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <a href="/dashboard/chargen" style={{ color: '#0A1628', fontSize: 13.5 }}>← zurück zu den Chargen</a>
        {ok && <span style={{ marginLeft: 'auto' }}><DruckKnopf /></span>}
      </div>

      {!ok && (
        <div style={{ maxWidth: 820, margin: '0 auto', background: '#fff', color: '#111', padding: '24px 28px', fontFamily: 'DM Sans, Arial, sans-serif', borderLeft: '5px solid #c0392b' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Kein Zertifikat für Charge {t(los.charge_nr)}</h1>
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>ARGONAUT bescheinigt nur, was geprüft und in Ordnung ist. Bitte zuerst klären:</p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>{gruende.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      )}

      {ok && pruefung && (
        <div id="zertifikat" style={{ maxWidth: 820, margin: '0 auto', background: '#fff', color: '#111', padding: '28px 32px', fontFamily: 'DM Sans, Arial, sans-serif', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>{artInfo.label}</h1>
              <div style={{ fontSize: 12.5, color: '#555' }}>Nr. {nummer} · ausgestellt am {de(heute)}</div>
            </div>
            <div style={{ fontSize: 12.5, textAlign: 'right', whiteSpace: 'pre-line' }}><b>Hersteller / Aussteller</b>{'\n'}{aussteller.join('\n') || '________________'}</div>
          </div>

          <h2 style={h2}>Erzeugnis und Charge</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            <tr><td style={kopf}>Produkt</td><td style={zelle}>{produkt}{t(art.data?.artikelnummer) ? ` · Art.-Nr. ${t(art.data?.artikelnummer)}` : ''}</td></tr>
            <tr><td style={kopf}>Charge / Los</td><td style={zelle}><b>{t(los.charge_nr)}</b></td></tr>
            {los.herstell_datum && <tr><td style={kopf}>Herstelldatum</td><td style={zelle}>{de(los.herstell_datum)}</td></tr>}
            {los.mhd && <tr><td style={kopf}>Verwendbar bis</td><td style={zelle}>{de(los.mhd)}</td></tr>}
            {kunde && <tr><td style={kopf}>Empfänger</td><td style={zelle}>{kunde}</td></tr>}
            {bestellung && <tr><td style={kopf}>Bestellung / Lieferschein</td><td style={zelle}>{bestellung}</td></tr>}
            {menge && <tr><td style={kopf}>Liefermenge</td><td style={zelle}>{menge}</td></tr>}
            <tr><td style={kopf}>Prüfdatum</td><td style={zelle}>{de(pruefung.datum)}</td></tr>
          </tbody></table>

          <h2 style={h2}>Prüfergebnisse</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...kopf, width: 'auto' }}>Merkmal</th><th style={{ ...kopf, width: 'auto' }}>Spezifikation</th>
              <th style={{ ...kopf, width: 'auto' }}>Ergebnis</th><th style={{ ...kopf, width: 70, textAlign: 'center' }}>Bewertung</th>
            </tr></thead>
            <tbody>{merkmale.map((m, i) => (
              <tr key={i}>
                <td style={zelle}>{t(m.merkmal)}</td><td style={zelle}>{spezText(m)}</td><td style={zelle}>{istText(m)}</td>
                <td style={{ ...zelle, textAlign: 'center', fontWeight: 700 }}>{merkmalOk(m) ? 'i. O.' : '—'}</td>
              </tr>
            ))}</tbody>
          </table>

          <p style={{ fontSize: 13, margin: '16px 0 0', lineHeight: 1.5 }}>{erklaerung(zArt)}</p>

          <h2 style={h2}>Freigabe</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
            <tr><td style={kopf}>Freigegeben durch</td><td style={zelle}>{freigabe}{funktion ? ` · ${funktion}` : ''}</td></tr>
            {zArt === 'abnahme31' && <tr><td style={kopf}>Abnahmebeauftragter (vom Fertigungsbereich unabhängig)</td><td style={zelle}>{abnahme}</td></tr>}
            <tr><td style={kopf}>Ort, Datum</td><td style={zelle}>{[t(profil.firma_ort), de(heute)].filter(Boolean).join(', ')}</td></tr>
          </tbody></table>
          <div style={{ display: 'flex', gap: 40, marginTop: 36, fontSize: 12 }}>
            <div style={{ flex: 1, borderTop: '1px solid #333', paddingTop: 4 }}>Unterschrift Freigabe</div>
            {zArt === 'abnahme31' && <div style={{ flex: 1, borderTop: '1px solid #333', paddingTop: 4 }}>Unterschrift Abnahmebeauftragter</div>}
          </div>
        </div>
      )}
    </div>
  );
}

