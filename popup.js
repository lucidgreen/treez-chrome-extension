const apiSection = document.querySelector('.api-auth');
const caseIdButton = document.getElementById('case-id-button');
const inputClientId = document.getElementById('input-client-id');
const inputClientSecret = document.getElementById('input-client-secret');
const inputCaseId = document.getElementById('input-case-id');
const editAPIKeyButton = document.getElementById('api-key-show-edit');
const APIKeyAlert = document.getElementById('api-key-alert');
const credentialsSection = document.querySelector('#credentials');
let showEditInput = false;
window.onload = async function () {
    try {
        const {clientId = '', clientSecret = ''} = await getCredentials();
        if (!clientId || !clientSecret) {
            showAPIKeyInput();
        }
        inputClientId.value = clientId;
        inputClientSecret.value = clientSecret;
    } catch (e) {
        APIKeyAlert.style.display = "block";
        console.log(e)
    }
}
editAPIKeyButton.addEventListener('click', async function () {
    if (!showEditInput) {
        showAPIKeyInput()
    } else {
        let clientId = inputClientId.value;
        let clientSecret = inputClientSecret.value;
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
            APIKeyAlert.style.display = "none";
            hideAPIKeyInput()
            inputCaseId.focus()
        })
    }
});
caseIdButton.addEventListener('click', async function () {
    const caseId = inputCaseId.value;
    if (!caseId) {
        inputCaseId.focus()
        return
    }
    try {
        const lucidIds = await getLucidIdsInCase(caseId);
        // alert(lucidIds.map(lucidId => `${lucidId.id} - ${lucidId.name}`).join('\n'))
    } catch (e) {
        alert(e + '\n' + 'Please check your API Key and Case ID')
    }
});

function getCredentials() {
    return new Promise(function (resolve, reject) {
        chrome.storage.sync.get(['credentials'], function (items) {
            if (!chrome.runtime.error) {
                if (items['credentials']) {
                    resolve(items['credentials'])
                } else {
                    reject('No API Key')
                }
            } else {
                reject('Error')
            }
        });
    });
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

async function getLucidIdsInCase(caseId) {
    const {clientId, clientSecret} = await getCredentials();
    chrome.runtime.sendMessage( //goes to bg_page.js
        {url: 'https://source-dev.lucidgreen.io/o/token/', caseId: caseId},
        data => dataProcessFunction(data)
    );


}

async function dataProcessFunction(data) {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: script,
        args: [data]
    });
}

function script(data) {
    const body = document.querySelector('.treez-barcode-container');
    let app_lastChild = body.lastChild;
    body.removeChild(app_lastChild)
    data.items.forEach(lucidId => {
        console.log(lucidId)
        body.innerHTML += `
        <div class="treez-barcode-grid-item">
  <div class="flex-start-center" style="padding-left: 8px;">${new Date().toLocaleString()}</div>
  <div class="flex-start-center">
    <div class="treez-text-input">
      <div class="">
        <div></div>
        <div class="aligned">
          <div class="field barcode-input">
            <div class="ui input" style="height: 32px;"><input type="text" value="${lucidId.lucid_id}"></div>
          </div>
        </div>
        <div style="color: rgb(228, 66, 55);"></div>
      </div>
    </div>
  </div>
  <div class="flex-start-center">User Defined</div>
  <div class="flex-start-center">
    <div class="blue-button small-save-button">Save</div>
  </div>
  <div class="flex-start-center"><img src="/portalDispensary/v2/dist/266c56b1f69ebdbddb812ec720b2babd.svg" class="clickable"></div>
</div>
        `
    });
    body.appendChild(app_lastChild)

}