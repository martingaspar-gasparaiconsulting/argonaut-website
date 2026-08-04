// lib/ki.ts
// ============================================================================
// ARGONAUT OS · lib/ki.ts — zentraler KI-Aufruf mit Nutzungs-Protokoll (Phase 1 · B)
//
// Statt in jeder Route direkt an Anthropic zu fetchen, laeuft jeder Aufruf
// durch kiFetch(). Der Helfer:
//   - macht den IDENTISCHEN fetch-Aufruf (Original-Antwort bleibt unberuehrt),
//   - liest die Token-Zahlen aus einem KLON der Antwort,
//   - ermittelt den Kunden selbst aus dem Login-Cookie (keine Route liefert das),
//   - rechnet die Kosten in USD,
//   - schreibt eine Zeile nach public.ki_nutzung (Service-Role, umgeht RLS).
//
// Umbau in einer Route — vorher:
//   const res = await fetch("https://api.anthropic.com/v1/messages", { ...optionen });
// nachher:
//   const res = await kiFetch("dashboard-chat", { ...optionen });
// Alles danach (res.ok, res.json(), ...) bleibt WORT FUER WORT gleich.
//
// NUR serverseitig (Route Handlers). Niemals im Client importieren.
// ============================================================================
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { SCHWELLEN } from '@/lib/schwellen'
import { demoStatus } from '@/lib/demo'
import { sendeMail, mailLayout } from '@/lib/mail'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

/**
 * Marker-Route: wird in ki_nutzung geschrieben, um "heute schon gewarnt" zu
 * merken — ohne eigene Tabelle und ohne SQL-Migration. Kostet 0 USD und wird
 * bei allen Zaehlungen ausgeschlossen, damit sie die Nutzung nicht verfaelscht.
 */
const WARN_MARKER = '_warnung'

// --- Preise in USD pro 1 Mio Tokens (nach Modell-Familie) -------------------
// Haiku 4.5:  $1 / $5
// Sonnet 5 :  Einfuehrungspreis $2 / $10 bis 31.08.2026, danach $3 / $15
//             -> die Umschaltung passiert AUTOMATISCH nach Datum, kein Handanlegen.
// Cache: Schreiben = 1,25x Input, Lesen = 0,1x Input. USD, keine EUR-Umrechnung.
type Preis = { rein: number; raus: number; cacheWrite: number; cacheRead: number }

function preisFuer(modell: string): Preis {
  const m = (modell || '').toLowerCase()

  // Haiku 4.5 — guenstig
  if (m.includes('haiku')) {
    return { rein: 1.0, raus: 5.0, cacheWrite: 1.25, cacheRead: 0.1 }
  }

  // Sonnet — Einfuehrungspreis bis 31.08.2026, danach Standard (automatisch)
  if (m.includes('sonnet')) {
    const einfuehrung = new Date() < new Date('2026-09-01T00:00:00Z')
    return einfuehrung
      ? { rein: 2.0, raus: 10.0, cacheWrite: 2.5, cacheRead: 0.2 }
      : { rein: 3.0, raus: 15.0, cacheWrite: 3.75, cacheRead: 0.3 }
  }

  // Unbekannt / Opus -> konservativ Sonnet-Standard
  return { rein: 3.0, raus: 15.0, cacheWrite: 3.75, cacheRead: 0.3 }
}

/** Kunde aus dem Login-Cookie. Kein Login (oeffentlicher Chat) -> null. */
async function ermittleUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

