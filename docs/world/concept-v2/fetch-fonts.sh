#!/bin/sh
# Fetches the concept's three fonts (Syncopate, Manrope, IBM Plex Mono) from github.com/google/fonts into fonts/,
# which git ignores. Google Fonts URLs are blocked in the workspace, so a sparse clone is used.
set -e
cd "$(dirname "$0")"
T=$(mktemp -d)
git clone -q --depth 1 --filter=blob:none --sparse https://github.com/google/fonts.git "$T"
git -C "$T" sparse-checkout set apache/syncopate ofl/manrope ofl/ibmplexmono
mkdir -p fonts
cp "$T"/apache/syncopate/Syncopate-Bold.ttf "$T"/apache/syncopate/Syncopate-Regular.ttf fonts/
cp "$T/ofl/manrope/Manrope[wght].ttf" fonts/Manrope-var.ttf
cp "$T"/ofl/ibmplexmono/IBMPlexMono-Medium.ttf "$T"/ofl/ibmplexmono/IBMPlexMono-Regular.ttf fonts/
rm -rf "$T"
