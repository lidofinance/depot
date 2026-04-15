#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: $0 <name: YYYY_MM_DD[_topic]> [network: mainnet|holesky]" >&2
  exit 1
fi

NAME="$1"
NETWORK="${2:-mainnet}"

case "$NETWORK" in
  mainnet|holesky) ;;
  *)
    echo "Invalid network: $NETWORK. Use mainnet or holesky." >&2
    exit 1
    ;;
esac

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
TARGET_DIR="$ROOT_DIR/omnibuses/$NAME"
TS_FILE="$TARGET_DIR/$NAME.ts"
MD_FILE="$TARGET_DIR/$NAME.md"

if [ -e "$TARGET_DIR" ]; then
  echo "Target directory already exists: $TARGET_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
cp "$ROOT_DIR/omnibuses/_omnibus_template/_omnibus_template.ts" "$TS_FILE"
cp "$ROOT_DIR/omnibuses/_omnibus_template/_omnibus_template.md" "$MD_FILE"

sed -i.bak "s/Omnibus Template/$NAME/g" "$MD_FILE"
sed -i.bak "s/network: \"mainnet\"/network: \"$NETWORK\"/" "$TS_FILE"
rm -f "$TS_FILE.bak" "$MD_FILE.bak"

echo "Omnibus created:"
echo "- $TS_FILE"
echo "- $MD_FILE"
echo "Next: implement contracts/calls/tests, then run: npm run omnibus:test -- $NAME"