/** Schreibt eine Nutzungs-Zeile. Darf die eigentliche Antwort NIE gefaehrden. */
async function protokolliere(userId: string | null, route: string, data: any) {
  try {
    const u = data?.usage ?? {}
    const rein = Number(u.input_tokens) || 0
    const raus = Number(u.output_tokens) || 0
    const cacheWrite = Number(u.cache_creation_input_tokens) || 0
    const cacheRead = Number(u.cache_read_input_tokens) || 0
    const modell = typeof data?.model === 'string' ? data.model : 'unbekannt'
    const p = preisFuer(modell)
    const kostenUsd =
      (rein * p.rein + raus * p.raus + cacheWrite * p.cacheWrite + cacheRead * p.cacheRead) /
      1_000_000

    const admin = createAdminClient()
    await admin.from('ki_nutzung').insert({
      user_id: userId,
      route,
      modell,
      tokens_rein: rein,
      tokens_raus: raus,
      tokens_cache_write: cacheWrite,
      tokens_cache_read: cacheRead,
      kosten_usd: kostenUsd,
    })
  } catch (e) {
    console.error('[ki_nutzung] Protokoll fehlgeschlagen:', e)
  }
}

type AdminClient = ReturnType<typeof createAdminClient>

export type Betrieb = {
  /** Chef-/Eigentuemer-ID = der Mandant. */
  tenantId: string
  /** Sitz-Typ des aufrufenden Nutzers. */
  typ: string
  /** Alle Login-IDs des Betriebs (Chef + Mitarbeiter mit Zugang). */
  userIds: string[]
  /** Summe der Sitz-Kontingente = Firmen-Topf je Tag. */
  pool: number
  /** Wie viele Sitze welchen Typs — fuer den Bericht. */
  sitze: Record<string, number>
}

/**
 * Ermittelt den Betrieb eines Nutzers samt Firmen-Topf.
 *
 * Der Topf ist die Summe der Tages-Kontingente ALLER Sitze des Betriebs
 * (Chef zaehlt als Voll-Nutzer). Wer viel arbeitet, schoepft daraus; wer die KI
 * nicht nutzt, gibt sein Kontingent automatisch an die Kollegen weiter.
 *
 * Im Zweifel wird grosszuegig gerechnet — lieber ein Kontingent zu viel als
 * einen zahlenden Kunden faelschlich ausbremsen.
 */
async function betriebVon(admin: AdminClient, userId: string): Promise<Betrieb> {
  const alleinTyp = SCHWELLEN.ki.tagProSitz.voll
  const fallback: Betrieb = {
    tenantId: userId, typ: 'voll', userIds: [userId],
    pool: alleinTyp, sitze: { voll: 1 },
  }
  try {
    // Steht der Nutzer in mitarbeiter? Dann ist owner_user_id sein Chef.
    const { data: ich } = await admin
      .from('mitarbeiter')
      .select('owner_user_id, nutzer_typ')
      .eq('auth_user_id', userId)
      .maybeSingle()
    const zeile = ich as { owner_user_id?: string; nutzer_typ?: string } | null
    const tenantId = zeile?.owner_user_id || userId
    const typRoh = zeile?.nutzer_typ
    const typ = typRoh && SCHWELLEN.ki.tagProSitz[typRoh] ? typRoh : 'voll'

    // Das ganze Team des Betriebs.
    const { data: team } = await admin
      .from('mitarbeiter')
      .select('auth_user_id, nutzer_typ')
      .eq('owner_user_id', tenantId)
    const zeilen = (team as Array<{ auth_user_id?: string | null; nutzer_typ?: string | null }> | null) || []

    // Chef zaehlt immer als Voll-Sitz.
    const sitze: Record<string, number> = { voll: 1, standard: 0, self_service: 0 }
    let pool = SCHWELLEN.ki.tagProSitz.voll
    for (const m of zeilen) {
      const t = m.nutzer_typ && SCHWELLEN.ki.tagProSitz[m.nutzer_typ] ? m.nutzer_typ : 'standard'
      sitze[t] = (sitze[t] || 0) + 1
      pool += SCHWELLEN.ki.tagProSitz[t]
    }

    const userIds = [tenantId, ...zeilen.map((m) => m.auth_user_id).filter(Boolean) as string[]]
    return { tenantId, typ, userIds: [...new Set(userIds)], pool, sitze }
  } catch {
    return fallback
  }
}

