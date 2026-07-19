// ============================================================================
// ARGONAUT OS · lib/qr.ts — eigenständiger QR-Code-Encoder (Byte-Modus, Level M)
//
// KEIN externes Paket. Erzeugt aus einem Text eine QR-Matrix (true = dunkles
// Modul). Ausgelegt für EPC/GiroCode-Zahlungstexte (bis 331 Bytes → bis Version
// 13). Reiner Byte-Modus = maximale Kompatibilität mit Banking-Apps.
//
// Verifiziert: alle Testtexte (inkl. UTF-8-Umlauten) lesen sich mit einem
// unabhängigen QR-Decoder exakt zum Original zurück.
// ============================================================================

// GF(256) — Galois-Feld für Reed-Solomon
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gmul = (a: number, b: number): number => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

function genPoly(n: number): number[] {
  let poly: number[] = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) { next[j] ^= poly[j]; next[j + 1] ^= gmul(poly[j], EXP[i]); }
    poly = next;
  }
  return poly;
}
function rsEC(data: number[], ecLen: number): number[] {
  const gen = genPoly(ecLen);
  const res = new Uint8Array(data.length + ecLen);
  res.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) for (let j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], coef);
  }
  return Array.from(res.slice(data.length));
}

// EC-Level M — Blockstruktur je Version: [ecCodewordsProBlock, [[Blöcke, DatenCwProBlock], ...]]
const MBLOCKS: Record<number, [number, Array<[number, number]>]> = {
  1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]],
  5: [24, [[2, 43]]], 6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]],
  9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]], 11: [30, [[1, 50], [4, 51]]],
  12: [22, [[6, 36], [2, 37]]], 13: [22, [[8, 37], [1, 38]]],
};
const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38],
  8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50], 11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62],
};
function dataCapacity(v: number): number {
  const groups = MBLOCKS[v][1];
  return groups.reduce((s, [n, d]) => s + n * d, 0);
}

function chooseVersion(byteLen: number): number {
  for (let v = 1; v <= 13; v++) {
    const cci = v <= 9 ? 8 : 16;
    const bits = 4 + cci + byteLen * 8;
    if (bits <= dataCapacity(v) * 8) return v;
  }
  throw new Error('Text zu lang für QR (max ~331 Bytes im Byte-Modus).');
}

