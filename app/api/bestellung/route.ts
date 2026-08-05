import { NextResponse } from 'next/server'
import { angebotssumme, euro, STUFEN, type StufeKey } from '@/lib/tarif'
import { ibanGueltig } from '@/lib/sepa'
import { sendeMail, mailLayout } from '@/lib/mail'
import { createAdminClient } from '@/lib/supabase-admin'
import { BESTELLSTRECKE_LIVE } from '@/lib/flags'
import { auftragsbestaetigungHtml } from '@/lib/auftragsbestaetigung'
import { aboRechnungPdf } from '@/lib/aboRechnungPdf'

// ============================================================================
// ARGONAUT OS · /api/bestellung  (Block I1d — öffentliche Bestellstrecke)
//
// Nimmt eine verbindliche Bestellung aus /buchen entgegen. Sicherheits-Prinzip:
//   0. DUNKEL: solange BESTELLSTRECKE_LIVE === false -> 403, keine Bestellung.
//   1. Preis wird SERVERSEITIG aus lib/tarif berechnet (Browser-Zahlen ignoriert).
//   2. IBAN per Modulo-97 geprüft; nur MASKIERT gespeichert.
//   3. Speichern in der ISOLIERTEN Tabelle bestellungen (Service-Role, RLS-dicht).
//   4. KEIN Einzug — nur Benachrichtigung an den Betreiber.
// ============================================================================

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OPERATOR_MAIL = 'info@argonaut-os.com'
const GUELTIGE_STUFEN = STUFEN.map((s) => s.key) as StufeKey[]

function maskIban(ibanRaw: string): string {
  const c = (ibanRaw || '').replace(/\s+/g, '').toUpperCase()
  if (c.length < 8) return '****'
  return `${c.slice(0, 4)} …… ${c.slice(-4)}`
}
function ganzzahl(v: unknown): number { return Math.max(0, Math.floor(Number(v) || 0)) }

