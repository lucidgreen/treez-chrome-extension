const baseURL = 'https://retail-dev.lucidgreen.io';
chrome.runtime.onMessage.addListener(
    function ({caseId}, sender, onSuccess) {
        (async function action() {
         try{
             // get credentials from sync storage
             let {clientId, clientSecret} = await getItemFromStorage('credentials')
             // send oauth request to get access token
             const response = await fetch(`${baseURL}/o/token/`, {
                 method: "POST",
                 body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
                 headers: {
                     'Content-Type': 'application/x-www-form-urlencoded',
                 },
             });
             if(response.status !== 200){
                 onSuccess({
                     code:response.status,
                     message:response.statusText
                 })
                 return true;
             }
             const {token_type, access_token} = await response.json();
             // set-up headers for fetching case data
             const header = {
                 'Authorization': `${token_type} ${access_token}`,
             }
             let caseItems = await fetch(`${baseURL}/api/v1/collections/case/${caseId}/`, {
                 headers: header
             });
             if(caseItems.status !== 200){
                 onSuccess({
                     code:caseItems.status,
                     message:caseItems.statusText
                 })
                 return true;
             }
             const caseItemsJSON = await caseItems.json();
             onSuccess(caseItemsJSON)
         }catch (e){
             console.log(e)
             onSuccess(e)
         }
        })()
        return true;
    }
);

/*
* get items from sync storage
* @param {string} key
* @returns {Promise<{clientId: string, clientSecret: string}>}
 */
function getItemFromStorage(key) {
    return new Promise(function (resolve, reject) {
        chrome.storage.sync.get([`${key}`], function (items) {
            console.log(items[`${key}`])
            if (!chrome.runtime.error) {
                if (items[`${key}`]) {
                    resolve(items[`${key}`])
                } else {
                    reject('No Key')
                }
            } else {
                reject('Error')
            }
        });
    });
}
