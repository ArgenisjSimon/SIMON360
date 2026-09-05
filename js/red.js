// red.js — estado de conexion, uno solo para toda la app
//
// Reemplaza a connectivity.js (window.isOnline) y a network.js
// (window.networkStatus + window.networkStatusV2). Antes convivian cuatro
// mecanismos y cada componente elegia uno; de ahi salio el bug del modal de
// clientes, que preguntaba y le respondian "sin conexion" estando online.
//
// LO IMPORTANTE, Y ES UNA DECISION DE DISENO:
//
//   navigator.onLine MIENTE. Da true en un wifi sin salida a internet, que es
//   justo la situacion de campo mas comun. Por eso lo que hay aca NO decide
//   caminos de datos: solo alimenta el indicador de la barra y avisa cuando
//   conviene reintentar el drenaje de la cola.
//
//   Quien decide si hay servidor es el propio intento contra la API: se
//   intenta, y si falla por red se cae a lo local. Ver OfflineService.
//
// Los suscriptores devuelven un token y lo sueltan al destruirse. La version
// anterior agregaba dos listeners por componente y no sacaba ninguno: con el
// formulario de OEI abierto en varias ventanas se acumulaban, y al cambiar de
// estado JS invocaba metodos sobre componentes ya destruidos
// ("no tracked object with id").

window.red = (function () {

    let proximo = 1;
    const suscriptores = new Map();

    function estaOnline() {
        return navigator.onLine === true;
    }

    function avisar(token) {
        const ref = suscriptores.get(token);
        if (!ref) return;

        // El componente puede haberse ido sin desuscribirse: si la llamada
        // falla, se limpia solo en vez de tirar el error en cada cambio.
        const p = navigator.onLine
            ? ref.invokeMethodAsync('OnOnline')
            : ref.invokeMethodAsync('OnOffline');
        if (p && p.catch) p.catch(() => desuscribir(token));
    }

    function alCambiar() {
        for (const token of [...suscriptores.keys()]) avisar(token);
    }

    window.addEventListener('online', alCambiar);
    window.addEventListener('offline', alCambiar);

    /**
     * @param {any} dotnetRef Objeto .NET con [JSInvokable] OnOnline() / OnOffline()
     * @returns {string} token para soltar en Dispose
     */
    function suscribir(dotnetRef) {
        const token = `red-${proximo++}`;
        suscriptores.set(token, dotnetRef);
        avisar(token);          // estado inicial
        return token;
    }

    function desuscribir(token) {
        suscriptores.delete(token);
    }

    return { estaOnline, suscribir, desuscribir };
})();
