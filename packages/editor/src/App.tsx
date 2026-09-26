import { useState, useEffect } from 'react';
import type { Manifest, Step } from '@walksim/shared';

const initialManifest: Manifest = {
  schemaVersion: 2,
  id: "draft-project-1",
  version: "1.0.0",
  title: "제목 없는 실습 프로젝트",
  notice: "모의 실습입니다. 실제 계정과 실제 비밀번호를 입력하지 마세요.",
  mode: "practice",
  viewport: { width: 1280, height: 720, dpr: 1 },
  startStepId: "step-1",
  assets: {},
  steps: [
    {
      id: "step-1",
      type: "click",
      assetId: "",
      instruction: "첫 번째 단계 설명을 입력하세요.",
      hotspots: []
    }
  ]
};

function App() {
  const [manifest, setManifest] = useState<Manifest>(initialManifest);
  const [selectedStepId, setSelectedStepId] = useState<string>(initialManifest.startStepId);
  const [capturedImages, setCapturedImages] = useState<Record<string, string>>({}); // assetId -> dataUrl

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "WALKSIM_NEW_CAPTURE") {
        const { image, rect, tagName, timestamp } = event.data.payload;
        
        const newAssetId = `asset-${timestamp}`;
        setCapturedImages(prev => ({ ...prev, [newAssetId]: image }));

        const newStep: Step = {
          id: `step-${timestamp}`,
          type: "click",
          assetId: newAssetId,
          instruction: `${tagName} 요소를 클릭했습니다. 지시사항을 입력하세요.`,
          hotspots: [
            {
              id: "hotspot-1",
              rect: rect,
              nextStepId: ""
            }
          ]
        };

        setManifest(prev => {
          const updatedSteps = [...prev.steps, newStep];
          // Connect previous step to this new one if it's a click step without a nextStepId
          const previousStepIndex = updatedSteps.length - 2;
          if (previousStepIndex >= 0) {
            const prevStep = updatedSteps[previousStepIndex];
            if (prevStep.type === 'click' && prevStep.hotspots.length > 0 && !prevStep.hotspots[0].nextStepId) {
              prevStep.hotspots[0].nextStepId = newStep.id;
            }
          }
          return { ...prev, steps: updatedSteps };
        });
        
        setSelectedStepId(newStep.id);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const selectedStep = manifest.steps.find(s => s.id === selectedStepId);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManifest({ ...manifest, title: e.target.value });
  };

  const handleInstructionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!selectedStep) return;
    const newSteps = manifest.steps.map(s => 
      s.id === selectedStep.id ? { ...s, instruction: e.target.value } : s
    );
    setManifest({ ...manifest, steps: newSteps as Step[] });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-blue-600">WalkSim Editor</h1>
          <input 
            type="text" 
            value={manifest.title} 
            onChange={handleTitleChange}
            className="border-gray-300 border rounded px-3 py-1 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div className="flex gap-2">
          <button className="bg-green-100 text-green-700 px-4 py-1.5 rounded-md font-medium hover:bg-green-200 transition text-sm">
            ✓ 안전 확인
          </button>
          <button className="bg-blue-600 text-white px-4 py-1.5 rounded-md font-medium hover:bg-blue-700 transition text-sm">
            ZIP 내보내기
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-white border-r flex flex-col">
          <div className="p-4 border-b flex justify-between items-center">
            <h2 className="font-semibold text-gray-700">단계 목록</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {manifest.steps.map(step => (
              <div 
                key={step.id} 
                onClick={() => setSelectedStepId(step.id)}
                className={`p-3 mb-2 rounded cursor-pointer border transition ${
                  selectedStepId === step.id ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-transparent hover:bg-gray-100'
                }`}
              >
                <div className="text-xs font-mono text-gray-500">{step.id}</div>
                <div className="text-sm truncate">{step.instruction || '(설명 없음)'}</div>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex-1 flex flex-col bg-gray-100 p-6 overflow-y-auto">
          {selectedStep ? (
            <div className="max-w-4xl w-full mx-auto bg-white rounded-lg shadow-sm border p-6 flex flex-col gap-6">
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">지시사항 (Instruction)</h3>
                <textarea 
                  value={selectedStep.instruction}
                  onChange={handleInstructionChange}
                  className="w-full border rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 h-24"
                  placeholder="학생에게 보여줄 지시사항을 입력하세요..."
                />
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-2">화면 미리보기 (마스킹/핫스팟 편집)</h3>
                <div className="aspect-video bg-gray-200 rounded flex items-center justify-center border-2 border-dashed border-gray-300 relative overflow-hidden">
                  {selectedStep.assetId && capturedImages[selectedStep.assetId] ? (
                    <img src={capturedImages[selectedStep.assetId]} alt="캡처 화면" className="w-full h-full object-contain pointer-events-none" />
                  ) : (
                    <span className="text-gray-500 text-sm">확장 프로그램에서 캡처한 이미지가 여기에 표시됩니다.</span>
                  )}
                  
                  {selectedStep.type === 'click' && selectedStep.hotspots.map((h, i) => (
                    <div key={i} className="absolute border-2 border-blue-500 bg-blue-500/20" 
                      style={{
                        left: `${h.rect[0]*100}%`, top: `${h.rect[1]*100}%`,
                        width: `${h.rect[2]*100}%`, height: `${h.rect[3]*100}%`
                      }}>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              단계를 선택하세요.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
