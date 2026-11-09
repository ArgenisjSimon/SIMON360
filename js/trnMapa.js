// Mapa de transporte (OPP 360, Entrega D): los puntos de las rutas (planificado) y dónde de verdad empezaron y
// terminaron los recorridos (las capturas del teléfono del chofer). Una línea fina une cada captura con el punto que
// le tocaba: si es larga, el recorrido no empezó o no terminó donde decía la ruta.
// Los colores se leen del tema al dibujar (marca blanca), no al cargar el archivo.
window.trnMapa = (function () {
    let mapa = null;
    const color = (token, respaldo) => (window.tema && tema.color) ? tema.color(token, respaldo) : respaldo;

    function dibujar(idDiv, puntos, capturas) {
        const div = document.getElementById(idDiv);
        if (!div || !window.L) return false;
        if (mapa) { mapa.remove(); mapa = null; }
        mapa = L.map(div, { zoomControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapa);

        const cPunto = color('primary-600', '#2563eb'), cIni = color('ok-600', '#16a34a'), cFin = color('crit-600', '#dc2626'), cLinea = color('warn-500', '#f59e0b');
        const limites = [];
        const porNombre = {};
        (puntos || []).forEach(p => {
            if (p.lat == null || p.lon == null) return;
            porNombre[p.nombre] = p;
            const m = L.circleMarker([p.lat, p.lon], { radius: 9, color: cPunto, weight: 3, fillColor: '#ffffff', fillOpacity: 0.9 }).addTo(mapa);
            m.bindTooltip(`<b>${esc(p.nombre)}</b><br>${esc(p.tipo || '')} · ${p.muestras || 0} captura(s)`);
            limites.push([p.lat, p.lon]);
        });
        (capturas || []).forEach(c => {
            if (c.lat == null || c.lon == null) return;
            const ini = c.evento === 'INICIO';
            const m = L.circleMarker([c.lat, c.lon], { radius: 4, color: ini ? cIni : cFin, weight: 1, fillColor: ini ? cIni : cFin, fillOpacity: 0.8 }).addTo(mapa);
            m.bindTooltip(`${ini ? 'Inicio' : 'Fin'} · ${esc(c.ruta || '')}<br>${esc(c.chofer || '')} · ${esc(c.fecha || '')}`);
            const p = porNombre[c.punto];
            if (p) L.polyline([[c.lat, c.lon], [p.lat, p.lon]], { color: cLinea, weight: 1, opacity: 0.7, dashArray: '3 4' }).addTo(mapa);
            limites.push([c.lat, c.lon]);
        });
        if (limites.length) mapa.fitBounds(limites, { padding: [30, 30], maxZoom: 15 });
        else mapa.setView([10.15, -68.9], 8);   // sin coordenadas todavía: región central
        setTimeout(() => mapa && mapa.invalidateSize(), 150);
        return limites.length > 0;
    }

    function esc(s) { return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

    function destruir() { if (mapa) { mapa.remove(); mapa = null; } }

    return { dibujar, destruir };
})();
