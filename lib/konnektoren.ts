// ============================================================
// ARGONAUT OS · lib/konnektoren.ts — Schnittstellen-Zentrale
// EINE Quelle der Wahrheit für ALLE externen Anbindungen: Bereiche (typ),
// Anbieter, benötigte Felder UND die Kategorie + Einrichtungs-Art.
//
// Prinzip: Jedes Modul ist intern fertig gebaut und läuft im „Demo/Manuell"-
// Modus. Trägt der Betrieb hier einen echten Anbieter + Zugangsdaten ein und
// schaltet ihn aktiv, liefert istLive() true — dann nutzt das Modul den echten
// Anbieter. Kein Code-Umbau.
//
// Einrichtungs-Art je Bereich:
//   · 'inline'  — direkt hier befüllen (Speicherung in betrieb_integrationen)
//   · 'verweis' — Zugang wird (noch) in einem eigenen Modul gepflegt; die
//                 Zentrale zeigt Anleitung + Status + „→ hier einrichten"-Link.
//                 Wird in einem späteren Schritt inline hereingezogen.
//   · 'geplant' — Anbindung ist vorgesehen, Feld folgt.
//
// KEINE Supabase-Aufrufe, KEINE React-Hooks — Client UND Server importierbar.
// ============================================================

export type IntegrationTyp =
  | 'tse' | 'shop' | 'datev' | 'zahlung'
  | 'bank' | 'elster' | 'meta' | 'google-ads' | 'linkedin' | 'whatsapp'
  | 'versand' | 'mail' | 'marktplatz';

export type KategorieId = 'geldfluss' | 'marketing' | 'betrieb';

export type Kategorie = { id: KategorieId; name: string; icon: string };

/** Anzeige-Reihenfolge der Kategorien. */
export const KATEGORIEN: Kategorie[] = [
  { id: 'geldfluss', name: 'Geldfluss & Steuern', icon: '💶' },
  { id: 'marketing', name: 'Marketing & Kanäle', icon: '📣' },
  { id: 'betrieb', name: 'Betrieb & Waren', icon: '🏭' },
];

export type KonnektorFeld = { key: string; label: string; typ?: 'text' | 'password' | 'url'; hinweis?: string };
export type KonnektorAnbieter = {
  key: string;
  name: string;
  /** true = Demo/Manuell (kein echter externer Dienst, immer verfügbar). */
  demo?: boolean;
  felder: KonnektorFeld[];
  hinweis?: string;
};

/** Wie der Bereich eingerichtet wird. */
export type Einrichten =
  | { modus: 'inline' }
  | { modus: 'verweis'; link: string; anleitung: string }
  | { modus: 'geplant'; anleitung?: string };

export type KonnektorBereich = {
  typ: IntegrationTyp;
  name: string;
  icon: string;
  kategorie: KategorieId;
  beschreibung: string;
  einrichten: Einrichten;
  anbieter: KonnektorAnbieter[];
};

