window.simonPrint = window.simonPrint || {};

// Abre el contenido del elemento en una ventana nueva e imprime.
// Usa inline styles del div #reporte-pago-print para evitar dependencias de CSS.
window.simonPrint.printReporte = function (elementId) {
    var el = document.getElementById(elementId);
    if (!el) return;
    var win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    if (!win) return;
    win.document.write('<!DOCTYPE html><html><head>');
    win.document.write('<meta charset="utf-8">');
    win.document.write('<title>Comprobante de Pago - SIMON 360</title>');
    win.document.write('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" crossorigin="anonymous">');
    win.document.write('<style>');
    win.document.write('@page{margin:10mm 15mm}');
    win.document.write('body{font-family:Arial,sans-serif;margin:0;padding:0;}');
    win.document.write('img{max-width:100%;height:auto;}');
    // Todo el comprobante debe caber en UNA pagina: no partir filas ni bloques
    // (imagen, documentos aplicados, pie) entre paginas.
    win.document.write('tr{page-break-inside:avoid}');
    win.document.write('@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}');
    win.document.write('</style>');
    win.document.write('</head><body>');
    win.document.write(el.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.focus();

    // Esperar a que las imagenes del comprobante terminen de cargar antes de
    // imprimir (una URL externa puede tardar mas que un delay fijo); tope 6s.
    var imgs = Array.from(win.document.images).filter(function (img) { return !img.complete; });
    var printed = false;
    function doPrint() {
        if (printed) return;
        printed = true;
        win.print();
    }
    if (imgs.length === 0) {
        setTimeout(doPrint, 400);
    } else {
        var pendientes = imgs.length;
        imgs.forEach(function (img) {
            function listo() { if (--pendientes <= 0) setTimeout(doPrint, 200); }
            img.addEventListener('load', listo);
            img.addEventListener('error', listo);
        });
        setTimeout(doPrint, 6000); // tope de seguridad
    }
};

// Comparte la imagen del comprobante usando el panel nativo del SO (Web Share API).
// En móvil (Android/iOS) abre el selector del sistema: el usuario elige WhatsApp y
// la imagen llega como foto en la conversación.
// En escritorio donde no hay Web Share con archivos, abre WhatsApp web con texto + URL.
window.simonPrint.compartirImagenWA = async function (imageUrl, texto, token) {
    // Intenta Web Share API con archivo (funciona en móvil)
    if (imageUrl && typeof navigator.share === 'function') {
        try {
            var fetchOpts = {};
            if (token) fetchOpts.headers = { 'Authorization': 'Bearer ' + token };

            var resp = await fetch(imageUrl, fetchOpts);
            if (resp.ok) {
                var blob = await resp.blob();
                var ext = (blob.type.split('/')[1] || 'jpg').split('+')[0];
                var file = new File([blob], 'comprobante.' + ext, { type: blob.type });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'Comprobante de Pago - SIMON 360',
                        text: texto
                    });
                    return;
                }
            }
        } catch (e) {
            console.warn('[simonPrint] compartirImagenWA - Web Share falló, usando fallback:', e);
        }
    }

    // Fallback para escritorio o sin imagen: WA web con texto + URL de imagen
    var msg = texto + (imageUrl ? '\n\n' + imageUrl : '');
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
};

// Abre WhatsApp (web o app) solo con texto (sin imagen).
window.simonPrint.compartirWhatsApp = function (texto) {
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
};

// Abre Gmail compose con asunto y cuerpo del comprobante.
window.simonPrint.compartirGmail = function (asunto, cuerpo) {
    window.open(
        'https://mail.google.com/mail/?view=cm&fs=1&su=' + encodeURIComponent(asunto) +
        '&body=' + encodeURIComponent(cuerpo),
        '_blank'
    );
};

