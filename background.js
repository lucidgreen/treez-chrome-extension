const baseURL_DEV = 'https://retail-dev.lucidgreen.io';
const baseURL = 'https://retail.lucidgreen.io';
const baseQRURLDEV = 'https://dev-qr.lcdg.io';
const baseQRURL = 'https://qr.lcdg.io';
const filter = { urls: ["https://*.treez.io/InventoryService/barcode/"] }
const filterHeaders = {urls: ["https://*.treez.io/HintsService/v1.0/rest/config/restaurant/1/config/decode/BUILD_NUMBER",
                              "https://document-template-api.treez.io/label/labels"]}
let dev_mode = true
const validRegex = Object.freeze({
    shortUUID: /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{22}$/,
});
// by default work around is set to true
let workAround = true
if(workAround){
    activateWorkAround()
}
    /*
     * this event listens to a message that is fired from the content script ( popup.js )
     * requests are made in the background since they aren't allowed to be sent from the content script
     */
chrome.runtime.onMessage.addListener(
    function({ caseId, message }, sender, onSuccess) {
        (async function action() {
            try {
                // get credentials from sync storage
                let { clientId, clientSecret } = await getItemsFromStorage('credentials')
                    // send oauth request to get access token
                const response = await fetch(`${dev_mode ? baseURL_DEV:baseURL}/o/token/`, {
                    method: "POST",
                    body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                });
                // check for response
                if (!response.ok) {
                    onSuccess({
                        code: response.status,
                        message: getErrorMessage(response.status)
                    })
                }
                const { token_type, access_token } = await response.json();
                // set-up headers for fetching case data
                const header = {
                        'Authorization': `${token_type} ${access_token}`,
                    }
                    // get case lucid ids
                let caseItems = await fetch(`${dev_mode ? baseURL_DEV : baseURL}/api/v1/collections/case/${caseId}/`, {
                    headers: header
                });
                // check for response
                if (!caseItems.ok) {
                    onSuccess({
                        code: caseItems.status,
                        message: getErrorMessage(caseItems.status)
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
/*
 *   event for work around to bypass Treez validation to disable rule when popup is inactive
 *   check when the popup connection is disconnected then disable the rule
 */
chrome.runtime.onConnect.addListener(function(port) {
    // when popup is clicked and open ( connected ) because when disconnect we disable the rule
    if(workAround){
        chrome.declarativeNetRequest.updateEnabledRulesets({
            enableRulesetIds: ['ruleset_1']
        })
    }
    if (port.name === "popup") {
        port.onDisconnect.addListener(function() {
            chrome.declarativeNetRequest.updateEnabledRulesets({
                disableRulesetIds: ['ruleset_1']
            })
        });
    }
});
/*
 *   function for work around to bypass Treez validation
 *   in this listener function the request is caught before being blocked
 *   and data are extracted from it, and then it gets blocked by the rule
 */
async function onBeforeRequest(details) {
    if (details.method === "POST") {
        // decode request body
        var postedString = decodeURIComponent(String.fromCharCode.apply(null,
            new Uint8Array(details.requestBody.raw[0].bytes)));
        // parse the decoded body to json
        const payload = JSON.parse(postedString);
        // check if the code is a valid short uuid to add a full url to it
        if (validRegex.shortUUID.test(payload.dataObject.code)) {
            payload.dataObject.code = `${dev_mode ? baseQRURLDEV:baseQRURL}/${payload.dataObject.code}`
            try {
                const headers = await getItemsFromStorage("ReqHeaders")
                    // check if this request is sent from extension or not
                if (!payload.dataObject.sentFromChromeExtension) {
                    // add a boolean to the body to tell that this request is coming from extension
                    // so next time this request is intercepted it's ignored since it's allowed only once per lucid id
                    payload.dataObject['sentFromChromeExtension'] = true
                    const data = await getLucidIdsForInterceptedReq(details.url, headers, payload)
                    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (data.resultCode === "FAIL") {
                        new Promise((resolve, reject) => {
                            setTimeout(resolve, 100)
                        }).then(() => {
                            chrome.runtime.sendMessage({
                                    type: "alert",
                                    message: messages.ALREADY_IMPORTED_LUCID_IDS
                                },
                            );
                        })
                        return;
                    }
                    const { data: { startDate } } = data;
                    // execute a script to the webpage to add static rows
                    chrome.runtime.sendMessage({
                            type: "fill-rows",
                            message: {
                                startDate,
                                code: payload.dataObject.code
                            }
                        },
                    );
                    new Promise((resolve, reject) => {
                        setTimeout(resolve, 500)
                    }).then(() => {
                        chrome.runtime.sendMessage({
                                type: "refresh-alert",
                                message: messages.REFRESH_MESSAGE
                            },
                        );
                    })
                }
            } catch (e) {
                chrome.runtime.sendMessage({
                        type: "alert",
                        message: messages.TREEZ_FETCH_ERROR
                    },
                );
            }
        }
    }
}

function showErrorAlertForTreezRequest() {
    alert("Error occurred during saving barcode record on Treez")
}

    /*
     *   function for work around to bypass Treez validation
     *   this listener callback holds the request before it's send
     *   and after the headers are put to request
     *   so it extracts the headers from the request and store then in the storage
     */
async function onBeforeSendHeaders(headers) {
    for (var i = 0; i < headers.requestHeaders.length; ++i) {
        if (headers.requestHeaders[i].name === 'Authorization') {
            headers.requestHeaders.splice(i, 1);
            break;
        }
    }
    const ReqHeaders = {}
    headers.requestHeaders.forEach(function(item) {
            ReqHeaders[item.name] = item.value;
        })
        // store headers
    chrome.storage.sync.set({
        ReqHeaders
    })
}
/*
 *   function for work around  to bypass Treez validation to get lucid ids
 */
async function getLucidIdsForInterceptedReq(url, headers, payload) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    const data = await response.json()
    return data;
}
/*
 * get items from sync storage
 * @param {string} key
 * @returns {Promise<{clientId: string, clientSecret: string}>}
 */
function getItemsFromStorage(key) {
    return new Promise(function(resolve, reject) {
        chrome.storage.sync.get([`${key}`], function(items) {
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

/*
 *   function for work around  to bypass Treez validation to get lucid ids
 */

/*
 * function to get proper error message based on reponse code
 */
function getErrorMessage(code) {
    const errors = {
        404: "Case Not Found",
        401: "You are unauthorized please check your credentials",
        400: "Bad Request",
        503: "Services are temporarily unavailable",
        500: "Internal Server Error"
    }
    return errors[`${code}`]
}

function activateWorkAround() {
    console.log('work around is enabled')
        /*
   *   function for work around to bypass Treez validation to get request body
   *   this event listens to any request that is fired from the webpage with the filtered url
   */
        chrome.webRequest.onBeforeRequest.addListener(
            onBeforeRequest,
            filter, ["requestBody"]
        )
        /*
         *   event for work around to bypass Treez validation to get request headers
         *   this event catches a request with the filterd url to take HEADERS from the request and store them
         *   for feature request form the extension
         */
        chrome.webRequest.onBeforeSendHeaders.addListener(
            onBeforeSendHeaders,
            filterHeaders, ["requestHeaders"]
        )
        chrome.declarativeNetRequest.updateEnabledRulesets({
            enableRulesetIds: ['ruleset_1']
        })
}
const messages = {
    "REFRESH_MESSAGE": {
        id: "alert-refresh",
        message: "Refresh this page to modify the imported LucidIDs."
    },
    "DUPLICATED_LUCID_IDS": {
        id: "alert-duplicate",
        messages: "Some of the LucidIDs in this case already exist."
    },
    "ALREADY_IMPORTED_LUCID_IDS": {
        id: "alert-already-imported",
        messages: "Some of the LucidIDs in this case have already been imported to this inventory record."
    }
}