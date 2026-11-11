// Imprime un bloque de la pantalla en un marco aparte, con una hoja por
// seccion.
//
// Se importa como modulo desde Blazor:
//     var m = await JS.InvokeAsync<IJSObjectReference>("import", "./js/imprimirReporte.js");
//     await m.InvokeVoidAsync("imprimir", "reporte-lluvia", "landscape");
//
// POR QUE UN MARCO Y NO window.print() DIRECTO
//   La forma de antes escondia todo con visibility:hidden y sacaba el reporte
//   con position:absolute. Fuera del flujo, Chrome no respeta los saltos de
//   pagina: los graficos salian partidos entre dos hojas. En el marco el
//   reporte es lo unico que hay y fluye normal, asi que cada elemento con la
//   clase "hoja" empieza en una pagina nueva.
//
// El marco copia las hojas de estilo de la pagina (la de Tailwind incluida) y
// las variables del tema de la empresa, que viven en el style del <html>. No
// copia la clase "dark": se imprime siempre en claro.

export function imprimir(idElemento, orientacion) {
    const origen = document.getElementById(idElemento);
    if (!origen) return;

    const marco = document.createElement('iframe');
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(marco);

    const doc = marco.contentDocument;
    const estilos = [...document.querySelectorAll('link[rel="stylesheet"], style')]
        .map(n => n.outerHTML).join('\n');
    const base = document.querySelector('base')?.outerHTML ?? '';
    const tema = document.documentElement.getAttribute('style') ?? '';

    doc.open();
    doc.write(`<!doctype html><html style="${tema.replace(/"/g, '&quot;')}"><head><meta charset="utf-8">${base}${estilos}
<style>
  @page { size: ${orientacion === 'portrait' ? 'portrait' : 'landscape'}; margin: 8mm; }
  html, body { background: #fff !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-imprimir { display: none !important; }
  .solo-imprimir { display: flex !important; }
  .hoja { break-after: page; break-inside: avoid; }
  .hoja:last-of-type { break-after: auto; }
  svg { max-height: 150mm; }
</style></head><body>${origen.outerHTML}</body></html>`);
    doc.close();

    // Se imprime cuando terminaron de cargar los estilos y las imagenes (el
    // logo): si no, la primera hoja sale sin formato.
    const lanzar = () => {
        marco.contentWindow.focus();
        marco.contentWindow.print();
        setTimeout(() => marco.remove(), 1000);
    };
    if (doc.readyState === 'complete') setTimeout(lanzar, 300);
    else marco.addEventListener('load', () => setTimeout(lanzar, 300), { once: true });
}
