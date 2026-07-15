'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { sichtbareNavLinks, gruppiereNavLinks } from '../../lib/rechte';
import { gebuchteModulKeys, nurGebuchteLinks, type TenantModulRow } from '../../lib/tenantModule';

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

        // Ist der eingeloggte Nutzer ein Mitarbeiter? (kein Eintrag = Chef)
        const { data: ma } = await supabase
          .from('mitarbeiter')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        if (!ma) {
          if (aktiv) { setIstChef(true); setGeladen(true); }
          return;
        }

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

  // Bis geladen: nur die Übersicht zeigen. Kein Aufblitzen von Knöpfen, die
  // der Nutzer gar nicht anklicken darf.
  const sichtbar = geladen
    ? sichtbareNavLinks(istChef, erlaubt, sichtbareModule)
    : sichtbareNavLinks(false, new Set(), null).filter((l) => l.href === '/dashboard');

  // P49: zusaetzlich auf die vom Betreiber gebuchten Module einschraenken.
  // Fail-open (gebucht === null) reicht die Liste unveraendert durch.
  const sichtbarGebucht = nurGebuchteLinks(sichtbar, gebucht);

  // Q2: sichtbare Links in Gruppen-Bloecke ordnen (leere Gruppen fallen raus).
  const gruppen = gruppiereNavLinks(sichtbarGebucht);

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
              return (
                <a key={link.href} href={link.href} style={stil}>
                  {link.label}
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
