// ============================================================================
// ARGONAUT OS · lib/modulRecht.ts  (Paket 187)
//
// Prüft in einer Server-Route, ob die angemeldete Person ein Modul sehen bzw.
// ändern darf — auch dann, wenn die Route danach mit dem Service-Schlüssel
// arbeitet (dort greifen die Datenbank-Regeln aus 185b NICHT).
//
// Anlass (Claude-Befund 30.09., Paket 183): /api/marketing/whatsapp-kontakte
// schrieb und löschte mit dem Service-Schlüssel für JEDEN Mitarbeiter des
// Betriebs — ohne Blick auf Sicht- oder Schreibrecht für Marketing.
//
// Chef (mein_chef_id() leer) darf alles im eigenen Betrieb. Mitarbeiter:
// darf_ich_modul_sehen / darf_ich_modul_aendern (p_modul). Jeder Fehler beim
// Prüfen = NEIN (fail-closed) — anders als beim Chef, wo ein Fehler von
// mein_chef_id() wie überall als „Chef" gilt (RLS schützt weiter).
// ============================================================================

export type ModulRechtArt = 'sehen' | 'aendern';
export type ModulRechtErgebnis = { ok: true; betrieb: string; mitarbeiter: boolean } | { ok: false; status: 401 | 403; fehler: string };

/** Reine Entscheidung (testbar). */
export function modulRechtEntscheiden(
  eigeneId: string | null | undefined,
  chef: unknown,
  sehen: unknown,
  aendern: unknown,
  art: ModulRechtArt,
): ModulRechtErgebnis {
  if (!eigeneId) return { ok: false, status: 401, fehler: 'Nicht eingeloggt.' };
  const istMa = typeof chef === 'string' && chef.trim() !== '';
  if (!istMa) return { ok: true, betrieb: eigeneId, mitarbeiter: false };
  const darf = art === 'aendern' ? aendern === true : (sehen === true || aendern === true);
  if (!darf) {
    return { ok: false, status: 403, fehler: art === 'aendern' ? 'Für dieses Modul haben Sie nur Leserechte.' : 'Dieses Modul ist für Sie nicht freigegeben.' };
  }
  return { ok: true, betrieb: String(chef).trim(), mitarbeiter: true };
}

type RpcFaehig = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error?: unknown }> };

/** Mit Supabase (Benutzer-Client der Anfrage). */
export async function modulRechtPruefen(supabase: unknown, eigeneId: string | null | undefined, modul: string, art: ModulRechtArt): Promise<ModulRechtErgebnis> {
  const sb = supabase as RpcFaehig;
  if (!eigeneId) return modulRechtEntscheiden(null, null, false, false, art);
  let chef: unknown = null;
  try { chef = (await sb.rpc('mein_chef_id')).data; } catch { chef = null; }
  if (!(typeof chef === 'string' && chef.trim())) return modulRechtEntscheiden(eigeneId, chef, false, false, art);
  const frag = async (fn: string) => {
    try { const r = await sb.rpc(fn, { p_modul: modul }); return r.error ? false : r.data; } catch { return false; }
  };
  const aendern = await frag('darf_ich_modul_aendern');
  const sehen = art === 'sehen' && aendern !== true ? await frag('darf_ich_modul_sehen') : false;
  return modulRechtEntscheiden(eigeneId, chef, sehen, aendern, art);
}
