    window.focusElement = (id) => { document.getElementById(id)?.focus(); };

    // Descarga desde bytes (Blazor pasa el array, se crea blob local — sin CORS)
    window.downloadFromBytes = (bytes, fileName) => {
        const blob = new Blob([new Uint8Array(bytes)]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Descarga directa desde URL (sin header de auth — para URLs con acceso propio)
    window.downloadFromUrl = async (url, fileName) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
    };

    // Descarga autenticada de archivos
    window.downloadFileWithToken = async (url, fileName, token) => {
        const response = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!response.ok) throw new Error('Error al descargar el archivo');
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
    };

    //Home
    window.resetCarouselToStart = async (index) => {
        const carousel = document.getElementById(`carousel-${index}`);
    if (!carousel) return;
    carousel.scrollTo({left: 0, behavior: 'instant' });
    try {
            if (window.__blazor_dotnet_ref && window.__blazor_dotnet_ref.invokeMethodAsync) {
        await window.__blazor_dotnet_ref.invokeMethodAsync("UpdateCarouselIndex", index, 0);
            }
        } catch (e) {console.warn("resetCarouselToStart error", e); }
    };

    window.initScrollCarousels = (dotNetRef) => {
        window.__blazor_dotnet_ref = dotNetRef;
    const carousels = document.querySelectorAll("[id^='carousel-']");
        carousels.forEach((carousel) => attachScrollListener(carousel, dotNetRef));
    };

    window.initCarouselByIndex = (dotNetRef, index) => {
        window.__blazor_dotnet_ref = dotNetRef;
    const carousel = document.getElementById(`carousel-${index}`);
    if (!carousel || carousel.__blazor_scroll_inited) return;
    attachScrollListener(carousel, dotNetRef);
    };

    function attachScrollListener(carousel, dotNetRef) {
        if (carousel.__blazor_scroll_inited) return;
    carousel.__blazor_scroll_inited = true;

    let isThrottled = false;
        carousel.addEventListener("scroll", () => {
            if (isThrottled) return;
    isThrottled = true;
            setTimeout(() => {
                const cards = Array.from(carousel.children);
    if (cards.length === 0) return;
    const marginRight = parseInt(getComputedStyle(cards[0]).marginRight) || 0;
    const cardWidth = cards[0].offsetWidth + marginRight;
    const index = Math.round(carousel.scrollLeft / cardWidth);
    const sectionIndex = parseInt(carousel.dataset.sectionIndex);
                dotNetRef?.invokeMethodAsync("UpdateCarouselIndex", sectionIndex, index).catch(()=>{ });
    isThrottled = false;
            }, 150);
        }, {passive: true });
    }

    window.navigateCarousel = (sectionIndex, direction) => {
        const carousel = document.getElementById(`carousel-${sectionIndex}`);
    if (!carousel) return;
    const cards = Array.from(carousel.children);
    if (cards.length === 0) return;
    const marginRight = parseInt(getComputedStyle(cards[0]).marginRight) || 0;
    const cardWidth = cards[0].offsetWidth + marginRight;
    carousel.scrollTo({left: carousel.scrollLeft + (direction * cardWidth), behavior: 'smooth' });
    };

    window.scrollToSection = (index) => {
        const element = document.getElementById(`section-${index}`);
    element?.scrollIntoView({behavior: "smooth", block: "start" });
    };

    // Lleva a un elemento y lo resalta un instante.
    //
    // Recibe un SELECTOR y no un id, y entre todos los que coinciden se queda
    // con el que esta VISIBLE. Eso es lo importante: las pantallas con vista
    // de movil y vista de escritorio dibujan el mismo dato dos veces y ocultan
    // una con display:none. getElementById devolvia siempre la primera, que en
    // escritorio es la de movil — y scrollIntoView sobre un elemento oculto no
    // hace nada, ni falla. El salto se perdia en silencio.
    //
    // offsetParent === null es la prueba de que el elemento (o alguno de sus
    // padres) esta en display:none.
    //
    // block e inline en "center" a proposito: en el IIT la lista de escritorio
    // es un carrusel HORIZONTAL, asi que centrar solo en vertical no alcanza
    // para traer a la vista una tarjeta corrida hacia la derecha.
    //
    // El destello no es decoracion: si la tarjeta ya se estaba viendo, el
    // scroll no mueve nada y sin el parpadeo el click parece perdido.
    window.scrollAVisible = (selector) => {
        const el = Array.from(document.querySelectorAll(selector))
                        .find(e => e.offsetParent !== null);
        if (!el) return false;

        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

        el.classList.add("destello-foco");
        setTimeout(() => el.classList.remove("destello-foco"), 1600);
        return true;
    };

    window.getScreenWidth = () => window.innerWidth;

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll("[id^='carousel-']").forEach((carousel) => {
            let isDown = false, startX, scrollLeft;
            carousel.addEventListener("mousedown", (e) => {
                isDown = true; startX = e.pageX - carousel.offsetLeft; scrollLeft = carousel.scrollLeft;
            });
            carousel.addEventListener("mouseleave", () => isDown = false);
            carousel.addEventListener("mouseup", () => isDown = false);
            carousel.addEventListener("mousemove", (e) => {
                if (!isDown) return;
                e.preventDefault();
                const walk = (e.pageX - carousel.offsetLeft - startX);
                carousel.scrollLeft = scrollLeft - walk;
            });
        });
    });
   
