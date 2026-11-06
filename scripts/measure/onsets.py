import sys, subprocess, math, array, statistics
v, s, d = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
thr = float(sys.argv[4]) if len(sys.argv)>4 else 8
sr = 16000
raw = subprocess.run(["ffmpeg","-v","error","-ss",str(s),"-t",str(d),"-i",v,"-ac","1","-ar",str(sr),"-f","s16le","-"],capture_output=True).stdout
x = array.array('h'); x.frombytes(raw)
hop = int(sr*0.005)
env=[]; zcr=[]
for i in range(0,len(x)-hop,hop):
    seg=x[i:i+hop]
    env.append(math.sqrt(sum(a*a for a in seg)/hop)/32768)
    zcr.append(sum(1 for k in range(1,hop) if (seg[k]>=0)!=(seg[k-1]>=0))/hop*sr/2)
db=[20*math.log10(e+1e-9) for e in env]
on=[]
for i in range(4,len(db)):
    if db[i]-db[i-4] > thr and (not on or (i*0.005+s - on[-1]) > 0.03):
        on.append(i*0.005+s)
print("n onsets",len(on),"median dB %.1f max %.1f"%(statistics.median(db),max(db)))
print(" ".join(f"{t:.3f}" for t in on[:100]))
if len(on)>2:
    dd=[b-a for a,b in zip(on,on[1:])]; print("intervals median %.3f min %.3f max %.3f"%(statistics.median(dd),min(dd),max(dd)))
pk=max(range(len(db)),key=lambda i:db[i]); j=pk
while j<len(db)-1 and db[j]>db[pk]-20: j+=1
print("loudest at %.3f; decay to -20dB %d ms; ZCR-freq at peak ~%d Hz (brightness proxy)"%(s+pk*0.005,(j-pk)*5,zcr[pk]))
