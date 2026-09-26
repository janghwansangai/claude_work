// Inject this into the editor tab
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "NEW_CAPTURE") {
    // Forward to the React app
    window.postMessage({
      type: "WALKSIM_NEW_CAPTURE",
      payload: request.payload
    }, "*");
    sendResponse({ received: true });
  }
});
