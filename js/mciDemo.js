/* =============================================================================
   MCI · MOTOR DE DATOS DE LA DEMOSTRACIÓN (P-064 fase 2, 16OCT2026)

   Las pantallas REALES del módulo (las páginas Razor de SIMON 360) en modo
   demostración: la página ConteoInventarioDemo trabaja con una empresa
   ficticia de clave NEGATIVA (-1 DEMO-SA, -2 DEMO-AC) y ConteoInventarioService,
   al ver esa clave, le pide la respuesta a este motor en vez de al API. No se
   toca window.fetch: el resto de SIMON 360 sigue hablando con el API, y la
   página real del módulo puede estar abierta al lado sin mezclarse.

   Responde con DATOS INVENTADOS en memoria, con las mismas reglas que el API
   (ciclo de fases, CT/AP/DIF, sorteo, plantilla, firmas por nivel, ajuste,
   roles, ubicación compartida). Nada se guarda en ninguna base: el estado vive
   en esta pestaña del navegador (sessionStorage) y "Reiniciar" lo vuelve al
   inicio.

   Nació como la capa del mockup v4 (06OCT2026, Mockup/v4/demo-api.js del API),
   que interceptaba fetch para la app de prueba. Desde la fase 2 el original es
   este archivo. Si el API cambia la forma de una respuesta, se cambia aquí.

   Interfaz (window.mciDemo):
     atender(metodo, ruta, cuerpoJson)   -> { status, cuerpo }   la "llamada al API"
     leerExcel(ruta, base64, nombre)     -> { status, cuerpo }   la lectura de una carga
     descargar(ruta)                     -> { ok, mensaje, base64, nombre }
     entrar(clave, cedula) · sesion() · usuarios() · reiniciar()
   ============================================================================= */
