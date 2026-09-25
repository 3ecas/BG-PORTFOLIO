#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# encode.sh: turn your master renders into web-ready files for the portfolio.
#
#   bash tools/encode.sh <folder of videos>         encode every video in a folder
#   bash tools/encode.sh <video> [<video> ...]       encode specific files
#   bash tools/encode.sh <video> <link-name>         one file, with the link name you choose
#
# For each video it creates media/<link-name>/ with:
#   video.mp4    full clip for the project viewer (H.264, max 1920 on the long
#                edge, stereo AAC if the master has sound, starts streaming fast)
#   preview.mp4  short, silent, light loop for hover previews (960 long edge)
#   poster.jpg   still frame shown before anything plays
#
# The link name comes from the file name, so a renamed master becomes a new
# project. As each video finishes, a ready-to-paste content.js block is added
# to the end of tools/new-projects.txt. A video already encoded from the same,
# unchanged master is skipped. Ctrl-C stops; the same command carries on later.
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
#   bash tools/encode.sh ~/Renders/Halden_Ident_v12.mov halden-ident
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
filesize() { wc -c < "$1" | tr -d ' '; }
mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0; }
ff() { ffmpeg -nostdin -hide_banner -loglevel error "$@"; }
# media/<name>/.encoded records which master a folder was made from: a checksum
# of the master's file name, its size and its date (no paths), then the format,
# length and frame rate it had.
master_id() { printf '%s %s %s' "$(printf '%s' "$(basename "$1")" | cksum | cut -d' ' -f1)" "$(filesize "$1")" "$(mtime "$1")"; }

# ---- Collect inputs: files, or every video inside folders ------------------
FILES=()
SLUG_ARG=""
if [ $# -eq 2 ] && [ -f "$1" ] && [ ! -e "$2" ] && ! is_video "$2"; then
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

# ---- Link names ------------------------------------------------------------
# From the file name. Videos in this run that share a name get their folder's
# name in front; the page's own section names get -project added.
BASES=()
for IN in "${FILES[@]}"; do BASES+=("$(slugify "$(basename "${IN%.*}")")"); done
SLUGS=()
USED=" "
i=0
for IN in "${FILES[@]}"; do
  if [ -n "$SLUG_ARG" ]; then
    SLUG="$SLUG_ARG"
  else
    SLUG="${BASES[$i]}"
    # The one already encoded under the plain name keeps it.
    if [ -n "$SLUG" ] && [ "$(printf '%s\n' "${BASES[@]}" | grep -cx -- "$SLUG" || true)" -gt 1 ] \
       && [ "$(sed 's/ | .*//' "$ROOT/media/$SLUG/.encoded" 2>/dev/null || true)" != "$(master_id "$IN")" ]; then
      SLUG="$(slugify "$(basename "$(dirname "$IN")")-$SLUG")"
    fi
  fi
  if [ -z "$SLUG" ]; then SLUG="project"; fi
  case "$SLUG" in top|highlights|work|about|contact|main|nav|menu|rail|footer|viewer|grid|index|marquee|showreel) SLUG="$SLUG-project" ;; esac
  CANDIDATE="$SLUG"; N=2
  while case "$USED" in *" $CANDIDATE "*) true ;; *) false ;; esac; do CANDIDATE="$SLUG-$N"; N=$((N + 1)); done
  SLUGS+=("$CANDIDATE"); USED="$USED$CANDIDATE "
  i=$((i + 1))
done

# ---- Read a master's size, frame rate, length, orientation and audio -------
probe_one() { ffprobe -v error -select_streams v:0 -show_entries "$2" -of default=nw=1:nk=1 "$1" 2>/dev/null | tr -d '\r' | head -n1 || true; }
probe_master() {
  local IN="$1"
  W="$(probe_one "$IN" stream=width)"; H="$(probe_one "$IN" stream=height)"
  RATE="$(probe_one "$IN" stream=r_frame_rate)"
  DUR="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$IN" 2>/dev/null | tr -d '\r' | head -n1 || true)"
  # Channel count of each audio track, one per line.
  A_CH="$(ffprobe -v error -select_streams a -show_entries stream=channels -of csv=p=0 "$IN" 2>/dev/null | tr -d '\r' | grep . || true)"
  ROT="$(probe_one "$IN" stream_side_data=rotation)"
  case "$W$H" in ''|*[!0-9]*) return 1 ;; esac
  # Phone footage stored sideways: swap so orientation matches what plays.
  case "${ROT#-}" in 90|270) local T="$W"; W="$H"; H="$T" ;; esac
  case "$DUR" in ''|N/A|*[!0-9.]*) DUR=0 ;; esac
  FPS="$(awk -v r="$RATE" 'BEGIN { n = split(r, a, "/"); d = (n > 1 && a[2] + 0 > 0) ? a[2] : 1; if (a[1] + 0 <= 0) { print 25; exit } printf "%.3f", a[1] / d }' | sed -E 's/\.?0+$//')"
  SECS="$(awk -v d="$DUR" 'BEGIN { printf "%d", d + 0.5 }')"
  DURATION="$(awk -v s="$SECS" 'BEGIN { printf "%d:%02d", int(s / 60), s % 60 }')"
  if [ $((W * 9)) -eq $((H * 16)) ]; then FORMAT="16:9"
  elif [ $((W * 16)) -eq $((H * 9)) ]; then FORMAT="9:16"
  else
    local G; G="$(awk -v a="$W" -v b="$H" 'BEGIN { while (b) { t = b; b = a % b; a = t } print (a > 0 ? a : 1) }')"
    FORMAT="$((W / G)):$((H / G))"
  fi
  return 0
}

