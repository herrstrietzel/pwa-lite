(async () => {
    //let fontRefs = await getFontReferences();
    //console.log('fontRefs', fontRefs);
    let setup = await getSWSetup();
    console.log('!!!setup', setup);

    //let assets = await getPwaAssets();
    //console.log('assets', assets);



})();

async function getPwaAssets() {
    let assets = {
        js: [],
        img: [],
        css: [],
        fonts: [],
        manifest: [],
        misc: [],
    }

    let urlSet = new Set([]);

    // add to assets - avoid duplicates
    const addToAssets = (assets = {}, urlSet = [], src = '', key = '', cachePolicy = 'cache', type = '') => {
        if (!urlSet.has(src)) {
            type = type || key;
            assets[key].push({ src, cachePolicy, type });
        }
        urlSet.add(src)
    }


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


        let props = {}
        attNames.forEach((att, i) => {
            let val = attValues[i];
            if (att === 'srcset' || att === 'data-srcset') {
                val = [...new Set(val.split(',').map(val => val.trim()).map(val => val.split(' ')[0]))];
            }
            props[att] = val;
        })


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
                    //console.log('!!!manifest', src, 'cachePolicy', cachePolicy);

                    // add manifest file
                    addToAssets(assets, urlSet, src, 'manifest', cachePolicy, 'manifest');

                    // fetch manifest to find icons assets
                    let res = await fetch(src);
                    if (res.ok) {
                        let data = await res.json();
                        let icons = data?.icons || [];

                        icons.forEach(icon => {
                            let icnSrc = icon.src || ''
                            if (icnSrc) {
                                icnSrc = getAbsoluteUrl(icnSrc, src);
                                addToAssets(assets, urlSet, icnSrc, 'img', cachePolicy, 'imgAppIcon');
                            }
                        })
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
                        imgSrc = getAbsoluteUrl(imgSrc, src);
                        addToAssets(assets, urlSet, imgSrc, 'img', cachePolicy, 'img');
                    })
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
                    })
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
                            cssImports += cssTxt
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

                    let props = rule.style
                    let backgroundImage = props.getPropertyValue('background-image') || ''
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


async function getSWSetup() {

    let setup = {
        network: new Set([]),
        cache: new Set([]),
        stale: new Set([]),
    }


    // add root
    setup.network.add('./');

    // get assets
    let assets = await getPwaAssets();
    for(let prop in assets){
        let items = assets[prop];
        items.forEach(item=>{
            let {src='', cachePolicy='cache'} = item;
            if(src) setup[cachePolicy].add(src);
        })
    }

    // add app name
    setup.appName = document.title.toLowerCase().replaceAll(' ', '_');
    setup.version = Date.now();

    /**
     * scan additional assets from data attributes
     */
    let els = document.querySelectorAll('[data-pw-cache], [data-pw-stale], [data-pw-network]')

    els.forEach(el => {
        let cache = el.dataset.pwCache ? el.dataset.pwCache.split(',').filter(Boolean).map(val => val.trim()) : []
        let stale = el.dataset.pwStale ? el.dataset.pwStale.split(',').filter(Boolean).map(val => val.trim()) : []
        let network = el.dataset.pwNetwork ? el.dataset.pwNetwork.split(',').filter(Boolean).map(val => val.trim()) : [];
        cache.forEach(url => setup.cache.add(url))
        network.forEach(url => setup.network.add(url))
        stale.forEach(url => setup.stale.add(url))
    })

    return setup;
}


/**
 * helpers
 */


/**
 * get import urls in
 * es modules
 */
