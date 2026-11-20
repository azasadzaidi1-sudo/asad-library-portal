#!/bin/sh
# Builds the app icons from shelf.svg.tmpl. Run from this folder: sh make_icons.sh
# Needs rsvg-convert (librsvg). Output goes to ../../public.
set -e
OUT=../../public
rounded='<rect width="140" height="140" rx="28" fill="#213F33"/>'
square='<rect width="140" height="140" fill="#213F33"/>'
centre='translate(0 -1.5)'
# Maskable icons: Android crops them to a circle or squircle, so the shelf is shrunk
# to stay inside the central safe zone (a circle 80% of the icon's width).
small='translate(70 70) scale(0.82) translate(-70 -71.5)'

fill() { sed -e "s|BACKGROUND|$1|" -e "s|TRANSFORM|$2|" shelf.svg.tmpl; }

fill "$rounded" "$centre" > "$OUT/favicon.svg"
fill "$rounded" "$centre" > /tmp/icon-any.svg
fill "$square" "$small" > /tmp/icon-maskable.svg
fill "$square" "$centre" > /tmp/icon-apple.svg

rsvg-convert -w 192 -h 192 /tmp/icon-any.svg -o "$OUT/icons/icon-192.png"
rsvg-convert -w 512 -h 512 /tmp/icon-any.svg -o "$OUT/icons/icon-512.png"
rsvg-convert -w 192 -h 192 /tmp/icon-maskable.svg -o "$OUT/icons/maskable-192.png"
rsvg-convert -w 512 -h 512 /tmp/icon-maskable.svg -o "$OUT/icons/maskable-512.png"
# iPhones round the corners themselves and show transparent corners as black.
rsvg-convert -w 180 -h 180 /tmp/icon-apple.svg -o "$OUT/apple-touch-icon.png"
