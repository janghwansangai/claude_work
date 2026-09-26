import { useEffect, useState, useRef } from 'react';
import { validateManifest } from '@walksim/shared';
import type { Manifest, Step } from '@walksim/shared';

function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/play/sample-drive/manifest.json')
      .then(res => {
        if (!res.ok) throw new Error('매니페스트를 불러오지 못했습니다.');
        return res.json();
      })
      .then(data => {
        const validManifest = validateManifest(data);
        setManifest(validManifest);
        setCurrentStepId(validManifest.startStepId);
      })
      .catch(err => {
        setError(err.message || '알 수 없는 에러가 발생했습니다.');
        console.error(err);
      });
  }, []);

  if (error) return <div className="p-4 text-red-500 font-bold">에러: {error}</div>;
  if (!manifest || !currentStepId) return <div className="p-4 flex items-center justify-center h-screen bg-gray-900 text-white">로딩 중...</div>;

  const currentStep = manifest.steps.find(s => s.id === currentStepId);
  if (!currentStep) return <div className="p-4 text-red-500 font-bold">오류: 단계를 찾을 수 없습니다 ({currentStepId})</div>;

  const goToNextStep = (nextId: string) => setCurrentStepId(nextId);

  // 현재 에셋의 경로 계산 (가상 자산)
  // 실제 환경에서는 manifest.assets[currentStep.assetId] 를 사용하지만
  // 임시 더미 렌더링을 위해 회색 배경이나 더미 이미지를 표시합니다.
  const imageUrl = manifest.assets[currentStep.assetId] || '';

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <header className="bg-yellow-500 text-yellow-900 p-2 text-center text-sm font-semibold flex justify-between items-center z-10 shadow">
        <span>⚠️ {manifest.notice}</span>
        <button 
          onClick={() => setCurrentStepId(manifest.startStepId)}
          className="bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700 transition text-xs"
        >
          처음으로
        </button>
      </header>
      
      <main className="flex-1 relative flex flex-col">
        <div className="absolute top-4 left-4 z-20 bg-black bg-opacity-70 p-4 rounded shadow max-w-md pointer-events-none">
          <h2 className="text-lg font-bold text-blue-300 mb-1">{manifest.title}</h2>
          <p className="text-sm">👉 {currentStep.instruction}</p>
          {currentStep.hint && <p className="text-xs text-gray-400 mt-2">💡 {currentStep.hint}</p>}
        </div>

        <ViewportRenderer 
          imageUrl={imageUrl} 
          originalWidth={manifest.viewport.width} 
          originalHeight={manifest.viewport.height}
        >
          <StepOverlays step={currentStep} onNext={goToNextStep} />
        </ViewportRenderer>
      </main>
    </div>
  );
}

// 이미지 비율(object-fit: contain)을 직접 계산하여 오버레이 위치를 동기화하는 컴포넌트
function ViewportRenderer({ 
  imageUrl, originalWidth, originalHeight, children 
}: { 
  imageUrl: string, originalWidth: number, originalHeight: number, children: React.ReactNode 
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderRect, setRenderRect] = useState({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    const calculateRect = () => {
      if (!containerRef.current) return;
      const { width: containerW, height: containerH } = containerRef.current.getBoundingClientRect();
      const containerRatio = containerW / containerH;
      const imageRatio = originalWidth / originalHeight;

      let renderW, renderH;
      if (containerRatio > imageRatio) {
        // 컨테이너가 더 넓음 (좌우 여백)
        renderH = containerH;
        renderW = renderH * imageRatio;
      } else {
        // 컨테이너가 더 좁음 (상하 여백)
        renderW = containerW;
        renderH = renderW / imageRatio;
      }

      setRenderRect({
        left: (containerW - renderW) / 2,
        top: (containerH - renderH) / 2,
        width: renderW,
        height: renderH
      });
    };

    calculateRect();
    window.addEventListener('resize', calculateRect);
    return () => window.removeEventListener('resize', calculateRect);
  }, [originalWidth, originalHeight]);

  return (
    <div ref={containerRef} className="flex-1 w-full h-full relative bg-gray-800">
      {/* 백그라운드 이미지: src가 없을 경우 더미 플레이스홀더를 보여줌 */}
      {imageUrl ? (
        <img 
          src={imageUrl} 
          alt="배경" 
          className="w-full h-full object-contain pointer-events-none"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center pointer-events-none text-gray-500">
          이미지 없음 ({originalWidth}x{originalHeight})
        </div>
      )}

      {/* 스케일링된 오버레이 컨테이너 */}
      <div 
        className="absolute"
        style={{
          left: renderRect.left,
          top: renderRect.top,
          width: renderRect.width,
          height: renderRect.height,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// 현재 단계의 타입에 맞춰 핫스팟/입력창 등을 오버레이에 렌더링
function StepOverlays({ step, onNext }: { step: Step, onNext: (id: string) => void }) {
  if (step.type === 'click') {
    return (
      <>
        {step.hotspots.map(hotspot => {
          const [rx, ry, rw, rh] = hotspot.rect;
          return (
            <button
              key={hotspot.id}
              onClick={() => onNext(hotspot.nextStepId)}
              className="absolute bg-blue-500 bg-opacity-30 hover:bg-opacity-50 border-2 border-blue-400 border-dashed transition outline-none focus:ring-4 focus:ring-blue-500 cursor-pointer"
              style={{
                left: `${rx * 100}%`,
                top: `${ry * 100}%`,
                width: `${rw * 100}%`,
                height: `${rh * 100}%`,
              }}
              title={hotspot.id}
              aria-label={`${hotspot.id} 클릭 영역`}
            />
          );
        })}
      </>
    );
  }

  if (step.type === 'input') {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40">
        <div className="bg-white p-4 rounded shadow-lg text-black">
          <label className="block text-sm font-bold mb-2">가상 데이터 입력</label>
          <input 
            type="text" 
            placeholder={step.input.placeholder}
            className="border p-2 rounded w-64 outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = e.currentTarget.value;
                if (step.input.acceptedValues.includes(val)) {
                  onNext(step.nextStepId);
                } else {
                  alert('잘못된 입력입니다. 다시 시도해 주세요.');
                }
              }
            }}
          />
        </div>
      </div>
    );
  }

  if (step.type === 'choice') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-40 gap-3">
        {step.choices.map((choice, i) => (
          <button 
            key={i}
            onClick={() => onNext(choice.nextStepId)}
            className="w-64 px-4 py-3 bg-white text-gray-800 font-semibold rounded shadow hover:bg-gray-100 transition"
          >
            {choice.label}
          </button>
        ))}
      </div>
    );
  }

  return null;
}

export default App;
