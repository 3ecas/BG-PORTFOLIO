#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# encode.sh: turn your master renders into web-ready files for the portfolio.
#
#   bash tools/encode.sh <folder of videos>         encode every video in a folder
#   bash tools/encode.sh <video> [<video> ...]       encode specific files
#   bash tools/encode.sh <video> <slug>              one file, with the link name you choose
#
# For each video it creates media/<slug>/ with:
#   video.mp4    full clip for the project viewer (H.264, max 1920 on the long
#                edge, AAC audio if the master has sound, starts streaming fast)
#   preview.mp4  short, silent, light loop for hover previews (960 long edge)
#   poster.jpg   still frame shown before anything plays
#
# A ready-to-paste content.js block for every video in the run is printed and
# saved in tools/new-projects.txt. Videos already encoded from the same master
# are skipped (their blocks are still listed). Set FORCE=1 to redo them.
#
# Options (environment variables, put them before the command):
#   POSTER_AT=2.5       seconds into the clip for the poster frame   (default 2)
#   PREVIEW_START=4     where the hover preview starts, in seconds   (default 0)
#   PREVIEW_LEN=6       hover preview length in seconds              (default 6)
#   CRF=20              quality of video.mp4, lower = better/larger  (default 22)
#   FORCE=1             re-encode videos that were already done
#
# Examples:
#   bash tools/encode.sh ~/Desktop/"videos portfolio"
#   bash tools/encode.sh ~/Renders/Halden_Ident_v12.mov signal-bloom
#   POSTER_AT=4 PREVIEW_START=3 bash tools/encode.sh renders/reel_2026.mp4
#
# Needs ffmpeg + ffprobe. macOS: `brew install ffmpeg`. Windows: install
# ffmpeg (`winget install Gyan.FFmpeg`) and run this from Git Bash.
# ---------------------------------------------------------------------------
set -euo pipefail

usage() { sed -n '2,34p' "$0" | sed 's/^# \{0,1\}//'; }
if [ $# -lt 1 ]; then usage; exit 1; fi

command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found. Install it first (macOS: brew install ffmpeg)." >&2; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "ffprobe not found. It ships with ffmpeg; reinstall ffmpeg." >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIST="$ROOT/tools/new-projects.txt"
# Which master each media folder came from. Kept in tools/, never uploaded with media/.
MANIFEST="$ROOT/tools/encoded.txt"

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
abspath() { (cd "$(dirname "$1")" && printf '%s/%s\n' "$(pwd)" "$(basename "$1")"); }
source_of() { if [ -f "$MANIFEST" ]; then awk -F '\t' -v s="$1" '$1 == s { print $2; exit }' "$MANIFEST"; fi; }
remember() {
  local tmp="$MANIFEST.tmp"
  { if [ -f "$MANIFEST" ]; then awk -F '\t' -v s="$1" '$1 != s' "$MANIFEST"; fi; printf '%s\t%s\n' "$1" "$2"; } > "$tmp"
  mv -f "$tmp" "$MANIFEST"
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
        if is_video "$f"; then FILES+=("$f"); fi
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

# ---- Read a master's size, frame rate, length and orientation ---------------
probe_one() { ffprobe -v error -select_streams v:0 -show_entries "$2" -of default=nw=1:nk=1 "$1" 2>/dev/null | tr -d '\r' | head -n1 || true; }
probe_master() {
  local IN="$1"
  W="$(probe_one "$IN" stream=width)"; H="$(probe_one "$IN" stream=height)"
  RATE="$(probe_one "$IN" stream=r_frame_rate)"
  DUR="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$IN" 2>/dev/null | tr -d '\r' | head -n1 || true)"
  HAS_AUDIO="$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$IN" 2>/dev/null | tr -d '\r' | head -n1 || true)"
  ROT="$(probe_one "$IN" stream_side_data=rotation)"
  case "$W$H" in ''|*[!0-9]*) return 1 ;; esac
  # Phone footage stored sideways: swap so orientation matches what plays.
  case "${ROT#-}" in 90|270) local T="$W"; W="$H"; H="$T" ;; esac
  case "$DUR" in ''|N/A|*[!0-9.]*) DUR=0 ;; esac
  FPS="$(awk -v r="$RATE" 'BEGIN { n = split(r, a, "/"); d = (n > 1 && a[2] + 0 > 0) ? a[2] : 1; if (a[1] + 0 <= 0) { print 25; exit } printf "%.3f", a[1] / d }' | sed -E 's/\.?0+$//')"
  SECS="$(awk -v d="$DUR" 'BEGIN { printf "%d", d + 0.5 }')"
  DURATION="$(awk -v s="$SECS" 'BEGIN { printf "%d:%02d", int(s / 60), s % 60 }')"
  if [ "$W" -ge "$H" ]; then
    FORMAT="16:9"; if [ $((W * 9)) -ne $((H * 16)) ]; then FORMAT="${W}:${H}"; fi
  else
    FORMAT="9:16"; if [ $((W * 16)) -ne $((H * 9)) ]; then FORMAT="${W}:${H}"; fi
  fi
  return 0
}

