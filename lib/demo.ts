// ============================================================================
// ARGONAUT OS · lib/demo.ts — Demo-Konto-Logik (Punkt 26)
//
// Ein Demo-Konto ist ein normaler Mandant mit profiles.demo = true und einem
// Ablaufzeitpunkt profiles.demo_ablauf. Vor Ablauf: voller Zugang (Countdown-
// Banner). Nach Ablauf: nur noch Ansehen (Read-only, Enforcement in Punkt 26b).
//
// Reine Logik — kein Supabase, keine Hooks. Node-testbar, Client + Server.
// ============================================================================

export type DemoStatus = {
  istDemo: boolean;
  aktiv: boolean;        // Demo, noch nicht abgelaufen
  abgelaufen: boolean;   // Demo, Ablauf erreicht -> Read-only
  unbegrenzt: boolean;   // Demo ohne gesetztes Ablaufdatum
  restStunden: number;   // volle Stunden bis Ablauf (0 wenn abgelaufen/unbegrenzt)
  restTage: number;      // angefangene Tage bis Ablauf
};

const KEIN_DEMO: DemoStatus = { istDemo: false, aktiv: false, abgelaufen: false, unbegrenzt: false, restStunden: 0, restTage: 0 };

/** Status eines Kontos aus profiles.demo + profiles.demo_ablauf zum Zeitpunkt jetztIso. */
export function demoStatus(demo: boolean | null | undefined, ablauf: string | null | undefined, jetztIso: string): DemoStatus {
  if (!demo) return { ...KEIN_DEMO };
  if (!ablauf) return { istDemo: true, aktiv: true, abgelaufen: false, unbegrenzt: true, restStunden: 0, restTage: 0 };

  const end = new Date(ablauf).getTime();
  const jetzt = new Date(jetztIso).getTime();
  const msLeft = end - jetzt;
  const abgelaufen = msLeft <= 0;
  return {
    istDemo: true,
    aktiv: !abgelaufen,
    abgelaufen,
    unbegrenzt: false,
    restStunden: abgelaufen ? 0 : Math.ceil(msLeft / 3_600_000),
    restTage: abgelaufen ? 0 : Math.ceil(msLeft / 86_400_000),
  };
}

/** Ablaufzeitpunkt (ISO) = jetzt + n Tage. Fuer das Anlegen/Verlaengern einer Demo. */
export function ablaufAusTagen(jetztIso: string, tage: number): string {
  const t = Math.max(0, Math.round(Number(tage) || 0));
  return new Date(new Date(jetztIso).getTime() + t * 86_400_000).toISOString();
}

/** Kurzer Anzeige-Text fuer das Banner. */
export function demoRestText(s: DemoStatus): string {
  if (!s.istDemo) return '';
  if (s.abgelaufen) return 'Demo abgelaufen — nur noch ansehen';
  if (s.unbegrenzt) return 'Demo-Modus';
  if (s.restStunden <= 48) return `Demo-Modus · noch ${s.restStunden} Std`;
  return `Demo-Modus · noch ${s.restTage} Tage`;
}