/** Aufrufe der letzten 24 h je Nutzer im Betrieb — Basis fuer Topf und Bericht. */
async function nutzungImBetrieb(
  admin: AdminClient,
  userIds: string[],
): Promise<{ gesamt: number; jeNutzer: Record<string, number> }> {
  const seitTag = new Date(Date.now() - 86_400_000).toISOString()
  const { data } = await admin
    .from('ki_nutzung')
    .select('user_id')
    .in('user_id', userIds)
    .gte('created_at', seitTag)
    .neq('route', WARN_MARKER)
  const zeilen = (data as Array<{ user_id: string | null }> | null) || []
  const jeNutzer: Record<string, number> = {}
  for (const z of zeilen) {
    if (!z.user_id) continue
    jeNutzer[z.user_id] = (jeNutzer[z.user_id] || 0) + 1
  }
  return { gesamt: zeilen.length, jeNutzer }
}

/** Wurde fuer diesen Nutzer heute schon gewarnt? (Marker-Zeile in ki_nutzung) */
async function heuteSchonGewarnt(admin: AdminClient, userId: string): Promise<boolean> {
  const seitTag = new Date(Date.now() - 86_400_000).toISOString()
  const { count } = await admin
    .from('ki_nutzung')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('route', WARN_MARKER)
    .gte('created_at', seitTag)
  return (count || 0) > 0
}

/** Marker setzen, damit hoechstens EINE Warnung pro Nutzer und Tag rausgeht. */
async function merkeWarnung(admin: AdminClient, userId: string) {
  await admin.from('ki_nutzung').insert({
    user_id: userId,
    route: WARN_MARKER,
    modell: '-',
    tokens_rein: 0,
    tokens_raus: 0,
    tokens_cache_write: 0,
    tokens_cache_read: 0,
    kosten_usd: 0,
  })
}

/**
 * Warnmail an den Betreiber. Zwei Anlaesse: die Tagesgrenze eines Sitzes ist
 * fast erreicht, oder die Tageskosten eines Nutzers ueberschreiten die Schwelle.
 * Best effort — schlaegt der Versand fehl, laeuft der KI-Aufruf normal weiter.
 */
async function warneBetreiber(
  admin: AdminClient,
  userId: string,
  betreff: string,
  zeilen: string[],
) {
  try {
    if (await heuteSchonGewarnt(admin, userId)) return
    await merkeWarnung(admin, userId)
    const html = mailLayout(
      'KI-Nutzung auffaellig',
      `<p style="margin:0 0 14px;">Ein Konto faellt bei der KI-Nutzung auf:</p>
       <ul style="margin:0 0 14px;padding-left:18px;">${zeilen.map((z) => `<li>${z}</li>`).join('')}</ul>
       <p style="margin:0 0 14px;">Nutzer-ID: <code>${userId}</code></p>
       <p style="margin:16px 0 0;">Diese Meldung geht hoechstens einmal pro Nutzer und Tag raus.</p>`,
    )
    await sendeMail({ an: 'info@argonaut-os.com', betreff, html })
  } catch (e) {
    console.error('[ki-warnung] Versand fehlgeschlagen:', e)
  }
}

/** Tages-KI-Kosten eines ganzen BETRIEBS in USD (rollende 24 h). */
async function tagesKosten(admin: AdminClient, userIds: string[]): Promise<number> {
  const seitTag = new Date(Date.now() - 86_400_000).toISOString()
  const { data } = await admin
    .from('ki_nutzung')
    .select('kosten_usd')
    .in('user_id', userIds)
    .gte('created_at', seitTag)
  const zeilen = (data as Array<{ kosten_usd: number | null }> | null) || []
  return zeilen.reduce((a, z) => a + (Number(z.kosten_usd) || 0), 0)
}

