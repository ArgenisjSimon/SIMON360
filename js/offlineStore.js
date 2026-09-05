// offlineStore.js — capa de datos offline de SIMON WEB 360
//
// Reemplaza a offlineDb.js, offlineDbv2.js y offlineDbMulti.js. Las tres se
// borraron; si aparece una referencia a window.offlineDb / offlineDbV3, es
// codigo viejo que quedo suelto.
//
// QUE CAMBIA respecto de la anterior, y por que:
//
//  1. UNA BASE POR SESION.  El nombre lleva empresa y cedula:
//     SIMON360_{empresa}_{cedula}. Antes habia una sola base para todos, asi
//     que el mismo vendedor entrando a Chepelca 15 y a la 16 mezclaba los
//     clientes de las dos. Con el nombre separado eso deja de ser posible, y
//     de paso el borrado por cambio de usuario ya no hace falta.
//
//  2. LA VERSION SUBE SOLA CUANDO CAMBIA EL REGISTRO.  Antes DB_VERSION estaba
//     fija en 1 y los stores solo nacian en onupgradeneeded, asi que agregar
//     una entidad NO la creaba en un navegador donde la base ya existia: el
//     store faltaba para siempre y cada uso tiraba NotFoundError. Ahora se mira
//     que stores hay y, si el conjunto cambio, se reabre con version + 1.
//
//  3. LA COLA NO SE BORRA NUNCA DESDE ACA.  limpiarCache() se lleva los stores
//     de consulta y deja pendientes/ intacto. No existe un "borrar todo": el
//     unico camino que destruye la cola es borrarCompleta(), que existe para
//     el desarrollo y no la llama ningun flujo de login ni de logout.
//
//  4. LOS ERRORES SE PROPAGAN.  La anterior resolvia init() aunque el upgrade
//     hubiera fallado. Acá cada operación rechaza con el error real, para que
//     el C# pueda decidir; tragarse un fallo de IndexedDB fue parte de por que
//     nadie se enteraba de que el offline no andaba.

