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
