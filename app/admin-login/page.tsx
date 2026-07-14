"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

// ============================================================================
// ARGONAUT OS · app/admin-login/page.tsx
//
// Liegt BEWUSST ausserhalb von /admin, damit das Admin-Schloss (app/admin/
// layout.tsx) diese Login-Seite nicht selbst blockiert.
//
// Kein NEXT_PUBLIC_ADMIN_EMAIL-Vergleich mehr. Die echte Sperre sitzt server-
// seitig im /admin-Layout. Der role-Check hier dient nur einer sauberen
// Fehlermeldung, statt den Nutzer nach dem Login still zurueckzuwerfen.
// ============================================================================

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError || !data.user) {
      setError("Login fehlgeschlagen.");
      setLoading(false);
      return;
    }

    // Nur Admins duerfen ins Command Center. Serverseitig erzwingt das ohnehin
    // das /admin-Layout — hier nur fuer eine klare Rueckmeldung.
    const { data: profil } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profil || profil.role !== "admin") {
      await supabase.auth.signOut();
      setError("Kein Admin-Zugang für dieses Konto.");
      setLoading(false);
      return;
    }

    router.push("/admin/command-center");
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0A1628", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #C9A84C", borderRadius: 12, padding: 48, width: 400 }}>
        <h1 style={{ color: "#C9A84C", fontFamily: "Syne, sans-serif", fontSize: 24, marginBottom: 8, textAlign: "center" }}>ARGONAUT OS</h1>
        <p style={{ color: "#ffffff80", fontSize: 14, textAlign: "center", marginBottom: 32 }}>Command Center Zugang</p>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <input type="email" placeholder="Admin E-Mail" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: "100%", padding: "12px 16px", background: "#0A1628", border: "1px solid #ffffff30", borderRadius: 8, color: "#fff", fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <input type="password" placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: "100%", padding: "12px 16px", background: "#0A1628", border: "1px solid #ffffff30", borderRadius: 8, color: "#fff", fontSize: 14, boxSizing: "border-box" }} />
          </div>
          {error && <p style={{ color: "#ff4444", fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ width: "100%", padding: "14px", background: "#C9A84C", color: "#0A1628", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>{loading ? "Wird geprüft..." : "Einloggen"}</button>
        </form>
      </div>
    </main>
  );
}
