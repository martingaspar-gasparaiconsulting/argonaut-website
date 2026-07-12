// ============================================================================
// ARGONAUT OS · lib/rechte.ts — EINE Quelle der Wahrheit fuer Zugriffsrechte
//
// Vorher standen dieselben Regeln an zwei Stellen: in DashboardNav.tsx und in
// der Middleware. Sie widersprachen sich. Ein Mitarbeiter sah die Knoepfe fuer
// Personal, Rechnungen, Mahnwesen, Finanzen, Vertraege und Analytics — und
// wurde beim Klick kommentarlos zurueckgeworfen. Ausserdem fehlten in der
// Middleware sieben Modul-Pfade, die in der Navigation standen.
//
// Ab hier gilt: NAV_LINKS ist die Quelle. Alles andere wird daraus abgeleitet.
// Ein neuer Nav-Eintrag bekommt seinen Pfadschutz automatisch. Ein Widerspruch
// zwischen Menue und Sperre ist nicht mehr moeglich.
//
// Diese Datei enthaelt KEINE Supabase-Aufrufe und KEINE React-Hooks. Sie wird
// von einer Client-Komponente (DashboardNav) UND von proxy.ts (Node-Laufzeit)
// importiert. Beides muss funktionieren.
// ============================================================================

export type NavLink = {
  label: string
  href: string
  /** Modul-Schluessel aus /dashboard/rechte. Fehlt er, ist der Eintrag nicht freigebbar. */
  modul?: string
  /** Jeder darf — Chef wie Mitarbeiter. Nie vom Starter-Modus versteckbar. */
  immer?: boolean
  /** NUR der Chef. Ein Mitarbeiter sieht den Knopf nicht und erreicht den Pfad nicht. */
  nurChef?: boolean
  /** NUR der Mitarbeiter. Der Chef braucht seinen eigenen Self-Service nicht. */
  nurMitarbeiter?: boolean
  /**
   * Der Pfad gilt NUR exakt, nie als Praefix.
   *
   * Zwingend fuer '/dashboard': als Praefix wuerde die Uebersicht jeden Pfad
   * darunter freigeben ('/dashboard/finanzen'.startsWith('/dashboard/') === true)
   * und die gesamte Rechtepruefung aushebeln.
   */
  exakt?: boolean
  highlight?: boolean
}

