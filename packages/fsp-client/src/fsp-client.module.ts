/**
 * fsp-client.module.ts
 * --------------------
 * Agentic Scheduler — FSP Integration — NestJS FspClientModule
 * ------------------------------------------------------------
 * Global NestJS module that creates and provides the three FspHttpClient
 * instances (auth gateway, core API, curriculum API) and all 19 FSP service
 * classes. Import once in AppModule; all services are available everywhere.
 *
 * Key exports: FspClientModule, FSP_CORE_CLIENT, FSP_AUTH_CLIENT,
 *   FSP_CURRICULUM_CLIENT
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Global, Module } from '@nestjs/common';
import { FspHttpClient } from './fsp-http.client';
import { AuthService } from './services/auth.service';
import { OperatorsService } from './services/operators.service';
import { LocationsService } from './services/locations.service';
import { AircraftService } from './services/aircraft.service';
import { InstructorsService } from './services/instructors.service';
import { ActivityTypesService } from './services/activity-types.service';
import { SchedulingGroupsService } from './services/scheduling-groups.service';
import { AvailabilityService } from './services/availability.service';
import { ScheduleService } from './services/schedule.service';
import { SchedulableEventsService } from './services/schedulable-events.service';
import { AutoScheduleService } from './services/auto-schedule.service';
import { FindATimeService } from './services/find-a-time.service';
import { ReservationsService } from './services/reservations.service';
import { BatchReservationsService } from './services/batch-reservations.service';
import { EnrollmentService } from './services/enrollment.service';
import { StudentsService } from './services/students.service';
import { WeatherService } from './services/weather.service';
import { CivilTwilightService } from './services/civil-twilight.service';
import { FlightAlertsService } from './services/flight-alerts.service';

/** Injection token for the HTTP client bound to the FSP core API base URL. */
export const FSP_CORE_CLIENT = 'FSP_CORE_CLIENT';

/** Injection token for the HTTP client bound to the FSP auth gateway base URL. */
export const FSP_AUTH_CLIENT = 'FSP_AUTH_CLIENT';

/** Injection token for the HTTP client bound to the FSP curriculum API base URL. */
export const FSP_CURRICULUM_CLIENT = 'FSP_CURRICULUM_CLIENT';

/** All service classes provided and exported by this module. */
const ALL_SERVICES = [
  AuthService,
  OperatorsService,
  LocationsService,
  AircraftService,
  InstructorsService,
  ActivityTypesService,
  SchedulingGroupsService,
  AvailabilityService,
  ScheduleService,
  SchedulableEventsService,
  AutoScheduleService,
  FindATimeService,
  ReservationsService,
  BatchReservationsService,
  EnrollmentService,
  StudentsService,
  WeatherService,
  CivilTwilightService,
  FlightAlertsService,
];

/**
 * Global NestJS module that instantiates all FSP HTTP clients and services.
 * Mark as @Global() so consuming modules do not need to re-import it.
 */
@Global()
@Module({
  providers: [
    {
      provide: FSP_AUTH_CLIENT,
      useFactory: (): FspHttpClient =>
        new FspHttpClient(
          process.env['FSP_API_BASE_URL'] ?? '',
          process.env['FSP_SUBSCRIPTION_KEY'] ?? '',
        ),
    },
    {
      provide: FSP_CORE_CLIENT,
      useFactory: (): FspHttpClient =>
        new FspHttpClient(
          process.env['FSP_CORE_BASE_URL'] ?? '',
          process.env['FSP_SUBSCRIPTION_KEY'] ?? '',
        ),
    },
    {
      provide: FSP_CURRICULUM_CLIENT,
      useFactory: (): FspHttpClient =>
        new FspHttpClient(
          process.env['FSP_CURRICULUM_BASE_URL'] ?? '',
          process.env['FSP_SUBSCRIPTION_KEY'] ?? '',
        ),
    },
    {
      provide: AuthService,
      useFactory: (client: FspHttpClient): AuthService => new AuthService(client),
      inject: [FSP_AUTH_CLIENT],
    },
    {
      provide: OperatorsService,
      useFactory: (client: FspHttpClient): OperatorsService => new OperatorsService(client),
      inject: [FSP_AUTH_CLIENT],
    },
    {
      provide: LocationsService,
      useFactory: (client: FspHttpClient): LocationsService => new LocationsService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: AircraftService,
      useFactory: (client: FspHttpClient): AircraftService => new AircraftService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: InstructorsService,
      useFactory: (client: FspHttpClient): InstructorsService => new InstructorsService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: ActivityTypesService,
      useFactory: (client: FspHttpClient): ActivityTypesService =>
        new ActivityTypesService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: SchedulingGroupsService,
      useFactory: (client: FspHttpClient): SchedulingGroupsService =>
        new SchedulingGroupsService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: AvailabilityService,
      useFactory: (client: FspHttpClient): AvailabilityService => new AvailabilityService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: ScheduleService,
      useFactory: (client: FspHttpClient): ScheduleService => new ScheduleService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: SchedulableEventsService,
      useFactory: (client: FspHttpClient): SchedulableEventsService =>
        new SchedulableEventsService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: AutoScheduleService,
      useFactory: (client: FspHttpClient): AutoScheduleService => new AutoScheduleService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: FindATimeService,
      useFactory: (client: FspHttpClient): FindATimeService => new FindATimeService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: ReservationsService,
      useFactory: (client: FspHttpClient): ReservationsService => new ReservationsService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: BatchReservationsService,
      useFactory: (client: FspHttpClient): BatchReservationsService =>
        new BatchReservationsService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: EnrollmentService,
      useFactory: (client: FspHttpClient): EnrollmentService => new EnrollmentService(client),
      inject: [FSP_CURRICULUM_CLIENT],
    },
    {
      provide: StudentsService,
      useFactory: (client: FspHttpClient): StudentsService => new StudentsService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: WeatherService,
      useFactory: (client: FspHttpClient): WeatherService => new WeatherService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: CivilTwilightService,
      useFactory: (client: FspHttpClient): CivilTwilightService =>
        new CivilTwilightService(client),
      inject: [FSP_CORE_CLIENT],
    },
    {
      provide: FlightAlertsService,
      useFactory: (client: FspHttpClient): FlightAlertsService => new FlightAlertsService(client),
      inject: [FSP_CORE_CLIENT],
    },
  ],
  exports: [
    FSP_AUTH_CLIENT,
    FSP_CORE_CLIENT,
    FSP_CURRICULUM_CLIENT,
    ...ALL_SERVICES,
  ],
})
export class FspClientModule {}
