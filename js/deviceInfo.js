// wwwroot/js/deviceInfo.js

// Funciones seguras para evitar uso de eval() desde C#
window.getTimeZone = function () {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
    catch { return 'UTC'; }
};

window.getScreenWidth = function () { return window.screen.width; };
window.getScreenHeight = function () { return window.screen.height; };
window.getDevicePixelRatio = function () { return window.devicePixelRatio || 1; };
window.getHardwareConcurrency = function () { return navigator.hardwareConcurrency || 0; };
window.isCryptoInteropAvailable = function () { return typeof cryptoInterop !== 'undefined'; };
window.getUserAgent = function () {
    return navigator.userAgent;
};

window.getPlatform = function () {
    return navigator.platform;
};

window.getLanguage = function () {
    return navigator.language || navigator.userLanguage;
};

// Función para obtener información completa del dispositivo
window.getDeviceInfo = function () {
    try {
        const userAgent = navigator.userAgent;
        let sistemaOperativo = "Desconocido";
        let navegador = "Desconocido";
        let version = "0";

        // Detectar sistema operativo
        if (userAgent.includes("Windows")) {
            sistemaOperativo = "Windows";
        } else if (userAgent.includes("Mac OS") || userAgent.includes("MacOS")) {
            sistemaOperativo = "macOS";
        } else if (userAgent.includes("Linux")) {
            sistemaOperativo = "Linux";
        } else if (userAgent.includes("Android")) {
            sistemaOperativo = "Android";
        } else if (userAgent.includes("like Mac") || userAgent.includes("iOS") || userAgent.includes("iPhone")) {
            sistemaOperativo = "iOS";
        }

        // Detectar navegador
        if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) {
            navegador = "Chrome";
            const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
            version = match ? match[1] : "0";
        } else if (userAgent.includes("Firefox")) {
            navegador = "Firefox";
            const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
            version = match ? match[1] : "0";
        } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
            navegador = "Safari";
            const match = userAgent.match(/Version\/(\d+\.\d+)/);
            version = match ? match[1] : "0";
        } else if (userAgent.includes("Edg")) {
            navegador = "Edge";
            const match = userAgent.match(/Edg\/(\d+\.\d+)/);
            version = match ? match[1] : "0";
        }

        return {
            sistemaOperativo: sistemaOperativo,
            navegador: navegador,
            versionNavegador: version,
            userAgent: userAgent
        };
    } catch (error) {
        console.error("Error en getDeviceInfo:", error);
        return {
            sistemaOperativo: "Desconocido",
            navegador: "Desconocido",
            versionNavegador: "0",
            userAgent: navigator.userAgent || "Desconocido"
        };
    }
};