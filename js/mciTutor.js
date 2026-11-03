/* =============================================================================
   MCI · SIMON TUTOR SOBRE LAS PANTALLAS REALES (P-064 fase 3, 19OCT2026)

   Los recorridos guiados del manual corren sobre las pantallas Razor del módulo en
   modo demostración (ConteoInventarioDemo?tutor=tour-x): entran como un usuario de
   ejemplo, van a la pantalla, escriben, marcan y aplican, y en cada paso un globo
   señala el control y explica lo que hay que tener en cuenta. Se puede pausar,
   volver, avanzar, repetir y salir. Nada se guarda en ninguna base.

   Lo carga ConteoInventario.razor y lo maneja con tres puntos de control de la
   página (TutorEntrar, TutorIr, TutorMenu). Los controles se señalan con el
   atributo data-tutor de los componentes Mci*.razor: T('avance-tabla') es
   [data-tutor="avance-tabla"]. Si una pantalla cambia y un paso no encuentra su
   control, el recorrido lo dice en vez de seguir.

   Migrado desde los recorridos de la demostración .html anterior (retirada el 19OCT2026):
   mismos textos y mismo orden. Para agregar un recorrido: una entrada en RECORRIDOS
   y su id con su título en la lista Recorridos de ManualConteoInventarioPuente.razor.
   ============================================================================= */
