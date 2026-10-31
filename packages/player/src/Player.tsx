import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { displayKeyCombo, nextStepIds, stepAnchor, type Manifest, type Step } from '@walksim/shared';
import { MODES, type PlayMode } from './modes';
import { Stage } from './Stage';
import { Callout, CenterCard, KeyCaps } from './ui';
import { isMac } from './layout';
import { ClickTarget, DragInteraction, InputInteraction, ScrollArea } from './interactions';
import { useKeyStep } from './useKeyStep';
import { AnnotationLayer } from './AnnotationLayer';
import { RealSitePane } from './RealSitePane';

// 학생의 모든 조작·판정·기록은 이 컴포넌트의 메모리 상태에서만 처리된다. 서버 요청·저장 없음(PRD §5 Player).

interface Props {
  manifest: Manifest;
  resolveAsset: (path: string | undefined) => string;
  mode: PlayMode;
  onExit: () => void;
  host?: 'desktop';        // 데스크톱 앱 '따라 하기' 창의 왼쪽: 링크는 앱이 오른쪽에 연다
  initialSplit?: boolean;
  banner?: ReactNode; // 미리보기 표시 등
}

const SPLIT_MIN_WIDTH = 900;

interface Feedback { text: string; key: number }

const REVEAL_AFTER_MISSES = 3; // 연습 모드: 3번 틀리면 위치 공개
const HINT_AFTER_MISSES = 2;   // 연습 모드: 2번 틀리면 힌트 공개

const WRONG_SPOT: Partial<Record<Step['type'], string>> = {
  click: '그곳이 아니에요. 다시 찾아보세요.',
  drag: '끌어서 옮길 것을 먼저 잡아 보세요.',
  key: '이번에는 키보드로 해 보세요.',
  scroll: '표시된 곳에서 스크롤해 보세요.',
};

