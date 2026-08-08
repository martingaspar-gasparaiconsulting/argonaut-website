// ============================================================
// ARGONAUT OS · bildKlein.ts — Bild im Browser verkleinern (vor dem Upload)
// Längste Kante auf maxKante begrenzen und als WebP speichern. Aus 8 MB werden
// so oft ~300 KB. Fällt etwas aus (altes Browser, GIF, kein Gewinn) → Original.
// Gemeinsame Quelle für FotoPicker (Auswahl-Dialog) und den Desktop-Drag-Upload
// im Vollbild-Editor. Reine Browser-Funktion (createImageBitmap/canvas).
// ============================================================

export async function verkleinereBild(datei: File, maxKante: number, qualitaet: number): Promise<Blob> {
  if (datei.type === 'image/gif') return datei; // Animation nicht zerstören
  try {
    const bmp = await createImageBitmap(datei);
    const skal = Math.min(1, maxKante / Math.max(bmp.width, bmp.height));
    if (skal >= 1 && datei.size < 600 * 1024) { bmp.close?.(); return datei; } // schon klein
    const w = Math.max(1, Math.round(bmp.width * skal));
    const h = Math.max(1, Math.round(bmp.height * skal));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bmp.close?.(); return datei; }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/webp', qualitaet));
    if (!blob || blob.size >= datei.size) return datei; // kein Gewinn → Original
    return blob;
  } catch {
    return datei;
  }
}
