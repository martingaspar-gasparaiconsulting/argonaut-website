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
   * Ab welcher Hierarchie-Ebene ein Modul BESESSEN werden darf.
   * 1 = nur Eigentuemer · 2 = ab Geschaeftsfuehrer (sensibel) ·
   * 3 = ab Abteilungsleiter (operativ) · 4 = jeder Mitarbeiter.
   * Fehlt das Feld, gilt es als operativ (3).
   */
  ebene?: 1 | 2 | 3 | 4
  /** Loest beim Freigeben die doppelte Bestaetigung aus (rechtlich/kaufmaennisch heikel). */
  sensibel?: boolean
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
  { label: '🏠 Übersicht', href: '/dashboard', immer: true, exakt: true, ebene: 4 },

  // --- Mitarbeiter-Selbstbedienung -----------------------------------------
  { label: '🙋 Mein Bereich', href: '/dashboard/mein-bereich', nurMitarbeiter: true, ebene: 4 },
  { label: '⏱ Zeiterfassung', href: '/dashboard/zeiterfassung', nurMitarbeiter: true, ebene: 4 },

  // --- Ebene 4: jeder Mitarbeiter (Grundausstattung) -----------------------
  { label: '🎓 Academy', href: '/dashboard/academy', modul: 'academy', ebene: 4 },
  { label: '💬 Chat', href: '/dashboard/chat', modul: 'chat', ebene: 4 },
  { label: '🗨️ Team-Chat', href: '/dashboard/team-chat', modul: 'team-chat', ebene: 4 },
  { label: '📄 Dokumente', href: '/dashboard/documents', modul: 'dokumente', ebene: 4 },
  { label: '✉️ Korrespondenz', href: '/dashboard/korrespondenz', modul: 'korrespondenz', ebene: 4 },

  // --- Ebene 3: ab Abteilungsleiter (operativ, frei verteilbar) ------------
  { label: '🎯 Leads', href: '/dashboard/leads', modul: 'leads', ebene: 3 },
  { label: '🗓 Schichtplan', href: '/dashboard/schichtplan', modul: 'schichtplan', ebene: 3 },
  { label: '📁 Projekte', href: '/dashboard/projekte', modul: 'projekte', ebene: 3 },
  { label: '📣 Marketing', href: '/dashboard/marketing', modul: 'marketing', ebene: 3 },
  { label: '🤝 Vertrieb/CRM', href: '/dashboard/crm', modul: 'crm', ebene: 3 },
  { label: '📋 Aufträge', href: '/dashboard/auftraege', modul: 'auftraege', ebene: 3 },
  { label: '📦 ERP/Lager', href: '/dashboard/erp', modul: 'erp', ebene: 3 },
  { label: '🎫 Service', href: '/dashboard/service', modul: 'service', ebene: 3 },
  { label: '🔧 Wartung', href: '/dashboard/wartung', modul: 'wartung', ebene: 3 },
  { label: '🏗 Objektzeiten', href: '/dashboard/objektzeiten', modul: 'objektzeiten', ebene: 3 },
  { label: '📅 Buchungen', href: '/dashboard/buchungen', modul: 'buchungen', ebene: 3 },
  // --- Field Service / Termine (P16-22) ------------------------------------
  { label: '🗓 Termine', href: '/dashboard/termine', modul: 'termine', ebene: 3 },
  { label: '🗺 Dispo-Board', href: '/dashboard/dispo', modul: 'einsaetze', ebene: 3 },
  { label: '🔨 Werkstatt', href: '/dashboard/werkstatt', modul: 'werkstatt', ebene: 3 },
  { label: '🧰 Leistungskatalog', href: '/dashboard/leistungskatalog', modul: 'leistungskatalog', ebene: 3 },
  { label: '📇 Fahrzeugakte', href: '/dashboard/fahrzeugakte', modul: 'fahrzeugakte', ebene: 3 },
  { label: '📐 Aufmaß', href: '/dashboard/aufmass', modul: 'aufmass', ebene: 3 },
  { label: '🪵 Brennholz', href: '/dashboard/holz', modul: 'holz', ebene: 3 },
  { label: '⚙️ Automatisierungen', href: '/dashboard/automatisierungen', modul: 'automatisierungen', highlight: true, ebene: 3 },

  // --- Ebene 2: ab Administrator/Geschaeftsfuehrer (sensibel, 2-fach-Bestaetigung) -------
  // Delegierbar: der Eigentuemer (oder ein Administrator mit Vollmacht) darf diese
  // Module weitergeben. KEIN nurChef mehr — die Freigabe laeuft ueber die ebene-Logik
  // + Pro-Person-Grant. Der !sensibel-Riegel in MITARBEITER_ERLAUBT verhindert, dass
  // sie ohne ausdrueckliche Freigabe fuer jeden offen sind. 'zeit-nachweis' + 'gobd'
  // bekommen hier ihren modul-Schluessel, damit sie ueberhaupt freigebbar werden.
  { label: '🤖 Agenten', href: '/dashboard/agenten', modul: 'agenten', ebene: 2, sensibel: true },
  { label: '👥 Personal', href: '/dashboard/personal', modul: 'personal', ebene: 2, sensibel: true },
  { label: '🧾 Rechnungen', href: '/dashboard/rechnungen', modul: 'rechnungen', ebene: 2, sensibel: true },
  { label: '⚠️ Mahnwesen', href: '/dashboard/mahnwesen', modul: 'mahnwesen', ebene: 2, sensibel: true },
  { label: '💶 Finanzen', href: '/dashboard/finanzen', modul: 'finanzen', ebene: 2, sensibel: true },
  { label: '📑 Verträge', href: '/dashboard/vertraege', modul: 'vertraege', ebene: 2, sensibel: true },
  { label: '📊 Analytics', href: '/dashboard/analytics', modul: 'analytics', ebene: 2, sensibel: true },
  { label: '🕐 Zeit-Nachweis', href: '/dashboard/arbeitszeit-nachweis', modul: 'zeit-nachweis', ebene: 2, sensibel: true },
  { label: '🗂 GoBD', href: '/dashboard/gobd', modul: 'gobd', ebene: 2, sensibel: true },

  // --- Ebene 1: nur Eigentuemer (nie abgebbar) ----------------------------
  { label: '🔐 Rechte', href: '/dashboard/rechte', nurChef: true, ebene: 1 },

  { label: '🔧 Einstellungen', href: '/dashboard/einstellungen', immer: true, ebene: 4 },
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
 *
 * WICHTIG: sensible Module (ebene 2) sind hier bewusst AUSGESCHLOSSEN (!l.sensibel).
 * Sie sind kein "fuer jeden offen"-Bereich, sondern nur ueber eine ausdrueckliche
 * Pro-Person-Freigabe erreichbar (siehe mitarbeiterDarf, wo die freigeschalteten
 * Modul-Pfade zusaetzlich erlaubt werden).
 */
