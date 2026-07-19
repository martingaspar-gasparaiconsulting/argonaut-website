// ============================================================
// ARGONAUT OS · Bündel 15 · lib/konnektoren.ts
// Das Konnektor-Fundament. EINE Quelle der Wahrheit für die verfügbaren
// externen Bereiche (typ), ihre Anbieter und die benötigten Felder.
//
// Prinzip: Jedes Modul (Kasse, Shop, ...) ist intern fertig gebaut und läuft
// im "Demo/Manuell"-Modus. Trägt der Betrieb unter /dashboard/schnittstellen
// einen echten Anbieter + Zugangsdaten ein und schaltet ihn aktiv, liefert
// istLive() true — dann nutzt das Modul den echten Anbieter. Kein Code-Umbau.
//
// Diese Datei enthält KEINE Supabase-Aufrufe und KEINE React-Hooks — sie ist
// von Client-Komponenten UND von Server-Routen importierbar.
// ============================================================

export type IntegrationTyp = 'tse' | 'shop' | 'datev' | 'zahlung';

export type KonnektorFeld = { key: string; label: string; typ?: 'text' | 'password' | 'url'; hinweis?: string };
export type KonnektorAnbieter = {
  key: string;
  name: string;
  /** true = Demo/Manuell (kein echter externer Dienst, immer verfügbar). */
  demo?: boolean;
  felder: KonnektorFeld[];
  hinweis?: string;
};
export type KonnektorBereich = {
  typ: IntegrationTyp;
  name: string;
  icon: string;
  beschreibung: string;
  anbieter: KonnektorAnbieter[];
};

// --- Der Katalog. Neue Anbieter hier ergänzen — Seite + Module ziehen automatisch nach. ---
export const KONNEKTOR_KATALOG: KonnektorBereich[] = [
  {
    typ: 'tse',
    name: 'Kasse / TSE',
    icon: '🧾',
    beschreibung: 'Technische Sicherheitseinrichtung (TSE) für die Kasse. Gesetzlich (KassenSichV) muss die TSE von einem zertifizierten Anbieter kommen — die Kasse selbst läuft in ARGONAUT.',
    anbieter: [
      { key: 'demo', name: 'Demo-Modus (ohne echte TSE)', demo: true, felder: [], hinweis: 'Zum Testen & Vorführen. Belege werden mit einer Demo-Signatur versehen — nicht für den echten Geschäftsbetrieb.' },
      { key: 'fiskaly', name: 'fiskaly (Cloud-TSE)', felder: [
        { key: 'api_key', label: 'API Key', typ: 'password' },
        { key: 'api_secret', label: 'API Secret', typ: 'password' },
        { key: 'tss_id', label: 'TSS-ID', typ: 'text', hinweis: 'ID der angelegten Technical Security System' },
      ], hinweis: 'Cloud-TSE. Zugangsdaten aus dem fiskaly-Dashboard.' },
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
    typ: 'shop',
    name: 'Shop / Marktplatz',
    icon: '🛒',
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
    typ: 'datev',
    name: 'DATEV / Steuerberater',
    icon: '📊',
    beschreibung: 'Betriebs- und beraterindividuelle Werte für den DATEV-Buchungsstapel-Export (Kontenrahmen, Berater-/Mandantennummer). Die echte DATEV-Online-Übermittlung braucht ein Zertifikat und ist als Brücke vorgesehen.',
    anbieter: [
      { key: 'manuell', name: 'Nur Export (ohne Übermittlung)', demo: true, felder: [
        { key: 'erloeskonto', label: 'Erlöskonto 19 %', typ: 'text', hinweis: 'z. B. 8400 (SKR03) / 4400 (SKR04)' },
        { key: 'erloeskonto_7', label: 'Erlöskonto 7 %', typ: 'text', hinweis: 'z. B. 8300 / 4300' },
        { key: 'debitor_sammel', label: 'Debitor-Sammelkonto', typ: 'text', hinweis: 'z. B. 10000' },
        { key: 'berater_nr', label: 'Beraternummer', typ: 'text' },
        { key: 'mandant_nr', label: 'Mandantennummer', typ: 'text' },
      ], hinweis: 'Erzeugt eine importierbare Buchungsstapel-CSV für Ihren Steuerberater — ohne automatische Übermittlung.' },
      { key: 'datev-connect', name: 'DATEVconnect / Online (Brücke)', felder: [
        { key: 'client_id', label: 'Client-ID', typ: 'text' },
        { key: 'client_secret', label: 'Client-Secret', typ: 'password' },
        { key: 'berater_nr', label: 'Beraternummer', typ: 'text' },
        { key: 'mandant_nr', label: 'Mandantennummer', typ: 'text' },
      ] },
    ],
  },
  {
    typ: 'zahlung',
    name: 'Zahlungsanbieter / Bezahllink',
    icon: '💳',
    beschreibung: 'Ihr eigener Zahlungsanbieter für einen „Jetzt online bezahlen"-Knopf auf Rechnungen. ARGONAUT wickelt KEIN Geld ab — Sie verbinden Ihren eigenen Account, das Geld fließt direkt zu Ihnen. Wählen Sie frei, was Sie ohnehin schon nutzen. Ohne Eintrag steht auf der Rechnung weiterhin Ihre Bankverbindung + der GiroCode zum Scannen.',
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
];

export function bereich(typ: IntegrationTyp): KonnektorBereich | undefined {
  return KONNEKTOR_KATALOG.find((b) => b.typ === typ);
}
export function anbieterVon(typ: IntegrationTyp, key: string): KonnektorAnbieter | undefined {
  return bereich(typ)?.anbieter.find((a) => a.key === key);
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
