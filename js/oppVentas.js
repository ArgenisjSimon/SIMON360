// oppVentas.js — lo que el tablero de ventas necesita del navegador:
//   · el globo de detalle: un solo elemento para toda la página. Cualquier cosa con data-t lo muestra al pasar o tocar,
//     sin ir a Blazor (una llamada por movimiento del ratón sería lento). El texto va con saltos de línea y se escribe con
//     textContent: nunca como HTML, porque trae nombres de clientes y productos.
//   · el ancho disponible, para dibujar los gráficos legibles en el teléfono.
window.oppVentas = (function () {
    let globo = null, ref = null, espera = null, ultimo = 0, puesto = false, ojo = null;

    function crear() {
        if (globo && document.body.contains(globo)) return globo;
        globo = document.createElement('div');
        globo.className = 'fixed z-[90] pointer-events-none rounded-lg bg-gray-900 text-white text-xs leading-snug px-2.5 py-2 shadow-xl max-w-[18rem] whitespace-pre-line no-imprimir';
        globo.style.display = 'none';
        document.body.appendChild(globo);
        return globo;
    }
    function mostrar(e) {
        const el = e.target && e.target.closest ? e.target.closest('[data-t]') : null;
        if (!el || !el.closest('[data-vt]')) { ocultar(); return; }
        const g = crear();
        if (g.textContent !== el.getAttribute('data-t')) g.textContent = el.getAttribute('data-t');
        g.style.display = 'block';
        const m = 14, r = g.getBoundingClientRect();
        let x = e.clientX + m, y = e.clientY + m;
        if (x + r.width > window.innerWidth - 8) x = Math.max(8, e.clientX - r.width - m);
        if (y + r.height > window.innerHeight - 8) y = Math.max(8, e.clientY - r.height - m);
        g.style.left = x + 'px'; g.style.top = y + 'px';
    }
    function ocultar() { if (globo) globo.style.display = 'none'; }
    function medir() {
        const el = document.getElementById('vt-raiz');
        return Math.round(el ? el.clientWidth : window.innerWidth);
    }
    function alCambiar() {
        clearTimeout(espera);
        espera = setTimeout(function () {
            const w = medir();
            if (ref && Math.abs(w - ultimo) > 24) { ultimo = w; ref.invokeMethodAsync('CambioAncho', w).catch(function () { }); }
        }, 180);
    }
    return {
        iniciar: function (dotnet) {
            ref = dotnet;
            if (!puesto) {
                document.addEventListener('pointermove', mostrar, { passive: true });
                document.addEventListener('pointerdown', mostrar, { passive: true });
                document.addEventListener('scroll', ocultar, { passive: true, capture: true });
                window.addEventListener('resize', alCambiar);
                // el menú lateral también cambia el ancho, sin avisar con resize
                const raiz = document.getElementById('vt-raiz');
                if (raiz && window.ResizeObserver) { ojo = new ResizeObserver(alCambiar); ojo.observe(raiz); }
                puesto = true;
            }
            ultimo = medir();
            return ultimo;
        },
        ocultar: ocultar,
        terminar: function () {
            ref = null; ocultar();
            if (ojo) { ojo.disconnect(); ojo = null; }
            document.removeEventListener('pointermove', mostrar);
            document.removeEventListener('pointerdown', mostrar);
            document.removeEventListener('scroll', ocultar, { capture: true });
            window.removeEventListener('resize', alCambiar);
            puesto = false;
        }
    };
})();
