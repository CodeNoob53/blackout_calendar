export class ResponseFormatter {
  static success(data) {
    return { success: true, ...data };
  }

  static error(message, statusCode = 500) {
    return {
      response: { success: false, error: message },
      statusCode
    };
  }

  static notFound(message) {
    return this.error(message, 404);
  }

  static formatScheduleData(schedule) {
    const groupedByQueue = schedule.reduce((acc, item) => {
      if (!acc[item.queue]) {
        acc[item.queue] = [];
      }
      acc[item.queue].push({
        start: item.start_time,
        end: item.end_time
      });
      return acc;
    }, {});

    return Object.entries(groupedByQueue).map(([queue, intervals]) => ({
      queue,
      intervals
    }));
  }

  static formatQueueSchedule(schedule) {
    return schedule.map(s => ({
      start: s.start_time,
      end: s.end_time
    }));
  }

  static formatMetadata(metadata) {
    return {
      date: metadata.date,
      source: metadata.source || 'telegram',
      lastUpdated: metadata.last_updated_at,
      firstPublished: metadata.first_published_at,
      updateCount: metadata.update_count,
      changeType: metadata.change_type,
      sourcePostId: metadata.source_msg_id,
      messageDate: metadata.message_date
    };
  }

  static formatHistory(history) {
    return history.map(h => ({
      changeType: h.change_type,
      sourcePostId: h.source_msg_id,
      messageDate: h.message_date,
      detectedAt: h.detected_at,
      data: JSON.parse(h.data_json)
    }));
  }

  static formatUpdate(update) {
    return {
      date: update.date,
      source: update.source || 'telegram',
      lastUpdated: update.last_updated_at,
      changeType: update.change_type,
      updateCount: update.update_count,
      sourcePostId: update.source_msg_id,
      messageDate: update.message_date
    };
  }

  static formatNewSchedule(schedule, t = (k) => k) {
    const source = schedule.source || 'telegram';
    const sourceText = source === 'telegram'
      ? t('sources.telegram')
      : t('sources.zoe');

    const dateStr = this.formatDate(schedule.date, 'uk'); // Keep 'uk' default for now or pass locale

    return {
      date: schedule.date,
      source: source,
      publishedAt: schedule.first_published_at,
      messageDate: schedule.message_date,
      sourcePostId: schedule.source_msg_id,
      pushMessage: t('schedule.newScheduleAvailable', { date: dateStr }) + `\n ` + t('common.source') + `: ${sourceText}`
    };
  }

  static formatUpdatedSchedule(schedule, t = (k) => k) {
    const updateTime = new Date(schedule.message_date || schedule.last_updated_at);
    const timeStr = updateTime.toLocaleTimeString('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Kiev'
    });
    const source = schedule.source || 'telegram';
    const sourceText = source === 'telegram' ? t('sources.telegram') : t('sources.zoe');

    const dateStr = this.formatDate(schedule.date, 'uk');

    return {
      date: schedule.date,
      source: source,
      updatedAt: schedule.message_date || schedule.last_updated_at,
      messageDate: schedule.message_date,
      sourcePostId: schedule.source_msg_id,
      updateCount: schedule.update_count,
      pushMessage: t('schedule.scheduleUpdated', { date: dateStr, time: timeStr }) + `\n ` + t('common.source') + `: ${sourceText}`
    };
  }

  static formatDate(dateStr, locale = 'uk') {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'uk' ? 'uk-UA' : 'en-US', {
      day: 'numeric',
      month: 'long'
    });
  }
}
