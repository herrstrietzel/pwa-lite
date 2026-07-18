import { getAbsoluteUrl, getModuleImports, relativeCssUrlsToAbsolute } from "./helpers_urls.js";

export async function getPwaAssets() {
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
                        //console.log('imgSrc', imgSrc, src);
                        imgSrc = getAbsoluteUrl(imgSrc);
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
