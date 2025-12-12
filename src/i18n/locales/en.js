/**
 * English localization
 */
export default {
  common: {
    success: 'Success',
    error: 'Error',
    source: 'Source',
  },

  errors: {
    tooManyRequests: 'Too many requests. Please try again later.',
    tooManyRequestsUpdates: 'Too many requests to updates. Please try again later.',
    invalidDateFormat: 'Invalid date format. Use YYYY-MM-DD',
    invalidQueueFormat: 'Invalid queue format. Use X.X',
    scheduleNotFound: 'Schedule for {{date}} not found',
    queueNotFound: 'Schedule for queue {{queue}} not found',
    metadataNotFound: 'Metadata for {{date}} not found',
    noSchedulesAvailable: 'No schedules available',
    limitInvalid: 'Limit must be between 1 and 100',
    hoursInvalid: 'Hours must be between 1 and 720',
  },

  api: {
    statusOk: 'ok',
    message: 'Blackout Calendar API ⚡',
    version: '2.0.0',

    endpoints: {
      schedules: {
        latest: 'Get latest available schedule',
        todayStatus: 'Check if today\'s schedule is available',
        dates: 'List of all available dates',
        queueLatest: 'Latest schedule for specific queue',
        byDate: 'Get schedule by date (YYYY-MM-DD)',
        metadata: 'Schedule metadata (update time, change count)',
        byQueueAndDate: 'Schedule for specific queue and date',
      },
      updates: {
        new: 'New schedules from last N hours (?hours=24)',
        changed: 'Changed schedules from last N hours (?hours=24)',
      },
    },

    rateLimits: {
      schedules: '200 requests / 15 minutes',
      updates: '60 requests / 15 minutes',
      general: '100 requests / 15 minutes (for all API)',
    },

    changes: {
      v2: [
        'Rewritten with class-based architecture',
        'Added request parameter validation',
        'Updated URL structure (more RESTful)',
        'Improved error handling',
        'Added response formatting',
        'Added rate limiting for API protection',
        'Added support for two languages (Ukrainian/English)',
      ],
    },
  },

  sources: {
    telegram: 'official Telegram channel of JSC "Zaporizhzhiaoblenergo"',
    zoe: 'official website zoe.com.ua',
  },

  schedule: {
    todayAvailable: 'Today\'s schedule is available',
    todayNotAvailable: 'Today\'s schedule not yet published',
    newScheduleAvailable: 'Schedule for {{date}} is available',
    scheduleUpdated: 'Attention! Changes made to {{date}} at {{time}}',
  },

  months: {
    genitive: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ],
  },
};
