import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { orteFuerExport, orteMitArt } from '@/lib/dsgvoDaten';
import { baueAuskunft, dateiName, type AuskunftBereich } from '@/lib/dsgvoAuskunft';

// ============================================================================
// ARGONAUT OS · /api/dsgvo/auskunft
//
// Traegt alles zusammen, was zu einer Person gespeichert ist, und liefert es
// als fertige HTML-Datei zum Weitergeben.
//
// LAEUFT MIT DER NORMALEN ANMELDUNG, NICHT MIT SERVICE-ROLE. Das ist Absicht:
// so kann niemand ueber diese Route an Daten fremder Betriebe kommen — RLS
// haelt dagegen, auch wenn hier ein Fehler waere. Eine Auskunftsroute mit
// Allmacht waere genau die Art von Bequemlichkeit, die spaeter teuer wird.
//
// FEHLENDE TABELLEN SIND NORMAL: Nicht jeder Betrieb hat jedes Branchenmodul.
// Eine Abfrage, die ins Leere geht, wird uebersprungen — sie darf die
// Auskunft nicht zum Scheitern bringen.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_JE_BEREICH = 500;

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });

  let kontaktId = '';
  try {
    const koerper = await req.json();
    kontaktId = String(koerper?.kontakt_id ?? '').trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'Die Anfrage war unlesbar.' }, { status: 400 });
  }
  if (!kontaktId) return NextResponse.json({ ok: false, error: 'Es wurde kein Kontakt angegeben.' }, { status: 400 });

  // Der Kontakt selbst — und damit zugleich die Rechteprüfung: sieht der
  // Nutzer ihn nicht, liefert RLS nichts und wir hören hier auf.
  const { data: kontakt, error: kontaktFehler } = await supabase
    .from('kontakte').select('*').eq('id', kontaktId).maybeSingle();
  if (kontaktFehler || !kontakt) {
    return NextResponse.json({ ok: false, error: 'Der Kontakt wurde nicht gefunden.' }, { status: 404 });
  }

  const k = kontakt as Record<string, unknown>;
  const person = [k.vorname, k.nachname].filter(Boolean).join(' ').trim()
    || String(k.firma ?? '').trim()
    || String(k.email ?? '').trim()
    || 'Kontakt';

  // Der Name des Betriebs für die Kopfzeile.
  let betrieb = 'Ihr Betrieb';
  try {
    const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', user.id).maybeSingle();
    const name = (p as { firma_name?: string } | null)?.firma_name;
    if (name) betrieb = name;
  } catch { /* Name ist schmückendes Beiwerk */ }

  const bereiche: AuskunftBereich[] = [];
  const uebersprungen: string[] = [];

  for (const ort of orteFuerExport()) {
    try {
      const abfrage = ort.tabelle === 'kontakte'
        ? supabase.from('kontakte').select('*').eq('id', kontaktId)
        : supabase.from(ort.tabelle).select('*').eq(ort.spalte, kontaktId).limit(MAX_JE_BEREICH);

      const { data, error } = await abfrage;
      if (error) { uebersprungen.push(ort.tabelle); continue; }

      const zeilen = (data as Array<Record<string, unknown>>) ?? [];
      if (zeilen.length === 0) continue;

      bereiche.push({
        tabelle: ort.tabelle,
        label: ort.label,
        zeilen,
        hinweis: ort.art === 'behalten' ? ort.begruendung : undefined,
      });
    } catch {
      uebersprungen.push(ort.tabelle);
    }
  }

  const jetzt = new Date();
  const html = baueAuskunft({
    person,
    betrieb,
    erstellt_am: jetzt.toISOString(),
    bereiche,
    behalten: orteMitArt('behalten').map((o) => ({ label: o.label, begruendung: o.begruendung })),
  });

  return NextResponse.json({
    ok: true,
    person,
    dateiname: dateiName(person, jetzt),
    bereiche: bereiche.length,
    eintraege: bereiche.reduce((s, b) => s + b.zeilen.length, 0),
    html,
    ...(uebersprungen.length > 0 ? { hinweis: `${uebersprungen.length} Bereiche waren nicht abfragbar (Module, die dieser Betrieb nicht nutzt).` } : {}),
  });
}
