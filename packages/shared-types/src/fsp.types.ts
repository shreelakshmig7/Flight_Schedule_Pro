/**
 * fsp.types.ts
 * ------------
 * Agentic Scheduler — FSP Integration — FSP API request/response types
 * ---------------------------------------------------------------------
 * Defines all TypeScript types used when communicating with the Flight
 * Schedule Pro API across all 19 API sections. These types are consumed
 * exclusively by the fsp-client package.
 *
 * Key exports: FspError, ServiceResult, auth types, operator types,
 *   location types, aircraft types, instructor types, activity type types,
 *   scheduling group types, availability types, schedule types, schedulable
 *   event types, auto-schedule types, find-a-time types, reservation types,
 *   batch reservation types, enrollment types, student types, weather types,
 *   civil twilight types, flight alert types.
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

// ── Common ────────────────────────────────────────────────────────────────────

/**
 * Structured error returned by the FSP API in error response bodies.
 */
export interface FspError {
  message: string;
  field?: string | null;
  code?: string | null;
}

/**
 * Discriminated union wrapping all service method return values.
 * Callers narrow with `if (result.success)` before accessing `result.data`.
 */
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; data: null; fspErrors?: FspError[] };

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Credentials sent to the FSP auth endpoint to start a session. */
export interface FspAuthRequest {
  username: string;
  password: string;
  operatorId?: string | null;
}

/** Response from a successful authentication request. */
export interface FspAuthResponse {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null;
  requiresMfa?: boolean | null;
  mfaToken?: string | null;
  userId?: string | null;
  operatorId?: string | null;
}

/** MFA verification payload. */
export interface FspMfaRequest {
  mfaToken: string;
  code: string;
}

/** Response after successful MFA verification. */
export interface FspMfaResponse {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null;
  userId?: string | null;
  operatorId?: string | null;
}

/** Payload to refresh an existing access token. */
export interface FspRefreshRequest {
  refreshToken: string;
}

/** Response containing the new access token after refresh. */
export interface FspRefreshResponse {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null;
}

// ── Operators ─────────────────────────────────────────────────────────────────

/** FSP flight school / operator entity. */
export interface FspOperator {
  operatorId: string;
  name: string;
  code?: string | null;
  timeZone?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  active?: boolean | null;
}

/** A user account associated with an operator. */
export interface FspOperatorUser {
  userId: string;
  operatorId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
  active?: boolean | null;
}

/** Permission flags for an operator. */
export interface FspOperatorPermissions {
  operatorId: string;
  canCreateReservations?: boolean | null;
  canDeleteReservations?: boolean | null;
  canManageUsers?: boolean | null;
  canViewReports?: boolean | null;
  [key: string]: unknown;
}

// ── Locations ─────────────────────────────────────────────────────────────────

/** Physical location or airport used by an operator. */
export interface FspLocation {
  locationId: string;
  operatorId: string;
  name: string;
  icaoCode?: string | null;
  iataCode?: string | null;
  timeZone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  active?: boolean | null;
}

// ── Aircraft ──────────────────────────────────────────────────────────────────

/** Aircraft registered under an operator. */
export interface FspAircraft {
  aircraftId: string;
  operatorId: string;
  tailNumber?: string | null;
  make?: string | null;
  model?: string | null;
  category?: string | null;
  class?: string | null;
  active?: boolean | null;
  locationId?: string | null;
}

/** Squawk (maintenance write-up) recorded against an aircraft. */
export interface FspAircraftSquawk {
  squawkId: string;
  aircraftId: string;
  description: string;
  reportedAt?: string | null;
  resolvedAt?: string | null;
  severity?: string | null;
  reportedBy?: string | null;
}

/** Maintenance reminder or recurring inspection due on an aircraft. */
export interface FspMaintenanceReminder {
  reminderId: string;
  aircraftId: string;
  description: string;
  dueDate?: string | null;
  dueHours?: number | null;
  status?: string | null;
}

// ── Instructors ───────────────────────────────────────────────────────────────

/** Instructor record under an operator. */
export interface FspInstructor {
  instructorId: string;
  operatorId: string;
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  active?: boolean | null;
  ratings?: string[] | null;
}

// ── Activity Types ────────────────────────────────────────────────────────────

