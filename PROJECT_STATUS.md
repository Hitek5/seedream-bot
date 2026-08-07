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

## Авто-сводка (git)
_Сгенерировано 2026-08-07 14:53 через `scripts/project-status-summary.sh`._
_Здесь только факты из git; смысловой контекст дописывается вручную в разделах выше._

- Ветка: `main`
- База: статус ещё не коммитился, взяты последние коммиты от f5794aa
- Коммитов с тех пор: 18
- Файлов затронуто: 21

### Коммиты
```
ef8be8a Fix overlapping message-flow labels
757129b docs(bpmn): short node labels + documentation, relayout, fix Task_cv/Task_florence overlap
479ae95 Merge pull request #1 from Hitek5/fix/audit-2026-06
5660372 Add GitHub Actions CI for typecheck
2c1c138 Add 2026-06 audit report and BPMN process map
22a376e Stop BOT_TOKEN leak, make balance writes atomic, fix CAD runner
0cacc1d auto-backup 2026-04-06
8612ef3 auto-backup 2026-04-05
6b5d79f auto-backup 2026-04-04
18377dd auto-backup 2026-04-03
a139b87 feat: add action buttons under result photo, fix null dimensions in caption
9f8830e fix: use image_urls array + upload to fal.storage for edit endpoint
3d45863 fix: remove 'generate as is' — only face swap flow
ace8f9f feat: face swap flow — button + photo upload + Seedream edit
cfcb487 fix: switch vision to Florence-2 via fal.ai (no extra API keys)
... и ещё 3
```

### Изменённые файлы
```
M	.env.example
A	.github/workflows/ci.yml
M	.gitignore
M	PLAN.md
A	docs/AUDIT-2026-06.md
A	docs/bpmn/seedream-bot-process.bpmn
A	package-lock.json
A	package.json
A	src/bot/handlers/callback.ts
A	src/bot/handlers/photo.ts
A	src/bot/index.ts
A	src/config.ts
A	src/index.ts
A	src/services/balance.ts
A	src/services/cad.ts
A	src/services/claude.ts
A	src/services/seedream.ts
A	src/services/tgfile.ts
A	src/services/threed.ts
A	src/services/vision.ts
A	tsconfig.json
```

### Незакоммиченное на момент генерации
```
?? .githooks/
?? PROJECT_STATUS.md
?? scripts/
```

---
Обновлено: 2026-08-07 14:55 агентом claude-code (первичное создание файла, pre-push hook + scripts/project-status-summary.sh)
