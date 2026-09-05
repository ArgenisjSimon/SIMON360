// ¡Precaución! Entender las implicaciones antes de publicar con soporte offline:
// https://aka.ms/blazor-offline-considerations

self.importScripts('./service-worker-assets.js');
self.addEventListener('install', event => event.waitUntil(onInstall(event)));
self.addEventListener('activate', event => event.waitUntil(onActivate(event)));
self.addEventListener('fetch', event => event.respondWith(onFetch(event)));

const cacheNamePrefix = 'offline-cache-';
const cacheName = `${cacheNamePrefix}${self.assetsManifest.version}`;
const offlineAssetsInclude = [/\.dll$/, /\.pdb$/, /\.wasm$/, /\.html$/, /\.js$/, /\.json$/, /\.css$/, /\.woff2?$/, /\.png$/, /\.jpe?g$/, /\.gif$/, /\.ico$/, /\.blat$/, /\.dat$/];
// appsettings se excluye del PRECACHE: se edita en el servidor por ambiente y
// precachearlo rompería la verificación de integridad (y congelaría la config).
//
// Pero tampoco puede quedar sin ninguna copia: Program.cs lo pide ANTES de
// Build() y sin él no hay BaseUrl ni PermisosPaginas. Sin red, ese fetch
// lanzaba y la app moría con pantalla en blanco — o sea que todo el modo
// offline era inalcanzable justo en el escenario para el que existe.
//
// La salida no es precachearlo sino guardarlo al vuelo: cache aparte, y
// estrategia NETWORK-FIRST (ver onFetch). Con red manda el servidor, así que un
// cambio de configuración se aplica igual que siempre; sin red se sirve la
// última copia buena.
const offlineAssetsExclude = [/^service-worker\.js$/, /appsettings.*\.json$/];

const cacheConfig = 'config-cache';
const esConfig = url => /appsettings.*\.json$/.test(new URL(url, self.origin).pathname);

// Base dinámica: la app NO está publicada en la raíz del servidor,
// así que la base se deriva de la ubicación real del service worker.
const base = self.location.pathname.replace(/[^\/]*$/, '');
const baseUrl = new URL(base, self.origin);
const manifestUrlList = self.assetsManifest.assets.map(asset => new URL(asset.url, baseUrl).href);

async function onInstall(event) {
    console.info('Service worker: Install');

    // Cachear todos los assets coincidentes
    const assetsRequests = self.assetsManifest.assets
        .filter(asset => offlineAssetsInclude.some(pattern => pattern.test(asset.url)))
        .filter(asset => !offlineAssetsExclude.some(pattern => pattern.test(asset.url)))
        .map(asset => new Request(asset.url, { integrity: asset.hash, cache: 'no-cache' }));
    await caches.open(cacheName).then(cache => cache.addAll(assetsRequests));
}

async function onActivate(event) {
    console.info('Service worker: Activate');

    // Eliminar caches de versiones anteriores.
    // ⚠️ El filtro mira el prefijo a proposito: cacheConfig NO lo lleva, asi que
    // sobrevive a los despliegues. Si se borrara en cada version, la primera
    // apertura despues de publicar —que puede ser en el campo, sin señal— se
    // quedaria otra vez sin configuracion.
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys
        .filter(key => key.startsWith(cacheNamePrefix) && key !== cacheName)
        .map(key => caches.delete(key)));
}

