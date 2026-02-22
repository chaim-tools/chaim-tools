# Chaim Generated Repository vs. AWS DynamoDB Enhanced Client

## Why Chaim?

AI coding tools generate code from context. The more ambiguous or unconstrained that context
is, the more inconsistent the output becomes across files, teams, and time. When your database
layer is assembled from raw AWS SDK calls, every AI session can produce a different structure,
different validation logic, or silently missing constraints — and none of it is enforced.

Chaim removes that variability. Your `.bprint` schema is the single source of truth. From it,
Chaim generates a repository that is **identical every time** — same method names, same
validation rules, same index coverage, same retry behavior. Whether a team member writes it,
an AI generates it, or you regenerate it six months later after a schema change, the output is
deterministic and correct by construction.

**What Chaim guarantees that the raw Enhanced Client cannot:**

| Guarantee | What it means |
|---|---|
| **Consistent API surface** | Every entity gets the same repository shape — same method names, same overloads, same patterns — regardless of who or what wrote the code |
| **Schema-enforced validation** | Required fields, constraints, and enum values are validated before every write. Validation rules live in the schema, not scattered across application code |
| **Recursive nested validation** | Nested objects and list items are validated with precise field paths (`shippingAddress.city`, `lineItems[0].productId`) — impossible to forget or implement inconsistently by hand |
| **Index coverage by default** | Every GSI and LSI defined in your CDK stack gets a full set of typed query methods generated automatically — no index is ever silently missing |
| **Automatic batch retry** | Unprocessed items from batch operations are retried up to 3 times. This is a DynamoDB requirement that is easy to omit when generating code ad hoc |
| **Reproducibility** | Regenerate the SDK at any time — after a schema change, a dependency upgrade, or a bug fix in the generator — and every project gets the same correct output |
| **Zero-config connection** | `ChaimConfig.orderRepository()` connects, validates, and is ready. No assembly required regardless of environment |
| **Full escape hatch** | Every method has a pass-through overload for the raw Enhanced Client request object. Chaim never blocks you from using the full AWS SDK when you need it |

---

## API Comparison Matrix

### Single-Item Operations

| Operation | Chaim Repository | DynamoDB Enhanced Client |
|---|---|---|
| Put item | `save(entity)` | `table.putItem(entity)` |
| Put with condition | `save(entity, conditionExpression)` | `table.putItem(PutItemEnhancedRequest.builder(T.class).item(e).conditionExpression(c).build())` |
| Put pass-through | `save(PutItemEnhancedRequest<T>)` | `table.putItem(request)` |
| Update item | `update(entity)` | `table.updateItem(entity)` |
| Update with condition | `update(entity, conditionExpression)` | `table.updateItem(UpdateItemEnhancedRequest.builder(T.class).item(e).conditionExpression(c).build())` |
| Partial update (ignore nulls) | `update(entity, ignoreNulls)` | `table.updateItem(UpdateItemEnhancedRequest.builder(T.class).item(e).ignoreNulls(true).build())` |
| Update with condition + ignoreNulls | `update(entity, conditionExpression, ignoreNulls)` | Manual builder chaining |
| Update pass-through | `update(UpdateItemEnhancedRequest<T>)` | `table.updateItem(request)` |
| Get by key | `findByKey(pk)` | `table.getItem(Key.builder().partitionValue(pk).build())` |
| Get by composite key | `findByKey(pk, sk)` | `table.getItem(Key.builder().partitionValue(pk).sortValue(sk).build())` |
| Get with consistent read | `findByKey(pk, consistentRead)` | `table.getItem(GetItemEnhancedRequest.builder().key(k).consistentRead(true).build())` |
| Get pass-through | `findByKey(GetItemEnhancedRequest)` | `table.getItem(request)` |
| Delete by key | `deleteByKey(pk)` | `table.deleteItem(Key.builder().partitionValue(pk).build())` |
| Delete with condition | `deleteByKey(pk, conditionExpression)` | `table.deleteItem(DeleteItemEnhancedRequest.builder().key(k).conditionExpression(c).build())` |
| Delete and return old item | `deleteAndReturn(pk)` | `table.deleteItem(key)` (requires manual key construction) |
| Delete with condition + return | `deleteAndReturn(pk, conditionExpression)` | Manual builder chaining |
| Delete pass-through | `delete(DeleteItemEnhancedRequest)` | `table.deleteItem(request)` |
| Existence check | `existsByKey(pk)` | `table.getItem(key) != null` (manual) |

> Validation runs automatically before every `save` and `update`. Rules are derived directly
> from the `.bprint` schema — they cannot drift from the schema definition.

---

### Query Operations — Main Table (Sort Key Tables Only)

