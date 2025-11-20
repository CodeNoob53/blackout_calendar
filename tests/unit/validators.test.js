import { DateValidator } from '../../src/utils/validators.js';

describe('DateValidator', () => {
    describe('isValidDateFormat', () => {
        it('should return true for valid date format YYYY-MM-DD', () => {
            expect(DateValidator.isValidDateFormat('2025-11-20')).toBe(true);
        });

        it('should return false for invalid date format', () => {
            expect(DateValidator.isValidDateFormat('20-11-2025')).toBe(false);
            expect(DateValidator.isValidDateFormat('2025/11/20')).toBe(false);
            expect(DateValidator.isValidDateFormat('invalid')).toBe(false);
        });
    });

    describe('isValidQueue', () => {
        it('should return true for valid queue format X.X', () => {
            expect(DateValidator.isValidQueue('1.1')).toBe(true);
            expect(DateValidator.isValidQueue('3.2')).toBe(true);
        });

        it('should return false for invalid queue format', () => {
            expect(DateValidator.isValidQueue('1')).toBe(false);
            expect(DateValidator.isValidQueue('1.1.1')).toBe(false);
            expect(DateValidator.isValidQueue('abc')).toBe(false);
        });
    });

    describe('validateHours', () => {
        it('should return true for valid hours range', () => {
            expect(DateValidator.validateHours(24)).toBe(true);
            expect(DateValidator.validateHours(1)).toBe(true);
            expect(DateValidator.validateHours(720)).toBe(true);
        });

        it('should return false for invalid hours range', () => {
            expect(DateValidator.validateHours(0)).toBe(false);
            expect(DateValidator.validateHours(721)).toBe(false);
            expect(DateValidator.validateHours(-5)).toBe(false);
        });
    });
});
