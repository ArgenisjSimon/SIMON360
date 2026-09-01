window.networkStatus = {
    isOnline: () => navigator.onLine
};
window.networkStatusV2 = (function () {

    // Los listeners quedaban colgados para siempre: cada componente que se
    // montaba agregaba dos y nadie los sacaba. Con una pantalla a la vez casi
    // no se notaba, pero desde que el formulario de OEI se abre en varias
    // ventanas se acumulan, y al cambiar de online a offline JS invoca metodos
    // sobre componentes ya destruidos ("no tracked object with id").
    //
    // registerOnlineListener sigue funcionando igual para quien no mire el
    // retorno; el que puede montarse muchas veces guarda el token y lo suelta
    // al destruirse.
    let proximo = 1;
    const registrados = {};

    function registerOnlineListener(dotnetRef) {
        const token = `net-${proximo++}`;

        function updateStatus() {
            // El componente puede haberse ido sin desregistrarse: si la llamada
            // falla, se limpia solo en vez de tirar el error en cada cambio.
            const promesa = navigator.onLine
                ? dotnetRef.invokeMethodAsync("OnOnline")
                : dotnetRef.invokeMethodAsync("OnOffline");

            if (promesa && promesa.catch) promesa.catch(() => unregisterOnlineListener(token));
        }

        registrados[token] = updateStatus;

        // Estado inicial
        updateStatus();

        // Escuchar cambios reales
        window.addEventListener("online", updateStatus);
        window.addEventListener("offline", updateStatus);

        return token;
    }

    function unregisterOnlineListener(token) {
        const fn = registrados[token];
        if (!fn) return;

        window.removeEventListener("online", fn);
        window.removeEventListener("offline", fn);
        delete registrados[token];
    }

    return { registerOnlineListener, unregisterOnlineListener };
})();
