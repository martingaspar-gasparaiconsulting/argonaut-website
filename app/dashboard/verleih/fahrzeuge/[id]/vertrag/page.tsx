// ============================================================================
// ARGONAUT OS · /dashboard/verleih/fahrzeuge/[id]/vertrag — Mietvertrag zum Drucken (Paket 292)
//
// Druckansicht des Mietvertrags: Vermieter, Mieter, Fahrzeug, Zeitraum,
// eingefrorene Preise, Fahrer mit Prüfvermerk (ohne Nummer), Kaution (ohne
// Kartendaten), Übergabe/Rückgabe, Schäden, Mietbedingungen des Betriebs
// (nach der Übergabe die festgehaltene Fassung) und Unterschriftsfelder.
// Server-Seite: liest unter den Rechten der angemeldeten Person (RLS),
// Firmendaten über ladeBetriebProfil (beim Mitarbeiter die des Chefs).
// ============================================================================

import type { CSSProperties } from 'react';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { ladeBetriebProfil } from '@/lib/betriebProfil';
import { achtelText, zeit, berlinTag, KAUTION_ARTEN, KAUTION_STATUS, SCHADEN_ARTEN, SCHADEN_BEREICHE, fahrerBewerten } from '@/lib/fahrzeugMiete';
import { euro } from '@/lib/geld';
import DruckKnopf from './DruckKnopf';

function wann(iso: unknown): string {
  const t = zeit(iso);
  return t === null ? '________________' : new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
}
function de(iso: unknown): string { const s = typeof iso === 'string' ? iso : ''; if (!s) return '—'; const p = s.slice(0, 10).split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }
function cent(n: unknown): string { return n === null || n === undefined ? '—' : euro(Number(n) / 100); }
function t(x: unknown): string { return typeof x === 'string' ? x : ''; }

