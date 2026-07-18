(async () => {

    // check query params
    const params = new URLSearchParams(location.search);
    const flush = params.has("flush");
    const noSW = params.has("no-sw");
    const setup = await getSWSetup();


    if ("serviceWorker" in navigator) {

        if (flush) {

            // unregister all workers
            const regs = await navigator.serviceWorker.getRegistrations();

            await Promise.all(
                regs.map(r => r.unregister())
            );

            // remove all caches
            const names = await caches.keys();

            await Promise.all(
                names.map(name => caches.delete(name))
            );

            // remove ?flush
            //history.replaceState({}, "", location.pathname);
        }

        const reg = await navigator.serviceWorker.register("./sw.js");
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
