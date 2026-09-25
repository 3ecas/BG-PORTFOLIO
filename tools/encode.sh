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
# saved in tools/new-projects.txt; new ones are marked NEW. Videos already
# encoded from the same master are skipped, even if you moved the folder.
# Set FORCE=1 to redo them. Ctrl-C stops the run; run it again to continue.
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

usage() { sed -n '2,/^[^#]/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; }
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
filesize() { wc -c < "$1" | tr -d ' '; }
# Content fingerprint: size plus a checksum of 1 MB from the middle of the file.
# Recognises a master after it is moved, renamed or copied, and never mixes up two
# different masters that share a name and size.
fingerprint() {
  local size; size="$(filesize "$1")"
  printf '%s:%s' "$size" "$(dd if="$1" bs=65536 skip=$(( size / 131072 )) count=16 2>/dev/null | cksum | cut -d' ' -f1)"
}
# encoded.txt columns: slug, master path, fingerprint, listed (1 once a finished run has shown its block).
col() { if [ -f "$MANIFEST" ]; then awk -F '\t' -v s="$1" -v c="$2" '$1 == s { print $c; exit }' "$MANIFEST"; fi; }
remember() {
  local tmp="$MANIFEST.tmp"
  { if [ -f "$MANIFEST" ]; then awk -F '\t' -v s="$1" '$1 != s' "$MANIFEST"; fi; printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4"; } > "$tmp"
  mv -f "$tmp" "$MANIFEST"
}
mark_listed() {
  [ -f "$MANIFEST" ] || return 0
  awk -F '\t' -v OFS='\t' -v used="$USED" 'index(used, " " $1 " ") { $4 = 1 } { print }' "$MANIFEST" > "$MANIFEST.tmp" && mv -f "$MANIFEST.tmp" "$MANIFEST"
}
# Did media/<slug> come from this master (path $2, fingerprint $3)?
same_master() {
  local rec fp
  rec="$(col "$1" 2)"
  [ -n "$rec" ] || return 1
  [ "$rec" = "$2" ] && return 0
  if [ -e "$rec" ] && [ "$rec" -ef "$2" ]; then return 0; fi
  fp="$(col "$1" 3)"
  case "$fp" in
    *:*) [ "$fp" = "$3" ] ;;
    # Lists from the previous version only stored the size: same name and size, original gone.
    ?*) [ ! -e "$rec" ] && [ "$(basename "$rec")" = "$(basename "$2")" ] && [ "$fp" = "${3%%:*}" ] ;;
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
NEWN=0
: > "$LIST.tmp"
# ffmpeg handles Ctrl-C itself and exits normally, so without this bash would carry on
# with the next video. Clean up first: after a closed terminal, writing a message fails.
PART_NOW=""
on_stop() {
  trap '' INT TERM HUP
  rm -f "$LIST.tmp" ${PART_NOW:+"$PART_NOW"}
  {
    echo
    if [ "$FORCE" = "1" ]; then echo "Stopped. With FORCE=1, running again starts over from the first video."
    else echo "Stopped. Run the same command again to pick up where it left off."; fi
  } >&2 2>/dev/null || true
  exit "$1"
}
trap 'on_stop 130' INT
trap 'on_stop 143' TERM
trap 'on_stop 129' HUP

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
  local SLUG="$1" BASE="$2" NOTE="$3" OUT="$ROOT/media/$1"
  local COLOR TITLE
  COLOR="$(ffmpeg -hide_banner -loglevel error -i "$OUT/poster.jpg" -vf scale=1:1 -f rawvideo -pix_fmt rgb24 - 2>/dev/null | od -An -tx1 | tr -d ' \n' | cut -c1-6 || true)"
  TITLE="$(echo "$BASE" | sed -E 's/[_-]+/ /g; s/ +v[0-9]+$//; s/^ +//; s/ +$//' | sed 's/\\/\\\\/g; s/"/\\"/g')"
  cat >> "$LIST.tmp" <<SNIPPET
    // $NOTE
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
  PART_NOW="$PART"

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
  if [ "$(filesize "$OUT/preview.mp4")" -lt 2048 ]; then
    ffmpeg -hide_banner -loglevel error -y -t "$PREVIEW_LEN" -i "$IN" -map 0:v:0 \
      -vf "$FIT_PREVIEW,format=yuv420p" \
      -c:v libx264 -preset slow -crf 28 -profile:v high -movflags +faststart -an \
      "$OUT/preview.mp4" 2>/dev/null || true
  fi
  if [ "$(filesize "$OUT/preview.mp4")" -lt 2048 ]; then
    echo "   ✗ $BASE: the preview came out empty (try PREVIEW_START=0)" >&2; rm -f "$PART"; return 1
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
    echo "   ✗ $BASE: could not grab a poster frame; the file may be damaged" >&2; rm -f "$PART"; return 1
  fi
  echo "   poster.jpg ✓"

  if ! mv -f "$PART" "$OUT/video.mp4"; then
    echo "   ✗ $BASE: could not save video.mp4" >&2; rm -f "$PART"; return 1
  fi
  PART_NOW=""
  echo "   video.mp4 ✓ ($(du -h "$OUT/video.mp4" | cut -f1 | tr -d ' '))"
  echo
  return 0
}

