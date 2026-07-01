'use client';
import { usePathname } from 'next/navigation';
// ============================================================
// ARGONAUT OS · Dashboard-Navigation (zentral)
// EINE Stelle fuer alle Menuepunkte. Neuer Eintrag = eine Zeile.
//   label     : Text im Menue (Emoji optional)
//   href      : Zielseite
//   highlight  : true = dauerhaft golden hervorgehoben (wie Automatisierungen)
// ============================================================
type NavLink = {
  label: string;
  href: string;
  highlight?: boolean;
};
const NAV_LINKS: NavLink[] = [
  { label: 'Übersicht', href: '/dashboard' },
  { label: 'Leads', href: '/dashboard/leads' },
  { label: 'Chat', href: '/dashboard/chat' },
  { label: '📄 Dokumente', href: '/dashboard/documents' },
  { label: 'Personal', href: '/dashboard/personal' },
  { label: '🗓 Schichtplan', href: '/dashboard/schichtplan' },
  { label: '📁 Projekte', href: '/dashboard/projekte' },
  { label: '📣 Marketing', href: '/dashboard/marketing' },
  { label: '🤝 Vertrieb/CRM', href: '/dashboard/crm' },
  { label: '📋 Aufträge', href: '/dashboard/auftraege' },
  { label: '🧾 Rechnungen', href: '/dashboard/rechnungen' },
  { label: '⚙️ Automatisierungen', href: '/dashboard/automatisierungen', highlight: true },
  { label: 'Einstellungen', href: '/dashboard/einstellungen' },
];
export default function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {NAV_LINKS.map((link) => {
        // /dashboard nur exakt aktiv, sonst wuerde es auf jeder Unterseite leuchten;
        // Unterseiten via startsWith (z.B. /dashboard/leads/123 -> Leads aktiv)
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
