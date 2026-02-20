package co.chaim.generators.java;

import com.squareup.javapoet.*;
import co.chaim.core.model.BprintSchema;

import javax.lang.model.element.Modifier;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Java code generator for DynamoDB Enhanced Client.
 *
 * Uses schema-defined primary keys directly - no invented fields.
 * The partition key and sort key defined in the .bprint schema are
 * annotated with @DynamoDbPartitionKey and @DynamoDbSortKey respectively.
 *
 * Supports nameOverride for fields whose DynamoDB attribute names are not
 * valid Java identifiers. When the resolved code name differs from the
 * original DynamoDB attribute name, a @DynamoDbAttribute annotation is emitted.
 *
 * Supports collection types: list, map, stringSet, numberSet, and numberSet.*
 * Supports binary type (maps to byte[]).
 * For list-of-map and standalone map fields, generates inner @DynamoDbBean classes.
 *
 * <h3>Dot-notation sub-types</h3>
 * Field types support a dot-suffix that controls the generated Java type:
 * <ul>
 *   <li>{@code number.int}      → {@code Integer}</li>
 *   <li>{@code number.long}     → {@code Long}</li>
 *   <li>{@code number.float}    → {@code Float}</li>
 *   <li>{@code number.double}   → {@code Double} (explicit)</li>
 *   <li>{@code number.decimal}  → {@code BigDecimal}</li>
 *   <li>{@code numberSet.int}   → {@code Set<Integer>}</li>
 *   <li>{@code numberSet.long}  → {@code Set<Long>}</li>
 *   <li>{@code numberSet.decimal} → {@code Set<BigDecimal>}</li>
 *   <li>{@code timestamp.epoch} → {@code Long} (epoch ms, stored as DynamoDB N)</li>
 *   <li>{@code timestamp.date}  → {@code LocalDate} (ISO-8601 date, stored as DynamoDB S)</li>
 * </ul>
 *
 * {@code timestamp.date} fields require a {@code LocalDateConverter}. The generator
 * emits this converter once per table when any schema contains a {@code timestamp.date}
 * field, and annotates affected getters with {@code @DynamoDbConvertedBy(LocalDateConverter.class)}.
 *
 * Generates:
 * - Entity DTOs with DynamoDB Enhanced Client annotations on schema-defined keys
 * - Key constants helper ({Entity}Keys.java) with field name references
 * - Entity-specific repositories with key-based operations (with auto-validation on save)
 * - GSI/LSI query methods in repositories when index metadata is available
 * - Shared DI-friendly DynamoDB client (ChaimDynamoDbClient)
 * - Configuration with repository factory methods (ChaimConfig)
 * - Shared ChaimValidationException for structured field-level errors
 * - Per-entity {Entity}Validator with constraint checks from .bprint schema
 * - LocalDateConverter (once per table, only when timestamp.date fields are present)
 */
public class JavaGenerator {

    private static final Pattern VALID_JAVA_IDENTIFIER = Pattern.compile("^[a-zA-Z_$][a-zA-Z0-9_$]*$");

    // DynamoDB Enhanced Client annotation class names
    private static final ClassName DYNAMO_DB_BEAN = ClassName.get(
        "software.amazon.awssdk.enhanced.dynamodb.mapper.annotations", "DynamoDbBean");
    private static final ClassName DYNAMO_DB_PARTITION_KEY = ClassName.get(
        "software.amazon.awssdk.enhanced.dynamodb.mapper.annotations", "DynamoDbPartitionKey");
    private static final ClassName DYNAMO_DB_SORT_KEY = ClassName.get(
        "software.amazon.awssdk.enhanced.dynamodb.mapper.annotations", "DynamoDbSortKey");
    private static final ClassName DYNAMO_DB_ATTRIBUTE = ClassName.get(
        "software.amazon.awssdk.enhanced.dynamodb.mapper.annotations", "DynamoDbAttribute");
    private static final ClassName DYNAMO_DB_CONVERTED_BY = ClassName.get(
        "software.amazon.awssdk.enhanced.dynamodb.mapper.annotations", "DynamoDbConvertedBy");

    /**
     * Per-field descriptor used when generating plain-Java boilerplate
     * (constructors, setters, Builder, equals/hashCode/toString).
     * The {@code bprintType} carries the full dotted type string (e.g. "number.int")
     * and is used by {@link #formatDefaultInitializer} and constraint helpers.
     */
    private record PlainField(
        String codeName,
        TypeName type,
        Object defaultValue,    // null → no initializer
        String bprintType,      // full dotted type string, e.g. "number.int", "timestamp.epoch"
        boolean isEnumType      // true → emit EnumType.VALUE initializer
    ) {}

    // AWS SDK class names
    private static final ClassName DYNAMO_DB_ENHANCED_CLIENT = ClassName.get(
        "software.amazon.awssdk.enhanced.dynamodb", "DynamoDbEnhancedClient");
    private static final ClassName DYNAMO_DB_TABLE = ClassName.get(
        "software.amazon.awssdk.enhanced.dynamodb", "DynamoDbTable");
    private static final ClassName TABLE_SCHEMA = ClassName.get(
        "software.amazon.awssdk.enhanced.dynamodb", "TableSchema");
    private static final ClassName KEY = ClassName.get(
        "software.amazon.awssdk.enhanced.dynamodb", "Key");
    private static final ClassName DYNAMO_DB_INDEX = ClassName.get(
        "software.amazon.awssdk.enhanced.dynamodb", "DynamoDbIndex");
    private static final ClassName QUERY_CONDITIONAL = ClassName.get(
        "software.amazon.awssdk.enhanced.dynamodb.model", "QueryConditional");
    private static final ClassName DYNAMO_DB_CLIENT = ClassName.get(
        "software.amazon.awssdk.services.dynamodb", "DynamoDbClient");
    private static final ClassName REGION = ClassName.get(
        "software.amazon.awssdk.regions", "Region");

    /**
     * Generate code for multiple schemas sharing the same DynamoDB table.
     * This is the primary API for multi-entity table support.
     *
     * @param schemas List of .bprint schemas for entities in this table
     * @param pkg Java package name for generated code
     * @param outDir Output directory
     * @param tableMetadata Table metadata (name, ARN, region, GSI/LSI info)
     */
    public void generateForTable(List<BprintSchema> schemas, String pkg, Path outDir, TableMetadata tableMetadata) throws IOException {
        // Validate all schemas for name collisions before generating any code
        for (BprintSchema schema : schemas) {
            detectCollisions(schema.fields);
        }

        // Collect entity names for shared infrastructure generation
        List<String> entityNames = new ArrayList<>();
        for (BprintSchema schema : schemas) {
            entityNames.add(deriveEntityName(schema));
        }

        // 1. Generate shared infrastructure ONCE
        if (tableMetadata != null) {
            generateChaimDynamoDbClient(pkg, outDir);
            generateChaimConfig(tableMetadata, pkg, entityNames, outDir);
        }

        // 2. Generate shared validation exception ONCE
        generateChaimValidationException(pkg, outDir);

        // 3. Generate LocalDateConverter ONCE if any schema uses timestamp.date fields
        boolean needsLocalDateConverter = schemas.stream().anyMatch(JavaGenerator::hasTimestampDateField);
        if (needsLocalDateConverter) {
            generateLocalDateConverter(pkg, outDir);
        }

        // 4. Generate entity + keys + validator + repository for each schema
        for (BprintSchema schema : schemas) {
            String entityName = deriveEntityName(schema);
            generateEntity(schema, entityName, pkg, outDir);
            generateEntityKeys(schema, entityName, pkg, outDir, tableMetadata);
            generateValidator(schema, entityName, pkg, outDir);
            if (tableMetadata != null) {
                generateRepository(schema, entityName, pkg, outDir, tableMetadata);
            }
        }
    }

    /**
     * Derive entity name from schema.
     * Uses entityName field directly, or defaults to "Entity".
     */
    private String deriveEntityName(BprintSchema schema) {
        if (schema.entityName != null && !schema.entityName.isEmpty()) {
            return schema.entityName;
        }
        return "Entity";
    }

    // =========================================================================
    // Type Parsing
    // =========================================================================

    /**
     * Split a dotted type string into a [prefix, suffix] pair.
     * The suffix is {@code null} for bare types (no dot).
     *
     * <p>Examples:
     * <ul>
     *   <li>{@code "number"}      → {@code ["number", null]}</li>
     *   <li>{@code "number.int"}  → {@code ["number", "int"]}</li>
     *   <li>{@code "timestamp.epoch"} → {@code ["timestamp", "epoch"]}</li>
     * </ul>
     */
    private static String[] parseType(String type) {
        if (type == null) return new String[]{"string", null};
        int dot = type.indexOf('.');
        if (dot < 0) return new String[]{type, null};
        return new String[]{type.substring(0, dot), type.substring(dot + 1)};
    }

    // =========================================================================
    // Name Resolution
    // =========================================================================

    /**
     * Resolve the Java code name for a field.
     *
     * If nameOverride is set, use it directly.
     * Otherwise, auto-convert the DynamoDB attribute name to a valid Java identifier.
     */
    static String resolveCodeName(BprintSchema.Field field) {
        if (field.nameOverride != null && !field.nameOverride.isEmpty()) {
            return field.nameOverride;
        }
        if (VALID_JAVA_IDENTIFIER.matcher(field.name).matches()) {
            return field.name;
        }
        return toJavaCamelCase(field.name);
    }

    /**
     * Resolve the Java code name for a key field referenced by name.
     * Looks up the field in the schema and resolves its code name.
     */
    private String resolveKeyCodeName(BprintSchema schema, String keyFieldName) {
        for (BprintSchema.Field field : schema.fields) {
            if (field.name.equals(keyFieldName)) {
                return resolveCodeName(field);
            }
        }
        return toJavaCamelCase(keyFieldName);
    }

