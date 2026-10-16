import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { betriebsKennung } from "@/lib/betriebBesitzer";
import { startFreiServer, startSperrGrundServer } from "@/lib/freigabeServer";
import { angebotsPosten } from "@/lib/metallzuschlag";
import { angebotsSummen } from "@/lib/kalkulatorUebergabe";
import { steuersatz } from "@/lib/steuersatz";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · HW-1 Teil 2 (Paket 403, 16.10.2026)
// Metallzuschlag als Position(en) an ein Angebot im ENTWURF anhängen.
//  · gesperrt bis Anwalt-Freigabe (Start-Schalter „metallzuschlag", R66) —
//    die Sperre gilt HIER am Server, nicht nur am Knopf
//  · Beträge rechnet der Server selbst aus Notiz/Basis/Metallzahl/Länge
//  · nur Angebote des eigenen Betriebs, nur im Status „entwurf"
//  · Summen danach aus ALLEN Positionen neu (nie Delta draufrechnen)
// ============================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    if (!(await startFreiServer("metallzuschlag"))) {
      return NextResponse.json({ error: (await startSperrGrundServer("metallzuschlag")) || "Noch nicht freigeschaltet." }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const angebotId = String(body?.angebotId ?? "");
    if (!UUID.test(angebotId)) return NextResponse.json({ error: "Bitte ein Angebot wählen." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    const { data: chef } = await supabase.rpc("mein_chef_id");
    const betrieb = betriebsKennung(chef, user.id);
    if (!betrieb) return NextResponse.json({ error: "Betrieb nicht gefunden." }, { status: 403 });

    const { data: ang, error: aErr } = await supabase.from("angebote")
      .select("id, status, titel").eq("id", angebotId).eq("owner_user_id", betrieb).maybeSingle();
    if (aErr) return NextResponse.json({ error: "Angebot konnte nicht geladen werden." }, { status: 500 });
    if (!ang) return NextResponse.json({ error: "Angebot nicht gefunden." }, { status: 404 });
    if (ang.status !== "entwurf") return NextResponse.json({ error: "Nur Angebote im Entwurf können ergänzt werden — verschickte Angebote bleiben unverändert." }, { status: 409 });

    const heute = new Date().toISOString().slice(0, 10);
    const { posten, fehler } = angebotsPosten({
      metall: body?.metall, notiz: body?.notiz, notizDatum: body?.notizDatum, basis: body?.basis,
      bezugskosten: body?.bezugskosten, gutschrift: body?.gutschrift, zeilen: body?.zeilen,
    }, heute, steuersatz(body?.mwst_satz));
    if (fehler) return NextResponse.json({ error: fehler }, { status: 400 });

    const { data: alte, error: lErr } = await supabase.from("angebot_positionen")
      .select("position, menge, einzelpreis, mwst_satz").eq("angebot_id", angebotId).eq("owner_user_id", betrieb);
    if (lErr) return NextResponse.json({ error: "Positionen konnten nicht geladen werden." }, { status: 500 });
    const bestehende = (alte ?? []) as { position: number; menge: number; einzelpreis: number; mwst_satz: number }[];
    const start = bestehende.reduce((m, p) => Math.max(m, Number(p.position) || 0), 0) + 1;

    const { data: neu, error: pErr } = await supabase.from("angebot_positionen")
      .insert(posten.map((p, i) => ({ ...p, owner_user_id: betrieb, angebot_id: angebotId, position: start + i })))
      .select("id");
    if (pErr || !neu?.length) return NextResponse.json({ error: "Positionen konnten nicht übernommen werden." }, { status: 500 });

    const summen = angebotsSummen([...bestehende, ...posten]);
    const { error: sErr } = await supabase.from("angebote")
      .update({ netto_summe: summen.netto, mwst_summe: summen.mwst, brutto_summe: summen.brutto })
      .eq("id", angebotId).eq("owner_user_id", betrieb);
    if (sErr) {
      // Kein Angebot mit falscher Summe stehen lassen: neue Positionen wieder heraus
      await supabase.from("angebot_positionen").delete().in("id", (neu as { id: string }[]).map((x) => x.id));
      return NextResponse.json({ error: "Summe konnte nicht aktualisiert werden — nichts übernommen." }, { status: 500 });
    }
    return NextResponse.json({ angebotId, positionen: posten.length, brutto: summen.brutto });
  } catch (err: unknown) {
    console.error("Angebot-Metallzuschlag Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
