import sys, wave, struct, math

if len(sys.argv) != 2:
    raise SystemExit("usage: audio_probe.py sample.wav")
path=sys.argv[1]
with wave.open(path,'rb') as w:
    channels=w.getnchannels()
    width=w.getsampwidth()
    rate=w.getframerate()
    n=w.getnframes()
    raw=w.readframes(n)
if width != 2:
    raise SystemExit(f"unsupported sample width {width}")
vals=struct.unpack('<'+'h'*(len(raw)//2), raw)
if channels > 1:
    vals=vals[::channels]
if len(vals) < 100:
    raise SystemExit("too few samples")
trim=[x for x in vals if abs(x) > 200]
if len(trim) < 100:
    print("0.0")
    raise SystemExit(0)
cross=0
prev=trim[0]
for x in trim[1:]:
    if (prev < 0 <= x) or (prev >= 0 > x):
        cross += 1
    prev=x
duration=len(vals)/float(rate)
freq=cross/(2.0*duration) if duration else 0.0
print(f"{freq:.3f}")
