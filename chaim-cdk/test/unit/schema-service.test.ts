import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchemaService } from '../../src/services/schema-service';
import { SchemaData } from '@chaim-tools/chaim-bprint-spec';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs');
const mockFs = vi.mocked(fs);

describe('SchemaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateSchemaPath', () => {
    it('should accept valid .bprint file path', () => {
      mockFs.existsSync.mockReturnValue(true);
      
      expect(() => SchemaService.validateSchemaPath('./schemas/user.bprint')).not.toThrow();
    });

    it('should reject non-.bprint file extensions', () => {
      expect(() => SchemaService.validateSchemaPath('./schemas/user.json')).toThrow('Schema file must have a .bprint extension');
      expect(() => SchemaService.validateSchemaPath('./schemas/user.txt')).toThrow('Schema file must have a .bprint extension');
    });

    it('should reject empty schema path', () => {
      expect(() => SchemaService.validateSchemaPath('')).toThrow('Schema path is required');
    });

    it('should reject undefined schema path', () => {
      expect(() => SchemaService.validateSchemaPath(undefined as any)).toThrow('Schema path is required');
    });

    it('should reject non-existent file', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      expect(() => SchemaService.validateSchemaPath('./schemas/nonexistent.bprint')).toThrow('Schema file not found: ./schemas/nonexistent.bprint');
    });
  });

  describe('readSchema', () => {
    const validSchema: SchemaData = {
      schemaVersion: '1.0',
      entityName: 'User',
      description: 'User entity schema',
      identity: {
        fields: ['userId']
      },
      fields: [
        {
          name: 'userId',
          type: 'string',
          required: true
        },
        {
          name: 'email',
          type: 'string',
          required: true
        }
      ]
    };

    it('should read and parse valid schema file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validSchema));
      
      const result = SchemaService.readSchema('./schemas/user.bprint');
      
      expect(result).toEqual(validSchema);
      expect(mockFs.readFileSync).toHaveBeenCalledWith('./schemas/user.bprint', 'utf-8');
    });

    it('should throw error for invalid JSON', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json content');
      
      expect(() => SchemaService.readSchema('./schemas/user.bprint')).toThrow('Invalid JSON in schema file: ./schemas/user.bprint');
    });

    it('should validate schema structure after parsing', () => {
      mockFs.existsSync.mockReturnValue(true);
      const invalidSchema = { ...validSchema, identity: undefined };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidSchema));
      
      expect(() => SchemaService.readSchema('./schemas/user.bprint')).toThrow('Schema must include identity field');
    });

    it('should re-throw validation errors with context', () => {
      mockFs.existsSync.mockReturnValue(true);
      const invalidSchema = { ...validSchema, identity: undefined };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidSchema));
      
      expect(() => SchemaService.readSchema('./schemas/user.bprint')).toThrow('Schema validation failed for ./schemas/user.bprint: Schema must include identity field');
    });

    it('should re-throw non-Error exceptions as-is', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw 'string error';
      });
      
      expect(() => SchemaService.readSchema('./schemas/user.bprint')).toThrow('string error');
    });
  });

  describe('schema structure validation', () => {
    const baseValidSchema = {
      schemaVersion: '1.0',
      entityName: 'User',
      description: 'User entity schema',
      identity: { fields: ['userId'] },
      fields: [{ name: 'userId', type: 'string' }]
    };

    it('should accept valid schema structure', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(baseValidSchema));
      
      expect(() => SchemaService.readSchema('./schemas/user.bprint')).not.toThrow();
    });

    it('should reject schema without schemaVersion', () => {
      const invalidSchema = { ...baseValidSchema } as any;
      delete invalidSchema.schemaVersion;
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidSchema));
      
      expect(() => SchemaService.readSchema('./schemas/user.bprint')).toThrow('Schema must include schemaVersion field');
    });

    it('should reject schema without entityName', () => {
      const invalidSchema = { ...baseValidSchema } as any;
      delete invalidSchema.entityName;
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidSchema));
      
      expect(() => SchemaService.readSchema('./schemas/user.bprint')).toThrow('Schema must include entityName field');
    });

    it('should reject schema without description', () => {
      const invalidSchema = { ...baseValidSchema } as any;
      delete invalidSchema.description;
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidSchema));
      
      expect(() => SchemaService.readSchema('./schemas/user.bprint')).toThrow('Schema must include description field');
    });

    it('should reject schema without identity', () => {
      const invalidSchema = { ...baseValidSchema } as any;
      delete invalidSchema.identity;
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidSchema));
      
      expect(() => SchemaService.readSchema('./schemas/user.bprint')).toThrow('Schema must include identity field');
    });

    it('should reject schema without fields', () => {
      const invalidSchema = { ...baseValidSchema } as any;
      delete invalidSchema.fields;
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidSchema));
      
      expect(() => SchemaService.readSchema('./schemas/user.bprint')).toThrow('Schema must include fields array with at least one field');
    });
  });
});
