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
// `geprueft: true` = in S1 (Paket 161) einzeln geprüft: nur eigener Zweck,
// liest nie mehr aus dem Betrieb als nötig, Mengen-Deckel (lib/drossel.ts),
// Nachweis. `geprueft: false` + `offen` = Befund, der noch eine Entscheidung braucht.
// ============================================================================

export type Schutz =
  | 'token'          // Einmal-/Link-Token aus einer Mail oder einem Portal-Link
  | 'seite'          // gehört zu einer veröffentlichten Webseite/einem Shop des Betriebs
  | 'formular'       // Eingabe von Besuchern (Anfrage, Buchung, Bestellung)
  | 'nur-lesen'      // liefert nur Öffentliches (z. B. belegte Termin-Zeiten ohne Namen)
  | 'deckel'         // KI für Besucher, mit Längen- und Tagesdeckel
  | 'abgeschaltet';  // antwortet nur noch mit „abgeschaltet"

export type OffeneTuer = {
  pfad: string; grund: string; schutz: Schutz; geprueft: boolean;
  /** S1: was nach der Prüfung noch offen ist (dann geprueft: false). */
  offen?: string;
};

export const OFFENE_TUEREN: OffeneTuer[] = [
  // --- ARGONAUT-eigene Webseite (argonaut-os.com) ---
  { pfad: 'termine', grund: 'belegte Termin-Zeiten der ARGONAUT-Webseite (nur Datum/Uhrzeit, keine Namen)', schutz: 'nur-lesen', geprueft: true },
  { pfad: 'website-anfrage', grund: 'Anfrage-/Termin-Formular der ARGONAUT-Webseite', schutz: 'formular', geprueft: true },
  { pfad: 'bestellung', grund: 'Bestellstrecke /buchen — dunkel bis BESTELLSTRECKE_LIVE (403)', schutz: 'formular', geprueft: true },
  { pfad: 'oeffentlich/cta-modus', grund: 'welcher Knopf auf der Webseite erscheint', schutz: 'nur-lesen', geprueft: true },
  { pfad: 'oeffentlich/branchen-chat', grund: 'die kleine Frage-Stelle auf den Branchenseiten von argonaut-os.com (Deckel je Besucher + gesamt, lib/drossel.ts)', schutz: 'deckel', geprueft: true },
  { pfad: 'oeffentlich/dossier-optin', grund: 'Dossier anfordern (Double-Opt-in Schritt 1)', schutz: 'formular', geprueft: true },
  { pfad: 'oeffentlich/dossier-bestaetigen', grund: 'Dossier Double-Opt-in bestätigen', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/dossier-abmelden', grund: 'Dossier-Serie abmelden', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/dossier-pdf', grund: 'Dossier-PDF nach Bestätigung', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/ebook-pdf', grund: 'E-Book-PDF nach Bestätigung', schutz: 'token', geprueft: true },
  // --- Webseiten, Shops, Landingpages der Betriebe (Besucher der Kunden) ---
  { pfad: 'oeffentlich/chat', grund: 'Shop-Chat auf der Kundenwebseite (Herkunftsprüfung + Monatsdeckel)', schutz: 'deckel', geprueft: true },
  { pfad: 'oeffentlich/lp', grund: 'Landingpage des Betriebs anzeigen/zählen', schutz: 'seite', geprueft: true },
  { pfad: 'oeffentlich/web-anfrage', grund: 'Anfrage-Formular der Kundenwebseite -> CRM des Betriebs', schutz: 'formular', geprueft: true },
  // Paket 264 (07.10.26): Online-Ankaufformular eines Kfz-Betriebs -> kfz_ankauf; Betrieb nur ueber geheime Kennung, vom Chef ein-/ausschaltbar.
  { pfad: 'oeffentlich/kfz-ankauf', grund: 'Online-Ankaufformular eines Kfz-Betriebs (Fahrzeug anbieten) -> Ankauf und Bewertung des Betriebs', schutz: 'formular', geprueft: true },
  { pfad: 'oeffentlich/web-newsletter', grund: 'Newsletter-Anmeldung der Kundenwebseite (Double-Opt-in)', schutz: 'formular', geprueft: true },
  { pfad: 'oeffentlich/shop-produkte', grund: 'freigeschaltete Produkte eines Shops', schutz: 'seite', geprueft: true },
  { pfad: 'oeffentlich/shop-bestellung', grund: 'Bestellung im Shop des Betriebs', schutz: 'formular', geprueft: true },
  { pfad: 'oeffentlich/widerruf', grund: 'elektronischer Widerruf (Pflicht-Knopf)', schutz: 'formular', geprueft: true },
  { pfad: 'oeffentlich/buchung', grund: 'Terminbuchung auf der Kundenwebseite', schutz: 'formular', geprueft: true },
  { pfad: 'oeffentlich/buchung-info', grund: 'freie Zeiten für die Terminbuchung', schutz: 'nur-lesen', geprueft: true },
  { pfad: 'oeffentlich/bewertung', grund: 'Bewertung abgeben (Link aus der Bewertungs-Kampagne)', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/bewertungen', grund: 'freigegebene Bewertungen auf der Kundenwebseite', schutz: 'nur-lesen', geprueft: true },
  { pfad: 'oeffentlich/freebie', grund: 'Freebie anfordern (Double-Opt-in Schritt 1)', schutz: 'formular', geprueft: true },
  { pfad: 'oeffentlich/freebie-bestaetigen', grund: 'Freebie Double-Opt-in bestätigen', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/freebie-abmelden', grund: 'Freebie-Strecke abmelden', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/optin', grund: 'Newsletter-Anmeldung (Double-Opt-in Schritt 1)', schutz: 'formular', geprueft: true },
  { pfad: 'oeffentlich/optin-bestaetigen', grund: 'Newsletter Double-Opt-in bestätigen', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/whatsapp-optin', grund: 'WhatsApp-Einwilligung', schutz: 'formular', geprueft: false,
    offen: 'Nummer wird OHNE Bestätigung sofort aktiv — Dritte können fremde Nummern eintragen. Bestätigung per WhatsApp-Antwort (eigenes Paket, ändert den Ablauf für echte Anmelder).' },
  { pfad: 'oeffentlich/webinar', grund: 'Webinar-Anmeldung', schutz: 'formular', geprueft: true },
  { pfad: 'oeffentlich/webinar-bestaetigen', grund: 'Webinar Double-Opt-in bestätigen', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/webinar-abmelden', grund: 'Webinar-Mails abmelden', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/rueckhol-abmelden', grund: 'Rückhol-Mails abmelden', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/csp-bericht', grund: 'Meldungen der Sicherheitsregel (CSP im Beobachtungsmodus, Paket 187b) — schreibt nichts, nur eine Protokollzeile ohne Abfrage-Zeichen', schutz: 'formular', geprueft: true },
  { pfad: 'oeffentlich/werbung-abmelden', grund: 'Abmeldelink für alle Werbe-Mails eines Betriebs (Paket 173) — nur mit HMAC-Unterschrift über Betrieb + Adresse, schreibt nur den Widerspruch', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/mail-klick', grund: 'Klick-Zählung in Mails (Weiterleitung)', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/mail-pixel', grund: 'Öffnungs-Zählung in Mails', schutz: 'token', geprueft: true },
  { pfad: 'autoresponder/abmelden', grund: 'Autoresponder abmelden (Pflicht-Link)', schutz: 'token', geprueft: true },
  { pfad: 'newsletter/abmelden', grund: 'Newsletter abmelden (Pflicht-Link)', schutz: 'token', geprueft: true },
  // --- Kundenportal: der Kunde des Betriebs sieht/antwortet auf SEINEN Vorgang ---
  { pfad: 'oeffentlich/angebot', grund: 'Angebot per Link ansehen/annehmen (Kunde des Betriebs)', schutz: 'token', geprueft: false,
    offen: 'Auch ein Angebot im Status „entwurf" ist per Link annehmbar (Zusage-Link wird schon im Entwurf kopiert). Kern-Geld — GEMEINSAM entscheiden.' },
  { pfad: 'oeffentlich/portal', grund: 'Kundenportal-Link', schutz: 'token', geprueft: false,
    offen: 'Zeigt dem Kunden auch Angebots-Entwürfe mit Zusage-Link (gehört zur Entscheidung bei oeffentlich/angebot, GEMEINSAM).' },
  { pfad: 'oeffentlich/portal/rechnung', grund: 'eigene Rechnung im Kundenportal ansehen', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/portal/bezahlt-melden', grund: 'Kunde meldet „bezahlt" — darf NIE selbst auf bezahlt setzen (S1 prüfen)', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/portal/freigabe', grund: 'Kunde gibt Nachtrag/Bemusterung frei', schutz: 'token', geprueft: true },
  { pfad: 'oeffentlich/portal/baustelle', grund: 'Baustellen-Stand im Kundenportal', schutz: 'token', geprueft: true },
  // --- abgeschaltet ---
  { pfad: 'preisauskunft', grund: 'war Zugang für n8n per API-Schlüssel — seit S0 abgeschaltet (410)', schutz: 'abgeschaltet', geprueft: true },
];

/** Steht diese Schnittstelle (Pfad unter app/api, ohne /route.ts) auf der Liste? */
export function istOffeneTuer(pfad: string): boolean {
  return OFFENE_TUEREN.some((t) => t.pfad === pfad);
}
