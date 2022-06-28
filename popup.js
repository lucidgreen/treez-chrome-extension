// constants
const sectionSetup = document.getElementById('setup');
const sectionCaseIDEntry = document.getElementById('caseid-entry');
const sectionIncorrectPage = document.getElementById('incorrect-page');

const caseIdButton = document.getElementById('case-id-button');
const inputClientId = document.getElementById('input-client-id');
const inputClientSecret = document.getElementById('input-client-secret');
const inputCaseId = document.getElementById('input-case-id');
const buttonShowSetup = document.getElementById('show-setup');
const buttonSetupSave = document.getElementById('button-setup-save');
const buttonSetupCancel = document.getElementById('button-setup-cancel');
const messageAlert = document.getElementById('message-alert');
const credentialsSection = document.getElementById('credentials');
const caseIDForm = document.getElementById('caseid-form');
const caseIDFormProgress = document.getElementById('caseid-form-progress');
const invalidCaseId = document.querySelector('#invalid-case-id');
let timer = null;

chrome.runtime.connect({ name: "popup" });
// regex to validate caseID
const validRegex = Object.freeze({
    shortUUID: /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{22}$/,
});

// events
window.onload = async function() {
    chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: ['ruleset_1']
    })
    await validateAPIKeys()

}

/*
 * validate input case id on keyup whether input from keyboard or paste or barcode scan
 * */
inputCaseId.addEventListener('keyup', (e) => {
    clearTimeout(timer);
    let input = e.target.value;
    timer = setTimeout(() => validateInput(input), 1000)

    async function validateInput(input) {
        if (input.indexOf('https://') !== -1) {
            // split over / and filter url in case of empty spaces when the url has / at the end
            let inputArray = input.split('/').filter(i => i !== "")
                // take last value which is the id of the case
            retrieveLucidIDs(inputArray[inputArray.length - 1])
        } else if (validRegex.shortUUID.test(input)) {
            invalidCaseId.style.display = "none";
            await retrieveLucidIDs(input)
        } else {
            invalidCaseId.innerText = errors.CASEID_NOT_VALID
            invalidCaseId.style.display = "block";
        }
    }
})

/*
 * show credentials  edit section
 * */
buttonShowSetup.addEventListener('click', async function() {
    displaySetup(true);
});

/*
 * store API keys in chrome storage on click of save button
 * */
buttonSetupSave.addEventListener('click', async function() {
    let clientId = inputClientId.value || '';
    let clientSecret = inputClientSecret.value || '';
    chrome.storage.sync.set({
        credentials: {
            clientId: clientId,
            clientSecret: clientSecret
        }
    }, async function() {
        if (chrome.runtime.error) {
            alert("Error in chrome.storage.sync.set: " + chrome.runtime.error.message);
        }
        let oldButtonText = buttonSetupSave.innerText;
        buttonSetupSave.innerText = 'Saving Settings...'
        buttonSetupSave.disabled = true
        setTimeout(async() => {
            buttonSetupSave.innerText = oldButtonText
            buttonSetupSave.disabled = false
            await validateAPIKeys()
        }, 1000)
    })
});

buttonSetupCancel.addEventListener('click', async function() {
    displaySetup(false);
});

/*
 Save credentials on keyup
 */
inputClientId.addEventListener('keyup', async(event) => {
    let clientId = event.target.value
    await saveCredentialsOnChange({ "clientId": clientId })
})
inputClientSecret.addEventListener('keyup', async(event) => {
    let clientSecret = event.target.value
    await saveCredentialsOnChange({ "clientSecret": clientSecret })
})

/*
 * fetch lucid ids from firing event for background script to fetch the apis
 *
 */
