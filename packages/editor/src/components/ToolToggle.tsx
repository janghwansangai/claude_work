import type { DrawTool } from './RectCanvas';

export function ToolToggle({ tool, onChange, maskLabel }: { tool: DrawTool; onChange: (t: DrawTool) => void; maskLabel: string }) {
  const btn = (value: DrawTool, label: string) => (
    <button
      type="button"
      aria-pressed={tool === value}
      onClick={() => onChange(value)}
      className={`px-3 py-1.5 text-sm font-medium ${tool === value ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="그리기 도구" className="flex shrink-0 border border-gray-300 rounded-md overflow-hidden">
      {btn('mask', maskLabel)}
      {btn('hotspot', '클릭 영역 지정')}
    </div>
  );
}
