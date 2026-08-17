// app/api/website-anfrage/route.ts
// ARGONAUT OS — Anfrage-Intake der NEUEN Website (/vorschau).
// -----------------------------------------------------------------------------
// EIGENE, saubere Route für ARGONAUT-Verkaufs-Leads. Bewusst NICHT /api/leads
// (die ist fest auf Kunde Schäfer + Forst-Felder verdrahtet).
// Ablauf pro Anfrage:
//   1. (falls Wunschtermin) Slot in website_termine reservieren — UNIQUE-Sperre
//      verhindert Doppelbuchung -> 409 "vergeben".
//   2. Komplette Anfrage in website_anfragen speichern (eigene DB, kein Lead
//      geht verloren; das Control-Center liest genau diese Tabelle).
//   3. VOLL AUTONOM (kein n8n mehr): interne Benachrichtigung an info@argonaut-os.com
//      + Bestätigungsmail an den Interessenten — beide über den eigenen
//      Resend-Versand (lib/mail.ts).
// Antwort ok, sobald die Anfrage entweder in der DB liegt ODER die interne
// Benachrichtigung raus ist (kein Lead geht verloren).
// -----------------------------------------------------------------------------
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendeMail, mailLayout } from '@/lib/mail'
import { escapeHtml } from '@/lib/newsletter'
import { starteDossierOptin } from '@/lib/dossierFunnel'

export const runtime = 'nodejs'

// Interne Postadresse für neue Website-Leads (landet in Martins Postfach).
const INTERN_MAIL = 'info@argonaut-os.com'

function clean(v: unknown, max = 2000): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t.slice(0, max)
}

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey)
}

// Reserviert den Slot. 'ok' | 'taken' | 'skip' (kein/ungültiger Termin) | 'error'.
async function reserviereSlot(supabase: SupabaseClient | null, key: string | null, ref: Record<string, string | null>) {
  if (!key || key.length < 12) return 'skip' as const
  const slot_date = key.slice(0, 10)
  const slot_time = key.slice(11).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot_date) || !/^\d{2}:\d{2}$/.test(slot_time)) return 'skip' as const
  if (!supabase) return 'skip' as const

  const { error } = await supabase.from('website_termine').insert({
    slot_date, slot_time,
    name: ref.name, email: ref.email, telefon: ref.telefon, unternehmen: ref.unternehmen, branche: ref.branche,
  })
  if (!error) return 'ok' as const
  if ((error as { code?: string }).code === '23505') return 'taken' as const
  console.error('Slot-Reservierung fehlgeschlagen:', error)
  return 'error' as const
}

// Speichert die komplette Anfrage in der eigenen DB. true = gespeichert.
async function speichereAnfrage(supabase: SupabaseClient | null, payload: Record<string, string | null>) {
  if (!supabase) return false
  const { error } = await supabase.from('website_anfragen').insert(payload)
  if (error) { console.error('Anfrage speichern fehlgeschlagen:', error); return false }
  return true
}

