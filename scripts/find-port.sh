#!/bin/bash

# Find an available port starting from the given port
# Usage: ./find-port.sh <start_port>

start_port=${1:-8000}
port=$start_port

while [ $port -lt $((start_port + 100)) ]; do
    if ! lsof -i:$port > /dev/null 2>&1 && ! netstat -tuln 2>/dev/null | grep -q ":$port "; then
        echo $port
        exit 0
    fi
    port=$((port + 1))
done

echo "No available port found in range $start_port-$((start_port + 100))" >&2
exit 1
