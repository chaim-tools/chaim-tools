/**
 * Chaim Ingestion Service
 * 
 * Provides utilities for Chaim SaaS ingestion.
 * The actual HTTP requests are made by the Lambda handler at runtime.
 * This service provides compile-time types and configuration utilities.
 */

import * as crypto from 'crypto';
import {
  DEFAULT_CHAIM_API_BASE_URL,
  CHAIM_ENDPOINTS,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from '../config/chaim-endpoints';

/**
 * Configuration for Chaim ingestion API.
 */
export interface IngestionConfig {
  /** Base URL for Chaim API */
  readonly baseUrl: string;

  /** Request timeout in milliseconds */
  readonly timeoutMs: number;

  /** Number of retry attempts */
  readonly retryAttempts: number;
}

/**
 * Default ingestion configuration.
 */
export const DEFAULT_INGESTION_CONFIG: IngestionConfig = {
  baseUrl: DEFAULT_CHAIM_API_BASE_URL,
  timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  retryAttempts: 3,
};

/**
 * Chaim ingestion API endpoints.
 * Re-exported from centralized config for backwards compatibility.
 */
export const INGESTION_ENDPOINTS = CHAIM_ENDPOINTS;

/**
 * IngestionService provides utilities for Chaim SaaS ingestion.
 * 
 * The actual HTTP requests are made by the Lambda handler at runtime.
 * This service provides compile-time types and configuration.
 */
export class IngestionService {
  /**
   * Get ingestion configuration from environment or defaults.
   */
  static getConfig(): IngestionConfig {
    return {
      baseUrl: process.env.CHAIM_API_BASE_URL || DEFAULT_INGESTION_CONFIG.baseUrl,
      timeoutMs: parseInt(process.env.CHAIM_API_TIMEOUT || String(DEFAULT_INGESTION_CONFIG.timeoutMs), 10),
      retryAttempts: parseInt(process.env.CHAIM_RETRY_ATTEMPTS || String(DEFAULT_INGESTION_CONFIG.retryAttempts), 10),
    };
  }

  /**
   * Build full URL for an ingestion endpoint.
   */
  static buildUrl(endpoint: keyof typeof CHAIM_ENDPOINTS, baseUrl?: string): string {
    const base = baseUrl || DEFAULT_INGESTION_CONFIG.baseUrl;
    return base + CHAIM_ENDPOINTS[endpoint];
  }

  /**
   * Compute HMAC-SHA256 signature for request body.
   */
  static computeSignature(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }
}
