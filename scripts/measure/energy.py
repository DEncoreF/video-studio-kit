import sys,subprocess,numpy as np
v=sys.argv[1]; W=int(sys.argv[2]); H=int(sys.argv[3]); fps=float(sys.argv[4])
w=W//4; h=H//4
raw=subprocess.run(['ffmpeg','-v','error','-i',v,'-vf',f'scale={w}:{h}','-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
fr=np.frombuffer(raw,np.uint8).reshape(-1,h,w).astype(np.float32)
d=np.abs(np.diff(fr,axis=0)).mean(axis=(1,2))
np.save(v+'.energy.npy',d)
# cuts: spike > 8x median of neighbours and > 6
cuts=[]
for i in range(len(d)):
    nb=np.r_[d[max(0,i-6):i],d[i+1:i+7]]
    if d[i]>6 and d[i]>5*max(np.median(nb),0.3): cuts.append((i+1,round((i+1)/fps,3),round(float(d[i]),1)))
print('frames',len(fr),'cuts(frame,t,diff):',cuts)
# stills: runs with diff<0.15
still=d<0.15; runs=[];s=None
for i,x in enumerate(still):
    if x and s is None: s=i
    if (not x or i==len(still)-1) and s is not None:
        e=i; 
        if e-s>=6: runs.append((round(s/fps,2),round((e-s)/fps,2)))
        s=None
runs.sort(key=lambda r:-r[1]); print('longest stills (start,dur):',runs[:6])
# energy per 0.25 s for overview
step=int(round(fps/4))
print('energy/0.25s:',' '.join(f'{d[i:i+step].mean():.1f}' for i in range(0,len(d),step)))
