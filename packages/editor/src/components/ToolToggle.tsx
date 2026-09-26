import type { DrawTool } from './RectCanvas';

export interface ToolOption { value: DrawTool; label: string }

export function ToolToggle({ tool, onChange, options }: { tool: DrawTool; onChange: (t: DrawTool) => void; options: ToolOption[] }) {
  return (
    <div role="group" aria-label="그리기 도구" className="flex flex-wrap shrink-0 border border-gray-300 rounded-md overflow-hidden">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={tool === o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-sm font-medium ${tool === o.value ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
