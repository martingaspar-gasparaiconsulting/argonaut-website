import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { bogenFragen, spickzettel, ERGEBNIS_TEXT, grundText, type Ergebnis } from '@/lib/qualifizierung'
import { ladeVerkaufsteam } from '@/lib/verkaufsteamLaden'
import { personName } from '@/lib/verkaufsteam'
import { ergebnis as anrufErgebnis } from '@/lib/anrufSitzung'
import { STUFEN_INFO, stufeOderStandard } from '@/lib/leadStufen'
import DruckKnopf from './DruckKnopf'

// ============================================================================
// ARGONAUT OS · Paket VK2 (16.10.2026) — Spickzettel vor dem Verkaufsgespräch.
// Alles auf EINER Seite: Kontakt, Anfrage, Antworten aus der Qualifizierung,
// Übergabe-Notiz des Setters, letzte Anrufe. Nur lesen, druckbar.
// Rechte wie die Lead-Seite (RLS): wer den Lead nicht sieht, bekommt 404.
// Freie Setter sehen keine Preise — hier stehen ohnehin keine.
// ============================================================================

type Lead = {
  id: string; name: string | null; telefon: string | null; email: string | null; dienstleistung: string | null; menge: string | number | null;
  einheit: string | null; wunschtermin: string | null; nachricht: string | null; quelle: string | null; stufe: string | null; created_at: string
}

function datum(t: string | null | undefined, mitZeit = true): string {
  if (!t) return '—'
  try {
    return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', ...(mitZeit ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(t))
  } catch { return t }
}

const zeile = { display: 'grid', gridTemplateColumns: 'minmax(140px, 220px) 1fr', gap: '12px', padding: '7px 0', borderBottom: '1px solid #e3e7ee', fontSize: '15px' }
const kopf = { fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, fontWeight: 700, color: '#8a6d1f', margin: '22px 0 6px' }

