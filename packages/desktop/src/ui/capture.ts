// 화면 스트림을 받아 최근 몇 장의 프레임을 메모리에만 보관한다(약 2.4초).
// 동작이 일어나면 그 "직전" 프레임을 JPEG로 만들어 넘긴다. 디스크에는 아무것도 쓰지 않는다.
import { cropForDisplay, type RectDip } from '../recorder/geometry';

const GRAB_MS = 200;
const MAX_FRAMES = 12;
const frames: { t: number; bmp: ImageBitmap }[] = [];
let video: HTMLVideoElement | null = null;
let crop = { sx: 0, sy: 0, sw: 0, sh: 0 };

const reply = (id: number, value: unknown) => walksimUI.send('ui:reply', id, value);

async function grab() {
  if (!video || video.readyState < 2 || crop.sw <= 0) return;
  const bmp = await createImageBitmap(video, crop.sx, crop.sy, crop.sw, crop.sh);
  frames.push({ t: Date.now(), bmp });
  while (frames.length > MAX_FRAMES) frames.shift()!.bmp.close();
}

async function encode(bmp: ImageBitmap): Promise<string> {
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

walksimUI.on('cap:start', async (id: number, args: { sourceId: string; display: RectDip; scale: number; region: RectDip }) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: args.sourceId,
          maxWidth: Math.round(args.display.width * args.scale),
          maxHeight: Math.round(args.display.height * args.scale),
          maxFrameRate: 10,
        },
      },
    } as unknown as MediaStreamConstraints);
    video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    for (let i = 0; i < 50 && video.videoWidth === 0; i++) await new Promise(r => setTimeout(r, 100));
    crop = cropForDisplay(args.region, args.display, video.videoWidth, video.videoHeight);
    await grab();
    setInterval(() => { void grab(); }, GRAB_MS);
    reply(id, { ok: true });
  } catch (err) {
    reply(id, { ok: false, error: `화면 스트림을 열 수 없습니다: ${(err as Error).message}` });
  }
});

// 이벤트 시각 t 직전의 프레임
walksimUI.on('cap:pin', async (id: number, args: { t: number }) => {
  const before = [...frames].reverse().find(f => f.t <= args.t - 30) ?? frames[0];
  reply(id, before ? await encode(before.bmp) : null);
});

// 지금 화면(녹화 종료 화면)
walksimUI.on('cap:now', async (id: number) => {
  await grab();
  const last = frames[frames.length - 1];
  reply(id, last ? await encode(last.bmp) : null);
});
