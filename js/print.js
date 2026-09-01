window.simonPrint = window.simonPrint || {};

// Abre el contenido del elemento en una ventana nueva e imprime.
// Usa inline styles del div #reporte-pago-print para evitar dependencias de CSS.
//
// `orientacion` es opcional y vale 'landscape' para las tablas anchas (el
// detalle de comisiones no entra en vertical). Omitirlo deja el comportamiento
// de siempre: vertical, que es lo que esperan los comprobantes de cobranza.
window.simonPrint.printReporte = function (elementId, titulo, orientacion) {
    var el = document.getElementById(elementId);
    if (!el) return;
    var win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    if (!win) return;
    var tituloDoc = (titulo && String(titulo).trim()) || 'Comprobante de Pago - SIMON 360';
    var horizontal = String(orientacion || '').toLowerCase() === 'landscape';
    win.document.write('<!DOCTYPE html><html><head>');
    win.document.write('<meta charset="utf-8">');
    win.document.write('<title>' + tituloDoc + '</title>');
    win.document.write('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" crossorigin="anonymous">');
    win.document.write('<style>');
    win.document.write(horizontal ? '@page{size:landscape;margin:8mm 10mm}' : '@page{margin:10mm 15mm}');
    win.document.write('body{font-family:Arial,sans-serif;margin:0;padding:0;}');
    win.document.write('img{max-width:100%;height:auto;}');
    // Todo el comprobante debe caber en UNA pagina: no partir filas ni bloques
    // (imagen, documentos aplicados, pie) entre paginas.
    win.document.write('tr{page-break-inside:avoid}');
    // Los reportes de varias hojas repiten el encabezado de la tabla en cada
    // una; sin esto la segunda pagina del detalle son numeros sin titulo.
    win.document.write('thead{display:table-header-group}');
    win.document.write('.salto-pagina{page-break-before:always}');
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

// ============================================================================
//  WHATSAPP CON EL RESUMEN DE LA ORDEN EN PDF
//
//  Del modulo de Cobranza se toma el CAMINO: Web Share API para pasarle el
//  archivo al panel del sistema en el telefono, y wa.me como respaldo en
//  escritorio. Lo que NO se toma es la tecnica de armar el archivo.
//
//  🚨 EL PDF SE DIBUJA, NO SE FOTOGRAFIA.
//     Cobranza captura el comprobante con html2canvas y mete esa imagen en el
//     archivo. Sirve para un comprobante de media pagina, pero para el resumen
//     de una orden es un mal negocio:
//       · pesa 10 veces mas, y esto viaja por WhatsApp con datos moviles;
//       · no se puede seleccionar, copiar ni buscar dentro;
//       · al hacer zoom se pixela, y el proveedor lo abre en un telefono;
//       · lo que se ve depende del tema y del ancho de la pantalla desde la
//         que se genero.
//     Dibujado con las primitivas de jsPDF el texto es texto: pesa unos pocos
//     KB, se copia, se busca y se imprime nitido.
//
//  ⚠️ La fuente base de jsPDF maneja Latin-1: las tildes y la ñ salen bien,
//     pero la raya larga y las comillas tipograficas no. Por eso _ascii()
//     las cambia antes de escribir; sin eso aparecen caracteres raros.
// ============================================================================

// Carga una libreria por CDN una sola vez.
window.simonPrint._cargarScript = function (url) {
    return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
};

// Arma la URL de WhatsApp. Sin telefono abre el selector de contactos, que es
// lo que hace Cobranza: el usuario elige a quien mandarselo.
window.simonPrint.urlWhatsApp = function (telefono, texto) {
    return 'https://wa.me/' + (telefono || '') + '?text=' + encodeURIComponent(texto || '');
};

// Abre WhatsApp (app o web) con el texto ya escrito.
window.simonPrint.abrirWhatsApp = function (telefono, texto) {
    window.open(window.simonPrint.urlWhatsApp(telefono, texto), '_blank');
    return true;
};

// Lo que la fuente base de jsPDF no sabe escribir.
window.simonPrint._ascii = function (t) {
    if (t === null || t === undefined) return '';
    return String(t)
        .replace(/[\u2014\u2013]/g, '-')      // rayas larga y media
        .replace(/[\u2018\u2019]/g, "'")      // comillas simples curvas
        .replace(/[\u201C\u201D]/g, '"')      // comillas dobles curvas
        .replace(/\u2026/g, '...')
        .replace(/[\u2022\u25B6\u25BA]/g, '>')
        .replace(/\u00A0/g, ' ');
};

// Dibuja el PDF a partir de los DATOS, no del HTML. Devuelve el Blob.
//
// Forma de `datos` (todo opcional salvo titulo):
//   { titulo, subtitulo, emitido,
//     campos:    [{ etiqueta, valor }],
//     mensaje:   "texto libre",
//     secciones: [{ titulo, columnas: [{ t, w, a }], filas: [[..]], resaltada }],
//     pie }
//   w = ancho en mm · a = 'l' | 'r' · resaltada = indice de fila a marcar
window.simonPrint.pdfResumen = async function (datos) {
    if (!datos) return null;

    try {
        if (typeof window.jspdf === 'undefined') {
            await window.simonPrint._cargarScript(
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        }

        var A   = window.simonPrint._ascii;
        var doc = new window.jspdf.jsPDF('p', 'mm', 'a4');

        var anchoPag = doc.internal.pageSize.getWidth();
        var altoPag  = doc.internal.pageSize.getHeight();
        var margen   = 14;
        var util     = anchoPag - margen * 2;
        var y        = margen;

        function salto(alto) {
            if (y + alto <= altoPag - margen) return false;
            doc.addPage();
            y = margen;
            return true;
        }

        function linea(color) {
            doc.setDrawColor(color[0], color[1], color[2]);
            doc.line(margen, y, anchoPag - margen, y);
        }

        // ── Cabecera ────────────────────────────────────────────────────
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(A(datos.subtitulo || 'SIMON 360'), margen, y);
        if (datos.emitido) {
            doc.text(A(datos.emitido), anchoPag - margen, y, { align: 'right' });
        }
        y += 6;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(30, 58, 138);
        doc.text(A(datos.titulo || ''), margen, y);
        y += 3;

        doc.setLineWidth(0.6);
        linea([29, 78, 216]);
        doc.setLineWidth(0.2);
        y += 6;

        // ── Campos ──────────────────────────────────────────────────────
        doc.setFontSize(10);
        (datos.campos || []).forEach(function (c) {
            if (!c || !c.valor) return;

            var valor = doc.splitTextToSize(A(c.valor), util - 32);
            salto(valor.length * 5 + 2);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(110, 110, 110);
            doc.text(A(c.etiqueta), margen, y);

            doc.setFont('helvetica', c.fuerte ? 'bold' : 'normal');
            doc.setTextColor(20, 20, 20);
            doc.text(valor, margen + 32, y);

            y += valor.length * 5;
        });

        // ── Mensaje ─────────────────────────────────────────────────────
        if (datos.mensaje) {
            y += 3;
            var msg = doc.splitTextToSize(A(datos.mensaje), util - 8);
            var altoCaja = msg.length * 5 + 6;
            salto(altoCaja + 4);

            doc.setFillColor(239, 246, 255);
            doc.rect(margen, y - 1, util, altoCaja, 'F');
            doc.setFillColor(29, 78, 216);
            doc.rect(margen, y - 1, 1.2, altoCaja, 'F');

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(20, 20, 20);
            doc.text(msg, margen + 4, y + 4);
            y += altoCaja + 4;
        }

        // ── Secciones con tabla ─────────────────────────────────────────
        (datos.secciones || []).forEach(function (sec) {
            if (!sec || !sec.filas || sec.filas.length === 0) return;

            var cols = sec.columnas || [];

            function cabecera() {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(90, 90, 90);
                doc.text(A(sec.titulo || '').toUpperCase(), margen, y);
                y += 3;

                doc.setFillColor(243, 244, 246);
                doc.rect(margen, y, util, 6, 'F');

                doc.setFontSize(9);
                doc.setTextColor(55, 65, 81);
                var x = margen;
                cols.forEach(function (c) {
                    var xx = c.a === 'r' ? x + c.w - 2 : x + 2;
                    doc.text(A(c.t), xx, y + 4, { align: c.a === 'r' ? 'right' : 'left' });
                    x += c.w;
                });
                y += 6;
            }

            y += 4;
            salto(24);
            cabecera();

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);

            sec.filas.forEach(function (fila, idx) {
                // Cuanto ocupa la fila: la celda que mas renglones necesite.
                var celdas = fila.map(function (v, i) {
                    return doc.splitTextToSize(A(v), (cols[i] ? cols[i].w : 40) - 4);
                });
                var renglones = Math.max.apply(null, celdas.map(function (c) { return c.length; }));
                var alto = renglones * 4.4 + 2.5;

                if (salto(alto)) cabecera();

                if (idx === sec.resaltada) {
                    doc.setFillColor(254, 249, 195);
                    doc.rect(margen, y, util, alto, 'F');
                }

                var x = margen;
                celdas.forEach(function (c, i) {
                    var col = cols[i] || { w: 40, a: 'l' };
                    var xx  = col.a === 'r' ? x + col.w - 2 : x + 2;
                    doc.setTextColor(20, 20, 20);
                    doc.text(c, xx, y + 4, { align: col.a === 'r' ? 'right' : 'left' });
                    x += col.w;
                });

                y += alto;
                doc.setDrawColor(229, 231, 235);
                doc.line(margen, y, anchoPag - margen, y);
            });
        });

        // ── Pie, en todas las paginas ───────────────────────────────────
        var paginas = doc.internal.getNumberOfPages();
        for (var i = 1; i <= paginas; i++) {
            doc.setPage(i);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(150, 150, 150);
            doc.text(A(datos.pie || ''), margen, altoPag - 8);
            doc.text(i + ' / ' + paginas, anchoPag - margen, altoPag - 8, { align: 'right' });
        }

        return doc.output('blob');
    } catch (e) {
        console.warn('[simonPrint] No se pudo armar el PDF del resumen:', e);
        return null;
    }
};

window.simonPrint._descargarBlob = function (blob, nombre) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
};

