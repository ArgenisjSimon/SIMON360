// mciEtiquetas.js — se carga como módulo desde los componentes del conteo (import dinámico): no está en index.html.
// La misma lógica vive en _db/modules/Modulo_Conteo_Inventario/App_Prueba/etiquetas.js (app de prueba y demo).
/* =============================================================================
   MCI · ETIQUETAS DE CONTEO Y DE UBICACIÓN (F-030, Claudio 14OCT2026)

   Dos etiquetas, 60 × 40 mm, para impresora de etiquetas o cualquier impresora:
     · De CONTEO: se pega en el producto contado. Programa, fase, ubicación, código,
       descripción, operador y fecha; el QR es el CÓDIGO del producto (leerlo en el
       equipo carga el producto). Sin cantidad: el conteo es ciego.
     · De UBICACIÓN: almacén|pasillo|rack|nivel en grande y en QR, en el formato que
       lee el equipo (ALMACEN|PASILLO|RACK|NIVEL, sin prefijo: decisión del 05OCT).
   El QR se genera aquí mismo (sin librerías ni internet): modo byte, corrección M,
   versiones 1 a 10 (hasta 213 bytes). Se verificó leyéndolo con jsQR.
   ============================================================================= */

/* ---------------------------------------------------------------- QR */
const QR_M = [   // por versión: [total de codewords, ec por bloque, bloques del grupo 1, datos g1, bloques g2, datos g2]
  null,
  [26, 10, 1, 16, 0, 0], [44, 16, 1, 28, 0, 0], [70, 26, 1, 44, 0, 0], [100, 18, 2, 32, 0, 0], [134, 24, 2, 43, 0, 0],
  [172, 16, 4, 27, 0, 0], [196, 18, 4, 31, 0, 0], [242, 22, 2, 38, 2, 39], [292, 22, 3, 36, 2, 37], [346, 26, 4, 43, 1, 44]
];
const QR_ALIN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const GF_EXP = new Array(512), GF_LOG = new Array(256);
(function () { let x = 1; for (let i = 0; i < 255; i++) { GF_EXP[i] = x; GF_LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; } for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]; })();
const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
function rsEcc(datos, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const g = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) { g[j] ^= gen[j]; g[j + 1] ^= gfMul(gen[j], GF_EXP[i]); }
    gen = g;
  }
  const buf = datos.concat(new Array(n).fill(0));
  for (let i = 0; i < datos.length; i++) {
    const c = buf[i];
    if (c !== 0) for (let j = 1; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], c);
  }
  return buf.slice(datos.length);
}
function qrMatriz(texto) {
  const bytes = Array.from(new TextEncoder().encode(String(texto)));
  let v = 1;
  for (; v <= 10; v++) {
    const t = QR_M[v], datos = t[2] * t[3] + t[4] * t[5];
    if (4 + (v < 10 ? 8 : 16) + 8 * bytes.length <= datos * 8) break;
  }
  if (v > 10) throw new Error('Texto demasiado largo para la etiqueta (máximo 213 bytes)');
  const [, ecN, b1, d1, b2, d2] = QR_M[v], capacidad = b1 * d1 + b2 * d2;
  // bits: modo byte, largo, datos, terminador, relleno
  const bits = [];
  const pon = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  pon(4, 4); pon(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => pon(b, 8));
  pon(0, Math.min(4, capacidad * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const cw = [];
  for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let k = 0; cw.length < capacidad; k++) cw.push(k % 2 ? 0x11 : 0xEC);
  // bloques con su corrección, intercalados
  const bloques = [];
  let p = 0;
  for (let i = 0; i < b1 + b2; i++) { const n = i < b1 ? d1 : d2; const d = cw.slice(p, p + n); p += n; bloques.push({ d, e: rsEcc(d, ecN) }); }
  const fin = [];
  for (let i = 0; i < Math.max(d1, d2); i++) bloques.forEach(b => { if (i < b.d.length) fin.push(b.d[i]); });
  for (let i = 0; i < ecN; i++) bloques.forEach(b => fin.push(b.e[i]));

  const N = 17 + 4 * v;
  const m = Array.from({ length: N }, () => new Array(N).fill(false));
  const fn = Array.from({ length: N }, () => new Array(N).fill(false));
  const set = (x, y, oscuro) => { m[y][x] = oscuro; fn[y][x] = true; };
  for (let i = 0; i < N; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const buscador = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < N && y >= 0 && y < N) set(x, y, d !== 2 && d !== 4);
    }
  };
  buscador(3, 3); buscador(N - 4, 3); buscador(3, N - 4);
  const al = QR_ALIN[v], ult = al.length - 1;
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === ult) || (i === ult && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const formato = mascara => {
    const dato = (0 << 3) | mascara;              // corrección M = 00
    let r = dato;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((dato << 10) | r) ^ 0x5412, bit = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(N - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, N - 15 + i, bit(i));
    set(8, N - 8, true);
  };
  formato(0);
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) === 1, a = N - 11 + i % 3, c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit); }
  }
  let k = 0;
  for (let der = N - 1; der >= 1; der -= 2) {
    if (der === 6) der = 5;
    for (let vert = 0; vert < N; vert++) for (let j = 0; j < 2; j++) {
      const x = der - j, arriba = ((der + 1) & 2) === 0, y = arriba ? N - 1 - vert : vert;
      if (!fn[y][x] && k < fin.length * 8) { m[y][x] = ((fin[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
    }
  }
  const enmascara = (mk, s) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (fn[y][x]) continue;
      const inv = [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
        (x * y) % 2 + (x * y) % 3 === 0, ((x * y) % 2 + (x * y) % 3) % 2 === 0, ((x + y) % 2 + (x * y) % 3) % 2 === 0][mk];
      if (inv) s[y][x] = !s[y][x];
    }
  };
  const castigo = s => {
    let t = 0;
    const linea = arr => {
      for (let i = 0, run = 1; i < arr.length; i++) {
        if (i + 1 < arr.length && arr[i + 1] === arr[i]) run++;
        else { if (run >= 5) t += 3 + run - 5; run = 1; }
      }
      const txt = arr.map(b => b ? '1' : '0').join('');
      for (const pat of ['10111010000', '00001011101']) { let i = txt.indexOf(pat); while (i >= 0) { t += 40; i = txt.indexOf(pat, i + 1); } }
    };
    for (let y = 0; y < N; y++) linea(s[y]);
    for (let x = 0; x < N; x++) linea(s.map(f => f[x]));
    for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) { const c = s[y][x]; if (c === s[y][x + 1] && c === s[y + 1][x] && c === s[y + 1][x + 1]) t += 3; }
    const osc = s.reduce((a, f) => a + f.filter(Boolean).length, 0), tot = N * N;
    t += (Math.ceil(Math.abs(osc * 20 - tot * 10) / tot) - 1) * 10;
    return t;
  };
  let mejor = null;
  for (let mk = 0; mk < 8; mk++) {
    formato(mk);
    const s = m.map(f => f.slice());
    enmascara(mk, s);
    const c = castigo(s);
    if (!mejor || c < mejor.c) mejor = { c, s, mk };
  }
  formato(mejor.mk);
  const s = m.map(f => f.slice());
  enmascara(mejor.mk, s);
  return s;
}
function qrSvg(texto, margen = 4) {
  const s = qrMatriz(texto), n = s.length, t = n + 2 * margen;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (s[y][x]) d += `M${x + margen} ${y + margen}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/* ---------------------------------------------------------------- etiquetas */
const escE = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ESTILO_ETIQUETAS = `
  @page { size: 60mm 40mm; margin: 0 }
  html, body { margin: 0; padding: 0; background: #fff }
  body { font-family: Arial, Helvetica, sans-serif; color: #000 }
  .et { width: 60mm; height: 40mm; box-sizing: border-box; padding: 2mm 2.2mm; display: flex; gap: 2mm; align-items: stretch; overflow: hidden; page-break-after: always; break-after: page }
  .et:last-child { page-break-after: auto; break-after: auto }
  .qr { width: 25mm; flex: none; display: flex; align-items: center }
  .qr svg { width: 25mm; height: 25mm }
  .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between }
  .cab { font-size: 6.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; border-bottom: .3mm solid #000; padding-bottom: .6mm }
  .cod { font-size: 11pt; font-weight: 800; word-break: break-all; line-height: 1.05 }
  .des { font-size: 7pt; line-height: 1.15; max-height: 2.3em; overflow: hidden }
  .ubi { font-family: 'Courier New', monospace; font-size: 7pt; font-weight: 700; word-break: break-all }
  .pie { font-size: 6pt; color: #000 }
  .grande { font-family: 'Courier New', monospace; font-size: 13pt; font-weight: 800; line-height: 1.15 }
  @media screen { body { background: #e5e7eb; padding: 6mm } .et { background: #fff; margin: 0 auto 4mm; box-shadow: 0 1px 4px rgba(0,0,0,.25) } }`;
function htmlEtiquetaConteo(d) {
  return `<div class="et">
    <div class="qr">${qrSvg(d.codigo)}</div>
    <div class="tx">
      <div class="cab">Conteo · F${escE(d.fase)} · Prog. ${escE(d.programa)}</div>
      <div class="cod">${escE(d.codigo)}</div>
      <div class="des">${escE(d.descrip)}</div>
      <div class="ubi">${escE(d.ubicacion)}</div>
      <div class="pie">Contó ${escE(d.operador)} · ${escE(d.fecha)}</div>
    </div>
  </div>`;
}
function htmlEtiquetaUbicacion(u) {
  const partes = String(u.ubicacion).split('|'), alm = partes.length > 3 ? partes.slice(0, -3).join('|') : '';
  const prn = partes.slice(-3);
  return `<div class="et">
    <div class="qr">${qrSvg(u.ubicacion)}</div>
    <div class="tx">
      <div class="cab">Ubicación${alm ? ' · ' + escE(alm) : ''}</div>
      <div class="grande">${prn.map(escE).join('<br>')}</div>
      <div class="pie">SIMON · Conteo de inventario</div>
    </div>
  </div>`;
}
/* Abre la ventana de impresión con las etiquetas (una por página de 60 × 40 mm). */
function abrirVentanaEtiquetas() { return window.open('', '_blank', 'width=520,height=640'); }
function imprimirEtiquetas(titulo, cuerpo, ventana) {
  const w = ventana || abrirVentanaEtiquetas();
  if (!w) return false;
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${escE(titulo)}</title><style>${ESTILO_ETIQUETAS}</style></head><body>${cuerpo}` +
    `<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},150);});<\/script></body></html>`);
  w.document.close();
  return true;
}
function imprimirConteo(datos) { return imprimirEtiquetas('Etiqueta de conteo · ' + datos.codigo, htmlEtiquetaConteo(datos)); }
function imprimirUbicaciones(lista, ventana) {
  const u = [...new Set((lista || []).filter(Boolean))].map(x => ({ ubicacion: x }));
  if (!u.length) return false;
  return imprimirEtiquetas(u.length === 1 ? 'Etiqueta de ubicación · ' + u[0].ubicacion : u.length + ' etiquetas de ubicación', u.map(htmlEtiquetaUbicacion).join(''), ventana);
}

export { qrSvg, imprimirConteo, imprimirUbicaciones, abrirVentanaEtiquetas };
