import { useEffect, useRef, useState } from 'react';
import { listProjects, type ProjectSummary } from '../storage/db';

interface Props {
  currentId: string;
  currentTitle: string;
  onClose: () => void;
  onNew: () => Promise<void>;
  onOpen: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSaveFile: () => Promise<void>;
  onOpenFile: (file: File) => Promise<void>;
}

const fmt = (t: number) => new Date(t).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

// 프로젝트 관리: 이 컴퓨터에 저장된 프로젝트 목록(열기·삭제), 새 프로젝트, 파일로 저장/열기(.walksim)
export function ProjectsDialog({ currentId, currentTitle, onClose, onNew, onOpen, onDelete, onSaveFile, onOpenFile }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => listProjects().then(setProjects).catch(() => setProjects([]));
  useEffect(() => { void refresh(); }, []);

  const run = async (fn: () => Promise<void>, okText?: string, close = false) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      if (okText) setMessage({ ok: true, text: okText });
      if (close) onClose();
      else await refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : '처리하지 못했습니다.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-gray-900/50 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-label="프로젝트" className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">프로젝트</h2>
          <button onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>

        <div className="px-6 py-4 flex flex-wrap gap-2 border-b bg-gray-50">
          <button disabled={busy} onClick={() => run(onNew, undefined, true)} className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium disabled:opacity-50">
            + 새 프로젝트
          </button>
          <button disabled={busy} onClick={() => run(onSaveFile, `‘${currentTitle}’을(를) 파일로 저장했습니다.`)} className="px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium disabled:opacity-50">
            💾 지금 프로젝트를 파일로 저장
          </button>
          <button disabled={busy} onClick={() => fileInput.current?.click()} className="px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium disabled:opacity-50">
            📂 파일 열기…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".walksim,application/zip"
            hidden
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void run(() => onOpenFile(file), undefined, true);
            }}
          />
          <p className="w-full text-xs text-gray-500 leading-relaxed">
            작업 내용은 이 컴퓨터에 자동 저장됩니다. <b>파일로 저장(.walksim)</b>하면 다른 컴퓨터에서 이어서 편집하거나 백업할 수 있습니다.
            이 파일에는 검수 전 원본 캡처도 들어 있으니 학생에게 나눠 주지 마세요(학생용은 ‘ZIP 내보내기’).
          </p>
        </div>

        {message && (
          <p role="status" className={`mx-6 mt-3 text-sm rounded px-3 py-2 border ${message.ok ? 'text-green-800 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>{message.text}</p>
        )}

        <div className="px-6 py-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">이 컴퓨터에 저장된 프로젝트</h3>
          {projects === null ? (
            <p className="text-sm text-gray-400">불러오는 중…</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-gray-400">저장된 프로젝트가 없습니다.</p>
          ) : (
            <ul className="divide-y border rounded-lg">
              {projects.map(p => {
                const current = p.id === currentId;
                return (
                  <li key={p.id} className={`flex items-center gap-3 px-3 py-2 ${current ? 'bg-blue-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.title || '(제목 없음)'} {current && <span className="text-xs text-blue-600">· 지금 편집 중</span>}</p>
                      <p className="text-xs text-gray-500">{p.steps}단계 · {fmt(p.updatedAt)}</p>
                    </div>
                    <button disabled={busy || current} onClick={() => run(() => onOpen(p.id), undefined, true)} className="px-3 py-1 rounded border text-sm disabled:opacity-40">열기</button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`‘${p.title}’ 프로젝트와 이미지를 이 컴퓨터에서 삭제할까요? 되돌릴 수 없습니다.`)) void run(() => onDelete(p.id), '삭제했습니다.');
                      }}
                      className="px-3 py-1 rounded border border-red-200 text-red-600 text-sm disabled:opacity-40"
                    >
                      삭제
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
