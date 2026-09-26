import { useEffect, useState } from 'react';
import { validateManifestGraph, type GraphReport, type Step } from '@walksim/shared';
import { parseCapturePayload } from './project';
import { burnMasks } from './imaging';
import { isExtensionPage, subscribeToCaptures, useEditorLock } from './captureSource';
import { useInbox } from './inbox/useInbox';
import { useProject, type SaveStatus } from './storage/useProject';
import { InboxReview } from './components/InboxReview';
import { StepEditor } from './components/StepEditor';

const SAVE_STATUS_LABEL: Record<SaveStatus, { text: string; className: string }> = {
  loading: { text: '불러오는 중…', className: 'text-gray-400' },
  idle: { text: '이 브라우저에만 저장됩니다', className: 'text-gray-400' },
  saving: { text: '저장 중…', className: 'text-gray-500' },
  saved: { text: '✓ 이 브라우저에 저장됨', className: 'text-green-600' },
  error: { text: '⚠ 저장 실패 (브라우저 저장소 확인 필요)', className: 'text-red-600' },
};

type View = { kind: 'inbox'; id: string } | { kind: 'step' } | { kind: 'safety' };

function App() {
  const project = useProject();
  const inbox = useInbox();
  const lock = useEditorLock();
  const [view, setView] = useState<View>({ kind: 'step' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { manifest, selectedStepId, images, hydrated, saveStatus } = project;
  const canReceive = hydrated && lock === 'owner';

  // 저장된 프로젝트 복원이 끝나고 편집 잠금을 가진 탭만 캡처를 받는다.
  const { add: addToInbox } = inbox;
  useEffect(() => {
    if (!canReceive) return;
    return subscribeToCaptures(raw => {
      const capture = parseCapturePayload(raw);
      if (!capture) {
        console.warn('잘못된 캡처 메시지를 무시했습니다.');
        return;
      }
      const item = addToInbox(capture);
      setView(v => (v.kind === 'inbox' ? v : { kind: 'inbox', id: item.id }));
    });
  }, [canReceive, addToInbox]);

  const inboxIndex = view.kind === 'inbox' ? inbox.items.findIndex(i => i.id === view.id) : -1;
  const inboxItem = inboxIndex >= 0 ? inbox.items[inboxIndex] : undefined;
  const stepIndex = manifest.steps.findIndex(s => s.id === selectedStepId);
  const selectedStep = manifest.steps[stepIndex];

  const afterInboxItemGone = (id: string) => {
    const rest = inbox.items.filter(i => i.id !== id);
    setView(rest.length > 0 ? { kind: 'inbox', id: rest[0].id } : { kind: 'step' });
  };

  const approve = async () => {
    if (!inboxItem) return;
    setBusy(true);
    setError(null);
    try {
      const image = await burnMasks(inboxItem.blob, inboxItem.masks);
      inbox.remove(inboxItem.id);
      afterInboxItemGone(inboxItem.id);
      await project.addApprovedCapture({
        image,
        rect: inboxItem.rect,
        instruction: inboxItem.instruction,
        viewport: inboxItem.viewport,
      });
    } catch (err) {
      console.error(err);
      setError('승인 처리 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    if (!inboxItem) return;
    inbox.remove(inboxItem.id);
    afterInboxItemGone(inboxItem.id);
  };

  const updateSelectedStep = (updater: (step: Step) => Step) => {
    if (!selectedStep) return;
    const id = selectedStep.id;
    project.updateManifest(prev => ({ ...prev, steps: prev.steps.map(s => (s.id === id ? updater(s) : s)) }));
  };

  const handleReset = () => {
    const ok = window.confirm('현재 프로젝트와 모든 이미지·검수함 캡처를 이 브라우저에서 삭제하고 새로 시작합니다. 계속할까요?');
    if (!ok) return;
    inbox.items.forEach(i => inbox.remove(i.id));
    setView({ kind: 'step' });
    void project.resetProject();
  };

  const status = SAVE_STATUS_LABEL[saveStatus];

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      {lock === 'blocked' && (
        <div className="fixed inset-0 z-50 bg-gray-900/80 flex items-center justify-center p-6">
          <div className="bg-white rounded-lg p-6 max-w-md text-center shadow-xl">
            <h2 className="font-bold text-lg mb-2">다른 탭에서 에디터가 열려 있습니다</h2>
            <p className="text-sm text-gray-600">
              두 탭에서 동시에 편집하면 저장 내용이 서로 덮어써집니다. 다른 탭을 닫으면 이 탭에서 자동으로 이어서 편집할 수 있습니다.
            </p>
          </div>
        </div>
      )}

      <header className="bg-white border-b px-6 py-3 flex flex-wrap items-center justify-between shadow-sm z-10 gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="text-xl font-bold text-blue-600 shrink-0">WalkSim Editor</h1>
          <input
            type="text"
            aria-label="프로젝트 제목"
            value={manifest.title}
            onChange={e => { const title = e.target.value; project.updateManifest(prev => ({ ...prev, title })); }}
            disabled={!hydrated}
            className="border-gray-300 border rounded px-3 py-1 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <span className={`text-xs whitespace-nowrap ${status.className}`} role="status">{status.text}</span>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleReset}
            disabled={!hydrated}
            className="bg-white border border-gray-300 text-gray-600 px-4 py-1.5 rounded-md font-medium hover:bg-gray-100 transition text-sm disabled:opacity-50"
          >
            새 프로젝트
          </button>
          <button
            onClick={() => setView({ kind: 'safety' })}
            className="bg-green-100 text-green-700 px-4 py-1.5 rounded-md font-medium hover:bg-green-200 transition text-sm"
          >
            ✓ 안전 확인
          </button>
          <button
            disabled
            title="다음 작업에서 구현 예정: 안전 확인 통과 시 player 기반 정적 ZIP 생성"
            className="bg-blue-600 text-white px-4 py-1.5 rounded-md font-medium transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ZIP 내보내기
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="bg-red-50 text-red-700 text-sm px-6 py-2 border-b border-red-200 flex justify-between">
          {error}
          <button onClick={() => setError(null)} aria-label="닫기">×</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 shrink-0 bg-white border-r flex flex-col overflow-y-auto">
          <section className="p-3 border-b">
            <h2 className="font-semibold text-gray-700 text-sm mb-2 flex items-center gap-2">
              검수함
              <span className={`text-xs px-1.5 rounded-full ${inbox.items.length ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                {inbox.items.length}
              </span>
            </h2>
            {inbox.items.length === 0 ? (
              <p className="text-xs text-gray-400 leading-relaxed">
                {isExtensionPage
                  ? '녹화할 탭에서 WalkSim 아이콘 → ‘녹화 시작’을 누르고 화면을 클릭하면 캡처가 여기에 쌓입니다.'
                  : '개발 모드: 레코더 확장의 캡처가 이 localhost 에디터로 전달됩니다.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {inbox.items.map((item, i) => (
                  <button
                    key={item.id}
                    onClick={() => setView({ kind: 'inbox', id: item.id })}
                    className={`flex gap-2 items-center p-1.5 rounded border text-left ${view.kind === 'inbox' && view.id === item.id ? 'border-amber-400 bg-amber-50' : 'border-transparent hover:bg-gray-50'}`}
                  >
                    {/* 썸네일은 흐리게 표시해 검수 전 원본이 목록에서 그대로 보이지 않게 한다 */}
                    <img src={item.url} alt="" className="w-16 h-10 object-cover rounded blur-sm" />
                    <span className="text-xs">
                      <span className="text-amber-600 font-semibold">검수 필요 #{i + 1}</span>
                      <span className="block text-gray-500 truncate w-40">{item.instruction}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="p-3 flex-1">
            <h2 className="font-semibold text-gray-700 text-sm mb-2">단계 ({manifest.steps.length})</h2>
            {manifest.steps.length === 0 && <p className="text-xs text-gray-400">검수함에서 승인한 캡처가 단계가 됩니다.</p>}
            <ol className="flex flex-col gap-2">
              {manifest.steps.map((step, i) => {
                const img = images[step.assetId];
                const active = view.kind === 'step' && selectedStepId === step.id;
                return (
                  <li key={step.id}>
                    <button
                      onClick={() => { project.setSelectedStepId(step.id); setView({ kind: 'step' }); }}
                      className={`w-full flex gap-2 items-center p-1.5 rounded border text-left ${active ? 'bg-blue-50 border-blue-300' : 'border-transparent hover:bg-gray-50'}`}
                    >
                      <span className="text-xs font-mono text-gray-400 w-5 text-right">{i + 1}</span>
                      {img
                        ? <img src={img.url} alt="" className="w-16 h-10 object-cover rounded border" />
                        : <span className="w-16 h-10 rounded border border-dashed bg-gray-50 text-[10px] text-gray-400 flex items-center justify-center">이미지 없음</span>}
                      <span className="text-xs text-gray-700 line-clamp-2 flex-1">{step.instruction || '(설명 없음)'}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </aside>

        <main className="flex-1 flex flex-col bg-gray-100 p-6 overflow-y-auto">
          {view.kind === 'safety' ? (
            <SafetyPanel report={validateManifestGraph(manifest)} pendingInbox={inbox.items.length} />
          ) : inboxItem ? (
            <InboxReview
              key={inboxItem.id}
              item={inboxItem}
              position={inboxIndex + 1}
              total={inbox.items.length}
              busy={busy}
              onChange={patch => inbox.update(inboxItem.id, patch)}
              onApprove={approve}
              onDiscard={discard}
            />
          ) : selectedStep ? (
            <StepEditor
              key={selectedStep.id}
              manifest={manifest}
              step={selectedStep}
              index={stepIndex}
              image={images[selectedStep.assetId]}
              onUpdate={updateSelectedStep}
              onSetHotspot={rect => project.setHotspot(selectedStep.id, rect)}
              onApplyMasks={masks => project.addMasksToStep(selectedStep.id, masks)}
              onDelete={() => {
                if (window.confirm('이 단계를 삭제할까요? 앞뒤 단계는 자동으로 이어집니다.')) void project.deleteStep(selectedStep.id);
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400 text-center">
              {hydrated ? '녹화를 시작하거나 왼쪽에서 단계를 선택하세요.' : '불러오는 중…'}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SafetyPanel({ report, pendingInbox }: { report: GraphReport; pendingInbox: number }) {
  const errors = pendingInbox > 0 ? [`검수함에 승인되지 않은 캡처가 ${pendingInbox}개 있습니다.`, ...report.errors] : report.errors;
  return (
    <div className="max-w-3xl w-full mx-auto bg-white rounded-lg shadow-sm border p-6 flex flex-col gap-4">
      <h2 className="text-lg font-bold">안전·구조 확인</h2>
      {errors.length === 0 && report.warnings.length === 0 && (
        <p className="text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 text-sm">자동 검사에서 문제를 찾지 못했습니다.</p>
      )}
      {errors.length > 0 && (
        <div>
          <h3 className="font-semibold text-red-700 text-sm mb-1">내보내기 차단 ({errors.length})</h3>
          <ul className="list-disc pl-5 text-sm text-red-700 space-y-0.5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {report.warnings.length > 0 && (
        <div>
          <h3 className="font-semibold text-amber-700 text-sm mb-1">확인 필요 ({report.warnings.length})</h3>
          <ul className="list-disc pl-5 text-sm text-amber-700 space-y-0.5">{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      <p className="text-xs text-gray-500">
        자동 검사는 단계 연결과 자산만 확인합니다. 모든 이미지의 개인정보 여부는 교사가 직접 확인해야 합니다(PRD §12.2).
      </p>
    </div>
  );
}

export default App;
