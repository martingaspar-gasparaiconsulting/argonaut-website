'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { sichtbareNavLinks } from '../../lib/rechte';

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

  return (
    <nav style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {sichtbar.map((link) => {
        const aktiv =
          link.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === link.href || pathname.startsWith(link.href + '/');
        const golden = aktiv || link.highlight;
        const stil: React.CSSProperties = {
          padding: '6px 14px',
          borderRadius: '8px',
          fontSize: '13px',
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
    </nav>
  );
}
