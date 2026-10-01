#!/bin/sh
# Restart the signing server after a crash. A stop signal ends the loop
# so `docker stop` is not followed by another start.
set -u

stop=0
child=0
delay=1

shutdown() {
  stop=1
  if [ "$child" -ne 0 ]; then
    kill -TERM "$child" 2>/dev/null || true
  fi
}

trap shutdown TERM INT

while [ "$stop" -eq 0 ]; do
  started=$(date +%s)
  "$@" &
  child=$!
  wait "$child"
  status=$?
  child=0

  if [ "$stop" -eq 1 ] || [ "$status" -eq 0 ]; then
    exit 0
  fi

  now=$(date +%s)
  if [ $((now - started)) -ge 60 ]; then
    delay=1
  fi

  echo "signing server exited with status ${status}; restarting in ${delay}s" >&2
  sleep "$delay" &
  child=$!
  wait "$child"
  child=0

  if [ "$stop" -eq 1 ]; then
    exit 0
  fi

  if [ "$delay" -lt 30 ]; then
    delay=$((delay * 2))
  fi
done

exit 0