async function retrieveLucidIDs(caseID) {
    console.log('Retrieving LucidIDs for CaseID: ' + caseID);
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: checkPage,
    }, function(data) {
        if (!data[0].result) {
            showAPIError(errors.PAGE_ERROR, true)
            return
        }
        inputCaseId.disabled = true
        displaySpinner(true);
        try {
            //goes to bg_page.js
            chrome.runtime.sendMessage({
                    caseId: caseID
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

function showErrorForHandleTreezInputs(message) {
    showAPIError(message, true)
    displaySpinner(false)
    inputCaseId.disabled = false
    inputCaseId.value = ''
    focusInput(inputCaseId)
}

async function handleTreezInputs(data) {
    if (Object.keys(data).length === 0) {
        showErrorForHandleTreezInputs(errors.ERROR_GETTING_DATA)
        return;
    } else if (data.code) {
        showErrorForHandleTreezInputs(`${data.code} : ${data.message}`)
        return
    } else if (data.items.length === 0) {
        showErrorForHandleTreezInputs(errors.EMPTY_CASE)
        return;
    }

    try {
        await getItemsFromStorage('ReqHeaders', errors.HEADERS_NOT_FOUND)
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        let [{ result }] = await getAndFilterExistingLucidIdsFromTreez(data, tab);
        // replace data with new filtered data
        let filtered_items = result
        Promise.allSettled(filtered_items.map(async(item, index) => fillRows(filtered_items[index], tab))).then((data) => {
            inputCaseId.value = ''
            inputCaseId.disabled = false
            displaySpinner(false)
            focusInput(inputCaseId)
        }).catch(e => {
            alert(e.message)
        })
    } catch (e) {
        showErrorForHandleTreezInputs(errors.HEADERS_NOT_FOUND)
    }
}

/*
 * fill rows with data from lucid ids
 */
async function fillRows(item, tab) {
    return new Promise((resolve, reject) => {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: addElementAndValue,
            args: [item]
        }, function([{ result }]) {
            if (!result) {
                reject({ message: errors.PROMISE_ERROR })
                return
            }
            resolve(result)
        })
    })
}

async function getAndFilterExistingLucidIdsFromTreez(data, tab) {
    return await chrome.scripting.executeScript({
        target: { tabId: tab.id },
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
        const event = new Event('change', { bubbles: true });
        const input = body.children[body.childNodes.length - 2].getElementsByTagName('input')[0]
            // TODO: remove this line when Treez fixes their validation
        body.children[body.childNodes.length - 2].style.display = 'none'
        const button = body.children[body.childNodes.length - 2].childNodes[3].childNodes[0]
        input.setAttribute("value", lucidId.lucid_id);
        input.dispatchEvent(event);
        button.click();
    })
}

function checkPage() {
    const body = document.querySelector('.treez-barcode-container');
    if (!body /*|| window.location.pathname.indexOf('/Invoice/edit/') === -1 */ ) {
        return false
    }
    return true;
}

function displaySetup(visible = false) {
    if (visible) {
        sectionSetup.style.display = "block";
        buttonShowSetup.style.display = "none";
        sectionCaseIDEntry.style.display = "none";
        sectionIncorrectPage.style.display = "none";
        focusInput(inputClientId);
    } else {
        sectionSetup.style.display = "none";
        buttonShowSetup.style.display = "block";
        sectionCaseIDEntry.style.display = "block";
        sectionIncorrectPage.style.display = "none";
        focusInput(inputCaseId);
    }
}

function displayIncorrectPage(visible = false) {
    if (visible) {
        sectionSetup.style.display = "none";
        buttonShowSetup.style.display = "none";
        sectionCaseIDEntry.style.display = "none";
        sectionIncorrectPage.style.display = "block";
        focusInput(inputClientId);
    } else {
        sectionSetup.style.display = "none";
        buttonShowSetup.style.display = "block";
        sectionCaseIDEntry.style.display = "block";
        sectionIncorrectPage.style.display = "none";
        focusInput(inputCaseId);
    }
}

function showAPIError(message, visible) {
    if (visible) {
        messageAlert.style.display = 'block'
        messageAlert.innerText = message
    } else {
        messageAlert.style.display = 'none'
        messageAlert.innerText = message
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
        displaySetup(false);
        showAPIError('', false)
        inputCaseId.disabled = false;
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: checkPage,
        }, async function(data) {
            if (!data[0].result) {
                displayIncorrectPage(true)
            }
        })
    } catch (e) {
        showAPIError(e.message, true)
        displaySetup(true);
        inputCaseId.disabled = true;
    }
}

function displaySpinner(visible) {
    if (visible) {
        caseIDForm.style.display = 'none';
        caseIDFormProgress.style.display = 'block';
    } else {
        caseIDForm.style.display = 'block';
        caseIDFormProgress.style.display = 'none';
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
    return new Promise(function(resolve, reject) {
        chrome.storage.sync.get([`${key}`], function(items) {
            if (!chrome.runtime.error) {
                if (items[`${key}`]) {
                    resolve(items[`${key}`])
                } else {
                    reject({ message: errorMessage })
                }
            } else {
                reject({ message: errors.STORAGE_ERROR })
            }
        });
    });
}

async function saveCredentialsOnChange(data) {
    let credentials;
    try {
        credentials = await getItemsFromStorage('credentials')
    } catch (e) {
        credentials = {}
    }
    try {
        chrome.storage.sync.set({
            credentials: {
                ...credentials,
                ...data
            }
        }, async function() {
            if (chrome.runtime.error) {
                alert("Error in chrome.storage.sync.set: " + chrome.runtime.error.message);
            }
            buttonSetupSave.innerText = 'Saved'
            buttonSetupSave.disabled = true
            setTimeout(async() => {
                buttonSetupSave.innerText = 'Save'
                buttonSetupSave.disabled = false
                await validateAPIKeys()
            }, 1000)
        })
    } catch (e) {
        console.error(e)
    }
}

// errors object
const errors = {
    "CREDENTIALS_NOT_FOUND": "You must enter valid API credentials",
    "HEADERS_NOT_FOUND": "Please refresh this page so Lucid Green extension can retrieve required information",
    "CASEID_NOT_VALID": "Invalid CaseID",
    "PAGE_ERROR": "Please navigate to a Treez Inventory Package page",
    "404_ERROR": "Unknown page",
    "STORAGE_ERROR": "Chrome extension storage error",
    "EMPTY_CASE": "CaseID has no LucidIDs",
    "ERROR_GETTING_DATA": "Error retrieving CaseID information",
    "PROMISE_ERROR": "Chrome extension promise error",
}