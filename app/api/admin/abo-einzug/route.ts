import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../../lib/supabase-server'
import { baueSepaXml, type SepaLastschrift, type SepaSeq } from '../../../../lib/sepa'
import { MWST } from '../../../../lib/tarif'

// ============================================================================
// ARGONAUT OS · app/api/admin/abo-einzug/route.ts  (Teil 2b · Betreiber-Einzug)
//
// GET  -> Liste aller Kunden-Abos (zur Freigabe + einzugsbereit) mit Beträgen.
// POST -> action:
//   'freigeben'   { aboId }           -> Abo aktivieren (status 'aktiv'), fällig ab heute.
//   'sepa-datei'  { aboIds }          -> SEPA-Sammellastschrift (pain.008) bauen & zurückgeben.
//   'markieren'   { aboIds, datum }   -> als eingezogen markieren (FRST->RCUR-Umschaltung).
//
// Gläubiger-Daten (Gaspar AI Consulting) kommen aus Umgebungsvariablen:
//   SEPA_CREDITOR_NAME, SEPA_CREDITOR_IBAN, SEPA_CREDITOR_BIC, SEPA_CREDITOR_GLAEUBIGER_ID
// So liegt die echte IBAN/Gläubiger-ID NICHT im Code.
//
// Admin-Guard wie die übrigen /api/admin-Routen (profiles.role === 'admin').
// Der RLS-überschreitende Zugriff läuft NACH dem Guard über die Service-Role.
// ============================================================================

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function adminGuard(): Promise<NextResponse | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'nicht angemeldet' }, { status: 401 })
  const { data: profil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profil || profil.role !== 'admin') return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 })
  return null
}

function brutto(netto: number): number {
  return Math.round(netto * (1 + MWST) * 100) / 100
}
function heute(): string { return new Date().toISOString().slice(0, 10) }
function plusTage(iso: string, t: number): string { const d = new Date(iso); d.setDate(d.getDate() + t); return d.toISOString().slice(0, 10) }
function plusMonat(iso: string, m: number): string { const d = new Date(iso); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10) }
function monatKuerzel(): string { return new Date().toISOString().slice(0, 7) } // YYYY-MM

type AboRow = {
  id: string; tenant_user_id: string; stufe: string; monatspreis_netto: number | null;
  status: string; kontoinhaber: string | null; iban: string | null; bic: string | null;
  mandatsreferenz: string | null; mandat_datum: string | null; mandat_erteilt: boolean;
  erster_einzug_am: string | null; letzter_einzug_am: string | null; naechster_faellig: string | null;
}

