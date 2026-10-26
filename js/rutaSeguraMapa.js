// ─────────────────────────────────────────────────────────────────────────────
// Ruta Segura · mapa del rastro GPS de un viaje (RutaSeguraDetalleViaje.razor).
//
// Archivo aparte a propósito: leafletMap.js dibuja rutas por calles (ORS) con
// paradas numeradas, que es otra cosa. Aquí se dibuja lo que el teléfono REGISTRÓ:
// la línea del recorrido punto a punto, el inicio, el fin y los eventos (paradas,
// las que detectó el GPS sin declarar, inconsistencias). Mismas capas que
// leafletMap.js: calles (OpenStreetMap) y satélite (Esri).
// ─────────────────────────────────────────────────────────────────────────────
window.rutaSeguraMapa = (function () {
    const mapas = {};

    const capas = () => ({
        'Calles': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            { attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors', maxZoom: 19 }),
        'Satélite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            { attribution: 'Tiles &copy; Esri', maxZoom: 19 })
    });

    const punto = (color, radio) => ({
        radius: radio, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 1
    });

    function destruir(idDiv) {
        if (mapas[idDiv]) { mapas[idDiv].remove(); delete mapas[idDiv]; }
    }

    /**
     * @param idDiv    id del contenedor
     * @param puntos   [{ lat, lon, fecha, kmh }] en orden
     * @param eventos  [{ lat, lon, texto, color }]  (solo los que tienen coordenada)
     */
    function dibujar(idDiv, puntos, eventos) {
        destruir(idDiv);
        const div = document.getElementById(idDiv);
        if (!div || typeof L === 'undefined') return false;

        const c = capas();
        const mapa = L.map(div, { layers: [c['Calles']], zoomControl: true });
        L.control.layers(c, null, { position: 'topright' }).addTo(mapa);
        mapas[idDiv] = mapa;

        const limites = [];
        if (puntos && puntos.length) {
            const linea = puntos.map(p => [p.lat, p.lon]);
            L.polyline(linea, { color: '#B91C1C', weight: 4, opacity: 0.85 }).addTo(mapa);
            linea.forEach(x => limites.push(x));

            const ini = puntos[0], fin = puntos[puntos.length - 1];
            L.circleMarker([ini.lat, ini.lon], punto('#16A34A', 8)).addTo(mapa)
                .bindPopup('<b>Primera lectura</b><br>' + ini.fecha);
            L.circleMarker([fin.lat, fin.lon], punto('#0F172A', 8)).addTo(mapa)
                .bindPopup('<b>Última lectura</b><br>' + fin.fecha + (fin.kmh != null ? '<br>' + fin.kmh + ' km/h' : ''));
        }

        (eventos || []).forEach(e => {
            L.circleMarker([e.lat, e.lon], punto(e.color || '#2563EB', 7)).addTo(mapa).bindPopup(e.texto);
            limites.push([e.lat, e.lon]);
        });

        const encuadrar = () => {
            if (limites.length) mapa.fitBounds(limites, { padding: [24, 24], maxZoom: 15 });
            else mapa.setView([8.0, -66.0], 6);   // Venezuela, si el viaje no trae coordenadas
        };
        encuadrar();

        // El modal recién abierto puede medir 0 al dibujar: entonces el encuadre sale al
        // zoom máximo. Al aparecer se recalcula el tamaño y se vuelve a encuadrar.
        setTimeout(() => { mapa.invalidateSize(); encuadrar(); }, 200);
        return true;
    }

    return { dibujar, destruir };
})();
