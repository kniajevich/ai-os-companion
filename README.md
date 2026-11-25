# AI OS Companion (GAME + PRO Modes)

Модульный ИИ-оркестратор и живой цифровой питомец с общей памятью на Cloudflare D1.

## Структура репозитория
- backend/schema.sql — индексированная SQLite-схема для Cloudflare D1.
- backend/wrangler.json — конфигурация Cloudflare Worker и привязка D1.
- backend/src/index.js — единый API-роутер (Gemini + Groq + OpenRouter) и компилятор личности.
- index.html — единый клиент для смартфона и ПК с режимами GAME и PRO.

## Быстрый старт бэкенда
1. Создай базу D1: npx wrangler d1 create ai_os_memory
2. Впиши полученный database_id в backend/wrangler.json.
3. Примени схему: npx wrangler d1 execute ai_os_memory --remote --file=backend/schema.sql
4. Добавь секреты: GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY.
5. Деплой: cd backend && npx wrangler deploy