// ── Barra de pestañas: traer la activa a la vista ────────────────────
// En teléfono la tira desborda casi siempre, y al navegar la pestaña de
// la pantalla en la que uno acaba de entrar puede quedar fuera de cuadro.
// Sin esto la barra dice la verdad pero no se ve, que para el caso es lo
// mismo que no decirla.
//
// Recibe la CLASE de la pestaña activa y no un id: el componente Blazor no
// le pone id a cada una, y aria-selected ya distingue a la activa sin
// inventar otro atributo.
window.pestanasVerActiva = () => {
    const activa = document.querySelector('.pestanas-tira [role="tab"][aria-selected="true"]');
    if (!activa) return;

    // 'nearest' y no 'center': si la pestaña YA se ve, no se mueve nada.
    // Centrarla siempre haría saltar la tira en cada navegación, incluso
    // cuando no hacía falta.
    //
    // Y 'auto' y no 'smooth': con smooth medimos scrollLeft = 0 despues de
    // llamarlo, o sea que NO scrolleaba. El scroll suave no corre en todos
    // los contextos --entre otros, con "reducir movimiento" activado en el
    // sistema-- y ahi la pestana se quedaba fuera de cuadro. Un salto seco
    // es lo que hacen los navegadores con sus propias pestanas, y sobre
    // todo es el que siempre ocurre.
    activa.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
};

