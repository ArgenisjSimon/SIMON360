window.offlineDb = {
    db: null,

    initialize: function () {
        let request = indexedDB.open("AppOfflineDB", 1);
        request.onupgradeneeded = function (event) {
            let db = event.target.result;
            if (!db.objectStoreNames.contains("operations")) {
                db.createObjectStore("operations", { keyPath: "id", autoIncrement: true });
            }
        };
        request.onsuccess = function (event) {
            window.offlineDb.db = event.target.result;
        };
    },

    add: function (operation) {
        return new Promise((resolve, reject) => {
            let tx = window.offlineDb.db.transaction("operations", "readwrite");
            let store = tx.objectStore("operations");
            store.add(operation);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e);
        });
    },

    getAll: function () {
        return new Promise((resolve, reject) => {
            let tx = window.offlineDb.db.transaction("operations", "readonly");
            let store = tx.objectStore("operations");
            let request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e);
        });
    },

    remove: function (id) {
        return new Promise((resolve, reject) => {
            let tx = window.offlineDb.db.transaction("operations", "readwrite");
            let store = tx.objectStore("operations");
            store.delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e);
        });
    }
};

// Inicializa la DB al cargar

