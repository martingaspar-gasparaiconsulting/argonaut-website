// ============================================================================
// ARGONAUT OS · lib/offeneTueren.ts — die EINE Liste der Schnittstellen ohne Login
// (Paket S0, 28.09.2026)
//
// Martins Regel (28.09.2026): Was ein Betrieb intern macht oder verschickt —
// Rechnungen, Mahnungen, Kunden- und Mitarbeiterdaten, KI-Auswertungen —
// wird NIE von außen angestoßen. Das geht nur mit Login (lib/nurAngemeldet.ts)
// und ist nachvollziehbar.
// Offen bleiben dürfen nur Türen für Besucher und Kunden eines Betriebs:
// Webseite, Shop, Buchung, Anfrage, Double-Opt-in, Abmelden, Widerruf,
// Kundenportal-Link — und Maschinen mit Geheimnis/Signatur (Zeitplan, Mail-Dienst).
//
// Jede offene Tür steht hier mit Grund und Schutz. tests/zugangWaechterS0.test.mjs
// bricht den Build ab, wenn eine Schnittstelle weder Login-Prüfung hat noch hier
// steht — so entsteht nie wieder unbemerkt eine offene Tür.
// `geprueft: false` = in S1 einzeln prüfen (nur eigener Zweck, Mengenlimit,
// liest nie mehr aus dem Betrieb als nötig, Protokoll).
// ============================================================================

export type Schutz =
  | 'token'          // Einmal-/Link-Token aus einer Mail oder einem Portal-Link
  | 'seite'          // gehört zu einer veröffentlichten Webseite/einem Shop des Betriebs
  | 'formular'       // Eingabe von Besuchern (Anfrage, Buchung, Bestellung)
  | 'nur-lesen'      // liefert nur Öffentliches (z. B. belegte Termin-Zeiten ohne Namen)
  | 'deckel'         // KI für Besucher, mit Längen- und Tagesdeckel
  | 'abgeschaltet';  // antwortet nur noch mit „abgeschaltet"

export type OffeneTuer = { pfad: string; grund: string; schutz: Schutz; geprueft: boolean };

