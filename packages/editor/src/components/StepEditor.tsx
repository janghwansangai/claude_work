import { useState } from 'react';
import type { Manifest, Rect, Step } from '@walksim/shared';
import type { StoredImage } from '../storage/useProject';
import { RectCanvas, type DrawTool } from './RectCanvas';
import { ToolToggle } from './ToolToggle';

interface Props {
  manifest: Manifest;
  step: Step;
  index: number;
  image: StoredImage | undefined;
  onUpdate: (updater: (step: Step) => Step) => void;
  onSetHotspot: (rect: Rect) => void;
  onApplyMasks: (masks: Rect[]) => Promise<void>;
  onDelete: () => void;
}

export function StepEditor({ manifest, step, index, image, onUpdate, onSetHotspot, onApplyMasks, onDelete }: Props) {
  const [tool, setTool] = useState<DrawTool>('hotspot');
  const [pendingMasks, setPendingMasks] = useState<Rect[]>([]);
  const [applying, setApplying] = useState(false);

  const hotspot = step.type === 'click' ? step.hotspots[0] ?? null : null;

  const applyMasks = async () => {
    setApplying(true);
    try {
      await onApplyMasks(pendingMasks);
      setPendingMasks([]);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="max-w-5xl w-full mx-auto bg-white rounded-lg shadow-sm border p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-500">
            단계 {index + 1} / {manifest.steps.length}{manifest.startStepId === step.id ? ' · 시작 단계' : ''}
          </p>
          <h2 className="text-lg font-bold text-gray-800">단계 편집</h2>
        </div>
        <div className="flex gap-2 items-center">
          <ToolToggle tool={tool} onChange={setTool} maskLabel="추가로 가리기" />
          <button
            type="button"
            onClick={onDelete}
            className="px-3 py-1.5 rounded-md text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50"
          >
            단계 삭제
          </button>
        </div>
      </div>

      <label className="block">
        <span className="font-semibold text-gray-800 text-sm">지시사항 (학생에게 보이는 말풍선)</span>
        <textarea
          value={step.instruction}
          onChange={e => { const instruction = e.target.value; onUpdate(s => ({ ...s, instruction })); }}
          className="mt-1 w-full border rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 h-20"
          placeholder="학생에게 보여줄 지시사항을 입력하세요..."
        />
      </label>

      <label className="block">
        <span className="font-semibold text-gray-800 text-sm">힌트 (오답 2회 후 공개)</span>
        <input
          type="text"
          value={step.hint ?? ''}
          onChange={e => { const hint = e.target.value; onUpdate(s => ({ ...s, hint: hint || undefined })); }}
          className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="예: 왼쪽 위의 파란 버튼을 찾아보세요."
        />
      </label>

      <RectCanvas
        src={image?.url ?? null}
        masks={pendingMasks}
        hotspot={hotspot?.rect ?? null}
        tool={tool}
        onDraw={rect => (tool === 'mask' ? setPendingMasks([...pendingMasks, rect]) : onSetHotspot(rect))}
        onRemoveMask={i => setPendingMasks(pendingMasks.filter((_, j) => j !== i))}
        emptyText={step.assetId
          ? '이미지가 없습니다. 이전 버전에서 저장된 마스킹 전 원본은 보안 업데이트로 삭제되었습니다. 다시 녹화해 주세요.'
          : '배경 이미지가 없습니다.'}
      />

      {pendingMasks.length > 0 && (
        <div className="flex items-center justify-between bg-gray-50 border rounded px-3 py-2 text-sm">
          <span>새 가림 상자 {pendingMasks.length}개 — 적용하면 이미지에 영구히 구워집니다(되돌릴 수 없음).</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPendingMasks([])} className="px-3 py-1 rounded border text-gray-600">취소</button>
            <button type="button" onClick={applyMasks} disabled={applying} className="px-3 py-1 rounded bg-gray-900 text-white disabled:opacity-50">
              {applying ? '적용 중…' : '가림 적용'}
            </button>
          </div>
        </div>
      )}

      {step.type === 'click' && (
        <div className="border-t pt-4 flex flex-wrap items-center gap-3 text-sm">
          {hotspot ? (
            <>
              <span className="font-semibold text-gray-800">클릭하면 이동할 단계</span>
              <select
                value={hotspot.nextStepId}
                onChange={e => {
                  const nextStepId = e.target.value;
                  onUpdate(s => (s.type === 'click'
                    ? { ...s, hotspots: s.hotspots.map((h, i) => (i === 0 ? { ...h, nextStepId } : h)) }
                    : s));
                }}
                className="border rounded px-2 py-1"
              >
                <option value="">(연결 안 됨)</option>
                {manifest.steps.map((s, i) => (
                  <option key={s.id} value={s.id} disabled={s.id === step.id}>
                    {i + 1}. {s.instruction.slice(0, 30) || s.id}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onUpdate(s => (s.type === 'click' ? { ...s, hotspots: [] } : s))}
                className="text-gray-500 underline"
              >
                클릭 영역 없애기(종료 단계로 만들기)
              </button>
            </>
          ) : (
            <span className="text-gray-500">종료 단계입니다. ‘클릭 영역 지정’ 도구로 영역을 그리면 다음 단계로 이어집니다.</span>
          )}
        </div>
      )}
    </div>
  );
}
