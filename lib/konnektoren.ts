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

export type IntegrationTyp = 'tse' | 'shop' | 'datev';

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
