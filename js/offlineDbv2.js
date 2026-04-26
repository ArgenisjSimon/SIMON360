//// offlineDb.js - IndexedDB helper for Blazor PWA
//window.offlineDbv2 = (function () {
//    const DB_NAME = 'SIMON360';
//    const DB_VERSION = 1;
//    const STORE_ENTIDADES = 'entidades';
//    const STORE_PENDING = 'pendingChanges';

//    let db = null;

//    // Initialize database
//    async function init() {
//        return new Promise((resolve, reject) => {
//            const request = indexedDB.open(DB_NAME, DB_VERSION);

//            request.onerror = () => {
//                console.error('IndexedDB error:', request.error);
//                reject(request.error);
//            };

//            request.onsuccess = () => {
//                db = request.result;
//                console.log('IndexedDB initialized successfully');
//                resolve(db);
//            };

//            request.onupgradeneeded = (event) => {
//                db = event.target.result;

//                // Create Entidades store
//                if (!db.objectStoreNames.contains(STORE_ENTIDADES)) {
//                    const entidadesStore = db.createObjectStore(STORE_ENTIDADES, { keyPath: 'id' });
//                    entidadesStore.createIndex('nombre', 'nombre', { unique: false });
//                    entidadesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
//                }

//                // Create Pending Changes store
//                if (!db.objectStoreNames.contains(STORE_PENDING)) {
//                    const pendingStore = db.createObjectStore(STORE_PENDING, { keyPath: 'id' });
//                    pendingStore.createIndex('entityId', 'entityId', { unique: false });
//                    pendingStore.createIndex('action', 'action', { unique: false });
//                    pendingStore.createIndex('createdAt', 'createdAt', { unique: false });
//                }

//                console.log('IndexedDB stores created');
//            };
//        });
//    }

//    // Ensure DB is initialized
//    async function ensureDb() {
//        if (!db) {
//            await init();
//        }
//        return db;
//    }

//    // Get object store
//    function getStore(storeName, mode = 'readonly') {
//        const transaction = db.transaction(storeName, mode);
//        return transaction.objectStore(storeName);
//    }

//    // ===== ENTIDADES OPERATIONS =====

//    // Save multiple entidades
//    async function saveEntidades(items) {
//        await ensureDb();
//        return new Promise((resolve, reject) => {
//            const transaction = db.transaction(STORE_ENTIDADES, 'readwrite');
//            const store = transaction.objectStore(STORE_ENTIDADES);

//            items.forEach(item => {
//                store.put(item);
//            });

//            transaction.oncomplete = () => {
//                console.log(`Saved ${items.length} entidades to IndexedDB`);
//                resolve();
//            };

//            transaction.onerror = () => {
//                console.error('Error saving entidades:', transaction.error);
//                reject(transaction.error);
//            };
//        });
//    }

//    // Save single entidad
//    async function saveEntidad(item) {
//        await ensureDb();
//        return new Promise((resolve, reject) => {
//            const transaction = db.transaction(STORE_ENTIDADES, 'readwrite');
//            const store = transaction.objectStore(STORE_ENTIDADES);
//            const request = store.put(item);

//            request.onsuccess = () => {
//                console.log('Entidad saved:', item.id);
//                resolve();
//            };

//            request.onerror = () => {
//                console.error('Error saving entidad:', request.error);
//                reject(request.error);
//            };
//        });
//    }

//    // Get all entidades
//    async function getEntidades() {
//        await ensureDb();
//        return new Promise((resolve, reject) => {
//            const transaction = db.transaction(STORE_ENTIDADES, 'readonly');
//            const store = transaction.objectStore(STORE_ENTIDADES);
//            const request = store.getAll();

//            request.onsuccess = () => {
//                console.log(`Retrieved ${request.result.length} entidades`);
//                resolve(request.result);
//            };

//            request.onerror = () => {
//                console.error('Error getting entidades:', request.error);
//                reject(request.error);
//            };
//        });
//    }

//    // Get entidad by ID
//    async function getEntidadById(id) {
//        await ensureDb();
//        return new Promise((resolve, reject) => {
//            const transaction = db.transaction(STORE_ENTIDADES, 'readonly');
//            const store = transaction.objectStore(STORE_ENTIDADES);
//            const request = store.get(id);

//            request.onsuccess = () => {
//                resolve(request.result || null);
//            };

//            request.onerror = () => {
//                console.error('Error getting entidad:', request.error);
//                reject(request.error);
//            };
//        });
//    }

//    // Delete entidad
//    async function deleteEntidad(id) {
//        await ensureDb();
//        return new Promise((resolve, reject) => {
//            const transaction = db.transaction(STORE_ENTIDADES, 'readwrite');
//            const store = transaction.objectStore(STORE_ENTIDADES);
//            const request = store.delete(id);

