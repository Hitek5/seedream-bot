# 📋 План разработки Seedream Bot v2

## Концепция

Бот для создания фото «себя в любом образе»:
1. Кидаешь **референс-картинку** → бот анализирует (GPT-4o-mini vision) → создаёт идеальный промпт
2. Промпт + превью сохраняются в **общую библиотеку**
3. Показывает карточку: превью + промпт + кнопка «Создать»
4. Клик → «Стоимость: ~$0.08, время: ~20 сек. Загрузи своё фото»
5. Загружаешь своё фото → **Seedream v4.5 edit** (face/body swap + стилизация) → готовое фото

## Стоимость за генерацию
| Шаг | Провайдер | Цена |
|-----|-----------|------|
| Vision-анализ | OpenAI GPT-4o-mini | ~$0.01 |
| Image generation/edit | fal.ai Seedream v4.5 | $0.04 |
| Face swap (optional) | fal.ai face-swap | $0.04 |
| **Итого** | | **$0.05–0.09** |

---

## Фаза 1: Скелет ✅ DONE
- [x] grammY бот, /start, /imagine
- [x] fal.ai Seedream v4.5 text-to-image
- [x] Обработка ошибок

## Фаза 2: Vision + Prompt Engineering ✅ DONE
> Цель: кидаешь картинку → получаешь идеальный промпт

- [x] OpenAI клиент (GPT-4o-mini vision)
- [x] Хэндлер photo-сообщений: скачать фото → отправить в vision → получить промпт
- [x] Prompt template для vision: «Опиши эту картинку как детальный промпт для генерации подобного изображения. Стиль, освещение, композиция, детали одежды, поза, фон, настроение.»
- [x] Показать результат: превью + промпт + кнопки [💾 Сохранить] [✏️ Редактировать] [🎨 Создать]

## Фаза 3: Библиотека промптов
> Цель: общая коллекция стилей/образов для повторного использования

- [ ] SQLite schema: prompts (id, prompt, thumbnail_url, category, created_by, created_at, uses_count)
- [ ] /library — inline-кнопки с превью карточками (пагинация)
- [ ] Категории: portrait, fashion, fantasy, cinematic, art
- [ ] Поиск: /search <запрос>
- [ ] Кнопка «Создать» на каждой карточке → переход к Фазе 4

## Фаза 4: Face/Body Swap + Generation
> Цель: загрузи фото → получи себя в образе из библиотеки

- [ ] Стейт-машина (grammY conversations):
  1. Пользователь нажимает «Создать» на карточке
  2. Бот: «Стоимость: ~$0.08, время: ~20 сек. Загрузи своё фото (портрет, лицо видно чётко)»
  3. Пользователь загружает фото
  4. Бот: генерация... (typing indicator)
  5. Результат: финальное фото + кнопки [🔄 Ещё раз] [📐 Другой размер] [💾 HD]
- [ ] Pipeline:
  1. Seedream v4.5 edit: базовая картинка + промпт + пользовательское фото как reference
  2. Если нужно face-swap: fal.ai face-swap endpoint поверх результата
- [ ] Сохранение результата в историю пользователя

## Фаза 5: UX Polish
- [ ] Inline-режим: @SeedreamGen_bot + текст → показ карточек из библиотеки
- [ ] Rate limiting (20 генераций/день бесплатно)
- [ ] /settings — качество, размер по умолчанию
- [ ] /history — мои генерации
- [ ] /stats (admin) — расход, юзеры, популярные промпты
- [ ] Авто-перевод RU→EN промптов

## Фаза 6: Deploy
- [ ] PM2 ecosystem.config.js
- [ ] GitHub Actions CI (lint + typecheck)
- [ ] Health-check
- [ ] Мониторинг (алерт если бот упал)

---

## Архитектура

```
src/
├── bot/
│   ├── index.ts              # grammY init + middleware
│   ├── commands/
│   │   ├── start.ts          # /start
│   │   ├── imagine.ts        # /imagine (text-to-image)
│   │   ├── library.ts        # /library (browse)
│   │   ├── search.ts         # /search
│   │   ├── settings.ts       # /settings
│   │   └── history.ts        # /history
│   ├── handlers/
│   │   ├── photo.ts          # Photo → vision → prompt
│   │   └── callback.ts       # Inline-кнопки
│   ├── conversations/
│   │   └── generate.ts       # Стейт-машина: выбор→фото→генерация→результат
│   ├── middleware/
│   │   ├── rateLimit.ts
│   │   └── auth.ts
│   └── keyboards/
│       └── index.ts
├── services/
│   ├── seedream.ts           # fal.ai text-to-image + edit
│   ├── faceswap.ts           # fal.ai face-swap
│   ├── vision.ts             # GPT-4o-mini vision → prompt
│   └── translate.ts          # RU→EN
├── db/
│   ├── schema.ts
│   └── queries.ts
├── config.ts
└── index.ts
```

## Технические решения

### Vision → Prompt: GPT-4o-mini
- Дёшево ($0.01/запрос), быстро (~2 сек)
- Промпт-шаблон заточен под Seedream v4.5 синтаксис
- Результат: детальное описание на EN для максимального качества генерации

### Face/Body Swap: двухэтапный pipeline
1. **Seedream v4.5 edit** — стилизация с reference image
2. **fal.ai face-swap** (если нужна точная замена лица) — поверх результата
- Fallback: если face-swap недоступен, только Seedream edit

### Библиотека: общая
- Любой юзер может добавить промпт
- uses_count для сортировки по популярности
- Модерация: admin может удалять
