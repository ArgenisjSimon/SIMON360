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

                const now = Math.floor(Date.now() / 1000);
                const isExpired = now >= exp;

                if (isExpired) {
                    console.log("Token expirado");
                    // Opcional: limpiar el token expirado
                    localStorage.removeItem('authToken');
                }

                return isExpired;
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