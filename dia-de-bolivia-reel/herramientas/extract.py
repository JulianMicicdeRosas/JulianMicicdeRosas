"""Extrae cada plano del EDL desde el original HLG → Rec.709 (base técnica), con cámara lenta interpolada."""
import os, subprocess, sys, json
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edl
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(S, "shots"); os.makedirs(OUT, exist_ok=True)
TM = ("zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,"
      "tonemap=mobius:param=0.3:desat=0,zscale=t=bt709:m=bt709:r=pc")
def job(s):
    out = os.path.join(OUT, f'{s["idx"]:02d}.mkv')
    n = s["n"]
    if s["speed"] < 1:
        vf = (f"{TM},format=yuv444p,fps=30,setpts=PTS/{s['speed']},"
              f"minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,format=rgb24")
    else:
        vf = f"{TM},format=rgb24,fps=30"
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f'{s["tin"]:.3f}', "-i",
           os.path.join(S, "album/vids", s["src"] + ".mov"), "-frames:v", str(n), "-vf", vf,
           "-c:v", "libx264rgb", "-crf", "6", "-preset", "fast", "-an", out]
    subprocess.run(cmd, check=True)
    got = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_entries", "stream=nb_read_frames",
                          "-of", "csv=p=0", out], capture_output=True, text=True).stdout.strip().strip(",")
    return s["idx"], n, int(got)
shots = edl.shots_with_frames()
only = set(int(a) for a in sys.argv[1:]) if len(sys.argv) > 1 else None
todo = [s for s in shots if not only or s["idx"] in only]
with ThreadPoolExecutor(3) as ex:
    for idx, n, got in ex.map(job, todo):
        print(idx, n, got, "OK" if n == got else "FALTAN FRAMES", flush=True)
