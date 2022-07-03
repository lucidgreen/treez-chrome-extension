const nav = document.querySelector('nav ul')
nav.innerHTML += `
                <li><a href="#" id="run-test" style="display:none">Run Test</a></li>
                <li><a href="#" id="clean-up" style="display:none">clean up</a></li>
`
const test = document.querySelector('#run-test')
const cleanInvoice = document.querySelector('#clean-up')
test.style.display = 'block'
cleanInvoice.style.display = 'block'
test.addEventListener('click', runTest)
cleanInvoice.addEventListener('click', cleanUp)

const lucidIDs = [
    "m6MPsrvsE5RaDz5FRuQ9FJ",
    "EFWPvYSj8LQdyVgzW2qS3e",
    "5BU68GHYtNzDmRhRjt8eaj",
    "eT4D4GMVEeiybeGZkCg3Bi",
    "hvZes2iaaGAr67y7VtKk67",
    "YWMa5xXkhXZRtrPAmAkY4V",
    "XKb7x7TFdfdSxGiYrLwD46",
    "c3eCWrm2KUuRFQPFtanH3U",
    "4y7vCz4AauspvyqZjbZaY2",
    "c6zBC7xenhnuRXekH6roxc",
    "i9JURf5qSMiygbk8sLxPBL",
    "5nngJsciVqeDzru8ysZyfp",
    "maueafuqfzVi4LeVvuAUvT",
    "4tVSUdrWCRAhg5VmtnorFr",
    "R6dU8TqYRKc8t9KajgawMY",
]
chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
    tab = tabs[0]
    let interval = setInterval(() => {
        chrome.scripting.executeScript({
            target: {tabId: tab.id},
            function: getLucIDsCount,
        }, function ([{result}]) {
            if (result === 0) {
                clearInterval(interval)
            }
            cleanInvoice.innerText = `Clean Up - ${result} IDS`
        })
    }, 0)
})

function getLucIDsCount() {
    let count = 0
    const body = document.querySelector('.treez-barcode-container');
    const validRegex = Object.freeze({
        shortUUID: /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{22}$/,
    });
    if(!body){
        return 0
    }
    body.childNodes.forEach((child) => {
        if (child.classList.contains('treez-barcode-grid-item')) {
            if (child.querySelector('.selectable')) {
                let lucidID = child.querySelector('.selectable').innerText.split('/').at(-1)
                if (validRegex.shortUUID.test(lucidID)) {
                    count++;
                }
            }
        }
    })
    return count
}

function runTest() {
    Promise.all(
        lucidIDs.map(async (lucidID) => {
            await retrieveLucidIDs(lucidID)
        })
    )
    setInterval(() => {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            tab = tabs[0]
            chrome.scripting.executeScript({
                target: {tabId: tab.id},
                function: getLucIDsCount,
            }, function ([{result}]) {
                console.log(result)
                test.innerText = `Run Test - ${result} IDS`
            })
        })
    }, 0)
}

async function cleanUp() {
    let [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: cleanLucidIDs,
    })

    function cleanLucidIDs() {
        const validRegex = Object.freeze({
            shortUUID: /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{22}$/,
        });

        async function click(element) {
            return new Promise((resolve, reject) => {
                resolve(element.click())
            })
        }

        let list = []
        const body = document.querySelector('.treez-barcode-container');
        body.childNodes.forEach((child) => {
            if (child.classList.contains('treez-barcode-grid-item')) {
                let lucidID = child.querySelector('.selectable').innerText.split('/').at(-1)
                if (validRegex.shortUUID.test(lucidID)) {
                    list.push(child.childNodes[4].childNodes[0])
                }
            }
        })

        let interval = setInterval(() => {
            if (list.length === 0) {
                console.log(list)
                clearInterval(interval)
                return
            }
            click(list.pop())
        }, 0)

    }
}

