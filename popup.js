const caseIdButton = document.getElementById('case-id-button');
const inputClientId = document.getElementById('input-client-id');
const inputClientSecret = document.getElementById('input-client-secret');
const inputCaseId = document.getElementById('input-case-id');
const editAPIKeyButton = document.getElementById('api-key-show-edit');
const APIKeyAlert = document.getElementById('api-key-alert');
const credentialsSection = document.querySelector('#credentials');
const spinner = document.querySelector('#spinner');
let showEditInput = false;
window.onload = async function () {
    try {
        const {clientId, clientSecret} = await getCredentials('credentials');
        if (!clientId || !clientSecret) {
            APIKeyAlert.style.display = "block";
        }
        inputClientId.value = clientId;
        inputClientSecret.value = clientSecret;
    } catch (e) {
        showAPIKeyInput();
        showAlert()
    }
}
editAPIKeyButton.addEventListener('click', async function () {
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
            hideAlert()
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
        getItemsEvent(data[0].result)
    });

});
function getItemsEvent(result){
    if (!result) {
        return
    }
    const caseId = inputCaseId.value;
    if (!caseId) {
        focusInput(inputCaseId)
        return
    }
    caseIdButton.style.display = "none";
    spinner.style.display = "block";
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
    let [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    caseIdButton.style.display = "block";
    spinner.style.display = "none";
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: script,
        args: [data]
    });
}

function script(data) {
    const body = document.querySelector('.treez-barcode-container');
    let app_lastChild = body.lastChild;
    const length = body.children.length - 1;
    // get all lucid ids in the body
    let lucidIds = [];
    body.childNodes.forEach(function (child) {
        if (child.classList.contains('treez-barcode-grid-item')) {
            if (child.querySelector('input')) {
                lucidIds.push(child.querySelector('input').value)
            } else {
                lucidIds.push(child.querySelector('.selectable').innerText)
            }
        }
    });
    console.log(lucidIds);
    data.items.forEach((lucidId) => {
        if (!lucidIds.includes(lucidId.lucid_id)) {
            app_lastChild.click();
        }
    });
    data.items.forEach((lucidId, index) => {
        if (!lucidIds.includes(lucidId.lucid_id)) {
            body.children[index + length].getElementsByTagName('input')[0].setAttribute("value", lucidId.lucid_id);
            body.children[index + length].childNodes[body.children[+length].childNodes.length - 2].childNodes[0].classList.remove('disabled');
        }
    });
    // const new_row = body.childNodes[body.childNodes.length - 2]
    // new_row.childNodes[1].getElementsByTagName('input')[0].setAttribute("value",lucidId.lucid_id);
    // new_row.childNodes[new_row.childNodes.length - 2].childNodes[0].classList.remove('disabled');
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

function showAlert() {
    APIKeyAlert.style.display = 'block';
}

function hideAlert() {
    APIKeyAlert.style.display = 'block';
}

function focusInput(input) {
    input.focus();
}
function checkPage(){
    const body = document.querySelector('.treez-barcode-container');
    if (!body || window.location.pathname.indexOf('/Invoice/edit/') === -1) {
        alert('Please Make sure you are on the right page')
        return false
    }
    return true;
}
