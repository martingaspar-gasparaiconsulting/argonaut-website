// app/vorschau/_lib/branchen-web.ts
// Helfer für die NEUEN Branchen-Seiten (/vorschau/branchen …).
// Liest die bestehende Branchen-Datenbank (lib/branchen.ts) und legt eine
// WEBSITE-SCHICHT darüber: neue 19-Kategorien-Struktur (REMAP) + Ausschlüsse.
// lib/branchen.ts (vom Kundensystem genutzt) bleibt unangetastet.

import { getAllBranchen, getBrancheBySlug, type Branche } from '@/lib/branchen'

// --- Ausschluss: von Anfang an raus (reguliert) + medizinisch/heilkundlich ---
export const AUSSCHLUSS = new Set<string>([
  // Original (klar reguliert/heikel)
  'Banken & Sparkassen',
  'Ärzte & Praxen', 'Zahnärzte', 'Krankenhäuser & Kliniken', 'Apotheken', 'Pflegedienste',
  'Medizinische Labore', 'Hebammen', 'Psychologische Beratung', 'Suchtberatung', 'Hospize & Palliativpflege',
  'Medizintechnik', 'Pharmazeutischer Großhandel', 'Pharmaindustrie', 'Biotechnologie', 'Chemie & Pharma',
  'Jagdbedarf & Waffen', 'Verteidigung & Sicherheit',
  // Neu entfernt: Humanmediziner / Heilmittel / Heilkunde
  'Physiotherapie', 'Ergotherapie', 'Logopädie', 'Osteopathie & Chiropraktik', 'Podologie & Fußpflege',
  // Tierarzt = approbationspflichtig
  'Tierärzte',
])

// --- Neue Kategorie-Reihenfolge (19) ---
export const KATEGORIE_ORDER = [
  'Handwerk & Bau',
  'Industrie & Produktion',
  'Handel & E-Commerce',
  'Fahrzeuge & Mobilität',
  'Gastronomie, Hotellerie & Tourismus',
  'Lebensmittel & Nahversorgung',
  'Logistik & Transport',
  'IT & Technologie',
  'Energie & Umwelt',
  'Immobilien & Verwaltung',
  'Marketing, Medien & Kreativ',
  'Recht, Steuern & Finanzen',
  'Bildung & Wissenschaft',
  'Gesundheit & Wellness',
  'Sport, Beauty & Lifestyle',
  'Tiere',
  'Landwirtschaft, Garten & Forst',
  'Dienstleistungen',
  'Kultur, Soziales & Öffentliches',
]

