import { redirect } from 'next/navigation';

// ============================================================
// ARGONAUT OS · Anschlüsse → Schnittstellen-Zentrale (zusammengeführt)
// „Anschlüsse" und „Schnittstellen" waren zwei Türen zur selben Sache.
// Ab jetzt gibt es EINE Zentrale: /dashboard/schnittstellen.
// Diese Route leitet dauerhaft dorthin weiter (alte Links/Bookmarks bleiben gültig).
// ============================================================

export default function AnschluesseRedirect() {
  redirect('/dashboard/schnittstellen');
}
