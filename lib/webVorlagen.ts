// ============================================================
// ARGONAUT OS · W4-Look · webVorlagen.ts — „So könnte Ihre Seite aussehen"
//
// Baut aus dem CI-Speicher (web_ci) je nach ZWECK eine fertige Baustein-Liste
// mit „Sog"-Bausteinen (Hero, Zahlen-Band, Leistungen, Über uns, Bewertungen,
// FAQ, Kontakt, CTA). Wo der Kunde noch nichts hinterlegt hat, stehen klar
// erkennbare Empfehlungs-Platzhalter — genau wie bei den Profi-Baukästen.
//
// Grundlage für alle drei Bau-Wege (KI komplett · KI + Editor · selbst).
// ============================================================

import type { Block, CiWeb } from './webBloecke';

export const ZWECKE: { key: string; label: string; beschreibung: string }[] = [
  { key: 'visitenkarte', label: 'Visitenkarte', beschreibung: 'Schlichte Präsenz — wer Sie sind und wie man Sie erreicht.' },
  { key: 'webseite', label: 'Voll-Webseite', beschreibung: 'Mehrere Bereiche: Zahlen, Leistungen, Über uns, Bewertungen, FAQ, Kontakt.' },
  { key: 'funnel', label: 'Verkaufsseite (Funnel)', beschreibung: 'Ein Ziel: Anfrage oder Verkauf, alles zeigt auf einen Knopf.' },
  { key: 'produkt', label: 'Produkt- / Aktionsseite', beschreibung: 'Ein Angebot im Rampenlicht, extra für eine Kampagne.' },
  { key: 'event', label: 'Event / Anmeldung', beschreibung: 'Termin, Webinar oder Tag der offenen Tür.' },
];

function z(v?: string | null): string { return (v ?? '').trim(); }

// Leistungs-Kacheln aus den Kernsätzen des CI-Speichers (eine je Zeile).
function leistungenPunkte(ci: CiWeb): { titel: string; text: string }[] {
  const zeilen = z(ci.kernsaetze).split('\n').map((s) => s.trim()).filter(Boolean);
  if (zeilen.length > 0) {
    return zeilen.slice(0, 6).map((zeile) => {
      const [kopf, ...rest] = zeile.split(/[:–-]\s*/);
      return { titel: kopf.trim(), text: rest.join(' ').trim() || 'Kurz beschreiben, was Sie hier besonders gut können.' };
    });
  }
  return [
    { titel: 'Qualität', text: 'Saubere Arbeit, auf die Sie sich verlassen können.' },
    { titel: 'Zuverlässig', text: 'Termine werden eingehalten, Absprachen gelten.' },
    { titel: 'Persönlich', text: 'Ein fester Ansprechpartner für Ihr Anliegen.' },
  ];
}

// Empfehlungs-Platzhalter (der Kunde ersetzt sie mit echten Werten).
function stdZahlen(): { wert: string; label: string }[] {
  return [
    { wert: '10+', label: 'Jahre Erfahrung' },
    { wert: '500+', label: 'Zufriedene Kunden' },
    { wert: '100%', label: 'Voller Einsatz' },
    { wert: '24 h', label: 'Schnelle Rückmeldung' },
  ];
}
function stdStimmen(): { text: string; name: string; rolle: string }[] {
  return [
    { text: 'Schnell, zuverlässig und richtig gute Arbeit — jederzeit wieder.', name: 'Zufriedener Kunde', rolle: 'Beispiel-Bewertung' },
    { text: 'Von der Anfrage bis zur Umsetzung lief alles reibungslos.', name: 'Stammkundin', rolle: 'Beispiel-Bewertung' },
    { text: 'Fairer Preis, ehrliche Beratung, top Ergebnis.', name: 'Neukunde', rolle: 'Beispiel-Bewertung' },
  ];
}
function stdFragen(ci: CiWeb): { frage: string; antwort: string }[] {
  const firma = z(ci.firma) || 'Wir';
  return [
    { frage: 'Wie bekomme ich ein Angebot?', antwort: 'Schreiben Sie uns über das Kontaktformular oder rufen Sie an — Sie erhalten schnell eine unverbindliche Rückmeldung.' },
    { frage: 'In welchem Gebiet sind Sie tätig?', antwort: firma + ' ist in der Region und Umgebung für Sie da. Fragen Sie einfach nach Ihrem Ort.' },
    { frage: 'Was kostet die Leistung?', antwort: 'Das hängt vom Umfang ab. Sie erhalten vorab einen transparenten, nachvollziehbaren Preis.' },
  ];
}

