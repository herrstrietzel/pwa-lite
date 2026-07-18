
export function initAppUIBehavior(
    settings = {}
) {

    let { fullscreen = true, contextMenu = true, devtools = true,
    } = settings;

    //console.log(fullscreen, contextMenu, devtools);

    //resize
    let modes = [
        "fullscreen",
        "standalone",
        "minimal-ui",
        "browser"
    ];

    //console.log('!!!disableContextMenu', contextMenu);

    if (!contextMenu) {
        disableContextMenu();
    }

    if (!devtools) {
        disableDevtools();
    }


    let currentMode = 'browser';
    for (const mode of modes) {
        if (window.matchMedia(`(display-mode: ${mode})`).matches) {
            //console.log(`Display mode: ${mode}`);
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
        }

        if (!document.body.classList.contains('init-mouse-move')) {
            document.addEventListener('click', initMouseMove)
            document.body.classList.add('init-mouse-move')
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
            //alert('tab')
        }

        // fullscreen toggle
        if (e.key === 'F11') {
            //alert('key: '+ e.key);
            disabledEvent(e);
        }

        // F12
        if (e.key === 'F12') {
            disabledEvent(e);
        }


        // prevent dev tools
        if (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "I")) {
            //console.log('dev', e, e.key);
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
};