// ── Pantallas vivas ─────────────────────────────────────
// Las pantallas abiertas quedan TODAS montadas en el DOM y se muestra una.
// Que la visibilidad la mueva el JS y no Blazor es a proposito: si Blazor
// redibujara el envoltorio para mostrar u ocultar, le volveria a pasar los
// parametros a la pagina y correria su OnParametersSet --o sea, la recargaria,
// que es justo lo que las pestanas existen para evitar. Ver
// Layout/VistaConPestanas.cs y Layout/PantallaViva.cs.
window.pantallasVivas = {

    // El scroll es parte de la pestana. Volver a un informe largo y aparecer
    // arriba de todo se siente igual que si se hubiera recargado, aunque el
    // contenido este intacto.
    scroll: {},

    ocultar: function (claveSaliente) {
        if (claveSaliente) this.scroll[claveSaliente] = window.scrollY;
        document.querySelectorAll('[data-pantalla]').forEach(function (el) {
            el.style.display = 'none';
        });
    },

    mostrar: function (clave) {
        var encontrada = null;

        document.querySelectorAll('[data-pantalla]').forEach(function (el) {
            if (el.dataset.pantalla === clave) {
                el.style.display = '';
                encontrada = el;
            } else {
                el.style.display = 'none';
            }
        });

        if (!encontrada) return;

        window.scrollTo(0, this.scroll[clave] || 0);

        // Un mapa que se dibujo mientras su pantalla estaba escondida quedo
        // midiendo cero: display:none no le da alto a nada. Leaflet no se
        // entera de que su contenedor cambio de tamano --eso no dispara
        // ningun evento-- pero si escucha el resize de la ventana, y ahi
        // vuelve a medirse solo. Es un aviso general: sirve para cualquier
        // cosa que dependa del tamano, no solo para los mapas.
        window.dispatchEvent(new Event('resize'));
    },

    // Cuales de las pantallas montadas tienen algo escrito sin guardar.
    //
    // NO se compara el valor de los campos contra el que traian. Se probo y
    // no sirve: Blazor asigna el value de un input como PROPIEDAD del DOM y
    // no como atributo, asi que defaultValue queda vacio y todo lo que vino
    // cargado del API parece escrito por el usuario --con eso quedaban
    // protegidas TODAS las pantallas y el tope no servia de nada. Medido:
    // un informe recien abierto, sin tocar una tecla, salia con cambios.
    //
    // Lo que se mira es si el usuario tecleo de verdad ahi. Un input o un
    // change solo los dispara una persona: escribir un valor por codigo no
    // los emite. La marca vive en el ELEMENTO, en un WeakSet, y no en una
    // lista de rutas: asi muere con la pantalla, y una que se cerro y se
    // volvio a abrir arranca limpia aunque se llame igual.
    tocadas: new WeakSet(),

    anotar: function (destino) {
        var el = destino && destino.closest ? destino.closest('[data-pantalla]') : null;
        if (el) window.pantallasVivas.tocadas.add(el);
    },

    conCambios: function () {
        var sucias = [];
        var yo = this;

        document.querySelectorAll('[data-pantalla]').forEach(function (el) {
            if (yo.tocadas.has(el)) sucias.push(el.dataset.pantalla);
        });

        return sucias;
    }
};

// En captura, para que llegue igual si algo detiene la propagacion en el medio.
document.addEventListener('input', function (e) { window.pantallasVivas.anotar(e.target); }, true);
document.addEventListener('change', function (e) { window.pantallasVivas.anotar(e.target); }, true);


// ── El titulo de la ventana ─────────────────────────────
// Con varias pantallas montadas a la vez, el <PageTitle> de una ESCONDIDA
// puede ganar: estando en Lotes el navegador decia "Editar Labor". Adentro
// de SIMON no se nota --la tira ya dice donde uno esta-- pero si en la
// pestana del navegador y en el historial.
//
// Manda la pestana activa, y se vigila el <title> porque las 11 pantallas
// que declaran PageTitle lo reescriben cada vez que se redibujan: una que
// termina de cargar en segundo plano pisaria el titulo sin esto.
window.pestanasTitulo = {
    base: document.title,
    deseado: null,
    observando: false,

    poner: function (etiqueta) {
        this.deseado = (etiqueta && etiqueta.trim()) ? etiqueta.trim() : null;
        this.aplicar();
        this.vigilar();
    },

    aplicar: function () {
        var quiero = this.deseado || this.base;
        if (document.title !== quiero) document.title = quiero;
    },

    vigilar: function () {
        if (this.observando) return;
        var titulo = document.querySelector('title');
        if (!titulo) return;

        this.observando = true;
        var yo = this;
        new MutationObserver(function () { yo.aplicar(); })
            .observe(titulo, { childList: true, characterData: true, subtree: true });
    }
};

