package co.chaim.generators.java;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * Metadata about a DynamoDB table passed from the CLI.
 * 
 * This is a simple data class - all values come from the OS cache snapshot
 * that was written by chaim-cdk. No AWS API calls are needed.
 * 
 * Includes GSI/LSI metadata for generating index query methods.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record TableMetadata(
    String tableName,
    String tableArn,
    String region,
    List<GSIMetadata> globalSecondaryIndexes,
    List<LSIMetadata> localSecondaryIndexes
) {
    @JsonCreator
    public TableMetadata(
        @JsonProperty("tableName") String tableName,
        @JsonProperty("tableArn") String tableArn,
        @JsonProperty("region") String region,
        @JsonProperty("globalSecondaryIndexes") List<GSIMetadata> globalSecondaryIndexes,
        @JsonProperty("localSecondaryIndexes") List<LSIMetadata> localSecondaryIndexes
    ) {
        this.tableName = tableName;
        this.tableArn = tableArn;
        this.region = region;
        this.globalSecondaryIndexes = globalSecondaryIndexes;
        this.localSecondaryIndexes = localSecondaryIndexes;
    }

    /**
     * Metadata for a Global Secondary Index.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GSIMetadata(
        String indexName,
        String partitionKey,
        String sortKey,
        String projectionType
    ) {
        @JsonCreator
        public GSIMetadata(
            @JsonProperty("indexName") String indexName,
            @JsonProperty("partitionKey") String partitionKey,
            @JsonProperty("sortKey") String sortKey,
            @JsonProperty("projectionType") String projectionType
        ) {
            this.indexName = indexName;
            this.partitionKey = partitionKey;
            this.sortKey = sortKey;
            this.projectionType = projectionType;
        }
    }

    /**
     * Metadata for a Local Secondary Index.
     * LSIs always share the table's partition key, so no partitionKey field is needed.
     * This matches the CDK snapshot shape (chaim-cdk LSIMetadata).
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LSIMetadata(
        String indexName,
        String sortKey,
        String projectionType
    ) {
        @JsonCreator
        public LSIMetadata(
            @JsonProperty("indexName") String indexName,
            @JsonProperty("sortKey") String sortKey,
            @JsonProperty("projectionType") String projectionType
        ) {
            this.indexName = indexName;
            this.sortKey = sortKey;
            this.projectionType = projectionType;
        }
    }
}