export async function GET() {
  const gesperrt = await adminGuard(); if (gesperrt) return gesperrt
  const admin = svc()

  const { data: abos, error } = await admin
    .from('kunden_abo')
    .select('id, tenant_user_id, stufe, monatspreis_netto, status, kontoinhaber, iban, bic, mandatsreferenz, mandat_datum, mandat_erteilt, erster_einzug_am, letzter_einzug_am, naechster_faellig, grundgebuehr_netto')
    .order('gemeldet_am', { ascending: true, nullsFirst: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const ids = (abos ?? []).map((a) => a.tenant_user_id)
  const { data: profs } = ids.length
    ? await admin.from('profiles').select('id, firma_name, company_name, company, email').in('id', ids)
    : { data: [] as any[] }
  const firmaMap = new Map<string, string>()
  for (const p of profs ?? []) firmaMap.set(p.id, p.firma_name || p.company_name || p.company || p.email || '—')

  const liste = (abos ?? []).map((a) => {
    const netto = Number(a.monatspreis_netto ?? 0)
    return {
      id: a.id,
      firma: firmaMap.get(a.tenant_user_id) ?? '—',
      stufe: a.stufe,
      nettoMon: netto,
      bruttoMon: brutto(netto),
      status: a.status,
      mandatErteilt: !!a.mandat_erteilt,
      iban: a.iban,
      mandatsreferenz: a.mandatsreferenz,
      sequenz: a.erster_einzug_am ? 'RCUR' : 'FRST',
      letzterEinzug: a.letzter_einzug_am,
      naechsterFaellig: a.naechster_faellig,
    }
  })

  const summeAktivBrutto = liste.filter((x) => x.status === 'aktiv').reduce((s, x) => s + x.bruttoMon, 0)
  return NextResponse.json({ ok: true, abos: liste, summeAktivBrutto, anzahlAktiv: liste.filter((x) => x.status === 'aktiv').length })
}

export async function POST(req: Request) {
  const gesperrt = await adminGuard(); if (gesperrt) return gesperrt
  const admin = svc()

  let body: { action?: string; aboId?: string; aboIds?: string[]; datum?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Ungültiger Body.' }, { status: 400 }) }
  const action = body.action

  // --- Freigeben: Abo aktivieren -------------------------------------------
  if (action === 'freigeben') {
    if (!body.aboId) return NextResponse.json({ ok: false, error: 'aboId fehlt.' }, { status: 400 })
    const { error } = await admin.from('kunden_abo')
      .update({ status: 'aktiv', freigegeben_am: new Date().toISOString(), naechster_faellig: heute(), updated_at: new Date().toISOString() })
      .eq('id', body.aboId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // --- SEPA-Datei bauen -----------------------------------------------------
  if (action === 'sepa-datei') {
    const name = process.env.SEPA_CREDITOR_NAME
    const iban = process.env.SEPA_CREDITOR_IBAN
    const bic = process.env.SEPA_CREDITOR_BIC
    const glaeubigerId = process.env.SEPA_CREDITOR_GLAEUBIGER_ID
    if (!name || !iban || !glaeubigerId) {
      return NextResponse.json({ ok: false, error: 'Gläubiger-Daten fehlen. Bitte SEPA_CREDITOR_NAME, SEPA_CREDITOR_IBAN und SEPA_CREDITOR_GLAEUBIGER_ID als Umgebungsvariablen setzen.' }, { status: 400 })
    }

    let q = admin.from('kunden_abo').select('*').eq('status', 'aktiv').eq('mandat_erteilt', true)
    if (body.aboIds && body.aboIds.length) q = q.in('id', body.aboIds)
    const { data: abos, error } = await q
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const rows = (abos ?? []) as AboRow[]
    if (rows.length === 0) return NextResponse.json({ ok: false, error: 'Keine einzugsbereiten Abos (aktiv + Mandat erteilt).' }, { status: 400 })

    const monat = monatKuerzel()
    const posten: SepaLastschrift[] = rows
      .filter((a) => a.iban && a.monatspreis_netto != null)
      .map((a) => ({
        name: a.kontoinhaber || a.iban || 'Kunde',
        iban: a.iban as string,
        bic: a.bic || undefined,
        betrag: brutto(Number(a.monatspreis_netto)),
        mandatsreferenz: a.mandatsreferenz || `ARGO-${a.tenant_user_id.slice(0, 8).toUpperCase()}`,
        mandatDatum: a.mandat_datum || heute(),
        verwendungszweck: `ARGONAUT OS Abo ${a.stufe} ${monat}`,
        seqTp: (a.erster_einzug_am ? 'RCUR' : 'FRST') as SepaSeq,
      }))

    const ausfuehrung = plusTage(heute(), 3) // Vorlauf für die Bank
    const stamp = new Date().toISOString().slice(0, 19)
    const msgId = `ARGO-EINZUG-${stamp.replace(/[-:T]/g, '')}`
    const xml = baueSepaXml({ name, iban, bic: bic || undefined, glaeubigerId }, posten, ausfuehrung, msgId, stamp)
    const summe = posten.reduce((s, p) => s + p.betrag, 0)

    return NextResponse.json({
      ok: true,
      xml,
      dateiname: `ARGONAUT-SEPA-Einzug-${monat}.xml`,
      anzahl: posten.length,
      summe: Math.round(summe * 100) / 100,
      ausfuehrung,
    })
  }

  // --- Als eingezogen markieren (FRST -> RCUR) ------------------------------
  if (action === 'markieren') {
    if (!body.aboIds || !body.aboIds.length) return NextResponse.json({ ok: false, error: 'aboIds fehlen.' }, { status: 400 })
    const datum = body.datum || heute()
    // erster_einzug_am nur setzen, wenn noch leer -> pro Zeile prüfen.
    const { data: rows } = await admin.from('kunden_abo').select('id, erster_einzug_am').in('id', body.aboIds)
    for (const r of rows ?? []) {
      await admin.from('kunden_abo').update({
        erster_einzug_am: r.erster_einzug_am || datum,
        letzter_einzug_am: datum,
        naechster_faellig: plusMonat(datum, 1),
        updated_at: new Date().toISOString(),
      }).eq('id', r.id)
    }
    return NextResponse.json({ ok: true, markiert: (rows ?? []).length })
  }

  return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 })
}
