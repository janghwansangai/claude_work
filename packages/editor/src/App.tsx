import { useEffect, useState } from 'react';
import type { Step } from '@walksim/shared';
import { parseCapturePayload } from './project';
import { burnMasks } from './imaging';
import { desktop, isExtensionPage, subscribeToCaptures, useEditorLock } from './captureSource';
import { DesktopRecord } from './components/DesktopRecord';

import { metaOf, useInbox, type InboxItem } from './inbox/useInbox';
import { useProject, type SaveStatus } from './storage/useProject';
import { InboxReview } from './components/InboxReview';
import { StepEditor } from './components/StepEditor';
import { downloadBlob } from './export/exportZip';
import { buildProjectFile, parseProjectFile, projectFileName } from './export/projectFile';
import { ProjectsDialog } from './components/ProjectsDialog';
import { SafetyPanel } from './components/SafetyPanel';

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
  const [showProjects, setShowProjects] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);

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


  // 캡처(들)를 지금 표시된 가림 상자·지시문 그대로 승인해 단계로 만든다(녹화 순서대로).
  const approveItems = async (items: InboxItem[]) => {
    const ordered = [...items].sort((a, b) => a.timestamp - b.timestamp);
    const done = new Set<string>();
    setBusy(true);
    setError(null);
    try {
      for (const [i, item] of ordered.entries()) {
        if (ordered.length > 1) setProgress(`승인하는 중… ${i + 1} / ${ordered.length}`);
        const image = await burnMasks(item.blob, item.masks);
        await project.addApprovedCapture({
          image,
          rect: item.rect,
          action: item.action,
          instruction: item.instruction,
          viewport: item.viewport,
          placeholder: item.target?.label,
        });
        inbox.remove(item.id);
        done.add(item.id);
      }
    } catch (err) {
      console.error(err);
      setError('승인 처리 중 오류가 발생했습니다. 남은 캡처는 검수함에 그대로 있습니다.');
    } finally {
      setBusy(false);
      setProgress(null);
      setSelected(prev => new Set([...prev].filter(id => !done.has(id))));
      const rest = inbox.items.filter(i => !done.has(i.id));
      setView(rest.length > 0 && ordered.length === 1 ? { kind: 'inbox', id: rest[0].id } : { kind: 'step' });
    }
  };

  const approve = () => { if (inboxItem) void approveItems([inboxItem]); };

  const discardItems = (ids: string[]) => {
    ids.forEach(id => inbox.remove(id));
    setSelected(prev => new Set([...prev].filter(id => !ids.includes(id))));
    const rest = inbox.items.filter(i => !ids.includes(i.id));
    setView(rest.length > 0 ? { kind: 'inbox', id: rest[0].id } : { kind: 'step' });
  };

  const discard = () => { if (inboxItem) discardItems([inboxItem.id]); };

  const selectedItems = inbox.items.filter(i => selected.has(i.id));
  const toggleSelected = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const approveSelected = () => {
    const n = selectedItems.length;
    const ok = window.confirm(`선택한 ${n}개 캡처를 지금 그려진 가림 상자 그대로 승인합니다.\n\n${n}장 모두 이미지 전체를 확인했고, 가리지 않은 곳에 실제 개인정보가 없습니까?`);
    if (ok) void approveItems(selectedItems);
  };

  const discardSelected = () => {
    if (window.confirm(`선택한 ${selectedItems.length}개 캡처를 버릴까요? 되돌릴 수 없습니다.`)) discardItems(selectedItems.map(i => i.id));
  };

  const goToStep = (stepId: string) => { project.setSelectedStepId(stepId); setView({ kind: 'step' }); };

  const saveProjectFile = async () => {
    const file = await buildProjectFile(manifest, selectedStepId, project.currentAssets(), inbox.items.map(i => ({ blob: i.blob, meta: metaOf(i) })));
    downloadBlob(file, projectFileName(manifest.title));
  };

  const openProjectFile = async (file: File) => {
    const parsed = await parseProjectFile(file);
    await project.importProject(parsed.manifest, parsed.assets, parsed.selectedStepId);
    if (parsed.pending.length > 0) inbox.addRestored(parsed.pending);
    setView({ kind: 'step' });
  };

  const updateSelectedStep = (updater: (step: Step) => Step) => {
    if (!selectedStep) return;
    const id = selectedStep.id;
    project.updateManifest(prev => ({ ...prev, steps: prev.steps.map(s => (s.id === id ? updater(s) : s)) }));
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

      {showProjects && (
        <ProjectsDialog
          currentId={manifest.id}
          currentTitle={manifest.title}
          onClose={() => setShowProjects(false)}
          onNew={async () => { await project.newProject(); setView({ kind: 'step' }); }}
          onOpen={async id => { await project.openProject(id); setView({ kind: 'step' }); }}
          onDelete={id => project.removeProject(id)}
          onSaveFile={saveProjectFile}
          onOpenFile={openProjectFile}
        />
      )}
      {progress && (
        <div className="fixed inset-0 z-40 bg-gray-900/40 flex items-center justify-center">
          <div className="bg-white rounded-lg px-6 py-4 shadow-xl text-sm font-medium" role="status">{progress}</div>
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
            onClick={() => setShowProjects(true)}
            disabled={!hydrated}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-1.5 rounded-md font-medium hover:bg-gray-100 transition text-sm disabled:opacity-50"
          >
            📁 프로젝트 (새로·열기·저장)
          </button>
          <button
            onClick={() => setView({ kind: 'safety' })}
            className="bg-green-100 text-green-700 px-4 py-1.5 rounded-md font-medium hover:bg-green-200 transition text-sm"
          >
            ✓ 안전 확인
          </button>
          <button
            onClick={() => setView({ kind: 'safety' })}
            disabled={!hydrated || manifest.steps.length === 0}
            className="bg-blue-600 text-white px-4 py-1.5 rounded-md font-medium hover:bg-blue-700 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
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
            {desktop && canReceive && <DesktopRecord bridge={desktop} />}
            {inbox.items.length > 0 && (
              <p className={`text-[11px] mb-2 leading-relaxed ${inbox.storage === 'memory-only' ? 'text-red-600' : 'text-gray-400'}`}>
                {inbox.storage === 'memory-only'
                  ? '⚠ 임시 보관에 실패했습니다. 창을 닫으면 검수 전 캡처가 사라집니다.'
                  : '🔒 이 컴퓨터에 암호화해 보관 중 · 앱을 닫았다가 나중에 검수해도 됩니다'}
              </p>
            )}
            {inbox.items.length === 0 ? (
              <p className="text-xs text-gray-400 leading-relaxed">
                {desktop
                  ? '녹화한 화면이 여기에 쌓입니다. 개인정보를 가린 뒤 승인하세요.'
                  : isExtensionPage
                  ? '녹화할 탭에서 WalkSim 아이콘 → ‘녹화 시작’을 누르고 화면을 클릭하면 캡처가 여기에 쌓입니다.'
                  : '개발 모드: 레코더 확장의 캡처가 이 localhost 에디터로 전달됩니다.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-1.5 text-gray-600">
                    <input
                      type="checkbox"
                      checked={selectedItems.length === inbox.items.length}
                      ref={el => { if (el) el.indeterminate = selectedItems.length > 0 && selectedItems.length < inbox.items.length; }}
                      onChange={e => setSelected(e.target.checked ? new Set(inbox.items.map(i => i.id)) : new Set())}
                    />
                    전체 선택
                  </label>
                  {selectedItems.length > 0 && <span className="text-gray-500">{selectedItems.length}개 선택</span>}
                </div>
                {selectedItems.length > 0 && (
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={approveSelected} className="flex-1 rounded-md bg-blue-600 text-white text-xs font-semibold py-1.5 disabled:opacity-50">
                      선택 승인 ({selectedItems.length})
                    </button>
                    <button disabled={busy} onClick={discardSelected} className="flex-1 rounded-md border border-gray-300 text-gray-600 text-xs font-semibold py-1.5 disabled:opacity-50">
                      선택 버리기
                    </button>
                  </div>
                )}
                {inbox.items.map((item, i) => (
                  <div
                    key={item.id}
                    className={`flex gap-2 items-center p-1.5 rounded border ${view.kind === 'inbox' && view.id === item.id ? 'border-amber-400 bg-amber-50' : 'border-transparent hover:bg-gray-50'}`}
                  >
                    <input type="checkbox" aria-label={`검수 필요 #${i + 1} 선택`} checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)} />
                    <button onClick={() => setView({ kind: 'inbox', id: item.id })} className="flex gap-2 items-center text-left min-w-0">
                      {/* 썸네일은 흐리게 표시해 검수 전 원본이 목록에서 그대로 보이지 않게 한다 */}
                      <img src={item.url} alt="" className="w-14 h-9 object-cover rounded blur-sm shrink-0" />
                      <span className="text-xs min-w-0">
                        <span className="text-amber-600 font-semibold">검수 필요 #{i + 1}</span>
                        {item.masks.length > 0 && <span className="text-gray-400"> · 가림 {item.masks.length}</span>}
                        <span className="block text-gray-500 truncate">{item.instruction}</span>
                      </span>
                    </button>
                  </div>
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
            <SafetyPanel
              manifest={manifest}
              pendingInbox={inbox.items.length}
              hasImage={assetId => !!images[assetId]}
              getImage={project.getImageBlob}
              onGoToStep={goToStep}
              onGoToInbox={() => inbox.items[0] && setView({ kind: 'inbox', id: inbox.items[0].id })}
            />
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
              onSetRect={(role, rect) => project.setStepRect(selectedStep.id, role, rect)}
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

export default App;
