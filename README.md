# 🎨 Seedream Bot

Telegram-бот для генерации фотореалистичных изображений через **Seedream v4.5** (ByteDance) — лучшая open-source модель для text-to-image на 2026 год.

## Возможности

- `/imagine <промпт>` — генерация изображения из текста
- `/edit` — редактирование фото (reply на фото с инструкцией)
- `/style <стиль> <промпт>` — пресеты стилей (cinematic, anime, photo, oil, watercolor)
- `/settings` — настройки (размер, качество, seed)
- `/history` — последние генерации
- Поддержка русского и английского промптов (авто-перевод)
- Rate limiting и очередь запросов
- Inline-режим для быстрой генерации в любом чате

## Стек

- **Runtime:** Node.js 22 + TypeScript
- **Telegram:** grammY (modern, TypeScript-first)
- **Image API:** fal.ai (Seedream v4.5 text-to-image + edit)
- **DB:** SQLite (better-sqlite3) — история, настройки, статистика
- **Queue:** Bull + Redis-compatible (или встроенная очередь)
- **Deploy:** PM2 + systemd на VPS

## Архитектура

```
src/
├── bot/
│   ├── index.ts          # Инициализация grammY
│   ├── commands/         # Обработчики команд
│   │   ├── imagine.ts    # /imagine
│   │   ├── edit.ts       # /edit (image-to-image)
│   │   ├── style.ts      # /style с пресетами
│   │   ├── settings.ts   # /settings
│   │   └── history.ts    # /history
│   ├── middleware/        # Rate-limit, auth, logging
│   └── keyboards/        # Inline-кнопки
├── services/
│   ├── seedream.ts       # fal.ai API клиент
│   ├── prompt.ts         # Улучшение промптов (prompt engineering)
│   ├── translate.ts      # RU→EN перевод промптов
│   └── queue.ts          # Очередь генерации
├── db/
│   ├── schema.ts         # SQLite schema
│   └── queries.ts        # Запросы
├── config.ts             # Env + defaults
└── index.ts              # Entry point
```

## Быстрый старт

```bash
git clone https://github.com/Hitek5/seedream-bot.git
cd seedream-bot
npm install
cp .env.example .env  # Заполнить BOT_TOKEN, FAL_KEY
npm run dev
```

## Переменные окружения

| Переменная | Описание |
|-----------|----------|
| `BOT_TOKEN` | Telegram Bot Token (@BotFather) |
| `FAL_KEY` | API ключ fal.ai |
| `ADMIN_IDS` | ID админов (через запятую) |
| `MAX_DAILY_IMAGES` | Лимит на пользователя в день (default: 20) |
| `DEFAULT_SIZE` | Размер по умолчанию (default: auto_2K) |

## Стоимость

- fal.ai: **$0.04 за изображение** (Seedream v4.5)
- 1000 генераций = $40

## Лицензия

MIT
