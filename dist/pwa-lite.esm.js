/**
 * get script url
 */
function getCurrentScriptUrl() {
    try {
        /** 2. try error API */
        let stackLines = new Error().stack.split('\n');
        let relevantLine = stackLines[1] || stackLines[2];
        if (!relevantLine) return null;

        // Extract URL using a more comprehensive regex
        let urlError = relevantLine.match(/(https?:\/\/[^\s]+)/)[1]
            .split('/')
            .slice(0, -1)
            .join('/');

        return urlError;

    } catch (e) {
        console.warn("Could not retrieve script path", e);
        return null;
    }
}

/**
 * get import urls in
 * es modules
 */
async function getModuleImports(src = '') {
    let imports = [];
    // fetch and read JS text content
    let res = await fetch(src);
    if (res.ok) {
        let source = await res.text();
        let importRegex = /(?:import|export)\s*(?:.*?from\s*)?['"]([^'"]+)['"]/g;
        let match;
        while ((match = importRegex.exec(source)) !== null) {
            let url = getAbsoluteUrl(match[1], src);
            imports.push(url);
        }
    }
    return imports
}

/**
 * convert relative URLs to absolute
 * to enable correct fetching
 */

function getAbsoluteUrl(url = '', baseUrl = '') {
    // is absolute
    if (url.startsWith('http')) return url;

    // use current url as fallback
    baseUrl = !baseUrl ? document.baseURI : baseUrl;
    let urlAbs = URL.parse(url, baseUrl);
    return urlAbs.href
}

/**
 * replace relative URLs 
 * in CSS (e.g background-images)
 * or font face rules
 * to absolute
 */

