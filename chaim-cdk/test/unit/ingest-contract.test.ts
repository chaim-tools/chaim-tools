import { describe, it, expect } from 'vitest';
import type {
  SnapshotAction,
  UploadUrlRequest,
  UploadUrlResponse,
  SnapshotRefUpsertRequest,
  SnapshotRefDeleteRequest,
  SnapshotRefResponse,
  CloudFormationRequestType,
  CustomResourceResponseData,
} from '../../src/types/ingest-contract';

describe('ingest-contract types', () => {
  describe('SnapshotAction', () => {
    it('should accept UPSERT action', () => {
      const action: SnapshotAction = 'UPSERT';
      expect(action).toBe('UPSERT');
    });

    it('should accept DELETE action', () => {
      const action: SnapshotAction = 'DELETE';
      expect(action).toBe('DELETE');
    });
  });

  describe('UploadUrlRequest', () => {
    it('should have required fields', () => {
      const request: UploadUrlRequest = {
        appId: 'test-app',
        eventId: 'event-123',
        contentHash: 'sha256:abc123',
      };

      expect(request.appId).toBe('test-app');
      expect(request.eventId).toBe('event-123');
      expect(request.contentHash).toBe('sha256:abc123');
    });
  });

  describe('UploadUrlResponse', () => {
    it('should have required fields', () => {
      const response: UploadUrlResponse = {
        uploadUrl: 'https://s3.amazonaws.com/bucket/key?signature',
        expiresAt: '2024-01-01T00:00:00Z',
      };

      expect(response.uploadUrl).toContain('https://');
      expect(response.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('SnapshotRefUpsertRequest', () => {
    it('should have all required fields for UPSERT', () => {
      const request: SnapshotRefUpsertRequest = {
        action: 'UPSERT',
        appId: 'test-app',
        eventId: 'event-123',
        contentHash: 'sha256:abc123',
        datastoreType: 'dynamodb',
        datastoreArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/MyTable',
        resourceId: 'MyTable__User',
        stackName: 'MyStack',
      };

      expect(request.action).toBe('UPSERT');
      expect(request.appId).toBeDefined();
      expect(request.eventId).toBeDefined();
      expect(request.contentHash).toBeDefined();
      expect(request.datastoreType).toBe('dynamodb');
      expect(request.datastoreArn).toContain('arn:aws:dynamodb');
      expect(request.resourceId).toBeDefined();
      expect(request.stackName).toBeDefined();
    });
  });

  describe('SnapshotRefDeleteRequest', () => {
    it('should have all required fields for DELETE', () => {
      const request: SnapshotRefDeleteRequest = {
        action: 'DELETE',
        appId: 'test-app',
        eventId: 'event-123',
        resourceId: 'MyTable__User',
        stackName: 'MyStack',
        datastoreType: 'dynamodb',
      };

      expect(request.action).toBe('DELETE');
      expect(request.appId).toBeDefined();
      expect(request.eventId).toBeDefined();
      expect(request.resourceId).toBeDefined();
      expect(request.stackName).toBeDefined();
      expect(request.datastoreType).toBeDefined();
    });

    it('should NOT have contentHash (unlike UPSERT)', () => {
      const request: SnapshotRefDeleteRequest = {
        action: 'DELETE',
        appId: 'test-app',
        eventId: 'event-123',
        resourceId: 'MyTable__User',
        stackName: 'MyStack',
        datastoreType: 'dynamodb',
      };

      // TypeScript enforces this, but let's verify the structure
      expect(request).not.toHaveProperty('contentHash');
    });
  });

  describe('SnapshotRefResponse', () => {
    it('should handle SUCCESS status', () => {
      const response: SnapshotRefResponse = {
        eventId: 'event-123',
        status: 'SUCCESS',
        processedAt: '2024-01-01T00:00:00Z',
      };

      expect(response.status).toBe('SUCCESS');
      expect(response.errorMessage).toBeUndefined();
    });

    it('should handle FAILED status with error message', () => {
      const response: SnapshotRefResponse = {
        eventId: 'event-123',
        status: 'FAILED',
        processedAt: '2024-01-01T00:00:00Z',
        errorMessage: 'Something went wrong',
      };

      expect(response.status).toBe('FAILED');
      expect(response.errorMessage).toBe('Something went wrong');
    });
  });

  describe('CloudFormationRequestType', () => {
    it('should accept Create type', () => {
      const type: CloudFormationRequestType = 'Create';
      expect(type).toBe('Create');
    });

    it('should accept Update type', () => {
      const type: CloudFormationRequestType = 'Update';
      expect(type).toBe('Update');
    });

    it('should accept Delete type', () => {
      const type: CloudFormationRequestType = 'Delete';
      expect(type).toBe('Delete');
    });
  });

  describe('CustomResourceResponseData', () => {
    it('should have all required fields', () => {
      const response: CustomResourceResponseData = {
        EventId: 'event-123',
        IngestStatus: 'SUCCESS',
        Action: 'UPSERT',
        Timestamp: '2024-01-01T00:00:00Z',
      };

      expect(response.EventId).toBeDefined();
      expect(response.IngestStatus).toBe('SUCCESS');
      expect(response.Action).toBe('UPSERT');
      expect(response.Timestamp).toBeDefined();
    });

    it('should allow optional ContentHash for UPSERT', () => {
      const response: CustomResourceResponseData = {
        EventId: 'event-123',
        IngestStatus: 'SUCCESS',
        Action: 'UPSERT',
        Timestamp: '2024-01-01T00:00:00Z',
        ContentHash: 'sha256:abc123',
      };

      expect(response.ContentHash).toBe('sha256:abc123');
    });

    it('should allow optional Error for FAILED status', () => {
      const response: CustomResourceResponseData = {
        EventId: 'event-123',
        IngestStatus: 'FAILED',
        Action: 'UPSERT',
        Timestamp: '2024-01-01T00:00:00Z',
        Error: 'Ingestion failed',
      };

      expect(response.Error).toBe('Ingestion failed');
    });
  });
});