/** Category of flight activity (e.g. dual, solo, ground). */
export interface FspActivityType {
  activityTypeId: string;
  operatorId: string;
  name: string;
  code?: string | null;
  requiresInstructor?: boolean | null;
  requiresAircraft?: boolean | null;
  active?: boolean | null;
}

// ── Scheduling Groups ─────────────────────────────────────────────────────────

/** Logical grouping of resources for scheduling purposes. */
export interface FspSchedulingGroup {
  groupId: string;
  operatorId: string;
  name: string;
  description?: string | null;
  active?: boolean | null;
}

// ── Availability ──────────────────────────────────────────────────────────────

/** Availability window for a user on a given date. */
export interface FspAvailability {
  userId: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  available?: boolean | null;
  slots?: FspAvailabilitySlot[] | null;
}

/** A discrete available time slot within a user's availability window. */
export interface FspAvailabilitySlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

/** Request body for batch availability queries. */
export interface FspAvailabilityBatchRequest {
  userIds: string[];
  startDate: string;
  endDate: string;
  activityTypeId?: string | null;
  locationId?: string | null;
  aircraftId?: string | null;
}

/** Response containing availability for multiple users. */
export interface FspAvailabilityBatchResponse {
  results: FspAvailability[];
  requestedAt?: string | null;
}

/** An override (block or explicit availability) added to a user's schedule. */
export interface FspAvailabilityOverride {
  overrideId: string;
  userId: string;
  operatorId: string;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  type?: string | null;
  note?: string | null;
}

/** Parameters to check whether a proposed reservation conflicts with availability. */
export interface FspReservationAvailabilityCheck {
  startDateTime: string;
  endDateTime: string;
  instructorId?: string | null;
  aircraftId?: string | null;
  studentId?: string | null;
  activityTypeId?: string | null;
  excludeReservationId?: string | null;
}

// ── Schedule ──────────────────────────────────────────────────────────────────

/** A time-block entry on the operator's schedule. */
export interface FspSchedule {
  scheduleId?: string | null;
  operatorId: string;
  startDateTime: string;
  endDateTime: string;
  title?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  activityTypeId?: string | null;
  status?: string | null;
}

/** Operating-hours display windows shown in the scheduler UI. */
export interface FspDisplayHours {
  operatorId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  locationId?: string | null;
}

/** Filter parameters accepted by the schedule query endpoint. */
export interface FspScheduleFilters {
  startDate?: string | null;
  endDate?: string | null;
  instructorIds?: string[] | null;
  aircraftIds?: string[] | null;
  activityTypeIds?: string[] | null;
  locationIds?: string[] | null;
  studentIds?: string[] | null;
  statuses?: string[] | null;
}

/** A reason code for cancelling a reservation. */
export interface FspCancellationReason {
  reasonId: string;
  operatorId: string;
  label: string;
  active?: boolean | null;
}

// ── SchedulableEvents ─────────────────────────────────────────────────────────

/** An event (lesson, ground, etc.) that can be placed on the schedule. */
export interface FspSchedulableEvent {
  eventId: string;
  operatorId: string;
  enrollmentId?: string | null;
  studentId?: string | null;
  instructorId?: string | null;
  aircraftId?: string | null;
  activityTypeId?: string | null;
  scheduledDate?: string | null;
  startDateTime?: string | null;
  endDateTime?: string | null;
  status?: string | null;
  notes?: string | null;
}

// ── AutoSchedule ──────────────────────────────────────────────────────────────

/** Operator-level settings for the auto-scheduler. */
export interface FspAutoScheduleSettings {
  operatorId: string;
  enabled?: boolean | null;
  maxWeeksAhead?: number | null;
  preferredDays?: number[] | null;
  preferredStartTime?: string | null;
  preferredEndTime?: string | null;
  bufferMinutes?: number | null;
  maxDailyHours?: number | null;
  [key: string]: unknown;
}

/** Trigger payload to run the auto-scheduler. */
export interface FspAutoScheduleExecuteRequest {
  studentIds?: string[] | null;
  enrollmentIds?: string[] | null;
  startDate?: string | null;
  endDate?: string | null;
  dryRun?: boolean | null;
}

/** The outcome produced by one auto-schedule run. */
export interface FspAutoScheduleResult {
  runId?: string | null;
  operatorId: string;
  scheduledCount?: number | null;
  skippedCount?: number | null;
  failedCount?: number | null;
  events?: FspSchedulableEvent[] | null;
  completedAt?: string | null;
}

