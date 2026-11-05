// Exporta a Excel (.xlsx) lo que arma una pantalla en C#.
//
// Se importa como modulo desde Blazor:
//     var m = await JS.InvokeAsync<IJSObjectReference>("import", "./js/excelExport.js");
//     await m.InvokeVoidAsync("descargar", "archivo.xlsx", hojas);
//
// hojas = [{ nombre: "Labores", columnas: ["Finca", ...], filas: [[...], ...] }]
// Los numeros viajan como numeros (Excel los suma y los ordena bien); las
// fechas, ya formateadas como texto dd/MM/yyyy.
//
// La libreria (lib/xlsx/xlsx.full.min.js, la misma que usan mciDemo y
// mciHazlo) se carga solo la primera vez que se exporta algo.

function cargarXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, mal) => {
        const s = document.createElement('script');
        s.src = 'lib/xlsx/xlsx.full.min.js';
        s.onload = ok;
        s.onerror = () => mal(new Error('No cargó la librería de Excel.'));
        document.head.appendChild(s);
    });
}

export async function descargar(nombreArchivo, hojas) {
    await cargarXlsx();
    const libro = XLSX.utils.book_new();

    for (const h of hojas) {
        const hoja = XLSX.utils.aoa_to_sheet([h.columnas, ...h.filas]);

        // Ancho de cada columna por su contenido mas largo, con tope: sin
        // esto Excel abre todo en 8 caracteres y no se lee nada.
        hoja['!cols'] = h.columnas.map((c, i) => {
            const largo = Math.max(String(c).length,
                ...h.filas.map(f => f[i] == null ? 0 : String(f[i]).length));
            return { wch: Math.min(Math.max(largo + 2, 8), 50) };
        });

        // Filtros en la fila de titulos.
        if (h.filas.length > 0)
            hoja['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: h.filas.length, c: h.columnas.length - 1 } }) };

        // Excel no admite nombres de hoja de mas de 31 caracteres.
        XLSX.utils.book_append_sheet(libro, hoja, String(h.nombre).slice(0, 31));
    }

    XLSX.writeFile(libro, nombreArchivo);
}
