import { useEffect, useRef } from 'react';
import type { InboxItem } from '../inbox/useInbox';

interface Props {
  items: InboxItem[];
  currentId: string | null;
  selected: Set<string>;
  onRowDown: (index: number, e: React.PointerEvent) => void;
  onRowEnter: (index: number) => void;
  onToggle: (id: string) => void;
  onDiscard: (id: string) => void;
}

// 검수함 장면 목록. 클릭=하나 선택, Ctrl/⌘+클릭=더하기/빼기, Shift+클릭=연속 선택, 누른 채 끌기=연속 선택.
// 방향키 ↑↓로 이동, Shift+↑↓ 연속 선택, Alt(Option)+↑↓ 장면 순서 옮기기, Delete 버리기, Ctrl/⌘+D 복제.
export function InboxList({ items, currentId, selected, onRowDown, onRowEnter, onToggle, onDiscard }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // 방향키로 옮긴 장면이 목록 밖에 있으면 보이게 스크롤한다.
  useEffect(() => {
    if (!currentId) return;
    listRef.current?.querySelector<HTMLElement>(`[data-id="${currentId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [currentId]);

  return (
    <div ref={listRef} role="listbox" aria-label="검수할 장면" aria-multiselectable className="flex flex-col gap-1 select-none">
      {items.map((item, i) => {
        const isCurrent = item.id === currentId;
        const isSelected = selected.has(item.id);
        return (
          <div
            key={item.id}
            data-id={item.id}
            role="option"
            aria-selected={isSelected}
            aria-current={isCurrent || undefined}
            onPointerDown={e => {
              if ((e.target as HTMLElement).closest('input,button')) return;
              onRowDown(i, e);
            }}
            onPointerEnter={() => onRowEnter(i)}
            className={`group flex gap-2 items-center p-1.5 rounded border cursor-pointer ${
              isCurrent ? 'border-amber-400' : 'border-transparent'
            } ${isSelected ? 'bg-blue-50' : isCurrent ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
          >
            <input type="checkbox" aria-label={`검수 필요 #${i + 1} 선택`} checked={isSelected} onChange={() => onToggle(item.id)} />
            {/* 썸네일은 흐리게 표시해 검수 전 원본이 목록에서 그대로 보이지 않게 한다 */}
            <img src={item.url} alt="" draggable={false} className="w-14 h-9 object-cover rounded blur-sm shrink-0" />
            <span className="text-xs min-w-0 flex-1">
              <span className="text-amber-600 font-semibold">검수 필요 #{i + 1}</span>
              {item.masks.length > 0 && <span className="text-gray-400"> · 가림 {item.masks.length}</span>}
              {item.targets.length > 0 && <span className="text-blue-500"> · 버튼 {item.targets.length + 1}</span>}
              {item.annotations.length > 0 && <span className="text-red-400"> · 강조 {item.annotations.length}</span>}
              <span className="block text-gray-500 truncate">{item.instruction}</span>
            </span>
            <button
              type="button"
              aria-label={`검수 필요 #${i + 1} 버리기`}
              title="버리기 (Delete)"
              onClick={() => onDiscard(item.id)}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-400 hover:text-red-600 px-1"
            >
              🗑
            </button>
          </div>
        );
      })}
    </div>
  );
}
