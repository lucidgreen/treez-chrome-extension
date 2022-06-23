const baseURLDEV = 'https://retail-dev.lucidgreen.io';
const baseURL = 'https://retail.lucidgreen.io';
const filter = {urls: ["https://erba.treez.io/InventoryService/barcode/"]}
const filterHeaders = {urls: ["https://erba.treez.io/HintsService/v1.0/rest/config/restaurant/1/config/decode/BUILD_NUMBER"]}
let x = 1;
const validRegex = Object.freeze({
    caseID: /.[^\s]*(lucidgreen.io|lcdg.io)\/(collection|c)\/[^\s]{22}[/]?$/,
    shortUUID: /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{22}$/,
});

async function onBeforeRequest(details) {
    if (details.method === "POST") {
        var postedString = decodeURIComponent(String.fromCharCode.apply(null,
            new Uint8Array(details.requestBody.raw[0].bytes)));
        const payload = JSON.parse(postedString);
        if (validRegex.shortUUID.test(payload.dataObject.code)) {
            payload.dataObject.code = `https://dev-qr.lcdg.io/${payload.dataObject.code}`
            const headers = await getItemsFromStorage("ReqHeaders")
            if (!payload.dataObject.sentFromChromeExtension) {
                payload.dataObject['sentFromChromeExtension'] = true
                fetch(details.url, {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                }).then(async function (response) {
                    const {data} = await response.json();
                    let [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                    chrome.scripting.executeScript({
                        target: {tabId: tab.id},
                        function: fillRows,
                        args: [payload.dataObject.code, data.startDate]
                    })
                }).catch(function (error) {
                    console.log(error)
                })
            }
        }
    }
}

const fillRows = (code, time) => {
    let html = `<div class="treez-barcode-grid-item">
  <div class="flex-start-center" style="padding-left: 8px;">${new Date(time).toLocaleDateString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    }).split(',').join(" ")}</div>
  <div class="flex-start-center selectable">${code}</div>
  <div class="flex-start-center">User Defined</div>
  <div class="flex-start-center"><img src="/portalDispensary/v2/dist/53cb8100ce2addf7d2e5ce29964ab3e5.svg" class="clickable"></div>
  <div class="flex-start-center"><img src="/portalDispensary/v2/dist/266c56b1f69ebdbddb812ec720b2babd.svg" class="clickable"></div>
</div>`
    const body = document.querySelector('.treez-barcode-container');
    let app_lastChild = body.lastChild;
    body.removeChild(app_lastChild)
    body.innerHTML += html
    body.appendChild(app_lastChild)
}
var onBeforeSendHeaders = function (headers) {
    for (var i = 0; i < headers.requestHeaders.length; ++i) {
        if (headers.requestHeaders[i].name === 'Authorization') {
            headers.requestHeaders.splice(i, 1);
            break;
        }
    }
    const ReqHeaders = {}
    headers.requestHeaders.forEach(function (item) {
        ReqHeaders[item.name] = item.value;
    })
    chrome.storage.sync.set({
        ReqHeaders
    })
}

chrome.webRequest.onBeforeRequest.addListener(
    onBeforeRequest,
    filter,
    ["requestBody"]
)
chrome.webRequest.onBeforeSendHeaders.addListener(
    onBeforeSendHeaders,
    filterHeaders,
    ["requestHeaders"]
)
chrome.runtime.onMessage.addListener(
    function ({caseId, message}, sender, onSuccess) {
        (async function action() {
            try {
                // get credentials from sync storage
                let {clientId, clientSecret} = await getItemsFromStorage('credentials')
                // send oauth request to get access token
                const response = await fetch(`${baseURLDEV}/o/token/`, {
                    method: "POST",
                    body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                });
                // check for response
                if (response.status !== 200) {
                    onSuccess({
                        code: response.status,
                        message: response.statusText
                    })
                    return true;
                }
                const {token_type, access_token} = await response.json();
                // set-up headers for fetching case data
                const header = {
                    'Authorization': `${token_type} ${access_token}`,
                }
                // get case lucid ids
                let caseItems = await fetch(`${baseURLDEV}/api/v1/collections/case/${caseId}/`, {
                    headers: header
                });
                // check for response
                if (caseItems.status !== 200) {
                    onSuccess({
                        code: caseItems.status,
                        message: caseItems.statusText
                    })
                    return true;
                }
                const caseItemsJSON = await caseItems.json();
                onSuccess(caseItemsJSON)
            } catch (e) {
                onSuccess(e)
            }
        })()
        return true;
    }
);
chrome.runtime.onConnect.addListener(function(port) {
    if (port.name === "popup") {
        port.onDisconnect.addListener(function() {
            chrome.declarativeNetRequest.updateEnabledRulesets({
                disableRulesetIds:['ruleset_1']
            })
        });
    }
});
/*
* get items from sync storage
* @param {string} key
* @returns {Promise<{clientId: string, clientSecret: string}>}
 */
function getItemsFromStorage(key) {
    return new Promise(function (resolve, reject) {
        chrome.storage.sync.get([`${key}`], function (items) {
            if (!chrome.runtime.error) {
                if (items[`${key}`]) {
                    resolve(items[`${key}`])
                } else {
                    reject(`No Key ${key} Stored`)
                }
            } else {
                reject('Error')
            }
        });
    });
}