(function () {
  'use strict';
  if (window.mciTutor) return;

  let rapido = false;                       // al volver a un paso anterior, los previos se rehacen en rápido
  const espera = ms => new Promise(r => setTimeout(r, rapido && ms < 600 ? Math.round(ms / 4) : ms));
  const tic = () => new Promise(r => setTimeout(r, 100));
  const T = nombre => `[data-tutor="${nombre}"]`;
  const hoy = (dias = 0) => { const d = new Date(); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };
  const visible = sel => { const e = document.querySelector(sel); return e && e.offsetParent !== null ? e : null; };
  async function hasta(sel, ms = 6000) {
    for (let t = 0; t < ms; t += 100) { const e = visible(sel); if (e) return e; await tic(); }
    throw new Error('no encontré en pantalla: ' + sel);
  }
  async function clic(sel) { const e = await hasta(sel); e.click(); await espera(400); }
  // Blazor escucha "input" (@bind:event="oninput") o "change" (@bind): se disparan los dos
  const fijar = (e, v) => {
    const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, v);
  };
  async function escribir(sel, txt) {
    const e = await hasta(sel); e.focus(); fijar(e, ''); e.dispatchEvent(new Event('input', { bubbles: true }));
    let v = '';
    for (const c of String(txt)) { v += c; fijar(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); await espera(90); }
    e.dispatchEvent(new Event('change', { bubbles: true })); await espera(300);
  }
  async function elegir(sel, valor) {
    let e = await hasta(sel);
    for (let t = 0; t < 40 && ![...e.options].some(o => o.value === String(valor)); t++) { await tic(); e = await hasta(sel); }
    fijar(e, String(valor)); e.dispatchEvent(new Event('change', { bubbles: true })); await espera(500);
  }

  let pagina = null;                        // DotNetObjectReference de ConteoInventario.razor
  const ir = (pestana, numero) => pagina.invokeMethodAsync('TutorIr', pestana, numero ?? null);
  // otro usuario de la misma demostración, sin volver los datos al inicio
  const entrarComo = (empresa, usuario) => pagina.invokeMethodAsync('TutorEntrar', empresa, usuario, false);
  // El motor de la demostración, como si fuera el API (solo para preparar datos por detrás)
  async function api(metodo, ruta, cuerpo) {
    const r = await window.mciDemo.atender(metodo, 'api/ConteoInventario/-1/' + ruta, cuerpo ? JSON.stringify(cuerpo) : null);
    if (r.status >= 400) throw new Error('la demostración rechazó ' + ruta + ' (' + r.status + ')');
    return r.cuerpo ? JSON.parse(r.cuerpo) : null;
  }
  // La confirmación general de SIMON 360 (SweetAlert2): se acepta
  // (tras aceptar, el aviso de éxito usa la misma ventana: se espera solo a que se cierre la confirmación, la que tiene Cancelar)
  async function aceptarConfirmacion() { await clic('.swal2-popup .swal2-confirm'); await hastaQueSeVaya('.swal2-popup .swal2-cancel'); }
  // Plantilla: una fila todavía por decidir (con la lista "Por decidir" se va al guardarla)
  async function filaPorDecidir(salvo = []) {
    for (let t = 0; t < 60; t++) {
      const tr = [...document.querySelectorAll(T('pl-fila') + '[data-por-decidir="1"]')].find(x => !salvo.includes(x.dataset.ic) && x.offsetParent !== null);
      if (tr) return tr.dataset.ic;
      await tic();
    }
    throw new Error('no apareció la siguiente línea por decidir');
  }
  const fila = ic => T('pl-fila') + '[data-ic="' + ic + '"]';
  // La confirmación general de SIMON 360: "no" (p. ej. "¿Imprimir ahora?" → después)
  async function rechazarConfirmacion() { await clic('.swal2-popup .swal2-cancel'); await hastaQueSeVaya('.swal2-popup .swal2-cancel'); }
  // Hace algo como otro usuario de la demostración, sin redibujar la pantalla, y vuelve al de antes
  async function comoUsuario(usuario, fn) {
    const d = window.mciDemo, s = await d.sesion();
    const u = (await d.usuarios()).find(x => x.usuario === usuario);
    if (!u) throw new Error('no existe el usuario de demostración ' + usuario);
    await d.entrar(s.clave, u.cedula);
    try { return await fn(); } finally { await d.entrar(s.clave, s.cedula); }
  }
  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random());
  // Programa de ejemplo para el ciclo: P05 rack R02, dos operadores y la F1 sorteada
  async function programaDeEjemplo() {
    const r = await api('POST', 'programas', { idAlmacen: 1, pasillo: 'P05', rack: 'R02', nivel: '', lote: '', fechaDesde: hoy(), fechaHasta: hoy(2), modalidad: 1, observacion: 'Recorrido guiado' });
    const n = Number(r.numero);
    for (const op of ['99000004', '99000005']) await api('POST', `programas/${n}/operadores`, { operador: op });
    await api('POST', `programas/${n}/sorteo/1`);
    return n;
  }
  /* Los operadores cuentan su parte (simulado): casi todo cuadra; dos líneas con diferencia.
     El teórico lo trae el avance (lo ve el supervisor), y cada operador envía sus líneas. */
  async function simularConteo(n) {
    const teo = new Map((await api('GET', `programas/${n}/avance`)).lineas.map(l => [l.idCuaderno, l.teorico]));
    let k = 0;
    for (const op of ['MCI_OP2', 'MCI_OP3']) {
      await comoUsuario(op, async () => {
        const paq = await api('GET', `handheld/programas/${n}/paquete`);
        const eventos = paq.lineas.filter(l => !l.grabado).map(l => {
          const t = teo.get(l.idCuaderno) || 0, ajuste = [2, -1][k++] || 0;
          return { idEvento: nuevoId(), fase: 1, tipo: 'CONTEO', idCuaderno: l.idCuaderno, idProducto: l.idProducto, idUbicacion: l.idUbicacion, lote: l.lote || null, cantidad: Math.max(0, t + ajuste), fechaEquipo: new Date().toISOString() };
        });
        if (eventos.length) await api('POST', `handheld/programas/${n}/capturas`, { equipo: 'DEMO-' + op, eventosEnCola: 0, eventos });
      });
    }
  }
  // La librería de Excel (la usa el motor de la demo; aquí, para armar el Excel de práctica)
  function cargarXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = 'lib/xlsx/xlsx.full.min.js'; s.onload = ok; s.onerror = () => mal(new Error('no cargó la librería de Excel')); document.head.appendChild(s); });
  }
  /* 10OCT2026 · Excel de práctica para el recorrido de Cargas Excel: el catálogo de la demo (los mismos
     códigos DEMO-101 a DEMO-143) más dos productos nuevos. Con error, la fila 18 queda sin código. */
  async function excelDePractica(conError) {
    await cargarXlsx();
    const fam = [['TORNILLO AUTORROSCANTE', ['1/4 X 1', '1/4 X 2', '3/8 X 2', '3/8 X 3'], 'UND', 0.12], ['TUERCA HEXAGONAL', ['1/4', '3/8', '1/2'], 'UND', 0.08],
      ['ARANDELA PLANA', ['1/4', '3/8', '1/2'], 'UND', 0.05], ['CABLE THHN 12 AWG', ['ROJO 100M', 'NEGRO 100M', 'BLANCO 100M'], 'ROLLO', 48],
      ['CABLE THHN 14 AWG', ['ROJO 100M', 'NEGRO 100M'], 'ROLLO', 36], ['BOMBILLO LED', ['9W', '12W', '18W'], 'UND', 1.9],
      ['TUBO PVC AGUAS BLANCAS', ['1/2 X 3M', '3/4 X 3M', '1 X 3M'], 'UND', 3.4], ['CODO PVC 90°', ['1/2', '3/4', '1'], 'UND', 0.45],
      ['LLAVE DE PASO', ['1/2', '3/4'], 'UND', 6.8], ['PINTURA ESMALTE', ['BLANCO GALÓN', 'NEGRO GALÓN', 'GRIS GALÓN'], 'GAL', 21, 'Sí'],
      ['BROCHA', ['2 PULG', '3 PULG'], 'UND', 1.6], ['CINTA AISLANTE', ['NEGRA 20M', 'ROJA 20M'], 'UND', 0.9],
      ['SILICÓN TRANSPARENTE', ['280 ML'], 'UND', 3.2, 'Sí'], ['PEGA PVC', ['1/4 GALÓN'], 'UND', 7.5, 'Sí'],
      ['DISCO DE CORTE', ['4-1/2 METAL', '7 METAL'], 'UND', 1.3], ['GUANTES DE SEGURIDAD', ['TALLA M', 'TALLA L'], 'PAR', 2.4],
      ['CANDADO', ['40 MM', '50 MM'], 'UND', 5.5], ['BISAGRA', ['3 PULG', '4 PULG'], 'UND', 1.1]];
    const filas = [];
    fam.forEach(([f, vars, und, costo, lote]) => vars.forEach(v => filas.push(['DEMO-' + (101 + filas.length), f + ' ' + v, und, costo, lote || 'No'])));
    filas.push(['DEMO-144', 'ESPÁTULA 3 PULG', 'UND', 1.75, 'No'], ['DEMO-145', 'LIJA AL AGUA 120', 'UND', 0.4, 'No']);
    if (conError) filas[16][0] = '';   // fila 18 de la hoja (la 1 es el encabezado)
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Código del producto', 'Descripción del producto', 'Unidad de inventario', 'Costo unitario en divisa', 'Maneja lote'], ...filas]), 'PRODUCTOS');
    return new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], conError ? 'Catalogo_ferreteria.xlsx' : 'Catalogo_ferreteria_corregido.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  // Pone el archivo en el campo como si el usuario lo hubiera elegido (InputFile de Blazor lee el "change")
  async function elegirArchivo(sel, archivo) {
    const inp = await hasta(sel), dt = new DataTransfer(); dt.items.add(await archivo);
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); await espera(800);
  }
  async function hastaQueSeVaya(sel, ms = 6000) {
    for (let t = 0; t < ms; t += 100) { if (!visible(sel)) return; await tic(); }
    throw new Error('sigue en pantalla: ' + sel);
  }

  const FIN = 'Fin del recorrido. Puede repetirlo o explorar la pantalla por su cuenta: es la demostración, <b>nada se guarda en ninguna base</b>.';

  /* ------------------------------------------------------------------ recorridos */
  const RECORRIDOS = {

    'avance': {
      titulo: 'Avance por fase', empresa: 'DEMO-SA', usuario: 'MCI_SUP',
      pasos: [
        { texto: '<b>Avance por fase.</b> El teórico, lo contado y las diferencias de cada fase: la herramienta del supervisor para controlar el conteo.' },
        { antes: async () => { await ir('ciclo', 4); await hasta(T('avance-tabla')); }, el: T('avance'),
          texto: 'Está en el <b>Ciclo de conteo</b>. Arriba, por fase: líneas, con capturas y cuántas quedaron CT, AP, RU o DIF.' },
        { el: T('avance-tabla'), texto: 'Línea por línea: el <b>teórico</b>, la tolerancia y, por fase, lo <b>contado</b>, la <b>diferencia</b> y el resultado.<br><small>⚠ La fase que se está contando sale <b>ciega</b> hasta cerrarla.</small>' },
        { antes: () => clic(T('avance-filtro-dif')), el: T('avance-filtros'), texto: 'Filtre <b>Con diferencia</b> o <b>Fuera de ubicación</b>.' },
        { el: T('avance-exportar'), texto: '<b>Imprimir</b> o <b>Excel</b>: el Excel trae el avance, los totales por fase y lo hallado fuera de ubicación.' },
        { texto: '<b>Quién lo ve.</b> El supervisor, durante el ciclo, si la gerencia lo tiene habilitado en <b>Gobierno</b>. La gerencia y la junta, al cerrar el programa. Los operadores, nunca.' },
        { texto: FIN }
      ]
    },

    'aprobacion': {
      titulo: 'Aprobación y acta', empresa: 'DEMO-SA', usuario: 'MCI_F1',
      // El gerente ya decidió y envió (lo hace el recorrido Plantilla final): aquí se hace por detrás
      async preparar() {
        await entrarComo('DEMO-SA', 'MCI_GER');
        for (const l of await api('GET', 'programas/4/plantilla?filtro=NC')) await api('PUT', `programas/4/plantilla/${l.idCuaderno}`, { decision: 'F3', cantFinal: null, motivo: null });
        await api('POST', 'programas/4/enviar-aprobacion');
        await entrarComo('DEMO-SA', 'MCI_F1');
      },
      pasos: [
        { texto: '<b>Aprobación y acta.</b> Firma un miembro de la junta (rol FIRMANTE, nivel 1). Las firmas van por niveles según el monto.' },
        { antes: async () => { await ir('aprobacion', 4); await hasta(T('acta')); }, el: T('acta'), texto: 'El <b>acta</b>: el programa, el resumen, las firmas y las líneas con diferencia.' },
        { antes: () => clic(T('acta-ver-avance')), el: T('acta-avance'), texto: '<b>Avance por fase</b>: el detalle de cada fase, para decidir con todo a la vista. También se imprime y se exporta a Excel.' },
        { antes: () => clic(T('firma-APROBAR')), el: T('firma-decision'),
          texto: '<b>Aprobar</b> firma su nivel. <b>Devolver</b> regresa a la plantilla y anula las firmas. <b>Rechazar</b> cierra el programa.<br><small>Devolver y rechazar piden observación.</small>' },
        { antes: () => escribir(T('firma-coe'), '1234'), el: T('firma-coe'), texto: 'Se firma con su <b>COE</b>, no con la clave de entrada.<br><small>⚠ Quien supervisó el conteo no puede firmarlo.</small>' },
        { antes: async () => { await clic(T('firma-ok')); await espera(1200); }, el: T('acta'),
          texto: 'Con todas las firmas, en <b>STAND ALONE</b> el acta queda <b>firmada</b> y se liberan las ubicaciones. En <b>ACTIVO</b> queda aprobada, esperando el ajuste.' },
        { texto: FIN }
      ]
    },

    'ajuste': {
      titulo: 'Ajuste y asiento (ACTIVO)', empresa: 'DEMO-AC', usuario: 'MCI_GER',
      pasos: [
        { texto: '<b>Ajuste y asiento.</b> Solo en ACTIVO: el gerente lleva lo aprobado al kardex de SIMON y deja el asiento en la bandeja del contador.' },
        { antes: async () => { await ir('ajuste', 5); await hasta(T('ajuste-ok')); }, el: T('ajuste-vista'), texto: 'La <b>vista previa</b>: los movimientos de kardex por producto y lote, y el asiento que se va a generar.' },
        { el: T('ajuste-fecha'), texto: 'La <b>fecha contable</b>.<br><small>⚠ Tiene que caer en un mes contable abierto: las validaciones lo revisan antes de aplicar.</small>' },
        { antes: () => escribir(T('ajuste-coe'), '1234'), el: T('ajuste-coe'), texto: 'Se aplica con la <b>COE</b> del gerente.' },
        { antes: async () => { await clic(T('ajuste-ok')); await aceptarConfirmacion(); await espera(1500); }, el: T('ajuste-vista'),
          texto: 'Aplicado: kardex (<b>E-AJCONT</b> o <b>S-AJCONT</b>), existencia por almacén y por ubicación, y el asiento en la bandeja del contador.<br><small>Se aplica la <b>diferencia</b>, no lo contado: lo vendido durante el conteo no se pierde. Mientras el asiento siga en la bandeja, se puede revertir.</small>' },
        { texto: FIN }
      ]
    },

    'plantilla': {
      titulo: 'Plantilla final', empresa: 'DEMO-SA', usuario: 'MCI_GER',
      v: {},
      pasos: [
        { texto: '<b>Plantilla final.</b> Al cerrar el programa, el gerente decide las líneas que no convergieron en las tres fases.' },
        { antes: async () => { await ir('plantilla', 4); await hasta(T('pl-resumen')); }, el: T('pl-resumen'),
          texto: 'Arriba, cuántas quedan <b>por decidir</b>, el faltante, el sobrante y el neto, y qué nivel de firma hará falta.' },
        { antes: async () => { const v = RECORRIDOS.plantilla.v; v.a = await filaPorDecidir(); await elegir(fila(v.a) + ' ' + T('pl-decision'), 'F3'); }, el: () => fila(RECORRIDOS.plantilla.v.a),
          texto: '<b>Último conteo</b>: toma lo contado en la última fase.' },
        { antes: async () => { const v = RECORRIDOS.plantilla.v; await clic(fila(v.a) + ' ' + T('pl-guardar')); await hastaQueSeVaya(fila(v.a)); }, el: T('pl-fila'),
          texto: 'Con <b>✓</b> se guarda cada decisión. Se puede cambiar mientras no se envíe.' },
        { antes: async () => { const v = RECORRIDOS.plantilla.v; v.b = await filaPorDecidir([v.a]); await elegir(fila(v.b) + ' ' + T('pl-decision'), 'MANUAL');
            await escribir(fila(v.b) + ' ' + T('pl-cant'), '108'); await escribir(fila(v.b) + ' ' + T('pl-motivo'), 'Recontado por el supervisor'); }, el: () => fila(RECORRIDOS.plantilla.v.b),
          texto: '<b>Manual</b>: una cantidad fija, con su <b>motivo</b>.' },
        { antes: async () => { const v = RECORRIDOS.plantilla.v; await clic(fila(v.b) + ' ' + T('pl-guardar')); await hastaQueSeVaya(fila(v.b));
            v.c = await filaPorDecidir([v.a, v.b]); await elegir(fila(v.c) + ' ' + T('pl-decision'), 'EXCLUIR'); await escribir(fila(v.c) + ' ' + T('pl-motivo'), 'Se investiga el faltante'); },
          el: () => fila(RECORRIDOS.plantilla.v.c), texto: '<b>Excluir</b>: no se ajusta; la línea va a investigación, con su motivo.' },
        { antes: async () => { const v = RECORRIDOS.plantilla.v; await clic(fila(v.c) + ' ' + T('pl-guardar')); await hasta(T('pl-enviar') + ':not([disabled])'); }, el: T('pl-enviar'),
          texto: 'Con todo decidido se habilita <b>Enviar a aprobación</b>.<br><small>También hay <b>Decidir en bloque</b> para muchas líneas a la vez.</small>' },
        { antes: async () => { await clic(T('pl-enviar')); await hasta('.swal2-popup'); }, el: '.swal2-popup', texto: 'Confirma el envío: desde aquí la plantilla ya no se cambia, salvo que la junta la devuelva.' },
        { antes: async () => { await aceptarConfirmacion(); await hasta(T('acta')); }, el: T('acta'), texto: 'Enviada: el acta queda <b>en aprobación</b>, esperando las firmas. Vea el recorrido <b>Aprobación y acta</b>.' },
        { texto: FIN }
      ]
    },

    'tolerancia-porcentaje': {
      titulo: 'Tolerancia por porcentaje', empresa: 'DEMO-SA', usuario: 'MCI_SUP',
      // Deja los productos del ejemplo sin tolerancia, para que el recorrido se vea igual cada vez
      async preparar() {
        const r = await api('GET', 'tolerancias?texto=TORNILLO&tamPagina=50');
        const ids = (r && r.productos || []).map(p => p.id);
        if (ids.length) await api('PUT', 'tolerancias', { ids, valorAprobacion: 1, medicionDif: 1, limiteFaltante: 0, limiteSobrante: 0 });
      },
      pasos: [
        { texto: '<b>Tolerancia por porcentaje.</b> Vamos a dejar que los tornillos acepten hasta un <b>5 %</b> de diferencia, de más o de menos, sin volver a contar.<br><small>Se hace una vez, antes del primer conteo.</small>' },
        { el: T('menu-config'), texto: 'Está en el menú <b>Configuración · privilegiada → Tolerancias por producto</b>. La ven configuración, supervisión y gerencia; <b>solo CONFIGURACION</b> la cambia.' },
        { antes: async () => { await ir('config'); await clic(T('config-tolerancias')); await hasta(T('tol-texto')); }, el: T('tol-texto'),
          texto: 'La misma pantalla sirve en <b>STAND ALONE</b> y en <b>ACTIVO</b>. Primero se busca a qué productos se les va a dar el criterio.' },
        { antes: () => escribir(T('tol-texto'), 'TORNILLO'), el: T('tol-texto'), texto: 'Busque por <b>código o nombre</b>. Aquí, todos los tornillos.' },
        { antes: async () => { await clic(T('tol-buscar')); await espera(600); await hasta(T('tol-marca')); }, el: T('tol-tabla'),
          texto: 'La grilla muestra el criterio actual de cada uno. <b>"sin tolerancia"</b> es el valor con que entra todo producto nuevo: solo se aprueba si cuadra.' },
        { antes: async () => { for (let k = 0; k < 3; k++) { const x = [...document.querySelectorAll(T('tol-marca'))].filter(e => !e.checked)[0]; if (!x) break; x.click(); await espera(300); } },
          el: T('tol-tabla'), texto: 'Marque los productos. Aquí, los tres primeros.<br><small>Si quiere aplicarlo a todo lo que trajo la búsqueda, no hace falta marcar: use <b>Aplicar a toda la selección</b>.</small>' },
        { antes: () => clic(T('tol-val-1')), el: T('tol-val'),
          texto: '<b>Valorar por Unidades.</b> Con porcentaje da lo mismo unidades o costo: el costo es el mismo a los dos lados de la comparación.' },
        { antes: () => clic(T('tol-med-2')), el: T('tol-med'),
          texto: '<b>Medición: Porcentaje.</b> La diferencia se mide como % del teórico de la línea.<br><small>⚠ Con <b>teórico 0</b> no hay porcentaje: esa línea nunca se aprueba por tolerancia.</small>' },
        { antes: () => clic(T('tol-tipo-3')), el: T('tol-tipo'),
          texto: '<b>Tipo de límite: Entre.</b> Tolera faltantes y sobrantes.<br><small><b>&lt; Faltante</b> tolera solo faltantes y <b>&gt; Sobrante</b> solo sobrantes; el otro lado queda en 0.</small>' },
        { antes: async () => { const m = await hasta(T('tol-mismo')); if (!m.checked) { m.click(); await espera(250); } await escribir(T('tol-faltante'), '5'); }, el: T('tol-faltante'),
          texto: '<b>Desde −5 %</b>. Con <b>"Mismo valor para faltante y sobrante"</b> marcado, el hasta queda en <b>+5 %</b> solo.' },
        { el: T('tol-resultado'), texto: 'Antes de aplicar, lea <b>"Se aplicará"</b>: es el criterio tal como va a quedar.' },
        { antes: async () => { await clic(T('tol-aplicar-marcados')); await hasta('.swal2-popup'); }, el: '.swal2-popup',
          texto: 'El sistema confirma qué se aplica y a cuántos productos.<br><small>⚠ Vale para los programas que se <b>inicien desde ahora</b>: un conteo que ya empezó conserva el criterio que tenía.</small>' },
        { antes: async () => { await aceptarConfirmacion(); await espera(900); await hasta(T('tol-marca')); }, el: T('tol-tabla'),
          texto: 'Listo: los marcados quedan en <b>−5 a +5 %</b>. El cambio queda en la <b>bitácora</b> de configuración, producto por producto.' },
        { texto: '<b>Cómo se aplica al contar.</b> Una línea con teórico <b>40</b>:<br>• contado 38 → −2 = <b>−5 %</b> → <b>AP</b>, se aprueba sin recontar.<br>• contado 37 → −3 = <b>−7,5 %</b> → <b>DIF</b>, pasa a la fase siguiente.<br>• contado 42 → +2 = <b>+5 %</b> → <b>AP</b>.' },
        { texto: FIN }
      ]
    },

    'programar': {
      titulo: 'Programar un conteo', empresa: 'DEMO-SA', usuario: 'MCI_SUP',
      pasos: [
        { texto: '<b>Programar un conteo.</b> Vamos a crear un programa para el pasillo P05, rack R02, y dejar sus operadores sorteados.' },
        { el: T('menu-programacion'), texto: '<b>Programación</b> es del supervisor. Cada programa es un conteo: qué se cuenta, cuándo y quién.' },
        { antes: async () => { await ir('programacion'); await hasta(T('pg-form')); }, el: T('pg-form'), texto: 'El formulario crea un <b>programa nuevo</b>. Al lado está la lista de programas.' },
        { antes: async () => { const s = await hasta(T('pg-almacen')); await elegir(T('pg-almacen'), s.options[1].value); }, el: T('pg-almacen'),
          texto: 'Primero el <b>almacén</b>.<br><small>En STAND ALONE, los almacenes y ubicaciones salen de la carga de existencias.</small>' },
        { antes: async () => { await elegir(T('pg-ubi-pasillo'), 'P05'); await elegir(T('pg-ubi-rack'), 'R02'); }, el: T('pg-ubi'),
          texto: 'El <b>alcance</b>: pasillo, rack y nivel. Cada combo se habilita al elegir el anterior; vacío = todo.<br><small>⚠ Dos programas no pueden tocar las mismas ubicaciones en fechas que se solapen.</small>' },
        { antes: () => escribir(T('pg-hasta'), hoy(2)), el: T('pg-hasta'), texto: 'El <b>periodo</b>: desde y hasta. Hasta vacío = un solo día.' },
        { antes: () => elegir(T('pg-modalidad'), '1'), el: T('pg-modalidad'),
          texto: '<b>Con bloqueo</b>: las ubicaciones quedan bloqueadas desde que se inicia hasta el ajuste. <b>Cíclico</b>: no se bloquea y lo que se mueve mientras se cuenta se vuelve a contar.' },
        { antes: async () => { await clic(T('pg-crear')); await hasta(T('pg-operador')); }, el: T('pg-detalle'),
          texto: 'Programa <b>creado</b>. El detalle muestra el alcance, cuántos productos involucra y qué parte del catálogo cubre.' },
        { antes: async () => { for (const op of ['99000004', '99000005']) { await escribir(T('pg-operador'), op); await clic(T('pg-operador-agregar')); await espera(700); } }, el: T('pg-operador'),
          texto: 'Agregue los <b>operadores</b> por su cédula. Basta uno.' },
        { el: T('pg-sortear-1'), texto: '<b>Sortear F1</b> reparte los racks entre los operadores, balanceando las líneas (o los pasillos o los niveles, según la Configuración). En F2 y F3 evita que recuente quien ya contó esa ubicación.<br><small>Con <b>sorteo automático</b> se sortea solo al emitir los cuadernos.</small>' },
        { antes: async () => { await clic(T('pg-sortear-1')); await hasta(T('modal-ok')); await clic(T('modal-ok')); await hasta(T('modal-entendido')); }, el: T('modal'),
          texto: 'El resultado del <b>sorteo</b>: cuántas líneas y racks le tocan a cada operador. Se puede repetir hasta emitir los cuadernos.' },
        { antes: async () => { await clic(T('modal-entendido')); await hastaQueSeVaya(T('modal')); }, el: T('pg-ir-ciclo'), texto: 'El programa queda <b>programado</b>. El siguiente paso es el <b>Ciclo de conteo</b>.' },
        { texto: FIN }
      ]
    },

    'ciclo': {
      titulo: 'Ciclo de conteo', empresa: 'DEMO-SA', usuario: 'MCI_SUP',
      v: {},
      async preparar() { RECORRIDOS.ciclo.v.n = await programaDeEjemplo(); },
      pasos: [
        { texto: '<b>Ciclo de conteo.</b> Vamos a llevar un programa por su primera fase: iniciar, emitir los cuadernos, abrir el conteo y cerrar la fase.' },
        { antes: async () => { await ir('ciclo', RECORRIDOS.ciclo.v.n); await hasta(T('paso-iniciar')); }, el: T('ciclo-acciones'),
          texto: 'Las <b>acciones del ciclo</b>, en orden. El paso que sigue va resaltado; lo que todavía no corresponde aparece en gris y dice por qué.' },
        { el: T('paso-iniciar'), texto: '<b>Iniciar</b> se hace una sola vez: toma el teórico al corte y, con bloqueo, bloquea las ubicaciones.' },
        { antes: async () => { await clic(T('paso-iniciar')); await hasta('.swal2-popup'); }, el: '.swal2-popup', texto: 'Los pasos que no se pueden deshacer piden <b>confirmación</b>.' },
        { antes: async () => { await aceptarConfirmacion(); await hasta(T('paso-nueva-fase') + ':not([disabled])'); }, el: T('paso-nueva-fase'),
          texto: '<b>Abrir fase</b>: la F1 abre con todo el alcance; la F2 y la F3, solo con lo que quedó con diferencia.' },
        { antes: async () => { await clic(T('paso-nueva-fase')); await hasta(T('paso-emitir-cuadernos') + ':not([disabled])'); }, el: T('paso-emitir-cuadernos'),
          texto: '<b>Emitir cuadernos</b>: la lista de cada operador. Después se pueden <b>reemitir</b> para reimprimir, sin volver a sortear.' },
        { antes: async () => { await clic(T('paso-emitir-cuadernos')); await hasta('.swal2-popup .swal2-cancel'); }, el: '.swal2-popup',
          texto: 'Ofrece <b>imprimirlos</b>, uno por operador, con casillas ✓ por línea y por ubicación y filas en blanco para hallazgos. Aquí, "Después".' },
        { antes: async () => { await rechazarConfirmacion(); await hasta(T('cuadernos')); }, el: T('cuadernos'),
          texto: 'Los <b>cuadernos de la fase</b>, por operador: cuántas líneas tiene cada uno y cuántas grabó. Si alguien no puede seguir, <b>Reasignar</b> pasa lo que le falta a otro.' },
        { antes: async () => { await clic(T('paso-abrir-conteo')); await espera(600); }, el: T('paso-cerrar-fase'),
          texto: '<b>Conteo abierto</b>: desde ahora los equipos pueden grabar. Mientras se cuenta, este paso espera.' },
        { antes: async () => { const n = RECORRIDOS.ciclo.v.n; await simularConteo(n); await ir('tablero'); await ir('ciclo', n); await hasta(T('avance-tabla')); }, el: T('avance'),
          texto: 'Los operadores cuentan con sus equipos (vea el recorrido <b>Conteo con el equipo</b>). Aquí lo simulamos.<br><small>Mientras la fase está abierta, el avance se ve <b>ciego</b>: solo qué líneas tienen capturas.</small>' },
        { el: T('paso-cerrar-fase'), texto: '<b>Cerrar fase</b> calcula el resultado de cada línea.<br><small>⚠ Exige que ningún equipo tenga capturas sin enviar. Lo que nadie contó queda contado en cero.</small>' },
        { antes: async () => { await clic(T('paso-cerrar-fase')); await aceptarConfirmacion(); await espera(900); await hasta(T('avance-tabla')); }, el: T('avance'),
          texto: 'Fase cerrada: cada línea con su resultado. <b>CT</b> cuadró, <b>AP</b> se aprobó por tolerancia o por dos conteos iguales, <b>DIF</b> se recuenta.' },
        { el: T('paso-nueva-fase'), texto: 'Las líneas con diferencia pasan a la <b>F2</b>, con otro operador, y así hasta la F3. Al final, <b>Cerrar programa</b> lleva lo que no convergió a la plantilla final.' },
        { texto: FIN }
      ]
    },

    'ubicaciones': {
      titulo: 'Ubicaciones', empresa: 'DEMO-SA', usuario: 'MCI_SUP',
      pasos: [
        { texto: '<b>Ubicaciones.</b> Antes de contar, las ubicaciones tienen que existir. En STAND ALONE nacen con el Excel de existencias; aquí se agregan las que faltan, a mano o con una plantilla.' },
        { el: T('menu-config'), texto: 'Está en el grupo <b>Configuración · privilegiada</b>. La usan los roles CARGA y CONFIGURACION, y cada cambio queda en la bitácora.' },
        { antes: async () => { await ir('config'); await clic(T('config-ubicaciones')); await hasta(T('ub-lista') + ' table'); }, el: T('ub-lista'),
          texto: 'Las <b>ubicaciones del almacén</b>: si tienen existencia, si están en un programa abierto y si están activas. GEN es la ubicación general del almacén y la crea el sistema.' },
        { antes: async () => { await escribir(T('ub-alta-pasillo'), 'P09'); await escribir(T('ub-alta-rack'), 'R01'); await escribir(T('ub-alta-nivel'), 'N01'); }, el: T('ub-alta'),
          texto: '<b>Crear una ubicación</b>: pasillo, rack y nivel, los tres. Si existía inactiva, se reactiva.' },
        { antes: async () => { await clic(T('ub-crear')); await espera(900); await escribir(T('ub-filtro'), 'P09'); await hasta(T('ub-inactivar')); }, el: T('ub-lista'),
          texto: 'Creada, <b>sin existencia</b> todavía. Ya aparece en los combos de Programación y del equipo, marcada así.' },
        { el: T('ub-inactivar'), texto: '<b>Inactivar</b> la saca de los combos y del conteo. No se puede si tiene existencia o está en un programa abierto.' },
        { el: T('ub-etiquetas'), texto: '<b>Etiquetas</b> con QR de las ubicaciones marcadas o, si no marca ninguna, de todas las filtradas. Se pegan en el rack antes de contar.' },
        { el: T('ub-excel'),
          texto: '<b>Cargar desde Excel</b>: almacén, pasillo, rack, nivel y si guarda lotes. Es todo o nada: si una fila tiene error no se crea ninguna, y las que ya existen se saltan.<br><small>Solo almacenes ya cargados. En ACTIVO, si SIMON ya maneja ubicaciones, el conteo las toma de allí.</small>' },
        { texto: FIN }
      ]
    },

    'conteo': {
      titulo: 'Conteo con el equipo', empresa: 'DEMO-SA', usuario: 'MCI_OP2',
      v: {},
      async preparar() {
        const v = RECORRIDOS.conteo.v, paq = await api('GET', 'handheld/programas/3/paquete');
        // 13OCT: una ubicación con dos productos sin contar, para mostrar la corrección libre y la que pide COE
        const libres = paq.lineas.filter(l => !l.manejaLote && !l.grabado);
        v.linea = libres.find(l => libres.some(o => o.ubicacion === l.ubicacion && o.idCuaderno !== l.idCuaderno)) || libres[0] || paq.lineas[0];
        v.otra = libres.find(o => o.ubicacion === v.linea.ubicacion && o.idCuaderno !== v.linea.idCuaderno) || null;
      },
      pasos: [
        { texto: '<b>Conteo con el equipo.</b> El operador cuenta con su teléfono, tableta o lector. El conteo es <b>ciego</b>: el equipo nunca recibe cuánto debería haber.' },
        { antes: async () => { await ir('conteo'); const s = await hasta(T('hh-programa')); if (s.value !== '3') await elegir(T('hh-programa'), '3'); await hasta(T('hh-lector')); }, el: T('hh-programa'),
          texto: 'Sus <b>programas con el conteo abierto</b> y cuántas líneas le faltan.' },
        { antes: () => escribir(T('hh-lector'), RECORRIDOS.conteo.v.linea.ubicacion), el: T('hh-lector'),
          texto: 'Lea la <b>etiqueta de la ubicación</b> con el lector (o escríbala, o elija pasillo, rack y nivel abajo).' },
        { antes: async () => { await clic(T('hh-buscar')); await espera(400); if (visible(T('modal-ok'))) { await clic(T('modal-ok')); await hastaQueSeVaya(T('modal')); } }, el: T('hh-ubicacion'),
          texto: 'Esa es la <b>ubicación actual</b>.<br><small>Cambiar de ubicación siempre pide confirmación.</small>' },
        { antes: async () => { await escribir(T('hh-lector'), RECORRIDOS.conteo.v.linea.codigo); await clic(T('hh-buscar')); }, el: T('hh-producto'),
          texto: 'Lea el <b>producto</b>: código o código de barras.<br><small>Si maneja lote, pide elegir el lote.</small>' },
        { antes: async () => { for (const k of ['1', '2']) await clic(T('hh-k-' + k)); }, el: T('hh-cantidad'),
          texto: 'La <b>cantidad</b>, con el teclado. Los botones <b>+N</b> y <b>−N</b> acumulan y <b>⟲</b> deshace.' },
        { el: T('hh-grabar'), texto: '<b>Grabar.</b> Nada se graba solo: si sale con una cantidad sin grabar, el equipo avisa que se perderá.' },
        { antes: async () => { await clic(T('hh-grabar')); await espera(500); }, el: T('hh-aviso'), texto: 'Grabado. El equipo le dice cuál es el <b>siguiente pendiente</b> en esta ubicación.' },
        { el: T('hh-recien'), texto: '¿Se dio cuenta de un error? Mientras <b>no pase a otro producto ni cambie de ubicación</b>, lo recién grabado se corrige <b>sin COE</b>: así no se carga al supervisor.' },
        { antes: async () => { await clic(T('hh-recien')); for (const k of ['1', '0']) await clic(T('hh-k-' + k)); await clic(T('hh-grabar')); await espera(500); }, el: T('hh-aviso'),
          texto: 'Corregido de 12 a 10, <b>sin COE</b>. Queda registrado como <b>corrección inmediata</b>, y no cuenta como corrección en sus indicadores.' },
        { antes: async () => { const o = RECORRIDOS.conteo.v.otra; if (o) { await escribir(T('hh-lector'), o.codigo); await clic(T('hh-buscar')); } }, el: T('hh-producto'),
          texto: 'Pasó a <b>otro producto</b>: desde ahora, lo anterior ya no se corrige libremente. Lo mismo al cambiar de ubicación o de programa.' },
        { antes: async () => { await escribir(T('hh-lector'), RECORRIDOS.conteo.v.linea.codigo); await clic(T('hh-buscar')); await clic(T('hh-k-9')); await clic(T('hh-grabar')); await hasta(T('modal')); }, el: T('modal'),
          texto: 'Volver a un producto ya grabado, <b>después de pasar a otro</b>, es una <b>corrección</b>: pide la cédula y la <b>COE del supervisor</b>.<br><small>Sin supervisor a mano, deje la COE vacía: queda pendiente y no suma hasta que la apruebe.</small>' },
        { antes: async () => { await clic(T('modal-cancelar')); await hastaQueSeVaya(T('modal')); }, el: T('hh-vista-fuera'),
          texto: 'Si cuenta un producto <b>donde no tiene línea</b>, el equipo dice dónde debería estar. Contado aquí va como <b>hallazgo</b> a la ubicación virtual SU: no suma y nunca se ajusta.' },
        { el: T('hh-red'), texto: '<b>Sin señal</b> el equipo sigue contando: las capturas quedan en cola y se envían solas al volver, sin duplicar.<br><small>⚠ Antes de cerrar sesión, revise que la cola esté en cero.</small>' },
        { texto: FIN }
      ]
    },

    'construccion': {
      titulo: 'Modo Construcción de Ubicaciones', empresa: 'DEMO-SA', usuario: 'MCI_SUP',
      v: {},
      async preparar() {
        // un programa en Modo Construcción con la F1 abierta, y un producto sin lote para contar
        const v = RECORRIDOS.construccion.v;
        await api('PUT', 'parametros', { clave: 'MODO_UBICACIONES', ambito: 'EMPRESA', valor: 'CONSTRUCCION' });
        const r = await api('POST', 'programas', { idAlmacen: 1, pasillo: 'P05', rack: '', nivel: '', lote: '', fechaDesde: hoy(), fechaHasta: hoy(2), modalidad: 1, observacion: 'Recorrido guiado: Modo Construcción' });
        v.n = Number(r.numero);
        for (const o of ['99000004', '99000005']) await api('POST', `programas/${v.n}/operadores`, { operador: o });
        for (const p of ['iniciar', 'nueva-fase', 'emitir-cuadernos', 'abrir-conteo']) await api('POST', `programas/${v.n}/ciclo/${p}`, {});
        const paq = await comoUsuario('MCI_OP2', () => api('GET', `handheld/programas/${v.n}/paquete`));
        v.prod = paq.lineas.find(l => !l.manejaLote) || paq.lineas[0];
        v.ubi = (paq.lineas[0].ubicacion.split('|')[0]) + '|P05|R09|N01';
      },
      pasos: [
        { texto: '<b>Modo Construcción de Ubicaciones.</b> Para almacenes que todavía no tienen sus ubicaciones en el sistema: se arman en el almacén, se les pega la etiqueta, y el conteo las incorpora al leerlas.<br><small>Se activa en Configuración → Parámetros (MODO_UBICACIONES). Cada programa lo fija al iniciarse.</small>' },
        { antes: async () => { await ir('programacion', RECORRIDOS.construccion.v.n); await hasta(T('pg-detalle')); }, el: T('pg-detalle'),
          texto: 'En la <b>fase 1</b> no hay sorteo ni asignación por ubicación: cuentan los <b>operadores del programa</b> en cualquier ubicación del alcance. La sectorización del almacén es física, con cinta.' },
        { antes: async () => { const n = String(RECORRIDOS.construccion.v.n); await entrarComo('DEMO-SA', 'MCI_OP2'); await ir('conteo'); const s = await hasta(T('hh-programa')); if (s.value !== n) await elegir(T('hh-programa'), n); await hasta(T('hh-lector')); await espera(600); }, el: T('hh-modo'),
          texto: 'El equipo dice en qué <b>modo</b> está el programa.' },
        { antes: async () => { await escribir(T('hh-lector'), RECORRIDOS.construccion.v.ubi); await clic(T('hh-buscar')); await hasta(T('modal')); }, el: T('modal'),
          texto: 'Leyó una ubicación que <b>no existe</b>: el equipo pregunta si la crea. Queda firme al grabar el primer producto en ella; no la confirma nadie más.' },
        { antes: async () => { await clic(T('modal-ok')); await hastaQueSeVaya(T('modal')); }, el: T('hh-ubicacion'), texto: 'Es la <b>ubicación actual</b>, aunque el sistema todavía no la tenga: viaja por su texto, así que funciona también sin señal.' },
        { antes: async () => { await escribir(T('hh-lector'), RECORRIDOS.construccion.v.prod.codigo); await clic(T('hh-buscar')); }, el: T('hh-aviso'),
          texto: 'El producto <b>no tenía línea aquí</b>: no va como hallazgo, se <b>agrega al cuaderno</b> en esta ubicación con teórico 0 y queda ubicado para la fase siguiente.' },
        { antes: async () => { await clic(T('hh-k-5')); await clic(T('hh-grabar')); await espera(800); }, el: T('hh-ubicacion'),
          texto: 'Grabado. Al cerrar la fase se compensa el <b>total del producto</b>: lo que estaba en GEN y se contó aquí queda <b>RU</b>, reubicado.' },
        { texto: 'Desde la <b>fase 2</b> el programa sigue las reglas de <b>Ubicaciones Existentes</b>: las líneas con diferencia se sortean al emitir los cuadernos (por pasillo, rack o nivel), nadie recuenta lo que contó en la F1, y ya no se crean ubicaciones.' },
        { texto: FIN }
      ]
    },

    'cargas': {
      titulo: 'Cargar el catálogo desde Excel', empresa: 'DEMO-SA', usuario: 'MCI_SUP',
      pasos: [
        { texto: '<b>Cargas Excel</b> (solo STAND ALONE). El módulo no lee SIMON: el catálogo y las existencias llegan en dos archivos Excel, <b>productos primero</b>, existencias después.<br><small>Vamos a cargar un catálogo de ferretería de 45 productos que trae un error a propósito.</small>' },
        { el: T('menu-cargas'), texto: 'Está en el menú <b>Cargas Excel</b>. La hace el supervisor o quien configura: hace falta el rol <b>CARGA</b> o <b>CONFIGURACION</b>.' },
        { antes: async () => { await ir('cargas'); await hasta(T('carga-archivo')); }, el: T('carga-plantilla'),
          texto: '<b>Descargar plantilla</b> baja un Excel con los encabezados correctos y una fila de ejemplo. Las columnas se reconocen <b>por el texto del encabezado</b>, sin importar mayúsculas, acentos ni orden.' },
        { el: T('carga-archivo'), texto: 'Aquí se elige el archivo: se lee <b>la primera hoja</b>, con los encabezados en la fila 1.' },
        { antes: async () => { await elegirArchivo(T('carga-archivo'), excelDePractica(true)); await hasta(T('carga-cargar')); }, el: T('carga-columnas'),
          texto: 'La <b>vista previa</b> dice qué columna reconoció y en qué letra: <b>✓</b> las que vienen, <b>–</b> las opcionales que no. Si falta una obligatoria, no deja cargar.' },
        { el: T('carga-vista-tabla'), texto: 'Debajo, las primeras filas tal como se leyeron. Revise que cada dato esté en su columna.' },
        { el: T('carga-cargar'), texto: '<b>Validar y cargar.</b> La carga es <b>todo o nada</b>: si una sola fila tiene un error, no se cambia nada.' },
        { antes: async () => { await clic(T('carga-cargar')); await hasta('.swal2-popup .swal2-cancel'); }, el: '.swal2-popup',
          texto: 'Confirma qué va a pasar. ⚠ Los productos que <b>no vengan</b> en el archivo quedan de baja (conservan su Id): use siempre el <b>catálogo completo</b>.' },
        { antes: async () => { await aceptarConfirmacion(); await hasta(T('carga-errores')); }, el: T('carga-errores'),
          texto: '<b>Rechazada, y no se cambió nada.</b> La lista da fila, columna, valor y motivo: la <b>fila 18</b> no tiene código, que es obligatorio.' },
        { el: T('carga-historial'), texto: 'El <b>historial</b> registra cada intento: quién, cuándo, cuántas filas y, si se rechazó, <b>ver errores</b>.' },
        { antes: async () => { await elegirArchivo(T('carga-archivo'), excelDePractica(false)); await hasta(T('carga-cargar')); }, el: T('carga-archivo'),
          texto: 'Se corrige en el Excel (aquí, <b>DEMO-117</b> en la fila 18) y se vuelve a elegir el archivo.' },
        { antes: async () => { await clic(T('carga-cargar')); await aceptarConfirmacion(); await hasta(T('carga-ok')); }, el: T('carga-ok'),
          texto: '<b>Carga aplicada: 45 filas.</b> El catálogo quedó reemplazado.' },
        { el: T('carga-historial'), texto: 'En el historial: <b>2 altas</b> (los productos nuevos), 0 bajas. Un código que ya existía conserva su Id.' },
        { el: T('carga-tipo-existencias'), texto: 'Después, <b>Existencias por ubicación</b>, igual: almacén, pasillo, rack, nivel, código, cantidad y lote si aplica. <b>Reemplaza</b> las existencias.<br><small>El Excel de productos acepta además cinco columnas con el <b>criterio de aprobación</b>. ⚠ No se puede cargar con un programa iniciado.</small>' },
        { texto: FIN }
      ]
    },

    'gobierno': {
      titulo: 'Gobierno: qué ve el supervisor', empresa: 'DEMO-SA', usuario: 'MCI_GER',
      pasos: [
        { texto: '<b>Gobierno.</b> La gerencia o la junta deciden si el supervisor ve el teórico, lo contado y las diferencias durante el ciclo. Viene habilitado.' },
        { antes: async () => { await ir('config'); await hasta(T('gobierno')); }, el: T('gobierno'), texto: 'En <b>Parámetros del módulo</b>, la tarjeta <b>Gobierno</b>. Solo GERENTE o FIRMANTE la cambian; el rol CONFIGURACION no alcanza.' },
        { antes: async () => { await clic(T('gob-SUPERVISOR_VE_CANTIDADES')); await hasta(T('modal')); await escribir(T('gob-coe'), '1234'); }, el: T('modal'), texto: 'Se confirma con la <b>COE</b>. El cambio vale para toda la empresa y queda en la bitácora.' },
        { antes: async () => { await clic(T('modal-ok')); await hastaQueSeVaya(T('modal')); await entrarComo('DEMO-SA', 'MCI_SUP'); await ir('ciclo', 4); await hasta(T('avance')); await espera(600); }, el: T('avance'),
          texto: 'Así lo ve ahora el <b>supervisor</b>: sin teórico, contado ni diferencias. La gerencia y la junta siguen viéndolo al cerrar el programa.' },
        { texto: FIN }
      ]
    },
  };

  /* ------------------------------------------------------------------ globo y foco */
  let R = null, i = 0, pausa = false, actual = null, temporizador = null, corriendo = false, menuAbierto = false;
  let foco = null, globo = null;

  function armarGlobo() {
    if (document.getElementById('mci-tour-globo')) return;
    const css = document.createElement('style');
    css.textContent = `
    #mci-tour-foco{position:fixed;z-index:10000;border:2px solid #f59e0b;border-radius:10px;box-shadow:0 0 0 9999px rgba(15,23,42,.45);pointer-events:none;transition:all .35s ease}
    #mci-tour-globo{position:fixed;z-index:10001;max-width:min(380px,calc(100vw - 32px));background:#fffbeb;color:#1f2937;border:1px solid #f59e0b;border-radius:12px;
      box-shadow:0 12px 32px rgba(0,0,0,.28);padding:14px 16px 12px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;transition:top .35s ease,left .35s ease}
    #mci-tour-globo .t{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#92400e;margin-bottom:6px;display:flex;justify-content:space-between;gap:10px}
    #mci-tour-globo .acc{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}
    #mci-tour-globo button{border:1px solid #d6a74a;background:#fff;color:#1f2937;border-radius:7px;padding:4px 10px;font:inherit;font-size:13px;cursor:pointer}
    #mci-tour-globo button.p{background:#b45309;border-color:#b45309;color:#fff}
    #mci-tour-globo button:focus-visible{outline:2px solid #1d4ed8;outline-offset:1px}
    #mci-tour-globo button:disabled{opacity:.5;cursor:default}
    #mci-tour-globo .barra{height:3px;background:#fde68a;border-radius:2px;margin-top:10px;overflow:hidden}
    #mci-tour-globo .barra i{display:block;height:100%;width:0;background:#b45309}
    #mci-tour-globo.err{background:#fef2f2;border-color:#dc2626}
    @media (prefers-reduced-motion:reduce){#mci-tour-foco,#mci-tour-globo{transition:none}}`;
    document.head.appendChild(css);
    foco = document.createElement('div'); foco.id = 'mci-tour-foco';
    globo = document.createElement('div'); globo.id = 'mci-tour-globo'; globo.setAttribute('role', 'dialog'); globo.setAttribute('aria-live', 'polite');
    addEventListener('resize', ubicar); addEventListener('scroll', ubicar, true);
    // la pantalla puede volver a dibujarse después de ubicar el paso: el foco y el globo siguen al control
    setInterval(() => {
      if (!actual || typeof actual.el !== 'string' || !globo.isConnected) return;
      const e = document.querySelector(actual.el); if (!e) return;
      if (!pausa && !enVista(e)) e.scrollIntoView({ block: 'center' });   // en pausa, el usuario mira donde quiera
      ubicar();
    }, 400);
  }
  const enVista = e => { const r = e.getBoundingClientRect(); return r.bottom > 40 && r.top < innerHeight - 40; };

  function ubicar() {
    if (!globo) return;
    const el = actual && typeof actual.el === 'string' ? document.querySelector(actual.el) : null;
    const g = globo.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    if (!el) {
      foco.style.cssText = 'top:50%;left:50%;width:0;height:0;';
      globo.style.top = Math.max(16, (H - g.height) / 2) + 'px'; globo.style.left = Math.max(16, (W - g.width) / 2) + 'px';
      return;
    }
    const r = el.getBoundingClientRect(), p = 6;
    foco.style.cssText = `top:${r.top - p}px;left:${r.left - p}px;width:${r.width + 2 * p}px;height:${r.height + 2 * p}px;`;
    /* Regla de Claudio (07OCT): el globo nunca debe tapar lo que se está explicando. Se prueban
       posiciones en orden de preferencia y se elige la que menos se superpone con lo señalado. */
    const m = 12, gw = g.width, gh = g.height;
    const ajX = x => Math.min(W - gw - m, Math.max(m, x)), ajY = y => Math.min(H - gh - m, Math.max(m, y));
    const cand = [
      [ajX(r.left), r.bottom + 14], [ajX(r.left), r.top - gh - 14],
      [r.right + 14, ajY(r.top)], [r.left - gw - 14, ajY(r.top)],
      [W - gw - m, H - gh - m], [m, H - gh - m], [W - gw - m, m], [m, m]
    ].map(([x, y]) => [ajX(x), ajY(y)]);
    const tapa = ([x, y]) => Math.max(0, Math.min(x + gw, r.right + p) - Math.max(x, r.left - p)) * Math.max(0, Math.min(y + gh, r.bottom + p) - Math.max(y, r.top - p));
    let mejor = cand[0], menos = tapa(cand[0]);
    for (const c of cand.slice(1)) { const t = tapa(c); if (t < menos - 1) { mejor = c; menos = t; } }
    globo.style.top = mejor[1] + 'px'; globo.style.left = mejor[0] + 'px';
  }

  function pintar(error) {
    const n = R.pasos.length, ultimo = i >= n - 1;
    globo.classList.toggle('err', !!error);
    globo.innerHTML = `<div class="t"><span>${R.titulo}</span><span>Paso ${Math.min(i + 1, n)} de ${n}</span></div>
      <div>${error ? '⚠ El recorrido no pudo seguir: ' + error + '<br><small>La pantalla pudo haber cambiado. Avise para actualizar este recorrido.</small>' : actual.texto}</div>
      <div class="barra"><i></i></div>
      <div class="acc">
        ${error ? '<button type="button" class="p" data-a="repetir">Repetir</button>'
          : ultimo ? `${i > 0 ? '<button type="button" data-a="ant">‹ Anterior</button>' : ''}<button type="button" class="p" data-a="repetir">Repetir</button>`
          : `<button type="button" data-a="pausa">${pausa ? '▶ Seguir' : '⏸ Pausa'}</button>${i > 0 ? '<button type="button" data-a="ant">‹ Anterior</button>' : ''}<button type="button" class="p" data-a="sig">Siguiente ›</button>`}
        <button type="button" data-a="salir">Salir</button>
      </div>`;
    globo.querySelectorAll('button').forEach(b => b.onclick = () => accion(b.dataset.a));
    requestAnimationFrame(ubicar);
  }

  function programar() {
    clearTimeout(temporizador);
    if (pausa || i >= R.pasos.length - 1) return;
    // tiempo de lectura: el largo del texto, entre 4 y 11 segundos
    const ms = Math.min(11000, Math.max(4000, actual.texto.replace(/<[^>]+>/g, '').length * 55));
    const barra = globo.querySelector('.barra i');
    if (barra) { barra.style.transition = 'none'; barra.style.width = '0'; requestAnimationFrame(() => { barra.style.transition = `width ${ms}ms linear`; barra.style.width = '100%'; }); }
    temporizador = setTimeout(() => mostrar(i + 1), ms);
  }

  // Hace lo del paso (si hace algo) y espera su control. sinAccion: el paso ya se hizo y solo se vuelve a mostrar.
  async function ejecutar(n, sinAccion) {
    let p = R.pasos[n];
    if (p.antes && !sinAccion) await p.antes();
    if (typeof p.el === 'function') p = { ...p, el: p.el() };
    // el menú flotante: si el paso señala una opción del menú, se abre fijo mientras se explica
    const enMenu = !!(p.el && p.el.startsWith('[data-tutor="menu'));
    if (enMenu !== menuAbierto) { await pagina.invokeMethodAsync('TutorMenu', enMenu); menuAbierto = enMenu; await espera(250); }
    return { paso: p, el: p.el ? await hasta(p.el) : null };
  }

  async function mostrar(n, sinAccion) {
    if (corriendo) return; corriendo = true; clearTimeout(temporizador);
    i = n;
    try {
      const r = await ejecutar(n, sinAccion);
      actual = r.paso;
      if (r.el) { r.el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); await espera(350); }
      pintar(); programar();
    } catch (e) { actual = R.pasos[n]; pausa = true; pintar(e.message); }
    corriendo = false;
  }

  // La demostración vuelve a su estado inicial y entra como el usuario del recorrido
  async function desdeCero() {
    menuAbierto = false;
    await pagina.invokeMethodAsync('TutorEntrar', R.empresa, R.usuario, true);
    if (R.preparar) await R.preparar();
  }

  /* "‹ Anterior" (Claudio, 13OCT2026). Si entre el paso anterior y este nada se hizo en la
     pantalla, se vuelve al instante. Si algo se hizo, la demostración vuelve a su estado inicial
     y rehace en rápido los pasos hasta el anterior. Al volver queda en pausa, para leer con calma. */
  async function anterior() {
    if (corriendo || i <= 0) return;
    const k = i - 1;
    pausa = true;
    if (!R.pasos.slice(k + 1, i + 1).some(p => p.antes)) { mostrar(k, true); return; }
    clearTimeout(temporizador); corriendo = true;
    globo.querySelectorAll('button').forEach(b => b.disabled = true);
    actual = { texto: `Volviendo al paso ${k + 1}…` }; pintar(); globo.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
      await desdeCero();
      rapido = true;
      for (let n = 0; n < k; n++) await ejecutar(n);
    } catch (e) { rapido = false; corriendo = false; i = k; actual = R.pasos[k]; pintar(e.message); return; }
    rapido = false; corriendo = false;
    mostrar(k);
  }

  async function repetir() {
    clearTimeout(temporizador); pausa = false; corriendo = true;
    try { await desdeCero(); } catch (e) { corriendo = false; pintar('no se pudo reiniciar la demostración (' + e.message + ')'); return; }
    corriendo = false; mostrar(0);
  }

  function accion(a) {
    if (a === 'sig') mostrar(i + 1);
    else if (a === 'ant') anterior();
    else if (a === 'pausa') { pausa = !pausa; pintar(); programar(); }
    else if (a === 'repetir') repetir();
    else if (a === 'salir') {
      // Salir cierra la pestaña que abrió el manual; si el navegador no deja, vuelve al manual
      clearTimeout(temporizador); foco.remove(); globo.remove();
      window.close();
      setTimeout(() => { if (!window.closed) location.href = 'ManualConteoInventario'; }, 300);
    }
  }

  window.mciTutor = {
    /** recorrido: "tour-avance" o "avance"; ref: DotNetObjectReference de la página. */
    async iniciar(recorrido, ref) {
      pagina = ref;
      const id = String(recorrido || '').replace(/^tour-/, '');
      R = RECORRIDOS[id];
      armarGlobo();
      if (!R) { R = { titulo: 'SIMON Tutor', pasos: [{ texto: '' }] }; actual = R.pasos[0]; document.body.append(globo); pintar('el recorrido "' + id + '" no existe'); return; }
      document.body.append(foco, globo);
      actual = { texto: 'Preparando la demostración…' }; i = 0; pintar();
      globo.querySelectorAll('button').forEach(b => b.disabled = true);
      try { await desdeCero(); } catch (e) { actual = R.pasos[0]; pintar('no se pudo entrar a la demostración (' + e.message + ')'); return; }
      mostrar(0);
    },
    /** Ids de los recorridos que ya corren sobre Razor. */
    recorridos: () => Object.keys(RECORRIDOS)
  };
})();
