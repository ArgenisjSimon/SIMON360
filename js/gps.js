window.gps = {
    async getLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Geolocation no soportado"));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({
                    latitud: pos.coords.latitude,
                    longitud: pos.coords.longitude,
                    precision: pos.coords.accuracy || null,
                    altitud: pos.coords.altitude || null
                }),
                (err) => reject(err),
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    },

    async getDeviceInfo() {
        try {
            const ua = navigator.userAgent;

            // === Sistema Operativo ===
            let os = "Desconocido";
            if (/Windows NT/i.test(ua)) os = "Windows";
            else if (/Android/i.test(ua)) os = "Android";
            else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
            else if (/Mac OS X/i.test(ua)) os = "macOS";
            else if (/Linux/i.test(ua)) os = "Linux";

            // === Navegador ===
            let navegador = "Desconocido";
            let version = "";

            if (/Edg/i.test(ua)) {
                navegador = "Edge";
                version = ua.match(/Edg\/([\d.]+)/)?.[1] || "";
            }
            else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) {
                navegador = "Chrome";
                version = ua.match(/Chrome\/([\d.]+)/)?.[1] || "";
            }
            else if (/Firefox/i.test(ua)) {
                navegador = "Firefox";
                version = ua.match(/Firefox\/([\d.]+)/)?.[1] || "";
            }
            else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
                navegador = "Safari";
                version = ua.match(/Version\/([\d.]+)/)?.[1] || "";
            }

            // === Dispositivo ===
            let dispositivo = "Escritorio";
            if (/Mobi/i.test(ua)) dispositivo = "Móvil";
            else if (/Tablet|iPad/i.test(ua)) dispositivo = "Tablet";

            // === IP Pública (con fallback) ===
            let ipPublica = "";
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                
                const res = await fetch("https://api.ipify.org?format=json", {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                if (res.ok) {
                    const data = await res.json();
                    ipPublica = data.ip;
                }
            } catch (error) {
                console.warn("No se pudo obtener IP pública:", error);
                ipPublica = "No disponible";
            }

            // === Datos extras ===
            const resolucion = `${screen.width}x${screen.height}`;
            const densidad = window.devicePixelRatio || 1;
            const idioma = navigator.language || "es";
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
            const touch = navigator.maxTouchPoints || 0;

            // === Mejora del fingerprint con más datos únicos ===
            const datosFingerprint = {
                ua: ua,
                os: os,
                navegador: navegador,
                version: version,
                dispositivo: dispositivo,
                resolucion: resolucion,
                densidad: densidad,
                idioma: idioma,
                timezone: timezone,
                touch: touch,
                hardwareConcurrency: navigator.hardwareConcurrency || 0,
                deviceMemory: navigator.deviceMemory || 0,
                platform: navigator.platform,
                vendor: navigator.vendor,
                doNotTrack: navigator.doNotTrack,
                colorDepth: screen.colorDepth,
                pixelDepth: screen.pixelDepth
            };

            // Convertir objeto a string para hash
            const rawData = JSON.stringify(datosFingerprint);
            
            // Crear hash SHA-256 más robusto
            let fingerprint;
            try {
                const hashBuffer = await crypto.subtle.digest(
                    "SHA-256",
                    new TextEncoder().encode(rawData) // Añadir timestamp para mayor unicidad
                );
                
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                fingerprint = "fp_" + hashArray.map(b => b.toString(16).padStart(2, "0")).join('').substring(0, 32);
            } catch (hashError) {
                console.warn("Error generando hash, usando fallback:", hashError);
                // Fallback simple
                fingerprint = "fp_fallback_" + 
                    Math.random().toString(36).substring(2, 15) + 
                    Math.random().toString(36).substring(2, 15);
            }

            return {
                sistemaOperativo: os,
                navegador: navegador,
                version: version,
                dispositivo: dispositivo,
                userAgent: ua,
                resolucion: resolucion,
                densidad: densidad,
                idioma: idioma,
                timezone: timezone,
                fingerprint: fingerprint,
                ipPublica: ipPublica
                // Nota: Se han removido 'touch' y 'bateria' para coincidir con la clase C#
            };
            
        } catch (error) {
            console.error("Error en getDeviceInfo:", error);
            return {
                sistemaOperativo: "Error",
                navegador: "Error",
                version: "Error",
                dispositivo: "Error",
                userAgent: navigator.userAgent || "Error",
                resolucion: "Error",
                densidad: 0,
                idioma: "Error",
                timezone: "Error",
                fingerprint: "Error_generacion",
                ipPublica: "Error"
            };
        }
    }
};