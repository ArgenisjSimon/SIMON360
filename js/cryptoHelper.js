// wwwroot/js/crypto.js
const STORAGE_KEY = 'encryption_key';

// Generar o recuperar una clave de encriptación
async function getOrCreateKey() {
    let keyData = localStorage.getItem(STORAGE_KEY);

    if (keyData) {
        return await crypto.subtle.importKey(
            'jwk',
            JSON.parse(keyData),
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    } else {
        const key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );

        const exported = await crypto.subtle.exportKey('jwk', key);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(exported));
        return key;
    }
}

// Encriptar texto
async function encryptData(plainText) {
    try {
        const key = await getOrCreateKey();
        const encoder = new TextEncoder();
        const data = encoder.encode(plainText);

        // IV debe ser único para cada encriptación
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
function clearEncryptionKey() {
    localStorage.removeItem(STORAGE_KEY);
}

// Exportar funciones para Blazor
window.cryptoInterop = {
    encryptData,
    decryptData,
    clearEncryptionKey
};