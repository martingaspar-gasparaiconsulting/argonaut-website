// ============================================================================
// ARGONAUT OS · lib/flags.ts — zentrale Schalter (Feature-Flags)
//
// EIN Ort, ein Handgriff. Hier wird scharfgeschaltet, was „dunkel" gebaut wurde.
//
// BESTELLSTRECKE_LIVE:
//   false = Die öffentliche Buchen-Strecke (/buchen) ist FERTIG gebaut, aber
//           NICHT scharf: sie wird nirgends verlinkt und die verbindliche
//           Bestellung ist deaktiviert. Man kann sie zum Testen aufrufen,
//           sie zeigt oben einen „Vorschau"-Hinweis.
//   true  = Strecke ist live: Verlinkung + verbindliche Bestellung aktiv.
//
// Zum Scharfstellen NACH dem Auftritt: hier auf true setzen, committen, pushen.
// Nichts an Preisen/Abrechnung muss dafür angefasst werden.
// ============================================================================

export const BESTELLSTRECKE_LIVE = false;

// ZAHLUNG_LIVE:
//   false = Online-Kartenzahlung im Kunden-Shop ist „dunkel": Kunden bestellen
//           (Bestellung landet im System, Betrieb rechnet ab / kassiert per
//           Rechnung/Überweisung/Abholung). Die Einstellungsseite „Online-
//           Zahlung" erklärt, was zum Scharfstellen fehlt (Stripe-/Mollie-Konto).
//   true  = Kartenzahlung im Shop aktiv (setzt verbundenes Stripe/Mollie voraus).
//
// Zum Scharfstellen: Stripe/Mollie-Konto verbinden, dann hier true setzen.
export const ZAHLUNG_LIVE = false;
