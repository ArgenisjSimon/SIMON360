// ============================================================
// tema.js — aplica la paleta de la empresa
// ============================================================
// Los colores de la app son clases de Tailwind (bg-blue-600, …) que
// index.html tiene apuntando a variables CSS por rol. Acá se escriben
// esas variables: teñir la app entera es esto y nada más.
//
// Se carga ANTES que Blazor y arranca leyendo el tema cacheado: si se
// esperara al framework, el usuario ve medio segundo de azul SIMON y
// después el salto a su marca.
// ============================================================
window.tema = (function () {

    var NIVELES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

    // Cuánto se aclara (hacia blanco) o se oscurece (hacia negro) cada
    // escalón respecto del tono base, que es el 500. Los números salieron
    // de comparar contra la escala de Tailwind: no son exactos —ellos
    // ajustan a mano cada color— pero dan una rampa pareja y legible.
    var MEZCLA = {
        50: .95, 100: .90, 200: .75, 300: .55, 400: .30,
        500: 0,
        600: .15, 700: .30, 800: .45, 900: .60, 950: .75
    };

    // + id de empresa. El 'v2' es el FORMATO del objeto cacheado, no la
    // version del tema de la empresa.
    //
    // Hace falta porque la revalidacion es por numero de version y ese
    // numero no dice nada de la FORMA del payload. Cuando se agrego
    // 'modulos' al GET, los navegadores que ya tenian cacheada esa misma
    // version —bajada de un API anterior, sin ese campo— comparaban 2 contra
    // 2, concluian que estaban al dia y no volvian a pedir el tema nunca:
    // el tema por modulo simplemente no funcionaba, sin ningun error.
    //
    // Subir este numero al agregar un campo invalida todos los caches de
    // golpe. Es un renglon y evita tener que pedirle a cada usuario que
    // limpie el navegador.
    var CLAVE_CACHE = 'tema:v2:';

    // Las claves de formatos anteriores. Se borran al guardar, si no quedan
    // ocupando localStorage para siempre.
    var CLAVES_VIEJAS = ['tema:'];

    // Roles de un solo color, sin escala: son el blanco y el negro de
    // Tailwind (bg-white, text-white, bg-black). Ver css/tema-tokens.css.
    var PLANOS = ['surface', 'ink-max',
                  'rail', 'rail-ink', 'rail-ink-soft', 'rail-hover', 'topbar', 'marca',
                  'rail-crit', 'rail-crit-wash',
                  'lote', 'lote-borde'];

    // ── Utilidades de color ──────────────────────────────────
    function aRgb(hex) {
        var h = String(hex).trim().replace('#', '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }

    function mezclar(c, destino, t) {
        return [
            Math.round(c[0] + (destino[0] - c[0]) * t),
            Math.round(c[1] + (destino[1] - c[1]) * t),
            Math.round(c[2] + (destino[2] - c[2]) * t)
        ];
    }

    // Devuelve los 11 escalones de un rol.
    //
    // Escribir la escala COMPLETA no es opcional: si se pisa solo el 600,
    // el 500 se queda con el azul de fábrica y sale un botón verde con el
    // hover azul. Si la empresa mandó tonos sueltos, se respetan y los que
    // falten se derivan del base.
    function completar(entrada) {
        var base = typeof entrada === 'string' ? entrada : (entrada['500'] || entrada[500] || entrada.base);

        // Sin tono base pero con tonos sueltos: se respetan tal cual y no se
        // deriva nada. Es el caso de "quiero cambiar UN color del modo
        // oscuro": pedir el 500 solo para poder tocar el 700 seria absurdo, y
        // antes esto devolvia null y se perdia el override entero.
        if (!base) {
            if (typeof entrada !== 'object' || entrada === null) return null;
            var sueltos = {}, hubo = false;
            for (var clave in entrada) {
                if (!/^\d+$/.test(clave)) continue;
                sueltos[clave] = aRgb(entrada[clave]);
                hubo = true;
            }
            return hubo ? sueltos : null;
        }

        var c = aRgb(base), escala = {};
        for (var i = 0; i < NIVELES.length; i++) {
            var n = NIVELES[i];
            var propio = typeof entrada === 'object' ? (entrada[n] || entrada[String(n)]) : null;
            if (propio) { escala[n] = aRgb(propio); continue; }
            var t = MEZCLA[n];
            escala[n] = n < 500 ? mezclar(c, [255, 255, 255], t)
                      : n > 500 ? mezclar(c, [0, 0, 0], t)
                      : c;
        }
        return escala;
    }

    // ── Aplicar / limpiar ────────────────────────────────────
    //
    // El tema se escribe como una HOJA DE ESTILO y no como estilos inline en
    // el <html>. La razón es el modo oscuro: hace falta poder decir
    //
    //     :root      { --c-primary-600: <el claro>  }
    //     html.dark  { --c-primary-600: <el oscuro> }
    //
    // y un estilo inline no sabe de clases: valdría para los dos modos, y
    // encima le ganaría a cualquier regla. Con la hoja, la empresa puede
    // pisar un color solo en oscuro y dejar el resto igual.

    var ID_HOJA = 'tema-empresa';

    /// Convierte una paleta a lineas de variables CSS.
    function aReglas(paleta) {
        if (!paleta) return '';
        var lineas = [];

        for (var rol in paleta) {
            if (PLANOS.indexOf(rol) !== -1) {
                var valor = typeof paleta[rol] === 'string' ? paleta[rol] : (paleta[rol]['500'] || paleta[rol][500]);
                if (!valor) continue;
                lineas.push('--c-' + rol + ':' + aRgb(valor).join(' '));
                continue;
            }

            var escala = completar(paleta[rol]);
            if (!escala) continue;

            // Los roles cortos (noche) no tienen los 11 escalones: se escriben
            // solo los que el rol realmente usa, si no se inventan variables
            // que nadie lee.
            var niveles = rol === 'noche' ? [400, 500, 600, 700, 800, 900] : NIVELES;
            for (var i = 0; i < niveles.length; i++) {
                var n = niveles[i];
                if (escala[n]) lineas.push('--c-' + rol + '-' + n + ':' + escala[n].join(' '));
            }
        }

        return lineas.join(';');
    }

    /// paleta       = colores del modo claro (y los que valen para los dos)
    /// paletaOscura = solo lo que cambia en oscuro; lo que no venga acá
    ///                hereda del claro, que a su vez hereda del default.
    function aplicar(paleta, paletaOscura) {
        var claro = aReglas(paleta);
        var oscuro = aReglas(paletaOscura);

        var css = '';
        if (claro) css += ':root{' + claro + '}';
        if (oscuro) css += 'html.dark{' + oscuro + '}';

        var hoja = document.getElementById(ID_HOJA);
        var habia = hoja ? hoja.textContent : '';

        if (css === habia) return;    // mismo tema: no hay nada que repintar

        // Una paleta vacia es una instruccion, no un "no hagas nada": significa
        // "sin colores propios, volve al default". Es lo que pasa al SALIR de
        // un modulo teñido cuando la empresa no tiene paleta — antes se
        // devolvia temprano y la hoja del modulo quedaba puesta, asi que el
        // riel se quedaba con el color del modulo en toda la app.
        //
        // Lo unico que no se hace es crear una hoja vacia si no habia ninguna.
        if (!css && !hoja) return;

        if (!hoja) {
            hoja = document.createElement('style');
            hoja.id = ID_HOJA;
            document.head.appendChild(hoja);
        }

        // Fundido solo cuando REEMPLAZA a otro tema ya pintado. En el arranque
        // no: ahí el color tiene que estar puesto desde el primer frame, y una
        // transición se veria como el parpadeo que justamente se evita.
        if (habia) _conFundido();

        hoja.textContent = css;
    }

    /// Suaviza el salto de color durante 400 ms. Pasa poco —cuando el API trae
    /// un tema editado mientras la sesion esta abierta— pero sin esto la
    /// pantalla cambia de golpe y parece un error.
    var _fundidoEnCurso = null;

    function _conFundido() {
        try {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        } catch (e) { /* navegador viejo: se sigue */ }

        var raiz = document.documentElement;
        raiz.classList.add('tema-cambiando');

        // La clase se saca SIEMPRE: dejarla puesta convertiria cada hover y
        // cada cambio de estado del resto de la sesion en una animacion.
        clearTimeout(_fundidoEnCurso);
        _fundidoEnCurso = setTimeout(function () {
            raiz.classList.remove('tema-cambiando');
        }, 450);
    }

    /// Vuelve al default de css/tema-tokens.css quitando la hoja del tema.
    /// La llama el logout: si no, el próximo que entre en esa máquina ve
    /// la marca del anterior hasta que cargue la suya.
    function limpiar() {
        var hoja = document.getElementById(ID_HOJA);
        if (hoja) hoja.remove();

        // Quedan estilos inline de versiones anteriores de este módulo o de
        // pruebas hechas a mano en la consola: si no se barren, sobreviven a
        // la hoja y siguen pintando.
        var raiz = document.documentElement;
        var inline = raiz.getAttribute('style');
        if (inline && inline.indexOf('--c-') !== -1) {
            var limpio = inline.split(';').filter(function (d) {
                return d.trim() && d.trim().indexOf('--c-') !== 0;
            }).join(';');
            if (limpio) raiz.setAttribute('style', limpio); else raiz.removeAttribute('style');
        }

        try {
            // Barre 'tema:' entero, que cubre el formato actual y los viejos:
            // el logout tiene que dejar la maquina sin rastro de la empresa
            // anterior, no solo sin el cache que este codigo sabe leer.
            for (var k = localStorage.length - 1; k >= 0; k--) {
                var clave = localStorage.key(k);
                if (clave && clave.indexOf('tema:') === 0) localStorage.removeItem(clave);
            }
        } catch (e) { /* storage bloqueado: la hoja ya se fue igual */ }
    }

    // ── Modo forzado por un módulo ───────────────────────────
    //
    // Un módulo puede pedir verse siempre claro o siempre oscuro. Es un
    // préstamo, no una decisión: mientras se está dentro manda el módulo, y
    // al salir vuelve lo que el usuario había elegido.
    //
    // Por eso esto NO toca localStorage 'theme'. Esa clave es la preferencia
    // del usuario y es suya: si un módulo oscuro la pisara, saldría del
    // módulo y se encontraría la app entera cambiada sin haber tocado nada.

    /// modo('dark' | 'light') fuerza; modo(null) devuelve la preferencia.
    function modo(forzado) {
        var raiz = document.documentElement;
        var oscuro;

        if (forzado === 'dark' || forzado === 'light') {
            oscuro = forzado === 'dark';
        } else {
            try { oscuro = localStorage.getItem('theme') === 'dark'; }
            catch (e) { oscuro = raiz.classList.contains('dark'); }
        }

        if (oscuro === raiz.classList.contains('dark')) return oscuro;

        // Mismo fundido que el cambio de paleta: sin esto el salto de claro a
        // oscuro al entrar a un módulo se ve como un parpadeo.
        _conFundido();
        raiz.classList.toggle('dark', oscuro);
        return oscuro;
    }

    /// Solo consulta: ¿se está viendo oscuro AHORA? No confunde con la
    /// preferencia guardada, que puede no coincidir si un módulo la está
    /// pisando. Lo usa el layout para elegir cuál de los dos logos mostrar.
    function esOscuro() {
        return document.documentElement.classList.contains('dark');
    }

    // ── Leer un token desde JS ───────────────────────────────
    //
    // Para lo que no puede pasar por una clase de Tailwind: los mapas de
    // Leaflet, que reciben el color como string al dibujar el polígono.
    //
    // Se lee en el momento de usarlo, no al cargar el módulo: el tema llega
    // después del arranque y puede cambiar al reloguear con otra empresa.
    // Un color capturado en una constante al principio se queda viejo.
    function color(token, respaldo) {
        try {
            var v = getComputedStyle(document.documentElement)
                .getPropertyValue('--c-' + token).trim();
            if (!v) return respaldo || null;
            return 'rgb(' + v.split(/\s+/).join(',') + ')';
        } catch (e) {
            return respaldo || null;
        }
    }

    // ── Cache ────────────────────────────────────────────────
    function guardar(empresaId, tema) {
        try {
            localStorage.setItem(CLAVE_CACHE + empresaId, JSON.stringify(tema));

            // El cache del formato anterior ya no lo lee nadie.
            for (var i = 0; i < CLAVES_VIEJAS.length; i++)
                localStorage.removeItem(CLAVES_VIEJAS[i] + empresaId);
        }
        catch (e) { /* sin cache: el tema igual se aplicó, solo parpadea al recargar */ }
    }

    function leer(empresaId) {
        try {
            var crudo = localStorage.getItem(CLAVE_CACHE + empresaId);
            return crudo ? JSON.parse(crudo) : null;
        } catch (e) { return null; }
    }

    /// El video de arranque de la empresa, si tiene uno configurado.
    /// Lo pide index.html antes de que el <video> empiece a cargar: cambiarlo
    /// después ya se vería como un salto.
    function splashUrl() {
        try {
            var id = localStorage.getItem('empresaSeleccionada');
            if (!id) return null;
            var tema = leer(id);
            return (tema && tema.splashUrl) ? tema.splashUrl : null;
        } catch (e) { return null; }
    }

    /// Arranque: pinta con lo último que se supo de esta empresa, sin red y
    /// sin esperar a Blazor. Si no hay nada cacheado no hace nada y queda
    /// el default de SIMON.
    function aplicarDesdeCache() {
        try {
            var id = localStorage.getItem('empresaSeleccionada');
            if (!id) return null;
            var tema = leer(id);
            if (!tema) return null;
            aplicar(tema.paleta, tema.paletaOscura);
            if (tema.modoDefault && !localStorage.getItem('theme')) {
                if (tema.modoDefault === 'dark') document.documentElement.classList.add('dark');
            }
            return tema;
        } catch (e) { return null; }
    }

    return {
        aplicar: aplicar,
        aplicarDesdeCache: aplicarDesdeCache,
        limpiar: limpiar,
        modo: modo,
        esOscuro: esOscuro,
        color: color,
        splashUrl: splashUrl,
        guardar: guardar,
        leer: leer,
        completar: completar
    };
})();
