/**
 * students.service.ts
 * -------------------
 * Agentic Scheduler — FSP Integration — FSP Students service
 * ----------------------------------------------------------
 * Provides student search, listing, and alert operations on the FSP core API.
 * All public methods return ServiceResult and never throw to the caller.
 *
 * Key exports: StudentsService
 *
 * Author: Agentic Scheduler Team
 * Project: Agentic Scheduler — FSP Integration
 * PR: PR-6 — FSP API Client Library
 */

import { Injectable } from '@nestjs/common';
import type {
  FspStudent,
  FspStudentDropdownItem,
  FspTrainingAlert,
  ServiceResult,
} from '@fsp-scheduler/shared-types';
import { FspHttpClient } from '../fsp-http.client';
import { buildError } from './_service-helpers';

/**
 * Service for student-related operations on the FSP core API.
 */
@Injectable()
export class StudentsService {
  /**
   * @param coreClient - HTTP client bound to the FSP core API base URL.
   */
  constructor(private readonly coreClient: FspHttpClient) {}

  /**
   * Searches for students by a query string (name, email, etc.).
   *
   * @param operatorId - The FSP operator identifier.
   * @param query      - The search query string.
   * @returns ServiceResult containing an array of matching students, or an error.
   */
  public async searchStudents(
    operatorId: string,
    query: string,
  ): Promise<ServiceResult<FspStudent[]>> {
    try {
      const data = await this.coreClient.get<FspStudent[]>(
        `/api/V1/operator/${operatorId}/students/search`,
        { q: query },
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Lists all students for the given operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing an array of students, or an error.
   */
  public async listStudents(operatorId: string): Promise<ServiceResult<FspStudent[]>> {
    try {
      const data = await this.coreClient.get<FspStudent[]>(
        `/api/V1/operator/${operatorId}/students`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves lightweight student records for use in dropdown/autocomplete UIs.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing an array of dropdown items, or an error.
   */
  public async getDropdownItems(
    operatorId: string,
  ): Promise<ServiceResult<FspStudentDropdownItem[]>> {
    try {
      const data = await this.coreClient.get<FspStudentDropdownItem[]>(
        `/api/V1/operator/${operatorId}/students/dropdown`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves a single student by their studentId.
   *
   * @param operatorId - The FSP operator identifier.
   * @param studentId  - The FSP student identifier.
   * @returns ServiceResult containing the student record, or an error.
   */
  public async getStudentById(
    operatorId: string,
    studentId: string,
  ): Promise<ServiceResult<FspStudent>> {
    try {
      const data = await this.coreClient.get<FspStudent>(
        `/api/V1/operator/${operatorId}/students/${studentId}`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }

  /**
   * Retrieves active training alerts for all students in an operator.
   *
   * @param operatorId - The FSP operator identifier.
   * @returns ServiceResult containing an array of training alerts, or an error.
   */
  public async getTrainingAlerts(operatorId: string): Promise<ServiceResult<FspTrainingAlert[]>> {
    try {
      const data = await this.coreClient.get<FspTrainingAlert[]>(
        `/api/V1/operator/${operatorId}/students/trainingAlerts`,
      );
      return { success: true, data };
    } catch (err) {
      return buildError(err);
    }
  }
}
