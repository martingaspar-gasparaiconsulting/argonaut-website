// ============================================================================
// ARGONAUT OS · lib/einrichtung.ts — was je Betrieb einzurichten ist
//
// Der Kunde bekommt All-in-One. Was kompliziert ist — Meta, WhatsApp, Mail,
// später der Bankzugang — macht der Betreiber. Damit stellt sich beim vierten
// Kunden die Frage: Was steht bei DIESEM noch offen?
//
// DIE LISTE PFLEGT SICH NICHT VON HAND
// Eine abgehakte Checkliste ist nach drei Kunden falsch, und dann glaubt ihr
// niemand mehr. Hier stehen deshalb nur die FRAGEN; die Antworten holt der
// Aufrufer aus der Datenbank und reicht sie als `Bestand` herein. Ein Punkt
// ist erledigt, weil die Daten es sagen — nicht, weil jemand geklickt hat.
//
// WARUM DIE PUNKTE DATEN SIND UND KEINE SEITE
// Wenn ein Zugang später automatisch läuft, ändert sich genau ein Feld:
// `zustaendig: 'automatisch'`. Anzeige, Sortierung, Fortschritt bleiben. Das
// ist der Unterschied zwischen „später umbauen" und „später einen Wert ändern".
//
// Keine Imports, keine Hooks, keine Datenbank — node-testbar.
// ============================================================================

/** Wer muss ran? */
export type Zustaendig = 'betreiber' | 'kunde' | 'automatisch';

export type Punkt = {
  id: string;
  name: string;
  /** Ein Satz für den Betreiber: Warum gibt es diesen Punkt? */
  warum: string;
  zustaendig: Zustaendig;
  /** Schlüssel im `Bestand`, unter dem der Ist-Zustand steht. */
  feld: string;
  /** modul_key aus `tenant_module`. Ohne Angabe gilt der Punkt immer. */
  modul?: string;
  /** Wohin der Betreiber klickt, um es zu erledigen. */
  wo?: string;
  /** Punkt-id, die vorher erledigt sein muss — sonst ergibt dieser keinen Sinn. */
  braucht?: string;
  /** Gibt es noch nicht. Steht trotzdem in der Liste, damit nichts vergessen wird. */
  geplant?: boolean;
};

/**
 * Was die Datenbank sagt. `true`/`false` = geprüft, `null`/fehlt = unbekannt.
 *
 * Unbekannt ist bewusst NICHT dasselbe wie offen: Wenn eine Abfrage
 * fehlschlägt, soll dort „?" stehen und kein falsches „muss noch gemacht
 * werden" — sonst jagt der Betreiber Punkte, die längst erledigt sind.
 */
export type Bestand = Record<string, boolean | null | undefined>;

export const PUNKTE: Punkt[] = [
  // --- Fundament -----------------------------------------------------------
  {
    id: 'ci_firma',
    name: 'Firmendaten hinterlegt',
    warum: 'Ohne Firmenname spricht jeder Bot und jede Mail von „unser Betrieb".',
    zustaendig: 'kunde',
    feld: 'ciFirma',
    wo: '/dashboard/webseiten',
  },
  {
    id: 'web_live',
    name: 'Website veröffentlicht',
    warum: 'Solange sie nicht live ist, nimmt sie keine Anfragen an.',
    zustaendig: 'kunde',
    feld: 'webLive',
    wo: '/dashboard/webseiten',
  },

  // --- KI-Berater ----------------------------------------------------------
  {
    id: 'setter_rolle',
    name: 'KI-Berater: Rolle und Fragen',
    warum: 'Ohne Einstellung gibt der Bot nur Auskunft und sammelt keine Anfragen.',
    zustaendig: 'betreiber',
    feld: 'setterEingerichtet',
    braucht: 'web_live',
    wo: '/admin/command-center/setter',
  },
  {
    id: 'chat_domain',
    name: 'Chat-Domain freigeschaltet',
    warum: 'Auf einer eigenen Kundendomain läuft der Berater erst, wenn sie eingetragen ist — sonst könnte jede fremde Seite ihn auf unsere Kosten laufen lassen.',
    zustaendig: 'betreiber',
    feld: 'chatDomain',
    braucht: 'web_live',
    wo: '/admin/command-center/setter',
  },

  // --- WhatsApp ------------------------------------------------------------
  {
    id: 'wa_token',
    name: 'WhatsApp: Webhook-Token erzeugt',
    warum: 'Meta prüft damit beim Einrichten, dass die Adresse wirklich uns gehört.',
    zustaendig: 'betreiber',
    feld: 'waToken',
    modul: 'marketing',
    wo: '/admin/command-center/whatsapp',
  },
  {
    id: 'wa_secret',
    name: 'WhatsApp: App-Secret hinterlegt',
    warum: 'Ohne Secret wird keine eingehende Nachricht gespeichert — die Signatur ist nicht prüfbar.',
    zustaendig: 'betreiber',
    feld: 'waSecret',
    modul: 'marketing',
    braucht: 'wa_token',
    wo: '/admin/command-center/whatsapp',
  },
  {
    id: 'wa_nummer',
    name: 'WhatsApp: Telefonnummer verbunden',
    warum: 'Erst mit verbundener Nummer kann der Betrieb auch antworten.',
    zustaendig: 'betreiber',
    feld: 'waNummer',
    modul: 'marketing',
    braucht: 'wa_secret',
    wo: '/admin/command-center/whatsapp',
  },

  // --- Termine -------------------------------------------------------------
  {
    id: 'termin_arten',
    name: 'Terminarten angelegt',
    warum: 'Ohne Terminart gibt es keine buchbaren Zeiten.',
    zustaendig: 'kunde',
    feld: 'terminArten',
    modul: 'online-buchung',
    wo: '/dashboard/termine',
  },
  {
    id: 'buchung_slug',
    name: 'Buchungsseite erreichbar',
    warum: 'Der KI-Berater führt zur Buchungsseite. Ohne Adresse bietet er keinen Termin an.',
    zustaendig: 'betreiber',
    feld: 'buchungSlug',
    modul: 'online-buchung',
    braucht: 'termin_arten',
    wo: '/admin/command-center/setter',
  },

  // --- Shop ----------------------------------------------------------------
  {
    id: 'shop_artikel',
    name: 'Produkte im Shop freigeschaltet',
    warum: 'Der Berater darf nur Produkte nennen, die wirklich hinterlegt sind.',
    zustaendig: 'kunde',
    feld: 'shopArtikel',
    modul: 'shop',
    wo: '/dashboard/artikel',
  },

  // --- Kommunikation -------------------------------------------------------
  {
    id: 'mail_absender',
    name: 'E-Mail-Absender verifiziert',
    warum: 'Ohne verifizierte Absenderadresse landen Bestätigungen im Spam oder gar nicht.',
    zustaendig: 'betreiber',
    feld: 'mailAbsender',
    wo: '/admin/command-center/systeme',
  },

  // --- Noch nicht gebaut ---------------------------------------------------
  {
    id: 'bank_zugang',
    name: 'Bankzugang eingerichtet',
    warum: 'Kommt später. Steht hier, damit der Punkt bei der Übergabe nicht vergessen wird.',
    zustaendig: 'betreiber',
    feld: 'bankZugang',
    modul: 'banking',
    geplant: true,
  },
];

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

