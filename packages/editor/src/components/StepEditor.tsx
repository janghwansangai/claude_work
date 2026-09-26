import { useState } from 'react';
import { formatKeyCombo, normalizeKeyCombo, type Manifest, type Rect, type Step } from '@walksim/shared';
import type { StoredImage } from '../storage/useProject';
import { STEP_KIND_LABEL, convertStep, isReservedShortcut, stepKind, type RectRole, type StepKind } from '../project';
import { RectCanvas, type DrawTool } from './RectCanvas';
import { ToolToggle } from './ToolToggle';
import { stepShapes, stepTools } from './shapes';

interface Props {
  manifest: Manifest;
  step: Step;
  index: number;
  image: StoredImage | undefined;
  onUpdate: (updater: (step: Step) => Step) => void;
  onSetRect: (role: RectRole, rect: Rect | undefined) => void;
  onApplyMasks: (masks: Rect[]) => Promise<void>;
  onDelete: () => void;
}

const KIND_HELP: Record<StepKind, string> = {
  click: '학생이 파란 영역을 클릭하면 다음 단계로 갑니다.',
  double: '학생이 영역을 더블클릭해야 합니다. (터치: 두 번 빠르게 탭)',
  right: '학생이 영역을 마우스 오른쪽 버튼으로 클릭해야 합니다. (터치: 길게 누르기)',
  drag: '학생이 파란 영역을 잡아 초록 영역에 놓아야 합니다. 키보드로는 잡기 → 놓기 순서로 할 수 있습니다.',
  input: '학생이 입력칸에 글자를 입력합니다. 입력칸 위치를 지정하지 않으면 화면 가운데 카드로 보입니다.',
  key: '학생이 키보드 단축키를 눌러야 합니다. Ctrl과 맥의 ⌘(Cmd)는 같은 키로 인정됩니다.',
  scroll: '학생이 영역 위에서 마우스 휠을 굴리거나 손가락으로 밀면 다음 단계로 갑니다.',
  choice: '학생이 선택지 중 하나를 고르면 선택지마다 다른 단계로 갈 수 있습니다(분기).',
  end: '실습이 끝나는 화면입니다. 완료 메시지와 결과가 보입니다.',
};

