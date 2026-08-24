// ─────────────────────────────────────────────────────────────────────────────
// ARRASTRAR Y SOLTAR DEL TABLERO DE TALLER
//
// POR QUE ESTO NO SE HACE CON @ondragstart / @ondrop DE BLAZOR
//
// La Fase 1 lo intento asi y no funciono, reportado dos veces. Dos motivos
// distintos, y cada uno solo bastaria para romperlo:
//
//   1. `@ondragover:preventDefault` sin un handler `@ondragover` de verdad no
//      garantiza que el navegador reciba el preventDefault(). Sin ese
//      preventDefault sobre dragover, el navegador NO considera valido el
//      destino y el evento `drop` no se dispara nunca. Se puede forzar
//      agregando un handler C# de dragover, pero entonces se cae en el (2).
//
//   2. Un handler C# en dragover se invoca decenas de veces por segundo, y
//      cada invocacion dispara un re-render del componente. Blazor puede
//      reemplazar el nodo que se esta arrastrando a mitad del gesto, y el
//      navegador cancela el arrastre. Los `@key` de la Fase 1 reducen el
//      riesgo, no lo eliminan.
//
// Ademas Firefox exige dataTransfer.setData() en dragstart o directamente no
// inicia el arrastre, y Blazor no deja escribir en DataTransfer desde C#.
//
// La solucion es que el gesto viva entero en el DOM —donde no cuesta nada— y
// que a C# llegue UNA sola llamada, la del drop. El resaltado de la columna
// destino se hace agregando y quitando clases a mano, sin pasar por Blazor.
//
// Un solo par de listeners delegados en el contenedor del tablero, no uno por
// tarjeta: las tarjetas se crean y se destruyen en cada recarga, y los
// listeners delegados sobreviven a eso sin tener que reengancharlos.
// ─────────────────────────────────────────────────────────────────────────────
window.mttoTablero = (function () {

    // Estado del gesto en curso. Se guarda aca y no en un data-* del DOM
    // porque en dragover/dragenter el navegador oculta el contenido del
    // dataTransfer por seguridad: solo se puede leer en drop.
    let arrastrada = null;    // id de la orden que se esta moviendo
    let grupoOrigen = null;   // columna de la que salio
    let resaltada = null;     // columna con el marco azul
    let finDelGesto = 0;      // cuando termino el ultimo arrastre

    const CLASES_RESALTE = ['ring-2', 'ring-blue-400'];

    function limpiarResalte() {
        if (resaltada) {
            resaltada.classList.remove(...CLASES_RESALTE);
            resaltada = null;
        }
    }

    function resaltar(col) {
        if (col === resaltada) return;
        limpiarResalte();
        col.classList.add(...CLASES_RESALTE);
        resaltada = col;
    }

    function terminar() {
        arrastrada = null;
        grupoOrigen = null;
        finDelGesto = Date.now();
        limpiarResalte();
    }

    return {
        /**
         * Engancha el tablero. Idempotente: llamarlo de nuevo sobre el mismo
         * elemento no duplica listeners, cosa que importa porque Blazor
         * invoca OnAfterRenderAsync muchas veces.
         *
         * @param {HTMLElement} contenedor  el grid de columnas
         * @param {any} dotnet              DotNetObjectReference del componente
         */
        conectar: function (contenedor, dotnet) {
            if (!contenedor || contenedor.dataset.mttoDnd === '1') return;
            contenedor.dataset.mttoDnd = '1';

            contenedor.addEventListener('dragstart', function (e) {
                const tarjeta = e.target.closest('[data-orden]');
                if (!tarjeta) return;

                arrastrada = parseInt(tarjeta.dataset.orden, 10);
                grupoOrigen = parseInt(tarjeta.dataset.grupo, 10);

                // Firefox no arranca el arrastre sin datos en el dataTransfer.
                // El valor da igual: el id real viaja en la variable de arriba,
                // porque el dataTransfer no se puede leer hasta el drop.
                try {
                    e.dataTransfer.setData('text/plain', String(arrastrada));
                    e.dataTransfer.effectAllowed = 'move';
                } catch (_) { /* navegadores viejos */ }
            });

            contenedor.addEventListener('dragend', terminar);

            // Algunos navegadores emiten un click sobre la tarjeta al terminar
            // el arrastre. Si llega a Blazor, abre el detalle de la orden que
            // el usuario solo queria mover. Se traga en fase de CAPTURA, que
            // corre antes que el @onclick del componente.
            contenedor.addEventListener('click', function (e) {
                if (Date.now() - finDelGesto < 300) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            }, true);

            // ESTE preventDefault es el que habilita el drop. Sin el, el
            // navegador rechaza el destino y `drop` no llega jamas.
            contenedor.addEventListener('dragover', function (e) {
                const col = e.target.closest('[data-grupo-col]');
                if (!col || arrastrada === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                resaltar(col);
            });

            // Salir del tablero entero si apaga el resalte; pasar de una
            // tarjeta a su columna, no. Por eso se compara con relatedTarget:
            // moverse entre elementos hijos dispara dragleave igual, y esa
            // fue la razon por la que en la Fase 1 el marco parpadeaba.
            contenedor.addEventListener('dragleave', function (e) {
                if (!contenedor.contains(e.relatedTarget)) limpiarResalte();
            });

            contenedor.addEventListener('drop', function (e) {
                const col = e.target.closest('[data-grupo-col]');
                if (!col || arrastrada === null) return;

                e.preventDefault();
                const destino = parseInt(col.dataset.grupoCol, 10);
                const id = arrastrada;
                const origen = grupoOrigen;
                terminar();

                if (destino === origen) return;
                dotnet.invokeMethodAsync('SoltarDesdeJs', id, destino);
            });
        },

        /** Suelta la marca para que un tablero re-creado se pueda reenganchar. */
        desconectar: function (contenedor) {
            if (contenedor) delete contenedor.dataset.mttoDnd;
            terminar();
        }
    };
})();
