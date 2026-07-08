'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// ============================================================
// ARGONAUT OS · Dashboard-Navigation (zentral) · R-3 rechte-bewusst
// Chef sieht alles. Mitarbeiter sieht nur freigeschaltete Module.
// "immer" = jeder (Übersicht/Einstellungen). "nurChef" = nur der Chef.
// modul-Schlüssel identisch mit /dashboard/rechte + middleware.
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

type NavLink = {
  label: string;
  href: string;
  highlight?: boolean;
  modul?: string;   // erforderliches Recht
  immer?: boolean;  // jeder darf
  nurChef?: boolean;// nur der Chef
};

const NAV_LINKS: NavLink[] = [
  { label: '🏠 Übersicht', href: '/dashboard', immer: true },
  { label: '🤖 Agenten', href: '/dashboard/agenten', modul: 'agenten' },
  { label: '🎓 Academy', href: '/dashboard/academy', modul: 'academy' },
  { label: '🎯 Leads', href: '/dashboard/leads', modul: 'leads' },
  { label: '💬 Chat', href: '/dashboard/chat', modul: 'chat' },
  { label: '🗨️ Team-Chat', href: '/dashboard/team-chat', modul: 'team-chat' },
  { label: '📄 Dokumente', href: '/dashboard/documents', modul: 'dokumente' },
  { label: '✉️ Korrespondenz', href: '/dashboard/korrespondenz', modul: 'korrespondenz' },
  { label: '👥 Personal', href: '/dashboard/personal', modul: 'personal' },
  { label: '🗓 Schichtplan', href: '/dashboard/schichtplan', modul: 'schichtplan' },
  { label: '🕐 Zeit-Nachweis', href: '/dashboard/arbeitszeit-nachweis', nurChef: true },
  { label: '🗂 GoBD', href: '/dashboard/gobd', nurChef: true },
  { label: '📁 Projekte', href: '/dashboard/projekte', modul: 'projekte' },
  { label: '📣 Marketing', href: '/dashboard/marketing', modul: 'marketing' },
  { label: '🤝 Vertrieb/CRM', href: '/dashboard/crm', modul: 'crm' },
  { label: '📋 Aufträge', href: '/dashboard/auftraege', modul: 'auftraege' },
  { label: '🧾 Rechnungen', href: '/dashboard/rechnungen', modul: 'rechnungen' },
  { label: '⚠️ Mahnwesen', href: '/dashboard/mahnwesen', modul: 'mahnwesen' },
  { label: '💶 Finanzen', href: '/dashboard/finanzen', modul: 'finanzen' },
  { label: '📦 ERP/Lager', href: '/dashboard/erp', modul: 'erp' },
  { label: '📑 Verträge', href: '/dashboard/vertraege', modul: 'vertraege' },
  { label: '🎫 Service', href: '/dashboard/service', modul: 'service' },
  { label: '🔧 Wartung', href: '/dashboard/wartung', modul: 'wartung' },
  { label: '🏗 Objektzeiten', href: '/dashboard/objektzeiten', modul: 'objektzeiten' },
  { label: '📅 Buchungen', href: '/dashboard/buchungen', modul: 'buchungen' },
  { label: '🔨 Werkstatt', href: '/dashboard/werkstatt', modul: 'werkstatt' },
  { label: '📊 Analytics', href: '/dashboard/analytics', modul: 'analytics' },
  { label: '⚙️ Automatisierungen', href: '/dashboard/automatisierungen', highlight: true, modul: 'automatisierungen' },
  { label: '🔐 Rechte', href: '/dashboard/rechte', nurChef: true },
  { label: '🔧 Einstellungen', href: '/dashboard/einstellungen', immer: true },
];

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

  const sichtbar = NAV_LINKS.filter((l) => {
    // Grundausstattung immer sichtbar - nie vom Starter-Modus versteckbar
    if (l.immer) return true;
    if (!geladen) return false;      // bis geladen: nur Grundausstattung (kein Aufblitzen)

    if (istChef) {
      if (l.nurChef) return true;    // Chef sieht Rechte immer
      // Starter-Modus: nur beim Chef, nur für Module mit modul-Schlüssel
      if (l.modul && sichtbareModule !== null && !sichtbareModule.has(l.modul)) return false;
      return true;
    }

    // Mitarbeiter: unveränderte RBAC-Logik
    if (l.nurChef) return false;
    return l.modul ? erlaubt.has(l.modul) : false;
  });

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
