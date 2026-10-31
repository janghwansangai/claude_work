import { useCallback, useEffect, useRef, useState } from 'react';
import type { Manifest, Rect, Step } from '@walksim/shared';
import { parseCapturePayload, type RectRole } from './project';
import { burnMasks } from './imaging';
import { desktop, isExtensionPage, subscribeToCaptures, useEditorLock } from './captureSource';
import { DesktopRecord } from './components/DesktopRecord';

import { metaOf, useInbox, type InboxItem, type InboxPatch } from './inbox/useInbox';
import { useProject, type SaveStatus } from './storage/useProject';
import { InboxReview } from './components/InboxReview';
import { InboxList } from './components/InboxList';
import { StepEditor } from './components/StepEditor';
import { downloadBlob } from './export/exportZip';
import { buildProjectFile, parseProjectFile, projectFileName } from './export/projectFile';
import { ProjectsDialog } from './components/ProjectsDialog';
import { SafetyPanel } from './components/SafetyPanel';
import { isEditableTarget, useUndoHistory } from './history';
import { openPreview, previewAvailable, usePreviewServer } from './preview';

const SAVE_STATUS_LABEL: Record<SaveStatus, { text: string; className: string }> = {
  loading: { text: '불러오는 중…', className: 'text-gray-400' },
  idle: { text: '이 브라우저에만 저장됩니다', className: 'text-gray-400' },
  saving: { text: '저장 중…', className: 'text-gray-500' },
  saved: { text: '✓ 이 브라우저에 저장됨', className: 'text-green-600' },
  error: { text: '⚠ 저장 실패 (브라우저 저장소 확인 필요)', className: 'text-red-600' },
};

type View = { kind: 'inbox'; id: string } | { kind: 'step' } | { kind: 'safety' };
interface Snapshot { items: InboxItem[]; manifest: Manifest }
interface Toast { text: string; undo?: boolean; key: number }

