import type { DrawTool } from './SceneCanvas';

export interface ToolOption { value: DrawTool; label: string; icon?: string }

export function ToolToggle({ tool, onChange, options, label = '그리기 도구' }: { tool: DrawTool; onChange: (t: DrawTool) => void; options: ToolOption[]; label?: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap shrink-0 border border-gray-300 rounded-md overflow-hidden">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={tool === o.value}
          title={o.label}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-sm font-medium ${tool === o.value ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
        >
          {o.icon && <span className="mr-1" aria-hidden>{o.icon}</span>}{o.label}
        </button>
      ))}
    </div>
  );
}