function encodeData(bytes: number[], v: number): number[] {
  const cap = dataCapacity(v);
  const bitsArr: number[] = [];
  const push = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bitsArr.push((val >> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, v <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capBits = cap * 8;
  for (let i = 0; i < 4 && bitsArr.length < capBits; i++) bitsArr.push(0);
  while (bitsArr.length % 8 !== 0) bitsArr.push(0);
  const cw: number[] = [];
  for (let i = 0; i < bitsArr.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bitsArr[i + j]; cw.push(b); }
  const pads = [0xEC, 0x11]; let pi = 0;
  while (cw.length < cap) { cw.push(pads[pi & 1]); pi++; }
  return cw;
}

function interleave(cw: number[], v: number): number[] {
  const [ecLen, groups] = MBLOCKS[v];
  const blocks: Array<{ data: number[]; ec: number[] }> = [];
  let idx = 0;
  for (const [n, d] of groups) for (let b = 0; b < n; b++) { const data = cw.slice(idx, idx + d); idx += d; blocks.push({ data, ec: rsEC(data, ecLen) }); }
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  const out: number[] = [];
  for (let i = 0; i < maxData; i++) for (const bl of blocks) if (i < bl.data.length) out.push(bl.data[i]);
  for (let i = 0; i < ecLen; i++) for (const bl of blocks) out.push(bl.ec[i]);
  return out;
}

function bitLen(x: number): number { let n = 0; while (x) { n++; x >>= 1; } return n; }
function formatBits(mask: number): number[] {
  const data = (0b00 << 3) | mask; // EC-Level M = 00
  let d = data << 10;
  const g = 0b10100110111;
  while (bitLen(d) > 10) d ^= g << (bitLen(d) - bitLen(g));
  const fmt = ((data << 10) | d) ^ 0b101010000010010;
  const arr: number[] = []; for (let i = 14; i >= 0; i--) arr.push((fmt >> i) & 1);
  return arr;
}
function versionBits(v: number): number[] {
  let d = v << 12;
  const g = 0b1111100100101;
  while (bitLen(d) > 12) d ^= g << (bitLen(d) - bitLen(g));
  const val = (v << 12) | d;
  const arr: number[] = []; for (let i = 17; i >= 0; i--) arr.push((val >> i) & 1);
  return arr;
}

const MASK_FN: Array<(r: number, c: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function buildMatrix(cw: number[], v: number, mask: number): boolean[][] {
  const size = 17 + 4 * v;
  const m: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setF = (r: number, c: number, val: boolean) => { m[r][c] = val ? 1 : 0; fn[r][c] = true; };

  const finder = (r: number, c: number) => {
    for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
      const rr = r + i, cc = c + j;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
      const inRing = (i >= 0 && i <= 6 && (j === 0 || j === 6)) || (j >= 0 && j <= 6 && (i === 0 || i === 6));
      const inCore = i >= 2 && i <= 4 && j >= 2 && j <= 4;
      setF(rr, cc, inRing || inCore);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }

  const ap = ALIGN[v];
  for (const r of ap) for (const c of ap) {
    if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) setF(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1);
  }

  setF(4 * v + 9, 8, true); // dunkles Modul

  for (let i = 0; i <= 8; i++) { if (i !== 6) { fn[8][i] = true; fn[i][8] = true; } }
  for (let i = 0; i < 8; i++) { fn[8][size - 1 - i] = true; fn[size - 1 - i][8] = true; }
  if (v >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { fn[i][size - 11 + j] = true; fn[size - 11 + j][i] = true; }

  const bits: number[] = []; for (const b of cw) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  let bi = 0, up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let t = 0; t < size; t++) {
      const row = up ? size - 1 - t : t;
      for (let c2 = 0; c2 < 2; c2++) {
        const cc = col - c2;
        if (fn[row][cc]) continue;
        let bit = bi < bits.length ? bits[bi++] : 0;
        if (MASK_FN[mask](row, cc)) bit ^= 1;
        m[row][cc] = bit;
      }
    }
    up = !up;
  }

  const fmt = formatBits(mask);
  const fmtPos1: Array<[number, number]> = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  fmtPos1.forEach(([r, c], i) => { m[r][c] = fmt[i]; });
  const fmtPos2: Array<[number, number]> = [[size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8], [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]];
  fmtPos2.forEach(([r, c], i) => { m[r][c] = fmt[i]; });

  if (v >= 7) {
    const vb = versionBits(v);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { const bit = vb[17 - (i * 3 + j)]; m[i][size - 11 + j] = bit; m[size - 11 + j][i] = bit; }
  }

  return m.map((row) => row.map((x) => x === 1));
}

function penalty(m: boolean[][]): number {
  const n = m.length; let p = 0;
  for (let r = 0; r < n; r++) { let run = 1; for (let c = 1; c < n; c++) { if (m[r][c] === m[r][c - 1]) run++; else { if (run >= 5) p += 3 + (run - 5); run = 1; } } if (run >= 5) p += 3 + (run - 5); }
  for (let c = 0; c < n; c++) { let run = 1; for (let r = 1; r < n; r++) { if (m[r][c] === m[r - 1][c]) run++; else { if (run >= 5) p += 3 + (run - 5); run = 1; } } if (run >= 5) p += 3 + (run - 5); }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const v = m[r][c]; if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3; }
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  for (let r = 0; r < n; r++) for (let c = 0; c <= n - 11; c++) { let a = true, b = true; for (let k = 0; k < 11; k++) { if (m[r][c + k] !== pat1[k]) a = false; if (m[r][c + k] !== pat2[k]) b = false; } if (a) p += 40; if (b) p += 40; }
  for (let c = 0; c < n; c++) for (let r = 0; r <= n - 11; r++) { let a = true, b = true; for (let k = 0; k < 11; k++) { if (m[r + k][c] !== pat1[k]) a = false; if (m[r + k][c] !== pat2[k]) b = false; } if (a) p += 40; if (b) p += 40; }
  let dark = 0; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) dark++;
  const ratio = (dark / (n * n)) * 100; p += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return p;
}

/** Erzeugt die QR-Matrix (true = dunkel) für einen Text. Level M, Byte-Modus. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const v = chooseVersion(bytes.length);
  const cw = interleave(encodeData(bytes, v), v);
  let best: boolean[][] | null = null;
  let bestP = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const mm = buildMatrix(cw, v, mask);
    const pp = penalty(mm);
    if (pp < bestP) { bestP = pp; best = mm; }
  }
  return best as boolean[][];
}
