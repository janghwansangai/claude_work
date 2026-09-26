import { useEffect, useMemo, useState } from 'react';
import { displayKeyCombo, nextStepIds, stepAnchor, type Manifest, type Step } from '@walksim/shared';
import { resolveAssetUrl } from './manifestUrl';
import { MODES, type PlayMode } from './modes';
import { Stage } from './Stage';
import { Callout, CenterCard, KeyCaps } from './ui';
import { isMac } from './layout';
import { ClickTarget, DragInteraction, InputInteraction, ScrollArea } from './interactions';
import { useKeyStep } from './useKeyStep';

// 학생의 모든 조작·판정·기록은 이 컴포넌트의 메모리 상태에서만 처리된다. 서버 요청·저장 없음(PRD §5 Player).

interface Props {
  manifest: Manifest;
  manifestUrl: URL;
  mode: PlayMode;
  onExit: () => void;
}

interface Feedback { text: string; key: number }

const REVEAL_AFTER_MISSES = 3; // 연습 모드: 3번 틀리면 위치 공개
const HINT_AFTER_MISSES = 2;   // 연습 모드: 2번 틀리면 힌트 공개

const WRONG_SPOT: Partial<Record<Step['type'], string>> = {
  click: '그곳이 아니에요. 다시 찾아보세요.',
  drag: '끌어서 옮길 것을 먼저 잡아 보세요.',
  key: '이번에는 키보드로 해 보세요.',
  scroll: '표시된 곳에서 스크롤해 보세요.',
};

