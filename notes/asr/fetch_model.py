import os
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
from huggingface_hub import snapshot_download

for repo, dest in [
    ("Systran/faster-whisper-medium", r"D:/AI/0、公司内部项目/项目归档工具/notes/asr/models/medium"),
]:
    p = snapshot_download(repo_id=repo, local_dir=dest, allow_patterns=[
        "config.json", "model.bin", "tokenizer.json", "vocabulary.*", "preprocessor_config.json"])
    print("OK", p, flush=True)
    for f in os.listdir(dest):
        print(" ", f, os.path.getsize(os.path.join(dest, f)))
