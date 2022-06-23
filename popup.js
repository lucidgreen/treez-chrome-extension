// constants
const caseIdButton = document.getElementById('case-id-button');
const inputClientId = document.getElementById('input-client-id');
const inputClientSecret = document.getElementById('input-client-secret');
const inputCaseId = document.getElementById('input-case-id');
const showEditSection = document.getElementById('api-key-show-edit');
const editAPIKeyButton = document.getElementById('api-key-edit');
const APIAlert = document.getElementById('alert');
const credentialsSection = document.querySelector('#credentials');
const spinner = document.querySelector('#spinner');
const invalidCaseId = document.querySelector('#invalid-case-id');
let timer = null;

chrome.runtime.connect({ name: "popup" });
// regex to validate caseID
const validRegex = Object.freeze({
    caseID: /.[^\s]*(lucidgreen.io|lcdg.io)\/(collection|c)\/[^\s]{22}[/]?$/,
    shortUUID: /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{22}$/,
});
// events
window.onload = async function () {
    chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds:['ruleset_1']
    })
    await validateAPIKeys()
}
/*
* validate input case id on keyup whether input from keyboard or paste or barcode scan
* */
inputCaseId.addEventListener('keyup', (e) => {
    clearTimeout(timer);
    let input = e.target.value;
    timer = setTimeout(() => validateInput(input), 100)

    function validateInput(input) {
        if (input.indexOf('https://') !== -1) {
            inputCaseId.value = input.split('/').filter(i => i.length === 22);
            if (validRegex.shortUUID.test(inputCaseId.value)) {
                getCaseLucidIds()
            }
        } else if (validRegex.shortUUID.test(input)) {
            invalidCaseId.style.display = "none";
            getCaseLucidIds()
        } else {
            invalidCaseId.innerText = errors.CASE_ID_NOT_VALID
            invalidCaseId.style.display = "block";
        }
    }
})
/*
* show credentials  edit section
* */
showEditSection.addEventListener('click', async function () {
    APIKeyInputVisibility(true)
});
/*
* show credentials  edit section
* */
editAPIKeyButton.addEventListener('click', async function () {
    APIKeyInputVisibility(false)
});

/*
 Save credentials on keyup
 */
inputClientId.addEventListener('keyup', async (event) => {
    let clientId = event.target.value
    await saveCredentialsOnChange("clientId",clientId)
})
inputClientSecret.addEventListener('keyup', async (event) => {
    let clientSecret = event.target.value
    await saveCredentialsOnChange("clientSecret",clientSecret)
})
/*
* fetch lucid ids from firing event for background script to fetch the apis
 */
async function getCaseLucidIds() {
    let [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: checkPage,
    }, function (data) {
        if (!data[0].result) {
            APIalert(errors.PAGE_ERROR, true)
            return
        }
        inputCaseId.disabled = true
        const caseId = inputCaseId.value;
        showHideSpinner(true)
        try {
            chrome.runtime.sendMessage( //goes to bg_page.js
                {
                    caseId: caseId
                },
                data => handleTreezInputs(data)
            );
        } catch (e) {
            alert(e + '\n' + errors["404_ERROR"])
        }
    });

}

/*
*
* */
async function handleTreezInputs(data) {
    if (Object.keys(data).length === 0 ) {
        APIalert(errors.ERROR_GETTING_DATA, true)
        showHideSpinner(false)
        inputCaseId.disabled = false
        inputCaseId.value = ''
        focusInput(inputCaseId)
        return;
    }
    if (data.code) {
        APIalert(`${data.code} : ${data.message}`, true)
        showHideSpinner(false)
        inputCaseId.disabled = false
        inputCaseId.value = ''
        focusInput(inputCaseId)
        return;
    }
    if (data.items.length === 0) {
        APIalert(errors.EMPTY_CASE, true)
        showHideSpinner(true)
        inputCaseId.disabled = false
        inputCaseId.value = ''
        focusInput(inputCaseId)
        return;
    }
    let [tab] = await chrome.tabs.query({active: true, currentWindow: true});

    let [{result}] = await getAndFilterExistingLucidIdsFromTreez(data, tab);
    // replace data with new filtered data
    let filtered_items = result
    await Promise.allSettled(filtered_items.map(async (item, index) => fillRows(filtered_items[index], tab)
    )).then((data) => {
        inputCaseId.value = ''
        inputCaseId.disabled = false
        focusInput(inputCaseId)
        showHideSpinner(false)
    }).catch(e => {
        alert(e.message)
    })
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: addRefreshAlert
    })
}

/*
* fill rows with data from lucid ids
 */
async function fillRows(item, tab) {
    return new Promise((resolve, reject) => {
        chrome.scripting.executeScript({
            target: {tabId: tab.id},
            function: addElementAndValue,
            args: [item]
        }, function ([{result}]) {
            if (!result) {
                reject({message: errors.PROMISE_ERROR})
                return
            }
            resolve(result)
        })
    })
}

async function getAndFilterExistingLucidIdsFromTreez(data, tab) {
    return await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: filterLucidIds,
        args: [data.items]
    })
}

