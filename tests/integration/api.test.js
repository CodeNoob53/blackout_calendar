import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';
import scheduleRoutes from '../../src/routes/scheduleRoutes.js';
import updateRoutes from '../../src/routes/updateRoutes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

// Mock controllers to isolate routing/middleware behaviour
jest.mock('../../src/controllers/ScheduleController.js', () => ({
  getLatestSchedule: jest.fn((req, res) => res.json({ success: true, message: 'latest' })),
  getAllDates: jest.fn((req, res) => res.json({ success: true, message: 'dates' })),
  getScheduleByDate: jest.fn((req, res) => res.json({ success: true, message: 'schedule' })),
  getMetadata: jest.fn((req, res) => res.json({ success: true, message: 'metadata' })),
  getScheduleByQueue: jest.fn((req, res) => res.json({ success: true, message: 'queue' })),
  getLatestScheduleByQueue: jest.fn((req, res) => res.json({ success: true, message: 'queue-latest' })),
  getTodayStatus: jest.fn((req, res) => res.json({ success: true, message: 'today' })),
}));

jest.mock('../../src/controllers/UpdateController.js', () => ({
  getNewSchedules: jest.fn((req, res) => res.json({ success: true, message: 'new schedules' })),
  getUpdatedSchedules: jest.fn((req, res) => res.json({ success: true, message: 'updated schedules' })),
}));

const app = express();
app.use(express.json());
app.use('/api/schedules', scheduleRoutes);
app.use('/api/updates', updateRoutes);
app.use(errorHandler);

describe('API Integration Tests', () => {
  describe('Schedule Routes', () => {
    it('GET /api/schedules/latest should return 200', async () => {
      const res = await request(app).get('/api/schedules/latest');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('GET /api/schedules/dates should return 200', async () => {
      const res = await request(app).get('/api/schedules/dates');
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Update Routes', () => {
    it('GET /api/updates/new should return 200', async () => {
      const res = await request(app).get('/api/updates/new');
      expect(res.statusCode).toBe(200);
    });

    it('GET /api/updates/changed should return 200', async () => {
      const res = await request(app).get('/api/updates/changed');
      expect(res.statusCode).toBe(200);
    });
  });
});
