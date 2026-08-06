// ============================================================
// lotesMap.js — mapa de lotes georreferenciados de una finca
// Modulo LOTES (Fase 1 Planificacion, Pyto Don Nacho)
// ============================================================
// Modulo aparte de leafletMap.js a proposito: aquel resuelve marcadores,
// rutas y dibujo de areas para media docena de modulos, y aqui hace falta
// otra cosa — pintar poligonos que ya vienen hechos desde la base.
// Meterlo alli obligaria a revisar todos sus usos actuales.
//
// Leaflet 1.9.4 ya viene cargado desde index.html.
//
// El GeoJSON llega como string y se parsea aqui. Las coordenadas vienen
// en orden GeoJSON (lon, lat) y Leaflet las espera al reves: L.geoJSON
// hace la conversion, por eso se usa esa via y no L.polygon.
// ============================================================
window.lotesMap = (function () {

    const CAPAS = {
        satellite: {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            attribution: 'Tiles &copy; Esri'
        },
        street: {
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '&copy; OpenStreetMap contributors'
        }
    };

    const COLOR_DEFECTO = '#63991F';
    const estados = {};

    // Nombre y descripcion los escribe el usuario y terminan dentro de un
    // innerHTML (popup y etiqueta). Sin escapar, un lote llamado
    // <img onerror=...> ejecutaria script en la sesion de quien abra el mapa.
    function _escapar(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    // Relleno por defecto de un lote sembrable. Lo no sembrable se pinta
    // a una fraccion de eso: el ojo debe irse primero a lo que produce.
    const RELLENO_DEFECTO = 0.55;
    const FACTOR_NO_SEMBRABLE = 0.55;   // 0.55 * 0.55 ≈ 0.30

    // ── Estilo de un lote ────────────────────────────────────────
    // s.relleno lo mueve el usuario con el control de transparencia. En 0
    // el lote queda solo delimitado: el fill sigue existiendo (transparente)
    // para que el poligono no deje de responder al click.
    function _estilo(s, lote, resaltado) {
        const base = s.relleno ?? RELLENO_DEFECTO;
        const opacidad = lote.esSembrable ? base : base * FACTOR_NO_SEMBRABLE;

        // Sin relleno, un borde gris fino se pierde contra el satelite y el
        // lote deja de ser identificable: la linea toma el color del lote.
        const sinRelleno = opacidad < 0.15;

        return {
            color: resaltado ? '#facc15' : (sinRelleno ? (lote.color || COLOR_DEFECTO) : '#222222'),
            weight: resaltado ? 3 : (sinRelleno ? 2 : 1),
            fillColor: lote.color || COLOR_DEFECTO,
            fillOpacity: opacidad
        };
    }

    // ── Transparencia del relleno (0 = solo contorno) ────────────
    function setRelleno(mapId, valor) {
        const s = estados[mapId];
        if (!s) return;

        s.relleno = Math.min(1, Math.max(0, Number(valor) || 0));

        Object.values(s.poligonos).forEach(p =>
            p.capa.setStyle(_estilo(s, p.lote, String(p.lote.id) === String(s.resaltado))));
    }

    function _popup(lote) {
        const ha = (lote.areaLote ?? 0).toFixed(2);
        const sql = lote.areaSql != null
            ? `<br><small style="color:#666">Medido: ${lote.areaSql.toFixed(3)} ha</small>`
            : '';
        const badge = lote.esSembrable
            ? '<span style="background:#dcfce7;color:#166534;padding:1px 6px;border-radius:99px;font-size:10px">Sembrable</span>'
            : '<span style="background:#f1f5f9;color:#475569;padding:1px 6px;border-radius:99px;font-size:10px">No sembrable</span>';
        // La descripcion se escapa: es texto que escribe el usuario y va
        // dentro de un innerHTML.
        const desc = lote.descripcion
            ? `<br><span style="font-size:11px;color:#444">${_escapar(lote.descripcion)}</span>`
            : '';
        return `<div style="font-family:system-ui,sans-serif;min-width:150px;max-width:240px">
                    <b style="font-size:13px">Lote ${_escapar(lote.nombre || '')}</b><br>
                    ${badge}<br>
                    <span style="font-size:12px">${_escapar(lote.tipo || '')}</span><br>
                    <b>${ha} ha</b>${sql}${desc}
                </div>`;
    }

    // ── init ─────────────────────────────────────────────────────
    // lotes: [{ id, nombre, descripcion, geometria, color, esSembrable,
    //           areaLote, areaSql, tipo }]
    function init(mapId, lotes, dotnetRef) {
        destroy(mapId);

        const el = document.getElementById(mapId);
        if (!el) return false;

        // doubleClickZoom apagado a proposito: en este mapa el doble click
        // sobre un lote significa "abrir ese lote", y si ademas hiciera zoom
        // el gesto quedaria haciendo dos cosas a la vez.
        const map = L.map(mapId, { zoomControl: true, doubleClickZoom: false });
        const sat = L.tileLayer(CAPAS.satellite.url, {
            maxZoom: 20, attribution: CAPAS.satellite.attribution
        }).addTo(map);

        const s = {
            map: map,
            capas: { satellite: sat, street: null },
            capaActual: 'satellite',
            poligonos: {},   // id -> layer
            etiquetas: {},   // id -> marker
            dotnetRef: dotnetRef || null,
            resaltado: null,
            aislado: null,       // id del lote abierto en vista de detalle
            relleno: RELLENO_DEFECTO,
            // estado del modo dibujo (ver habilitarDibujo)
            dibujo: [],
            dibujoCapas: [],
            dibujoRef: null,
            dibujoHandler: null
        };
        estados[mapId] = s;

        const conGeometria = (lotes || []).filter(l => l.geometria);

        if (conGeometria.length === 0) {
            // Sin poligonos no hay a donde encuadrar: se centra en
            // Venezuela para no dejar el mapa en el Atlantico.
            map.setView([8.0, -66.0], 6);
            return true;
        }

        const grupo = L.featureGroup();

        conGeometria.forEach(lote => {
            let geo;
            try {
                geo = JSON.parse(lote.geometria);
            } catch (e) {
                console.warn('[lotesMap] GeoJSON invalido en el lote', lote.nombre, e);
                return;
            }

            const capa = L.geoJSON(geo, { style: _estilo(s, lote, false) });
            capa.bindPopup(_popup(lote));

            capa.on('click', () => {
                _resaltar(mapId, lote.id);
                if (s.dotnetRef) {
                    s.dotnetRef.invokeMethodAsync('OnLoteSeleccionado', lote.id)
                        .catch(err => console.warn('[lotesMap] callback .NET fallo', err));
                }
            });

            // Doble click = abrir el lote. Se aisla aqui mismo en vez de
            // esperar el viaje de ida y vuelta a .NET: el usuario ve el
            // resto de la finca desaparecer en el mismo gesto.
            capa.on('dblclick', () => {
                if (s.dibujoHandler) return;   // dibujando no se abre nada
                aislarLote(mapId, lote.id);
                if (s.dotnetRef) {
                    s.dotnetRef.invokeMethodAsync('OnLoteAbierto', lote.id)
                        .catch(err => console.warn('[lotesMap] callback .NET fallo', err));
                }
            });

            capa.addTo(map);
            grupo.addLayer(capa);
            s.poligonos[lote.id] = { capa: capa, lote: lote };

            // Etiqueta con el nombre en el centro del lote
            const centro = capa.getBounds().getCenter();
            const etiqueta = L.marker(centro, {
                icon: L.divIcon({
                    className: '',
                    html: `<div style="font-weight:700;color:#fff;font-size:11px;
                                 text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;
                                 text-align:center">${_escapar(lote.nombre || '')}</div>`,
                    iconSize: [60, 14],
                    iconAnchor: [30, 7]
                }),
                interactive: false
            }).addTo(map);
            s.etiquetas[lote.id] = etiqueta;
        });

        if (grupo.getLayers().length > 0)
            map.fitBounds(grupo.getBounds(), { padding: [25, 25] });

        return true;
    }

    // ── Cambiar capa base ────────────────────────────────────────
    function setLayer(mapId, tipo) {
        const s = estados[mapId];
        if (!s || !CAPAS[tipo] || s.capaActual === tipo) return;

        if (s.capas[s.capaActual]) s.map.removeLayer(s.capas[s.capaActual]);

        if (!s.capas[tipo]) {
            s.capas[tipo] = L.tileLayer(CAPAS[tipo].url, {
                maxZoom: 20, attribution: CAPAS[tipo].attribution
            });
        }
        s.capas[tipo].addTo(s.map);
        // La capa base debe quedar debajo de los poligonos
        s.capas[tipo].bringToBack();
        s.capaActual = tipo;
    }

    // ── Resaltar sin mover el mapa ───────────────────────────────
    function _resaltar(mapId, id) {
        const s = estados[mapId];
        if (!s) return;

        if (s.resaltado != null && s.poligonos[s.resaltado]) {
            const ant = s.poligonos[s.resaltado];
            ant.capa.setStyle(_estilo(s, ant.lote, false));
        }

        const act = s.poligonos[id];
        if (act) {
            act.capa.setStyle(_estilo(s, act.lote, true));
            act.capa.bringToFront();
            s.resaltado = id;
        } else {
            s.resaltado = null;
        }
    }

    function resaltarLote(mapId, id) { _resaltar(mapId, id); }

    // ── Centrar en un lote (click en la fila de la tabla) ─────────
    function enfocarLote(mapId, id) {
        const s = estados[mapId];
        if (!s) return;

        const p = s.poligonos[id];
        if (!p) return;   // la fila de caminos no tiene poligono

        _resaltar(mapId, id);
        s.map.fitBounds(p.capa.getBounds(), { padding: [60, 60], maxZoom: 17 });
        p.capa.openPopup();
    }

    // ── Aislar un lote: los demas salen del mapa ─────────────────
    // Se quitan del mapa, no se ocultan con opacidad: un poligono
    // transparente sigue tapando clicks y sigue contando para fitBounds.
    function aislarLote(mapId, id) {
        const s = estados[mapId];
        if (!s) return false;

        const clave = String(id);
        const p = s.poligonos[clave];
        if (!p) return false;   // la fila de caminos no tiene poligono

        s.map.closePopup();

        Object.keys(s.poligonos).forEach(k => _visible(s, k, k === clave));

        s.aislado = clave;
        _resaltar(mapId, id);
        s.map.fitBounds(p.capa.getBounds(), { padding: [40, 40], maxZoom: 18 });
        return true;
    }

    // ── Volver a la finca completa ───────────────────────────────
    function mostrarTodos(mapId) {
        const s = estados[mapId];
        if (!s) return;

        Object.keys(s.poligonos).forEach(k => _visible(s, k, true));
        s.aislado = null;
        verTodo(mapId);
    }

    function _visible(s, clave, visible) {
        const capa = s.poligonos[clave]?.capa;
        const etiqueta = s.etiquetas[clave];

        [capa, etiqueta].forEach(l => {
            if (!l) return;
            const puesta = s.map.hasLayer(l);
            if (visible && !puesta) l.addTo(s.map);
            else if (!visible && puesta) s.map.removeLayer(l);
        });
    }

    // ── Ver toda la finca ────────────────────────────────────────
    function verTodo(mapId) {
        const s = estados[mapId];
        if (!s) return;

        const capas = Object.values(s.poligonos).map(p => p.capa);
        if (capas.length === 0) return;

        s.map.fitBounds(L.featureGroup(capas).getBounds(), { padding: [25, 25] });
    }

    // ── Marcar un punto GPS consultado ───────────────────────────
    function marcarPunto(mapId, lat, lng) {
        const s = estados[mapId];
        if (!s) return;

        if (s.marcadorPunto) s.map.removeLayer(s.marcadorPunto);

        s.marcadorPunto = L.circleMarker([lat, lng], {
            radius: 7, color: '#fff', weight: 2,
            fillColor: '#dc2626', fillOpacity: 1
        }).addTo(s.map);

        s.map.setView([lat, lng], 16);
    }

    function limpiarPunto(mapId) {
        const s = estados[mapId];
        if (!s || !s.marcadorPunto) return;
        s.map.removeLayer(s.marcadorPunto);
        s.marcadorPunto = null;
    }

    // ── destroy ──────────────────────────────────────────────────
    // Blazor no desmonta el mapa solo: sin esto, volver a la pagina
    // deja instancias de Leaflet colgadas sobre el mismo div.
    function destroy(mapId) {
        const s = estados[mapId];
        if (!s) return;
        try { s.map.remove(); } catch (e) { /* ya estaba desmontado */ }
        delete estados[mapId];
    }

    // ═════════════════════════════════════════════════════════════
    // MODO DIBUJO — trazar el poligono de un lote nuevo con clicks
    // ═════════════════════════════════════════════════════════════
    // Los puntos viven aqui, no en .NET. El puente JS solo lleva el
    // conteo y el area para la UI; al guardar, .NET pide el GeoJSON con
    // obtenerGeoJson(). Tener la lista en los dos lados seria dos
    // estados que se pueden desincronizar sin que nadie lo note.

    // Area geodesica por exceso esferico. Es SOLO para el numero en vivo
    // mientras se dibuja: la cifra que se guarda la mide SQL Server con
    // STArea() sobre el poligono ya cargado.
    function _areaHa(pts) {
        if (!pts || pts.length < 3) return 0;
        const R = 6378137, rad = Math.PI / 180;
        let s = 0;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            s += (b.lng - a.lng) * rad *
                 (2 + Math.sin(a.lat * rad) + Math.sin(b.lat * rad));
        }
        return Math.abs(s * R * R / 2) / 10000;
    }

    function _avisarDibujo(s) {
        if (!s.dibujoRef) return;
        s.dibujoRef.invokeMethodAsync('OnDibujoCambiado',
                                      s.dibujo.length, _areaHa(s.dibujo))
            .catch(err => console.warn('[lotesMap] callback de dibujo fallo', err));
    }

    function _redibujar(s) {
        s.dibujoCapas.forEach(c => s.map.removeLayer(c));
        s.dibujoCapas = [];

        s.dibujo.forEach((p, i) => {
            s.dibujoCapas.push(
                L.circleMarker([p.lat, p.lng], {
                    radius: 5, color: '#fff', weight: 2,
                    fillColor: '#dc2626', fillOpacity: 1
                }).addTo(s.map));
        });

        if (s.dibujo.length >= 2) {
            const latlngs = s.dibujo.map(p => [p.lat, p.lng]);
            // Con 3+ puntos se muestra ya como poligono cerrado, que es lo
            // que el usuario va a guardar. Con 2 es solo una linea.
            const capa = s.dibujo.length >= 3
                ? L.polygon(latlngs, { color: '#dc2626', weight: 2,
                                       fillColor: '#fca5a5', fillOpacity: 0.35, dashArray: '5,5' })
                : L.polyline(latlngs, { color: '#dc2626', weight: 2, dashArray: '5,5' });
            capa.addTo(s.map);
            s.dibujoCapas.push(capa);
        }

        _avisarDibujo(s);
    }

    function habilitarDibujo(mapId, dotnetRef) {
        const s = estados[mapId];
        if (!s) return false;

        s.dibujo      = [];
        s.dibujoCapas = [];
        s.dibujoRef   = dotnetRef;
        s.map.getContainer().style.cursor = 'crosshair';

        s.dibujoHandler = function (e) {
            s.dibujo.push({ lat: e.latlng.lat, lng: e.latlng.lng });
            _redibujar(s);
        };
        s.map.on('click', s.dibujoHandler);

        // Los lotes existentes dejan de responder al click mientras se
        // dibuja. Si no, marcar un punto encima de un lote vecino abre su
        // popup y selecciona su fila: el usuario cree que hizo algo mal.
        _interactividad(s, false);
        return true;
    }

    function _interactividad(s, activa) {
        Object.values(s.poligonos).forEach(p => {
            p.capa.eachLayer(l => {
                if (!l._path) return;
                l._path.style.pointerEvents = activa ? '' : 'none';
            });
        });
    }

    function deshacerPunto(mapId) {
        const s = estados[mapId];
        if (!s || !s.dibujo || s.dibujo.length === 0) return;
        s.dibujo.pop();
        _redibujar(s);
    }

    function limpiarDibujo(mapId) {
        const s = estados[mapId];
        if (!s) return;
        s.dibujo = [];
        _redibujar(s);
    }

    function cancelarDibujo(mapId) {
        const s = estados[mapId];
        if (!s) return;

        if (s.dibujoHandler) {
            s.map.off('click', s.dibujoHandler);
            s.dibujoHandler = null;
        }
        s.map.getContainer().style.cursor = '';
        (s.dibujoCapas || []).forEach(c => s.map.removeLayer(c));
        s.dibujoCapas = [];
        s.dibujo      = [];
        s.dibujoRef   = null;
        _interactividad(s, true);
    }

    // GeoJSON del trazo actual, o null si no alcanza para una superficie.
    // El anillo se entrega SIN cerrar: el usuario da su ultimo click y
    // espera que cierre solo. Cerrarlo es trabajo del SP, que ademas
    // reorienta el sentido si hace falta.
    function obtenerGeoJson(mapId) {
        const s = estados[mapId];
        if (!s || !s.dibujo || s.dibujo.length < 3) return null;

        return JSON.stringify({
            type: 'Polygon',
            coordinates: [s.dibujo.map(p => [
                Number(p.lng.toFixed(8)),
                Number(p.lat.toFixed(8))
            ])]
        });
    }

    return {
        init,
        setLayer,
        enfocarLote,
        resaltarLote,
        aislarLote,
        mostrarTodos,
        setRelleno,
        verTodo,
        marcarPunto,
        limpiarPunto,
        destroy,
        habilitarDibujo,
        deshacerPunto,
        limpiarDibujo,
        cancelarDibujo,
        obtenerGeoJson
    };
})();