// --- Der Katalog. Neue Anbieter hier ergänzen — Seite + Module ziehen automatisch nach. ---
export const KONNEKTOR_KATALOG: KonnektorBereich[] = [
  // ============================ GELDFLUSS & STEUERN ============================
  {
    typ: 'zahlung', name: 'Zahlungsanbieter / Bezahllink', icon: '💳', kategorie: 'geldfluss',
    einrichten: { modus: 'inline' },
    beschreibung: 'Ihr eigener Zahlungsanbieter für einen „Jetzt online bezahlen"-Knopf auf Rechnungen. ARGONAUT wickelt KEIN Geld ab — Sie verbinden Ihren eigenen Account, das Geld fließt direkt zu Ihnen. Ohne Eintrag steht auf der Rechnung weiterhin Ihre Bankverbindung + der GiroCode zum Scannen.',
    anbieter: [
      { key: 'kein', name: 'Kein Online-Bezahllink (nur Überweisung + GiroCode)', demo: true, felder: [], hinweis: 'Auf der Rechnung stehen Ihre Bankverbindung und der GiroCode zum Scannen — kein externer Anbieter nötig. Für viele Betriebe reicht das völlig.' },
      { key: 'paypalme', name: 'PayPal.Me', felder: [
        { key: 'handle', label: 'PayPal.Me-Name', typ: 'text', hinweis: 'Nur der Teil nach dem Schrägstrich: paypal.me/IhrName → hier „IhrName" eintragen. Der Rechnungsbetrag wird automatisch vorausgefüllt.' },
      ], hinweis: '① Kostenloses PayPal-Konto anlegen (oder vorhandenes nutzen) → ② auf paypal.me Ihren persönlichen Link einrichten → ③ den Namen hier eintragen. Das Geld geht direkt auf Ihr PayPal-Konto.' },
      { key: 'stripe', name: 'Stripe (Payment Link)', felder: [
        { key: 'link', label: 'Stripe Payment-Link (URL)', typ: 'url', hinweis: 'z. B. https://buy.stripe.com/…' },
      ], hinweis: '① Bei stripe.com anmelden → ② im Dashboard unter „Zahlungen → Payment Links" einen Link erstellen → ③ die URL hier einfügen. Kartenzahlung, Apple/Google Pay u. v. m.; Auszahlung direkt auf Ihr Stripe-Konto.' },
      { key: 'mollie', name: 'Mollie (Payment-Link)', felder: [
        { key: 'link', label: 'Mollie Payment-Link (URL)', typ: 'url', hinweis: 'z. B. https://paymentlink.mollie.com/…' },
      ], hinweis: '① Bei mollie.com anmelden → ② im Dashboard einen „Payment Link" erzeugen → ③ die URL hier einfügen. Beliebt für EU-Zahlarten (iDEAL, SEPA, Karte).' },
      { key: 'sumup', name: 'SumUp (Bezahllink)', felder: [
        { key: 'link', label: 'SumUp Bezahllink (URL)', typ: 'url' },
      ], hinweis: '① In der SumUp-App bzw. im Dashboard einen „Payment Link / Bezahllink" erstellen → ② die URL hier einfügen. Gut für Handwerk & Vor-Ort-Geschäft.' },
      { key: 'gocardless', name: 'GoCardless (Lastschrift-Link)', felder: [
        { key: 'link', label: 'GoCardless-Link (URL)', typ: 'url' },
      ], hinweis: '① Im GoCardless-Dashboard einen Zahlungslink erstellen → ② die URL hier einfügen. Ideal für wiederkehrende SEPA-Lastschriften.' },
      { key: 'eigener', name: 'Eigener Bezahllink (beliebiger Anbieter)', felder: [
        { key: 'link', label: 'Bezahllink (URL)', typ: 'url', hinweis: 'Beliebiger „Jetzt bezahlen"-Link Ihres Anbieters.' },
        { key: 'name', label: 'Anzeigename (optional)', typ: 'text', hinweis: 'Wie der Knopf heißen soll, z. B. „Klarna" oder „Kreditkarte".' },
      ], hinweis: 'Für jeden anderen Anbieter: Fügen Sie einfach den „Jetzt bezahlen"-Link ein, den Ihr Dienst Ihnen gibt — fertig.' },
    ],
  },
  {
    typ: 'datev', name: 'DATEV / Steuerberater', icon: '📊', kategorie: 'geldfluss',
    einrichten: { modus: 'inline' },
    beschreibung: 'Betriebs- und beraterindividuelle Werte für den DATEV-EXTF-Buchungsstapel (Kontenrahmen, Berater-/Mandantennummer). Die echte DATEV-Online-Übermittlung braucht ein Zertifikat und ist als Brücke vorgesehen.',
    anbieter: [
      { key: 'manuell', name: 'Nur Export (ohne Übermittlung)', demo: true, felder: [
        { key: 'skr', label: 'Kontenrahmen', typ: 'text', hinweis: '03 oder 04 (SKR03 / SKR04)' },
        { key: 'erloeskonto', label: 'Erlöskonto 19 %', typ: 'text', hinweis: 'z. B. 8400 (SKR03) / 4400 (SKR04)' },
        { key: 'erloeskonto_7', label: 'Erlöskonto 7 %', typ: 'text', hinweis: 'z. B. 8300 / 4300' },
        { key: 'debitor_sammel', label: 'Debitor-Sammelkonto', typ: 'text', hinweis: 'z. B. 10000' },
        { key: 'berater_nr', label: 'Beraternummer', typ: 'text', hinweis: 'Bekommen Sie von Ihrem Steuerberater.' },
        { key: 'mandant_nr', label: 'Mandantennummer', typ: 'text', hinweis: 'Bekommen Sie von Ihrem Steuerberater.' },
      ], hinweis: '① Kontenrahmen + Berater-/Mandantennummer beim Steuerberater erfragen → ② hier eintragen → ③ im Modul „DATEV" den EXTF-Buchungsstapel exportieren.' },
      { key: 'datev-connect', name: 'DATEVconnect / Online (Brücke)', felder: [
        { key: 'client_id', label: 'Client-ID', typ: 'text' },
        { key: 'client_secret', label: 'Client-Secret', typ: 'password' },
        { key: 'berater_nr', label: 'Beraternummer', typ: 'text' },
        { key: 'mandant_nr', label: 'Mandantennummer', typ: 'text' },
      ] },
    ],
  },
  {
    typ: 'bank', name: 'Bankkonto (Umsatz-Abruf)', icon: '🏦', kategorie: 'geldfluss',
    einrichten: { modus: 'verweis', link: '/dashboard/banking', anleitung: '① Bei finapi.io registrieren → ② im finAPI-Dashboard Client-ID + Client-Secret erzeugen → ③ im Modul „Banking" eintragen und Konto verbinden. Danach werden Umsätze automatisch abgeglichen.' },
    beschreibung: 'Automatischer Abruf Ihrer Kontoumsätze (über finAPI) und Abgleich mit offenen Rechnungen. Bis zum Verbinden importieren Sie Umsätze als CSV.',
    anbieter: [],
  },
  {
    typ: 'elster', name: 'ELSTER (USt-Voranmeldung)', icon: '🧾', kategorie: 'geldfluss',
    einrichten: { modus: 'verweis', link: '/dashboard/elster', anleitung: '① Organisationszertifikat bei elster.de beantragen → ② Zertifikatsdatei + Passwort bereithalten → ③ im Modul „ELSTER" hinterlegen. Die Kennziffern der UStVA werden schon jetzt berechnet.' },
    beschreibung: 'Umsatzsteuer-Voranmeldung: Kennziffern werden berechnet; die echte Übermittlung braucht Ihr ELSTER-Organisationszertifikat.',
    anbieter: [],
  },

  // ============================ MARKETING & KANÄLE ============================
  {
    typ: 'meta', name: 'Meta (Facebook / Instagram)', icon: '📸', kategorie: 'marketing',
    einrichten: { modus: 'verweis', link: '/dashboard/marketing/ads', anleitung: '① Meta-Business-Konto anlegen → ② unter developers.facebook.com eine App erstellen (App-ID + App-Secret), Redirect-URL eintragen (geben wir vor) → ③ im Marketing-Modul „Ads/Social" verbinden.' },
    beschreibung: 'Werbeanzeigen und Beiträge für Facebook & Instagram direkt aus ARGONAUT — schalten, planen, auswerten.',
    anbieter: [],
  },
  {
    typ: 'google-ads', name: 'Google Ads', icon: '🔍', kategorie: 'marketing',
    einrichten: { modus: 'verweis', link: '/dashboard/marketing/ads', anleitung: '① Google-Ads-Konto → im API-Center ein Developer-Token beantragen → ② in der Google Cloud Console OAuth-Client-ID + Secret erstellen → ③ im Marketing-Modul „Ads" verbinden.' },
    beschreibung: 'Google-Suchanzeigen schalten und die Ergebnisse (Klicks, Kosten, ROAS) ins Marketing-Cockpit holen.',
    anbieter: [],
  },
  {
    typ: 'linkedin', name: 'LinkedIn', icon: '💼', kategorie: 'marketing',
    einrichten: { modus: 'verweis', link: '/dashboard/marketing/social', anleitung: '① Unternehmensseite auf LinkedIn → ② unter linkedin.com/developers eine App anlegen (Client-ID + Secret), Redirect-URL eintragen → ③ im Marketing-Modul „Social" verbinden.' },
    beschreibung: 'Beiträge auf Ihrer LinkedIn-Unternehmensseite planen und veröffentlichen.',
    anbieter: [],
  },
  {
    typ: 'whatsapp', name: 'WhatsApp Business', icon: '💬', kategorie: 'marketing',
    einrichten: { modus: 'verweis', link: '/dashboard/marketing/whatsapp', anleitung: '① WhatsApp Business über Meta (oder einen Provider wie 360dialog) einrichten → ② Telefonnummer-ID + dauerhaftes Access-Token holen → ③ im Modul „WhatsApp" eintragen.' },
    beschreibung: 'WhatsApp-Nachrichten und Vorlagen an Ihre Kontakte senden — Aktionen, Erinnerungen, Bestätigungen.',
    anbieter: [],
  },

  // ============================ BETRIEB & WAREN ============================
  {
    typ: 'tse', name: 'Kasse / TSE', icon: '🧾', kategorie: 'betrieb',
    einrichten: { modus: 'inline' },
    beschreibung: 'Technische Sicherheitseinrichtung (TSE) für die Kasse. Gesetzlich (KassenSichV) muss die TSE von einem zertifizierten Anbieter kommen — die Kasse selbst läuft in ARGONAUT.',
    anbieter: [
      { key: 'demo', name: 'Demo-Modus (ohne echte TSE)', demo: true, felder: [], hinweis: 'Zum Testen & Vorführen. Belege werden mit einer Demo-Signatur versehen — nicht für den echten Geschäftsbetrieb.' },
      { key: 'fiskaly', name: 'fiskaly (Cloud-TSE)', felder: [
        { key: 'api_key', label: 'API Key', typ: 'password' },
        { key: 'api_secret', label: 'API Secret', typ: 'password' },
        { key: 'tss_id', label: 'TSS-ID', typ: 'text', hinweis: 'ID der angelegten Technical Security System' },
      ], hinweis: '① Bei fiskaly ein Cloud-TSE-Konto anlegen → ② im Dashboard API-Key + Secret + TSS-ID holen → ③ hier eintragen.' },
      { key: 'deutsche-fiskal', name: 'Deutsche Fiskal (FCC)', felder: [
        { key: 'client_id', label: 'Client-ID', typ: 'text' },
        { key: 'client_secret', label: 'Client-Secret', typ: 'password' },
        { key: 'base_url', label: 'FCC-URL', typ: 'url' },
      ] },
      { key: 'epson', name: 'Epson TSE (lokal)', felder: [
        { key: 'device_url', label: 'Geräte-URL', typ: 'url', hinweis: 'Adresse der Epson-TSE im lokalen Netz' },
        { key: 'secret', label: 'Admin-Secret', typ: 'password' },
      ] },
    ],
  },
  {
    typ: 'shop', name: 'Shop / Marktplatz', icon: '🛒', kategorie: 'betrieb',
    einrichten: { modus: 'inline' },
    beschreibung: 'Anbindung an Online-Shops und Marktplätze: Produkte, Bestellungen und Bestand abgleichen.',
    anbieter: [
      { key: 'manuell', name: 'Manuell / CSV', demo: true, felder: [], hinweis: 'Bestellungen per CSV importieren, Bestand manuell pflegen — ohne externe Schnittstelle.' },
      { key: 'shopware', name: 'Shopware 6', felder: [
        { key: 'shop_url', label: 'Shop-URL', typ: 'url' },
        { key: 'client_id', label: 'Client-ID', typ: 'text' },
        { key: 'client_secret', label: 'Client-Secret', typ: 'password' },
      ] },
      { key: 'shopify', name: 'Shopify', felder: [
        { key: 'shop_url', label: 'Shop-Domain', typ: 'url', hinweis: 'z. B. meinshop.myshopify.com' },
        { key: 'access_token', label: 'Admin-API Access Token', typ: 'password' },
      ] },
      { key: 'woocommerce', name: 'WooCommerce', felder: [
        { key: 'shop_url', label: 'Shop-URL', typ: 'url' },
        { key: 'consumer_key', label: 'Consumer Key', typ: 'password' },
        { key: 'consumer_secret', label: 'Consumer Secret', typ: 'password' },
      ] },
    ],
  },
  {
    typ: 'versand', name: 'Versand / Etiketten', icon: '📦', kategorie: 'betrieb',
    einrichten: { modus: 'geplant', anleitung: 'Vorgesehen über shipcloud: ein API-Key verbindet DHL, DPD, GLS, UPS & Hermes gebündelt für Versandetiketten. Feld folgt in einem nächsten Schritt.' },
    beschreibung: 'Versandetiketten für mehrere Paketdienste über eine Anbindung (shipcloud).',
    anbieter: [],
  },
  {
    typ: 'mail', name: 'Mail & Kalender', icon: '✉️', kategorie: 'betrieb',
    einrichten: { modus: 'geplant', anleitung: 'Vorgesehen für Google Workspace und Microsoft 365 (OAuth): Termine und Nachrichten synchronisieren. Felder folgen in einem nächsten Schritt.' },
    beschreibung: 'Postfach und Kalender (Google / Microsoft) mit ARGONAUT synchronisieren.',
    anbieter: [],
  },
];

