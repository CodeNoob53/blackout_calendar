# 🔐 API Keys Documentation

## Overview

Blackout Calendar API використовує **API Key Authentication** для захисту endpoints. Є два типи ключів:

1. **Public API Key** (`boc_pub_xxx`) - Read-only доступ для фронтенду та публічних додатків
2. **Admin API Key** (`boc_adm_xxx`) - Повний доступ для адміністративних операцій

---

## Генерація API Keys

### Автоматична генерація

```bash
npm run generate:api-keys
# або
yarn generate:api-keys
```

Скрипт згенерує два безпечні ключі:
- `PUBLIC_API_KEY=boc_pub_xxxxx`
- `ADMIN_API_KEY=boc_adm_xxxxx`

### Додавання до .env

Скопіюйте згенеровані ключі у ваш `.env` файл:

```env
# Public API Key - для фронтенду
PUBLIC_API_KEY=boc_pub_4uU_1J0q7c2Agvuy_K9ou5LFGsP_brXMCG-iy5YWMJ0

# Admin API Key - для адміністративних операцій
ADMIN_API_KEY=boc_adm_ib5cUpAfvWWPzO1AqKAmLQVDnXI4BsranqnWxLxh8PA
```

⚠️ **ВАЖЛИВО:**
- Ніколи не комітьте `.env` у git
- Додайте `.env` до `.gitignore`
- Тримайте ключі в секреті

---

## Формат API Key

API ключі мають наступний формат:

```
boc_[type]_[random_data]

boc      - Blackout Calendar prefix
[type]   - pub (public) або adm (admin)
[random] - 32 байти випадкових даних (base64url encoded)
```

**Приклади:**
- `boc_pub_4uU_1J0q7c2Agvuy_K9ou5LFGsP_brXMCG-iy5YWMJ0`
- `boc_adm_ib5cUpAfvWWPzO1AqKAmLQVDnXI4BsranqnWxLxh8PA`

---

## Використання API Keys

### У запитах

API ключ може бути переданий двома способами:

#### 1. HTTP Header (рекомендовано)

```bash
curl -H "X-API-Key: boc_pub_xxxxx" \
  https://blackout-calendar.onrender.com/api/schedules/latest
```

#### 2. Query Parameter (для простих випадків)

```bash
curl "https://blackout-calendar.onrender.com/api/schedules/latest?api_key=boc_pub_xxxxx"
```

### У JavaScript (Fetch)

```javascript
const response = await fetch('/api/schedules/latest', {
  headers: {
    'X-API-Key': 'boc_pub_xxxxx'
  }
});
```

### У Axios

```javascript
axios.get('/api/schedules/latest', {
  headers: {
    'X-API-Key': 'boc_pub_xxxxx'
  }
});
```

---

## Рівні доступу

### Public API Key

**Доступ:**
- ✅ Читання графіків (`GET /api/schedules/*`)
- ✅ Підписка на сповіщення (`POST /api/notifications/subscribe`)
- ✅ Відписка від сповіщень (`POST /api/notifications/unsubscribe`)
- ✅ Оновлення черги (`POST /api/notifications/update-queue`)
- ✅ Отримання VAPID ключа (`GET /api/notifications/vapid-key`)
- ❌ Адміністративні операції

**Використання:**
- Фронтенд додатки
- Мобільні додатки
- Публічні інтеграції

### Admin API Key

**Доступ:**
- ✅ Усе що доступно Public Key
- ✅ Тестові сповіщення (`POST /api/notifications/test`)
- ✅ Загальні тести (`POST /api/notifications/test-general`)
- ✅ Перепланування сповіщень (`POST /api/notifications/reschedule`)
- ✅ Статистика підписок (`GET /api/notifications/subscriptions/count`)
- ✅ Статистика сповіщень (`GET /api/notifications/schedule-stats`)

**Використання:**
- Адмін панель
- Внутрішні інструменти
- CI/CD пайплайни
- Моніторинг системи

---

## Endpoints та Required Keys

| Endpoint | Method | Required Key | Description |
|----------|--------|--------------|-------------|
| `/api/schedules/*` | GET | Public | Отримання графіків |
| `/api/notifications/vapid-key` | GET | Public | VAPID public key |
| `/api/notifications/subscribe` | POST | Public | Підписка |
| `/api/notifications/unsubscribe` | POST | Public | Відписка |
| `/api/notifications/update-queue` | POST | Public | Оновлення черги |
| `/api/notifications/test` | POST | **Admin** | Тестове сповіщення |
| `/api/notifications/test-general` | POST | **Admin** | Загальний тест |
| `/api/notifications/reschedule` | POST | **Admin** | Перепланування |
| `/api/notifications/subscriptions/count` | GET | **Admin** | Статистика |
| `/api/notifications/schedule-stats` | GET | **Admin** | Статистика сповіщень |

