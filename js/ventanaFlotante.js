// ============================================================
// ventanaFlotante.js — arrastrar una ventana por su encabezado
// ============================================================
// Se usa para abrir un formulario encima de la pagina SIN taparla: no hay
// fondo oscuro, la ventana se corre a un lado y se sigue trabajando debajo.
//
// EN TELEFONO NO SE ARRASTRA NADA. Con 375px de ancho no hay "a un lado":
// mover la ventana solo la saca de la pantalla. Ahi la ventana va a pantalla
// completa y este modulo no engancha nada, que es distinto de enganchar y que
// no haga nada: si el encabezado tomara el gesto, se comeria el scroll.
// ============================================================
window.ventanaFlotante = (function () {

    const ANCHO_MINIMO_PARA_ARRASTRAR = 768;   // el breakpoint md de Tailwind
    const MARGEN = 8;                          // no dejar que se pegue al borde

    const activas = {};   // id -> { asa, alBajar, alMover, alSoltar, alRedimensionar }

    // Todas las ventanas vivas, incluso las que no se arrastran (telefono).
    // El z-index lo maneja este modulo y NO Blazor: si el z viniera en el
    // atributo style del marcado, cada vez que Blazor lo reescribe se lleva
    // puesto el left/top que dejo el arrastre — mover una ventana devolvia
    // todas las demas al centro.
    const ventanas = {};  // id -> elemento
    const Z_BASE = 10005;

    /// Pone la ventana arriba de todo y renumera al resto. Renumerar en vez de
    /// incrementar mantiene el z acotado: un contador que solo sube termina
    /// pasandole por encima a cualquier otra cosa de la pagina.
    function alFrente(idVentana) {
        const vivos = Object.keys(ventanas)
            .map(id => ({ id, el: ventanas[id] }))
            .filter(x => x.el && x.el.isConnected);

        vivos.sort((a, b) =>
            (parseInt(a.el.style.zIndex, 10) || 0) - (parseInt(b.el.style.zIndex, 10) || 0));

        const orden = vivos.filter(x => x.id !== idVentana);
        const elegida = ventanas[idVentana];
        if (elegida) orden.push({ id: idVentana, el: elegida });

        orden.forEach((x, i) => { x.el.style.zIndex = Z_BASE + i; });
    }

    function _puedeArrastrar() {
        return window.innerWidth >= ANCHO_MINIMO_PARA_ARRASTRAR;
    }

    // La ventana no puede irse a donde no se pueda recuperar: el encabezado
    // tiene que quedar siempre visible, porque es lo unico de lo que se agarra.

    // La ventana se centra por CSS con left:50% + margen negativo, para que sea
    // visible aunque este modulo nunca llegue a posicionarla. Al posicionarla
    // desde acá hay que ANULAR ese margen, o queda corrida media pantalla.
    function _posicionar(ventana, x, y) {
        ventana.style.marginLeft = '0px';
        ventana.style.left = `${x}px`;
        ventana.style.top = `${y}px`;
    }

    // Devuelve la ventana al centrado por CSS.
    function _soltarPosicion(ventana) {
        ventana.style.marginLeft = '';
        ventana.style.left = '';
        ventana.style.top = '';
    }

    function _acotar(x, y, ventana) {
        const ancho = ventana.offsetWidth;
        const altoEncabezado = 56;

        const maxX = window.innerWidth - Math.min(ancho, window.innerWidth) - MARGEN;
        const minX = MARGEN - ancho + 120;   // deja asomar 120px por la izquierda

        return {
            x: Math.max(minX, Math.min(x, Math.max(maxX, MARGEN))),
            y: Math.max(MARGEN, Math.min(y, window.innerHeight - altoEncabezado - MARGEN))
        };
    }

    /// desplazamiento: cuantas ventanas hay abiertas ya. Cada una nace un poco
    /// mas abajo y a la derecha que la anterior; si todas nacieran centradas,
    /// abrir la segunda taparia la primera y pareceria que no se abrio nada.
    function iniciar(idVentana, idAsa, desplazamiento) {
        detener(idVentana);

        const ventana = document.getElementById(idVentana);
        const asa = document.getElementById(idAsa);
        if (!ventana || !asa) return false;

        // Se registra SIEMPRE, aunque no se pueda arrastrar: el apilado lo
        // maneja este modulo tambien en telefono, donde la ultima abierta tiene
        // que quedar arriba.
        ventanas[idVentana] = ventana;
        alFrente(idVentana);

        if (!_puedeArrastrar()) return false;

        // Centrada al abrir, un poco mas arriba del centro: asi el encabezado
        // queda a la vista aunque la ventana sea alta.
        const paso = 28 * (desplazamiento || 0);
        const x = Math.max(MARGEN, (window.innerWidth - ventana.offsetWidth) / 2) + paso;
        const y = Math.max(MARGEN, (window.innerHeight - ventana.offsetHeight) / 3) + paso;

        const p = _acotar(x, y, ventana);
        _posicionar(ventana, p.x, p.y);

        let arrastrando = false;
        let desfaseX = 0, desfaseY = 0;

        function alBajar(e) {
            // Solo el boton primario, y no cuando se hizo clic en un boton del
            // encabezado (cerrar): si no, cerrar la ventana la arrastraria.
            if (e.button !== 0) return;
            if (e.target.closest('button, a, input, select')) return;

            arrastrando = true;
            const caja = ventana.getBoundingClientRect();
            desfaseX = e.clientX - caja.left;
            desfaseY = e.clientY - caja.top;

            // Capturar el puntero: si el mouse se adelanta al render y sale de
            // la ventana, el arrastre sigue igual en vez de quedar colgado.
            asa.setPointerCapture(e.pointerId);
            document.body.style.userSelect = 'none';
        }

        function alMover(e) {
            if (!arrastrando) return;

            const p = _acotar(e.clientX - desfaseX, e.clientY - desfaseY, ventana);
            _posicionar(ventana, p.x, p.y);
        }

        function alSoltar(e) {
            if (!arrastrando) return;
            arrastrando = false;
            try { asa.releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
            document.body.style.userSelect = '';
        }

        asa.addEventListener('pointerdown', alBajar);
        asa.addEventListener('pointermove', alMover);
        asa.addEventListener('pointerup', alSoltar);
        asa.addEventListener('pointercancel', alSoltar);

        // Si la pantalla cambia de tamano la ventana puede quedar fuera de
        // vista (rotar el telefono, achicar el navegador).
        function alRedimensionar() {
            // Al bajar a ancho de telefono la ventana pasa a pantalla completa
            // por CSS (inset-0), pero el left/top inline que dejo el arrastre
            // le gana a la clase y la deja a medio salir. Se limpia.
            if (!_puedeArrastrar()) {
                _soltarPosicion(ventana);
                return;
            }

            // Minimizada la ventana esta con display:none y mide 0: acotarla
            // ahi la mandaria a una posicion calculada sobre un ancho de cero,
            // y al restaurarla aparece corrida.
            if (ventana.offsetWidth === 0) return;

            const caja = ventana.getBoundingClientRect();
            const p = _acotar(caja.left, caja.top, ventana);
            _posicionar(ventana, p.x, p.y);
        }
        window.addEventListener('resize', alRedimensionar);

        activas[idVentana] = { asa, alBajar, alMover, alSoltar, alRedimensionar };
        return true;
    }

    function detener(idVentana) {
        delete ventanas[idVentana];

        const a = activas[idVentana];
        if (!a) return;

        a.asa.removeEventListener('pointerdown', a.alBajar);
        a.asa.removeEventListener('pointermove', a.alMover);
        a.asa.removeEventListener('pointerup', a.alSoltar);
        a.asa.removeEventListener('pointercancel', a.alSoltar);
        window.removeEventListener('resize', a.alRedimensionar);
        document.body.style.userSelect = '';

        delete activas[idVentana];
    }

    /// Vuelve a centrar la ventana. Hace falta al salir de maximizada: el
    /// left/top que tenia antes corresponde a otro tamano y la dejaria a
    /// medio salir de la pantalla.
    function centrar(idVentana) {
        const ventana = document.getElementById(idVentana);
        if (!ventana) return;

        // En ancho de telefono la ventana va a pantalla completa por CSS: lo
        // que hay que hacer es SACAR el left/top inline, no calcular uno. Si
        // quedara, le gana a la clase y la ventana aparece a medio salir.
        if (!_puedeArrastrar()) {
            _soltarPosicion(ventana);
            return;
        }

        // Se mide en el frame SIGUIENTE. Blazor no re-renderiza de forma
        // sincronica: al restaurar desde maximizada, en este instante la
        // ventana todavia tiene el tamano de maximizada y centrarla con esas
        // medidas la deja corrida.
        requestAnimationFrame(() => {
            const x = Math.max(MARGEN, (window.innerWidth - ventana.offsetWidth) / 2);
            const y = Math.max(MARGEN, (window.innerHeight - ventana.offsetHeight) / 3);

            _posicionar(ventana, x, y);
        });
    }

    /// Maximizada la ventana se pega a los bordes, asi que el left/top inline
    /// tiene que salir del medio: si queda, pelea con las clases y la ventana
    /// aparece corrida.
    function soltarPosicion(idVentana) {
        const ventana = document.getElementById(idVentana);
        if (!ventana) return;

        _soltarPosicion(ventana);
    }

    return { iniciar, detener, centrar, soltarPosicion, alFrente };
})();