write_block() {
  local SLUG="$1" BASE="$2" OUT="$ROOT/media/$1"
  local COLOR TITLE
  COLOR="$(ffmpeg -hide_banner -loglevel error -i "$OUT/poster.jpg" -vf scale=1:1 -f rawvideo -pix_fmt rgb24 - 2>/dev/null | od -An -tx1 | tr -d ' \n' | cut -c1-6 || true)"
  TITLE="$(echo "$BASE" | sed -E 's/[_-]+/ /g; s/ +v[0-9]+$//; s/^ +//; s/ +$//' | sed 's/\\/\\\\/g; s/"/\\"/g')"
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

encode_one() {
  local IN="$1" SLUG="$2" BASE="$3"
  local OUT="$ROOT/media/$SLUG"
  local PART="$OUT/video.part.mp4"

  # Keep the poster and preview inside short clips.
  local P_AT P_START FIT_FULL FIT_PREVIEW FIT_POSTER
  P_AT="$(awk -v p="$POSTER_AT" -v d="$DUR" 'BEGIN { if (d > 0 && p > d / 2) p = d / 2; printf "%.3f", p }')"
  P_START="$(awk -v s="$PREVIEW_START" -v l="$PREVIEW_LEN" -v d="$DUR" 'BEGIN { if (d > 0 && s + l > d) s = d - l; if (s < 0) s = 0; printf "%.3f", s }')"
  # H.264 needs even sizes: round the capped edge down to an even number too.
  if [ "$W" -ge "$H" ]; then
    FIT_FULL="scale='trunc(min(1920,iw)/2)*2':-2"; FIT_PREVIEW="scale='trunc(min(960,iw)/2)*2':-2"; FIT_POSTER="scale='min(1600,iw)':-2"
  else
    FIT_FULL="scale=-2:'trunc(min(1920,ih)/2)*2'"; FIT_PREVIEW="scale=-2:'trunc(min(960,ih)/2)*2'"; FIT_POSTER="scale=-2:'min(1600,ih)'"
  fi

  echo "→ $BASE  (${W}×${H}, ${FPS} fps, ${DURATION})  →  media/$SLUG"
  mkdir -p "$OUT"
  # The set only counts as done once video.mp4 exists, and that is written last.
  rm -f "$OUT/video.mp4"

  local AUDIO_ARGS="-an"
  if [ -n "$HAS_AUDIO" ]; then AUDIO_ARGS="-c:a aac -b:a 160k"; fi

  # shellcheck disable=SC2086
  if ! ffmpeg -hide_banner -loglevel error -y -i "$IN" -map 0:v:0 -map '0:a:0?' \
    -vf "$FIT_FULL,format=yuv420p" \
    -c:v libx264 -preset slow -crf "$CRF" -profile:v high -movflags +faststart \
    $AUDIO_ARGS "$PART"; then
    echo "   ✗ $BASE: ffmpeg could not encode this file" >&2; rm -f "$PART"; return 1
  fi
  echo "   video ✓"

  if ! ffmpeg -hide_banner -loglevel error -y -ss "$P_START" -t "$PREVIEW_LEN" -i "$IN" -map 0:v:0 \
    -vf "$FIT_PREVIEW,format=yuv420p" \
    -c:v libx264 -preset slow -crf 28 -profile:v high -movflags +faststart -an \
    "$OUT/preview.mp4"; then
    echo "   ✗ $BASE: the preview could not be made" >&2; rm -f "$PART"; return 1
  fi
  echo "   preview.mp4 ✓"

  rm -f "$OUT/poster.jpg"
  ffmpeg -hide_banner -loglevel error -y -ss "$P_AT" -i "$IN" -map 0:v:0 -frames:v 1 \
    -vf "$FIT_POSTER" -q:v 3 "$OUT/poster.jpg" 2>/dev/null || true
  # Unknown length or a very short clip: fall back to the first frame.
  if [ ! -s "$OUT/poster.jpg" ]; then
    ffmpeg -hide_banner -loglevel error -y -i "$IN" -map 0:v:0 -frames:v 1 \
      -vf "$FIT_POSTER" -q:v 3 "$OUT/poster.jpg" 2>/dev/null || true
  fi
  if [ ! -s "$OUT/poster.jpg" ]; then
    echo "   ✗ $BASE: could not grab a poster frame (try POSTER_AT=0)" >&2; rm -f "$PART"; return 1
  fi
  echo "   poster.jpg ✓"

  if ! mv -f "$PART" "$OUT/video.mp4"; then
    echo "   ✗ $BASE: could not save video.mp4" >&2; rm -f "$PART"; return 1
  fi
  echo "   video.mp4 ✓ ($(du -h "$OUT/video.mp4" | cut -f1 | tr -d ' '))"
  echo
  return 0
}

for IN in "${FILES[@]}"; do
  BASE="$(basename "${IN%.*}")"
  SRC="$(abspath "$IN")"
  SLUG="${SLUG_ARG:-$(slugify "$BASE")}"
  if [ -z "$SLUG" ]; then SLUG="project"; fi
  # The site uses these names for its own sections.
  case "$SLUG" in top|highlights|work|about|contact|main|nav|menu|rail|footer|viewer|grid|index|marquee|showreel) SLUG="$SLUG-project" ;; esac

  # Reuse the folder this master was encoded into before; otherwise pick a free name.
  # A folder made from a different master gets a new name, unless you chose the name yourself.
  CANDIDATE="$SLUG"; N=2
  while :; do
    case "$USED" in *" $CANDIDATE "*) CANDIDATE="$SLUG-$N"; N=$((N + 1)); continue ;; esac
    OWNER="$(source_of "$CANDIDATE")"
    if [ -z "$SLUG_ARG" ] && [ -n "$OWNER" ] && [ "$OWNER" != "$SRC" ]; then CANDIDATE="$SLUG-$N"; N=$((N + 1)); continue; fi
    break
  done
  SLUG="$CANDIDATE"; USED="$USED$SLUG "

  if ! probe_master "$IN"; then
    echo "✗ $BASE: no video stream found, skipped" >&2
    FAILED=$((FAILED + 1)); continue
  fi

  OUTD="$ROOT/media/$SLUG"
  if [ "$FORCE" != "1" ] && [ "$(source_of "$SLUG")" = "$SRC" ] \
     && [ -s "$OUTD/video.mp4" ] && [ -s "$OUTD/preview.mp4" ] && [ -s "$OUTD/poster.jpg" ] && [ "$OUTD/video.mp4" -nt "$IN" ]; then
    echo "• $BASE already encoded in media/$SLUG (FORCE=1 to redo)"
    write_block "$SLUG" "$BASE"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  if encode_one "$IN" "$SLUG" "$BASE"; then
    remember "$SLUG" "$SRC"
    write_block "$SLUG" "$BASE"
    DONE=$((DONE + 1))
  else
    FAILED=$((FAILED + 1))
  fi
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
