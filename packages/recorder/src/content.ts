console.log("WalkSim Recorder Content Script Injected");

document.addEventListener("pointerdown", (e) => {
  const target = e.target as HTMLElement;
  const rect = target.getBoundingClientRect();
  
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const normalizedRect = [
    rect.left / viewportWidth,
    rect.top / viewportHeight,
    rect.width / viewportWidth,
    rect.height / viewportHeight
  ];

  chrome.runtime.sendMessage({ 
    action: "CAPTURE_SCREEN",
    rect: normalizedRect,
    tagName: target.tagName
  }, (response) => {
    if (response?.success) {
      console.log("Screen captured successfully");
    }
  });
}, { capture: true });
