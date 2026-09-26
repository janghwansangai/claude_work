let recordingTabId: number | null = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_RECORDING") {
    recordingTabId = request.tabId;
    console.log("Recording started for tab:", recordingTabId);
    chrome.scripting.executeScript({
      target: { tabId: recordingTabId! },
      files: ["content.js"]
    }).then(() => console.log("Content script injected"))
      .catch(err => console.error("Injection failed:", err));
  } else if (request.action === "STOP_RECORDING") {
    console.log("Recording stopped");
    recordingTabId = null;
  } else if (request.action === "CAPTURE_SCREEN") {
    if (recordingTabId) {
      // Capture the window where the recording tab is active
      chrome.tabs.captureVisibleTab(sender.tab!.windowId, { format: "jpeg", quality: 80 }, async (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error("Capture failed:", chrome.runtime.lastError.message);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        console.log("Captured image length:", dataUrl?.length);
        
        // Match both localhost and 127.0.0.1 and various ports
        const tabs = await chrome.tabs.query({ url: ["http://localhost:*/*", "http://127.0.0.1:*/*"] });
        console.log("Found editor tabs:", tabs.length);
        
        if (tabs.length > 0) {
          const editorTab = tabs[0];
          chrome.tabs.sendMessage(editorTab.id!, {
            action: "NEW_CAPTURE",
            payload: {
              rect: request.rect,
              tagName: request.tagName,
              image: dataUrl,
              timestamp: Date.now()
            }
          }, (res) => {
            if (chrome.runtime.lastError) {
              console.error("Message to editor failed. Is editor-bridge injected? Refresh the editor tab! Error:", chrome.runtime.lastError.message);
            } else {
              console.log("Message delivered to editor:", res);
            }
          });
        } else {
          console.warn("Editor tab not found!");
        }
        sendResponse({ success: true, image: dataUrl });
      });
      return true; // async response
    }
  }
});
