/**
 * index.ts
 * --------
 * Agentic Scheduler — FSP Integration — fsp-client package entry point
 * ---------------------------------------------------------------------
 * Re-exports all FSP API service classes, the NestJS FspClientModule,
 * error classes, the HTTP client, and injection tokens.
 * This is the ONLY package in the monorepo that makes HTTP calls to the
 * FSP API. No other package or app may import axios or call FSP URLs directly.
 *
 * Key exports: FspClientModule, all 19 service classes, FspHttpClient,
 *   FspApiError, FspRateLimitError, FSP_CORE_CLIENT, FSP_AUTH_CLIENT,
 *   FSP_CURRICULUM_CLIENT
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

/** Package identifier — used in bootstrap tests. */
export const PACKAGE_NAME = '@fsp-scheduler/fsp-client';

// ── HTTP infrastructure ───────────────────────────────────────────────────────
export { FspHttpClient } from './fsp-http.client';
export { FspApiError, FspRateLimitError } from './fsp.errors';

// ── NestJS module & injection tokens ─────────────────────────────────────────
export {
  FspClientModule,
  FSP_CORE_CLIENT,
  FSP_AUTH_CLIENT,
  FSP_CURRICULUM_CLIENT,
} from './fsp-client.module';

// ── Service classes ───────────────────────────────────────────────────────────
export { AuthService } from './services/auth.service';
export { OperatorsService } from './services/operators.service';
export { LocationsService } from './services/locations.service';
export { AircraftService } from './services/aircraft.service';
export { InstructorsService } from './services/instructors.service';
export { ActivityTypesService } from './services/activity-types.service';
export { SchedulingGroupsService } from './services/scheduling-groups.service';
export { AvailabilityService } from './services/availability.service';
export { ScheduleService } from './services/schedule.service';
export { SchedulableEventsService } from './services/schedulable-events.service';
export { AutoScheduleService } from './services/auto-schedule.service';
export { FindATimeService } from './services/find-a-time.service';
export { ReservationsService } from './services/reservations.service';
export { BatchReservationsService } from './services/batch-reservations.service';
export { EnrollmentService } from './services/enrollment.service';
export { StudentsService } from './services/students.service';
export { WeatherService } from './services/weather.service';
export { CivilTwilightService } from './services/civil-twilight.service';
export { FlightAlertsService } from './services/flight-alerts.service';
