import { getCurrentScriptUrl } from "./helpers_urls";

export async function isOnline() {
    let baseUrl = getCurrentScriptUrl();
    let filesToCheck = [`${baseUrl}/pwa-lite-sw.js`];
    let status = await networkMonitor(filesToCheck);
    return status[0].online? true : false;
}


export async function networkMonitor(srcset = []) {
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
                report.push({ online: 1, src })
            } else {
                report.push({ online: 0, src })
            }
        } catch {
            report.push({ online: 0, src })
        }
    }

    return report
}