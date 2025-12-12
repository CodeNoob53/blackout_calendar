/**
 * API routes для аварійних відключень (ГАВ)
 */

import express from 'express';
import EmergencyBlackoutService from '../services/EmergencyBlackoutService.js';
import Logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/emergency/active
 * Отримати всі активні аварійні відключення (сьогодні і майбутні)
 */
router.get('/active', (req, res) => {
  try {
    const emergencies = EmergencyBlackoutService.getActiveEmergencyBlackouts();

    res.json({
      success: true,
      count: emergencies.length,
      data: emergencies
    });

    Logger.debug('EmergencyAPI', `Retrieved ${emergencies.length} active emergency blackouts`);
  } catch (error) {
    Logger.error('EmergencyAPI', `Error getting active emergencies: ${error.message}`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve active emergency blackouts'
    });
  }
});

/**
 * GET /api/emergency/:date
 * Отримати аварійні відключення для конкретної дати
 *
 * @param {string} date - Дата в форматі YYYY-MM-DD
 */
router.get('/:date', (req, res) => {
  try {
    const { date } = req.params;

    // Валідація формату дати
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Expected YYYY-MM-DD'
      });
    }

    const emergencies = EmergencyBlackoutService.getEmergencyBlackoutsByDate(date);

    res.json({
      success: true,
      date,
      count: emergencies.length,
      data: emergencies
    });

    Logger.debug('EmergencyAPI', `Retrieved ${emergencies.length} emergency blackouts for ${date}`);
  } catch (error) {
    Logger.error('EmergencyAPI', `Error getting emergencies for date: ${error.message}`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve emergency blackouts for date'
    });
  }
});

/**
 * POST /api/emergency/scan
 * Запустити сканування Telegram на нові аварійні відключення
 */
router.post('/scan', async (req, res) => {
  try {
    Logger.info('EmergencyAPI', 'Manual scan requested');

    const newEmergencies = await EmergencyBlackoutService.scanForEmergencyBlackouts();

    res.json({
      success: true,
      newEmergencies,
      message: `Found ${newEmergencies} new emergency blackout(s)`
    });

    Logger.info('EmergencyAPI', `Manual scan completed: ${newEmergencies} new`);
  } catch (error) {
    Logger.error('EmergencyAPI', `Error during manual scan: ${error.message}`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to scan for emergency blackouts'
    });
  }
});

/**
 * GET /api/emergency/check/:date
 * Перевірити чи є аварійні відключення для конкретної дати
 * Повертає простий boolean результат
 */
router.get('/check/:date', (req, res) => {
  try {
    const { date } = req.params;

    // Валідація формату дати
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Expected YYYY-MM-DD'
      });
    }

    const emergencies = EmergencyBlackoutService.getEmergencyBlackoutsByDate(date);
    const hasEmergency = emergencies.length > 0;

    res.json({
      success: true,
      date,
      hasEmergency,
      count: emergencies.length,
      affectedGroups: hasEmergency
        ? [...new Set(emergencies.flatMap(e => e.affected_groups))]
        : []
    });

    Logger.debug('EmergencyAPI', `Emergency check for ${date}: ${hasEmergency}`);
  } catch (error) {
    Logger.error('EmergencyAPI', `Error checking emergency for date: ${error.message}`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to check for emergency blackouts'
    });
  }
});

export default router;
