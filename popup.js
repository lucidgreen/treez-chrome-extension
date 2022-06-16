// constants
const caseIdButton = document.getElementById('case-id-button');
const inputClientId = document.getElementById('input-client-id');
const inputClientSecret = document.getElementById('input-client-secret');
const inputCaseId = document.getElementById('input-case-id');
const editAPIKeyButton = document.getElementById('api-key-show-edit');
const APIAlert = document.getElementById('alert');
const credentialsSection = document.querySelector('#credentials');
const spinner = document.querySelector('#spinner');
let showEditInput = false;
let timer = null;


// regex to validate caseID
const validRegex = Object.freeze({
    caseID: /.[^\s]*(lucidgreen.io|lcdg.io)\/(collection|c)\/[^\s]{22}[/]?$/,
    shortUUID: /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{22}$/,
});
// events

window.onload = async function () {
    try {
        const {clientId, clientSecret} = await getCredentials('credentials');
        if (!clientId || !clientSecret) {
            APIalert('You Need To Enter Your Credentials', true)
        }
        inputClientId.value = clientId;
        inputClientSecret.value = clientSecret;
    } catch (e) {
        showAPIKeyInput();
        APIalert('You Need To Enter Your Credentials', true)
    }
}

inputCaseId.addEventListener('keyup', (e) => {
    clearTimeout(timer);
    let url = e.target.value;
    if (validRegex.shortUUID.test(e.target.value)) {
        caseIdButton.click();
    }
    timer = setTimeout(() => doStuff(url), 100)

    function doStuff(url) {
        if (url.indexOf('https://') !== -1) {
            inputCaseId.value = url.split('/').filter(i => i.length === 22);
            if (validRegex.caseID.test(url)) {
                caseIdButton.click();
            }
        }
    }
})

editAPIKeyButton.addEventListener('click', async function () {
    APIalert('', false)
    if (!showEditInput) {
        showAPIKeyInput()
    } else {
        let clientId = inputClientId.value || '';
        let clientSecret = inputClientSecret.value || '';
        chrome.storage.sync.set({
            credentials: {
                clientId: clientId,
                clientSecret: clientSecret
            }
        }, function () {
            if (chrome.runtime.error) {
                alert("Error")
                console.log(chrome.runtime.error);
            }
            APIalert('', false)
            hideAPIKeyInput()
            focusInput(inputCaseId)
        })
    }
});
caseIdButton.addEventListener('click', async function () {
    let [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: checkPage,
    }, function (data) {
        if (!data[0].result) {
            APIalert("Make Sure You are on the right page", true)
            return
        }
        inputCaseId.setAttribute('disabled', true)
        getItemsEvent()
    });

});

function getItemsEvent() {
    const caseId = inputCaseId.value;
    if (!caseId) {
        focusInput(inputCaseId)
        return
    }
    showHideSpinner('show')
    try {
        chrome.runtime.sendMessage( //goes to bg_page.js
            {
                caseId: caseId
            },
            data => dataProcessFunction(data)
        );
    } catch (e) {
        alert(e + '\n' + 'Please check your API Key and Case ID')
    }

}

function getCredentials(key) {
    return new Promise(function (resolve, reject) {
        chrome.storage.sync.get([`${key}`], function (items) {
            if (!chrome.runtime.error) {
                if (items[`${key}`]) {
                    resolve(items[`${key}`])
                } else {
                    reject('No API Key')
                }
            } else {
                reject('Error')
            }
        });
    });
}

async function dataProcessFunction(data) {
    if (data.code) {
        APIalert(data.message, true)
        showHideSpinner('hide')
        return;
    }
    if (data.items.length === 0) {
        APIalert("This Case Doesn't have lucid ids in it", true)
        showHideSpinner('hide')
        return;
    }
    inputCaseId.removeAttribute('disabled')
    inputCaseId.value = ''
    focusInput(inputCaseId)
    let [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    caseIdButton.style.display = "block";
    spinner.style.display = "none";
    let res = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: filterLucidIds,
        args: [data.items]
    })
    let i = 0;
    let checkInput = true
    let prevValue = -1;
    let interval = setInterval(async () => {
        if (i === data.items.length) {
            clearInterval(interval)
        }
        if (checkInput && prevValue!==i) {
            prevValue = i;
            checkInput = false
            let lastElementInput = await chrome.scripting.executeScript({
                target: {tabId: tab.id},
                function: lastElementInputScript,
            })
            if (!lastElementInput[0].result) {
                let resultInput = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    function: addElementAndValue,
                    args: [data.items[i], i]
                })
                i = resultInput[0].result.index;
                checkInput = resultInput[0].result.flag;
            }
        }
    }, 0)

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
    return data.filter((lucidId) => !lucidIds.includes(lucidId.lucuid_id))
}

