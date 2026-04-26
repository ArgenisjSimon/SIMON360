// offlineDbMulti.js
window.offlineDbV3 = (function () {

    const DB_NAME = 'SIMON360V2';
    const DB_VERSION = 1;

    const STORE_PENDING = 'pendingChanges';

    let db = null;

    // Canal de difusión para comunicación entre pestañas
    const bc = new BroadcastChannel('offline-db-channel');

    // Escuchar mensajes de otras pestañas pidiendo cerrar la DB
    bc.onmessage = (event) => {
        if (event.data === 'close-db' && db) {
            db.close();
            db = null;
            console.log('Conexión con IndexedDB cerrada por solicitud de otra pestaña.');
        }
    };

    // ================= INIT =================
    async function init(entityStores = []) {
        return new Promise((resolve, reject) => {

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);

            request.onupgradeneeded = (event) => {
                db = event.target.result;

                // Dynamic entity stores
                entityStores.forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const store = db.createObjectStore(storeName, { keyPath: 'id' });
                        store.createIndex('updatedAt', 'updatedAt', { unique: false });
                    }
                });

                // Pending changes store
                if (!db.objectStoreNames.contains(STORE_PENDING)) {
                    const pending = db.createObjectStore(STORE_PENDING, { keyPath: 'id' });
                    pending.createIndex('entity', 'entity', { unique: false });
                    pending.createIndex('action', 'action', { unique: false });
                    pending.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };

            request.onsuccess = () => {
                db = request.result;
                resolve();
            };
        });
    }

    async function ensureDb() {
        if (!db) {
            throw new Error('IndexedDB no inicializada');
        }
    }

    function getStore(storeName, mode = 'readonly') {
        return db.transaction(storeName, mode).objectStore(storeName);
    }

    // ================= OPERACIONES GENÉRICAS DE ENTIDADES =================

    async function save(entity, item) {
        await ensureDb();
        return new Promise((resolve, reject) => {
            const req = getStore(entity, 'readwrite').put(item);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async function saveMany(entity, items) {
        await ensureDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(entity, 'readwrite');
            const store = tx.objectStore(entity);

            items.forEach(i => store.put(i));

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function getAll(entity) {
        await ensureDb();
        return new Promise((resolve, reject) => {
            const req = getStore(entity).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function getById(entity, id) {
        await ensureDb();
        return new Promise((resolve, reject) => {
            const req = getStore(entity).get(id);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
        });
    }

    async function remove(entity, id) {
        await ensureDb();
        return new Promise((resolve, reject) => {
            const req = getStore(entity, 'readwrite').delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async function clearEntity(entity) {
        await ensureDb();
        return new Promise((resolve, reject) => {
            const req = getStore(entity, 'readwrite').clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    // ================= ELIMINAR BASE DE DATOS MEJORADA =================
    /**
     * Elimina la base de datos IndexedDB.
     * @param {number} timeoutMs - Tiempo máximo de espera en milisegundos (por defecto 5000).
     * @returns {Promise<void>}
     */
    async function deleteDatabase(timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            // Cerrar nuestra propia conexión primero
            if (db) {
                db.close();
                db = null;
            }

            // Pedir a otras pestañas que cierren sus conexiones
            bc.postMessage('close-db');

            const req = indexedDB.deleteDatabase(DB_NAME);
            let bloqueado = false;

            // Establecer un tiempo límite para el bloqueo
            const timeout = setTimeout(() => {
                if (bloqueado) {
                    reject(new Error('No se pudo eliminar la base de datos porque hay otras pestañas abiertas. Por favor, ciérralas e inténtalo de nuevo.'));
                }
            }, timeoutMs);

            req.onsuccess = () => {
                clearTimeout(timeout);
                resolve();
            };

            req.onerror = () => {
                clearTimeout(timeout);
                reject(req.error);
            };

            req.onblocked = () => {
                bloqueado = true;
                console.warn('Bloqueado: hay otra pestaña con la base de datos abierta. Esperando a que se cierre...');
            };
        });
    }

    // ================= CAMBIOS PENDIENTES =================

    async function addPending(change) {
        await ensureDb();
        change.createdAt = new Date().toISOString();

        return new Promise((resolve, reject) => {
            const req = getStore(STORE_PENDING, 'readwrite').put(change);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async function getPending() {
        await ensureDb();
        return new Promise((resolve, reject) => {
            const req = getStore(STORE_PENDING).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function removePending(id) {
        await ensureDb();
        return new Promise((resolve, reject) => {
            const req = getStore(STORE_PENDING, 'readwrite').delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    return {
        init,

        // Entities
        save,
        saveMany,
        getAll,
        getById,
        remove,
        clearEntity,

        // Pending
        addPending,
        getPending,
        removePending,

        // Borrar DB (versión mejorada)
        deleteDatabase
    };
})();

window.addEventListener('DOMContentLoaded', async () => {
    await window.offlineDbV3.init([
        'Clientes',
        'Productos',
        'Pedidos',
        'PedidosDetalle',
        'Informes',
        'CCA',
        'Rubros',
        'Ciclos',
        'ActMae',
        'ActDet',
        'Cards',
        'Empresa',
        'Calendario',
        'CalendarioUsuario',
        'Usuarios',
        'Estados',
        'Propiedades'
    ]);
});