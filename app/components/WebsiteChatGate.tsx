'use client';

// ============================================================
// ARGONAUT OS · WebsiteChatGate
// Zeigt den öffentlichen Vertriebs-Chat (WebsiteChat) NUR auf der
// öffentlichen Website an — nicht im eingeloggten Dashboard-Bereich.
// Rein additiv: WebsiteChat selbst bleibt unverändert.
// Pfad: app/components/WebsiteChatGate.tsx
// ============================================================

import { usePathname } from 'next/navigation';
import WebsiteChat from './WebsiteChat';

export default function WebsiteChatGate() {
  const pathname = usePathname();
  // Im Dashboard (eingeloggter Bereich) keinen Vertriebs-Chat zeigen
  if (pathname && pathname.startsWith('/dashboard')) return null;
  return <WebsiteChat />;
}
