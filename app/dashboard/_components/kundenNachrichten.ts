// ============================================================================
// ARGONAUT OS · Phase 2 · Modul D · KFZ Block 1.3 · Baustein "Kunden-Nachrichten"
// Reine Logik — KEINE UI, KEINE externen Abhängigkeiten, KEIN DB-Zugriff.
// Generiert fertige, kopierbare Kundennachrichten (Sie-Form, professionell-
// freundlich) aus Auftrags-/Fahrzeug-/Freigabedaten. Kein Versand — die UI
// zeigt den Text mit "Kopieren"-Button; Versand per WhatsApp/SMS macht der Chef.
// Additiv auf echten Mail-/SMS-Versand erweiterbar (Finale).
// Pfad: app/dashboard/_components/kundenNachrichten.ts
// ============================================================================

// --- Eingabe: schlank, passt auf die vorhandenen Auftragsfelder --------------
export interface NachrichtKontext {
  kunde_name?: string | null;
  kennzeichen?: string | null;
  fahrzeug_text?: string | null;    // z.B. "Mercedes-Benz C-Klasse" (optional)
  status?: string | null;           // angenommen | in_arbeit | wartet | fertig | abgeholt
  freigabe_status?: string | null;  // kein_kva | kva_offen | freigegeben | abgelehnt
  zugesagt_am?: string | null;      // date (YYYY-MM-DD)
  summe_brutto?: number | null;     // für KVA-Freigabe-Text (brutto)
  hu_faellig?: string | null;       // date (YYYY-MM-DD) — für HU-Erinnerung
}

// --- Vorlagen-Typen ----------------------------------------------------------
export type NachrichtTyp =
  | 'fertig'
  | 'kva_freigabe'
  | 'warten_teile'
  | 'termin_erinnerung'
  | 'in_arbeit'
  | 'hu_erinnerung';

export interface NachrichtVorlage {
  typ: NachrichtTyp;
  titel: string;         // Button-/Auswahl-Label
  text: string;          // fertig gefüllter Nachrichtentext
  passtZurLage: boolean; // true = für aktuellen Status besonders relevant (wird oben einsortiert)
}

// --- Helfer ------------------------------------------------------------------
const GRUSS_PLATZHALTER = '[Ihre Werkstatt]';

function anrede(kunde?: string | null): string {
  const k = (kunde || '').trim();
  return k ? `Guten Tag ${k},` : 'Guten Tag,';
}

/** Fahrzeug-Bezeichnung für den Fließtext: "Ihr Fahrzeug (BB-MG 500)" o.ä. */
function fahrzeugBez(ctx: NachrichtKontext): string {
  const kennz = (ctx.kennzeichen || '').trim();
  const fz = (ctx.fahrzeug_text || '').trim();
  if (fz && kennz) return `Ihr ${fz} (${kennz})`;
  if (kennz) return `Ihr Fahrzeug (${kennz})`;
  if (fz) return `Ihr ${fz}`;
  return 'Ihr Fahrzeug';
}

