# CNC Assistant v2

Чистый Node.js + TypeScript проект для Railway с mobile-first интерфейсом под iPhone
(включая safe areas, `100dvh`, камеру и PWA).

## Что внутри

- OpenAI **Responses API**
- Fast/Smart роутер
- Отдельный Supervisor для технических CNC-запросов и фото
- Приём фото экрана стойки с iPhone
- Локальное сжатие фото до отправки
- PWA: можно добавить на главный экран iPhone
- Один Railway service: frontend + backend вместе
- API-ключ существует только на сервере

## 1. Локальный запуск

Нужен Node.js 20+.

```bash
npm install
cp .env.example .env
```

Открой `.env` и вставь НОВЫЙ ключ:

```env
OPENAI_API_KEY=sk-proj_...
FAST_MODEL=gpt-5-mini
SMART_MODEL=gpt-5.6-sol
SUPERVISOR_MODEL=gpt-5.6-sol
ENABLE_SUPERVISOR=true
PORT=3000
```

Потом:

```bash
npm run dev
```

Открой:

```text
http://localhost:3000
```

Проверка компиляции:

```bash
npm run check
npm run build
npm start
```

## 2. Проверить модели, доступные твоему API-ключу

После запуска открой:

```text
http://localhost:3000/api/models
```

Ты увидишь реальные model IDs, доступные именно этому OpenAI API project.
После этого можешь заменить `FAST_MODEL`, `SMART_MODEL` и `SUPERVISOR_MODEL`.

Важно: модель, используемая внутри ChatGPT, и публичный API model ID — не одно и то же.
Поэтому не надо угадывать название модели: бери ID из `/api/models`.

## 3. Railway

Самый простой вариант:

1. Создай новый GitHub repository и залей туда содержимое этой папки.
2. В Railway: **New Project → Deploy from GitHub repo**.
3. В Variables добавь:
   - `OPENAI_API_KEY`
   - `FAST_MODEL`
   - `SMART_MODEL`
   - `SUPERVISOR_MODEL`
   - `ENABLE_SUPERVISOR=true`
4. Build command:
   ```text
   npm run build
   ```
5. Start command:
   ```text
   npm start
   ```
6. Healthcheck path:
   ```text
   /api/health
   ```

Railway сам передаст `PORT`; вручную там его обычно задавать не нужно.

## 4. iPhone 14 Pro

Открой публичный Railway URL в Safari.

Чтобы поставить как приложение:

**Share → Add to Home Screen**

Интерфейс использует:
- `viewport-fit=cover`
- `env(safe-area-inset-top/bottom)`
- `100dvh`
- кнопку камеры `capture="environment"`

То есть Dynamic Island / верхняя safe area и нижний home indicator учтены.

## 5. Старые ключи

Не отзывай старый рабочий ключ до того, как новый Railway service:
- проходит `/api/health`;
- отвечает на обычный текст;
- принимает фото;
- успешно делает Smart + Supervisor ответ.

После этого старые OpenAI API keys можно revoke, а старый Railway service — выключить.

## 6. Стоимость и задержка

`ENABLE_SUPERVISOR=true` делает второй модельный запрос только для Smart/CNC/фото
задач. Это повышает качество контроля, но увеличивает цену и задержку.

Если нужно дешевле:

```env
ENABLE_SUPERVISOR=false
```

## 7. Безопасность

Никогда не:
- вставляй API key в `public/app.js`;
- коммить `.env`;
- показывай ключ в скриншотах;
- отправляй ключ в чат.

Если ключ когда-либо оказался публично — revoke и создай новый.

## Исправления в сборке FINAL v5

Эта сборка уже содержит исправления, найденные при Railway-деплое:

- Express 5: fallback использует `app.use(...)`, а не `app.get("*")`.
- Путь frontend исправлен на `/app/public` после TypeScript build.
- Markdown ответов рендерится безопасно без `innerHTML`.
- Поддерживаются заголовки, списки, **жирный текст**, `inline code` и fenced code blocks.
- `app.js?v=5` принудительно обходит старый browser cache.
- Service Worker v5 использует network-first для HTML/JS/CSS, чтобы новые Railway deploy не зависали на старом кэше.

После замены файлов в GitHub достаточно сделать commit в `main`; Railway должен пересобраться автоматически.


## v6 — cache/Markdown fix

В этой сборке frontend-файлы переименованы в `app-v6.js` и `styles-v6.css`.
Старый Service Worker автоматически удаляется, а HTML/JS/CSS отдаются с `Cache-Control: no-store`.

После успешного deploy в верхней строке состояния должно быть видно `UI v6`.
Если видно `UI v6`, браузер точно загрузил новую сборку.


## v7 — Память станка

В верхней панели появилась кнопка **Память**.

Память разделена на:
- станок и стойку;
- материалы;
- инструмент;
- подтверждённые M-коды / OEM-функции;
- подтверждённые режимы и настройки;
- прочие подтверждённые заметки.

Память хранится в `localStorage` браузера и автоматически отправляется модели с каждым запросом.
Кнопка **Новый чат** очищает только историю диалога — память остаётся.

Для переноса между ноутбуком и iPhone:
1. Память → Экспорт.
2. На другом устройстве: Память → Импорт.

Важно: браузерная память устройства не является облачной базой данных. Для общей синхронизации между
устройствами позже можно подключить Railway Postgres.


## v8 — Защита приложения паролем

Перед облачной памятью добавлена авторизация, потому что публичный Railway URL без защиты
позволил бы постороннему человеку расходовать OpenAI API-баланс.

В Railway Variables обязательно добавь:

```text
APP_PASSWORD=<длинный приватный пароль>
```

Пароль не попадает в frontend-код и не отправляется OpenAI.

После успешного входа сервер устанавливает HttpOnly cookie с `SameSite=Strict`.
Сам пароль в `localStorage` не хранится.

Защищены:
- `/api/chat`
- `/api/models`

Публичными остаются только:
- статический интерфейс;
- `/api/health`;
- `/api/auth/status`;
- `/api/auth/login`.

Следующий логичный этап после проверки v8 — Railway Postgres для общей памяти
между iPhone и ноутбуком.
