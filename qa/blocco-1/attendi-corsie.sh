#!/bin/bash
# Attende che le corsie abbiano tutte le modifiche, o che nessuna avanzi per 45 minuti.
cd /Users/tommasorovini/Sites/Acceleriamo/acceleriamo-os
need_a="3 4 6 7 12"; need_b="10 11 12 13 14 15 16 17"; need_c="18 19 20 21 22"; need_d="5 8 9"
last=""; still=0
while true; do
  ok=1; stato=""
  for c in a b c d; do
    eval need=\$need_$c
    have=$(git log --format=%s 7248fe5..blocco1-corsia-$c | grep -o 'modifica [0-9]*' | awk '{print $2}' | sort -n | tr '\n' ' ')
    stato="$stato $c:[$have]"
    for n in $need; do echo " $have " | grep -q " $n " || ok=0; done
  done
  [ $ok = 1 ] && { echo "TUTTE CHIUSE $stato"; exit 0; }
  if [ "$stato" = "$last" ]; then still=$((still+1)); else still=0; last="$stato"; fi
  [ $still -ge 9 ] && { echo "FERME DA 45 MINUTI $stato"; exit 0; }
  sleep 300
done
