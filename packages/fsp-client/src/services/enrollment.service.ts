/**
 * enrollment.service.ts
 * ---------------------
 * Agentic Scheduler — FSP Integration — FSP Enrollment service
 * ------------------------------------------------------------
 * Provides student enrollment, progress tracking, and training history
 * operations on the FSP curriculum API.
 * All public methods return ServiceResult and never throw to the caller.
 *
 * Key exports: EnrollmentService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type {
  FspEnrollment,
  FspEnrollmentProgress,
  FspTrainingSession,
  FspStudentProgressReport,
  FspCheckrideScore,
  FspKnowledgeTest,
  ServiceResult,
} from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for enrollment and training progress operations on the FSP
 * curriculum API.
 */
@Injectable()
export class EnrollmentService {
  /**
   * @param curriculumClient - HTTP client bound to the FSP curriculum API base URL.
   */
  constructor(private readonly curriculumClient: FspHttpClient) {}

  /**
   * Retrieves all enrollments for a student.
   *
   * @param operatorId - The FSP operator identifier.
   * @param studentId  - The student identifier.
   * @returns ServiceResult containing an array of enrollments, or an error.
   */
  public async getEnrollments(
    operatorId: string,
    studentId: string,
  ): Promise<ServiceResult<FspEnrollment[]>> {
    try {
      const data = await this.curriculumClient.get<FspEnrollment[]>(
        `/api/V1/operator/${operatorId}/students/${studentId}/enrollments`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves details for a single enrollment.
   *
   * @param operatorId   - The FSP operator identifier.
   * @param enrollmentId - The enrollment identifier.
   * @returns ServiceResult containing the enrollment details, or an error.
   */
  public async getEnrollmentDetails(
    operatorId: string,
    enrollmentId: string,
  ): Promise<ServiceResult<FspEnrollment>> {
    try {
      const data = await this.curriculumClient.get<FspEnrollment>(
        `/api/V1/operator/${operatorId}/enrollments/${enrollmentId}`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves training progress for an enrollment.
   *
   * @param operatorId   - The FSP operator identifier.
   * @param enrollmentId - The enrollment identifier.
   * @returns ServiceResult containing the progress data, or an error.
   */
  public async getProgress(
    operatorId: string,
    enrollmentId: string,
  ): Promise<ServiceResult<FspEnrollmentProgress>> {
    try {
      const data = await this.curriculumClient.get<FspEnrollmentProgress>(
        `/api/V1/operator/${operatorId}/enrollments/${enrollmentId}/progress`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Updates training progress for an enrollment.
   *
   * @param operatorId   - The FSP operator identifier.
   * @param enrollmentId - The enrollment identifier.
   * @param req          - Updated progress data.
   * @returns ServiceResult containing the updated progress, or an error.
   */
  public async updateProgress(
    operatorId: string,
    enrollmentId: string,
    req: Partial<FspEnrollmentProgress>,
  ): Promise<ServiceResult<FspEnrollmentProgress>> {
    try {
      const data = await this.curriculumClient.put<FspEnrollmentProgress>(
        `/api/V1/operator/${operatorId}/enrollments/${enrollmentId}/progress`,
        req,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves enrollment history for a student.
   *
   * @param operatorId - The FSP operator identifier.
   * @param studentId  - The student identifier.
   * @returns ServiceResult containing an array of past enrollments, or an error.
   */
  public async getHistory(
    operatorId: string,
    studentId: string,
  ): Promise<ServiceResult<FspEnrollment[]>> {
    try {
      const data = await this.curriculumClient.get<FspEnrollment[]>(
        `/api/V1/operator/${operatorId}/students/${studentId}/enrollments/history`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves training sessions linked to an enrollment.
   *
   * @param operatorId   - The FSP operator identifier.
   * @param enrollmentId - The enrollment identifier.
   * @returns ServiceResult containing an array of training sessions, or an error.
   */
  public async getTrainingSessions(
    operatorId: string,
    enrollmentId: string,
  ): Promise<ServiceResult<FspTrainingSession[]>> {
    try {
      const data = await this.curriculumClient.get<FspTrainingSession[]>(
        `/api/V1/operator/${operatorId}/enrollments/${enrollmentId}/sessions`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves an aggregated progress report for a student.
   *
   * @param operatorId - The FSP operator identifier.
   * @param studentId  - The student identifier.
   * @returns ServiceResult containing the student progress report, or an error.
   */
  public async getStudentProgressReport(
    operatorId: string,
    studentId: string,
  ): Promise<ServiceResult<FspStudentProgressReport>> {
    try {
      const data = await this.curriculumClient.get<FspStudentProgressReport>(
        `/api/V1/operator/${operatorId}/students/${studentId}/progressReport`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves checkride scores for a student.
   *
   * @param operatorId - The FSP operator identifier.
   * @param studentId  - The student identifier.
   * @returns ServiceResult containing an array of checkride scores, or an error.
   */
  public async getCheckrideScores(
    operatorId: string,
    studentId: string,
  ): Promise<ServiceResult<FspCheckrideScore[]>> {
    try {
      const data = await this.curriculumClient.get<FspCheckrideScore[]>(
        `/api/V1/operator/${operatorId}/students/${studentId}/checkrideScores`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves knowledge test scores for a student.
   *
   * @param operatorId - The FSP operator identifier.
   * @param studentId  - The student identifier.
   * @returns ServiceResult containing an array of knowledge tests, or an error.
   */
  public async getKnowledgeTests(
    operatorId: string,
    studentId: string,
  ): Promise<ServiceResult<FspKnowledgeTest[]>> {
    try {
      const data = await this.curriculumClient.get<FspKnowledgeTest[]>(
        `/api/V1/operator/${operatorId}/students/${studentId}/knowledgeTests`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