async function onFetch(event) {
    // ── Configuracion: network-first ────────────────────────────────────
    // Con red gana el servidor (la config se edita alla y tiene que aplicarse).
    // Sin red se sirve la ultima copia buena, que es lo que permite que la app
    // arranque en el campo.
    if (event.request.method === 'GET' && esConfig(event.request.url)) {
        try {
            const respuesta = await fetch(event.request);
            if (respuesta && respuesta.ok) {
                const cache = await caches.open(cacheConfig);
                // clone(): el body se consume una sola vez, y uno va al cache
                // y el otro a la app.
                cache.put(event.request, respuesta.clone());
            }
            return respuesta;
        } catch {
            const cache = await caches.open(cacheConfig);
            const guardada = await cache.match(event.request);
            if (guardada) {
                console.info('Service worker: sin red, se usa la configuracion guardada.');
                return guardada;
            }
            // Nunca hubo una copia. Y hay que devolver 200 igual, aunque
            // suene raro:
            //
            // el runtime de .NET descarga appsettings.json COMO PARTE DEL
            // ARRANQUE, antes de que corra una linea de Program.cs. Con un 404
            // —o un 503— muere con "Failed to start platform" y la pantalla
            // queda en blanco; el try/catch del C# ni se entera.
            //
            // Devolviendo un JSON vacio con 200, la plataforma arranca, y el
            // header le dice a Program.cs que esto NO es configuracion de
            // verdad para que muestre la pantalla que lo explica.
            return new Response('{}', {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Simon-Config': 'ausente'
                }
            });
        }
    }

    let cachedResponse = null;
    if (event.request.method === 'GET') {
        // Para las navegaciones servir index.html desde cache,
        // salvo que la petición sea de un recurso offline conocido.
        const shouldServeIndexHtml = event.request.mode === 'navigate'
            && !manifestUrlList.some(url => url === event.request.url);

        const request = shouldServeIndexHtml ? 'index.html' : event.request;
        const cache = await caches.open(cacheName);
        cachedResponse = await cache.match(request);
    }

    return cachedResponse || fetch(event.request);
}

// ── Notificaciones push ─────────────────────────────────────────────
// Aditivo: no toca nada del cache de arriba. Estos dos handlers son lo
// unico que hace falta del lado del service worker para que una
// notificacion salga en el telefono o en la PC con la app cerrada.
//
// Va en los DOS service workers --el de desarrollo y el publicado-- para
// poder probarlo sin publicar. El de desarrollo no cachea nada, pero se
// registra igual, y push no depende del cache.

self.addEventListener('push', event => {
    // Sin datos igual hay que mostrar ALGO: en varios navegadores, un push
    // recibido que no muestra notificacion cuenta como incumplimiento y
    // terminan revocando el permiso al sitio.
    let datos = { titulo: 'SIMON 360', cuerpo: 'Tenés una novedad.' };

    try {
        if (event.data) datos = { ...datos, ...event.data.json() };
    } catch {
        // Un payload que no es JSON no puede dejar al usuario sin aviso.
        if (event.data) datos.cuerpo = event.data.text();
    }

    event.waitUntil(
        self.registration.showNotification(datos.titulo, {
            body: datos.cuerpo,
            // Rutas armadas sobre el scope del service worker y NO absolutas
            // desde la raiz: la app no se publica en la raiz del servidor
            // —vive en /Apps/Simon360— asi que un '/Imagenes/...' da 404 alla
            // y la notificacion sale sin icono. En localhost las dos formas
            // funcionan, y por eso no se nota hasta publicar.
            icon: new URL('Imagenes/logo-sm2.png', self.registration.scope).href,
            badge: new URL('Imagenes/logo-sm2.png', self.registration.scope).href,
            // Agrupa por tema: cinco avisos de lo mismo no tienen que
            // apilarse cinco veces en la barra del telefono.
            tag: datos.tag || 'simon',
            renotify: true,
            // Igual que el icono: el destino se resuelve contra el scope. Un
            // '/' pelado se va al host y no al Home de SIMON.
            data: { url: new URL(datos.url || '', self.registration.scope).href }
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const destino = (event.notification.data && event.notification.data.url)
                 || self.registration.scope;

    // Si ya hay una pestaña de SIMON abierta se reusa, en vez de abrir otra:
    // con el tiempo, un click por notificacion deja veinte pestañas iguales.
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(abiertas => {
            for (const cliente of abiertas) {
                if (cliente.url.includes(self.location.origin) && 'focus' in cliente) {
                    cliente.navigate(destino);
                    return cliente.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(destino);
        })
    );
});
/* Manifest version: Gf2BtS4R */
