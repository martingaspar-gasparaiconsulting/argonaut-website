import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { orteMitArt } from '@/lib/dsgvoDaten';
import {
  baueLoeschPlan,
  pruefePlan,
  pruefeFreigabe,
  anonymAenderung,
  leeresErgebnis,
  zaehleDazu,
  fasseZusammen,
  alsListe,
  baueAntworttext,
  SCHNAPPSCHUESSE,
  type LoeschErgebnis,
} from '@/lib/dsgvoLoeschen';

// ============================================================================
// ARGONAUT OS · /api/dsgvo/loeschen
//
// Der gefaehrlichste Knopf im System. Deshalb vier Bremsen uebereinander:
//
//   1. NUR DER BETRIEBSINHABER. Ein Mitarbeiter darf Kunden anlegen und
//      pflegen — aber nicht die Datenspur eines Menschen aus dem ganzen
//      Betrieb entfernen.
//   2. VORSCHAU ZUERST. `modus: 'vorschau'` aendert nichts und zeigt, was
//      passieren wuerde. Die Oberflaeche ruft das immer zuerst auf.
//   3. FREIGABEWORT. Der Nutzer tippt LOESCHEN ab. Ein Klick allein reicht
//      hier nicht.
//   4. PLANPRUEFUNG ZUR LAUFZEIT. Bevor irgendetwas angefasst wird, prueft
//      `pruefePlan()` erneut, dass keine aufbewahrungspflichtige Tabelle im
//      Plan steht. Faellt die Pruefung durch, passiert gar nichts.
//
// NORMALE ANMELDUNG, KEINE SERVICE-ROLE — wie bei der Auskunft. Eine Route
// mit Allmacht, die loeschen kann, waere die schlechteste Idee im Projekt.
//
// REIHENFOLGE (wichtig, siehe lib/dsgvoLoeschen.ts):
//   Schnappschuesse -> anonymisieren -> loeschen -> kontakte ganz zuletzt.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Body = { kontakt_id?: unknown; modus?: unknown; freigabe?: unknown };

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });

  let koerper: Body = {};
  try {
    koerper = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Die Anfrage war unlesbar.' }, { status: 400 });
  }

  const kontaktId = String(koerper.kontakt_id ?? '').trim();
  const modus = String(koerper.modus ?? 'vorschau').trim() === 'loeschen' ? 'loeschen' : 'vorschau';
  if (!kontaktId) return NextResponse.json({ ok: false, error: 'Es wurde kein Kontakt angegeben.' }, { status: 400 });

  // ---- Bremse 1: nur der Betriebsinhaber -----------------------------------
  const { data: kontakt } = await supabase
    .from('kontakte').select('*').eq('id', kontaktId).maybeSingle();
  if (!kontakt) {
    return NextResponse.json({ ok: false, error: 'Der Kontakt wurde nicht gefunden.' }, { status: 404 });
  }

  const k = kontakt as Record<string, unknown>;
  const owner = String(k.owner_user_id ?? '');
  if (owner !== user.id) {
    return NextResponse.json({
      ok: false,
      error: 'Eine Löschung nach Art. 17 DSGVO darf nur der Betriebsinhaber auslösen.',
    }, { status: 403 });
  }

  const person = [k.vorname, k.nachname].filter(Boolean).join(' ').trim()
    || String(k.firma ?? '').trim()
    || String(k.email ?? '').trim()
    || 'Kontakt';

  // ---- Bremse 4: der Plan wird vor jedem Lauf neu geprueft -----------------
  const plan = baueLoeschPlan();
  const planFehler = pruefePlan(plan);
  if (planFehler.length > 0) {
    return NextResponse.json({
      ok: false,
      error: 'Der Löschplan ist nicht schlüssig — es wurde nichts verändert.',
      details: planFehler,
    }, { status: 500 });
  }

  const ergebnis: LoeschErgebnis = leeresErgebnis();

  // ---- Was bleibt: zaehlen (immer, auch in der Vorschau) -------------------
  for (const ort of orteMitArt('behalten')) {
    try {
      const { count, error } = await supabase
        .from(ort.tabelle)
        .select('id', { count: 'exact', head: true })
        .eq(ort.spalte, kontaktId);
      if (error) { ergebnis.uebersprungen.push(ort.tabelle); continue; }
      zaehleDazu(ergebnis.behalten, ort.tabelle, count ?? 0);
    } catch {
      ergebnis.uebersprungen.push(ort.tabelle);
    }
  }

  // =========================================================================
  // VORSCHAU — zaehlt nur, aendert nichts
  // =========================================================================
  if (modus === 'vorschau') {
    for (const s of plan) {
      if (s.tabelle === 'kontakte') { zaehleDazu(ergebnis.geloescht, 'kontakte', 1); continue; }
      try {
        const { count, error } = await supabase
          .from(s.tabelle)
          .select('id', { count: 'exact', head: true })
          .eq(s.spalte, kontaktId);
        if (error) { ergebnis.uebersprungen.push(s.tabelle); continue; }
        const ziel = s.art === 'loeschen' ? ergebnis.geloescht : ergebnis.anonymisiert;
        zaehleDazu(ziel, s.tabelle, count ?? 0);
      } catch {
        ergebnis.uebersprungen.push(s.tabelle);
      }
    }

    return NextResponse.json({
      ok: true,
      modus: 'vorschau',
      person,
      zusammenfassung: fasseZusammen(ergebnis),
      geloescht: alsListe(ergebnis.geloescht),
      anonymisiert: alsListe(ergebnis.anonymisiert),
      behalten: alsListe(ergebnis.behalten).map((b) => ({
        ...b,
        grund: orteMitArt('behalten').find((o) => o.tabelle === b.tabelle)?.begruendung ?? '',
      })),
      uebersprungen: ergebnis.uebersprungen.length,
    });
  }

  // =========================================================================
  // LOESCHEN — ab hier wird die Datenbank veraendert
  // =========================================================================

  // ---- Bremse 3: das Freigabewort ------------------------------------------
  const freigabe = pruefeFreigabe(koerper.freigabe);
  if (!freigabe.ok) {
    return NextResponse.json({ ok: false, error: freigabe.fehler }, { status: 400 });
  }

  // Protokollzeile zuerst — falls unterwegs etwas schiefgeht, ist der Versuch
  // trotzdem dokumentiert. Ein Loeschvorgang ohne Spur waere das Gegenteil
  // von Nachweisbarkeit.
  let protokollId: string | null = null;
  try {
    const { data: p } = await supabase
      .from('dsgvo_loeschungen')
      .insert({
        owner_user_id: user.id,
        akteur_id: user.id,
        kontakt_id: kontaktId,
        kontakt_kennung: person,
        modus: 'loeschen',
        behalten: ergebnis.behalten,
      })
      .select('id')
      .maybeSingle();
    protokollId = (p as { id?: string } | null)?.id ?? null;
  } catch { /* Protokollfehler darf den Vorgang nicht verhindern */ }

  // ---- Schritt A: Namens-Schnappschuesse ----------------------------------
  // MUSS vor allem anderen laufen: danach ist der Name weg.
  for (const s of SCHNAPPSCHUESSE) {
    try {
      const { error } = await supabase
        .from(s.tabelle)
        .update({ [s.feld]: person })
        .eq(s.spalte, kontaktId)
        .is(s.feld, null);
      if (error) ergebnis.fehler.push(`${s.label}: Name konnte nicht gesichert werden.`);
    } catch {
      ergebnis.fehler.push(`${s.label}: Name konnte nicht gesichert werden.`);
    }
  }

  // ---- Schritt B: anonymisieren -------------------------------------------
  for (const s of plan.filter((x) => x.art === 'anonymisieren')) {
    try {
      // Erst EINE Zeile lesen, um die tatsaechlich vorhandenen Spalten zu
      // kennen. Es wird nichts geraten.
      const { data: probe, error: probeFehler } = await supabase
        .from(s.tabelle).select('*').eq(s.spalte, kontaktId).limit(1);
      if (probeFehler) { ergebnis.uebersprungen.push(s.tabelle); continue; }

      const zeilen = (probe as Array<Record<string, unknown>>) ?? [];
      if (zeilen.length === 0) continue;

      const ersteZeile = zeilen[0];
      const aenderung = anonymAenderung(Object.keys(ersteZeile));
      if (Object.keys(aenderung).length === 0) continue;

      const { data: geaendert, error } = await supabase
        .from(s.tabelle)
        .update(aenderung)
        .eq(s.spalte, kontaktId)
        .select('id');
      if (error) { ergebnis.fehler.push(`${s.label}: ${error.message}`); continue; }
      zaehleDazu(ergebnis.anonymisiert, s.tabelle, (geaendert as unknown[] | null)?.length ?? 0);
    } catch {
      ergebnis.uebersprungen.push(s.tabelle);
    }
  }

  // ---- Schritt C: loeschen (alles ausser kontakte) -------------------------
  for (const s of plan.filter((x) => x.art === 'loeschen' && x.tabelle !== 'kontakte')) {
    try {
      const { data: weg, error } = await supabase
        .from(s.tabelle)
        .delete()
        .eq(s.spalte, kontaktId)
        .select('id');
      if (error) { ergebnis.uebersprungen.push(s.tabelle); continue; }
      zaehleDazu(ergebnis.geloescht, s.tabelle, (weg as unknown[] | null)?.length ?? 0);
    } catch {
      ergebnis.uebersprungen.push(s.tabelle);
    }
  }

  // ---- Schritt D: die Stammdaten ganz zuletzt ------------------------------
  // Loest die Fremdschluessel-Kaskaden aus: Gespraechsverlauf, Schlagworte und
  // Portalzugang gehen mit, die Branchentabellen werden auf leer gesetzt.
  const { error: kontaktFehler } = await supabase.from('kontakte').delete().eq('id', kontaktId);
  if (kontaktFehler) {
    ergebnis.fehler.push(`Stammdaten: ${kontaktFehler.message}`);
  } else {
    zaehleDazu(ergebnis.geloescht, 'kontakte', 1);
  }

  // ---- Protokoll abschliessen ---------------------------------------------
  if (protokollId) {
    try {
      await supabase.from('dsgvo_loeschungen').update({
        geloescht: ergebnis.geloescht,
        anonymisiert: ergebnis.anonymisiert,
        behalten: ergebnis.behalten,
        uebersprungen: ergebnis.uebersprungen,
        fehler: ergebnis.fehler,
        fertig_am: new Date().toISOString(),
      }).eq('id', protokollId);
    } catch { /* siehe oben */ }
  }

  const heute = new Date().toLocaleDateString('de-DE');

  return NextResponse.json({
    ok: ergebnis.fehler.length === 0,
    modus: 'loeschen',
    person,
    protokoll_id: protokollId,
    zusammenfassung: fasseZusammen(ergebnis),
    geloescht: alsListe(ergebnis.geloescht),
    anonymisiert: alsListe(ergebnis.anonymisiert),
    behalten: alsListe(ergebnis.behalten),
    fehler: ergebnis.fehler,
    antworttext: baueAntworttext(person, ergebnis, heute),
  });
}
