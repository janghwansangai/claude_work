import { useCallback, useEffect, useRef, useState } from 'react';
import type { Manifest } from '@walksim/shared';
import { appendCaptureStep, createInitialManifest, type CapturePayload } from '../project';
import {
  dataUrlToBlob,
  deleteProject,
  loadLastProject,
  loadProjectAssets,
  pruneOrphanAssets,
  requestPersistentStorage,
  saveCapture,
  saveProject,
} from './db';

export type SaveStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'error';

const SAVE_DEBOUNCE_MS = 400;

// 에디터의 Manifest/캡처 이미지 상태를 소유하고 IndexedDB와 동기화한다.
export function useProject() {
  const [manifest, setManifestState] = useState<Manifest>(createInitialManifest);
  const [selectedStepId, setSelectedStepIdState] = useState<string | null>(() => manifest.startStepId);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({}); // assetId -> blob: URL
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading');

  // 비동기 저장 시 최신 값을 읽기 위한 ref. 상태 변경은 항상 아래 setter를 통해서만 한다.
  const manifestRef = useRef(manifest);
  const selectedRef = useRef(selectedStepId);
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
    if (hydratedRef.current) setSaveStatus('saving');
  }, []);

  const createObjectUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    return url;
  }, []);

  const revokeAllObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  const flush = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    try {
      await saveProject(manifestRef.current, selectedRef.current);
      if (!dirtyRef.current) setSaveStatus('saved');
    } catch (err) {
      console.error('프로젝트 저장 실패:', err);
      dirtyRef.current = true;
      setSaveStatus('error');
    }
  }, []);

  // 최초 로드: 마지막으로 작업한 프로젝트와 이미지를 IndexedDB에서 복원한다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      requestPersistentStorage().catch(() => {});
      try {
        const record = await loadLastProject();
        if (cancelled) return;
        if (record) {
          const blobs = await loadProjectAssets(record.id);
          if (cancelled) return;
          const urls: Record<string, string> = {};
          for (const [assetId, blob] of Object.entries(blobs)) urls[assetId] = createObjectUrl(blob);
          setManifest(record.manifest);
          setSelectedStepId(
            record.manifest.steps.some(s => s.id === record.selectedStepId)
              ? record.selectedStepId
              : record.manifest.steps[0]?.id ?? null,
          );
          setImageUrls(urls);
          pruneOrphanAssets(record.manifest).catch(err => console.warn('고아 이미지 정리 실패:', err));
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
  }, [createObjectUrl, setManifest, setSelectedStepId]);

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

  const addCapture = useCallback(async (capture: CapturePayload) => {
    const assetId = `asset-${capture.timestamp}`;
    const blob = dataUrlToBlob(capture.image);
    const { manifest: next, step } = appendCaptureStep(manifestRef.current, capture, assetId);

    setManifest(next);
    setSelectedStepId(step.id);
    const url = createObjectUrl(blob);
    setImageUrls(prev => ({ ...prev, [assetId]: url }));

    // 이미지와 Manifest를 한 트랜잭션으로 즉시 기록한다.
    try {
      await saveCapture(next, step.id, assetId, blob);
      if (!dirtyRef.current) setSaveStatus('saved');
    } catch (err) {
      console.error('캡처 저장 실패:', err);
      setSaveStatus('error');
    }
  }, [createObjectUrl, setManifest, setSelectedStepId]);

  // 현재 프로젝트와 캡처 이미지를 이 브라우저에서 완전히 삭제하고 빈 프로젝트로 시작한다.
  const resetProject = useCallback(async () => {
    const oldId = manifestRef.current.id;
    dirtyRef.current = false;
    try {
      await deleteProject(oldId);
    } catch (err) {
      console.error('프로젝트 삭제 실패:', err);
      setSaveStatus('error');
      return;
    }
    revokeAllObjectUrls();
    setImageUrls({});
    const fresh = createInitialManifest();
    setManifest(fresh);
    setSelectedStepId(fresh.startStepId);
  }, [revokeAllObjectUrls, setManifest, setSelectedStepId]);

  return {
    manifest,
    selectedStepId,
    imageUrls,
    hydrated,
    saveStatus,
    setSelectedStepId,
    updateManifest,
    addCapture,
    resetProject,
  };
}
