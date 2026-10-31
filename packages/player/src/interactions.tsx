import { useEffect, useRef, useState } from 'react';
import type { ClickAction, Rect, Step } from '@walksim/shared';
import { Beacon } from './ui';
import { rectStyle, type Box } from './layout';

/** 강조하기: 누를 곳을 조금 넓혀 누르기 쉽게 한다. */
export function grow([x, y, w, h]: Rect, dx: number, dy = dx): Rect {
  return [x - dx, y - dy, w + dx * 2, h + dy * 2];
}

type Miss = (text: string) => void;

const DOUBLE_CLICK_MS = 450;
const LONG_PRESS_MS = 550;

const ACTION_LABEL: Record<ClickAction, string> = { click: '클릭', double: '더블클릭', right: '오른쪽 클릭' };

// 클릭·더블클릭·오른쪽 클릭 영역. 실제 <button>이므로 키보드(Enter)로도 누를 수 있다(접근성 대체 조작).
// 터치 기기: 더블클릭 = 빠르게 두 번 탭, 오른쪽 클릭 = 길게 누르기.
// order: 한 화면에 버튼이 여러 개일 때 순서 번호. state: done(이미 누름) / current(지금 차례) / later(아직 차례 아님)
export function ClickTarget({ rect, action, label, showBeacon, emphasis, order, state = 'current', onSuccess, onMiss }: {
  rect: Rect; action: ClickAction; label: string; showBeacon: boolean; emphasis?: boolean;
  order?: number; state?: 'done' | 'current' | 'later'; onSuccess: () => void; onMiss: Miss;
}) {
  const lastClick = useRef(0);
  const singleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { clearTimeout(singleTimer.current); clearTimeout(pressTimer.current); }, []);

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === 'done') return;
    const keyboard = e.detail === 0;
    if (action === 'click' || keyboard) return onSuccess();
    if (action === 'right') return onMiss('마우스 오른쪽 버튼으로 눌러 보세요. (터치: 길게 누르기)');
    // double
    const now = performance.now();
    if (e.detail >= 2 || now - lastClick.current < DOUBLE_CLICK_MS) {
      clearTimeout(singleTimer.current);
      return onSuccess();
    }
    lastClick.current = now;
    singleTimer.current = setTimeout(() => onMiss('두 번 빠르게 눌러 보세요(더블클릭).'), DOUBLE_CLICK_MS);
  };

  return (
    <button
      onClick={onClick}
      onContextMenu={e => {
        e.preventDefault();
        e.stopPropagation();
        if (action === 'right') onSuccess();
        else onMiss(action === 'double' ? '왼쪽 버튼으로 두 번 빠르게 눌러 보세요.' : '왼쪽 버튼으로 눌러 보세요.');
      }}
      onPointerDown={e => {
        if (action !== 'right' || e.pointerType !== 'touch') return;
        pressTimer.current = setTimeout(onSuccess, LONG_PRESS_MS);
      }}
      onPointerUp={() => clearTimeout(pressTimer.current)}
      onPointerLeave={() => clearTimeout(pressTimer.current)}
      aria-label={`${order ? `${order}번 ` : ''}${label} (${ACTION_LABEL[action]})${state === 'done' ? ' — 완료' : ''}`}
      aria-disabled={state === 'done' || undefined}
      data-state={state}
      className={`absolute z-10 rounded-md outline-none focus-visible:ring-4 focus-visible:ring-yellow-300 ${
        !showBeacon ? 'bg-transparent'
          : state === 'later' ? 'ring-2 ring-blue-300/60 bg-blue-300/10'
          : state === 'done' ? 'ring-2 ring-green-400/70 bg-green-400/10'
          : emphasis ? 'ring-4 ring-yellow-300 bg-yellow-200/25 shadow-[0_0_0_6px_rgba(250,204,21,0.35)]' : 'ring-2 ring-blue-400 bg-blue-400/15'
      }`}
      style={{ ...rectStyle(emphasis && showBeacon ? grow(rect, 0.006) : rect), touchAction: action === 'right' ? 'none' : undefined }}
    >
      {(showBeacon || state === 'done') && (
        <Beacon
          label={action === 'click' || state !== 'current' ? undefined : ACTION_LABEL[action]}
          order={order}
          big={emphasis && state === 'current'}
          dim={state === 'later'}
          done={state === 'done'}
        />
      )}
    </button>
  );
}

const inside = ([x, y, w, h]: Rect, px: number, py: number, pad = 0.02) =>
  px >= x - pad && px <= x + w + pad && py >= y - pad && py <= y + h + pad;