/** Feedback submitted by a student or instructor on an auto-scheduled event. */
export interface FspAutoScheduleFeedback {
  eventId: string;
  rating?: number | null;
  comment?: string | null;
  accepted?: boolean | null;
}

// ── FindATime ─────────────────────────────────────────────────────────────────

/** Per-user scheduling preferences used by the find-a-time feature. */
export interface FspFindATimePreferences {
  userId: string;
  operatorId: string;
  preferredDays?: number[] | null;
  preferredStartTime?: string | null;
  preferredEndTime?: string | null;
  maxSessionsPerDay?: number | null;
  minBreakMinutes?: number | null;
}

/** A candidate time slot returned by the find-a-time algorithm. */
export interface FspFindATimeSlot {
  startDateTime: string;
  endDateTime: string;
  instructorId?: string | null;
  aircraftId?: string | null;
  score?: number | null;
  conflicts?: string[] | null;
}

/** Request body for find-a-time slot discovery. */
export interface FspFindATimeRequest {
  studentId: string;
  enrollmentId?: string | null;
  activityTypeId?: string | null;
  durationMinutes: number;
  startDate: string;
  endDate: string;
  preferredInstructorIds?: string[] | null;
  preferredAircraftIds?: string[] | null;
  maxResults?: number | null;
}

// ── Reservations ──────────────────────────────────────────────────────────────