function datumDe(iso: string | null | undefined): string {
  if (!iso) return '';
  const p = iso.split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

function eur(n: number | null | undefined): string {
  if (n == null) return '';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function grussBlock(): string {
  return `\n\nMit freundlichen Grüßen\n${GRUSS_PLATZHALTER}`;
}

// --- Einzel-Vorlagen ---------------------------------------------------------

function vorlageFertig(ctx: NachrichtKontext): string {
  return `${anrede(ctx.kunde_name)}\n\n` +
    `${fahrzeugBez(ctx)} ist fertig und kann abgeholt werden. ` +
    `Bitte bringen Sie zur Abholung diese Nachricht oder Ihren Namen mit.` +
    grussBlock();
}

function vorlageKvaFreigabe(ctx: NachrichtKontext): string {
  const betrag = ctx.summe_brutto != null ? ` in Höhe von ${eur(ctx.summe_brutto)} (brutto)` : '';
  return `${anrede(ctx.kunde_name)}\n\n` +
    `für ${fahrzeugBez(ctx).replace(/^Ihr /, 'Ihr ')} liegt unser Kostenvoranschlag${betrag} vor. ` +
    `Bitte geben Sie uns kurz Bescheid, ob wir mit den Arbeiten beginnen dürfen. ` +
    `Vielen Dank!` +
    grussBlock();
}

function vorlageWartenTeile(ctx: NachrichtKontext): string {
  return `${anrede(ctx.kunde_name)}\n\n` +
    `wir arbeiten an ${fahrzeugBez(ctx).replace(/^Ihr /, 'Ihrem ')}. ` +
    `Leider verzögert sich die Fertigstellung etwas, da wir noch auf ein benötigtes Ersatzteil warten. ` +
    `Wir melden uns, sobald Ihr Fahrzeug abholbereit ist. Vielen Dank für Ihr Verständnis.` +
    grussBlock();
}

function vorlageTerminErinnerung(ctx: NachrichtKontext): string {
  const d = datumDe(ctx.zugesagt_am);
  const terminTeil = d ? ` am ${d}` : '';
  return `${anrede(ctx.kunde_name)}\n\n` +
    `wir möchten Sie an Ihren Werkstatt-Termin${terminTeil} für ${fahrzeugBez(ctx).replace(/^Ihr /, 'Ihr ')} erinnern. ` +
    `Sollte Ihnen der Termin nicht mehr passen, geben Sie uns bitte kurz Bescheid.` +
    grussBlock();
}

function vorlageInArbeit(ctx: NachrichtKontext): string {
  return `${anrede(ctx.kunde_name)}\n\n` +
    `wir informieren Sie kurz zum Stand: ${fahrzeugBez(ctx).replace(/^Ihr /, 'Ihr ')} ist aktuell bei uns in Arbeit. ` +
    `Wir melden uns, sobald es abholbereit ist.` +
    grussBlock();
}

function vorlageHuErinnerung(ctx: NachrichtKontext): string {
  const d = datumDe(ctx.hu_faellig);
  const faelligTeil = d ? ` am ${d}` : ' in Kürze';
  return `${anrede(ctx.kunde_name)}\n\n` +
    `die Hauptuntersuchung (HU/TÜV) für ${fahrzeugBez(ctx).replace(/^Ihr /, 'Ihr ')} ist${faelligTeil} fällig. ` +
    `Gerne übernehmen wir das für Sie — melden Sie sich einfach für einen Termin. ` +
    `So bleiben Sie sicher und vermeiden ein Bußgeld.` +
    grussBlock();
}

// --- Hauptfunktion: alle Vorlagen bauen + nach Lage sortieren ----------------

/**
 * Baut alle Vorlagen mit den echten Daten und markiert die zur aktuellen Lage
 * passende(n). Rückgabe ist bereits sortiert: passende zuerst.
 */
export function baueNachrichten(ctx: NachrichtKontext): NachrichtVorlage[] {
  const status = ctx.status ?? '';
  const freigabe = ctx.freigabe_status ?? '';

  const alle: NachrichtVorlage[] = [
    {
      typ: 'fertig',
      titel: 'Fertig zur Abholung',
      text: vorlageFertig(ctx),
      passtZurLage: status === 'fertig',
    },
    {
      typ: 'kva_freigabe',
      titel: 'KVA-Freigabe erbeten',
      text: vorlageKvaFreigabe(ctx),
      passtZurLage: freigabe === 'kva_offen',
    },
    {
      typ: 'warten_teile',
      titel: 'Warten auf Teile',
      text: vorlageWartenTeile(ctx),
      passtZurLage: status === 'wartet',
    },
    {
      typ: 'termin_erinnerung',
      titel: 'Termin-Erinnerung',
      text: vorlageTerminErinnerung(ctx),
      passtZurLage: !!ctx.zugesagt_am && (status === 'angenommen' || status === ''),
    },
    {
      typ: 'in_arbeit',
      titel: 'Zwischenstand (in Arbeit)',
      text: vorlageInArbeit(ctx),
      passtZurLage: status === 'in_arbeit',
    },
    {
      typ: 'hu_erinnerung',
      titel: 'HU-Erinnerung',
      text: vorlageHuErinnerung(ctx),
      passtZurLage: false, // wird gezielt über die HU-Kachel genutzt, nicht statusabhängig
    },
  ];

  // Passende zuerst, Reihenfolge sonst stabil
  return alle.sort((a, b) => Number(b.passtZurLage) - Number(a.passtZurLage));
}

/** Nur die aktuell am besten passende Vorlage (oder null, wenn keine passt). */
export function empfohleneNachricht(ctx: NachrichtKontext): NachrichtVorlage | null {
  const alle = baueNachrichten(ctx);
  return alle.find((v) => v.passtZurLage) ?? null;
}