/**
 * Prompt Caching zentral (B2, 04.08.2026): setzt cache_control:{type:'ephemeral'}
 * auf den grossen, statischen System-Prompt (und – falls vorhanden – die
 * Tool-Definitionen), bevor der Body an Anthropic geht. Der System-Block steht
 * im Prompt hinter den Tools; sein Cache-Punkt deckt also Tools + System ab.
 *
 * Wirkt an EINER Stelle auf ALLE ~30 Routen, die durch kiFetch laufen. Rein
 * additiv: Antwort und Verhalten bleiben identisch, nur die Kosten sinken
 * (Cache-Lesen = 0,1x Input). Zu kurze Prompts (< Mindestlaenge) ignoriert die
 * API stillschweigend. Best effort — bei jedem Zweifel bleibt der Body
 * unveraendert, und das Original-options-Objekt wird nie mutiert.
 */
function mitCacheControl(options: RequestInit): RequestInit {
  try {
    if (!options || typeof options.body !== 'string') return options
    const koerper: any = JSON.parse(options.body)
    if (!koerper || typeof koerper !== 'object') return options

    let geaendert = false

    // System-Prompt cachen (der grosse, gleichbleibende Block).
    if (typeof koerper.system === 'string' && koerper.system.trim().length > 0) {
      koerper.system = [{ type: 'text', text: koerper.system, cache_control: { type: 'ephemeral' } }]
      geaendert = true
    } else if (Array.isArray(koerper.system) && koerper.system.length > 0) {
      const letzter = koerper.system[koerper.system.length - 1]
      if (letzter && typeof letzter === 'object' && !letzter.cache_control) {
        letzter.cache_control = { type: 'ephemeral' }
        geaendert = true
      }
    }

    // Tool-Definitionen cachen (falls vorhanden).
    if (Array.isArray(koerper.tools) && koerper.tools.length > 0) {
      const letztesTool = koerper.tools[koerper.tools.length - 1]
      if (letztesTool && typeof letztesTool === 'object' && !letztesTool.cache_control) {
        letztesTool.cache_control = { type: 'ephemeral' }
        geaendert = true
      }
    }

    if (!geaendert) return options
    return { ...options, body: JSON.stringify(koerper) }
  } catch {
    return options
  }
}

/**
 * Ersatz fuer `fetch("https://api.anthropic.com/v1/messages", options)`.
 * Gibt die UNVERAENDERTE Original-Antwort zurueck (res.ok / res.json() wie gehabt)
 * und schreibt zusaetzlich eine Nutzungs-Zeile nach ki_nutzung.
 *
 * @param route  Sprechender Name der Funktion, z.B. "ki-auge", "dashboard-chat".
 * @param options Exakt dieselben fetch-Optionen wie bisher (method/headers/body).
 */