// 끌어서 놓기. 마우스/터치로 끌거나, 키보드로 "잡기(Enter) → 놓을 곳(Enter)" 순서로도 할 수 있다(PRD §6.1).
export function DragInteraction({ step, box, showBeacon, emphasis, onSuccess, onMiss }: {
  step: Extract<Step, { type: 'drag' }>; box: Box; showBeacon: boolean; emphasis?: boolean; onSuccess: () => void; onMiss: Miss;
}) {
  const [drag, setDrag] = useState<{ x: number; y: number; dx: number; dy: number; moved: boolean } | null>(null);
  const [picked, setPicked] = useState(false);
  const [fx, fy, fw, fh] = step.from;
  const [tx, ty, tw, th] = step.to;

  const toNorm = (e: React.PointerEvent) => {
    const parent = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    return { x: (e.clientX - parent.left) / parent.width, y: (e.clientY - parent.top) / parent.height };
  };

  return (
    <>
      {(showBeacon || picked) && (
        <div
          className={`absolute rounded-md border-2 border-dashed ${picked ? 'border-green-400 bg-green-400/20' : 'border-green-400/80'} pointer-events-none`}
          style={rectStyle(step.to)}
          aria-hidden
        />
      )}
      {showBeacon && !drag && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" aria-hidden>
          <defs>
            <marker id="walksim-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#60a5fa" />
            </marker>
          </defs>
          <line
            x1={(fx + fw / 2) * box.width} y1={(fy + fh / 2) * box.height}
            x2={(tx + tw / 2) * box.width} y2={(ty + th / 2) * box.height}
            stroke="#60a5fa" strokeWidth="3" strokeDasharray="8 6" markerEnd="url(#walksim-arrow)"
            className="motion-safe:animate-dash"
          />
        </svg>
      )}
      <button
        aria-label={picked ? '잡은 항목 — 놓을 곳을 고르세요' : `${step.instruction} (끌어서 놓기: 잡기)`}
        aria-pressed={picked}
        className={`absolute z-10 rounded-md outline-none touch-none cursor-grab active:cursor-grabbing focus-visible:ring-4 focus-visible:ring-yellow-300 ${showBeacon || picked ? (emphasis ? 'ring-4 ring-yellow-300 bg-yellow-200/25' : 'ring-2 ring-blue-400 bg-blue-400/15') : 'bg-transparent'}`}
        style={rectStyle(step.from)}
        onClick={e => { e.stopPropagation(); if (e.detail === 0) setPicked(p => !p); }}
        onPointerDown={e => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = toNorm(e);
          setDrag({ x: p.x, y: p.y, dx: p.x - fx, dy: p.y - fy, moved: false });
        }}
        onPointerMove={e => {
          if (!drag) return;
          const p = toNorm(e);
          setDrag({ ...drag, x: p.x, y: p.y, moved: drag.moved || Math.hypot(p.x - drag.x, p.y - drag.y) > 0.01 });
        }}
        onPointerUp={e => {
          if (!drag) return;
          const p = toNorm(e);
          const moved = drag.moved;
          setDrag(null);
          if (!moved) { setPicked(true); return; } // 끌지 않고 누르기만 하면 "잡기" 상태
          if (inside(step.to, p.x, p.y)) onSuccess();
          else onMiss('놓을 곳이 아니에요. 다시 끌어 보세요.');
        }}
        onPointerCancel={() => setDrag(null)}
      >
        {showBeacon && !drag && <Beacon label="끌기" big={emphasis} />}
      </button>
      {picked && (
        <button
          autoFocus
          className="absolute z-10 rounded-md outline-none focus-visible:ring-4 focus-visible:ring-yellow-300 bg-transparent"
          style={rectStyle(step.to)}
          aria-label="여기에 놓기"
          onClick={e => { e.stopPropagation(); onSuccess(); }}
        />
      )}
      {drag?.moved && (
        <div
          className="absolute z-20 rounded-md border-2 border-blue-400 bg-blue-400/30 shadow-xl pointer-events-none"
          style={{ ...rectStyle([drag.x - drag.dx, drag.y - drag.dy, fw, fh]) }}
          aria-hidden
        />
      )}
    </>
  );
}