export const MITARBEITER_ERLAUBT: string[] = NAV_LINKS
  .filter((l) => (l.nurMitarbeiter || l.immer || (l.modul && !l.nurChef && !l.sensibel)) && !l.exakt)
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
// ============================================================================
// WELLE 3 · VERTEIL-LOGIK — die Grundregel als reine, testbare Funktionen.
// Zwei Achsen: A = Modul-Nutzung · B = Verteil-Vollmacht.
// Keine Supabase-Aufrufe, keine Hooks — importierbar von proxy.ts + Client.
// ============================================================================

export type Rolle = 'eigentuemer' | 'administrator' | 'abteilungsleiter' | 'mitarbeiter'

/** Modul-Schluessel -> Ebene (aus NAV_LINKS). Fehlt sie, gilt operativ (3). */
export const MODUL_EBENE: Record<string, number> = Object.fromEntries(
  NAV_LINKS.filter((l) => l.modul).map((l) => [l.modul as string, l.ebene ?? 3])
)

/** Sensible Modul-Schluessel (loesen 2-fach-Bestaetigung aus). */
export const SENSIBLE_MODULE: string[] = NAV_LINKS
  .filter((l) => l.modul && l.sensibel)
  .map((l) => l.modul as string)

/** Braucht dieses Modul die doppelte Bestaetigung beim Freigeben? */
export function istSensibel(modul: string): boolean {
  return SENSIBLE_MODULE.includes(modul)
}

