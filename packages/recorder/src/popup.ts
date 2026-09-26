document.getElementById('start-btn')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.id) {
    chrome.runtime.sendMessage({ action: "START_RECORDING", tabId: tab.id });
    document.getElementById('start-btn')!.style.display = 'none';
    document.getElementById('stop-btn')!.style.display = 'block';
  }
});

document.getElementById('stop-btn')?.addEventListener('click', async () => {
  chrome.runtime.sendMessage({ action: "STOP_RECORDING" });
  document.getElementById('start-btn')!.style.display = 'block';
  document.getElementById('stop-btn')!.style.display = 'none';
});
