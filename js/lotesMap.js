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

    // ── Colores ──────────────────────────────────────────────────
    // Leaflet recibe el color como string al dibujar, así que nada de esto
    // puede pasar por una clase de Tailwind: se lee del tema con
    // tema.color(), y si el módulo no está cargado queda el valor de hoy.
    //
    // Se leen DENTRO de cada función y no en constantes de arriba: el tema
    // llega después de que este archivo se evalúa, y ademas cambia al
    // entrar con otra empresa. Una constante se quedaría con el color viejo.
    function _color(token, respaldo) {
        return (window.tema && tema.color) ? tema.color(token, respaldo) : respaldo;
    }

    const COLOR_DEFECTO_FIJO = '#63991F';
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
    // Colores del filtro por labor. No se toma el color del lote: el punto
    // del filtro es leer el estado de un vistazo, y para eso los 23
    // tablones tienen que hablar el mismo idioma de color.
    function colorEstado(estado) {
        if (estado === 'ejecutada') return _color('ok-600', '#16a34a');
        if (estado === 'vencida') return _color('crit-600', '#dc2626');
        if (estado === 'pendiente') return _color('warn-600', '#d97706');
        // Pizarra: la labor estaba planificada y se decidio que no hacia
        // falta. Vecina del gris de "sin esa labor" a proposito — las dos
        // dicen que ahi no hay nada que hacer — pero mas fria y mas oscura
        // para que se distingan en el mismo mapa. Verde no puede ser: ese
        // color dice "se trabajo aca".
        if (estado === 'noaplica') return _color('neutral-cool-500', '#64748b');
        return null;
    }
    // El tablon que no tiene esa labor. Gris, no invisible: sigue siendo
    // terreno de la finca y su ausencia tambien es informacion.
    function colorSinLabor() { return _color('neutral-400', '#9ca3af'); }

    function _estilo(s, lote, resaltado) {
        const base = s.relleno ?? RELLENO_DEFECTO;
        let opacidad = lote.esSembrable ? base : base * FACTOR_NO_SEMBRABLE;

        // El que no pasa el filtro no se esconde: se atenua. Esconderlo
        // dejaria huecos en el terreno y se perderia la referencia de
        // donde esta lo que si cumple.
        if (lote.atenuado) opacidad = Math.min(opacidad, 0.12);

        // Sin relleno, un borde gris fino se pierde contra el satelite y el
        // lote deja de ser identificable: la linea toma el color del lote.
        const sinRelleno = opacidad < 0.15;

        // Con filtro por labor manda el estado; sin el, el color del lote.
        // El color del lote (lote.color) viene de la base y es del usuario:
        // ese no lo toca el tema.
        const relleno = lote.estadoLabor
            ? (colorEstado(lote.estadoLabor) || colorSinLabor())
            : (lote.atenuado ? colorSinLabor()
                             : (lote.color || _color('lote', COLOR_DEFECTO_FIJO)));

        return {
            color: resaltado ? _color('warn-soft-400', '#facc15')
                 : lote.atenuado ? colorSinLabor()
                 : (sinRelleno ? relleno : _color('lote-borde', '#222222')),
            weight: resaltado ? 3 : (lote.atenuado ? 1 : (sinRelleno ? 2 : 1)),
            // Atenuado tambien en el borde: con el contorno a plena
            // opacidad el lote sigue saltando a la vista y el filtro no se
            // nota.
            opacity: lote.atenuado ? 0.45 : 1,
            fillColor: relleno,
            fillOpacity: opacidad
        };
    }

    // ── Etiqueta del centro del lote ─────────────────────────────
    //
    // El nombre del tablon y, cuando la labor elegida se hizo mas de una
    // vez, cuantas. El "x3" va PEGADO al nombre y no en un marcador
    // aparte: en un plano de 23 tablones cada elemento suelto mas es otra
    // cosa que se superpone con el vecino al alejar el zoom.
    //
    // Solo a partir de 2. Un "x1" sobre cada poligono seria ruido fijo: lo
    // que se esta buscando es el tablon al que se le paso de mas.
    function _htmlEtiqueta(lote) {
        const nombre = _escapar(lote.nombre || '');

        // Mismo verde que "ejecutada" en la leyenda, y a proposito: el
        // contador cuenta pasadas HECHAS, asi que tiene que hablar el mismo
        // idioma de color que el resto del plano.
        const veces = Number(lote.pasadas) || 0;
        const badge = veces > 1
            ? `<span style="background:${colorEstado('ejecutada')};color:#fff;
                        border-radius:99px;padding:0 5px;margin-left:4px;
                        font-size:10px;text-shadow:none">x${veces}</span>`
            : '';

        return `<div style="font-weight:700;color:#fff;font-size:11px;
                     text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;
                     text-align:center">${nombre}${badge}</div>`;
    }

    function _iconoEtiqueta(lote) {
        return L.divIcon({
            className: '',
            html: _htmlEtiqueta(lote),
            iconSize: [60, 14],
            iconAnchor: [30, 7]
        });
    }

    // ── Filtros: repinta sin rehacer el mapa ─────────────────────
    // cambios: [{ id, atenuado, estadoLabor, pasadas, actividad, labor,
    //             rotuloFecha, fecha }]
    //
    // Existe para no llamar a init en cada cambio de filtro: init destruye
    // el mapa y vuelve a encuadrar, asi que el usuario perderia el zoom y
    // el encuadre cada vez que toca un desplegable.
    function setFiltros(mapId, cambios) {
        const s = estados[mapId];
        if (!s) return;

        (cambios || []).forEach(c => {
            const p = s.poligonos[c.id];
            if (!p) return;

            p.lote.atenuado    = !!c.atenuado;
            p.lote.estadoLabor = c.estadoLabor || null;
            p.lote.pasadas     = Number(c.pasadas) || 0;
            p.lote.actividad   = c.actividad || null;
            // Todo esto es de la labor elegida: sin refrescarlo, el globo se
            // quedaria mostrando lo de la labor anterior.
            p.lote.labor              = c.labor || null;
            p.lote.rotuloFecha        = c.rotuloFecha || null;
            p.lote.fecha              = c.fecha || null;
            p.lote.insumos            = Number(c.insumos) || 0;
            p.lote.insumosSinEntregar = Number(c.insumosSinEntregar) || 0;

            p.capa.setStyle(_estilo(s, p.lote, String(p.lote.id) === String(s.resaltado)));

            // El contador y el globo tambien dependen de la labor elegida:
            // sin rehacerlos, cambiar de labor dejaba el "x3" de la anterior
            // pegado en el plano.
            const etiqueta = s.etiquetas[c.id];
            if (etiqueta) etiqueta.setIcon(_iconoEtiqueta(p.lote));

            p.capa.setPopupContent(_popup(p.lote));
        });
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
            ? `<span style="background:${_color('ok-100','#dcfce7')};color:${_color('ok-800','#166534')};padding:1px 6px;border-radius:99px;font-size:10px">Sembrable</span>`
            : `<span style="background:${_color('neutral-cool-100','#f1f5f9')};color:${_color('neutral-cool-600','#475569')};padding:1px 6px;border-radius:99px;font-size:10px">No sembrable</span>`;
        // La descripcion se escapa: es texto que escribe el usuario y va
        // dentro de un innerHTML.
        const desc = lote.descripcion
            ? `<br><span style="font-size:11px;color:#444">${_escapar(lote.descripcion)}</span>`
            : '';

        // Variedad, clase y fecha de corte del CCA vigente. El bloque
        // entero se omite si el lote no tiene CCA: un tablon que no entro
        // a ningun presupuesto no tiene nada que mostrar, y tres guiones
        // ocupan lo mismo que el dato sin decir nada.
        // La edad va debajo del corte porque se calcula desde el: leidas
        // juntas se entiende de donde sale, y sueltas parece otro dato mas.
        // Las pasadas van rotuladas con el nombre de la actividad principal
        // ("RIEGO  3 veces") y no con un "Pasadas" pelado: el desplegable
        // dice "1ER RIEGO" y el numero cuenta TODOS los riegos, asi que sin
        // el rotulo se lee como que el primer riego se hizo tres veces.
        const veces = Number(lote.pasadas) || 0;
        const filaPasadas = veces > 1
            ? [lote.actividad || 'Labor', `${veces} veces`]
            : null;

        // Cuando se hizo la labor elegida en ESE tablon.
        const filaFecha = lote.fecha
            ? [lote.rotuloFecha || 'Fecha', lote.fecha]
            : null;

        // Insumos de la labor elegida: solo el conteo, y la advertencia
        // de lo que falta por entregar. La lista producto por producto
        // no entra en un globo sin tapar el terreno que se esta mirando;
        // vive en el panel de la labor, a un click de aca.
        const items = Number(lote.insumos) || 0;
        const faltan = Number(lote.insumosSinEntregar) || 0;
        const filaInsumos = items > 0
            ? ['Insumos', faltan > 0
                ? `${items} ítem${items === 1 ? '' : 's'} · ${faltan} sin entregar`
                : `${items} ítem${items === 1 ? '' : 's'}`]
            : null;

        // Primero la ficha del CCA, que no cambia al mover el filtro, y
        // despues las tres que si dependen de la labor elegida: cuando se
        // hizo, cuantas veces y con que insumos.
        const filas = [
            ['Variedad', lote.variedad],
            ['Clase',    lote.clase],
            ['F. corte', lote.fCorte],
            ['Edad',     lote.edad],
            filaFecha,
            filaPasadas,
            filaInsumos
        ].filter(f => f && f[1]);

        // Con labor elegida se rotula el bloque con su nombre: sin eso, un
        // "Se hizo el 02/12/2025" suelto no dice de que labor habla.
        const tituloLabor = (lote.labor && lote.fecha)
            ? `<div style="font-size:10px;font-weight:700;letter-spacing:.03em;
                        color:${_color('neutral-500','#6b7280')};margin-bottom:3px">
                   ${_escapar(lote.labor)}
               </div>`
            : '';

        const cca = filas.length
            ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid ${_color('neutral-200','#e5e7eb')};font-size:11px;color:${_color('neutral-700','#374151')}">
                   ${tituloLabor}
                   ${filas.map(([k, v]) =>
                       `<div style="display:flex;gap:8px;justify-content:space-between">
                            <span style="color:${_color('neutral-500','#6b7280')}">${k}</span>
                            <b>${_escapar(String(v))}</b>
                        </div>`).join('')}
               </div>`
            : '';

        return `<div style="font-family:system-ui,sans-serif;min-width:170px;max-width:240px">
                    <b style="font-size:13px">Lote ${_escapar(lote.nombre || '')}</b><br>
                    ${badge}<br>
                    <span style="font-size:12px">${_escapar(lote.tipo || '')}</span><br>
                    <b>${ha} ha</b>${sql}${desc}${cca}
                </div>`;
    }

    // ── init ─────────────────────────────────────────────────────
    // lotes: [{ id, nombre, descripcion, geometria, color, esSembrable,
    //           areaLote, areaSql, tipo, variedad, clase, fCorte, edad,
    //           atenuado, estadoLabor, pasadas, actividad }]
    // variedad/clase/fCorte vienen del CCA vigente y pueden faltar: el lote
    // sin CCA no tiene variedad ni corte todavia.
    // edad = edad del cultivo YA en texto ("8 meses"), calculada en C# desde
    // fCorte. Llega resuelta y no como fecha porque el globo es HTML plano.
    // atenuado = no pasa el filtro de ciclo o rubro.
    // estadoLabor = 'ejecutada' | 'vencida' | 'pendiente' | 'noaplica' |
    //               'sin', o null
    // cuando no hay filtro por labor.
    // pasadas = veces que se EJECUTO la actividad principal de la labor
    // elegida en ese lote. Se dibuja sobre el poligono solo si pasa de 1.
    // actividad = su nombre (RIEGO), para rotular el dato en el globo.
    // insumos = cuantos renglones de OEI tiene esa labor en ese lote;
    // insumosSinEntregar = cuantos de esos no se despacharon completos.
    // Los dos llegan en 0 cuando no hay filtro por labor.
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

            // Etiqueta con el nombre en el centro del lote, y el contador
            // de pasadas si la labor elegida se hizo mas de una vez.
            const centro = capa.getBounds().getCenter();
            const etiqueta = L.marker(centro, {
                icon: _iconoEtiqueta(lote),
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

    // ── Recalcular el tamaño y volver a encuadrar ────────────────
    //
    // Leaflet mide el contenedor UNA vez, al crear el mapa. Si en ese
    // momento el div todavia no tiene su tamaño final --porque nacio
    // dentro de una pestaña que se acaba de mostrar, o de un panel que
    // aun se estaba armando-- el mapa queda creyendo que mide casi nada:
    // los tiles no se piden y el fitBounds calcula un zoom absurdo. Se ve
    // como un rectangulo gris con las etiquetas amontonadas en el centro.
    //
    // invalidateSize() le hace volver a medir. El re-encuadre va despues
    // porque el fitBounds anterior se calculo con el tamaño equivocado.
    //
    // Va dentro de requestAnimationFrame para que corra cuando el
    // navegador ya termino de aplicar el layout, no en el medio.
    function invalidar(mapId) {
        const s = estados[mapId];
        if (!s) return;

        requestAnimationFrame(function () {
            s.map.invalidateSize();

            const capas = Object.values(s.poligonos).map(p => p.capa);
            if (capas.length > 0)
                s.map.fitBounds(L.featureGroup(capas).getBounds(), { padding: [25, 25] });
        });
    }

    // ── Marcar un punto GPS consultado ───────────────────────────
    function marcarPunto(mapId, lat, lng) {
        const s = estados[mapId];
        if (!s) return;

        if (s.marcadorPunto) s.map.removeLayer(s.marcadorPunto);

        s.marcadorPunto = L.circleMarker([lat, lng], {
            radius: 7, color: '#fff', weight: 2,
            fillColor: _color('crit-600', '#dc2626'), fillOpacity: 1
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
                    fillColor: _color('crit-600', '#dc2626'), fillOpacity: 1
                }).addTo(s.map));
        });

        if (s.dibujo.length >= 2) {
            const latlngs = s.dibujo.map(p => [p.lat, p.lng]);
            // Con 3+ puntos se muestra ya como poligono cerrado, que es lo
            // que el usuario va a guardar. Con 2 es solo una linea.
            const capa = s.dibujo.length >= 3
                ? L.polygon(latlngs, { color: _color('crit-600', '#dc2626'), weight: 2,
                                       fillColor: _color('crit-300', '#fca5a5'), fillOpacity: 0.35, dashArray: '5,5' })
                : L.polyline(latlngs, { color: _color('crit-600', '#dc2626'), weight: 2, dashArray: '5,5' });
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
        setFiltros,
        verTodo,
        invalidar,
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
