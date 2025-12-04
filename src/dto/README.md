# DTO (Data Transfer Objects)

Система DTO для стандартизації та валідації структур даних.

## Структура

```
src/dto/
├── BaseDTO.js           # Базовий клас з валідацією
├── ScheduleDTO.js       # DTO для графіків відключень
├── AddressDTO.js        # DTO для адрес
├── ResponseDTO.js       # DTO для API відповідей
├── index.js            # Централізований експорт
└── README.md           # Документація
```

## Створені DTO класи

### BaseDTO
Базовий клас для всіх DTO з методами:
- `validate()` - валідація даних
- `toObject()` - конвертація в простий JS об'єкт
- `toJSON()` - серіалізація в JSON
- `get(field, defaultValue)` - отримати значення поля
- `set(field, value)` - встановити значення
- Статичні методи валідації: `isValidDate()`, `isValidQueue()`, `isValidTime()`, etc.

### Schedule DTOs (8 класів)

#### 1. OutageIntervalDTO
Інтервал відключення: `{ start: "08:00", end: "12:00" }`

#### 2. QueueScheduleDTO
Графік для черги: `{ queue: "1.1", intervals: [...] }`

#### 3. ScheduleByDateDTO
Графік за датою: `{ date: "2024-01-15", queues: [...] }`

#### 4. ScheduleByQueueDTO
Графік за чергою: `{ queue: "1.1", date: "2024-01-15", intervals: [...] }`

#### 5. DatesListDTO
Список дат: `{ dates: ["2024-01-15", ...], pagination?: {...} }`

#### 6. TodayStatusDTO
Статус на сьогодні: `{ today: "2024-01-15", available: true, message: "..." }`

#### 7. ScheduleMetadataDTO
Метадані: `{ date: "2024-01-15", metadata: {...} }`

#### 8. UpdatesListDTO
Список оновлень: `{ hours: 24, count: 3, schedules: [...] }`

### Address DTOs (4 класи)

#### 1. AddressDTO
Одна адреса: `{ id, full_address, street, house, queue }`

#### 2. AddressSearchResultDTO
Результати пошуку: `{ query, count, addresses: [...], total?, truncated?, error? }`

#### 3. AddressListDTO
Список адрес: `{ addresses: [...] }`

#### 4. AddressStatisticsDTO
Статистика: `{ total, unique_streets, with_queue, without_queue }`

### Response DTOs (5 класів)

#### 1. SuccessResponseDTO
Успішна відповідь: `{ success: true, data: {...} }`

#### 2. ErrorResponseDTO
Помилка: `{ success: false, error: { message, details? } }`

#### 3. NotFoundResponseDTO
Не знайдено (404): extends ErrorResponseDTO

#### 4. ValidationErrorResponseDTO
Помилка валідації (400): extends ErrorResponseDTO з validationErrors

#### 5. PaginatedResponseDTO
Відповідь з пагінацією: `{ success: true, data: { items: [...], pagination: {...} } }`

## Приклади використання

### Базове використання

```javascript
import { ScheduleByDateDTO } from './dto/index.js';

// Створення DTO
const dto = new ScheduleByDateDTO({
  date: '2024-01-15',
  queues: [
    {
      queue: '1.1',
      intervals: [
        { start: '08:00', end: '12:00' }
      ]
    }
  ]
});

// Валідація
if (dto.validate()) {
  console.log('Дані валідні');
  const obj = dto.toObject(); // Отримати чистий об'єкт
} else {
  console.error('Помилки:', dto.getErrors());
}
```

### Використання в Service Layer

```javascript
import { ScheduleByDateDTO } from '../dto/index.js';
import { ScheduleRepository } from '../repositories/ScheduleRepository.js';

export class ScheduleService {
  static getScheduleByDate(date) {
    const schedule = ScheduleRepository.findByDate(date);

    if (!schedule || schedule.length === 0) {
      return null;
    }

    // Створюємо DTO для стандартизації та валідації
    const dto = new ScheduleByDateDTO({
      date,
      queues: ResponseFormatter.formatScheduleData(schedule)
    });

    // Валідуємо перед поверненням
    if (!dto.validate()) {
      console.error('Data validation failed:', dto.getErrors());
      return null;
    }

    return dto.toObject();
  }
}
```

### Використання Response DTOs

```javascript
import { ResponseDTOFactory } from '../dto/index.js';

export class ScheduleController {
  static getScheduleByDate(req, res) {
    const { date } = req.params;
    const result = ScheduleService.getScheduleByDate(date);

    if (!result) {
      // Використання фабрики для створення помилки 404
      const errorDTO = ResponseDTOFactory.notFound(`Графік на ${date} не знайдено`);
      return res.status(errorDTO.getStatusCode()).json(errorDTO.toObject());
    }

    // Успішна відповідь
    const successDTO = ResponseDTOFactory.success(result);
    res.json(successDTO.toObject());
  }
}
```

### Валідація з деталями помилок

```javascript
import { AddressSearchResultDTO } from '../dto/index.js';

const dto = new AddressSearchResultDTO({
  query: 'вул',
  count: 0,
  addresses: [],
  error: 'Мінімальна довжина запиту: 3 символи'
});

if (!dto.validate()) {
  const errors = dto.getErrors();
  console.log('Validation errors:', errors);
  // [{ field: 'query', message: '...' }, ...]
}
```

### Використання фабрики Response

```javascript
import { ResponseDTOFactory } from '../dto/index.js';

// Успішна відповідь
const success = ResponseDTOFactory.success({ message: 'OK' });

// Помилка
const error = ResponseDTOFactory.error('Something went wrong', 500);

// Не знайдено
const notFound = ResponseDTOFactory.notFound('Resource not found');

// Валідаційна помилка
const validationError = ResponseDTOFactory.validationError(
  'Validation failed',
  [
    { field: 'email', message: 'Invalid email' },
    { field: 'password', message: 'Too short' }
  ]
);

// Пагінація
const paginated = ResponseDTOFactory.paginated(
  [item1, item2],
  {
    total: 100,
    limit: 10,
    offset: 0,
    hasMore: true
  }
);
```

## Переваги використання DTO

1. **Стандартизація** - Єдина структура даних у всьому додатку
2. **Валідація** - Автоматична перевірка коректності даних
3. **Типобезпека** - Чітко визначені структури
4. **Документація** - DTO служать документацією API
5. **Тестування** - Легко тестувати валідацію та перетворення
6. **Рефакторинг** - Легко змінювати структури даних

## Інтеграція з існуючим кодом

DTO можна інтегрувати поступово:
1. Почати з нових endpoints
2. Додати до Service Layer для валідації
3. Використовувати ResponseDTO в контролерах
4. Поступово мігрувати існуючий код

## Розширення

Щоб додати нові DTO:
1. Створіть клас, що розширює BaseDTO
2. Реалізуйте метод `validate()`
3. Реалізуйте метод `toObject()`
4. Додайте експорт в index.js

```javascript
export class MyCustomDTO extends BaseDTO {
  validate() {
    super.validate();

    // Ваша валідація
    if (!this.get('requiredField')) {
      this.addError('requiredField', 'Field is required');
    }

    return !this.hasErrors();
  }

  toObject() {
    return {
      field1: this.get('field1'),
      field2: this.get('field2')
    };
  }
}
```
