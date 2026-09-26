interface WalksimUI {
  platform: string;
  on(channel: string, cb: (...args: any[]) => void): void;
  send(channel: string, ...args: unknown[]): void;
  finishOverlay(region: { x: number; y: number; width: number; height: number } | null): Promise<void>;
}
declare const walksimUI: WalksimUI;
