// mciCola.js — el handheld del MÓDULO DE CONTEO DE INVENTARIO (MCI)
//
// Se carga como módulo desde MciColaLocal (import dinámico): no está en
// index.html y no comparte nada con offlineStore.js.
//
// POR QUÉ UNA BASE APARTE Y NO LA COLA OFFLINE DE SIMON 360 (Claudio, 05OCT2026)
//   La cola de SIMON es de DOCUMENTOS (crear/editar/anular con Id negativo,
//   cuarentena tras 5 rechazos). El conteo manda EVENTOS sueltos: cada uno con
//   su GUID, el API descarta los repetidos y acepta un lote a medias diciendo
//   cuáles rechazó; un rechazo ("la fase ya se cerró") no es algo que revise
//   una persona. Meterlos en la cola de SIMON obligaba a cambiar sus reglas,
//   que usan Pedidos, Cobranza, Almacén e Informes. Por eso:
//
//     MCI_{empresa}_{cedula}
//       cola       una fila por captura, clave = idEvento
//       paquetes   el último paquete descargado por programa, clave = num
//
//   Una base por empresa y usuario: lo de una empresa nunca se mezcla con otra.
//
// FOCO PERMANENTE (Claudio, 05OCT2026)
//   El lector de barras escribe donde está el foco. Los botones del conteo no
//   se lo quitan, y cualquier otra interacción que no sea escribir en un campo
//   lo devuelve a la búsqueda. Con una ventana abierta, no se toca.

const VERSION = 1;
let db = null;
let nombreDb = null;

function req(r) {
    return new Promise((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
}

export async function abrir(empresa, cedula) {
    const nombre = `MCI_${empresa}_${cedula}`;
    if (db && nombreDb === nombre) return;
    if (db) db.close();
    const r = indexedDB.open(nombre, VERSION);
    r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('cola')) d.createObjectStore('cola', { keyPath: 'idEvento' });
        if (!d.objectStoreNames.contains('paquetes')) d.createObjectStore('paquetes', { keyPath: 'num' });
    };
    db = await req(r);
    nombreDb = nombre;
}

function store(nombre, modo) {
    if (!db) throw new Error('La base del conteo no está abierta.');
    return db.transaction(nombre, modo).objectStore(nombre);
}

export const colaTodas = () => req(store('cola', 'readonly').getAll());
export const colaGuardar = item => req(store('cola', 'readwrite').put(item));

export function colaGuardarMuchas(items) {
    return new Promise((ok, mal) => {
        const tx = db.transaction('cola', 'readwrite');
        const s = tx.objectStore('cola');
        items.forEach(i => s.put(i));
        tx.oncomplete = () => ok();
        tx.onerror = () => mal(tx.error);
    });
}

export function colaBorrar(ids) {
    return new Promise((ok, mal) => {
        const tx = db.transaction('cola', 'readwrite');
        const s = tx.objectStore('cola');
        ids.forEach(id => s.delete(id));
        tx.oncomplete = () => ok();
        tx.onerror = () => mal(tx.error);
    });
}

export const paqueteGuardar = item => req(store('paquetes', 'readwrite').put(item));
export const paqueteTraer = num => req(store('paquetes', 'readonly').get(num));

/**
 * El equipo: un identificador por navegador, el mismo para todas las empresas y usuarios.
 *
 * Vive en una base propia (MCI_EQUIPO) y no en localStorage (21OCT2026): cerrar sesión hace
 * localStorage.clear() y el equipo renacía con otro nombre. El latido del nombre viejo podía
 * quedar en el servidor con capturas en cola. La purga de SIMON solo toca las SIMON360_*.
 * localStorage queda como copia, y de ahí se toma el nombre de los equipos que ya tenían uno.
 */
export async function equipo() {
    let e = null;
    try { e = await equipoGuardado(); } catch { }
    if (!e) { try { e = localStorage.getItem('mci.equipo'); } catch { } }
    if (!e) e = 'WEB-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    try { await equipoGuardar(e); } catch { }
    try { localStorage.setItem('mci.equipo', e); } catch { }
    return e;
}

function abrirEquipo() {
    const r = indexedDB.open('MCI_EQUIPO', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('equipo')) r.result.createObjectStore('equipo'); };
    return req(r);
}

async function equipoGuardado() {
    const d = await abrirEquipo();
    try { return await req(d.transaction('equipo', 'readonly').objectStore('equipo').get('id')) || null; }
    finally { d.close(); }
}

async function equipoGuardar(e) {
    const d = await abrirEquipo();
    try {
        await new Promise((ok, mal) => {
            const tx = d.transaction('equipo', 'readwrite');
            tx.objectStore('equipo').put(e, 'id');
            tx.oncomplete = () => ok();
            tx.onerror = () => mal(tx.error);
        });
    } finally { d.close(); }
}

// ── aviso al cerrar la pestaña con capturas sin enviar ──────────────────
let pendientes = 0;
function alSalir(e) {
    if (pendientes > 0) { e.preventDefault(); e.returnValue = ''; }
}
window.addEventListener('beforeunload', alSalir);
export function marcarPendientes(n) { pendientes = n; }

// ── foco permanente en la captura ───────────────────────────────────────
let foco = null;

function hayVentana() {
    // las del módulo (MciModal) y las de SweetAlert que no son toast
    if (document.querySelector('.mci-modal')) return true;
    const sw = document.querySelector('.swal2-popup:not(.swal2-toast)');
    return !!(sw && sw.offsetParent !== null);
}

export function enfocar(trasElegir) {
    if (!foco) return;
    const inp = document.getElementById(foco.inputId);
    if (!inp || inp.offsetParent === null || hayVentana()) return;
    const a = document.activeElement;
    // tras elegir en un combo el foco sí se lleva (la elección terminó); escribiendo en otro campo, no
    const otroCampo = trasElegir
        ? 'input:not([type=checkbox]):not([type=radio]),textarea'
        : 'input:not([type=checkbox]):not([type=radio]),select,textarea';
    if (a && a !== inp && a.matches && a.matches(otroCampo)) return;
    inp.focus({ preventScroll: true });
}

export function instalarFoco(raizId, inputId) {
    quitarFoco();
    const raiz = document.getElementById(raizId);
    if (!raiz) return;
    const h = {
        // los botones marcados no se llevan el foco (el clic funciona igual)
        down: e => { if (e.target.closest('[data-mci-mantiene-foco] button')) e.preventDefault(); },
        click: e => { if (!e.target.closest('input,select,textarea')) setTimeout(() => enfocar(false), 0); },
        change: e => { if (e.target.matches('select,input[type=checkbox],input[type=radio]')) setTimeout(() => enfocar(true), 0); },
        win: () => enfocar(false),
        vis: () => { if (!document.hidden) enfocar(false); }
    };
    raiz.addEventListener('pointerdown', h.down);
    raiz.addEventListener('click', h.click);
    raiz.addEventListener('change', h.change);
    window.addEventListener('focus', h.win);
    document.addEventListener('visibilitychange', h.vis);
    foco = { raiz, inputId, h };
    enfocar(false);
}

export function quitarFoco() {
    if (!foco) return;
    const { raiz, h } = foco;
    raiz.removeEventListener('pointerdown', h.down);
    raiz.removeEventListener('click', h.click);
    raiz.removeEventListener('change', h.change);
    window.removeEventListener('focus', h.win);
    document.removeEventListener('visibilitychange', h.vis);
    foco = null;
}
