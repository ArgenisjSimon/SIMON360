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

            // Los motores no entregan lo mismo y hay que aguantar las dos formas:
            //
            //   incremental → ["hola", " a ver", " si no"]   cada uno es la parte nueva
            //   acumulativo → ["hola", "hola a ver", "hola a ver si no"]
            //                 cada uno REPITE lo anterior (Chrome de Android)
            //
            // Concatenar a ciegas rompe el segundo caso y el informe queda con
            // "a ver / a ver si / a ver si no" pegado uno atras del otro. Por eso
            // no se mira el indice sino el texto: si el nuevo pedazo empieza con
            // lo que ya se venia armando, REEMPLAZA; si no, se concatena.
            const unir = (acumulado, pedazo) => {
                const limpio = (pedazo || '').trim();
                if (!limpio) return acumulado;
                if (!acumulado) return limpio;
                if (limpio.startsWith(acumulado)) return limpio;   // acumulativo
                if (acumulado.endsWith(limpio)) return acumulado;  // repetido tal cual
                return acumulado + ' ' + limpio;                   // incremental
            };

            let finales = '';
            let provisorio = '';

            for (let i = 0; i < evento.results.length; i++) {
                const texto = evento.results[i][0].transcript;

                if (evento.results[i].isFinal) finales    = unir(finales, texto);
                else                           provisorio = unir(provisorio, texto);
            }

            // Se manda solo lo que todavia no se mando. La cuenta se lleva por
            // TEXTO y no por indice: cuando el motor se corta solo y rearranca,
            // el array puede volver a traer lo viejo, y comparando el texto eso
            // se descarta igual. Si la frase nueva no continua a la anterior
            // (arranco otra), no es prefijo y se manda entera.
            let confirmado = '';
            if (finales) {
                const yaEmitido = estado.emitidoTexto || '';

                if (!yaEmitido)                     confirmado = finales;
                else if (finales.startsWith(yaEmitido)) confirmado = finales.slice(yaEmitido.length);
                else if (!yaEmitido.endsWith(finales)) confirmado = finales;

                estado.emitidoTexto = finales.startsWith(yaEmitido) ? finales : yaEmitido + ' ' + finales;
            }

            confirmado = confirmado.trim();
            if (!confirmado && !provisorio) return;

            // Lo confirmado se agrega al informe; lo provisorio solo se
            // muestra en gris y se reemplaza en la siguiente pasada.
            dotnetRef.invokeMethodAsync('OnDictado', confirmado, provisorio);
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
                // OJO: no se reinicia emitidoTexto. Hay motores que al rearrancar
                // vuelven a mandar lo de la sesión anterior; conservando el texto
                // ya emitido eso se descarta solo. Y si lo que viene es una frase
                // nueva, no es prefijo del anterior y entra completa igual.
                try { rec.start(); } catch { /* ya arrancado */ }
            }
        };

        estado = { modo: 'envivo', ref: dotnetRef, rec: rec, detenido: false, emitidoTexto: '' };
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