// 스크롤: 영역 위에서 휠을 굴리거나 손가락으로 밀면 다음 화면으로 넘어간다.
export function ScrollArea({ step, showBeacon, emphasis, onSuccess }: {
  step: Extract<Step, { type: 'scroll' }>; showBeacon: boolean; emphasis?: boolean; onSuccess: () => void;
}) {
  const acc = useRef(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const done = useRef(false);
  const vertical = step.direction === 'up' || step.direction === 'down';
  const sign = step.direction === 'down' || step.direction === 'right' ? 1 : -1;
  const push = (delta: number) => {
    acc.current = Math.max(0, acc.current + delta * sign);
    if (acc.current > 80 && !done.current) { done.current = true; onSuccess(); }
  };
  return (
    <div
      className={`absolute z-10 rounded-md ${showBeacon ? (emphasis ? 'ring-4 ring-yellow-300 bg-yellow-200/20' : 'ring-2 ring-blue-400 bg-blue-400/10') : ''}`}
      style={{ ...rectStyle(step.rect), touchAction: 'none' }}
      onWheel={e => push(vertical ? e.deltaY : e.deltaX || e.deltaY)}
      onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchMove={e => {
        if (!touch.current) return;
        const t = e.touches[0];
        push(vertical ? touch.current.y - t.clientY : touch.current.x - t.clientX);
        touch.current = { x: t.clientX, y: t.clientY };
      }}
      onClick={e => e.stopPropagation()}
    >
      {showBeacon && <Beacon big={emphasis} label={{ down: '▼ 스크롤', up: '▲ 스크롤', left: '◀ 스크롤', right: '▶ 스크롤' }[step.direction]} />}
    </div>
  );
}

const SAMPLE_PASSWORD = 'Walk!Sim2026';

function accepts(step: Extract<Step, { type: 'input' }>, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (step.input.mode === 'password-sample') return v === SAMPLE_PASSWORD;
  return step.input.acceptedValues.length === 0 || step.input.acceptedValues.some(a => a.trim() === v);
}

// 가짜 입력칸. rect가 있으면 캡처 화면 속 입력칸 위치에 겹쳐서, 없으면 가운데 카드로 보여 준다.
// 비밀번호 연습은 실제 비밀번호를 치지 않도록 "연습용 비밀번호 채우기" 버튼만 제공한다(PRD §6.1).
export function InputInteraction({ step, box, showHint, emphasis, onSuccess, onMiss }: {
  step: Extract<Step, { type: 'input' }>; box: Box; showHint: boolean; emphasis?: boolean; onSuccess: () => void; onMiss: Miss;
}) {
  const [value, setValue] = useState('');
  const password = step.input.mode === 'password-sample';
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (accepts(step, value)) onSuccess();
    else onMiss(password ? '‘연습용 비밀번호 채우기’ 버튼을 눌러 보세요.' : '입력한 내용이 맞지 않아요. 다시 확인해 보세요.');
  };
  const field = (className: string, style?: React.CSSProperties) => (
    <input
      id="sim-input"
      type={password ? 'password' : 'text'}
      autoFocus
      readOnly={password}
      autoComplete="off"
      spellCheck={false}
      value={value}
      onChange={e => setValue(e.target.value)}
      placeholder={password ? '연습용 비밀번호' : step.input.placeholder}
      aria-label={step.instruction}
      className={className}
      style={style}
    />
  );
  const fill = password && (
    <button type="button" onClick={() => setValue(SAMPLE_PASSWORD)} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
      🔑 연습용 비밀번호 채우기
    </button>
  );

  if (step.rect) {
    // 강조하기: 입력칸을 위아래·옆으로 키우고(최소 44px) 노란 테두리로 눈에 띄게
    const minH = 44 / box.height;
    const rect = emphasis
      ? grow(step.rect, 0.01, Math.max(0.008, (minH - step.rect[3]) / 2))
      : step.rect;
    const fontSize = Math.max(emphasis ? 16 : 11, Math.min(emphasis ? 34 : 28, rect[3] * box.height * 0.45));
    return (
      <form onSubmit={submit} onClick={e => e.stopPropagation()}>
        <div className="absolute z-10" style={rectStyle(rect)} data-emphasis={emphasis || undefined}>
          {field(
            emphasis
              ? 'w-full h-full px-3 rounded-lg border-4 border-yellow-400 bg-white text-gray-900 font-semibold outline-none shadow-[0_0_0_6px_rgba(250,204,21,0.35)] focus:ring-4 focus:ring-yellow-300'
              : 'w-full h-full px-2 rounded border-2 border-blue-500 bg-white text-gray-900 outline-none focus:ring-4 focus:ring-blue-300',
            { fontSize },
          )}
        </div>
        <div className="absolute z-10 flex gap-1" style={{ left: `${rect[0] * 100}%`, top: `calc(${(rect[1] + rect[3]) * 100}% + 4px)` }}>
          {fill}
          <button type="submit" className={`${emphasis ? 'text-sm px-3 py-1.5' : 'text-xs px-2 py-1'} rounded bg-blue-600 text-white whitespace-nowrap`}>확인 ↵</button>
        </div>
      </form>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-4 z-20" onClick={e => e.stopPropagation()}>
      <form onSubmit={submit} className="bg-white text-gray-900 rounded-xl shadow-2xl p-5 w-full max-w-sm text-left motion-safe:animate-fadein">
        <label htmlFor="sim-input" className="block font-medium mb-2">{step.instruction}</label>
        {field('border border-gray-300 p-2 rounded-lg w-full outline-none focus:ring-2 focus:ring-blue-500')}
        {fill && <div className="mt-2">{fill}</div>}
        {showHint && step.hint && <p className="text-sm text-gray-600 mt-2">💡 {step.hint}</p>}
        <p className="text-xs text-gray-400 mt-2">연습용 가상 입력입니다. 실제 이름·비밀번호를 넣지 마세요.</p>
        <button type="submit" className="mt-3 w-full py-2 rounded-lg bg-blue-600 text-white font-semibold">확인</button>
      </form>
    </div>
  );
}
