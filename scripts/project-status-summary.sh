#!/bin/sh
# Собирает фактическую сводку из git (коммиты и файлы с момента последнего
# обновления PROJECT_STATUS.md) и вставляет её секцией "## Авто-сводка (git)".
#
# Факты берёт git, смысл (цели, решения, проблемы, следующие шаги) дописывает
# человек или агент — поэтому авто-секция отделена от рукописных разделов и
# перезаписывается целиком при каждом запуске.
#
# Использование:
#   scripts/project-status-summary.sh             # обновить PROJECT_STATUS.md
#   scripts/project-status-summary.sh --dry-run   # только показать сводку

set -e

DRY_RUN=0
[ "$1" = "--dry-run" ] && DRY_RUN=1

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

STATUS_FILE="PROJECT_STATUS.md"
SECTION_HEADER="## Авто-сводка (git)"
MAX_COMMITS=15
MAX_FILES=25

if [ ! -f "$STATUS_FILE" ]; then
  echo "$STATUS_FILE не найден в $ROOT." >&2
  echo "Создай его из шаблона: /root/.openclaw/workspace/scripts/PROJECT_STATUS.template.md" >&2
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)

# База отсчёта — коммит, в котором статус трогали последний раз. Если статус ещё
# не попал в историю, откатываемся на 20 коммитов назад.
BASE=$(git log -1 --format=%H -- "$STATUS_FILE" 2>/dev/null || true)
if [ -n "$BASE" ]; then
  BASE_DESC="последнее обновление статуса — $(git log -1 --format=%ad --date=short "$BASE") ($(git rev-parse --short "$BASE"))"
else
  BASE=$(git rev-list -n 20 HEAD | tail -1)
  BASE_DESC="статус ещё не коммитился, взяты последние коммиты от $(git rev-parse --short "$BASE")"
fi

RANGE="$BASE..HEAD"
COMMIT_COUNT=$(git rev-list --count "$RANGE" 2>/dev/null || echo 0)
COMMITS=$(git log --oneline --no-decorate -n "$MAX_COMMITS" "$RANGE" 2>/dev/null || true)
FILES=$(git diff --name-status "$RANGE" 2>/dev/null || true)
FILE_COUNT=$(printf '%s' "$FILES" | grep -c . || true)
DIRTY=$(git status --porcelain)

SECTION=$(mktemp)
{
  echo "$SECTION_HEADER"
  echo "_Сгенерировано $(date '+%Y-%m-%d %H:%M') через \`scripts/project-status-summary.sh\`._"
  echo "_Здесь только факты из git; смысловой контекст дописывается вручную в разделах выше._"
  echo ""
  echo "- Ветка: \`$BRANCH\`"
  echo "- База: $BASE_DESC"
  echo "- Коммитов с тех пор: $COMMIT_COUNT"
  echo "- Файлов затронуто: $FILE_COUNT"
  echo ""

  if [ "$COMMIT_COUNT" -gt 0 ]; then
    echo "### Коммиты"
    echo '```'
    echo "$COMMITS"
    [ "$COMMIT_COUNT" -gt "$MAX_COMMITS" ] && echo "... и ещё $((COMMIT_COUNT - MAX_COMMITS))"
    echo '```'
    echo ""
  fi

  if [ "$FILE_COUNT" -gt 0 ]; then
    echo "### Изменённые файлы"
    echo '```'
    echo "$FILES" | head -n "$MAX_FILES"
    [ "$FILE_COUNT" -gt "$MAX_FILES" ] && echo "... и ещё $((FILE_COUNT - MAX_FILES))"
    echo '```'
    echo ""
  fi

  if [ -n "$DIRTY" ]; then
    echo "### Незакоммиченное на момент генерации"
    echo '```'
    echo "$DIRTY" | head -n "$MAX_FILES"
    echo '```'
    echo ""
  fi
} > "$SECTION"

if [ "$DRY_RUN" = "1" ]; then
  cat "$SECTION"
  rm -f "$SECTION"
  exit 0
fi

CLEAN=$(mktemp)
OUT=$(mktemp)

# Вырезаем предыдущую авто-секцию (до следующего заголовка или разделителя),
# чтобы файл не разрастался от повторных запусков.
awk -v hdr="$SECTION_HEADER" '
  index($0, hdr) == 1 { skip = 1; next }
  skip && (index($0, "## ") == 1 || $0 == "---") { skip = 0 }
  !skip
' "$STATUS_FILE" > "$CLEAN"

# Вставляем перед финальным разделителем (над строкой "Обновлено: ..."),
# а если разделителя нет — в конец файла.
LAST_SEP=$(grep -n '^---$' "$CLEAN" | tail -1 | cut -d: -f1)
if [ -n "$LAST_SEP" ]; then
  head -n $((LAST_SEP - 1)) "$CLEAN" > "$OUT"
  cat "$SECTION" >> "$OUT"
  tail -n +"$LAST_SEP" "$CLEAN" >> "$OUT"
else
  cat "$CLEAN" "$SECTION" > "$OUT"
fi

cp "$OUT" "$STATUS_FILE"
rm -f "$SECTION" "$CLEAN" "$OUT"

echo "$STATUS_FILE обновлён: коммитов $COMMIT_COUNT, файлов $FILE_COUNT (ветка $BRANCH)."
echo "Допиши смысловой контекст в разделах выше и закоммить файл."
