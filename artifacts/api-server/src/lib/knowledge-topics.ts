export type KnowledgeSlice = "fundamentals" | "architecture" | "production" | "troubleshooting" | "tradeoffs";

export type KnowledgeTopic = {
  id: string;
  title: string;
  sources: string[];
  keywords: string[];
  extras: string[];
  slices: Partial<Record<KnowledgeSlice, string>>;
};

/** Processed official docs, topic-wise. Retrieval injects only matching slices. */
export const KNOWLEDGE_TOPICS: KnowledgeTopic[] = [
  {
    id: "architecture",
    title: "Azure Architecture Center / Well-Architected",
    sources: [
      "https://learn.microsoft.com/en-us/azure/architecture/",
      "https://learn.microsoft.com/en-us/azure/well-architected/",
      "https://docs.aws.amazon.com/wellarchitected/",
      "https://docs.cloud.google.com/architecture/framework",
    ],
    keywords: ["well-architected", "well architected", "landing zone", "architecture center", "cloud adoption", "five pillars"],
    extras: ["lakehouse", "azure"],
    slices: {
      fundamentals: "Well-Architected pillars: Reliability, Security, Cost, Operational Excellence, Performance. AWS and GCP add sustainability. CAF and landing zones are org guardrails, not a pipeline template.",
      architecture: "Big-data style: sources → lake → batch and/or stream → analytical store → reports, with orchestration. ELT at lake scale. Partition on the schedule grain. Scrub PII early. Separate compute by workload.",
      production: "Design for failure (MTTR, not only MTBF). IaC, immutable infra, private endpoints when the landing zone requires it. Polyglot persistence — pick SQL, lake, or NoSQL by access pattern.",
      tradeoffs: "Before naming services, clarify batch vs stream, latency, retention, security, and who consumes the data. Mission-critical is always-on design, not a bigger cluster.",
    },
  },
  {
    id: "lakehouse",
    title: "Lakehouse / medallion / modern analytics",
    sources: [
      "https://learn.microsoft.com/en-us/azure/architecture/solution-ideas/articles/azure-databricks-modern-analytics-architecture",
      "https://learn.microsoft.com/en-us/azure/databricks/lakehouse-architecture/",
      "https://learn.microsoft.com/en-us/azure/architecture/example-scenario/dataplate2e/data-platform-end-to-end",
    ],
    keywords: ["lakehouse", "medallion", "bronze", "silver", "gold", "bronze silver gold", "modern analytics"],
    extras: ["adls", "databricks", "adf"],
    slices: {
      fundamentals: "Lakehouse = lake storage plus warehouse reliability on Delta. Medallion: Bronze raw, Silver cleansed/standardized, Gold curated for BI.",
      architecture: "Typical Azure path: sources → ADF or Event Hubs → ADLS bronze → Databricks silver-gold Delta → Power BI or a warehouse. Do not serve reports from raw landing.",
      production: "Incremental merges into silver. Reconciliation and run IDs. Unity Catalog on gold. Power BI on gold or Direct Lake, not bronze.",
      tradeoffs: "Warehouse when you need T-SQL procedures and concurrency. Lakehouse when engineers and analysts share one Delta copy.",
    },
  },
  {
    id: "azure",
    title: "Azure data platform",
    sources: ["https://learn.microsoft.com/en-us/azure/", "https://learn.microsoft.com/en-us/azure/architecture/"],
    keywords: ["azure data platform", "azure stack", "entra"],
    extras: ["adf", "databricks", "adls"],
    slices: {
      fundamentals: "Daily Azure data stack: ADF, Databricks, ADLS Gen2, Delta, Unity Catalog, Key Vault, Monitor, Entra.",
      architecture: "OLTP and OLAP are different stores. Functions for event glue. AKS for serving, not nightly ETL. Private endpoints and landing zones when required.",
      production: "Managed identity to the lake. Key Vault only for secrets identity cannot replace. Observe ADF Monitor first, then Azure Monitor.",
    },
  },
  {
    id: "adls",
    title: "Azure Data Lake Storage Gen2",
    sources: [
      "https://learn.microsoft.com/en-us/azure/storage/blobs/data-lake-storage-introduction",
      "https://learn.microsoft.com/en-us/azure/storage/blobs/data-lake-storage-best-practices",
    ],
    keywords: ["adls", "data lake storage", "hierarchical namespace", "abfs", "posix acl", "gen2"],
    extras: ["adf", "databricks"],
    slices: {
      fundamentals: "ADLS Gen2 is hierarchical namespace on Blob Storage, not a separate account type. ABFS endpoint. POSIX ACLs plus Azure RBAC.",
      production: "Prefer fewer large files (about 256 MB to 100 GB). Parquet for read-heavy analytics, Avro for write-heavy buses. ADF parallelCopies. Same region as compute.",
      architecture: "IoT folders: region/subject/yyyy/mm/dd/hh so ACLs sit on the subject. Premium SSD when IOPS demand it. Lifecycle hot/cool/archive.",
      troubleshooting: "Missing file: path, ACL, and whether the copy wrote zero-byte blobs. StorageBlobLogs in Log Analytics for throttling.",
    },
  },
  {
    id: "adf",
    title: "Azure Data Factory",
    sources: [
      "https://learn.microsoft.com/en-us/azure/data-factory/",
      "https://learn.microsoft.com/en-us/azure/data-factory/concepts-pipelines-activities",
      "https://learn.microsoft.com/en-us/azure/data-factory/connector-overview",
    ],
    keywords: ["adf", "data factory", "linked service", "mapping data flow", "pipeline", "dataset"],
    extras: ["adf-ir", "databricks", "adls"],
    slices: {
      fundamentals: "ADF is orchestration and data integration. Building blocks: pipeline, activity, dataset, linked service, IR, trigger, parameters.",
      architecture: "Copy into ADLS. Transform with mapping data flows or dispatch Databricks. Control: ForEach, Lookup, If, Execute Pipeline. Metadata-driven parameters beat one pipeline per table.",
      production: "I treat ADF as the orchestrator, not the place for heavy Spark. Key Vault for connection secrets. Monitor in studio plus alerts.",
      tradeoffs: "Simple mapping can stay in ADF. Large or complex transforms go to Databricks. Volume, complexity, and cost decide the split.",
      troubleshooting: "ADF Monitor first: failed activity, error, input/output, run ID. Then open the Databricks job if the activity is a notebook. Fix root cause, rerun failed activity, RCA.",
    },
  },
  {
    id: "adf-ir",
    title: "ADF Integration Runtime",
    sources: ["https://learn.microsoft.com/en-us/azure/data-factory/concepts-integration-runtime"],
    keywords: ["integration runtime", "self-hosted ir", "azure ir", "azure-ssis", "self hosted"],
    extras: ["adf"],
    slices: {
      fundamentals: "IR is the compute bridge between activity and linked service. Types: Azure, Self-hosted, Azure-SSIS.",
      production: "Azure IR for cloud copy, data flows, dispatch. Self-hosted for on-prem or private VNet — Windows, outbound HTTP, scale-out HA. Same IR name and type across Dev/Test/Prod.",
      tradeoffs: "Put IR near the data. Self-hosted wins if both are attached. Copy IR in the sink region when compliance cares.",
    },
  },
  {
    id: "adf-cicd",
    title: "ADF CI/CD",
    sources: ["https://learn.microsoft.com/en-us/azure/data-factory/continuous-integration-delivery"],
    keywords: ["git only on the dev factory", "adf cicd", "arm template data factory", "publish data factory"],
    extras: ["adf", "devops"],
    slices: {
      fundamentals: "Git is only on the Dev factory. Test and Prod are not Git-connected. Deploy ARM from the pipeline.",
      production: "Feature branch, PR, publish Dev, Azure Pipelines to Test then Prod. Same IR name/type. Key Vault per env, same secret names. Stop/start triggers around deploy. No cherry-pick publish.",
    },
  },
  {
    id: "databricks",
    title: "Azure Databricks",
    sources: [
      "https://learn.microsoft.com/en-us/azure/databricks/",
      "https://learn.microsoft.com/en-us/azure/databricks/lakehouse-architecture/",
      "https://docs.databricks.com/",
    ],
    keywords: ["databricks", "adb", "lakeflow", "sql warehouse", "job cluster", "all-purpose", "photon"],
    extras: ["unity-catalog", "delta", "spark"],
    slices: {
      fundamentals: "Azure Databricks is Data + AI on your ADLS and Entra. Spark compute is decoupled from storage. Delta for ACID. Unity Catalog for governance.",
      architecture: "Job clusters for scheduled ETL. All-purpose for interactive work. Serverless SQL warehouse plus Photon for BI. Do not leave all-purpose on overnight.",
      production: "Jobs or ADF trigger notebooks. Git folders and asset bundles for CI/CD. Volumes, not DBFS root. Grants on groups and service principals, not PATs.",
      tradeoffs: "Databricks for large Spark. ADF for orchestration. SQL warehouse for analysts. Separate compute by workload for cost.",
      troubleshooting: "Spark UI for shuffle, skew, spill, fat scans. Do not scale the cluster until the bottleneck is known.",
    },
  },
  {
    id: "lakeview",
    title: "Databricks Lakeview / lakehouse views",
    sources: [
      "https://learn.microsoft.com/en-us/azure/databricks/dashboards/",
      "https://docs.databricks.com/",
    ],
    keywords: ["lake view", "lakeview", "lakeview dashboard", "ai/bi", "databricks dashboard"],
    extras: ["databricks", "sql"],
    slices: {
      fundamentals: "Two different things. Databricks Lakeview is AI/BI dashboards on the lakehouse, not a table. A lakehouse or SQL view is a named query over Delta so analysts do not read raw files.",
      production: "Dashboards go on Gold or a SQL warehouse, not bronze. SQL views live in Unity Catalog. If the interviewer says lake view, confirm which they mean, then answer that.",
      tradeoffs: "Lakeview for reporting UX. Views for a stable SQL contract over changing files.",
    },
  },
  {
    id: "autoloader",
    title: "Auto Loader",
    sources: ["https://learn.microsoft.com/en-us/azure/databricks/", "https://docs.databricks.com/"],
    keywords: ["autoloader", "auto loader", "cloudfiles", "cloud files"],
    extras: ["databricks", "adls", "delta"],
    slices: {
      fundamentals: "Auto Loader incrementally picks up new files from ADLS with the cloudFiles source and writes bronze Delta. Checkpoint makes restarts exactly-once.",
      production: "Directory listing vs file notification depending on volume. Schema location for evolution. WASB is deprecated — use abfss://. Silver is still a typed merge.",
      troubleshooting: "If files are skipped, check the checkpoint, permissions on the landing path, and whether notification setup actually fires.",
    },
  },
  {
    id: "unity-catalog",
    title: "Unity Catalog",
    sources: ["https://learn.microsoft.com/en-us/azure/databricks/"],
    keywords: ["unity catalog", "unity cloud", "metastore", "storage credential", "external location", "uc rbac"],
    extras: ["databricks", "security"],
    slices: {
      fundamentals: "Unity Catalog is catalog.schema.object under every query. Metastore at the top. Workspaces after Nov 9 2023 have UC on by default.",
      production: "Grant Azure AD groups, not one email. Service principals for ADF and jobs. Notebooks hit UC tables, not raw ADLS paths. Storage credentials plus external locations replace keys in notebooks.",
      troubleshooting: "Cannot read a table: group membership, USE CATALOG, USE SCHEMA, SELECT — not a code bug first.",
    },
  },
  {
    id: "spark",
    title: "Apache Spark / PySpark",
    sources: [
      "https://spark.apache.org/docs/latest/",
      "https://spark.apache.org/docs/latest/sql-performance-tuning.html",
      "https://spark.apache.org/docs/latest/sql-programming-guide.html",
    ],
    keywords: ["spark", "pyspark", "adaptive query", "shuffle", "broadcast join", "data skew", "spark ui"],
    extras: ["databricks", "delta"],
    slices: {
      fundamentals: "Spark is a DataFrame/SQL engine. Driver plus executors. Shuffle is the expensive part. DataFrames first, RDD is legacy.",
      production: "Broadcast the small side. AQE coalesces post-shuffle and can convert sort-merge to broadcast. shuffle.partitions default 200 is often wrong. Avoid Python UDFs on fat data. A load is a flow: bronze land, typed select/filter, withColumn, join reference, write Delta — not a function catalog.",
      troubleshooting: "Spark UI: stage time, shuffle read, spill, one task sitting forever (skew). Broadcast, salt, or repartition. Only then scale the cluster.",
    },
  },
  {
    id: "delta",
    title: "Delta Lake",
    sources: [
      "https://docs.delta.io/",
      "https://docs.delta.io/latest/delta-update.html",
      "https://docs.delta.io/latest/delta-streaming.html",
    ],
    keywords: ["delta lake", "delta merge", "zorder", "vacuum", "time travel", "acid"],
    extras: ["databricks", "spark"],
    slices: {
      fundamentals: "Delta is ACID tables on Parquet with a transaction log. MERGE, UPDATE, DELETE, time travel, vacuum.",
      production: "Idempotent MERGE on a business key. Streaming source/sink with a checkpoint. OPTIMIZE and ZORDER for reads — not on every tiny write.",
      tradeoffs: "Delta for the lakehouse. Warehouse tables when the consumer is pure T-SQL with multi-table transactions.",
      troubleshooting: "Failed MERGE: check the transaction log with DESCRIBE HISTORY, retry the same keys. Do not rewrite Parquet files by hand.",
    },
  },
  {
    id: "dlt",
    title: "Delta Live Tables / Lakeflow",
    sources: ["https://learn.microsoft.com/en-us/azure/databricks/delta-live-tables/"],
    keywords: ["delta live tables", "dlt", "lakeflow", "pipeline expectation", "streaming table"],
    extras: ["delta", "databricks"],
    slices: {
      fundamentals: "Declarative pipelines: streaming tables or materialized views with expectations for data quality.",
      production: "Expectations can fail the pipeline or drop/quarantine bad rows. Checkpointing is owned by the pipeline, not a hand-rolled notebook path.",
      tradeoffs: "Use when the org wants managed orchestration and quality rules. Notebook jobs still win for one-off or highly custom Spark.",
    },
  },
  {
    id: "incremental",
    title: "Incremental loads / CDC / watermarks",
    sources: [
      "https://learn.microsoft.com/en-us/azure/data-factory/tutorial-incremental-copy-overview",
      "https://docs.delta.io/latest/delta-update.html",
    ],
    keywords: [
      "incremental", "incremental load", "incremental loads", "watermark", "cdc",
      "change data capture", "change tracking", "full load", "late arriving", "idempotent load",
    ],
    extras: ["adf", "delta", "databricks"],
    slices: {
      fundamentals: "Incremental load copies only new or changed rows. The change boundary is a watermark, CDC position, or a reliable updated-at column. Full load rewrites everything.",
      production: "Identify changes from the source signal. Pass the watermark into the source query. Land in ADLS, MERGE in Databricks, then advance the watermark only after the target commit succeeds.",
      architecture: "ADF Lookup last watermark, parameterized Copy, bronze landing, Databricks Delta MERGE on business keys, control table for the high-water mark.",
      troubleshooting: "If the job fails after MERGE but before watermark update, rerun is safe when MERGE is idempotent. Never advance the watermark on a failed run or you skip rows. Late arriving data uses a lookback window.",
      tradeoffs: "Watermark is simple but misses in-place updates if the timestamp is wrong. CDC is accurate and heavier. Full reload is the recovery path when the boundary is untrusted.",
    },
  },
  {
    id: "scd",
    title: "Slowly changing dimensions",
    sources: ["https://learn.microsoft.com/en-us/azure/databricks/delta/delta-update"],
    keywords: ["scd", "slowly changing", "type 2", "type ii", "scd2"],
    extras: ["delta", "sql"],
    slices: {
      fundamentals: "SCD Type 2 keeps history: expire the current row, insert a new version with effective dates or a current flag. Type 1 overwrites.",
      production: "MERGE on the business key. When attributes change, set end_date on the current row and insert the new version. Incremental loads feed this MERGE.",
    },
  },
  {
    id: "fabric",
    title: "Microsoft Fabric",
    sources: [
      "https://learn.microsoft.com/en-us/fabric/",
      "https://learn.microsoft.com/en-us/fabric/get-started/microsoft-fabric-overview",
    ],
    keywords: ["fabric", "onelake", "direct lake", "dataflow gen", "sql analytics endpoint"],
    extras: ["lakehouse", "adf"],
    slices: {
      fundamentals: "Fabric is SaaS analytics on OneLake (logical lake on ADLS Gen2). Workloads: Data Factory, Spark engineering, Warehouse, Real-Time, Power BI.",
      architecture: "Shortcuts are zero-copy. Mirroring CDC into OneLake as Delta. Direct Lake for Power BI. Map ADF+Databricks+ADLS onto Pipeline+Notebook+OneLake.",
      tradeoffs: "Daily employer stack is still ADF plus Databricks unless the resume says Fabric. Do not invent a Fabric production job.",
    },
  },
  {
    id: "synapse",
    title: "Azure Synapse",
    sources: ["https://learn.microsoft.com/en-us/azure/synapse-analytics/"],
    keywords: ["synapse", "dedicated sql pool", "serverless sql"],
    extras: ["sql", "adf"],
    slices: {
      fundamentals: "Synapse combines dedicated SQL pool, serverless SQL on the lake, Spark, and ADF-style pipelines.",
      tradeoffs: "Daily I still run ADF plus Databricks. Synapse is how I'd explain the combined workspace product.",
    },
  },
  {
    id: "keyvault",
    title: "Azure Key Vault",
    sources: ["https://learn.microsoft.com/en-us/azure/key-vault/general/overview"],
    keywords: ["key vault", "keyvault", "vault secret", "managed hsm"],
    extras: ["adf", "security"],
    slices: {
      fundamentals: "Key Vault stores secrets, keys, certificates. Entra auth. Azure RBAC preferred. Apps fetch by URI at runtime.",
      production: "One vault per environment, same secret names. Prefer managed identity to the lake. Rotate; next run gets current version.",
    },
  },
  {
    id: "monitor",
    title: "Azure Monitor",
    sources: ["https://learn.microsoft.com/en-us/azure/azure-monitor/"],
    keywords: ["azure monitor", "log analytics", "application insights", "kql"],
    extras: ["adf", "observability"],
    slices: {
      fundamentals: "Metrics, logs, traces, alerts. Log Analytics plus KQL.",
      production: "First click is still ADF Monitor or Spark UI. Monitor is history, correlation, paging. Alerts plus action groups on pipeline failure.",
    },
  },
  {
    id: "kafka",
    title: "Apache Kafka",
    sources: ["https://kafka.apache.org/documentation/", "https://kafka.apache.org/documentation/#design"],
    keywords: ["kafka", "consumer group", "topic partition", "kafka connect", "kafka streams"],
    extras: ["streaming", "systemdesign"],
    slices: {
      fundamentals: "Kafka is a distributed log. Topics, partitions, offsets, consumer groups. Ordering is per partition, not global.",
      architecture: "Azure map: Event Hubs is the managed bus; Spark Structured Streaming is the processor.",
      production: "Idempotent producers. At-least-once consumers plus idempotent Delta MERGE unless we pay for exactly-once.",
    },
  },
  {
    id: "streaming",
    title: "Streaming / Event Hubs",
    sources: ["https://learn.microsoft.com/en-us/azure/architecture/", "https://spark.apache.org/docs/latest/structured-streaming-programming-guide.html"],
    keywords: ["event hub", "event hubs", "structured streaming", "stream processing", "watermark", "near-real-time"],
    extras: ["kafka", "databricks"],
    slices: {
      fundamentals: "In motion: Event Hubs, Kafka, Pub/Sub, IoT Hub. Spark Structured Streaming or Lakeflow into bronze Delta.",
      production: "Watermarks for late data. Checkpoint for exactly-once sink. Don't mix 2-hour batch logic into a 5-second stream without a watermark plan.",
    },
  },
  {
    id: "airflow",
    title: "Apache Airflow",
    sources: ["https://airflow.apache.org/docs/"],
    keywords: ["airflow", "cloud composer", "airflow dag"],
    extras: ["adf", "gcp"],
    slices: {
      fundamentals: "Airflow is a Python DAG orchestrator. Operators, sensors, scheduler, workers.",
      tradeoffs: "ADF is my daily orchestrator. Airflow when the org already runs DAGs. Map DAG→pipeline, operator→activity. Don't hide Spark inside a giant Python operator.",
    },
  },
  {
    id: "dbt",
    title: "dbt",
    sources: ["https://docs.getdbt.com/"],
    keywords: ["dbt", "data build tool"],
    extras: ["sql", "snowflake"],
    slices: {
      fundamentals: "dbt is SQL-first transforms: models, refs, tests, incremental materializations.",
      tradeoffs: "Use dbt when the serve layer is Snowflake/BigQuery/Fabric warehouse. Spark/Delta notebooks are the daily transform on Azure.",
    },
  },
  {
    id: "sql",
    title: "SQL / modeling",
    sources: [
      "https://learn.microsoft.com/en-us/sql/sql-server/",
      "https://learn.microsoft.com/en-us/power-bi/guidance/star-schema",
    ],
    keywords: ["sql", "window function", "cte", "merge into", "row_number", "star schema", "watermark", "left join", "inner join", "right join"],
    extras: ["databases", "spark"],
    slices: {
      fundamentals: "Incremental watermark, ROW_NUMBER dedupe, MERGE SCD2, windows, left anti for reconciliation. Star schema for BI. Inner join keeps matches. Left join keeps the driving table. Right join keeps the right. Speak the meaning before dumping SELECT.",
      production: "Same SQL idea in Spark, Snowflake, BigQuery, Azure SQL — dialect knobs change. Pick store by access pattern.",
    },
  },
  {
    id: "databases",
    title: "Databases",
    sources: ["https://www.postgresql.org/docs/", "https://learn.microsoft.com/en-us/sql/sql-server/", "https://www.mongodb.com/docs/", "https://redis.io/docs/latest/"],
    keywords: ["postgres", "mysql", "mongodb", "redis", "sql server", "sharding", "replication"],
    extras: ["sql", "systemdesign"],
    slices: {
      fundamentals: "Postgres, SQL Server, MySQL for OLTP. MongoDB documents. Redis cache, not system of record.",
      tradeoffs: "Replica for read scale and HA. Shard when one primary cannot hold the write set.",
    },
  },
  {
    id: "snowflake",
    title: "Snowflake",
    sources: ["https://docs.snowflake.com/"],
    keywords: ["snowflake", "snowpipe", "virtual warehouse", "micro partition"],
    extras: ["sql", "lakehouse"],
    slices: {
      fundamentals: "Storage separate from virtual warehouses. COPY INTO / Snowpipe. Roles, not users.",
      architecture: "Same bronze/silver/gold as schemas. MERGE, Streams and Tasks. Scale up for a job, auto-suspend after.",
      tradeoffs: "Azure is daily. This is how the medallion pattern maps. Do not invent a Snowflake employer.",
    },
  },
  {
    id: "powerbi",
    title: "Power BI",
    sources: [
      "https://learn.microsoft.com/en-us/power-bi/fundamentals/",
      "https://learn.microsoft.com/en-us/power-bi/guidance/star-schema",
      "https://learn.microsoft.com/en-us/power-bi/connect-data/incremental-refresh-overview",
    ],
    keywords: ["power bi", "powerbi", "dax", "directquery", "direct lake", "incremental refresh", "query folding", "row-level security", "rls"],
    extras: ["sql", "fabric"],
    slices: {
      fundamentals: "Semantic model plus report. Star schema: facts at a grain, dimensions around them. Measures in DAX, not calculated columns for everything.",
      production: "Import for speed when data fits. DirectQuery when freshness beats cache. Direct Lake on Fabric Delta. Incremental refresh needs a date column and query folding.",
      tradeoffs: "RLS filters rows in the model. Slow reports are usually the model or folding, not a visual.",
    },
  },
  {
    id: "gcp",
    title: "Google Cloud data",
    sources: [
      "https://docs.cloud.google.com/architecture/framework",
      "https://cloud.google.com/bigquery/docs",
      "https://cloud.google.com/dataflow/docs",
    ],
    keywords: ["gcp", "google cloud", "bigquery", "dataproc", "cloud composer", "gcs", "dataflow"],
    extras: ["architecture", "airflow"],
    slices: {
      fundamentals: "GCP WAF: ops, security, reliability, cost, performance, sustainability. Prefer managed, decouple, prefer stateless.",
      architecture: "GCS → Composer → Dataflow or Dataproc → BigQuery. Pub/Sub for events. Map ADF→Composer, Databricks→Dataproc/Dataflow, lake→GCS.",
    },
  },
  {
    id: "aws",
    title: "AWS data",
    sources: [
      "https://docs.aws.amazon.com/wellarchitected/",
      "https://docs.aws.amazon.com/s3/",
      "https://docs.aws.amazon.com/glue/",
    ],
    keywords: ["aws", "amazon s3", "redshift", "glue", "emr", "kinesis", "msk"],
    extras: ["architecture", "lakehouse"],
    slices: {
      fundamentals: "AWS Well-Architected: secure, reliable, efficient, cost-effective, sustainable. Review is a conversation, not an audit.",
      architecture: "S3=ADLS, Glue=ADF, EMR/Glue Spark=Databricks, Redshift=warehouse, Kinesis/MSK=Event Hubs. IAM roles, not keys. Same medallion.",
    },
  },
  {
    id: "devops",
    title: "DevOps / CI-CD",
    sources: [
      "https://learn.microsoft.com/en-us/azure/devops/",
      "https://docs.github.com/en/actions",
      "https://www.jenkins.io/doc/",
    ],
    keywords: ["devops", "ci/cd", "cicd", "azure devops", "jenkins", "github actions"],
    extras: ["github", "adf-cicd"],
    slices: {
      fundamentals: "PR, required checks, env secrets, rollback = revert and redeploy. DORA: small frequent changes.",
      production: "ADF Git on Dev only. Databricks Git folders and bundles. Never hotfix prod notebooks. Jenkins is self-hosted classic; Actions/Azure Pipelines are SaaS.",
    },
  },
  {
    id: "github",
    title: "Git / GitHub",
    sources: ["https://git-scm.com/doc", "https://docs.github.com/en"],
    keywords: ["github", "pull request", "codeowners", "branch strategy"],
    extras: ["devops"],
    slices: {
      fundamentals: "Protected main, feature branch, PR, required reviewers. No secrets in git. History must be revertible.",
      production: "Actions on PR and on merge. Environments for QA/Prod. CODEOWNERS on pipeline JSON and notebooks.",
    },
  },
  {
    id: "docker",
    title: "Docker",
    sources: ["https://docs.docker.com/"],
    keywords: ["docker", "dockerfile", "container image"],
    extras: ["kubernetes"],
    slices: {
      fundamentals: "Image, Dockerfile, layer cache, registry. Pin base tags. Don't bake secrets.",
      tradeoffs: "ADF/Databricks jobs are not Docker-first. Containerize APIs and custom handlers.",
    },
  },
  {
    id: "kubernetes",
    title: "Kubernetes",
    sources: ["https://kubernetes.io/docs/concepts/", "https://learn.microsoft.com/en-us/azure/aks/"],
    keywords: ["kubernetes", "k8s", "kubelet", "deployment", "aks"],
    extras: ["docker", "aks"],
    slices: {
      fundamentals: "Control plane plus nodes. Pod, Deployment, Service, Ingress, HPA, probes, RBAC. Desired state.",
      tradeoffs: "AKS/EKS/GKE for serving. Don't put nightly Spark in a random Deployment if Databricks Jobs exist.",
    },
  },
  {
    id: "aks",
    title: "Azure Kubernetes Service",
    sources: ["https://learn.microsoft.com/en-us/azure/aks/"],
    keywords: ["aks", "azure kubernetes"],
    extras: ["kubernetes", "azure"],
    slices: {
      fundamentals: "Managed Kubernetes on Azure. Microsoft operates the control plane.",
      production: "Node pools, managed identities, Key Vault CSI, Ingress, HPA. For APIs and models, not ADF Copy.",
    },
  },
  {
    id: "terraform",
    title: "Terraform / IaC",
    sources: ["https://developer.hashicorp.com/terraform/docs"],
    keywords: ["terraform", "infrastructure as code", "iac", "hcl"],
    extras: ["devops", "azure"],
    slices: {
      fundamentals: "HCL, providers, state, plan, apply, modules. State is the source of truth — lock it.",
      production: "Plan in PR, apply on merge. Never commit state or secrets. Portal clicks are drift.",
    },
  },
  {
    id: "systemdesign",
    title: "System design",
    sources: [
      "https://martinfowler.com/architecture/",
      "https://martinfowler.com/articles/patterns-of-distributed-systems.html",
    ],
    keywords: ["cap theorem", "cqrs", "event sourcing", "circuit breaker", "idempotency", "rate limit", "zero trust", "sharding", "load balancer", "cdn", "disaster recovery", "multi region", "high availability"],
    extras: ["architecture", "microservices"],
    slices: {
      fundamentals: "CAP: when the network partitions, pick consistency or availability per API. CQRS when reads and writes scale differently.",
      architecture: "Event-driven bus plus idempotent consumers. API gateway, load balancer, CDN, Redis cache. Sharding vs replication. Circuit breaker plus retries with jitter.",
      production: "Idempotency keys on writes. Multi-region is RPO/RTO first, then failover. HA is redundancy, health checks, and playbooks.",
      troubleshooting: "Investigate the dependency and the retry storm before adding capacity. Circuit open is a signal, not a mystery.",
    },
  },
  {
    id: "microservices",
    title: "Microservices",
    sources: ["https://martinfowler.com/microservices/", "https://martinfowler.com/articles/microservices.html"],
    keywords: ["microservice", "bounded context", "strangler"],
    extras: ["systemdesign", "api"],
    slices: {
      fundamentals: "Independent deployable services around a bounded context. Smart endpoints, dumb pipes. No shared DB as a hidden monolith.",
      tradeoffs: "Don't microservice a three-person data team. Ingest, transform, serve, govern is enough.",
    },
  },
  {
    id: "security",
    title: "Security / OWASP",
    sources: ["https://owasp.org/www-project-top-ten/", "https://learn.microsoft.com/en-us/azure/well-architected/"],
    keywords: ["owasp", "injection", "xss", "csrf", "least privilege", "zero trust"],
    extras: ["oauth", "keyvault"],
    slices: {
      fundamentals: "OWASP: injection, broken auth, access control, misconfig, logging gaps. Data: least privilege, encrypt, no secrets in git.",
      production: "Entra groups, private endpoints, managed identity, Unity Catalog grants. Zero trust: authenticate every hop, assume breach.",
    },
  },
  {
    id: "oauth",
    title: "OAuth / OIDC / JWT",
    sources: ["https://oauth.net/2/", "https://openid.net/developers/how-connect-works/", "https://jwt.io/introduction"],
    keywords: ["oauth", "openid", "jwt", "oidc", "bearer token"],
    extras: ["security"],
    slices: {
      fundamentals: "Authorization code plus PKCE for users. Client credentials for services. OIDC adds identity. JWT is a signed claim, not an architecture.",
      production: "Validate issuer, audience, expiry, signature. ADF/Databricks: service principal or managed identity, not a user JWT in a parameter.",
    },
  },
  {
    id: "observability",
    title: "Observability",
    sources: ["https://opentelemetry.io/docs/", "https://prometheus.io/docs/", "https://learn.microsoft.com/en-us/azure/azure-monitor/"],
    keywords: ["opentelemetry", "prometheus", "grafana", "sli", "slo", "observability"],
    extras: ["monitor"],
    slices: {
      fundamentals: "Traces, metrics, logs. SLI/SLO, not random dashboards.",
      production: "Spark UI and ADF Monitor first for jobs. Correlate by run ID. Alert on user-visible failure.",
    },
  },
  {
    id: "llm",
    title: "LLM / AI APIs",
    sources: ["https://platform.openai.com/docs/", "https://docs.anthropic.com/", "https://ai.google.dev/gemini-api/docs"],
    keywords: ["llm", "openai api", "function calling", "structured output"],
    extras: ["rag"],
    slices: {
      fundamentals: "Models, tokens, tools, structured outputs. Embeddings for retrieval. Keys on the server.",
      production: "Hika: server-side OpenAI, text answers, no spoken audio. Don't send secrets or full PII to a model.",
    },
  },
  {
    id: "rag",
    title: "RAG / vectors",
    sources: ["https://platform.openai.com/docs/guides/retrieval", "https://docs.pinecone.io/", "https://docs.llamaindex.ai/"],
    keywords: ["rag", "vector database", "pinecone", "embedding", "langchain"],
    extras: ["llm"],
    slices: {
      fundamentals: "Chunk, embed, retrieve top-k, ground the answer, cite. Re-embed when docs change.",
      production: "Hika grounds interview answers on frozen topic packs plus the resume — not a live internet search.",
    },
  },
  {
    id: "python",
    title: "Python",
    sources: ["https://docs.python.org/3/", "https://spark.apache.org/docs/latest/api/python/"],
    keywords: ["python", "pandas", "pytest", "udf"],
    extras: ["spark"],
    slices: {
      fundamentals: "venv, pin requirements, pytest on sample files. PySpark for distributed work; pandas for small checks.",
      production: "Avoid Python UDFs on large data. Idempotent Delta writes. Pin the job env, not latest.",
    },
  },
  {
    id: "functions",
    title: "Azure Functions",
    sources: ["https://learn.microsoft.com/en-us/azure/azure-functions/"],
    keywords: ["azure functions", "function app"],
    extras: ["azure"],
    slices: {
      fundamentals: "Event-driven serverless. HTTP, Timer, Event Hubs, Blob, Queue triggers.",
      tradeoffs: "Glue around the lake, not a substitute for Databricks on terabytes.",
    },
  },
  {
    id: "networking",
    title: "Azure networking",
    sources: ["https://learn.microsoft.com/en-us/azure/networking/"],
    keywords: ["private endpoint", "expressroute", "vnet", "private link", "front door"],
    extras: ["azure", "security"],
    slices: {
      fundamentals: "VNet, NSG, private endpoints, Private Link, ExpressRoute, Front Door.",
      production: "Storage, Databricks, and SQL on private endpoints. Self-hosted IR in the VNet. Hub-spoke from CAF.",
    },
  },
  {
    id: "web",
    title: "JavaScript / React / Node",
    sources: ["https://developer.mozilla.org/en-US/docs/Web/JavaScript", "https://react.dev/", "https://nodejs.org/docs/latest/api/"],
    keywords: ["javascript", "typescript", "react", "nodejs", "express", "fastapi"],
    extras: ["api"],
    slices: {
      fundamentals: "TypeScript for APIs. React for UI. HTTP status codes, retries on 429/503.",
      tradeoffs: "Don't turn a data-engineer interview into a React lecture unless they asked.",
    },
  },
  {
    id: "api",
    title: "API design",
    sources: ["https://swagger.io/specification/", "https://graphql.org/learn/", "https://grpc.io/docs/"],
    keywords: ["openapi", "swagger", "graphql", "grpc", "rest api"],
    extras: ["systemdesign"],
    slices: {
      fundamentals: "REST plus OpenAPI. Pagination, versioning, idempotency keys on creates. GraphQL for graphs, gRPC for internal latency.",
      production: "Auth at the gateway. Rate limit. Don't expose the lake as unbounded SQL over HTTP.",
    },
  },
  {
    id: "testing",
    title: "Testing",
    sources: ["https://playwright.dev/docs/", "https://vitest.dev/guide/", "https://docs.getdbt.com/"],
    keywords: ["playwright", "vitest", "jest", "unit test", "integration test"],
    extras: ["python", "devops"],
    slices: {
      fundamentals: "Unit the transform on sample files. Integration on a tiny lake path. E2E UI in Playwright.",
      production: "Reconciliation queries and dbt tests. A mocked Spark unit test is not a production certification.",
    },
  },
  {
    id: "cloudflare",
    title: "Cloudflare",
    sources: ["https://developers.cloudflare.com/workers/", "https://developers.cloudflare.com/r2/"],
    keywords: ["cloudflare", "durable object", "vectorize", "cloudflare workers"],
    extras: ["api"],
    slices: {
      fundamentals: "Workers at the edge, Durable Objects, R2, Vectorize, AI Gateway.",
      tradeoffs: "Not the daily ADF/Databricks stack. Map R2 to ADLS conceptually.",
    },
  },
];