window.offlineStore = (function () {

    const STORE_PENDIENTES = 'pendientes';
    const STORE_META = 'meta';

    // Los archivos capturados sin señal: fotos y PDF que todavia no llegaron al
    // servidor. Van SEPARADOS de la cola de documentos a proposito.
    //
    // Un adjunto no sigue la misma vida que su documento. El informe puede
    // sincronizar bien y sus fotos fallar despues, y en ese momento el
    // documento YA existe: reintentar el pendiente entero crearia un segundo
    // informe. Por eso el adjunto se reintenta solo, contra el Id que ya tiene.
    //
    // Es el agujero por el que un IIT capturado en el campo llegaba sin sus
    // fotos: el formulario subia los archivos con una llamada directa a la API,
    // que sin señal simplemente no hacia nada.
    const STORE_ADJUNTOS = 'adjuntos';

    // La clave del store es INFRAESTRUCTURA y va en su propio campo, no en el
    // 'id' de la entidad.
    //
    // Se probo con keyPath 'id' y esta mal: la clave real de varias entidades
    // es un string —ActMae usa COD_ACTIVIDAD— y al leer de vuelta, ese string
    // no entra en el `int Id` del DTO:
    //   "The JSON value could not be converted to System.Int32. Path: $[0].id"
    // El formulario se caia justo cuando mas se lo necesita: sin señal.
    //
    // Con un campo aparte, la clave puede ser lo que haga falta —numero, codigo
    // o posicion— sin tocar los datos de la entidad.
    const CLAVE = '_key';

    // Stores internos: existen siempre, en cualquier sesion, sin importar que
    // entidades tenga habilitadas la empresa.
    //
    // 'adjuntos' esta aca y no entre las entidades por la misma razon que
    // 'pendientes': limpiarCache() NO toca los internos, y un archivo que el
    // usuario saco en el campo es trabajo suyo, no cache. Borrarlo al entrar o
    // al salir seria destruirlo.
    const STORES_INTERNOS = [STORE_PENDIENTES, STORE_META, STORE_ADJUNTOS];

    let db = null;
    let nombreDb = null;

    // Entre pestañas: una que va a borrar o migrar necesita que las demas
    // suelten la conexion, o el upgrade queda bloqueado para siempre.
    const canal = new BroadcastChannel('simon-offline');
    canal.onmessage = (e) => {
        if (e.data === 'cerrar' && db) {
            db.close();
            db = null;
        }
    };

    // ── Apertura y migracion ────────────────────────────────────────────
    //
    // La version NO se deriva de un hash del registro. Se probo asi y esta mal:
    // el hash no es monotono, y quitar o cambiar entidades podia dar un numero
    // MENOR que el de la base existente. IndexedDB solo acepta versiones que
    // suban, asi que eso reventaba con VersionError y dejaba la sesion sin
    // almacen.
    //
    // El mecanismo correcto es en dos pasos: se abre SIN version para ver que
    // stores tiene la base, y solo si falta alguno se reabre con version + 1.
    // Sigue cumpliendo lo que hacia falta —agregar una entidad crea su store
    // solo, que es lo que la version fija en 1 hacia imposible— y ademas nunca
    // puede retroceder.

    function abrirSinVersion(nombre) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(nombre);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Abre (y migra si hace falta) la base de la sesion.
     * @param {string} empresa  Clave de la empresa
     * @param {string} cedula   Cedula del usuario
     * @param {string[]} stores Nombres de store del registro de esa empresa
     */
    async function abrir(empresa, cedula, stores) {
        const nombre = `SIMON360_${empresa}_${cedula}`;
        const todos = [...new Set([...stores, ...STORES_INTERNOS])];

        // Nunca dejar la base sin stores de datos. Si el registro llega vacio
        // —config a medio cargar, empresa sin resolver— la respuesta correcta
        // es no tocar nada, no borrar lo que el usuario tiene bajado.
        const pedidosDeDatos = todos.filter(s => !STORES_INTERNOS.includes(s));
        if (pedidosDeDatos.length === 0) {
            throw new Error('El registro offline llego vacio: no se abre la base.');
        }

        const mismoConjunto = (a, b) =>
            a.length === b.length && a.every(x => b.includes(x));

        // ¿Ya esta abierta esta misma base con EXACTAMENTE esta forma?
        // La comparacion tiene que ser exacta y no "estan los que pido": con un
        // `every` alcanzaba para entrar, pero entonces quitar una entidad no
        // disparaba migracion nunca y su store quedaba huerfano para siempre.
        if (db && nombreDb === nombre && mismoConjunto(Array.from(db.objectStoreNames), todos)) {
            return;
        }

        if (db) { db.close(); db = null; }
        canal.postMessage('cerrar');

        // Paso 1: mirar como esta hoy.
        const actual = await abrirSinVersion(nombre);
        const existentes = Array.from(actual.objectStoreNames);
        const faltan = todos.filter(s => !existentes.includes(s));
        const sobran = existentes.filter(s => !todos.includes(s));

        // Stores creados con el keyPath viejo ('id'). Se recrean: son cache, se
        // vuelven a bajar. Sin esto, una base que ya existia seguiria rechazando
        // cada `put` para siempre y no habria forma de enterarse desde la app.
        const keyPathViejo = [];
        if (existentes.length > 0) {
            const tx = actual.transaction(existentes, 'readonly');
            for (const s of existentes) {
                if (STORES_INTERNOS.includes(s)) continue;
                if (tx.objectStore(s).keyPath !== CLAVE) keyPathViejo.push(s);
            }
        }

        if (faltan.length === 0 && sobran.length === 0 && keyPathViejo.length === 0) {
            db = actual;
            nombreDb = nombre;
            db.onversionchange = () => { db.close(); db = null; };
            return;
        }

        // Paso 2: hay que migrar. La version SIEMPRE sube.
        const version = actual.version + 1;
        actual.close();

        db = await new Promise((resolve, reject) => {
            const req = indexedDB.open(nombre, version);

            req.onupgradeneeded = (e) => {
                const base = e.target.result;

                for (const s of todos) {
                    if (base.objectStoreNames.contains(s)) continue;

                    // Los stores internos son de forma propia y controlada —el
                    // pendiente lleva su GUID en 'id'— asi que conservan ese
                    // keyPath. El campo _key es para las ENTIDADES, donde 'id'
                    // pertenece al DTO y no puede usarse como clave.
                    if (STORES_INTERNOS.includes(s)) {
                        base.createObjectStore(s, { keyPath: 'id' });
                        continue;
                    }

                    const store = base.createObjectStore(s, { keyPath: CLAVE });
                    // actualizadoEn: para saber que tan viejo es lo bajado.
                    store.createIndex('actualizadoEn', 'actualizadoEn', { unique: false });
                }

                // Un store que ya no esta en el registro se elimina: si la
                // empresa dejo de tener esa entidad, sus datos no tienen por
                // que seguir ocupando lugar ni apareciendo en la pantalla de
                // sincronizacion. Los internos nunca se tocan.
                for (const s of Array.from(base.objectStoreNames)) {
                    if (!todos.includes(s)) base.deleteObjectStore(s);
                }

                // Los que tenian el keyPath viejo: borrar y crear de nuevo.
                for (const s of keyPathViejo) {
                    if (base.objectStoreNames.contains(s)) base.deleteObjectStore(s);
                    const store = base.createObjectStore(s, { keyPath: CLAVE });
                    store.createIndex('actualizadoEn', 'actualizadoEn', { unique: false });
                }
            };

            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error(
                'Hay otra pestaña de SIMON abierta con una version anterior. ' +
                'Cerrala y volve a entrar.'));
        });

        nombreDb = nombre;

        // Otra pestaña puede pedir un upgrade despues: si no soltamos, la
        // bloqueamos a ella.
        db.onversionchange = () => { db.close(); db = null; };
    }

    function exigirDb() {
        if (!db) throw new Error('La base offline no esta abierta');
        return db;
    }

    function tienda(store, modo = 'readonly') {
        const base = exigirDb();
        if (!base.objectStoreNames.contains(store)) {
            throw new Error(`El store '${store}' no existe en esta sesion. ` +
                'Revisá que la entidad esté habilitada para la empresa.');
        }
        return base.transaction(store, modo).objectStore(store);
    }

    function promesa(req) {
        return new Promise((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
    }

    // ── Entidades ───────────────────────────────────────────────────────

    async function guardar(store, item) {
        return promesa(tienda(store, 'readwrite').put(item));
    }

    async function guardarMuchos(store, items) {
        const base = exigirDb();
        if (!base.objectStoreNames.contains(store)) {
            throw new Error(`El store '${store}' no existe en esta sesion.`);
        }
        return new Promise((res, rej) => {
            const tx = base.transaction(store, 'readwrite');
            const st = tx.objectStore(store);
            for (const i of items) st.put(i);
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
            tx.onabort = () => rej(tx.error);
        });
    }

    async function traerTodos(store) {
        return promesa(tienda(store).getAll());
    }

    async function traerPorId(store, id) {
        const r = await promesa(tienda(store).get(id));
        return r ?? null;
    }

    async function contar(store) {
        return promesa(tienda(store).count());
    }

    async function borrar(store, id) {
        return promesa(tienda(store, 'readwrite').delete(id));
    }

    async function vaciar(store) {
        return promesa(tienda(store, 'readwrite').clear());
    }

    // ── Cola de pendientes ──────────────────────────────────────────────
    // Todo lo capturado sin señal vive aca hasta que el servidor confirma.
    // NUNCA se borra por login, por logout ni por cambio de empresa.

    async function encolar(pendiente) {
        return promesa(tienda(STORE_PENDIENTES, 'readwrite').put(pendiente));
    }

    async function pendientes() {
        return promesa(tienda(STORE_PENDIENTES).getAll());
    }

    async function contarPendientes() {
        return promesa(tienda(STORE_PENDIENTES).count());
    }

    async function desencolar(id) {
        return promesa(tienda(STORE_PENDIENTES, 'readwrite').delete(id));
    }

    // ── Adjuntos capturados sin señal ───────────────────────────────────
    //
    // Cada fila es UN archivo. El campo 'token' agrupa los que se subieron
    // juntos y es el mismo que viaja en el documento, asi que es el hilo que
    // une la foto con su informe.
    //
    // 'contenido' en null significa "el archivo YA esta en el temporal del
    // servidor, solo falta asignarlo al documento". Pasa cuando la subida salio
    // bien pero la señal se corto antes de guardar el informe: los bytes no hay
    // que volver a mandarlos, seria subir dos veces la misma foto.

    async function guardarAdjunto(adjunto) {
        return promesa(tienda(STORE_ADJUNTOS, 'readwrite').put(adjunto));
    }

    async function adjuntos() {
        return promesa(tienda(STORE_ADJUNTOS).getAll());
    }

    async function contarAdjuntos() {
        return promesa(tienda(STORE_ADJUNTOS).count());
    }

    async function borrarAdjunto(id) {
        return promesa(tienda(STORE_ADJUNTOS, 'readwrite').delete(id));
    }

    /**
     * Marca a que documento pertenecen los archivos de estos tokens.
     *
     * Se llama DESPUES de guardar el documento, porque recien ahi hay un Id que
     * darles — y puede ser negativo, si el documento tampoco llego al servidor.
     * Ese caso no es un problema: cuando el documento sincroniza, el Id se
     * corrige con vincularAdjuntos otra vez.
     */
    async function vincularAdjuntos(tokens, entidad, idDocumento) {
        const base = exigirDb();
        const buscados = new Set(tokens || []);
        if (buscados.size === 0) return 0;

        return new Promise((res, rej) => {
            const tx = base.transaction(STORE_ADJUNTOS, 'readwrite');
            const st = tx.objectStore(STORE_ADJUNTOS);
            let tocados = 0;

            st.openCursor().onsuccess = (e) => {
                const cur = e.target.result;
                if (!cur) return;

                const a = cur.value;
                if (buscados.has(a.token)) {
                    a.entidad = entidad;
                    a.idDocumento = idDocumento;
                    cur.update(a);
                    tocados++;
                }
                cur.continue();
            };

            tx.oncomplete = () => res(tocados);
            tx.onerror = () => rej(tx.error);
            tx.onabort = () => rej(tx.error);
        });
    }

    // ── Meta (ultima sincronizacion, contadores locales) ────────────────

    async function guardarMeta(clave, valor) {
        return promesa(tienda(STORE_META, 'readwrite').put({ id: clave, valor }));
    }

    async function traerMeta(clave) {
        const r = await promesa(tienda(STORE_META).get(clave));
        return r ? r.valor : null;
    }

    /**
     * El siguiente Id local NEGATIVO, leido e incrementado EN UNA SOLA
     * TRANSACCION. Nunca devuelve null: si el contador no existe, arranca.
     *
     * ══ POR QUE ESTO VIVE EN JS Y NO EN C# ══
     *
     * Antes el C# hacia traerMeta -> calcular -> guardarMeta, y eso tenia DOS
     * problemas:
     *
     *  1. LA PRIMERA VEZ SIEMPRE FALLABA. traerMeta devuelve null cuando la
     *     clave no existe —que es exactamente la primera captura sin señal de
     *     cada entidad— y el interop de Blazor no puede deserializar ese null
     *     en un tipo por valor:
     *
     *         "Null object cannot be converted to a value type"
     *
     *     La excepcion salia desde adentro del catch de red de OfflineService,
     *     asi que el formulario mostraba un error generico y el documento no
     *     quedaba en ningun lado. Y como el contador nunca llegaba a
     *     escribirse, el intento siguiente fallaba igual: no se destrababa
     *     solo. NINGUNA escritura offline habia funcionado nunca por esto.
     *
     *  2. ERA UNA CARRERA. Leer y escribir en dos viajes distintos permite que
     *     dos capturas simultaneas reciban el MISMO id negativo y se pisen en
     *     el store. Es el mismo problema que el MAX(NumPedido)+1 del API, y se
     *     resuelve igual: leer e incrementar en un solo paso.
     */
    async function siguienteIdLocal(clave) {
        const base = exigirDb();

        return new Promise((res, rej) => {
            const tx = base.transaction(STORE_META, 'readwrite');
            const st = tx.objectStore(STORE_META);
            let siguiente;

            st.get(clave).onsuccess = (e) => {
                const actual = e.target.result;
                const ultimo = (actual && typeof actual.valor === 'number') ? actual.valor : 0;
                siguiente = ultimo - 1;          // 0 → -1 → -2 …
                st.put({ id: clave, valor: siguiente });
            };

            tx.oncomplete = () => res(siguiente);
            tx.onerror = () => rej(tx.error);
            tx.onabort = () => rej(tx.error);
        });
    }

    // ── Rango reservado (el numero de pedido sin señal) ──────────────

    /**
     * Guarda el bloque que el servidor le aparto a este vendedor.
     *
     * El bloque vive en 'meta' y NO en un store de entidad, a proposito:
     * limpiarCache() no toca los internos, asi que entrar y salir de la sesion
     * no le tira al vendedor los numeros que se llevo al campo. Perder el
     * bloque no perderia datos, pero lo dejaria sin poder dar numero.
     */
    async function guardarRango(clave, idRango, desde, hasta) {
        return promesa(tienda(STORE_META, 'readwrite').put({
            id: clave,
            valor: { idRango, desde, hasta, proximo: desde }
        }));
    }

    /**
     * El siguiente numero del bloque, leido e incrementado EN UNA SOLA
     * TRANSACCION, por lo mismo que siguienteIdLocal: en dos viajes, dos
     * capturas simultaneas se llevan el MISMO numero de pedido y el segundo
     * pisa al primero al sincronizar.
     *
     * Devuelve 0 cuando no hay bloque o cuando se agoto. NUNCA null: el interop
     * de Blazor no puede deserializar null en un int, y ese fue exactamente el
     * defecto que tuvo la cola muerta durante semanas.
     *
     * El 0 no es un error: es la red de seguridad de §4.C.1. El pedido se
     * guarda igual, sin numero, y el servidor se lo pone al sincronizar. Que se
     * acabe el bloque no puede costarle el pedido al vendedor.
     */
    async function tomarDelRango(clave) {
        const base = exigirDb();

        return new Promise((res, rej) => {
            const tx = base.transaction(STORE_META, 'readwrite');
            const st = tx.objectStore(STORE_META);
            let entregado = 0;

            st.get(clave).onsuccess = (e) => {
                const fila = e.target.result;
                const r = fila && fila.valor;

                if (!r || typeof r.proximo !== 'number' || r.proximo > r.hasta) return;

                entregado = r.proximo;
                st.put({ id: clave, valor: { ...r, proximo: r.proximo + 1 } });
            };

            tx.oncomplete = () => res(entregado);
            tx.onerror = () => rej(tx.error);
            tx.onabort = () => rej(tx.error);
        });
    }

    /**
     * Como viene el bloque: cuantos quedan y desde donde.
     *
     * Lo mira la pantalla de sincronizacion para pedir uno nuevo antes de que
     * se agote — sin señal no se puede pedir mas, asi que esperar a que se
     * acabe es tarde.
     *
     * Devuelve siempre un objeto, nunca null, por la misma razon de arriba.
     */
    async function estadoRango(clave) {
        const fila = await promesa(tienda(STORE_META).get(clave));
        const r = fila && fila.valor;

        if (!r || typeof r.proximo !== 'number')
            return { tiene: false, idRango: 0, desde: 0, hasta: 0, proximo: 0, disponibles: 0, usados: 0 };

        return {
            tiene: true,
            idRango: r.idRango || 0,
            desde: r.desde,
            hasta: r.hasta,
            proximo: r.proximo,
            disponibles: Math.max(0, r.hasta - r.proximo + 1),
            usados: r.proximo - r.desde
        };
    }

    // ── Limpieza ────────────────────────────────────────────────────────

    /**
     * Borra los stores de CONSULTA y deja la cola intacta.
     * Es lo que llaman login y logout. La cola es trabajo del usuario que
     * todavia no llego al servidor: limpiarla seria destruirla, no limpiarla.
     */
    async function limpiarCache() {
        const base = exigirDb();
        const aVaciar = Array.from(base.objectStoreNames)
            .filter(s => !STORES_INTERNOS.includes(s));

        if (aVaciar.length === 0) return;

        return new Promise((res, rej) => {
            const tx = base.transaction(aVaciar, 'readwrite');
            for (const s of aVaciar) tx.objectStore(s).clear();
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
    }

    /**
     * Borra la base entera, cola incluida. NO la llama ningun flujo normal:
     * existe para desarrollo y para el boton explicito de "empezar de cero"
     * de la pantalla de sincronizacion, que avisa cuantos pendientes se
     * pierden antes de ejecutarse.
     */
    async function borrarCompleta(nombre) {
        const objetivo = nombre || nombreDb;
        if (!objetivo) return;

        if (db && nombreDb === objetivo) { db.close(); db = null; nombreDb = null; }
        canal.postMessage('cerrar');

        return new Promise((res, rej) => {
            const req = indexedDB.deleteDatabase(objetivo);
            let listo = false;
            const tope = setTimeout(() => {
                if (listo) return;
                listo = true;
                rej(new Error('No se pudo borrar la base: hay otras pestañas abiertas.'));
            }, 5000);

            const fin = (fn, arg) => {
                clearTimeout(tope);
                if (listo) return;
                listo = true;
                fn(arg);
            };

            req.onsuccess = () => fin(res);
            req.onerror = () => fin(rej, req.error);
        });
    }

    /** Bases de sesiones anteriores, para purgar las que no tengan pendientes. */
    async function listarBases() {
        if (!indexedDB.databases) return [];
        const todas = await indexedDB.databases();
        return todas.map(d => d.name).filter(n => n && n.startsWith('SIMON360_'));
    }

    /** Diagnostico: que stores tiene abierta la sesion actual. */
    function estado() {
        return {
            nombre: nombreDb,
            version: db ? db.version : 0,
            stores: db ? Array.from(db.objectStoreNames) : []
        };
    }

    return {
        abrir,
        guardar, guardarMuchos, traerTodos, traerPorId, contar, borrar, vaciar,
        encolar, pendientes, contarPendientes, desencolar,
        guardarAdjunto, adjuntos, contarAdjuntos, borrarAdjunto, vincularAdjuntos,
        guardarMeta, traerMeta, siguienteIdLocal,
        guardarRango, tomarDelRango, estadoRango,
        limpiarCache, borrarCompleta, listarBases, estado
    };
})();
