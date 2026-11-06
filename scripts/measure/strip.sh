#!/bin/bash
# strip.sh video start_sec duration_sec out.jpg [cols] [step]  -> consecutive frames tiled (every `step` frame)
v="$1"; s="$2"; d="$3"; o="$4"; c="${5:-8}"; st="${6:-1}"
n=$(ffmpeg -hide_banner -ss "$s" -t "$d" -i "$v" -map 0:v -f null - 2>&1 | grep -o "frame= *[0-9]*" | tail -1 | grep -o "[0-9]*")
n=$(( (n + st - 1) / st )); r=$(( (n + c - 1) / c ))
ffmpeg -hide_banner -loglevel error -ss "$s" -t "$d" -i "$v" -vf "select='not(mod(n,$st))',scale=240:-1,drawtext=text='%{pts\:hms}':x=3:y=3:fontsize=14:fontcolor=yellow:box=1:boxcolor=black,tile=${c}x${r}" -frames:v 1 -fps_mode vfr -y "$o"
echo "$o frames=$n"