export const OFFENE_TUEREN: OffeneTuer[] = [
  // --- ARGONAUT-eigene Webseite (argonaut-os.com) ---
  { pfad: 'termine', grund: 'belegte Termin-Zeiten der ARGONAUT-Webseite (nur Datum/Uhrzeit, keine Namen)', schutz: 'nur-lesen', geprueft: true },
  { pfad: 'website-anfrage', grund: 'Anfrage-/Termin-Formular der ARGONAUT-Webseite', schutz: 'formular', geprueft: false },
  { pfad: 'bestellung', grund: 'Bestellstrecke /buchen — dunkel bis BESTELLSTRECKE_LIVE (403)', schutz: 'formular', geprueft: true },
  { pfad: 'oeffentlich/cta-modus', grund: 'welcher Knopf auf der Webseite erscheint', schutz: 'nur-lesen', geprueft: false },
  { pfad: 'oeffentlich/branchen-chat', grund: 'die kleine Frage-Stelle auf den Branchenseiten von argonaut-os.com (Limit fehlt laut Sicherheits-Liste)', schutz: 'deckel', geprueft: false },
  { pfad: 'oeffentlich/dossier-optin', grund: 'Dossier anfordern (Double-Opt-in Schritt 1)', schutz: 'formular', geprueft: false },
  { pfad: 'oeffentlich/dossier-bestaetigen', grund: 'Dossier Double-Opt-in bestätigen', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/dossier-abmelden', grund: 'Dossier-Serie abmelden', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/dossier-pdf', grund: 'Dossier-PDF nach Bestätigung', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/ebook-pdf', grund: 'E-Book-PDF nach Bestätigung', schutz: 'token', geprueft: false },
  // --- Webseiten, Shops, Landingpages der Betriebe (Besucher der Kunden) ---
  { pfad: 'oeffentlich/chat', grund: 'Shop-Chat auf der Kundenwebseite (Herkunftsprüfung + Monatsdeckel)', schutz: 'deckel', geprueft: false },
  { pfad: 'oeffentlich/lp', grund: 'Landingpage des Betriebs anzeigen/zählen', schutz: 'seite', geprueft: false },
  { pfad: 'oeffentlich/web-anfrage', grund: 'Anfrage-Formular der Kundenwebseite -> CRM des Betriebs', schutz: 'formular', geprueft: false },
  { pfad: 'oeffentlich/web-newsletter', grund: 'Newsletter-Anmeldung der Kundenwebseite (Double-Opt-in)', schutz: 'formular', geprueft: false },
  { pfad: 'oeffentlich/shop-produkte', grund: 'freigeschaltete Produkte eines Shops', schutz: 'seite', geprueft: false },
  { pfad: 'oeffentlich/shop-bestellung', grund: 'Bestellung im Shop des Betriebs', schutz: 'formular', geprueft: false },
  { pfad: 'oeffentlich/widerruf', grund: 'elektronischer Widerruf (Pflicht-Knopf)', schutz: 'formular', geprueft: false },
  { pfad: 'oeffentlich/buchung', grund: 'Terminbuchung auf der Kundenwebseite', schutz: 'formular', geprueft: false },
  { pfad: 'oeffentlich/buchung-info', grund: 'freie Zeiten für die Terminbuchung', schutz: 'nur-lesen', geprueft: false },
  { pfad: 'oeffentlich/bewertung', grund: 'Bewertung abgeben (Link aus der Bewertungs-Kampagne)', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/bewertungen', grund: 'freigegebene Bewertungen auf der Kundenwebseite', schutz: 'nur-lesen', geprueft: false },
  { pfad: 'oeffentlich/freebie', grund: 'Freebie anfordern (Double-Opt-in Schritt 1)', schutz: 'formular', geprueft: false },
  { pfad: 'oeffentlich/freebie-bestaetigen', grund: 'Freebie Double-Opt-in bestätigen', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/freebie-abmelden', grund: 'Freebie-Strecke abmelden', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/optin', grund: 'Newsletter-Anmeldung (Double-Opt-in Schritt 1)', schutz: 'formular', geprueft: false },
  { pfad: 'oeffentlich/optin-bestaetigen', grund: 'Newsletter Double-Opt-in bestätigen', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/whatsapp-optin', grund: 'WhatsApp-Einwilligung', schutz: 'formular', geprueft: false },
  { pfad: 'oeffentlich/webinar', grund: 'Webinar-Anmeldung', schutz: 'formular', geprueft: false },
  { pfad: 'oeffentlich/webinar-bestaetigen', grund: 'Webinar Double-Opt-in bestätigen', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/webinar-abmelden', grund: 'Webinar-Mails abmelden', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/rueckhol-abmelden', grund: 'Rückhol-Mails abmelden', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/mail-klick', grund: 'Klick-Zählung in Mails (Weiterleitung)', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/mail-pixel', grund: 'Öffnungs-Zählung in Mails', schutz: 'token', geprueft: false },
  { pfad: 'autoresponder/abmelden', grund: 'Autoresponder abmelden (Pflicht-Link)', schutz: 'token', geprueft: false },
  { pfad: 'newsletter/abmelden', grund: 'Newsletter abmelden (Pflicht-Link)', schutz: 'token', geprueft: false },
  // --- Kundenportal: der Kunde des Betriebs sieht/antwortet auf SEINEN Vorgang ---
  { pfad: 'oeffentlich/angebot', grund: 'Angebot per Link ansehen/annehmen (Kunde des Betriebs)', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/portal', grund: 'Kundenportal-Link', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/portal/rechnung', grund: 'eigene Rechnung im Kundenportal ansehen', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/portal/bezahlt-melden', grund: 'Kunde meldet „bezahlt" — darf NIE selbst auf bezahlt setzen (S1 prüfen)', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/portal/freigabe', grund: 'Kunde gibt Nachtrag/Bemusterung frei', schutz: 'token', geprueft: false },
  { pfad: 'oeffentlich/portal/baustelle', grund: 'Baustellen-Stand im Kundenportal', schutz: 'token', geprueft: false },
  // --- abgeschaltet ---
  { pfad: 'preisauskunft', grund: 'war Zugang für n8n per API-Schlüssel — seit S0 abgeschaltet (410)', schutz: 'abgeschaltet', geprueft: true },
];

/** Steht diese Schnittstelle (Pfad unter app/api, ohne /route.ts) auf der Liste? */
export function istOffeneTuer(pfad: string): boolean {
  return OFFENE_TUEREN.some((t) => t.pfad === pfad);
}