/** Hoechste Ebene, die eine Rolle besitzen darf (1 = am meisten Macht). */
export function ebeneVonRolle(rolle: Rolle): number {
  switch (rolle) {
    case 'eigentuemer': return 1
    case 'administrator': return 2
    case 'abteilungsleiter': return 3
    default: return 4
  }
}

/**
 * Darf diese Person ueberhaupt Rechte verteilen (Achse B)?
 * Eigentuemer immer. Sonst nur, wenn ausdruecklich die Vollmacht gesetzt ist.
 */
export function darfVerteilen(rolle: Rolle, hatVollmacht: boolean): boolean {
  return rolle === 'eigentuemer' || hatVollmacht
}

/**
 * WELCHE Module darf eine Person weitergeben?
 * Grundregel: nur die eigenen Module — und davon nur die, deren Ebene sie
 * laut Rolle besitzen DARF. 'Rechte' (ebene 1) faellt hier automatisch raus,
 * ausser fuer den Eigentuemer, weil kein Modul-Schluessel < eigene Ebene passt.
 *
 * @param rolle         Rolle des Verteilenden.
 * @param eigeneModule  Modul-Schluessel, die die Person selbst besitzt.
 */
export function verteilbareModule(rolle: Rolle, eigeneModule: readonly string[]): string[] {
  const meineEbene = ebeneVonRolle(rolle)
  return eigeneModule.filter((m) => {
    const e = MODUL_EBENE[m]
    // nur Module, deren Ebene >= eigene Ebene (also gleich viel oder weniger Macht)
    return e !== undefined && e >= meineEbene
  })
}

/**
 * Darf `verteiler` dem Ziel das Modul `modul` freigeben?
 * Prueft alle drei Tore: Vollmacht (B), Besitz, und Ebenen-Grenze.
 */
export function darfModulFreigeben(
  rolle: Rolle,
  hatVollmacht: boolean,
  eigeneModule: readonly string[],
  modul: string,
): boolean {
  if (!darfVerteilen(rolle, hatVollmacht)) return false
  return verteilbareModule(rolle, eigeneModule).includes(modul)
}

// ============================================================================
// PUNKT 7 · SCHREIBRECHTE — zweite Achse: SEHEN vs. AENDERN.
//
// Ein Mitarbeiter kann ein Modul SEHEN (module[]) und trotzdem nur lesend
// darauf zugreifen. Das AENDERN-Recht liegt separat in schreib_module[].
// DB-Gegenstueck: public.darf_ich_modul_aendern(modul) (liest schreib_module).
//
// Reine Funktionen, keine Supabase-Aufrufe — importierbar von proxy.ts + Client.
// ============================================================================

/**
 * Darf der Mitarbeiter dieses Modul AENDERN (speichern/loeschen)?
 * Reine Pruefung gegen sein schreib_module-Array.
 *
 * WICHTIG: Aendern setzt Sehen voraus. Ein Modul steht nur dann sinnvoll in
 * schreib_module, wenn es auch in module steht — das stellt die Verteil-UI
 * sicher (Punkt 8). Diese Funktion prueft bewusst NUR das Schreib-Array, damit
 * sie 1:1 dem DB-Helfer entspricht und beide dieselbe Wahrheit liefern.
 *
 * @param modul          Modul-Schluessel (z. B. 'auftraege').
 * @param schreibModule  schreib_module-Array des Mitarbeiters.
 */
export function darfSchreiben(modul: string, schreibModule: readonly string[]): boolean {
  return schreibModule.includes(modul)
}

/**
 * Bequeme Kombi-Pruefung: sieht UND darf aendern.
 * Nuetzlich, wenn ein Speichern-Button beide Bedingungen braucht.
 *
 * @param modul          Modul-Schluessel.
 * @param module         module-Array (Sicht-Rechte) des Mitarbeiters.
 * @param schreibModule  schreib_module-Array (Schreib-Rechte) des Mitarbeiters.
 */
export function darfSehenUndSchreiben(
  modul: string,
  module: readonly string[],
  schreibModule: readonly string[],
): boolean {
  return module.includes(modul) && schreibModule.includes(modul)
}
