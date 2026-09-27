import { useCallback, useEffect, useRef, useState } from 'react';
import type { Manifest, Rect } from '@walksim/shared';
import {
  appendStep,
  createInitialManifest,
  deleteStep as removeStep,
  replaceStepAsset,
  newId,
  setStepRect as applyStepRect,
  type RectRole,
  type RecordedAction,
  type Viewport,
} from '../project';
import { burnMasks, extensionForMime, type EncodedImage } from '../imaging';
import {
  deleteProject,
  loadLastProject,
  loadProjectAssets,
  loadProjectRecord,
  type ProjectRecord,
  requestPersistentStorage,
  saveProject,
  type AssetRecord,
} from './db';

export type SaveStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'error';

export interface StoredImage {
  url: string; // blob: URL (마스킹 완료 이미지)
  width: number;
  height: number;
}

const SAVE_DEBOUNCE_MS = 400;

export interface ApprovedCapture {
  image: EncodedImage;
  rect: Rect | null;
  action: RecordedAction | null;
  instruction: string;
  viewport: Viewport | null;
  placeholder?: string;
}

// 에디터의 Manifest/승인된 이미지 상태를 소유하고 IndexedDB와 동기화한다.
export function useProject() {
  const [manifest, setManifestState] = useState<Manifest>(createInitialManifest);
  const [selectedStepId, setSelectedStepIdState] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, StoredImage>>({});
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading');

  // 비동기 저장 시 최신 값을 읽기 위한 ref. 상태 변경은 항상 아래 setter를 통해서만 한다.
  const manifestRef = useRef(manifest);
  const selectedRef = useRef(selectedStepId);
  const blobsRef = useRef(new Map<string, Blob>());
  const dirtyRef = useRef(false);
  const hydratedRef = useRef(false);
  const objectUrlsRef = useRef(new Set<string>());

  const setManifest = useCallback((next: Manifest) => {
    manifestRef.current = next;
    setManifestState(next);
    if (hydratedRef.current) setSaveStatus('saving');
  }, []);

  const setSelectedStepId = useCallback((id: string | null) => {
    selectedRef.current = id;
    setSelectedStepIdState(id);
  }, []);

  const registerImage = useCallback((assetId: string, blob: Blob, width: number, height: number) => {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    blobsRef.current.set(assetId, blob);
    return { url, width, height };
  }, []);

  const revokeAllObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
    blobsRef.current.clear();
  }, []);

  const persist = useCallback(async (newAssets: AssetRecord[] = []) => {
    dirtyRef.current = false;
    try {
      await saveProject(manifestRef.current, selectedRef.current, newAssets);
      if (!dirtyRef.current) setSaveStatus('saved');
    } catch (err) {
      console.error('프로젝트 저장 실패:', err);
      dirtyRef.current = true;
      setSaveStatus('error');
      throw err;
    }
  }, []);

  const flush = useCallback(async () => {
    if (dirtyRef.current) await persist().catch(() => {});
  }, [persist]);

  // 저장된 프로젝트(와 이미지)를 화면 상태로 불러온다.
  const applyRecord = useCallback((record: ProjectRecord, assets: AssetRecord[]) => {
    revokeAllObjectUrls();
    const restored: Record<string, StoredImage> = {};
    for (const a of assets) restored[a.assetId] = registerImage(a.assetId, a.blob, a.width, a.height);
    setManifest(record.manifest);
    setSelectedStepId(
      record.manifest.steps.some(s => s.id === record.selectedStepId)
        ? record.selectedStepId
        : record.manifest.steps[0]?.id ?? null,
    );
    setImages(restored);
  }, [registerImage, revokeAllObjectUrls, setManifest, setSelectedStepId]);

  // 최초 로드: 마지막으로 작업한 프로젝트와 이미지를 IndexedDB에서 복원한다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      requestPersistentStorage().catch(() => {});
      try {
        const record = await loadLastProject();
        if (cancelled) return;
        if (record) {
          const assets = await loadProjectAssets(record.id);
          if (cancelled) return;
          applyRecord(record, assets);
        }
        setSaveStatus(record ? 'saved' : 'idle');
      } catch (err) {
        console.error('저장된 프로젝트를 불러오지 못했습니다:', err);
        if (!cancelled) setSaveStatus('error');
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setHydrated(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [applyRecord]);

  useEffect(() => revokeAllObjectUrls, [revokeAllObjectUrls]);

  // 텍스트 편집 등 잦은 변경은 디바운스하여 저장한다.
  useEffect(() => {
    if (!hydrated) return;
    dirtyRef.current = true;
    const timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [manifest, selectedStepId, hydrated, flush]);

  // 탭을 닫거나 전환할 때 대기 중인 변경사항을 즉시 저장한다.
  useEffect(() => {
    const onHide = () => { void flush(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') onHide(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush]);

  const updateManifest = useCallback((updater: (prev: Manifest) => Manifest) => {
    setManifest(updater(manifestRef.current));
  }, [setManifest]);

  const toAssetRecord = useCallback((image: EncodedImage) => {
    const assetId = `img-${image.hash.slice(0, 16)}`;
    const record: AssetRecord = {
      projectId: manifestRef.current.id,
      assetId,
      blob: image.blob,
      width: image.width,
      height: image.height,
      createdAt: Date.now(),
    };
    const path = `assets/${assetId}.${extensionForMime(image.blob.type)}`;
    if (!blobsRef.current.has(assetId)) {
      const stored = registerImage(assetId, image.blob, image.width, image.height);
      setImages(prev => ({ ...prev, [assetId]: stored }));
    }
    return { assetId, path, record };
  }, [registerImage]);

  // 검수함에서 승인된(마스킹이 구워진) 캡처를 새 단계로 추가하고 즉시 저장한다.
  const addApprovedCapture = useCallback(async (capture: ApprovedCapture) => {
    const { assetId, path, record } = toAssetRecord(capture.image);
    const { manifest: next, step } = appendStep(manifestRef.current, {
      assetId,
      assetPath: path,
      rect: capture.rect,
      action: capture.action,
      instruction: capture.instruction,
      viewport: capture.viewport,
      placeholder: capture.placeholder,
    });
    setManifest(next);
    setSelectedStepId(step.id);
    await persist([record]);
    return step.id;
  }, [persist, setManifest, setSelectedStepId, toAssetRecord]);

  // 이미 승인된 단계 이미지에 가림 상자를 추가로 굽는다. 이전 이미지는 참조가 없어지면 DB에서 삭제된다.
  const addMasksToStep = useCallback(async (stepId: string, masks: Rect[]) => {
    const step = manifestRef.current.steps.find(s => s.id === stepId);
    const source = step && blobsRef.current.get(step.assetId);
    if (!step || !source || masks.length === 0) return;
    const { assetId, path, record } = toAssetRecord(await burnMasks(source, masks));
    setManifest(replaceStepAsset(manifestRef.current, stepId, assetId, path));
    await persist([record]);
  }, [persist, setManifest, toAssetRecord]);

  const setStepRect = useCallback((stepId: string, role: RectRole, rect: Rect | undefined) => {
    setManifest(applyStepRect(manifestRef.current, stepId, role, rect));
  }, [setManifest]);

  const deleteStep = useCallback(async (stepId: string) => {
    const steps = manifestRef.current.steps;
    const index = steps.findIndex(s => s.id === stepId);
    setManifest(removeStep(manifestRef.current, stepId));
    if (selectedRef.current === stepId) {
      setSelectedStepId(steps[index + 1]?.id ?? steps[index - 1]?.id ?? null);
    }
    await persist().catch(() => {});
  }, [persist, setManifest, setSelectedStepId]);

  // 지금 프로젝트를 저장해 두고 빈 새 프로젝트를 시작한다(이전 프로젝트는 목록에 남는다).
  const newProject = useCallback(async () => {
    await flush();
    revokeAllObjectUrls();
    setImages({});
    setManifest(createInitialManifest());
    setSelectedStepId(null);
  }, [flush, revokeAllObjectUrls, setManifest, setSelectedStepId]);

  // 저장된 다른 프로젝트를 연다.
  const openProject = useCallback(async (projectId: string) => {
    if (projectId === manifestRef.current.id) return true;
    await flush();
    const record = await loadProjectRecord(projectId);
    if (!record) return false;
    applyRecord(record, await loadProjectAssets(projectId));
    await persist().catch(() => {}); // "마지막으로 연 프로젝트"로 기록
    return true;
  }, [applyRecord, flush, persist]);

  // 프로젝트와 그 이미지를 이 컴퓨터에서 지운다. 지금 열린 프로젝트면 빈 새 프로젝트로 바꾼다.
  const removeProject = useCallback(async (projectId: string) => {
    const current = projectId === manifestRef.current.id;
    if (current) dirtyRef.current = false;
    await deleteProject(projectId);
    if (current) {
      revokeAllObjectUrls();
      setImages({});
      setManifest(createInitialManifest());
      setSelectedStepId(null);
    }
  }, [revokeAllObjectUrls, setManifest, setSelectedStepId]);

  // 프로젝트 파일에서 읽은 내용을 새 프로젝트로 저장하고 연다(같은 파일을 여러 번 열어도 덮어쓰지 않는다).
  const importProject = useCallback(async (manifest: Manifest, assets: Omit<AssetRecord, 'projectId' | 'createdAt'>[], selectedStepId: string | null) => {
    await flush();
    const imported: Manifest = { ...manifest, id: newId('project') };
    const records: AssetRecord[] = assets.map(a => ({ ...a, projectId: imported.id, createdAt: Date.now() }));
    await saveProject(imported, selectedStepId, records);
    applyRecord({ id: imported.id, manifest: imported, selectedStepId, updatedAt: Date.now() }, records);
  }, [applyRecord, flush]);

  // 프로젝트 파일로 저장할 때 쓰는 현재 이미지 목록
  const currentAssets = useCallback(() => {
    return Object.entries(images).map(([assetId, img]) => ({ assetId, blob: blobsRef.current.get(assetId)!, width: img.width, height: img.height }))
      .filter(a => a.blob);
  }, [images]);

  const getImageBlob = useCallback((assetId: string) => blobsRef.current.get(assetId), []);

  return {
    getImageBlob,
    manifest,
    selectedStepId,
    images,
    hydrated,
    saveStatus,
    setSelectedStepId,
    updateManifest,
    addApprovedCapture,
    addMasksToStep,
    setStepRect,
    deleteStep,
    newProject,
    openProject,
    removeProject,
    importProject,
    currentAssets,
  };
}
