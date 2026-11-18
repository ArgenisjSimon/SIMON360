// wwwroot/js/tokenHelper.js
window.tokenHelper = {
    isTokenExpired: async function () {
        try {
            const encryptedToken = localStorage.getItem('authToken');
            if (!encryptedToken) {
                console.log("No se encontró token en localStorage");
                return true;
            }

            // Desencriptar el token usando cryptoInterop
            const token = await window.cryptoInterop.decryptData(encryptedToken);

            const parts = token.split('.');
            if (parts.length !== 3) {
                console.log("Token no tiene el formato correcto");
                return true;
            }

            try {
                const payload = JSON.parse(atob(parts[1]));
                const exp = payload.exp;
                if (!exp) {
                    console.log("Token no tiene expiración");
                    return true;
                }

                // ── El reloj NO decide la sesión. Decide el servidor con un 401 ──
                //
                // Antes esto devolvía true con el `exp` vencido y además BORRABA
                // el token. El JWT dura 24 h, así que cada mañana el vendedor
                // abría la app sin señal con el token de ayer: el Home (y las
                // otras 38 pantallas que llaman esto) lo sacaban a "Sesión
                // Expirada", y el login no puede entrar sin servidor. Tenía
                // todo descargado y no podía usarlo (Chepelca, 13NOV2026).
                //
                // Es la decisión §4.G de .ai/PLAN_OFFLINE.md, que nunca se aplicó
                // a esta función: sin señal no se expulsa; con señal el API
                // responde 401 y SesionVencidaHandler levanta el aviso global
                // para volver a entrar. El reloj de un teléfono de campo además
                // puede estar mal.
                //
                // true solo cuando NO hay sesión que usar: sin token, o ilegible.
                const now = Math.floor(Date.now() / 1000);
                if (now >= exp) {
                    console.log("Token vencido por reloj: se sigue; el servidor dirá si lo acepta.");
                }

                return false;
            } catch (e) {
                console.error("Error parseando payload del token:", e);
                return true;
            }
        } catch (e) {
            console.error("Error desencriptando token:", e);
            return true;
        }
    },

    getTokenPayload: async function () {
        try {
            const encryptedToken = localStorage.getItem('authToken');
            if (!encryptedToken) return null;

            const token = await window.cryptoInterop.decryptData(encryptedToken);
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            return JSON.parse(atob(parts[1]));
        } catch (e) {
            console.error("Error obteniendo payload del token:", e);
            return null;
        }
    },

    getTokenExpiration: async function () {
        try {
            const payload = await this.getTokenPayload();
            return payload?.exp ? payload.exp * 1000 : null;
        } catch (e) {
            console.error("Error obteniendo expiración del token:", e);
            return null;
        }
    }
};