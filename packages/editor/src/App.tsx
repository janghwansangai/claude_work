import { useEffect } from 'react';
import type { Step } from '@walksim/shared';
import { parseCapturePayload } from './project';
import { useProject, type SaveStatus } from './storage/useProject';

const SAVE_STATUS_LABEL: Record<SaveStatus, { text: string; className: string }> = {
  loading: { text: '불러오는 중…', className: 'text-gray-400' },
  idle: { text: '이 브라우저에만 저장됩니다', className: 'text-gray-400' },
  saving: { text: '저장 중…', className: 'text-gray-500' },
  saved: { text: '✓ 이 브라우저에 저장됨', className: 'text-green-600' },
  error: { text: '⚠ 저장 실패 (브라우저 저장소 확인 필요)', className: 'text-red-600' },
};

function App() {
  const {
    manifest,
    selectedStepId,
    imageUrls,
    hydrated,
    saveStatus,
    setSelectedStepId,
    updateManifest,
    addCapture,
    resetProject,
  } = useProject();

  // 저장된 프로젝트 복원이 끝난 뒤에만 캡처를 받아, 복원 데이터가 새 캡처를 덮어쓰지 않도록 한다.
  useEffect(() => {
    if (!hydrated) return;
    const handleMessage = (event: MessageEvent) => {
      // editor-bridge 콘텐츠 스크립트는 같은 창에서 postMessage 한다. 다른 창/iframe에서 온 메시지는 무시.
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.type !== "WALKSIM_NEW_CAPTURE") return;
      const capture = parseCapturePayload(event.data.payload);
      if (!capture) {
        console.warn("잘못된 캡처 메시지를 무시했습니다.");
        return;
      }
      void addCapture(capture);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [hydrated, addCapture]);

  const selectedStep = manifest.steps.find(s => s.id === selectedStepId);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    updateManifest(prev => ({ ...prev, title }));
  };

  const handleInstructionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!selectedStep) return;
    const stepId = selectedStep.id;
    const instruction = e.target.value;
    updateManifest(prev => ({
      ...prev,
      steps: prev.steps.map((s): Step => (s.id === stepId ? { ...s, instruction } : s)),
    }));
  };

  const handleReset = () => {
    const ok = window.confirm("현재 프로젝트와 캡처 이미지를 이 브라우저에서 모두 삭제하고 새로 시작합니다. 계속할까요?");
    if (ok) void resetProject();
  };

  const status = SAVE_STATUS_LABEL[saveStatus];

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-blue-600">WalkSim Editor</h1>
          <input 
            type="text" 
            value={manifest.title} 
            onChange={handleTitleChange}
            disabled={!hydrated}
            className="border-gray-300 border rounded px-3 py-1 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <span className={`text-xs ${status.className}`} role="status">{status.text}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            disabled={!hydrated}
            className="bg-white border border-gray-300 text-gray-600 px-4 py-1.5 rounded-md font-medium hover:bg-gray-100 transition text-sm disabled:opacity-50"
          >
            새 프로젝트
          </button>
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
                  {selectedStep.assetId && imageUrls[selectedStep.assetId] ? (
                    <img src={imageUrls[selectedStep.assetId]} alt="캡처 화면" className="w-full h-full object-contain pointer-events-none" />
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
