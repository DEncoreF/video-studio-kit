import sys, subprocess, math, array
v,s,d=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]); hp=sys.argv[4] if len(sys.argv)>4 else "3000"
sr=16000
raw=subprocess.run(["ffmpeg","-v","error","-ss",str(s),"-t",str(d),"-i",v,"-ac","1","-af",f"highpass=f={hp}","-ar",str(sr),"-f","s16le","-"],capture_output=True).stdout
x=array.array('h');x.frombytes(raw)
hop=int(sr*0.002)
env=[math.sqrt(sum(a*a for a in x[i:i+hop])/hop) for i in range(0,len(x)-hop,hop)]
m=sum(env)/len(env); e=[a-m for a in env]
n=len(e); var=sum(a*a for a in e)
best=[]
for lag in range(10,400):  # 20ms..800ms
    r=sum(e[i]*e[i+lag] for i in range(n-lag))/var
    best.append((r,lag))
top=sorted(best,reverse=True)[:6]
print("autocorr peaks (r, period ms):",[(round(r,3),lag*2) for r,lag in top])
