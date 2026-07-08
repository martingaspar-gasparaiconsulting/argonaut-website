// app/api/gobd-finalisieren/route.ts
// ============================================================
// ARGONAUT OS · Block 1.2d · GoBD festschreiben (Versionierung)
// Markiert den aktuellen Entwurf als 'final' mit fortlaufender Versionsnummer
// und legt einen frischen Entwurf (Kopie) zum Weiterarbeiten an.
// Fruehere Fassungen bleiben erhalten -> GoBD-Nachvollziehbarkeit.
// ============================================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    // aktuellen Entwurf holen
    const { data: entwurf } = await supabase.from('gobd_verfahrensdoku')
      .select('id,inhalt').eq('owner_user_id', user.id).eq('status', 'entwurf')
      .order('aktualisiert_am', { ascending: false }).limit(1).maybeSingle();
    if (!entwurf) {
      return NextResponse.json({ error: 'Kein Entwurf zum Festschreiben vorhanden. Bitte zuerst speichern.' }, { status: 404 });
    }

    // naechste finale Versionsnummer
    const { data: letzter } = await supabase.from('gobd_verfahrensdoku')
      .select('version').eq('owner_user_id', user.id).eq('status', 'final')
      .order('version', { ascending: false }).limit(1).maybeSingle();
    const finalVersion = (letzter?.version || 0) + 1;
    const jetzt = new Date().toISOString();

    // Entwurf -> final festschreiben
    const { error: upErr } = await supabase.from('gobd_verfahrensdoku')
      .update({ status: 'final', version: finalVersion, aktualisiert_am: jetzt })
      .eq('id', entwurf.id).eq('owner_user_id', user.id);
    if (upErr) throw upErr;

    // frischen Arbeits-Entwurf anlegen (Kopie des Inhalts)
    const { error: insErr } = await supabase.from('gobd_verfahrensdoku')
      .insert({ owner_user_id: user.id, status: 'entwurf', version: finalVersion + 1, inhalt: entwurf.inhalt });
    if (insErr) throw insErr;

    return NextResponse.json({ ok: true, version: finalVersion });
  } catch (e: any) {
    console.error('GoBD finalisieren Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Festschreiben fehlgeschlagen.' }, { status: 500 });
  }
}