// --- Der Generator ----------------------------------------------------------
export function baueVorlage(ci: CiWeb, zweck: string): { titel: string; zweck: string; bloecke: Block[] } {
  const firma = z(ci.firma) || 'Ihr Firmenname';
  const slogan = z(ci.slogan) || 'Ihr Claim erscheint hier';
  const ueberText = z(ci.ueber_uns) || 'Erzählen Sie hier in zwei, drei Sätzen, wer Sie sind, wofür Sie stehen und was Ihre Kunden von Ihnen bekommen.';

  const hero = (eyebrow: string, knopf: string): Block => ({ typ: 'hero', eyebrow, titel: firma, unterzeile: slogan, knopf, bild: '' });
  const stats = (titel?: string): Block => ({ typ: 'stats', titel, zahlen: stdZahlen() });
  const leistungen = (eyebrow: string, titel: string): Block => ({ typ: 'leistungen', eyebrow, titel, punkte: leistungenPunkte(ci) });
  const ueber = (titel: string): Block => ({ typ: 'ueber', eyebrow: 'Über uns', titel, text: ueberText });
  const galerie = (titel: string, anzahl: number): Block => ({ typ: 'galerie', titel, anzahl });
  const testimonials = (titel: string): Block => ({ typ: 'testimonials', eyebrow: 'Bewertungen', titel, stimmen: stdStimmen() });
  const faq = (titel: string): Block => ({ typ: 'faq', eyebrow: 'FAQ', titel, fragen: stdFragen(ci) });
  const kontakt = (titel: string): Block => ({ typ: 'kontakt', titel, text: 'Schreiben Sie uns — wir melden uns schnell zurück.' });
  const cta = (titel: string, knopf: string): Block => ({ typ: 'cta', titel, knopf });

  let bloecke: Block[];
  switch (zweck) {
    case 'visitenkarte':
      bloecke = [hero('Willkommen', 'Kontakt aufnehmen'), ueber('Über uns'), kontakt('So erreichen Sie uns')];
      break;
    case 'funnel':
      bloecke = [hero('Ihr Vorteil', 'Jetzt anfragen'), stats(), leistungen('Warum wir', 'Ihre Vorteile'), testimonials('Das sagen Kunden'), faq('Häufige Fragen'), cta('Bereit? Wir freuen uns auf Ihre Anfrage.', 'Jetzt anfragen'), kontakt('Kontakt')];
      break;
    case 'produkt':
      bloecke = [hero('Neu', 'Mehr erfahren'), stats('Auf einen Blick'), leistungen('Highlights', 'Das steckt drin'), galerie('Eindrücke', 3), testimonials('Kundenstimmen'), cta('Sichern Sie sich Ihr Angebot.', 'Jetzt sichern'), kontakt('Kontakt')];
      break;
    case 'event':
      bloecke = [hero('Einladung', 'Jetzt anmelden'), ueber('Worum geht es?'), stats('Fakten zum Termin'), faq('Häufige Fragen'), cta('Plätze sind begrenzt.', 'Jetzt anmelden'), kontakt('Fragen? Kontakt')];
      break;
    case 'webseite':
    default:
      bloecke = [hero('Willkommen', 'Jetzt anfragen'), stats(), leistungen('Leistungen', 'Unsere Leistungen'), ueber('Über uns'), testimonials('Das sagen unsere Kunden'), galerie('Einblicke', 3), faq('Häufige Fragen'), kontakt('Kontakt')];
      break;
  }

  return { titel: firma, zweck, bloecke };
}
