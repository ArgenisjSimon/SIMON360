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
   