function relativeCssUrlsToAbsolute(css, url = '') {

    let urlRegex = /url\(\s*['"]?(.*?)['"]?\s*\)/g;
    let urls = css.match(urlRegex);

    if (!urls) return css;

    // exclude ie crap fonts
    urls = urls.filter(url => !url.includes('.eot'));

    let baseUrl = url;
    let pathArr = url.split('/');

    urls.forEach(url => {

        url = url.split(/\(|\)/)[1].replace(/"|'/g, '');
        let urlAbs = url;

        /**
         * Absolute URLs: 
         * find relative paths or 
         * parent directory traversal
         */
        let dirs = url.split('../');
        let parentDirs = url.match(/\.\.\//g);
        let relativeDir = url.match(/\.\//g);
        let traverse = parentDirs ? parentDirs.length : 0;

        // traverse to parent directory
        if (traverse) {
            let index = -1 - traverse;
            let fontPath = dirs.slice(-1)[0];
            baseUrl = pathArr.slice(0, index).join('/') + '/';
            urlAbs = baseUrl + fontPath;
        }
        else if (relativeDir) {
            urlAbs = url.replaceAll('./', baseUrl);
        }

        css = css.replaceAll(url, urlAbs);
    });

    return css;
}

function initAppUIBehavior(
    settings = {}
) {

    let { fullscreen = true, contextMenu = true, devtools = true,
    } = settings;

    let modes = [
        "fullscreen",
        "standalone",
        "minimal-ui",
        "browser"
    ];

    if (!contextMenu) {
        disableContextMenu();
    }

    if (!devtools) {
        disableDevtools();
    }

    let currentMode = 'browser';
    for (const mode of modes) {
        if (window.matchMedia(`(display-mode: ${mode})`).matches) {

            currentMode = mode;
            break;
        }
    }

    if (fullscreen && currentMode === 'standalone' || currentMode === 'fullscreen') {
        // enter full screen

        // resize
        window.moveTo(0, 0);
        window.resizeTo(screen.width * 1, screen.height * 1);

        let initMouseMove = (e) => {
            // open full screen
            document.documentElement.requestFullscreen();

            // remove listener
            document.removeEventListener('click', initMouseMove);
        };

        if (!document.body.classList.contains('init-mouse-move')) {
            document.addEventListener('click', initMouseMove);
            document.body.classList.add('init-mouse-move');
        }

        console.log("Running as installed app");
    } else {
        console.log("Running in browser tab");
    }

}

function disableContextMenu() {
    // disable default context menu
    document.addEventListener("contextmenu", function (e) {
        e.preventDefault();
    }, false);
}

function disableDevtools() {

    // disable context menu
    disableContextMenu();

    document.addEventListener('fullscreenchange', function (e) {
        if (document.webkitIsFullScreen) {
            window.navigator.keyboard.lock(['Escape']);
        }
        else {
            window.navigator.keyboard.unlock();
        }
    });

    document.addEventListener("keydown", function (e) {

        // prevent save
        if (e.ctrlKey && e.key === 's') {
            disabledEvent(e);
        }

        // new Tab
        if (e.ctrlKey && e.key === 't') {
            disabledEvent(e);

        }

        // fullscreen toggle
        if (e.key === 'F11') {

            disabledEvent(e);
        }

        // F12
        if (e.key === 'F12') {
            disabledEvent(e);
        }

        // prevent dev tools
        if (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "I")) {

            disabledEvent(e);
        }

        // Ctrl+S 
        if (e.keyCode == 83 && (navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey)) {
            disabledEvent(e);
        }

        // show source Ctrl + U 
        if (e.ctrlKey && e.keyCode == 85) {
            disabledEvent(e);
        }
    }, false);

    function disabledEvent(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        } else if (window.event) {
            window.event.cancelBubble = true;
        }
        e.preventDefault();
        return false;
    }
}

async function getPwaAssets() {
    let assets = {
        js: [],
        img: [],
        css: [],
        fonts: [],
        manifest: [],
        misc: [],
    };

    let urlSet = new Set([]);

    // add to assets - avoid duplicates
    const addToAssets = (assets = {}, urlSet = [], src = '', key = '', cachePolicy = 'cache', type = '') => {
        if (!urlSet.has(src)) {
            type = type || key;
            assets[key].push({ src, cachePolicy, type });
        }
        urlSet.add(src);
    };

    /**
     * 1. scan all DOM elements with
     * src or href attribute
     */
    let srcAtts = ['href', 'src', 'srcset', 'data-src', 'data-srcset'];
    let selector = srcAtts.map(att => { return `[${att}]` }).join(', ');
    let srcEls = document.querySelectorAll(selector);

    for (let i = 0, l = srcEls.length; l && i < l; i++) {
        let el = srcEls[i];

        // skip empty references
        let src = el.src ? el.src : (el.href ? el.href : '');
        if (!src) continue;

        let nodeName = el.nodeName.toLowerCase();
        let atts = [...el.attributes].filter(att => srcAtts.includes(att.name));
        let attNames = atts.map(att => att.name);
        let attValues = atts.map(att => att.nodeValue);

        let { rel = '' } = el;
        let cachePolicy = el.dataset.pwa ? el.dataset.pwa : 'cache';

        let props = {};
        attNames.forEach((att, i) => {
            let val = attValues[i];
            if (att === 'srcset' || att === 'data-srcset') {
                val = [...new Set(val.split(',').map(val => val.trim()).map(val => val.split(' ')[0]))];
            }
            props[att] = val;
        });

        switch (nodeName) {

            case 'link':
                // CSS
                if (rel === 'stylesheet' || src.endsWith('.css') || src.includes('googleapis.com/css2?')) {
                    addToAssets(assets, urlSet, src, 'css', cachePolicy, 'css');
                }

                // favicon/app icon
                else if (rel.includes('shortcut') || rel.includes('mask-icon') || src.endsWith('.png') || src.endsWith('.svg') || src.endsWith('.ico') || src.endsWith('.webp') || src.endsWith('.jpg')) {
                    addToAssets(assets, urlSet, src, 'img', cachePolicy, 'imgFavicon');
                }

                // manifest
                else if (rel === 'manifest') {

                    // add manifest file
                    addToAssets(assets, urlSet, src, 'manifest', cachePolicy, 'manifest');

                    // fetch manifest to find icons assets
                    let res = await fetch(src);
                    if (res.ok) {
                        let data = await res.json();
                        let icons = data?.icons || [];

                        icons.forEach(icon => {
                            let icnSrc = icon.src || '';
                            if (icnSrc) {
                                icnSrc = getAbsoluteUrl(icnSrc, src);
                                addToAssets(assets, urlSet, icnSrc, 'img', cachePolicy, 'imgAppIcon');
                            }
                        });
                    }
                }
                // misc
                else {
                    addToAssets(assets, urlSet, src, 'misc', cachePolicy, 'misc');
                }
                break;

            // images
            case 'img':

                // check srcset
                for (let prop in props) {
                    let imgSrc = props[prop];

                    // normalize to array for srcsets
                    let imgSrcArr = !Array.isArray(imgSrc) ? [imgSrc] : imgSrc;

                    imgSrcArr.forEach(imgSrc => {

                        imgSrc = getAbsoluteUrl(imgSrc);
                        addToAssets(assets, urlSet, imgSrc, 'img', cachePolicy, 'img');
                    });
                }
                break;

            // JS scripts
            case 'script':

                // add main script
                addToAssets(assets, urlSet, src, 'js', cachePolicy, 'js');

                let { type = null } = el;
                // find sources in module imports
                if (type && type === 'module') {
                    let imports = await getModuleImports(src);
                    imports.forEach(src => {
                        addToAssets(assets, urlSet, src, 'js', cachePolicy, 'jsImport');
                    });
                }
                break;

            default:
                addToAssets(assets, urlSet, src, 'misc', cachePolicy, 'misc');
                break;
        }
    }

    /**
     * 1. scan all stylesheets for
     * - import
     * - font 
     * - image
     * references
     */
    let styleSheets = document.styleSheets;

    for (let sheet of styleSheets) {
        // skip inline SVG styles
        let ownerNode = sheet.ownerNode || '';
        let ignore = ownerNode ? (ownerNode.dataset.pwaIgnore !== undefined ? 1 : 0) : 0;

        // skip explicitely ignored stylesheets
        if (ignore) continue;

        let cachePolicy = ownerNode ? (ownerNode.dataset.pwa || 'cache') : 'cache';

        // Process external stylesheets
        if (sheet.href) {
            let href = sheet.href;
            let css = '';

            // Fetch and parse
            try {
                let res = await fetch(href);
                if (res.ok) {
                    css = await res.text();

                    // Find imports
                    let reg = /@import\s+(?:url\()?["']?([^"')]+)["']?\)?[^;]*;?/gi;
                    let imports = css.match(reg) || [];
                    let cssImports = '';

                    for (let i = 0, l = imports.length; l && i < l; i++) {
                        let imp = imports[i];

                        let importUrl = getAbsoluteUrl(imp.split(/[\(|\)]/)[1].replace(/["|']/g, ''), href);

                        // add import url
                        addToAssets(assets, urlSet, importUrl, 'css', cachePolicy, 'cssImport');

                        let res = await fetch(importUrl);
                        if (res.ok) {
                            let cssTxt = await res.text();
                            cssImports += cssTxt;
                        }

                        // remove original import rule from stylesheet
                        css = css.replace(imp, '');

                        // embed rules from imports
                        css = cssImports + css;

                    };

                    // convert relative to absolute URLs
                    css = relativeCssUrlsToAbsolute(css, href);

                }
            } catch (error) {
                console.warn(`Error fetching stylesheet ${href}:`, error);
                continue;
            }

            if (!css) continue;

            // create parseable stylesheet object
            let sheetInline = new CSSStyleSheet();
            sheetInline.replaceSync(css);

            /**
             * find font-face rules
             */
            for (let i = 0, len = sheetInline.cssRules.length; len && i < len; i++) {
                let rule = sheetInline.cssRules[i];

                // is font face rule
                if (rule.type === 5) {
                    let { src = '' } = rule.style;
                    let fontUrl = getAbsoluteUrl(src.split(/[\(|\)]/)[1]
                        .replace(/["|']/g, ''), src);
                    addToAssets(assets, urlSet, fontUrl, 'fonts', cachePolicy, 'font');
                }

                // add background images
                else {

                    let props = rule.style;
                    let backgroundImage = props.getPropertyValue('background-image') || '';
                    if (!backgroundImage) continue

                    if (backgroundImage) {
                        let imgSrc = getAbsoluteUrl(backgroundImage.split(/[\(|\)]/)[1]
                            .replace(/["|']/g, ''), href);
                        addToAssets(assets, urlSet, imgSrc, 'img', cachePolicy, 'imgBackground');

                    }
                }
            }
        }
    }

    return assets;
}

/**
 * Retrieve Cache
 * policies from DOM
 */
async function getPwaSetupCache(appName='appCache') {

    let setup = {
        swFile: 'sw.js',
        network: new Set([]),
        cache: new Set([]),
        stale: new Set([]),
    };

    /**
     * get all assets
     * images, css, js etc
     */

    // get setup from local storage
    let storageCache = localStorage.getItem(appName);

    if(storageCache){
        try{

            setup = JSON.parse(storageCache);
            setup.cache = new Set(setup.cache);
            setup.network = new Set(setup.network);
            setup.stale = new Set(setup.stale);
            return setup;
        }catch{
            console.warn('Could not parse setup');
        }
    }

    // get assets from DOM
    let assets = await getPwaAssets();

    for(let prop in assets){
        let items = assets[prop];
        items.forEach(item=>{
            let {src='', cachePolicy='cache'} = item;
            if(src) setup[cachePolicy].add(src);
        });
    }

    // add app name
    let appNameEl = document.querySelector('[data-pwa-name');
    
    setup.appName = appNameEl ? appNameEl.dataset.pwaName : document.title.toLowerCase().replaceAll(' ', '_');
    setup.version = Date.now();

    /**
     * scan additional assets from data attributes
     */
    let els = document.querySelectorAll('[data-pwa-cache], [data-pwa-stale], [data-pwa-network], [data-pwa-settings]');

    els.forEach(el => {
        let settings = el.dataset.pwaSettings ? JSON.parse(el.dataset.pwaSettings) : null;

        let cache = el.dataset.pwaCache ? el.dataset.pwaCache.split(',').filter(Boolean).map(val => val.trim()) : [];
        let stale = el.dataset.pwaStale ? el.dataset.pwaStale.split(',').filter(Boolean).map(val => val.trim()) : [];
        let network = el.dataset.pwaNetwork ? el.dataset.pwaNetwork.split(',').filter(Boolean).map(val => val.trim()) : [];

        if(settings.cache){
            settings.cache.forEach(url => setup.cache.add(url));
        }
        if(settings.stale){
            settings.stale.forEach(url => setup.cache.add(url));
        }
        if(settings.network){
            settings.network.forEach(url => setup.cache.add(url));
        }

        cache.forEach(url => setup.cache.add(url));
        network.forEach(url => setup.network.add(url));
        stale.forEach(url => setup.stale.add(url));
    });

    // add root/current page
    setup.stale.add('/');
    let pageUrl = window.location.href.split(/[?|#]/)[0];
    setup.stale.add(pageUrl);

    // add service worker logic
    let scriptUrl = getCurrentScriptUrl();
    let swUrl = scriptUrl+'/pwa-lite-sw.js';

    setup.stale.add(swUrl);

    // set service worker file name

    // convert to array
    ['cache', 'stale', 'network'].forEach(prop=>{
        setup[prop] = Array.from(setup[prop]);
    });

    // update local storage
    localStorage.setItem(appName, JSON.stringify(setup));

    return setup;
}

async function flushAppCache(appName='appCache') {
    // unregister all workers
    const regs = await navigator.serviceWorker.getRegistrations();
    console.log('!!!Cache flushed');

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

async function networkMonitor(srcset = []) {
    let report = [];
    for (let src of srcset) {
        try {
            let res = await fetch(
                src,
                {
                    method: "HEAD",
                    cache: "no-store"
                }
            );
            if (res.ok) {
                report.push({ online: 1, src });
            } else {
                report.push({ online: 0, src });
            }
        } catch {
            report.push({ online: 0, src });
        }
    }

    return report
}

(async () => {

    let settingsEl = document.querySelector('[data-pwa-settings]');
    let settings = {
        name:'appname',
        swFile:'sw.js',
        fullscreen: true,
        contextMenu: true,
        devtools: true,
        flushKey: true,
        flushQuery:true,
    };

    if (settingsEl) {
        settings = {
            ...settings,
            ...JSON.parse(settingsEl.dataset.pwaSettings)
        };

    }

    initAppUIBehavior(settings);

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

                    await flushAppCache(appName);
                }
            });
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

if (typeof window !== 'undefined') {
    window.getPwaSetupCache = getPwaSetupCache;
    window.networkMonitor = networkMonitor;
    window.getPwaAssets = getPwaAssets;
}

export { getPwaAssets, getPwaSetupCache, networkMonitor };
