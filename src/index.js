
//import { getCurrentScriptUrl } from "./helpers_urls";
import { getCurrentScriptUrl } from "./helpers_urls";
import { initAppUIBehavior } from "./pwa_app-ui-behavior";
import { flushAppCache, getPwaSetupCache } from "./pwa_cache";
import { isOnline, networkMonitor } from "./pwa_check_network";
import { getPwaAssets } from "./pwa_getassets";

(async () => {


    /*
    let baseUrl = getCurrentScriptUrl();
    let filesToCheck = [`${baseUrl}/pwa-lite-sw.js`, 'nonsense.js'];
    let isOnline = await networkMonitor(filesToCheck);
    console.log('isOnline', baseUrl, isOnline);
    */

    /*
    let online = await isOnline();
    console.log('online2', online);
    */


    let settingsEl = document.querySelector('[data-pwa-settings]')
    let settings = {
        name:'appname',
        swFile:'sw.js',
        fullscreen: true,
        contextMenu: true,
        devtools: true,
        flushKey: true,
        flushQuery:true,
    }

    if (settingsEl) {
        settings = {
            ...settings,
            ...JSON.parse(settingsEl.dataset.pwaSettings)
        }
        //console.log('settings', settings);
    }

    initAppUIBehavior(settings);


    /*
    let res2 = await fetch("https://herrstrietzel.github.io/google-font-finder/cache/fontList_merged.json");
    console.log('res2', res2);
    */



    if ("serviceWorker" in navigator) {

        let appName = settings.name || 'webapp';
        let swFile = settings.swFile || 'sw.js';


        /**
         * flush worker cache
         * via query param or shortcut
         */
        let params = new URLSearchParams(location.search);
        let flush = (settings.flushQuery || settings.flushKey) && params.has("flush") || false;

        if(settings.flushKey){
            document.addEventListener("keydown", async (e) => {
                if (e.ctrlKey && e.shiftKey && e.key === 'R') {
                    //alert('flush')
                    await flushAppCache(appName);
                }
            })
        }



        if (flush) {
            await flushAppCache(appName);
        }


        /**
         * get service worker settings:
         * app name, service worker file path
         * cache assets
         * cache policies
         */
        let setup = await getPwaSetupCache(appName);
        //console.log('!!!setup', setup);

        // bind to service worker JS file
        const reg = await navigator.serviceWorker.register(swFile);
        await navigator.serviceWorker.ready;

        const worker =
            reg.active ??
            reg.waiting ??
            reg.installing;

        worker?.postMessage({
            type: "SETUP",
            payload: {
                appName: setup.appName,
                cache: [...setup.cache],
                stale: [...setup.stale],
                network: [...setup.network]
            }
        });

    }

})();

export { getPwaSetupCache as getPwaSetupCache };
export { getPwaAssets as getPwaAssets };
export { networkMonitor as networkMonitor }


if (typeof window !== 'undefined') {
    window.getPwaSetupCache = getPwaSetupCache;
    window.networkMonitor = networkMonitor;
    window.getPwaAssets = getPwaAssets;
}
