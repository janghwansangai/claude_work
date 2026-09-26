import { useEffect, useState } from 'react';
import type { DesktopBridge } from '../captureSource';

interface RecState { recording: boolean; paused: boolean; count: number }

// 데스크톱 앱에서만 보이는 녹화 버튼. 영역 선택 → 녹화 → 도구 막대/단축키로 중지.
export function DesktopRecord({ bridge }: { bridge: DesktopBridge }) {
  const [state, setState] = useState<RecState>({ recording: false, paused: false, count: 0 });
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => bridge.onState(s => setState(s as RecState)), [bridge]);
  const mod = bridge.platform === 'darwin' ? '⌘' : 'Ctrl';

  if (state.recording) {
    return (
      <div className="flex flex-col gap-1">
        <button onClick={() => void bridge.stopRecording()} className="w-full rounded-md bg-red-600 text-white text-sm font-semibold py-2">
          ■ 녹화 중지 ({state.count}개)
        </button>
        <p className="text-[11px] text-gray-400">{mod}+Shift+F8 일시정지 · {mod}+Shift+F9 중지</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 mb-2">
      <button
        onClick={async () => {
          setMessage(null);
          const res = await bridge.startRecording();
          if (!res.ok && res.error) setMessage(res.error);
        }}
        className="w-full rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2"
      >
        ● 화면 녹화 시작
      </button>
      <p className="text-[11px] text-gray-400 leading-relaxed">윈도우·맥의 모든 프로그램을 녹화합니다. 녹화할 영역을 고른 뒤 평소처럼 조작하세요.</p>
      {message && <p className="text-xs text-red-600">{message}</p>}
    </div>
  );
}