    /**
     * Convert a DynamoDB attribute name to a valid Java camelCase identifier.
     */
    static String toJavaCamelCase(String name) {
        if (name == null || name.isEmpty()) {
            return name;
        }

        // Handle all-caps: TTL -> ttl, ABC -> abc
        if (name.equals(name.toUpperCase()) && name.length() > 1 && !name.contains("-") && !name.contains("_")) {
            String result = name.toLowerCase();
            if (Character.isDigit(result.charAt(0))) {
                result = "_" + result;
            }
            return result;
        }

        // Split on hyphens and underscores
        String[] parts = name.split("[-_]");
        if (parts.length == 0) {
            return name;
        }

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            String part = parts[i];
            if (part.isEmpty()) continue;

            if (sb.isEmpty()) {
                sb.append(part.substring(0, 1).toLowerCase());
                if (part.length() > 1) {
                    sb.append(part.substring(1));
                }
            } else {
                sb.append(part.substring(0, 1).toUpperCase());
                if (part.length() > 1) {
                    sb.append(part.substring(1));
                }
            }
        }

        String result = sb.toString();

        if (!result.isEmpty() && Character.isDigit(result.charAt(0))) {
            result = "_" + result;
        }

        return result;
    }

    /**
     * Check if a @DynamoDbAttribute annotation is needed for this field.
     */
    static boolean needsAttributeAnnotation(BprintSchema.Field field, String codeName) {
        return !codeName.equals(field.name);
    }

    /**
     * Detect collisions in resolved code names across all fields.
     */
    static void detectCollisions(List<BprintSchema.Field> fields) {
        Map<String, List<String>> codeNameToOriginals = new HashMap<>();
        for (BprintSchema.Field field : fields) {
            String codeName = resolveCodeName(field);
            codeNameToOriginals.computeIfAbsent(codeName, k -> new ArrayList<>()).add(field.name);
        }

        for (Map.Entry<String, List<String>> entry : codeNameToOriginals.entrySet()) {
            if (entry.getValue().size() > 1) {
                throw new IllegalArgumentException(
                    "Name collision: fields " + entry.getValue() +
                    " all resolve to Java identifier '" + entry.getKey() +
                    "'. Add nameOverride to one of the conflicting fields in your .bprint."
                );
            }
        }
    }

    /**
     * Build a @DynamoDbAttribute annotation for the given DynamoDB attribute name.
     */
    private static AnnotationSpec dynamoDbAttributeAnnotation(String attributeName) {
        return AnnotationSpec.builder(DYNAMO_DB_ATTRIBUTE)
            .addMember("value", "$S", attributeName)
            .build();
    }

    // =========================================================================
    // Entity Generation
    // =========================================================================

    /**
     * Generate entity DTO with schema-defined keys annotated for DynamoDB.
     */
    private void generateEntity(BprintSchema schema, String entityName, String pkg, Path outDir) throws IOException {
        String pkFieldName = schema.identity.fields.get(0);
        String skFieldName = schema.identity.fields.size() > 1 ? schema.identity.fields.get(1) : null;
        boolean hasSortKey = skFieldName != null && !skFieldName.isEmpty();

        String pkCodeName = resolveKeyCodeName(schema, pkFieldName);
        String skCodeName = hasSortKey ? resolveKeyCodeName(schema, skFieldName) : null;

        ClassName localDateConverterClass = ClassName.get(pkg + ".converter", "LocalDateConverter");

        // Generate standalone enum files for top-level string fields that carry enum values.
        for (BprintSchema.Field field : schema.fields) {
            if ("string".equals(field.type) && hasEnumValues(field)) {
                String codeName = resolveCodeName(field);
                String enumName = entityName + cap(codeName);
                generateEnumFile(enumName, field.enumValues, field.description, pkg, outDir);
            }
        }

        TypeSpec.Builder tb = TypeSpec.classBuilder(entityName)
            .addModifiers(Modifier.PUBLIC)
            .addAnnotation(DYNAMO_DB_BEAN);

        record ResolvedField(BprintSchema.Field field, String codeName, TypeName type) {}
        List<ResolvedField> resolvedFields = new ArrayList<>();
        for (BprintSchema.Field field : schema.fields) {
            String codeName = resolveCodeName(field);
            TypeName type;
            if ("string".equals(field.type) && hasEnumValues(field)) {
                String enumName = entityName + cap(codeName);
                type = ClassName.get(pkg, enumName);
            } else {
                type = mapFieldType(field, pkg, outDir);
            }
            resolvedFields.add(new ResolvedField(field, codeName, type));
        }

        List<PlainField> plainFields = new ArrayList<>();
        for (ResolvedField rf : resolvedFields) {
            FieldSpec.Builder fieldBuilder = FieldSpec.builder(rf.type, rf.codeName, Modifier.PRIVATE);

            if (rf.field.description != null && !rf.field.description.isEmpty()) {
                fieldBuilder.addJavadoc("$L\n", rf.field.description);
            }
            if (Boolean.TRUE.equals(rf.field.nullable)) {
                fieldBuilder.addJavadoc("Nullable: explicitly allows null values.\n");
            }

            boolean isEnumType = "string".equals(rf.field.type) && hasEnumValues(rf.field);
            if (rf.field.defaultValue != null) {
                if (isEnumType) {
                    fieldBuilder.initializer("$T.$L", rf.type, rf.field.defaultValue.toString());
                } else {
                    fieldBuilder.initializer(formatDefaultInitializer(rf.field.type, rf.field.defaultValue));
                }
            }

            tb.addField(fieldBuilder.build());
            plainFields.add(new PlainField(rf.codeName, rf.type, rf.field.defaultValue, rf.field.type, isEnumType));
        }

        // Constructors
        addConstructors(tb, entityName, plainFields);

        // PK getter
        String pkGetterName = "get" + cap(pkCodeName);
        TypeName pkType = resolvedFields.stream()
            .filter(rf -> rf.field.name.equals(pkFieldName))
            .map(rf -> rf.type)
            .findFirst().orElse(ClassName.get(String.class));
        MethodSpec.Builder pkGetter = MethodSpec.methodBuilder(pkGetterName)
            .addModifiers(Modifier.PUBLIC)
            .addAnnotation(DYNAMO_DB_PARTITION_KEY)
            .returns(pkType)
            .addStatement("return $L", pkCodeName);
        if (!pkCodeName.equals(pkFieldName)) {
            pkGetter.addAnnotation(dynamoDbAttributeAnnotation(pkFieldName));
        }
        // timestamp.date PK (unusual, but complete)
        BprintSchema.Field pkField = resolvedFields.stream().filter(rf -> rf.field.name.equals(pkFieldName)).map(rf -> rf.field).findFirst().orElse(null);
        if (pkField != null && "timestamp.date".equals(pkField.type)) {
            pkGetter.addAnnotation(AnnotationSpec.builder(DYNAMO_DB_CONVERTED_BY).addMember("value", "$T.class", localDateConverterClass).build());
        }
        tb.addMethod(pkGetter.build());

        if (hasSortKey) {
            String skGetterName = "get" + cap(skCodeName);
            TypeName skType = resolvedFields.stream()
                .filter(rf -> rf.field.name.equals(skFieldName))
                .map(rf -> rf.type)
                .findFirst().orElse(ClassName.get(String.class));
            MethodSpec.Builder skGetter = MethodSpec.methodBuilder(skGetterName)
                .addModifiers(Modifier.PUBLIC)
                .addAnnotation(DYNAMO_DB_SORT_KEY)
                .returns(skType)
                .addStatement("return $L", skCodeName);
            if (!skCodeName.equals(skFieldName)) {
                skGetter.addAnnotation(dynamoDbAttributeAnnotation(skFieldName));
            }
            BprintSchema.Field skField = resolvedFields.stream().filter(rf -> rf.field.name.equals(skFieldName)).map(rf -> rf.field).findFirst().orElse(null);
            if (skField != null && "timestamp.date".equals(skField.type)) {
                skGetter.addAnnotation(AnnotationSpec.builder(DYNAMO_DB_CONVERTED_BY).addMember("value", "$T.class", localDateConverterClass).build());
            }
            tb.addMethod(skGetter.build());
        }

        for (ResolvedField rf : resolvedFields) {
            boolean isPk = rf.field.name.equals(pkFieldName);
            boolean isSk = hasSortKey && rf.field.name.equals(skFieldName);
            if (isPk || isSk) {
                continue;
            }
            MethodSpec.Builder getter = MethodSpec.methodBuilder("get" + cap(rf.codeName))
                .addModifiers(Modifier.PUBLIC)
                .returns(rf.type)
                .addStatement("return $L", rf.codeName);
            if (needsAttributeAnnotation(rf.field, rf.codeName)) {
                getter.addAnnotation(dynamoDbAttributeAnnotation(rf.field.name));
            }
            if ("timestamp.date".equals(rf.field.type)) {
                getter.addAnnotation(AnnotationSpec.builder(DYNAMO_DB_CONVERTED_BY)
                    .addMember("value", "$T.class", localDateConverterClass).build());
            }
            tb.addMethod(getter.build());
        }

        addSetters(tb, plainFields);
        addBuilderClass(tb, entityName, plainFields);
        addEqualsHashCodeToString(tb, entityName, plainFields);

        JavaFile.builder(pkg, tb.build())
            .skipJavaLangImports(true)
            .build()
            .writeTo(outDir);
    }

    // =========================================================================
    // Keys Helper Generation
    // =========================================================================

    /**
     * Generate key constants helper.
     */
    private void generateEntityKeys(BprintSchema schema, String entityName, String pkg, Path outDir, TableMetadata tableMetadata) throws IOException {
        String keysClassName = entityName + "Keys";

        String pkFieldName = schema.identity.fields.get(0);
        String skFieldName = schema.identity.fields.size() > 1 ? schema.identity.fields.get(1) : null;
        boolean hasSortKey = skFieldName != null && !skFieldName.isEmpty();

        String pkCodeName = resolveKeyCodeName(schema, pkFieldName);
        String skCodeName = hasSortKey ? resolveKeyCodeName(schema, skFieldName) : null;

        TypeSpec.Builder tb = TypeSpec.classBuilder(keysClassName)
            .addModifiers(Modifier.PUBLIC, Modifier.FINAL)
            .addJavadoc("Key constants for $L entity.\n", entityName)
            .addJavadoc("Partition key: $L\n", pkFieldName)
            .addJavadoc(hasSortKey ? "Sort key: $L\n" : "No sort key defined.\n", skFieldName);

        tb.addMethod(MethodSpec.constructorBuilder()
            .addModifiers(Modifier.PRIVATE)
            .build());

        tb.addField(FieldSpec.builder(String.class, "PARTITION_KEY_FIELD", Modifier.PUBLIC, Modifier.STATIC, Modifier.FINAL)
            .initializer("$S", pkFieldName)
            .addJavadoc("The DynamoDB attribute name used as partition key.\n")
            .build());

        if (hasSortKey) {
            tb.addField(FieldSpec.builder(String.class, "SORT_KEY_FIELD", Modifier.PUBLIC, Modifier.STATIC, Modifier.FINAL)
                .initializer("$S", skFieldName)
                .addJavadoc("The DynamoDB attribute name used as sort key.\n")
                .build());
        }

        if (tableMetadata != null && tableMetadata.globalSecondaryIndexes() != null) {
            for (TableMetadata.GSIMetadata gsi : tableMetadata.globalSecondaryIndexes()) {
                String constName = "INDEX_" + toConstantCase(gsi.indexName());
                tb.addField(FieldSpec.builder(String.class, constName, Modifier.PUBLIC, Modifier.STATIC, Modifier.FINAL)
                    .initializer("$S", gsi.indexName())
                    .addJavadoc("GSI index name: $L\n", gsi.indexName())
                    .build());
            }
        }

        if (tableMetadata != null && tableMetadata.localSecondaryIndexes() != null) {
            for (TableMetadata.LSIMetadata lsi : tableMetadata.localSecondaryIndexes()) {
                String constName = "INDEX_" + toConstantCase(lsi.indexName());
                tb.addField(FieldSpec.builder(String.class, constName, Modifier.PUBLIC, Modifier.STATIC, Modifier.FINAL)
                    .initializer("$S", lsi.indexName())
                    .addJavadoc("LSI index name: $L\n", lsi.indexName())
                    .build());
            }
        }

        if (hasSortKey) {
            tb.addMethod(MethodSpec.methodBuilder("key")
                .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
                .addJavadoc("Build a Key object for DynamoDB operations.\n")
                .addJavadoc("@param $L partition key value\n", pkCodeName)
                .addJavadoc("@param $L sort key value\n", skCodeName)
                .addParameter(String.class, pkCodeName)
                .addParameter(String.class, skCodeName)
                .returns(KEY)
                .addStatement("return $T.builder()\n.partitionValue($L)\n.sortValue($L)\n.build()",
                    KEY, pkCodeName, skCodeName)
                .build());
        } else {
            tb.addMethod(MethodSpec.methodBuilder("key")
                .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
                .addJavadoc("Build a Key object for DynamoDB operations.\n")
                .addJavadoc("@param $L partition key value\n", pkCodeName)
                .addParameter(String.class, pkCodeName)
                .returns(KEY)
                .addStatement("return $T.builder()\n.partitionValue($L)\n.build()",
                    KEY, pkCodeName)
                .build());
        }

        JavaFile.builder(pkg + ".keys", tb.build())
            .skipJavaLangImports(true)
            .build()
            .writeTo(outDir);
    }

    // =========================================================================
    // Repository Generation
    // =========================================================================

    /**
     * Generate entity-specific repository with key-based operations.
     */
    private void generateRepository(BprintSchema schema, String entityName, String pkg, Path outDir, TableMetadata tableMetadata) throws IOException {
        String repoClassName = entityName + "Repository";
        String pkFieldName = schema.identity.fields.get(0);
        String skFieldName = schema.identity.fields.size() > 1 ? schema.identity.fields.get(1) : null;
        boolean hasSortKey = skFieldName != null && !skFieldName.isEmpty();

        String pkCodeName = resolveKeyCodeName(schema, pkFieldName);
        String skCodeName = hasSortKey ? resolveKeyCodeName(schema, skFieldName) : null;

        ClassName entityClass = ClassName.get(pkg, entityName);
        ClassName keysClass = ClassName.get(pkg + ".keys", entityName + "Keys");
        ClassName clientClass = ClassName.get(pkg + ".client", "ChaimDynamoDbClient");
        ClassName validatorClass = ClassName.get(pkg + ".validation", entityName + "Validator");
        ParameterizedTypeName tableType = ParameterizedTypeName.get(DYNAMO_DB_TABLE, entityClass);
        ParameterizedTypeName optionalEntity = ParameterizedTypeName.get(
            ClassName.get("java.util", "Optional"), entityClass);
        ParameterizedTypeName listOfEntity = ParameterizedTypeName.get(
            ClassName.get("java.util", "List"), entityClass);

        TypeSpec.Builder tb = TypeSpec.classBuilder(repoClassName)
            .addModifiers(Modifier.PUBLIC)
            .addJavadoc("Repository for $L entity with key-based operations.\n", entityName)
            .addJavadoc("Partition key: $L\n", pkFieldName)
            .addJavadoc(hasSortKey ? "Sort key: $L\n" : "No sort key.\n", skFieldName)
            .addJavadoc("Validates constraints before save. No scan operations by default.\n");

        tb.addField(FieldSpec.builder(tableType, "table", Modifier.PRIVATE, Modifier.FINAL).build());

        tb.addMethod(MethodSpec.constructorBuilder()
            .addModifiers(Modifier.PUBLIC)
            .addParameter(clientClass, "client")
            .addStatement("this.table = client.getEnhancedClient()\n.table(client.getTableName(), $T.fromBean($T.class))",
                TABLE_SCHEMA, entityClass)
            .build());

        tb.addMethod(MethodSpec.constructorBuilder()
            .addModifiers(Modifier.PUBLIC)
            .addJavadoc("Constructor for dependency injection and testing.\n")
            .addParameter(DYNAMO_DB_ENHANCED_CLIENT, "enhancedClient")
            .addParameter(String.class, "tableName")
            .addStatement("this.table = enhancedClient.table(tableName, $T.fromBean($T.class))",
                TABLE_SCHEMA, entityClass)
            .build());

        tb.addMethod(MethodSpec.methodBuilder("save")
            .addModifiers(Modifier.PUBLIC)
            .addJavadoc("Save entity to DynamoDB. Validates constraints before persisting.\n")
            .addParameter(entityClass, "entity")
            .addStatement("$T.validate(entity)", validatorClass)
            .addStatement("table.putItem(entity)")
            .build());

        if (hasSortKey) {
            tb.addMethod(MethodSpec.methodBuilder("findByKey")
                .addModifiers(Modifier.PUBLIC)
                .addJavadoc("Find entity by partition key and sort key.\n")
                .addParameter(String.class, pkCodeName)
                .addParameter(String.class, skCodeName)
                .returns(optionalEntity)
                .addStatement("$T key = $T.key($L, $L)", KEY, keysClass, pkCodeName, skCodeName)
                .addStatement("return $T.ofNullable(table.getItem(key))", ClassName.get("java.util", "Optional"))
                .build());

            tb.addMethod(MethodSpec.methodBuilder("deleteByKey")
                .addModifiers(Modifier.PUBLIC)
                .addJavadoc("Delete entity by partition key and sort key.\n")
                .addParameter(String.class, pkCodeName)
                .addParameter(String.class, skCodeName)
                .addStatement("$T key = $T.key($L, $L)", KEY, keysClass, pkCodeName, skCodeName)
                .addStatement("table.deleteItem(key)")
                .build());
        } else {
            tb.addMethod(MethodSpec.methodBuilder("findByKey")
                .addModifiers(Modifier.PUBLIC)
                .addJavadoc("Find entity by partition key.\n")
                .addParameter(String.class, pkCodeName)
                .returns(optionalEntity)
                .addStatement("$T key = $T.key($L)", KEY, keysClass, pkCodeName)
                .addStatement("return $T.ofNullable(table.getItem(key))", ClassName.get("java.util", "Optional"))
                .build());

            tb.addMethod(MethodSpec.methodBuilder("deleteByKey")
                .addModifiers(Modifier.PUBLIC)
                .addJavadoc("Delete entity by partition key.\n")
                .addParameter(String.class, pkCodeName)
                .addStatement("$T key = $T.key($L)", KEY, keysClass, pkCodeName)
                .addStatement("table.deleteItem(key)")
                .build());
        }

        if (tableMetadata.globalSecondaryIndexes() != null) {
            for (TableMetadata.GSIMetadata gsi : tableMetadata.globalSecondaryIndexes()) {
                addIndexQueryMethods(tb, gsi.indexName(), gsi.partitionKey(), gsi.sortKey(),
                    entityClass, listOfEntity, schema);
            }
        }

        if (tableMetadata.localSecondaryIndexes() != null) {
            for (TableMetadata.LSIMetadata lsi : tableMetadata.localSecondaryIndexes()) {
                addIndexQueryMethods(tb, lsi.indexName(), pkFieldName, lsi.sortKey(),
                    entityClass, listOfEntity, schema);
            }
        }

        JavaFile.builder(pkg + ".repository", tb.build())
            .skipJavaLangImports(true)
            .build()
            .writeTo(outDir);
    }

    /**
     * Add queryBy{IndexName} methods for a GSI or LSI.
     * The generated parameter types are derived from the field's .bprint type so the
     * API is type-safe (e.g. a {@code number.long} sort key receives a {@code Long} parameter).
     * {@code timestamp.epoch} keys receive a {@code Long} and are passed directly.
     * Other {@code timestamp.*} keys receive an {@code Instant} / {@code LocalDate} and are
     * converted to their string representation before being handed to Key.Builder.
     */
    private void addIndexQueryMethods(TypeSpec.Builder tb, String indexName, String partitionKey,
            String sortKey, ClassName entityClass, ParameterizedTypeName listOfEntity,
            BprintSchema schema) {
        String methodName = "queryBy" + cap(toCamelCase(indexName));
        String pkParamName = toCamelCase(partitionKey);
        ParameterizedTypeName indexType = ParameterizedTypeName.get(DYNAMO_DB_INDEX, entityClass);

        TypeName pkParamType = resolveKeyParamType(partitionKey, schema);
        String pkKeyExpr = toKeyExpression(pkParamName, partitionKey, schema);

        // PK-only query
        tb.addMethod(MethodSpec.methodBuilder(methodName)
            .addModifiers(Modifier.PUBLIC)
            .addJavadoc("Query $L index by partition key.\n", indexName)
            .addParameter(pkParamType, pkParamName)
            .returns(listOfEntity)
            .addStatement("$T index = table.index($S)", indexType, indexName)
            .addStatement("$T condition = $T.keyEqualTo($T.builder().partitionValue($L).build())",
                QUERY_CONDITIONAL, QUERY_CONDITIONAL, KEY, pkKeyExpr)
            .addStatement("$T<$T> results = new $T<>()",
                ClassName.get("java.util", "List"), entityClass, ClassName.get("java.util", "ArrayList"))
            .addStatement("index.query(condition).forEach(page -> results.addAll(page.items()))")
            .addStatement("return results")
            .build());

        // PK+SK query (if sort key exists)
        if (sortKey != null && !sortKey.isEmpty()) {
            String skParamName = toCamelCase(sortKey);
            TypeName skParamType = resolveKeyParamType(sortKey, schema);
            String skKeyExpr = toKeyExpression(skParamName, sortKey, schema);
            tb.addMethod(MethodSpec.methodBuilder(methodName)
                .addModifiers(Modifier.PUBLIC)
                .addJavadoc("Query $L index by partition key and sort key.\n", indexName)
                .addParameter(pkParamType, pkParamName)
                .addParameter(skParamType, skParamName)
                .returns(listOfEntity)
                .addStatement("$T index = table.index($S)", indexType, indexName)
                .addStatement("$T condition = $T.keyEqualTo($T.builder().partitionValue($L).sortValue($L).build())",
                    QUERY_CONDITIONAL, QUERY_CONDITIONAL, KEY, pkKeyExpr, skKeyExpr)
                .addStatement("$T<$T> results = new $T<>()",
                    ClassName.get("java.util", "List"), entityClass, ClassName.get("java.util", "ArrayList"))
                .addStatement("index.query(condition).forEach(page -> results.addAll(page.items()))")
                .addStatement("return results")
                .build());
        }
    }

    /**
     * Resolve the Java parameter type for a DynamoDB key field by looking it up in the schema.
     * Respects dot-notation sub-types (e.g. {@code number.long} → {@code Long}).
     */
    private static TypeName resolveKeyParamType(String fieldName, BprintSchema schema) {
        if (schema != null && schema.fields != null) {
            for (BprintSchema.Field f : schema.fields) {
                if (fieldName.equals(f.name)) {
                    return mapScalarType(f.type);
                }
            }
        }
        return ClassName.get(String.class);
    }

    /**
     * Return the Java expression to pass a key parameter to Key.Builder.partitionValue() /
     * sortValue(). String and number fields pass the variable directly.
     * {@code timestamp} (bare) and {@code timestamp.date} fields must be converted to
     * their string representation. {@code timestamp.epoch} is a Long and passes directly.
     */
    private static String toKeyExpression(String paramName, String fieldName, BprintSchema schema) {
        if (schema != null && schema.fields != null) {
            for (BprintSchema.Field f : schema.fields) {
                if (fieldName.equals(f.name)) {
                    String[] parts = parseType(f.type);
                    if ("timestamp".equals(parts[0]) && !"epoch".equals(parts[1])) {
                        return paramName + ".toString()";
                    }
                    return paramName;
                }
            }
        }
        return paramName;
    }

    // =========================================================================
    // Shared Infrastructure Generation
    // =========================================================================

    /**
     * Generate DI-friendly DynamoDB client wrapper with builder pattern.
     */
    private void generateChaimDynamoDbClient(String pkg, Path outDir) throws IOException {
        TypeSpec.Builder tb = TypeSpec.classBuilder("ChaimDynamoDbClient")
            .addModifiers(Modifier.PUBLIC)
            .addJavadoc("DI-friendly DynamoDB Enhanced Client wrapper.\n")
            .addJavadoc("Supports builder pattern, endpoint override, and client injection.\n");

        tb.addField(FieldSpec.builder(DYNAMO_DB_ENHANCED_CLIENT, "enhancedClient", Modifier.PRIVATE, Modifier.FINAL).build());
        tb.addField(FieldSpec.builder(String.class, "tableName", Modifier.PRIVATE, Modifier.FINAL).build());

        tb.addMethod(MethodSpec.constructorBuilder()
            .addModifiers(Modifier.PRIVATE)
            .addParameter(DYNAMO_DB_ENHANCED_CLIENT, "enhancedClient")
            .addParameter(String.class, "tableName")
            .addStatement("this.enhancedClient = enhancedClient")
            .addStatement("this.tableName = tableName")
            .build());

        tb.addMethod(MethodSpec.methodBuilder("getEnhancedClient")
            .addModifiers(Modifier.PUBLIC)
            .returns(DYNAMO_DB_ENHANCED_CLIENT)
            .addStatement("return enhancedClient")
            .build());

        tb.addMethod(MethodSpec.methodBuilder("getTableName")
            .addModifiers(Modifier.PUBLIC)
            .returns(String.class)
            .addStatement("return tableName")
            .build());

        ClassName builderClass = ClassName.get(pkg + ".client", "ChaimDynamoDbClient", "Builder");
        tb.addMethod(MethodSpec.methodBuilder("builder")
            .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
            .addJavadoc("Create a builder for configuration.\n")
            .returns(builderClass)
            .addStatement("return new Builder()")
            .build());

        ClassName clientClass = ClassName.get(pkg + ".client", "ChaimDynamoDbClient");
        tb.addMethod(MethodSpec.methodBuilder("wrap")
            .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
            .addJavadoc("Wrap an existing EnhancedClient (for testing/DI).\n")
            .addParameter(DYNAMO_DB_ENHANCED_CLIENT, "client")
            .addParameter(String.class, "tableName")
            .returns(clientClass)
            .addStatement("return new $T(client, tableName)", clientClass)
            .build());

        TypeSpec.Builder builderBuilder = TypeSpec.classBuilder("Builder")
            .addModifiers(Modifier.PUBLIC, Modifier.STATIC);

        builderBuilder.addField(String.class, "tableName", Modifier.PRIVATE);
        builderBuilder.addField(String.class, "region", Modifier.PRIVATE);
        builderBuilder.addField(String.class, "endpoint", Modifier.PRIVATE);
        builderBuilder.addField(DYNAMO_DB_ENHANCED_CLIENT, "existingClient", Modifier.PRIVATE);

        builderBuilder.addMethod(MethodSpec.methodBuilder("tableName")
            .addModifiers(Modifier.PUBLIC)
            .addParameter(String.class, "tableName")
            .returns(builderClass)
            .addStatement("this.tableName = tableName")
            .addStatement("return this")
            .build());

        builderBuilder.addMethod(MethodSpec.methodBuilder("region")
            .addModifiers(Modifier.PUBLIC)
            .addParameter(String.class, "region")
            .returns(builderClass)
            .addStatement("this.region = region")
            .addStatement("return this")
            .build());

        builderBuilder.addMethod(MethodSpec.methodBuilder("endpoint")
            .addModifiers(Modifier.PUBLIC)
            .addJavadoc("Override endpoint for local DynamoDB testing.\n")
            .addJavadoc("Example: \"http://localhost:8000\"\n")
            .addParameter(String.class, "endpoint")
            .returns(builderClass)
            .addStatement("this.endpoint = endpoint")
            .addStatement("return this")
            .build());

        builderBuilder.addMethod(MethodSpec.methodBuilder("existingClient")
            .addModifiers(Modifier.PUBLIC)
            .addJavadoc("Use an existing client (for dependency injection).\n")
            .addParameter(DYNAMO_DB_ENHANCED_CLIENT, "client")
            .returns(builderClass)
            .addStatement("this.existingClient = client")
            .addStatement("return this")
            .build());

        builderBuilder.addMethod(MethodSpec.methodBuilder("build")
            .addModifiers(Modifier.PUBLIC)
            .returns(clientClass)
            .beginControlFlow("if (existingClient != null)")
            .addStatement("return new $T(existingClient, tableName)", clientClass)
            .endControlFlow()
            .addCode("\n// Check environment overrides\n")
            .addStatement("String resolvedTable = resolve(tableName, \"CHAIM_TABLE_NAME\")")
            .addStatement("String resolvedRegion = resolve(region, \"AWS_REGION\", \"AWS_DEFAULT_REGION\")")
            .addStatement("String resolvedEndpoint = resolve(endpoint, \"DYNAMODB_ENDPOINT\")")
            .addCode("\n")
            .addStatement("$T.Builder ddbBuilder = $T.builder()", DYNAMO_DB_CLIENT, DYNAMO_DB_CLIENT)
            .beginControlFlow("if (resolvedRegion != null)")
            .addStatement("ddbBuilder.region($T.of(resolvedRegion))", REGION)
            .endControlFlow()
            .beginControlFlow("if (resolvedEndpoint != null)")
            .addStatement("ddbBuilder.endpointOverride($T.create(resolvedEndpoint))", ClassName.get("java.net", "URI"))
            .endControlFlow()
            .addCode("\n")
            .addStatement("$T enhanced = $T.builder()\n.dynamoDbClient(ddbBuilder.build())\n.build()",
                DYNAMO_DB_ENHANCED_CLIENT, DYNAMO_DB_ENHANCED_CLIENT)
            .addStatement("return new $T(enhanced, resolvedTable)", clientClass)
            .build());

        builderBuilder.addMethod(MethodSpec.methodBuilder("resolve")
            .addModifiers(Modifier.PRIVATE)
            .addParameter(String.class, "value")
            .addParameter(ArrayTypeName.of(String.class), "envVars")
            .varargs(true)
            .returns(String.class)
            .beginControlFlow("if (value != null)")
            .addStatement("return value")
            .endControlFlow()
            .beginControlFlow("for (String env : envVars)")
            .addStatement("String v = System.getenv(env)")
            .beginControlFlow("if (v != null && !v.isEmpty())")
            .addStatement("return v")
            .endControlFlow()
            .endControlFlow()
            .addStatement("return null")
            .build());

        tb.addType(builderBuilder.build());

        JavaFile.builder(pkg + ".client", tb.build())
            .skipJavaLangImports(true)
            .build()
            .writeTo(outDir);
    }

    /**
     * Generate ChaimConfig with table constants and repository factory methods.
     */
    private void generateChaimConfig(TableMetadata tableMetadata, String pkg, List<String> entityNames, Path outDir) throws IOException {
        ClassName clientClass = ClassName.get(pkg + ".client", "ChaimDynamoDbClient");
        ClassName builderClass = ClassName.get(pkg + ".client", "ChaimDynamoDbClient", "Builder");

        TypeSpec.Builder tb = TypeSpec.classBuilder("ChaimConfig")
            .addModifiers(Modifier.PUBLIC)
            .addJavadoc("Configuration class with table constants and repository factories.\n");

        tb.addField(FieldSpec.builder(String.class, "TABLE_NAME", Modifier.PUBLIC, Modifier.STATIC, Modifier.FINAL)
            .initializer("$S", tableMetadata.tableName())
            .build());

        // TABLE_ARN is only available after `cdk deploy` — it cannot be known at synth time.
        // Always resolve purely from the CHAIM_TABLE_ARN environment variable set by CDK at
        // deploy time. The ARN is not required for standard DynamoDB operations; the table
        // name (TABLE_NAME) is sufficient. Returns null when not deployed.
        tb.addField(FieldSpec.builder(String.class, "TABLE_ARN", Modifier.PUBLIC, Modifier.STATIC, Modifier.FINAL)
            .addJavadoc("Table ARN, resolved at runtime from the {@code CHAIM_TABLE_ARN} environment variable.\n")
            .addJavadoc("Set automatically by CDK after deployment. Returns {@code null} during local development.\n")
            .initializer("$T.getenv($S)", System.class, "CHAIM_TABLE_ARN")
            .build());

        tb.addField(FieldSpec.builder(String.class, "REGION", Modifier.PUBLIC, Modifier.STATIC, Modifier.FINAL)
            .initializer("$S", tableMetadata.region())
            .build());

        tb.addField(FieldSpec.builder(clientClass, "sharedClient", Modifier.PRIVATE, Modifier.STATIC, Modifier.VOLATILE)
            .build());

        tb.addMethod(MethodSpec.methodBuilder("getClient")
            .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
            .addJavadoc("Get or create the shared client (lazy singleton).\n")
            .returns(clientClass)
            .beginControlFlow("if (sharedClient == null)")
            .beginControlFlow("synchronized ($T.class)", ClassName.get(pkg + ".config", "ChaimConfig"))
            .beginControlFlow("if (sharedClient == null)")
            .addStatement("sharedClient = $T.builder()\n.tableName(TABLE_NAME)\n.region(REGION)\n.build()", clientClass)
            .endControlFlow()
            .endControlFlow()
            .endControlFlow()
            .addStatement("return sharedClient")
            .build());

        tb.addMethod(MethodSpec.methodBuilder("clientBuilder")
            .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
            .addJavadoc("Create a custom client builder (for testing or custom config).\n")
            .returns(builderClass)
            .addStatement("return $T.builder()\n.tableName(TABLE_NAME)\n.region(REGION)", clientClass)
            .build());

        for (String entityName : entityNames) {
            String methodName = uncap(entityName) + "Repository";
            ClassName repoClass = ClassName.get(pkg + ".repository", entityName + "Repository");

            tb.addMethod(MethodSpec.methodBuilder(methodName)
                .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
                .returns(repoClass)
                .addStatement("return new $T(getClient())", repoClass)
                .build());

            tb.addMethod(MethodSpec.methodBuilder(methodName)
                .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
                .addParameter(clientClass, "client")
                .returns(repoClass)
                .addStatement("return new $T(client)", repoClass)
                .build());
        }

        JavaFile.builder(pkg + ".config", tb.build())
            .skipJavaLangImports(true)
            .build()
            .writeTo(outDir);
    }

    // =========================================================================
    // Validation Generation
    // =========================================================================

    /**
     * Generate the shared ChaimValidationException class.
     */
    private void generateChaimValidationException(String pkg, Path outDir) throws IOException {
        ClassName fieldErrorClass = ClassName.get(pkg + ".validation", "ChaimValidationException", "FieldError");
        ParameterizedTypeName listOfFieldError = ParameterizedTypeName.get(
            ClassName.get("java.util", "List"), fieldErrorClass);

        TypeSpec.Builder fieldErrorBuilder = TypeSpec.classBuilder("FieldError")
            .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
            .addField(FieldSpec.builder(String.class, "fieldName", Modifier.PRIVATE, Modifier.FINAL).build())
            .addField(FieldSpec.builder(String.class, "constraint", Modifier.PRIVATE, Modifier.FINAL).build())
            .addField(FieldSpec.builder(String.class, "message", Modifier.PRIVATE, Modifier.FINAL).build());

        fieldErrorBuilder.addMethod(MethodSpec.constructorBuilder()
            .addModifiers(Modifier.PUBLIC)
            .addParameter(String.class, "fieldName")
            .addParameter(String.class, "constraint")
            .addParameter(String.class, "message")
            .addStatement("this.fieldName = fieldName")
            .addStatement("this.constraint = constraint")
            .addStatement("this.message = message")
            .build());

        fieldErrorBuilder.addMethod(MethodSpec.methodBuilder("getFieldName")
            .addModifiers(Modifier.PUBLIC)
            .returns(String.class)
            .addStatement("return fieldName")
            .build());

        fieldErrorBuilder.addMethod(MethodSpec.methodBuilder("getConstraint")
            .addModifiers(Modifier.PUBLIC)
            .returns(String.class)
            .addStatement("return constraint")
            .build());

        fieldErrorBuilder.addMethod(MethodSpec.methodBuilder("getMessage")
            .addModifiers(Modifier.PUBLIC)
            .returns(String.class)
            .addStatement("return message")
            .build());

        fieldErrorBuilder.addMethod(MethodSpec.methodBuilder("toString")
            .addAnnotation(Override.class)
            .addModifiers(Modifier.PUBLIC)
            .returns(String.class)
            .addStatement("return fieldName + $S + message", ": ")
            .build());

        TypeSpec.Builder tb = TypeSpec.classBuilder("ChaimValidationException")
            .addModifiers(Modifier.PUBLIC)
            .superclass(RuntimeException.class)
            .addJavadoc("Validation exception with structured field-level errors.\n")
            .addJavadoc("Collects all constraint violations before throwing.\n");

        tb.addField(FieldSpec.builder(listOfFieldError, "errors", Modifier.PRIVATE, Modifier.FINAL).build());

        tb.addMethod(MethodSpec.constructorBuilder()
            .addModifiers(Modifier.PUBLIC)
            .addParameter(String.class, "entityName")
            .addParameter(listOfFieldError, "errors")
            .addStatement("super(entityName + $S + errors.size() + $S)", " validation failed: ", " error(s)")
            .addStatement("this.errors = $T.unmodifiableList(errors)", ClassName.get("java.util", "Collections"))
            .build());

        tb.addMethod(MethodSpec.methodBuilder("getErrors")
            .addModifiers(Modifier.PUBLIC)
            .addJavadoc("Get the list of field-level validation errors.\n")
            .returns(listOfFieldError)
            .addStatement("return errors")
            .build());

        tb.addType(fieldErrorBuilder.build());

        JavaFile.builder(pkg + ".validation", tb.build())
            .skipJavaLangImports(true)
            .build()
            .writeTo(outDir);
    }

    /**
     * Generate a per-entity Validator class with constraint checks.
     */
    private void generateValidator(BprintSchema schema, String entityName, String pkg, Path outDir) throws IOException {
        String validatorClassName = entityName + "Validator";
        ClassName entityClass = ClassName.get(pkg, entityName);
        ClassName exceptionClass = ClassName.get(pkg + ".validation", "ChaimValidationException");
        ClassName fieldErrorClass = ClassName.get(pkg + ".validation", "ChaimValidationException", "FieldError");
        ParameterizedTypeName listOfFieldError = ParameterizedTypeName.get(
            ClassName.get("java.util", "List"), fieldErrorClass);

        boolean needsValidation = false;
        for (BprintSchema.Field field : schema.fields) {
            if (field.required || (!isCollectionType(field.type) && (hasFieldConstraints(field) || hasEnumValues(field)))) {
                needsValidation = true;
                break;
            }
        }

        MethodSpec.Builder validateMethod = MethodSpec.methodBuilder("validate")
            .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
            .addJavadoc("Validate entity against .bprint schema rules (required, constraints, enum).\n")
            .addJavadoc("@param entity the entity to validate\n")
            .addJavadoc("@throws ChaimValidationException if any validations fail\n")
            .addParameter(entityClass, "entity");

        if (needsValidation) {
            validateMethod.addStatement("$T errors = new $T<>()", listOfFieldError,
                ClassName.get("java.util", "ArrayList"));

            for (BprintSchema.Field field : schema.fields) {
                boolean isRequired = field.required;
                boolean isCollection = isCollectionType(field.type);
                boolean hasConstraints = !isCollection && hasFieldConstraints(field);
                boolean hasEnum = !isCollection && hasEnumValues(field);

                if (!isRequired && !hasConstraints && !hasEnum) continue;

                String codeName = resolveCodeName(field);
                String getterName = "get" + cap(codeName);
                String originalName = field.name;

                if (isRequired) {
                    validateMethod.beginControlFlow("if (entity.$L() == null)", getterName)
                        .addStatement("errors.add(new $T($S, $S, $S))",
                            fieldErrorClass, originalName, "required", "is required but was null")
                        .endControlFlow();
                }

                // String and number constraint checks; enum type system enforces valid values at compile time.
                if (hasConstraints && !hasEnumValues(field)) {
                    BprintSchema.Constraints c = field.constraints;
                    if ("string".equals(parseType(field.type)[0])) {
                        addStringConstraintChecks(validateMethod, getterName, originalName, c, fieldErrorClass);
                    } else if ("number".equals(parseType(field.type)[0])) {
                        addNumberConstraintChecks(validateMethod, getterName, originalName, c, fieldErrorClass, field.type);
                    }
                }
            }

            validateMethod.beginControlFlow("if (!errors.isEmpty())")
                .addStatement("throw new $T($S, errors)", exceptionClass, entityName)
                .endControlFlow();
        }

        TypeSpec.Builder tb = TypeSpec.classBuilder(validatorClassName)
            .addModifiers(Modifier.PUBLIC, Modifier.FINAL)
            .addJavadoc("Validator for $L entity.\n", entityName)
            .addJavadoc("Checks required fields, constraints, and enum values from the .bprint schema.\n");

        tb.addMethod(MethodSpec.constructorBuilder()
            .addModifiers(Modifier.PRIVATE)
            .build());

        tb.addMethod(validateMethod.build());

        JavaFile.builder(pkg + ".validation", tb.build())
            .skipJavaLangImports(true)
            .build()
            .writeTo(outDir);
    }

    /**
     * Check if a field has any active constraints.
     */
    private static boolean hasFieldConstraints(BprintSchema.Field field) {
        if (field.constraints == null) return false;
        BprintSchema.Constraints c = field.constraints;
        return c.minLength != null || c.maxLength != null || c.pattern != null
            || c.min != null || c.max != null;
    }

    /**
     * Add string constraint validation checks (minLength, maxLength, pattern).
     */
    private void addStringConstraintChecks(MethodSpec.Builder method, String getterName,
            String originalName, BprintSchema.Constraints c, ClassName fieldErrorClass) {
        method.beginControlFlow("if (entity.$L() != null)", getterName);

        if (c.minLength != null) {
            method.beginControlFlow("if (entity.$L().length() < $L)", getterName, c.minLength)
                .addStatement("errors.add(new $T($S, $S, $S + entity.$L().length()))",
                    fieldErrorClass, originalName, "minLength",
                    "must have minimum length " + c.minLength + ", got ", getterName)
                .endControlFlow();
        }

        if (c.maxLength != null) {
            method.beginControlFlow("if (entity.$L().length() > $L)", getterName, c.maxLength)
                .addStatement("errors.add(new $T($S, $S, $S + entity.$L().length()))",
                    fieldErrorClass, originalName, "maxLength",
                    "must have maximum length " + c.maxLength + ", got ", getterName)
                .endControlFlow();
        }

        if (c.pattern != null) {
            method.beginControlFlow("if (!entity.$L().matches($S))", getterName, c.pattern)
                .addStatement("errors.add(new $T($S, $S, $S))",
                    fieldErrorClass, originalName, "pattern",
                    "must match pattern '" + c.pattern + "'")
                .endControlFlow();
        }

        method.endControlFlow();
    }

    /**
     * Add number constraint validation checks (min, max).
     * {@code number.decimal} fields use {@code compareTo()} instead of primitive operators.
     *
     * @param fieldType the full dotted field type, e.g. {@code "number.decimal"} or {@code "number.int"}
     */
    private void addNumberConstraintChecks(MethodSpec.Builder method, String getterName,
            String originalName, BprintSchema.Constraints c, ClassName fieldErrorClass, String fieldType) {
        method.beginControlFlow("if (entity.$L() != null)", getterName);

        boolean isDecimal = "decimal".equals(parseType(fieldType)[1]);

        if (c.min != null) {
            if (isDecimal) {
                method.beginControlFlow("if (entity.$L().compareTo($T.valueOf($L)) < 0)",
                        getterName, java.math.BigDecimal.class, c.min)
                    .addStatement("errors.add(new $T($S, $S, $S + entity.$L()))",
                        fieldErrorClass, originalName, "min",
                        "must be >= " + c.min + ", got ", getterName)
                    .endControlFlow();
            } else {
                method.beginControlFlow("if (entity.$L() < $L)", getterName, c.min)
                    .addStatement("errors.add(new $T($S, $S, $S + entity.$L()))",
                        fieldErrorClass, originalName, "min",
                        "must be >= " + c.min + ", got ", getterName)
                    .endControlFlow();
            }
        }

        if (c.max != null) {
            if (isDecimal) {
                method.beginControlFlow("if (entity.$L().compareTo($T.valueOf($L)) > 0)",
                        getterName, java.math.BigDecimal.class, c.max)
                    .addStatement("errors.add(new $T($S, $S, $S + entity.$L()))",
                        fieldErrorClass, originalName, "max",
                        "must be <= " + c.max + ", got ", getterName)
                    .endControlFlow();
            } else {
                method.beginControlFlow("if (entity.$L() > $L)", getterName, c.max)
                    .addStatement("errors.add(new $T($S, $S, $S + entity.$L()))",
                        fieldErrorClass, originalName, "max",
                        "must be <= " + c.max + ", got ", getterName)
                    .endControlFlow();
            }
        }

        method.endControlFlow();
    }

    // =========================================================================
    // LocalDateConverter Generation
    // =========================================================================

    /**
     * Generate a {@code LocalDateConverter} class in the {@code pkg.converter} sub-package.
     * This converter is required by the DynamoDB Enhanced Client to serialize/deserialize
     * {@code java.time.LocalDate} fields annotated with {@code @DynamoDbConvertedBy}.
     *
     * <p>Only generated when at least one schema field uses {@code timestamp.date}.
     */
    private void generateLocalDateConverter(String pkg, Path outDir) throws IOException {
        ClassName localDate = ClassName.get("java.time", "LocalDate");
        ClassName attributeConverter = ClassName.get("software.amazon.awssdk.enhanced.dynamodb", "AttributeConverter");
        ClassName attributeValueType = ClassName.get("software.amazon.awssdk.enhanced.dynamodb", "AttributeValueType");
        ClassName enhancedType = ClassName.get("software.amazon.awssdk.enhanced.dynamodb", "EnhancedType");
        ClassName attributeValue = ClassName.get("software.amazon.awssdk.services.dynamodb.model", "AttributeValue");
        ParameterizedTypeName converterType = ParameterizedTypeName.get(attributeConverter, localDate);
        ParameterizedTypeName enhancedLocalDate = ParameterizedTypeName.get(enhancedType, localDate);

        TypeSpec.Builder tb = TypeSpec.classBuilder("LocalDateConverter")
            .addModifiers(Modifier.PUBLIC)
            .addSuperinterface(converterType)
            .addJavadoc("DynamoDB attribute converter for {@code java.time.LocalDate}.\n")
            .addJavadoc("Stores dates as ISO-8601 date strings (e.g. {@code \"2024-01-15\"}) in DynamoDB S attributes.\n")
            .addJavadoc("Automatically applied to {@code timestamp.date} fields via {@code @DynamoDbConvertedBy}.\n");

        tb.addMethod(MethodSpec.methodBuilder("transformFrom")
            .addAnnotation(Override.class)
            .addModifiers(Modifier.PUBLIC)
            .addParameter(localDate, "input")
            .returns(attributeValue)
            .addStatement("return $T.builder().s(input.toString()).build()", attributeValue)
            .build());

        tb.addMethod(MethodSpec.methodBuilder("transformTo")
            .addAnnotation(Override.class)
            .addModifiers(Modifier.PUBLIC)
            .addParameter(attributeValue, "input")
            .returns(localDate)
            .addStatement("return $T.parse(input.s())", localDate)
            .build());

        tb.addMethod(MethodSpec.methodBuilder("type")
            .addAnnotation(Override.class)
            .addModifiers(Modifier.PUBLIC)
            .returns(enhancedLocalDate)
            .addStatement("return $T.of($T.class)", enhancedType, localDate)
            .build());

        tb.addMethod(MethodSpec.methodBuilder("attributeValueType")
            .addAnnotation(Override.class)
            .addModifiers(Modifier.PUBLIC)
            .returns(attributeValueType)
            .addStatement("return $T.S", attributeValueType)
            .build());

        JavaFile.builder(pkg + ".converter", tb.build())
            .skipJavaLangImports(true)
            .build()
            .writeTo(outDir);
    }

    /**
     * Return true if any top-level or nested field in the schema uses {@code timestamp.date}.
     */
    private static boolean hasTimestampDateField(BprintSchema schema) {
        if (schema.fields == null) return false;
        for (BprintSchema.Field f : schema.fields) {
            if ("timestamp.date".equals(f.type)) return true;
            if (f.fields != null && hasTimestampDateInNested(f.fields)) return true;
            if (f.items != null && "timestamp.date".equals(f.items.type)) return true;
        }
        return false;
    }

    private static boolean hasTimestampDateInNested(List<BprintSchema.NestedField> fields) {
        for (BprintSchema.NestedField nf : fields) {
            if ("timestamp.date".equals(nf.type)) return true;
            if (nf.fields != null && hasTimestampDateInNested(nf.fields)) return true;
            if (nf.items != null && "timestamp.date".equals(nf.items.type)) return true;
        }
        return false;
    }

    // =========================================================================
    // Type Mapping
    // =========================================================================

    /**
     * Return true if this is a collection type (list, map, stringSet, numberSet or numberSet.*).
     */
    private static boolean isCollectionType(String type) {
        String prefix = parseType(type)[0];
        return "list".equals(prefix) || "map".equals(prefix)
            || "stringSet".equals(prefix) || "numberSet".equals(prefix);
    }

    /**
     * Map a field to its Java type, handling both scalar and collection types.
     * For list-of-map and standalone map, writes standalone {@code @DynamoDbBean}
     * classes to the {@code {pkg}.model} sub-package.
     */
    private TypeName mapFieldType(BprintSchema.Field field, String pkg, Path outDir) throws IOException {
        String[] parts = parseType(field.type);
        String prefix = parts[0];
        String suffix = parts[1];
        return switch (prefix) {
            case "list"      -> mapListType(field, pkg, outDir);
            case "map"       -> mapMapType(field, pkg, outDir);
            case "stringSet" -> ParameterizedTypeName.get(
                ClassName.get("java.util", "Set"), ClassName.get(String.class));
            case "numberSet" -> ParameterizedTypeName.get(
                ClassName.get("java.util", "Set"), mapNumberType(suffix));
            default          -> mapScalarType(field.type);
        };
    }

    /**
     * Map a list field to its Java type.
     * For list-of-scalars: {@code List<String>}, {@code List<Integer>}, etc.
     * For list-of-map: writes a standalone model class and returns {@code List<ModelClass>}.
     */
    private TypeName mapListType(BprintSchema.Field field, String pkg, Path outDir) throws IOException {
        if (field.items == null) {
            return ParameterizedTypeName.get(
                ClassName.get("java.util", "List"), ClassName.get(Object.class));
        }

        if ("map".equals(field.items.type) && field.items.fields != null) {
            String codeName = resolveCodeName(field);
            String innerClassName = cap(codeName) + "Item";
            ClassName innerRef = writeModelClass(innerClassName, field.items.fields, pkg, outDir);
            return ParameterizedTypeName.get(ClassName.get("java.util", "List"), innerRef);
        }

        TypeName elementType = mapScalarType(field.items.type);
        return ParameterizedTypeName.get(ClassName.get("java.util", "List"), elementType);
    }

    /**
     * Map a standalone map field to its Java type.
     */
    private TypeName mapMapType(BprintSchema.Field field, String pkg, Path outDir) throws IOException {
        if (field.fields == null || field.fields.isEmpty()) {
            return ClassName.get(Object.class);
        }

        String codeName = resolveCodeName(field);
        String innerClassName = cap(codeName);
        return writeModelClass(innerClassName, field.fields, pkg, outDir);
    }

    /**
     * Write a standalone {@code @DynamoDbBean} class to the {@code {pkg}.model} sub-package.
     * Applies {@code @DynamoDbConvertedBy(LocalDateConverter.class)} to getters of
     * {@code timestamp.date} fields automatically.
     */
    private ClassName writeModelClass(String className, List<BprintSchema.NestedField> nestedFields,
            String pkg, Path outDir) throws IOException {
        String modelPkg = pkg + ".model";
        ClassName classRef = ClassName.get(modelPkg, className);
        ClassName localDateConverterClass = ClassName.get(pkg + ".converter", "LocalDateConverter");

        TypeSpec.Builder tb = TypeSpec.classBuilder(className)
            .addModifiers(Modifier.PUBLIC)
            .addAnnotation(DYNAMO_DB_BEAN);

        List<PlainField> plainFields = new ArrayList<>();

        for (BprintSchema.NestedField nf : nestedFields) {
            String codeName;
            if (nf.nameOverride != null && !nf.nameOverride.isEmpty()) {
                codeName = nf.nameOverride;
            } else if (VALID_JAVA_IDENTIFIER.matcher(nf.name).matches()) {
                codeName = nf.name;
            } else {
                codeName = toJavaCamelCase(nf.name);
            }

            TypeName fieldType;
            boolean isEnumType = false;

            if ("map".equals(nf.type) && nf.fields != null && !nf.fields.isEmpty()) {
                String nestedClassName = className + cap(codeName);
                fieldType = writeModelClass(nestedClassName, nf.fields, pkg, outDir);
            } else if ("list".equals(nf.type) && nf.items != null) {
                if ("map".equals(nf.items.type) && nf.items.fields != null && !nf.items.fields.isEmpty()) {
                    String nestedClassName = className + cap(codeName) + "Item";
                    ClassName nestedRef = writeModelClass(nestedClassName, nf.items.fields, pkg, outDir);
                    fieldType = ParameterizedTypeName.get(ClassName.get("java.util", "List"), nestedRef);
                } else {
                    TypeName elementType = mapScalarType(nf.items.type);
                    fieldType = ParameterizedTypeName.get(ClassName.get("java.util", "List"), elementType);
                }
            } else if ("string".equals(nf.type) && nf.enumValues != null && !nf.enumValues.isEmpty()) {
                String innerEnumName = cap(codeName);
                TypeSpec.Builder enumBuilder = TypeSpec.enumBuilder(innerEnumName)
                    .addModifiers(Modifier.PUBLIC);
                if (nf.description != null && !nf.description.isEmpty()) {
                    enumBuilder.addJavadoc("$L\n", nf.description);
                }
                for (String v : nf.enumValues) {
                    enumBuilder.addEnumConstant(v);
                }
                tb.addType(enumBuilder.build());
                fieldType = classRef.nestedClass(innerEnumName);
                isEnumType = true;
            } else {
                fieldType = mapScalarType(nf.type);
            }

            FieldSpec.Builder fieldBuilder = FieldSpec.builder(fieldType, codeName, Modifier.PRIVATE);

            if (nf.description != null && !nf.description.isEmpty()) {
                fieldBuilder.addJavadoc("$L\n", nf.description);
            }
            if (Boolean.TRUE.equals(nf.nullable)) {
                fieldBuilder.addJavadoc("Nullable: explicitly allows null values.\n");
            }

            if (nf.defaultValue != null) {
                if (isEnumType) {
                    fieldBuilder.initializer("$T.$L", classRef.nestedClass(cap(codeName)), nf.defaultValue.toString());
                } else {
                    fieldBuilder.initializer(formatDefaultInitializer(nf.type, nf.defaultValue));
                }
            }

            tb.addField(fieldBuilder.build());
            plainFields.add(new PlainField(codeName, fieldType, nf.defaultValue, nf.type, isEnumType));
        }

        addConstructors(tb, className, plainFields);

        for (int i = 0; i < nestedFields.size(); i++) {
            BprintSchema.NestedField nf = nestedFields.get(i);
            PlainField pf = plainFields.get(i);
            MethodSpec.Builder getter = MethodSpec.methodBuilder("get" + cap(pf.codeName))
                .addModifiers(Modifier.PUBLIC)
                .returns(pf.type)
                .addStatement("return $L", pf.codeName);
            if (!pf.codeName.equals(nf.name)) {
                getter.addAnnotation(dynamoDbAttributeAnnotation(nf.name));
            }
            if ("timestamp.date".equals(nf.type)) {
                getter.addAnnotation(AnnotationSpec.builder(DYNAMO_DB_CONVERTED_BY)
                    .addMember("value", "$T.class", localDateConverterClass).build());
            }
            tb.addMethod(getter.build());
        }

        addSetters(tb, plainFields);
        addBuilderClass(tb, className, plainFields);
        addEqualsHashCodeToString(tb, className, plainFields);

        JavaFile.builder(modelPkg, tb.build())
            .skipJavaLangImports(true)
            .build()
            .writeTo(outDir);

        return classRef;
    }

    // =========================================================================
    // Plain-Java Boilerplate Helpers
    // =========================================================================

    private static void addConstructors(TypeSpec.Builder tb, String className, List<PlainField> fields) {
        tb.addMethod(MethodSpec.constructorBuilder()
            .addModifiers(Modifier.PUBLIC)
            .addJavadoc("Default no-arg constructor (required by DynamoDB Enhanced Client).\n")
            .build());

        if (!fields.isEmpty()) {
            MethodSpec.Builder allArgs = MethodSpec.constructorBuilder()
                .addModifiers(Modifier.PUBLIC)
                .addJavadoc("All-args constructor.\n");
            for (PlainField f : fields) {
                allArgs.addParameter(f.type, f.codeName);
            }
            for (PlainField f : fields) {
                allArgs.addStatement("this.$L = $L", f.codeName, f.codeName);
            }
            tb.addMethod(allArgs.build());
        }
    }

    private static void addSetters(TypeSpec.Builder tb, List<PlainField> fields) {
        for (PlainField f : fields) {
            tb.addMethod(MethodSpec.methodBuilder("set" + cap(f.codeName))
                .addModifiers(Modifier.PUBLIC)
                .addParameter(f.type, f.codeName)
                .addStatement("this.$L = $L", f.codeName, f.codeName)
                .build());
        }
    }

    /**
     * Emit a static {@code Builder} inner class and a {@code builder()} factory method.
     */
    private static void addBuilderClass(TypeSpec.Builder tb, String className, List<PlainField> fields) {
        ClassName builderRef = ClassName.bestGuess("Builder");
        ClassName entityRef = ClassName.bestGuess(className);

        tb.addMethod(MethodSpec.methodBuilder("builder")
            .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
            .returns(builderRef)
            .addStatement("return new Builder()")
            .build());

        TypeSpec.Builder builderTb = TypeSpec.classBuilder("Builder")
            .addModifiers(Modifier.PUBLIC, Modifier.STATIC);

        for (PlainField f : fields) {
            FieldSpec.Builder fb = FieldSpec.builder(f.type, f.codeName, Modifier.PRIVATE);
            if (f.defaultValue != null) {
                if (f.isEnumType) {
                    fb.initializer("$T.$L", f.type, f.defaultValue.toString());
                } else {
                    fb.initializer(formatDefaultInitializer(f.bprintType, f.defaultValue));
                }
            }
            builderTb.addField(fb.build());
        }

        for (PlainField f : fields) {
            builderTb.addMethod(MethodSpec.methodBuilder(f.codeName)
                .addModifiers(Modifier.PUBLIC)
                .addParameter(f.type, f.codeName)
                .returns(builderRef)
                .addStatement("this.$L = $L", f.codeName, f.codeName)
                .addStatement("return this")
                .build());
        }

        MethodSpec.Builder buildMethod = MethodSpec.methodBuilder("build")
            .addModifiers(Modifier.PUBLIC)
            .returns(entityRef);
        if (fields.isEmpty()) {
            buildMethod.addStatement("return new $T()", entityRef);
        } else {
            String argList = fields.stream().map(f -> f.codeName).collect(Collectors.joining(", "));
            buildMethod.addStatement("return new $T($L)", entityRef, argList);
        }
        builderTb.addMethod(buildMethod.build());

        tb.addType(builderTb.build());
    }

    private static void addEqualsHashCodeToString(TypeSpec.Builder tb, String className, List<PlainField> fields) {
        ClassName objectsClass = ClassName.get("java.util", "Objects");
        ClassName entityRef = ClassName.bestGuess(className);

        MethodSpec.Builder equalsMethod = MethodSpec.methodBuilder("equals")
            .addAnnotation(Override.class)
            .addModifiers(Modifier.PUBLIC)
            .returns(boolean.class)
            .addParameter(ClassName.get(Object.class), "o");
        equalsMethod.addStatement("if (this == o) return true");
        equalsMethod.addStatement("if (!(o instanceof $T)) return false", entityRef);
        equalsMethod.addStatement("$T that = ($T) o", entityRef, entityRef);
        if (fields.isEmpty()) {
            equalsMethod.addStatement("return true");
        } else {
            StringBuilder condExpr = new StringBuilder("return ");
            List<Object> condArgs = new ArrayList<>();
            for (int i = 0; i < fields.size(); i++) {
                if (i > 0) condExpr.append("\n    && ");
                condExpr.append("$T.equals($L, that.$L)");
                condArgs.add(objectsClass);
                condArgs.add(fields.get(i).codeName);
                condArgs.add(fields.get(i).codeName);
            }
            equalsMethod.addStatement(condExpr.toString(), condArgs.toArray());
        }
        tb.addMethod(equalsMethod.build());

        MethodSpec.Builder hashCodeMethod = MethodSpec.methodBuilder("hashCode")
            .addAnnotation(Override.class)
            .addModifiers(Modifier.PUBLIC)
            .returns(int.class);
        if (fields.isEmpty()) {
            hashCodeMethod.addStatement("return 0");
        } else {
            String hashArgs = fields.stream().map(f -> f.codeName).collect(Collectors.joining(", "));
            hashCodeMethod.addStatement("return $T.hash($L)", objectsClass, hashArgs);
        }
        tb.addMethod(hashCodeMethod.build());

        MethodSpec.Builder toStringMethod = MethodSpec.methodBuilder("toString")
            .addAnnotation(Override.class)
            .addModifiers(Modifier.PUBLIC)
            .returns(ClassName.get(String.class));
        if (fields.isEmpty()) {
            toStringMethod.addStatement("return $S", className + "{}");
        } else {
            StringBuilder tsExpr = new StringBuilder("return $S");
            List<Object> tsArgs = new ArrayList<>();
            tsArgs.add(className + "{" + fields.get(0).codeName + "=");
            tsExpr.append(" + $L");
            tsArgs.add(fields.get(0).codeName);
            for (int i = 1; i < fields.size(); i++) {
                tsExpr.append(" + $S + $L");
                tsArgs.add(", " + fields.get(i).codeName + "=");
                tsArgs.add(fields.get(i).codeName);
            }
            tsExpr.append(" + $S");
            tsArgs.add("}");
            toStringMethod.addStatement(tsExpr.toString(), tsArgs.toArray());
        }
        tb.addMethod(toStringMethod.build());
    }

    /**
     * Generate a top-level Java enum file for a string field that carries a fixed set of
     * allowed values.
     */
    private void generateEnumFile(String enumName, List<String> values, String description,
            String pkg, Path outDir) throws IOException {
        TypeSpec.Builder eb = TypeSpec.enumBuilder(enumName)
            .addModifiers(Modifier.PUBLIC);
        if (description != null && !description.isEmpty()) {
            eb.addJavadoc("$L\n", description);
        }
        for (String v : values) {
            eb.addEnumConstant(v);
        }
        JavaFile.builder(pkg, eb.build())
            .skipJavaLangImports(true)
            .build()
            .writeTo(outDir);
    }

    /**
     * Map a numeric suffix to its Java boxed type.
     * When suffix is {@code null} (bare {@code "number"}), returns {@code Integer}.
     *
     * | suffix   | Java type  |
     * |----------|------------|
     * | int      | Integer    |
     * | long     | Long       |
     * | float    | Float      |
     * | double   | Double     |
     * | decimal  | BigDecimal |
     * | (null)   | Integer    |
     */
    private static ClassName mapNumberType(String suffix) {
        if (suffix == null) return ClassName.get(Integer.class);
        return switch (suffix) {
            case "int"     -> ClassName.get(Integer.class);
            case "long"    -> ClassName.get(Long.class);
            case "float"   -> ClassName.get(Float.class);
            case "double"  -> ClassName.get(Double.class);
            case "decimal" -> ClassName.get(java.math.BigDecimal.class);
            default        -> ClassName.get(Integer.class); // unknown suffix falls back to Integer
        };
    }

    /**
     * Map a timestamp suffix to its Java type.
     *
     * | suffix | Java type  | DynamoDB | Description           |
     * |--------|------------|----------|-----------------------|
     * | epoch  | Long       | N        | Epoch milliseconds    |
     * | date   | LocalDate  | S        | ISO-8601 date only    |
     * | (null) | Instant    | S        | ISO-8601 full instant |
     */
    private static ClassName mapTimestampType(String suffix) {
        if (suffix == null) return ClassName.get(java.time.Instant.class);
        return switch (suffix) {
            case "epoch" -> ClassName.get(Long.class);
            case "date"  -> ClassName.get("java.time", "LocalDate");
            default      -> ClassName.get(java.time.Instant.class);
        };
    }

    /**
     * Map a full bprint type string (including dot-notation suffix) to its Java {@link ClassName}.
     * Handles all scalar types; collection types should be mapped via {@link #mapFieldType}.
     *
     * <p>Examples:
     * <ul>
     *   <li>{@code "string"}          → {@code String}</li>
     *   <li>{@code "number"}          → {@code Integer}</li>
     *   <li>{@code "number.int"}      → {@code Integer}</li>
     *   <li>{@code "number.decimal"}  → {@code BigDecimal}</li>
     *   <li>{@code "timestamp"}       → {@code Instant}</li>
     *   <li>{@code "timestamp.epoch"} → {@code Long}</li>
     *   <li>{@code "timestamp.date"}  → {@code LocalDate}</li>
     *   <li>{@code "boolean"}         → {@code Boolean}</li>
     *   <li>{@code "binary"}          → {@code byte[]}</li>
     * </ul>
     */
    private static TypeName mapScalarType(String type) {
        String[] parts = parseType(type);
        String prefix = parts[0];
        String suffix = parts[1];
        return switch (prefix) {
            case "string"          -> ClassName.get(String.class);
            case "number"          -> mapNumberType(suffix);
            case "boolean", "bool" -> ClassName.get(Boolean.class);
            case "binary"          -> ArrayTypeName.of(TypeName.BYTE);
            case "timestamp"       -> mapTimestampType(suffix);
            default                -> ClassName.get(Object.class);
        };
    }

    // =========================================================================
    // Default Initializer
    // =========================================================================

    /**
     * Format a default value as a Java field initializer code block.
     * The full dotted {@code fieldType} (e.g. {@code "number.long"}, {@code "timestamp.epoch"})
     * controls the emitted literal:
     *
     * <ul>
     *   <li>{@code number.int}       → plain integer literal, e.g. {@code 0}</li>
     *   <li>{@code number.long}      → long literal, e.g. {@code 0L}</li>
     *   <li>{@code number.float}     → float literal, e.g. {@code 0.0f}</li>
     *   <li>{@code number.decimal}   → {@code new BigDecimal("0.0")}</li>
     *   <li>{@code number.double} / bare {@code number} → double literal, e.g. {@code 0.0}</li>
     *   <li>{@code timestamp}        → {@code Instant.parse("...")}</li>
     *   <li>{@code timestamp.epoch}  → long literal (epoch ms), e.g. {@code 1700000000000L}</li>
     *   <li>{@code timestamp.date}   → {@code LocalDate.parse("...")}</li>
     * </ul>
     */
    private static CodeBlock formatDefaultInitializer(String fieldType, Object defaultValue) {
        String[] parts = parseType(fieldType);
        String prefix = parts[0];
        String suffix = parts[1];

        return switch (prefix) {
            case "string" -> CodeBlock.of("$S", defaultValue.toString());
            case "number" -> {
                Number num = (defaultValue instanceof Number n)
                    ? n
                    : Double.parseDouble(defaultValue.toString());
                yield switch (suffix != null ? suffix : "int") {
                    case "int"     -> CodeBlock.of("$L", num.intValue());
                    case "long"    -> CodeBlock.of("$LL", num.longValue());
                    case "float"   -> CodeBlock.of("$Lf", num.floatValue());
                    case "double"  -> CodeBlock.of("$L", num.doubleValue());
                    case "decimal" -> CodeBlock.of("new $T($S)", java.math.BigDecimal.class, defaultValue.toString());
                    default        -> CodeBlock.of("$L", num.intValue()); // unknown falls back to int
                };
            }
            case "boolean", "bool" -> CodeBlock.of("$L", Boolean.valueOf(defaultValue.toString()));
            case "timestamp" -> {
                if ("epoch".equals(suffix)) {
                    Number num = (defaultValue instanceof Number n)
                        ? n
                        : Long.parseLong(defaultValue.toString());
                    yield CodeBlock.of("$LL", num.longValue());
                } else if ("date".equals(suffix)) {
                    yield CodeBlock.of("$T.parse($S)", java.time.LocalDate.class, defaultValue.toString());
                } else {
                    yield CodeBlock.of("$T.parse($S)", java.time.Instant.class, defaultValue.toString());
                }
            }
            default -> CodeBlock.of("$L", defaultValue);
        };
    }

    // =========================================================================
    // Utility Methods
    // =========================================================================

    private static boolean hasEnumValues(BprintSchema.Field field) {
        return field.enumValues != null && !field.enumValues.isEmpty();
    }

    /**
     * Convert a string to UPPER_SNAKE_CASE for constant names.
     */
    static String toConstantCase(String name) {
        if (name == null || name.isEmpty()) return name;
        String result = name.replace("-", "_");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < result.length(); i++) {
            char c = result.charAt(i);
            if (Character.isUpperCase(c) && i > 0 && Character.isLowerCase(result.charAt(i - 1))) {
                sb.append('_');
            }
            sb.append(c);
        }
        return sb.toString().toUpperCase();
    }

    /**
     * Convert a hyphenated or underscored string to camelCase.
     */
    static String toCamelCase(String name) {
        if (name == null || name.isEmpty()) return name;
        String[] parts = name.split("[-_]");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (parts[i].isEmpty()) continue;
            if (sb.isEmpty()) {
                sb.append(parts[i].substring(0, 1).toLowerCase());
                if (parts[i].length() > 1) sb.append(parts[i].substring(1));
            } else {
                sb.append(parts[i].substring(0, 1).toUpperCase());
                if (parts[i].length() > 1) sb.append(parts[i].substring(1));
            }
        }
        return sb.toString();
    }

    private static String cap(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toUpperCase() + s.substring(1);
    }

    private static String uncap(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toLowerCase() + s.substring(1);
    }
}