// Baut eine kleine HTML-Definitionsliste aus den ausgefüllten Feldern.
function felderHtml(rows: Array<[string, string | null]>): string {
  return rows
    .filter(([, v]) => v && v.trim() !== '')
    .map(([label, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7688;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:4px 0;color:#1a2332;font-weight:600;">${escapeHtml(String(v))}</td></tr>`)
    .join('')
}

// Interne Benachrichtigung an info@argonaut-os.com. true = zugestellt.
async function benachrichtigeIntern(payload: Record<string, string | null>): Promise<boolean> {
  const titel = 'Neue Website-Anfrage'
  const tabelle = felderHtml([
    ['Name', payload.name],
    ['Unternehmen', payload.unternehmen],
    ['E-Mail', payload.email],
    ['Telefon', payload.telefon],
    ['Mitarbeiter', payload.mitarbeiter],
    ['Branche', payload.branche],
    ['Kontaktwunsch', payload.kontaktwunsch],
    ['Wunschtermin', payload.wunschtermin],
    ['Angebot', payload.angebot],
    ['Preis', payload.preis],
    ['Nachricht', payload.nachricht],
  ])
  const html = mailLayout(
    titel,
    `<p style="margin:0 0 14px;">Über das Formular auf der Website ist eine neue Anfrage eingegangen:</p>
     <table style="border-collapse:collapse;font-size:14px;">${tabelle}</table>
     <p style="margin:16px 0 0;color:#6b7688;font-size:13px;">Die Anfrage ist im Control Room unter „Website-Anfragen" gespeichert. Auf diese E-Mail antworten geht direkt an den Interessenten.</p>`
  )
  const betreff = `Neue Website-Anfrage: ${payload.name || 'unbekannt'}${payload.unternehmen ? ' · ' + payload.unternehmen : ''}`
  const r = await sendeMail({
    an: INTERN_MAIL,
    betreff,
    html,
    // Antwort geht direkt an den Interessenten (falls E-Mail vorhanden).
    ...(payload.email ? { antwortAn: payload.email } : {}),
  })
  if (!r.ok) console.error('Interne Anfrage-Mail fehlgeschlagen:', r.fehler)
  return r.ok
}

// Bestätigungsmail an den Interessenten (best effort, nicht erfolgskritisch).
async function bestaetigeInteressent(payload: Record<string, string | null>): Promise<void> {
  if (!payload.email) return
  const vorname = (payload.name || '').split(' ')[0]
  const kontaktLabel = payload.kontaktwunsch === 'Anruf' ? 'telefonisch' : 'per E-Mail'
  const html = mailLayout(
    'Anfrage erhalten',
    `<p style="margin:0 0 14px;">Guten Tag${vorname ? ' ' + escapeHtml(vorname) : ''},</p>
     <p style="margin:0 0 14px;">vielen Dank für Ihr Interesse an ARGONAUT OS. Ihre Anfrage ist bei uns eingegangen — wir melden uns innerhalb von 24 Stunden ${kontaktLabel} bei Ihnen.</p>
     <p style="margin:0 0 14px;">Wenn Sie in der Zwischenzeit Fragen haben, antworten Sie einfach auf diese E-Mail.</p>
     <p style="margin:16px 0 0;">Beste Grüße<br>Ihr ARGONAUT-Team</p>`
  )
  try {
    const r = await sendeMail({ an: payload.email, betreff: 'Ihre Anfrage bei ARGONAUT OS', html })
    if (!r.ok) console.error('Bestätigungsmail fehlgeschlagen:', r.fehler)
  } catch (e) {
    console.error('Bestätigungsmail-Versand fehlgeschlagen:', e)
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
    }

    const name = clean((body as any).name, 200)
    const email = clean((body as any).email, 200)
    const telefon = clean((body as any).telefon, 60)
    const unternehmen = clean((body as any).unternehmen, 200)
    const branche = clean((body as any).branche, 120)

    if (!name || (!email && !telefon)) {
      return NextResponse.json({ error: 'Name und E-Mail oder Telefon erforderlich.' }, { status: 400 })
    }
    // 16.08.26: Die beiden Pflicht-Haekchen (Datenschutz + AGB) sind entfallen.
    //
    // AGB: Bei einer Anfrage kommt kein Vertrag zustande — AGB werden nach
    // § 305 Abs. 2 BGB erst beim Vertragsschluss einbezogen. Beim spaeteren
    // Bestellvorgang gehoeren sie wieder hin, zusammen mit dem § 312j-Button.
    //
    // Datenschutz: Die Verarbeitung der Kontaktdaten stuetzt sich auf
    // Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche Massnahme), nicht auf eine
    // Einwilligung. Als Einwilligung war das Haekchen zudem unwirksam, weil es
    // nirgends gespeichert wurde — Art. 7 Abs. 1 DSGVO verlangt den Nachweis.
    // Pflicht ist die Information nach Art. 13 DSGVO; die steht im Formular.
    //
    // Aeltere, noch offene Seiten schicken die Felder womoeglich weiter mit.
    // Das stoert nicht: sie werden schlicht ignoriert.

    const supabase = getSupabase()

    // 1. Wunschtermin reservieren (falls gewählt). Doppelbuchung -> 409.
    const slotKey = clean((body as any).wunschterminKey, 30)
    const reserv = await reserviereSlot(supabase, slotKey, { name, email, telefon, unternehmen, branche })
    if (reserv === 'taken') {
      return NextResponse.json({ error: 'Der gewählte Termin ist gerade vergeben. Bitte einen anderen Termin wählen.', code: 'slot_taken' }, { status: 409 })
    }

    const payload = {
      name,
      email,
      telefon,
      unternehmen,
      mitarbeiter: clean((body as any).mitarbeiter, 40),
      branche,
      kontaktwunsch: clean((body as any).kontaktwunsch, 20),
      wunschtermin: clean((body as any).wunschtermin, 120),
      angebot: clean((body as any).angebot, 300),
      preis: clean((body as any).preis, 40),
      nachricht: clean((body as any).nachricht, 5000),
      source: 'argonaut-website-vorschau',
    }

    // 2. In eigener DB speichern (kein Lead geht verloren).
    const dbOk = await speichereAnfrage(supabase, payload)

    // 3. Autonome Zustellung über den eigenen Mailversand (kein n8n):
    //    a) interne Benachrichtigung an info@argonaut-os.com
    //    b) Bestätigung an den Interessenten (falls E-Mail vorhanden)
    const internOk = await benachrichtigeIntern(payload)
    await bestaetigeInteressent(payload)

    // Automatischer Dossier-Double-Opt-in: Termin- UND Test-Route laufen hier
    // durch. Best effort — ein Fehler hier darf die Anfrage nie scheitern lassen.
    if (email) {
      const quelle = (payload.angebot || '').toLowerCase().includes('test') ? 'test' : 'termin'
      try { await starteDossierOptin(email, name, branche, quelle) } catch {}
    }

    // Erfolg, sobald die Anfrage in der DB liegt ODER intern zugestellt wurde.
    if (!dbOk && !internOk) {
      return NextResponse.json({ error: 'Zustellung fehlgeschlagen.' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('website-anfrage Fehler:', err)
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 })
  }
}
