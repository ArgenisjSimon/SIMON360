window.networkStatus = {
    isOnline: () => navigator.onLine
};
window.networkStatusV2 = {
    registerOnlineListener: function (dotnetRef) {

        function updateStatus() {
            if (navigator.onLine) {
                dotnetRef.invokeMethodAsync("OnOnline");
            } else {
                dotnetRef.invokeMethodAsync("OnOffline");
            }
        }

        // Estado inicial
        updateStatus();

        // Escuchar cambios reales
        window.addEventListener("online", updateStatus);
        window.addEventListener("offline", updateStatus);
    }
};