export async function kiFetch(route: string, options: RequestInit): Promise<Response> {
  const userId = await ermittleUserId()

  // --- Rate-Limit (Bot-/Endlosschleifen-Schutz, "Horror-Faktor") ---
  // Nutzt die bestehende ki_nutzung-Tabelle: zu viele Aufrufe je Minute -> 429,
  // OHNE den teuren KI-Aufruf auszulösen. Best effort — schlägt die Prüfung
  // fehl, läuft der Aufruf normal weiter (nie blockieren wegen eines DB-Fehlers).
  if (userId) {
    try {
      const admin = createAdminClient()
      const seit = new Date(Date.now() - 60_000).toISOString()
      const { count } = await admin.from('ki_nutzung')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId).gte('created_at', seit)
      if ((count || 0) >= SCHWELLEN.ki.rateLimitProMinute) {
        return new Response(
          JSON.stringify({ error: 'Zu viele KI-Anfragen in kurzer Zeit. Bitte einen Moment warten und erneut versuchen.' }),
          { status: 429, headers: { 'content-type': 'application/json' } },
        )
      }
    } catch (e) {
      console.error('[rate-limit] Prüfung fehlgeschlagen (fahre fort):', e)
    }
  }

  // --- Demo-Deckelung (Punkt 28): Kosten-Schutz für Demo-Konten -------------
  // Ein Demo-Konto (profiles.demo=true) darf die KI ZEIGEN, aber nur begrenzt:
  //   · abgelaufene Demo -> KI serverseitig AUS (zusätzlich zum Client-Read-only-
  //     Guard aus Punkt 26b; schließt die Lücke, falls jemand die KI-Route direkt
  //     anspricht statt über die Oberfläche).
  //   · aktive Demo      -> harte TAGES-Obergrenze SCHWELLEN.ki.demoKiProTag
  //     (rollende 24 h, gezählt aus ki_nutzung). Darüber kommt eine freundliche
  //     Meldung STATT eines teuren KI-Aufrufs — der Anthropic-Call unterbleibt.
  // Kein SQL nötig: profiles.demo/demo_ablauf + ki_nutzung existieren bereits.
  // Best effort — schlägt die Prüfung fehl, läuft der Aufruf normal weiter
  // (nie den Kunden aussperren wegen eines DB-Fehlers).
  let istDemo = false
  if (userId) {
    try {
      const admin = createAdminClient()
      const { data: profil } = await admin.from('profiles')
        .select('demo, demo_ablauf').eq('id', userId).maybeSingle()
      const demo = demoStatus(
        (profil as { demo?: boolean } | null)?.demo,
        (profil as { demo_ablauf?: string | null } | null)?.demo_ablauf,
        new Date().toISOString(),
      )
      istDemo = demo.istDemo
      if (demo.istDemo) {
        if (demo.abgelaufen) {
          return new Response(
            JSON.stringify({ error: 'Im abgelaufenen Demo-Modus ist die KI deaktiviert. Für den vollen Zugang vereinbare bitte einen Termin.' }),
            { status: 403, headers: { 'content-type': 'application/json' } },
          )
        }
        const seitTag = new Date(Date.now() - 86_400_000).toISOString()
        const { count } = await admin.from('ki_nutzung')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId).gte('created_at', seitTag)
        if ((count || 0) >= SCHWELLEN.ki.demoKiProTag) {
          return new Response(
            JSON.stringify({ error: 'Das KI-Kontingent der Demo ist für heute aufgebraucht. In 24 Stunden geht es weiter — oder sichere dir mit einem Termin den vollen Zugang.' }),
            { status: 429, headers: { 'content-type': 'application/json' } },
          )
        }
      }
    } catch (e) {
      console.error('[demo-deckelung] Prüfung fehlgeschlagen (fahre fort):', e)
    }
  }

  // --- FIRMEN-TOPF statt Einzelgrenze (Kosten-Schutz, AGB § 9.3) ------------
  // Jeder Sitz zahlt sein Tages-Kontingent in einen gemeinsamen Topf ein. Wer
  // viel arbeitet, schoepft daraus; ungenutzte Kontingente kommen den Kollegen
  // zugute. Gesperrt wird erst beim DOPPELTEN Topf (stiller Puffer) — dazwischen
  // laeuft alles normal weiter und nur der Betreiber bekommt den Bericht.
  // Greift nur fuer echte (Nicht-Demo-)Konten. Best effort.
  if (userId && !istDemo) {
    try {
      const admin = createAdminClient()
      const betrieb = await betriebVon(admin, userId)
      const { gesamt, jeNutzer } = await nutzungImBetrieb(admin, betrieb.userIds)
      const harteGrenze = betrieb.pool * SCHWELLEN.ki.pufferFaktor

      // Wer im Betrieb wie viel nutzt — fuer den Bericht, absteigend sortiert.
      const rang = Object.entries(jeNutzer).sort((a, b) => b[1] - a[1])
      const spitze = rang[0]
      const verteilung = [
        `Firmen-Topf: <b>${betrieb.pool}</b> Aufrufe/Tag (${betrieb.sitze.voll || 0} Voll · ${betrieb.sitze.standard || 0} Standard · ${betrieb.sitze.self_service || 0} Self-Service)`,
        `Heute genutzt: <b>${gesamt}</b> (${Math.round((gesamt / Math.max(1, betrieb.pool)) * 100)} % des Topfs)`,
        spitze
          ? `Spitzenreiter: <code>${spitze[0]}</code> mit <b>${spitze[1]}</b> Aufrufen — ${Math.round((spitze[1] / Math.max(1, gesamt)) * 100)} % des ganzen Betriebs`
          : 'Noch keine Nutzung erfasst.',
        `Aktive Nutzer: <b>${rang.length}</b> von ${betrieb.userIds.length} Zugaengen — ${betrieb.userIds.length - rang.length} ungenutzt`,
      ]

      if (gesamt >= harteGrenze) {
        await warneBetreiber(admin, betrieb.tenantId, 'ARGONAUT: KI-Topf inkl. Puffer ausgeschoepft — gesperrt', [
          ...verteilung,
          `<b>Harte Grenze ${harteGrenze} erreicht — weitere Aufrufe sind bis morgen gesperrt.</b>`,
        ])
        return new Response(
          JSON.stringify({
            error:
              'Das KI-Kontingent Ihres Betriebs ist fuer heute aufgebraucht. In 24 Stunden geht es automatisch weiter — oder melden Sie sich bei uns, dann heben wir das Limit an.',
          }),
          { status: 429, headers: { 'content-type': 'application/json' } },
        )
      }

      // Topf ueberschritten, Puffer laeuft: Kunde merkt NICHTS, Betreiber schon.
      if (gesamt >= betrieb.pool) {
        await warneBetreiber(admin, betrieb.tenantId, 'ARGONAUT: KI-Topf ueberschritten — stiller Puffer laeuft', [
          ...verteilung,
          `Der Betrieb laeuft jetzt im Puffer (bis ${harteGrenze}). Fuer den Kunden aendert sich nichts.`,
        ])
      } else if (gesamt >= Math.round((betrieb.pool * SCHWELLEN.ki.warnAbProzent) / 100)) {
        await warneBetreiber(admin, betrieb.tenantId, 'ARGONAUT: KI-Nutzung naehert sich dem Topf', verteilung)
      }
    } catch (e) {
      console.error('[ki-topf] Pruefung fehlgeschlagen (fahre fort):', e)
    }
  }

  const res = await fetch(ANTHROPIC_URL, mitCacheControl(options))

  // Nur erfolgreiche Antworten protokollieren. Klon lesen -> Original unberuehrt.
  try {
    if (res.ok) {
      const data = await res.clone().json()
      await protokolliere(userId, route, data)

      // --- Kostenalarm: Tageskosten dieses Nutzers ueber der Schwelle? -------
      // Der Wert SCHWELLEN.ki.kostenAlarmTagUsd war bisher nur definiert und
      // wurde nirgends ausgewertet. Jetzt loest er eine Warnmail aus — hoechstens
      // einmal pro Nutzer und Tag. Blockiert NICHTS, meldet nur.
      if (userId && !istDemo) {
        try {
          const admin = createAdminClient()
          const betrieb = await betriebVon(admin, userId)
          const kosten = await tagesKosten(admin, betrieb.userIds)
          if (kosten > SCHWELLEN.ki.kostenAlarmTagUsd) {
            await warneBetreiber(admin, betrieb.tenantId, 'ARGONAUT: KI-Tageskosten ueber der Schwelle', [
              `Tageskosten des Betriebs: <b>${kosten.toFixed(2)} USD</b>`,
              `Schwelle: ${SCHWELLEN.ki.kostenAlarmTagUsd.toFixed(2)} USD`,
              `Zuletzt genutzt: ${route}`,
            ])
          }
        } catch (e) {
          console.error('[kostenalarm] Pruefung fehlgeschlagen:', e)
        }
      }
    }
  } catch (e) {
    console.error('[ki_nutzung] Lesen der Antwort fehlgeschlagen:', e)
  }

  return res
}
