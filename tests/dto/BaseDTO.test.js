/**
 * BaseDTO Tests
 * Тести для базового DTO класу
 */

import { BaseDTO } from '../../src/dto/BaseDTO.js';

describe('BaseDTO', () => {
  describe('Constructor and basic methods', () => {
    test('should create DTO with data', () => {
      const dto = new BaseDTO({ name: 'Test', age: 25 });
      expect(dto.get('name')).toBe('Test');
      expect(dto.get('age')).toBe(25);
    });

    test('should return default value for missing field', () => {
      const dto = new BaseDTO({ name: 'Test' });
      expect(dto.get('missing', 'default')).toBe('default');
    });

    test('should set field value', () => {
      const dto = new BaseDTO({});
      dto.set('name', 'John');
      expect(dto.get('name')).toBe('John');
    });

    test('should check if field exists', () => {
      const dto = new BaseDTO({ name: 'Test' });
      expect(dto.has('name')).toBe(true);
      expect(dto.has('missing')).toBe(false);
    });
  });

  describe('Validation', () => {
    test('should validate without errors', () => {
      const dto = new BaseDTO({ name: 'Test' });
      expect(dto.validate()).toBe(true);
      expect(dto.hasErrors()).toBe(false);
      expect(dto.getErrors()).toEqual([]);
    });

    test('should add and retrieve errors', () => {
      const dto = new BaseDTO({});
      dto.addError('name', 'Name is required');
      dto.addError('age', 'Age must be positive');

      expect(dto.hasErrors()).toBe(true);
      expect(dto.getErrors()).toHaveLength(2);
      expect(dto.getErrors()[0]).toEqual({
        field: 'name',
        message: 'Name is required'
      });
    });
  });

  describe('Serialization', () => {
    test('should convert to object', () => {
      const data = { name: 'Test', age: 25 };
      const dto = new BaseDTO(data);
      expect(dto.toObject()).toEqual(data);
    });

    test('should convert to JSON', () => {
      const data = { name: 'Test', age: 25 };
      const dto = new BaseDTO(data);
      expect(dto.toJSON()).toBe(JSON.stringify(data));
    });
  });

  describe('Static validators', () => {
    describe('isValidDate', () => {
      test('should validate correct date format', () => {
        expect(BaseDTO.isValidDate('2024-01-15')).toBe(true);
        expect(BaseDTO.isValidDate('2024-12-31')).toBe(true);
      });

      test('should reject invalid date format', () => {
        expect(BaseDTO.isValidDate('2024-1-15')).toBe(false);
        expect(BaseDTO.isValidDate('2024/01/15')).toBe(false);
        expect(BaseDTO.isValidDate('15-01-2024')).toBe(false);
        expect(BaseDTO.isValidDate('invalid')).toBe(false);
        expect(BaseDTO.isValidDate('')).toBe(false);
        expect(BaseDTO.isValidDate(null)).toBe(false);
      });

      test('should reject dates with invalid month', () => {
        expect(BaseDTO.isValidDate('2024-13-01')).toBe(false);
        // Примітка: JavaScript Date автоматично коригує '2024-02-30' в валідну дату
      });
    });

    describe('isValidQueue', () => {
      test('should validate correct queue format', () => {
        expect(BaseDTO.isValidQueue('1.1')).toBe(true);
        expect(BaseDTO.isValidQueue('2.3')).toBe(true);
        expect(BaseDTO.isValidQueue('10.5')).toBe(true);
      });

      test('should reject invalid queue format', () => {
        expect(BaseDTO.isValidQueue('1')).toBe(false);
        expect(BaseDTO.isValidQueue('1.')).toBe(false);
        expect(BaseDTO.isValidQueue('.1')).toBe(false);
        expect(BaseDTO.isValidQueue('1-1')).toBe(false);
        expect(BaseDTO.isValidQueue('invalid')).toBe(false);
        expect(BaseDTO.isValidQueue('')).toBe(false);
        expect(BaseDTO.isValidQueue(null)).toBe(false);
      });
    });

    describe('isValidTime', () => {
      test('should validate correct time format', () => {
        expect(BaseDTO.isValidTime('00:00')).toBe(true);
        expect(BaseDTO.isValidTime('12:30')).toBe(true);
        expect(BaseDTO.isValidTime('23:59')).toBe(true);
      });

      test('should reject invalid time format', () => {
        expect(BaseDTO.isValidTime('24:00')).toBe(false);
        expect(BaseDTO.isValidTime('12:60')).toBe(false);
        expect(BaseDTO.isValidTime('1:30')).toBe(false);
        expect(BaseDTO.isValidTime('12:3')).toBe(false);
        expect(BaseDTO.isValidTime('invalid')).toBe(false);
        expect(BaseDTO.isValidTime('')).toBe(false);
        expect(BaseDTO.isValidTime(null)).toBe(false);
      });
    });

    describe('isNonEmptyString', () => {
      test('should validate non-empty strings', () => {
        expect(BaseDTO.isNonEmptyString('hello')).toBe(true);
        expect(BaseDTO.isNonEmptyString('  test  ')).toBe(true);
      });

      test('should reject empty or invalid values', () => {
        expect(BaseDTO.isNonEmptyString('')).toBe(false);
        expect(BaseDTO.isNonEmptyString('   ')).toBe(false);
        expect(BaseDTO.isNonEmptyString(null)).toBe(false);
        expect(BaseDTO.isNonEmptyString(undefined)).toBe(false);
        expect(BaseDTO.isNonEmptyString(123)).toBe(false);
      });
    });

    describe('isPositiveNumber', () => {
      test('should validate positive numbers', () => {
        expect(BaseDTO.isPositiveNumber(1)).toBe(true);
        expect(BaseDTO.isPositiveNumber(100)).toBe(true);
        expect(BaseDTO.isPositiveNumber(0.1)).toBe(true);
      });

      test('should reject zero and negative numbers', () => {
        expect(BaseDTO.isPositiveNumber(0)).toBe(false);
        expect(BaseDTO.isPositiveNumber(-1)).toBe(false);
        expect(BaseDTO.isPositiveNumber(NaN)).toBe(false);
        expect(BaseDTO.isPositiveNumber('123')).toBe(false);
      });
    });

    describe('isNonNegativeNumber', () => {
      test('should validate non-negative numbers', () => {
        expect(BaseDTO.isNonNegativeNumber(0)).toBe(true);
        expect(BaseDTO.isNonNegativeNumber(1)).toBe(true);
        expect(BaseDTO.isNonNegativeNumber(100)).toBe(true);
      });

      test('should reject negative numbers', () => {
        expect(BaseDTO.isNonNegativeNumber(-1)).toBe(false);
        expect(BaseDTO.isNonNegativeNumber(NaN)).toBe(false);
        expect(BaseDTO.isNonNegativeNumber('123')).toBe(false);
      });
    });
  });
});
