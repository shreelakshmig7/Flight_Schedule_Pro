/**
 * index.ts
 * --------
 * Agentic Scheduler — FSP Integration — fsp-client package entry point
 * ---------------------------------------------------------------------
 * Re-exports all FSP API service classes and the NestJS FspClientModule.
 * This is the ONLY package in the monorepo that makes HTTP calls to the
 * FSP API. No other package or app may import axios or call FSP URLs directly.
 *
 * Key exports: FspClientModule and all 19 service classes (added in PR-6)
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-1 — Monorepo Setup
 */

/** Package identifier — used in bootstrap tests. */
export const PACKAGE_NAME = '@fsp-scheduler/fsp-client';

// Service classes are added in PR-6:
// AuthService, OperatorsService, LocationsService, AircraftService,
// InstructorsService, ActivityTypesService, SchedulingGroupsService,
// AvailabilityService, ScheduleService, SchedulableEventsService,
// AutoScheduleService, FindATimeService, ReservationsService,
// BatchReservationsService, EnrollmentService, StudentsService,
// WeatherService, CivilTwilightService, FlightAlertsService
