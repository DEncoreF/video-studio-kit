#!/bin/bash
# sheet.sh video start_sec dur_sec step_frames out.jpg [crop] [cols] [tilew]
v=$1; s=$2; d=$3; st=$4; o=$5; crop=${6:-}; cols=${7:-6}; tw=${8:-240}
f="select='not(mod(n\,$st))'"
[ -n "$crop" ] && f="crop=$crop,$f"
n=$(python3 -c "import math;print(math.ceil($d*60/$st))"); rows=$(( (n+cols-1)/cols ))
ffmpeg -v error -y -ss $s -t $d -i "$v" -vf "$f,scale=$tw:-1,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='%{eif\:n*$st+$s*60\:d}':x=4:y=4:fontsize=16:fontcolor=red:box=1:boxcolor=white@0.7,tile=${cols}x${rows}:padding=2" -frames:v 1 -update 1 "$o"