export function StepEditor({ manifest, step, index, image, onUpdate, onSetRect, onApplyMasks, onDelete }: Props) {
  const [tool, setTool] = useState<DrawTool>('primary');
  const [pendingMasks, setPendingMasks] = useState<Rect[]>([]);
  const [applying, setApplying] = useState(false);
  const kind = stepKind(step);
  const fallbackNext = manifest.steps[index + 1]?.id ?? '';

  const applyMasks = async () => {
    setApplying(true);
    try {
      await onApplyMasks(pendingMasks);
      setPendingMasks([]);
    } finally {
      setApplying(false);
    }
  };

  const onDraw = (rect: Rect) => {
    if (tool === 'mask') setPendingMasks([...pendingMasks, rect]);
    else onSetRect(tool === 'target' ? 'target' : tool === 'zoom' ? 'zoom' : 'primary', rect);
  };

  return (
    <div className="max-w-5xl w-full mx-auto bg-white rounded-lg shadow-sm border p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-500">
            단계 {index + 1} / {manifest.steps.length}{manifest.startStepId === step.id ? ' · 시작 단계' : ''}
          </p>
          <h2 className="text-lg font-bold text-gray-800">단계 편집</h2>
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-sm flex items-center gap-2">
            <span className="font-semibold text-gray-700">동작 종류</span>
            <select
              value={kind}
              onChange={e => { const k = e.target.value as StepKind; onUpdate(s => convertStep(s, k, fallbackNext)); setTool('primary'); }}
              className="border rounded px-2 py-1.5"
            >
              {(Object.keys(STEP_KIND_LABEL) as StepKind[]).map(k => <option key={k} value={k}>{STEP_KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={onDelete}
            className="px-3 py-1.5 rounded-md text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50"
          >
            단계 삭제
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 -mt-3">{KIND_HELP[kind]}</p>

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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToolToggle tool={tool} onChange={setTool} options={stepTools(step, '추가로 가리기')} />
        {step.zoom && (
          <button type="button" onClick={() => onSetRect('zoom', undefined)} className="text-sm text-orange-600 underline">확대 해제</button>
        )}
      </div>

      <RectCanvas
        src={image?.url ?? null}
        masks={pendingMasks}
        shapes={stepShapes(step)}
        tool={tool}
        onDraw={onDraw}
        onRemoveMask={i => setPendingMasks(pendingMasks.filter((_, j) => j !== i))}
        emptyText={step.assetId
          ? '이미지가 없습니다. 이전 버전에서 저장된 마스킹 전 원본은 보안 업데이트로 삭제되었습니다. 다시 녹화해 주세요.'
          : '배경 이미지가 없습니다.'}
      />
      {tool === 'zoom' && <p className="text-xs text-gray-500 -mt-3">학생 화면에서 이 영역이 화면에 꽉 차게 확대됩니다. 작은 버튼이 많은 프로그램(유니티 등)에 쓰세요.</p>}

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

      <div className="border-t pt-4 flex flex-col gap-3 text-sm">
        <TypePanel manifest={manifest} step={step} onUpdate={onUpdate} onSetRect={onSetRect} />
        {step.type !== 'choice' && kind !== 'end' && (
          <NextSelect
            manifest={manifest}
            self={step.id}
            label="성공하면 이동할 단계"
            value={step.type === 'click' ? step.hotspots[0]?.nextStepId ?? '' : 'nextStepId' in step ? step.nextStepId : ''}
            onChange={nextStepId => onUpdate(s => {
              if (s.type === 'click') return { ...s, hotspots: s.hotspots.map((h, i) => (i === 0 ? { ...h, nextStepId } : h)) };
              if (s.type === 'choice') return s;
              return { ...s, nextStepId };
            })}
          />
        )}
      </div>
    </div>
  );
}

function NextSelect({ manifest, self, label, value, onChange }: {
  manifest: Manifest; self: string; label: string; value: string; onChange: (id: string) => void;
}) {
  return (
    <label className="flex flex-wrap items-center gap-2">
      <span className="font-semibold text-gray-800">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="border rounded px-2 py-1 max-w-xs">
        <option value="">(연결 안 됨)</option>
        {manifest.steps.map((s, i) => (
          <option key={s.id} value={s.id} disabled={s.id === self}>{i + 1}. {s.instruction.slice(0, 30) || s.id}</option>
        ))}
      </select>
    </label>
  );
}

function TypePanel({ manifest, step, onUpdate, onSetRect }: {
  manifest: Manifest; step: Step; onUpdate: (updater: (step: Step) => Step) => void; onSetRect: (role: RectRole, rect: Rect | undefined) => void;
}) {
  switch (step.type) {
    case 'input': {
      const password = step.input.mode === 'password-sample';
      return (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={password}
              onChange={e => { const pw = e.target.checked; onUpdate(s => (s.type === 'input' ? { ...s, input: { ...s.input, mode: pw ? 'password-sample' : 'text' } } : s)); }}
            />
            비밀번호 연습 칸 (학생은 직접 입력하지 않고 ‘연습용 비밀번호 채우기’ 버튼만 사용)
          </label>
          {!password && (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-gray-800">정답 값 (한 줄에 하나, 비우면 아무 값이나 통과)</span>
                <textarea
                  value={step.input.acceptedValues.join('\n')}
                  onChange={e => { const values = e.target.value.split('\n'); onUpdate(s => (s.type === 'input' ? { ...s, input: { ...s.input, acceptedValues: values } } : s)); }}
                  onBlur={() => onUpdate(s => (s.type === 'input' ? { ...s, input: { ...s.input, acceptedValues: s.input.acceptedValues.map(v => v.trim()).filter(Boolean) } } : s))}
                  className="border rounded p-2 h-16"
                  placeholder={'예: student01'}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-gray-800">입력칸 안내 문구(placeholder)</span>
                <input
                  type="text"
                  value={step.input.placeholder ?? ''}
                  onChange={e => { const placeholder = e.target.value; onUpdate(s => (s.type === 'input' ? { ...s, input: { ...s.input, placeholder: placeholder || undefined } } : s)); }}
                  className="border rounded px-2 py-1"
                />
              </label>
              <p className="text-xs text-amber-700">실제 이름·학번·이메일을 정답 값으로 쓰지 마세요. 내보내기 검사에서 차단됩니다.</p>
            </>
          )}
          {step.rect && (
            <button type="button" onClick={() => onSetRect('primary', undefined)} className="self-start text-gray-500 underline">
              입력칸 위치 지우기 (가운데 카드로 표시)
            </button>
          )}
        </div>
      );
    }
    case 'key':
      return <KeyPanel step={step} onUpdate={onUpdate} />;
    case 'scroll':
      return (
        <label className="flex items-center gap-2">
          <span className="font-semibold text-gray-800">스크롤 방향</span>
          <select
            value={step.direction}
            onChange={e => { const direction = e.target.value as typeof step.direction; onUpdate(s => (s.type === 'scroll' ? { ...s, direction } : s)); }}
            className="border rounded px-2 py-1"
          >
            <option value="down">아래로</option>
            <option value="up">위로</option>
            <option value="right">오른쪽으로</option>
            <option value="left">왼쪽으로</option>
          </select>
        </label>
      );
    case 'choice':
      return (
        <div className="flex flex-col gap-2">
          <span className="font-semibold text-gray-800">선택지</span>
          {step.choices.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={c.label}
                aria-label={`선택지 ${i + 1}`}
                onChange={e => { const label = e.target.value; onUpdate(s => (s.type === 'choice' ? { ...s, choices: s.choices.map((x, j) => (j === i ? { ...x, label } : x)) } : s)); }}
                className="border rounded px-2 py-1 flex-1 min-w-40"
              />
              <NextSelect
                manifest={manifest}
                self={step.id}
                label="→"
                value={c.nextStepId}
                onChange={nextStepId => onUpdate(s => (s.type === 'choice' ? { ...s, choices: s.choices.map((x, j) => (j === i ? { ...x, nextStepId } : x)) } : s))}
              />
              <button
                type="button"
                disabled={step.choices.length <= 1}
                onClick={() => onUpdate(s => (s.type === 'choice' ? { ...s, choices: s.choices.filter((_, j) => j !== i) } : s))}
                className="text-red-600 disabled:opacity-30"
                aria-label={`선택지 ${i + 1} 삭제`}
              >
                삭제
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onUpdate(s => (s.type === 'choice' ? { ...s, choices: [...s.choices, { label: `선택 ${s.choices.length + 1}`, nextStepId: '' }] } : s))}
            className="self-start text-blue-700 underline"
          >
            + 선택지 추가
          </button>
        </div>
      );
    default:
      return null;
  }
}

function KeyPanel({ step, onUpdate }: { step: Extract<Step, { type: 'key' }>; onUpdate: (updater: (step: Step) => Step) => void }) {
  const [listening, setListening] = useState(false);
  const combo = step.keys[0] ?? '';
  const setCombo = (value: string) => onUpdate(s => (s.type === 'key' ? { ...s, keys: [value] } : s));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-gray-800">단축키</span>
        <input
          type="text"
          value={combo}
          onChange={e => setCombo(e.target.value)}
          onBlur={() => combo && setCombo(normalizeKeyCombo(combo))}
          className="border rounded px-2 py-1 w-40 font-mono"
          aria-label="단축키"
        />
        <button
          type="button"
          onClick={() => setListening(true)}
          onKeyDown={e => {
            if (!listening) return;
            const pressed = formatKeyCombo(e);
            if (!pressed) return;
            e.preventDefault();
            setCombo(pressed);
            setListening(false);
          }}
          onBlur={() => setListening(false)}
          className={`px-3 py-1 rounded border ${listening ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-700'}`}
        >
          {listening ? '지금 키를 누르세요…' : '키 눌러서 입력'}
        </button>
      </div>
      {combo && isReservedShortcut(combo) && (
        <p className="text-xs text-red-600">
          {normalizeKeyCombo(combo)}은(는) 브라우저가 먼저 처리하는 키라서 학생 화면에서 연습할 수 없습니다(탭·창이 닫히거나 열림). 다른 단계 종류로 바꾸거나 설명으로 안내하세요.
        </p>
      )}
    </div>
  );
}