| Operation | Chaim Repository | DynamoDB Enhanced Client |
|---|---|---|
| Query by PK | `query(pk)` | `table.query(QueryConditional.keyEqualTo(...))` |
| Query by PK + limit | `query(pk, maxResults)` | `table.query(QueryEnhancedRequest.builder().queryConditional(...).limit(n).build())` |
| Query by PK + filter | `query(pk, filterExpression)` | `table.query(QueryEnhancedRequest.builder().queryConditional(...).filterExpression(f).build())` |
| Query pass-through | `query(QueryEnhancedRequest)` | `table.query(request)` |
| Paginated query | `queryPages(pk)` → `PageIterable<T>` | `table.query(condition)` |
| Sort key = value | `query(pk, sk)` | `QueryConditional.keyEqualTo(Key...sortValue(sk))` |
| Sort key between | `queryBetween(pk, from, to)` | `QueryConditional.sortBetween(...)` |
| Sort key begins with | `queryBeginsWith(pk, prefix)` | `QueryConditional.sortBeginsWith(...)` |
| Sort key > value | `queryGreaterThan(pk, sk)` | `QueryConditional.sortGreaterThan(...)` |
| Sort key >= value | `queryGreaterThanOrEqualTo(pk, sk)` | `QueryConditional.sortGreaterThanOrEqualTo(...)` |
| Sort key < value | `queryLessThan(pk, sk)` | `QueryConditional.sortLessThan(...)` |
| Sort key <= value | `queryLessThanOrEqualTo(pk, sk)` | `QueryConditional.sortLessThanOrEqualTo(...)` |
| Descending order | Use `query(QueryEnhancedRequest)` pass-through | `QueryEnhancedRequest.builder().scanIndexForward(false)` |
| Projection (select fields) | Use `query(QueryEnhancedRequest)` pass-through | `QueryEnhancedRequest.builder().attributesToProject(...)` |

---

### Query Operations — GSI / LSI (Generated Per Index)

Every index defined in your CDK stack is reflected in the generated repository. No index
is omitted, and no method is named inconsistently across projects. The example below uses
`CustomerIdIndex` with PK `customerId` and SK `orderDate`.

| Operation | Chaim Repository | DynamoDB Enhanced Client |
|---|---|---|
| Query by index PK | `queryByCustomerIdIndex(customerId)` | `table.index("CustomerIdIndex").query(QueryConditional.keyEqualTo(...))` |
| Query by index PK + limit | `queryByCustomerIdIndex(customerId, maxResults)` | `table.index(...).query(QueryEnhancedRequest.builder()...limit(n).build())` |
| Query by index PK + SK | `queryByCustomerIdIndex(customerId, orderDate)` | Manual key + condition construction |
| SK between | `queryByCustomerIdIndexBetween(customerId, from, to)` | `QueryConditional.sortBetween(...)` |
| SK begins with | `queryByCustomerIdIndexBeginsWith(customerId, prefix)` | `QueryConditional.sortBeginsWith(...)` |
| SK > value | `queryByCustomerIdIndexGreaterThan(customerId, sk)` | `QueryConditional.sortGreaterThan(...)` |
| SK >= value | `queryByCustomerIdIndexGreaterThanOrEqualTo(customerId, sk)` | `QueryConditional.sortGreaterThanOrEqualTo(...)` |
| SK < value | `queryByCustomerIdIndexLessThan(customerId, sk)` | `QueryConditional.sortLessThan(...)` |
| SK <= value | `queryByCustomerIdIndexLessThanOrEqualTo(customerId, sk)` | `QueryConditional.sortLessThanOrEqualTo(...)` |
| Index pass-through / pagination | Use `repo.getTable().index("CustomerIdIndex").query(request)` | `table.index(...).query(request)` |

> Index queries do not have a `QueryEnhancedRequest` pass-through or `queryPages` variant
> generated. Use `repo.getTable().index(indexName)` directly for descending order, projection,
> or pagination token control on index queries.

---

### Scan Operations

| Operation | Chaim Repository | DynamoDB Enhanced Client |
|---|---|---|
| Full table scan | `scan()` → `List<T>` | `table.scan().forEach(page -> ...)` (manual page loop) |
| Scan with filter | `scan(filterExpression)` | `table.scan(ScanEnhancedRequest.builder().filterExpression(f).build())` + page loop |
| Scan pass-through | `scan(ScanEnhancedRequest)` → `PageIterable<T>` | `table.scan(request)` |
| Paginated scan | `scanPages()` → `PageIterable<T>` | `table.scan()` |
| Scan with projection | Use `scan(ScanEnhancedRequest)` pass-through | `ScanEnhancedRequest.builder().attributesToProject(...)` |
| Scan with limit / pagination token | Use `scan(ScanEnhancedRequest)` pass-through | `ScanEnhancedRequest.builder().limit(n).exclusiveStartKey(...)` |

---

### Batch Operations

| Operation | Chaim Repository | DynamoDB Enhanced Client |
|---|---|---|
| Batch get | `batchGet(List<Key>)` → `List<T>` | `enhancedClient.batchGetItem(...)` + manual result extraction |
| Batch save | `batchSave(List<T>)` — auto-retry included | `enhancedClient.batchWriteItem(...)` — no retry |
| Batch delete | `batchDelete(List<Key>)` — auto-retry included | `enhancedClient.batchWriteItem(...)` — no retry |

