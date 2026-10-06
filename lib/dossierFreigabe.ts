// ============================================================================
// ARGONAUT OS · lib/dossierFreigabe.ts — Paket 221 (06.10.2026)
// Welche Branchen-Dossiers dürfen raus — und welche sind „in rechtlicher
// Vorbereitung"?
//
// Martins Entscheidung (06.10.2026):
//  🔴 Ganze Bereiche warten auf den Anwalt: Gesundheit (Art. 9 DSGVO, HWG),
//     Recht/Steuern/Finanzen (§ 203 StGB, RDG/StBerG) und Tiere (Behandlungsdaten).
//  🟡 In vier Bereichen sind nur die Betriebe frei, die OHNE Ladenkasse (TSE)
//     und OHNE Webshop arbeiten. Alle übrigen dort warten, bis Kasse/Shop
//     freigeschaltet sind (lib/startSperre.ts, Kasse ohne TSE nur Demo).
//
// Sicherheitsrichtung: In den 🟡-Bereichen ist eine Branche nur frei, wenn sie
// ausdrücklich unten steht. Neue oder unbekannte Branchen dort sind gesperrt.
//
// Freischalten: Bereich aus GESPERRTE_BEREICHE entfernen bzw. Slug in
// FREI_IN_TEILBEREICH ergänzen, pushen. Keine Imports — node-testbar.
// ============================================================================

export const IN_VORBEREITUNG_TEXT = 'In rechtlicher Vorbereitung';

/** 🔴 Ganze Bereiche mit Grund. */
export const GESPERRTE_BEREICHE: Readonly<Record<string, string>> = Object.freeze({
  'Gesundheit & Wellness': 'Gesundheitsdaten und Heilmittelwerbung: Das Dossier erscheint nach der rechtlichen Prüfung.',
  'Recht, Steuern & Finanzen': 'Berufsgeheimnis und Abgrenzung zur Rechts- und Steuerberatung: Das Dossier erscheint nach der rechtlichen Prüfung.',
  'Tiere': 'Behandlungs- und Halterdaten: Das Dossier erscheint nach der rechtlichen Prüfung.',
});

/** 🟡 Bereiche, in denen nur ausdrücklich genannte Branchen frei sind. */
export const FREI_IN_TEILBEREICH: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'Handel & E-Commerce': [
    'grosshandel', 'kuechenstudios', 'badstudios', 'baustoffhandel', 'fliesen-sanitaer-heizungshandel',
    'landmaschinenhandel', 'baumaschinenhandel', 'kaminofen-ofenstudios', 'pool-schwimmbadfachhandel',
  ],
  'Gastronomie, Hotellerie & Tourismus': [
    'hotels', 'catering', 'reisebueros', 'eventmanagement', 'ferienwohnung-ferienhaus', 'hostel-jugendherberge',
    'boardinghouse-serviced-apartments', 'campingplatz-wohnmobilstellplatz', 'ferienpark-feriendorf', 'tagungs-konferenzhotel',
    'reiseveranstalter-pauschalreisen', 'bus-gruppenreiseunternehmen', 'stadtfuehrung-gaestefuehrer', 'kochschule-erlebniskueche',
  ],
  'Sport, Beauty & Lifestyle': [
    'fitnessstudios', 'sportvereine', 'yogastudios', 'pilatesstudios', 'kampfsportschulen', 'tanzschulen',
    'ems-personal-training', 'crossfit-box-functional-fitness', 'bootcamp-outdoor-fitness', 'reitschule-reitstall',
    'tauchschule-tauchcenter', 'schwimmschule-aquafitness', 'golfclub-golfschule', 'tennis-racketsportcenter',
    'kletter-alpinschule', 'ski-snowboardschule', 'schuetzen-schiesssportverein', 'kosmetikschule-beauty-akademie',
  ],
  'Lebensmittel & Nahversorgung': [
    'partyservice', 'sektkellereien', 'nudel-pastamanufakturen', 'oelmuehlen-speiseoelmanufakturen',
    'senf-essigmanufakturen', 'marmeladen-fermentationsmanufakturen', 'vegane-pflanzliche-manufakturen', 'suppen-feinkostmanufakturen',
  ],
});

const GRUND_TEILBEREICH = 'Ladenkasse oder Webshop werden gerade rechtlich und technisch freigeschaltet: Das Dossier erscheint, sobald beides bereit ist.';

export type DossierRecht = { frei: true } | { frei: false; grund: string; art: 'bereich' | 'teilbereich' };

/** Darf das Dossier dieser Branche heraus? `kategorie` exakt wie im Katalog. */
export function dossierRecht(b: { slug: string; kategorie: string }): DossierRecht {
  const kat = String(b?.kategorie ?? '');
  const slug = String(b?.slug ?? '');
  if (kat in GESPERRTE_BEREICHE) return { frei: false, grund: GESPERRTE_BEREICHE[kat], art: 'bereich' };
  const frei = FREI_IN_TEILBEREICH[kat];
  if (frei && !frei.includes(slug)) return { frei: false, grund: GRUND_TEILBEREICH, art: 'teilbereich' };
  return { frei: true };
}
