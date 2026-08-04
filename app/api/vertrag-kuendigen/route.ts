import { createClient } from '@/lib/supabase-server'
import { sendeMail, mailLayout } from '@/lib/mail'

// ---------------------------------------------------------------------
// ARGONAUT OS · C1 · Vertrag kündigen (§ 312k-Ablauf)
// Nimmt einen gewählten Vertrag + optionalen Grund entgegen, schreibt die
// Kündigung fest (status=gekuendigt, kuendigung_grund, kuendigung_am) und
// verschickt eine Bestätigung in Textform per Mail. RLS scopet auf den
// Betrieb — nur eigene Verträge sind erreichbar.
//
// NICHT zu verwechseln mit app/api/vertrag-kuendigung (KI-Brief-Entwurf).
// ---------------------------------------------------------------------

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const t = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${t}`
}
function stichtag(ende: string | null, fristTage: number | null): string | null {
  if (!ende) return null
  const d = new Date(ende)
  if (isNaN(d.getTime())) return null
  d.setDate(d.getDate() - (Number(fristTage) || 0))
  return d.toISOString().slice(0, 10)
}
function deDatum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE')
}
function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

export async function POST(req: Request) {
  let vertragId = ''
  let grund = ''
  try {
    const body = await req.json()
    vertragId = String(body?.vertrag_id ?? '').trim()
    grund = String(body?.grund ?? '').trim()
  } catch {
    return Response.json({ ok: false, fehler: 'Ungültige Anfrage.' }, { status: 400 })
  }
  if (!vertragId) return Response.json({ ok: false, fehler: 'Kein Vertrag gewählt.' }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, fehler: 'Nicht angemeldet.' }, { status: 401 })

  // Vertrag laden — RLS stellt sicher, dass er zum eigenen Betrieb gehört.
  const { data: v, error: ladeErr } = await supabase
    .from('vertraege')
    .select('id, bezeichnung, vertragspartner, vertragsnummer, ende, kuendigungsfrist_tage, status')
    .eq('id', vertragId)
    .single()
  if (ladeErr || !v) return Response.json({ ok: false, fehler: 'Vertrag nicht gefunden.' }, { status: 404 })
  if (v.status === 'gekuendigt')
    return Response.json({ ok: false, fehler: 'Dieser Vertrag ist bereits gekündigt.' }, { status: 409 })

  const heute = ymd(new Date())

  // Kündigung festschreiben.
  const { error: updErr } = await supabase
    .from('vertraege')
    .update({ status: 'gekuendigt', kuendigung_grund: grund || null, kuendigung_am: heute })
    .eq('id', vertragId)
  if (updErr)
    return Response.json({ ok: false, fehler: 'Kündigung konnte nicht gespeichert werden.' }, { status: 500 })

  const spaetester = stichtag(v.ende, v.kuendigungsfrist_tage)

  // Bestätigung in Textform (§ 312k). Best effort — die Kündigung ist bereits
  // gespeichert; ein Mail-Problem darf den Vorgang nicht umwerfen.
  let mailOk = false
  if (user.email) {
    const html = mailLayout(
      'Kündigung bestätigt',
      `<p style="margin:0 0 14px;">Ihre Kündigung wurde erfasst und der Vertrag auf „gekündigt" gesetzt.</p>
       <table style="border-collapse:collapse;font-size:14px;">
         <tr><td style="padding:4px 14px 4px 0;color:#8FA3BE;">Vertrag</td><td style="padding:4px 0;"><b>${esc(v.bezeichnung || '')}</b></td></tr>
         <tr><td style="padding:4px 14px 4px 0;color:#8FA3BE;">Vertragspartner</td><td style="padding:4px 0;">${esc(v.vertragspartner || '—')}</td></tr>
         <tr><td style="padding:4px 14px 4px 0;color:#8FA3BE;">Vertragsnummer</td><td style="padding:4px 0;">${esc(v.vertragsnummer || '—')}</td></tr>
         <tr><td style="padding:4px 14px 4px 0;color:#8FA3BE;">Gekündigt am</td><td style="padding:4px 0;">${deDatum(heute)}</td></tr>
         <tr><td style="padding:4px 14px 4px 0;color:#8FA3BE;">Vertragsende</td><td style="padding:4px 0;">${deDatum(v.ende)}</td></tr>
         <tr><td style="padding:4px 14px 4px 0;color:#8FA3BE;">Spätester Kündigungstermin</td><td style="padding:4px 0;">${deDatum(spaetester)}</td></tr>
         ${grund ? `<tr><td style="padding:4px 14px 4px 0;color:#8FA3BE;vertical-align:top;">Grund</td><td style="padding:4px 0;">${esc(grund)}</td></tr>` : ''}
       </table>
       <p style="margin:16px 0 0;">Die Kündigung wurde zum nächstmöglichen Zeitpunkt vermerkt. Diese E-Mail dient als Bestätigung in Textform.</p>`,
    )
    const r = await sendeMail({ an: user.email, betreff: `Kündigungsbestätigung: ${v.bezeichnung}`, html })
    mailOk = r.ok
  }

  return Response.json({
    ok: true,
    mailGesendet: mailOk,
    an: user.email ?? null,
    vertrag: {
      bezeichnung: v.bezeichnung,
      ende: v.ende,
      spaetesterTermin: spaetester,
      gekuendigtAm: heute,
    },
  })
}
