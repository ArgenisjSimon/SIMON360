// ============================================================================
//  DICTADO — hablar en vez de teclear
// ============================================================================
//
//  Usa SpeechRecognition del navegador. NO graba audio ni lo manda a ningun
//  lado: el reconocimiento pasa en el dispositivo o en el servicio del propio
//  navegador, y lo que llega a nuestro codigo ya es texto.
//
//  POR QUE ESTO Y NO GRABAR AUDIO PARA TRANSCRIBIRLO NOSOTROS:
//    - es instantaneo, sin viaje de ida y vuelta ni factura de IA
//    - en el telefono, el teclado ya trae microfono; esto es para el ESCRITORIO,
//      donde el entrenador escribe sus recomendaciones y no tiene esa tecla
//    - no manejamos audio de nadie, que es un dato mas delicado que el texto
//
//  DONDE FUNCIONA: Chrome, Edge y Safari. Firefox no lo trae, y ahi el boton
//  simplemente no aparece — se teclea, que es lo que se hacia antes.
// ============================================================================

window.fitDictado = (function () {
    let rec = null;

    function soportado() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    return {
        soportado: soportado,

        /// Arranca el dictado. Devuelve el texto reconocido, o "" si no hubo nada.
        /// dotNetRef recibe los parciales para que se vean mientras habla.
        escuchar: function (dotNetRef, idioma) {
            return new Promise(function (resolve) {
                if (!soportado()) { resolve(""); return; }

                // Si habia uno andando, se corta: dos reconocimientos a la vez
                // se pisan y el resultado sale mezclado.
                if (rec) { try { rec.abort(); } catch (e) { } rec = null; }

                const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
                rec = new SR();

                rec.lang = idioma || "es-VE";

                // continuous=false para que se corte solo al dejar de hablar.
                // Con true hay que pulsar para parar, y en medio de un entreno
                // eso es un paso de mas que nadie da.
                rec.continuous     = false;
                rec.interimResults = true;
                rec.maxAlternatives = 1;

                let final = "";

                rec.onresult = function (e) {
                    let parcial = "";
                    for (let i = e.resultIndex; i < e.results.length; i++) {
                        const t = e.results[i][0].transcript;
                        if (e.results[i].isFinal) final += t;
                        else parcial += t;
                    }
                    // El parcial se pinta en vivo: sin eso, el usuario no sabe
                    // si lo esta oyendo y repite todo mas alto.
                    if (dotNetRef) {
                        try { dotNetRef.invokeMethodAsync("DictadoParcial", final + parcial); }
                        catch (err) { }
                    }
                };

                rec.onerror = function () { resolve(final.trim()); rec = null; };
                rec.onend   = function () { resolve(final.trim()); rec = null; };

                try { rec.start(); }
                catch (e) { resolve(""); rec = null; }
            });
        },

        detener: function () {
            if (rec) { try { rec.stop(); } catch (e) { } }
        }
    };
})();