# ---- content.js blocks -----------------------------------------------------
RUN_TEXT=""
write_block() {
  local SLUG="$1" BASE="$2" NOTE="$3" OUT="$ROOT/media/$1"
  local COLOR TITLE BLOCK
  COLOR="$(ff -i "$OUT/poster.jpg" -vf scale=1:1 -f rawvideo -pix_fmt rgb24 - 2>/dev/null | od -An -tx1 | tr -d ' \n' | cut -c1-6 || true)"
  TITLE="$(echo "$BASE" | sed -E 's/[_-]+/ /g; s/ +v[0-9]+$//; s/^ +//; s/ +$//' | sed 's/\\/\\\\/g; s/"/\\"/g')"
  BLOCK="$(cat <<SNIPPET
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
)"
  # One heading per run, written with its first block.
  if [ -z "$RUN_TEXT" ]; then
    RUN_TEXT="    // ── Encoded $(date '+%Y-%m-%d %H:%M') ─────────────────────────────"
    printf '\n%s\n' "$RUN_TEXT" >> "$LIST"
  fi
  printf '%s\n' "$BLOCK" >> "$LIST"
  RUN_TEXT="$RUN_TEXT
$BLOCK"
}

# ffmpeg handles Ctrl-C itself and exits normally, so without this bash would carry
# on with the next video. Clean up first: after a closed terminal, writing fails.
OUT_NOW=""
on_stop() {
  trap '' INT TERM HUP
  if [ -n "$OUT_NOW" ]; then rm -f "$OUT_NOW/video.part.mp4" "$OUT_NOW/preview.part.mp4" "$OUT_NOW/poster.part.jpg"; fi
  {
    echo
    echo "Stopped. Blocks for the videos that finished are in tools/new-projects.txt."
    if [ "$FORCE" = "1" ]; then echo "With FORCE=1, running again starts over from the first video."
    else echo "Run the same command again to carry on with the rest."; fi
  } >&2 2>/dev/null || true
  exit "$1"
}
trap 'on_stop 130' INT
trap 'on_stop 143' TERM
trap 'on_stop 129' HUP

encode_one() {
  local IN="$1" SLUG="$2" BASE="$3"
  local OUT="$ROOT/media/$SLUG"

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

  # Sound: the first track as stereo, or the first two joined into stereo when
  # they are mono (common in broadcast and MXF masters).
  local AUDIO=(-an)
  if [ "$(printf '%s\n' "$A_CH" | head -n2 | tr '\n' ' ')" = "1 1 " ]; then
    AUDIO=(-filter_complex '[0:a:0][0:a:1]amerge=inputs=2[a]' -map '[a]' -ac 2 -c:a aac -b:a 160k)
  elif [ -n "$A_CH" ]; then
    AUDIO=(-map '0:a:0' -ac 2 -c:a aac -b:a 160k)
  fi

  echo "→ $BASE  (${W}×${H}, ${FPS} fps, ${DURATION})  →  media/$SLUG"
  mkdir -p "$OUT"
  # New files are written next to the old ones and swapped in at the end, so a
  # failed or stopped encode leaves the previous set (and its .encoded) as it was.
  OUT_NOW="$OUT"
  fail() { echo "   ✗ $BASE: $1" >&2; rm -f "$OUT/video.part.mp4" "$OUT/preview.part.mp4" "$OUT/poster.part.jpg"; OUT_NOW=""; }

  if ! ff -y -i "$IN" -map 0:v:0 -vf "$FIT_FULL,format=yuv420p" \
    -c:v libx264 -preset slow -crf "$CRF" -profile:v high -movflags +faststart \
    "${AUDIO[@]}" "$OUT/video.part.mp4"; then
    fail "ffmpeg could not encode this file"; return 1
  fi
  echo "   video ✓"

  local PREV_ARGS=(-map 0:v:0 -vf "$FIT_PREVIEW,format=yuv420p" -c:v libx264 -preset slow -crf 28 -profile:v high -movflags +faststart -an -f mp4)
  if ! ff -y -ss "$P_START" -t "$PREVIEW_LEN" -i "$IN" "${PREV_ARGS[@]}" "$OUT/preview.part.mp4"; then
    fail "the preview could not be made"; return 1
  fi
  # Unknown length plus a start offset can give an empty file: retry from the start.
  if [ "$(filesize "$OUT/preview.part.mp4")" -lt 2048 ]; then
    ff -y -t "$PREVIEW_LEN" -i "$IN" "${PREV_ARGS[@]}" "$OUT/preview.part.mp4" 2>/dev/null || true
  fi
  if [ "$(filesize "$OUT/preview.part.mp4")" -lt 2048 ]; then
    fail "the preview came out empty (try PREVIEW_START=0)"; return 1
  fi
  echo "   preview ✓"

  ff -y -ss "$P_AT" -i "$IN" -map 0:v:0 -frames:v 1 -vf "$FIT_POSTER" -q:v 3 -f image2 "$OUT/poster.part.jpg" 2>/dev/null || true
  # Unknown length or a very short clip: fall back to the first frame.
  if [ ! -s "$OUT/poster.part.jpg" ]; then
    ff -y -i "$IN" -map 0:v:0 -frames:v 1 -vf "$FIT_POSTER" -q:v 3 -f image2 "$OUT/poster.part.jpg" 2>/dev/null || true
  fi
  if [ ! -s "$OUT/poster.part.jpg" ]; then
    fail "could not grab a poster frame; the file may be damaged"; return 1
  fi
  echo "   poster ✓"

  if ! { mv -f "$OUT/preview.part.mp4" "$OUT/preview.mp4" && mv -f "$OUT/poster.part.jpg" "$OUT/poster.jpg" \
         && mv -f "$OUT/video.part.mp4" "$OUT/video.mp4"; }; then
    fail "could not save the files in media/$SLUG"; return 1
  fi
  OUT_NOW=""
  printf '%s | %s %s %s\n' "$(master_id "$IN")" "$FORMAT" "$DURATION" "${FPS:-25}" > "$OUT/.encoded"
  echo "   saved in media/$SLUG ($(du -h "$OUT/video.mp4" | cut -f1 | tr -d ' '))"
  echo
  return 0
}