export default async function MietvertragDruckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: b } = await supabase.from('miet_buchung').select('*').eq('id', id).maybeSingle();
  if (!b) notFound();
  const [fz, fa, sc, ei, profil] = await Promise.all([
    supabase.from('miet_fahrzeug').select('bezeichnung, kennzeichen, art').eq('id', b.fahrzeug_id).maybeSingle(),
    supabase.from('miet_fahrer').select('rolle, name, geburtsdatum, fs_erteilt_am, fs_klassen, fs_gueltig_bis, ausweis_abgeglichen, ergebnis, geprueft_am').eq('buchung_id', b.id).order('geprueft_am'),
    supabase.from('miet_schaden').select('buchung_id, phase, bereich, art, beschreibung, behoben_am, erfasst_am').eq('fahrzeug_id', b.fahrzeug_id).order('erfasst_am').limit(200),
    supabase.from('miet_einstellung').select('mietbedingungen').maybeSingle(),
    ladeBetriebProfil(supabase, user.id),
  ]);
  const bed = b.status === 'reserviert' ? t(ei.data?.mietbedingungen) : t(b.bedingungen);
  const schaeden = (sc.data ?? []).filter((x) => x.buchung_id === b.id || !x.behoben_am);
  const bereich = Object.fromEntries(SCHADEN_BEREICHE.map((x) => [x.key, x.label])) as Record<string, string>;
  const art = Object.fromEntries(SCHADEN_ARTEN.map((x) => [x.key, x.label])) as Record<string, string>;
  const kautionArt = KAUTION_ARTEN.find((k) => k.key === b.kaution_art)?.label ?? '';
  const abholTag = berlinTag(zeit(b.abholung) ?? Date.now());
  const rueckTag = berlinTag(zeit(b.rueckgabe_plan) ?? Date.now());
  const vermieter = [t(profil.firma_name) || t(profil.firma), t(profil.firma_strasse), [t(profil.firma_plz), t(profil.firma_ort)].filter(Boolean).join(' '), [t(profil.firma_telefon), t(profil.firma_email)].filter(Boolean).join(' · ')].filter(Boolean);

  const zelle: CSSProperties = { border: '1px solid #bbb', padding: '6px 8px', verticalAlign: 'top', fontSize: 12.5 };
  const kopf: CSSProperties = { ...zelle, background: '#f2efe6', fontWeight: 700, width: '28%' };
  const h2: CSSProperties = { fontSize: 14, margin: '18px 0 6px', borderBottom: '2px solid #C9A84C', paddingBottom: 3 };

  return (
    <div style={{ background: '#e9e9e9', minHeight: '100vh', padding: '20px 12px' }}>
      <style>{'@media print { body * { visibility: hidden !important; } #mietvertrag, #mietvertrag * { visibility: visible !important; } #mietvertrag { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; margin: 0 !important; } .nicht-drucken { display: none !important; } }'}</style>
      <div className="nicht-drucken" style={{ maxWidth: 820, margin: '0 auto 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <a href={`/dashboard/verleih/fahrzeuge/${b.id}`} style={{ color: '#0A1628', fontSize: 13.5 }}>← zurück zum Mietvertrag</a>
        <span style={{ marginLeft: 'auto' }}><DruckKnopf /></span>
      </div>
      <div id="mietvertrag" style={{ maxWidth: 820, margin: '0 auto', background: '#fff', color: '#111', padding: '28px 32px', fontFamily: 'DM Sans, Arial, sans-serif', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, margin: 0 }}>Mietvertrag {t(b.nummer)}</h1>
            <div style={{ fontSize: 12.5, color: '#555' }}>Fahrzeugmiete · Stand {wann(new Date().toISOString())}{b.status === 'storniert' ? ' · STORNIERT' : ''}</div>
          </div>
          <div style={{ fontSize: 12.5, textAlign: 'right', whiteSpace: 'pre-line' }}><b>Vermieter</b>{'\n'}{vermieter.join('\n') || '________________'}</div>
        </div>

        <h2 style={h2}>Mieter und Fahrzeug</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
          <tr><td style={kopf}>Mieter</td><td style={{ ...zelle, whiteSpace: 'pre-line' }}>{t(b.mieter_name)}{b.mieter_anschrift ? `\n${t(b.mieter_anschrift)}` : ''}{b.mieter_telefon || b.mieter_email ? `\n${[t(b.mieter_telefon), t(b.mieter_email)].filter(Boolean).join(' · ')}` : ''}</td></tr>
          <tr><td style={kopf}>Fahrzeug</td><td style={zelle}>{[t(fz.data?.bezeichnung), t(fz.data?.kennzeichen)].filter(Boolean).join(' · ')}</td></tr>
          <tr><td style={kopf}>Mietzeit</td><td style={zelle}>Abholung {wann(b.abholung)} · Rückgabe {wann(b.rueckgabe_plan)}</td></tr>
          <tr><td style={kopf}>Preise (netto, zzgl. USt.)</td><td style={zelle}>
            {cent(b.tagessatz_cent)} je Tag (je angefangene 24 Stunden){b.wochensatz_cent ? ` · ${cent(b.wochensatz_cent)} je Woche` : ''}
            {' · '}{b.frei_km_tag === null ? 'Kilometer frei' : `${b.frei_km_tag} km je Tag frei, jeder weitere km ${cent(b.mehr_km_cent)}`}
            {b.zusatzfahrer_tag_cent ? ` · Zusatzfahrer ${cent(b.zusatzfahrer_tag_cent)} je Tag` : ''}
            {b.tank_achtel_cent ? ` · Nachtanken/-laden ${cent(b.tank_achtel_cent)} je fehlendem Achtel` : ''}
          </td></tr>
          <tr><td style={kopf}>Kaution</td><td style={zelle}>{Number(b.kaution_cent) > 0 ? `${cent(b.kaution_cent)} · ${kautionArt} · ${KAUTION_STATUS[b.kaution_status] ?? b.kaution_status}${b.kaution_referenz ? ` · Vorgang ${t(b.kaution_referenz)}` : ''}` : 'keine'}</td></tr>
        </tbody></table>

        <h2 style={h2}>Fahrer (Prüfvermerk — Führerschein und Ausweis im Original gesehen)</h2>
        <p style={{ fontSize: 12, margin: '0 0 6px', color: '#444' }}>Bedingungen: Mindestalter {b.mindestalter} Jahre, Führerschein seit mindestens {b.fs_jahre_min} Jahr{b.fs_jahre_min === 1 ? '' : 'en'}{b.fs_klasse ? `, Klasse ${t(b.fs_klasse)}` : ''}. Nur die hier genannten Fahrer dürfen das Fahrzeug führen.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={kopf}>Fahrer</th><th style={kopf}>Geburtsdatum</th><th style={kopf}>Führerschein seit · Klassen</th><th style={kopf}>Ergebnis</th></tr></thead>
          <tbody>
            {(fa.data ?? []).length === 0 && <tr><td style={zelle} colSpan={4}>________________________________</td></tr>}
            {(fa.data ?? []).map((f, i) => {
              const e = fahrerBewerten(f, b, abholTag, rueckTag);
              return <tr key={i}><td style={zelle}>{f.rolle === 'haupt' ? 'Hauptfahrer' : 'Zusatzfahrer'}: {f.name}</td><td style={zelle}>{de(f.geburtsdatum)}</td><td style={zelle}>{de(f.fs_erteilt_am)}{f.fs_klassen ? ` · ${f.fs_klassen}` : ''}{f.fs_gueltig_bis ? ` · gültig bis ${de(f.fs_gueltig_bis)}` : ''}</td><td style={zelle}>{f.ergebnis === 'ok' ? 'erfüllt' : `nicht erfüllt (${e.gruende.join(', ')})`} · {wann(f.geprueft_am)}</td></tr>;
            })}
          </tbody>
        </table>

        <h2 style={h2}>Übergabe und Rückgabe</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={kopf}></th><th style={kopf}>Zeitpunkt</th><th style={kopf}>km-Stand</th><th style={kopf}>Tank / Akku</th></tr></thead>
          <tbody>
            <tr><td style={zelle}>Übergabe</td><td style={zelle}>{wann(b.uebergabe_am)}</td><td style={zelle}>{b.km_start === null ? '________' : Number(b.km_start).toLocaleString('de-DE')}</td><td style={zelle}>{b.tank_start === null ? '________' : achtelText(b.tank_start)}</td></tr>
            <tr><td style={zelle}>Rückgabe</td><td style={zelle}>{wann(b.rueckgabe_ist)}</td><td style={zelle}>{b.km_ende === null ? '________' : Number(b.km_ende).toLocaleString('de-DE')}</td><td style={zelle}>{b.tank_ende === null ? '________' : achtelText(b.tank_ende)}</td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: 12, margin: '6px 0 0', color: '#444' }}>Fotos: {(b.fotos_uebergabe ?? []).length} bei Übergabe, {(b.fotos_rueckgabe ?? []).length} bei Rückgabe — im System gespeichert.</p>

        <h2 style={h2}>Schäden</h2>
        {schaeden.length === 0 ? <p style={{ fontSize: 12.5 }}>Keine bekannten Schäden. Weitere: ______________________________________________</p> : (
          <ul style={{ fontSize: 12.5, margin: 0, paddingLeft: 18 }}>
            {schaeden.map((x, i) => <li key={i}>{bereich[x.bereich] ?? x.bereich}: {art[x.art] ?? x.art}{x.beschreibung ? ` — ${x.beschreibung}` : ''} ({x.buchung_id === b.id ? (x.phase === 'uebergabe' ? 'bei Übergabe' : x.phase === 'rueckgabe' ? 'bei Rückgabe' : 'festgestellt') : 'Vorschaden'} {de(x.erfasst_am)})</li>)}
          </ul>
        )}

        <h2 style={h2}>Mietbedingungen{b.status === 'reserviert' ? ' (gültige Fassung — wird bei der Übergabe festgehalten)' : ' (bei der Übergabe festgehaltene Fassung)'}</h2>
        <div style={{ fontSize: 11.5, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{bed || 'Es sind keine Mietbedingungen hinterlegt.'}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 40, fontSize: 12 }}>
          <div><div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>Ort, Datum, Unterschrift Vermieter</div></div>
          <div><div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>Ort, Datum, Unterschrift Mieter</div></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 34, fontSize: 12 }}>
          <div><div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>Rückgabe bestätigt (Vermieter)</div></div>
          <div><div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>Rückgabe bestätigt (Mieter)</div></div>
        </div>
      </div>
    </div>
  );
}