// Captura el elemento indicado como imagen usando html2canvas y lo comparte
// con el selector nativo del sistema (Web Share API).
// En móvil: el usuario elige WhatsApp, Telegram, etc. desde el sheet del SO.
// En escritorio sin Web Share: cae a WhatsApp web con el texto.
window.simonPrint.compartirReporteNativo = async function (elementId, texto) {
    var el = document.getElementById(elementId);
    var blob = null;

    // Generar imagen del reporte si existe el elemento
    if (el) {
        try {
            if (typeof html2canvas === 'undefined') {
                await new Promise(function (resolve, reject) {
                    var s = document.createElement('script');
                    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
            }

            // Ocultar imágenes externas y su contenedor antes de capturar
            // (CORS en el servidor de imágenes impide que html2canvas las lea)
            var hiddenEls = [];
            el.querySelectorAll('img').forEach(function (img) {
                if (img.src && !img.src.startsWith('data:')) {
                    var container = img.closest('div') || img.parentElement;
                    if (container && container !== el) {
                        container.style.display = 'none';
                        hiddenEls.push(container);
                    } else {
                        img.style.display = 'none';
                        hiddenEls.push(img);
                    }
                }
            });

            var canvas = await html2canvas(el, {
                scale: 2,
                useCORS: false,
                allowTaint: false,
                backgroundColor: '#ffffff',
                logging: false
            });

            // Restaurar visibilidad
            hiddenEls.forEach(function (node) { node.style.display = ''; });

            blob = await new Promise(function (resolve) {
                canvas.toBlob(resolve, 'image/png');
            });
        } catch (e) {
            if (e.name === 'AbortError') return;
            console.warn('[simonPrint] Error generando imagen:', e);
        }
    }

    // Intentar compartir con imagen via native share (móvil)
    if (blob && typeof navigator.share === 'function') {
        try {
            var file = new File([blob], 'comprobante-simon360.png', { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Comprobante SIMON 360',
                    text: texto
                });
                return;
            }
        } catch (e) {
            if (e.name === 'AbortError') return;
            console.warn('[simonPrint] Native share falló:', e);
        }
    }

    // Fallback: descargar imagen + abrir WhatsApp con el texto
    if (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'comprobante-simon360.png';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
};

// Descarga una imagen usando fetch (con token de localStorage) y la devuelve como data-URI base64.
// Esto permite mostrar imágenes protegidas por autenticación dentro de tags <img>.
window.simonPrint.fetchImageAsBase64 = async function (url) {
    try {
        var tokenEnc = localStorage.getItem('authToken');
        var headers = {};
        if (tokenEnc) {
            try {
                var token = await window.cryptoInterop.decryptData(tokenEnc);
                if (token) headers['Authorization'] = 'Bearer ' + token;
            } catch (e) { }
        }
        var resp = await fetch(url, { headers: headers });
        if (!resp.ok) return null;
        var blob = await resp.blob();
        return await new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onloadend = function () { resolve(reader.result); };
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('[simonPrint] fetchImageAsBase64 falló:', e);
        return null;
    }
};

window.simonPrint.openUrls = function (urls) {
    if (!Array.isArray(urls) || urls.length === 0) {
        return false;
    }

    for (var i = 0; i < urls.length; i++) {
        var win = window.open(urls[i], "_blank");
        if (!win) {
            return false;
        }
    }

    return true;
};

window.simonPrint.printAndClose = function (delayMs) {
    var initialDelay = typeof delayMs === "number" ? delayMs : 800;
    var maxWaitMs = 12000; // máximo 12 segundos esperando iframes

    function doPrint() {
        try { window.focus(); window.print(); } catch (e) { }
        setTimeout(function () {
            try { window.close(); } catch (e) { }
        }, 600);
    }

    setTimeout(function () {
        var iframes = Array.from(document.querySelectorAll('iframe'));
        if (iframes.length === 0) {
            doPrint();
            return;
        }

        var loaded = 0;
        var total = iframes.length;
        var done = false;

        var fallback = setTimeout(function () {
            if (!done) { done = true; doPrint(); }
        }, maxWaitMs);

        iframes.forEach(function (iframe) {
            // Si ya cargó (readyState complete dentro del iframe)
            try {
                if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                    loaded++;
                    if (loaded >= total && !done) {
                        done = true;
                        clearTimeout(fallback);
                        setTimeout(doPrint, 400);
                    }
                    return;
                }
            } catch (e) { }

            iframe.addEventListener('load', function () {
                loaded++;
                if (loaded >= total && !done) {
                    done = true;
                    clearTimeout(fallback);
                    setTimeout(doPrint, 400); // pequeño buffer tras la última carga
                }
            });
        });
    }, initialDelay);
};
