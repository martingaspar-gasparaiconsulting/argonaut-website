// ============================================================================
// ARGONAUT OS · /dashboard/veranstaltungen/motorsport/[id]/starterliste — Druckansicht (Paket 296, T1)
//
// Starterliste je Gruppe (Startnummer, Name, Fahrzeug, Verzicht, Prüf-Haken,
// Startfreigabe) mit Unterschriftsspalte für die Fahrerbesprechung, dazu die
// Gästeliste (Bereich, Personen, Akkreditierung) für den Eingang.
// Server-Seite: liest unter den Rechten der angemeldeten Person (RLS).
// Ohne E-Mail, Telefon und Preise — die Liste hängt an der Strecke aus.
// ============================================================================

import type { CSSProperties } from 'react';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { ladeBetriebProfil } from '@/lib/betriebProfil';
import { MS_ARTEN, TN_STATUS, GAST_ARTEN, BEREICHE, label, zeitraumText, wannText } from '@/lib/motorsport';
import DruckKnopf from './DruckKnopf';

function t(x: unknown): string { return typeof x === 'string' ? x : ''; }

export default async function StarterlistePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: ev } = await supabase.from('ms_event').select('*').eq('id', id).maybeSingle();
  if (!ev) notFound();
  const [gr, tn, ga, fz, profil] = await Promise.all([
    supabase.from('ms_gruppe').select('id, name, startplaetze, reihenfolge').eq('event_id', id).order('reihenfolge').order('name'),
    supabase.from('ms_teilnehmer').select('id, gruppe_id, status, name, minderjaehrig, startnummer, fahrzeug_art, eigenes_fahrzeug, miet_fahrzeug_id, alter_geprueft, fuehrerschein_geprueft, briefing, verzicht_token, freigabe_am').eq('event_id', id).neq('status', 'storniert').limit(2000),
    supabase.from('ms_gast').select('art, name, firma, personen, bereich, verzicht_token, akkreditiert_am').eq('event_id', id).limit(2000),
    supabase.from('miet_fahrzeug').select('id, bezeichnung, kennzeichen').limit(1000),
    ladeBetriebProfil(supabase, user.id),
  ]);
  const teilnehmer = tn.data ?? [];
  const gaeste = ga.data ?? [];
  const tokens = [...teilnehmer.map((x) => x.verzicht_token), ...gaeste.map((x) => x.verzicht_token)].filter((x): x is string => !!x);
  const sig = tokens.length ? (await supabase.from('signatur_anfragen').select('token, status').in('token', tokens)).data ?? [] : [];
  const signiert = new Set(sig.filter((x) => x.status === 'signiert').map((x) => x.token as string));
  const fzName = (fid: string | null) => {
    const f = (fz.data ?? []).find((x) => x.id === fid);
    return f ? [t(f.bezeichnung), t(f.kennzeichen)].filter(Boolean).join(' · ') : 'Leihfahrzeug';
  };
  const verzicht = (tok: string | null) => (!tok ? '—' : signiert.has(tok) ? '✔' : tokens.length && sig.length === 0 ? '?' : 'offen');
  const haken = (b: boolean) => (b ? '✔' : '☐');

  const zelle: CSSProperties = { border: '1px solid #bbb', padding: '5px 6px', verticalAlign: 'top', fontSize: 12 };
  const kopf: CSSProperties = { ...zelle, background: '#f2efe6', fontWeight: 700 };
  const h2: CSSProperties = { fontSize: 14, margin: '18px 0 6px', borderBottom: '2px solid #C9A84C', paddingBottom: 3 };

  return (
    <div style={{ background: '#e9e9e9', minHeight: '100vh', padding: '20px 12px' }}>
      <style>{'@media print { body * { visibility: hidden !important; } #starterliste, #starterliste * { visibility: visible !important; } #starterliste { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; margin: 0 !important; } .nicht-drucken { display: none !important; } }'}</style>
      <div className="nicht-drucken" style={{ maxWidth: 980, margin: '0 auto 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <a href={`/dashboard/veranstaltungen/motorsport/${id}`} style={{ color: '#0A1628', fontSize: 13.5 }}>← zurück zum Event</a>
        <span style={{ marginLeft: 'auto' }}><DruckKnopf /></span>
      </div>
      <div id="starterliste" style={{ maxWidth: 980, margin: '0 auto', background: '#fff', color: '#111', padding: '24px 28px', fontFamily: 'DM Sans, Arial, sans-serif', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, margin: 0 }}>Starterliste · {t(ev.titel)}</h1>
            <div style={{ fontSize: 12.5, color: '#555' }}>{label(MS_ARTEN, ev.art)} · {zeitraumText(ev.beginn, ev.ende)}{ev.strecke ? ` · ${t(ev.strecke)}` : ''} · Stand {wannText(new Date().toISOString())}</div>
          </div>
          <div style={{ fontSize: 12.5, textAlign: 'right' }}><b>Veranstalter</b><br />{t(profil.firma_name) || '________________'}</div>
        </div>

        {(gr.data ?? []).map((g) => {
          const liste = teilnehmer.filter((x) => x.gruppe_id === g.id && x.status !== 'warteliste')
            .sort((a, b) => (a.startnummer ?? 99999) - (b.startnummer ?? 99999) || t(a.name).localeCompare(t(b.name), 'de'));
          return (
            <div key={g.id}>
              <h2 style={h2}>Gruppe {t(g.name)} · {liste.length} von {g.startplaetze} Startplätzen</h2>
              {liste.length === 0 ? <p style={{ fontSize: 12 }}>Keine Teilnehmer.</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={kopf}>Nr.</th><th style={kopf}>Name</th><th style={kopf}>Fahrzeug</th><th style={kopf}>Verzicht</th>
                    {ev.mindestalter > 0 && <th style={kopf}>Alter</th>}{ev.fuehrerschein_pflicht && <th style={kopf}>FS</th>}{ev.briefing_pflicht && <th style={kopf}>Briefing</th>}
                    <th style={kopf}>Freigabe</th><th style={{ ...kopf, width: '22%' }}>Unterschrift Fahrerbesprechung</th>
                  </tr></thead>
                  <tbody>
                    {liste.map((x) => (
                      <tr key={x.id}>
                        <td style={{ ...zelle, fontWeight: 700 }}>{x.startnummer ?? ''}</td>
                        <td style={zelle}>{t(x.name)}{x.minderjaehrig ? ' (minderjährig)' : ''}</td>
                        <td style={zelle}>{x.fahrzeug_art === 'leih' ? `Leih: ${fzName(x.miet_fahrzeug_id)}` : t(x.eigenes_fahrzeug)}</td>
                        <td style={zelle}>{verzicht(x.verzicht_token)}</td>
                        {ev.mindestalter > 0 && <td style={zelle}>{haken(x.alter_geprueft)}</td>}
                        {ev.fuehrerschein_pflicht && <td style={zelle}>{haken(x.fuehrerschein_geprueft)}</td>}
                        {ev.briefing_pflicht && <td style={zelle}>{haken(x.briefing)}</td>}
                        <td style={zelle}>{x.freigabe_am ? `✔ ${wannText(x.freigabe_am).slice(-5)}` : TN_STATUS[x.status] ?? x.status}</td>
                        <td style={zelle}>&nbsp;</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}

        {teilnehmer.some((x) => x.status === 'warteliste') && (
          <>
            <h2 style={h2}>Warteliste</h2>
            <p style={{ fontSize: 12 }}>{teilnehmer.filter((x) => x.status === 'warteliste').map((x) => t(x.name)).join(' · ')}</p>
          </>
        )}

        {gaeste.length > 0 && (
          <>
            <h2 style={h2}>Gästeliste · {gaeste.reduce((n, g) => n + (g.personen ?? 1), 0)} Personen</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={kopf}>Art</th><th style={kopf}>Name</th><th style={kopf}>Pers.</th><th style={kopf}>Bereich</th><th style={kopf}>Verzicht</th><th style={kopf}>Akkreditiert</th></tr></thead>
              <tbody>
                {[...gaeste].sort((a, b) => t(a.art).localeCompare(t(b.art)) || t(a.name).localeCompare(t(b.name), 'de')).map((g, i) => (
                  <tr key={i}>
                    <td style={zelle}>{label(GAST_ARTEN, g.art)}</td>
                    <td style={zelle}>{t(g.name)}{g.firma ? ` (${t(g.firma)})` : ''}</td>
                    <td style={zelle}>{g.personen}</td>
                    <td style={zelle}>{label(BEREICHE, g.bereich).replace(' (nur mit Verzicht)', '')}</td>
                    <td style={zelle}>{verzicht(g.verzicht_token)}</td>
                    <td style={zelle}>{g.akkreditiert_am ? '✔' : '☐'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p style={{ fontSize: 11, color: '#666', marginTop: 16 }}>Verzicht: ✔ digital unterschrieben · offen = versendet, noch nicht unterschrieben · ? = Status nur mit Recht „Signaturen“ sichtbar. Die unterschriebenen Fassungen liegen unter Signaturen.</p>
      </div>
    </div>
  );
}
