import sys, time, os
import wave
import numpy as np
from faster_whisper import WhisperModel


def read_wav(path):
    with wave.open(path, "rb") as w:
        assert w.getframerate() == 16000, w.getframerate()
        assert w.getnchannels() == 1
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


audio = sys.argv[1]
if audio.lower().endswith(".wav"):
    audio = read_wav(audio)
model_size = sys.argv[2] if len(sys.argv) > 2 else "small"
out = sys.argv[3] if len(sys.argv) > 3 else None

t0 = time.time()
model = WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=16,
                     download_root=os.path.expanduser("~/.cache/whisper-models"))
print(f"[load] {model_size} {time.time()-t0:.1f}s", flush=True)

t1 = time.time()
segments, info = model.transcribe(
    audio, language="zh", beam_size=5, vad_filter=True,
    vad_parameters=dict(min_silence_duration_ms=500),
    condition_on_previous_text=False,
    initial_prompt="以下是一场关于软件项目需求与实施的普通话会议对话，涉及招投标、评标、档案归档、系统功能、字段、接口、任务分工等内容。",
)
lines = []
total = 0.0
for s in segments:
    total = s.end
    mm, ss = divmod(int(s.start), 60)
    lines.append(f"[{mm:02d}:{ss:02d}] {s.text.strip()}")
    if len(lines) % 20 == 0:
        print(f"... {s.end/60:.1f}min elapsed audio, {time.time()-t1:.0f}s wall", flush=True)

el = time.time() - t1
print(f"[done] audio={total/60:.1f}min wall={el:.0f}s rtf={el/max(total,1):.2f}", flush=True)

if out:
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"written {out} lines={len(lines)}", flush=True)
else:
    print("\n".join(lines[:40]))
