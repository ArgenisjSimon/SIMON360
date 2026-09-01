// ============================================================
// La rueda del mouse sobre un campo de fecha.
//
// Un <input type="date"> nativo no hace nada con la rueda: para correr
// un dia hay que abrir el calendario y buscarlo a mano. En el monitor
// las fechas se mueven todo el tiempo — "corre un dia", "mirame el mes
// pasado" — y esos clicks de mas, repetidos, cansan.
//
// Va en JS y no con el @onwheel de Blazor porque Blazor engancha sus
// eventos en el document, y Chrome trata los wheel del document como
// passive: ahi preventDefault() se ignora, asi que la fecha cambiaria
// y ADEMAS la pagina scrollearia detras. Enganchado al elemento con
// passive:false eso no pasa.
//
// Lo usa: Pages/MonitorCampo.razor
// ============================================================
window.ruedaFecha = (function () {

    // Cuanto delta acumulado vale un paso.
    var UMBRAL = 50;

    // Firefox manda deltaMode 1 (lineas, ~3 por muesca) y Chrome manda 0
    // (pixeles, ~100 por muesca). Sin normalizar, un umbral pensado para
    // uno no se alcanza nunca en el otro.
    function aPixeles(ev) {
        if (ev.deltaMode === 1) return ev.deltaY * 16;    // lineas
        if (ev.deltaMode === 2) return ev.deltaY * 100;   // paginas
        return ev.deltaY;
    }

    function conectar(el, ref, campo) {
        // Idempotente a proposito: el componente reconecta cada vez que
        // los campos vuelven a aparecer, y sin esta marca cada vuelta
        // sumaria otro listener sobre el mismo elemento.
        if (!el || el.dataset.ruedaFecha === "1") return;
        el.dataset.ruedaFecha = "1";

        // El trackpad manda decenas de eventos chiquitos por gesto. Si
        // cada uno moviera un dia, un roce se llevaria el mes entero:
        // se acumula, y recien al pasar el umbral se avisa a .NET.
        var acumulado = 0;

        el.addEventListener("wheel", function (ev) {
            var delta = aPixeles(ev);
            if (!delta) return;

            ev.preventDefault();

            acumulado += delta;
            if (Math.abs(acumulado) < UMBRAL) return;

            var pasos = Math.trunc(acumulado / UMBRAL);
            acumulado -= pasos * UMBRAL;

            // Rueda arriba suma, como en cualquier campo numerico: por
            // eso el signo va invertido, que deltaY es positivo al bajar.
            ref.invokeMethodAsync("RuedaSobreFecha", campo, -pasos, ev.shiftKey);
        }, { passive: false });
    }

    return { conectar: conectar };
})();