# ---- Go --------------------------------------------------------------------
echo "Encoding ${#FILES[@]} video(s) into media/"
echo
DONE=0; SKIPPED=0; FAILED=0; NEWN=0; UPDN=0; REEL=""
i=0
for IN in "${FILES[@]}"; do
  SLUG="${SLUGS[$i]}"; i=$((i + 1))
  BASE="$(basename "${IN%.*}")"
  OUTD="$ROOT/media/$SLUG"

  if ! probe_master "$IN"; then
    echo "✗ $BASE: no video stream found, skipped" >&2
    FAILED=$((FAILED + 1)); continue
  fi

  # What the folder held before: nothing, a sample (no .encoded), or an earlier encode.
  WAS=""; HAD_VIDEO=0
  if [ -f "$OUTD/.encoded" ]; then WAS="$(cat "$OUTD/.encoded")"; fi
  if [ -s "$OUTD/video.mp4" ]; then HAD_VIDEO=1; fi
  if [ "$FORCE" != "1" ] && [ -n "$WAS" ] && [ "${WAS%% | *}" = "$(master_id "$IN")" ] \
     && [ -s "$OUTD/video.mp4" ] && [ -s "$OUTD/preview.mp4" ] && [ -s "$OUTD/poster.jpg" ]; then
    echo "• $BASE already encoded in media/$SLUG (FORCE=1 to redo)"
    SKIPPED=$((SKIPPED + 1)); continue
  fi

  if encode_one "$IN" "$SLUG" "$BASE"; then
    DONE=$((DONE + 1))
    case "$SLUG" in *reel*) REEL="$SLUG" ;; esac
    if [ -n "$WAS" ] && [ "${WAS#* | }" = "$FORMAT $DURATION ${FPS:-25}" ]; then
      NOTE="UPDATED video: if media/$SLUG is already in content.js, nothing there needs to change"; UPDN=$((UPDN + 1))
    elif [ -n "$WAS" ]; then
      NOTE="UPDATED video, was ${WAS#* | }: if media/$SLUG is already in content.js, copy the new format, duration and fps from here"; UPDN=$((UPDN + 1))
    elif [ "$HAD_VIDEO" = 1 ]; then
      NOTE="NEW (media/$SLUG held a sample video, now replaced: delete the sample project \"$SLUG\" from content.js)"; NEWN=$((NEWN + 1))
    else
      NOTE="NEW"; NEWN=$((NEWN + 1))
    fi
    write_block "$SLUG" "$BASE" "$NOTE"
  else
    FAILED=$((FAILED + 1))
  fi
done

if [ -n "$RUN_TEXT" ]; then
  echo "────────────────────────────────────────────────────────────"
  printf '%s\n' "$RUN_TEXT"
  echo "────────────────────────────────────────────────────────────"
  echo "These blocks were added to the end of tools/new-projects.txt."
  if [ "$NEWN" -gt 0 ]; then echo "Paste the blocks marked NEW into the projects list in content.js."; fi
  if [ "$UPDN" -gt 0 ]; then echo "Blocks marked UPDATED are new versions of earlier videos: follow the note on each."; fi
  if [ -n "$REEL" ] || [ -n "$SLUG_ARG" ]; then
    echo "Showreel? Don't paste its block as a project. Point hero.reel in content.js at media/${REEL:-$SLUG_ARG}/ instead (README step 6)."
  fi
else
  echo "Nothing new to paste."
fi
echo "Encoded: $DONE   Skipped: $SKIPPED   Failed: $FAILED"
[ "$FAILED" -eq 0 ]
