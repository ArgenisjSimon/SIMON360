// mciMenuFlotante.js — menú flotante del MÓDULO DE CONTEO DE INVENTARIO (MCI)
//
// Se carga como módulo desde ConteoInventario.razor (import dinámico): no está
// en index.html. F-022 (aprobado por Claudio el 13OCT2026): la pestaña "Menú Conteo"
// es un objeto flotante, separado de los bordes, que se arrastra a cualquier
// parte de la pantalla y recuerda dónde quedó. No ocupa franja: el contenido usa
// todo el ancho.
//
// Lo que hace este archivo: mover la pestaña y decidir hacia qué lado se abre el
// menú (data-lado = der | izq, data-v = arriba | abajo). Abrir y cerrar lo
// decide Blazor: un toque sin moverse llama a AlternarMenuDesdeJs. Arrastrar no
// es tocar, así que un arrastre nunca abre ni cierra el menú.
//
// LÍMITES (corrección de Claudio, 13OCT2026): la pestaña nunca queda debajo de
// la barra fija de SIMON (#navbar, que crece una fila cuando hay pestañas) ni
// del panel lateral (#drawer-navigations) cuando está abierto. Por defecto se
// ubica arriba a la izquierda del contenido del módulo.

const CLAVE = 'mci.menu.pos';
const M = 8;   // separación mínima de los bordes

// Lo más alto que puede llegar: justo debajo de la barra de SIMON
function techo() {
    const nav = document.getElementById('navbar');
    const r = nav ? nav.getBoundingClientRect() : null;
    return (r && r.height > 0 ? Math.max(0, r.bottom) : 0) + M;
}

// Lo más a la izquierda: a la derecha del panel lateral de SIMON si está a la vista
function bordeIzq() {
    const d = document.getElementById('drawer-navigations');
    if (!d) return M;
    const r = d.getBoundingClientRect(), cs = getComputedStyle(d);
    const visible = r.width > 0 && r.right > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
    return (visible ? r.right : 0) + M;
}

export function iniciar(el, dotnet) {
    if (!el || el.dataset.listo) return;
    el.dataset.listo = '1';
    const tab = el.querySelector('[data-mf-tab]');
    if (!tab) return;

    const ubicar = (x, y) => {
        const w = tab.offsetWidth || 36, h = tab.offsetHeight || 160;
        x = Math.min(innerWidth - w - M, Math.max(bordeIzq(), x));
        y = Math.min(innerHeight - h - M, Math.max(techo(), y));
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        // el menú se abre del lado con más espacio y crece hacia donde cabe
        el.dataset.lado = x + w / 2 > innerWidth / 2 ? 'izq' : 'der';
        el.dataset.v = y + h / 2 > innerHeight / 2 ? 'abajo' : 'arriba';
    };

    // Por defecto: a la altura de las opciones de conteo; en computadora a la izquierda del
    // contenido (en el margen si lo hay) y en el celular a la derecha (Claudio, 13OCT2026).
    const porDefecto = () => {
        const z = (el.parentElement || el).getBoundingClientRect(), w = tab.offsetWidth || 36;
        const x = innerWidth < 768 ? innerWidth - w - M
            : z.left - w - 6 >= bordeIzq() ? z.left - w - 6 : z.left;
        return [x, Math.max(techo(), z.top + scrollY)];   // a la altura del contenido con la página arriba
    };

    // Mientras el usuario no la mueva, la pestaña acompaña al contenido del módulo (la página
    // termina de acomodarse después de dibujarla); una vez arrastrada, se queda donde la dejó.
    let p = null;
    try { p = JSON.parse(localStorage.getItem(CLAVE)); } catch { }
    let manual = !!(p && p.x != null && p.y != null);
    if (manual) ubicar(p.x, p.y); else ubicar(...porDefecto());

    // Si la barra de SIMON cambia de alto (aparecen o se van sus pestañas) o la ventana
    // cambia de tamaño, la pestaña vuelve a quedar dentro de los límites.
    const reajustar = () => { if (!el.isConnected) return; if (manual) ubicar(el.offsetLeft, el.offsetTop); else ubicar(...porDefecto()); };
    for (const ms of [150, 600, 1500]) setTimeout(reajustar, ms);
    addEventListener('resize', reajustar);
    const nav = document.getElementById('navbar');
    if (nav && 'ResizeObserver' in window) new ResizeObserver(reajustar).observe(nav);

    let ini = null, movio = false;
    tab.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        ini = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop };
        movio = false;
        try { tab.setPointerCapture(e.pointerId); } catch { }
    });
    tab.addEventListener('pointermove', e => {
        if (!ini) return;
        const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
        if (!movio && Math.hypot(dx, dy) < 5) return;
        movio = true;
        el.classList.add('arrastrando');
        ubicar(ini.l + dx, ini.t + dy);
    });
    const soltar = () => {
        if (!ini) return;
        ini = null;
        el.classList.remove('arrastrando');
        if (movio) { manual = true; try { localStorage.setItem(CLAVE, JSON.stringify({ x: el.offsetLeft, y: el.offsetTop })); } catch { } }
    };
    tab.addEventListener('pointerup', soltar);
    tab.addEventListener('pointercancel', soltar);

    // Toque o teclado (Enter / Espacio) sin arrastre: abre o recoge el menú
    tab.addEventListener('click', () => {
        if (movio) { movio = false; return; }
        dotnet.invokeMethodAsync('AlternarMenuDesdeJs');
    });
}

// Pantalla completa del navegador (si el equipo la permite; en iPhone no existe y no pasa nada)
export async function pantallaCompleta(activar) {
    try {
        if (activar && !document.fullscreenElement && document.documentElement.requestFullscreen)
            await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        else if (!activar && document.fullscreenElement && document.exitFullscreen)
            await document.exitFullscreen();
    } catch { /* el navegador la rechazó: queda la pantalla completa dentro de la página */ }
}