function filterLucidIds(data) {
    const body = document.querySelector('.treez-barcode-container');
    let lucidIds = [];
    body.childNodes.forEach((child) => {
        if (child.classList.contains('treez-barcode-grid-item')) {
            if (child.querySelector('input')) {
                lucidIds.push(child.querySelector('input').value)
            } else {
                lucidIds.push(child.querySelector('.selectable').innerText)
            }
        }
    })
    return data.filter((lucidId) => !lucidIds.includes(lucidId.lucid_id))
}

async function addElementAndValue(lucidId) {
    const body = document.querySelector('.treez-barcode-container');
    let app_lastChild = body.lastChild;

    async function click(element) {
        return new Promise((resolve, reject) => {
            resolve(element.click())
        })
    }

    await click(app_lastChild).then(() => {
        const event = new Event('change', {bubbles: true});
        const input = body.children[body.childNodes.length - 2].getElementsByTagName('input')[0]
        body.children[body.childNodes.length - 2].style.display = 'none'
        const button = body.children[body.childNodes.length - 2].childNodes[3].childNodes[0]
        input.setAttribute("value", lucidId.lucid_id);
        input.dispatchEvent(event);
        button.click();
    })
}

function checkPage() {
    const body = document.querySelector('.treez-barcode-container');
    if (!body || window.location.pathname.indexOf('/Invoice/edit/') === -1) {
        return false
    }
    return true;
}

function APIKeyInputVisibility(visible = false) {
    if (visible) {
        credentialsSection.style.display = "block";
        editAPIKeyButton.style.display = "block";
        showEditSection.style.display = "none";
    } else {
        credentialsSection.style.display = "none";
        editAPIKeyButton.style.display = "none";
        showEditSection.style.display = "block";
    }
}

function APIalert(message, visible) {
    if (visible) {
        APIAlert.style.display = 'block'
        APIAlert.innerText = message
    } else {
        APIAlert.style.display = 'none'
        APIAlert.innerText = message
    }
}

async function validateAPIKeys() {
    try {
        const {
            clientId = null,
            clientSecret = null
        } = await getItemsFromStorage('credentials', errors.CREDENTIALS_NOT_FOUND);
        inputClientId.value = clientId;
        inputClientSecret.value = clientSecret;
        if (!clientId || !clientSecret) {
            throw new Error(errors.CREDENTIALS_NOT_FOUND)
        }

        APIKeyInputVisibility(false);
        APIalert('', false)
        inputCaseId.disabled = false;

    } catch (e) {
        APIalert(e.message, true)
        APIKeyInputVisibility(true);
        inputCaseId.disabled = true;
    }
}

function showHideSpinner(visible) {
    if (visible) {
        spinner.style.display = 'block';
    } else {
        spinner.style.display = 'none';
    }
}

function focusInput(input) {
    input.focus();
}


/*
* get items from sync storage
* @param {string} key
* @returns {Promise<{clientId: string, clientSecret: string}>}
 */
function getItemsFromStorage(key, errorMessage) {
    return new Promise(function (resolve, reject) {
        chrome.storage.sync.get([`${key}`], function (items) {
            if (!chrome.runtime.error) {
                if (items[`${key}`]) {
                    resolve(items[`${key}`])
                } else {
                    reject({message: errorMessage})
                }
            } else {
                reject({message: errors.STORAGE_ERROR})
            }
        });
    });
}

async function saveCredentialsOnChange(key,value){
    let credentials = {}
    try {
        credentials = await getItemsFromStorage('credentials')
    } catch (e) {
        console.error(e)
    }
    try{
        chrome.storage.sync.set({
            credentials: {
                ...credentials,
                [key]:value
            }
        }, async function () {
            if (chrome.runtime.error) {
                alert("Error in chrome.storage.sync.set: " + chrome.runtime.error.message);
            }
            editAPIKeyButton.innerText = 'Saved'
            editAPIKeyButton.disabled = true
            setTimeout(async () => {
                editAPIKeyButton.innerText = 'Save'
                editAPIKeyButton.disabled = false
                await validateAPIKeys()
            }, 1000)
        })
    }catch (e){
        console.error(e)
    }
}

function addRefreshAlert(){
    const card = document.querySelector('.treez-barcode-container').parentElement.parentElement
    if(!card){
        return
    }
    const html = `
    <div  style="background-color:#f8d7d9;padding: 5px;font-weight: bold">
    <div class="upper" style="text-align: center">Inorder to edit or delete the added Lucid ids please refresh the page</div>
    </div>
    `
     card.innerHTML+=html;
}
// errors object
const errors = {
    "CREDENTIALS_NOT_FOUND": "You Need To Enter Your Full Credentials",
    "INVALID_CASE_ID": "Invalid Case Id",
    "CASE_ID_NOT_VALID": "Case UUID Is Not Valid",
    "PAGE_ERROR": "Make Sure You Are On The Right Page",
    "404_ERROR": "Please check your API Key and Case ID",
    "STORAGE_ERROR": "Error Getting data From Storage",
    "EMPTY_CASE": "Case Is Empty",
    "ERROR_GETTING_DATA": "Error Getting Data From Lucid Retail",
    "PROMISE_ERROR": "Promise Error",

}
