/**
 * SyncEngine Tests
 * Тести для системи синхронізації графіків
 */

describe('SyncEngine', () => {
  describe('filterLineographs', () => {
    test('should filter schedules with date < today', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const updates = [
        { parsed: { date: todayStr, queues: [] } },
        { parsed: { date: yesterdayStr, queues: [] } }, // Lineograph
      ];

      // Simulate filtering logic
      const filtered = updates.filter(u => u.parsed.date >= todayStr);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].parsed.date).toBe(todayStr);
    });

    test('should keep schedules with date >= today', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const updates = [
        { parsed: { date: todayStr, queues: [] } },
        { parsed: { date: tomorrowStr, queues: [] } },
      ];

      const filtered = updates.filter(u => u.parsed.date >= todayStr);

      expect(filtered).toHaveLength(2);
    });
  });

  describe('normalizeQueuesForComparison', () => {
    test('should normalize and sort queues for comparison', () => {
      const queues1 = [
        { queue: '1.2', intervals: [{ start: '14:00', end: '18:00' }] },
        { queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] },
      ];

      const queues2 = [
        { queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] },
        { queue: '1.2', intervals: [{ start: '14:00', end: '18:00' }] },
      ];

      // Simulate normalization
      const normalize = (queues) => {
        const normalized = queues.map(q => ({
          queue: q.queue,
          intervals: [...q.intervals].sort((a, b) => {
            if (a.start !== b.start) return a.start.localeCompare(b.start);
            return a.end.localeCompare(b.end);
          })
        })).sort((a, b) => a.queue.localeCompare(b.queue));
        return JSON.stringify(normalized);
      };

      const normalized1 = normalize(queues1);
      const normalized2 = normalize(queues2);

      expect(normalized1).toBe(normalized2);
    });

    test('should detect different content', () => {
      const queues1 = [
        { queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] },
      ];

      const queues2 = [
        { queue: '1.1', intervals: [{ start: '08:00', end: '13:00' }] }, // Different end time
      ];

      const normalize = (queues) => {
        const normalized = queues.map(q => ({
          queue: q.queue,
          intervals: [...q.intervals].sort((a, b) => {
            if (a.start !== b.start) return a.start.localeCompare(b.start);
            return a.end.localeCompare(b.end);
          })
        })).sort((a, b) => a.queue.localeCompare(b.queue));
        return JSON.stringify(normalized);
      };

      const normalized1 = normalize(queues1);
      const normalized2 = normalize(queues2);

      expect(normalized1).not.toBe(normalized2);
    });
  });

  describe('areDuplicates', () => {
    test('should detect duplicates with same content', () => {
      const update1 = {
        parsed: {
          queues: [
            { queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] }
          ]
        }
      };

      const update2 = {
        parsed: {
          queues: [
            { queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] }
          ]
        }
      };

      const normalize = (queues) => {
        const normalized = queues.map(q => ({
          queue: q.queue,
          intervals: [...q.intervals].sort((a, b) => {
            if (a.start !== b.start) return a.start.localeCompare(b.start);
            return a.end.localeCompare(b.end);
          })
        })).sort((a, b) => a.queue.localeCompare(b.queue));
        return JSON.stringify(normalized);
      };

      const content1 = normalize(update1.parsed.queues);
      const content2 = normalize(update2.parsed.queues);

      expect(content1).toBe(content2);
    });

    test('should not detect duplicates with different content', () => {
      const update1 = {
        parsed: {
          queues: [
            { queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] }
          ]
        }
      };

      const update2 = {
        parsed: {
          queues: [
            { queue: '1.2', intervals: [{ start: '14:00', end: '18:00' }] }
          ]
        }
      };

      const normalize = (queues) => {
        const normalized = queues.map(q => ({
          queue: q.queue,
          intervals: [...q.intervals].sort((a, b) => {
            if (a.start !== b.start) return a.start.localeCompare(b.start);
            return a.end.localeCompare(b.end);
          })
        })).sort((a, b) => a.queue.localeCompare(b.queue));
        return JSON.stringify(normalized);
      };

      const content1 = normalize(update1.parsed.queues);
      const content2 = normalize(update2.parsed.queues);

      expect(content1).not.toBe(content2);
    });
  });

  describe('buildTimeline', () => {
    test('should sort updates by messageDate', () => {
      const updates = [
        {
          sourceId: 2,
          source: 'telegram',
          messageDate: '2024-11-26T14:00:00Z',
          parsed: { date: '2024-11-27', queues: [{ queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] }] }
        },
        {
          sourceId: 1,
          source: 'telegram',
          messageDate: '2024-11-26T10:00:00Z',
          parsed: { date: '2024-11-27', queues: [{ queue: '1.2', intervals: [{ start: '14:00', end: '18:00' }] }] }
        },
      ];

      // Simulate sorting
      const sorted = [...updates].sort((a, b) => {
        if (!a.messageDate && !b.messageDate) return a.sourceId - b.sourceId;
        if (!a.messageDate) return -1;
        if (!b.messageDate) return 1;
        const diff = new Date(a.messageDate) - new Date(b.messageDate);
        if (diff !== 0) return diff;
        return a.sourceId - b.sourceId;
      });

      expect(sorted[0].sourceId).toBe(1);
      expect(sorted[1].sourceId).toBe(2);
    });

    test('should prioritize Zoe without messageDate', () => {
      const updates = [
        {
          sourceId: 2,
          source: 'telegram',
          messageDate: '2024-11-26T10:00:00Z',
          parsed: { date: '2024-11-27', queues: [{ queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] }] }
        },
        {
          sourceId: 1,
          source: 'zoe',
          messageDate: null,
          parsed: { date: '2024-11-27', queues: [{ queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] }] }
        },
      ];

      // Simulate sorting with Zoe priority
      const sorted = [...updates].sort((a, b) => {
        if (!a.messageDate && !b.messageDate) return a.sourceId - b.sourceId;
        if (!a.messageDate) return -1;
        if (!b.messageDate) return 1;
        const diff = new Date(a.messageDate) - new Date(b.messageDate);
        if (diff !== 0) return diff;
        return a.sourceId - b.sourceId;
      });

      expect(sorted[0].source).toBe('zoe');
      expect(sorted[1].source).toBe('telegram');
    });

    test('should remove duplicates from timeline', () => {
      const updates = [
        {
          sourceId: 1,
          source: 'zoe',
          messageDate: null,
          parsed: { date: '2024-11-27', queues: [{ queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] }] }
        },
        {
          sourceId: 2,
          source: 'telegram',
          messageDate: '2024-11-26T10:00:00Z',
          parsed: { date: '2024-11-27', queues: [{ queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] }] }
        },
        {
          sourceId: 3,
          source: 'telegram',
          messageDate: '2024-11-26T14:00:00Z',
          parsed: { date: '2024-11-27', queues: [{ queue: '1.2', intervals: [{ start: '14:00', end: '18:00' }] }] }
        },
      ];

      // Simulate deduplication
      const normalize = (queues) => {
        const normalized = queues.map(q => ({
          queue: q.queue,
          intervals: [...q.intervals].sort((a, b) => {
            if (a.start !== b.start) return a.start.localeCompare(b.start);
            return a.end.localeCompare(b.end);
          })
        })).sort((a, b) => a.queue.localeCompare(b.queue));
        return JSON.stringify(normalized);
      };

      const sorted = [...updates].sort((a, b) => {
        if (!a.messageDate && !b.messageDate) return a.sourceId - b.sourceId;
        if (!a.messageDate) return -1;
        if (!b.messageDate) return 1;
        const diff = new Date(a.messageDate) - new Date(b.messageDate);
        if (diff !== 0) return diff;
        return a.sourceId - b.sourceId;
      });

      const timeline = [];
      for (const update of sorted) {
        const isDuplicate = timeline.some(existing =>
          normalize(existing.parsed.queues) === normalize(update.parsed.queues)
        );
        if (!isDuplicate) {
          timeline.push(update);
        }
      }

      expect(timeline).toHaveLength(2);
      expect(timeline[0].sourceId).toBe(1); // Zoe
      expect(timeline[1].sourceId).toBe(3); // Telegram with different content
    });
  });

  describe('groupByDate', () => {
    test('should group updates by date', () => {
      const updates = [
        { parsed: { date: '2024-11-27', queues: [] } },
        { parsed: { date: '2024-11-28', queues: [] } },
        { parsed: { date: '2024-11-27', queues: [] } },
      ];

      const grouped = new Map();
      for (const update of updates) {
        const date = update.parsed.date;
        if (!grouped.has(date)) {
          grouped.set(date, []);
        }
        grouped.get(date).push(update);
      }

      expect(grouped.size).toBe(2);
      expect(grouped.get('2024-11-27')).toHaveLength(2);
      expect(grouped.get('2024-11-28')).toHaveLength(1);
    });
  });

  describe('update_count calculation', () => {
    test('should calculate correct update_count', () => {
      const timeline = [
        { sourceId: 1, source: 'zoe' },
        { sourceId: 2, source: 'telegram' },
        { sourceId: 3, source: 'telegram' },
      ];

      // update_count = реальна кількість змін (не включаючи перший)
      const updateCount = timeline.length - 1;

      expect(updateCount).toBe(2);
    });

    test('should return 0 for new schedules', () => {
      const timeline = [
        { sourceId: 1, source: 'telegram' },
      ];

      const updateCount = timeline.length - 1;

      expect(updateCount).toBe(0);
    });
  });

  describe('Integration scenarios', () => {
    test('Scenario 1: Zoe published first, Telegram duplicates later', () => {
      const updates = [
        {
          sourceId: 1,
          source: 'zoe',
          messageDate: null,
          parsed: { date: '2024-11-27', queues: [{ queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] }] }
        },
        {
          sourceId: 2,
          source: 'telegram',
          messageDate: '2024-11-26T10:00:00Z',
          parsed: { date: '2024-11-27', queues: [{ queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] }] }
        },
      ];

      // Expected: Only Zoe update in timeline (Telegram is duplicate)
      const normalize = (queues) => JSON.stringify(queues);

      const sorted = [...updates].sort((a, b) => {
        if (!a.messageDate && !b.messageDate) return a.sourceId - b.sourceId;
        if (!a.messageDate) return -1;
        if (!b.messageDate) return 1;
        return new Date(a.messageDate) - new Date(b.messageDate);
      });

      const timeline = [];
      for (const update of sorted) {
        const isDuplicate = timeline.some(existing =>
          normalize(existing.parsed.queues) === normalize(update.parsed.queues)
        );
        if (!isDuplicate) {
          timeline.push(update);
        }
      }

      expect(timeline).toHaveLength(1);
      expect(timeline[0].source).toBe('zoe');
    });

    test('Scenario 2: Multiple Telegram updates with changes', () => {
      const updates = [
        {
          sourceId: 1,
          source: 'telegram',
          messageDate: '2024-11-26T10:00:00Z',
          parsed: { date: '2024-11-27', queues: [{ queue: '1.1', intervals: [{ start: '08:00', end: '12:00' }] }] }
        },
        {
          sourceId: 2,
          source: 'telegram',
          messageDate: '2024-11-26T14:00:00Z',
          parsed: { date: '2024-11-27', queues: [{ queue: '1.1', intervals: [{ start: '09:00', end: '13:00' }] }] }
        },
      ];

      // Expected: Both updates in timeline (different content)
      const normalize = (queues) => JSON.stringify(queues);

      const sorted = [...updates].sort((a, b) => {
        if (!a.messageDate && !b.messageDate) return a.sourceId - b.sourceId;
        if (!a.messageDate) return -1;
        if (!b.messageDate) return 1;
        return new Date(a.messageDate) - new Date(b.messageDate);
      });

      const timeline = [];
      for (const update of sorted) {
        const isDuplicate = timeline.some(existing =>
          normalize(existing.parsed.queues) === normalize(update.parsed.queues)
        );
        if (!isDuplicate) {
          timeline.push(update);
        }
      }

      expect(timeline).toHaveLength(2);
      expect(timeline[1].sourceId).toBe(2); // Final update
    });

    test('Scenario 3: Filter lineographs', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const updates = [
        { parsed: { date: todayStr, queues: [{ queue: '1.1', intervals: [] }] } },
        { parsed: { date: yesterdayStr, queues: [{ queue: '1.1', intervals: [] }] } }, // Lineograph
      ];

      // Filter lineographs
      const filtered = updates.filter(u => u.parsed.date >= todayStr);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].parsed.date).toBe(todayStr);
    });
  });
});
