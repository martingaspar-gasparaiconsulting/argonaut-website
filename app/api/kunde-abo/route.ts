import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { monatspreis, onboardingFuer, getStufe, euro, MWST, STUFEN, type StufeKey, type SitzTyp } from '@/lib/tarif'
import { ibanGueltig } from '@/lib/sepa'
import { sendeMail, mailLayout } from '@/lib/mail'
import { createAdminClient } from '@/lib/supabase-admin'
import { aboRechnungHtml, aboRechnungPdf } from '@/lib/aboRechnungPdf'

// ============================================================================
// ARGONAUT OS · /api/kunde-abo  (Onboarding C · Schritt 5 · Teil 1)
//
// Der KUNDE (Chef) bestätigt sein Abo/Upgrade + erteilt das SEPA-Mandat.
//   1. Auth (eingeloggter Kunde).
//   2. Preis wird SERVERSEITIG aus lib/tarif.ts berechnet — Browser-Zahlen
//      werden ignoriert (kein Manipulieren des Preises).
//   3. Upgrade-Regel: existiert bereits ein Abo -> Bestandskunde -> KEIN
//      erneutes Onboarding. Erst-Anlage -> Onboarding der Stufe fällt an.
//   4. IBAN wird per Modulo-97 geprüft.
//   5. Abo wird in kunden_abo gespeichert (RLS: nur die eigene Zeile).
//   6. KEINE Abbuchung hier — der Einzug läuft später über die Betreiber-
//      Sammellastschrift (Teil 2). Stattdessen: Benachrichtigung an den
//      Betreiber per Mail (Control-Center-Meldung).
// ============================================================================

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OPERATOR_MAIL = 'info@argonaut-os.com'
const GUELTIGE_STUFEN = STUFEN.map((s) => s.key) as StufeKey[]

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 })

  let body: {
    stufe?: string; mitarbeiterAnzahl?: number;
    sitze?: { voll?: number; standard?: number; self_service?: number };
    kontoinhaber?: string; iban?: string; bic?: string; mandatAkzeptiert?: boolean;
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Ungültiger Body.' }, { status: 400 })
  }

  // --- Stufe validieren ------------------------------------------------------
  const stufe = (body.stufe || '').trim() as StufeKey
  if (!GUELTIGE_STUFEN.includes(stufe)) {
    return NextResponse.json({ ok: false, error: 'Ungültige Tarif-Stufe.' }, { status: 400 })
  }

  // --- Mandat/IBAN prüfen ----------------------------------------------------
  if (!body.mandatAkzeptiert) {
    return NextResponse.json({ ok: false, error: 'Bitte das SEPA-Lastschriftmandat bestätigen.' }, { status: 400 })
  }
  const kontoinhaber = (body.kontoinhaber || '').trim()
  const iban = (body.iban || '').replace(/\s+/g, '').toUpperCase()
  const bic = (body.bic || '').trim() || null
  if (!kontoinhaber) return NextResponse.json({ ok: false, error: 'Bitte den Kontoinhaber angeben.' }, { status: 400 })
  if (!ibanGueltig(iban)) return NextResponse.json({ ok: false, error: 'Bitte eine gültige IBAN angeben.' }, { status: 400 })

  // --- Sitze bereinigen ------------------------------------------------------
  const sitze = {
    voll: Math.max(0, Math.round(Number(body.sitze?.voll ?? 0)) || 0),
    standard: Math.max(0, Math.round(Number(body.sitze?.standard ?? 0)) || 0),
    self_service: Math.max(0, Math.round(Number(body.sitze?.self_service ?? 0)) || 0),
  }
  const maAnzahl = body.mitarbeiterAnzahl != null ? Math.max(1, Math.round(Number(body.mitarbeiterAnzahl))) : null

  // --- Preis SERVERSEITIG rechnen -------------------------------------------
  const preis = monatspreis(stufe, sitze)
  const stufeObj = getStufe(stufe)

  // --- Upgrade-Regel: existiert schon ein Abo? -> Bestandskunde, kein Onboarding
  const { data: bestehend } = await supabase
    .from('kunden_abo')
    .select('id, status')
    .eq('tenant_user_id', user.id)
    .maybeSingle()
  const istBestandskunde = !!bestehend
  const onboarding = onboardingFuer(stufe, istBestandskunde)

  // --- Mandatsreferenz (stabil, falls noch keine vorhanden) -----------------
  const heute = new Date().toISOString().slice(0, 10)
  const mandatsreferenz = `ARGO-${user.id.slice(0, 8).toUpperCase()}`

  const payload = {
    tenant_user_id: user.id,
    stufe,
    mitarbeiter_anzahl: maAnzahl,
    sitze_voll: stufeObj.allIn ? 0 : sitze.voll,
    sitze_standard: stufeObj.allIn ? 0 : sitze.standard,
    sitze_self: stufeObj.allIn ? 0 : sitze.self_service,
    grundgebuehr_netto: stufeObj.grundgebuehr,
    monatspreis_netto: preis.netto,
    onboarding_netto: onboarding,
    ist_bestandskunde: istBestandskunde,
    kontoinhaber,
    iban,
    bic,
    mandatsreferenz,
    mandat_datum: heute,
    mandat_erteilt: true,
    status: 'neu',
    gemeldet_am: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data: aboRow, error } = await supabase
    .from('kunden_abo')
    .upsert(payload, { onConflict: 'tenant_user_id' })
    .select('id')
    .single()
  if (error) {
    return NextResponse.json({ ok: false, error: 'Abo konnte nicht gespeichert werden: ' + error.message }, { status: 500 })
  }

  // --- Betreiber benachrichtigen (Control-Center-Meldung) --------------------
  const { data: profil } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  const firma = profil?.firma_name || profil?.company_name || profil?.company || profil?.email || user.email || 'Kunde'
  const artText = istBestandskunde ? 'UPGRADE (Bestandskunde — kein Onboarding)' : 'NEU-Abschluss (Onboarding fällig)'
  const zeilen = preis.positionen.map((p) => `• ${p.label}: ${euro(p.betrag)}`).join('<br>')

  await sendeMail({
    an: OPERATOR_MAIL,
    betreff: `Neue Abo-Meldung: ${firma} · ${stufeObj.name} · ${euro(preis.netto)}/Mon`,
    html: mailLayout('Neue Abo-Meldung im Control Center', `
      <p><b>${firma}</b> hat ein Abo bestätigt.</p>
      <p><b>Art:</b> ${artText}<br>
         <b>Stufe:</b> ${stufeObj.name}${maAnzahl ? ` (${maAnzahl} Mitarbeiter)` : ''}</p>
      <p>${zeilen}</p>
      <p><b>Monatspreis netto:</b> ${euro(preis.netto)} · <b>zzgl. USt:</b> ${euro(preis.mwst)} · <b>brutto:</b> ${euro(preis.brutto)}<br>
         <b>Onboarding einmalig:</b> ${onboarding > 0 ? euro(onboarding) : '— (Bestandskunde)'}</p>
      <p><b>SEPA-Mandat:</b> ${kontoinhaber} · IBAN ${iban}${bic ? ` · BIC ${bic}` : ''} · Ref ${mandatsreferenz}</p>
      <p style="color:#8FA3BE;font-size:13px;">Der Einzug läuft über die Betreiber-Sammellastschrift — bitte im Control Center prüfen und freigeben. Es wurde noch nichts abgebucht.</p>
    `),
  })

  // --- Automatische Rechnung an den Kunden (best effort — bricht das Abo nie ab) ---
  try {
    const admin = createAdminClient()
    const posInvoice = preis.positionen.map((p) => ({ label: p.label, betrag: p.betrag }))
    if (onboarding > 0) posInvoice.push({ label: `Einrichtung / Onboarding ${stufeObj.name} (einmalig)`, betrag: onboarding })
    const nettoGes = Math.round((preis.netto + onboarding) * 100) / 100
    const mwstGes = Math.round(nettoGes * MWST * 100) / 100
    const bruttoGes = Math.round((nettoGes + mwstGes) * 100) / 100
    const kundenEmail = ((profil?.email as string | undefined) || user.email || '').trim() || null

    const { data: rech, error: reErr } = await admin.from('kunden_abo_rechnungen').insert({
      tenant_user_id: user.id,
      abo_id: aboRow?.id ?? null,
      art: istBestandskunde ? 'upgrade' : 'neu',
      positionen: posInvoice,
      netto: nettoGes,
      mwst: mwstGes,
      brutto: bruttoGes,
      onboarding_netto: onboarding,
      empfaenger_email: kundenEmail,
    }).select('id, rechnungsnummer, rechnungsdatum').single()

    if (reErr || !rech) {
      console.error('Abo-Rechnung anlegen fehlgeschlagen:', reErr?.message)
    } else if (kundenEmail) {
      const p = profil as Record<string, unknown> | null
      const feldP = (...keys: string[]): string => {
        for (const k of keys) { const v = p?.[k]; if (typeof v === 'string' && v.trim()) return v.trim() }
        return ''
      }
      const html = aboRechnungHtml({
        rechnungsnummer: String(rech.rechnungsnummer),
        rechnungsdatum: String(rech.rechnungsdatum),
        art: istBestandskunde ? 'upgrade' : 'neu',
        empfaenger: {
          firma,
          name: feldP('full_name', 'name', 'ansprechpartner', 'geschaeftsfuehrer'),
          strasse: feldP('firma_strasse', 'strasse', 'adresse', 'street'),
          plzOrt: [feldP('firma_plz', 'plz', 'zip'), feldP('firma_ort', 'ort', 'stadt', 'city')].filter(Boolean).join(' '),
          email: kundenEmail,
        },
        positionen: posInvoice,
        onboardingNetto: onboarding,
        netto: nettoGes,
        mwst: mwstGes,
        brutto: bruttoGes,
        stufeName: stufeObj.name,
        mandatsreferenz,
      })
      const pdf = await aboRechnungPdf(html)
      const anrede = feldP('full_name', 'name')
      const mail = await sendeMail({
        an: kundenEmail,
        betreff: `Ihre Rechnung ${rech.rechnungsnummer} — ARGONAUT OS`,
        html: mailLayout('Ihre Rechnung', `
          <p>Guten Tag${anrede ? ' ' + anrede : ''},</p>
          <p>vielen Dank für Ihr Vertrauen. Anbei Ihre Rechnung <b>${rech.rechnungsnummer}</b> über <b>${euro(bruttoGes)}</b> (brutto).</p>
          <p>Der Betrag wird per SEPA-Lastschrift von Ihrem hinterlegten Konto eingezogen — Sie müssen nichts weiter veranlassen.</p>
          <p>Bei Fragen antworten Sie einfach auf diese E-Mail.</p>`),
        ...(pdf ? { anhaenge: [{ dateiname: `${rech.rechnungsnummer}.pdf`, inhalt: pdf, typ: 'application/pdf' }] } : {}),
      })
      if (mail.ok) {
        await admin.from('kunden_abo_rechnungen').update({ pdf_versandt: !!pdf }).eq('id', rech.id)
      } else {
        console.error('Rechnungs-Mail fehlgeschlagen:', mail.fehler)
      }
    }
  } catch (e) {
    console.error('Auto-Rechnung fehlgeschlagen:', e)
  }

  return NextResponse.json({
    ok: true,
    stufe: stufeObj.name,
    monatspreisNetto: preis.netto,
    monatspreisBrutto: preis.brutto,
    onboarding,
    istBestandskunde,
  })
}