function lastElementInputScript(data) {
    const body = document.querySelector('.treez-barcode-container');
    let lastElementInput = body.childNodes[body.childNodes.length - 2].childNodes[1];
    if (lastElementInput.tagName === 'INPUT') {
        return true
    } else {
        return false
    }
}

async function addElementAndValue(lucidId, i) {
    const body = document.querySelector('.treez-barcode-container');
    let app_lastChild = body.lastChild;

    async function click(element) {
        return new Promise((resolve, reject) => {
            resolve(element.click())
        })
    }
    await click(app_lastChild)
    const event = new Event('change', {bubbles: true});
    const input = body.children[body.childNodes.length - 2].getElementsByTagName('input')[0]
    const button = body.children[body.childNodes.length - 2].childNodes[3].childNodes[0]
    input.setAttribute("value", lucidId.lucid_id);
    input.dispatchEvent(event);
    button.click();
    i++;
    return {index: i, flag: true};
}

function script(data) {
    const body = document.querySelector('.treez-barcode-container');
    let app_lastChild = body.lastChild;
    let length = body.childNodes.length - 1;
    // get all lucid ids in the body
    let lucidIds = [];

    async function click(element) {
        return new Promise((resolve, reject) => {
            resolve(element.click())
        })
    }

    body.childNodes.forEach((child) => {
        if (child.classList.contains('treez-barcode-grid-item')) {
            if (child.querySelector('input')) {
                lucidIds.push(child.querySelector('input').value)
            } else {
                lucidIds.push(child.querySelector('.selectable').innerText)
            }
        }
    })
    const value = `; ${document.cookie}`;
    const parts = value.split(`; access_token=`);

    // group lucid ids with data.items lucid ids
    length = body.childNodes.length - 1
    data.items.forEach(async (lucidId, index) => {
        if (!lucidIds.includes(lucidId.lucid_id)) {
            click(app_lastChild).then(() => {
                const event = new Event('change', {bubbles: true});
                const input = body.children[index + length].getElementsByTagName('input')[0]
                input.setAttribute("value", lucidId.lucid_id);
                input.dispatchEvent(event);
            })
        }

    });
    return 'done'

}

function showAPIKeyInput() {
    showEditInput = true;
    credentialsSection.style.display = "block";
    editAPIKeyButton.innerHTML = "Save"
}

function hideAPIKeyInput() {
    showEditInput = false;
    credentialsSection.style.display = "none";
    editAPIKeyButton.innerHTML = "API KEY"
}

function focusInput(input) {
    input.focus();
}

function showHideSpinner(action) {
    if (action === 'hide') {
        caseIdButton.style.display = "block";
        spinner.style.display = "none";
    } else {
        caseIdButton.style.display = "none";
        spinner.style.display = "block";
    }
}

function checkPage() {
    const body = document.querySelector('.treez-barcode-container');
    if (!body || window.location.pathname.indexOf('/Invoice/edit/') === -1) {
        return false
    }
    return true;
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

// gather data to delete their unsaved inputs
// body.childNodes.forEach((child)=>{
//     if (child.classList.contains('treez-barcode-grid-item')) {
//         if (child.querySelector('input')) {
//             lucidIds.push(child.querySelector('input').value)
//         } else {
//             lucidIdsFixed.push(child.querySelector('.selectable').innerText)
//         }
//     }
// })


// delete unsaved inputs ( mock removing items from the end to the top )
// for(let i = body.childNodes.length- 1 ; i>=2;i--){
//     let child = body.childNodes[i]
//     if (child.classList.contains('treez-barcode-grid-item')) {
//         if (child.querySelector('input')) {
//             click(child.lastChild.childNodes[0])
//         }
//     }
// }