export async function POST(req: Request) {
  // 0) Dunkel-Schalter: nichts annehmen, solange nicht scharf.
  if (!BESTELLSTRECKE_LIVE) {
    return NextResponse.json({ ok: false, error: 'Die Bestellstrecke ist noch nicht freigeschaltet.' }, { status: 403 })
  }

  let b: {
    stufe?: string
    sitze?: { voll?: number; standard?: number; self_service?: number }
    laufzeit?: number
    istUnternehmer?: boolean
    firma?: { firma?: string; strasse?: string; plz?: string; ort?: string; ustId?: string; ansprechpartner?: string; email?: string; telefon?: string }
    kontoinhaber?: string; iban?: string; bic?: string
    mandatOk?: boolean; agbOk?: boolean; avvOk?: boolean
  }
  try { b = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Ungültiger Body.' }, { status: 400 })
  }

  const stufe = String(b.stufe || '').trim() as StufeKey
  if (!GUELTIGE_STUFEN.includes(stufe)) return NextResponse.json({ ok: false, error: 'Ungültige Tarif-Stufe.' }, { status: 400 })
  if (!b.istUnternehmer) return NextResponse.json({ ok: false, error: 'Bitte die Unternehmer-Bestätigung (§ 14 BGB) setzen.' }, { status: 400 })
  if (!b.agbOk || !b.avvOk) return NextResponse.json({ ok: false, error: 'AGB und AVV müssen akzeptiert werden.' }, { status: 400 })
  if (!b.mandatOk) return NextResponse.json({ ok: false, error: 'Bitte das SEPA-Lastschriftmandat bestätigen.' }, { status: 400 })

  const firma = (b.firma?.firma || '').trim()
  const email = (b.firma?.email || '').trim()
  const ansprech = (b.firma?.ansprechpartner || '').trim()
  if (!firma || !email || !ansprech) return NextResponse.json({ ok: false, error: 'Firmendaten sind unvollständig.' }, { status: 400 })

  const kontoinhaber = (b.kontoinhaber || '').trim()
  const iban = (b.iban || '').trim()
  if (!kontoinhaber) return NextResponse.json({ ok: false, error: 'Bitte den Kontoinhaber angeben.' }, { status: 400 })
  if (!ibanGueltig(iban)) return NextResponse.json({ ok: false, error: 'Die IBAN ist ungültig.' }, { status: 400 })

  const laufzeit = Math.round(Number(b.laufzeit) || 12)
  const sitze = {
    voll: ganzzahl(b.sitze?.voll),
    standard: ganzzahl(b.sitze?.standard),
    self_service: ganzzahl(b.sitze?.self_service),
  }
  // Preis SERVERSEITIG — die Zahlen aus dem Browser werden bewusst ignoriert.
  const summe = angebotssumme(stufe, sitze, laufzeit)

  const admin = createAdminClient()
  const { data: ins, error } = await admin.from('oeffentliche_bestellungen').insert({
    stufe_key: stufe,
    sitze,
    laufzeit_monate: laufzeit,
    firma,
    strasse: b.firma?.strasse?.trim() || null,
    plz: b.firma?.plz?.trim() || null,
    ort: b.firma?.ort?.trim() || null,
    ust_id: b.firma?.ustId?.trim() || null,
    ansprechpartner: ansprech,
    email,
    telefon: b.firma?.telefon?.trim() || null,
    kontoinhaber,
    iban_masked: maskIban(iban),
    bic: (b.bic || '').trim() || null,
    betrag_snapshot: summe,
    paragraf14_ok: true,
    agb_ok: true,
    avv_ok: true,
    status: 'neu',
  }).select('id').single()
  if (error || !ins) return NextResponse.json({ ok: false, error: 'Bestellung konnte nicht gespeichert werden.' }, { status: 500 })
  const orderId = ins.id as string

  // --- I2: Konto automatisch anlegen (best-effort; ein Fehler kippt die
  //         gespeicherte Bestellung NICHT). Läuft nur, wenn die Strecke scharf
  //         ist (oben bereits per BESTELLSTRECKE_LIVE abgesichert). ------------
  try {
    const origin = new URL(req.url).origin
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent('/auth/passwort-neu')}`
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo } })
    if (!linkErr && linkData?.user?.id) {
      const userId = linkData.user.id
      const felder = { email, firma_name: firma || null, plan: stufe, status: 'active', onboarding_completed: false }
      const { data: upd } = await admin.from('profiles').update(felder).eq('id', userId).select('id')
      if (!upd || upd.length === 0) await admin.from('profiles').insert({ id: userId, ...felder })
      await admin.from('oeffentliche_bestellungen').update({ kunde_user_id: userId, status: 'konto_angelegt' }).eq('id', orderId)
      const actionLink = linkData.properties?.action_link
      if (actionLink) {
        await sendeMail({
          an: email,
          betreff: 'Willkommen bei ARGONAUT OS — Zugang aktivieren',
          html: mailLayout('Ihr Zugang steht bereit', `
            <p>Herzlich willkommen bei ARGONAUT OS${firma ? `, ${firma}` : ''}!</p>
            <p>Ihr Zugang wurde eingerichtet. Klicken Sie auf den Button, um Ihr Passwort zu setzen und loszulegen:</p>
            <p style="margin:24px 0;"><a href="${actionLink}" style="display:inline-block;background:#C9A84C;color:#0A1628;text-decoration:none;font-weight:800;padding:13px 24px;border-radius:8px;">Passwort setzen &amp; starten</a></p>
            <p style="color:#8FA3BE;font-size:13px;">Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>${actionLink}</p>`),
        })
      }
    }
    // E-Mail existiert bereits / anderer Fehler: Bestellung bleibt „neu",
    // der Betreiber sieht sie in der Benachrichtigung und legt manuell an.
  } catch { /* Konto-Anlage ist best-effort */ }

  // --- I3: Auftragsbestätigung an den Kunden (best-effort; PDF via Gotenberg,
  //         ohne Gotenberg trotzdem eine Bestätigungs-Mail). -------------------
  try {
    const stufeName = STUFEN.find((s) => s.key === stufe)?.name ?? stufe.toUpperCase()
    const html = auftragsbestaetigungHtml({
      firma,
      ansprechpartner: ansprech,
      strasse: b.firma?.strasse ?? null,
      plz: b.firma?.plz ?? null,
      ort: b.firma?.ort ?? null,
      ustId: b.firma?.ustId ?? null,
      stufeName,
      laufzeit,
      summe,
      datum: new Date().toLocaleDateString('de-DE'),
    })
    const pdf = await aboRechnungPdf(html)
    await sendeMail({
      an: email,
      betreff: 'Ihre Auftragsbestätigung — ARGONAUT OS',
      html: mailLayout('Ihre Auftragsbestätigung', `
        <p>Guten Tag ${ansprech},</p>
        <p>vielen Dank für Ihre Bestellung. Ihre Auftragsbestätigung finden Sie ${pdf ? 'im Anhang' : 'unten zusammengefasst'}.</p>
        <p><b>${stufeName}</b> · ${laufzeit} Monate — erster Monat <b>${euro(summe.ersterMonatBrutto)}</b> brutto.</p>`),
      ...(pdf ? { anhaenge: [{ dateiname: 'Auftragsbestaetigung-ARGONAUT.pdf', inhalt: pdf, typ: 'application/pdf' }] } : {}),
    })
  } catch { /* Auftragsbestätigung ist best-effort */ }

  // Benachrichtigung an den Betreiber — KEIN Einzug.
  try {
    await sendeMail({
      an: OPERATOR_MAIL,
      betreff: `Neue Bestellung: ${firma} · ${stufe.toUpperCase()} · ${euro(summe.monatlich.brutto)}/Mon`,
      html: mailLayout('Neue Bestellung (Bestellstrecke)', `
        <p><b>${firma}</b> hat verbindlich bestellt.</p>
        <p><b>Ansprechpartner:</b> ${ansprech} · ${email}</p>
        <p><b>Paket:</b> ${stufe.toUpperCase()} · <b>Laufzeit:</b> ${laufzeit} Monate</p>
        <p><b>Monatlich brutto:</b> ${euro(summe.monatlich.brutto)} · <b>Erster Monat:</b> ${euro(summe.ersterMonatBrutto)}</p>
        <p><b>SEPA-Mandat erteilt</b> (${maskIban(iban)}) — <b>es wurde KEIN Einzug ausgelöst.</b></p>
        <p>Bitte im Control Center prüfen und freigeben.</p>`),
    })
  } catch { /* Mail-Fehler darf die Bestellung nicht kippen */ }

  return NextResponse.json({ ok: true })
}
