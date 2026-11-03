// manual.js — comportamiento de la página Razor ManualConteoInventario (P-064, 16OCT2026).
// Se carga como módulo desde la página (import dinámico): no está en index.html.
//
//  · Los enlaces del índice y del texto (href="#tema") desplazan la página hasta el tema. Con
//    <base href="/"> un "#tema" pelado llevaría al inicio de SIMON 360: aquí se intercepta.
//  · En el celular el índice empieza plegado y se pliega al elegir un tema; en pantalla ancha
//    queda siempre abierto (lo mismo que hacía el manual .html).

export function iniciar(raiz) {
    if (!raiz || raiz.dataset.mciManual === '1') return;
    raiz.dataset.mciManual = '1';

    raiz.addEventListener('click', e => {
        const a = e.target.closest && e.target.closest('a[href^="#"]');
        if (!a || !raiz.contains(a)) return;
        const id = decodeURIComponent(a.getAttribute('href').slice(1));
        const destino = id && raiz.querySelector('#' + CSS.escape(id));
        if (!destino) return;
        e.preventDefault();
        destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
        try { history.replaceState(history.state, '', location.pathname + location.search + '#' + id); } catch { }
    });

    const d = raiz.querySelector('#toc-d');
    if (d) {
        const m = window.matchMedia('(max-width:900px)');
        const ajustar = () => { if (m.matches) d.removeAttribute('open'); else d.setAttribute('open', ''); };
        ajustar();
        if (m.addEventListener) m.addEventListener('change', ajustar);
        d.querySelector('summary')?.addEventListener('click', e => { if (!m.matches) e.preventDefault(); });
        d.addEventListener('click', e => { if (m.matches && e.target.closest('a')) d.removeAttribute('open'); });
    }

    // si se entró con un tema en la dirección (ManualConteoInventario#ajuste), ir a él
    const h = decodeURIComponent((location.hash || '').slice(1));
    if (h) { const t = raiz.querySelector('#' + CSS.escape(h)); if (t) setTimeout(() => t.scrollIntoView({ block: 'start' }), 50); }
}
