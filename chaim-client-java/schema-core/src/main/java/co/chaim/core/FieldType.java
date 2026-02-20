package co.chaim.core;

import java.util.Set;

/**
 * Valid field type prefixes for .bprint schemas.
 *
 * <p>Field types support an optional dot-notation sub-type qualifier that controls
 * the generated language type without changing the DynamoDB storage type.
 *
 * <h3>Numeric sub-types ({@code number.*} and {@code numberSet.*})</h3>
 * <pre>
 *   number.int      → Integer / int32
 *   number.long     → Long    / int64
 *   number.float    → Float   / float32
 *   number.double   → Double  / float64 (explicit)
 *   number.decimal  → BigDecimal / Decimal
 * </pre>
 *
 * <h3>Timestamp sub-types ({@code timestamp.*})</h3>
 * <pre>
 *   timestamp.epoch → Long (epoch ms, stored as DynamoDB N)
 *   timestamp.date  → LocalDate (ISO-8601 date, stored as DynamoDB S)
 * </pre>
 *
 * <p>Bare types without a suffix (e.g. {@code "number"}, {@code "timestamp"})
 * fall back to their default language mapping.
 */
public enum FieldType {
    string, number, bool, boolean_, binary, timestamp, list, map, stringSet, numberSet;

    private static final Set<String> NUMBER_SUFFIXES = Set.of("int", "long", "float", "double", "decimal");
    private static final Set<String> TIMESTAMP_SUFFIXES = Set.of("epoch", "date");

    // Base type names accepted without a suffix (includes "boolean" as alias for "bool")
    private static final Set<String> BASE_NAMES = Set.of(
        "string", "number", "bool", "boolean", "binary", "timestamp", "list", "map", "stringSet", "numberSet"
    );

    /**
     * Return true if {@code s} is a valid field type string.
     * Accepts both bare types ({@code "number"}) and dot-qualified types
     * ({@code "number.int"}, {@code "numberSet.decimal"}, {@code "timestamp.epoch"}).
     *
     * @param s the type string from a .bprint schema
     * @return true if valid
     */
    public static boolean isValid(String s) {
        if (s == null || s.isEmpty()) return false;

        int dot = s.indexOf('.');
        if (dot < 0) {
            return BASE_NAMES.contains(s);
        }

        String prefix = s.substring(0, dot);
        String suffix = s.substring(dot + 1);

        return switch (prefix) {
            case "number", "numberSet" -> NUMBER_SUFFIXES.contains(suffix);
            case "timestamp"           -> TIMESTAMP_SUFFIXES.contains(suffix);
            default                    -> false;
        };
    }
}