for IN in "${FILES[@]}"; do
  BASE="$(basename "${IN%.*}")"
  SRC="$(abspath "$IN")"
  FP="$(fingerprint "$IN")"
  SLUG="${SLUG_ARG:-$(slugify "$BASE")}"
  if [ -z "$SLUG" ]; then SLUG="project"; fi
  # The site uses these names for its own sections.
  case "$SLUG" in top|highlights|work|about|contact|main|nav|menu|rail|footer|viewer|grid|index|marquee|showreel) SLUG="$SLUG-project" ;; esac

  # A master encoded before keeps its folder, even if it was moved, renamed or copied.
  REUSE=""
  if [ -z "$SLUG_ARG" ] && [ -f "$MANIFEST" ]; then
    while IFS="$(printf '\t')" read -r s _rest; do
      case "$USED" in *" $s "*) continue ;; esac
      if same_master "$s" "$SRC" "$FP"; then REUSE="$s"; break; fi
    done < "$MANIFEST"
  fi
  if [ -n "$REUSE" ]; then
    SLUG="$REUSE"
  else
    # Otherwise pick a free name: a folder made from a different master gets a new one,
    # unless you chose the name yourself.
    CANDIDATE="$SLUG"; N=2
    while :; do
      case "$USED" in *" $CANDIDATE "*) CANDIDATE="$SLUG-$N"; N=$((N + 1)); continue ;; esac
      if [ -z "$SLUG_ARG" ] && [ -n "$(col "$CANDIDATE" 2)" ] && ! same_master "$CANDIDATE" "$SRC" "$FP"; then CANDIDATE="$SLUG-$N"; N=$((N + 1)); continue; fi
      break
    done
    SLUG="$CANDIDATE"
  fi
  USED="$USED$SLUG "

  if ! probe_master "$IN"; then
    echo "✗ $BASE: no video stream found, skipped" >&2
    FAILED=$((FAILED + 1)); continue
  fi

  OUTD="$ROOT/media/$SLUG"
  KNOWN=0
  if same_master "$SLUG" "$SRC" "$FP"; then KNOWN=1; fi
  # "0" = encoded before, but no finished run has shown its block yet (a run stopped early).
  SHOWN="$(col "$SLUG" 4)"
  # Unchanged = same content as when it was encoded (older lists: master not newer than the video).
  FP_REC="$(col "$SLUG" 3)"
  UNCHANGED=0
  case "$FP_REC" in
    *:*) if [ "$FP_REC" = "$FP" ]; then UNCHANGED=1; fi ;;
    *) if [ ! "$IN" -nt "$OUTD/video.mp4" ]; then UNCHANGED=1; fi ;;
  esac
  if [ "$FORCE" != "1" ] && [ "$KNOWN" = 1 ] && [ "$UNCHANGED" = 1 ] \
     && [ -s "$OUTD/video.mp4" ] && [ -s "$OUTD/preview.mp4" ] && [ -s "$OUTD/poster.jpg" ]; then
    echo "• $BASE already encoded in media/$SLUG (FORCE=1 to redo)"
    remember "$SLUG" "$SRC" "$FP" "${SHOWN:-1}"
    if [ "$SHOWN" = "0" ]; then write_block "$SLUG" "$BASE" "NEW"; NEWN=$((NEWN + 1))
    else write_block "$SLUG" "$BASE" "Encoded in an earlier run: skip this one if it is already in content.js"; fi
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  if encode_one "$IN" "$SLUG" "$BASE"; then
    remember "$SLUG" "$SRC" "$FP" 0
    if [ "$KNOWN" = 1 ] && [ "$SHOWN" != "0" ]; then
      write_block "$SLUG" "$BASE" "Re-encoded with the same link name: skip this one if it is already in content.js"
    else
      write_block "$SLUG" "$BASE" "NEW"; NEWN=$((NEWN + 1))
    fi
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
  if [ "$NEWN" -eq 0 ]; then
    echo "Nothing new to paste: every video here was already in an earlier list."
  elif [ "$NEWN" -lt "$((DONE + SKIPPED))" ]; then
    echo "Paste the blocks marked NEW into the projects list in content.js."
    echo "The others were encoded in an earlier run and may already be there."
  else
    echo "Paste the blocks above into the projects list in content.js."
  fi
  echo "They are also saved in tools/new-projects.txt."
else
  rm -f "$LIST.tmp"
fi
# Everything listed above has now been shown once.
mark_listed
echo "Encoded: $DONE   Skipped: $SKIPPED   Failed: $FAILED"
[ "$FAILED" -eq 0 ]