export function bereich(typ: IntegrationTyp): KonnektorBereich | undefined {
  return KONNEKTOR_KATALOG.find((b) => b.typ === typ);
}
export function anbieterVon(typ: IntegrationTyp, key: string): KonnektorAnbieter | undefined {
  return bereich(typ)?.anbieter.find((a) => a.key === key);
}
/** Alle Bereiche einer Kategorie, in Katalog-Reihenfolge. */
export function bereicheNachKategorie(kat: KategorieId): KonnektorBereich[] {
  return KONNEKTOR_KATALOG.filter((b) => b.kategorie === kat);
}
/** Nur inline-befüllbare Bereiche (echte Speicherung in betrieb_integrationen). */
export function istInline(b: KonnektorBereich): boolean {
  return b.einrichten.modus === 'inline';
}

export type IntegrationDatensatz = { typ: string; anbieter: string; config: Record<string, unknown>; aktiv: boolean };

/**
 * Ist für diesen Bereich ein ECHTER Anbieter scharf geschaltet?
 * Demo/Manuell oder inaktiv -> false (Modul läuft im Demo-Modus).
 */
export function istLive(intg: IntegrationDatensatz | null | undefined): boolean {
  if (!intg || !intg.aktiv) return false;
  const a = anbieterVon(intg.typ as IntegrationTyp, intg.anbieter);
  return !!a && !a.demo;
}

/** Menschlich lesbarer Modus-Text für Badges. */
export function modusText(intg: IntegrationDatensatz | null | undefined): string {
  if (istLive(intg)) return `Live · ${anbieterVon(intg!.typ as IntegrationTyp, intg!.anbieter)?.name || intg!.anbieter}`;
  return 'Demo-Modus';
}