//            request.onsuccess = () => {
//                console.log('Entidad deleted:', id);
//                resolve();
//            };

//            request.onerror = () => {
//                console.error('Error deleting entidad:', request.error);
//                reject(request.error);
//            };
//        });
//    }

//    // ===== PENDING CHANGES OPERATIONS =====

//    // Save pending change
//    async function savePendingChange(change) {
//        await ensureDb();
//        return new Promise((resolve, reject) => {
//            const transaction = db.transaction(STORE_PENDING, 'readwrite');
//            const store = transaction.objectStore(STORE_PENDING);
//            const request = store.put(change);

//            request.onsuccess = () => {
//                console.log('Pending change saved:', change.id);
//                resolve();
//            };

//            request.onerror = () => {
//                console.error('Error saving pending change:', request.error);
//                reject(request.error);
//            };
//        });
//    }

//    // Get all pending changes
//    async function getPendingChanges() {
//        await ensureDb();
//        return new Promise((resolve, reject) => {
//            const transaction = db.transaction(STORE_PENDING, 'readonly');
//            const store = transaction.objectStore(STORE_PENDING);
//            const request = store.getAll();

//            request.onsuccess = () => {
//                console.log(`Retrieved ${request.result.length} pending changes`);
//                resolve(request.result);
//            };

//            request.onerror = () => {
//                console.error('Error getting pending changes:', request.error);
//                reject(request.error);
//            };
//        });
//    }

//    // Delete pending change
//    async function deletePendingChange(id) {
//        await ensureDb();
//        return new Promise((resolve, reject) => {
//            const transaction = db.transaction(STORE_PENDING, 'readwrite');
//            const store = transaction.objectStore(STORE_PENDING);
//            const request = store.delete(id);

//            request.onsuccess = () => {
//                console.log('Pending change deleted:', id);
//                resolve();
//            };

//            request.onerror = () => {
//                console.error('Error deleting pending change:', request.error);
//                reject(request.error);
//            };
//        });
//    }

//    // Clear all pending changes
//    async function clearPendingChanges() {
//        await ensureDb();
//        return new Promise((resolve, reject) => {
//            const transaction = db.transaction(STORE_PENDING, 'readwrite');
//            const store = transaction.objectStore(STORE_PENDING);
//            const request = store.clear();

//            request.onsuccess = () => {
//                console.log('All pending changes cleared');
//                resolve();
//            };

//            request.onerror = () => {
//                console.error('Error clearing pending changes:', request.error);
//                reject(request.error);
//            };
//        });
//    }

//    // ===== UTILITY OPERATIONS =====

//    // Clear all data
//    async function clearAll() {
//        await ensureDb();
//        return new Promise((resolve, reject) => {
//            const transaction = db.transaction([STORE_ENTIDADES, STORE_PENDING], 'readwrite');

//            const clearEntidades = transaction.objectStore(STORE_ENTIDADES).clear();
//            const clearPending = transaction.objectStore(STORE_PENDING).clear();

//            transaction.oncomplete = () => {
//                console.log('All offline data cleared');
//                resolve();
//            };

//            transaction.onerror = () => {
//                console.error('Error clearing data:', transaction.error);
//                reject(transaction.error);
//            };
//        });
//    }

//    // Get storage statistics
//    async function getStorageStats() {
//        await ensureDb();

//        const entidadesCount = await new Promise((resolve) => {
//            const request = db.transaction(STORE_ENTIDADES, 'readonly')
//                .objectStore(STORE_ENTIDADES)
//                .count();
//            request.onsuccess = () => resolve(request.result);
//        });

//        const pendingCount = await new Promise((resolve) => {
//            const request = db.transaction(STORE_PENDING, 'readonly')
//                .objectStore(STORE_PENDING)
//                .count();
//            request.onsuccess = () => resolve(request.result);
//        });

//        return {
//            itemCount: entidadesCount,
//            pendingCount: pendingCount,
//            lastSync: localStorage.getItem('lastSyncTime')
//        };
//    }

//    // Export public API
//    return {
//        init,
//        saveEntidades,
//        saveEntidad,
//        getEntidades,
//        getEntidadById,
//        deleteEntidad,
//        savePendingChange,
//        getPendingChanges,
//        deletePendingChange,
//        clearPendingChanges,
//        clearAll,
//        getStorageStats
//    };
//})();

//// Initialize on load
//window.addEventListener('DOMContentLoaded', () => {
//    window.offlineDbv2.init().catch(err => {
//        console.error('Failed to initialize IndexedDB:', err);
//    });
//});

console.log('offlineDbv2.js Desactualizada');