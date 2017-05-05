#!/usr/bin/env bash

set -eu

BASE_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
TMP_DIR=$(mktemp -d)
DEST="${TMP_DIR}/addon"

mkdir -p $DEST

# deletes the temp directory
function cleanup {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cp -rp step1-hybrid-addon/* $DEST

pushd $DEST
zip -r $DEST/addon.xpi *
mv addon.xpi $BASE_DIR
popd