// ── Notificaciones push ─────────────────────────────────────────────
// El navegador entrega una suscripcion; el API la guarda y despues puede
// despertar al dispositivo aunque SIMON este cerrado. Los handlers que
// muestran la notificacion viven en el service worker.
window.simonPush = {

    // Que puede y que no este navegador, para que la pantalla no ofrezca
    // algo que no va a funcionar.
    estado: function () {
        const soportado = 'serviceWorker' in navigator && 'PushManager' in window;

        // En iPhone, Web Push SOLO funciona con la app agregada a la pantalla
        // de inicio. Abierta en Safari como pagina normal no llega nada, y no
        // hay forma de forzarlo: hay que decirselo al usuario.
        const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const instalada = window.matchMedia('(display-mode: standalone)').matches
                       || window.navigator.standalone === true;

        return {
            soportado: soportado,
            permiso: soportado ? Notification.permission : 'denied',
            esIOS: esIOS,
            instalada: instalada,
            // La unica combinacion que no tiene arreglo desde el codigo.
            requiereInstalar: esIOS && !instalada,
            // Sin service worker controlando la pagina no hay push posible.
            // Pasa en la primera carga despues de actualizar el worker: el
            // nuevo queda esperando y todavia no tomo el control.
            swControlando: soportado && navigator.serviceWorker.controller !== null
        };
    },

    // Pide permiso y se suscribe. Devuelve la suscripcion lista para mandar
    // al API, o un objeto con el motivo por el que no se pudo.
    suscribir: async function (clavePublica) {
        try {
            const e = window.simonPush.estado();
            if (!e.soportado) return { ok: false, motivo: 'Este navegador no soporta notificaciones.' };
            if (e.requiereInstalar) return { ok: false, motivo: 'En iPhone hay que agregar SIMON a la pantalla de inicio para recibir notificaciones.' };

            const permiso = await Notification.requestPermission();
            if (permiso !== 'granted') {
                // Denegado no se puede volver a preguntar por codigo: el
                // usuario tiene que habilitarlo desde el navegador.
                return { ok: false, motivo: permiso === 'denied'
                    ? 'El permiso quedo bloqueado. Hay que habilitarlo desde la configuracion del navegador.'
                    : 'No se dio el permiso.' };
            }

            const registro = await navigator.serviceWorker.ready;

            // Si ya habia una suscripcion se reusa: volver a suscribirse
            // genera otro endpoint y el API termina con dos por dispositivo.
            let suscripcion = await registro.pushManager.getSubscription();

            if (!suscripcion) {
                suscripcion = await registro.pushManager.subscribe({
                    // Obligatorio en Chrome: no se aceptan push silenciosos.
                    userVisibleOnly: true,
                    applicationServerKey: window.simonPush._aBytes(clavePublica)
                });
            }

            const json = suscripcion.toJSON();
            return {
                ok: true,
                endpoint: json.endpoint,
                p256dh: json.keys.p256dh,
                auth: json.keys.auth
            };
        } catch (err) {
            return { ok: false, motivo: (err && err.message) || 'No se pudo suscribir.' };
        }
    },

    // El endpoint actual, para poder darlo de baja en el API.
    endpointActual: async function () {
        try {
            const registro = await navigator.serviceWorker.ready;
            const s = await registro.pushManager.getSubscription();
            return s ? s.endpoint : null;
        } catch { return null; }
    },

    desuscribir: async function () {
        try {
            const registro = await navigator.serviceWorker.ready;
            const s = await registro.pushManager.getSubscription();
            if (s) await s.unsubscribe();
            return true;
        } catch { return false; }
    },

    // La clave VAPID viaja en base64url y subscribe() la pide en bytes.
    _aBytes: function (base64url) {
        const relleno = '='.repeat((4 - base64url.length % 4) % 4);
        const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/');
        const crudo = window.atob(base64);
        const bytes = new Uint8Array(crudo.length);
        for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
        return bytes;
    }
};
