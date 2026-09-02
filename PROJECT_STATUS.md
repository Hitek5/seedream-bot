# PROJECT_STATUS.md — Seedream Bot

## Текущая цель
Проект в состоянии «жив, но дремлет»: активная разработка была 29.03.2026 (MVP →
face swap), затем аудит и фиксы безопасности 13-15.06.2026. Сейчас цель —
довести до рабочего состояния рекомендации аудита (`docs/AUDIT-2026-06.md`)
перед следующей реанимацией бота.

## Завершено
- MVP: `/imagine` — text-to-image через fal.ai Seedream v4.5 (29.03, `dd16d7d`)
- Vision-анализ фото → промпт; итоговая связка Claude Vision с fallback на
  Florence-2 через fal.ai (29.03, `7ae7840`, `cfcb487`)
- Face swap flow: кнопка → загрузка фото → Seedream edit (29.03, `ace8f9f`,
  `9f8830e`, `a139b87`)
- 3D-генерация (`threed.ts`): birefnet для удаления фона + TripoSR / Hunyuan3D
  mini turbo / Trellis по уровням качества
- CAD-генерация (`cad.ts`): Claude пишет CadQuery-Python → `execFile python3` →
  STEP + STL
- Аудит 2026-06 + BPMN карта процессов (13.06, `2c1c138`, `docs/AUDIT-2026-06.md`)
- Фиксы аудита, PR #1 смёржен (14.06, `22a376e`): устранена утечка BOT_TOKEN на
  fal.ai (Telegram file-URL больше не покидает процесс — `services/tgfile.ts`),
  атомарная запись балансов через `renameSync`, починен CAD-runner
- CI: GitHub Actions `tsc --noEmit` на push и PR (13.06, `5660372`)

## Ключевые технические решения
- Node 22 + TypeScript strict + ESM, запуск через `tsx` без сборки; grammY, long
  polling (webhook нет)
- Vision через Claude (OAuth Max) с fallback на Florence-2 — не заводить лишний
  OpenAI-ключ; изначальный GPT-4o-mini был заменён по этой причине
- Файл Telegram скачивается внутри процесса и заливается в `fal.storage` —
  третья сторона не должна видеть URL с токеном бота
- Балансы в `data/balances.json` (вне git, `data/` в `.gitignore`); SQLite из
  README/PLAN не реализован

## Изменённые основные файлы
- `src/bot/index.ts` — команды, клавиатуры, обработка генерации
- `src/bot/handlers/photo.ts`, `src/bot/handlers/callback.ts` — фото-флоу, face swap
- `src/services/` — `seedream.ts`, `vision.ts`, `claude.ts`, `threed.ts`,
  `cad.ts`, `balance.ts`, `tgfile.ts`
- `docs/AUDIT-2026-06.md`, `docs/bpmn/` — аудит и карта процессов

## Тесты / проверка
- Автотестов нет; линтера нет
- CI = `npm run typecheck` (`tsc --noEmit`) на каждый push/PR
- Актуальность fal-эндпоинта Seedream v4.5 проверялась вручную 12.06.2026:
  активен, $0.04/изображение

## Известные проблемы
- `cad.ts` исполняет сгенерированный LLM Python без песочницы, а промпт
  контролирует пользователь — RCE by design (главный открытый риск аудита)
- Нет `@grammyjs/runner`/sequentialize: апдейты обрабатываются последовательно,
  одна CAD-генерация (до 60 с) блокирует всех пользователей
- Состояние в памяти (`promptStore`, `pendingFaceSwap`) — теряется при рестарте
  и растёт без ограничений; TOCTOU-гонка при списании баланса
- `ADMIN_IDS` и `MAX_DAILY_IMAGES` читаются из конфига, но не используются —
  лимитов и админ-команд пополнения нет, баланс правится руками в JSON
- Vision-анализ фото бесплатен и не лимитирован — жжёт Anthropic/fal
- `fal.subscribe` без таймаута и ретраев; списание происходит после успеха, при
  рестарте посреди генерации возможен двойной расход
- README описывает несуществующее (`/edit`, `/style`, `/history`, rate limiting,
  SQLite, очередь) — расходится с реальным кодом
- Деплой не формализован: в репо нет конфигов, прод работал из рабочей копии
  (отсюда коммиты `auto-backup` с меняющимся `balances.json`)

## Опробовано, но не сработало
- Vision через OpenAI GPT-4o-mini — заменён на Claude/Florence-2, чтобы не
  заводить отдельный платный ключ (`3391954` → `7ae7840` → `cfcb487`)
- Режим «сгенерировать как есть» в фото-флоу — убран, оставлен только face swap
  (`3d45863`)
- Автоматическая запись баланса через `writeFileSync` — неатомарна, битый JSON
  молча обнулял балансы; заменена на `renameSync`

## Следующие шаги
1. Песочница для CAD (Docker/nsjail, без сети, ulimit) — закрыть RCE
2. `@grammyjs/runner` + sequentialize по user_id — убрать глобальную блокировку
3. SQLite вместо JSON+Map: балансы, промпты, история, лимиты, журнал транзакций
4. Лимиты на бесплатный vision-анализ + админ-команда пополнения баланса
5. Привести README к реальности и формализовать деплой (systemd/pm2)

<!-- AUTO:BEGIN status-updater -->
## Авто-сводка (git)
_Автоблок: обновляется `/opt/shared/hooks/status-updater.sh` (pre-push + ежедневный cron)._
_Правки внутри маркеров будут перезаписаны. Смысловой контекст — в разделах выше._
_Сгенерировано 2026-09-01 22:33 MST._

- Ветка: `main`
- Последний коммит: 2026-09-01 (a77c286) chore(hooks): pre-push сам генерит авто-сводку PROJECT_STATUS
- База: последнее обновление статуса — 2026-08-07 (bde8a1a)
- Коммитов с тех пор: 1
- Файлов затронуто: 2
- Рабочее дерево: чисто

### Коммиты
```
a77c286 chore(hooks): pre-push сам генерит авто-сводку PROJECT_STATUS
```

### Изменённые файлы
```
M	.githooks/pre-push
M	PROJECT_STATUS.md
```

<!-- AUTO:END status-updater -->

---
Обновлено: 2026-08-07 14:55 агентом claude-code (первичное создание файла, pre-push hook + scripts/project-status-summary.sh)
