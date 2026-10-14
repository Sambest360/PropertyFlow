-- FW-11: persist wizard property type on units (bootstrap was deriving from bedrooms).
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS property_type VARCHAR(40) NULL;

CREATE INDEX IF NOT EXISTS idx_units_property_type
  ON units (client_id, property_type)
  WHERE property_type IS NOT NULL;