// --- REMAP: bestehende Branche -> neue Website-Kategorie ---
export const REMAP: Record<string, string> = {
  'Elektriker & Elektrobetriebe': 'Handwerk & Bau',
  'Sanitär & Heizung': 'Handwerk & Bau',
  'Maler & Lackierer': 'Handwerk & Bau',
  'Schreiner & Tischler': 'Handwerk & Bau',
  'Bauunternehmen': 'Handwerk & Bau',
  'Architekten': 'Handwerk & Bau',
  'Ingenieurbüros': 'Handwerk & Bau',
  'Dachdecker': 'Handwerk & Bau',
  'Bodenleger & Raumausstatter': 'Handwerk & Bau',
  'Kaminkehrer & Schornsteinfeger': 'Handwerk & Bau',
  'Glaserei': 'Handwerk & Bau',
  'Schlosserei': 'Handwerk & Bau',
  'Schweißerei': 'Handwerk & Bau',
  'Haustechnik & Gebäudeautomation': 'Handwerk & Bau',
  'Rollladen & Sonnenschutz': 'Handwerk & Bau',
  'Trockenbau & Innenausbau': 'Handwerk & Bau',
  'Estrich & Fliesen': 'Handwerk & Bau',
  'Gerüstbau': 'Handwerk & Bau',
  'Baggerbetriebe & Erdbau': 'Handwerk & Bau',
  'Kälte- & Klimaanlagenbau': 'Handwerk & Bau',
  'Parkettleger': 'Handwerk & Bau',
  'Zaunbau': 'Handwerk & Bau',
  'Pflasterbau': 'Handwerk & Bau',
  'Schwimmbadtechnik': 'Handwerk & Bau',
  'Zahntechniker': 'Handwerk & Bau',
  'Orthopädie-Schuhmacher': 'Handwerk & Bau',
  'Industrie & Produktion': 'Industrie & Produktion',
  'Maschinenbau': 'Industrie & Produktion',
  'Lebensmittelproduktion': 'Industrie & Produktion',
  'Textil & Mode': 'Industrie & Produktion',
  'Möbel & Einrichtung': 'Industrie & Produktion',
  'Elektronik & Technologie': 'Industrie & Produktion',
  'Automobilzulieferer': 'Industrie & Produktion',
  'Luft- & Raumfahrt': 'Industrie & Produktion',
  'Bergbau & Rohstoffe': 'Industrie & Produktion',
  'Druckereien': 'Industrie & Produktion',
  'Einzelhandel': 'Handel & E-Commerce',
  'Großhandel': 'Handel & E-Commerce',
  'E-Commerce': 'Handel & E-Commerce',
  'Blumenhandel & Floristik': 'Handel & E-Commerce',
  'Buchhandlungen': 'Handel & E-Commerce',
  'Sportartikelhandel': 'Handel & E-Commerce',
  'Küchenstudios': 'Handel & E-Commerce',
  'Musikinstrumentenhandel': 'Handel & E-Commerce',
  'Antiquitätenhandel': 'Handel & E-Commerce',
  'Second-Hand & Vintage': 'Handel & E-Commerce',
  'Schreibwarenhandel': 'Handel & E-Commerce',
  'Haushaltswaren & Geschenkartikel': 'Handel & E-Commerce',
  'Babyausstattung & Kindermode': 'Handel & E-Commerce',
  'Angelbedarf': 'Handel & E-Commerce',
  'Badstudios': 'Handel & E-Commerce',
  'Uhrmacher & Juweliere': 'Handel & E-Commerce',
  'KFZ-Werkstätten': 'Fahrzeuge & Mobilität',
  'KFZ-Handel': 'Fahrzeuge & Mobilität',
  'Autowäsche & Autopflege': 'Fahrzeuge & Mobilität',
  'Reifenhandel': 'Fahrzeuge & Mobilität',
  'Motorradwerkstatt': 'Fahrzeuge & Mobilität',
  'Fahrradhandel & Werkstatt': 'Fahrzeuge & Mobilität',
  'Caravan & Wohnmobil': 'Fahrzeuge & Mobilität',
  'Boots- & Yachthandel': 'Fahrzeuge & Mobilität',
  'Gastronomie & Restaurants': 'Gastronomie, Hotellerie & Tourismus',
  'Hotels & Beherbergung': 'Gastronomie, Hotellerie & Tourismus',
  'Catering & Eventgastronomie': 'Gastronomie, Hotellerie & Tourismus',
  'Reisebüros': 'Gastronomie, Hotellerie & Tourismus',
  'Eventmanagement': 'Gastronomie, Hotellerie & Tourismus',
  'Freizeit & Unterhaltung': 'Gastronomie, Hotellerie & Tourismus',
  'Bäckereien': 'Lebensmittel & Nahversorgung',
  'Metzgereien': 'Lebensmittel & Nahversorgung',
  'Weingüter': 'Lebensmittel & Nahversorgung',
  'Brennereien & Destillerien': 'Lebensmittel & Nahversorgung',
  'Eisdielen & Cafés': 'Lebensmittel & Nahversorgung',
  'Delikatessen & Feinkost': 'Lebensmittel & Nahversorgung',
  'Bio- & Naturkostläden': 'Lebensmittel & Nahversorgung',
  'Getränkehandel': 'Lebensmittel & Nahversorgung',
  'Fischhändler': 'Lebensmittel & Nahversorgung',
  'Süßwarenhandel': 'Lebensmittel & Nahversorgung',
  'Keltereien & Mostereien': 'Lebensmittel & Nahversorgung',
  'Logistik & Spedition': 'Logistik & Transport',
  'Transport & Fuhrpark': 'Logistik & Transport',
  'Post & Kurierdienste': 'Logistik & Transport',
  'Fahrdienste & Krankenfahrten': 'Logistik & Transport',
  'IT-Dienstleister': 'IT & Technologie',
  'Softwareentwicklung': 'IT & Technologie',
  'Telekommunikation': 'IT & Technologie',
  'Startups & Scale-ups': 'IT & Technologie',
  'IT-Sicherheit für KMU': 'IT & Technologie',
  'Kassensysteme & POS': 'IT & Technologie',
  'Industrieautomation': 'IT & Technologie',
  'Messtechnik & Prüfgeräte': 'IT & Technologie',
  'Erneuerbare Energien': 'Energie & Umwelt',
  'Wasserwirtschaft & Umwelt': 'Energie & Umwelt',
  'Recycling & Entsorgung': 'Energie & Umwelt',
  'Nachhaltigkeit & ESG': 'Energie & Umwelt',
  'Immobilienmakler': 'Immobilien & Verwaltung',
  'Hausverwaltungen': 'Immobilien & Verwaltung',
  'Franchise-Systeme': 'Immobilien & Verwaltung',
  'Immobilienentwicklung': 'Immobilien & Verwaltung',
  'Marketing-Agenturen': 'Marketing, Medien & Kreativ',
  'Werbeagenturen': 'Marketing, Medien & Kreativ',
  'PR-Agenturen': 'Marketing, Medien & Kreativ',
  'Unternehmenskommunikation': 'Marketing, Medien & Kreativ',
  'Verlage & Medien': 'Marketing, Medien & Kreativ',
  'Fotografen & Videografen': 'Marketing, Medien & Kreativ',
  'Film & TV-Produktion': 'Marketing, Medien & Kreativ',
  'Musik & Entertainment': 'Marketing, Medien & Kreativ',
  'Spieleentwicklung & Gaming': 'Marketing, Medien & Kreativ',
  'Künstler & Kreative': 'Marketing, Medien & Kreativ',
  'Messe & Ausstellungen': 'Marketing, Medien & Kreativ',
  'Musikproduktion': 'Marketing, Medien & Kreativ',
  'Steuerberatung': 'Recht, Steuern & Finanzen',
  'Steuerberatungsgesellschaften': 'Recht, Steuern & Finanzen',
  'Rechtsanwälte': 'Recht, Steuern & Finanzen',
  'Notare': 'Recht, Steuern & Finanzen',
  'Finanzberater': 'Recht, Steuern & Finanzen',
  'Versicherungsmakler': 'Recht, Steuern & Finanzen',
  'Unternehmensberater': 'Recht, Steuern & Finanzen',
  'Digitalberatung': 'Recht, Steuern & Finanzen',
  'Lohnbüros': 'Recht, Steuern & Finanzen',
  'Buchführungsbüros': 'Recht, Steuern & Finanzen',
  'Finanzierungsberatung': 'Recht, Steuern & Finanzen',
  'Erbschaftsberatung': 'Recht, Steuern & Finanzen',
  'Insolvenzberatung': 'Recht, Steuern & Finanzen',
  'Bildung & Weiterbildung': 'Bildung & Wissenschaft',
  'Fahrschulen': 'Bildung & Wissenschaft',
  'Schulen & Gymnasien': 'Bildung & Wissenschaft',
  'Universitäten & Hochschulen': 'Bildung & Wissenschaft',
  'Nachhilfeinstitute': 'Bildung & Wissenschaft',
  'Musikschulen': 'Bildung & Wissenschaft',
  'Sprachschulen': 'Bildung & Wissenschaft',
  'Waldkindergärten': 'Bildung & Wissenschaft',
  'Kunstschulen': 'Bildung & Wissenschaft',
  'Kinderbetreuung & Kitas': 'Bildung & Wissenschaft',
  'Optiker': 'Gesundheit & Wellness',
  'Hörgeräteakustiker': 'Gesundheit & Wellness',
  'Sanitätshaus': 'Gesundheit & Wellness',
  'Massagepraxen': 'Gesundheit & Wellness',
  'Ernährungsberatung': 'Gesundheit & Wellness',
  'Kosmetik & Beauty': 'Sport, Beauty & Lifestyle',
  'Friseure & Salons': 'Sport, Beauty & Lifestyle',
  'Tattoo Studios': 'Sport, Beauty & Lifestyle',
  'Fitnessstudios & Sport': 'Sport, Beauty & Lifestyle',
  'Sportvereine': 'Sport, Beauty & Lifestyle',
  'Nähateliers & Schneider': 'Sport, Beauty & Lifestyle',
  'Wäschereien & Reinigungen': 'Sport, Beauty & Lifestyle',
  'Brautmoden': 'Sport, Beauty & Lifestyle',
  'Yogastudios': 'Sport, Beauty & Lifestyle',
  'Pilatesstudios': 'Sport, Beauty & Lifestyle',
  'Kampfsportschulen': 'Sport, Beauty & Lifestyle',
  'Tanzschulen': 'Sport, Beauty & Lifestyle',
  'Sonnenstudios': 'Sport, Beauty & Lifestyle',
  'Piercing-Studios': 'Sport, Beauty & Lifestyle',
  'Permanent-Makeup Studios': 'Sport, Beauty & Lifestyle',
  'Tierbetreuung & Hundesalon': 'Tiere',
  'Tierhandlungen': 'Tiere',
  'Reiterhöfe': 'Tiere',
  'Imkereien': 'Tiere',
  'Reittherapie': 'Tiere',
  'Gärtnereien & Baumschulen': 'Landwirtschaft, Garten & Forst',
  'Pilzzucht': 'Landwirtschaft, Garten & Forst',
  'Landwirtschaft & Agrar': 'Landwirtschaft, Garten & Forst',
  'Gartenbau & Landschaftsbau': 'Landwirtschaft, Garten & Forst',
  'Forstwirtschaft & Holz': 'Landwirtschaft, Garten & Forst',
  'Gartengestaltung': 'Landwirtschaft, Garten & Forst',
  'Reinigungsunternehmen': 'Dienstleistungen',
  'Sicherheitsdienste': 'Dienstleistungen',
  'Personalvermittlung': 'Dienstleistungen',
  'Hausmeisterservice': 'Dienstleistungen',
  'Schlüsseldienst': 'Dienstleistungen',
  'Umzugsunternehmen': 'Dienstleistungen',
  'Bestattungsunternehmen': 'Dienstleistungen',
  'Entrümpelungen': 'Dienstleistungen',
  'Schädlingsbekämpfung': 'Dienstleistungen',
  'Archiv & Dokumentenmanagement': 'Dienstleistungen',
  'Wohlfahrtsverbände & NGOs': 'Kultur, Soziales & Öffentliches',
  'Verbände & Kammern': 'Kultur, Soziales & Öffentliches',
  'Berufsverbände & Innungen': 'Kultur, Soziales & Öffentliches',
  'Kirchen & Religionsgemeinschaften': 'Kultur, Soziales & Öffentliches',
  'Museen & Kultureinrichtungen': 'Kultur, Soziales & Öffentliches',
  'Bibliotheken & Archive': 'Kultur, Soziales & Öffentliches',
  'Sozialpädagogische Einrichtungen': 'Kultur, Soziales & Öffentliches',
  'Stadtverwaltungen & Behörden': 'Kultur, Soziales & Öffentliches',
}

// Website-Kategorie einer Branche (REMAP, sonst Original-Kategorie).
export function websiteKategorieOf(b: Branche): string {
  return REMAP[b.name] ?? b.kategorie
}

export function websiteBranchen(): Branche[] {
  return getAllBranchen().filter((b) => !AUSSCHLUSS.has(b.name))
}

export function websiteBrancheBySlug(slug: string): Branche | undefined {
  const b = getBrancheBySlug(slug)
  if (!b || AUSSCHLUSS.has(b.name)) return undefined
  return b
}

export function websiteKategorien(): { kategorie: string; branchen: Branche[] }[] {
  const map = new Map<string, Branche[]>()
  for (const b of websiteBranchen()) {
    const k = websiteKategorieOf(b)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(b)
  }
  const known = KATEGORIE_ORDER.filter((k) => map.has(k)).map((k) => ({ kategorie: k, branchen: map.get(k)! }))
  const rest = [...map.keys()].filter((k) => !KATEGORIE_ORDER.includes(k)).map((k) => ({ kategorie: k, branchen: map.get(k)! }))
  return [...known, ...rest]
}

export type { Branche }
