/**
 * get script url
 */
export function getCurrentScriptUrl() {
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
export async function getModuleImports(src = '') {
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

export function getAbsoluteUrl(url = '', baseUrl = '') {
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

export function relativeCssUrlsToAbsolute(css, url = '') {

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
