/* =============================================================================
   MCI · HAZLO TÚ MISMO SOBRE LAS PANTALLAS REALES (P-064 fase 4, 19OCT2026)

   Ejercicio guiado sobre la demostración del módulo (ConteoInventarioDemo?hazlo=...):
   el USUARIO hace cada paso, con datos inventados que no tocan ninguna base.
   - Riel: solo responde el control del paso actual (y el globo). Lo demás se
     bloquea y el globo avisa.
   - Cada paso se da por cumplido cuando la pantalla lo confirma, no cuando el
     usuario hace clic.
   - Ayuda en tres escalones: el foco, la pista y "Muéstrame" (hace ese paso).
   - El avance se guarda en el navegador (localStorage) y se retoma después.

   Lo carga ConteoInventario.razor y usa sus puntos de control (TutorEntrar,
   TutorIr, TutorMenu). Los controles se señalan con data-tutor (los mismos de
   SIMON Tutor). Migrado desde la maqueta hazlo.js (10OCT2026): mismos pasos y textos.
   ============================================================================= */
(function () {
  'use strict';
  if (window.mciHazlo) return;
  const EJERCICIO = 'mci.carga-productos', VERSION = 2;
  const CLAVE = 'simon.hazlo.' + EJERCICIO + '.v' + VERSION;
  const EMPRESA = 'DEMO-SA', USUARIO = 'MCI_SUP', CED = '99000001', INICIAL = 'MCI_OP2';
  const FILA_ERROR = 18, COD_ERROR = 'DEMO-117';

  const espera = ms => new Promise(r => setTimeout(r, ms));
  const T = n => `[data-tutor="${n}"]`;
  const $1 = s => document.querySelector(s);
  const visible = sel => { const e = $1(sel); return e && e.offsetParent !== null ? e : null; };
  async function hastaVisible(sel, ms) { for (let t = 0; t < ms; t += 100) { const e = visible(sel); if (e) return e; await espera(100); } throw new Error(sel); }
  const swal = () => visible('.swal2-popup .swal2-cancel');   // la confirmación general de SIMON 360

  let pagina = null;
  const entrar = (usuario, reiniciar) => pagina.invokeMethodAsync('TutorEntrar', EMPRESA, usuario, reiniciar);
  const ir = p => pagina.invokeMethodAsync('TutorIr', p, null);

  /* ------------------------------------------------------------------ avance guardado */
  const avance = {
    leer() { try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { return null; } },
    guardar(o) { try { localStorage.setItem(CLAVE, JSON.stringify(Object.assign({ ejercicio: EJERCICIO, version: VERSION }, o, { actualizado: new Date().toISOString() }))); } catch { } },
    borrar() { try { localStorage.removeItem(CLAVE); } catch { } }
  };

  /* ------------------------------------------------------------------ archivos de práctica
     El catálogo de la demo (DEMO-101 a DEMO-143) más dos productos nuevos.
     La versión con error deja sin código la fila 18 de la hoja. */
  function cargarXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = 'lib/xlsx/xlsx.full.min.js'; s.onload = ok; s.onerror = () => mal(new Error('no cargó la librería de Excel')); document.head.appendChild(s); });
  }
  const FAMILIAS = [
    ['TORNILLO AUTORROSCANTE', ['1/4 X 1', '1/4 X 2', '3/8 X 2', '3/8 X 3'], 'UND', 0.12], ['TUERCA HEXAGONAL', ['1/4', '3/8', '1/2'], 'UND', 0.08],
    ['ARANDELA PLANA', ['1/4', '3/8', '1/2'], 'UND', 0.05], ['CABLE THHN 12 AWG', ['ROJO 100M', 'NEGRO 100M', 'BLANCO 100M'], 'ROLLO', 48],
    ['CABLE THHN 14 AWG', ['ROJO 100M', 'NEGRO 100M'], 'ROLLO', 36], ['BOMBILLO LED', ['9W', '12W', '18W'], 'UND', 1.9],
    ['TUBO PVC AGUAS BLANCAS', ['1/2 X 3M', '3/4 X 3M', '1 X 3M'], 'UND', 3.4], ['CODO PVC 90°', ['1/2', '3/4', '1'], 'UND', 0.45],
    ['LLAVE DE PASO', ['1/2', '3/4'], 'UND', 6.8], ['PINTURA ESMALTE', ['BLANCO GALÓN', 'NEGRO GALÓN', 'GRIS GALÓN'], 'GAL', 21, 'Sí'],
    ['BROCHA', ['2 PULG', '3 PULG'], 'UND', 1.6], ['CINTA AISLANTE', ['NEGRA 20M', 'ROJA 20M'], 'UND', 0.9],
    ['SILICÓN TRANSPARENTE', ['280 ML'], 'UND', 3.2, 'Sí'], ['PEGA PVC', ['1/4 GALÓN'], 'UND', 7.5, 'Sí'],
    ['DISCO DE CORTE', ['4-1/2 METAL', '7 METAL'], 'UND', 1.3], ['GUANTES DE SEGURIDAD', ['TALLA M', 'TALLA L'], 'PAR', 2.4],
    ['CANDADO', ['40 MM', '50 MM'], 'UND', 5.5], ['BISAGRA', ['3 PULG', '4 PULG'], 'UND', 1.1]
  ];
  function filasPractica(conError) {
    const f = [];
    FAMILIAS.forEach(([fam, vars, und, costo, lote]) => vars.forEach(v => f.push(['DEMO-' + (101 + f.length), fam + ' ' + v, und, costo, lote || 'No'])));
    f.push(['DEMO-144', 'ESPÁTULA 3 PULG', 'UND', 1.75, 'No'], ['DEMO-145', 'LIJA AL AGUA 120', 'UND', 0.4, 'No']);
    if (conError) f[FILA_ERROR - 2][0] = '';
    return [['Código del producto', 'Descripción del producto', 'Unidad de inventario', 'Costo unitario en divisa', 'Maneja lote'], ...f];
  }
  const nombreArchivo = conError => conError ? 'Practica_Productos_MCI.xlsx' : 'Practica_Productos_MCI_corregido.xlsx';
  async function libro(conError) { await cargarXlsx(); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filasPractica(conError)), 'PRODUCTOS'); return wb; }
  const bajar = async conError => XLSX.writeFile(await libro(conError), nombreArchivo(conError));
  async function elegirArchivo(conError) {   // "Muéstrame": pone el archivo en el campo como si lo hubiera elegido
    const datos = XLSX.write(await libro(conError), { type: 'array', bookType: 'xlsx' });
    const dt = new DataTransfer();
    dt.items.add(new File([datos], nombreArchivo(conError), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const inp = await hastaVisible(T('carga-archivo'), 3000); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  /* El motor revisa el archivo que eligió el usuario: cuántas filas quedan sin código. */
  let archivo = null;          // { n: número de lectura, nombre, sinCodigo: [filas] }
  let lecturas = 0;
  async function revisarArchivo(f) {
    try {
      await cargarXlsx();
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' }), hoja = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false });
      const sin = []; for (let k = 1; k < filas.length; k++) { const r = filas[k] || []; if (r.some(x => x !== '' && x != null) && (r[0] == null || String(r[0]).trim() === '')) sin.push(k + 1); }
      archivo = { n: ++lecturas, nombre: f.name, sinCodigo: sin };
    } catch { archivo = { n: ++lecturas, nombre: f.name, sinCodigo: [] }; }
  }
  const botonCargar = () => { const b = visible(T('carga-cargar')); return b && !b.disabled ? b : null; };
  const sesionSup = async () => { const s = await window.mciDemo.sesion(); return s.clave === -1 && s.cedula === CED; };
  let esSup = false;

  /* ------------------------------------------------------------------ los pasos del ejercicio */
  let tengoArchivo = false, filaTocada = false, lecturaAntes = 0, ayudas = 0, inicio = Date.now();
  const PASOS = [
    { titulo: 'Bienvenida', bienvenida: true,
      texto: '<b>Hazlo tú mismo · Cargar el catálogo de productos.</b> Va a cargar desde Excel el catálogo de una ferretería en el módulo de conteo, en modalidad STAND ALONE. Usted hace cada paso; yo le indico dónde y reviso que quede bien. Unos 5 minutos.' },
    { titulo: 'El archivo de práctica', reanudar: 1,
      texto: 'Primero, el archivo. Baje el <b>Excel de práctica</b>: 45 productos de ferretería. <small>Tiene un error puesto a propósito: lo va a encontrar más adelante.</small>',
      botones: [['Bajar el archivo de práctica', async () => { await bajar(true); tengoArchivo = true; }], ['Ya lo tengo', () => { tengoArchivo = true; }]],
      listo: () => tengoArchivo,
      pista: 'Pulse "Bajar el archivo de práctica". Queda en la carpeta de Descargas de su equipo.',
      muestrame: async () => { await bajar(true); tengoArchivo = true; } },
    { titulo: 'Entrar como supervisor', reanudar: 2, el: T('demo-usuario'), permitir: [T('demo-empresa')],
      texto: 'Está en la demostración como <b>operador</b>, que no puede cargar. Cambie el <b>Usuario</b> a <b>MCI_SUP</b>, el supervisor, en la empresa <b>DEMO-SA</b> (STAND ALONE). <small>La carga la hace el supervisor o quien configura: en la demo, MCI_SUP tiene los dos permisos.</small>',
      listo: () => esSup,
      vigilar: () => { const e = $1(T('demo-empresa')); if (e && e.value !== '-1') return 'La carga desde Excel existe solo en STAND ALONE: use la empresa <b>DEMO-SA</b>.'; },
      pista: 'Arriba, en la franja amarilla de la demostración: el combo "Usuario", elija MCI_SUP.',
      muestrame: async () => { await entrar(USUARIO, false); } },
    { titulo: 'Ir a Cargas Excel', reanudar: 3,
      el: () => visible(T('menu-cargas')) ? T('menu-cargas') : T('menu'),
      texto: 'Abra <b>Cargas Excel</b> en el menú del módulo. <small>El menú se abre con la pestaña azul "Menú Conteo".</small>',
      listo: () => !!visible(T('carga-archivo')),
      pista: 'Toque la pestaña azul "Menú Conteo" y elija "Cargas Excel".',
      muestrame: async () => ir('cargas') },
    { titulo: 'Elegir el archivo', reanudar: 4, el: T('carga-archivo'),
      entrar: () => { lecturaAntes = lecturas; },
      texto: 'Elija el archivo <b>Practica_Productos_MCI.xlsx</b> que bajó. El sistema reconoce las columnas por su encabezado y le muestra una vista previa.',
      listo: () => archivo && archivo.n > lecturaAntes && !!botonCargar(),
      vigilar: () => { if (archivo && archivo.n > lecturaAntes && visible(T('carga-columnas')) && !botonCargar()) return 'Ese archivo no tiene las columnas del catálogo. Elija <b>Practica_Productos_MCI.xlsx</b>.'; },
      pista: 'Toque el campo de archivo ("Elegir archivo") y busque el Excel en Descargas.',
      muestrame: async () => elegirArchivo(true) },
    { titulo: 'Validar y cargar', reanudar: 4,
      el: () => swal() ? '.swal2-popup' : T('carga-cargar'), permitir: ['.swal2-container'],
      texto: 'Revise la vista previa: las columnas obligatorias tienen ✓. Pulse <b>Validar y cargar</b> y confirme. <small>La carga es todo o nada: si una fila tiene un error, no se cambia nada.</small>',
      listo: () => !!visible(T('carga-errores')),
      salto: () => visible(T('carga-ok')) ? 9 : null,
      pista: 'El botón "Validar y cargar 45 filas" está debajo de la vista previa. Luego, en el cuadro, pulse "Sí".',
      muestrame: async () => { botonCargar().click(); for (let t = 0; t < 30 && !swal(); t++) await espera(100); $1('.swal2-popup .swal2-confirm').click(); } },
    { titulo: 'Encontrar el error', reanudar: 6, el: T('carga-errores') + ' tbody tr',
      entrar: () => { filaTocada = false; },
      texto: '<b>La carga se rechazó y no se cambió nada.</b> El sistema lista cada error con su fila, columna y motivo. Toque la fila del error.',
      listo: () => filaTocada,
      alCumplir: `Exacto: la <b>fila ${FILA_ERROR}</b> no tiene código, y el código es obligatorio. Por eso no entró ningún producto.`,
      pista: 'Es la única fila de la lista roja de errores.',
      muestrame: async () => { filaTocada = true; } },
    { titulo: 'Corregir el archivo', reanudar: 6, el: T('carga-archivo'),
      entrar: () => { lecturaAntes = lecturas; },
      texto: `Corrija el Excel: escriba <b>${COD_ERROR}</b> en la fila ${FILA_ERROR}, columna "Código del producto", guárdelo y elíjalo de nuevo. <small>Si prefiere, baje la versión ya corregida.</small>`,
      botones: [['Bajar la versión corregida', () => bajar(false)]],
      listo: () => archivo && archivo.n > lecturaAntes && !archivo.sinCodigo.length && !!botonCargar(),
      vigilar: () => { if (archivo && archivo.n > lecturaAntes && archivo.sinCodigo.length) return `Ese archivo todavía tiene una fila sin código (fila ${archivo.sinCodigo[0]}). Corríjala y elíjalo otra vez.`; },
      pista: `Abra el Excel, vaya a la fila ${FILA_ERROR}, escriba ${COD_ERROR} en la primera columna y guarde. O use "Bajar la versión corregida".`,
      muestrame: async () => elegirArchivo(false) },
    { titulo: 'Confirmar la carga', reanudar: 6,
      el: () => swal() ? '.swal2-popup' : T('carga-cargar'), permitir: ['.swal2-container'],
      texto: 'Ahora sí: <b>Validar y cargar</b>, y confirme.',
      listo: () => !!visible(T('carga-ok')),
      pista: 'El mismo botón de antes, debajo de la vista previa. Luego "Sí" en el cuadro.',
      muestrame: async () => { botonCargar().click(); for (let t = 0; t < 30 && !swal(); t++) await espera(100); $1('.swal2-popup .swal2-confirm').click(); } },
    { titulo: 'Listo', cierre: true }
  ];
  const TOTAL = PASOS.length;

  /* ------------------------------------------------------------------ globo, foco y riel */
  function armar() {
    const css = document.createElement('style');
    css.textContent = `
    #hz-foco{position:fixed;z-index:10000;border:2px solid #2563eb;border-radius:10px;box-shadow:0 0 0 9999px rgba(15,23,42,.55);pointer-events:none;transition:all .3s ease}
    #hz-foco.nada{top:50%!important;left:50%!important;width:0!important;height:0!important;border:0}
    #hz-globo{position:fixed;z-index:10001;width:min(400px,calc(100vw - 24px));background:#eff6ff;color:#1f2937;border:1px solid #2563eb;border-radius:12px;
      box-shadow:0 14px 34px rgba(0,0,0,.3);padding:14px 16px 12px;font:14.5px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;transition:top .3s ease,left .3s ease}
    #hz-globo .t{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#1e40af;margin-bottom:6px;display:flex;justify-content:space-between;gap:10px}
    #hz-globo .pasos{display:flex;gap:4px;margin:8px 0 2px}
    #hz-globo .pasos i{flex:1;height:5px;border-radius:3px;background:#bfdbfe}
    #hz-globo .pasos i.ok{background:#2563eb}#hz-globo .pasos i.act{background:#f59e0b}
    #hz-globo .msj{margin-top:8px;padding:7px 10px;border-radius:8px;font-size:13.5px}
    #hz-globo .msj.mal{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
    #hz-globo .msj.bien{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}
    #hz-globo .msj.pista{background:#fffbeb;color:#92400e;border:1px solid #fde68a}
    #hz-globo .acc{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}
    #hz-globo button{border:1px solid #93c5fd;background:#fff;color:#1f2937;border-radius:7px;padding:5px 11px;font:inherit;font-size:13px;cursor:pointer}
    #hz-globo button.p{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
    #hz-globo button.s{margin-left:auto}
    #hz-globo button:focus-visible{outline:2px solid #f59e0b;outline-offset:1px}
    #hz-globo small{color:#475569}
    #hz-globo.sacude{animation:hz-sacude .35s}
    @keyframes hz-sacude{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
    #hz-fin{position:fixed;inset:0;z-index:10002;display:grid;place-items:center;background:rgba(15,23,42,.6);padding:16px}
    #hz-fin .c{background:#fff;color:#1f2937;border-radius:14px;max-width:460px;padding:24px;font:15px/1.6 system-ui,sans-serif;display:grid;gap:12px;box-shadow:0 18px 40px rgba(0,0,0,.35)}
    #hz-fin h2{margin:0;font-size:20px}#hz-fin a,#hz-fin button{justify-self:start;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:8px;padding:7px 14px;font:inherit;text-decoration:none;cursor:pointer}
    #hz-fin .sec{background:#fff;color:#1d4ed8}
    @media (prefers-reduced-motion:reduce){#hz-foco,#hz-globo{transition:none}#hz-globo.sacude{animation:none}}`;
    document.head.appendChild(css);
    addEventListener('resize', ubicar); addEventListener('scroll', ubicar, true);
    EVENTOS.forEach(tipo => document.addEventListener(tipo, riel, true));
    setInterval(vigia, 350);
  }
  const foco = document.createElement('div'); foco.id = 'hz-foco';
  const globo = document.createElement('div'); globo.id = 'hz-globo'; globo.setAttribute('role', 'dialog'); globo.setAttribute('aria-live', 'polite');

  let i = 0, actual = null, mensaje = null, activo = false, libre = false, mostrando = false;
  const selector = () => !actual || !actual.el ? null : typeof actual.el === 'function' ? actual.el() : actual.el;

  // Riel: en fase de captura, antes que la pantalla; deja pasar el globo, el control del paso y lo permitido
  const EVENTOS = ['click', 'dblclick', 'mousedown', 'pointerdown', 'touchstart', 'keydown', 'submit', 'change', 'input', 'contextmenu', 'focusin'];
  function permitido(t) {
    if (!t || !t.closest) return true;
    if (t.closest('#hz-globo,#hz-fin')) return true;
    const sels = [selector(), ...(actual && actual.permitir || [])].filter(Boolean);
    return sels.some(s => { const e = $1(s); return e && (e === t || e.contains(t)); });
  }
  function riel(e) {
    // el archivo que elige el usuario lo revisa el motor (cuántas filas sin código), en cualquier paso
    if (e.type === 'change' && e.target.matches && e.target.matches(T('carga-archivo')) && e.target.files && e.target.files[0]) revisarArchivo(e.target.files[0]);
    if (!activo || libre) return;
    if (!permitido(e.target)) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type === 'focusin' && e.target.blur) e.target.blur();
      if (e.type === 'click' || e.type === 'submit' || e.type === 'keydown') avisar('mal', 'Por ahora, solo el control resaltado. Si se trabó, use <b>Pista</b> o <b>Muéstrame</b>.');
      return;
    }
    if (e.type === 'click' && actual && actual.titulo === 'Encontrar el error' && e.target.closest(T('carga-errores') + ' tbody tr')) filaTocada = true;
  }

  function avisar(tipo, html) {
    mensaje = { tipo, html }; pintar();
    if (tipo === 'mal') { globo.classList.remove('sacude'); void globo.offsetWidth; globo.classList.add('sacude'); }
  }

  function ubicar() {
    if (!globo.isConnected) return;
    const s = selector(), el = s ? visible(s) : null, W = innerWidth, H = innerHeight;
    const g = globo.getBoundingClientRect();
    if (!el) {
      foco.classList.add('nada');
      globo.style.top = Math.max(12, (H - g.height) / 2) + 'px'; globo.style.left = Math.max(12, (W - g.width) / 2) + 'px'; return;
    }
    foco.classList.remove('nada');
    const r = el.getBoundingClientRect(), p = 6;
    foco.style.cssText = `top:${r.top - p}px;left:${r.left - p}px;width:${r.width + 2 * p}px;height:${r.height + 2 * p}px;`;
    // El globo nunca tapa el control: la posición que menos se superpone (regla de SIMON Tutor)
    const m = 12, gw = g.width, gh = g.height;
    const ajX = x => Math.min(W - gw - m, Math.max(m, x)), ajY = y => Math.min(H - gh - m, Math.max(m, y));
    const cand = [[r.left, r.bottom + 14], [r.left, r.top - gh - 14], [r.right + 14, r.top], [r.left - gw - 14, r.top],
      [W - gw - m, H - gh - m], [m, H - gh - m], [W - gw - m, m], [m, m]].map(([x, y]) => [ajX(x), ajY(y)]);
    const tapa = ([x, y]) => Math.max(0, Math.min(x + gw, r.right + p) - Math.max(x, r.left - p)) * Math.max(0, Math.min(y + gh, r.bottom + p) - Math.max(y, r.top - p));
    let mejor = cand[0], menos = tapa(cand[0]);
    for (const c of cand.slice(1)) { const t = tapa(c); if (t < menos - 1) { mejor = c; menos = t; } }
    globo.style.left = mejor[0] + 'px'; globo.style.top = mejor[1] + 'px';
  }

  function pintar() {
    const a = actual || {};
    const barras = PASOS.slice(1).map((_, k) => `<i class="${k + 1 < i ? 'ok' : k + 1 === i ? 'act' : ''}"></i>`).join('');
    let acciones;
    if (a.bienvenida) {
      const g = avance.leer();
      acciones = g && !g.completado && g.paso > 1
        ? `<button type="button" class="p" data-a="continuar">Continuar donde quedé · paso ${g.paso} de ${TOTAL - 1}</button><button type="button" data-a="nuevo">Empezar de nuevo</button>`
        : `<button type="button" class="p" data-a="empezar">Empezar</button>`;
      acciones += '<button type="button" class="s" data-a="volver">Volver al manual</button>';
    } else {
      acciones = (a.botones || []).map(([t], k) => `<button type="button" class="p" data-b="${k}">${t}</button>`).join('')
        + '<button type="button" data-a="pista">Pista</button><button type="button" data-a="muestrame">Muéstrame</button>'
        + '<button type="button" class="s" data-a="salir">Pausar y salir</button>';
    }
    globo.innerHTML = `<div class="t"><span>Hazlo tú mismo · Carga de productos</span><span>${a.bienvenida ? 'STAND ALONE' : 'Paso ' + i + ' de ' + (TOTAL - 1)}</span></div>
      ${a.bienvenida ? '' : `<div style="font-weight:600;margin-bottom:2px">${a.titulo}</div>`}
      <div>${a.texto || ''}</div>
      ${a.bienvenida ? '' : `<div class="pasos">${barras}</div>`}
      ${mensaje ? `<div class="msj ${mensaje.tipo}">${mensaje.html}</div>` : ''}
      <div class="acc">${acciones}</div>`;
    globo.querySelectorAll('[data-a]').forEach(b => b.onclick = () => accion(b.dataset.a));
    globo.querySelectorAll('[data-b]').forEach(b => b.onclick = async () => { libre = true; try { await a.botones[Number(b.dataset.b)][1](); } finally { libre = false; } });
    requestAnimationFrame(ubicar);
  }

  async function mostrar(n) {
    i = n; actual = PASOS[i]; mensaje = null;
    if (actual.cierre) return cierre();
    libre = true;
    try { if (actual.entrar) await actual.entrar(); } finally { libre = false; }
    const s = selector(); if (s) { try { const e = await hastaVisible(s, 3000); e.scrollIntoView({ block: 'center' }); } catch { } }
    pintar();
    if (!actual.bienvenida) guardarAvance();
  }
  function guardarAvance(extra) { avance.guardar(Object.assign({ paso: i, ayudas, inicio: new Date(inicio).toISOString(), completado: false }, extra || {})); }

  // Vigía: comprueba el paso contra la pantalla; sigue al control si la pantalla se redibuja
  async function vigia() {
    if (!activo || !actual || actual.bienvenida || actual.cierre || mostrando) return;
    try { esSup = await sesionSup(); } catch { }
    const s = selector(); if (s) { const e = $1(s); if (e) { const r = e.getBoundingClientRect(); if (r.bottom < 40 || r.top > innerHeight - 40) e.scrollIntoView({ block: 'center' }); } }
    ubicar();
    if (actual.salto) { const j = actual.salto(); if (j != null) { mostrando = true; avisar('bien', 'Bien hecho.'); await espera(900); await mostrar(j); mostrando = false; return; } }
    if (actual.listo && actual.listo()) {
      mostrando = true;
      avisar('bien', actual.alCumplir || '✓ Bien hecho.');
      await espera(actual.alCumplir ? 3200 : 1000);
      await mostrar(i + 1); mostrando = false; return;
    }
    if (actual.vigilar) { const m = actual.vigilar(); if (m && (!mensaje || mensaje.html !== m)) avisar('mal', m); }
  }

  async function accion(a) {
    if (a === 'empezar') { inicio = Date.now(); ayudas = 0; mostrar(1); }
    else if (a === 'continuar') reanudar();
    else if (a === 'nuevo') { avance.borrar(); await desdeCero(); mostrar(1); }
    else if (a === 'volver') location.href = 'ManualConteoInventario';
    else if (a === 'pista') { ayudas++; avisar('pista', actual.pista || 'Siga la indicación del globo.'); guardarAvance(); }
    else if (a === 'muestrame') {
      ayudas++; guardarAvance();
      libre = true; try { await actual.muestrame(); } catch (e) { avisar('mal', 'No pude hacerlo: ' + e.message); } finally { libre = false; }
    }
    else if (a === 'salir') pausa();
  }

  function pausa() {
    guardarAvance(); activo = false; foco.remove(); globo.remove();
    const fin = document.createElement('div'); fin.id = 'hz-fin';
    fin.innerHTML = `<div class="c"><h2>Avance guardado</h2><p>Quedó en el <b>paso ${i} de ${TOTAL - 1}</b>: ${PASOS[i].titulo}. Cuando tenga tiempo, vuelva a abrir el ejercicio y elija <b>Continuar donde quedé</b>.</p>
      <p style="font-size:13px;color:#64748b">El avance se guarda en este navegador.</p><a href="ManualConteoInventario">Volver al manual</a></div>`;
    document.body.append(fin);
  }

  // La demostración vuelve a su estado inicial, con el operador (que no puede cargar)
  // (y el ejercicio también: nada de lo hecho en un intento anterior cuenta para el nuevo)
  async function desdeCero() { tengoArchivo = false; filaTocada = false; archivo = null; lecturaAntes = lecturas; libre = true; try { await entrar(INICIAL, true); } finally { libre = false; } }

  async function reanudar() {
    const g = avance.leer(); if (!g) return mostrar(1);
    ayudas = g.ayudas || 0; inicio = g.inicio ? Date.parse(g.inicio) : Date.now();
    tengoArchivo = g.paso > 1;
    const destino = PASOS[g.paso] && PASOS[g.paso].reanudar || 1;
    libre = true;
    try {
      if (destino > 2) await entrar(USUARIO, false);
      if (destino > 3) { await ir('cargas'); await hastaVisible(T('carga-archivo'), 3000); }
      // después del rechazo, el archivo con error se vuelve a cargar por detrás para dejar la pantalla igual
      if (destino >= 6) { await elegirArchivo(true); for (let t = 0; t < 40 && !botonCargar(); t++) await espera(100); botonCargar().click(); for (let t = 0; t < 30 && !swal(); t++) await espera(100); $1('.swal2-popup .swal2-confirm').click(); await hastaVisible(T('carga-errores'), 5000); }
    } catch { } finally { libre = false; }
    mostrar(destino);
  }

  function cierre() {
    const min = Math.max(1, Math.round((Date.now() - inicio) / 60000));
    avance.guardar({ paso: TOTAL - 1, ayudas, inicio: new Date(inicio).toISOString(), completado: true, terminado: new Date().toISOString(), minutos: min });
    activo = false; foco.remove(); globo.remove();
    const fin = document.createElement('div'); fin.id = 'hz-fin';
    fin.innerHTML = `<div class="c"><h2>✓ Ejercicio completado</h2>
      <p>Cargó el catálogo de <b>45 productos</b> desde Excel: encontró el error de la fila ${FILA_ERROR}, lo corrigió y volvió a cargar. Entraron 2 productos nuevos.</p>
      <p style="font-size:14px;color:#475569">Tiempo: ${min === 1 ? "1 minuto" : "unos " + min + " minutos"} · ayudas usadas: ${ayudas}.<br>Para repasar: manual, sección <b>Cargas Excel</b>.<br>Siguiente ejercicio sugerido: <b>Cargar las existencias</b>.</p>
      <a href="ManualConteoInventario">Volver al manual</a><button type="button" class="sec" id="hz-otra">Repetir el ejercicio</button></div>`;
    document.body.append(fin);
    fin.querySelector('#hz-otra').onclick = async () => { fin.remove(); avance.borrar(); await desdeCero(); activo = true; document.body.append(foco, globo); inicio = Date.now(); ayudas = 0; mostrar(1); };
  }

  window.mciHazlo = {
    /** ejercicio: "carga-productos"; ref: DotNetObjectReference de la página. */
    async iniciar(ejercicio, ref) {
      pagina = ref;
      armar();
      document.body.append(foco, globo);
      if (ejercicio !== 'carga-productos') { actual = { bienvenida: true, texto: '⚠ El ejercicio "' + ejercicio + '" no existe.' }; pintar(); return; }
      await desdeCero();
      activo = true;
      mostrar(0);
    }
  };
})();
