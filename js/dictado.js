// ============================================================
// dictado.js — dictado por voz del informe de campo
// ============================================================
// Dos caminos, y no son intercambiables:
//
//   1. Web Speech API. Transcribe EN VIVO, gratis y sin tocar la API. Solo
//      existe en Chrome y Edge de escritorio y en Android. Dentro del shell
//      de escritorio de SIMON (WebView2) y en iPhone NO está.
//
//   2. MediaRecorder. Graba el audio y lo devuelve en base64 para que lo
//      transcriba Gemini desde la API. Anda en todos lados donde haya
//      microfono. No es en vivo: se habla, se para, y aparece el texto.
//
// El .NET no elige: llama a iniciar() y este modulo usa el 1 si existe y
// cae al 2 si no. Lo unico que cambia para el usuario es que el texto
// aparezca mientras habla o al soltar el boton.
// ============================================================
window.dictado = (function () {

    const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;

    let estado = null;   // { modo, ref, rec, grabadora, trozos, stream }

    function disponible() {
        const hayMicrofono = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        return { envivo: !!Reconocimiento, grabacion: hayMicrofono };
    }

    // ── 1. Dictado en vivo ───────────────────────────────────────
    //
    // Este modulo NO manda pedacitos para que el .NET los vaya pegando: manda
    // el texto COMPLETO de la sesion de dictado en cada pasada, y el .NET lo
    // reemplaza. La diferencia importa: pegando pedazos, cualquier pasada
    // repetida del motor queda impresa en el informe para siempre y termina
    // como "una prueba para ver una prueba para ver una prueba para ver".
    // Mandando el texto entero, el peor caso de una fusion errada es un
    // renglon raro que la pasada siguiente corrige sola.

    /// Normaliza para COMPARAR, nunca para mostrar. Chrome de Android reescribe
    /// mayusculas y puntuacion entre pasadas ("estoy haciendo" → "Estoy
    /// haciendo,"), y comparando literal esas dos parecen frases distintas: es
    /// exactamente por ahi por donde se colaba la repeticion.
    function _norm(t) {
        return (t || '')
            .toLowerCase()
            .replace(/[.,;:!?¡¿"'()\[\]{}…—–-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /// Une dos tramos de transcripcion sin repetir lo que ya estaba.
    ///
    /// Los motores no entregan lo mismo y hay que aguantar las dos formas:
    ///
    ///   incremental → ["hola", " a ver", " si no"]   cada uno es la parte nueva
    ///   acumulativo → ["hola", "hola a ver", "hola a ver si no"]
    ///                 cada uno REPITE lo anterior (Chrome de Android)
    ///
    /// y ademas el caso del medio, que es el que rompia: solapamiento parcial
    /// ("estoy haciendo una" + "haciendo una prueba"), donde el nuevo no es
    /// prefijo del viejo pero tampoco arranca de cero.
    function _fundir(acumulado, pedazo) {
        const nuevo = (pedazo || '').trim();
        const viejo = (acumulado || '').trim();
        if (!nuevo) return viejo;
        if (!viejo) return nuevo;

        const a = _norm(viejo), b = _norm(nuevo);
        if (!b) return viejo;
        if (!a) return nuevo;

        if (b.indexOf(a) === 0) return nuevo;    // acumulativo: el nuevo trae todo
        if (a.indexOf(b) !== -1) return viejo;   // ya esta dicho, no se agrega nada

        // Solapamiento parcial: se busca el pedazo mas largo del final de lo
        // viejo que sea el arranque de lo nuevo, y se pega solo el resto.
        const pa = a.split(' '), pb = b.split(' ');
        const max = Math.min(pa.length, pb.length);
        for (let n = max; n > 0; n--) {
            if (pa.slice(pa.length - n).join(' ') === pb.slice(0, n).join(' ')) {
                const resto = nuevo.split(/\s+/).slice(n).join(' ');
                return resto ? viejo + ' ' + resto : viejo;
            }
        }

        return viejo + ' ' + nuevo;
    }

    function _iniciarEnVivo(dotnetRef, idioma) {
        const rec = new Reconocimiento();
        rec.lang = idioma || 'es-ES';
        rec.continuous = true;
        // Los parciales son los que dan la sensacion de que el sistema esta
        // escuchando. Sin ellos el usuario habla contra una pantalla quieta y
        // no sabe si lo esta tomando.
        rec.interimResults = true;

        rec.onresult = (evento) => {
            // Un reconocedor de una sesión anterior puede seguir largando
            // eventos después de detenerlo: lo que diga ya no es de este
            // informe.
            if (!estado || estado.rec !== rec) return;

            // El array trae TODOS los resultados de este reconocedor, asi que
            // se rearma desde cero en cada pasada: lo que valga es lo ultimo
            // que dijo el motor, no lo que se venia acumulando acá.
            let finales = '';
            let provisorio = '';

            for (let i = 0; i < evento.results.length; i++) {
                const texto = evento.results[i][0].transcript;

                if (evento.results[i].isFinal) finales    = _fundir(finales, texto);
                else                           provisorio = _fundir(provisorio, texto);
            }

            // Se funde contra lo que ya habia por si el motor poda resultados
            // viejos del array; si los trae todos, esto devuelve `finales` tal
            // cual y no cambia nada.
            estado.sesionFinal = _fundir(estado.sesionFinal, finales);

            // textoFijo es lo de los reconocedores anteriores (el motor se
            // corta solo en los silencios y se lo rearranca).
            const completo = _fundir(estado.textoFijo, estado.sesionFinal);

            if (completo === estado.ultimoEmitido && !provisorio && !estado.habiaProvisorio) return;
            estado.ultimoEmitido = completo;
            estado.habiaProvisorio = !!provisorio;

            // El texto completo pisa el informe dictado; lo provisorio solo se
            // muestra en gris y se reemplaza en la siguiente pasada.
            dotnetRef.invokeMethodAsync('OnDictado', completo, provisorio);
        };

        rec.onerror = (evento) => {
            // "no-speech" y "aborted" son ruido normal: el usuario hizo una
            // pausa o soltó el boton. No son fallas que mostrar.
            if (evento.error === 'no-speech' || evento.error === 'aborted') return;
            dotnetRef.invokeMethodAsync('OnDictadoError', evento.error || 'error');
        };

        // continuous no sobrevive los silencios largos en todos los
        // navegadores: si el motor se corta solo y el usuario no paró, se
        // vuelve a arrancar.
        rec.onend = () => {
            if (estado && estado.modo === 'envivo' && !estado.detenido) {
                // Lo de este reconocedor pasa a texto fijo ANTES de rearrancar:
                // el proximo empieza con el array vacio y sin esto se perderia
                // todo lo dictado hasta el silencio. Si el motor igual vuelve a
                // mandar lo viejo, _fundir lo reconoce y no lo duplica.
                estado.textoFijo = _fundir(estado.textoFijo, estado.sesionFinal);
                estado.sesionFinal = '';
                try { rec.start(); } catch { /* ya arrancado */ }
            }
        };

        estado = {
            modo: 'envivo', ref: dotnetRef, rec: rec, detenido: false,
            textoFijo: '', sesionFinal: '', ultimoEmitido: '', habiaProvisorio: false
        };
        rec.start();
        return 'envivo';
    }

    // ── 2. Grabacion para transcribir en el servidor ─────────────
    async function _iniciarGrabacion(dotnetRef) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // webm/opus es lo que graban Chrome y Firefox; Safari da mp4. Se deja
        // que el navegador elija y se le informa el tipo a la API, que se lo
        // pasa a Gemini.
        const grabadora = new MediaRecorder(stream);
        const trozos = [];

        grabadora.ondataavailable = (e) => { if (e.data.size > 0) trozos.push(e.data); };

        estado = {
            modo: 'grabacion', ref: dotnetRef,
            grabadora: grabadora, trozos: trozos, stream: stream, detenido: false
        };

        grabadora.start();
        return 'grabacion';
    }

    async function iniciar(dotnetRef, idioma) {
        await detener();

        if (Reconocimiento) return _iniciarEnVivo(dotnetRef, idioma);
        return await _iniciarGrabacion(dotnetRef);
    }

    /// Devuelve null en modo en vivo (el texto ya se fue mandando) y
    /// { audio, mimeType } en modo grabacion.
    async function detener() {
        if (!estado) return null;

        const s = estado;
        s.detenido = true;

        if (s.modo === 'envivo') {
            try { s.rec.stop(); } catch { /* ya detenido */ }
            estado = null;
            return null;
        }

        return await new Promise((resolve) => {
            s.grabadora.onstop = async () => {
                // El micrófono se suelta SIEMPRE: si no, el navegador deja el
                // indicador de grabacion encendido y el usuario cree que lo
                // siguen escuchando.
                s.stream.getTracks().forEach(t => t.stop());

                const blob = new Blob(s.trozos, { type: s.grabadora.mimeType || 'audio/webm' });

                if (blob.size === 0) { estado = null; resolve(null); return; }

                const buffer = await blob.arrayBuffer();
                const bytes = new Uint8Array(buffer);

                // btoa revienta con arrays grandes si se pasa todo de una:
                // se arma por tramos.
                let binario = '';
                const tramo = 8192;
                for (let i = 0; i < bytes.length; i += tramo) {
                    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + tramo));
                }

                estado = null;
                resolve({
                    audio: btoa(binario),
                    // El mimeType llega con parámetros ("audio/webm;codecs=opus")
                    // y Gemini quiere el tipo pelado.
                    mimeType: (s.grabadora.mimeType || 'audio/webm').split(';')[0]
                });
            };

            try { s.grabadora.stop(); }
            catch { estado = null; resolve(null); }
        });
    }

    return { disponible, iniciar, detener };
})();
