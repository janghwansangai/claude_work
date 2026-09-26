// Windows UI Automation: 클릭한 지점의 요소(버튼·입력칸 등) 상자와 이름을 알아낸다.
// 별도 네이티브 모듈 없이 Windows에 기본 포함된 PowerShell + .NET UIAutomationClient를 상주 프로세스로 사용한다.
// macOS·Linux에서는 사용하지 않는다(null 반환 → 클릭 지점 중심의 기본 상자 사용).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export interface ElementInfo {
  x: number; y: number; width: number; height: number; // 물리 픽셀(Windows 화면 좌표)
  name: string;
  isPassword: boolean;
  controlType: string;
}

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v); }'
[void][Dpi]::SetProcessDpiAwarenessContext([IntPtr]::new(-4))
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $p = $line.Split(' ')
  try {
    $el = [System.Windows.Automation.AutomationElement]::FromPoint((New-Object System.Windows.Point([double]$p[1], [double]$p[2])))
    $c = $el.Current
    $r = $c.BoundingRectangle
    $o = @{ id = $p[0]; x = $r.X; y = $r.Y; w = $r.Width; h = $r.Height; name = [string]$c.Name; pw = [bool]$c.IsPassword; type = [string]$c.ControlType.ProgrammaticName }
    [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress))
  } catch {
    [Console]::Out.WriteLine((@{ id = $p[0]; error = $true } | ConvertTo-Json -Compress))
  }
}
`;

export class UiAutomation {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, (info: ElementInfo | null) => void>();
  private buffer = '';
  private seq = 0;

  constructor(private readonly enabled = process.platform === 'win32') {}

  start() {
    if (!this.enabled || this.proc) return;
    try {
      // 스크립트는 -EncodedCommand(UTF-16LE base64)로 넘기고, 표준입력은 요청 전용으로 쓴다.
      const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true });
    } catch {
      this.proc = null;
      return;
    }
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      let nl: number;
      while ((nl = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (!line.startsWith('{')) continue;
        try {
          const o = JSON.parse(line);
          const resolve = this.pending.get(String(o.id));
          if (!resolve) continue;
          this.pending.delete(String(o.id));
          resolve(o.error || !(o.w > 0) ? null : { x: o.x, y: o.y, width: o.w, height: o.h, name: o.name ?? '', isPassword: !!o.pw, controlType: String(o.type ?? '').replace('ControlType.', '') });
        } catch { /* 무시 */ }
      }
    });
    this.proc.on('exit', () => {
      this.proc = null;
      for (const resolve of this.pending.values()) resolve(null);
      this.pending.clear();
    });
  }

  /** 물리 픽셀 좌표의 요소 정보. 400ms 안에 답이 없으면 null. */
  elementAt(x: number, y: number): Promise<ElementInfo | null> {
    if (!this.proc) return Promise.resolve(null);
    const id = String(++this.seq);
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve(null); }, 400);
      this.pending.set(id, info => { clearTimeout(timer); resolve(info); });
      this.proc!.stdin.write(`${id} ${Math.round(x)} ${Math.round(y)}\n`);
    });
  }

  stop() {
    this.proc?.stdin.end();
    this.proc?.kill();
    this.proc = null;
  }
}
