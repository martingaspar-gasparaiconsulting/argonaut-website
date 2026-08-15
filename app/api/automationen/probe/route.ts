import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import {
  triggerDef, aktionDef, pruefeRegel, platzhalterWerte,
  type AutomationRegel, type Datensatz,
} from '@/lib/automation';

// ============================================================================
// ARGONAUT OS · /api/automationen/probe — Probelauf fuer den Betrieb selbst
//
// Beantwortet eine einzige Frage: "Was wuerde meine Automation heute tun?"
// Fuehrt NICHTS aus, aendert NICHTS, schreibt NICHTS ins Protokoll.
//
// Bewusst getrennt vom Cron-Motor (/api/cron/automationen): der laeuft mit
// Service-Role ueber alle Betriebe und ist nur fuer Cron/Betreiber offen.
// Diese Route hier laeuft mit der normalen Anmeldung des Nutzers — RLS sorgt
// dafuer, dass jeder ausschliesslich seine eigenen Regeln und Daten sieht.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_JE_REGEL = 25;        // muss zum Deckel im Motor passen
const MAX_KANDIDATEN = 500;
const RUECKBLICK_TAGE = 120;
const MAX_BEISPIELE = 4;

type ProbeRegel = {
  id: string;
  name: string;
  aktiv: boolean;
  ausloeser: string;
  aktion: string;
  geprueft: number;
  faellig: number;
  wuerde_laufen: number;
  zurueckgestellt: number;
  schon_erledigt: number;
  beispiele: string[];
  hinweis?: string;
};

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });

  const jetzt = new Date();
  const grenzeAlt = new Date(jetzt.getTime() - RUECKBLICK_TAGE * 86400000).toISOString();

  const { data: regelDaten, error } = await supabase
    .from('automation_regeln').select('*').order('erstellt_am', { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const regeln = (regelDaten ?? []) as AutomationRegel[];
  const ergebnis: ProbeRegel[] = [];

  for (const regel of regeln) {
    const t = triggerDef(regel.trigger_typ);
    const a = aktionDef(regel.aktion_typ);
    if (!t || !a) {
      ergebnis.push({
        id: regel.id, name: regel.name, aktiv: regel.aktiv,
        ausloeser: regel.trigger_typ, aktion: regel.aktion_typ,
        geprueft: 0, faellig: 0, wuerde_laufen: 0, zurueckgestellt: 0, schon_erledigt: 0,
        beispiele: [], hinweis: 'Auslöser oder Aktion ist unbekannt — diese Regel läuft nicht.',
      });
      continue;
    }

    const { data: rohDaten } = await supabase
      .from(t.tabelle).select('*')
      .not(t.datumFeld, 'is', null)
      .lte(t.datumFeld, jetzt.toISOString())
      .gte(t.datumFeld, grenzeAlt)
      .order(t.datumFeld, { ascending: true })
      .limit(MAX_KANDIDATEN);
    const kandidaten = (rohDaten ?? []) as Datensatz[];

    const { data: logDaten } = await supabase
      .from('automation_log').select('ziel_id').eq('regel_id', regel.id).eq('ergebnis', 'ok').limit(5000);
    const erledigt = new Set((logDaten ?? []).map((l) => String((l as { ziel_id: string | null }).ziel_id ?? '')));

    const offen = kandidaten.filter((s) => !erledigt.has(String(s.id)));
    const treffer = offen.filter((s) => pruefeRegel(regel, s, jetzt).trifft);
    const zuTun = treffer.slice(0, MAX_JE_REGEL);

    const beispiele = zuTun.slice(0, MAX_BEISPIELE).map((s) => {
      const w = platzhalterWerte(regel, s, jetzt);
      const teile = [w.nummer || w.titel || w.name || 'Vorgang'];
      if (w.betrag) teile.push(w.betrag);
      if (w.tage) teile.push(`seit ${w.tage} ${w.tage === '1' ? 'Tag' : 'Tagen'}`);
      return teile.join(' · ');
    });

    ergebnis.push({
      id: regel.id, name: regel.name, aktiv: regel.aktiv,
      ausloeser: t.label, aktion: a.label,
      geprueft: kandidaten.length,
      faellig: treffer.length,
      wuerde_laufen: regel.aktiv ? zuTun.length : 0,
      zurueckgestellt: Math.max(0, treffer.length - zuTun.length),
      schon_erledigt: kandidaten.length - offen.length,
      beispiele,
      hinweis: regel.aktiv ? undefined : 'Regel ist pausiert — es passiert nichts, bis Sie sie aktivieren.',
    });
  }

  return NextResponse.json({
    ok: true,
    zeitpunkt: jetzt.toISOString(),
    deckel_je_regel: MAX_JE_REGEL,
    rueckblick_tage: RUECKBLICK_TAGE,
    regeln: ergebnis,
  });
}
