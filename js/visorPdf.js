// ============================================================================
// Ayudas para ver un PDF cómodo en la tablet.
//
// El reporte llega como data: URI y se muestra dentro de un iframe. En una
// tablet eso queda chico: el visor de Chrome abre el panel de miniaturas, que
// se come un tercio del ancho, y el PDF entra a escala de página completa.
//
// Estas dos funciones son lo que hace falta para que el operador pueda leer la
// boleta sin pellizcar la pantalla.
// ============================================================================
window.visorPdf = {

    /// Pone el iframe a pantalla completa. Es lo que de verdad sirve en una
    /// tablet: el PDF pasa de ocupar media pantalla a ocuparla toda.
    ///
    /// Devuelve false si el navegador no deja (algunos iOS), para poder decirlo
    /// en vez de dejar un botón que no hace nada.
    async pantallaCompleta(id) {
        const el = document.getElementById(id);
        if (!el) return false;

        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
                return true;
            }
            if (el.requestFullscreen) { await el.requestFullscreen(); return true; }
            if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); return true; }
            return false;
        } catch (e) {
            return false;
        }
    },

    /// Baja el PDF con un nombre que se entienda. Sin esto el navegador lo
    /// guarda como "descarga.pdf" y en la tablet del operador terminan
    /// veinte archivos que no se distinguen entre sí.
    descargar(dataUri, nombre) {
        const a = document.createElement("a");
        a.href = dataUri;
        a.download = nombre || "boleto.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
    },

    /// Arma un blob: URL con los bytes del PDF (Facturación: la factura en su
    /// forma pre-impresa). Con blob: y no data: porque un iframe con data: es
    /// de otro origen y desde la página no se lo puede mandar a imprimir.
    /// Si se pasa la URL anterior, se libera.
    urlDesdeBytes(bytes, anterior) {
        if (anterior) { try { URL.revokeObjectURL(anterior); } catch (e) { } }
        const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
        return URL.createObjectURL(blob);
    },

    /// Imprime el PDF que está en el iframe. Si el navegador no deja imprimir
    /// el iframe, abre el PDF en otra pestaña para imprimirlo desde ahí.
    /// Devuelve false en ese caso, para poder avisarlo.
    imprimir(id) {
        const el = document.getElementById(id);
        if (!el) return false;
        try {
            el.contentWindow.focus();
            el.contentWindow.print();
            return true;
        } catch (e) {
            window.open(el.src, "_blank");
            return false;
        }
    }
};