// ---------------------------------------------------------------------------
// Die Quelle. Reihenfolge = Reihenfolge im Menue.
// ---------------------------------------------------------------------------
export const NAV_LINKS: NavLink[] = [
  { label: '🏠 Übersicht', href: '/dashboard', immer: true, exakt: true },

  // --- Mitarbeiter-Selbstbedienung -----------------------------------------
  // Standen in MITARBEITER_ERLAUBT, hatten aber keinen Knopf: der Mitarbeiter
  // wurde auf eine Seite geworfen, zu der er nicht navigieren konnte.
  { label: '🙋 Mein Bereich', href: '/dashboard/mein-bereich', nurMitarbeiter: true },
  { label: '⏱ Zeiterfassung', href: '/dashboard/zeiterfassung', nurMitarbeiter: true },

  // --- Module, freigebbar ---------------------------------------------------
  { label: '🤖 Agenten', href: '/dashboard/agenten', modul: 'agenten' },
  { label: '🎓 Academy', href: '/dashboard/academy', modul: 'academy' },
  { label: '🎯 Leads', href: '/dashboard/leads', modul: 'leads' },
  { label: '💬 Chat', href: '/dashboard/chat', modul: 'chat' },
  { label: '🗨️ Team-Chat', href: '/dashboard/team-chat', modul: 'team-chat' },
  { label: '📄 Dokumente', href: '/dashboard/documents', modul: 'dokumente' },
  { label: '✉️ Korrespondenz', href: '/dashboard/korrespondenz', modul: 'korrespondenz' },
  { label: '🗓 Schichtplan', href: '/dashboard/schichtplan', modul: 'schichtplan' },
  { label: '📁 Projekte', href: '/dashboard/projekte', modul: 'projekte' },
  { label: '📣 Marketing', href: '/dashboard/marketing', modul: 'marketing' },
  { label: '🤝 Vertrieb/CRM', href: '/dashboard/crm', modul: 'crm' },
  { label: '📋 Aufträge', href: '/dashboard/auftraege', modul: 'auftraege' },
  { label: '📦 ERP/Lager', href: '/dashboard/erp', modul: 'erp' },
  { label: '🎫 Service', href: '/dashboard/service', modul: 'service' },
  { label: '🔧 Wartung', href: '/dashboard/wartung', modul: 'wartung' },
  { label: '🏗 Objektzeiten', href: '/dashboard/objektzeiten', modul: 'objektzeiten' },
  { label: '📅 Buchungen', href: '/dashboard/buchungen', modul: 'buchungen' },
  { label: '🔨 Werkstatt', href: '/dashboard/werkstatt', modul: 'werkstatt' },
  { label: '🧰 Leistungskatalog', href: '/dashboard/leistungskatalog', modul: 'leistungskatalog' },
  { label: '📇 Fahrzeugakte', href: '/dashboard/fahrzeugakte', modul: 'fahrzeugakte' },
  { label: '📐 Aufmaß', href: '/dashboard/aufmass', modul: 'aufmass' },
  { label: '🪵 Brennholz', href: '/dashboard/holz', modul: 'holz' },
  { label: '⚙️ Automatisierungen', href: '/dashboard/automatisierungen', modul: 'automatisierungen', highlight: true },

  // --- NUR CHEF -------------------------------------------------------------
  // Diese sechs standen in der Middleware-Sperre, aber nicht im Nav-Filter.
  // Der Modul-Schluessel bleibt: der Chef soll sie im Starter-Modus ausblenden
  // koennen. Die Sperre unten greift trotzdem, weil sie VOR der Rechtepruefung
  // laeuft — selbst wenn das Recht versehentlich vergeben wurde.
  { label: '👥 Personal', href: '/dashboard/personal', modul: 'personal', nurChef: true },
  { label: '🧾 Rechnungen', href: '/dashboard/rechnungen', modul: 'rechnungen', nurChef: true },
  { label: '⚠️ Mahnwesen', href: '/dashboard/mahnwesen', modul: 'mahnwesen', nurChef: true },
  { label: '💶 Finanzen', href: '/dashboard/finanzen', modul: 'finanzen', nurChef: true },
  { label: '📑 Verträge', href: '/dashboard/vertraege', modul: 'vertraege', nurChef: true },
  { label: '📊 Analytics', href: '/dashboard/analytics', modul: 'analytics', nurChef: true },
  { label: '🕐 Zeit-Nachweis', href: '/dashboard/arbeitszeit-nachweis', nurChef: true },
  { label: '🗂 GoBD', href: '/dashboard/gobd', nurChef: true },
  { label: '🔐 Rechte', href: '/dashboard/rechte', nurChef: true },

  { label: '🔧 Einstellungen', href: '/dashboard/einstellungen', immer: true },
]

// ---------------------------------------------------------------------------
// Abgeleitet. Nicht von Hand pflegen.
// ---------------------------------------------------------------------------

/**
 * Pfade, die AUSSCHLIESSLICH der Chef erreicht — unabhaengig von seinen Rechten.
 * Schuetzt auch vor versehentlicher Freigabe (z. B. Vorlage "Alle").
 */
export const NUR_CHEF_PFADE: string[] = NAV_LINKS
  .filter((l) => l.nurChef)
  .map((l) => l.href)

/**
 * Pfade, die ein eingeladener Mitarbeiter IMMER erreicht — als Praefix.
 * '/dashboard/einstellungen' deckt also auch Unterseiten davon ab.
 */
export const MITARBEITER_ERLAUBT: string[] = NAV_LINKS
  .filter((l) => (l.nurMitarbeiter || l.immer || (l.modul && !l.nurChef)) && !l.exakt)
  .map((l) => l.href)