async function getModuleImports(src = '') {
    let imports = [];
    if (!src) imports;
    // fetch and read JS text content
    let res = await fetch(src);
    if (res.ok) {
        let source = await res.text()
        let importRegex = /(?:import|export)\s*(?:.*?from\s*)?['"]([^'"]+)['"]/g;
        let match;
        while ((match = importRegex.exec(source)) !== null) {
            let url = getAbsoluteUrl(match[1], src)
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
    let urlAbs = URL.parse(url, baseUrl)
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
    let urls = css.match(urlRegex)

    if (!urls) return css;

    // exclude ie crap fonts
    urls = urls.filter(url => !url.includes('.eot'))

    let baseUrl = url;
    let pathArr = url.split('/')

    urls.forEach(url => {

        url = url.split(/\(|\)/)[1].replace(/"|'/g, '')
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
            let index = -1 - traverse
            let fontPath = dirs.slice(-1)[0];
            baseUrl = pathArr.slice(0, index).join('/') + '/'
            urlAbs = baseUrl + fontPath;
        }
        else if (relativeDir) {
            urlAbs = url.replaceAll('./', baseUrl)
        }

        css = css.replaceAll(url, urlAbs)
    })

    return css;
}

























/**
 * colllect all style info from 
 * current stylesheet
 */
function checkAvailableFonts(sheet, subsets = [], subset = '') {

    let fontDataLoaded = {}

    // compare fonts with required
    for (let i = 0, len = sheet.cssRules.length; len && i < len; i++) {
        let rule = sheet.cssRules[i];
        let type = rule.type;

        // is fontface
        if (type === 5) {
            let [fontFamily, fontWeight, fontStyle, fontStretch] = [
                rule.style.getPropertyValue('font-family').replace(/"|'| /g, ''),
                rule.style.getPropertyValue('font-weight') || '400',
                rule.style.getPropertyValue('font-style') || 'normal',
                rule.style.getPropertyValue('font-stretch') || '100',
            ];
            let subsetCurrent = subset ? subset : (subsets[i] ? subsets[i] : 'latin');

            // collect all available weights and styles
            if (!fontDataLoaded[fontFamily]) {
                fontDataLoaded[fontFamily] = { weights: new Set([]), widths: new Set([]), styles: new Set([]), isVF: false, subsets: new Set([]), keys: new Set() }
            }

            // normalize weights and widths string literals            
            fontWeight = fontWeight.split(' ').map(val => convertFontValues(val, 'weight'));
            fontStretch = fontStretch.split(' ').map(val => convertFontValues(val, 'stretch')).filter(Boolean);

            let isVF = fontWeight.length > 1 || fontStretch.length > 1 ? true : false;

            // add weights
            fontWeight.forEach(wght => fontDataLoaded[fontFamily].weights.add(wght))
            fontStretch.forEach(wdth => fontDataLoaded[fontFamily].widths.add(wdth))
            fontDataLoaded[fontFamily].isVF = isVF;
            fontDataLoaded[fontFamily].subsets.add(subsetCurrent);
            fontDataLoaded[fontFamily].styles.add(fontStyle);

        }
    }

    return fontDataLoaded
}





/**
 * convert string literal font values 
 * to numeric
 */
function convertFontValues(value, type = 'weight') {
    if (!isNaN(value)) return parseFloat(value);
    value = value.trim().toLowerCase();

    if (type === 'stretch') {
        if (value.includes('%')) return parseFloat(value);

        const fontWidths = {
            'ultra-condensed': 50,
            'extra-condensed': 62.5,
            'condensed': 75,
            'semi-condensed': 87.5,
            'normal': 100,
            'semi-expanded': 112.5,
            'expanded': 125,
            'extra-expanded': 150,
            'ultra-expanded': 200,
        };
        return fontWidths[value] || 100; // default to normal if unknown
    }

    if (type === 'weight') {
        const fontWeights = {
            'thin': 100,
            'extra-light': 200,
            'ultra-light': 200,
            'light': 300,
            'normal': 400,
            'regular': 400,
            'medium': 500,
            'semi-bold': 600,
            'demi-bold': 600,
            'bold': 700,
            'extra-bold': 800,
            'ultra-bold': 800,
            'black': 900,
            'heavy': 900,
        };
        return fontWeights[value] || 400; // default to normal if unknown
    }

};