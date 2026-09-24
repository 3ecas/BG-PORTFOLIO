#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# encode.sh — turn a master render into web-ready files for the portfolio.
#
#   tools/encode.sh <master-file> [slug]
#
# Creates, inside media/<slug>/ :
#   video.mp4    full clip for the project viewer (H.264, max 1920 on the long
#                edge, AAC audio if the master has sound, fast-start)
#   preview.mp4  short, silent, light loop for hover previews (960 long edge)
#   poster.jpg   still frame shown before anything plays
#
# Then prints a block you can paste into the `projects` list in content.js.
#
# Options (environment variables):
#   POSTER_AT=2.5       seconds into the clip for the poster frame   (default 2)
#   PREVIEW_START=4     where the hover preview starts, in seconds   (default 0)
#   PREVIEW_LEN=6       hover preview length in seconds              (default 6)
#   CRF=22              quality of video.mp4, lower = better/larger  (default 22)
#
# Examples:
#   tools/encode.sh ~/Renders/Halden_Ident_v12.mov signal-bloom
#   POSTER_AT=4 PREVIEW_START=3 tools/encode.sh renders/reel_2026.mp4
#   for f in renders/*.mov; do tools/encode.sh "$f"; done
#
# Needs ffmpeg + ffprobe (macOS: `brew install ffmpeg`, Windows: use Git Bash
# or WSL with ffmpeg installed).
# ---------------------------------------------------------------------------
set -euo pipefail

if [ $# -lt 1 ]; then
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

command -v ffmpeg >/dev/null || { echo "ffmpeg not found. Install it first (macOS: brew install ffmpeg)." >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found. It ships with ffmpeg." >&2; exit 1; }

IN="$1"
[ -f "$IN" ] || { echo "File not found: $IN" >&2; exit 1; }

# Slug: second argument, or the file name in lowercase-with-dashes.
BASE="$(basename "${IN%.*}")"
SLUG="${2:-$(echo "$BASE" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/media/$SLUG"
mkdir -p "$OUT"

POSTER_AT="${POSTER_AT:-2}"
PREVIEW_START="${PREVIEW_START:-0}"
PREVIEW_LEN="${PREVIEW_LEN:-6}"
CRF="${CRF:-22}"

probe() { ffprobe -v error -select_streams v:0 -show_entries "$1" -of default=nw=1:nk=1 "$IN" | head -n1; }
W="$(probe stream=width)"
H="$(probe stream=height)"
RATE="$(probe stream=r_frame_rate)"
DUR="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$IN" | head -n1)"
HAS_AUDIO="$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$IN" | head -n1 || true)"

FPS="$(awk -v r="$RATE" 'BEGIN { split(r, a, "/"); if (a[2] == 0 || a[2] == "") a[2] = 1; printf "%.3f", a[1] / a[2] }' | sed -E 's/\.?0+$//')"
SECS="$(awk -v d="$DUR" 'BEGIN { printf "%d", d + 0.5 }')"
DURATION="$(awk -v s="$SECS" 'BEGIN { printf "%d:%02d", s / 60, s % 60 }')"

# Orientation decides which edge gets capped.
if [ "$W" -ge "$H" ]; then
  FORMAT="16:9"; [ $((W * 9)) -ne $((H * 16)) ] && FORMAT="${W}:${H}"
  FIT_FULL="scale='min(1920,iw)':-2"
  FIT_PREVIEW="scale='min(960,iw)':-2"
  FIT_POSTER="scale='min(1600,iw)':-2"
else
  FORMAT="9:16"; [ $((W * 16)) -ne $((H * 9)) ] && FORMAT="${W}:${H}"
  FIT_FULL="scale=-2:'min(1920,ih)'"
  FIT_PREVIEW="scale=-2:'min(960,ih)'"
  FIT_POSTER="scale=-2:'min(1600,ih)'"
fi

echo "→ $BASE  ${W}×${H}  ${FPS} fps  ${DURATION}  (slug: $SLUG)"

AUDIO_ARGS=(-an)
[ -n "$HAS_AUDIO" ] && AUDIO_ARGS=(-c:a aac -b:a 160k)

echo "  video.mp4"
ffmpeg -hide_banner -loglevel error -y -i "$IN" \
  -vf "$FIT_FULL,format=yuv420p" \
  -c:v libx264 -preset slow -crf "$CRF" -profile:v high -movflags +faststart \
  "${AUDIO_ARGS[@]}" "$OUT/video.mp4"

echo "  preview.mp4"
ffmpeg -hide_banner -loglevel error -y -ss "$PREVIEW_START" -t "$PREVIEW_LEN" -i "$IN" \
  -vf "$FIT_PREVIEW,format=yuv420p" \
  -c:v libx264 -preset slow -crf 28 -profile:v high -movflags +faststart -an \
  "$OUT/preview.mp4"

echo "  poster.jpg"
ffmpeg -hide_banner -loglevel error -y -ss "$POSTER_AT" -i "$IN" -frames:v 1 \
  -vf "$FIT_POSTER" -q:v 3 "$OUT/poster.jpg"

# Dominant color for the loading background: average of a 1×1 downscale.
COLOR="$(ffmpeg -hide_banner -loglevel error -i "$OUT/poster.jpg" -vf scale=1:1 -f rawvideo -pix_fmt rgb24 - | od -An -tx1 | tr -d ' \n' | head -c 6)"

TITLE="$(echo "$BASE" | sed -E 's/[_-]+/ /g; s/ v?[0-9]+$//')"
SIZE="$(du -h "$OUT/video.mp4" | cut -f1)"
echo "  done: media/$SLUG ($SIZE)"
echo
cat <<SNIPPET
    {
      slug: "$SLUG",
      title: "$TITLE",
      client: "",
      year: $(date +%Y),
      format: "$FORMAT",
      categories: [],
      video: "media/$SLUG/video.mp4",
      preview: "media/$SLUG/preview.mp4",
      poster: "media/$SLUG/poster.jpg",
      duration: "$DURATION",
      fps: $FPS,
      color: "#$COLOR",
      summary: "",
      description: [""],
      role: "",
      tools: [],
      credits: []
    },
SNIPPET