---

## Коди помилок

### 401 Unauthorized - Missing API Key

```json
{
  "success": false,
  "error": "API key is required",
  "message": "Please provide an API key in X-API-Key header or api_key query parameter"
}
```

**Рішення:** Додайте API ключ до запиту

### 403 Forbidden - Invalid API Key

```json
{
  "success": false,
  "error": "Invalid API key",
  "message": "Invalid or expired API key"
}
```

**Рішення:** Перевірте правильність ключа

### 403 Forbidden - Insufficient Permissions

```json
{
  "success": false,
  "error": "Invalid API key",
  "message": "This endpoint requires an admin API key"
}
```

**Рішення:** Використайте Admin API Key замість Public

---

## Безпека

### Best Practices

1. **Тримайте ключі в секреті**
   ```bash
   # ❌ НЕ РОБІТЬ ТАК
   const API_KEY = 'boc_pub_xxxxx';  // Хардкод у коді

   # ✅ ПРАВИЛЬНО
   const API_KEY = process.env.PUBLIC_API_KEY;  // З .env
   ```

2. **Різні ключі для різних оточень**
   ```bash
   # .env.development
   PUBLIC_API_KEY=boc_pub_dev_xxxxx

   # .env.production
   PUBLIC_API_KEY=boc_pub_prod_xxxxx
   ```

3. **Ротація ключів**
   - Генеруйте нові ключі періодично (раз на 3-6 місяців)
   - Зберігайте старі ключі активними на період переходу
   - Видаляйте старі ключі після міграції

4. **Моніторинг використання**
   - Логуйте всі запити з API ключами
   - Відстежуйте підозрілу активність
   - Блокуйте скомпрометовані ключі

### Що робити якщо ключ витік?

1. **Негайно згенеруйте нові ключі:**
   ```bash
   npm run generate:api-keys
   ```

2. **Оновіть `.env` на серверах:**
   - Production server (Render)
   - Development server
   - Staging server (якщо є)

3. **Оновіть ключі у фронтенді:**
   - Задеплойте новий public key
   - Оповістіть користувачів про необхідність оновлення

4. **Проаналізуйте логи:**
   - Перевірте чи був ключ використаний зловмисниками
   - Оцініть масштаб проблеми

---

## Swagger UI

API ключі підтримуються у Swagger UI:

1. Відкрийте https://blackout-calendar.onrender.com/api-docs
2. Натисніть кнопку **"Authorize"** вгорі
3. Введіть ваш API ключ
4. Натисніть **"Authorize"**
5. Тепер всі запити будуть використовувати ваш ключ

---

## Development vs Production

### Development

У development можна використовувати один ключ для всього:

```env
PUBLIC_API_KEY=boc_pub_dev_test123
ADMIN_API_KEY=boc_adm_dev_test123
```

### Production

У production використовуйте окремі secure ключі:

```env
# У Render Environment Variables
PUBLIC_API_KEY=boc_pub_<strong-random-key>
ADMIN_API_KEY=boc_adm_<strong-random-key>
```

---

## FAQ

### Q: Чи можна використовувати Admin Key у фронтенді?

**A:** ❌ НІ! Admin Key має залишатись на backend/internal tools. Фронтенд повинен використовувати тільки Public Key.

### Q: Як довго дійсні API ключі?

**A:** Ключі не мають терміну дії, але рекомендується ротувати їх періодично (3-6 місяців).

### Q: Чи можна мати кілька Public Keys?

**A:** Так, можна розширити middleware для підтримки масиву ключів:
```javascript
const PUBLIC_API_KEYS = [
  process.env.PUBLIC_API_KEY_1,
  process.env.PUBLIC_API_KEY_2,
];
```

### Q: Чи логуються API ключі?

**A:** Так, але тільки перші 10 символів для безпеки. Повні ключі НЕ логуються.

---

## Міграція існуючого коду

Якщо у вас вже є код без API keys:

### Before

```javascript
fetch('/api/schedules/latest')
  .then(res => res.json())
```

### After

```javascript
fetch('/api/schedules/latest', {
  headers: {
    'X-API-Key': process.env.REACT_APP_PUBLIC_API_KEY
  }
})
  .then(res => res.json())
```

---

**📚 Додаткові ресурси:**
- [API Reference](./API.md)
- [Authentication Best Practices](https://owasp.org/www-project-api-security/)
- [Environment Variables Guide](https://12factor.net/config)
