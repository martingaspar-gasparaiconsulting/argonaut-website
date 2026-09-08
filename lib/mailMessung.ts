// ============================================================================
// ARGONAUT OS · lib/mailMessung.ts — Öffnungen und Klicks (D5 Teil 3)
//
// Im Versand-Protokoll stand bisher nur, wieviele Mails RAUSGINGEN. Ob sie
// jemand geoeffnet oder angeklickt hat, wusste niemand — damit ist jede
// Aussage ueber Betreffzeilen und Inhalte geraten.
//
// ▄▄▄ NUR SUMMEN, NIE JE EMPFAENGER ▄▄▄
// Wer festhaelt, WER wann geoeffnet hat, betreibt Profilbildung — nach DSGVO
// eigenstaendig einwilligungsbeduerftig. Hier wird deshalb nur hochgezaehlt:
// keine Adresse, kein Hash, keine IP, kein Zeitstempel je Person. Der Betrieb
// sieht „von 120 Mails gab es 41 Oeffnungen" — genau das, was er braucht, um
// zwei Betreffzeilen zu vergleichen.
//
// ▄▄▄ UND DIE ZAHL LUEGT EIN BISSCHEN ▄▄▄
// Oeffnungen werden ueber ein winziges Bild gemessen. Viele Postfaecher laden
// Bilder gar nicht oder erst auf Klick, andere laden sie im Voraus fuer alle
// Mails. Die Oeffnungsrate ist deshalb eine UNTERGRENZE mit Rauschen, keine
// Wahrheit. Wer sie als exakt verkauft, verkauft eine Luege. Deshalb liefert
// diese Datei die Einordnung gleich mit — siehe `messHinweis`.
// Klicks sind dagegen belastbar: Da hat wirklich jemand gedrueckt.
//
// KEINE Netzwerk-/Supabase-Aufrufe — pure, node-testbar.
// ============================================================================

/** Ab so vielen Empfaengern lohnt der Vergleich zweier Betreffzeilen. */
export const AUSSAGEKRAEFTIG_AB = 30;

export type VersandRoh = {
  id?: unknown;
  betreff?: unknown;
  empfaenger_anzahl?: unknown;
  erfolg_anzahl?: unknown;
  geoeffnet_anzahl?: unknown;
  geklickt_anzahl?: unknown;
  gesendet_am?: unknown;
};

