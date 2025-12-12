/**
 * DTO Exports
 * Централізований експорт всіх DTO класів
 */

// Base DTO
export { BaseDTO } from './BaseDTO.js';

// Schedule DTOs
export {
  OutageIntervalDTO,
  QueueScheduleDTO,
  ScheduleByDateDTO,
  ScheduleByQueueDTO,
  DatesListDTO,
  TodayStatusDTO,
  ScheduleMetadataDTO,
  UpdatesListDTO
} from './ScheduleDTO.js';

// Response DTOs
export {
  SuccessResponseDTO,
  ErrorResponseDTO,
  NotFoundResponseDTO,
  ValidationErrorResponseDTO,
  PaginatedResponseDTO,
  ResponseDTOFactory
} from './ResponseDTO.js';