// Descarga el PDF, sin abrir WhatsApp.
window.simonPrint.descargarPdfResumen = async function (datos, nombreArchivo) {
    var blob = await window.simonPrint.pdfResumen(datos);
    if (!blob) return 'No se pudo armar el PDF.';

    window.simonPrint._descargarBlob(blob, (nombreArchivo || 'resumen') + '.pdf');
    return 'PDF descargado.';
};

// Arma el PDF y lo comparte por WhatsApp.
//
// Devuelve una frase de lo que REALMENTE paso, para que quede en la bitacora:
// no es lo mismo "se compartio por el panel del sistema" que "se descargo el
// PDF y se abrio la conversacion". La evidencia tiene que distinguirlo.
window.simonPrint.compartirPdfWhatsApp = async function (datos, nombreArchivo, texto, telefono) {
    var blob = await window.simonPrint.pdfResumen(datos);

    // Telefono: el panel del sistema, con el PDF adjunto.
    if (blob && typeof navigator.share === 'function') {
        try {
            var file = new File([blob], (nombreArchivo || 'resumen') + '.pdf',
                                { type: 'application/pdf' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: nombreArchivo || 'SIMON 360',
                    text: texto
                });
                return 'Compartido con el panel del sistema, con el PDF adjunto.';
            }
        } catch (e) {
            // El usuario cerro el panel: no es un error y no hay que insistir
            // abriendo WhatsApp por su cuenta.
            if (e.name === 'AbortError') return 'El usuario cancelo el envio.';
            console.warn('[simonPrint] Web Share fallo, se usa el respaldo:', e);
        }
    }

    // Escritorio: se descarga el PDF y se abre la conversacion con el texto.
    var mensaje;
    if (blob) {
        window.simonPrint._descargarBlob(blob, (nombreArchivo || 'resumen') + '.pdf');
        mensaje = 'PDF descargado y WhatsApp abierto: falta adjuntarlo en la conversacion.';
    } else {
        mensaje = 'WhatsApp abierto con el mensaje. No se pudo armar el PDF.';
    }

    window.open(window.simonPrint.urlWhatsApp(telefono, texto), '_blank');
    return mensaje;
};

