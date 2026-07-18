
let CONFIG = null;
const META_CACHE = "__sw_meta__";
const META_KEY = "/__setup__";
let isOnline = true;

// Inside your service worker
/*
if (navigator.onLine) {
    console.log('The browser thinks it is online.');
} else {
    console.log('The browser thinks it is offline.');
}
*/

// Inside your service worker
self.addEventListener('online', () => {
    console.log('The connection has been restored.');
    // Trigger any sync logic you have
});

self.addEventListener('offline', () => {
    console.log('The connection has been lost.');
    // Notify the user or change behavior
});


self.addEventListener("install", event => {
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        self.clients.claim()
    );
});

self.addEventListener("message", event => {
    event.waitUntil((async () => {

        switch (event.data.type) {

            case "SETUP":
                await saveSetup(event.data.payload);
                await rebuildCaches();
                break;

            case "UPDATE":
                await loadSetup();
                await updateStaleCache();
                break;

            case "FLUSH":
                await loadSetup();
                await flush();
                break;
        }

    })());
});

self.addEventListener("fetch", event => {
    event.respondWith(handleRequest(event.request));
});



// Setup persistence
async function saveSetup(setup) {

    const cache = await caches.open(META_CACHE);

    await cache.put(
        META_KEY,
        new Response(JSON.stringify(setup))
    );

    CONFIG = {
        appName: setup.appName,
        cache: new Set(setup.cache),
        stale: new Set(setup.stale),
        network: new Set(setup.network)
    };

}


async function loadSetup() {
    if (CONFIG) return CONFIG;
    const cache = await caches.open(META_CACHE);
    const response = await cache.match(META_KEY);
    if (!response)
        return null;

    const setup = await response.json();

    CONFIG = {
        appName: setup.appName,
        cache: new Set(setup.cache),
        stale: new Set(setup.stale),
        network: new Set(setup.network)
    };
    return CONFIG;
}

function cacheNames() {
    return {
        cache: `${CONFIG.appName}-cache`,
        stale: `${CONFIG.appName}-stale`,
        network: `${CONFIG.appName}-network`
    };
}


async function buildCache(name, assets) {
    let cache = await caches.open(name);
    //console.log('!!!cache', cache);

    for (let asset of assets) {

        const cached = await cache.match(asset);
        if (cached) {
            //console.log('!!!is cached', cached);
            continue
        }

        try {
            const response = await fetch(asset, {
                cache: "reload"
            });

            if (response.ok) {
                await cache.put(asset, response.clone());
            }

        }
        catch (err) {
            //console.warn(asset, err);
        }
    }
}

async function rebuildCaches() {
    let names = cacheNames();
    //console.log('CONFIG', CONFIG);

    await buildCache(
        names.cache,
        CONFIG.cache
    );
    await buildCache(
        names.stale,
        CONFIG.stale
    );
    await buildCache(
        names.network,
        CONFIG.network
    );
}

async function flush() {
    const names = await caches.keys();
    await Promise.all(
        names.map(name => {
            if (name !== META_CACHE)
                return caches.delete(name);
        })
    );
    await rebuildCaches();
}

async function updateStaleCache() {
    let cache = await caches.open(
        cacheNames().stale
    );
    for (let asset of CONFIG.stale) {
        try {
            let response = await fetch(asset, {
                cache: "reload"
            });
            if (response.ok) {
                await cache.put(asset, response.clone());
            }
        }
        catch { }
    }
}

async function handleRequest(request) {

    let config = await loadSetup();
    if (!config) return fetch(request);

    let url = new URL(request.url).href;
    let cache = null;
    let cached = null;
    let response = null;

    // Cache First
    if (config.cache.has(url)) {

        cache = await caches.open(
            cacheNames().cache
        );

        cached = await cache.match(request);
        //console.log('1. cache:', path, cached);

        if (cached) {
            //console.log('!!!cached');
            return cached;
        }

        response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }

        return response;

    }

    // Stale While Revalidate
    if (config.stale.has(url)) {

        cache = await caches.open(
            cacheNames().stale
        );

        // get chached assets
        cached = await cache.match(request);
        //console.log('2. stale:', path, cached);

        // try to update cache
        try {

            response = await fetch(request);
            //console.log('request', request);

            // ignore HEAD file checks
            if (response.ok && request.method!=='HEAD') {
                cache.put(request, response.clone());
            }else{
            }
        } catch {
            //console.warn( 'catch:', url, config.stale);
            console.warn('no network');
        }


        // but return cache first
        if (cached) return cached;

        // no cache - return response
        return response;

    }

    // Network First
    if (config.network.has(url)) {
        //console.log('3. network:', url);
        try {
            return await fetch(request);
        }
        catch {
            cache = await caches.open(
                cacheNames().network
            );

            cache.put(request, response.clone());
            return (
                await cache.match(request)
            ) || offlineResponse();
        }

    }

    // Unknown assets
    try {
        cache = await caches.open(
            cacheNames().cache
        );

        //console.log('!!!res unknown', cache);
        console.log('??? 4. unknown:', url, request);

        let res = await fetch(request);

        /*
        if(res.type==='cors'){
            // add to cache
            cache = await caches.open(
                cacheNames().cache
            );
            cache.put(url, res.clone());
            saveSetup(setup)

        }
        */

        return res;
    }
    catch {
        cached = await caches.match(request);
        if (cached)
            return cached;
        return new Response("Offline", {
            status: 503
        });
    }


    /*
    // Unknown assets
    try {
        //console.log('4. unknown:', url, request);
        let res = await fetch(url);
        if(res.ok && !url.includes('?flush')){
            console.warn('unknown:', res, url);

            // add to cache
            cache = await caches.open(
                cacheNames().cache
            );
            cache.put(request, res.clone());


        }else{
            console.warn('could not fetch:', url);
        }
    }
    catch {
        cached = await caches.match(request);
        if (cached)
            return cached;
        return new Response("Offline", {
            status: 503
        });
    }
    */

}