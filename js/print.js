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
    win.document.write('@page{margin:15mm 20mm}');
    win.document.write('body{font-family:Arial,sans-serif;margin:0;padding:0;}');
    win.document.write('img{max-width:100%;height:auto;}');
    win.document.write('@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}');
    win.document.write('</style>');
    win.document.write('</head><body>');
    win.document.write(el.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(function () { win.print(); }, 800);
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

    if (el && typeof navigator.share === 'function') {
        try {
            // Cargar html2canvas dinámicamente si no está disponible
            if (typeof html2canvas === 'undefined') {
                await new Promise(function (resolve, reject) {
                    var s = document.createElement('script');
                    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
            }

            var canvas = await html2canvas(el, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false
            });

            var blob = await new Promise(function (resolve) {
                canvas.toBlob(resolve, 'image/png');
            });

            var file = new File([blob], 'comprobante-simon360.png', { type: 'image/png' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Comprobante de Pago - SIMON 360',
                    text: texto
                });
                return;
            }
        } catch (e) {
            if (e.name === 'AbortError') return; // usuario canceló
            console.warn('[simonPrint] compartirReporteNativo falló, usando fallback:', e);
        }
    }

    // Fallback: texto por WhatsApp web
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
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
