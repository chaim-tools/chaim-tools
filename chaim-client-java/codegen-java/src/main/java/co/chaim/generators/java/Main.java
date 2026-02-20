package co.chaim.generators.java;

import co.chaim.core.model.BprintSchema;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/**
 * CLI entry point for the Java code generator.
 * 
 * Usage:
 *   java -jar codegen-java.jar --schemas <json-array> --package <pkg> --output <dir> [--table-metadata <json>]
 *   java -jar codegen-java.jar --schemas-file <path> --package <pkg> --output <dir> [--table-metadata <json>]
 */
public class Main {
    
    private static final ObjectMapper MAPPER = new ObjectMapper();
    
    public static void main(String[] args) {
        try {
            String schemasJson = null;     // Multiple schemas (JSON array)
            String schemasFile = null;     // Path to file containing schemas JSON
            String packageName = null;
            String outputDir = null;
            String tableMetadataJson = null;
            
            // Parse arguments
            for (int i = 0; i < args.length; i++) {
                switch (args[i]) {
                    case "--schemas":
                        schemasJson = args[++i];
                        break;
                    case "--schemas-file":
                        schemasFile = args[++i];
                        break;
                    case "--package":
                        packageName = args[++i];
                        break;
                    case "--output":
                        outputDir = args[++i];
                        break;
                    case "--table-metadata":
                        tableMetadataJson = args[++i];
                        break;
                    default:
                        // Skip unknown args
                        break;
                }
            }
            
            // Validate required args
            boolean hasSchemaInput = schemasJson != null || schemasFile != null;
            if (!hasSchemaInput || packageName == null || outputDir == null) {
                System.err.println("Usage: java -jar codegen-java.jar [--schemas <json-array> | --schemas-file <path>] --package <pkg> --output <dir> [--table-metadata <json>]");
                System.exit(1);
            }
            
            // Parse schemas
            List<BprintSchema> schemas = new ArrayList<>();
            
            if (schemasFile != null) {
                // Read schemas from file
                String fileContent = Files.readString(Path.of(schemasFile));
                schemas = MAPPER.readValue(fileContent, new TypeReference<List<BprintSchema>>() {});
            } else if (schemasJson != null) {
                // Parse schemas from JSON array string
                schemas = MAPPER.readValue(schemasJson, new TypeReference<List<BprintSchema>>() {});
            }
            
            if (schemas.isEmpty()) {
                System.err.println("Error: No schemas provided");
                System.exit(1);
            }
            
            // Parse table metadata if provided
            TableMetadata tableMetadata = null;
            if (tableMetadataJson != null && !tableMetadataJson.isEmpty()) {
                tableMetadata = parseTableMetadata(tableMetadataJson);
            }
            
            // Generate code
            JavaGenerator generator = new JavaGenerator();
            generator.generateForTable(schemas, packageName, Paths.get(outputDir), tableMetadata);
            
            // Output summary
            System.out.println("Generated Java code for " + schemas.size() + " entity/entities in " + outputDir);
            for (BprintSchema schema : schemas) {
                String entityName = deriveEntityName(schema);
                System.out.println("  - " + entityName);
            }
            
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
    
    private static TableMetadata parseTableMetadata(String json) throws Exception {
        // Simply deserialize the JSON directly to TableMetadata record
        return MAPPER.readValue(json, TableMetadata.class);
    }
    
    /**
     * Derive entity name from schema.
     * Uses entityName field directly, or defaults to "Entity".
     */
    private static String deriveEntityName(BprintSchema schema) {
        if (schema.entityName != null && !schema.entityName.isEmpty()) {
            return schema.entityName;
        }
        
        return "Entity";
    }
}
