#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# encode.sh: turn your master renders into web-ready files for the portfolio.
#
#   tools/encode.sh "<folder of videos>"         encode every video in a folder
#   tools/encode.sh <video> [<video> ...]         encode specific files
#   tools/encode.sh <video> <slug>                one file, with the link name you choose
#
# For each video it creates media/<slug>/ with:
#   video.mp4    full clip for the project viewer (H.264, max 1920 on the long
#                edge, AAC audio if the master has sound, starts streaming fast)
#   preview.mp4  short, silent, light loop for hover previews (960 long edge)
#   poster.jpg   still frame shown before anything plays
#
# Every project block for content.js is printed and also collected in
# tools/new-projects.txt, ready to paste into the `projects` list.
# Videos that were already encoded are skipped (set FORCE=1 to redo them).
#
# Options (environment variables, put them before the command):
#   POSTER_AT=2.5       seconds into the clip for the poster frame   (default 2)
#   PREVIEW_START=4     where the hover preview starts, in seconds   (default 0)
#   PREVIEW_LEN=6       hover preview length in seconds              (default 6)
#   CRF=20              quality of video.mp4, lower = better/larger  (default 22)
#   FORCE=1             re-encode videos that already exist in media/
#
# Examples:
#   tools/encode.sh ~/Desktop/"videos portfolio"
#   tools/encode.sh ~/Renders/Halden_Ident_v12.mov signal-bloom
#   POSTER_AT=4 PREVIEW_START=3 tools/encode.sh renders/reel_2026.mp4
#
# Needs ffmpeg + ffprobe. macOS: `brew install ffmpeg`. Windows: install
# ffmpeg (`winget install Gyan.FFmpeg`) and run this from Git Bash.
# ---------------------------------------------------------------------------
set -euo pipefail