/**
 * Pfade, die NUR exakt gelten. Aktuell die Uebersicht.
 * Steht sie in der Praefix-Liste, gibt sie das ganze Dashboard frei.
 */
export const MITARBEITER_ERLAUBT_EXAKT: string[] = NAV_LINKS
  .filter((l) => (l.nurMitarbeiter || l.immer) && l.exakt)
  .map((l) => l.href)

/**
 * Modul-Schluessel -> Pfad. Aus NAV_LINKS abgeleitet.
 * Damit ist ein Knopf ohne Pfad oder ein Pfad ohne Knopf strukturell unmoeglich.
 */
export const MODUL_PFAD: Record<string, string> = Object.fromEntries(
  NAV_LINKS.filter((l) => l.modul).map((l) => [l.modul as string, l.href])
)

/**
 * Vollstaendiger Modul-Katalog — Schluessel + Anzeige-Label. Quelle: NAV_LINKS.
 * Ein neues Modul mit `modul`-Schluessel erscheint hier automatisch. Damit muss
 * die Rechte-Oberflaeche nie wieder von Hand nachgepflegt werden.
 */
export const ALLE_MODULE: { key: string; label: string }[] = NAV_LINKS
  .filter((l) => l.modul)
  .map((l) => ({ key: l.modul as string, label: l.label }))

/** Nur die Schluessel — fuer Mengen-Checks und die Vorlage "Alle". */
export const ALLE_MODUL_KEYS: string[] = ALLE_MODULE.map((m) => m.key)

/**
 * Gilt der Pfad als Treffer? `/dashboard/holz` deckt `/dashboard/holz/pakete` ab,
 * aber NICHT `/dashboard/holzhandel`.
 */
export function pfadPasst(pfad: string, basis: string): boolean {
  return pfad === basis || pfad.startsWith(basis + '/')
}

/** Ist dieser Pfad dem Chef vorbehalten? */
export function istNurChefPfad(pfad: string): boolean {
  return NUR_CHEF_PFADE.some((b) => pfadPasst(pfad, b))
}

/**
 * Darf ein Mitarbeiter mit diesen Modul-Rechten den Pfad oeffnen?
 * Die Chef-Sperre wird hier bewusst NICHT geprueft — sie greift vorher und hart.
 */
export function mitarbeiterDarf(pfad: string, module: readonly string[]): boolean {
  // Exakte Treffer zuerst. '/dashboard' darf NIE als Praefix wirken.
  if (MITARBEITER_ERLAUBT_EXAKT.includes(pfad)) return true

  const erlaubtePfade = [
    ...MITARBEITER_ERLAUBT,
    ...module.map((k) => MODUL_PFAD[k]).filter(Boolean),
  ]
  return erlaubtePfade.some((b) => pfadPasst(pfad, b))
}

/**
 * Welche Nav-Eintraege sieht dieser Nutzer?
 *
 * @param istChef            Kein mitarbeiter-Datensatz = Chef.
 * @param rechte             Freigeschaltete Modul-Schluessel des Mitarbeiters.
 * @param sichtbareModule    Starter-Modus des Chefs. null = alles sichtbar.
 */
export function sichtbareNavLinks(
  istChef: boolean,
  rechte: ReadonlySet<string>,
  sichtbareModule: ReadonlySet<string> | null,
): NavLink[] {
  return NAV_LINKS.filter((l) => {
    if (istChef) {
      if (l.nurMitarbeiter) return false
      if (l.immer) return true
      // Starter-Modus: nur beim Chef, nur fuer Module mit Schluessel.
      // Greift auch bei nurChef-Modulen — der Chef darf Finanzen ausblenden.
      if (l.modul && sichtbareModule !== null && !sichtbareModule.has(l.modul)) return false
      return true
    }

    // Mitarbeiter
    if (l.nurChef) return false
    if (l.immer || l.nurMitarbeiter) return true
    return l.modul ? rechte.has(l.modul) : false
  })
}
