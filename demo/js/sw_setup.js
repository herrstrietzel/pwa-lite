(async () => {
    //let fontRefs = await getFontReferences();
    //console.log('fontRefs', fontRefs);
    let setup = await getSWSetup();
    console.log('!!!setup', setup);
})();


async function getSWSetup() {

    let setup = {
        network: new Set([]),
        cache: new Set([]),
        stale: new Set([]),
    }

    /**
     * all DOM elements with
     * src or href attribute
     */


    /**
     * 1. scan all stylesheets
     */
    let styleSheets = document.styleSheets;

    for (let sheet of styleSheets) {
        // skip inline SVG styles
        let ownerNode = sheet.ownerNode || '';
        let cachePolicy = ownerNode ? (ownerNode.dataset.pwa || 'cache') : 'cache';

        // Process external stylesheets
        if (sheet.href) {
            let url = sheet.href;
            let css = '';

            // add stylesheet
            setup[cachePolicy].add(url);

            // Fetch and parse
            try {
                let res = await fetch(url);
                if (res.ok) {
                    css = await res.text();

                    // Find imports
                    let reg = /@import\s+(?:url\()?["']?([^"')]+)["']?\)?[^;]*;?/gi;
                    let imports = css.match(reg) || [];
                    let cssImports = '';

                    for (let i = 0, l = imports.length; l && i < l; i++) {
                        let imp = imports[i];

                        let importUrl = imp.split(/[\(|\)]/)[1].replace(/["|']/g, '')

                        // add import url
                        setup[cachePolicy].add(importUrl);

                        let res = await fetch(importUrl);
                        if (res.ok) {
                            let cssTxt = await res.text();
                            cssImports += cssTxt
                        }

                        // remove from stylesheet
                        css = css.replace(imp, '');

                        // embed rules from imports
                        css = cssImports + css;

                    };

                    // Fix relative URLs
                    css = relativeCssUrlsToAbsolute(css, url);

                }
            } catch (error) {
                console.error(`Error fetching stylesheet ${url}:`, error);
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
                    let fontUrl = src.split(/[\(|\)]/)[1]
                        .replace(/["|']/g, '');
                    setup.cache.add(fontUrl);
                }

                // add background images
                else {

                    let props = rule.style
                    let backgroundImage = props.getPropertyValue('background-image') || ''
                    if (!backgroundImage) continue

                    if (backgroundImage) {
                        let src = backgroundImage.split(/[\(|\)]/)[1]
                            .replace(/["|']/g, '');
                        setup.cache.add(src);
                    }
                }
            }
        }

    }

    /**
     * 2. find all images
     */

    let images = document.querySelectorAll('img')
    images.forEach(img => {
        let { src, srcset = '' } = img;

        // check data attributes for lazyloaded images
        let dataSrc = img.dataset.src || '';
        let dataSrcSet = img.dataset.srcset || '';
        let cachePolicy = img.dataset.pwa || 'cache';

        if (srcset || dataSrcSet) {
            let sourceset = srcset ? srcset : dataSrcSet;
            let srcArr = sourceset.split(',').filter(Boolean).map(src => src.trim()).map(src => src.split(' ')[0]);

            srcArr.forEach(src => {
                setup[cachePolicy].add(src);
            })
        }

        if (dataSrc) setup[cachePolicy].add(dataSrc);
        setup[cachePolicy].add(src);

    })

    /**
     * 2.1 favicons
     */
    let links = document.querySelectorAll('link[href*=".png"], link[href*=".svg"], link[href*=".ico"]')
    links.forEach(link => {
        setup.cache.add(link.href);
    })


    /**
     * 3. find all JS scripts
     */
    let scripts = document.querySelectorAll('script')
    for (let script of scripts) {
        let { src, type } = script;
        let cachePolicy = script.dataset.pwa || 'cache';

        // find src in module imports
        if (type === 'module') {
            let imports = await getModuleImports(src);
            //console.log('imports', imports);
            imports.forEach(src => setup[cachePolicy].add(src))
        }
        setup[cachePolicy].add(src);
    }


    // add root
    setup.network.add('./');

    // add app name
    setup.appName = document.title.toLowerCase().replaceAll(' ', '_');
    setup.version = Date.now();

    /**
     * 4. scan additional assets from data attributes
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


    //console.clear();

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