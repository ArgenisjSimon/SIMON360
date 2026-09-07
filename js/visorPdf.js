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
    }
};
