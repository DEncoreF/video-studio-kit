#!/bin/bash
# Compare a draft with its rulers in numbers (video-draft-review references/review-scales.md §2): cuts, motion, stills, loudness.
#   bash scripts/film-metrics.sh renders/draft-4.mp4 /tmp/ruler-a.mp4 /tmp/ruler-b.mp4
# motion = mean absolute luma difference between frames at 480×270 (0–255); "big" = frames above 12; jerk = mean change of
# that difference frame to frame; still = runs below 0.15; hold = runs of 0.5 s+ below 0.6. Loudness: EBU R128 integrated,
# and the moments 5 LU or more above the median of the 1.5 s before (sudden loudness).
set -e
printf "%-34s %5s %5s %6s %6s %6s %7s %10s %7s %s\n" file sec cuts motion big% jerk still_s hold_avg/max LUFS "rises≥5LU"
for f in "$@"; do
  fps=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$f" | awk -F/ '{printf "%.3f", $1/($2?$2:1)}')
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  cuts=$(ffmpeg -nostdin -v error -i "$f" -vf "scale=320:-1,select='gte(scene,0)',metadata=print:key=lavfi.scene_score:file=-" -f null - 2>/dev/null | awk -F= '/scene_score/{if($2>0.3)n++} END{print n+0}')
  mot=$(ffmpeg -nostdin -v error -i "$f" -vf "scale=480:270,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null - 2>/dev/null | awk -F= -v fps="$fps" '/YAVG/{i++; v[i]=$2} END{n=i; s=0; for(j=1;j<=n;j++){s+=v[j]; if(v[j]>12)b++; if(v[j]<0.15){r++} else {if(r>m)m=r; r=0}; if(v[j]<0.6){c++} else {if(c>=fps/2){hn++; hs+=c; if(c>hm)hm=c}; c=0}} for(j=2;j<=n;j++){d=v[j]-v[j-1]; jk+=(d<0?-d:d)} printf "%.2f %.2f %.2f %.1f %.1f/%.1f", s/n, b/n*100, jk/(n-1), m/fps, (hn?hs/hn/fps:0), hm/fps}')
  loud=$(ffmpeg -nostdin -i "$f" -af ebur128 -f null - 2>&1 | awk '/M:/{for(i=1;i<=NF;i++){if($i=="t:")t=$(i+1); if($i=="M:")m=$(i+1)}; print t, m} /I:/{I=$2} END{print "I", I}' | python3 -c '
import sys, statistics
d=[]; I="?"
for l in sys.stdin:
    p=l.split()
    if p and p[0]=="I": I=p[1] if len(p)>1 else "—"; continue  # a silent file has no integrated loudness
    try: d.append((float(p[0]), float(p[1])))
    except: pass
r=[]
for t,m in d:
    prev=[x for tt,x in d if t-1.5<=tt<t and x>-70]
    if len(prev)>5 and m-statistics.median(prev)>=5: r.append(f"{t:.1f}")
print(I, ",".join(r[:8]) or "none")')
  read m b j st hold <<< "$mot"; read I rises <<< "$loud"
  printf "%-34s %5.1f %5s %6s %6s %6s %7s %10s %7s %s\n" "$(basename "$f")" "$dur" "$cuts" "$m" "$b" "$j" "$st" "$hold" "$I" "$rises"
done