export function Player({ manifest, manifestUrl, mode, onExit }: Props) {
  const byId = useMemo(() => new Map(manifest.steps.map(s => [s.id, s])), [manifest]);
  const [history, setHistory] = useState<string[]>([manifest.startStepId]);
  const [misses, setMisses] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ misses: 0, hints: 0 });
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const step = byId.get(history[history.length - 1])!;
  const isEnd = nextStepIds(step).length === 0;
  const assetUrl = (s: Step | undefined) => resolveAssetUrl(s && manifest.assets[s.assetId], manifestUrl);

  const resetStepState = () => { setMisses(0); setRevealed(false); setFeedback(null); };

  const go = (nextId: string) => {
    if (!byId.has(nextId)) {
      setFeedback({ text: '다음 단계를 찾을 수 없습니다. 선생님께 알려 주세요.', key: Date.now() });
      return;
    }
    setHistory(h => [...h, nextId]);
    resetStepState();
  };
  const back = () => { if (history.length > 1) { setHistory(h => h.slice(0, -1)); resetStepState(); } };
  const restart = () => { setHistory([manifest.startStepId]); setStats({ misses: 0, hints: 0 }); resetStepState(); };

  const miss = (text: string) => {
    const n = misses + 1;
    setMisses(n);
    setStats(s => ({ ...s, misses: s.misses + 1 }));
    setFeedback({ text: mode === 'assessment' ? '다시 시도해 보세요.' : text, key: Date.now() });
    if (mode === 'practice' && n >= REVEAL_AFTER_MISSES) setRevealed(true);
  };
  const countHelp = () => { setRevealed(true); setStats(s => ({ ...s, hints: s.hints + 1 })); };

  const showBeacon = mode === 'guide' || revealed;
  const showHint = mode === 'guide' || (mode === 'practice' && (misses >= HINT_AFTER_MISSES || revealed));

  const single = 'nextStepId' in step ? step.nextStepId : '';
  useKeyStep(step, () => go(single), miss);

  // 다음 1~2개 장면만 미리 받아 둔다(PRD §10.1-6). 수업 전체 이미지를 한 번에 받지 않는다.
  useEffect(() => {
    for (const id of nextStepIds(step).slice(0, 2)) {
      const url = assetUrl(byId.get(id));
      if (url) new Image().src = url;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const index = manifest.steps.findIndex(s => s.id === step.id);
  const progress = isEnd ? 1 : Math.min(1, (index + 1) / manifest.steps.length);
  const wrongSpot = !isEnd ? WRONG_SPOT[step.type] : undefined;
  const calloutAnchor = showBeacon && step.type !== 'input' ? stepAnchor(step) : step.type === 'input' ? step.rect : undefined;
  const hasCallout = !isEnd && step.type !== 'choice' && !(step.type === 'input' && !step.rect);

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <header className="bg-gray-950 px-2 sm:px-4 py-2 flex items-center gap-1 sm:gap-3 text-xs sm:text-sm z-30">
        <span className="font-semibold truncate min-w-0">{manifest.title}</span>
        <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 shrink-0">{MODES[mode].label}</span>
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden min-w-12" role="progressbar" aria-label="진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full bg-blue-500 motion-safe:transition-all duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
        <button onClick={back} disabled={history.length <= 1} className="px-2 py-1 rounded hover:bg-gray-800 disabled:opacity-30 whitespace-nowrap shrink-0">← 뒤로</button>
        <button onClick={restart} className="px-2 py-1 rounded hover:bg-gray-800 whitespace-nowrap shrink-0">처음부터</button>
        <button onClick={onExit} className="px-2 py-1 rounded hover:bg-gray-800 whitespace-nowrap shrink-0" aria-label="실습 방법 다시 고르기">나가기</button>
      </header>
      <p className="bg-yellow-400 text-yellow-950 text-xs sm:text-sm text-center py-1 px-2 font-medium">⚠️ {manifest.notice}</p>

      <Stage src={assetUrl(step)} fallback={manifest.viewport} zoom={step.zoom}>
        {(box, visible) => (
          <>
            {wrongSpot && <div className="absolute inset-0" onClick={() => miss(wrongSpot)} />}

            {step.type === 'click' && step.hotspots.map(h => (
              <ClickTarget
                key={h.id}
                rect={h.rect}
                action={h.action ?? 'click'}
                label={step.instruction || '다음으로'}
                showBeacon={showBeacon}
                onSuccess={() => go(h.nextStepId)}
                onMiss={miss}
              />
            ))}
            {step.type === 'drag' && (
              <DragInteraction step={step} box={box} showBeacon={showBeacon} onSuccess={() => go(step.nextStepId)} onMiss={miss} />
            )}
            {step.type === 'scroll' && <ScrollArea step={step} showBeacon={showBeacon} onSuccess={() => go(step.nextStepId)} />}
            {step.type === 'input' && (
              <InputInteraction step={step} box={box} showHint={showHint} onSuccess={() => go(step.nextStepId)} onMiss={miss} />
            )}

            {hasCallout && (
              <Callout box={box} visible={visible} anchor={calloutAnchor} above={step.type === 'input'}>
                <p className="font-medium">{step.instruction}</p>
                {step.type === 'key' && (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    {step.keys.map((k, i) => <KeyCaps key={i} combo={displayKeyCombo(k, isMac)} />)}
                    <span className="text-gray-500">키를 누르세요</span>
                  </p>
                )}
                {showHint && step.hint && <p className="text-sm text-gray-600 mt-1">💡 {step.hint}</p>}
                <HelpButtons step={step} mode={mode} revealed={revealed} misses={misses} onReveal={countHelp} onAlternative={() => { countHelp(); go(single); }} />
              </Callout>
            )}

            {step.type === 'choice' && (
              <CenterCard>
                <p className="font-medium mb-3">{step.instruction}</p>
                {showHint && step.hint && <p className="text-sm text-gray-600 mb-3">💡 {step.hint}</p>}
                <div className="flex flex-col gap-2">
                  {step.choices.map((c, i) => (
                    <button key={i} onClick={() => go(c.nextStepId)} className="w-full px-4 py-3 bg-gray-100 hover:bg-blue-50 border border-gray-200 hover:border-blue-400 rounded-lg font-semibold text-left">
                      {c.label}
                    </button>
                  ))}
                </div>
              </CenterCard>
            )}

            {isEnd && step.type === 'click' && (
              <CenterCard>
                <p className="text-3xl mb-2" aria-hidden>🎉</p>
                <p className="font-bold text-lg mb-1">{step.instruction || '실습 완료!'}</p>
                <p className="text-sm text-gray-600 mb-4">
                  {MODES[mode].label} · 오답 {stats.misses}회{mode !== 'assessment' ? ` · 도움 사용 ${stats.hints}회` : ''}
                  <span className="block text-xs text-gray-400 mt-1">이 결과는 이 기기 화면에만 표시되고 어디에도 저장·전송되지 않습니다.</span>
                </p>
                <div className="flex gap-2 justify-center">
                  <button onClick={restart} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold">다시 하기</button>
                  <button onClick={onExit} className="px-4 py-2 rounded-lg border border-gray-300 font-semibold">다른 모드로</button>
                </div>
              </CenterCard>
            )}
          </>
        )}
      </Stage>

      {feedback && (
        <div key={feedback.key} role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="bg-red-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium motion-safe:animate-shake">{feedback.text}</div>
        </div>
      )}
    </div>
  );
}

// 연습 모드의 "위치 보기", 그리고 키보드·휠이 없는 기기(태블릿 등)를 위한 대체 조작 버튼.
function HelpButtons({ step, mode, revealed, misses, onReveal, onAlternative }: {
  step: Step; mode: PlayMode; revealed: boolean; misses: number; onReveal: () => void; onAlternative: () => void;
}) {
  const alternative = step.type === 'key'
    ? '⌨️ 화면에서 누르기'
    : step.type === 'scroll'
      ? { down: '▼ 아래로 스크롤', up: '▲ 위로 스크롤', left: '◀ 왼쪽으로', right: '▶ 오른쪽으로' }[step.direction]
      : null;
  const canReveal = mode === 'practice' && !revealed && misses > 0 && step.type !== 'key';
  if (!alternative && !canReveal) return null;
  return (
    <div className="mt-2 flex gap-3 text-sm">
      {canReveal && <button onClick={onReveal} className="text-blue-700 underline">위치 보기</button>}
      {alternative && (mode !== 'assessment' || step.type === 'scroll') && (
        <button onClick={onAlternative} className="text-blue-700 underline">{alternative}</button>
      )}
    </div>
  );
}
