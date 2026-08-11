// ============================================================================
// ARGONAUT OS · lib/dossierPdf.ts
// Rendert das Branchen-Dossier-HTML (dunkles Design) über Gotenberg zu einem
// ECHTEN PDF — im Gegensatz zur Rechnung MIT printBackground=true, damit der
// Navy-Hintergrund und alle getönten Karten mitgedruckt werden. Sonst lässt
// Chromium beim PDF-Druck Hintergründe weg → weiße Seite mit hellem Text.
// SERVER-ONLY (Gotenberg-Zugang). Gibt den PDF-Buffer zurück oder null.
// ============================================================================

export async function dossierPdf(html: string): Promise<Buffer | null> {
  const gotenbergUrl = process.env.GOTENBERG_URL;
  if (!gotenbergUrl) {
    console.error('GOTENBERG_URL fehlt — kein Dossier-PDF.');
    return null;
  }
  const gUser = process.env.GOTENBERG_USER;
  const gPass = process.env.GOTENBERG_PASSWORD;
  try {
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    // Der entscheidende Schalter: Hintergründe (Navy + Karten) mitdrucken.
    form.append('printBackground', 'true');
    // Vollflächig (kein weißer Rand) — der Innenabstand kommt aus dem HTML (.wrap).
    form.append('marginTop', '0');
    form.append('marginBottom', '0');
    form.append('marginLeft', '0');
    form.append('marginRight', '0');
    // Sauberes A4-Format für den deutschen Markt.
    form.append('paperWidth', '8.27');
    form.append('paperHeight', '11.69');

    const authHeader =
      gUser && gPass ? 'Basic ' + Buffer.from(`${gUser}:${gPass}`).toString('base64') : '';

    const resp = await fetch(`${gotenbergUrl.replace(/\/$/, '')}/forms/chromium/convert/html`, {
      method: 'POST',
      headers: authHeader ? { Authorization: authHeader } : undefined,
      body: form,
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      console.error('Dossier Gotenberg Fehler:', resp.status, t.slice(0, 200));
      return null;
    }
    return Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    console.error('Dossier Gotenberg nicht erreichbar:', e);
    return null;
  }
}
