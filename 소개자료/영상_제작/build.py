"""영상 편집: 촬영본(raw/*.mkv) + 제목 카드 + 더빙(audio/*.wav) + 자막 → 1080p H.264 MP4.
더빙 파일이 없으면 낭독 길이를 어림잡아 자막만 있는 초안을 만든다.
사용: python3 build.py [출력.mp4]
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
J = lambda *p: os.path.join(HERE, *p)
OUT = sys.argv[1] if len(sys.argv) > 1 else J('out', 'final.mp4')
FPS = 30
LEAD, GAP, TAIL = 0.45, 0.38, 0.75   # 장면 시작 전 쉼, 문장 사이 쉼, 장면 끝 여유(초)

script = json.load(open(J('script.json'), encoding='utf-8'))
dur_file = J('audio', 'durations.json')
durs = json.load(open(dur_file)) if os.path.exists(dur_file) else {}
has_voice = bool(durs)
marks = {n: json.load(open(J('raw', f'{n}.marks.json'))) for n in ('runA', 'runB')}
overlays = json.load(open(J('raw', 'overlays.json')))


def est(line):
    return sum(1 for c in line if c not in ' .,·‘’\'!?') / 6.3 + 0.3


def run(args):
    print('$', ' '.join(a if len(a) < 80 else a[:77] + '…' for a in args))
    subprocess.run(args, check=True)


# 장면별 원본 구간
src = {}
for name, ms in marks.items():
    for a, b in zip(ms, ms[1:]):
        if a['id'].startswith('s'):
            src[a['id']] = (name, a['t'], b['t'])
CARDS = {'s01_intro': J('cards', 'intro.png'), 's13_outro': J('cards', 'outro.png')}

os.makedirs(J('build'), exist_ok=True); os.makedirs(os.path.dirname(OUT), exist_ok=True)
timeline, subs, audio_items, boxes = [], [], [], []
t_global = 0.0
for s in script['scenes']:
    sid = s['id']
    lines = [(i, l, durs.get(f'{sid}_{i}', est(l))) for i, l in enumerate(s['lines'])]
    aud_len = LEAD + sum(d for _, _, d in lines) + GAP * (len(lines) - 1) + TAIL
    if sid in CARDS:
        L = aud_len + (0.4 if sid == 's01_intro' else 1.2)
        seg = J('build', f'{sid}.mkv')
        # 제목 카드: 아주 천천히 다가가는 움직임
        run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-framerate', str(FPS), '-t', f'{L:.3f}', '-i', CARDS[sid],
             '-vf', f"scale=w='trunc(1920*(1+0.035*t/{L:.3f})/2)*2':h=-2:eval=frame,crop=1920:1080,format=yuv444p",
             '-r', str(FPS), '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', seg])
    else:
        name, a, b = src[sid]
        seg_len = b - a
        # 조작이 낭독보다 많이 길면 조금 빠르게(최대 1.5배) 재생해 빈 시간을 줄인다
        f = min(1.5, seg_len / (aud_len + 0.6)) if seg_len > aud_len * 1.3 else 1.0
        L = max(seg_len / f, aud_len)
        print(f'{sid}: 촬영 {seg_len:.1f}s, 낭독 {aud_len:.1f}s, 속도 x{f:.2f} → {L:.1f}s')
        seg = J('build', f'{sid}.mkv')
        run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{a:.3f}', '-t', f'{seg_len:.3f}', '-i', J('raw', f'{name}.mkv'),
             '-vf', f'setpts=(PTS-STARTPTS)/{f:.4f},tpad=stop_mode=clone:stop_duration={max(0, L - seg_len / f) + 0.1:.3f},trim=duration={L:.3f},setpts=PTS-STARTPTS,fps={FPS}',
             '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', '-pix_fmt', 'yuv444p', seg])
        for o in overlays:
            if o['name'] == name and a <= o['t'] < b:
                st = t_global + (o['t'] - a) / f
                boxes.append((st, st + (o['d'] + 0.25) / f, o['x'], o['y'], o['w'], o['h']))
    # 낭독·자막 시각
    t = t_global + LEAD
    for i, line, d in lines:
        subs.append((t, t + d, line))
        audio_items.append((t, J('audio', f'{sid}_{i}.wav')))
        t += d + GAP
    timeline.append((seg, L))
    t_global += L
total = t_global
print(f'총 길이 {total:.1f}초 ({int(round(total)) // 60}분 {int(round(total)) % 60}초), 더빙 {"있음" if has_voice else "없음(자막 초안)"}')

# 1) 이어 붙이기
with open(J('build', 'concat.txt'), 'w') as f:
    for seg, _ in timeline:
        f.write(f"file '{seg}'\n")
run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', J('build', 'concat.txt'), '-c', 'copy', J('build', 'joined.mkv')])

# 2) 자막(ASS) — 화면 아래 반투명 상자, Pretendard
def ts(x):
    h, m, s = int(x // 3600), int(x % 3600 // 60), x % 60
    return f'{h}:{m:02d}:{s:05.2f}'
ass = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080', 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
       '[V4+ Styles]',
       'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
       'Style: Sub,Pretendard SemiBold,46,&H00FFFFFF,&H00FFFFFF,&H38141414,&H38141414,0,0,0,0,100,100,0,0,3,16,0,2,240,240,44,1', '',
       '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
for a, b, line in subs:
    ass.append(f'Dialogue: 0,{ts(a)},{ts(b + 0.15)},Sub,,0,0,0,,{line}')
open(J('build', 'subs.ass'), 'w', encoding='utf-8').write('\n'.join(ass) + '\n')
with open(os.path.splitext(OUT)[0] + '.srt', 'w', encoding='utf-8') as f:
    for n, (a, b, line) in enumerate(subs, 1):
        st = lambda x: f'{int(x // 3600):02d}:{int(x % 3600 // 60):02d}:{int(x % 60):02d},{int(round(x % 1 * 1000)) % 1000:03d}'
        f.write(f'{n}\n{st(a)} --> {st(b + 0.15)}\n{line}\n\n')

# 3) 오디오: 문장별 음성을 제 시각에 놓고 음량을 맞춘다
aud = J('build', 'voice.wav')
items = [(t, p) for t, p in audio_items if os.path.exists(p)]
if items:
    args = ['ffmpeg', '-y', '-loglevel', 'error']
    for _, p in items:
        args += ['-i', p]
    chains = [f'[{k}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay={int(t * 1000)}|{int(t * 1000)}[a{k}]' for k, (t, _) in enumerate(items)]
    mix = ''.join(f'[a{k}]' for k in range(len(items))) + f'amix=inputs={len(items)}:normalize=0:dropout_transition=0,apad,atrim=0:{total:.3f},loudnorm=I=-16:TP=-1.5:LRA=7[out]'
    run(args + ['-filter_complex', ';'.join(chains + [mix]), '-map', '[out]', '-ar', '48000', aud])
else:
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', f'{total:.3f}', aud])

# 4) 최종: 강조 상자 + 자막 + 처음·끝 페이드 → H.264 고화질
vf = []
for a, b, x, y, w, h in boxes:
    vf.append(f"drawbox=x={x - 7:.0f}:y={y - 7:.0f}:w={w + 14:.0f}:h={h + 14:.0f}:color=0xFF3B30@0.95:t=5:enable='between(t,{a:.2f},{b:.2f})'")
vf.append(f"subtitles='{J('build', 'subs.ass')}':fontsdir='{os.path.expanduser('~/.fonts')}'")
vf.append(f'fade=t=in:st=0:d=0.6,fade=t=out:st={total - 1.0:.2f}:d=1.0,format=yuv420p')
run(['ffmpeg', '-y', '-loglevel', 'error', '-i', J('build', 'joined.mkv'), '-i', aud, '-vf', ','.join(vf),
     '-af', f'afade=t=out:st={total - 1.0:.2f}:d=1.0',
     '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-g', '60', '-r', str(FPS),
     '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', OUT])
print('완성:', OUT)