export default async function SpickzettelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data } = await supabase.from('leads')
    .select('id, name, telefon, email, dienstleistung, menge, einheit, wunschtermin, nachricht, quelle, stufe, created_at')
    .eq('id', id).maybeSingle()
  if (!data) notFound()
  const lead = data as Lead

  const [stand, q, u, a] = await Promise.all([
    ladeVerkaufsteam(supabase),
    supabase.from('lead_qualifizierung').select('bogen_id, antworten, ergebnis, grund, grund_text, aktualisiert_am').eq('lead_id', id).maybeSingle(),
    supabase.from('vk_uebergabe').select('von_user_id, an_user_id, notiz, erstellt_am').eq('lead_id', id).order('erstellt_am', { ascending: false }).limit(3),
    supabase.from('vk_anruf').select('ergebnis, notiz, anrufer_name, erstellt_am').eq('lead_id', id).order('erstellt_am', { ascending: false }).limit(5),
  ])
  const quali = q.data as { bogen_id: string | null; antworten: Record<string, unknown>; ergebnis: Ergebnis; grund: string | null; grund_text: string | null; aktualisiert_am: string } | null
  let bogenName = 'Standard-Bogen'
  let fragenRoh: unknown = []
  let mitStandard = true
  if (quali?.bogen_id) {
    const { data: b } = await supabase.from('vk_bogen').select('name, fragen, mit_standard').eq('id', quali.bogen_id).maybeSingle()
    if (b) { bogenName = String((b as { name: string }).name); fragenRoh = (b as { fragen: unknown }).fragen; mitStandard = (b as { mit_standard: boolean }).mit_standard !== false }
  }
  const antworten = Object.fromEntries(Object.entries(quali?.antworten ?? {}).map(([k, v]) => [k, String(v ?? '')]))
  const liste = spickzettel(bogenFragen(fragenRoh, mitStandard), antworten)
  const uebergaben = (u.data as { von_user_id: string | null; an_user_id: string; notiz: string | null; erstellt_am: string }[] | null) ?? []
  const anrufe = (a.data as { ergebnis: string; notiz: string | null; anrufer_name: string | null; erstellt_am: string }[] | null) ?? []
  const team = stand.bereit ? stand.team : []
  const stufe = STUFEN_INFO[stufeOderStandard(lead.stufe)]

  return (
    <div style={{ background: '#f6f7f9', minHeight: '100vh', color: '#0a1628', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
      <style>{'@media print{.nicht-drucken{display:none!important} body{background:#fff}}'}</style>
      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '28px 20px 60px' }}>
        <div className="nicht-drucken" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <a href={`/dashboard/leads/${lead.id}`} style={{ color: '#556173', textDecoration: 'none', fontSize: '14px' }}>← Zum Lead</a>
          <DruckKnopf />
        </div>
        <div style={{ background: '#fff', border: '1px solid #dfe3ea', borderRadius: '14px', padding: '24px 28px' }}>
          <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a6d1f', fontWeight: 700 }}>Spickzettel fürs Gespräch</div>
          <h1 style={{ margin: '6px 0 4px', fontSize: '28px' }}>{lead.name || 'Ohne Namen'}</h1>
          <div style={{ color: '#556173', fontSize: '14px' }}>
            Stufe: {stufe.label} · Anfrage vom {datum(lead.created_at, false)}{lead.quelle ? ` · Quelle: ${lead.quelle}` : ''}
          </div>

          <div style={kopf}>Kontakt</div>
          <div style={zeile}><span>Telefon</span><b>{lead.telefon ? <a href={`tel:${lead.telefon}`} style={{ color: 'inherit' }}>{lead.telefon}</a> : '—'}</b></div>
          <div style={zeile}><span>E-Mail</span><span>{lead.email || '—'}</span></div>

          <div style={kopf}>Anfrage</div>
          <div style={zeile}><span>Leistung</span><span>{lead.dienstleistung || '—'}{lead.menge ? ` · ${lead.menge} ${lead.einheit ?? ''}` : ''}</span></div>
          <div style={zeile}><span>Wunschtermin</span><span>{lead.wunschtermin || '—'}</span></div>
          {lead.nachricht && <div style={zeile}><span>Nachricht</span><span style={{ whiteSpace: 'pre-wrap' }}>{lead.nachricht}</span></div>}

          <div style={kopf}>Qualifizierung · {bogenName} · {quali ? ERGEBNIS_TEXT[quali.ergebnis] : 'noch nicht erfasst'}</div>
          {quali?.ergebnis === 'passt_nicht' && (
            <div style={{ ...zeile, color: '#b3261e' }}><span>Grund</span><b>{grundText(quali.grund)}{quali.grund_text ? ` – ${quali.grund_text}` : ''}</b></div>
          )}
          {liste.map((x) => (
            <div key={x.frage} style={zeile}><span>{x.frage}</span><span style={{ color: x.offen ? '#b3261e' : 'inherit', fontWeight: x.offen ? 400 : 600, whiteSpace: 'pre-wrap' }}>{x.offen ? '— noch klären' : x.antwort}</span></div>
          ))}

          {uebergaben.length > 0 && <>
            <div style={kopf}>Übergabe</div>
            {uebergaben.map((x, i) => (
              <div key={i} style={zeile}>
                <span>{datum(x.erstellt_am)}<br /><small style={{ color: '#556173' }}>{personName(team, x.von_user_id) ?? '—'} → {personName(team, x.an_user_id) ?? '—'}</small></span>
                <span style={{ whiteSpace: 'pre-wrap' }}>{x.notiz || '—'}</span>
              </div>
            ))}
          </>}

          {anrufe.length > 0 && <>
            <div style={kopf}>Letzte Anrufe</div>
            {anrufe.map((x, i) => (
              <div key={i} style={zeile}><span>{datum(x.erstellt_am)}</span><span>{anrufErgebnis(x.ergebnis)?.name ?? x.ergebnis}{x.anrufer_name ? ` · ${x.anrufer_name}` : ''}{x.notiz ? ` · ${x.notiz}` : ''}</span></div>
            ))}
          </>}
        </div>
      </main>
    </div>
  )
}
