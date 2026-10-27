// numeroVivo.js — separador de miles MIENTRAS se escribe (es-ES: 1.234.567,89).
//
// Lo usa ContCantidadInput.razor. Formatea en cada tecla y deja el cursor
// donde estaba (contando dígitos, no caracteres: los puntos que se agregan o
// se quitan no lo corren).
//
// El listener va en el propio <input>, así que corre ANTES que el de Blazor
// (que escucha en el documento): cuando Blazor lee el valor, ya está formateado.
//
// El punto que teclea la persona se toma como coma decimal: en el teclado
// numérico la tecla es "." y nadie escribe los puntos de miles a mano.
window.numeroVivo = (function () {
    function formatear(texto, decimales) {
        const coma = texto.indexOf(',');
        let ent = (coma >= 0 ? texto.slice(0, coma) : texto).replace(/\D/g, '');
        let dec = coma >= 0 ? texto.slice(coma + 1).replace(/\D/g, '') : null;
        ent = ent.replace(/^0+(?=\d)/, '');
        if (ent === '' && dec !== null) ent = '0';
        if (dec !== null && decimales >= 0) dec = dec.slice(0, decimales);
        const conMiles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return dec === null || decimales === 0 ? conMiles : conMiles + ',' + dec;
    }

    // Cuántos dígitos (y coma) hay antes de la posición pos.
    function significativos(texto, pos) {
        let n = 0;
        for (let i = 0; i < pos && i < texto.length; i++) if (/[\d,]/.test(texto[i])) n++;
        return n;
    }

    // La posición en el texto nuevo que deja n dígitos (y coma) a la izquierda.
    function posicionPara(texto, n) {
        if (n <= 0) return 0;
        let vistos = 0;
        for (let i = 0; i < texto.length; i++) {
            if (/[\d,]/.test(texto[i])) vistos++;
            if (vistos === n) return i + 1;
        }
        return texto.length;
    }

    function activar(el, decimales) {
        if (!el || el.dataset.numeroVivo) return;
        el.dataset.numeroVivo = '1';
        el.addEventListener('input', function (e) {
            let v = el.value;
            let cursor = el.selectionStart ?? v.length;

            // Punto tecleado -> coma decimal (si todavía no hay una).
            if (e.data === '.' && cursor > 0 && v[cursor - 1] === '.') {
                const yaHayComa = v.slice(0, cursor - 1).includes(',') || v.slice(cursor).includes(',');
                v = v.slice(0, cursor - 1) + (yaHayComa ? '' : ',') + v.slice(cursor);
                if (yaHayComa) cursor--;
            }
            // Una sola coma: la que se acaba de escribir manda solo si no había otra.
            const primera = v.indexOf(',');
            if (primera >= 0) v = v.slice(0, primera + 1) + v.slice(primera + 1).replace(/,/g, '');

            const n = significativos(v, cursor);
            const nuevo = formatear(v, decimales);
            if (nuevo !== el.value) {
                el.value = nuevo;
                const p = posicionPara(nuevo, n);
                el.setSelectionRange(p, p);
            }
        });
    }

    return { activar: activar };
})();
