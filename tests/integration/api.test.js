import request from 'supertest';
import express from 'express';
import scheduleRoutes from '../../src/routes/scheduleRoutes.js';
import updateRoutes from '../../src/routes/updateRoutes.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

// Mock database and other dependencies if necessary
// For integration tests, we might want to use a test database or mock the controller responses
// Here we will mock the controller methods to test routing and middleware

jest.mock('../../src/controllers/ScheduleController.js', () => ({
    getLatestSchedule: jest.fn((req, res) => res.json({ success: true, message: 'latest' })),
    getAllDates: jest.fn((req, res) => res.json({ success: true, message: 'dates' })),
    getScheduleByDate: jest.fn((req, res) => res.json({ success: true, message: 'schedule' })),
    getMetadata: jest.fn((req, res) => res.json({ success: true, message: 'metadata' })),
    getHistory: jest.fn((req, res) => res.json({ success: true, message: 'history' })),
    getScheduleByQueue: jest.fn((req, res) => res.json({ success: true, message: 'queue' })),
}));

jest.mock('../../src/controllers/UpdateController.js', () => ({
    triggerUpdate: jest.fn((req, res) => res.json({ success: true, message: 'update triggered' })),
    getRecentUpdates: jest.fn((req, res) => res.json({ success: true, message: 'recent updates' })),
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
        it('POST /api/updates/trigger should return 200', async () => {
            const res = await request(app).post('/api/updates/trigger');
            expect(res.statusCode).toBe(200);
        });
    });
});
