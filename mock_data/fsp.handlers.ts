/**
 * fsp.handlers.ts
 * ---------------
 * Agentic Scheduler — FSP Integration — MSW mock handlers for all 19 FSP API sections
 * ------------------------------------------------------------------------------------
 * Intercepts all outgoing HTTP calls to FSP base URLs and returns synthetic
 * responses from the mock_data/ fixtures. Used in local development and unit tests
 * when the FSP sandbox has no data. All response shapes match the API appendix exactly.
 *
 * Key exports: fspHandlers (array of MSW request handlers)
 *
 * Author: [Author name]
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { http, HttpResponse } from 'msw';

import authSession from '../../mock_data/auth.session.json';
import operatorsUsers from '../../mock_data/operators.users.json';
import locations from '../../mock_data/locations.json';
import aircraft from '../../mock_data/aircraft.json';
import instructors from '../../mock_data/instructors.json';
import activityTypesGroups from '../../mock_data/activity.types.scheduling.groups.json';
import availability from '../../mock_data/availability.json';
import scheduleReservations from '../../mock_data/schedule.reservations.json';
import schedulableEvents from '../../mock_data/schedulable.events.json';
import autoschedule from '../../mock_data/autoschedule.json';
import findATime from '../../mock_data/find.a.time.json';
import enrollmentProgress from '../../mock_data/enrollment.progress.json';
import students from '../../mock_data/students.json';
import weather from '../../mock_data/weather.json';
import civilTwilight from '../../mock_data/civil.twilight.json';
import flightAlerts from '../../mock_data/flight.alerts.json';

const FSP_BASE = 'https://api-develop.flightschedulepro.com';
const FSP_APIM = 'https://development-fsp.azure-api.net';
const FSP_CURRICULUM = 'https://curriculum-api-develop.flightschedulepro.com';

export const fspHandlers = [

  // ── 1. Authentication ────────────────────────────────────────────────────

  http.post(`${FSP_APIM}/common/v1.0/sessions/credentials`, () => {
    return HttpResponse.json(authSession);
  }),

  http.post(`${FSP_APIM}/common/v1.0/sessions/mfa`, () => {
    return HttpResponse.json(authSession);
  }),

  http.post(`${FSP_APIM}/common/v1.0/sessions/refresh`, () => {
    return HttpResponse.json(authSession);
  }),

  http.delete(`${FSP_BASE}/api/V1/sessions`, () => {
    return HttpResponse.json({ success: true });
  }),

  // ── 2. Operators & Users ─────────────────────────────────────────────────

  http.get(`${FSP_BASE}/api/V1/myoperators`, () => {
    return HttpResponse.json(operatorsUsers.myoperators);
  }),

  http.get(`${FSP_BASE}/api/V1/myoperators/:operatorId`, () => {
    return HttpResponse.json(operatorsUsers.operatorDetail);
  }),

  http.get(`${FSP_BASE}/core/v1.0/operators/:operatorId/users`, () => {
    return HttpResponse.json(operatorsUsers.users);
  }),

  http.get(`${FSP_BASE}/core/v1.0/operators/:operatorId/users/:userId`, ({ params }) => {
    const user = operatorsUsers.users.find((u) => u.id === params.userId);
    return user ? HttpResponse.json(user) : HttpResponse.json({ error: 'Not found' }, { status: 404 });
  }),

  http.get(`${FSP_BASE}/core/v1.0/operators/:operatorId/users/:userId/permissions`, ({ params }) => {
    const perms = operatorsUsers.permissions[params.userId as string] ?? [];
    return HttpResponse.json(perms);
  }),

  // ── 3. Locations ─────────────────────────────────────────────────────────

  http.get(`${FSP_BASE}/common/v1.0/operators/:operatorId/locations`, () => {
    return HttpResponse.json(locations.locations);
  }),

  http.get(`${FSP_BASE}/common/v1.0/operators/:operatorId/locations/location/:locationId`, ({ params }) => {
    const loc = locations.locations.find((l) => l.id === params.locationId);
    return loc ? HttpResponse.json(loc) : HttpResponse.json({ error: 'Not found' }, { status: 404 });
  }),

  // ── 4. Aircraft ──────────────────────────────────────────────────────────

  http.get(`${FSP_BASE}/core/v1.0/operators/:operatorId/aircraft`, () => {
    return HttpResponse.json(aircraft.aircraft);
  }),

  http.get(`${FSP_BASE}/core/v1.0/operators/:operatorId/aircraft/:aircraftId/times`, ({ params }) => {
    const times = aircraft.times[params.aircraftId as string];
    return times ? HttpResponse.json(times) : HttpResponse.json({});
  }),

  http.get(`${FSP_BASE}/core/v1.0/operators/:operatorId/aircraft/:aircraftId/squawks`, ({ params }) => {
    const squawks = aircraft.squawks[params.aircraftId as string] ?? [];
    return HttpResponse.json(squawks);
  }),

  http.get(`${FSP_BASE}/core/v1.0/operators/:operatorId/aircraft/:aircraftId/maintenanceReminders`, ({ params }) => {
    const reminders = aircraft.maintenanceReminders[params.aircraftId as string] ?? [];
    return HttpResponse.json(reminders);
  }),

  // ── 5. Instructors ───────────────────────────────────────────────────────

  http.get(`${FSP_BASE}/core/v1.0/operators/:operatorId/instructors`, () => {
    return HttpResponse.json(instructors.instructors);
  }),

  http.get(`${FSP_BASE}/api/V2/operator/:operatorId/instructors/list`, () => {
    return HttpResponse.json(instructors.instructors);
  }),

  // ── 6. Activity Types ────────────────────────────────────────────────────

  http.get(`${FSP_BASE}/api/v1/operator/:operatorId/activitytypes`, () => {
    return HttpResponse.json(activityTypesGroups.activityTypes);
  }),

  // ── 7. Scheduling Groups ─────────────────────────────────────────────────

  http.get(`${FSP_BASE}/common/v1.0/operators/:operatorId/schedulinggroups`, () => {
    return HttpResponse.json(activityTypesGroups.schedulingGroups);
  }),

  // ── 8. Availability ──────────────────────────────────────────────────────

  http.get(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/users/:userGuidId/availability`, ({ params }) => {
    const userAvail = availability.availabilityAndOverrides.find(
      (a) => a.userGuidId === params.userGuidId
    );
    return userAvail
      ? HttpResponse.json({ availabilities: userAvail.availabilities, availabilityOverrides: [] })
      : HttpResponse.json({ availabilities: [], availabilityOverrides: [] });
  }),

  http.post(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/users/availability`, async ({ request }) => {
    const body = await request.json() as { userGuidIds: string[] };
    const result = availability.availabilityAndOverrides.filter((a) =>
      body.userGuidIds.includes(a.userGuidId)
    );
    return HttpResponse.json(result);
  }),

  http.post(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/users/availabilityAndOverrides`, async ({ request }) => {
    const body = await request.json() as { userGuidIds: string[] };
    const result = availability.availabilityAndOverrides.filter((a) =>
      body.userGuidIds.includes(a.userGuidId)
    );
    return HttpResponse.json(result);
  }),

  http.post(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/availability/reservationAvailability`, () => {
    return HttpResponse.json(availability.reservationAvailability);
  }),

  http.get(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/users/:userGuidId/availabilityOverride`, ({ params }) => {
    const userAvail = availability.availabilityAndOverrides.find(
      (a) => a.userGuidId === params.userGuidId
    );
    return HttpResponse.json(userAvail?.availabilityOverrides ?? []);
  }),

  http.post(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/users/:userGuidId/availabilityOverride`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.put(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/users/:userGuidId/availabilityOverride`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.delete(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/users/:userGuidId/availabilityOverride/:overrideId`, () => {
    return HttpResponse.json({ success: true });
  }),

  // ── 9. Schedule Data ─────────────────────────────────────────────────────

  http.post(`${FSP_BASE}/api/v2/schedule`, () => {
    return HttpResponse.json(scheduleReservations.schedule);
  }),

  http.get(`${FSP_BASE}/v2/operator/:operatorId/operators/scheduleDisplayHours`, () => {
    return HttpResponse.json(scheduleReservations.scheduleDisplayHours);
  }),

  http.get(`${FSP_BASE}/scheduling/v1.0/operators/:operatorId/scheduleFilters`, () => {
    return HttpResponse.json([]);
  }),

  http.get(`${FSP_BASE}/scheduling/v1.0/operators/:operatorId/cancellationReasons`, () => {
    return HttpResponse.json(scheduleReservations.cancellationReasons);
  }),

  // ── 10. Schedulable Events ───────────────────────────────────────────────

  http.post(`${FSP_CURRICULUM}/traininghub/v1.0/operators/:operatorId/schedulableEvents`, () => {
    return HttpResponse.json(schedulableEvents.schedulableEvents);
  }),

  // ── 11. AutoSchedule ─────────────────────────────────────────────────────

  http.get(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/settings/autoSchedule`, () => {
    return HttpResponse.json(autoschedule.autoScheduleSettings);
  }),

  http.put(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/settings/autoSchedule`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.post(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/autoSchedule`, () => {
    return HttpResponse.json(autoschedule.autoScheduleResponse);
  }),

  http.post(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/autoSchedule/feedback`, () => {
    return HttpResponse.json({ success: true });
  }),

  // ── 12. Find-a-Time ──────────────────────────────────────────────────────

  http.get(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/scheduleMatch/preferences`, () => {
    return HttpResponse.json(findATime.findATimePreferences);
  }),

  http.post(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/scheduleMatch/preferences`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.delete(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/scheduleMatch/preferences`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.post(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/scheduleMatch/availability`, () => {
    return HttpResponse.json(findATime.availableSlots);
  }),

  // ── 13. Reservations — Individual ────────────────────────────────────────

  http.post(`${FSP_BASE}/api/V2/Reservation`, async ({ request }) => {
    const body = await request.json() as { validateOnly?: boolean };
    if (body.validateOnly === true) {
      return HttpResponse.json(scheduleReservations.validateReservationResponse.passing);
    }
    return HttpResponse.json(scheduleReservations.createReservationResponse);
  }),

  http.get(`${FSP_BASE}/api/V2/Reservation/:reservationId`, ({ params }) => {
    const detail = scheduleReservations.reservationDetail[params.reservationId as string];
    return detail
      ? HttpResponse.json(detail)
      : HttpResponse.json({ error: 'Not found' }, { status: 404 });
  }),

  http.get(`${FSP_BASE}/V2/Reservation`, () => {
    return HttpResponse.json(scheduleReservations.operatorReservationsList.results.slice(0, 3));
  }),

  http.put(`${FSP_BASE}/api/V2/Reservation`, () => {
    return HttpResponse.json({ id: 'res-updated', errors: [] });
  }),

  http.delete(`${FSP_BASE}/scheduling/v1.0/operators/:operatorId/reservations/:reservationId`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.post(`${FSP_BASE}/api/V1/operator/:operatorId/operatorReservations/list`, () => {
    return HttpResponse.json(scheduleReservations.operatorReservationsList);
  }),

  http.get(`${FSP_BASE}/scheduling/v1.0/operators/:operatorId/reservations/availableTimes`, () => {
    return HttpResponse.json([]);
  }),

  http.get(`${FSP_BASE}/scheduling/v1.0/operators/:operatorId/reservations/checkavailability`, () => {
    return HttpResponse.json({ isAvailable: true });
  }),

  http.get(`${FSP_BASE}/scheduling/v1.0/operators/:operatorId/reservations/:reservationId/aircraftOptions`, () => {
    return HttpResponse.json(aircraft.aircraft.filter((a) => a.isActive && !a.isSimulator));
  }),

  // ── 14. Reservations — Batch ─────────────────────────────────────────────

  http.post(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/batchReservations`, () => {
    return HttpResponse.json({ batchId: 'batch-mock-001', status: 'PROCESSING' });
  }),

  http.get(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/batchReservations/status/:batchId`, () => {
    return HttpResponse.json({ batchId: 'batch-mock-001', status: 'COMPLETE', processed: 2, failed: 0 });
  }),

  // ── 15. Enrollment & Training Progress ───────────────────────────────────

  http.get(`${FSP_CURRICULUM}/traininghub/v1.0/operators/:operatorId/enrollments/list/:studentId`, ({ params }) => {
    const enroll = enrollmentProgress.enrollments[params.studentId as string] ?? [];
    return HttpResponse.json(enroll);
  }),

  http.get(`${FSP_CURRICULUM}/traininghub/v1.0/operators/:operatorId/enrollments/:enrollmentId`, ({ params }) => {
    const allEnrollments = Object.values(enrollmentProgress.enrollments).flat();
    const enroll = allEnrollments.find((e) => e.enrollmentId === params.enrollmentId);
    return enroll ? HttpResponse.json(enroll) : HttpResponse.json({ error: 'Not found' }, { status: 404 });
  }),

  http.get(`${FSP_CURRICULUM}/traininghub/v1.0/operators/:operatorId/enrollments/:enrollmentId/progress`, ({ params }) => {
    const progress = enrollmentProgress.enrollmentProgress[params.enrollmentId as string];
    return progress ? HttpResponse.json(progress) : HttpResponse.json({ error: 'Not found' }, { status: 404 });
  }),

  http.put(`${FSP_CURRICULUM}/traininghub/v1.0/operators/:operatorId/enrollments/:enrollmentId/progress`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.post(`${FSP_CURRICULUM}/traininghub/v1.0/operators/:operatorId/enrollments/:enrollmentId/status-changed`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.get(`${FSP_CURRICULUM}/traininghub/v1.0/operators/:operatorId/programs/:programGuid/enrollments/:userGuid/history`, () => {
    return HttpResponse.json([]);
  }),

  http.get(`${FSP_BASE}/api/v1/trainingsessions`, ({ request }) => {
    const url = new URL(request.url);
    const enrollmentId = url.searchParams.get('enrollmentId') ?? '';
    const sessions = enrollmentProgress.trainingSessions[enrollmentId] ?? [];
    return HttpResponse.json(sessions);
  }),

  http.get(`${FSP_BASE}/api/v1/reports`, ({ request }) => {
    const url = new URL(request.url);
    const enrollmentId = url.searchParams.get('enrollmentId') ?? '';
    const progress = enrollmentProgress.enrollmentProgress[enrollmentId];
    return progress
      ? HttpResponse.json({ completionPercentage: progress.completionPercentage, milestones: progress.milestones })
      : HttpResponse.json({ completionPercentage: 0, milestones: {} });
  }),

  http.get(`${FSP_CURRICULUM}/traininghub/v1.0/operators/:operatorId/checkrideExamScores`, () => {
    return HttpResponse.json(enrollmentProgress.checkrideExamScores);
  }),

  http.get(`${FSP_CURRICULUM}/traininghub/v1.0/operators/:operatorId/knowledgetests`, () => {
    return HttpResponse.json(enrollmentProgress.knowledgeTests);
  }),

  // ── 16. Students ─────────────────────────────────────────────────────────

  http.post(`${FSP_CURRICULUM}/traininghub/v1.0/operators/:operatorId/students/search`, async ({ request }) => {
    const body = await request.json() as { query?: string };
    const query = (body.query ?? '').toLowerCase();
    const results = students.students.filter(
      (s) => !query || s.fullName.toLowerCase().includes(query)
    );
    return HttpResponse.json(results);
  }),

  http.get(`${FSP_CURRICULUM}/traininghub/v1.0/operators/:operatorId/students`, () => {
    return HttpResponse.json(students.students);
  }),

  http.get(`${FSP_CURRICULUM}/traininghub/v1.0/operators/:operatorId/students/dropdownitems`, () => {
    return HttpResponse.json(students.studentDropdownItems);
  }),

  http.get(`${FSP_CURRICULUM}/traininghub/v1.0/operators/:operatorId/alerts`, () => {
    return HttpResponse.json(students.trainingAlerts);
  }),

  // ── 17. Weather ──────────────────────────────────────────────────────────

  http.get(`${FSP_BASE}/common/v1.0/weather/metar`, () => {
    return HttpResponse.json(weather.metar);
  }),

  http.get(`${FSP_BASE}/common/v1.0/weather/taf`, () => {
    return HttpResponse.json(weather.taf);
  }),

  // ── 18. Civil Twilight ───────────────────────────────────────────────────

  http.get(`${FSP_BASE}/common/v1.0/operators/:operatorId/locations/:locationId/civilTwilight`, ({ params }) => {
    const locData = civilTwilight.civilTwilight[params.locationId as string];
    return locData ? HttpResponse.json(locData) : HttpResponse.json({ dates: {} });
  }),

  // ── 19. Flight Alerts ────────────────────────────────────────────────────

  http.get(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/flightAlerts`, () => {
    return HttpResponse.json(flightAlerts.flightAlerts);
  }),

  http.post(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/flightAlerts/:reservationId`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.put(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/flightAlerts/:reservationId`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.post(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/flightAlerts/:reservationId/complete`, () => {
    return HttpResponse.json({ success: true });
  }),

  http.get(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/flightAlerts/overdue`, () => {
    return HttpResponse.json(flightAlerts.overdueAlerts);
  }),

  http.get(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/flightAlerts/aircraft/:aircraftId`, ({ params }) => {
    const alerts = flightAlerts.alertsByAircraft[params.aircraftId as string] ?? [];
    return HttpResponse.json(alerts);
  }),

  http.get(`${FSP_BASE}/schedulinghub/v1.0/operators/:operatorId/flightAlerts/type/:flightAlertType`, () => {
    return HttpResponse.json(flightAlerts.flightAlerts);
  }),
];
