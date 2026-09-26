// 전역 입력 이벤트(마우스·키보드)를 WalkSim 동작으로 분류한다. 부수 효과가 없는 순수 로직이라 단위 테스트한다.
// 개인정보: 키 이벤트는 "글자 키였는지"와 단축키 조합 이름만 받는다. 어떤 글자를 쳤는지는 이 모듈에 들어오지 않는다.

export interface Point { x: number; y: number }

export type InputEvent =
  | { type: 'down'; id: number; t: number; x: number; y: number; button: number } // button: 1 왼쪽, 2 오른쪽, 3 가운데
  | { type: 'up'; id: number; t: number; x: number; y: number; button: number }
  | { type: 'wheel'; id: number; t: number; x: number; y: number; direction: 'up' | 'down' | 'left' | 'right' }
  | { type: 'key'; id: number; t: number; printable: boolean; combo: string | null; ends?: boolean };

// frameId: 이 동작의 "직전 화면"으로 쓸 프레임을 고정해 둔 이벤트 번호
export type DesktopAction =
  | { kind: 'click' | 'double' | 'right'; frameId: number; point: Point }
  | { kind: 'drag'; frameId: number; point: Point; to: Point }
  | { kind: 'type'; frameId: number; point: Point | null }
  | { kind: 'key'; frameId: number; keys: string }
  | { kind: 'scroll'; frameId: number; point: Point; direction: 'up' | 'down' | 'left' | 'right' };

export const DOUBLE_CLICK_MS = 400;
export const DOUBLE_CLICK_DIST = 8;
export const DRAG_DIST = 12;
export const SCROLL_BURST_MS = 800;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

type Down = Extract<InputEvent, { type: 'down' }>;

export class ActionClassifier {
  private down: { ev: Down; secondOf?: Down } | null = null;
  private click: { down: Down; upT: number } | null = null;
  private typing = false;
  private scroll: { lastT: number; direction: string } | null = null;

  /** 이 이벤트의 순간 화면을 미리 고정(pin)해 둘 필요가 있는지. 필요 없는 프레임은 인코딩하지 않는다. */
  needsFrame(ev: InputEvent): boolean {
    switch (ev.type) {
      case 'down': return true;
      case 'up': return false;
      case 'wheel': return !this.scroll || ev.t - this.scroll.lastT >= SCROLL_BURST_MS || this.scroll.direction !== ev.direction;
      case 'key': return ev.combo !== null || (ev.printable && !this.typing && !this.click);
    }
  }

  push(ev: InputEvent): DesktopAction[] {
    const out: DesktopAction[] = [];
    switch (ev.type) {
      case 'down': {
        this.scroll = null;
        this.typing = false;
        if (ev.button === 2) {
          this.flush(out);
          out.push({ kind: 'right', frameId: ev.id, point: { x: ev.x, y: ev.y } });
          break;
        }
        if (ev.button !== 1) { this.flush(out); break; }
        const c = this.click;
        if (c && ev.t - c.upT <= DOUBLE_CLICK_MS && dist(c.down, ev) <= DOUBLE_CLICK_DIST) {
          this.down = { ev, secondOf: c.down };
          this.click = null;
        } else {
          this.flush(out);
          this.down = { ev };
        }
        break;
      }
      case 'up': {
        const d = this.down;
        if (!d || ev.button !== 1) break;
        this.down = null;
        const from = d.secondOf ?? d.ev;
        if (dist(d.ev, ev) > DRAG_DIST) {
          out.push({ kind: 'drag', frameId: d.ev.id, point: { x: d.ev.x, y: d.ev.y }, to: { x: ev.x, y: ev.y } });
        } else if (d.secondOf) {
          out.push({ kind: 'double', frameId: from.id, point: { x: from.x, y: from.y } });
        } else {
          this.click = { down: d.ev, upT: ev.t };
        }
        break;
      }
      case 'wheel': {
        if (this.needsFrame(ev)) {
          this.flush(out);
          out.push({ kind: 'scroll', frameId: ev.id, point: { x: ev.x, y: ev.y }, direction: ev.direction });
        }
        this.scroll = { lastT: ev.t, direction: ev.direction };
        this.typing = false;
        break;
      }
      case 'key': {
        if (ev.combo) {
          this.flush(out);
          out.push({ kind: 'key', frameId: ev.id, keys: ev.combo });
          if (ev.ends) this.typing = false;
          break;
        }
        if (!ev.printable) {
          if (ev.ends) { this.flush(out); this.typing = false; } // Tab 등: 다른 칸으로 이동
          break;
        }
        if (this.typing || this.down) break;
        // 클릭 직후 글자를 치기 시작하면 그 클릭은 "입력칸에 입력하기"였다.
        if (this.click) {
          out.push({ kind: 'type', frameId: this.click.down.id, point: { x: this.click.down.x, y: this.click.down.y } });
          this.click = null;
        } else {
          out.push({ kind: 'type', frameId: ev.id, point: null });
        }
        this.typing = true;
        break;
      }
    }
    return out;
  }

  /** 녹화를 멈출 때 보류 중인 클릭을 내보낸다. */
  finish(): DesktopAction[] {
    const out: DesktopAction[] = [];
    this.flush(out);
    this.down = null;
    return out;
  }

  private flush(out: DesktopAction[]) {
    if (this.click) {
      out.push({ kind: 'click', frameId: this.click.down.id, point: { x: this.click.down.x, y: this.click.down.y } });
      this.click = null;
    }
  }
}
