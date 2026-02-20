/**
 * Bprint schema version helpers.
 *
 * schemaVersion is a customer-controlled field that tracks their schema's
 * revision history. It follows a "major.minor" format (e.g., "1.0", "2.3").
 * Customers increment it each time they change their .bprint file.
 */

/** Regex that enforces "major.minor" format (e.g., "1.0", "1.1", "2.0") */
export const SPEC_VERSION_PATTERN = /^\d+\.\d+$/;
