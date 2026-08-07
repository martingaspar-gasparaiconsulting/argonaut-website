// ============================================================================
// ARGONAUT OS · lib/autoLagebericht.ts — reine Helfer fürs wöchentliche
// Marketing-Wochen-Mailing (Marketing-Ausbau · Punkt 8 — Auto-Lagebericht)
//
// Der Cron (app/api/cron/marketing-lagebericht) liest je Betrieb die Rohdaten,
// fasst sie mit dem VORHANDENEN Lagebericht-Code zusammen (fasseCockpit +
// lagebericht) und baut hier daraus die fertige, kundengebrandete Wochen-Mail —
// MECHANISCH, ohne KI (0 € Kosten). Nur aktive Betriebe bekommen Post.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks, KEIN Cross-Import —
// pure, node-testbare Funktionen.
// ============================================================================

/** HTML entschärfen (kein Einschleusen über Firmen-/Befund-Texte). */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Zeilen nach owner_user_id gruppieren (Zeilen ohne Owner werden ignoriert). */
export function gruppiereNachOwner<T extends { owner_user_id?: unknown }>(rows: T[] | null | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows || []) {
    const id = typeof r?.owner_user_id === 'string' ? r.owner_user_id : '';
    if (!id) continue;
    const liste = map.get(id);
    if (liste) liste.push(r); else map.set(id, [r]);
  }
  return map;
}

/** Aktivitäts-Kennwerte eines Betriebs (aus fasseCockpit abgeleitet). */
export type AktivInput = {
  leads?: number;
  adsKampagnen?: number;
  newsletterAbos?: number;
  socialBeitraege?: number;
  whatsappKontakte?: number;
};

/** Lohnt sich ein Wochenbericht? Nur wenn überhaupt Marketing-Aktivität da ist. */
export function istBerichtenswert(a: AktivInput): boolean {
  return (a.leads || 0) > 0
    || (a.adsKampagnen || 0) > 0
    || (a.newsletterAbos || 0) > 0
    || (a.socialBeitraege || 0) > 0
    || (a.whatsappKontakte || 0) > 0;
}

/** Betreff der Wochen-Mail (im Namen des Kunden-Betriebs). */
export function berichtBetreff(firma: string | null | undefined): string {
  const f = (firma || '').trim();
  return f ? `Ihr Marketing-Wochenbericht – ${f}` : 'Ihr Marketing-Wochenbericht';
}

/** Ampel-Schlüssel → Farbe + Klartext (robust gegen unbekannte Werte). */
export function ampelDarstellung(ampel: string | null | undefined): { farbe: string; text: string } {
  const a = (ampel || '').toLowerCase();
  if (a === 'rot' || a === 'schwach' || a === 'kritisch') return { farbe: '#E06666', text: 'Handlungsbedarf' };
  if (a === 'gelb' || a === 'gold' || a === 'mittel' || a === 'warnung') return { farbe: '#C9A84C', text: 'Solide, mit Luft nach oben' };
  if (a === 'gruen' || a === 'grün' || a === 'gut') return { farbe: '#4CAF7D', text: 'Läuft gut' };
  return { farbe: '#8FA3BE', text: 'Überblick' };
}

export type KpiZeile = { label: string; wert: string };
export type BefundKurz = { titel: string; text: string };

/**
 * Baut den INNEREN HTML-Inhalt der Wochen-Mail (ohne Rahmen). Der Cron steckt
 * ihn in kundenMailLayout(firma, akzent, titel, inhalt) → kundengebrandet.
 */
export function berichtInhaltHtml(opts: {
  ampel: string | null | undefined;
  kpis: KpiZeile[];
  befunde: BefundKurz[];
  zeitraumText?: string;
}): string {
  const amp = ampelDarstellung(opts.ampel);
  const zeit = escapeHtml(opts.zeitraumText || 'der letzten 7 Tage');

  const kpiHtml = (opts.kpis || []).map((k) => `
    <td style="padding:10px 8px;text-align:center;border:1px solid #eef0f3;">
      <div style="font-size:20px;font-weight:800;color:#1a2332;">${escapeHtml(k.wert)}</div>
      <div style="font-size:12px;color:#8a94a6;margin-top:2px;">${escapeHtml(k.label)}</div>
    </td>`).join('');

  const befundeHtml = (opts.befunde || []).length
    ? (opts.befunde || []).map((b) => `
        <div style="border-left:3px solid ${amp.farbe};background:#fafbfc;border-radius:8px;padding:10px 14px;margin:0 0 10px;">
          <div style="font-weight:700;font-size:14px;color:#1a2332;">${escapeHtml(b.titel)}</div>
          <div style="font-size:13px;color:#5a6675;line-height:1.5;margin-top:3px;">${escapeHtml(b.text)}</div>
        </div>`).join('')
    : '<p style="font-size:14px;color:#5a6675;">Diese Woche gibt es nichts Dringendes — weiter so.</p>';

  return `
    <p style="margin:0 0 6px;font-size:15px;color:#1a2332;">Ihr Marketing-Überblick ${zeit}:</p>
    <div style="display:inline-block;background:${amp.farbe}1a;border:1px solid ${amp.farbe};color:${amp.farbe};
         font-weight:700;font-size:13px;border-radius:999px;padding:5px 14px;margin:6px 0 16px;">● ${escapeHtml(amp.text)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 18px;"><tr>${kpiHtml}</tr></table>
    <div style="font-weight:700;font-size:15px;color:#1a2332;margin:0 0 10px;">Das fällt auf</div>
    ${befundeHtml}
    <p style="margin:18px 0 0;font-size:12px;color:#8a94a6;">
      Automatischer Wochenbericht aus Ihrem ARGONAUT-Marketing. Den vollen Lagebericht mit KI-Empfehlungen finden Sie jederzeit im Dashboard unter „KI-Lagebericht".
    </p>`;
}
