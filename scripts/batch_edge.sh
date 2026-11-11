#!/bin/bash
cd /home/user/Doubao/chats/38452287399745794/work/voice
mkdir -p out2
n=0; fail=0
while IFS=$'\t' read -r fn ch; do
  [ -z "$fn" ] && continue
  edge-tts --voice zh-CN-XiaoyiNeural --rate=-20% --text "$ch" --write-media "out2/$fn" 2>/dev/null
  if [ ! -s "out2/$fn" ]; then echo "FAIL $fn $ch"; fail=$((fail+1)); fi
  n=$((n+1))
  [ $((n%30)) -eq 0 ] && echo "done $n / 138"
done < jobs.tsv
echo "TOTAL $n FAIL $fail"
