// ============================================================
// botonBurbuja.js — boton flotante que se esconde contra el borde
// ============================================================
// Un boton fijo sobre una pagina con contenido abajo del todo (paginado,
// totales) siempre termina tapando algo. Este se recuesta contra el costado
// dejando asomar un pedacito, y aparece entero cuando lo apuntan. Ademas se
// arrastra: si igual estorba donde esta, el usuario lo cambia de lugar y ahi
// se queda —la posicion se guarda en localStorage.
//
// El estado visual (escondido / visible) lo pone el CSS mirando data-lado y
// las clases que agrega este modulo. Aca solo va la POSICION y el gesto.
// ============================================================
window.botonBurbuja = (function () {

    const MARGEN = 8;
    const UMBRAL_ARRASTRE = 6;      // px: menos que esto fue un toque, no un arrastre
    const MS_PISTA = 2000;          // cuanto queda a la vista al aparecer
    const MS_ESCONDER_TACTIL = 2600; // en pantalla tactil no existe "salir con el mouse"

    const activos = {};   // id -> estado

    // ── Posicion guardada ───────────────────────────────────────────────────
    // Se guarda el lado y la altura en PROPORCION de la ventana, no en pixeles:
    // el mismo usuario abre la app en el monitor y en el telefono, y un top de
    // 700px en una pantalla de 600 deja el boton fuera de la vista.

    function _leer(clave) {
        try {
            const crudo = localStorage.getItem(clave);
            if (!crudo) return null;

            const p = JSON.parse(crudo);
            if (p.lado !== 'izq' && p.lado !== 'der') return null;
            if (typeof p.alto !== 'number' || !isFinite(p.alto)) return null;

            return p;
        } catch {
            return null;   // storage lleno, JSON viejo o modo privado: se usa el default
        }
    }

    function _guardar(clave, p) {
        try { localStorage.setItem(clave, JSON.stringify(p)); } catch { /* no es critico */ }
    }

    /// El alto vive entre 0 y 1. Se acota SIEMPRE al aplicar, no solo al
    /// guardar: la ventana pudo achicarse desde la ultima vez.
    function _aplicar(est) {
        const el = est.el;
        const alto = Math.min(0.92, Math.max(0.04, est.alto));

        const y = Math.min(
            window.innerHeight - el.offsetHeight - MARGEN,
            Math.max(MARGEN, alto * window.innerHeight));

        el.style.top = `${y}px`;
        el.style.bottom = 'auto';

        if (est.lado === 'izq') {
            el.style.left = `${MARGEN}px`;
            el.style.right = 'auto';
        } else {
            el.style.right = `${MARGEN}px`;
            el.style.left = 'auto';
        }

        // El CSS decide con esto hacia que lado se recuesta.
        el.dataset.lado = est.lado;
    }

    function _mostrar(est, ms) {
        est.el.classList.add('burbuja-visible');

        clearTimeout(est.temporizador);
        if (ms) est.temporizador = setTimeout(() => _esconder(est), ms);
    }

    function _esconder(est) {
        clearTimeout(est.temporizador);
        est.el.classList.remove('burbuja-visible');
    }

    /// conPista: al aparecer se muestra entero y despues se recuesta solo. Sin
    /// eso, un boton que nace medio escondido en un borde no se lee como boton
    /// —parece un resto de la pagina— y nadie descubre que esta ahi.
    function iniciar(id, clave, conPista) {
        detener(id);

        const el = document.getElementById(id);
        if (!el) return false;

        const guardada = _leer(clave);

        const est = {
            el,
            clave,
            lado: guardada?.lado ?? 'der',
            alto: guardada?.alto ?? 0.72,
            temporizador: 0,
            arrastrando: false,
            movido: false
        };

        _aplicar(est);

        if (conPista) _mostrar(est, MS_PISTA);

        let desfaseX = 0, desfaseY = 0;

        function alBajar(e) {
            if (e.button !== undefined && e.button !== 0) return;

            const caja = el.getBoundingClientRect();
            desfaseX = e.clientX - caja.left;
            desfaseY = e.clientY - caja.top;

            est.arrastrando = true;
            est.movido = false;

            // En tactil no hay hover: tocarlo es la unica forma de verlo entero.
            _mostrar(est, 0);

            // Capturar el puntero: si el dedo o el mouse se adelanta al render y
            // sale del boton, el arrastre sigue en vez de quedar colgado.
            try { el.setPointerCapture(e.pointerId); } catch { /* ya capturado */ }
        }

        function alMover(e) {
            if (!est.arrastrando) return;

            const x = e.clientX - desfaseX;
            const y = e.clientY - desfaseY;

            if (!est.movido) {
                const caja = el.getBoundingClientRect();
                const corrido = Math.abs(x - caja.left) + Math.abs(y - caja.top);
                if (corrido < UMBRAL_ARRASTRE) return;

                est.movido = true;

                // Mientras se arrastra manda left/top puro: el transform con el
                // que el CSS lo recuesta pelearia con la posicion del dedo y el
                // boton iria corrido respecto del puntero.
                el.classList.add('burbuja-arrastrando');
                document.body.style.userSelect = 'none';
            }

            el.style.left = `${Math.min(window.innerWidth - el.offsetWidth - MARGEN, Math.max(MARGEN, x))}px`;
            el.style.top = `${Math.min(window.innerHeight - el.offsetHeight - MARGEN, Math.max(MARGEN, y))}px`;
            el.style.right = 'auto';
        }

        function alSoltar(e) {
            if (!est.arrastrando) return;

            est.arrastrando = false;
            try { el.releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
            document.body.style.userSelect = '';

            if (est.movido) {
                // Se pega al costado mas cercano. Suelto en el medio de la
                // pantalla taparia el contenido justo donde se lee, que es lo
                // que este boton trata de evitar.
                const caja = el.getBoundingClientRect();

                est.lado = (caja.left + caja.width / 2) < window.innerWidth / 2 ? 'izq' : 'der';
                est.alto = caja.top / window.innerHeight;

                el.classList.remove('burbuja-arrastrando');
                _aplicar(est);
                _guardar(clave, { lado: est.lado, alto: est.alto });
            }

            _mostrar(est, MS_ESCONDER_TACTIL);
        }

        // Un arrastre NO es un clic. Blazor escucha por delegacion en la raiz,
        // asi que frenar el evento aca —en captura, antes de que suba— evita
        // que mover el boton abra el formulario.
        function alHacerClic(e) {
            if (!est.movido) return;

            e.stopPropagation();
            e.preventDefault();
            est.movido = false;
        }

        function alRedimensionar() {
            if (est.arrastrando) return;
            _aplicar(est);
        }

        el.addEventListener('pointerdown', alBajar);
        el.addEventListener('pointermove', alMover);
        el.addEventListener('pointerup', alSoltar);
        el.addEventListener('pointercancel', alSoltar);
        el.addEventListener('click', alHacerClic, true);
        window.addEventListener('resize', alRedimensionar);

        est.listeners = { alBajar, alMover, alSoltar, alHacerClic, alRedimensionar };
        activos[id] = est;

        return true;
    }

    function detener(id) {
        const est = activos[id];
        if (!est) return;

        clearTimeout(est.temporizador);

        const l = est.listeners;
        est.el.removeEventListener('pointerdown', l.alBajar);
        est.el.removeEventListener('pointermove', l.alMover);
        est.el.removeEventListener('pointerup', l.alSoltar);
        est.el.removeEventListener('pointercancel', l.alSoltar);
        est.el.removeEventListener('click', l.alHacerClic, true);
        window.removeEventListener('resize', l.alRedimensionar);
        document.body.style.userSelect = '';

        delete activos[id];
    }

    return { iniciar, detener };
})();