export function Player({ manifest, resolveAsset, mode, onExit, host, initialSplit, banner }: Props) {
  const byId = useMemo(() => new Map(manifest.steps.map(s => [s.id, s])), [manifest]);
  const [history, setHistory] = useState<string[]>([manifest.startStepId]);
  const [misses, setMisses] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ misses: 0, hints: 0 });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [seq, setSeq] = useState(0); // 여러 버튼 화면: 지금까지 순서대로 누른 버튼 수
  const [emphasis, setEmphasis] = useState(!!manifest.emphasis);
  const hasLinks = useMemo(() => manifest.steps.some(s => s.url), [manifest]);
  const [split, setSplit] = useState<string | null | false>(false); // false: 닫힘, null: 열림(주소 없음), string: 연 주소
  const wide = useWide();

  const step = byId.get(history[history.length - 1])!;
  const isEnd = nextStepIds(step).length === 0;
  const assetUrl = (s: Step | undefined) => resolveAsset(s && manifest.assets[s.assetId]);

  useEffect(() => {
    if (initialSplit && host !== 'desktop') setSplit(manifest.steps.find(s => s.url)?.url ?? null);
  }, [initialSplit, host, manifest]);

  // 링크 열기: 데스크톱 앱은 오른쪽 브라우저에, 넓은 화면은 나란히 보기에, 좁은 화면은 새 탭에 연다.
  const openLink = (url: string) => {
    if (host === 'desktop') { window.open(url, 'walksim-real'); return; }
    if (split !== false || wide) { setSplit(url); return; }
    window.open(url, '_blank', 'noopener');
  };

  const resetStepState = () => { setMisses(0); setRevealed(false); setFeedback(null); setSeq(0); };

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
  const many = step.type === 'click' && step.hotspots.length > 1;
  const currentAnchor = step.type === 'click' && many ? step.hotspots[Math.min(seq, step.hotspots.length - 1)].rect : stepAnchor(step);
  const calloutAnchor = showBeacon && step.type !== 'input' ? currentAnchor : step.type === 'input' ? step.rect : undefined;
  const hasCallout = !isEnd && step.type !== 'choice' && !(step.type === 'input' && !step.rect);
  const showMarks = mode !== 'assessment'; // 평가 모드에서는 교사의 강조 표시를 숨긴다(정답 위치가 드러나지 않게)
  const link = step.url ? (
    <button onClick={() => openLink(step.url!)} className="mt-2 inline-flex items-center gap-1 text-sm text-blue-700 underline">
      🔗 실제 사이트에서 열기
    </button>
  ) : null;

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <header className="bg-gray-950 px-2 sm:px-4 py-2 flex items-center gap-1 sm:gap-3 text-xs sm:text-sm z-30">
        <span className="font-semibold truncate min-w-0">{manifest.title}</span>
        <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 shrink-0">{MODES[mode].label}</span>
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden min-w-12" role="progressbar" aria-label="진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full bg-blue-500 motion-safe:transition-all duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
        {hasLinks && host !== 'desktop' && (
          <button
            onClick={() => setSplit(split === false ? (step.url ?? manifest.steps.find(s => s.url)?.url ?? null) : false)}
            aria-pressed={split !== false}
            className={`hidden md:inline px-2 py-1 rounded whitespace-nowrap shrink-0 ${split !== false ? 'bg-blue-600' : 'hover:bg-gray-800'}`}
            title="왼쪽에 안내, 오른쪽에 실제 사이트를 나란히 놓고 따라 합니다"
          >
            ↔ 실제 사이트와 나란히
          </button>
        )}
        <button
          onClick={() => setEmphasis(e => !e)}
          aria-pressed={emphasis}
          title="누를 곳(마우스 표시)과 입력칸을 더 크게 강조합니다"
          className={`px-2 py-1 rounded whitespace-nowrap shrink-0 ${emphasis ? 'bg-yellow-400 text-yellow-950' : 'hover:bg-gray-800'}`}
        >
          🔍 크게
        </button>
        <button onClick={back} disabled={history.length <= 1} className="px-2 py-1 rounded hover:bg-gray-800 disabled:opacity-30 whitespace-nowrap shrink-0">← 뒤로</button>
        <button onClick={restart} className="px-2 py-1 rounded hover:bg-gray-800 whitespace-nowrap shrink-0">처음부터</button>
        <button onClick={onExit} className="px-2 py-1 rounded hover:bg-gray-800 whitespace-nowrap shrink-0" aria-label="실습 방법 다시 고르기">나가기</button>
      </header>
      <p className="bg-yellow-400 text-yellow-950 text-xs sm:text-sm text-center py-1 px-2 font-medium">⚠️ {manifest.notice}</p>
      {banner}

      <div className="flex flex-1 min-h-0">
      <div className={`flex flex-col min-h-0 ${split !== false ? 'w-[44%] min-w-[340px]' : 'flex-1'}`}>
      <Stage src={assetUrl(step)} fallback={manifest.viewport} zoom={step.zoom}>
        {(box, visible) => (
          <>
            {wrongSpot && <div className="absolute inset-0" onClick={() => miss(wrongSpot)} />}
            {showMarks && <AnnotationLayer annotations={step.annotations} box={box} />}

            {step.type === 'click' && step.hotspots.map((h, i) => {
              const state = !many ? 'current' : i < seq ? 'done' : i === seq ? 'current' : 'later';
              return (
                <ClickTarget
                  key={h.id}
                  rect={h.rect}
                  action={h.action ?? 'click'}
                  label={step.instruction || '다음으로'}
                  showBeacon={showBeacon && (state === 'current' || mode === 'guide')}
                  emphasis={emphasis}
                  order={many ? i + 1 : undefined}
                  state={state}
                  onSuccess={() => {
                    if (state === 'later') { miss(`순서대로 눌러 보세요. 먼저 ${seq + 1}번을 누르세요.`); return; }
                    if (i === step.hotspots.length - 1) go(h.nextStepId);
                    else { setSeq(i + 1); setMisses(0); }
                  }}
                  onMiss={miss}
                />
              );
            })}
            {step.type === 'drag' && (
              <DragInteraction step={step} box={box} showBeacon={showBeacon} emphasis={emphasis} onSuccess={() => go(step.nextStepId)} onMiss={miss} />
            )}
            {step.type === 'scroll' && <ScrollArea step={step} showBeacon={showBeacon} emphasis={emphasis} onSuccess={() => go(step.nextStepId)} />}
            {step.type === 'input' && (
              <InputInteraction step={step} box={box} showHint={showHint} emphasis={emphasis} onSuccess={() => go(step.nextStepId)} onMiss={miss} />
            )}

            {hasCallout && (
              <Callout box={box} visible={visible} anchor={calloutAnchor} above={step.type === 'input'} big={emphasis}>
                {many && <p className="text-xs font-semibold text-blue-700 mb-0.5">버튼 {Math.min(seq + 1, step.type === 'click' ? step.hotspots.length : 1)} / {step.type === 'click' ? step.hotspots.length : 1} — 순서대로 누르세요</p>}
                <p className="font-medium">{step.instruction}</p>
                {step.type === 'key' && (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    {step.keys.map((k, i) => <KeyCaps key={i} combo={displayKeyCombo(k, isMac)} />)}
                    <span className="text-gray-500">키를 누르세요</span>
                  </p>
                )}
                {showHint && step.hint && <p className="text-sm text-gray-600 mt-1">💡 {step.hint}</p>}
                <HelpButtons step={step} mode={mode} revealed={revealed} misses={misses} onReveal={countHelp} onAlternative={() => { countHelp(); go(single); }} />
                {link}
              </Callout>
            )}

            {step.type === 'choice' && (
              <CenterCard>
                <p className="font-medium mb-3">{step.instruction}</p>
                {showHint && step.hint && <p className="text-sm text-gray-600 mb-3">💡 {step.hint}</p>}
                {link && <div className="-mt-2 mb-3">{link}</div>}
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
                {link}
              </CenterCard>
            )}
          </>
        )}
      </Stage>
      </div>
      {split !== false && <RealSitePane url={split} onNavigate={setSplit} onClose={() => setSplit(false)} />}
      </div>

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

function useWide() {
  const query = `(min-width: ${SPLIT_MIN_WIDTH}px)`;
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return wide;
}