export type Status = 'erledigt' | 'offen' | 'wartet' | 'nicht_gebucht' | 'geplant' | 'unbekannt';

export type Zeile = Punkt & { status: Status };

export const STATUS_TEXT: Record<Status, string> = {
  erledigt: 'erledigt',
  offen: 'offen',
  wartet: 'wartet auf einen anderen Punkt',
  nicht_gebucht: 'nicht gebucht',
  geplant: 'noch nicht gebaut',
  unbekannt: 'unbekannt',
};

/**
 * Baut die Liste für EINEN Betrieb.
 *
 * `gebuchteModule` folgt demselben Vertrag wie lib/tenantModule.ts: `null`
 * heißt „nie scharf konfiguriert" und damit gilt alles als gebucht. Ein
 * Betrieb ohne Buchungszeilen soll eine vollständige Liste sehen, keine leere.
 */
export function baueCheckliste(
  bestand: Bestand | null | undefined,
  gebuchteModule: ReadonlySet<string> | null | undefined,
  punkte: readonly Punkt[] = PUNKTE,
): Zeile[] {
  const b = bestand ?? {};
  const erledigt = new Set<string>();

  // Erster Durchgang: Wer ist fertig? Das braucht der zweite für `braucht`.
  for (const p of punkte) if (b[p.feld] === true) erledigt.add(p.id);

  return punkte.map((p) => ({ ...p, status: statusFuer(p, b, gebuchteModule, erledigt) }));
}

function statusFuer(
  p: Punkt,
  b: Bestand,
  gebucht: ReadonlySet<string> | null | undefined,
  erledigt: ReadonlySet<string>,
): Status {
  // Reihenfolge ist Absicht: Ein erledigter Punkt bleibt erledigt, auch wenn
  // das Modul später abbestellt wird — sonst verschwindet die Spur der Arbeit.
  if (b[p.feld] === true) return 'erledigt';
  if (p.modul && gebucht && !gebucht.has(p.modul)) return 'nicht_gebucht';
  if (p.geplant) return 'geplant';
  if (p.braucht && !erledigt.has(p.braucht)) return 'wartet';
  if (b[p.feld] === false) return 'offen';
  return 'unbekannt';
}

export type Fortschritt = { erledigt: number; offen: number; gesamt: number; prozent: number };

/**
 * Gezählt wird nur, was zählbar ist: Was nicht gebucht oder noch nicht gebaut
 * ist, drückt die Quote nicht. Sonst käme ein kleiner Kunde nie auf 100 %.
 */
export function fortschritt(zeilen: readonly Zeile[] | null | undefined): Fortschritt {
  const zaehlt = (Array.isArray(zeilen) ? zeilen : []).filter(
    (z) => z.status !== 'nicht_gebucht' && z.status !== 'geplant',
  );
  const erledigt = zaehlt.filter((z) => z.status === 'erledigt').length;
  const gesamt = zaehlt.length;
  return {
    erledigt,
    offen: gesamt - erledigt,
    gesamt,
    prozent: gesamt === 0 ? 100 : Math.round((erledigt / gesamt) * 100),
  };
}

/** Was jetzt auf dieser Person liegt — „wartet" gehört nicht dazu. */
export function offeneFuer(zeilen: readonly Zeile[] | null | undefined, wer: Zustaendig): Zeile[] {
  return (Array.isArray(zeilen) ? zeilen : []).filter(
    (z) => z.zustaendig === wer && (z.status === 'offen' || z.status === 'unbekannt'),
  );
}

/** Alles erledigt, was zu erledigen war? */
export function istFertig(zeilen: readonly Zeile[] | null | undefined): boolean {
  return fortschritt(zeilen).offen === 0;
}
