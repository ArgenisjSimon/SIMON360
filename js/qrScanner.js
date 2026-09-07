// ============================================================================
// Lector de QR por cámara.
//
// Lo usa la pantalla de la romana para escanear el TMI cuando no hay lector
// físico a mano: la tablet ya está ahí y ya tiene cámara.
//
// DOS MOTORES, EN ESTE ORDEN:
//
//   1. BarcodeDetector — el que ya viene en el navegador. Es el más rápido
//      porque lo resuelve el sistema operativo, pero sólo está en Chrome de
//      Android y macOS. En Windows no existe: se verificó.
//
//   2. jsQR — de respaldo, para que el botón sirva también en la PC de la
//      cabina y en cualquier tablet que no traiga el primero.
//
// jsQR vive en wwwroot/js/jsQR.min.js, NO en un CDN. Dos razones: en este
// proyecto cada script de CDN va con su hash SRI, que es justo lo que ya se
// rompió una vez al publicar; y un lector que necesita internet no sirve en un
// galpón. Son 128 KB al lado de un WebAssembly de varios megas.
//
// Si por lo que sea no hay ninguno de los dos, se dice y listo: queda el lector
// físico, que es el camino normal, y el teclado.
// ============================================================================
window.qrScanner = {

    _stream: null,
    _video: null,
    _lienzo: null,
    _detector: null,
    _timer: null,
    _dotnet: null,
    _motor: null,      // "nativo" | "jsqr"

    /// Se puede leer QR con la cámara en este navegador.
    soportado() {
        return typeof window.BarcodeDetector !== "undefined"
            || typeof window.jsQR === "function";
    },

    /// Cuál de los dos motores se va a usar. Sirve para poder decirlo en
    /// pantalla cuando alguien reporte que "escanea lento".
    motor() {
        if (typeof window.BarcodeDetector !== "undefined") return "nativo";
        if (typeof window.jsQR === "function") return "jsqr";
        return null;
    },

    /// Enciende la cámara y empieza a buscar. Cada lectura se avisa a .NET
    /// llamando al método `QrLeido` del objeto que se pasa.
    ///
    /// idVideo   : el <video> donde se ve la cámara
    /// dotnetRef : DotNetObjectReference del componente
    async iniciar(idVideo, dotnetRef) {
        this._motor = this.motor();
        if (!this._motor) {
            throw new Error("Este navegador no puede leer códigos QR con la cámara. Use el lector o teclee el número.");
        }

        await this.detener();

        this._dotnet = dotnetRef;
        this._video = document.getElementById(idVideo);
        if (!this._video) throw new Error("No se encontró el elemento de video.");

        // La trasera: el operador apunta al papel, no a sí mismo. Si el
        // dispositivo tiene una sola cámara, el navegador ignora el facingMode.
        //
        // Se piden 1280 de ancho: con la resolución por defecto un QR chico
        // impreso en térmica no se resuelve, y jsQR necesita más pixeles que
        // el detector nativo.
        this._stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        this._video.srcObject = this._stream;
        this._video.setAttribute("playsinline", "true");   // iOS no abre a pantalla completa
        await this._video.play();

        if (this._motor === "nativo") {
            this._detector = new BarcodeDetector({ formats: ["qr_code"] });
        } else {
            this._lienzo = document.createElement("canvas");
        }

        let ultimo = null;
        let ultimoEn = 0;
        let ocupado = false;

        // jsQR analiza en el hilo de la interfaz y tarda bastante más que el
        // detector nativo, así que se le da más aire entre pasadas. Si no, la
        // pantalla se traba y el video se ve a tirones.
        const cada = this._motor === "nativo" ? 250 : 400;

        this._timer = setInterval(async () => {
            if (ocupado) return;                            // la anterior no termino
            if (!this._video || this._video.readyState < 2) return;

            ocupado = true;
            try {
                const valor = this._motor === "nativo"
                    ? await this._leerNativo()
                    : this._leerJsQr();

                if (!valor) return;

                // El detector dispara varias veces por segundo sobre el mismo
                // papel. Sin esto, un QR quieto delante de la cámara manda
                // treinta lecturas y la pantalla pesa treinta veces.
                const ahora = Date.now();
                if (valor === ultimo && ahora - ultimoEn < 3000) return;
                ultimo = valor;
                ultimoEn = ahora;

                if (navigator.vibrate) navigator.vibrate(60);
                await this._dotnet.invokeMethodAsync("QrLeido", valor);
            } catch (e) {
                // Un cuadro que no se pudo analizar no es un error: el
                // siguiente llega enseguida.
            } finally {
                ocupado = false;
            }
        }, cada);
    },

    async _leerNativo() {
        const codigos = await this._detector.detect(this._video);
        return codigos.length ? (codigos[0].rawValue || "").trim() : null;
    },

    _leerJsQr() {
        const v = this._video;
        const w = v.videoWidth, h = v.videoHeight;
        if (!w || !h) return null;

        // Se analiza a la mitad de resolución: alcanza de sobra para un QR que
        // ocupa buena parte del cuadro y baja el trabajo a la cuarta parte,
        // que es lo que separa un video fluido de uno a tirones en la tablet.
        const c = this._lienzo;
        c.width = Math.round(w / 2);
        c.height = Math.round(h / 2);

        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, c.width, c.height);

        const img = ctx.getImageData(0, 0, c.width, c.height);
        const r = window.jsQR(img.data, img.width, img.height, {
            inversionAttempts: "dontInvert"   // el ticket es negro sobre blanco
        });

        return r && r.data ? r.data.trim() : null;
    },

    /// Apaga la cámara. Hay que llamarlo siempre al cerrar: una cámara que
    /// queda prendida se ve en la barra del navegador y gasta batería toda la
    /// jornada.
    async detener() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }

        if (this._stream) {
            for (const p of this._stream.getTracks()) p.stop();
            this._stream = null;
        }

        if (this._video) {
            try { this._video.pause(); this._video.srcObject = null; } catch (e) { }
            this._video = null;
        }

        this._detector = null;
        this._lienzo = null;
        this._dotnet = null;
        this._motor = null;
    }
};
