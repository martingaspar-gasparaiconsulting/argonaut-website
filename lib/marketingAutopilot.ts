// ============================================================================
// ARGONAUT OS · lib/marketingAutopilot.ts
// Der Marketing-Autopilot (Vorschlag-Variante): erkennt aus den aggregierten
// Zahlen konkrete Handlungen und legt sie als priorisierte VORSCHLÄGE hin —
// jede mit 1-Klick-Sprung an die richtige Stelle. Es passiert NICHTS von selbst;
// der Betrieb entscheidet. Mechanisch/deterministisch, 0 €. Keine Netzwerk-/
// Supabase-/React-Aufrufe. Node-testbar.
// ============================================================================

export type Prioritaet = 1 | 2 | 3; // 1 = dringend, 3 = Ausbau

export type Vorschlag = {
  prioritaet: Prioritaet;
  kategorie: string;      // z. B. 'Leads', 'Ads', 'Landingpage', 'Kanäle'
  titel: string;
  grund: string;          // warum — in Klartext
  aktionText: string;     // was der Knopf tut
  aktionHref: string;     // wohin der 1-Klick springt
};

export type AutopilotInput = {
  leads: { offen: number; offenAlt: number };   // offenAlt = status neu UND > 3 Tage
  ads: { ausgaben: number; roas: number | null };
  lp?: { titel: string; besser: 'A' | 'B' } | null;
  kanaele: {
    newsletterAbos: number; newsletterVersand: number;
    socialAktiv: boolean; socialGeplant: number;
    whatsappKontakte: number; adsAktiv: boolean;
  };
};

const HREF = {
  leads: '/dashboard/leads',
  ads: '/dashboard/marketing/ads',
  landingpages: '/dashboard/marketing/landingpages',
  newsletter: '/dashboard/marketing/newsletter',
  social: '/dashboard/marketing/social',
  whatsapp: '/dashboard/marketing/whatsapp',
};

export function autopilotVorschlaege(input: AutopilotInput): Vorschlag[] {
  const v: Vorschlag[] = [];
  const { leads, ads, kanaele } = input;

  // 1) Offene Anfragen nachfassen (dringend, wenn alt).
  if (leads.offenAlt >= 1) {
    v.push({
      prioritaet: 1, kategorie: 'Leads', titel: 'Offene Anfragen nachfassen',
      grund: `${leads.offenAlt} Anfrage(n) sind seit über 3 Tagen unbeantwortet — jeder Tag senkt die Abschlusschance.`,
      aktionText: 'Anfragen öffnen', aktionHref: HREF.leads,
    });
  } else if (leads.offen >= 3) {
    v.push({
      prioritaet: 2, kategorie: 'Leads', titel: 'An offenen Anfragen dranbleiben',
      grund: `${leads.offen} Anfragen sind noch offen. Zeitnah antworten hält die Abschlusschance hoch.`,
      aktionText: 'Anfragen öffnen', aktionHref: HREF.leads,
    });
  }

  // 2) Werbung läuft defizitär.
  if (ads.ausgaben > 0 && ads.roas != null && ads.roas < 1) {
    v.push({
      prioritaet: 1, kategorie: 'Ads', titel: 'Werbung läuft defizitär',
      grund: `Die Ausgaben übersteigen den Umsatz (ROAS ${ads.roas}×). Schwache Kampagnen pausieren, bevor mehr Budget fließt.`,
      aktionText: 'Kampagnen prüfen', aktionHref: HREF.ads,
    });
  }

  // 3) Landingpage-A/B: Sieger steht fest → schwächere abschalten.
  if (input.lp) {
    v.push({
      prioritaet: 2, kategorie: 'Landingpage', titel: 'Landingpage-Sieger nutzen',
      grund: `Bei „${input.lp.titel}" gewinnt Variante ${input.lp.besser}. Die schwächere Variante abschalten und die stärkere als Standard fahren.`,
      aktionText: 'Landingpage öffnen', aktionHref: HREF.landingpages,
    });
  }

  // 4) Newsletter reaktivieren: Abonnenten da, aber kein Versand.
  if (kanaele.newsletterAbos > 0 && kanaele.newsletterVersand <= 0) {
    v.push({
      prioritaet: 2, kategorie: 'Newsletter', titel: 'Newsletter verschicken',
      grund: `Du hast ${kanaele.newsletterAbos} Abonnenten, aber noch keinen Versand — eine ungenutzte Chance auf direkte Kontakte.`,
      aktionText: 'Newsletter starten', aktionHref: HREF.newsletter,
    });
  }

  // 5) Social: Kanal aktiv, aber nichts geplant.
  if (kanaele.socialAktiv && kanaele.socialGeplant <= 0) {
    v.push({
      prioritaet: 3, kategorie: 'Social', titel: 'Beiträge einplanen',
      grund: 'Dein Social-Kanal ist verbunden, aber es ist kein Beitrag geplant. Regelmäßige Posts halten dich sichtbar.',
      aktionText: 'Redaktionsplan öffnen', aktionHref: HREF.social,
    });
  }

  // 6) Ungenutzte Kanäle aktivieren (nur wenn wenige laufen).
  const genutzt = [kanaele.newsletterAbos > 0, kanaele.socialAktiv, kanaele.whatsappKontakte > 0, kanaele.adsAktiv].filter(Boolean).length;
  if (genutzt <= 2) {
    if (kanaele.newsletterAbos <= 0) v.push({ prioritaet: 3, kategorie: 'Kanäle', titel: 'Newsletter aufbauen', grund: 'Ein Newsletter ist der einzige Kanal, der dir gehört — unabhängig von Plattformen.', aktionText: 'Newsletter einrichten', aktionHref: HREF.newsletter });
    if (!kanaele.socialAktiv) v.push({ prioritaet: 3, kategorie: 'Kanäle', titel: 'Social-Media aktivieren', grund: 'Ein Social-Kanal erreicht neue Interessenten ohne Mehrkosten in bestehenden Kanälen.', aktionText: 'Social verbinden', aktionHref: HREF.social });
    if (kanaele.whatsappKontakte <= 0) v.push({ prioritaet: 3, kategorie: 'Kanäle', titel: 'WhatsApp aktivieren', grund: 'WhatsApp erreicht Kunden dort, wo sie ohnehin schreiben — mit hoher Öffnungsrate.', aktionText: 'WhatsApp verbinden', aktionHref: HREF.whatsapp });
  }

  // Dringendes zuerst.
  return v.sort((a, b) => a.prioritaet - b.prioritaet);
}

export function autopilotZusammenfassung(v: Vorschlag[]): { dringend: number; gesamt: number } {
  return { dringend: v.filter((x) => x.prioritaet === 1).length, gesamt: v.length };
}
