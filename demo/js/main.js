console.log('!!!base JS 2');

/**
 * flush
 */
const queryParams = new URLSearchParams(location.search);

if (queryParams.has("flush")) {

    navigator.serviceWorker.ready.then(reg => {
        reg.active?.postMessage({
            type: "FLUSH"
        });

        //setTimeout(() => location.reload(), 500);
        //location.reload()

    });

}


/**
 * register worker
 */
if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try {
            await navigator.serviceWorker.register("sw.js");
            console.log("Service Worker registered");

        } catch (err) {
            console.error("Service Worker registration failed:", err);
        }
    });
}

// show status
window.addEventListener('DOMContentLoaded', e=>{

    // show network state
    function updateStatus() {
        const feedback = document.getElementById("feedback");
        console.log(navigator);

        if (feedback) {
            feedback.textContent = navigator.onLine
                ? "online!"
                : "offline :(";
        }
    }
    
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    updateStatus();

})



// update worker cache
window.addEventListener("online", () => {
    console.log('update');
    navigator.serviceWorker.controller?.postMessage({
        type: "UPDATE_SHORT"
    });

});
