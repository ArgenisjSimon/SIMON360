// wwwroot/js/cryptoHelper.js
// Clave AES-GCM-256 almacenada en IndexedDB como CryptoKey no exportable.
// Ningun script puede leer el material de la clave; solo el navegador la usa internamente.

const CRYPTO_DB_NAME = 'SimonCryptoDB';
const CRYPTO_STORE = 'keys';
const CRYPTO_KEY_ID = 'master';

function openCryptoDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CRYPTO_DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(CRYPTO_STORE, { keyPath: 'id' });
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function getOrCreateKey() {
    const db = await openCryptoDb();

    // Intentar recuperar la clave existente
    const existing = await new Promise((resolve, reject) => {
        const tx = db.transaction(CRYPTO_STORE, 'readonly');
        const req = tx.objectStore(CRYPTO_STORE).get(CRYPTO_KEY_ID);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
    });

    if (existing && existing.key) {
        return existing.key;
    }

    // Generar clave nueva: extractable = false (no se puede exportar)
    const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );

    // Guardar en IndexedDB (almacena el objeto CryptoKey directamente)
    await new Promise((resolve, reject) => {
        const tx = db.transaction(CRYPTO_STORE, 'readwrite');
        const req = tx.objectStore(CRYPTO_STORE).put({ id: CRYPTO_KEY_ID, key: key });
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });

    return key;
}

// Encriptar texto
async function encryptData(plainText) {
    try {
        const key = await getOrCreateKey();
        const encoder = new TextEncoder();
        const data = encoder.encode(plainText);

        // IV debe ser unico para cada encriptacion
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            data
        );

        // Combinar IV + datos encriptados
        const result = new Uint8Array(iv.length + encrypted.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(encrypted), iv.length);

        return btoa(String.fromCharCode(...result));
    } catch (error) {
        console.error('Error en encryptData:', error);
        throw new Error('No se pudo encriptar los datos');
    }
}

// Desencriptar texto
async function decryptData(cipherText) {
    try {
        const key = await getOrCreateKey();
        const data = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0));

        // Extraer IV (primeros 12 bytes) y datos encriptados
        const iv = data.slice(0, 12);
        const encrypted = data.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encrypted
        );

        return new TextDecoder().decode(decrypted);
    } catch (error) {
        console.error('Error en decryptData:', error);
        throw new Error('No se pudo desencriptar los datos');
    }
}

// Limpiar clave (para logout)
async function clearEncryptionKey() {
    try {
        // Limpiar clave legacy de localStorage si existe
        localStorage.removeItem('encryption_key');

        const db = await openCryptoDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(CRYPTO_STORE, 'readwrite');
            const req = tx.objectStore(CRYPTO_STORE).delete(CRYPTO_KEY_ID);
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e.target.error);
        });
    } catch (error) {
        console.error('Error limpiando clave:', error);
    }
}

// Exportar funciones para Blazor
window.cryptoInterop = {
    encryptData,
    decryptData,
    clearEncryptionKey
};