> DynamoDB batch writes can return unprocessed items under load. The generated `batchSave` and
> `batchDelete` always retry up to 3 times. This behavior is guaranteed in every generated
> repository — it cannot be omitted or implemented differently by different authors.

---

### Transaction Operations

| Operation | Chaim Repository | DynamoDB Enhanced Client |
|---|---|---|
| Transact get | `transactGet(List<Key>)` → `List<T>` | `enhancedClient.transactGetItems(...)` + manual document unwrapping |
| Transact save (multi-entity) | `transactSave(List<T>)` — validates each entity | `enhancedClient.transactWriteItems(...)` |
| Transact delete (multi-key) | `transactDelete(List<Key>)` | `enhancedClient.transactWriteItems(...)` |
| Transact write pass-through | `transactWrite(TransactWriteItemsEnhancedRequest)` | `enhancedClient.transactWriteItems(request)` |
| Transact read pass-through | `transactRead(TransactGetItemsEnhancedRequest)` | `enhancedClient.transactGetItems(request)` |
| Condition check (no write) | Use `transactWrite(request)` pass-through | `TransactWriteItemsEnhancedRequest.builder().addConditionCheck(table, req)` |

> `conditionCheck` adds a key existence or attribute condition to a transaction without
> performing a write on that item. It is available via `transactWrite(request)` using
> `ConditionCheck.builder()` from the Enhanced Client directly.

---

### Client Configuration — `ChaimDynamoDbClient.Builder`

| Option | Chaim | DynamoDB Enhanced Client |
|---|---|---|
| Table name | `.tableName("orders")` | Passed to `enhancedClient.table(name, schema)` |
| Region | `.region("us-east-1")` | `DynamoDbClient.builder().region(Region.of(...))` |
| Local DynamoDB endpoint | `.endpoint("http://localhost:8000")` | `.endpointOverride(URI.create(...))` |
| Named AWS profile | `.profile("dev")` | `ProfileCredentialsProvider.create("dev")` + manual wiring |
| Custom credentials provider | `.credentialsProvider(provider)` | `.credentialsProvider(provider)` |
| Inject existing client | `.existingClient(enhancedClient)` | N/A — you already have the client |
| Zero-config (Lambda / ECS / EC2) | `ChaimConfig.getClient()` — one line | Manual construction every time |
| Env var overrides | `CHAIM_TABLE_NAME`, `AWS_REGION`, `DYNAMODB_ENDPOINT` | Not available — must be in code |

---

### Not Generated — Available via Escape Hatches

The following Enhanced Client capabilities are not generated as convenience methods.
They are available through the pass-through overloads or the underlying primitives
exposed by `getTable()`, `getEnhancedClient()`, and `getTableSchema()`.

| Capability | How to access it | Notes |
|---|---|---|
| **Descending query order** | `repo.getTable().query(QueryEnhancedRequest.builder().scanIndexForward(false)...)` | `scanIndexForward(false)` reverses sort order. Not generated because it applies per-call rather than per-entity |
| **Query / scan projection** | Pass `QueryEnhancedRequest` or `ScanEnhancedRequest` with `.attributesToProject(...)` | `GetItemEnhancedRequest` does **not** support projection — this is an AWS SDK limitation |
| **Pagination token (ExclusiveStartKey)** | Pass `ScanEnhancedRequest` or `QueryEnhancedRequest` with `.exclusiveStartKey(...)` | Required for cursor-based pagination across API responses |
| **Index query pass-through** | `repo.getTable().index(indexName).query(request)` | No `QueryEnhancedRequest` overload is generated for index queries |
| **Index paginated query** | `repo.getTable().index(indexName).query(condition)` → `PageIterable<T>` | No `queryByXxxIndexPages()` variant is generated |
| **Transaction condition check** | `transactWrite(TransactWriteItemsEnhancedRequest)` with `ConditionCheck.builder()` | Asserts a condition on an item in a transaction without writing to it |
| **Table management** | `repo.getTable().createTable(...)` / `.deleteTable()` / `.describeTable()` | Infrastructure lifecycle ops — intended to be managed by CDK, not application code |
| **Custom TableSchema** | `repo.getEnhancedClient().table(name, customSchema)` | For schemas not backed by a `@DynamoDbBean` annotated class |

---

### Escape Hatches

Chaim never limits what you can do. Every repository exposes the underlying Enhanced Client
primitives directly, and every operation has a pass-through overload for the raw request object.

```java
// Access the underlying table, client, and schema at any time
DynamoDbTable<Order> table = repo.getTable();
DynamoDbEnhancedClient client = repo.getEnhancedClient();
TableSchema<Order> schema = repo.getTableSchema();

// Pass raw request objects directly to any operation
repo.findByKey(GetItemEnhancedRequest.builder().key(key).consistentRead(true).build());
repo.save(PutItemEnhancedRequest.builder(Order.class).item(entity).conditionExpression(expr).build());
repo.transactWrite(TransactWriteItemsEnhancedRequest.builder()...build());
```