function ganz(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Wie viele Mails tatsaechlich rausgingen — die Grundlage jeder Quote. */
export function zugestellt(v: VersandRoh | null | undefined): number {
  const r = v || {};
  const erfolg = ganz(r.erfolg_anzahl);
  return erfolg > 0 ? erfolg : ganz(r.empfaenger_anzahl);
}

export type Quoten = {
  /** Öffnungen je 100 zugestellte Mails (%). null ohne Grundlage. */
  oeffnung: number | null;
  /** Klicks je 100 zugestellte Mails (%). null ohne Grundlage. */
  klick: number | null;
  /** Von den Öffnungen: wie viele führten zu einem Klick? (%) */
  klickAusOeffnung: number | null;
};

function prozent(z: number, n: number): number | null {
  if (n <= 0) return null;
  return Math.round((z / n) * 1000) / 10;
}

/**
 * Die drei Quoten. Fehlt die Grundlage, bleibt es null — es wird nichts
 * geschaetzt und nichts auf 0 % gerundet, was in Wahrheit „unbekannt" ist.
 */
export function quoten(v: VersandRoh | null | undefined): Quoten {
  const r = v || {};
  const n = zugestellt(r);
  const auf = ganz(r.geoeffnet_anzahl);
  const klick = ganz(r.geklickt_anzahl);
  return {
    oeffnung: prozent(auf, n),
    klick: prozent(klick, n),
    klickAusOeffnung: auf > 0 ? prozent(klick, auf) : null,
  };
}

/**
 * Die Einordnung, die neben jeder Zahl stehen muss. Ohne sie zieht jemand
 * aus 8 % Oeffnungsrate den falschen Schluss.
 */
export function messHinweis(v: VersandRoh | null | undefined): string {
  const n = zugestellt(v);
  if (n === 0) return 'Noch nichts versendet.';
  if (n < AUSSAGEKRAEFTIG_AB) {
    return `Bei ${n} Empfängern schwankt jede Quote stark — ein einzelner Klick verschiebt sie um mehrere Prozent. `
      + `Ab etwa ${AUSSAGEKRAEFTIG_AB} Empfängern lohnt der Vergleich zweier Betreffzeilen.`;
  }
  return 'Öffnungen sind eine Untergrenze: Viele Postfächer laden Bilder nicht oder erst auf Klick. '
    + 'Klicks sind dagegen belastbar — da hat wirklich jemand gedrückt.';
}

/**
 * Vergleich zweier Versendungen — der eigentliche Zweck der Messung.
 * Gibt bewusst KEINEN Sieger aus, wenn die Grundlage zu duenn ist.
 */
export function vergleiche(
  a: VersandRoh | null | undefined,
  b: VersandRoh | null | undefined,
): { satz: string; sicher: boolean } {
  const qa = quoten(a);
  const qb = quoten(b);
  const na = zugestellt(a);
  const nb = zugestellt(b);

  if (qa.oeffnung == null || qb.oeffnung == null) {
    return { satz: 'Für einen Vergleich fehlen noch Zahlen.', sicher: false };
  }
  if (na < AUSSAGEKRAEFTIG_AB || nb < AUSSAGEKRAEFTIG_AB) {
    return {
      satz: `Zu wenige Empfänger für einen belastbaren Vergleich (${na} und ${nb}). Die Zahlen stehen trotzdem da.`,
      sicher: false,
    };
  }
  const unterschied = Math.round(Math.abs(qa.oeffnung - qb.oeffnung) * 10) / 10;
  if (unterschied < 5) {
    return { satz: `Kaum Unterschied (${unterschied} Prozentpunkte) — das kann Zufall sein.`, sicher: false };
  }
  const besser = qa.oeffnung > qb.oeffnung ? 'die erste' : 'die zweite';
  return { satz: `Deutlicher Unterschied: ${besser} Betreffzeile liegt ${unterschied} Prozentpunkte vorn.`, sicher: true };
}

// ---------------------------------------------------------------------------
// Die Messpunkte in der Mail
// ---------------------------------------------------------------------------

function basis(origin: unknown): string {
  return String(origin ?? '').replace(/\/+$/, '');
}

/** Adresse des Zaehlbildes. */
export function pixelUrl(origin: unknown, versandId: unknown, schluessel: unknown): string {
  return `${basis(origin)}/api/oeffentlich/mail-pixel`
    + `?v=${encodeURIComponent(String(versandId ?? ''))}`
    + `&s=${encodeURIComponent(String(schluessel ?? ''))}`;
}

/** Das Bild selbst — 1×1, unsichtbar, mit leerem alt-Text. */
export function pixelHtml(origin: unknown, versandId: unknown, schluessel: unknown): string {
  const u = pixelUrl(origin, versandId, schluessel);
  return `<img src="${u}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
}

/**
 * Nur http und https werden umgeleitet. `mailto:`, `tel:` und der
 * Abmeldelink bleiben unangetastet — ein umgeleiteter Abmeldelink waere
 * genau die Stelle, an der man einem Menschen die Abmeldung erschwert.
 */
export function istUmleitbar(url: unknown): boolean {
  const u = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(u)) return false;
  if (/\/api\/(oeffentlich\/)?(newsletter\/)?abmelden/i.test(u)) return false;
  if (/mail-pixel|mail-klick/i.test(u)) return false;
  return true;
}

/** Adresse der Klick-Umleitung. */
export function klickUrl(origin: unknown, versandId: unknown, schluessel: unknown, ziel: unknown): string {
  return `${basis(origin)}/api/oeffentlich/mail-klick`
    + `?v=${encodeURIComponent(String(versandId ?? ''))}`
    + `&s=${encodeURIComponent(String(schluessel ?? ''))}`
    + `&u=${encodeURIComponent(String(ziel ?? ''))}`;
}

/**
 * Alle zaehlbaren Links im HTML umbiegen. Bewusst eine schlichte Ersetzung
 * ueber href="…": Ein vollstaendiger HTML-Zerleger waere hier mehr Risiko
 * als Nutzen, und der Mail-Rumpf kommt aus unseren eigenen Vorlagen.
 */
export function biegeLinksUm(html: unknown, origin: unknown, versandId: unknown, schluessel: unknown): string {
  return String(html ?? '').replace(/href="([^"]+)"/gi, (ganzes, ziel: string) => {
    if (!istUmleitbar(ziel)) return ganzes;
    return `href="${klickUrl(origin, versandId, schluessel, ziel)}"`;
  });
}

/** Beides auf einmal: Links umbiegen und das Zaehlbild ans Ende haengen. */
export function messeMit(html: unknown, origin: unknown, versandId: unknown, schluessel: unknown): string {
  const mitLinks = biegeLinksUm(html, origin, versandId, schluessel);
  return mitLinks + pixelHtml(origin, versandId, schluessel);
}

/**
 * Ziel-Adresse aus der Umleitung pruefen. Alles, was kein http/https ist,
 * wird abgewiesen — sonst wird die eigene Route zur Weiterleitung auf
 * beliebige Ziele („offene Umleitung") und taugt fuer Betrugsmails.
 */
export function sicheresZiel(roh: unknown): string | null {
  const u = String(roh ?? '').trim();
  if (!/^https?:\/\//i.test(u)) return null;
  if (u.length > 2000) return null;
  try {
    const geprueft = new URL(u);
    if (geprueft.protocol !== 'http:' && geprueft.protocol !== 'https:') return null;
    return geprueft.toString();
  } catch {
    return null;
  }
}

/** Die meistgeklickten Ziele — für die Anzeige, absteigend. */
export function topZiele(
  klicks: { ziel_url?: unknown; anzahl?: unknown }[] | null | undefined,
  wieviele = 5,
): { ziel: string; anzahl: number }[] {
  return (klicks || [])
    .map((k) => ({ ziel: String(k?.ziel_url ?? ''), anzahl: ganz(k?.anzahl) }))
    .filter((k) => k.ziel && k.anzahl > 0)
    .sort((a, b) => b.anzahl - a.anzahl)
    .slice(0, Math.max(1, Math.floor(wieviele)));
}

/** Lange Adressen für die Anzeige kürzen, ohne sie unkenntlich zu machen. */
export function kurzeAdresse(url: unknown, max = 48): string {
  const u = String(url ?? '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (u.length <= max) return u;
  return u.slice(0, max - 1) + '…';
}
