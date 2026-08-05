'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { sichtbareNavLinks, gruppiereNavLinks, nurNachNutzerTyp } from '../../lib/rechte';
import { gebuchteModulKeys, nurGebuchteLinks, type TenantModulRow } from '../../lib/tenantModule';
import { aktiveModuleAmStandort, nurStandortAktiveLinks, type StandortModulRow } from '../../lib/standortModule';
import { leseStandortCookie, istStandortAktiv } from '../../lib/aktiverStandort';

// ============================================================
// ARGONAUT OS · Dashboard-Navigation (zentral) · R-3 rechte-bewusst
//
// E1.7 — Die Liste steht nicht mehr hier. Sie steht in lib/rechte.ts und wird
// von DIESER Datei und von proxy.ts gelesen. Vorher gab es zwei Listen, die
// sich widersprachen: der Mitarbeiter sah die Knoepfe fuer Personal, Rechnungen,
// Mahnwesen, Finanzen, Vertraege und Analytics — und wurde beim Klick von der
// Middleware kommentarlos zurueckgeworfen. Ausserdem standen "Mein Bereich" und
// "Zeiterfassung" in der Middleware-Whitelist, hatten aber keinen Knopf.
//
// "immer" = jeder. "nurChef" = nur der Chef. "nurMitarbeiter" = nur Angestellte.
//
// P2-1 STARTER-MODUS: Der Chef kann Module ausblenden (profiles.sichtbare_module,
// jsonb-Array der EINGESCHALTETEN modul-Schlüssel). NULL/leer = alles sichtbar
// (safety-first, rückwärtskompatibel). Übersicht/Einstellungen bleiben IMMER da.
// Greift nur beim Chef; Mitarbeiter bleiben bei der RBAC-Logik.
//
// Q2 (14.07.26): Die sichtbaren Links werden ueber gruppiereNavLinks() in
// beschriftete Bloecke (Gruppen) gerendert. Reine Anzeige — Filter/Rechte
// unveraendert. Leere Gruppen erscheinen gar nicht erst.
//
// P49 (14.07.26): AEUSSERSTES Gate — nur vom Betreiber gebuchte Module (Tabelle
// tenant_module) erscheinen. Fail-open: hat der Tenant keine tenant_module-Zeile,
// bleibt alles sichtbar (siehe lib/tenantModule.ts). Rein additiv, laeuft NACH
// sichtbareNavLinks. RLS auf tenant_module scopt die Abfrage automatisch auf den
// eigenen Betreiber (coalesce(mein_chef_id(), auth.uid())).
// ============================================================

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DashboardNav() {
  const pathname = usePathname();
  const [geladen, setGeladen] = useState(false);
  const [istChef, setIstChef] = useState(false);
  const [erlaubt, setErlaubt] = useState<Set<string>>(new Set());
  // Starter-Modus: null = alle Module sichtbar; Set = nur diese modul-Schlüssel sichtbar
  const [sichtbareModule, setSichtbareModule] = useState<Set<string> | null>(null);
  // P49: gebuchte Module des Betreibers. null = fail-open (nichts ausblenden).
  const [gebucht, setGebucht] = useState<Set<string> | null>(null);
  // G3b: am aktiven Standort freigeschaltete Module. null = fail-open / kein Standort aktiv.
  const [standortAktiv, setStandortAktiv] = useState<Set<string> | null>(null);
  // Block H: Sitz-Typ des Mitarbeiters (voll/standard/self_service). null = Chef/unbekannt.
  const [nutzerTyp, setNutzerTyp] = useState<string | null>(null);
  /**
   * Ungelesene Team-Chat-Nachrichten.
   *
   * Grund: Im Laden ist Betrieb, niemand klickt von sich aus in den Chat. Ohne
   * sichtbaren Zaehler fuellt er sich, und keiner merkt es. Die Zahl kommt aus
   * derselben Benachrichtigungs-Anlage wie die Glocke im Kopf.
   */
  const [chatUngelesen, setChatUngelesen] = useState(0);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (aktiv) setGeladen(true); return; }

        // Starter-Modus des eingeloggten Nutzers laden (nur für den Chef relevant)
        const { data: prof } = await supabase
          .from('profiles')
          .select('sichtbare_module')
          .eq('id', user.id)
          .maybeSingle();
        const sm = prof?.sichtbare_module;
        if (aktiv) setSichtbareModule(Array.isArray(sm) ? new Set(sm as string[]) : null);

        // P49: gebuchte Module des Tenants laden. RLS liefert nur die Zeilen des
        // eigenen Betreibers; keine Zeile = fail-open (gebucht bleibt null).
        // Laeuft fuer Chef UND Mitarbeiter — deshalb VOR der mitarbeiter-Weiche.
        const { data: tm } = await supabase
          .from('tenant_module')
          .select('modul_key, aktiv');
        if (aktiv) setGebucht(gebuchteModulKeys((tm as TenantModulRow[] | null) ?? null));

        // G3b: aktiven Standort aus dem Cookie lesen. NUR bei konkretem Standort
        // (nicht 'alle') die dort freigeschalteten Module laden; RLS scopt auf
        // den eigenen Tenant. Kein Standort aktiv = fail-open (nichts ausblenden).
        const stCookie = leseStandortCookie();
        if (istStandortAktiv(stCookie)) {
          const { data: sm } = await supabase
            .from('standort_module')
            .select('modul_key, aktiv')
            .eq('standort_id', stCookie);
          if (aktiv) setStandortAktiv(aktiveModuleAmStandort((sm as StandortModulRow[] | null) ?? null));
        } else if (aktiv) {
          setStandortAktiv(null);
        }

        // Ist der eingeloggte Nutzer ein Mitarbeiter? (kein Eintrag = Chef)
        const { data: ma } = await supabase
          .from('mitarbeiter')
          .select('id, nutzer_typ')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        if (!ma) {
          if (aktiv) { setIstChef(true); setGeladen(true); }
          return;
        }

        // Block H: Sitz-Typ des Mitarbeiters merken (steuert die Sicht).
        if (aktiv) setNutzerTyp(((ma as { nutzer_typ?: string | null }).nutzer_typ) ?? null);

        // Mitarbeiter -> freigeschaltete Module laden
        const { data: recht } = await supabase
          .from('mitarbeiter_rechte')
          .select('module')
          .eq('mitarbeiter_id', ma.id)
          .maybeSingle();

        if (aktiv) {
          setErlaubt(new Set<string>((recht?.module as string[]) || []));
          setGeladen(true);
        }
      } catch {
        if (aktiv) setGeladen(true);
      }
    })();
    return () => { aktiv = false; };
  }, []);

  // Zaehler laden und alle 30 Sekunden auffrischen. Eine einzelne Zahl,
  // kein Datensatz — das kostet praktisch nichts.
  useEffect(() => {
    let aktiv = true;
    const holen = async () => {
      try {
        const { data } = await supabase.rpc('chat_ungelesen_anzahl');
        if (aktiv) setChatUngelesen(typeof data === 'number' ? data : 0);
      } catch { /* ohne Zaehler laeuft das Menue normal weiter */ }
    };
    void holen();
    const takt = setInterval(holen, 30000);
    return () => { aktiv = false; clearInterval(takt); };
  }, []);

  // Bis geladen: nur die Übersicht zeigen. Kein Aufblitzen von Knöpfen, die
  // der Nutzer gar nicht anklicken darf.
  const sichtbar = geladen
    ? sichtbareNavLinks(istChef, erlaubt, sichtbareModule)
    : sichtbareNavLinks(false, new Set(), null).filter((l) => l.href === '/dashboard');

  // Block H: Sitz-Typ-Schicht — nur fuer Mitarbeiter (Chef bleibt voll).
  // self_service = nur Infra, standard = ohne sensible Bereiche, voll = alles.
  const sichtbarTyp = istChef ? sichtbar : nurNachNutzerTyp(sichtbar, nutzerTyp);

  // P49: zusaetzlich auf die vom Betreiber gebuchten Module einschraenken.
  // Fail-open (gebucht === null) reicht die Liste unveraendert durch.
  const sichtbarGebucht = nurGebuchteLinks(sichtbarTyp, gebucht);

  // G3b: zusaetzlich auf die am aktiven Standort freigeschalteten Module
  // einschraenken. Fail-open (standortAktiv === null bzw. kein Standort aktiv)
  // reicht die Liste unveraendert durch.
  const sichtbarStandort = nurStandortAktiveLinks(sichtbarGebucht, standortAktiv);

  // Q2: sichtbare Links in Gruppen-Bloecke ordnen (leere Gruppen fallen raus).
  const gruppen = gruppiereNavLinks(sichtbarStandort);

  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {gruppen.map((gruppe) => (
        <div
          key={gruppe.key}
          style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
        >
          {gruppe.label && (
            <div
              style={{
                fontSize: 'clamp(10px, 0.88vw, 14px)',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(201,168,76,0.55)',
                paddingLeft: '2px',
              }}
            >
              {gruppe.label}
            </div>
          )}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {gruppe.links.map((link) => {
              const aktiv =
                link.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname === link.href || pathname.startsWith(link.href + '/');
              const golden = aktiv || link.highlight;
              const stil: React.CSSProperties = {
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: 'clamp(13px, 1.13vw, 18px)',
                fontWeight: 600,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                color: golden ? '#C9A84C' : 'rgba(255,255,255,0.7)',
                background: golden ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.06)',
                border: golden ? '1px solid rgba(201,168,76,0.3)' : '1px solid transparent',
              };
              const zeigeZaehler = link.href === '/dashboard/team-chat' && chatUngelesen > 0;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  style={zeigeZaehler ? { ...stil, display: 'inline-flex', alignItems: 'center', gap: 7 } : stil}
                >
                  {link.label}
                  {zeigeZaehler && (
                    <span
                      title={chatUngelesen + ' ungelesene Nachricht' + (chatUngelesen === 1 ? '' : 'en')}
                      style={{
                        background: '#E06666',
                        color: '#fff',
                        borderRadius: 999,
                        minWidth: 19,
                        height: 19,
                        padding: '0 6px',
                        fontSize: 11.5,
                        fontWeight: 800,
                        lineHeight: '19px',
                        textAlign: 'center',
                        display: 'inline-block',
                      }}
                    >
                      {chatUngelesen > 9 ? '9+' : chatUngelesen}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
