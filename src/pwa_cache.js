import { getCurrentScriptUrl } from "./helpers_urls.js";
import { getPwaAssets } from "./pwa_getassets.js";

/**
 * Retrieve Cache
 * policies from DOM
 */
export async function getPwaSetupCache(appName='appCache') {

    let setup = {
        swFile: 'sw.js',
        network: new Set([]),
        cache: new Set([]),
        stale: new Set([]),
    }

    /**
     * get all assets
     * images, css, js etc
     */

    // get setup from local storage
    let storageCache = localStorage.getItem(appName);
    //console.log('storageCache', storageCache);

    if(storageCache){
        try{
            //console.log('!!!use storage');
            setup = JSON.parse(storageCache)
            setup.cache = new Set(setup.cache)
            setup.network = new Set(setup.network)
            setup.stale = new Set(setup.stale)
            return setup;
        }catch{
            console.warn('Could not parse setup');
        }
    }




    // get assets from DOM
    let assets = await getPwaAssets();
    //console.log(assets);

    for(let prop in assets){
        let items = assets[prop];
        items.forEach(item=>{
            let {src='', cachePolicy='cache'} = item;
            if(src) setup[cachePolicy].add(src);
        })
    }

    // add app name
    let appNameEl = document.querySelector('[data-pwa-name');
    
    setup.appName = appNameEl ? appNameEl.dataset.pwaName : document.title.toLowerCase().replaceAll(' ', '_');
    setup.version = Date.now();

    /**
     * scan additional assets from data attributes
     */
    let els = document.querySelectorAll('[data-pwa-cache], [data-pwa-stale], [data-pwa-network], [data-pwa-settings]')

    els.forEach(el => {
        let settings = el.dataset.pwaSettings ? JSON.parse(el.dataset.pwaSettings) : null;
        //console.log('???settings', settings);

        let cache = el.dataset.pwaCache ? el.dataset.pwaCache.split(',').filter(Boolean).map(val => val.trim()) : []
        let stale = el.dataset.pwaStale ? el.dataset.pwaStale.split(',').filter(Boolean).map(val => val.trim()) : []
        let network = el.dataset.pwaNetwork ? el.dataset.pwaNetwork.split(',').filter(Boolean).map(val => val.trim()) : [];



        if(settings.cache){
            settings.cache.forEach(url => setup.cache.add(url))
        }
        if(settings.stale){
            settings.stale.forEach(url => setup.cache.add(url))
        }
        if(settings.network){
            settings.network.forEach(url => setup.cache.add(url))
        }

        //console.log(cache, stale, network);

        cache.forEach(url => setup.cache.add(url))
        network.forEach(url => setup.network.add(url))
        stale.forEach(url => setup.stale.add(url))
    })


    // add root/current page
    setup.stale.add('/');
    let pageUrl = window.location.href.split(/[?|#]/)[0];
    setup.stale.add(pageUrl);


    // add service worker logic
    let scriptUrl = getCurrentScriptUrl();
    let swUrl = scriptUrl+'/pwa-lite-sw.js';
    //setup.cache.add(swUrl);
    setup.stale.add(swUrl);

    // set service worker file name
    /*
    let sw_name_el = document.querySelector('[data-pwa-sw]');
    if(sw_name_el) setup.swFile = sw_name_el.dataset.pwaSw.trim();
    */

    // convert to array
    ['cache', 'stale', 'network'].forEach(prop=>{
        setup[prop] = Array.from(setup[prop])
    })

    // update local storage
    localStorage.setItem(appName, JSON.stringify(setup));

    return setup;
}

export async function flushAppCache(appName='appCache') {
    // unregister all workers
    const regs = await navigator.serviceWorker.getRegistrations();
    console.log('!!!Cache flushed');
    //alert('flush')

    // remove local storage
    localStorage.removeItem(appName);

    await Promise.all(
        regs.map(r => r.unregister())
    );

    // remove all caches
    const names = await caches.keys();

    await Promise.all(
        names.map(name => caches.delete(name))
    );

    // remove ?flush
    history.replaceState({}, "", location.pathname);
}

