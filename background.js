chrome.runtime.onMessage.addListener(
     function ({url, caseId}, sender, onSuccess) {
         let clientId=''
         let clientSecret=''
         chrome.storage.sync.get(['credentials'], function (items) {
             if (!chrome.runtime.error) {
                 if (items['credentials']) {
                     clientId = items['credentials'].clientId
                     clientSecret = items['credentials'].clientSecret
                     fetch(url, {
                         method: 'POST',
                         body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
                         headers: {
                             'Content-Type': 'application/x-www-form-urlencoded',
                         },
                     }) .then(response => response.text())
                         .then(async (responseText) => {
                             responseText = JSON.parse(responseText)
                             console.log(responseText)
                             const header = {
                                 'Authorization': `  ${responseText.token_type} ${responseText.access_token}`,
                             }
                             const response = await fetch(`https://source-dev.lucidgreen.io/api/v1.2/collections/case/${caseId}/`, {
                                 headers:header
                             });
                             const json = await response.json();
                             onSuccess(json)
                         })
                 }
             }
         });

        return true;  // Will respond asynchronously.
    }
);

// chrome.runtime.onMessage.addListener(
//     async function ({url, caseId}, sender, onSuccess) {
//         let auth = await fetch(url, {
//             method: 'POST',
//             body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
//             headers: {
//                 'Content-Type': 'application/x-www-form-urlencoded',
//             },
//         });
//         let authJson = await auth.json();
//         const header = {
//             'Authorization': `  ${authJson.token_type} ${authJson.access_token}`,
//         }
//         let caseItems = await fetch(`http://127.0.0.1:8000/api/v1.2/collections/case/${caseId}/`, {
//             headers: header
//         });
//         let caseItemsJson = await caseItems.json();
//         console.log(caseItemsJson)
//         onSuccess(caseItemsJson)
//         return true;  // Will respond asynchronously.
//     }
// );