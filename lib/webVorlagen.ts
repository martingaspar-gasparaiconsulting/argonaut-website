// ============================================================
// ARGONAUT OS · W3 · webVorlagen.ts — „So könnte Ihre Seite aussehen"
//
// Baut aus dem CI-Speicher (web_ci) je nach ZWECK eine fertige Baustein-Liste.
// Das ist die Grundlage für alle drei Bau-Wege:
//   • KI komplett   — nimmt diese Vorlage und verfeinert die Texte
//   • KI + Editor   — Vorlage als Startpunkt, Kunde justiert nach
//   • selbst        — Kunde startet leer und zieht Bausteine aus dem Katalog
//
// Reine Funktion, keine Abhängigkeiten außer den Baustein-Typen.
// ============================================================

import type { Block, CiWeb } from './webBloecke';

export const ZWECKE: { key: string; label: string; beschreibung: string }[] = [
  { key: 'visitenkarte', label: 'Visitenkarte', beschreibung: 'Schlichte Präsenz — wer Sie sind und wie man Sie erreicht.' },
  { key: 'webseite', label: 'Voll-Webseite', beschreibung: 'Mehrere Bereiche: Leistungen, Über uns, Galerie, Kontakt.' },
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
      return { titel: kopf.trim(), text: rest.join(' ').trim() };
    });
  }
  // Kein Kernsatz hinterlegt → sinnvolle Platzhalter (der Kunde ersetzt sie).
  return [
    { titel: 'Qualität', text: 'Saubere Arbeit, auf die Sie sich verlassen können.' },
    { titel: 'Zuverlässig', text: 'Termine werden eingehalten, Absprachen gelten.' },
    { titel: 'Persönlich', text: 'Ein fester Ansprechpartner für Ihr Anliegen.' },
  ];
}

// --- Der Generator ----------------------------------------------------------
export function baueVorlage(ci: CiWeb, zweck: string): { titel: string; zweck: string; bloecke: Block[] } {
  const firma = z(ci.firma) || 'Ihr Firmenname';
  const slogan = z(ci.slogan) || 'Ihr Claim erscheint hier';
  const ueberText = z(ci.ueber_uns) || 'Erzählen Sie hier in zwei, drei Sätzen, wer Sie sind, wofür Sie stehen und was Ihre Kunden von Ihnen bekommen.';

  const hero = (knopf: string): Block => ({ typ: 'hero', titel: firma, unterzeile: slogan, knopf });
  const leistungen = (titel: string): Block => ({ typ: 'leistungen', titel, punkte: leistungenPunkte(ci) });
  const ueber = (titel: string): Block => ({ typ: 'ueber', titel, text: ueberText });
  const galerie = (titel: string, anzahl: number): Block => ({ typ: 'galerie', titel, anzahl });
  const kontakt = (titel: string): Block => ({ typ: 'kontakt', titel, text: 'Schreiben Sie uns — wir melden uns schnell zurück.' });
  const cta = (titel: string, knopf: string): Block => ({ typ: 'cta', titel, knopf });

  let bloecke: Block[];
  switch (zweck) {
    case 'visitenkarte':
      bloecke = [hero('Kontakt aufnehmen'), ueber('Über uns'), kontakt('So erreichen Sie uns')];
      break;
    case 'funnel':
      bloecke = [hero('Jetzt anfragen'), leistungen('Ihre Vorteile'), cta('Bereit? Wir freuen uns auf Ihre Anfrage.', 'Jetzt anfragen'), kontakt('Kontakt')];
      break;
    case 'produkt':
      bloecke = [hero('Mehr erfahren'), leistungen('Das steckt drin'), galerie('Eindrücke', 3), cta('Sichern Sie sich Ihr Angebot.', 'Jetzt sichern'), kontakt('Kontakt')];
      break;
    case 'event':
      bloecke = [hero('Jetzt anmelden'), ueber('Worum geht es?'), cta('Plätze sind begrenzt.', 'Jetzt anmelden'), kontakt('Fragen? Kontakt')];
      break;
    case 'webseite':
    default:
      bloecke = [hero('Jetzt anfragen'), leistungen('Unsere Leistungen'), ueber('Über uns'), galerie('Einblicke', 3), kontakt('Kontakt')];
      break;
  }

  return { titel: firma, zweck, bloecke };
}
