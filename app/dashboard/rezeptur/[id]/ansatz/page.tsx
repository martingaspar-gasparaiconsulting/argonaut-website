// ============================================================================
// ARGONAUT OS · Paket 322 (R1 Teil 2) · Ansatzzettel einer Prozent-Rezeptur
// /dashboard/rezeptur/<Rezeptur>/ansatz?menge=250
// Server-Seite (Anmeldung, Datenbank-Regeln gelten). Druck/PDF über den Browser.
// Soll-Einwaage aus lib/rezepturProzent (Summe exakt = Ansatz), leere Spalten
// für Ist-Einwaage, Rohstoff-Charge und Kürzel — zum Abhaken an der Waage.
// Unterpfad von /dashboard/rezeptur (erbt dessen Freigabe).
// ============================================================================

import type { CSSProperties } from 'react';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { ladeBetriebProfil } from '@/lib/betriebProfil';
import { leseZahl } from '@/lib/zahlen';
import { anteileAufloesen, einwaage, istMischung } from '@/lib/rezepturProzent';
import DruckKnopf from '../../../verleih/fahrzeuge/[id]/vertrag/DruckKnopf';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function t(x: unknown): string { return typeof x === 'string' ? x : ''; }
function zahl(n: number, st = 3): string { return n.toLocaleString('de-DE', { maximumFractionDigits: st }); }

export default async function AnsatzzettelSeite({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: rz } = await supabase.from('rezepturen').select('id, name, typ, basis_menge, basis_einheit, backverlust_prozent').eq('id', id).maybeSingle();
  if (!rz) notFound();
  const [zr, profil] = await Promise.all([
    supabase.from('rezeptur_zutaten').select('bezeichnung, anteil_prozent, ist_rest, position').eq('rezeptur_id', id).order('position', { ascending: true }),
    ladeBetriebProfil(supabase, user.id),
  ]);
  const zeilen = ((zr.data ?? []) as { bezeichnung: string | null; anteil_prozent: number | null; ist_rest: boolean | null }[]);
  const roh = typeof q.menge === 'string' ? leseZahl(q.menge) : null;
  const ansatz = roh != null && roh > 0 && roh <= 1e9 ? roh : (Number(rz.basis_menge) || 0);
  const einheit = t(rz.basis_einheit) || 'kg';
  const auf = anteileAufloesen(zeilen.map((z) => ({ bezeichnung: z.bezeichnung, anteil: z.anteil_prozent != null ? Number(z.anteil_prozent) : null, istRest: z.ist_rest === true })));

  const gruende: string[] = [];
  if (!istMischung(rz.typ)) gruende.push('Den Ansatzzettel gibt es für Rezepturen vom Typ „Mischung / Abfüllung (Prozent)".');
  if (auf.status !== 'ok') gruende.push(auf.status === 'fehler' ? auf.fehler.join(' ') : `Die gespeicherten Anteile ergeben ${zahl(auf.summe, 4)} % statt 100 %.`);
  if (!(ansatz > 0)) gruende.push('Bitte eine Ansatzgröße angeben.');
  const ok = gruende.length === 0;
  const ew = ok ? einwaage(auf.anteile, ansatz, 3) : [];
  const firma = t(profil.firma_name) || t(profil.firma);
  const heute = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium' }).format(new Date());

  const zelle: CSSProperties = { border: '1px solid #bbb', padding: '7px 8px', fontSize: 12.5, verticalAlign: 'top' };
  const kopf: CSSProperties = { ...zelle, background: '#f2efe6', fontWeight: 700 };

  return (
    <div style={{ background: '#e9e9e9', minHeight: '100vh', padding: '20px 12px' }}>
      <style>{'@media print { body * { visibility: hidden !important; } #zettel, #zettel * { visibility: visible !important; } #zettel { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; margin: 0 !important; } .nicht-drucken { display: none !important; } }'}</style>
      <div className="nicht-drucken" style={{ maxWidth: 820, margin: '0 auto 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <a href="/dashboard/rezeptur" style={{ color: '#0A1628', fontSize: 13.5 }}>← zurück zur Rezeptur</a>
        {ok && <span style={{ marginLeft: 'auto' }}><DruckKnopf /></span>}
      </div>

      {!ok && (
        <div style={{ maxWidth: 820, margin: '0 auto', background: '#fff', color: '#111', padding: '24px 28px', fontFamily: 'DM Sans, Arial, sans-serif', borderLeft: '5px solid #c0392b' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Kein Ansatzzettel für „{t(rz.name)}"</h1>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>{gruende.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      )}

      {ok && (
        <div id="zettel" style={{ maxWidth: 820, margin: '0 auto', background: '#fff', color: '#111', padding: '28px 32px', fontFamily: 'DM Sans, Arial, sans-serif', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Ansatzzettel</h1>
              <div style={{ fontSize: 14, marginTop: 2 }}><b>{t(rz.name)}</b></div>
            </div>
            <div style={{ fontSize: 12.5, textAlign: 'right' }}>{firma || ''}<br />gedruckt am {heute}</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14 }}><tbody>
            <tr><td style={{ ...kopf, width: '30%' }}>Ansatzgröße</td><td style={zelle}><b>{zahl(ansatz)} {einheit}</b></td></tr>
            <tr><td style={kopf}>Charge</td><td style={zelle}>&nbsp;</td></tr>
            <tr><td style={kopf}>Datum / Ansatz durch</td><td style={zelle}>&nbsp;</td></tr>
          </tbody></table>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
            <thead><tr>
              <th style={{ ...kopf, width: 28 }}>#</th><th style={kopf}>Rohstoff</th><th style={{ ...kopf, textAlign: 'right' }}>Anteil</th>
              <th style={{ ...kopf, textAlign: 'right' }}>Soll ({einheit})</th><th style={kopf}>Ist</th><th style={kopf}>Rohstoff-Charge</th><th style={{ ...kopf, width: 54 }}>Kürzel</th>
            </tr></thead>
            <tbody>
              {zeilen.map((z, i) => ({ z, i })).filter(({ i }) => auf.anteile[i] > 0).map(({ z, i }, n) => (
                <tr key={i}>
                  <td style={zelle}>{n + 1}</td>
                  <td style={zelle}>{t(z.bezeichnung) || 'Rohstoff'}{z.ist_rest ? ' (ad 100)' : ''}</td>
                  <td style={{ ...zelle, textAlign: 'right' }}>{zahl(auf.anteile[i], 4)} %</td>
                  <td style={{ ...zelle, textAlign: 'right', fontWeight: 700 }}>{zahl(ew[i])}</td>
                  <td style={zelle}>&nbsp;</td><td style={zelle}>&nbsp;</td><td style={zelle}>&nbsp;</td>
                </tr>
              ))}
              <tr>
                <td style={zelle} /><td style={{ ...zelle, fontWeight: 700 }}>Summe</td>
                <td style={{ ...zelle, textAlign: 'right' }}>100 %</td>
                <td style={{ ...zelle, textAlign: 'right', fontWeight: 800 }}>{zahl(ansatz)}</td>
                <td style={zelle} colSpan={3} />
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: '#555', margin: '14px 0 0' }}>Soll-Einwaage gerundet auf 3 Nachkommastellen; die Summe ergibt genau die Ansatzgröße. Abweichungen bitte in der Spalte „Ist" eintragen.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 22 }}><tbody>
            <tr><td style={{ ...zelle, height: 40, width: '50%' }}>Geprüft (Name, Datum)</td><td style={zelle}>Unterschrift</td></tr>
          </tbody></table>
        </div>
      )}
    </div>
  );
}
