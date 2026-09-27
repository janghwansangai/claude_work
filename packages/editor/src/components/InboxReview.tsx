import { useState } from 'react';
import type { InboxItem } from '../inbox/useInbox';
import { RectCanvas, type DrawTool } from './RectCanvas';
import { ToolToggle } from './ToolToggle';
import { captureShapes, captureTools } from './shapes';
import { STEP_KIND_LABEL } from '../project';

interface Props {
  item: InboxItem;
  position: number;
  total: number;
  busy: boolean;
  onChange: (patch: Partial<Pick<InboxItem, 'masks' | 'instruction' | 'rect' | 'action'>>) => void;
  onApprove: () => void;
  onDiscard: () => void;
}

function recordedLabel(item: InboxItem): string {
  const a = item.action;
  if (a?.kind === 'key') return `${STEP_KIND_LABEL.key} ${a.keys}`;
  if (!item.rect) return STEP_KIND_LABEL.end;
  if (a?.kind === 'type') return a.inputType === 'password' ? '비밀번호 입력(연습용 비밀번호로 대체)' : STEP_KIND_LABEL.input;
  if (a?.kind === 'scroll') return STEP_KIND_LABEL.scroll;
  return STEP_KIND_LABEL[a?.kind === 'double' || a?.kind === 'right' || a?.kind === 'drag' ? a.kind : 'click'];
}

// 원본 캡처를 교사가 검수·가림 처리하는 화면. 승인해야만 마스킹이 구워진 이미지가 저장된다.
export function InboxReview({ item, position, total, busy, onChange, onApprove, onDiscard }: Props) {
  const [tool, setTool] = useState<DrawTool>('mask');
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="max-w-5xl w-full mx-auto bg-white rounded-lg shadow-sm border p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-amber-600">검수함 {position} / {total} · 아직 프로젝트에 들어가지 않음</p>
          <h2 className="text-lg font-bold text-gray-800">개인정보를 가린 뒤 승인하세요</h2>
          <p className="text-sm text-gray-500 mt-1">
            이 원본은 이 컴퓨터에 암호화해 보관 중이며 학생용 ZIP에는 들어가지 않습니다. 승인하면 가림 상자가 픽셀에 구워진 이미지만 프로젝트에 저장되고 원본은 지워지며, 버리면 즉시 사라집니다.
          </p>
        </div>
        <ToolToggle tool={tool} onChange={setTool} options={captureTools(item.rect, item.action)} />
      </div>

      {item.source === 'desktop' && (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2">
          데스크톱 녹화는 화면 속 글자를 읽을 수 없어 이름·이메일·알림·파일명 같은 개인정보를 <b>자동으로 찾지 못합니다</b>
          {item.suggestedCount > 0 ? ' (비밀번호 칸만 미리 가렸습니다)' : ''}. 화면 전체를 직접 확인하고 가려 주세요.
        </div>
      )}
      {item.source !== 'desktop' && item.suggestedCount > 0 && (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2">
          레코더가 입력창·이메일·전화번호 등 <b>민감정보 후보 {item.suggestedCount}곳</b>을 찾아 미리 가렸습니다.
          자동 탐지는 보조 수단일 뿐이니 이름·사진·알림·주소창 등 나머지도 직접 확인하세요.
        </div>
      )}

      <RectCanvas
        src={item.url}
        masks={item.masks}
        shapes={captureShapes(item.rect, item.action)}
        tool={tool}
        onDraw={rect => {
          if (tool === 'mask') onChange({ masks: [...item.masks, rect] });
          else if (tool === 'target' && item.action) onChange({ action: { ...item.action, to: rect } });
          else onChange({ rect });
        }}
        onRemoveMask={i => onChange({ masks: item.masks.filter((_, j) => j !== i) })}
      />
      <p className="text-xs text-gray-500 -mt-3">
        가림 상자 {item.masks.length}개 · 가림 상자에 마우스를 올리면 × 버튼으로 해제할 수 있습니다.
        {' 기록된 동작: '}
        <b>{recordedLabel(item)}</b>
        {item.rect ? '' : item.action?.kind === 'key' ? '' : ' (녹화 마지막 화면 → 종료 단계)'}
        {' — 승인 후 단계 편집에서 동작 종류를 바꿀 수 있습니다.'}
      </p>

      <label className="block">
        <span className="font-semibold text-gray-800 text-sm">지시사항 초안</span>
        <textarea
          value={item.instruction}
          onChange={e => onChange({ instruction: e.target.value })}
          className="mt-1 w-full border rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 h-20"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="w-4 h-4" />
          이미지 전체를 확인했고, 가리지 않은 곳에 실제 개인정보가 없습니다.
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            className="px-4 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            버리기
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={!confirmed || busy}
            className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? '처리 중…' : '가림 적용 후 단계로 추가'}
          </button>
        </div>
      </div>
    </div>
  );
}
