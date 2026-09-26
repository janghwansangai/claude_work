export type PlayMode = 'guide' | 'practice' | 'assessment';

export const MODES: Record<PlayMode, { label: string; description: string }> = {
  guide: { label: '안내 모드', description: '누를 곳이 반짝이며 한 단계씩 따라 합니다.' },
  practice: { label: '연습 모드', description: '스스로 찾아 누릅니다. 두 번 틀리면 힌트, 세 번 틀리면 위치를 알려 줍니다.' },
  assessment: { label: '평가 모드', description: '힌트 없이 끝까지 스스로 해결합니다. 결과는 이 기기에서만 보입니다.' },
};

export function parseMode(value: string | null | undefined): PlayMode | null {
  return value === 'guide' || value === 'practice' || value === 'assessment' ? value : null;
}