(function () {
  'use strict';
  if (window.mciDemo) return;   // ya cargado (se importa cada vez que se abre la página)
  const CLAVE_ESTADO = 'mci.demo.estado.v8';   // v8 (16OCT2026): empresas de clave negativa y ubicación compartida (F-041)

  /* ------------------------------------------------------------------ utilidades */
  function azar(semilla) {               // mulberry32: mismos datos en cada carga
    return function () {
      semilla |= 0; semilla = semilla + 0x6D2B79F5 | 0;
      let t = Math.imul(semilla ^ semilla >>> 15, 1 | semilla);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const r2 = n => Math.round(n * 100) / 100;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const diaISO = (dd = 0) => { const d = new Date(hoy); d.setDate(d.getDate() + dd); return d.toISOString().slice(0, 10); };
  const momento = (dd, hh, mm) => { const d = new Date(hoy); d.setDate(d.getDate() + dd); d.setHours(hh, mm, 0, 0); return d.toISOString(); };
  const ahora = () => new Date().toISOString();
  const nueva = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  const st = n => String(n).padStart(10, '0');

  /* ------------------------------------------------------------------ catálogo inventado
     Ferretería genérica, sin marcas. Los que manejan lote: pinturas, silicón y pega. */
  const FAMILIAS = [
    ['TORNILLO AUTORROSCANTE', ['1/4 X 1', '1/4 X 2', '3/8 X 2', '3/8 X 3'], 'UND', 0.12, false],
    ['TUERCA HEXAGONAL', ['1/4', '3/8', '1/2'], 'UND', 0.08, false],
    ['ARANDELA PLANA', ['1/4', '3/8', '1/2'], 'UND', 0.05, false],
    ['CABLE THHN 12 AWG', ['ROJO 100M', 'NEGRO 100M', 'BLANCO 100M'], 'ROLLO', 48, false],
    ['CABLE THHN 14 AWG', ['ROJO 100M', 'NEGRO 100M'], 'ROLLO', 36, false],
    ['BOMBILLO LED', ['9W', '12W', '18W'], 'UND', 1.9, false],
    ['TUBO PVC AGUAS BLANCAS', ['1/2 X 3M', '3/4 X 3M', '1 X 3M'], 'UND', 3.4, false],
    ['CODO PVC 90°', ['1/2', '3/4', '1'], 'UND', 0.45, false],
    ['LLAVE DE PASO', ['1/2', '3/4'], 'UND', 6.8, false],
    ['PINTURA ESMALTE', ['BLANCO GALÓN', 'NEGRO GALÓN', 'GRIS GALÓN'], 'GAL', 21, true],
    ['BROCHA', ['2 PULG', '3 PULG'], 'UND', 1.6, false],
    ['CINTA AISLANTE', ['NEGRA 20M', 'ROJA 20M'], 'UND', 0.9, false],
    ['SILICÓN TRANSPARENTE', ['280 ML'], 'UND', 3.2, true],
    ['PEGA PVC', ['1/4 GALÓN'], 'UND', 7.5, true],
    ['DISCO DE CORTE', ['4-1/2 METAL', '7 METAL'], 'UND', 1.3, false],
    ['GUANTES DE SEGURIDAD', ['TALLA M', 'TALLA L'], 'PAR', 2.4, false],
    ['CANDADO', ['40 MM', '50 MM'], 'UND', 5.5, false],
    ['BISAGRA', ['3 PULG', '4 PULG'], 'UND', 1.1, false]
  ];

  const USUARIOS = {
    MCI_SUP: { ced: '99000001', nombre: 'Supervisor (demo)' },
    MCI_GER: { ced: '99000002', nombre: 'Gerente (demo)' },
    MCI_F1: { ced: '99000003', nombre: 'Firmante (demo)' },
    MCI_OP2: { ced: '99000004', nombre: 'Operador 2 (demo)' },
    MCI_OP3: { ced: '99000005', nombre: 'Operador 3 (demo)' }
  };
  const nombreDe = ced => (Object.values(USUARIOS).find(u => u.ced === ced) || {}).nombre || '';

  const EMPRESAS = {
    'DEMO-SA': { id: -1, modo: 'STAND_ALONE', sucursal: '', almacen: 'ALM-CENTRAL', nombreAlmacen: 'Almacén central (demo)', semilla: 61 },
    'DEMO-AC': { id: -2, modo: 'ACTIVO', sucursal: 'SUC-01', almacen: 'DEP-PRINCIPAL', nombreAlmacen: 'Depósito principal (demo)', semilla: 52 }
  };
  const empresaPorId = id => Object.entries(EMPRESAS).find(([, e]) => e.id === Number(id));

  const PARAMETROS_BASE = [
    ['CONTABILIDAD', 'CENTRO_COSTO', '', 'TEXTO', null, 'Código de centro de costo cuando CENTRO_COSTO_ORIGEN = FIJO'],
    ['CONTABILIDAD', 'CENTRO_COSTO_ORIGEN', 'NINGUNO', 'LISTA', 'ALMACEN|NINGUNO|FIJO', 'Centro de costo del asiento: el del almacén, ninguno o el código fijo de CENTRO_COSTO (H4)'],
    ['CONTABILIDAD', 'CTA_FALTANTE', '6.1.03.001', 'CUENTA', null, 'Cuenta de gasto por faltante de inventario'],
    ['CONTABILIDAD', 'CTA_INVENTARIO', '', 'CUENTA', null, 'Cuenta de inventario única (si CTA_INVENTARIO_ORIGEN = UNICA)'],
    ['CONTABILIDAD', 'CTA_INVENTARIO_ORIGEN', 'PRODUCTO', 'LISTA', 'PRODUCTO|UNICA', 'PRODUCTO = Tab_Inventario.TxtCodContable; UNICA = CTA_INVENTARIO'],
    ['CONTABILIDAD', 'CTA_SOBRANTE', '4.2.01.004', 'CUENTA', null, 'Cuenta de ingreso por sobrante de inventario'],
    ['CONTABILIDAD', 'TIPO_COMPROBANTE', 'AJINV', 'TEXTO', null, 'Tipo de comprobante del asiento en la bandeja del contador'],
    ['CONTABILIDAD', 'CTAS_AJUSTE_PROVISIONALES', '0', 'BOOL', '0|1', 'P-008 (15OCT2026): 1 = CTA_FALTANTE y CTA_SOBRANTE son provisionales (de prueba). En ACTIVO el ajuste se ve pero no se aplica hasta configurar las definitivas y poner 0'],
    ['GENERAL', 'MODALIDAD_DEFECTO', 'BLOQUEO', 'LISTA', 'BLOQUEO|CICLICO', 'Modalidad propuesta al crear un programa'],
    ['GENERAL', 'MODALIDADES_PERMITIDAS', 'BLOQUEO|CICLICO', 'TEXTO', 'BLOQUEO|CICLICO', 'Modalidades que el usuario puede elegir (una o las dos, separadas por |)'],
    ['GENERAL', 'MODO_CONTEO', '?', 'LISTA', 'INACTIVO|ACTIVO|STAND_ALONE', 'Modalidad del módulo. La define el MDC (conteo 125 y ubicaciones 126); aquí es informativa'],
    ['GENERAL', 'OPERADOR_DISTINTO_POR_FASE', 'AVISO', 'LISTA', 'NO|AVISO|OBLIGATORIO', 'Recuento ciego: el mismo operador en la fase siguiente sobre las mismas ubicaciones. NO lo permite sin decir nada, AVISO lo permite y avisa, OBLIGATORIO lo rechaza'],
    ['GENERAL', 'MIN_OPERADORES', '1', 'NUMERO', null, 'P-007 (15OCT2026): mínimo de operadores para emitir los cuadernos de una fase. En la F2 y la F3 el sorteo no le da a nadie lo que contó antes; si no queda quién, no se emite hasta agregar un operador'],
    ['GENERAL', 'UNIDAD_SORTEO', 'RACK', 'LISTA', 'PASILLO|RACK|NIVEL', 'Sorteo de operadores (14OCT2026): PASILLO reparte pasillos enteros; RACK reparte racks enteros; NIVEL reparte cada nivel por separado (más operadores en un mismo rack)'],
    ['GENERAL', 'MODO_UBICACIONES', 'EXISTENTES', 'LISTA', 'EXISTENTES|CONSTRUCCION', 'Modo de ubicaciones del conteo (14OCT2026): EXISTENTES = la ubicación tiene que existir y estar asignada al operador; CONSTRUCCION = el operador crea la ubicación al leerla. Vale para toda la empresa; el programa ya iniciado conserva el suyo'],
    ['GOBIERNO', 'SUPERVISOR_VE_CANTIDADES', '1', 'BOOL', '0|1', 'Gobierno (06OCT): 1 = supervisor y configuración ven teórico, contado y diferencias de las fases cerradas y el reporte de avance. Solo lo cambian GERENTE o FIRMANTE, con COE'],
    ['HALLAZGOS', 'SUPERVISOR_HALLAZGO', '1', 'BOOL', '0|1', 'Producto de otro depósito hallado al contar: 1 exige supervisor. Admite ámbito ALMACEN, CATEGORIA, PRODUCTO'],
    ['INDICADORES', 'PAUSA_MAX_MIN', '15', 'NUMERO', null, 'Indicadores de operadores: minutos sin capturas a partir de los cuales se considera pausa y no suman al tiempo efectivo'],
    ['VALORACION', 'MONEDA_LIMITE_COSTO', 'DIVISA', 'LISTA', 'DIVISA|LOCAL', 'Moneda en que se expresan los límites de tolerancia por costo (H3). Se copia al programa al corte'],
    ['VALORACION', 'TIPO_COSTO', 'MonUltimoCosto', 'LISTA', 'MonUltimoCosto|MonCostoDolar', 'Campo de Tab_Inventario que valora el conteo en ACTIVO. Se toma al corte']
  ];
  const POLITICA_BASE = [[1, 'Gerente de Operaciones', 1000, 500, 1], [2, 'Directiva / Gerente General', 10000, 2500, 1], [3, 'Junta Directiva', null, null, 2]];
  const TASA = 36.5;   // tasa de la divisa inventada

  /* ================================================================== construir una empresa */
  function construir(cod) {
    const E = EMPRESAS[cod], rnd = azar(E.semilla);
    const D = { cod, emp: E, seq: { prog: 0, linea: 0, asig: 0, rol: 0, bit: 0, carga: 0, bitcfg: 0, firma: 0, ajuste: 0 }, programas: [], fotos: [], cargas: [], bitcfg: [] };

    // catálogo
    D.catalogo = [];
    FAMILIAS.forEach(([fam, vars, und, costo, lote]) => vars.forEach(v => {
      const id = D.catalogo.length + 1;
      D.catalogo.push({ idProducto: id, codigo: 'DEMO-' + String(100 + id), tCean: '759' + String(Math.floor(1e9 + rnd() * 9e9)), nombre: fam + ' ' + v,
        unidadStock: und, manejaLote: lote, costo: r2(costo * (0.8 + rnd() * 0.5)), status: 1, val: 1, med: 1, lf: 0, ls: 0 });
    }));

    // ubicaciones: 5 pasillos × 4 racks × 3 niveles, y la GEN del almacén
    D.ubicaciones = []; let idu = 0;
    ['P01', 'P02', 'P03', 'P04', 'P05'].forEach(p => ['R01', 'R02', 'R03', 'R04'].forEach(r => ['N01', 'N02', 'N03'].forEach(n =>
      D.ubicaciones.push({ id: ++idu, pasillo: p, rack: r, nivel: n, tipoUbicacion: 1, estatusUbicacion: 1 }))));
    D.ubicaciones.push({ id: ++idu, pasillo: 'GEN', rack: 'GEN', nivel: 'GEN', tipoUbicacion: 2, estatusUbicacion: 1 });

    // existencias: cada producto en 2 o 3 ubicaciones; los de lote, con dos lotes
    D.existencias = [];
    D.catalogo.forEach(p => {
      const n = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const u = D.ubicaciones[Math.floor(rnd() * 60)];
        const lotes = p.manejaLote ? [['L2403', diaISO(180)], ['L2409', diaISO(360)]] : [['', null]];
        lotes.forEach(([lote, venc]) => {
          if (D.existencias.some(x => x.idProducto === p.idProducto && x.idUbicacion === u.id && x.lote === lote)) return;
          D.existencias.push({ idProducto: p.idProducto, idUbicacion: u.id, lote, venc, cantidad: 5 + Math.floor(rnd() * 120) });
        });
      }
    });

    D.parametros = PARAMETROS_BASE.map(([g, c, v, t, vp, d], i) => ({ id: i + 1, grupo: g, clave: c, ambito: 'EMPRESA', ambitoValor: '', valor: c === 'MODO_CONTEO' ? E.modo : v,
      tipoDato: t, valoresPermitidos: vp, descripcion: d, editable: c !== 'MODO_CONTEO', codUsuario: null, fechaUltAct: momento(-5, 9, 0) }));
    D.politica = POLITICA_BASE.map(([n, r, ne, li, f], i) => ({ id: i + 1, nivel: n, rol: r, netoHasta: ne, lineaMayorHasta: li, firmasRequeridas: f, codUsuario: null, fechaUltAct: momento(-5, 9, 0) }));
    D.roles = [];
    [['99000001', 'CONFIGURACION'], ['99000001', 'SUPERVISOR'], ['99000001', 'OPERADOR'], ['99000001', 'CARGA'], ['99000002', 'GERENTE'],
     ['99000003', 'FIRMANTE', 1], ['99000004', 'OPERADOR'], ['99000005', 'OPERADOR']].forEach(([c, r, n]) =>
      D.roles.push({ id: ++D.seq.rol, codUsuario: c, rol: r, nivelFirma: n || null, codUsuarioAsigna: '99000001', fechaUltAct: momento(-5, 9, 5) }));
    if (E.modo === 'STAND_ALONE') {
      D.cargas.push({ id: ++D.seq.carga, tipo: 'PRODUCTOS', archivo: 'Catalogo_demo.xlsx', codUsuario: '99000001', fecha: momento(-4, 8, 30),
        filasLeidas: D.catalogo.length, filasAceptadas: D.catalogo.length, filasRechazadas: 0, altas: D.catalogo.length, bajas: 0, reactivadas: 0, resultado: 'APLICADA', errores: [] });
      D.cargas.push({ id: ++D.seq.carga, tipo: 'EXISTENCIAS', archivo: 'Existencias_demo.xlsx', codUsuario: '99000001', fecha: momento(-4, 8, 40),
        filasLeidas: D.existencias.length, filasAceptadas: D.existencias.length, filasRechazadas: 0, altas: 0, bajas: 0, reactivadas: 0, resultado: 'APLICADA', errores: [] });
    }

    sembrarProgramas(D, rnd);
    return D;
  }

  /* Los programas de partida se arman con las MISMAS acciones que usa el usuario:
     así sus estados son coherentes (no se escriben a mano). */
  function sembrarProgramas(D, rnd) {
    const SUP = '99000001', GER = '99000002', F1 = '99000003', OPS = ['99000004', '99000005'];
    let reloj = 0;
    const contarFase = (p, sesgo) => {                  // los operadores cuentan su cuaderno
      const f = p.faseActual;
      p.lineas.filter(l => l.fases[f]).forEach((l, i) => {
        const op = operadorDe(p, l, f); if (!op) return;
        let c = l.teorico;
        if (f === 1) { if (rnd() < sesgo) c = Math.max(0, l.teorico + (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 4))); }
        // en F2/F3, como MCI_94: un tercio confirma la fase anterior (AP), otro da con el teórico (CT)
        // y otro difiere (va al gerente en la plantilla)
        else c = i % 3 === 0 ? l.cant[f - 1] : i % 3 === 1 ? l.teorico : l.cant[f - 1] + 1;
        registrarEvento(D, p, op, { idEvento: nueva(), fase: f, tipo: 'CONTEO', idCuaderno: l.id, cantidad: c, fechaEquipo: momento(-2, 9, 0 + (reloj += 2) % 300) });
      });
    };
    const P = (alcance, obs) => crearPrograma(D, SUP, Object.assign({ idAlmacen: 1, rack: '', nivel: '', lote: '', fechaDesde: diaISO(-2), fechaHasta: diaISO(1), modalidad: 1, observacion: obs }, alcance)).numero;
    const ciclo = (n, paso) => pasoCiclo(D, n, paso, SUP);
    const prog = n => D.programas.find(x => x.numeroPrograma === n);

    // 1 · programado, con operadores en el sorteo y la F1 sorteada
    const n1 = P({ pasillo: 'P01' }, 'Demo: programado con sorteo');
    OPS.forEach(o => agregarOperador(D, n1, o, SUP)); sortear(D, n1, 1, SUP);

    // 2 · iniciado, F1 con cuadernos emitidos (listos para imprimir)
    const n2 = P({ pasillo: 'P02' }, 'Demo: cuadernos emitidos');
    OPS.forEach(o => agregarOperador(D, n2, o, SUP)); prog(n2).sorteoAlEmitir = true;
    ciclo(n2, 'iniciar'); ciclo(n2, 'nueva-fase'); ciclo(n2, 'emitir-cuadernos');

    // 3 · contando la F1 (algo contado, mucho por contar): para el handheld
    const n3 = P({ pasillo: 'P03' }, 'Demo: conteo abierto');
    OPS.forEach(o => agregarOperador(D, n3, o, SUP)); prog(n3).sorteoAlEmitir = true;
    ciclo(n3, 'iniciar'); ciclo(n3, 'nueva-fase'); ciclo(n3, 'emitir-cuadernos'); ciclo(n3, 'abrir-conteo');
    const p3 = prog(n3); p3.lineas.filter(l => l.fases[1]).slice(0, Math.ceil(p3.lineas.length / 3)).forEach(l => {
      const op = operadorDe(p3, l, 1); registrarEvento(D, p3, op, { idEvento: nueva(), fase: 1, tipo: 'CONTEO', idCuaderno: l.id, cantidad: l.teorico, fechaEquipo: momento(0, 8, (reloj += 3) % 59) });
    });

    // 4 · cerrado, en la plantilla final: dos fases y diferencias por decidir
    const n4 = P({ pasillo: 'P04' }, 'Demo: plantilla final');
    OPS.forEach(o => agregarOperador(D, n4, o, SUP)); prog(n4).sorteoAlEmitir = true;
    ciclo(n4, 'iniciar'); ciclo(n4, 'nueva-fase'); ciclo(n4, 'emitir-cuadernos'); ciclo(n4, 'abrir-conteo');
    contarFase(prog(n4), 0.35); ciclo(n4, 'cerrar-fase');
    if (prog(n4).porRecontar) { ciclo(n4, 'nueva-fase'); ciclo(n4, 'emitir-cuadernos'); ciclo(n4, 'abrir-conteo'); contarFase(prog(n4), 0.5); ciclo(n4, 'cerrar-fase'); }
    ciclo(n4, 'cerrar-programa');

    // 5 · acta firmada (STAND ALONE) · aprobado esperando el ajuste (ACTIVO)
    const n5 = P({ pasillo: 'P05', rack: 'R01' }, D.emp.modo === 'ACTIVO' ? 'Demo: aprobado, espera el ajuste' : 'Demo: acta firmada');
    OPS.forEach(o => agregarOperador(D, n5, o, SUP)); prog(n5).sorteoAlEmitir = true;
    ciclo(n5, 'iniciar'); ciclo(n5, 'nueva-fase'); ciclo(n5, 'emitir-cuadernos'); ciclo(n5, 'abrir-conteo');
    contarFase(prog(n5), 0.3); ciclo(n5, 'cerrar-fase');
    if (prog(n5).porRecontar) { ciclo(n5, 'nueva-fase'); ciclo(n5, 'emitir-cuadernos'); ciclo(n5, 'abrir-conteo'); contarFase(prog(n5), 0.4); ciclo(n5, 'cerrar-fase'); }
    ciclo(n5, 'cerrar-programa');
    prog(n5).lineas.filter(l => l.porDecidir).forEach(l => decidir(D, n5, l.id, { decision: 'F3', motivo: 'Aceptar lo contado en la última fase' }, GER));
    enviarAprobacion(D, n5, GER);
    firmar(D, n5, { decision: 'APROBAR', coe: 'demo' }, F1);
  }

  /* ================================================================== reglas del módulo */
  const ubicStr = (D, u) => [D.emp.almacen, u.pasillo, u.rack, u.nivel].join('|');
  const prodDe = (D, id) => D.catalogo.find(p => p.idProducto === id);
  const bit = (D, p, usr, accion, fase, detalle) => p.bitacora.push({ id: ++D.seq.bit, fecha: ahora(), codUsuario: usr, accion, fase: fase || null, detalle: detalle || null });

  function enAlcance(p, u) {
    return u.tipoUbicacion === 1 && (!p.pasillo || u.pasillo === p.pasillo) && (!p.rack || u.rack === p.rack) && (!p.nivel || u.nivel === p.nivel);
  }
  /* Las líneas del alcance, desde las existencias (el teórico). Antes de iniciar sirven para el sorteo. */
  function lineasTeoricas(D, p) {
    return D.existencias.filter(x => { const u = D.ubicaciones.find(v => v.id === x.idUbicacion); return u && enAlcance(p, u) && (!p.lote || x.lote === p.lote) && prodDe(D, x.idProducto).status === 1
        && (!(p.productos || []).length || p.productos.includes(x.idProducto)); })
      .map(x => {
        const u = D.ubicaciones.find(v => v.id === x.idUbicacion), pr = prodDe(D, x.idProducto);
        return { id: 0, idProducto: pr.idProducto, codigo: pr.codigo, tCean: pr.tCean, descrip: pr.nombre, unidadStock: pr.unidadStock, manejaLote: pr.manejaLote,
          lote: x.lote, fechaVencLote: x.venc, idUbicacion: u.id, ubicacion: ubicStr(D, u), pasillo: u.pasillo, rack: u.rack, nivel: u.nivel,
          teorico: x.cantidad, costo: pr.costo, val: pr.val || 1, med: pr.med || 1, lf: pr.lf || 0, ls: pr.ls || 0, fases: {}, cant: {}, res: {}, opFijo: {}, grab: {}, decision: null, cantFinal: null, difFinal: null, motivo: null, porDecidir: false };
      })
      .sort((a, b) => a.ubicacion.localeCompare(b.ubicacion) || a.codigo.localeCompare(b.codigo));
  }

  /* F-026 (Claudio, 13 y 14OCT2026): el programa en Modo Construcción de Ubicaciones. Su modo es el que fijó al iniciar;
     si no inició, el de la Configuración. Cuentan los operadores del programa en cualquier ubicación del alcance. */
  function esCons(D, p) { return (p.modoUbicaciones || (D.parametros.find(x => x.clave === 'MODO_UBICACIONES' && x.ambito === 'EMPRESA') || {}).valor || 'EXISTENTES') === 'CONSTRUCCION'; }
  const esOperadorDe = (p, usr) => p.operadores.some(o => o.codUsuario === usr);
  // P-055 (Claudio, 14OCT2026): rige solo en la F1; desde la F2, las reglas de Ubicaciones Existentes
  const consF1 = (D, p, f = p.faseActual) => esCons(D, p) && (f || 1) <= 1;

  /* Quién cuenta una línea en una fase: la reasignación manda; si no, la asignación más específica. */
  function asignacionDe(p, l, f) {
    const A = p.asignaciones.filter(a => a.fase === f);
    // F-029: la de nivel manda sobre la de rack, y esta sobre la de pasillo (asignación excluyente)
    const peso = a => (a.pasillo ? 1 : 0) + (a.rack ? 1 : 0) + (a.nivel ? 1 : 0);
    const ok = A.filter(a => (!a.pasillo || a.pasillo === l.pasillo) && (!a.rack || a.rack === l.rack) && (!a.nivel || a.nivel === l.nivel)).sort((x, y) => peso(y) - peso(x));
    return ok.length ? ok[0] : null;
  }
  function operadorDe(p, l, f) {
    if (l.opFijo[f]) return l.opFijo[f];
    const a = asignacionDe(p, l, f);
    return a ? a.codUsuario : null;
  }
  /* F-041 / P-066 (Claudio, 16OCT2026), como MCI_FN_OperadoresLinea: en una ubicación con un conteo grande, otros
     operadores se suman a la asignación del MISMO alcance marcada compartida. Cada uno graba lo que cuenta y la línea
     suma lo de todos; el espacio se lo reparten a mano. */
  function operadoresDe(p, l, f) {
    const t = operadorDe(p, l, f), a = asignacionDe(p, l, f);
    const comp = a && a.compartida ? p.asignaciones.filter(x => x.fase === f && x.compartida && x.pasillo === a.pasillo && x.rack === a.rack && (x.nivel || '') === (a.nivel || '')).map(x => x.codUsuario) : [];
    return [...new Set([t, ...comp].filter(Boolean))];
  }
  const cuentaEn = (p, l, f, usr) => operadoresDe(p, l, f).includes(usr);
  const esCompartida = (p, l, f) => operadoresDe(p, l, f).length > 1;

  function crearPrograma(D, usr, b) {
    if (!b.idAlmacen) return falla('Elija el almacén.');
    const n = ++D.seq.prog;
    const p = { numeroPrograma: n, stPrograma: st(n), idAlmacen: 1, sucursal: D.emp.sucursal, almacen: D.emp.almacen, pasillo: b.pasillo || '', rack: b.rack || '', nivel: b.nivel || '',
      lote: b.lote || '', fechaConteo: b.fechaDesde || diaISO(0), fechaConteoHasta: b.fechaHasta || null, modalidad: b.modalidad || 1, moneda: 2, fechaCorte: null, codUsuario: usr,
      faseActual: 0, statusF1: 0, statusF2: 0, statusF3: 0, estado: 0, fechaOperacion: ahora(), sorteoAlEmitir: false, porRecontar: null,
      observacion: b.observacion || null, lineas: [], asignaciones: [], operadores: [], bitacora: [], eventos: [], firmas: [], ajuste: null };
    if (D.programas.some(x => x.estado <= 1 && x.idAlmacen === p.idAlmacen && solapan(x, p)))
      return falla('El alcance se solapa con otro programa vigente del mismo almacén.');
    D.programas.unshift(p);
    bit(D, p, usr, 'CREAR', null, `${p.almacen} · ${p.pasillo || '(todo)'} · ${p.fechaConteo} – ${p.fechaConteoHasta || p.fechaConteo} · ${p.modalidad === 1 ? 'con bloqueo' : 'cíclico'}`);
    return { ok: true, mensaje: `Programa ${p.stPrograma} creado.`, numero: n };
  }
  const solapan = (a, b) => [['pasillo'], ['rack'], ['nivel']].every(([k]) => !a[k] || !b[k] || a[k] === b[k]);

  function agregarOperador(D, n, op, usr) {
    const p = prog(D, n); if (p.operadores.some(o => o.codUsuario === op)) return falla(esCons(D, p) ? 'Ese operador ya es operador del programa.' : 'Ese operador ya está en el sorteo.');
    if (!D.roles.some(r => r.codUsuario === op && r.rol === 'OPERADOR')) return falla('El usuario no tiene el rol OPERADOR del módulo.');
    p.operadores.push({ id: p.operadores.length + 1, codUsuario: op, fechaUltAct: ahora() });
    bit(D, p, usr, 'SORTEO_AGREGAR', null, op);
    return { ok: true, mensaje: esCons(D, p) ? `${op} es operador del programa: cuenta en cualquier ubicación del alcance.` : `${op} entra al sorteo.` };
  }

  /* Sorteo: reparte los racks (o los niveles, UNIDAD_SORTEO = NIVEL, F-029) de la fase balanceando líneas;
     en F2/F3 evita al que contó esa unidad. */
  function sortear(D, n, f, usr) {
    const p = prog(D, n), ops = p.operadores.map(o => o.codUsuario);
    if (!ops.length) return falla('Agregue al menos un operador al sorteo.');
    const L = p.estado === 0 ? lineasTeoricas(D, p) : p.lineas.filter(l => l.fases[f]).concat(revisarDe(p, f));
    if (!L.length) return falla('La fase no tiene líneas que repartir.');
    const unidad = (D.parametros.find(x => x.clave === 'UNIDAD_SORTEO' && x.ambito === 'EMPRESA') || {}).valor || 'RACK';
    const porNivel = unidad === 'NIVEL', porPasillo = unidad === 'PASILLO', uni = porNivel ? 'niveles' : porPasillo ? 'pasillos' : 'racks';
    const racks = [...L.reduce((m, l) => { const k = l.pasillo + '|' + (porPasillo ? '' : l.rack) + (porNivel ? '|' + l.nivel : ''); m.set(k, (m.get(k) || 0) + 1); return m; }, new Map())].sort((a, b) => b[1] - a[1]);
    const carga = Object.fromEntries(ops.map(o => [o, { lineas: 0, racks: 0 }]));
    /* P-007 (Claudio, 15OCT2026), como MCI_PR_SortearFase: en la F2 y la F3 nadie recuenta lo que contó (ni donde halló
       producto) en cualquier fase anterior. Si no queda quién, el sorteo no se hace hasta que se agregue un operador. */
    const ubiDeEv = e => { const l = p.lineas.find(x => x.id === e.idCuaderno) || (p.revisar || []).find(x => x.id === e.idCuaderno); if (l) return l;
      if (e.hallazgo && e.ubicacionHallazgo) { const t = String(e.ubicacionHallazgo).split('|'); return { pasillo: t[1], rack: t[2], nivel: t[3] }; } return null; };
    const contaron = (pas, rack, nivel) => new Set(p.eventos.filter(e => e.fase < f && !e.rechazo).filter(e => { const u = ubiDeEv(e); return u && u.pasillo === pas && (!rack || u.rack === rack) && (!nivel || u.nivel === nivel); }).map(e => e.codUsuario));
    const nuevas = [];
    for (const [k, nl] of racks) {
      const [pas, rack, nivel = ''] = k.split('|');
      const ya = f > 1 ? contaron(pas, rack, nivel) : new Set();
      const op = ops.slice().sort((a, b) => carga[a].lineas - carga[b].lineas).find(o => !ya.has(o));
      if (!op) return falla(`No se puede sortear la fase ${f}: en ${[pas, rack, nivel].filter(Boolean).join('|')} todos los operadores del sorteo ya contaron en una fase anterior. Agregue otro operador al programa.`);
      carga[op].lineas += nl; carga[op].racks++;
      nuevas.push({ id: 0, fase: f, codUsuario: op, pasillo: pas, rack, nivel, programaFijado: false, codUsuarioFija: null, fechaFija: null });
    }
    p.asignaciones = p.asignaciones.filter(a => a.fase !== f).concat(nuevas.map(a => Object.assign(a, { id: ++D.seq.asig })));
    const detalle = ops.map(o => `${o} ${carga[o].lineas} líneas/${carga[o].racks} ${uni}`).join(' · ');
    const msg = `Sorteo F${f}: ${racks.length} ${uni}, ${L.length} líneas entre ${ops.length} operadores (${detalle}).${p.estado === 0 ? ' Según el inventario teórico: al iniciar se toma el corte.' : ''}`;
    bit(D, p, usr, 'SORTEO', f, msg);
    return { ok: true, mensaje: msg };
  }

  const STF = (p, f) => p['statusF' + f] || 0;
  const setSTF = (p, f, v) => { p['statusF' + f] = v; };

  function pasoCiclo(D, n, paso, usr) {
    const p = prog(D, n); if (!p) return falla('El programa no existe.');
    const f = p.faseActual, s = f ? STF(p, f) : 0;
    switch (paso) {
      case 'iniciar': {
        if (p.estado !== 0) return falla('El programa ya se inició.');
        p.lineas = lineasTeoricas(D, p); p.lineas.forEach(l => { l.id = ++D.seq.linea; });
        if (!p.lineas.length) return falla('El alcance no tiene existencias que contar.');
        p.estado = 1; p.fechaCorte = ahora(); p.modoUbicaciones = modoUbicCfg(D);   // el programa conserva su modo
        if (p.modoUbicaciones === 'CONSTRUCCION') p.sorteoAlEmitir = true;          // P-055: el sorteo de la F2 queda activado por defecto
        const ub = new Set(p.lineas.map(l => l.idUbicacion)).size;
        bit(D, p, usr, 'INICIAR', null, `${p.lineas.length} líneas copiadas al cuaderno · ${ub} ubicaciones bloqueadas`);
        return ok(`Programa ${p.stPrograma} iniciado: ${p.lineas.length} líneas al corte.`);
      }
      case 'nueva-fase': {
        if (p.estado !== 1) return falla('El programa no está en conteo.');
        if (f && s !== 4) return falla(`La fase ${f} está en curso: ciérrela antes de abrir otra.`);
        if (f >= 3) return falla('Ya se hicieron las 3 fases: cierre el programa.');
        const nf = f + 1;
        const L = nf === 1 ? p.lineas : p.lineas.filter(l => l.fases[f] && !['CT', 'AP', 'RU'].includes(l.res[f]));
        if (!L.length) return falla(`La F${f} cerró sin líneas en diferencia: no aplica otra fase. Cierre el programa.`);
        if (consF1(D, p, nf) && !p.operadores.length) return falla(`No se puede abrir la fase ${nf}: el programa no tiene operadores. Agréguelos en Programación.`);
        L.forEach(l => { l.fases[nf] = true; });
        /* P-053 (Claudio, 15OCT2026), como SMO_MCI_Ciclo_V01: el lugar donde se halló un producto que vuelve a contarse
           entra al cuaderno como línea A REVISAR (producto + ubicación hallada, sin cantidad). Lo que se cuente ahí
           reemplaza al hallazgo anterior en ese lugar. */
        let nRev = 0;
        if (nf > 1) {
          const va = new Set(L.map(l => l.idProducto + '|' + (l.lote || ''))), G = {};
          hallazgosVigentes(p, f).filter(h => va.has(h.idProducto + '|' + h.lote)).forEach(h => {
            const g = G[h.idProducto + '|' + h.lote + '|' + h.ubh] || (G[h.idProducto + '|' + h.lote + '|' + h.ubh] = { h, q: 0, ubt: {} });
            g.q += h.cantidad; g.ubt[h.ubt || ''] = (g.ubt[h.ubt || ''] || 0) + h.cantidad;
          });
          p.revisar = p.revisar || [];
          Object.values(G).filter(g => g.q > 0).forEach(g => {
            const u = D.ubicaciones.find(x => x.tipoUbicacion !== 3 && ubicStr(D, x).toUpperCase() === g.h.ubh); if (!u) return;
            if (p.lineas.some(l => l.idProducto === g.h.idProducto && l.idUbicacion === u.id && (l.lote || '') === g.h.lote)) return;
            const ubt = Object.entries(g.ubt).sort((a, b) => b[1] - a[1])[0][0] || null;
            let r = p.revisar.find(x => x.idProducto === g.h.idProducto && x.idUbicacion === u.id && (x.lote || '') === g.h.lote);
            if (!r) { const pr = prodDe(D, g.h.idProducto) || {};
              r = { id: ++D.seq.linea, revisar: true, idProducto: g.h.idProducto, codigo: pr.codigo, tCean: pr.tCean, descrip: pr.nombre, unidadStock: pr.unidadStock, manejaLote: pr.manejaLote,
                lote: g.h.lote, fechaVencLote: null, idUbicacion: u.id, ubicacion: ubicStr(D, u), pasillo: u.pasillo, rack: u.rack, nivel: u.nivel, fases: {}, opFijo: {} };
              p.revisar.push(r); }
            r.fases[nf] = true; r.ubicacionTeorica = ubt; r.observacion = `Revisar: aquí se halló en la fase ${f} (va a ${ubt || 'sin destino'})`; nRev++;
          });
        }
        p.faseActual = nf; setSTF(p, nf, 1);
        const avisoNF = (nRev ? ` Más ${nRev} lugar(es) donde se halló producto, a revisar.` : '')
          + (consF1(D, p, nf) ? ' Modo Construcción: los operadores del programa cuentan en cualquier ubicación del alcance.' : p.sorteoAlEmitir ? ' Los operadores se sortean al emitir los cuadernos.' : '');
        bit(D, p, usr, 'NUEVA_FASE', nf, `${L.length} líneas a contar${avisoNF}`);
        return ok(`F${nf} abierta: ${L.length} líneas a contar.${avisoNF}`);
      }
      case 'emitir-cuadernos': {
        if (!(s >= 1 && s <= 3)) return falla(f ? `La fase ${f} ya se cerró.` : 'Abra primero la fase.');
        const cons = consF1(D, p, f);
        // P-007 (Claudio, 15OCT2026): no hay conteo sin operadores; no se emite con menos que MIN_OPERADORES
        const minOp = Math.max(1, Number((D.parametros.find(x => x.clave === 'MIN_OPERADORES' && x.ambito === 'EMPRESA') || {}).valor) || 1);
        const nOp = new Set([...p.operadores.map(o => o.codUsuario), ...p.asignaciones.filter(a => a.fase === f).map(a => a.codUsuario)]).size;
        if (nOp < minOp) return falla(`No se emitieron los cuadernos: la fase ${f} tiene ${nOp} operador(es) y el mínimo es ${minOp} (parámetro MIN_OPERADORES). Agregue operadores en Programación.`);
        if (s === 1 && p.sorteoAlEmitir && !cons) { const r = sortear(D, n, f, usr); if (!r.ok) return falla('No se emitieron los cuadernos: ' + r.mensaje); }
        const sin = cons ? 0 : p.lineas.filter(l => l.fases[f]).concat(revisarDe(p, f)).filter(l => !operadorDe(p, l, f)).length;
        if (sin) return falla(`${sin} línea(s) de la F${f} sin operador: asígnelas o active el sorteo.`);
        if (s === 1) { setSTF(p, f, 2); p['emision' + f] = ahora(); }
        const ops = cons ? 1 : new Set(p.lineas.filter(l => l.fases[f]).flatMap(l => operadoresDe(p, l, f))).size;   // Construcción: un cuaderno general
        bit(D, p, usr, s === 1 ? 'EMITIR_CUADERNOS' : 'REEMITIR_CUADERNOS', f, `${ops} cuaderno(s)`);
        return ok(s === 1 ? `Cuadernos de la F${f} emitidos: ${ops} cuaderno(s).` : `Cuadernos de la F${f} reemitidos para imprimir: sin nuevo sorteo.`);
      }
      case 'abrir-conteo': {
        if (s !== 2) return falla(s === 3 ? `El conteo de la fase ${f} ya está abierto.` : 'Emita primero los cuadernos de la fase.');
        setSTF(p, f, 3); bit(D, p, usr, 'ABRIR_CONTEO', f, '');
        return ok(`Conteo de la fase ${f} abierto: los equipos pueden grabar.`);
      }
      case 'cerrar-fase': {
        if (s !== 3) return falla(s === 4 ? `La fase ${f} ya está cerrada.` : 'Abra primero el conteo de la fase.');
        const r = { ct: 0, ap: 0, ru: 0, dif: 0, mov: 0, noContadas: 0 };
        /* F-027 (Claudio, 13OCT2026), como SMO_MCI_Ciclo_V01: la tolerancia se aplica al TOTAL del producto
           y lote en el alcance del programa. Suma las líneas de esta fase y las del producto ya resueltas en
           una fase anterior (conservan su conteo). Si el total cuadra, ninguna pasa a la fase siguiente; si
           no, se recuentan solo las que tienen diferencia. */
        const enFase = p.lineas.filter(l => l.fases[f]), clave = l => l.idProducto + '|' + (l.lote || ''), G = {};
        const cnt = new Map(enFase.map(l => [l, grabada(p, l, f) ? contado(p, l, f) : 0]));
        // P-053 (Claudio, 15OCT2026): lo hallado fuera de lugar en esta fase y en las anteriores entra SIEMPRE en la cuenta
        const H = hallazgosVigentes(p, f);
        enFase.forEach(l => { l.hall = l.hall || {}; l.hall[f] = hallDe(H, l); l.hallFinal = l.hall[f]; });
        // F-028: existencia del producto en otras ubicaciones del almacén que el programa no cuenta, menos lo ya reubicado
        const exFuera = {};
        enFase.filter(l => l.noEnCuaderno).forEach(l => {
          const k = clave(l); if (k in exFuera) return;
          const ubis = new Set(p.lineas.filter(x => x.idProducto === l.idProducto && (x.lote || '') === (l.lote || '')).map(x => x.idUbicacion));
          exFuera[k] = D.existencias.filter(x => x.idProducto === l.idProducto && (x.lote || '') === (l.lote || '') && x.cantidad > 0 && !ubis.has(x.idUbicacion)).reduce((t, x) => t + x.cantidad, 0)
            - p.lineas.filter(x => x.noEnCuaderno && !x.fases[f] && clave(x) === k).reduce((t, x) => t + (x.reub || 0), 0);
        });
        enFase.filter(l => l.noEnCuaderno).sort((a, b) => a.id - b.id).forEach(l => { const k = clave(l), q = cnt.get(l), r = Math.max(0, Math.min(q, exFuera[k])); l.reub = r; exFuera[k] -= r; });
        enFase.forEach(l => { const g = G[clave(l)] || (G[clave(l)] = { dif: 0, teo: 0, ref: l }); g.dif += cnt.get(l) + l.hall[f] - teoEf(l); g.teo += teoEf(l); });
        p.lineas.filter(l => !l.fases[f]).forEach(l => {
          const g = G[clave(l)], ant = Object.keys(l.fases).map(Number).filter(x => x < f);
          if (!g || !ant.length) return;
          const uf = Math.max(...ant);
          // P-053: la línea ya resuelta toma lo hallado VIGENTE para ella (si el lugar se recontó, vale el recuento)
          if (['CT', 'AP', 'RU'].includes(l.res[uf])) { l.hallFinal = hallDe(H, l); g.dif += (l.cant[uf] || 0) + l.hallFinal - teoEf(l); g.teo += teoEf(l); }
        });
        // lo hallado que no apunta a ninguna línea del producto también es del producto
        H.filter(h => !p.lineas.some(l => l.idProducto === h.idProducto && (l.lote || '') === h.lote && l.ubicacion === h.ubt))
          .forEach(h => { const g = G[h.idProducto + '|' + h.lote]; if (g) g.dif += h.cantidad; });
        Object.values(G).forEach(g => { g.dif = r2(g.dif); g.ok = g.dif === 0 || dentroTolerancia(g.ref, g.dif, g.teo); });
        enFase.forEach(l => {
          if (!grabada(p, l, f)) { l.res[f] = null; r.noContadas++; return; }
          const c = cnt.get(l), g = G[clave(l)], h = l.hall[f], t = r2(c + h); l.cant[f] = c;
          if (t === teoEf(l) && (l.reub > 0 || h > 0)) { l.res[f] = 'RU'; r.ru++; }   // F-028 o lo hallado fuera de lugar completa la línea
          else if (t === l.teorico) { l.res[f] = 'CT'; r.ct++; }
          else if (g.ok && g.dif === 0) { l.res[f] = 'RU'; r.ru++; }      // se compensa con otras ubicaciones del producto
          else if (g.ok) { l.res[f] = 'AP'; r.ap++; }                     // el total del producto está dentro de la tolerancia
          else if (f > 1 && t === r2((l.cant[f - 1] ?? NaN) + ((l.hall || {})[f - 1] || 0))) { l.res[f] = 'AP'; r.ap++; }
          else { l.res[f] = 'DIF'; r.dif++; }
        });
        setSTF(p, f, 4); p.porRecontar = r.dif + r.noContadas;
        bit(D, p, usr, 'CERRAR_FASE', f, `CT ${r.ct} · AP ${r.ap} · RU ${r.ru} · DIF ${r.dif} · MOV 0 · no contadas (0) ${r.noContadas}`);
        return Object.assign({ ok: true, mensaje: `Fase ${f} cerrada.` }, r);
      }
      case 'cerrar-programa': {
        if (p.estado !== 1) return falla('El programa no está en conteo.');
        if (s !== 4) return falla(f ? `Cierre primero la fase ${f}.` : 'Abra y cuente al menos una fase.');
        let pend = 0;
        p.lineas.forEach(l => {
          const uf = Math.max(...Object.keys(l.fases).map(Number));
          const res = l.res[uf], c = l.cant[uf];
          if (res === 'CT' || res === 'AP' || res === 'RU') { l.difFinal = r2((c || 0) + (l.hallFinal || 0) - teoEf(l)); }   // P-053: con lo hallado vigente
          else { l.porDecidir = true; pend++; }
        });
        p.estado = 2;
        bit(D, p, usr, 'CERRAR_PROGRAMA', null, `${pend} líneas sin converger pasan a la plantilla final`);
        return ok(`Programa ${p.stPrograma} cerrado: ${pend} línea(s) pasan a la plantilla final.`);
      }
    }
    return falla('Paso desconocido.');
  }

  /* Como SMO_MCI_Ciclo_V01 al cerrar fase (07OCT): porcentaje sobre el teórico, valor en costo o
     unidades, contra el límite de su signo. Con porcentaje y teórico 0 no aprueba. */
  function dentroTolerancia(l, dif, teo = l.teorico) {   // teo: el total del producto al cerrar la fase (F-027)
    const med = (l.med || 1) === 2 ? (teo === 0 ? null : Math.abs(dif) * 100 / Math.abs(teo))
      : (l.val || 1) === 2 ? Math.abs(dif) * (l.costo || 0) : Math.abs(dif);
    const lim = dif < 0 ? (l.lf || 0) : (l.ls || 0);
    return med != null && med <= lim + 1e-9;
  }

  /* Criterio de aprobación de una fila del Excel de productos (07OCT), como SMO_MCI_Carga_V01.
     Devuelve el criterio, null si las cinco columnas vienen vacías, o (validar) la lista de errores. */
  function criterioFila(f, validar) {
    const t = k => String(f[k] == null ? '' : f[k]).trim().toUpperCase();
    const V = t('valorarPor'), M = t('medicion'), T = t('tipoLimite'), LF = t('limiteFaltante'), LS = t('limiteSobrante');
    if (!(V + M + T + LF + LS)) return null;
    const val = ['UNIDADES', 'UNIDAD', 'UND', 'U'].includes(V) ? 1 : ['COSTO', 'C', '$'].includes(V) ? 2 : null;
    const med = ['CANTIDAD', 'CANT'].includes(M) ? 1 : ['PORCENTAJE', 'PORC', '%'].includes(M) ? 2 : null;
    const n = x => x === '' ? null : Number(x.replace(',', '.'));
    let lf = n(LF), ls = n(LS);
    if (T === '<' && LS === '') ls = 0;
    if (T === '>' && LF === '') lf = 0;
    const e = [], er = (col, v, m) => e.push({ fila: f.fila, columna: col, valor: v, motivo: m });
    if (!val) er('Valorar aprobación por', V, 'Use Unidades o Costo');
    if (!med) er('Medición de diferencia', M, 'Use Cantidad o Porcentaje');
    if (!['<', '>', 'ENTRE'].includes(T)) er('Tipo de límite', T, 'Use <, > o ENTRE');
    if (['<', 'ENTRE'].includes(T) && !(lf >= 0)) er('Límite faltante', LF, LF === '' ? 'Vacío' : 'No es un número o es negativo');
    if (['>', 'ENTRE'].includes(T) && !(ls >= 0)) er('Límite sobrante', LS, LS === '' ? 'Vacío' : 'No es un número o es negativo');
    if (T === '<' && ls !== 0) er('Límite sobrante', LS, 'Con "<" la tolerancia es solo de faltante: deje el sobrante vacío o en 0');
    if (T === '>' && lf !== 0) er('Límite faltante', LF, 'Con ">" la tolerancia es solo de sobrante: deje el faltante vacío o en 0');
    if (validar) return e.length ? e : null;
    return { val, med, lf, ls };
  }

  /* ------------------------------------------------------------------ capturas */
  // como el SP: lo rechazado no cuenta, y lo tardío (llegó con la fase cerrada) se guarda pero no suma
  const eventosDe = (p, l, f) => p.eventos.filter(e => e.idCuaderno === l.id && e.fase === f && e.rechazo == null && !e.tardio);
  const grabada = (p, l, f) => eventosDe(p, l, f).length > 0;
  const contado = (p, l, f) => eventosDe(p, l, f).filter(e => e.tipo === 'CONTEO' || e.aprobacion === 'COE' || e.aprobacion === 'INMEDIATA').reduce((s, e) => s + Number(e.cantidad || 0), 0);
  // F-041: en una compartida cada operador ve, corrige y tiene pendiente solo lo suyo; la línea suma lo de todos
  const deUsuario = (p, l, f, usr) => ({ eventos: p.eventos.filter(e => e.idCuaderno === l.id && e.fase === f && e.rechazo == null && !e.tardio && e.codUsuario === usr) });
  const grabadaPor = (p, l, f, usr) => esCompartida(p, l, f) ? deUsuario(p, l, f, usr).eventos.length > 0 : grabada(p, l, f);
  const contadoPor = (p, l, f, usr) => esCompartida(p, l, f) ? contado(deUsuario(p, l, f, usr), l, f) : contado(p, l, f);

  // F-028: en la línea de un producto que no estaba en cuaderno, lo reubicado hace de teórico (no se ajusta en valor)
  function teoEf(l) { return l.teorico + (l.reub || 0); }   // declarada como función: se usa al armar la demo, antes de esta línea

  /* P-053 (Claudio, 15OCT2026), como MCI_FN_HallazgosVigentes: lo hallado fuera de lugar hasta la fase f. En cada lugar
     vale la última fase que lo contó: el recuento reemplaza al hallazgo anterior (contar 0 también lo reemplaza). */
  function hallazgosVigentes(p, f) {
    const E = p.eventos.filter(e => e.hallazgo && !e.rechazo && !e.tardio && e.fase <= f && (e.tipo === 'CONTEO' || e.aprobacion === 'COE' || e.aprobacion === 'INMEDIATA'));
    const k = e => e.idProducto + '|' + (e.lote || '') + '|' + String(e.ubicacionHallazgo || '').toUpperCase(), fv = {};
    E.forEach(e => { fv[k(e)] = Math.max(fv[k(e)] || 0, e.fase); });
    return E.filter(e => e.fase === fv[k(e)]).map(e => ({ idProducto: e.idProducto, lote: e.lote || '', ubh: String(e.ubicacionHallazgo || '').toUpperCase(), ubt: e.ubicacionTeorica, cantidad: Number(e.cantidad || 0) }));
  }
  function hallDe(H, l) { return r2(H.filter(h => h.idProducto === l.idProducto && h.lote === (l.lote || '') && h.ubt === l.ubicacion).reduce((s, h) => s + h.cantidad, 0)); }
  function revisarDe(p, f) { return (p.revisar || []).filter(r => r.fases[f]); }

  function registrarEvento(D, p, usr, ev) {
    if (p.eventos.some(e => e.idEvento === ev.idEvento) || (p.anulados || []).some(e => e.idEvento === ev.idEvento)) return 'dup';   // P-043: la anulada no se revive
    const tipo = String(ev.tipo || 'CONTEO').trim().toUpperCase();
    const e = { idEvento: ev.idEvento, fase: ev.fase, tipo, idCuaderno: ev.idCuaderno || null, idProducto: ev.idProducto || null, idUbicacion: ev.idUbicacion || null,
      cantidad: Number(ev.cantidad || 0), lote: ev.lote || '', esHallazgo: !!ev.esHallazgo, ubicacionHallazgo: ev.ubicacionHallazgo || null, ubicacionTeorica: ev.ubicacionTeorica || null,
      ambito: ev.ambito || null, aprobacion: String(ev.aprobacion || 'NA').trim().toUpperCase(), supervisor: ev.supervisor ? String(ev.supervisor).trim() : null,
      motivo: ev.motivo || null, codUsuario: usr, fechaEquipo: ev.fechaEquipo || ahora(), tardio: false, rechazo: null };
    if (!['CONTEO', 'CORRECCION', 'INICIO_UBICACION', 'FIN_UBICACION'].includes(tipo)) e.rechazo = 'Tipo de captura inválido';
    const l = e.idCuaderno ? (p.lineas.find(x => x.id === e.idCuaderno) || (p.revisar || []).find(x => x.id === e.idCuaderno)) : null;
    const cons = consF1(D, p);
    if (!e.rechazo && l && !cons && !cuentaEn(p, l, e.fase, usr)) e.rechazo = 'La línea está asignada a otro operador';
    // P-053: lo contado en una línea A REVISAR es el hallazgo de esta fase en ese lugar
    if (!e.rechazo && l && l.revisar && ['CONTEO', 'CORRECCION'].includes(tipo))
      Object.assign(e, { revisar: true, hallazgo: true, esHallazgo: true, ubicacionHallazgo: l.ubicacion, ubicacionTeorica: l.ubicacionTeorica, idProducto: l.idProducto, lote: l.lote || '', ambito: 'OTRO_OPERADOR' });
    if (p.estado !== 1 || e.fase !== p.faseActual || STF(p, e.fase) !== 3) e.tardio = true;
    // Corrección inmediata (13OCT2026), como el SP: vale sin COE si corrige lo ÚLTIMO que grabó este usuario en el
    // programa, en la misma línea y fase. Si no, queda PENDIENTE para el supervisor.
    if (tipo === 'CORRECCION' && e.aprobacion === 'INMEDIATA') {
      const base = p.eventos.find(x => x.idEvento === ev.idEventoBase);
      const mios = p.eventos.filter(x => x.codUsuario === usr && x.rechazo == null), ultimo = mios[mios.length - 1];
      const misma = base && (base.idCuaderno && e.idCuaderno ? base.idCuaderno === e.idCuaderno : base.idProducto === e.idProducto && (base.lote || '') === (e.lote || ''));
      e.aprobacion = base && ultimo && ultimo.idEvento === base.idEvento && base.fase === e.fase && misma ? 'INMEDIATA' : 'PENDIENTE';
      e.idEventoBase = ev.idEventoBase || null; e.supervisor = null;
    } else
    // Correcciones: lo que no pasa la COE, o el supervisor es uno mismo o no es supervisor, queda PENDIENTE
    if (tipo === 'CORRECCION') {
      const valida = e.aprobacion === 'COE' && e.supervisor && e.supervisor !== usr && D.roles.some(r => r.codUsuario === e.supervisor && r.rol === 'SUPERVISOR') && ev.coe;
      e.aprobacion = valida ? 'COE' : 'PENDIENTE';
    } else e.aprobacion = 'NA';
    /* F-026 (Claudio, 13 y 14OCT2026), como SMO_MCI_Conteo_V01: en el Modo Construcción cuentan los operadores del programa en
       cualquier ubicación del alcance; lo leído en una ubicación se cuenta en ella (sin hallazgos a SU) y la ubicación que no existe
       se crea al llegar la captura, firme. La ubicación llega por su texto: sin señal el equipo no conoce el Id de la que crea. */
    if (cons && !e.rechazo) {
      if (!esOperadorDe(p, usr)) e.rechazo = 'No es operador de este programa';
      if (e.esHallazgo) { e.ub = e.ubicacionHallazgo; e.esHallazgo = false; e.ubicacionHallazgo = e.ubicacionTeorica = e.ambito = null; }
      const ub = String(ev.ubicacion || e.ub || '').trim().toUpperCase();
      if (!e.rechazo && !l && ub && !e.idUbicacion && ['CONTEO', 'CORRECCION'].includes(tipo) && !e.tardio) {
        const misma = D.ubicaciones.find(x => x.tipoUbicacion !== 3 && ubicStr(D, x).toUpperCase() === ub);
        const t = ub.split('|').map(x => x.trim());
        if (misma && misma.estatusUbicacion === 2) e.rechazo = `La ubicación ${ub} está inactiva: actívela en Configuración › Ubicaciones`;
        else if (misma) e.idUbicacion = misma.id;
        else if (t.length !== 4 || t.slice(1).some(x => !x)) e.rechazo = `La ubicación ${ub} no trae almacén, pasillo, rack y nivel`;
        else if (t[0] !== D.emp.almacen.toUpperCase()) e.rechazo = `La ubicación ${ub} es de otro almacén`;
        else if (t.slice(1).some(x => x.length > 20)) e.rechazo = 'Pasillo, rack o nivel de más de 20 caracteres';
        else if (t.slice(1).some(x => x === 'GEN' || x === 'SU')) e.rechazo = 'GEN y SU las crea el sistema';
        else if ((p.pasillo && t[1] !== p.pasillo) || (p.rack && t[2] !== p.rack) || (p.nivel && t[3] !== p.nivel)) e.rechazo = `La ubicación ${ub} está fuera del alcance del programa`;
        else {
          const u = { id: Math.max(0, ...D.ubicaciones.map(z => z.id)) + 1, pasillo: t[1], rack: t[2], nivel: t[3], tipoUbicacion: 1, estatusUbicacion: 1 };
          D.ubicaciones.push(u); e.idUbicacion = u.id;
          D.bitcfg.unshift({ id: ++D.seq.bitcfg, fecha: ahora(), codUsuario: usr, tabla: D.emp.modo === 'ACTIVO' ? 'Tab_Ubicaciones' : 'MCI_UBICACIONES', registro: ubicStr(D, u),
            accion: 'INSERT', valorAntes: null, valorDespues: `creada en el conteo · programa ${p.stPrograma} · fase ${e.fase}` });
          bit(D, p, usr, 'UBICACION_CREADA', e.fase, ubicStr(D, u));
        }
      }
      const uu = !e.rechazo && !l && e.idUbicacion ? D.ubicaciones.find(x => x.id === e.idUbicacion) : null;
      if (uu && ((p.pasillo && uu.pasillo !== p.pasillo) || (p.rack && uu.rack !== p.rack) || (p.nivel && uu.nivel !== p.nivel))) e.rechazo = `La ubicación ${ubicStr(D, uu)} está fuera del alcance del programa`;
      if (!e.rechazo && !l && e.idProducto && !p.lineas.some(x => x.idProducto === e.idProducto && !x.noEnCuaderno)) e.noCuad = true;
    }
    // F-028 (Claudio, 13OCT2026), como SMO_MCI_Conteo_V01: el hallazgo de un producto que no está en ningún cuaderno
    // original toma la ubicación donde se halló (línea con teórico 0, "No estaba en cuaderno"). Si el producto está en los
    // cuadernos, sigue la regla de SU.
    if (!e.rechazo && !l && e.idProducto && e.esHallazgo && !e.tardio && !p.lineas.some(x => x.idProducto === e.idProducto && !x.noEnCuaderno)) {
      const u = D.ubicaciones.find(x => ubicStr(D, x) === e.ubicacionHallazgo);
      if (u) { e.esHallazgo = false; e.noCuad = true; e.idUbicacion = u.id; }
    }
    // lote nuevo o hallazgo sin línea: se crea su línea con teórico 0 (el hallazgo va a SU y no cuenta en el cuaderno)
    const ya = !l && e.idProducto && !e.esHallazgo ? p.lineas.find(x => x.idProducto === e.idProducto && x.idUbicacion === e.idUbicacion && (x.lote || '') === (e.lote || '')) : null;
    if (ya && cons && !ya.fases[e.fase] && !e.rechazo) e.rechazo = `Esa línea ya quedó resuelta en la fase ${Math.max(...Object.keys(ya.fases).map(Number))}: no se recuenta`;
    if (ya && !e.rechazo) e.idCuaderno = ya.id;
    else if (!e.rechazo && !l && e.idProducto && !e.esHallazgo) {
      const pr = prodDe(D, e.idProducto), u = D.ubicaciones.find(x => x.id === e.idUbicacion);
      if (pr && u) {
        const nl = { id: ++D.seq.linea, idProducto: pr.idProducto, codigo: pr.codigo, tCean: pr.tCean, descrip: pr.nombre, unidadStock: pr.unidadStock, manejaLote: pr.manejaLote,
          lote: e.lote, fechaVencLote: ev.fechaVencLote || null, idUbicacion: u.id, ubicacion: ubicStr(D, u), pasillo: u.pasillo, rack: u.rack, nivel: u.nivel, teorico: 0, costo: pr.costo,
          fases: { [e.fase]: true }, cant: {}, res: {}, opFijo: { [e.fase]: usr }, grab: {}, decision: null, cantFinal: null, difFinal: null, motivo: null, porDecidir: false,
          noEnCuaderno: !!e.noCuad, observacion: e.noCuad ? 'No estaba en cuaderno' : cons ? 'Agregada en el conteo (Modo Construcción)' : null, reub: 0 };
        p.lineas.push(nl); e.idCuaderno = nl.id;
      }
    }
    // como el SP: la captura de conteo que no encontró ni creó su línea se rechaza
    if (!e.rechazo && !e.tardio && !e.esHallazgo && !e.idCuaderno && ['CONTEO', 'CORRECCION'].includes(tipo)) e.rechazo = 'No se encontró la línea del cuaderno';
    if (!e.esHallazgo || e.idCuaderno) p.eventos.push(e); else p.eventos.push(Object.assign(e, { hallazgo: true }));
    return e.rechazo ? 'rej' : e.tardio ? 'tardio' : 'nuevo';
  }

  function decidir(D, n, idc, b, usr) {
    const p = prog(D, n), l = p && p.lineas.find(x => x.id === idc);
    if (!l) return falla('La línea no existe.');
    if (p.estado !== 2) return falla('La plantilla solo se decide con el programa cerrado (estado 2).');
    const uf = Math.max(...Object.keys(l.fases).map(Number)), ultima = l.cant[uf] ?? 0;
    if (b.decision === 'MANUAL' && (b.cantFinal == null || b.cantFinal < 0)) return falla('Indique la cantidad final.');
    if (b.decision === 'EXCLUIR' && !b.motivo) return falla('Para excluir la línea indique el motivo.');
    l.decision = b.decision; l.motivo = b.motivo || null; l.porDecidir = false;
    l.cantFinal = b.decision === 'MANUAL' ? Number(b.cantFinal) : b.decision === 'F3' ? ultima : null;
    l.difFinal = b.decision === 'EXCLUIR' ? 0 : r2(l.cantFinal - teoEf(l));
    return ok(`Línea ${l.codigo} decidida (${b.decision}).`);
  }

  function resumen(D, p) {
    const dif = l => l.difFinal != null ? l.difFinal : (l.porDecidir ? r2((l.cant[Math.max(...Object.keys(l.fases).map(Number))] ?? 0) + (l.hallFinal || 0) - teoEf(l)) : 0);
    const val = l => r2(dif(l) * l.costo);
    const L = p.lineas;
    const falt = r2(L.reduce((s, l) => s + (val(l) < 0 ? -val(l) : 0), 0)), sobr = r2(L.reduce((s, l) => s + (val(l) > 0 ? val(l) : 0), 0));
    const neto = r2(sobr - falt), mayor = r2(Math.max(0, ...L.map(l => Math.abs(val(l)))));
    const pol = D.politica.slice().sort((a, b) => a.nivel - b.nivel);
    const niv = (pol.find(x => (x.netoHasta == null || Math.abs(neto) <= x.netoHasta) && (x.lineaMayorHasta == null || mayor <= x.lineaMayorHasta)) || pol[pol.length - 1]);
    return { lineas: L.length, sinDiferencia: L.filter(l => !l.porDecidir && dif(l) === 0).length, conAjuste: L.filter(l => dif(l) !== 0).length,
      porDecidir: L.filter(l => l.porDecidir).length, faltante: falt, sobrante: sobr, neto, lineaMayor: mayor, nivelRequerido: niv.nivel, rolRequerido: niv.rol,
      firmasRequeridas: niv.firmasRequeridas, firmasVigentes: p.firmas.filter(f => f.vigente).length, estado: p.estado, _dif: dif, _val: val };
  }

  function enviarAprobacion(D, n, usr) {
    const p = prog(D, n);
    if (!tieneRol(D, usr, 'GERENTE')) return falla('Solo el gerente envía la plantilla a aprobación.');
    if (p.estado !== 2) return falla('El programa no está en la plantilla final.');
    const R = resumen(D, p); if (R.porDecidir) return falla(`Quedan ${R.porDecidir} línea(s) por decidir.`);
    p.estado = 3; p.firmas.forEach(f => { f.vigente = false; });
    bit(D, p, usr, 'ENVIAR_APROBACION', null, `Neto ${R.neto} · línea mayor ${R.lineaMayor} · nivel ${R.nivelRequerido}`);
    return ok(`Enviado a aprobación: requiere firma hasta el nivel ${R.nivelRequerido} (${R.rolRequerido}).`, n);
  }

  function firmar(D, n, b, usr) {
    const p = prog(D, n);
    const rol = D.roles.find(r => r.codUsuario === usr && r.rol === 'FIRMANTE');
    if (!rol) return falla('Su usuario no tiene el rol FIRMANTE.');
    if (p.estado !== 3) return falla('El programa no está en aprobación.');
    if (!b.coe) return falla('COE incorrecta.');
    if (b.decision !== 'APROBAR' && !b.observacion) return falla('Para devolver o rechazar escriba la observación.');
    const R = resumen(D, p), proximo = (p.firmas.filter(f => f.vigente && f.decision === 'APROBAR').reduce((m, f) => Math.max(m, f.nivel), 0)) + 1;
    if (b.decision === 'APROBAR' && rol.nivelFirma !== proximo && rol.nivelFirma < R.nivelRequerido) return falla(`Le toca firmar al nivel ${proximo}.`);
    p.firmas.push({ nivel: rol.nivelFirma, codUsuario: usr, decision: b.decision, totalFirmado: R.lineas, neto: R.neto, lineaMayor: R.lineaMayor, observacion: b.observacion || null, fecha: ahora(), vigente: true });
    bit(D, p, usr, 'FIRMA', null, `${b.decision} · nivel ${rol.nivelFirma}`);
    if (b.decision === 'DEVOLVER') { p.estado = 2; p.firmas.forEach(f => { f.vigente = false; }); return ok('Acta devuelta al gerente: vuelve a la plantilla final.'); }
    if (b.decision === 'RECHAZAR') { p.estado = 6; return ok('Acta rechazada.'); }
    if (rol.nivelFirma >= R.nivelRequerido) {
      p.estado = D.emp.modo === 'ACTIVO' ? 4 : 5;
      fotografiar(D, p);
      return ok(D.emp.modo === 'ACTIVO' ? 'Acta aprobada: espera el ajuste en SIMON.' : 'Acta firmada.');
    }
    return ok(`Firma registrada. Falta el nivel ${rol.nivelFirma + 1}.`);
  }

  /* Ajuste (solo ACTIVO): vista previa calculada, aplicar y revertir. */
  function vistaAjuste(D, p, fechaContable) {
    const R = resumen(D, p), fc = fechaContable || diaISO(0);
    const L = p.lineas.filter(l => R._dif(l) !== 0);
    const detalle = L.map(l => {
      const d = R._dif(l), vd = r2(d * l.costo);
      return { numProducto: l.idProducto, codigo: l.codigo, lote: l.lote, diferencia: d, existenciaActual: l.teorico, existenciaResultante: r2(l.teorico + d),
        costoDivisa: l.costo, valorDivisa: vd, valorLocal: r2(vd * TASA), cuenta: '1.1.04.001', tipoDoc: d > 0 ? 'E-AJCONT' : 'S-AJCONT' };
    });
    const fD = r2(detalle.filter(x => x.diferencia < 0).reduce((s, x) => s - x.valorDivisa, 0)), sD = r2(detalle.filter(x => x.diferencia > 0).reduce((s, x) => s + x.valorDivisa, 0));
    const asiento = [];
    const par = c => (D.parametros.find(x => x.clave === c && x.ambito === 'EMPRESA') || {}).valor;
    if (fD) asiento.push({ item: asiento.length + 1, cuenta: par('CTA_FALTANTE'), nombre: 'Faltante de inventario (demo)', concepto: 'Faltante de inventario por conteo', debe: r2(fD * TASA), haber: 0, debeD: fD, haberD: 0 });
    const netoInv = r2(sD - fD);
    if (netoInv) asiento.push({ item: asiento.length + 1, cuenta: '1.1.04.001', nombre: 'Inventario de mercancía (demo)', concepto: 'Inventario · ajuste por conteo',
      debe: netoInv > 0 ? r2(netoInv * TASA) : 0, haber: netoInv < 0 ? r2(-netoInv * TASA) : 0, debeD: netoInv > 0 ? netoInv : 0, haberD: netoInv < 0 ? -netoInv : 0 });
    if (sD) asiento.push({ item: asiento.length + 1, cuenta: par('CTA_SOBRANTE'), nombre: 'Sobrante de inventario (demo)', concepto: 'Sobrante de inventario por conteo', debe: 0, haber: r2(sD * TASA), debeD: 0, haberD: sD });
    const aj = p.ajuste;
    // P-008 (Claudio, 15OCT2026): requisito del sistema en ACTIVO, haya o no faltantes y sobrantes
    const prov = par('CTAS_AJUSTE_PROVISIONALES') === '1';
    const cta = (c, que) => !par(c) ? [false, `Falta configurar la cuenta de ${que.toUpperCase()} (${c}, Configuración › Parámetros)`]
      : prov ? [false, `La cuenta de ${que} ${par(c)} es PROVISIONAL: configure la definitiva y ponga CTAS_AJUSTE_PROVISIONALES en 0`] : [true, `Cuenta de ${que}: ${par(c)}`];
    const validaciones = [
      [true, 'Módulo en modo ACTIVO'], [p.estado === 4 || !!aj, p.estado === 4 ? 'Programa aprobado: espera el ajuste' : 'El programa no está aprobado'],
      [true, `Mes contable de ${fc.split('-').reverse().join('/')} abierto`], [true, `Tasa de la divisa al ${fc.split('-').reverse().join('/')}: ${TASA.toFixed(4)}`],
      cta('CTA_FALTANTE', 'faltante'), cta('CTA_SOBRANTE', 'sobrante'), [true, 'Todos los productos con cuenta de inventario'],
      [true, 'Las cuentas existen en el plan de cuentas'], [true, 'Todos los productos enlazados con SIMON'], [true, 'Asiento cuadrado en moneda local y en divisa']
    ].map(([o, t], i) => ({ orden: i + 1, ok: o, texto: t }));
    return {
      cabecera: { numeroPrograma: p.numeroPrograma, stPrograma: p.stPrograma, almacen: p.almacen, estado: p.estado, documento: aj ? aj.documento : null, fechaContable: aj ? aj.fechaContable : fc,
        tasa: TASA, lineas: L.length, movimientos: detalle.length, faltanteD: fD, sobranteD: sD, faltanteL: r2(fD * TASA), sobranteL: r2(sD * TASA),
        puedeAplicar: !aj && p.estado === 4 && validaciones.every(v => v.ok), puedeRevertir: !!aj, enBandeja: !!aj, numComprobanteTemp: aj ? aj.comprobante : null },
      detalle, asiento, validaciones
    };
  }

  /* Indicadores: se calculan de las capturas (como el SP), no se inventan aparte. */
  function indicadores(D, filtro) {
    const pausa = Number((D.parametros.find(x => x.clave === 'PAUSA_MAX_MIN') || {}).valor || 15);
    const progs = D.programas.filter(p => p.estado !== 9 && (!filtro.numero || p.numeroPrograma === Number(filtro.numero)));
    const ops = {};
    const o = c => ops[c] || (ops[c] = { codUsuario: c, programas: new Set(), dias: {}, asignadas: 0, asignadasContadas: 0, contadas: new Set(), productos: new Set(), correcciones: 0, hallazgos: 0, reconteo: 0, confirmadas: 0, errores: 0 });
    progs.forEach(p => {
      p.lineas.forEach(l => Object.keys(l.fases).map(Number).forEach(f => {
        const op = operadorDe(p, l, f); if (!op) return;
        const x = o(op); x.programas.add(p.numeroPrograma); x.asignadas++;
        if (grabada(p, l, f)) { x.asignadasContadas++; x.contadas.add(l.id + '|' + f); x.productos.add(l.idProducto); }
        if (l.fases[f + 1] && grabada(p, l, f + 1)) { x.reconteo++; if (l.cant[f + 1] === l.cant[f]) x.confirmadas++; }
      }));
      p.eventos.forEach(e => {
        if (!e.codUsuario || e.rechazo) return; const x = o(e.codUsuario); x.programas.add(p.numeroPrograma);
        if (e.tipo === 'CORRECCION' && e.aprobacion !== 'INMEDIATA') x.correcciones++;   // la inmediata es parte del conteo if (e.hallazgo) x.hallazgos++;
        const dia = String(e.fechaEquipo).slice(0, 10); (x.dias[dia] = x.dias[dia] || []).push(new Date(e.fechaEquipo).getTime());
      });
    });
    const jornadas = [];
    const res = Object.values(ops).filter(x => x.asignadas || Object.keys(x.dias).length).map(x => {
      let min = 0;
      Object.entries(x.dias).forEach(([dia, t]) => {
        t.sort((a, b) => a - b); let m = 0, pausas = 0;
        for (let i = 1; i < t.length; i++) { const d = (t[i] - t[i - 1]) / 60000; if (d <= pausa) m += d; else pausas++; }
        min += m;
        jornadas.push({ codUsuario: x.codUsuario, dia, primeraCaptura: new Date(t[0]).toISOString(), ultimaCaptura: new Date(t[t.length - 1]).toISOString(),
          minutosEfectivos: r2(m), pausas, lineasContadas: t.length, productosContados: Math.max(1, Math.round(t.length * 0.8)), correcciones: 0, lineasHora: m ? r2(t.length * 60 / m) : null });
      });
      const nj = Object.keys(x.dias).length, lc = x.contadas.size;
      return { codUsuario: x.codUsuario, programas: x.programas.size, jornadas: nj, lineasAsignadas: x.asignadas, asignadasContadas: x.asignadasContadas, noContadas: x.asignadas - x.asignadasContadas,
        lineasContadas: lc, cumplimiento: x.asignadas ? r2(100 * x.asignadasContadas / x.asignadas) : null, productosContados: x.productos.size, minutosEfectivos: r2(min),
        lineasHora: min >= 1 ? r2(lc * 60 / min) : null, lineasPorJornada: nj ? r2(lc / nj) : null, productosPorJornada: nj ? r2(x.productos.size / nj) : null, horasParaCumplir: null,
        correcciones: x.correcciones, correccionesCada100: lc ? r2(100 * x.correcciones / lc) : null, hallazgos: x.hallazgos,
        reconteo: x.reconteo, confirmadas: x.confirmadas, erroresConfirmados: x.errores, exactitud: x.reconteo ? r2(100 * x.confirmadas / x.reconteo) : null };
    });
    return { res, jornadas: jornadas.filter(j => !filtro.operador || j.codUsuario === filtro.operador) };
  }

  function fotografiar(D, p) {
    const { res } = indicadores(D, { numero: p.numeroPrograma });
    res.forEach(r => D.fotos.push({ numeroPrograma: p.numeroPrograma, stPrograma: p.stPrograma, almacen: p.almacen, fase: p.faseActual, codUsuario: r.codUsuario,
      lineasAsignadas: r.lineasAsignadas, asignadasContadas: r.asignadasContadas, lineasContadas: r.lineasContadas, productosContados: r.productosContados, correcciones: r.correcciones,
      hallazgos: r.hallazgos, minutosEfectivos: r.minutosEfectivos, reconteo: r.reconteo, confirmadas: r.confirmadas, erroresConfirmados: r.erroresConfirmados, fechaFoto: ahora() }));
  }

  /* ------------------------------------------------------------------ apoyo */
  const prog = (D, n) => D.programas.find(p => p.numeroPrograma === Number(n));
  const tieneRol = (D, usr, ...roles) => D.roles.some(r => r.codUsuario === usr && roles.includes(r.rol));
  // Como MCI_FN_VeCantidades (06OCT): gerencia y junta al cierre; supervisor y configuración
  // durante el ciclo mientras el parámetro de gobierno lo permita
  const veCantidades = (D, usr, estado) =>
    (estado >= 2 && tieneRol(D, usr, 'GERENTE', 'FIRMANTE'))
    || ((D.parametros.find(x => x.clave === 'SUPERVISOR_VE_CANTIDADES' && x.ambito === 'EMPRESA') || { valor: '1' }).valor === '1' && tieneRol(D, usr, 'SUPERVISOR', 'CONFIGURACION'));
  const sinCantidades = (D, usr, estado) =>
    (D.parametros.find(x => x.clave === 'SUPERVISOR_VE_CANTIDADES') || {}).valor === '0' && tieneRol(D, usr, 'SUPERVISOR', 'CONFIGURACION')
      ? 'La gerencia deshabilitó que el supervisor vea teórico, contado y diferencias (parámetro de gobierno SUPERVISOR_VE_CANTIDADES).'
      : estado < 2 ? 'La gerencia y la junta ven el teórico, lo contado y las diferencias al cerrar el programa.'
        : 'Su usuario no tiene un rol del módulo que vea teórico, contado y diferencias.';
  /* Reporte de avance por fase (como SMO_MCI_Cierre_V01 @Accion = 'AVANCE'): la fase que se
     está contando sale ciega (cantidades null, solo si la línea ya tiene capturas). */
  function avancePrograma(D, p) {
    const vis = f => p.estado >= 2 || p['statusF' + f] === 4;
    const ufase = l => Math.max(...Object.keys(l.fases).map(Number));
    const lineas = p.lineas.map(l => {
      const fa = ufase(l), o = { idCuaderno: l.id, codigo: l.codigo, descrip: l.descrip, unidadStock: l.unidadStock, ubicacion: l.ubicacion, lote: l.lote, esHallazgo: false, ubicacionHallazgo: null,
        noEnCuaderno: !!l.noEnCuaderno, cantReubicada: l.noEnCuaderno ? (l.reub || 0) : null, observacion: l.observacion || null,
        teorico: l.teorico, medicionDif: l.med || 1, valorAprobacion: l.val || 1, limiteFaltante: l.lf || 0, limiteSobrante: l.ls || 0, faseActual: fa, costoUnitario: l.costo };
      let resuelto = null;
      [1, 2, 3].forEach(f => {
        const v = vis(f) && fa >= f;
        o['operadorF' + f] = l.fases[f] ? operadorDe(p, l, f) || null : null;
        o['capturasF' + f] = !!l.fases[f] && grabada(p, l, f);
        o['cantF' + f] = v ? (l.cant[f] ?? null) : null;
        o['resultadoF' + f] = v ? (l.res[f] ?? null) : null;
        o['difF' + f] = v && l.res[f] ? r2((l.cant[f] || 0) - l.teorico) : null;
        if (!resuelto && v && ['CT', 'AP', 'RU'].includes(l.res[f])) resuelto = f;
      });
      o.resueltoEn = resuelto;
      o.decisionPlantilla = p.estado >= 2 ? (l.decision || null) : null;
      o.diferenciaFinal = p.estado >= 2 && !l.porDecidir ? (l.difFinal ?? null) : null;
      return o;
    });
    // fuera de ubicación: los hallazgos agrupados por producto, lugar y lote
    const hall = {};
    p.eventos.filter(e => e.hallazgo && !e.rechazo && !e.tardio).forEach(e => {
      const pr = prodDe(D, e.idProducto) || {}, k = [e.idProducto, e.ubicacionHallazgo, e.lote].join('|');
      const h = hall[k] || (hall[k] = { idCuaderno: 0, codigo: pr.codigo, descrip: pr.nombre, unidadStock: pr.unidadStock, ubicacion: '', lote: e.lote || '', esHallazgo: true, ubicacionHallazgo: e.ubicacionHallazgo,
        teorico: 0, medicionDif: 1, valorAprobacion: 1, limiteFaltante: 0, limiteSobrante: 0, faseActual: e.fase, costoUnitario: 0, capturasF1: false, capturasF2: false, capturasF3: false,
        cantF1: null, cantF2: null, cantF3: null, difF1: null, difF2: null, difF3: null, resultadoF1: null, resultadoF2: null, resultadoF3: null, resueltoEn: null, decisionPlantilla: null, diferenciaFinal: null });
      h.faseActual = Math.max(h.faseActual, e.fase); h['capturasF' + e.fase] = true;
      if (vis(e.fase)) h['cantF' + e.fase] = r2((h['cantF' + e.fase] || 0) + Number(e.cantidad || 0));
    });
    return { cabecera: { numeroPrograma: p.numeroPrograma, stPrograma: p.stPrograma, sucursal: p.sucursal, almacen: p.almacen, pasillo: p.pasillo, rack: p.rack, nivel: p.nivel, lote: p.lote,
        fechaCorte: p.fechaCorte, supervisor: p.codUsuario, estado: p.estado, faseActual: p.faseActual, statusF1: p.statusF1, statusF2: p.statusF2, statusF3: p.statusF3,
        visibleF1: vis(1), visibleF2: vis(2), visibleF3: vis(3), modo: D.emp.modo, fechaEmision: ahora() },
      lineas: lineas.sort((a, b) => a.ubicacion.localeCompare(b.ubicacion) || a.codigo.localeCompare(b.codigo)).concat(Object.values(hall)) };
  }
  const ok = (mensaje, numero) => ({ ok: true, mensaje, numero: numero ?? null });
  function falla(m) { return { ok: false, mensaje: m }; }

  // F-029: el modo de ubicaciones del programa (el suyo si ya inició; si no, el de la Configuración)
  const modoUbicCfg = D => (D.parametros.find(x => x.clave === 'MODO_UBICACIONES' && x.ambito === 'EMPRESA') || {}).valor || 'EXISTENTES';
  const vistaPrograma = (D, p) => {
    const L = p.estado === 0 ? lineasTeoricas(D, p) : p.lineas;
    const prods = new Set(L.map(l => l.idProducto)).size, cat = D.catalogo.filter(x => x.status === 1).length || 1;
    const o = Object.assign({}, p);
    ['lineas', 'asignaciones', 'operadores', 'bitacora', 'eventos', 'firmas', 'ajuste', 'observacion'].forEach(k => delete o[k]);
    return Object.assign(o, { modoVigente: p.modoUbicaciones || modoUbicCfg(D), lineas: L.length, operadores: p.operadores.length, productos: prods, pctCatalogo: r2(100 * prods / cat) });
  };

  /* ================================================================== estado (por pestaña) */
  let ESTADO = null;
  function cargarEstado() {
    try { const s = sessionStorage.getItem(CLAVE_ESTADO); if (s) { ESTADO = JSON.parse(s); return; } } catch { }
    ESTADO = { 'DEMO-SA': construir('DEMO-SA'), 'DEMO-AC': construir('DEMO-AC') };
    guardar();
  }
  function guardar() { try { sessionStorage.setItem(CLAVE_ESTADO, JSON.stringify(ESTADO)); } catch { } }

  /* ================================================================== el "API" */
  const json = (o, status = 200) => ({ status, cuerpo: JSON.stringify(o) });
  const res = r => r.ok === false ? json({ message: r.mensaje, mensaje: r.mensaje, ok: false }, 400) : json(r);
  const prohibido = (que, roles) => json({ message: `${que} lo ven ${roles.join(', ')}: su usuario no tiene ninguno de esos roles del módulo.` }, 403);
  const ROLES_TEORICO = ['SUPERVISOR', 'CONFIGURACION', 'GERENTE', 'FIRMANTE'], ROLES_AJUSTE = ['GERENTE', 'SUPERVISOR', 'CONFIGURACION'];

  async function api(metodo, ruta, q, body, cuenta) {
    const [cod, D] = (() => { const e = empresaPorId(cuenta.EmpresaId); return e ? [e[0], ESTADO[e[0]]] : [null, null]; })();
    if (!D) return json({ message: 'Sin acceso a esta empresa.' }, 403);
    const usr = cuenta.Usuario, seg = ruta.split('/');
    const exigir = (...roles) => tieneRol(D, usr, ...roles) ? null : json({ message: 'Su usuario no tiene el rol ' + roles.join(' ni ') + ' del módulo.' }, 400);
    const cambio = (r) => { if (r && r.ok !== false) guardar(); return res(r); };
    const p = seg[0] === 'programas' && seg[1] ? prog(D, seg[1]) : null;
    if (seg[0] === 'programas' && seg[1] && !p) return json({ message: 'El programa no existe.' }, 404);

    // ---- configuración
    if (ruta === 'mis-roles') return json(D.roles.filter(r => r.codUsuario === usr));
    if (ruta === 'parametros' && metodo === 'GET') return json(D.parametros.filter(x => !q.get('grupo') || x.grupo === q.get('grupo')));
    if (ruta === 'parametros' && metodo === 'PUT') {
      const base = D.parametros.find(y => y.clave === body.clave && y.ambito === 'EMPRESA'); if (!base) return res(falla('Parámetro desconocido.'));
      if (body.clave === 'UNIDAD_SORTEO' && (body.ambito || 'EMPRESA') !== 'EMPRESA') return res(falla('La unidad del sorteo vale para toda la empresa: no admite ámbito por almacén.'));
      if (body.clave === 'MODO_UBICACIONES' && (body.ambito || 'EMPRESA') !== 'EMPRESA') return res(falla('El modo de ubicaciones vale para toda la empresa: no admite ámbito por almacén.'));
      // Gobierno (06OCT): gerencia o junta con COE; CONFIGURACION no alcanza; sin excepciones
      if (base.grupo === 'GOBIERNO') {
        if (!body.coe) return res(falla('Es un parámetro de gobierno: confirme el cambio con su COE (la que indicó no es válida).'));
        if (!tieneRol(D, usr, 'GERENTE', 'FIRMANTE')) return res(falla('Es un parámetro de gobierno: lo cambian la gerencia o la junta (roles GERENTE o FIRMANTE), con su COE.'));
        if ((body.ambito || 'EMPRESA') !== 'EMPRESA') return res(falla('Un parámetro de gobierno vale para toda la empresa: no admite excepciones.'));
      } else { const x = exigir('CONFIGURACION'); if (x) return x; }
      if (!base.editable) return res(falla('Este parámetro no se cambia desde la pantalla.'));
      let y = D.parametros.find(z => z.clave === body.clave && z.ambito === body.ambito && z.ambitoValor === (body.ambitoValor || ''));
      const antes = y ? y.valor : null;
      if (!y) { y = Object.assign({}, base, { id: D.parametros.length + 1, ambito: body.ambito, ambitoValor: body.ambitoValor || '' }); D.parametros.push(y); }
      y.valor = body.valor; y.codUsuario = usr; y.fechaUltAct = ahora();
      D.bitcfg.unshift({ id: ++D.seq.bitcfg, fecha: ahora(), codUsuario: usr, tabla: 'MCI_PARAMETROS', registro: `${body.clave} · ${body.ambito}${body.ambitoValor ? ' ' + body.ambitoValor : ''}`, accion: antes == null ? 'INSERT' : 'UPDATE', valorAntes: antes, valorDespues: body.valor });
      return cambio(ok('Parámetro actualizado.'));
    }
    if (ruta === 'parametros' && metodo === 'DELETE') {
      const x = exigir('CONFIGURACION'); if (x) return x;
      const i = D.parametros.findIndex(z => z.clave === q.get('claveParametro') && z.ambito === q.get('ambito') && z.ambitoValor === q.get('ambitoValor') && z.ambito !== 'EMPRESA');
      if (i < 0) return res(falla('La excepción no existe.'));
      const [z] = D.parametros.splice(i, 1);
      D.bitcfg.unshift({ id: ++D.seq.bitcfg, fecha: ahora(), codUsuario: usr, tabla: 'MCI_PARAMETROS', registro: `${z.clave} · ${z.ambito} ${z.ambitoValor}`, accion: 'DELETE', valorAntes: z.valor, valorDespues: null });
      return cambio(ok('Excepción quitada.'));
    }
    // ---- tolerancias por producto (07OCT): la misma pantalla en las dos modalidades
    if (seg[0] === 'tolerancias') {
      if (seg[1] === 'sincronizar') return res(ok(D.emp.modo === 'ACTIVO' ? 'Catálogo al día con SIMON: 0 producto(s) nuevo(s).' : 'En STAND ALONE el catálogo viene de la carga de Excel.'));
      const txt = String(metodo === 'PUT' ? body.texto || '' : q.get('texto') || '').trim().toUpperCase();
      const exis = metodo === 'PUT' ? !!body.soloConExistencia : q.get('soloConExistencia') === 'true';
      const existencia = id => D.existencias.filter(x => x.idProducto === id).reduce((a, x) => a + x.cantidad, 0);
      const busq = () => D.catalogo.filter(p => p.status === 1 && (!txt || p.codigo.toUpperCase().includes(txt) || String(p.nombre || '').toUpperCase().includes(txt)) && (!exis || existencia(p.idProducto) !== 0))
        .sort((a, b) => a.codigo.localeCompare(b.codigo));
      if (metodo === 'GET') {
        if (!tieneRol(D, usr, 'CONFIGURACION', 'SUPERVISOR', 'GERENTE')) return prohibido('Las tolerancias por producto', ['CONFIGURACION', 'SUPERVISOR', 'GERENTE']);
        const L = busq(), tam = Math.min(1000, Math.max(1, Number(q.get('tamPagina') || 200))), pag = Math.max(1, Number(q.get('pagina') || 1));
        return json({ total: L.length, productos: L.slice((pag - 1) * tam, pag * tam).map(p => ({ id: p.idProducto, codigo: p.codigo, nombre: p.nombre, unidadStock: p.unidadStock,
          valorAprobacion: p.val || 1, medicionDif: p.med || 1, limiteFaltante: p.lf || 0, limiteSobrante: p.ls || 0, existencia: existencia(p.idProducto),
          costoUnitario2: p.costo, costoUnitario1: r2(p.costo * 36.5), fechaUltAct: ahora() })) });
      }
      if (metodo === 'PUT') {
        if (!tieneRol(D, usr, 'CONFIGURACION')) return res(falla('No tiene el privilegio de configuración del módulo.'));
        const b = body;
        if (![1, 2].includes(b.valorAprobacion) || ![1, 2].includes(b.medicionDif)) return res(falla('Indique cómo se valora (unidades o costo) y cómo se mide la diferencia (cantidad o porcentaje).'));
        if (!(b.limiteFaltante >= 0) || !(b.limiteSobrante >= 0)) return res(falla('Los límites de faltante y sobrante son números mayores o iguales a cero.'));
        const sel = b.todaSeleccion ? busq() : D.catalogo.filter(p => p.status === 1 && (b.ids || []).includes(p.idProducto));
        if (!sel.length) return res(falla('No hay productos a los que aplicar el criterio.'));
        const txtCr = (v, m, f, s) => (v === 2 ? 'COSTO' : 'UNIDADES') + ' · ' + (m === 2 ? 'PORCENTAJE' : 'CANTIDAD') + ' · −' + f + ' / +' + s;
        let n = 0;
        sel.forEach(p => {
          if ((p.val || 1) === b.valorAprobacion && (p.med || 1) === b.medicionDif && (p.lf || 0) === b.limiteFaltante && (p.ls || 0) === b.limiteSobrante) return;
          D.bitcfg.unshift({ id: ++D.seq.bitcfg, fecha: ahora(), codUsuario: usr, tabla: 'MCI_PRODUCTOS_INVENTARIO', registro: 'TOLERANCIA · ' + p.codigo, accion: 'UPDATE',
            valorAntes: txtCr(p.val || 1, p.med || 1, p.lf || 0, p.ls || 0), valorDespues: txtCr(b.valorAprobacion, b.medicionDif, b.limiteFaltante, b.limiteSobrante) });
          Object.assign(p, { val: b.valorAprobacion, med: b.medicionDif, lf: b.limiteFaltante, ls: b.limiteSobrante }); n++;
        });
        return cambio(Object.assign(ok('Criterio aplicado: ' + n + ' producto(s) cambiaron' + (sel.length > n ? ' (' + (sel.length - n) + ' ya lo tenían)' : '') + '. Vale para los programas que se inicien desde ahora.'), { id: n }));
      }
    }
    if (ruta === 'politica' && metodo === 'GET') return json(D.politica);
    if (ruta === 'politica' && metodo === 'PUT') {
      const x = exigir('CONFIGURACION'); if (x) return x;
      const y = D.politica.find(z => z.nivel === body.nivel); if (!y) return res(falla('Nivel desconocido.'));
      const antes = `${y.rol} · ${y.netoHasta} · ${y.lineaMayorHasta} · ${y.firmasRequeridas}`;
      Object.assign(y, { rol: body.rol, netoHasta: body.netoHasta, lineaMayorHasta: body.lineaMayorHasta, firmasRequeridas: body.firmasRequeridas, codUsuario: usr, fechaUltAct: ahora() });
      D.bitcfg.unshift({ id: ++D.seq.bitcfg, fecha: ahora(), codUsuario: usr, tabla: 'MCI_POLITICA_APROBACION', registro: 'Nivel ' + y.nivel, accion: 'UPDATE', valorAntes: antes, valorDespues: `${y.rol} · ${y.netoHasta} · ${y.lineaMayorHasta} · ${y.firmasRequeridas}` });
      return cambio(ok('Nivel de firma guardado.'));
    }
    if (ruta.startsWith('bitacora-config')) return json(D.bitcfg.slice(0, Number(q.get('top') || 100)));
    if (ruta === 'roles' && metodo === 'GET') return json(D.roles);
    if (ruta === 'roles' && metodo === 'POST') {
      const sinConfig = !D.roles.some(r => r.rol === 'CONFIGURACION');
      if (!sinConfig) { const x = exigir('CONFIGURACION'); if (x) return x; }
      if (D.roles.some(r => r.codUsuario === body.codUsuario && r.rol === body.rol)) return res(falla('El usuario ya tiene ese rol.'));
      if (body.rol === 'FIRMANTE' && !body.nivelFirma) return res(falla('Indique el nivel de firma.'));
      D.roles.push({ id: ++D.seq.rol, codUsuario: body.codUsuario, rol: body.rol, nivelFirma: body.rol === 'FIRMANTE' ? body.nivelFirma : null, codUsuarioAsigna: usr, fechaUltAct: ahora() });
      D.bitcfg.unshift({ id: ++D.seq.bitcfg, fecha: ahora(), codUsuario: usr, tabla: 'MCI_USUARIO_ROL', registro: body.codUsuario, accion: 'INSERT', valorAntes: null, valorDespues: body.rol });
      return cambio(ok('Rol asignado.'));
    }
    if (ruta === 'roles' && metodo === 'DELETE') {
      const x = exigir('CONFIGURACION'); if (x) return x;
      const i = D.roles.findIndex(r => r.codUsuario === q.get('codUsuario') && r.rol === q.get('rol')); if (i < 0) return res(falla('El usuario no tiene ese rol.'));
      D.roles.splice(i, 1);
      D.bitcfg.unshift({ id: ++D.seq.bitcfg, fecha: ahora(), codUsuario: usr, tabla: 'MCI_USUARIO_ROL', registro: q.get('codUsuario'), accion: 'DELETE', valorAntes: q.get('rol'), valorDespues: null });
      return cambio(ok('Rol quitado.'));
    }

    // ---- ubicaciones (F-031, Claudio 14OCT2026): existen antes del conteo. Alta, inactivación y
    //      plantilla Excel, en STAND ALONE y en ACTIVO; rol CARGA o CONFIGURACION. Mismas reglas que
    //      SMO_MCI_Ubicaciones_V01: solo almacenes ya cargados, GEN y SU las crea el sistema, la que
    //      tiene existencia o está en un programa abierto no se inactiva.
    const claveUbic = u => [u.pasillo, u.rack, u.nivel].map(v => String(v ?? '').trim().toUpperCase()).join('|');
    const programaAbierto = u => { const pr = D.programas.find(pp => pp.estado >= 1 && pp.estado <= 4 && pp.lineas.some(l => !l.esHallazgo && l.idUbicacion === u.id)); return pr ? pr.numeroPrograma : null; };
    if (seg[0] === 'almacenes' && seg[2] === 'ubicaciones' && seg[3] === 'mantenimiento') {
      const con = new Set(D.existencias.filter(x => x.cantidad).map(x => x.idUbicacion));
      return json(D.ubicaciones.filter(u => u.tipoUbicacion !== 3)
        .sort((a, b) => b.tipoUbicacion - a.tipoUbicacion || claveUbic(a).localeCompare(claveUbic(b), 'es', { numeric: true }))
        .map(u => Object.assign({}, u, { conExistencia: con.has(u.id), numeroProgramaAbierto: programaAbierto(u) })));
    }
    if (seg[0] === 'ubicaciones' || (seg[0] === 'carga' && seg[1] === 'ubicaciones')) {
      if (D.emp.modo !== 'STAND_ALONE' && D.emp.modo !== 'ACTIVO') return res(falla('El módulo de conteo está inactivo: se enciende en el MDC de la empresa.'));
      if (!tieneRol(D, usr, 'CARGA', 'CONFIGURACION')) return res(falla('Las ubicaciones las mantiene el rol de carga o de configuración del módulo.'));
      const reglas = (f, err) => [['Pasillo', 'pasillo'], ['Rack', 'rack'], ['Nivel', 'nivel']].forEach(([col, k]) => {
        const v = String(f[k] ?? '').trim();
        const m = !v ? `Falta el ${col.toLowerCase()} (la ubicación lleva pasillo, rack y nivel)` : v.length > 20 ? 'Más de 20 caracteres'
          : v.includes('|') ? 'No puede llevar el carácter |' : /^(GEN|SU)$/i.test(v) ? 'GEN y SU las crea el sistema: use otro nombre' : null;
        if (m) err.push({ fila: f.fila, columna: col, valor: f[k] ?? null, motivo: m });
      });
      const buscar = f => D.ubicaciones.find(u => u.tipoUbicacion === 1 && claveUbic(u) === claveUbic(f));
      const nuevoId = () => Math.max(0, ...D.ubicaciones.map(z => z.id)) + 1;
      const bitU = (reg, accion, antes, despues) => D.bitcfg.unshift({ id: ++D.seq.bitcfg, fecha: ahora(), codUsuario: usr,
        tabla: D.emp.modo === 'ACTIVO' ? 'Tab_Ubicaciones' : 'MCI_UBICACIONES', registro: reg, accion, valorAntes: antes, valorDespues: despues });

      if (seg[0] === 'ubicaciones' && metodo === 'POST') {
        const f = { fila: 0, pasillo: String(body.pasillo || '').trim(), rack: String(body.rack || '').trim(), nivel: String(body.nivel || '').trim() };
        if (Number(body.idAlmacen) !== 1) return res(falla('Elija el almacén'));
        const err = []; reglas(f, err); if (err.length) return res(falla(err[0].motivo));
        let u = buscar(f);
        if (u && u.estatusUbicacion !== 2) return res(falla('Esa ubicación ya existe.'));
        if (u) { u.estatusUbicacion = 1; bitU(ubicStr(D, u), 'UPDATE', 'ESTATUS 2', 'ESTATUS 1'); return cambio(Object.assign(ok(`Ubicación ${ubicStr(D, u)} reactivada.`), { id: u.id })); }
        u = { id: nuevoId(), pasillo: f.pasillo, rack: f.rack, nivel: f.nivel, tipoUbicacion: 1, estatusUbicacion: 1 };
        D.ubicaciones.push(u); bitU(ubicStr(D, u), 'INSERT', null, 'alta manual');
        return cambio(Object.assign(ok(`Ubicación ${ubicStr(D, u)} creada.`), { id: u.id }));
      }
      if (seg[0] === 'ubicaciones' && seg[2] === 'estatus') {
        const u = D.ubicaciones.find(z => z.id === Number(seg[1])), e = Number(body.estatus);
        if (!u) return res(falla('La ubicación no existe.'));
        if (e !== 1 && e !== 2) return res(falla('El estatus es 1 (activa) o 2 (inactiva).'));
        if (u.tipoUbicacion !== 1) return res(falla('GEN y SU son del almacén: no se inactivan.'));
        if (u.estatusUbicacion === e) return res(falla(e === 1 ? 'La ubicación ya está activa.' : 'La ubicación ya está inactiva.'));
        if (e === 2 && D.existencias.some(x => x.idUbicacion === u.id && x.cantidad)) return res(falla('La ubicación tiene existencia: muévala antes de inactivarla.'));
        if (e === 2 && programaAbierto(u)) return res(falla('La ubicación está en un programa de conteo abierto: se inactiva cuando el programa termine.'));
        const antes = u.estatusUbicacion; u.estatusUbicacion = e;
        bitU(ubicStr(D, u), 'UPDATE', 'ESTATUS ' + antes, 'ESTATUS ' + e);
        return cambio(Object.assign(ok(`Ubicación ${ubicStr(D, u)} ${e === 1 ? 'activada' : 'inactivada'}.`), { id: u.id }));
      }
      if (seg[0] === 'carga' && metodo === 'POST') {
        const filas = body.filas || [], errores = [], vistas = {};
        if (!filas.length) errores.push({ fila: 0, columna: '(archivo)', valor: null, motivo: 'El archivo no trae filas' });
        filas.forEach(f => {
          const alm = String(f.almacen ?? '').trim();
          if (!alm) errores.push({ fila: f.fila, columna: 'Almacén', valor: null, motivo: 'Falta el almacén' });
          else if (alm.toUpperCase() !== D.emp.almacen.toUpperCase())
            errores.push({ fila: f.fila, columna: 'Almacén', valor: alm, motivo: D.emp.modo === 'ACTIVO' ? 'El almacén no existe en SIMON' : 'El almacén no existe: cárguelo primero con el Excel de existencias' });
          reglas(f, errores);
          const lt = String(f.almacenaLotes ?? '').trim().toUpperCase();
          if (lt && !['SÍ', 'SI', 'S', '1', 'TRUE', 'NO', 'N', '0', 'FALSE'].includes(lt)) errores.push({ fila: f.fila, columna: 'Almacena lotes', valor: f.almacenaLotes, motivo: 'Use Sí o No' });
          const k = alm.toUpperCase() + '|' + claveUbic(f);
          if (vistas[k]) errores.push({ fila: f.fila, columna: 'Ubicación', valor: [f.pasillo, f.rack, f.nivel].join('|'), motivo: `Repetida en el archivo (fila ${vistas[k]})` });
          else vistas[k] = f.fila;
        });
        const c = { id: ++D.seq.carga, tipo: 'UBICACIONES', archivo: body.archivo, codUsuario: usr, fecha: ahora(), filasLeidas: filas.length, filasAceptadas: 0,
          filasRechazadas: 0, altas: 0, bajas: 0, reactivadas: 0, resultado: 'RECHAZADA', errores };
        if (!errores.length) {
          filas.forEach(f => {
            const g = { pasillo: String(f.pasillo).trim(), rack: String(f.rack).trim(), nivel: String(f.nivel).trim() };
            const u = buscar(g);
            if (!u) { D.ubicaciones.push(Object.assign({ id: nuevoId(), tipoUbicacion: 1, estatusUbicacion: 1 }, g)); c.altas++; }
            else if (u.estatusUbicacion === 2) { u.estatusUbicacion = 1; c.reactivadas++; }
          });
          bitU(`Carga ${c.id} · ${body.archivo || '(sin nombre)'}`, 'INSERT', null, `${c.altas} alta(s), ${c.reactivadas} reactivada(s), ${filas.length - c.altas - c.reactivadas} ya existían`);
        }
        c.filasRechazadas = new Set(errores.map(e => e.fila)).size; c.filasAceptadas = errores.length ? 0 : filas.length;
        c.resultado = errores.length ? 'RECHAZADA' : 'APLICADA'; D.cargas.push(c); guardar();
        return json({ ok: !errores.length, idCarga: c.id, filasLeidas: c.filasLeidas, filasAceptadas: c.filasAceptadas, filasRechazadas: c.filasRechazadas,
          altas: c.altas, bajas: 0, reactivadas: c.reactivadas, errores,
          mensaje: errores.length ? `Carga rechazada: ${errores.length} error(es) en ${c.filasRechazadas} fila(s). No se creó ninguna ubicación.`
            : `Carga aplicada: ${c.altas} ubicación(es) nueva(s), ${c.reactivadas} reactivada(s) y ${filas.length - c.altas - c.reactivadas} que ya existían.` }, errores.length ? 400 : 200);
      }
    }

    // ---- cargas (solo STAND ALONE)
    if (seg[0] === 'carga') {
      if (seg[1] === 'historial') return json(D.cargas.filter(c => !q.get('tipo') || c.tipo === q.get('tipo')).slice().reverse().map(c => { const o = Object.assign({}, c); delete o.errores; return o; }));
      if (seg[2] === 'errores') return json((D.cargas.find(c => c.id === Number(seg[1])) || {}).errores || []);
      if (D.emp.modo !== 'STAND_ALONE') return res(falla('La carga desde Excel solo existe con el módulo en STAND ALONE.'));
      const x = exigir('CARGA', 'CONFIGURACION'); if (x) return x;
      const filas = body.filas || [], errores = [];
      const req = (f, k, col) => { if (f[k] == null || String(f[k]).trim() === '') errores.push({ fila: f.fila, columna: col, valor: f[k], motivo: 'Obligatorio' }); };
      const num = (f, k, col) => { if (f[k] != null && isNaN(Number(String(f[k]).replace(',', '.')))) errores.push({ fila: f.fila, columna: col, valor: f[k], motivo: 'No es un número' }); };
      const c = { id: ++D.seq.carga, tipo: seg[1] === 'productos' ? 'PRODUCTOS' : 'EXISTENCIAS', archivo: body.archivo, codUsuario: usr, fecha: ahora(), filasLeidas: filas.length, filasAceptadas: 0, filasRechazadas: 0, altas: 0, bajas: 0, reactivadas: 0, resultado: 'RECHAZADA', errores };
      if (seg[1] === 'productos') {
        filas.forEach(f => { const ce = criterioFila(f, true); if (ce) errores.push(...ce); });
        filas.forEach(f => { req(f, 'codigo', 'Código del producto'); req(f, 'descripcion', 'Descripción del producto'); req(f, 'unidad', 'Unidad de inventario'); req(f, 'costoUnitario', 'Costo unitario en divisa'); num(f, 'costoUnitario', 'Costo unitario en divisa'); });
        if (!errores.length) {
          const vistos = new Set();
          filas.forEach(f => {
            const cod = String(f.codigo).trim(); vistos.add(cod);
            let pr = D.catalogo.find(z => z.codigo === cod);
            if (!pr) { pr = { idProducto: D.catalogo.length + 1, codigo: cod, tCean: f.codigoBarras || '', status: 1 }; D.catalogo.push(pr); c.altas++; }
            else if (pr.status !== 1) { pr.status = 1; c.reactivadas++; }
            Object.assign(pr, { nombre: f.descripcion, unidadStock: f.unidad, costo: Number(String(f.costoUnitario).replace(',', '.')), manejaLote: /^(s|si|sí|1|true)$/i.test(String(f.manejaLote || '')) });
            const cr = criterioFila(f);
            if (cr) Object.assign(pr, cr); else if (pr.val == null) Object.assign(pr, { val: 1, med: 1, lf: 0, ls: 0 });
          });
          D.catalogo.forEach(z => { if (!vistos.has(z.codigo) && z.status === 1) { z.status = 9; c.bajas++; } });
        }
      } else {
        filas.forEach(f => { req(f, 'almacen', 'Almacén'); req(f, 'codigo', 'Código del producto'); req(f, 'cantidad', 'Cantidad física'); num(f, 'cantidad', 'Cantidad física');
          if (f.codigo && !D.catalogo.some(z => z.codigo === String(f.codigo).trim() && z.status === 1)) errores.push({ fila: f.fila, columna: 'Código del producto', valor: f.codigo, motivo: 'No existe en el catálogo cargado' });
          if (f.almacen && String(f.almacen).trim().toUpperCase() !== D.emp.almacen) errores.push({ fila: f.fila, columna: 'Almacén', valor: f.almacen, motivo: `El almacén de la demo es ${D.emp.almacen}` }); });
        if (!errores.length) {
          D.existencias = filas.map(f => {
            const pas = f.pasillo || 'GEN', rack = f.rack || 'GEN', niv = f.nivel || 'GEN';
            let u = D.ubicaciones.find(z => z.pasillo === pas && z.rack === rack && z.nivel === niv);
            if (!u) { u = { id: D.ubicaciones.length + 1, pasillo: pas, rack, nivel: niv, tipoUbicacion: 1, estatusUbicacion: 1 }; D.ubicaciones.push(u); }
            return { idProducto: D.catalogo.find(z => z.codigo === String(f.codigo).trim()).idProducto, idUbicacion: u.id, lote: f.lote || '', venc: f.fechaVencLote || null, cantidad: Number(String(f.cantidad).replace(',', '.')) };
          });
        }
      }
      c.filasRechazadas = new Set(errores.map(e => e.fila)).size; c.filasAceptadas = errores.length ? 0 : filas.length;
      c.resultado = errores.length ? 'RECHAZADA' : 'APLICADA'; D.cargas.push(c); guardar();
      const r = { ok: !errores.length, mensaje: errores.length ? `Carga rechazada: ${errores.length} error(es). No se cambió nada.` : `Carga aplicada: ${filas.length} filas.`, idCarga: c.id,
        filasLeidas: c.filasLeidas, filasAceptadas: c.filasAceptadas, filasRechazadas: c.filasRechazadas, altas: c.altas, bajas: c.bajas, reactivadas: c.reactivadas, errores };
      return json(r, errores.length ? 400 : 200);
    }

    // ---- catálogo de ubicaciones y cobertura
    if (ruta === 'almacenes') return json([{ id: 1, sucursal: D.emp.sucursal, almacen: D.emp.almacen, nombreAlmacen: D.emp.nombreAlmacen }]);
    if (seg[0] === 'almacenes' && seg[2] === 'ubicaciones') {
      // F-031: también las que no tienen existencia (marcadas); las inactivas no
      const con = new Set(D.existencias.map(x => x.idUbicacion));
      return json(D.ubicaciones.filter(u => u.tipoUbicacion !== 3 && u.estatusUbicacion !== 2).map(u => Object.assign({}, u, { conExistencia: con.has(u.id) || u.tipoUbicacion === 2 })));
    }
    if (ruta === 'cobertura') {
      const cat = D.catalogo.filter(x => x.status === 1), est = {};
      D.programas.filter(p => p.estado !== 9).forEach(p => {
        const nivel = p.estado >= 2 ? 3 : p.estado === 1 ? 2 : 1;
        (p.estado === 0 ? lineasTeoricas(D, p) : p.lineas).forEach(l => { est[l.idProducto] = Math.max(est[l.idProducto] || 0, nivel); });
      });
      const n = k => cat.filter(x => (est[x.idProducto] || 0) === k).length, c = cat.length || 1;
      const ct = n(3), ec = n(2), pr = n(1);
      return json({ catalogo: cat.length, contados: ct, enCurso: ec, programados: pr, sinProgramar: cat.length - ct - ec - pr,
        pctContados: r2(100 * ct / c), pctEnCurso: r2(100 * ec / c), pctProgramados: r2(100 * pr / c), pctCubierto: r2(100 * (ct + ec + pr) / c) });
    }

    // ---- programas
    if (ruta === 'programas' && metodo === 'GET') return json(D.programas.filter(p => p.estado !== 9).map(p => vistaPrograma(D, p)));
    if (ruta === 'programas' && metodo === 'POST') { const x = exigir('SUPERVISOR', 'CONFIGURACION'); if (x) return x; return cambio(crearPrograma(D, usr, body)); }
    if (p && seg.length === 2) {
      if (metodo === 'GET') return json({ programa: vistaPrograma(D, p), asignaciones: p.asignaciones.map(a => Object.assign({ compartida: false }, a)),
        productos: (p.productos || []).map(id => { const z = prodDe(D, id) || {}; return { idProducto: id, codigo: z.codigo || '', nombre: z.nombre || '' }; }), bitacora: p.bitacora, operadores: p.operadores });
      const x = exigir('SUPERVISOR', 'CONFIGURACION'); if (x) return x;
      if (metodo === 'PUT') {
        if (p.estado !== 0) return res(falla('Solo se edita un programa que no se ha iniciado.'));
        Object.assign(p, { pasillo: body.pasillo || '', rack: body.rack || '', nivel: body.nivel || '', lote: body.lote || '', fechaConteo: body.fechaDesde, fechaConteoHasta: body.fechaHasta, modalidad: body.modalidad || p.modalidad });
        bit(D, p, usr, 'EDITAR', null, null); return cambio(ok(`Programa ${p.stPrograma} actualizado.`, p.numeroPrograma));
      }
      if (metodo === 'DELETE') { if (p.estado > 1) return res(falla('Solo se anula un programa programado o en conteo.')); p.estado = 9; bit(D, p, usr, 'ANULAR', null, q.get('observacion')); return cambio(ok(`Programa ${p.stPrograma} anulado: sus ubicaciones quedan libres.`)); }
    }
    if (p) {
      const accion = seg[2];
      /* P-043 / F-014 (Claudio, 15OCT2026), como SMO_MCI_Conteo_V01 · ANULAR_CAPTURA: código equivocado. Un supervisor que no
         grabó en la línea, con su COE, anula lo grabado en ella en la fase en curso; la línea vuelve a "sin contar". */
      if (accion === 'lineas' && seg[4] === 'anular-captura' && metodo === 'POST') {
        const f = p.faseActual, idc = Number(seg[3]), supv = String(body.supervisor || usr).trim();
        const l = p.lineas.find(x => x.id === idc) || (p.revisar || []).find(x => x.id === idc);
        if (!D.roles.some(r => r.codUsuario === supv && r.rol === 'SUPERVISOR')) return res(falla('La anulación la autoriza un supervisor del módulo con su COE.'));
        if (!body.coe) return res(falla('COE incorrecta.'));
        if (p.estado !== 1 || STF(p, f) !== 3) return res(falla('El conteo de la fase no está abierto: ya no se anulan capturas.'));
        if (!String(body.motivo || '').trim()) return res(falla('Indique el motivo de la anulación.'));
        if (!l || !l.fases[f]) return res(falla('La línea no está en la fase en curso de este programa.'));
        const ev = p.eventos.filter(e => e.idCuaderno === idc && e.fase === f);
        if (!ev.length) return res(falla('La línea no tiene capturas en esta fase: no hay nada que anular.'));
        if (ev.some(e => e.codUsuario === supv)) return res(falla('El supervisor grabó capturas en esta línea: la anulación la autoriza otro supervisor.'));
        if (!tieneRol(D, usr, 'SUPERVISOR') && !ev.some(e => e.codUsuario === usr)) return res(falla('Solo quien grabó en la línea o un supervisor piden la anulación.'));
        p.anulados = (p.anulados || []).concat(ev.map(e => Object.assign({}, e, { anuladoPor: usr, supervisorAnula: supv, motivoAnula: body.motivo, fechaAnula: ahora() })));
        p.eventos = p.eventos.filter(e => !(e.idCuaderno === idc && e.fase === f));
        bit(D, p, usr, 'ANULAR_CAPTURA', f, `${ev.length} captura(s) de ${l.codigo} en ${l.ubicacion} · autorizó ${supv} · ${body.motivo}`);
        return cambio(ok(`${ev.length} captura(s) anulada(s): la línea vuelve a quedar sin contar.`));
      }
      /* P-013 (Claudio, 15OCT2026), como SMO_MCI_Cierre_V01 · REUBICACIONES: la solicitud a Almacén. Lo reubicado del
         producto que no estaba en cuaderno (F-028), repartido entre las ubicaciones donde figura, de mayor a menor. */
      if (accion === 'reubicaciones' && metodo === 'GET') {
        const RR = ['SUPERVISOR', 'GERENTE', 'FIRMANTE', 'CONFIGURACION', 'ALMACEN'];
        if (!tieneRol(D, usr, ...RR)) return prohibido('Las solicitudes a Almacén', RR);
        if (p.estado < 2) return res(falla('Las solicitudes de reubicación salen al cerrar el programa.'));
        const lineas = [];
        p.lineas.filter(l => l.noEnCuaderno && (l.reub || 0) > 0).forEach(l => {
          const enProg = new Set(p.lineas.filter(x => x.idProducto === l.idProducto && (x.lote || '') === (l.lote || '')).map(x => x.idUbicacion));
          const ev = p.eventos.find(e => e.idCuaderno === l.id && !e.rechazo) || {};
          let resta = l.reub;
          D.existencias.filter(x => x.idProducto === l.idProducto && (x.lote || '') === (l.lote || '') && x.cantidad > 0 && !enProg.has(x.idUbicacion))
            .sort((a, b) => b.cantidad - a.cantidad).forEach(x => {
              if (resta <= 0) return;
              const qq = Math.min(resta, x.cantidad), u = D.ubicaciones.find(v => v.id === x.idUbicacion); resta = r2(resta - qq);
              lineas.push({ id: lineas.length + 1, fase: Math.min(...Object.keys(l.fases).map(Number)), codigo: l.codigo, descrip: l.descrip, unidadStock: l.unidadStock, lote: l.lote, cantidad: qq,
                ubicacionOrigen: u ? ubicStr(D, u) : null, ubicacionDestino: l.ubicacion, operador: ev.codUsuario || null, nombreOperador: ev.codUsuario ? nombreDe(ev.codUsuario) : null,
                fechaHallazgo: ev.fechaEquipo || p.fechaCorte, estado: 'PENDIENTE', documento: null, codUsuarioEjecuta: null, fechaEjecuta: null,
                observacion: 'No estaba en cuaderno: registrar en la ubicación hallada (transferencia del módulo de inventario)' });
            });
        });
        return json({ cabecera: { numeroPrograma: p.numeroPrograma, stPrograma: p.stPrograma, sucursal: p.sucursal, almacen: p.almacen, estado: p.estado, supervisor: p.codUsuario, modo: D.emp.modo,
          fechaEmision: ahora(), renglones: lineas.length, pendientes: lineas.length }, lineas });
      }
      const sup = () => exigir('SUPERVISOR', 'CONFIGURACION');
      if (accion === 'operadores') { const x = sup(); if (x) return x;
        if (metodo === 'POST') return cambio(agregarOperador(D, p.numeroPrograma, body.operador, usr));
        p.operadores = p.operadores.filter(o => o.codUsuario !== decodeURIComponent(seg[3])); bit(D, p, usr, 'SORTEO_QUITAR', null, seg[3]); return cambio(ok(`${seg[3]} sale del sorteo. Las asignaciones ya hechas se mantienen.`)); }
      if (esCons(D, p) && metodo !== 'DELETE' && ((accion === 'asignaciones' && (body.fase || Math.max(1, p.faseActual)) === 1) || (accion === 'sorteo' && Number(seg[3]) === 1)
          || (['reasignar', 'fijar'].includes(accion) && (p.faseActual || 1) <= 1)))
        return res(falla('En el Modo Construcción de Ubicaciones la fase 1 no se asigna por ubicación ni se sortea: cuentan los operadores del programa en cualquier ubicación del alcance. Desde la fase 2 se sortea o asigna como en Ubicaciones Existentes.'));
      if (accion === 'productos' && seg[3]) { const x = sup(); if (x) return x;
        if (p.estado !== 0) return res(falla('El filtro de productos solo se cambia antes de iniciar el conteo.'));
        const idp = Number(seg[3]); p.productos = p.productos || [];
        if (metodo === 'POST') { if (!D.catalogo.some(z => z.idProducto === idp && z.status === 1)) return res(falla('El producto no existe.')); if (!p.productos.includes(idp)) p.productos.push(idp); }
        else p.productos = p.productos.filter(z => z !== idp);
        return cambio(ok('Filtro de productos actualizado.', p.numeroPrograma)); }
      if (accion === 'sorteo-automatico') { const x = sup(); if (x) return x; p.sorteoAlEmitir = !!body.activo; bit(D, p, usr, 'SORTEO_AUTO', null, 'sorteo al emitir cuadernos: ' + (body.activo ? 'activado' : 'desactivado')); return cambio(ok('Sorteo automático ' + (body.activo ? 'activado.' : 'desactivado.'))); }
      if (accion === 'sorteo') { const x = sup(); if (x) return x; return cambio(sortear(D, p.numeroPrograma, Number(seg[3]), usr)); }
      if (accion === 'asignaciones') { const x = sup(); if (x) return x;
        if (metodo === 'DELETE') {
          const q0 = p.asignaciones.find(a => a.id === Number(seg[3]));
          p.asignaciones = p.asignaciones.filter(a => a.id !== Number(seg[3]));
          // P-066: si en ese alcance queda un solo operador, su asignación deja de ser compartida
          if (q0) { const quedan = p.asignaciones.filter(a => a.fase === q0.fase && a.pasillo === q0.pasillo && a.rack === q0.rack && (a.nivel || '') === (q0.nivel || ''));
            if (quedan.length === 1) quedan[0].compartida = false; }
          return cambio(ok('Asignación quitada.'));
        }
        const f = body.fase || Math.max(1, p.faseActual);
        if (!body.operador || (body.rack && !body.pasillo) || (body.nivel && !body.rack)) return res(falla('Indique operador y fase; el rack exige pasillo y el nivel exige rack (pasillo vacío = todo el programa).'));
        // F-041 / P-066: se suma a la asignación del mismo alcance; no reemplaza a nadie
        if (body.compartida) {
          if (!body.pasillo) return res(falla('Se comparte una ubicación: indique al menos el pasillo.'));
          const mismo = a => a.fase === f && a.pasillo === (body.pasillo || '') && a.rack === (body.rack || '') && (a.nivel || '') === (body.nivel || '');
          const otros = p.asignaciones.filter(a => mismo(a) && a.codUsuario !== body.operador);
          if (!otros.length) return res(falla('Para compartir, esa ubicación tiene que estar asignada antes a otro operador con el mismo alcance (pasillo, rack y nivel). Asígnela primero y después sume a los compañeros como compartida.'));
          if (p.asignaciones.some(a => mismo(a) && a.codUsuario === body.operador && a.compartida)) return res(falla(`${body.operador} ya comparte esa ubicación en la fase ${f}.`));
          otros.forEach(a => { a.compartida = true; });
          p.asignaciones = p.asignaciones.filter(a => !(mismo(a) && a.codUsuario === body.operador));
          p.asignaciones.push({ id: ++D.seq.asig, fase: f, codUsuario: body.operador, pasillo: body.pasillo || '', rack: body.rack || '', nivel: body.nivel || '', programaFijado: false, codUsuarioFija: null, fechaFija: null, compartida: true });
          const alcance = [body.pasillo, body.rack, body.nivel].filter(Boolean).join('|'), comp = [...new Set(otros.map(a => a.codUsuario).concat(body.operador))].join(', ');
          bit(D, p, usr, 'COMPARTIR', f, alcance + ' compartida: ' + comp);
          return cambio(ok(`${alcance} queda compartida en la fase ${f} entre ${comp}. Cada uno graba lo que cuenta y la línea suma lo de todos; repártanse el espacio a mano.`));
        }
        // excluyente (F-029): reemplaza todo lo que queda dentro de su alcance, incluidas las de nivel
        p.asignaciones = p.asignaciones.filter(a => !(a.fase === f && (!body.pasillo || (a.pasillo === body.pasillo && (!body.rack || (a.rack === body.rack && (!body.nivel || a.nivel === body.nivel)))))));
        p.asignaciones.push({ id: ++D.seq.asig, fase: f, codUsuario: body.operador, pasillo: body.pasillo || '', rack: body.rack || '', nivel: body.nivel || '', programaFijado: false, codUsuarioFija: null, fechaFija: null, compartida: false });
        const mismo = f > 1 && p.asignaciones.some(a => a.fase === f - 1 && a.codUsuario === body.operador && a.pasillo === (body.pasillo || '') && a.rack === (body.rack || '') && (a.nivel || '') === (body.nivel || ''));
        bit(D, p, usr, 'ASIGNAR', f, `${body.operador} · ${body.pasillo || '(todo)'}${body.rack ? '|' + body.rack : ''}${body.nivel ? '|' + body.nivel : ''}`);
        return cambio(ok(mismo ? `Asignado. Aviso: ${body.operador} ya contó esas ubicaciones en la F${f - 1} (OPERADOR_DISTINTO_POR_FASE = AVISO).` : 'Asignado.')); }
      if (accion === 'fijar') { const x = sup(); if (x) return x; p.asignaciones.filter(a => a.codUsuario === body.operador).forEach(a => { a.programaFijado = true; a.codUsuarioFija = usr; a.fechaFija = ahora(); }); return cambio(ok(`Programa fijado para ${body.operador}.`)); }
      if (accion === 'reasignar') { const x = sup(); if (x) return x;
        const f = p.faseActual, ub = body.ubicaciones || [];
        if (body.origen === body.destino) return res(falla('El que recibe debe ser otro operador.'));
        let n = 0;
        p.lineas.filter(l => l.fases[f] && operadorDe(p, l, f) === body.origen && !grabada(p, l, f) && (!ub.length || ub.includes(l.pasillo + '|' + l.rack))).forEach(l => { l.opFijo[f] = body.destino; n++; });
        bit(D, p, usr, 'REASIGNAR', f, `${n} línea(s) de ${body.origen} a ${body.destino}${body.motivo ? ' · ' + body.motivo : ''}`);
        return cambio(ok(`${n} línea(s) pasan de ${body.origen} a ${body.destino}. Lo ya contado se queda con ${body.origen}.`)); }
      if (accion === 'ciclo') { const x = sup(); if (x) return x; return cambio(pasoCiclo(D, p.numeroPrograma, seg[3], usr)); }
      if (accion === 'cuadernos') {
        const f = Number(q.get('fase') || p.faseActual || 1);
        // P-010 (Claudio, 15OCT2026): por operador, ubicación (pasillo, rack, nivel) y código; P-053: con las A REVISAR
        const L = (p.lineas.length ? p.lineas.filter(l => l.fases[f]) : []).concat(revisarDe(p, f))
          .flatMap(l => { const ops = operadoresDe(p, l, f); return (ops.length ? ops : [null]).map(op => ({ l, op })); })
          .sort((x, y) => String(x.op || '').localeCompare(String(y.op || '')) || x.l.pasillo.localeCompare(y.l.pasillo) || x.l.rack.localeCompare(y.l.rack)
            || x.l.nivel.localeCompare(y.l.nivel) || x.l.codigo.localeCompare(y.l.codigo) || String(x.l.lote || '').localeCompare(String(y.l.lote || '')));
        return json({ cabecera: { numeroPrograma: p.numeroPrograma, stPrograma: p.stPrograma, almacen: p.almacen, pasillo: p.pasillo, rack: p.rack, nivel: p.nivel, lote: p.lote,
          fechaConteo: p.fechaConteo, fechaConteoHasta: p.fechaConteoHasta, estado: p.estado, fase: f, statusFase: STF(p, f), emitido: STF(p, f) >= 2, fechaEmision: p['emision' + f] || null },
          lineas: L.map(({ l, op }) => ({ operador: op, nombreOperador: nombreDe(op), idCuaderno: l.id, ubicacion: l.ubicacion, pasillo: l.pasillo, rack: l.rack, nivel: l.nivel,
            codigo: l.codigo, tCean: l.tCean, descrip: l.descrip, unidadStock: l.unidadStock, lote: l.lote, fechaVencLote: l.fechaVencLote, manejaLote: l.manejaLote,
            grabado: op ? grabadaPor(p, l, f, op) : grabada(p, l, f), revisarHallazgo: !!l.revisar })) });
      }
      if (accion === 'correcciones') return json(p.eventos.filter(e => e.tipo === 'CORRECCION' && e.aprobacion === 'PENDIENTE' && !e.rechazo).map(e => {
        const l = p.lineas.find(z => z.id === e.idCuaderno) || {};
        return { idEvento: e.idEvento, fase: e.fase, codUsuario: e.codUsuario, equipo: 'DEMO', fechaEquipo: e.fechaEquipo, cantidad: e.cantidad, motivo: e.motivo, codigo: l.codigo, descrip: l.descrip, ubicacion: l.ubicacion, lote: l.lote };
      }));
      // ---- reporte de avance por fase (06OCT): la fase en conteo sale ciega
      if (accion === 'avance' && metodo === 'GET' && !seg[3]) {
        if (!tieneRol(D, usr, ...ROLES_TEORICO)) return prohibido('El reporte de avance', ROLES_TEORICO);
        if (p.estado === 0) return res(falla('El conteo de este programa todavía no se inició: aún no hay teórico ni cuadernos.'));
        if (!veCantidades(D, usr, p.estado)) return res(falla(sinCantidades(D, usr, p.estado)));
        return json(avancePrograma(D, p));
      }
      // ---- cierre: plantilla, resumen, acta (con rol y con el programa cerrado: conteo ciego)
      if (['plantilla', 'resumen', 'acta'].includes(accion) && metodo === 'GET') {
        if (!tieneRol(D, usr, ...ROLES_TEORICO)) return prohibido(accion === 'plantilla' ? 'La plantilla final' : accion === 'resumen' ? 'El resumen de la plantilla' : 'El acta', ROLES_TEORICO);
        if (p.estado < 2) return res(falla('El programa todavía se está contando: la plantilla, el resumen y el acta se ven al cerrarlo.'));
        if (!veCantidades(D, usr, p.estado)) return res(falla(sinCantidades(D, usr, p.estado)));
        const R = resumen(D, p);
        if (accion === 'resumen') { const o = Object.assign({}, R); delete o._dif; delete o._val; return json(o); }
        if (accion === 'plantilla') {
          const fil = (q.get('filtro') || 'TODAS').toUpperCase();
          const L = p.lineas.filter(l => fil === 'TODAS' || (fil === 'NC' && l.porDecidir) || (fil === 'AJ' && R._dif(l) !== 0))
            .sort((a, b) => (b.porDecidir - a.porDecidir) || Math.abs(R._val(b)) - Math.abs(R._val(a)));
          return json(L.map(l => ({ idCuaderno: l.id, codigo: l.codigo, descrip: l.descrip, ubicacion: l.ubicacion, lote: l.lote, fechaVencLote: l.fechaVencLote, unidadStock: l.unidadStock,
            noEnCuaderno: !!l.noEnCuaderno, cantReubicada: l.noEnCuaderno ? (l.reub || 0) : null, observacion: l.observacion || null,
            teorico: l.teorico, cantF1: l.cant[1] ?? null, cantF2: l.cant[2] ?? null, cantF3: l.cant[3] ?? null, halladoSu: l.hallFinal || 0, resultadoF1: l.res[1] ?? null, resultadoF2: l.res[2] ?? null, resultadoF3: l.res[3] ?? null,
            faseActual: Math.max(...Object.keys(l.fases).map(Number)), decisionPlantilla: l.decision, cantFinal: l.cantFinal, diferencia: R._dif(l), diferenciaFinal: l.porDecidir ? null : l.difFinal,
            costoUnitario: l.costo, valor: R._val(l), porDecidir: l.porDecidir, motivo: l.motivo })));
        }
        const o = Object.assign({}, R); delete o._dif; delete o._val;
        return json({ cabecera: { numeroPrograma: p.numeroPrograma, stPrograma: p.stPrograma, sucursal: p.sucursal, almacen: p.almacen, pasillo: p.pasillo, rack: p.rack, nivel: p.nivel, lote: p.lote,
          fechaConteo: p.fechaConteo, fechaConteoHasta: p.fechaConteoHasta, fechaCorte: p.fechaCorte, modalidad: p.modalidad, supervisor: p.codUsuario, faseActual: p.faseActual, estado: p.estado, modo: D.emp.modo },
          resumen: o, firmas: p.firmas, lineas: p.lineas.filter(l => R._dif(l) !== 0).map(l => ({ codigo: l.codigo, descrip: l.descrip, ubicacion: l.ubicacion, lote: l.lote, teorico: l.teorico,
            contadoFinal: r2(teoEf(l) + R._dif(l)), diferenciaFinal: R._dif(l), costoUnitario: l.costo, valor: R._val(l), decisionPlantilla: l.decision })) });
      }
      if (accion === 'plantilla' && metodo === 'PUT') { const x = exigir('GERENTE'); if (x) return x; return cambio(decidir(D, p.numeroPrograma, Number(seg[3]), body, usr)); }
      if (accion === 'enviar-aprobacion') return cambio(enviarAprobacion(D, p.numeroPrograma, usr));
      if (accion === 'firmas') return cambio(firmar(D, p.numeroPrograma, body, usr));
      if (accion === 'ajuste') {
        if (D.emp.modo !== 'ACTIVO') return res(falla('El ajuste contra SIMON solo existe con el módulo en ACTIVO.'));
        if (metodo === 'GET') {
          if (!tieneRol(D, usr, ...ROLES_AJUSTE)) return prohibido('El ajuste', ROLES_AJUSTE);
          if (!veCantidades(D, usr, p.estado)) return res(falla('Su usuario no puede ver las diferencias de este programa (lo regula el parámetro de gobierno SUPERVISOR_VE_CANTIDADES).'));
          return json(vistaAjuste(D, p, q.get('fechaContable')));
        }
        const x = exigir('GERENTE'); if (x) return x;
        if (!body.coe) return res(falla('COE incorrecta.'));
        if (seg[3] === 'revertir') {
          if (!p.ajuste) return res(falla('El programa no tiene un ajuste aplicado.'));
          if (!body.motivo) return res(falla('Indique el motivo.'));
          bit(D, p, usr, 'REVERSO_AJUSTE', null, `${p.ajuste.documento} · ${body.motivo}`); p.ajuste = null; p.estado = 4;
          return cambio(ok('Ajuste revertido: el kardex vuelve a como estaba y el asiento sale de la bandeja.'));
        }
        const v = vistaAjuste(D, p, body.fechaContable); if (!v.cabecera.puedeAplicar) return res(falla('No se puede aplicar: revise las validaciones.'));
        p.ajuste = { documento: 'AJ-' + String(++D.seq.ajuste).padStart(7, '0'), fechaContable: body.fechaContable || diaISO(0), comprobante: 100 + D.seq.ajuste };
        p.estado = 5;
        bit(D, p, usr, 'AJUSTE', null, `Ajuste ${p.ajuste.documento} aplicado: ${v.cabecera.movimientos} movimiento(s) en el kardex de SIMON; asiento temporal #${p.ajuste.comprobante} en la bandeja del contador.`);
        return cambio(ok(`Ajuste ${p.ajuste.documento} aplicado (demo: no se escribió en ningún SIMON).`));
      }
    }
    if (seg[0] === 'correcciones' && seg[1]) {
      const x = exigir('SUPERVISOR'); if (x) return x;
      for (const pp of D.programas) {
        const e = pp.eventos.find(z => z.idEvento === seg[1]);
        if (!e) continue;
        if (e.codUsuario === usr) return res(falla('Usted grabó esta corrección: la aprueba o rechaza otro supervisor.'));
        if (e.aprobacion !== 'PENDIENTE') return res(falla('La corrección no existe o ya fue resuelta.'));
        if (body.aprobar && !body.coe) return res(falla('COE incorrecta.'));
        e.aprobacion = body.aprobar ? 'COE' : 'RECHAZADA'; e.supervisor = usr;
        return cambio(ok(body.aprobar ? 'Corrección aprobada.' : 'Corrección rechazada.'));
      }
      return res(falla('La corrección no existe o ya fue resuelta.'));
    }

    // ---- handheld
    if (ruta === 'handheld/programas') {
      return json(D.programas.filter(p => p.estado === 1 && p.faseActual && STF(p, p.faseActual) >= 2).map(p => {
        const f = p.faseActual, cons = consF1(D, p), mias = p.lineas.filter(l => l.fases[f]).concat(revisarDe(p, f)).filter(l => cons || cuentaEn(p, l, f, usr));
        return (cons ? esOperadorDe(p, usr) : mias.length) ? { numeroPrograma: p.numeroPrograma, stPrograma: p.stPrograma, almacen: p.almacen, pasillo: p.pasillo, faseActual: f, modalidad: p.modalidad, modoVigente: p.modoUbicaciones || modoUbicCfg(D), statusFase: STF(p, f),
          conteoAbierto: STF(p, f) === 3, fijado: p.asignaciones.some(a => a.fase === f && a.codUsuario === usr && a.programaFijado), pendientes: mias.filter(l => !grabadaPor(p, l, f, usr)).length } : null;
      }).filter(Boolean));
    }
    if (seg[0] === 'handheld' && seg[3] === 'paquete') {
      const pp = prog(D, seg[2]), f = pp.faseActual;
      const mias = pp.lineas.filter(l => l.fases[f]).concat(revisarDe(pp, f)).filter(l => consF1(D, pp) || cuentaEn(pp, l, f, usr));   // F-026: en la F1 de Construcción, todas · P-053: con las A REVISAR
      return json({
        lineas: mias.map(l => ({ idCuaderno: l.id, idProducto: l.idProducto, codigo: l.codigo, tCean: l.tCean, descrip: l.descrip, unidadStock: l.unidadStock, idUbicacion: l.idUbicacion,
          ubicacion: l.ubicacion, pasillo: l.pasillo, rack: l.rack, nivel: l.nivel, lote: l.lote, fechaVencLote: l.fechaVencLote, manejaLote: l.manejaLote, contado: contadoPor(pp, l, f, usr), grabado: grabadaPor(pp, l, f, usr), revisarHallazgo: !!l.revisar, compartida: esCompartida(pp, l, f) })),
        ubicacionesTeoricas: pp.lineas.map(l => ({ idCuaderno: l.id, idProducto: l.idProducto, codigo: l.codigo, lote: l.lote, ubicacion: l.ubicacion })),
        catalogo: D.catalogo.filter(x => x.status === 1).map(x => ({ idProducto: x.idProducto, codigo: x.codigo, tCean: x.tCean, nombre: x.nombre, unidadStock: x.unidadStock, manejaLote: x.manejaLote })),
        factores: [],
        ubicacionesAlmacen: D.ubicaciones.filter(u => u.tipoUbicacion !== 3 && u.estatusUbicacion !== 2).map(u => ubicStr(D, u)),   // F-029: para separar los avisos
        hallazgos: pp.eventos.filter(e => e.hallazgo && !e.revisar && e.codUsuario === usr && e.fase === f && !e.rechazo).map(e => { const pr = prodDe(D, e.idProducto) || {};
          return { idCuaderno: 0, idProducto: e.idProducto, codigo: pr.codigo, descrip: pr.nombre, unidadStock: pr.unidadStock, lote: e.lote, ubicacionHallazgo: e.ubicacionHallazgo, ubicacionTeorica: e.ubicacionTeorica, ambito: e.ambito, cantidad: e.cantidad, fechaEquipo: e.fechaEquipo }; })
      });
    }
    if (seg[0] === 'handheld' && seg[3] === 'capturas') {
      const pp = prog(D, seg[2]);
      if (!tieneRol(D, usr, 'OPERADOR', 'SUPERVISOR')) return res(falla('No tiene el rol de operador del módulo.'));
      const c = { nuevo: 0, dup: 0, tardio: 0, rej: 0 }, det = [];
      (body.eventos || []).forEach(ev => { const r = registrarEvento(D, pp, usr, ev); c[r]++; if (r === 'rej') det.push({ idEvento: ev.idEvento, motivoRechazo: pp.eventos.find(e => e.idEvento === ev.idEvento).rechazo }); });
      guardar();
      const r = { ok: true, mensaje: `${c.nuevo} captura(s) guardada(s)` + (c.dup ? `, ${c.dup} ya recibida(s)` : '') + (c.tardio ? `, ${c.tardio} tardía(s) (fase cerrada)` : '') + (c.rej ? `, ${c.rej} rechazada(s)` : '') + '.',
        recibidos: (body.eventos || []).length, nuevos: c.nuevo, duplicados: c.dup, tardios: c.tardio, rechazados: c.rej, rechazadosDetalle: det };
      return json(r);
    }
    if (seg[0] === 'handheld' && seg[3] === 'senal') return json(ok('Señal recibida.'));

    // ---- indicadores
    if (seg[0] === 'indicadores') {
      if (seg[1] === 'mios') { const { res: R, jornadas } = indicadores(D, { operador: usr }); return json({ resumen: R.find(x => x.codUsuario === usr) || null, jornadas }); }
      if (!tieneRol(D, usr, 'GERENTE', 'SUPERVISOR', 'CONFIGURACION')) return res(falla('Los indicadores de operadores los ven el gerente y el supervisor.'));
      if (seg[1] === 'jornadas') return json(indicadores(D, { numero: q.get('numero'), operador: q.get('operador') }).jornadas);
      if (seg[1] === 'historico') return json(D.fotos);
      return json(indicadores(D, { numero: q.get('numero') }).res);
    }
    return json({ message: `Mockup: la ruta ${metodo} ${ruta} no está simulada.` }, 404);
  }

  /* ================================================================== la interfaz (window.mciDemo) */
  cargarEstado();
  const CLAVE_SESION = 'mci.demo.sesion';
  const empresaDeClave = clave => empresaPorId(clave);
  function sesion() {
    try { const v = JSON.parse(sessionStorage.getItem(CLAVE_SESION)); if (v && empresaDeClave(v.clave)) return v; } catch { }
    return { clave: -1, cedula: USUARIOS.MCI_SUP.ced };
  }
  function entrar(clave, cedula) {
    const v = { clave: Number(clave), cedula: String(cedula) };
    if (!empresaDeClave(v.clave)) v.clave = -1;
    try { sessionStorage.setItem(CLAVE_SESION, JSON.stringify(v)); } catch { }
    return sesion();
  }
  /** Los usuarios de la demostración con sus roles en la empresa de la sesión (para el selector de la página). */
  function usuarios() {
    const e = empresaDeClave(sesion().clave), D = e ? ESTADO[e[0]] : null;
    return Object.entries(USUARIOS).map(([u, x]) => ({ usuario: u, cedula: x.ced, nombre: x.nombre,
      roles: D ? D.roles.filter(r => r.codUsuario === x.ced).map(r => r.rol) : [] }));
  }
  function empresas() { return Object.entries(EMPRESAS).map(([cod, e]) => ({ clave: e.id, codigo: cod, modo: e.modo, almacen: e.nombreAlmacen })); }
  function reiniciar() {
    try { sessionStorage.removeItem(CLAVE_ESTADO); } catch { }
    ESTADO = null; cargarEstado();
  }

  // "api/ConteoInventario/-1/programas/3/cuadernos?fase=2" -> la empresa, la ruta del módulo y la consulta
  function partir(ruta) {
    const m = String(ruta || '').match(/^\/?api\/ConteoInventario\/(-\d+)\/([^?]*)(?:\?(.*))?$/);
    return m ? { clave: Number(m[1]), ruta: decodeURIComponent(m[2]), q: new URLSearchParams(m[3] || '') } : null;
  }
  const demora = () => new Promise(r => setTimeout(r, 80));   // un poco de demora, como un API real

  async function atender(metodo, ruta, cuerpoJson) {
    const r = partir(ruta);
    if (!r) return json({ message: 'Demostración: la dirección no es del módulo de conteo.' }, 404);
    const s = sesion();
    if (r.clave !== s.clave) return { status: 403, cuerpo: '' };   // como el API: la empresa no es la de la sesión
    let body = null; try { body = cuerpoJson ? JSON.parse(cuerpoJson) : null; } catch { }
    await demora();
    try { return await api(String(metodo).toUpperCase(), r.ruta, r.q, body || {}, { EmpresaId: r.clave, Usuario: s.cedula }); }
    catch (err) { console.error(err); return json({ message: 'Demostración: error interno del motor (' + err.message + ').' }, 500); }
  }

  /* ---- cargas de Excel, como MciCargaExcel del API: encabezados reconocidos por su texto, sin escribir nada.
     La librería de Excel (recursos/xlsx.full.min.js) la carga la página de la demostración. */
  const COLS = {
    productos: [['Código del producto', 'codigo', true], ['Descripción del producto', 'descripcion', true], ['Unidad de inventario', 'unidad', true], ['Código de barras', 'codigoBarras', false],
      ['Costo unitario en divisa', 'costoUnitario', true], ['Maneja lote', 'manejaLote', false], ['Valorar aprobación por', 'valorarPor', false], ['Medición de diferencia', 'medicion', false],
      ['Tipo de límite', 'tipoLimite', false], ['Límite faltante', 'limiteFaltante', false], ['Límite sobrante', 'limiteSobrante', false]],
    existencias: [['Almacén', 'almacen', true], ['Pasillo', 'pasillo', false], ['Rack', 'rack', false], ['Nivel', 'nivel', false], ['Código del producto', 'codigo', true],
      ['Cantidad física', 'cantidad', true], ['Lote', 'lote', false], ['Fecha de vencimiento', 'fechaVencLote', false], ['Costo unitario del lote', 'costoLote', false]],
    ubicaciones: [['Almacén', 'almacen', true], ['Pasillo', 'pasillo', true], ['Rack', 'rack', true], ['Nivel', 'nivel', true], ['Almacena lotes', 'almacenaLotes', false]]
  };
  const EJEMPLO = {
    productos: ['DEMO-101', 'TORNILLO AUTORROSCANTE 1/4 X 1', 'UND', '7591234567890', '0.12', 'No', 'Unidades', 'Cantidad', 'ENTRE', '2', '2'],
    existencias: ['ALM-CENTRAL', 'P01', 'R01', 'N01', 'DEMO-101', '25', '', '', ''],
    ubicaciones: ['ALM-CENTRAL', 'P06', 'R01', 'N01', 'No']
  };
  const norm = t => String(t ?? '').replace(/\u00a0/g, ' ').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  const letra = i => { let t = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) t = String.fromCharCode(65 + (i - 1) % 26) + t; return t; };
  const valor = v => {
    if (v == null) return null;
    if (v instanceof Date) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    const t = String(v).replace(/\u00a0/g, ' ').trim(); return t === '' ? null : t;
  };
  const tipoDeRuta = ruta => { const r = partir(ruta); const m = r && r.ruta.match(/^carga\/([a-z]+)\//); return m ? m[1] : null; };
  // la librería de Excel se carga recién cuando se usa (880 KB): un script clásico, porque define el global XLSX
  let cargaXlsx = null;
  function xlsx() {
    if (window.XLSX) return Promise.resolve(true);
    return cargaXlsx ??= new Promise(ok => {
      const sc = document.createElement('script');
      sc.src = 'lib/xlsx/xlsx.full.min.js';
      sc.onload = () => ok(!!window.XLSX);
      sc.onerror = () => { cargaXlsx = null; ok(false); };
      document.head.appendChild(sc);
    });
  }
  function modoDe(clave) { const e = empresaDeClave(clave); return e ? e[1].modo : null; }

  async function leerExcel(ruta, base64, nombre) {
    const r = partir(ruta), tipo = tipoDeRuta(ruta), cols = COLS[tipo];
    if (!r || r.clave !== sesion().clave) return { status: 403, cuerpo: '' };
    if (!cols) return json({ message: 'El tipo de carga es productos, existencias o ubicaciones.' }, 400);
    if (tipo !== 'ubicaciones' && modoDe(r.clave) !== 'STAND_ALONE') return json({ message: 'La carga desde Excel solo existe con el módulo en STAND ALONE.' }, 400);
    if (!(await xlsx())) return json({ message: 'Demostración: no se pudo cargar la librería de Excel.' }, 500);
    await demora();
    let aoa;
    try {
      const wb = XLSX.read(base64, { type: 'base64', cellDates: true });
      aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: true });
    } catch { return json({ message: 'No se pudo leer el archivo: no es un Excel (.xlsx, .xls) ni un .csv válido.' }, 400); }
    if (!aoa.length) return json({ message: 'El archivo está vacío.' }, 400);
    const enc = (aoa[0] || []).map(norm), idx = cols.map(c => enc.indexOf(norm(c[0])));
    const res = { archivo: nombre, tipo: tipo.toUpperCase(), filasConDatos: 0, columnas: cols.map((c, i) => ({ titulo: c[0], campo: c[1], obligatoria: c[2], letra: idx[i] >= 0 ? letra(idx[i]) : null })),
      productos: [], existencias: [], ubicaciones: [] };
    for (let f = 1; f < aoa.length; f++) {
      const fila = aoa[f] || [], o = { fila: f + 1 }; let vacia = true;
      cols.forEach((c, i) => { const v = idx[i] >= 0 ? valor(fila[idx[i]]) : null; o[c[1]] = v; if (v != null) vacia = false; });
      if (!vacia) res[tipo].push(o);
    }
    res.filasConDatos = res[tipo].length;
    return json(res);
  }

  async function descargar(ruta) {
    const r = partir(ruta);
    if (!r || r.clave !== sesion().clave) return { ok: false, mensaje: 'Sin acceso a esta empresa.' };
    const m = r.ruta.match(/^carga\/([a-z]+)\/plantilla$/);
    if (m && COLS[m[1]]) {
      if (m[1] !== 'ubicaciones' && modoDe(r.clave) !== 'STAND_ALONE') return { ok: false, mensaje: 'La carga desde Excel solo existe con el módulo en STAND ALONE.' };
      if (!(await xlsx())) return { ok: false, mensaje: 'Demostración: no se pudo cargar la librería de Excel.' };
      const hoja = XLSX.utils.aoa_to_sheet([COLS[m[1]].map(c => c[0]), EJEMPLO[m[1]]]);
      hoja['!cols'] = COLS[m[1]].map(c => ({ wch: Math.max(14, c[0].length + 2) }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, hoja, 'Carga');
      const nombre = { productos: 'MCI_Plantilla_Productos.xlsx', existencias: 'MCI_Plantilla_Existencias.xlsx', ubicaciones: 'MCI_Plantilla_Ubicaciones.xlsx' }[m[1]];
      return { ok: true, base64: XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }), nombre };
    }
    // los reportes en Excel (acta, avance, indicadores, tolerancias) los arma el servidor con su formato
    return { ok: false, mensaje: 'En la demostración no se generan los reportes en Excel: en el módulo real este botón descarga el archivo que arma el servidor.' };
  }

  window.mciDemo = { atender, leerExcel, descargar, entrar, sesion, usuarios, empresas, reiniciar };
})();
