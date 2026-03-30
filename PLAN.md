# 📋 План разработки Seedream Bot

## Фаза 1: Скелет (MVP) — ~2 часа
> Цель: бот отвечает на /imagine и отправляет сгенерённое фото

- [ ] Инициализация проекта (tsconfig, package.json, eslint)
- [ ] grammY бот с /start и /imagine
- [ ] fal.ai клиент (Seedream v4.5 text-to-image)
- [ ] Отправка результата как фото в Telegram
- [ ] Обработка ошибок (timeout, API fail, safety filter)
- [ ] .env.example + config.ts
- [ ] Запуск через `npm run dev` (tsx watch)

**Критерий готовности:** `/imagine красивый закат над океаном` → бот отправляет фото

## Фаза 2: Полировка UX — ~2 часа

- [ ] "Typing..." / "Uploading photo..." индикаторы
- [ ] Inline-кнопки под фото: 🔄 Regenerate, 📐 Upscale, 🎨 Variations
- [ ] Авто-перевод RU→EN промптов (через LLM или простой API)
- [ ] Prompt enhancement — добавление quality-тегов (cinematic lighting, 8k, etc.)
- [ ] /style command с пресетами (cinematic, anime, photorealistic, oil painting, watercolor)
- [ ] Валидация промптов (длина, запрещённый контент)

## Фаза 3: Persistence & Limits — ~1.5 часа

- [ ] SQLite база (better-sqlite3): users, generations, settings
- [ ] Настройки пользователя: размер, стиль по умолчанию, seed
- [ ] /settings — inline-меню для настроек
- [ ] Rate limiting (X генераций в день на пользователя)
- [ ] /history — последние 10 генераций с кнопкой повтора
- [ ] Статистика для админа: /stats (всего генераций, топ юзеры, расход $)

## Фаза 4: Image Editing — ~1.5 часа

- [ ] /edit — reply на фото + текстовая инструкция
- [ ] fal.ai Seedream v4.5 edit endpoint
- [ ] Multi-reference: несколько фото как input
- [ ] Сохранение оригинала + результата

## Фаза 5: Продвинутые фичи — ~2 часа

- [ ] Inline-режим (генерация прямо из любого чата)
- [ ] Очередь запросов (если >3 одновременных — в очередь)
- [ ] Webhook-режим вместо polling (для продакшена)
- [ ] Логирование (pino)
- [ ] Health-check endpoint
- [ ] PM2 ecosystem.config.js
- [ ] systemd service

## Фаза 6: Deploy & CI — ~1 час

- [ ] Dockerfile (optional)
- [ ] GitHub Actions: lint + typecheck on push
- [ ] Deploy скрипт (git push → CI → SSH → pm2 restart)
- [ ] Мониторинг: алерт если бот упал

---

## Технические решения

### Почему fal.ai а не Replicate?
- Одинаковая цена ($0.04/img)
- fal.ai: нативный JS SDK, queue API, webhook поддержка
- Быстрее cold start

### Почему grammY а не node-telegram-bot-api?
- TypeScript-first, лучшие типы
- Встроенный rate-limiter middleware
- Session management из коробки
- Активная разработка, modern API

### Почему SQLite?
- Zero-config, один файл
- Для одного бота идеально
- Легко бэкапить (просто скопировать файл)
- При необходимости мигрируем на PostgreSQL

### Prompt Engineering
Пользовательский промпт автоматически обогащается:
1. Перевод RU→EN (если кириллица)
2. Добавление quality modifiers по стилю
3. Negative prompt для улучшения качества

Пример:
- Ввод: `котик на крыше`
- После обработки: `A photorealistic image of a cute cat sitting on a rooftop, golden hour lighting, cinematic composition, 8K resolution, highly detailed fur texture`
