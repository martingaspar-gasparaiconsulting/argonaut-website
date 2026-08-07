// ============================================================================
// ARGONAUT OS · lib/marketingLagebericht.ts
// Reine, node-getestete Logik für den KI-Lagebericht Marketing. Nimmt bereits
// aggregierte Zahlen (die Route liest sie RLS-scoped) und leitet daraus konkrete
// BEFUNDE mit Handlungsempfehlung ab — mechanisch, deterministisch, 0 €. Die KI
// formuliert daraus später nur den freundlichen Klartext (erfindet keine Zahlen).
// KEINE Netzwerk-/Supabase-/React-Aufrufe.
// ============================================================================

export type Schwere = 'gut' | 'hinweis' | 'warnung';

export type Befund = {
  schwere: Schwere;
  titel: string;
  text: string;        // konkrete Empfehlung in Klartext
  kennzahl?: string;   // kurze Zahl fürs Auge (optional)
};

export type LageInput = {
  ads: { ausgaben: number; umsatz: number; klicks: number; roas: number | null; kampagnen: number; aktiv: number };
  leads: { gesamt: number; neu: number; ausKampagne: number; dieseWoche: number; vorWoche: number; jeQuelle: Record<string, number> };
  kanaele: { newsletterAbos: number; socialAktiv: boolean; whatsappKontakte: number; adsAktiv: boolean };
  lp?: { titel: string; besser: 'A' | 'B'; vorsprungProzent: number } | null;
  web?: { besucherJeKanal: Array<{ kanal: string; besucher: number }>; topWochentag?: string | null } | null;
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Reihenfolge der Kanäle nach Lead-Zahl, größter zuerst.
function kanaeleNachLeads(jeQuelle: Record<string, number>): Array<{ quelle: string; anzahl: number }> {
  return Object.entries(jeQuelle || {})
    .map(([quelle, anzahl]) => ({ quelle, anzahl: Number(anzahl) || 0 }))
    .filter((x) => x.anzahl > 0)
    .sort((a, b) => b.anzahl - a.anzahl);
}

export function lagebericht(input: LageInput): Befund[] {
  const b: Befund[] = [];
  const { ads, leads, kanaele } = input;

  // 1) Werbe-Ertrag (ROAS) — nur wenn echtes Ad-Budget gemessen wurde.
  if (ads.ausgaben > 0) {
    const roas = ads.roas ?? (ads.ausgaben > 0 ? Math.round((ads.umsatz / ads.ausgaben) * 100) / 100 : 0);
    if (roas >= 3) {
      b.push({ schwere: 'gut', titel: 'Werbung zahlt sich aus', kennzahl: `ROAS ${roas}×`,
        text: `Jeder investierte Euro bringt aktuell ${roas} € Umsatz zurück (${eur(ads.ausgaben)} Ausgaben → ${eur(ads.umsatz)} Umsatz). Das Budget läuft effizient — hier kannst du bedenkenlos mehr investieren.` });
    } else if (roas >= 1) {
      b.push({ schwere: 'hinweis', titel: 'Werbung trägt sich, aber knapp', kennzahl: `ROAS ${roas}×`,
        text: `${eur(ads.ausgaben)} Ausgaben stehen ${eur(ads.umsatz)} Umsatz gegenüber (ROAS ${roas}×). Die schwächsten Kampagnen prüfen und Budget auf die besten umschichten.` });
    } else {
      b.push({ schwere: 'warnung', titel: 'Werbung kostet mehr, als sie bringt', kennzahl: `ROAS ${roas}×`,
        text: `Aktuell ${eur(ads.ausgaben)} Ausgaben, aber nur ${eur(ads.umsatz)} Umsatz. Schwache Kampagnen pausieren, Zielgruppe/Anzeige schärfen, bevor mehr Budget fließt.` });
    }
  }

  // 2) Offene Leads — unbearbeitete Anfragen sind verlorenes Geld.
  if (leads.neu > 0) {
    const anteil = pct(leads.neu, leads.gesamt);
    b.push({ schwere: leads.neu >= 5 || anteil >= 50 ? 'warnung' : 'hinweis',
      titel: 'Offene Anfragen warten', kennzahl: `${leads.neu} neu`,
      text: `${leads.neu} Anfrage(n) sind noch unbearbeitet${anteil ? ` (${anteil}% aller Leads)` : ''}. Jeder Tag ohne Reaktion senkt die Abschlusschance — zuerst diese nachfassen.` });
  }

  // 3) Lead-Trend Woche über Woche.
  if (leads.dieseWoche > 0 || leads.vorWoche > 0) {
    if (leads.dieseWoche >= leads.vorWoche && leads.vorWoche > 0) {
      const plus = pct(leads.dieseWoche - leads.vorWoche, leads.vorWoche);
      b.push({ schwere: 'gut', titel: 'Mehr Anfragen als letzte Woche', kennzahl: `${leads.dieseWoche} diese Woche`,
        text: `Diese Woche ${leads.dieseWoche} Anfragen gegenüber ${leads.vorWoche} in der Vorwoche${plus ? ` (+${plus}%)` : ''}. Was diese Woche anders lief, gezielt wiederholen.` });
    } else if (leads.dieseWoche < leads.vorWoche) {
      const minus = pct(leads.vorWoche - leads.dieseWoche, leads.vorWoche);
      b.push({ schwere: 'warnung', titel: 'Weniger Anfragen als letzte Woche', kennzahl: `${leads.dieseWoche} diese Woche`,
        text: `Diese Woche nur ${leads.dieseWoche} Anfragen gegenüber ${leads.vorWoche} in der Vorwoche (−${minus}%). Aktivität hochfahren: Post, Newsletter oder eine Kampagne starten.` });
    }
  }

  // 4) Bester Lead-Kanal (aus der Quelle) — wo lohnt sich der Einsatz?
  const kanaele2 = kanaeleNachLeads(leads.jeQuelle);
  if (kanaele2.length >= 2) {
    const top = kanaele2[0], schwach = kanaele2[kanaele2.length - 1];
    b.push({ schwere: 'hinweis', titel: `Bester Kanal: ${top.quelle}`, kennzahl: `${top.anzahl} Leads`,
      text: `„${top.quelle}" bringt mit ${top.anzahl} Leads am meisten, „${schwach.quelle}" nur ${schwach.anzahl}. Mehr Einsatz (und Budget) auf ${top.quelle} lenken, ${schwach.quelle} überdenken.` });
  } else if (kanaele2.length === 1) {
    b.push({ schwere: 'hinweis', titel: `Leads nur über ${kanaele2[0].quelle}`, kennzahl: `${kanaele2[0].anzahl} Leads`,
      text: `Alle Anfragen kommen aktuell über „${kanaele2[0].quelle}". Ein zweiter Kanal (Newsletter, Social, Empfehlung) macht dich unabhängiger von einer Quelle.` });
  }

  // 5) Kanal-Nutzung — wie viele der vier Marketing-Kanäle laufen überhaupt?
  const genutzt = [kanaele.newsletterAbos > 0, kanaele.socialAktiv, kanaele.whatsappKontakte > 0, kanaele.adsAktiv].filter(Boolean).length;
  if (genutzt <= 2) {
    const fehlen: string[] = [];
    if (kanaele.newsletterAbos <= 0) fehlen.push('Newsletter');
    if (!kanaele.socialAktiv) fehlen.push('Social');
    if (kanaele.whatsappKontakte <= 0) fehlen.push('WhatsApp');
    if (!kanaele.adsAktiv) fehlen.push('Ads');
    b.push({ schwere: 'hinweis', titel: 'Kanäle ausbauen', kennzahl: `${genutzt}/4 aktiv`,
      text: `Du nutzt erst ${genutzt} von 4 Marketing-Kanälen. Noch ungenutzt: ${fehlen.join(', ')}. Ein weiterer Kanal erschließt neue Interessenten ohne Mehrkosten in den bestehenden.` });
  }

  // 6) Attribution — kommen Leads „aus dem Nichts" oder aus messbaren Kampagnen?
  if (leads.gesamt >= 3) {
    const ohne = leads.gesamt - leads.ausKampagne;
    if (pct(ohne, leads.gesamt) >= 70) {
      b.push({ schwere: 'hinweis', titel: 'Die meisten Leads sind nicht zugeordnet', kennzahl: `${pct(ohne, leads.gesamt)}% ohne Kampagne`,
        text: `${ohne} von ${leads.gesamt} Leads sind keiner Kampagne zugeordnet — du siehst dadurch nicht, was sie ausgelöst hat. Kampagnen mit UTM/Quelle nutzen, dann wird sichtbar, welche Aktion wirkt.` });
    }
  }

  // 7) Landingpage-A/B-Sieger.
  if (input.lp && input.lp.vorsprungProzent >= 10) {
    b.push({ schwere: 'hinweis', titel: `Landingpage: Variante ${input.lp.besser} gewinnt`, kennzahl: `+${input.lp.vorsprungProzent}%`,
      text: `Bei „${input.lp.titel}" wandelt Variante ${input.lp.besser} um ${input.lp.vorsprungProzent}% besser um. Die schwächere Variante abschalten und ${input.lp.besser} als Standard fahren.` });
  }

  // 8) Bester Website-Kanal (Besucher) — ergänzend zur Lead-Quelle.
  if (input.web && input.web.besucherJeKanal.length >= 2) {
    const sortiert = [...input.web.besucherJeKanal].filter((k) => k.besucher > 0).sort((a, x) => x.besucher - a.besucher);
    if (sortiert.length >= 2) {
      b.push({ schwere: 'hinweis', titel: `Meiste Besucher über ${sortiert[0].kanal}`, kennzahl: `${sortiert[0].besucher} Besucher`,
        text: `Der Kanal „${sortiert[0].kanal}" bringt die meisten Website-Besucher. Prüfen, ob daraus auch Anfragen werden — sonst passt die Zielseite nicht zum Kanal.` });
    }
  }

  // 9) Newsletter-Liste als Basis-Asset.
  if (kanaele.newsletterAbos <= 0) {
    b.push({ schwere: 'hinweis', titel: 'Noch keine Newsletter-Liste', kennzahl: '0 Abonnenten',
      text: `Ein Newsletter ist der einzige Kanal, der dir gehört (keine Plattform dazwischen). Ein Anmeldefeld auf der Website + ein kleiner Anreiz starten den Aufbau.` });
  }

  return b;
}

// Kurz-Ampel fürs Cockpit: schlimmster Befund bestimmt die Farbe.
export function lageAmpel(befunde: Befund[]): Schwere {
  if (befunde.some((x) => x.schwere === 'warnung')) return 'warnung';
  if (befunde.some((x) => x.schwere === 'hinweis')) return 'hinweis';
  return 'gut';
}
