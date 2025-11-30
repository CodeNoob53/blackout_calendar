# Налаштування та Запуск

## Вимоги
- Node.js v18+
- NPM або Yarn

## Встановлення

1. Клонуйте репозиторій:
```bash
git clone https://github.com/your-username/blackout-calendar.git
cd blackout-calendar
```

2. Встановіть залежності:
```bash
yarn install
# або
npm install
```

3. Налаштуйте змінні середовища:
Скопіюйте приклад конфігурації:
```bash
cp .env.example .env
```

Відредагуйте `.env` за потреби:
```env
PORT=3000
NODE_ENV=development
AUTO_UPDATE=true
UPDATE_INTERVAL=*/30 * * * *
TELEGRAM_CHANNEL_URL=https://t.me/s/Zaporizhzhyaoblenergo_news
```

## Запуск

### Режим розробки
З автоматичним перезавантаженням (nodemon):
```bash
yarn dev
```

### Продакшн
```bash
yarn start
```

## Тестування

Запуск тестів (Jest):
```bash
yarn test
```

Перевірка стилю коду (ESLint):
```bash
yarn lint
```

## Deployment (Render.com)

### Підготовка проекту

1. Переконайтесь, що `yarn.lock` закомічений в git:
```bash
git add yarn.lock
git commit -m "chore: add yarn.lock"
```

2. Переконайтесь, що `.env` додано в `.gitignore` (не публікуйте секрети!)

### Налаштування на Render

1. **Service Type**: Web Service
2. **Build Command**: `yarn install`
3. **Start Command**: `node src/server.js`
4. **Environment Variables** (додайте у Render Dashboard):
   - `NODE_ENV=production`
   - `AUTO_UPDATE=true`
   - `UPDATE_INTERVAL=*/30 * * * *`
   - `TELEGRAM_CHANNEL_URL=https://t.me/s/Zaporizhzhyaoblenergo_news`
   - `PORT` (встановлюється автоматично Render)

### Важливо

- База даних SQLite автоматично створюється при першому запуску
- Директорія `data/` створюється автоматично в `src/db.js`
- Render використовує Node.js v22 за замовчуванням

### Live API

🌐 **Production URL**: https://blackout-calendar.onrender.com
📚 **Swagger Docs**: https://blackout-calendar.onrender.com/api-docs
