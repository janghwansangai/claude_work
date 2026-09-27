import { useEffect, useState } from 'react';
import { validateManifest, validateManifestGraph, type Manifest } from '@walksim/shared';
import { resolveManifestUrl } from './manifestUrl';
import { MODES, parseMode, type PlayMode } from './modes';
import { Player } from './Player';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; manifest: Manifest; manifestUrl: URL };

function App() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [mode, setMode] = useState<PlayMode | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const manifestUrl = resolveManifestUrl();
    const controller = new AbortController();
    fetch(manifestUrl, { signal: controller.signal, credentials: 'omit' })
      .then(res => {
        if (!res.ok) throw new Error(`실습 파일을 불러오지 못했습니다. (HTTP ${res.status})`);
        return res.json();
      })
      .then(data => {
        const manifest = validateManifest(data);
        const { errors } = validateManifestGraph(manifest);
        if (errors.length > 0) throw new Error(`실습 구성에 문제가 있습니다: ${errors[0]}`);
        setState({ kind: 'ready', manifest, manifestUrl });
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        console.error(err);
        setState({ kind: 'error', message: err instanceof Error && !('issues' in err) ? err.message : '실습 파일 형식이 올바르지 않습니다.' });
      });
    return () => controller.abort();
  }, [attempt]);

  if (state.kind === 'loading') {
    return <div className="h-screen flex items-center justify-center bg-gray-900 text-gray-300">실습을 불러오는 중…</div>;
  }

  if (state.kind === 'error') {
    return (
      <div className="h-screen flex flex-col gap-4 items-center justify-center bg-gray-900 text-white p-6 text-center">
        <p className="text-red-300 font-semibold">{state.message}</p>
        <button
          onClick={() => { setState({ kind: 'loading' }); setAttempt(a => a + 1); }}
          className="px-4 py-2 rounded bg-white text-gray-900 font-semibold"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const { manifest, manifestUrl } = state;

  if (!mode) {
    const suggested = parseMode(new URLSearchParams(location.search).get('mode')) ?? parseMode(manifest.mode) ?? 'practice';
    return <StartScreen manifest={manifest} suggested={suggested} onStart={setMode} />;
  }

  return <Player manifest={manifest} manifestUrl={manifestUrl} mode={mode} onExit={() => setMode(null)} />;
}

// 실습 시작 화면: 모의 실습이라는 사실을 분명히 알리고 모드를 고른다(PRD §2 핵심 트레이드오프).
function StartScreen({ manifest, suggested, onStart }: { manifest: Manifest; suggested: PlayMode; onStart: (m: PlayMode) => void }) {
  const [selected, setSelected] = useState<PlayMode>(suggested);
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="bg-white text-gray-900 rounded-2xl shadow-xl max-w-lg w-full p-6 sm:p-8 flex flex-col gap-5">
        <div>
          <p className="text-xs font-semibold text-blue-600 mb-1">모의 실습</p>
          <h1 className="text-2xl font-bold">{manifest.title}</h1>
        </div>
        <p className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg px-4 py-3">
          ⚠️ {manifest.notice} 이 화면에서 누르거나 입력하는 것은 실제 서비스에 아무 영향을 주지 않습니다.
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold mb-2">실습 방법 선택</legend>
          {(Object.keys(MODES) as PlayMode[]).map(m => (
            <label
              key={m}
              className={`flex gap-3 items-start border rounded-lg p-3 cursor-pointer ${selected === m ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <input type="radio" name="mode" value={m} checked={selected === m} onChange={() => setSelected(m)} className="mt-1" />
              <span>
                <span className="font-semibold block">{MODES[m].label}</span>
                <span className="text-sm text-gray-600">{MODES[m].description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <button
          autoFocus
          onClick={() => onStart(selected)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-3"
        >
          시작하기 ({manifest.steps.length}단계)
        </button>
      </div>
    </div>
  );
}

export default App;
