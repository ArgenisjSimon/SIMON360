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
    _motor: null,      // "nativo" | "zxing" | "jsqr"
    _formatos: ["qr_code"],
    _zxing: null,

    // Códigos de barras lineales (16OCT2026, conteo de inventario): los productos traen su
    // código de barras (EAN, UPC, Code 128...), no un QR. El detector nativo los lee en
    // Chrome y Edge de Android; en iPhone y en la PC los lee ZXing (wwwroot/js/zxing.min.js,
    // local como jsQR). Pedir solo QR deja todo como siempre.
    //
    // ZXing NO está en index.html (21OCT2026): son 336 KB que bajaba todo SIMON al abrir,
    // aunque nunca entrara al conteo. Se carga aquí la primera vez que alguien pide códigos
    // lineales y el navegador no los lee solo. Ruta relativa: la app no está en la raíz.
    // El service worker lo guarda con el resto de los .js, así que también carga sin señal.
    _LINEALES: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"],
    _quiereLineales(formatos) { return (formatos || []).some(f => this._LINEALES.includes(f)); },
    _cargandoZxing: null,

    /// Carga ZXing una sola vez. true si quedó disponible; si falla, el próximo pedido reintenta.
    _cargarZxing() {
        if (typeof window.ZXing !== "undefined") return Promise.resolve(true);
        if (!this._cargandoZxing) {
            this._cargandoZxing = new Promise(ok => {
                const s = document.createElement("script");
                s.src = "js/zxing.min.js";
                s.onload = () => ok(typeof window.ZXing !== "undefined");
                s.onerror = () => { s.remove(); this._cargandoZxing = null; ok(false); };
                document.head.appendChild(s);
            });
        }
        return this._cargandoZxing;
    },

    /// Se puede leer con la cámara en este navegador (formatos opcional: sin él, QR).
    soportado(formatos) {
        const qr = typeof window.BarcodeDetector !== "undefined" || typeof window.jsQR === "function";
        if (this._quiereLineales(formatos)) return qr ? true : this._cargarZxing();
        return qr;
    },

    /// Cuál de los motores se va a usar. Sirve para poder decirlo en
    /// pantalla cuando alguien reporte que "escanea lento".
    motor() {
        if (typeof window.BarcodeDetector !== "undefined") return "nativo";
        if (typeof window.jsQR === "function") return "jsqr";
        return null;
    },

    /// Si con estos formatos se leerán también los códigos de barras lineales, o solo QR.
    async leeLineales(formatos) {
        if (!this._quiereLineales(formatos)) return false;
        if (await this._nativoLeeLineales()) return true;
        return await this._cargarZxing();
    },
    async _nativoLeeLineales() {
        if (typeof window.BarcodeDetector === "undefined") return false;
        try { const f = await BarcodeDetector.getSupportedFormats(); return this._LINEALES.some(x => f.includes(x)); }
        catch (e) { return false; }
    },
    async _elegirMotor() {
        if (!this._quiereLineales(this._formatos)) return this.motor();     // solo QR: lo de siempre
        if (await this._nativoLeeLineales()) return "nativo";
        if (await this._cargarZxing()) return "zxing";
        return this.motor();                                                 // sin lineales: al menos el QR
    },

    /// Enciende la cámara y empieza a buscar. Cada lectura se avisa a .NET
    /// llamando al método `QrLeido` del objeto que se pasa.
    ///
    /// idVideo   : el <video> donde se ve la cámara
    /// dotnetRef : DotNetObjectReference del componente
    /// formatos  : opcional, los nombres de BarcodeDetector. Sin él, solo QR (lo de siempre).
    async iniciar(idVideo, dotnetRef, formatos) {
        this._formatos = Array.isArray(formatos) && formatos.length ? formatos : ["qr_code"];
        this._motor = await this._elegirMotor();
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
            // solo los formatos que este navegador conoce: pedir uno que no conoce es un error
            let pedir = this._formatos;
            try {
                const sabe = await BarcodeDetector.getSupportedFormats();
                const comunes = pedir.filter(f => sabe.includes(f));
                pedir = comunes.length ? comunes : ["qr_code"];
            } catch (e) { pedir = ["qr_code"]; }
            this._detector = new BarcodeDetector({ formats: pedir });
        } else {
            this._lienzo = document.createElement("canvas");
            if (this._motor === "zxing") this._zxing = this._crearZxing();
        }

        let ultimo = null;
        let ultimoEn = 0;
        let ocupado = false;

        // jsQR analiza en el hilo de la interfaz y tarda bastante más que el
        // detector nativo, así que se le da más aire entre pasadas. Si no, la
        // pantalla se traba y el video se ve a tirones.
        const cada = this._motor === "nativo" ? 250 : this._motor === "zxing" ? 350 : 400;

        this._timer = setInterval(async () => {
            if (ocupado) return;                            // la anterior no termino
            if (!this._video || this._video.readyState < 2) return;

            ocupado = true;
            try {
                const valor = this._motor === "nativo"
                    ? await this._leerNativo()
                    : this._motor === "zxing" ? this._leerZxing() : this._leerJsQr();

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

    // ZXing (librería UMD @zxing/library, global window.ZXing): QR y códigos lineales en
    // cualquier navegador. Se le pasan solo los formatos pedidos para que no pierda tiempo.
    _crearZxing() {
        const Z = window.ZXing, B = Z.BarcodeFormat;
        const mapa = { qr_code: B.QR_CODE, ean_13: B.EAN_13, ean_8: B.EAN_8, upc_a: B.UPC_A, upc_e: B.UPC_E,
                       code_128: B.CODE_128, code_39: B.CODE_39, itf: B.ITF };
        const pistas = new Map();
        pistas.set(Z.DecodeHintType.POSSIBLE_FORMATS, this._formatos.map(f => mapa[f]).filter(x => x !== undefined));
        pistas.set(Z.DecodeHintType.TRY_HARDER, true);
        const lector = new Z.MultiFormatReader();
        lector.setHints(pistas);
        return lector;
    },

    _leerZxing() {
        const v = this._video, w = v.videoWidth, h = v.videoHeight;
        if (!w || !h) return null;
        const c = this._lienzo;
        c.width = w; c.height = h;                       // los lineales necesitan la resolución completa
        c.getContext("2d", { willReadFrequently: true }).drawImage(v, 0, 0, w, h);
        const Z = window.ZXing;
        try {
            const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)));
            const r = this._zxing.decode(bmp);
            return r ? String(r.getText()).trim() : null;
        } catch (e) { return null; }                     // NotFoundException en cada cuadro sin código
        finally { try { this._zxing.reset(); } catch (e) { } }
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
        this._zxing = null;
        this._dotnet = null;
        this._motor = null;
    }
};
