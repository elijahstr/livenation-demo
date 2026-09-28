import { validateApprovedWestRows, validateWestSalesRows, type WestSalesEvidence } from "./west-sales";

export function validateWestSeedRows(rows: unknown): WestSalesEvidence[] {
  const validated = validateWestSalesRows(rows, new Date(), 6);
  return validateApprovedWestRows(validated);
}

export const databricksRawString = (value: string) => `r'${value.replaceAll("'", "''")}'`;

export function buildWestSeedInsert(rows: WestSalesEvidence[]): string {
  const { createTableSql, constraintSql, insertSql } = buildWestSeedStatements(rows);
  return [createTableSql, ...constraintSql, insertSql].join(";\n");
}

export function buildWestSeedStatements(rows: WestSalesEvidence[]) {
  validateWestSeedRows(rows);
  const values = rows.map((row) => `(${databricksRawString(row.event_id)}, ${databricksRawString(row.region)}, ${databricksRawString(row.venue_name)}, ${databricksRawString(row.city)}, ${databricksRawString(row.state)}, ${row.public_capacity}, ${databricksRawString(row.event_name)}, DATE ${databricksRawString(row.show_date)}, ${row.tickets_sold_cumulative}, ${row.tickets_target_cumulative}, TIMESTAMP ${databricksRawString(row.data_as_of)}, array(${row.market_signals.map(databricksRawString).join(", ")}), ${databricksRawString(row.origin)})`).join(",\n");
  const createTableSql = `CREATE OR REPLACE TABLE workspace.livenation_demo.show_sales_snapshots (
 event_id STRING NOT NULL COMMENT 'Synthetic stable event ID', region STRING NOT NULL, venue_name STRING NOT NULL, city STRING NOT NULL, state STRING NOT NULL,
 public_capacity BIGINT NOT NULL, event_name STRING NOT NULL, show_date DATE NOT NULL, tickets_sold_cumulative BIGINT NOT NULL,
 tickets_target_cumulative BIGINT NOT NULL, data_as_of TIMESTAMP NOT NULL, market_signals ARRAY<STRING> NOT NULL, origin STRING NOT NULL
) USING DELTA COMMENT 'Synthetic Live Nation West demo evidence'`;
  const constraintSql = [
    "ALTER TABLE workspace.livenation_demo.show_sales_snapshots ADD CONSTRAINT origin_is_synthetic CHECK (origin = 'synthetic')",
    "ALTER TABLE workspace.livenation_demo.show_sales_snapshots ADD CONSTRAINT counts_are_valid CHECK (public_capacity > 0 AND tickets_sold_cumulative >= 0 AND tickets_target_cumulative > 0 AND tickets_sold_cumulative <= tickets_target_cumulative AND tickets_target_cumulative <= public_capacity)",
  ];
  const insertSql = `INSERT INTO workspace.livenation_demo.show_sales_snapshots VALUES ${values}`;
  return { createTableSql, constraintSql, insertSql };
}