usage() { sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'; }
if [ $# -lt 1 ]; then usage; exit 1; fi

command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found. Install it first (macOS: brew install ffmpeg)." >&2; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "ffprobe not found. It ships with ffmpeg; reinstall ffmpeg." >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIST="$ROOT/tools/new-projects.txt"

POSTER_AT="${POSTER_AT:-2}"
PREVIEW_START="${PREVIEW_START:-0}"
PREVIEW_LEN="${PREVIEW_LEN:-6}"
CRF="${CRF:-22}"
FORCE="${FORCE:-0}"

slugify() { echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'; }
is_video() {
  case "$(echo "${1##*.}" | tr '[:upper:]' '[:lower:]')" in
    mp4|mov|m4v|mkv|webm|avi|mxf|mpg|mpeg|wmv) return 0 ;;
    *) return 1 ;;
  esac
}

# ---- Collect inputs: files, or every video inside folders ------------------
FILES=()
SLUG_ARG=""
if [ $# -eq 2 ] && [ -f "$1" ] && [ ! -e "$2" ]; then
  FILES=("$1"); SLUG_ARG="$(slugify "$2")"
else
  for arg in "$@"; do
    if [ -d "$arg" ]; then
      while IFS= read -r -d '' f; do
        is_video "$f" && FILES+=("$f")
      done < <(find "$arg" -type f ! -name '.*' -print0 | sort -z)
    elif [ -f "$arg" ]; then
      FILES+=("$arg")
    else
      echo "Not found: $arg" >&2
    fi
  done
fi
if [ ${#FILES[@]} -eq 0 ]; then echo "No video files found." >&2; exit 1; fi

echo "Encoding ${#FILES[@]} video(s) into media/"
echo
USED=" "
DONE=0
SKIPPED=0
FAILED=0
: > "$LIST.tmp"

encode_one() {
  local IN="$1" SLUG="$2"
  local OUT="$ROOT/media/$SLUG"
  local BASE; BASE="$(basename "${IN%.*}")"

  probe() { ffprobe -v error -select_streams v:0 -show_entries "$1" -of default=nw=1:nk=1 "$IN" | head -n1; }
  local W H RATE DUR HAS_AUDIO ROT
  W="$(probe stream=width)"; H="$(probe stream=height)"
  RATE="$(probe stream=r_frame_rate)"
  DUR="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$IN" | head -n1)"
  HAS_AUDIO="$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$IN" | head -n1 || true)"
  ROT="$(ffprobe -v error -select_streams v:0 -show_entries stream_side_data=rotation -of default=nw=1:nk=1 "$IN" 2>/dev/null | head -n1 || true)"
  if [ -z "$W" ] || [ -z "$H" ]; then echo "  ✗ $BASE: no video stream found, skipped" >&2; return 1; fi
  # Phone footage stored sideways: swap so orientation matches what plays.
  case "${ROT#-}" in 90|270) local T="$W"; W="$H"; H="$T" ;; esac
  case "$DUR" in ''|N/A) DUR=0 ;; esac

  local FPS SECS DURATION FORMAT
  FPS="$(awk -v r="$RATE" 'BEGIN { n = split(r, a, "/"); d = (n > 1 && a[2] + 0 > 0) ? a[2] : 1; printf "%.3f", a[1] / d }' | sed -E 's/\.?0+$//')"
  SECS="$(awk -v d="$DUR" 'BEGIN { printf "%d", d + 0.5 }')"
  DURATION="$(awk -v s="$SECS" 'BEGIN { printf "%d:%02d", int(s / 60), s % 60 }')"

  # Keep the poster and preview inside short clips.
  local P_AT P_START
  P_AT="$(awk -v p="$POSTER_AT" -v d="$DUR" 'BEGIN { if (d > 0 && p > d / 2) p = d / 2; printf "%.3f", p }')"
  P_START="$(awk -v s="$PREVIEW_START" -v l="$PREVIEW_LEN" -v d="$DUR" 'BEGIN { if (d > 0 && s + l > d) s = d - l; if (s < 0) s = 0; printf "%.3f", s }')"

  local FIT_FULL FIT_PREVIEW FIT_POSTER
  if [ "$W" -ge "$H" ]; then
    FORMAT="16:9"; [ $((W * 9)) -ne $((H * 16)) ] && FORMAT="${W}:${H}"
    # H.264 needs even sizes: round the capped edge down to an even number too.
    FIT_FULL="scale='trunc(min(1920,iw)/2)*2':-2"; FIT_PREVIEW="scale='trunc(min(960,iw)/2)*2':-2"; FIT_POSTER="scale='min(1600,iw)':-2"
  else
    FORMAT="9:16"; [ $((W * 16)) -ne $((H * 9)) ] && FORMAT="${W}:${H}"
    FIT_FULL="scale=-2:'trunc(min(1920,ih)/2)*2'"; FIT_PREVIEW="scale=-2:'trunc(min(960,ih)/2)*2'"; FIT_POSTER="scale=-2:'min(1600,ih)'"
  fi

  echo "→ $BASE  (${W}×${H}, ${FPS} fps, ${DURATION})  →  media/$SLUG"
  mkdir -p "$OUT"

  local AUDIO_ARGS="-an"
  [ -n "$HAS_AUDIO" ] && AUDIO_ARGS="-c:a aac -b:a 160k"

  # shellcheck disable=SC2086
  ffmpeg -hide_banner -loglevel error -y -i "$IN" -map 0:v:0 -map 0:a:0? \
    -vf "$FIT_FULL,format=yuv420p" \
    -c:v libx264 -preset slow -crf "$CRF" -profile:v high -movflags +faststart \
    $AUDIO_ARGS "$OUT/video.mp4.part.mp4" || { echo "  ✗ $BASE: ffmpeg could not encode this file" >&2; rm -f "$OUT/video.mp4.part.mp4"; return 1; }
  mv -f "$OUT/video.mp4.part.mp4" "$OUT/video.mp4" || return 1
  echo "   video.mp4 ✓"

  ffmpeg -hide_banner -loglevel error -y -ss "$P_START" -t "$PREVIEW_LEN" -i "$IN" -map 0:v:0 \
    -vf "$FIT_PREVIEW,format=yuv420p" \
    -c:v libx264 -preset slow -crf 28 -profile:v high -movflags +faststart -an \
    "$OUT/preview.mp4" || { echo "  ✗ $BASE: preview failed" >&2; return 1; }
  echo "   preview.mp4 ✓"

  ffmpeg -hide_banner -loglevel error -y -ss "$P_AT" -i "$IN" -map 0:v:0 -frames:v 1 \
    -vf "$FIT_POSTER" -q:v 3 "$OUT/poster.jpg" || { echo "  ✗ $BASE: poster failed" >&2; return 1; }
  echo "   poster.jpg ✓"

  # Dominant color for the loading background: average of a 1×1 downscale.
  local COLOR TITLE SIZE
  COLOR="$(ffmpeg -hide_banner -loglevel error -i "$OUT/poster.jpg" -vf scale=1:1 -f rawvideo -pix_fmt rgb24 - | od -An -tx1 | tr -d ' \n' | cut -c1-6)"
  TITLE="$(echo "$BASE" | sed -E 's/[_-]+/ /g; s/ +v?[0-9]+$//; s/^ +//; s/ +$//' | sed 's/"/\\"/g')"
  SIZE="$(du -h "$OUT/video.mp4" | cut -f1 | tr -d ' ')"
  echo "   done ($SIZE)"
  echo

  cat >> "$LIST.tmp" <<SNIPPET
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
      fps: ${FPS:-25},
      color: "#${COLOR:-15171d}",
      summary: "",
      description: [""],
      role: "",
      tools: [],
      credits: []
    },
SNIPPET
}

for IN in "${FILES[@]}"; do
  BASE="$(basename "${IN%.*}")"
  SLUG="${SLUG_ARG:-$(slugify "$BASE")}"
  [ -n "$SLUG" ] || SLUG="project"
  # Two files with the same name in different folders get distinct slugs.
  CANDIDATE="$SLUG"; N=2
  while case "$USED" in *" $CANDIDATE "*) true ;; *) false ;; esac; do CANDIDATE="$SLUG-$N"; N=$((N + 1)); done
  SLUG="$CANDIDATE"; USED="$USED$SLUG "

  if [ "$FORCE" != "1" ] && [ -s "$ROOT/media/$SLUG/video.mp4" ] && [ "$ROOT/media/$SLUG/video.mp4" -nt "$IN" ]; then
    echo "• $BASE already encoded in media/$SLUG (FORCE=1 to redo)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  if encode_one "$IN" "$SLUG"; then DONE=$((DONE + 1)); else FAILED=$((FAILED + 1)); fi
done

if [ -s "$LIST.tmp" ]; then
  mv -f "$LIST.tmp" "$LIST"
  echo "────────────────────────────────────────────────────────────"
  cat "$LIST"
  echo "────────────────────────────────────────────────────────────"
  echo "Paste the blocks above into the projects list in content.js."
  echo "They are also saved in tools/new-projects.txt."
else
  rm -f "$LIST.tmp"
fi
echo "Encoded: $DONE   Skipped: $SKIPPED   Failed: $FAILED"
[ "$FAILED" -eq 0 ]
