import { parseScheduleMessage } from '../../src/scraper/parser.js';

describe('parseScheduleMessage', () => {
  it('parses queues with emoji bullet prefix', () => {
    const text = `11 ЛЮТОГО ПО ЗАПОРІЗЬКІЙ ОБЛАСТІ ДІЯТИМУТЬ ГПВ

🔹1.1: 00:00 – 05:00, 09:00 – 14:00, 18:00 – 23:00
🔹1.2: 00:00 – 05:00, 09:00 – 14:00, 18:00 – 23:00
🔹2.1: 00:00 – 00:30, 04:30 – 09:30, 13:30 – 18:30, 22:30 – 24:00`;

    const result = parseScheduleMessage(text);

    expect(result.queues).toHaveLength(3);
    expect(result.queues[0]).toEqual({
      queue: '1.1',
      intervals: [
        { start: '00:00', end: '05:00' },
        { start: '09:00', end: '14:00' },
        { start: '18:00', end: '23:00' }
      ]
    });
    expect(result.queues[2]).toEqual({
      queue: '2.1',
      intervals: [
        { start: '00:00', end: '00:30' },
        { start: '04:30', end: '09:30' },
        { start: '13:30', end: '18:30' },
        { start: '22:30', end: '00:00' }
      ]
    });
  });

  it('still parses old format without emoji', () => {
    const text = `1.1: 00:00 – 02:00\n2.2: 02:00 – 04:00`;

    const result = parseScheduleMessage(text);

    expect(result.queues).toHaveLength(2);
    expect(result.queues.map((q) => q.queue)).toEqual(['1.1', '2.2']);
  });

  it('parses lightning-prefixed format with intervals on separate lines', () => {
    const text = `За терміновою вказівкою НЕК "Укренерго" оновлено графік погодинних відключень на 03 листопада:

⚡ Черга 1.1
 з 09:00 до 13:00
 з 16:00 до 20:00

⚡ Черга 1.2
 з 09:00 до 13:00
 з 16:00 до 20:00

⚡ Черга 3.2
 з 05:30 до 09:30
 з 12:30 до 16:30
 з 19:30 до 22:30

⚡ Черга 6.2
 з 05:30 до 09:30
 з 12:30 до 16:30
 з 19:30 до 22:30`;

    const result = parseScheduleMessage(text, '2026-11-03T10:00:00Z');

    expect(result.date).toBe('2026-11-03');
    expect(result.queues.map((q) => q.queue)).toEqual(['1.1', '1.2', '3.2', '6.2']);
    expect(result.queues[0].intervals).toEqual([
      { start: '09:00', end: '13:00' },
      { start: '16:00', end: '20:00' }
    ]);
    expect(result.queues[2].intervals).toEqual([
      { start: '05:30', end: '09:30' },
      { start: '12:30', end: '16:30' },
      { start: '19:30', end: '22:30' }
    ]);
  });
});
