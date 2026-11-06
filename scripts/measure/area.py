import sys,subprocess,numpy as np
v=sys.argv[1]; W=int(sys.argv[2]); H=int(sys.argv[3]); a=int(sys.argv[4]); b=int(sys.argv[5]); lum=int(sys.argv[6]); minc=int(sys.argv[7])
raw=subprocess.run(['ffmpeg','-v','error','-i',v,'-vf',f'select=between(n\\,{a}\\,{b})','-vsync','0','-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
fr=np.frombuffer(raw,np.uint8).reshape(-1,H,W)
for i,f in enumerate(fr):
    m=f<lum; A=m.sum()
    rows=np.where(m.sum(1)>=minc)[0]; cols=np.where(m.sum(0)>=minc)[0]
    bb=(cols[0],rows[0],cols[-1]-cols[0]+1,rows[-1]-rows[0]+1) if len(rows) and len(cols) else (0,0,0,0)
    print(a+i, A, round(2*np.sqrt(A/np.pi)), *bb)
