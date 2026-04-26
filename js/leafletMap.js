window.leafletMap = (function () {
    const maps = {};

    const tiles = {
        street: {
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
        },
        satellite: {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            attribution: 'Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye'
        }
    };

    // ── Inicializar mapa con marcadores GPS ──────────────────────
    function init(mapId, locations, dotnetRef) {
        if (maps[mapId]) {
            maps[mapId].map.remove();
            delete maps[mapId];
        }

        const el = document.getElementById(mapId);
        if (!el) return;

        const center = locations && locations.length > 0
            ? [locations[0].latitud, locations[0].longitud]
            : [8.0, -66.0]; // Venezuela por defecto

        const zoom = locations && locations.length > 0 ? 14 : 6;
        const map = L.map(mapId).setView(center, zoom);

        const streetLayer  = L.tileLayer(tiles.street.url,    { attribution: tiles.street.attribution });
        const satelliteLayer = L.tileLayer(tiles.satellite.url, { attribution: tiles.satellite.attribution });
        streetLayer.addTo(map);

        // Marcadores GPS (ubicaciones registradas con el botón GPS)
        const gpsMarkers = [];
        if (locations) {
            locations.forEach(function (loc, i) {
                const icon = L.divIcon({
                    className: '',
                    html: `<div style="background:#2563eb;color:white;border-radius:50%;width:28px;height:28px;
                                display:flex;align-items:center;justify-content:center;
                                font-weight:bold;font-size:12px;border:2px solid white;
                                box-shadow:0 2px 6px rgba(0,0,0,.4)">${i + 1}</div>`,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                });
                const m = L.marker([loc.latitud, loc.longitud], { icon })
                    .addTo(map)
                    .bindPopup(`<b>${loc.titulo || 'Ubicación ' + (i + 1)}</b><br>
                                ${loc.observacion || ''}<br>
                                <small>${loc.latitud.toFixed(5)}, ${loc.longitud.toFixed(5)}</small>`);
                gpsMarkers.push(m);
            });

            if (locations.length > 1) {
                const group = L.featureGroup(gpsMarkers);
                map.fitBounds(group.getBounds().pad(0.25));
            }
        }

        maps[mapId] = {
            map,
            streetLayer,
            satelliteLayer,
            currentLayer: 'street',
            gpsMarkers,
            // Área dibujada manualmente
            areaMarkers:  [],
            areaPolygon:  null,
            areaPolyline: null,
            drawingMode:  false,
            dotnetRef:    dotnetRef || null,
            clickHandler: null
        };
    }

    // ── Agregar marcador GPS sin reinicializar el mapa ───────────
    function addGpsMarker(mapId, lat, lng, titulo, num) {
        const s = maps[mapId];
        if (!s) return;

        const icon = L.divIcon({
            className: '',
            html: `<div style="background:#2563eb;color:white;border-radius:50%;width:28px;height:28px;
                        display:flex;align-items:center;justify-content:center;
                        font-weight:bold;font-size:12px;border:2px solid white;
                        box-shadow:0 2px 6px rgba(0,0,0,.4)">${num}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        const marker = L.marker([lat, lng], { icon })
            .addTo(s.map)
            .bindPopup(`<b>${titulo || 'Ubicación ' + num}</b><br>
                        <small>${lat.toFixed(5)}, ${lng.toFixed(5)}</small>`);

        s.gpsMarkers.push(marker);
        s.map.panTo([lat, lng]);
    }

    // ── Cambiar capa base ────────────────────────────────────────
    function setLayer(mapId, layerType) {
        const s = maps[mapId];
        if (!s) return;
        if (layerType === 'satellite') {
            s.map.removeLayer(s.streetLayer);
            s.satelliteLayer.addTo(s.map);
        } else {
            s.map.removeLayer(s.satelliteLayer);
            s.streetLayer.addTo(s.map);
        }
        s.currentLayer = layerType;
    }

    // ── Activar modo dibujo de área ──────────────────────────────
    function enableDrawing(mapId, dotnetRef) {
        const s = maps[mapId];
        if (!s) return;
        s.dotnetRef   = dotnetRef;
        s.drawingMode = true;
        s.map.getContainer().style.cursor = 'crosshair';

        s.clickHandler = function (e) {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;

            if (s.dotnetRef) {
                s.dotnetRef.invokeMethodAsync('OnMapClick', lat, lng);
            }
        };

        s.map.on('click', s.clickHandler);
    }

    // ── Desactivar modo dibujo ───────────────────────────────────
    function disableDrawing(mapId) {
        const s = maps[mapId];
        if (!s) return;
        s.drawingMode = false;
        s.map.getContainer().style.cursor = '';
        if (s.clickHandler) {
            s.map.off('click', s.clickHandler);
            s.clickHandler = null;
        }
    }

    // ── Helper: crear marcador de área ──────────────────────────
    function _makeAreaMarker(map, lat, lng, num, nombre) {
        const icon = L.divIcon({
            className: '',
            html: `<div style="background:#dc2626;color:white;border-radius:50%;width:24px;height:24px;
                        display:flex;align-items:center;justify-content:center;
                        font-weight:bold;font-size:11px;border:2px solid white;
                        box-shadow:0 2px 6px rgba(0,0,0,.4)">${num}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        const label = nombre ? `<b>${nombre}</b><br>` : `<b>Punto ${num}</b><br>`;
        return L.marker([lat, lng], { icon })
            .addTo(map)
            .bindPopup(`${label}<small>${lat.toFixed(6)}, ${lng.toFixed(6)}</small>`);
    }

    // ── Actualizar nombre de un punto (índice 0-based) ───────────
    function updatePointName(mapId, index, nombre) {
        const s = maps[mapId];
        if (!s || index < 0 || index >= s.areaMarkers.length) return;
        const m = s.areaMarkers[index];
        const ll = m.getLatLng();
        const num = index + 1;
        const label = nombre ? `<b>${nombre}</b><br>` : `<b>Punto ${num}</b><br>`;
        m.setPopupContent(`${label}<small>${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}</small>`);
    }

    // ── Redibujar polígono / línea del área ──────────────────────
    function _redrawArea(s) {
        if (s.areaPolygon)  { s.map.removeLayer(s.areaPolygon);  s.areaPolygon  = null; }
        if (s.areaPolyline) { s.map.removeLayer(s.areaPolyline); s.areaPolyline = null; }

        const latlngs = s.areaMarkers.map(m => m.getLatLng());
        if (latlngs.length < 2) return;

        if (latlngs.length === 2) {
            // Solo línea si hay 2 puntos
            s.areaPolyline = L.polyline(latlngs, { color: '#dc2626', weight: 2, dashArray: '6,4' })
                .addTo(s.map);
        } else {
            // Polígono relleno con 3+ puntos
            s.areaPolygon = L.polygon(latlngs, {
                color: '#dc2626',
                fillColor: '#fca5a5',
                fillOpacity: 0.35,
                weight: 2
            }).addTo(s.map);
        }
    }

    // ── Cargar puntos de área guardados (al abrir formulario) ────
    function loadAreaPoints(mapId, points) {
        const s = maps[mapId];
        if (!s || !points || points.length === 0) return;

        // Limpiar área anterior
        _clearAreaInternal(s);

        points.forEach(function (p, i) {
            const marker = _makeAreaMarker(s.map, p.latitud, p.longitud, i + 1, p.nombre || '');
            s.areaMarkers.push(marker);
        });

        _redrawArea(s);

        // Centrar mapa sobre el área
        if (s.areaMarkers.length > 0) {
            const group = L.featureGroup(s.areaMarkers);
            s.map.fitBounds(group.getBounds().pad(0.2));
        }
    }

    // ── Eliminar último punto ────────────────────────────────────
    function removeLastPoint(mapId) {
        const s = maps[mapId];
        if (!s || s.areaMarkers.length === 0) return;
        const last = s.areaMarkers.pop();
        s.map.removeLayer(last);
        _redrawArea(s);
    }

    // ── Limpiar toda el área ─────────────────────────────────────
    function clearArea(mapId) {
        const s = maps[mapId];
        if (!s) return;
        _clearAreaInternal(s);
    }

    function _clearAreaInternal(s) {
        s.areaMarkers.forEach(m => s.map.removeLayer(m));
        s.areaMarkers = [];
        if (s.areaPolygon)  { s.map.removeLayer(s.areaPolygon);  s.areaPolygon  = null; }
        if (s.areaPolyline) { s.map.removeLayer(s.areaPolyline); s.areaPolyline = null; }
    }

    // ── Toggle polígono de ubicaciones GPS (no área dibujada) ────
    function toggleGpsPolygon(mapId) {
        const s = maps[mapId];
        if (!s) return false;

        if (s.gpsPolygon) {
            s.map.removeLayer(s.gpsPolygon);
            s.gpsPolygon = null;
            return false;
        }
        const latlngs = s.gpsMarkers.map(m => m.getLatLng());
        if (latlngs.length < 3) return false;

        s.gpsPolygon = L.polygon(latlngs, {
            color: '#2563eb',
            fillColor: '#93c5fd',
            fillOpacity: 0.3,
            weight: 2
        }).addTo(s.map);
        return true;
    }

    // ── Destruir instancia ───────────────────────────────────────
    function destroy(mapId) {
        const s = maps[mapId];
        if (s) {
            s.map.remove();
            delete maps[mapId];
        }
    }

    // ── Inicializar mapa de ruta de visitas ──────────────────────
    function initRuta(mapId, waypoints, orsApiKey) {
        if (maps[mapId]) { maps[mapId].map.remove(); delete maps[mapId]; }
        const el = document.getElementById(mapId);
        if (!el) return;

        const hasPoints = waypoints && waypoints.length > 0;
        const center = hasPoints ? [waypoints[0].latitud, waypoints[0].longitud] : [10.5, -66.9];
        const zoom = hasPoints ? 13 : 6;

        const map = L.map(mapId).setView(center, zoom);
        const streetLayer = L.tileLayer(tiles.street.url, { attribution: tiles.street.attribution });
        const satelliteLayer = L.tileLayer(tiles.satellite.url, { attribution: tiles.satellite.attribution });
        streetLayer.addTo(map);

        maps[mapId] = {
            map, streetLayer, satelliteLayer, currentLayer: 'street',
            rutaMarkers: [], rutaLayer: null, orsApiKey: orsApiKey || null,
            rutaAbortController: null,
            gpsMarkers: [], areaMarkers: [], areaPolygon: null, areaPolyline: null,
            drawingMode: false, dotnetRef: null, clickHandler: null,
            ejecucionMarkers: []
        };

        if (hasPoints) _dibujarRuta(maps[mapId], waypoints);
    }

    // ── Actualizar ruta (cuando cambia el orden o se agregan paradas) ─
    function actualizarRuta(mapId, waypoints) {
        const s = maps[mapId];
        if (!s) return;

        // Cancelar fetch ORS en vuelo antes de limpiar
        if (s.rutaAbortController) {
            s.rutaAbortController.abort();
            s.rutaAbortController = null;
        }

        s.rutaMarkers.forEach(m => s.map.removeLayer(m));
        s.rutaMarkers = [];
        if (s.rutaLayer) { s.map.removeLayer(s.rutaLayer); s.rutaLayer = null; }
        if (waypoints && waypoints.length > 0) _dibujarRuta(s, waypoints);
    }

    // ── Dibujar marcadores numerados y ruta por calles (ORS) ────────
    async function _dibujarRuta(s, waypoints) {
        // 1. Marcadores numerados
        waypoints.forEach(function (wp, i) {
            const esPartida = wp.esPartida === true;
            const bg = esPartida ? '#16a34a' : '#2563eb';
            const label = esPartida ? '▶' : String(i);
            const icon = L.divIcon({
                className: '',
                html: `<div style="background:${bg};color:white;border-radius:50%;width:32px;height:32px;
                            display:flex;align-items:center;justify-content:center;
                            font-weight:bold;font-size:13px;border:2px solid white;
                            box-shadow:0 2px 8px rgba(0,0,0,.5)">${label}</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });
            const m = L.marker([wp.latitud, wp.longitud], { icon })
                .addTo(s.map)
                .bindPopup(`<b>${wp.titulo || 'Parada ' + i}</b>`);
            s.rutaMarkers.push(m);
        });

        // Centrar mapa sobre los marcadores
        if (s.rutaMarkers.length > 0) {
            const grp = L.featureGroup(s.rutaMarkers);
            s.map.fitBounds(grp.getBounds().pad(0.25));
        }

        if (waypoints.length < 2) return;

        // 2. Intentar ruta por calles con OpenRouteService
        if (s.orsApiKey) {
            const controller = new AbortController();
            s.rutaAbortController = controller;

            try {
                // ORS espera coordenadas en orden [longitud, latitud]
                const coords = waypoints.map(wp => [wp.longitud, wp.latitud]);
                const response = await fetch(
                    'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': s.orsApiKey,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ coordinates: coords }),
                        signal: controller.signal
                    }
                );

                // Si este fetch fue cancelado por una actualización posterior, salir sin tocar el mapa
                if (controller.signal.aborted) return;

                if (response.ok) {
                    const data = await response.json();
                    if (controller.signal.aborted) return;
                    const geometry = data.features[0].geometry;
                    s.rutaLayer = L.geoJSON(geometry, {
                        style: { color: '#3b82f6', weight: 4, opacity: 0.9 }
                    }).addTo(s.map);
                    s.rutaAbortController = null;
                    return; // éxito — no dibujar línea recta
                }
            } catch (err) {
                if (err.name === 'AbortError') return; // cancelado intencionalmente, no hacer fallback
            }
        }

        // 3. Fallback: línea recta punteada
        const latlngs = waypoints.map(wp => [wp.latitud, wp.longitud]);
        s.rutaLayer = L.polyline(latlngs, {
            color: '#3b82f6', weight: 3, opacity: 0.75, dashArray: '10,6'
        }).addTo(s.map);
    }

    // ── Marcadores de ejecución (IIT_Maestro, color naranja) ─────────────
    function agregarMarcadoresEjecucion(mapId, puntos) {
        const s = maps[mapId];
        if (!s) return;
        if (!s.ejecucionMarkers) s.ejecucionMarkers = [];

        puntos.forEach(function (p) {
            const icon = L.divIcon({
                className: '',
                html: `<div style="background:#f97316;color:white;border-radius:50%;width:32px;height:32px;
                            display:flex;align-items:center;justify-content:center;
                            font-weight:bold;font-size:14px;border:2px solid white;
                            box-shadow:0 2px 8px rgba(0,0,0,.5)">✔</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });
            const m = L.marker([p.latitud, p.longitud], { icon })
                .addTo(s.map)
                .bindPopup(`<b>Ejecución</b><br>${p.titulo || ''}<br><small>${p.latitud.toFixed(5)}, ${p.longitud.toFixed(5)}</small>`);
            s.ejecucionMarkers.push(m);
        });
    }

    function limpiarEjecucion(mapId) {
        const s = maps[mapId];
        if (!s || !s.ejecucionMarkers) return;
        s.ejecucionMarkers.forEach(m => s.map.removeLayer(m));
        s.ejecucionMarkers = [];
    }

    // ── Selección de punto de partida haciendo click en el mapa ─────────
    function enablePartidaSelection(mapId, dotnetRef) {
        const s = maps[mapId];
        if (!s) return;
        s.dotnetRef = dotnetRef;
        s.map.getContainer().style.cursor = 'crosshair';

        if (s._partidaClickHandler) {
            s.map.off('click', s._partidaClickHandler);
        }

        s._partidaClickHandler = function (e) {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;

            // Marcador temporal verde de partida
            if (s._partidaTempMarker) s.map.removeLayer(s._partidaTempMarker);
            const icon = L.divIcon({
                className: '',
                html: `<div style="background:#16a34a;color:white;border-radius:50%;width:32px;height:32px;
                            display:flex;align-items:center;justify-content:center;
                            font-weight:bold;font-size:13px;border:2px solid white;
                            box-shadow:0 2px 8px rgba(0,0,0,.5)">▶</div>`,
                iconSize: [32, 32], iconAnchor: [16, 16]
            });
            s._partidaTempMarker = L.marker([lat, lng], { icon })
                .addTo(s.map)
                .bindPopup('<b>Punto de Partida</b>').openPopup();

            s.map.getContainer().style.cursor = '';
            s.map.off('click', s._partidaClickHandler);
            s._partidaClickHandler = null;

            if (s.dotnetRef) {
                s.dotnetRef.invokeMethodAsync('OnPartidaSelected', lat, lng);
            }
        };

        s.map.on('click', s._partidaClickHandler);
    }

    function cancelPartidaSelection(mapId) {
        const s = maps[mapId];
        if (!s) return;
        s.map.getContainer().style.cursor = '';
        if (s._partidaClickHandler) {
            s.map.off('click', s._partidaClickHandler);
            s._partidaClickHandler = null;
        }
    }

    // ── Obtener ubicación del dispositivo ────────────────────────────
    function obtenerUbicacion() {
        return new Promise(function (resolve) {
            if (!navigator.geolocation) { resolve(null); return; }
            navigator.geolocation.getCurrentPosition(
                function (pos) { resolve({ latitud: pos.coords.latitude, longitud: pos.coords.longitude }); },
                function () { resolve(null); },
                { timeout: 8000, maximumAge: 30000 }
            );
        });
    }

    return {
        init,
        addGpsMarker,
        setLayer,
        enableDrawing,
        disableDrawing,
        loadAreaPoints,
        updatePointName,
        removeLastPoint,
        clearArea,
        toggleGpsPolygon,
        destroy,
        initRuta,
        actualizarRuta,
        obtenerUbicacion,
        enablePartidaSelection,
        cancelPartidaSelection,
        agregarMarcadoresEjecucion,
        limpiarEjecucion
    };
})();

// ── Imprimir reporte de ruta en ventana nueva ────────────────────────────
window.imprimirRuta = function (plan) {
    const statusPlan  = ['Pendiente', 'En curso', 'Completado'];
    const statusParada = ['Pendiente', 'Visitado', 'Omitido'];
    const colorParada  = ['#ca8a04', '#16a34a', '#dc2626'];

    const filasParadas = (plan.detalles || [])
        .sort((a, b) => a.orden - b.orden)
        .map((p, i) => {
            const coords = (p.latitud !== 0 || p.longitud !== 0)
                ? `${p.latitud.toFixed(5)}, ${p.longitud.toFixed(5)}`
                : '<span style="color:#d97706">Sin coordenadas</span>';
            const sIdx   = Math.min(p.statusParada, 2);
            const bg     = i % 2 === 0 ? '#f8fafc' : '#ffffff';
            return `
              <tr style="background:${bg}">
                <td style="padding:5px 8px;text-align:center;border:1px solid #e2e8f0;font-weight:bold;color:#1d4ed8">${p.orden}</td>
                <td style="padding:5px 8px;border:1px solid #e2e8f0">${p.nombreParada || ''}</td>
                <td style="padding:5px 8px;text-align:center;border:1px solid #e2e8f0;font-size:10px;color:#555">${coords}</td>
                <td style="padding:5px 8px;text-align:center;border:1px solid #e2e8f0;font-weight:bold;color:${colorParada[sIdx]}">${statusParada[sIdx]}</td>
                <td style="padding:5px 8px;border:1px solid #e2e8f0;color:#555">${p.observacion || '—'}</td>
              </tr>`;
        }).join('');

    const total     = (plan.detalles || []).length;
    const visitadas = (plan.detalles || []).filter(p => p.statusParada === 1).length;
    const pendientes= (plan.detalles || []).filter(p => p.statusParada === 0).length;
    const omitidas  = (plan.detalles || []).filter(p => p.statusParada === 2).length;

    const fechaPlan = new Date(plan.fechaPlan).toLocaleDateString('es-VE', {
        weekday:'long', day:'2-digit', month:'long', year:'numeric'
    });
    const fechaEjec = plan.fechaEjecucion
        ? new Date(plan.fechaEjecucion).toLocaleDateString('es-VE')
        : '—';
    const fechaCreacion = new Date(plan.fechaCreacion).toLocaleString('es-VE');
    const ahora = new Date().toLocaleString('es-VE');

    const partidaCoords = (plan.latitudPartida !== 0 || plan.longitudPartida !== 0)
        ? `<p style="margin:4px 0 0;font-size:10px;color:#555">Lat: ${plan.latitudPartida?.toFixed(6)} · Lng: ${plan.longitudPartida?.toFixed(6)}</p>`
        : '';

    const sIdx = Math.min(plan.status || 0, 2);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Reporte de Ruta — Plan #${plan.id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 28px 36px; }
    h1  { font-size: 18px; font-weight: bold; color: #1d4ed8; }
    h3  { font-size: 13px; font-weight: bold; color: #1e3a8a; margin: 16px 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    th  { background: #1d4ed8; color: white; padding: 6px 8px; text-align: left; font-size: 11px; }
    th.center { text-align: center; }
    .info-table td { padding: 4px 8px; border: 1px solid #bfdbfe; font-size: 11px; }
    .info-table td.label { background: #eff6ff; font-weight: bold; width: 150px; }
    .partida { background:#f0fdf4;border:1px solid #86efac;border-left:4px solid #16a34a;border-radius:6px;padding:10px 14px;margin:14px 0; }
    .resumen { display:flex; gap:14px; margin: 14px 0; }
    .box     { flex:1;text-align:center;border-radius:6px;padding:8px; }
    .footer  { border-top:1px solid #e2e8f0;padding-top:8px;margin-top:14px;font-size:10px;color:#9ca3af;text-align:center; }
    @@media print { body { padding: 16px 24px; } }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1d4ed8;padding-bottom:12px;margin-bottom:14px">
    <div>
      <h1>Plan de Ruta de Visitas</h1>
      <p style="color:#9ca3af;font-size:11px;margin-top:3px">Generado el ${ahora}</p>
    </div>
    <div style="text-align:right">
      <p style="font-weight:bold;font-size:13px">${plan.nombreUsuario || ''}</p>
      <p style="color:#9ca3af;font-size:11px">Cédula: ${plan.codUsuario || ''}</p>
    </div>
  </div>

  <table class="info-table" style="margin-bottom:14px">
    <tr>
      <td class="label">Fecha del plan</td><td>${fechaPlan}</td>
      <td class="label">Fecha de ejecución</td><td>${fechaEjec}</td>
    </tr>
    <tr>
      <td class="label">Estado</td><td>${statusPlan[sIdx]}</td>
      <td class="label">Fecha creación</td><td>${fechaCreacion}</td>
    </tr>
  </table>

  <div class="partida">
    <p style="font-weight:bold;font-size:12px;color:#15803d;margin-bottom:4px">▶ Punto de Partida</p>
    <p>${plan.nombrePartida || ''}</p>
    ${partidaCoords}
  </div>

  <h3>Paradas (${total})</h3>
  ${total > 0 ? `
  <table>
    <thead>
      <tr>
        <th class="center" style="width:36px">#</th>
        <th>Cliente / Parada</th>
        <th class="center" style="width:130px">Coordenadas</th>
        <th class="center" style="width:80px">Estado</th>
        <th>Observación</th>
      </tr>
    </thead>
    <tbody>${filasParadas}</tbody>
  </table>
  <div class="resumen">
    <div class="box" style="background:#eff6ff;border:1px solid #bfdbfe">
      <p style="font-size:20px;font-weight:bold;color:#1d4ed8">${total}</p>
      <p style="font-size:10px;color:#555">Total</p>
    </div>
    <div class="box" style="background:#f0fdf4;border:1px solid #86efac">
      <p style="font-size:20px;font-weight:bold;color:#16a34a">${visitadas}</p>
      <p style="font-size:10px;color:#555">Visitadas</p>
    </div>
    <div class="box" style="background:#fefce8;border:1px solid #fde047">
      <p style="font-size:20px;font-weight:bold;color:#ca8a04">${pendientes}</p>
      <p style="font-size:10px;color:#555">Pendientes</p>
    </div>
    <div class="box" style="background:#fef2f2;border:1px solid #fca5a5">
      <p style="font-size:20px;font-weight:bold;color:#dc2626">${omitidas}</p>
      <p style="font-size:10px;color:#555">Omitidas</p>
    </div>
  </div>` : '<p style="color:#9ca3af;font-style:italic;margin:8px 0">Sin paradas registradas.</p>'}

  <div class="footer">SIMON 360 — Plan de Ruta #${plan.id} · ${ahora}</div>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=860,height=700');
    if (!w) { alert('Activa las ventanas emergentes para imprimir.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 600);
};