/** A single reservation on the FSP schedule. */
export interface FspReservation {
  reservationId: string;
  operatorId: string;
  startDateTime: string;
  endDateTime: string;
  studentId?: string | null;
  instructorId?: string | null;
  aircraftId?: string | null;
  activityTypeId?: string | null;
  locationId?: string | null;
  enrollmentId?: string | null;
  status?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** Payload to create a new reservation (V2 endpoint). */
export interface FspReservationCreateRequest {
  operatorId: string;
  startDateTime: string;
  endDateTime: string;
  studentId?: string | null;
  instructorId?: string | null;
  aircraftId?: string | null;
  activityTypeId?: string | null;
  locationId?: string | null;
  enrollmentId?: string | null;
  notes?: string | null;
  sendConfirmation?: boolean | null;
}

/** Filters for listing reservations. */
export interface FspReservationListRequest {
  startDate?: string | null;
  endDate?: string | null;
  studentIds?: string[] | null;
  instructorIds?: string[] | null;
  aircraftIds?: string[] | null;
  activityTypeIds?: string[] | null;
  statuses?: string[] | null;
  pageSize?: number | null;
  pageNumber?: number | null;
}

/** Paginated list of reservations returned from the list endpoint. */
export interface FspReservationListResponse {
  reservations: FspReservation[];
  totalCount?: number | null;
  pageSize?: number | null;
  pageNumber?: number | null;
}

// ── Batch Reservations ────────────────────────────────────────────────────────

/** Request to publish a batch of reservations at once. */
export interface FspBatchReservationRequest {
  reservations: FspReservationCreateRequest[];
  sendConfirmations?: boolean | null;
  dryRun?: boolean | null;
}

/** Progress report for an in-flight batch reservation job. */
export interface FspBatchReservationProgress {
  batchId: string;
  operatorId: string;
  totalCount: number;
  successCount?: number | null;
  failedCount?: number | null;
  status?: string | null;
  completedAt?: string | null;
  errors?: FspError[] | null;
}

// ── Enrollment ────────────────────────────────────────────────────────────────

/** A student enrollment in a training program. */
export interface FspEnrollment {
  enrollmentId: string;
  operatorId: string;
  studentId: string;
  programId?: string | null;
  programName?: string | null;
  startDate?: string | null;
  expectedEndDate?: string | null;
  status?: string | null;
  instructorId?: string | null;
}

/** Training progress data for an enrollment. */
export interface FspEnrollmentProgress {
  enrollmentId: string;
  completedLessons?: number | null;
  totalLessons?: number | null;
  completedHours?: number | null;
  requiredHours?: number | null;
  percentComplete?: number | null;
  lastActivityDate?: string | null;
  milestones?: FspProgressMilestone[] | null;
}

/** An individual milestone within an enrollment's progress. */
export interface FspProgressMilestone {
  milestoneId: string;
  name: string;
  completed?: boolean | null;
  completedDate?: string | null;
  required?: boolean | null;
}

/** A single training session linked to an enrollment. */
export interface FspTrainingSession {
  sessionId: string;
  enrollmentId: string;
  reservationId?: string | null;
  date?: string | null;
  durationMinutes?: number | null;
  activityType?: string | null;
  instructorId?: string | null;
  aircraftId?: string | null;
  notes?: string | null;
}

/** Aggregated progress report for a student across all enrollments. */
export interface FspStudentProgressReport {
  studentId: string;
  operatorId: string;
  enrollments?: FspEnrollment[] | null;
  totalFlightHours?: number | null;
  totalGroundHours?: number | null;
  overallPercentComplete?: number | null;
  generatedAt?: string | null;
}

/** Score record for a checkride (practical test). */
export interface FspCheckrideScore {
  checkrideId: string;
  studentId: string;
  enrollmentId?: string | null;
  date?: string | null;
  result?: string | null;
  examinerName?: string | null;
  notes?: string | null;
  areasOfDeficiency?: string[] | null;
}

/** Score record for a written knowledge test. */
export interface FspKnowledgeTest {
  testId: string;
  studentId: string;
  enrollmentId?: string | null;
  testCode?: string | null;
  date?: string | null;
  score?: number | null;
  passed?: boolean | null;
  expirationDate?: string | null;
}

// ── Students ──────────────────────────────────────────────────────────────────

/** Full student record. */
export interface FspStudent {
  studentId: string;
  operatorId: string;
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  active?: boolean | null;
  enrollmentStatus?: string | null;
}

/** Lightweight student record for dropdown/autocomplete use. */
export interface FspStudentDropdownItem {
  studentId: string;
  displayName: string;
  email?: string | null;
}

/** A training-related alert for a student. */
export interface FspTrainingAlert {
  alertId: string;
  studentId: string;
  operatorId: string;
  type: string;
  message: string;
  createdAt?: string | null;
  resolved?: boolean | null;
  resolvedAt?: string | null;
}

// ── Weather ───────────────────────────────────────────────────────────────────

/** METAR (current meteorological aerodrome report). */
export interface FspMetar {
  stationId: string;
  rawText?: string | null;
  observationTime?: string | null;
  flightCategory?: string | null;
  windDirectionDeg?: number | null;
  windSpeedKt?: number | null;
  windGustKt?: number | null;
  visibilitySm?: number | null;
  altimeterInHg?: number | null;
  temperatureCelsius?: number | null;
  dewpointCelsius?: number | null;
  skyConditions?: FspSkyCondition[] | null;
}

/** Individual sky layer condition within a METAR. */
export interface FspSkyCondition {
  skyCover: string;
  cloudBaseFtAgl?: number | null;
}

/** TAF (terminal aerodrome forecast). */
export interface FspTaf {
  stationId: string;
  rawText?: string | null;
  issueTime?: string | null;
  validTimeFrom?: string | null;
  validTimeTo?: string | null;
  forecast?: FspTafForecastPeriod[] | null;
}

/** A single forecast period within a TAF. */
export interface FspTafForecastPeriod {
  timeFrom?: string | null;
  timeTo?: string | null;
  changeIndicator?: string | null;
  windDirectionDeg?: number | null;
  windSpeedKt?: number | null;
  visibilitySm?: number | null;
  skyConditions?: FspSkyCondition[] | null;
}

// ── Civil Twilight ────────────────────────────────────────────────────────────

/** Civil twilight times for a given location and date. */
export interface FspCivilTwilight {
  locationId: string;
  date: string;
  civilTwilightBegin?: string | null;
  sunrise?: string | null;
  sunset?: string | null;
  civilTwilightEnd?: string | null;
  timeZone?: string | null;
}

// ── FlightAlerts ──────────────────────────────────────────────────────────────

/** An alert associated with a flight or aircraft. */
export interface FspFlightAlert {
  alertId: string;
  operatorId: string;
  aircraftId?: string | null;
  alertType: string;
  message: string;
  severity?: string | null;
  dueDate?: string | null;
  completed?: boolean | null;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** Request body to create a new flight alert. */
export interface FspFlightAlertCreateRequest {
  operatorId: string;
  aircraftId?: string | null;
  alertType: string;
  message: string;
  severity?: string | null;
  dueDate?: string | null;
}
