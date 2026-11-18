#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
project_dir="$PWD"
version="$(node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const manifest = JSON.parse(readFileSync("plugin.json", "utf8"));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  if (manifest.version !== pkg.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error("Plugin and package versions must match and use major.minor.patch");
  }
  console.log(manifest.version);
')"
stage_dir="$(mktemp -d)"
trap 'rm -rf "$stage_dir"' EXIT

mkdir -p "$project_dir/dist" "$stage_dir/plugin"
cp index.js plugin.json README.md CHANGELOG.md THIRD_PARTY_NOTICES.md "$stage_dir/plugin/"
cp -R locales "$stage_dir/plugin/"
chmod -R u=rwX,go=rX "$stage_dir/plugin"

archive="mygo-music-migu-$version.zip"
(cd "$stage_dir/plugin" && zip -q -X -r "$stage_dir/$archive" .)
mv "$stage_dir/$archive" "$project_dir/dist/$archive"
echo "dist/$archive"
