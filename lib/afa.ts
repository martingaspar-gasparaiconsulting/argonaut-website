// ============================================================================
// ARGONAUT OS · lib/afa.ts — Regel-Ebene: Abschreibung (AfA) rechnen
//
// KEINE KI. Deutsche Abschreibungsregeln (Stand 2026):
//   · GWG: Anschaffungskosten ≤ 800 € netto → Sofortabschreibung im Jahr
//     der Anschaffung (voller Betrag).
//   · Darueber: lineare AfA über die betriebsgewöhnliche Nutzungsdauer,
//     MONATSGENAU im Anschaffungsjahr (pro rata temporis, 1/12 je Monat ab
//     Anschaffungsmonat). Der Rest laeuft in die Folgejahre.
//   · Nutzungsdauer 1 Jahr (z. B. digitale Wirtschaftsgueter nach BMF) →
//     voller Abzug im Anschaffungsjahr.
//
// Reine Funktionen, keine Hooks/Supabase — ueberall importierbar.
// ============================================================================

export const GWG_GRENZE = 800; // € netto, Sofortabschreibung 2026

export type AfaMethode = 'linear' | 'gwg';
export type AfaJahr = { jahr: number; afa: number; restbuchwert: number };
export type AfaPlan = {
  methode: AfaMethode;
  jahresAfa: number;          // volle Jahresrate (linear) bzw. Sofortbetrag (GWG)
  plan: AfaJahr[];            // Jahr fuer Jahr, chronologisch
  restbuchwertHeute: number;  // Buchwert zum Ende des Stichjahres
  afaStichjahr: number;       // Abschreibung, die im Stichjahr anfaellt
  hinweis: string;
};

function r2(n: number): number { return Math.round((Number(n) || 0) * 100) / 100; }

export function afaPlan(kosten: number, nutzungsdauer: number, anschaffungISO?: string | null, stichjahr?: number): AfaPlan {
  const k = r2(kosten);
  const leer: AfaPlan = { methode: 'linear', jahresAfa: 0, plan: [], restbuchwertHeute: k, afaStichjahr: 0, hinweis: '' };
  if (!anschaffungISO || anschaffungISO.length < 7) return { ...leer, hinweis: 'Anschaffungsdatum angeben.' };
  const aJahr = parseInt(anschaffungISO.slice(0, 4), 10);
  const monat = Math.min(12, Math.max(1, parseInt(anschaffungISO.slice(5, 7), 10) || 1));
  if (!Number.isFinite(aJahr)) return { ...leer, hinweis: 'Anschaffungsdatum ungültig.' };
  const jahr = Number.isFinite(stichjahr as number) ? (stichjahr as number) : aJahr;

  const stichHelfer = (plan: AfaJahr[]): { rest: number; afa: number } => {
    if (jahr < aJahr) return { rest: k, afa: 0 };
    const e = plan.find((p) => p.jahr === jahr);
    if (e) return { rest: e.restbuchwert, afa: e.afa };
    return { rest: 0, afa: 0 }; // nach Planende
  };

  // --- GWG: Sofortabschreibung ---
  if (k > 0 && k <= GWG_GRENZE) {
    const plan: AfaJahr[] = [{ jahr: aJahr, afa: k, restbuchwert: 0 }];
    const s = stichHelfer(plan);
    return { methode: 'gwg', jahresAfa: k, plan, restbuchwertHeute: s.rest, afaStichjahr: s.afa, hinweis: `GWG (≤ ${GWG_GRENZE} € netto): Sofortabschreibung im Jahr ${aJahr}.` };
  }

  const nd = Math.max(1, Math.round(nutzungsdauer || 0));

  // --- Nutzungsdauer 1 Jahr: voller Abzug im Anschaffungsjahr ---
  if (nd <= 1) {
    const plan: AfaJahr[] = [{ jahr: aJahr, afa: k, restbuchwert: 0 }];
    const s = stichHelfer(plan);
    return { methode: 'linear', jahresAfa: k, plan, restbuchwertHeute: s.rest, afaStichjahr: s.afa, hinweis: `Nutzungsdauer 1 Jahr: voller Abzug im Jahr ${aJahr}.` };
  }

  // --- Lineare AfA, monatsgenau ---
  const jahresAfa = r2(k / nd);
  const monateErstes = 13 - monat; // Anschaffung im Monat m -> (13-m) Monate im ersten Jahr
  const plan: AfaJahr[] = [];
  let rest = k;
  let j = aJahr;
  let afa1 = Math.min(r2(jahresAfa * monateErstes / 12), rest);
  rest = r2(rest - afa1);
  plan.push({ jahr: j, afa: afa1, restbuchwert: rest });
  while (rest > 0 && plan.length < nd + 3) {
    j += 1;
    const afa = Math.min(jahresAfa, rest);
    rest = r2(rest - afa);
    plan.push({ jahr: j, afa: r2(afa), restbuchwert: rest });
  }
  const s = stichHelfer(plan);
  return { methode: 'linear', jahresAfa, plan, restbuchwertHeute: s.rest, afaStichjahr: s.afa, hinweis: `Linear über ${nd} Jahre, monatsgenau ab ${String(monat).padStart(2, '0')}/${aJahr}.` };
}
