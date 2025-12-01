/**
 * Українська локалізація
 */
export default {
  common: {
    success: 'Успішно',
    error: 'Помилка',
  },

  errors: {
    tooManyRequests: 'Занадто багато запитів. Спробуйте пізніше.',
    tooManyRequestsSearch: 'Занадто багато запитів пошуку. Спробуйте через 5 хвилин.',
    tooManyRequestsUpdates: 'Занадто багато запитів до updates. Спробуйте пізніше.',
    invalidDateFormat: 'Невірний формат дати. Використовуйте YYYY-MM-DD',
    invalidQueueFormat: 'Невірний формат черги. Використовуйте X.X',
    scheduleNotFound: 'Графік на {{date}} не знайдено',
    queueNotFound: 'Графік для черги {{queue}} не знайдено',
    metadataNotFound: 'Метадані для {{date}} не знайдено',
    addressNotFound: 'Адресу "{{address}}" не знайдено в базі',
    noSchedulesAvailable: 'Немає доступних графіків',
    queryRequired: 'Параметр "q" обов\'язковий',
    queryTooShort: 'Пошуковий запит має містити мінімум 3 символи',
    addressRequired: 'Параметр "address" обов\'язковий',
    limitInvalid: 'Limit має бути від 1 до 100',
    hoursInvalid: 'Hours має бути від 1 до 720',
  },

  api: {
    statusOk: 'ok',
    message: 'Blackout Calendar API ⚡',
    version: '2.0.0',

    endpoints: {
      schedules: {
        latest: 'Отримати останній доступний графік',
        todayStatus: 'Перевірити наявність графіку на сьогодні',
        dates: 'Список всіх доступних дат',
        queueLatest: 'Останній графік для конкретної черги',
        byDate: 'Отримати графік на дату (YYYY-MM-DD)',
        metadata: 'Метадані графіку (час оновлення, кількість змін)',
        byQueueAndDate: 'Графік для конкретної черги на дату',
      },
      updates: {
        new: 'Нові графіки за останні N годин (?hours=24)',
        changed: 'Змінені графіки за останні N годин (?hours=24)',
      },
      addresses: {
        search: 'Пошук адрес за вулицею (мінімум 3 символи)',
        exact: 'Пошук за точною адресою',
      },
    },

    rateLimits: {
      schedules: '200 запитів / 15 хвилин',
      updates: '60 запитів / 15 хвилин',
      addresses: '30 запитів / 5 хвилин',
      general: '100 запитів / 15 хвилин (для всього API)',
    },

    changes: {
      v2: [
        'Переписано на класову архітектуру',
        'Додано валідацію параметрів запитів',
        'Оновлено структуру URL (більш RESTful)',
        'Покращено обробку помилок',
        'Додано форматування відповідей',
        'Додано rate limiting для захисту API',
        'Додано підтримку двох мов (українська/англійська)',
      ],
    },
  },

  schedule: {
    todayAvailable: 'Графік на сьогодні доступний',
    todayNotAvailable: 'Графік на сьогодні ще не опублікований',
    newScheduleAvailable: 'Доступний графік за {{date}}',
    scheduleUpdated: 'Увага! Внесено зміни за {{date}} о {{time}}',
  },

  months: {
    genitive: [
      'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
      'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
    ],
  },
};