const isMod = (e: KeyboardEvent | React.PointerEvent) => e.ctrlKey || e.metaKey;

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
  const [toast, setToast] = useState<Toast | null>(null);
  const anchorRef = useRef(-1);
  const dragRef = useRef<{ start: number; base: Set<string> } | null>(null);

  const { manifest, selectedStepId, images, hydrated, saveStatus } = project;
  const canReceive = hydrated && lock === 'owner';

  // ---------- 되돌리기 ----------
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;
  const capture = useCallback((): Snapshot => ({ items: inbox.snapshot(), manifest: manifestRef.current }), [inbox]);
  const applySnapshot = useCallback((s: Snapshot, at: number) => {
    inbox.restore(s.items, at);
    project.restoreManifest(s.manifest);
  }, [inbox, project]);
  const history = useUndoHistory(capture, applySnapshot);

  const showToast = (text: string, undo = false) => setToast({ text, undo, key: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const undo = useCallback(() => {
    const label = history.undo();
    showToast(label ? `되돌렸습니다: ${label}` : '더 되돌릴 작업이 없습니다.');
  }, [history]);
  const redo = useCallback(() => {
    const label = history.redo();
    showToast(label ? `다시 실행했습니다: ${label}` : '다시 실행할 작업이 없습니다.');
  }, [history]);

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

  // 미리보기(학생 화면) 창이 지금 프로젝트를 요청하면 보내 준다.
  usePreviewServer(manifest, project.getImageBlob);

  const items = inbox.items;
  const inboxIndex = view.kind === 'inbox' ? items.findIndex(i => i.id === view.id) : -1;
  const inboxItem = inboxIndex >= 0 ? items[inboxIndex] : undefined;
  const stepIndex = manifest.steps.findIndex(s => s.id === selectedStepId);
  const selectedStep = manifest.steps[stepIndex];

  // 되돌리기 등으로 보고 있던 장면이 사라지면 가까운 장면(또는 단계 편집)으로 옮긴다.
  useEffect(() => {
    if (view.kind === 'inbox' && !items.some(i => i.id === view.id)) {
      setView(items[0] ? { kind: 'inbox', id: items[0].id } : { kind: 'step' });
    }
    setSelected(prev => {
      const alive = new Set([...prev].filter(id => items.some(i => i.id === id)));
      return alive.size === prev.size ? prev : alive;
    });
  }, [items, view]);

  const openItem = (id: string) => setView({ kind: 'inbox', id });

  // 캡처(들)를 지금 표시된 가림 상자·지시문 그대로 승인해 단계로 만든다(검수함 순서대로).
  const approveItems = async (list: InboxItem[]) => {
    const ordered = items.filter(i => list.some(x => x.id === i.id));
    const done = new Set<string>();
    history.checkpoint(ordered.length > 1 ? `${ordered.length}개 승인` : '승인');
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
          targets: item.targets,
          annotations: item.annotations,
          url: item.pageUrl,
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
      const rest = items.filter(i => !done.has(i.id));
      setView(rest.length > 0 && ordered.length === 1 ? { kind: 'inbox', id: rest[Math.min(inboxIndex, rest.length - 1)]?.id ?? rest[0].id } : { kind: 'step' });
    }
  };

  const discardItems = (ids: string[]) => {
    if (ids.length === 0) return;
    history.checkpoint(ids.length > 1 ? `${ids.length}개 버리기` : '버리기');
    const firstIndex = items.findIndex(i => ids.includes(i.id));
    inbox.removeMany(ids);
    const rest = items.filter(i => !ids.includes(i.id));
    setSelected(new Set());
    setView(rest.length > 0 ? { kind: 'inbox', id: rest[Math.min(Math.max(0, firstIndex), rest.length - 1)].id } : { kind: 'step' });
    showToast(`장면 ${ids.length}개를 버렸습니다.`, true);
  };

  const duplicateItem = (id: string) => {
    history.checkpoint('장면 복제');
    const copy = inbox.duplicate(id);
    if (copy) {
      setView({ kind: 'inbox', id: copy.id });
      setSelected(new Set([copy.id]));
      showToast('장면을 복제했습니다. 두 장면을 각각 다른 단계로 다듬으세요.', true);
    }
  };

  const moveItem = (id: string, dir: -1 | 1) => {
    const i = items.findIndex(x => x.id === id);
    if (i + dir < 0 || i + dir >= items.length) return;
    history.checkpoint('장면 순서 바꾸기');
    inbox.move(id, dir);
  };

  const updateItem = (id: string, patch: InboxPatch) => {
    const keys = Object.keys(patch);
    const text = keys.every(k => k === 'instruction');
    history.checkpoint(text ? '지시사항 수정' : '장면 편집', text ? `text:${id}` : undefined);
    inbox.update(id, patch);
  };

  // ---------- 목록 선택(클릭·Ctrl/⌘·Shift·끌기) ----------
  const range = (a: number, b: number) => new Set(items.slice(Math.min(a, b), Math.max(a, b) + 1).map(i => i.id));

  const onRowDown = (index: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const id = items[index].id;
    if (e.shiftKey && anchorRef.current >= 0) {
      const next = range(anchorRef.current, index);
      setSelected(isMod(e) ? new Set([...selected, ...next]) : next);
      openItem(id);
      return;
    }
    if (isMod(e)) {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelected(next);
      anchorRef.current = index;
      dragRef.current = { start: index, base: next };
      return;
    }
    setSelected(new Set([id]));
    anchorRef.current = index;
    dragRef.current = { start: index, base: new Set() };
    openItem(id);
  };

  const onRowEnter = (index: number) => {
    const d = dragRef.current;
    if (!d) return;
    setSelected(new Set([...d.base, ...range(d.start, index)]));
  };

  useEffect(() => {
    const end = () => { dragRef.current = null; };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => { window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
  }, []);

  const toggleSelected = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectedItems = items.filter(i => selected.has(i.id));

  const approveSelected = () => {
    const n = selectedItems.length;
    const ok = window.confirm(`선택한 ${n}개 캡처를 지금 그려진 가림 상자 그대로 승인합니다.\n\n${n}장 모두 이미지 전체를 확인했고, 가리지 않은 곳에 실제 개인정보가 없습니까?`);
    if (ok) void approveItems(selectedItems);
  };

  // ---------- 단계 ----------
  const goToStep = (stepId: string) => { project.setSelectedStepId(stepId); setView({ kind: 'step' }); };

  const updateSelectedStep = (updater: (step: Step) => Step, key?: string) => {
    if (!selectedStep) return;
    const id = selectedStep.id;
    history.checkpoint('단계 편집', key ? `${key}:${id}` : undefined);
    project.updateManifest(prev => ({ ...prev, steps: prev.steps.map(s => (s.id === id ? updater(s) : s)) }));
  };

  const setStepRect = (role: RectRole, rect: Rect | undefined) => {
    if (!selectedStep) return;
    history.checkpoint(role === 'addHotspot' ? '버튼 추가' : '영역 지정');
    project.setStepRect(selectedStep.id, role, rect);
  };

  const duplicateStep = (stepId: string) => {
    history.checkpoint('단계 복제');
    if (project.duplicateStep(stepId)) showToast('단계를 복제해 바로 뒤에 넣었습니다.', true);
  };

  const setEmphasis = (on: boolean) => {
    history.checkpoint(on ? '강조하기 켜기' : '강조하기 끄기');
    project.updateManifest(prev => ({ ...prev, emphasis: on || undefined }));
  };

  // ---------- 키보드 ----------
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (lock !== 'owner' || showProjects || busy) return;
    const key = e.key.toLowerCase();
    if (isMod(e) && !e.altKey && (key === 'z' || key === 'y')) {
      if (isEditableTarget(e.target)) return; // 글자 칸 안에서는 브라우저 기본 되돌리기
      e.preventDefault();
      if (key === 'y' || e.shiftKey) redo(); else undo();
      return;
    }
    if (isEditableTarget(e.target)) return;

    if (view.kind === 'inbox' && inboxItem) {
      const i = inboxIndex;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        if (e.altKey) { moveItem(inboxItem.id, dir); return; }
        const j = Math.min(items.length - 1, Math.max(0, i + dir));
        const id = items[j].id;
        if (e.shiftKey) {
          if (anchorRef.current < 0) anchorRef.current = i;
          setSelected(range(anchorRef.current, j));
        } else {
          setSelected(new Set([id]));
          anchorRef.current = j;
        }
        openItem(id);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        discardItems(selected.size > 0 ? items.filter(x => selected.has(x.id)).map(x => x.id) : [inboxItem.id]);
        return;
      }
      if (isMod(e) && key === 'd') { e.preventDefault(); duplicateItem(inboxItem.id); return; }
      if (isMod(e) && key === 'a') { e.preventDefault(); setSelected(new Set(items.map(x => x.id))); return; }
      if (e.key === 'Escape') { setSelected(new Set()); return; }
    }

    if (view.kind === 'step' && selectedStep) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        const j = Math.min(manifest.steps.length - 1, Math.max(0, stepIndex + (e.key === 'ArrowDown' ? 1 : -1)));
        project.setSelectedStepId(manifest.steps[j].id);
        return;
      }
      if (isMod(e) && key === 'd') { e.preventDefault(); duplicateStep(selectedStep.id); }
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- 프로젝트 파일 ----------
  const saveProjectFile = async () => {
    const file = await buildProjectFile(manifest, selectedStepId, project.currentAssets(), items.map(i => ({ blob: i.blob, meta: metaOf(i) })));
    downloadBlob(file, projectFileName(manifest.title));
  };

  const openProjectFile = async (file: File) => {
    const parsed = await parseProjectFile(file);
    await project.importProject(parsed.manifest, parsed.assets, parsed.selectedStepId);
    if (parsed.pending.length > 0) inbox.addRestored(parsed.pending);
    history.clear();
    setView({ kind: 'step' });
  };

  const status = SAVE_STATUS_LABEL[saveStatus];
  const emphasis = !!manifest.emphasis;

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
          onNew={async () => { await project.newProject(); history.clear(); setView({ kind: 'step' }); }}
          onOpen={async id => { await project.openProject(id); history.clear(); setView({ kind: 'step' }); }}
          onDelete={async id => { await project.removeProject(id); if (id === manifest.id) history.clear(); }}
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
          <h1 className="text-xl font-bold text-blue-600 shrink-0">실습 녹화기</h1>
          <input
            type="text"
            aria-label="프로젝트 제목"
            value={manifest.title}
            onChange={e => { const title = e.target.value; history.checkpoint('제목 수정', 'title'); project.updateManifest(prev => ({ ...prev, title })); }}
            disabled={!hydrated}
            className="border-gray-300 border rounded px-3 py-1 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <span className={`text-xs whitespace-nowrap ${status.className}`} role="status">{status.text}</span>
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="flex rounded-md border border-gray-300 overflow-hidden" role="group" aria-label="되돌리기">
            <button onClick={undo} disabled={!history.canUndo} title="되돌리기 (Ctrl/⌘+Z)" aria-label="되돌리기" className="px-2.5 py-1.5 text-sm bg-white hover:bg-gray-100 disabled:opacity-30">↶</button>
            <button onClick={redo} disabled={!history.canRedo} title="다시 실행 (Ctrl/⌘+Shift+Z)" aria-label="다시 실행" className="px-2.5 py-1.5 text-sm bg-white hover:bg-gray-100 border-l disabled:opacity-30">↷</button>
          </div>
          <button
            onClick={() => setShowProjects(true)}
            disabled={!hydrated}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-1.5 rounded-md font-medium hover:bg-gray-100 transition text-sm disabled:opacity-50"
          >
            📁 프로젝트 (새로·열기·저장)
          </button>
          {previewAvailable && (
            <button
              onClick={() => openPreview()}
              disabled={!hydrated || manifest.steps.length === 0}
              title="학생 화면으로 미리 해 보고, 실제 사이트와 나란히 놓고 따라 할 수 있습니다"
              className="bg-white border border-gray-300 text-gray-700 px-4 py-1.5 rounded-md font-medium hover:bg-gray-100 transition text-sm disabled:opacity-40"
            >
              ▶ 미리보기·따라 하기
            </button>
          )}
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
              <span className={`text-xs px-1.5 rounded-full ${items.length ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                {items.length}
              </span>
            </h2>
            {desktop && canReceive && <DesktopRecord bridge={desktop} />}
            {items.length > 0 && (
              <p className={`text-[11px] mb-2 leading-relaxed ${inbox.storage === 'memory-only' ? 'text-red-600' : 'text-gray-400'}`}>
                {inbox.storage === 'memory-only'
                  ? '⚠ 임시 보관에 실패했습니다. 창을 닫으면 검수 전 캡처가 사라집니다.'
                  : '🔒 이 컴퓨터에 암호화해 보관 중 · 앱을 닫았다가 나중에 검수해도 됩니다'}
              </p>
            )}
            {items.length === 0 ? (
              <p className="text-xs text-gray-400 leading-relaxed">
                {desktop
                  ? '녹화한 화면이 여기에 쌓입니다. 개인정보를 가린 뒤 승인하세요.'
                  : isExtensionPage
                  ? '녹화할 탭에서 실습 녹화기 아이콘 → ‘녹화 시작’을 누르고 화면을 클릭하면 캡처가 여기에 쌓입니다.'
                  : '개발 모드: 레코더 확장의 캡처가 이 localhost 에디터로 전달됩니다.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-1.5 text-gray-600">
                    <input
                      type="checkbox"
                      checked={selectedItems.length === items.length}
                      ref={el => { if (el) el.indeterminate = selectedItems.length > 0 && selectedItems.length < items.length; }}
                      onChange={e => setSelected(e.target.checked ? new Set(items.map(i => i.id)) : new Set())}
                    />
                    전체 선택
                  </label>
                  {selectedItems.length > 0 && <span className="text-gray-500">{selectedItems.length}개 선택</span>}
                </div>
                {selectedItems.length > 1 && (
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={approveSelected} className="flex-1 rounded-md bg-blue-600 text-white text-xs font-semibold py-1.5 disabled:opacity-50">
                      선택 승인 ({selectedItems.length})
                    </button>
                    <button disabled={busy} onClick={() => discardItems(selectedItems.map(i => i.id))} className="flex-1 rounded-md border border-gray-300 text-gray-600 text-xs font-semibold py-1.5 disabled:opacity-50">
                      선택 버리기
                    </button>
                  </div>
                )}
                <InboxList
                  items={items}
                  currentId={view.kind === 'inbox' ? view.id : null}
                  selected={selected}
                  onRowDown={onRowDown}
                  onRowEnter={onRowEnter}
                  onToggle={toggleSelected}
                  onDiscard={id => discardItems([id])}
                />
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  ↑↓ 이동 · Shift+클릭/끌기 연속 선택 · Ctrl/⌘+클릭 여러 개 · Alt(⌥)+↑↓ 순서 옮기기 · Delete 버리기 · Ctrl/⌘+D 복제 · Ctrl/⌘+Z 되돌리기
                </p>
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
              pendingInbox={items.length}
              hasImage={assetId => !!images[assetId]}
              getImage={project.getImageBlob}
              onGoToStep={goToStep}
              onGoToInbox={() => items[0] && setView({ kind: 'inbox', id: items[0].id })}
            />
          ) : inboxItem ? (
            <InboxReview
              key={inboxItem.id}
              item={inboxItem}
              position={inboxIndex + 1}
              total={items.length}
              busy={busy}
              emphasis={emphasis}
              onToggleEmphasis={setEmphasis}
              onChange={patch => updateItem(inboxItem.id, patch)}
              onApprove={() => void approveItems([inboxItem])}
              onDiscard={() => discardItems([inboxItem.id])}
              onDuplicate={() => duplicateItem(inboxItem.id)}
            />
          ) : selectedStep ? (
            <StepEditor
              key={selectedStep.id}
              manifest={manifest}
              step={selectedStep}
              index={stepIndex}
              image={images[selectedStep.assetId]}
              emphasis={emphasis}
              onToggleEmphasis={setEmphasis}
              onUpdate={updateSelectedStep}
              onSetRect={setStepRect}
              onApplyMasks={masks => { history.checkpoint('가림 추가'); return project.addMasksToStep(selectedStep.id, masks); }}
              onDuplicate={() => duplicateStep(selectedStep.id)}
              onDelete={() => {
                if (window.confirm('이 단계를 삭제할까요? 앞뒤 단계는 자동으로 이어집니다. (Ctrl/⌘+Z로 되돌릴 수 있습니다)')) {
                  history.checkpoint('단계 삭제');
                  void project.deleteStep(selectedStep.id);
                }
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400 text-center">
              {hydrated ? '녹화를 시작하거나 왼쪽에서 단계를 선택하세요.' : '불러오는 중…'}
            </div>
          )}
        </main>
      </div>

      {toast && (
        <div key={toast.key} role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm rounded-full shadow-lg pl-4 pr-2 py-2 flex items-center gap-3">
          <span>{toast.text}</span>
          {toast.undo && history.canUndo && (
            <button onClick={() => { setToast(null); undo(); }} className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 font-semibold">되돌리기</button>
          )}
          <button onClick={() => setToast(null)} aria-label="알림 닫기" className="px-1 text-white/60 hover:text-white">×</button>
        </div>
      )}
    </div>
  );
}

export default App;
