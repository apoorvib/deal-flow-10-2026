#!/usr/bin/env bash
# Downloads all images listed in manifest.json into ./hero and ./img
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p hero img
python3 -c 'import json;[print(i["url"],i["file"]) for i in json.load(open("manifest.json"))["images"]]' |
while read -r url file; do
  [ -f "$file" ] && { echo "skip $file"; continue; }
  echo "get  $file"; curl -fsSL "$url" -o "$file"
done
echo "Done."
