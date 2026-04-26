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
   