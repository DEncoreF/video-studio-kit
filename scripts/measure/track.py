# per-frame bbox of "non-background" pixels. args: video W H scale_div thr [x0 y0 x1 y1 crop in scaled px] 
import sys,subprocess,numpy as np
v=sys.argv[1]; W=int(sys.argv[2]); H=int(sys.argv[3]); dv=int(sys.argv[4]); thr=float(sys.argv[5])
w=W//dv; h=H//dv
raw=subprocess.run(['ffmpeg','-v','error','-i',v,'-vf',f'scale={w}:{h}','-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
fr=np.frombuffer(raw,np.uint8).reshape(-1,h,w).astype(np.int16)
if len(sys.argv)>9:
    x0,y0,x1,y1=map(int,sys.argv[6:10]); fr=fr[:,y0:y1,x0:x1]
out=[]
for f in fr:
    bg=np.median(np.r_[f[0],f[-1],f[:,0],f[:,-1]])
    m=np.abs(f-bg)>thr
    rows=np.where(m.sum(1)>=3)[0]; cols=np.where(m.sum(0)>=3)[0]
    if len(rows)==0: out.append((0,0,0,0,0)); continue
    out.append((cols[0],rows[0],cols[-1]-cols[0]+1,rows[-1]-rows[0]+1,int(m.sum())))
np.save(v+f'.track{dv}.npy',np.array(out))
for i,o in enumerate(out): print(i,*o)
