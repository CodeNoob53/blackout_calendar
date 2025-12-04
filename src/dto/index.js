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

// Address DTOs
export {
  AddressDTO,
  AddressSearchResultDTO,
  AddressListDTO,
  AddressStatisticsDTO
} from './AddressDTO.js';

// Response DTOs
export {
  SuccessResponseDTO,
  ErrorResponseDTO,
  NotFoundResponseDTO,
  ValidationErrorResponseDTO,
  PaginatedResponseDTO,
  ResponseDTOFactory
} from './ResponseDTO.js';
