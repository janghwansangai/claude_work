"""한국어 더빙: Supertonic-3(내 컴퓨터에서 도는 무료 음성 모델), 목소리 F1.
읽기 좋게 고친 문장(영문·기호 발음)을 넣고, 앞뒤 무음을 다듬어 audio/<장면>_<줄>.wav 로 저장한다."""
import json, os, subprocess, sys, wave
from supertonic import TTS

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = sys.argv[1] if len(sys.argv) > 1 else 'F1'
SAY = {'ZIP': '집', 'Cloudflare': '클라우드플레어', '‘': '', '’': '', ',': ', '}

def speakable(s):
    for a, b in SAY.items():
        s = s.replace(a, b)
    return ' '.join(s.split())

t = TTS(model='supertonic-3')
style = t.get_voice_style(VOICE)
script = json.load(open(os.path.join(HERE, 'script.json'), encoding='utf-8'))
out = os.path.join(HERE, 'audio'); os.makedirs(out, exist_ok=True)
durs = {'voice': f'supertonic-3/{VOICE}'}
for s in script['scenes']:
    for i, line in enumerate(s['lines']):
        key = f"{s['id']}_{i}"
        raw = os.path.join(out, key + '.raw.wav'); path = os.path.join(out, key + '.wav')
        wav, _ = t.synthesize(speakable(line), style, total_steps=32, speed=1.0, lang='ko')
        t.save_audio(wav, raw)
        # 앞뒤 무음 다듬기(앞 0.05초, 뒤 0.12초만 남김) + 48kHz
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af',
                        'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.12,areverse,aresample=48000',
                        path], check=True)
        os.remove(raw)
        with wave.open(path) as w:
            durs[key] = w.getnframes() / w.getframerate()
        print(f'{key}\t{durs[key]:.2f}s\t{speakable(line)}', flush=True)
json.dump(durs, open(os.path.join(out, 'durations.json'), 'w'), ensure_ascii=False, indent=1)
