import { useState } from 'react';
import type { GraphIssue, Manifest } from '@walksim/shared';
import { buildLessonZip, downloadBlob, exportIssues } from '../export/exportZip';
import { DeployGuide } from './DeployGuide';

interface Props {
  manifest: Manifest;
  pendingInbox: number;
  hasImage: (assetId: string) => boolean;
  getImage: (assetId: string) => Blob | undefined;
  onGoToStep: (stepId: string) => void;
  onGoToInbox: () => void;
}

// 안전 확인 + 학생용 ZIP 내보내기. 문제 항목을 누르면 해당 단계(또는 검수함)로 바로 이동한다.
export function SafetyPanel({ manifest, pendingInbox, hasImage, getImage, onGoToStep, onGoToInbox }: Props) {
  const [approved, setApproved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; name?: string; size?: number; text?: string } | null>(null);
  const issues = exportIssues(manifest, pendingInbox, hasImage);
  const errors = issues.filter(i => i.level === 'error');
  const warnings = issues.filter(i => i.level === 'warning');

  const exportZip = async () => {
    setExporting(true);
    setResult(null);
    try {
      const zip = await buildLessonZip(manifest, getImage);
      const name = `walksim-${(manifest.title.trim() || '실습').replace(/[\\/:*?"<>|\s]+/g, '_')}.zip`;
      downloadBlob(zip, name);
      setResult({ ok: true, name, size: zip.size });
    } catch (err) {
      console.error(err);
      setResult({ ok: false, text: err instanceof Error ? err.message : 'ZIP을 만들지 못했습니다.' });
    } finally {
      setExporting(false);
    }
  };

  const issueList = (list: GraphIssue[], tone: 'red' | 'amber') => (
    <ul className="flex flex-col gap-1">
      {list.map((issue, i) => {
        const target = issue.stepId ? () => onGoToStep(issue.stepId!) : issue.message.startsWith('검수함') ? onGoToInbox : null;
        const color = tone === 'red' ? 'text-red-700 border-red-200 bg-red-50 hover:bg-red-100' : 'text-amber-800 border-amber-200 bg-amber-50 hover:bg-amber-100';
        return (
          <li key={i}>
            {target ? (
              <button onClick={target} className={`w-full text-left text-sm border rounded px-3 py-1.5 flex items-center gap-2 ${color}`}>
                {issue.stepNumber && <span className="shrink-0 text-xs font-bold bg-white border rounded px-1.5 py-0.5">{issue.stepNumber}단계</span>}
                <span className="flex-1">{issue.stepNumber ? issue.message.replace(/^\d+단계:\s*/, '') : issue.message}</span>
                <span className="shrink-0 text-xs underline">바로 가기 →</span>
              </button>
            ) : (
              <p className={`text-sm border rounded px-3 py-1.5 ${color}`}>{issue.message}</p>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="max-w-3xl w-full mx-auto bg-white rounded-lg shadow-sm border p-6 flex flex-col gap-4">
      <h2 className="text-lg font-bold">안전 확인 · ZIP 내보내기</h2>
      {errors.length === 0 && warnings.length === 0 && (
        <p className="text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 text-sm">자동 검사에서 문제를 찾지 못했습니다.</p>
      )}
      {errors.length > 0 && (
        <div>
          <h3 className="font-semibold text-red-700 text-sm mb-1">고쳐야 내보낼 수 있어요 ({errors.length})</h3>
          {issueList(errors, 'red')}
        </div>
      )}
      {warnings.length > 0 && (
        <div>
          <h3 className="font-semibold text-amber-700 text-sm mb-1">확인해 보세요 ({warnings.length})</h3>
          {issueList(warnings, 'amber')}
        </div>
      )}
      <p className="text-xs text-gray-500">
        자동 검사는 단계 연결·이미지·글자 속 개인정보 형태만 확인합니다. 모든 이미지의 개인정보 여부는 선생님이 직접 확인해 주세요.
      </p>

      <div className="border-t pt-4 flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="w-4 h-4 mt-0.5" checked={approved} onChange={e => setApproved(e.target.checked)} disabled={errors.length > 0} />
          {manifest.steps.length}개 단계의 이미지와 문구를 모두 다시 확인했고, 공개해도 되는 가상 자료만 있습니다.
        </label>
        <button
          onClick={exportZip}
          disabled={errors.length > 0 || !approved || exporting}
          className="self-start bg-blue-600 text-white px-5 py-2 rounded-md font-medium hover:bg-blue-700 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {exporting ? 'ZIP 만드는 중…' : '학생용 ZIP 내려받기'}
        </button>
        {result?.ok && (
          <div role="status" className="text-sm rounded px-3 py-2 border text-green-800 bg-green-50 border-green-200 leading-relaxed">
            <b>{result.name}</b> ({((result.size ?? 0) / 1024).toFixed(0)} KB)을 내려받았습니다.<br />
            이 ZIP 파일을 Cloudflare에 그대로 올리면 <b>주소가 하나 생깁니다</b>(예: <code>https://이름.workers.dev</code> 또는 <code>https://이름.pages.dev</code>).
            <b> 그 주소를 그대로 학생에게 주면</b> 첫 화면이 실습으로 자동 이동합니다. 아래 안내를 참고하세요.
          </div>
        )}
        {result && !result.ok && (
          <p role="status" className="text-sm rounded px-3 py-2 border text-red-700 bg-red-50 border-red-200">{result.text}</p>
        )}
      </div>
      <DeployGuide open={!!result?.ok} />
    </div>
  );
}
