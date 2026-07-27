-- Auto-generated PE bulk listings (PR-2101…PR-2200). Do not edit by hand — run scripts/gen-pe-bulk-sql.ts
BEGIN;

-- PR-2101 · Summerstrand
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000101',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Summerstrand family home #1',
  '13 Main Road',
  'Port Elizabeth',
  'Eastern Cape',
  'Summerstrand',
  'A',
  NULL,
  false,
  -33.9927606,
  25.6655042,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000101',
  'a3000001-0001-4000-8000-000000000101',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN',
  185.00, 3, 2.0, 2,
  'SALE', 2310000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Summerstrand family home #1',
  'Spacious 3-bed home in Summerstrand, Port Elizabeth — ready for family living.',
  '["garden","fibre","security","bondable"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9927606,
  25.6655042
);

-- PR-2102 · Summerstrand
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000102',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Summerstrand 2-bed apartment #2',
  'Unit 2A',
  'Port Elizabeth',
  'Eastern Cape',
  'Summerstrand',
  'A',
  NULL,
  false,
  -33.9943958,
  25.6682833,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000102',
  'a3000001-0001-4000-8000-000000000102',
  'a1000001-0001-4000-8000-000000000003',
  'U02',
  78.00, 2, 1.0, 1,
  'BOTH', 1584000.00, 12000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000022',
  'Summerstrand 2-bed apartment #2',
  'Bright 2-bed apartment in Summerstrand with covered parking.',
  '["balcony","fibre","secure parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb,
  false,
  -33.9943958,
  25.6682833
);

-- PR-2103 · Summerstrand
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000103',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Summerstrand townhouse complex #3',
  '3 Cluster Close',
  'Port Elizabeth',
  'Eastern Cape',
  'Summerstrand',
  'A',
  NULL,
  false,
  -33.9949888,
  25.6644904,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000103',
  'a3000001-0001-4000-8000-000000000103',
  'a1000001-0001-4000-8000-000000000001',
  'U03',
  142.00, 3, 2.5, 2,
  'SALE', 1936000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Summerstrand townhouse complex #3',
  'Secure townhouse in Summerstrand with private courtyard.',
  '["complex security","garden","pet friendly"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb,
  false,
  -33.9949888,
  25.6644904
);

-- PR-2104 · Summerstrand
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000104',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Summerstrand bachelor flat #4',
  'Flat 4',
  'Port Elizabeth',
  'Eastern Cape',
  'Summerstrand',
  'A',
  NULL,
  false,
  -33.9930835,
  25.6671310,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000104',
  'a3000001-0001-4000-8000-000000000104',
  'a1000001-0001-4000-8000-000000000002',
  'U04',
  48.00, 1, 1.0, 1,
  'RENT', NULL, 9000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Summerstrand bachelor flat #4',
  'Compact rental flat in Summerstrand — ideal for singles or students.',
  '["fibre","prepaid electricity"]'::jsonb,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9930835,
  25.6671310
);

-- PR-2105 · Summerstrand
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000105',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Summerstrand executive residence #5',
  '30 Ridge Avenue',
  'Port Elizabeth',
  'Eastern Cape',
  'Summerstrand',
  'A',
  NULL,
  false,
  -33.9931655,
  25.6646406,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000105',
  'a3000001-0001-4000-8000-000000000105',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  240.00, 4, 3.0, 3,
  'BOTH', 2970000.00, 20000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Summerstrand executive residence #5',
  'Executive 4-bed residence in Summerstrand with pool and study.',
  '["pool","garden","study","fibre","alarm"]'::jsonb,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9931655,
  25.6646406
);

-- PR-2106 · Summerstrand
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000106',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Summerstrand duplex rental #6',
  '6B Meadow Lane',
  'Port Elizabeth',
  'Eastern Cape',
  'Summerstrand',
  'A',
  NULL,
  false,
  -33.9952474,
  25.6709178,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000106',
  'a3000001-0001-4000-8000-000000000106',
  'a1000001-0001-4000-8000-000000000001',
  'U06',
  95.00, 2, 2.0, 1,
  'RENT', NULL, 13000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Summerstrand duplex rental #6',
  'Well-kept duplex to let in Summerstrand.',
  '["duplex","fibre","carport"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9952474,
  25.6709178
);

-- PR-2107 · Summerstrand
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000107',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Summerstrand office suite #7',
  'Suite 107',
  'Port Elizabeth',
  'Eastern Cape',
  'Summerstrand',
  'A',
  NULL,
  false,
  -33.9888342,
  25.6646152,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000107',
  'a3000001-0001-4000-8000-000000000107',
  'a1000001-0001-4000-8000-000000000002',
  'U07',
  110.00, 0, 1.0, 4,
  'RENT', NULL, 25000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Summerstrand office suite #7',
  'Fitted office suite in Summerstrand with on-site parking.',
  '["fibre","boardroom","parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb,
  false,
  -33.9888342,
  25.6646152
);

-- PR-2108 · Summerstrand
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000108',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Summerstrand starter home #8',
  '13 Willow Street',
  'Port Elizabeth',
  'Eastern Cape',
  'Summerstrand',
  'A',
  NULL,
  false,
  -33.9947910,
  25.6654135,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000108',
  'a3000001-0001-4000-8000-000000000108',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  110.00, 2, 1.0, 1,
  'SALE', 1364000.00, NULL, 'UNDER_OFFER',
  'a2000001-0001-4000-8000-000000000022',
  'Summerstrand starter home #8',
  'Affordable starter home in Summerstrand — under offer.',
  '["freehold","bondable","garden"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb,
  false,
  -33.9947910,
  25.6654135
);

-- PR-2109 · Summerstrand
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000109',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Summerstrand vacant stand #9',
  'Erf 2009',
  'Port Elizabeth',
  'Eastern Cape',
  'Summerstrand',
  'A',
  NULL,
  false,
  -33.9908291,
  25.6689063,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000109',
  'a3000001-0001-4000-8000-000000000109',
  'a1000001-0001-4000-8000-000000000001',
  'MAIN',
  800.00, 0, 0.0, 0,
  'SALE', 770000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Summerstrand vacant stand #9',
  'Development-ready stand in Summerstrand, Port Elizabeth.',
  '["corner stand","services nearby"]'::jsonb,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb,
  false,
  -33.9908291,
  25.6689063
);

-- PR-2110 · Summerstrand
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000110',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Summerstrand penthouse-style 3-bed #10',
  'Penthouse 10',
  'Port Elizabeth',
  'Eastern Cape',
  'Summerstrand',
  'A',
  NULL,
  false,
  -33.9956475,
  25.6695675,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000110',
  'a3000001-0001-4000-8000-000000000110',
  'a1000001-0001-4000-8000-000000000002',
  'U10',
  115.00, 3, 2.0, 2,
  'BOTH', 2090000.00, 15000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Summerstrand penthouse-style 3-bed #10',
  'Top-floor 3-bed apartment in Summerstrand with open-plan living.',
  '["views","generator","gym access","fibre"]'::jsonb,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9956475,
  25.6695675
);

-- PR-2111 · Humewood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000111',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Humewood family home #1',
  '13 Main Road',
  'Port Elizabeth',
  'Eastern Cape',
  'Humewood',
  'A',
  NULL,
  false,
  -33.9783057,
  25.6445762,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000111',
  'a3000001-0001-4000-8000-000000000111',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  185.00, 3, 2.0, 2,
  'SALE', 2310000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Humewood family home #1',
  'Spacious 3-bed home in Humewood, Port Elizabeth — ready for family living.',
  '["garden","fibre","security","bondable"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9783057,
  25.6445762
);

-- PR-2112 · Humewood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000112',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Humewood 2-bed apartment #2',
  'Unit 2A',
  'Port Elizabeth',
  'Eastern Cape',
  'Humewood',
  'A',
  NULL,
  false,
  -33.9770211,
  25.6442877,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000112',
  'a3000001-0001-4000-8000-000000000112',
  'a1000001-0001-4000-8000-000000000001',
  'U02',
  78.00, 2, 1.0, 1,
  'BOTH', 1584000.00, 12000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Humewood 2-bed apartment #2',
  'Bright 2-bed apartment in Humewood with covered parking.',
  '["balcony","fibre","secure parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb,
  false,
  -33.9770211,
  25.6442877
);

-- PR-2113 · Humewood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000113',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Humewood townhouse complex #3',
  '3 Cluster Close',
  'Port Elizabeth',
  'Eastern Cape',
  'Humewood',
  'A',
  NULL,
  false,
  -33.9794719,
  25.6474521,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000113',
  'a3000001-0001-4000-8000-000000000113',
  'a1000001-0001-4000-8000-000000000002',
  'U03',
  142.00, 3, 2.5, 2,
  'SALE', 1936000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Humewood townhouse complex #3',
  'Secure townhouse in Humewood with private courtyard.',
  '["complex security","garden","pet friendly"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb,
  false,
  -33.9794719,
  25.6474521
);

-- PR-2114 · Humewood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000114',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Humewood bachelor flat #4',
  'Flat 4',
  'Port Elizabeth',
  'Eastern Cape',
  'Humewood',
  'A',
  NULL,
  false,
  -33.9787100,
  25.6430127,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000114',
  'a3000001-0001-4000-8000-000000000114',
  'a1000001-0001-4000-8000-000000000003',
  'U04',
  48.00, 1, 1.0, 1,
  'RENT', NULL, 9000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000022',
  'Humewood bachelor flat #4',
  'Compact rental flat in Humewood — ideal for singles or students.',
  '["fibre","prepaid electricity"]'::jsonb,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9787100,
  25.6430127
);

-- PR-2115 · Humewood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000115',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Humewood executive residence #5',
  '30 Ridge Avenue',
  'Port Elizabeth',
  'Eastern Cape',
  'Humewood',
  'A',
  NULL,
  false,
  -33.9754709,
  25.6473774,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000115',
  'a3000001-0001-4000-8000-000000000115',
  'a1000001-0001-4000-8000-000000000001',
  'MAIN',
  240.00, 4, 3.0, 3,
  'BOTH', 2970000.00, 20000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Humewood executive residence #5',
  'Executive 4-bed residence in Humewood with pool and study.',
  '["pool","garden","study","fibre","alarm"]'::jsonb,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9754709,
  25.6473774
);

-- PR-2116 · Humewood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000116',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Humewood duplex rental #6',
  '6B Meadow Lane',
  'Port Elizabeth',
  'Eastern Cape',
  'Humewood',
  'A',
  NULL,
  false,
  -33.9795313,
  25.6433822,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000116',
  'a3000001-0001-4000-8000-000000000116',
  'a1000001-0001-4000-8000-000000000002',
  'U06',
  95.00, 2, 2.0, 1,
  'RENT', NULL, 13000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Humewood duplex rental #6',
  'Well-kept duplex to let in Humewood.',
  '["duplex","fibre","carport"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9795313,
  25.6433822
);

-- PR-2117 · Humewood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000117',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Humewood office suite #7',
  'Suite 107',
  'Port Elizabeth',
  'Eastern Cape',
  'Humewood',
  'A',
  NULL,
  false,
  -33.9766937,
  25.6440888,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000117',
  'a3000001-0001-4000-8000-000000000117',
  'a1000001-0001-4000-8000-000000000003',
  'U07',
  110.00, 0, 1.0, 4,
  'RENT', NULL, 25000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Humewood office suite #7',
  'Fitted office suite in Humewood with on-site parking.',
  '["fibre","boardroom","parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb,
  false,
  -33.9766937,
  25.6440888
);

-- PR-2118 · Humewood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000118',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Humewood starter home #8',
  '13 Willow Street',
  'Port Elizabeth',
  'Eastern Cape',
  'Humewood',
  'A',
  NULL,
  false,
  -33.9791208,
  25.6424789,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000118',
  'a3000001-0001-4000-8000-000000000118',
  'a1000001-0001-4000-8000-000000000001',
  'MAIN',
  110.00, 2, 1.0, 1,
  'SALE', 1364000.00, NULL, 'UNDER_OFFER',
  'a2000001-0001-4000-8000-000000000004',
  'Humewood starter home #8',
  'Affordable starter home in Humewood — under offer.',
  '["freehold","bondable","garden"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb,
  false,
  -33.9791208,
  25.6424789
);

-- PR-2119 · Humewood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000119',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Humewood vacant stand #9',
  'Erf 2009',
  'Port Elizabeth',
  'Eastern Cape',
  'Humewood',
  'A',
  NULL,
  false,
  -33.9773248,
  25.6460988,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000119',
  'a3000001-0001-4000-8000-000000000119',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN',
  800.00, 0, 0.0, 0,
  'SALE', 770000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Humewood vacant stand #9',
  'Development-ready stand in Humewood, Port Elizabeth.',
  '["corner stand","services nearby"]'::jsonb,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb,
  false,
  -33.9773248,
  25.6460988
);

-- PR-2120 · Humewood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000120',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Humewood penthouse-style 3-bed #10',
  'Penthouse 10',
  'Port Elizabeth',
  'Eastern Cape',
  'Humewood',
  'A',
  NULL,
  false,
  -33.9764968,
  25.6483582,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000120',
  'a3000001-0001-4000-8000-000000000120',
  'a1000001-0001-4000-8000-000000000003',
  'U10',
  115.00, 3, 2.0, 2,
  'BOTH', 2090000.00, 15000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000022',
  'Humewood penthouse-style 3-bed #10',
  'Top-floor 3-bed apartment in Humewood with open-plan living.',
  '["views","generator","gym access","fibre"]'::jsonb,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9764968,
  25.6483582
);

-- PR-2121 · Walmer
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000121',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Walmer family home #1',
  '13 Main Road',
  'Port Elizabeth',
  'Eastern Cape',
  'Walmer',
  'A',
  NULL,
  false,
  -33.9853530,
  25.5898573,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000121',
  'a3000001-0001-4000-8000-000000000121',
  'a1000001-0001-4000-8000-000000000001',
  'MAIN',
  185.00, 3, 2.0, 2,
  'SALE', 2048000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Walmer family home #1',
  'Spacious 3-bed home in Walmer, Port Elizabeth — ready for family living.',
  '["garden","fibre","security","bondable"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9853530,
  25.5898573
);

-- PR-2122 · Walmer
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000122',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Walmer 2-bed apartment #2',
  'Unit 2A',
  'Port Elizabeth',
  'Eastern Cape',
  'Walmer',
  'A',
  NULL,
  false,
  -33.9851123,
  25.5862699,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000122',
  'a3000001-0001-4000-8000-000000000122',
  'a1000001-0001-4000-8000-000000000002',
  'U02',
  78.00, 2, 1.0, 1,
  'BOTH', 1404000.00, 11000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Walmer 2-bed apartment #2',
  'Bright 2-bed apartment in Walmer with covered parking.',
  '["balcony","fibre","secure parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb,
  false,
  -33.9851123,
  25.5862699
);

-- PR-2123 · Walmer
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000123',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Walmer townhouse complex #3',
  '3 Cluster Close',
  'Port Elizabeth',
  'Eastern Cape',
  'Walmer',
  'A',
  NULL,
  false,
  -33.9865416,
  25.5892812,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000123',
  'a3000001-0001-4000-8000-000000000123',
  'a1000001-0001-4000-8000-000000000003',
  'U03',
  142.00, 3, 2.5, 2,
  'SALE', 1716000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Walmer townhouse complex #3',
  'Secure townhouse in Walmer with private courtyard.',
  '["complex security","garden","pet friendly"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb,
  false,
  -33.9865416,
  25.5892812
);

-- PR-2124 · Walmer
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000124',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Walmer bachelor flat #4',
  'Flat 4',
  'Port Elizabeth',
  'Eastern Cape',
  'Walmer',
  'A',
  NULL,
  false,
  -33.9854246,
  25.5861892,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000124',
  'a3000001-0001-4000-8000-000000000124',
  'a1000001-0001-4000-8000-000000000001',
  'U04',
  48.00, 1, 1.0, 1,
  'RENT', NULL, 8000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Walmer bachelor flat #4',
  'Compact rental flat in Walmer — ideal for singles or students.',
  '["fibre","prepaid electricity"]'::jsonb,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9854246,
  25.5861892
);

-- PR-2125 · Walmer
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000125',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Walmer executive residence #5',
  '30 Ridge Avenue',
  'Port Elizabeth',
  'Eastern Cape',
  'Walmer',
  'A',
  NULL,
  false,
  -33.9820663,
  25.5864475,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000125',
  'a3000001-0001-4000-8000-000000000125',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN',
  240.00, 4, 3.0, 3,
  'BOTH', 2633000.00, 18000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Walmer executive residence #5',
  'Executive 4-bed residence in Walmer with pool and study.',
  '["pool","garden","study","fibre","alarm"]'::jsonb,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9820663,
  25.5864475
);

-- PR-2126 · Walmer
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000126',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Walmer duplex rental #6',
  '6B Meadow Lane',
  'Port Elizabeth',
  'Eastern Cape',
  'Walmer',
  'A',
  NULL,
  false,
  -33.9827331,
  25.5840319,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000126',
  'a3000001-0001-4000-8000-000000000126',
  'a1000001-0001-4000-8000-000000000003',
  'U06',
  95.00, 2, 2.0, 1,
  'RENT', NULL, 12000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000022',
  'Walmer duplex rental #6',
  'Well-kept duplex to let in Walmer.',
  '["duplex","fibre","carport"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9827331,
  25.5840319
);

-- PR-2127 · Walmer
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000127',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Walmer office suite #7',
  'Suite 107',
  'Port Elizabeth',
  'Eastern Cape',
  'Walmer',
  'A',
  NULL,
  false,
  -33.9813283,
  25.5886660,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000127',
  'a3000001-0001-4000-8000-000000000127',
  'a1000001-0001-4000-8000-000000000001',
  'U07',
  110.00, 0, 1.0, 4,
  'RENT', NULL, 23000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Walmer office suite #7',
  'Fitted office suite in Walmer with on-site parking.',
  '["fibre","boardroom","parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb,
  false,
  -33.9813283,
  25.5886660
);

-- PR-2128 · Walmer
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000128',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Walmer starter home #8',
  '13 Willow Street',
  'Port Elizabeth',
  'Eastern Cape',
  'Walmer',
  'A',
  NULL,
  false,
  -33.9862318,
  25.5864326,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000128',
  'a3000001-0001-4000-8000-000000000128',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN',
  110.00, 2, 1.0, 1,
  'SALE', 1209000.00, NULL, 'UNDER_OFFER',
  'a2000001-0001-4000-8000-000000000017',
  'Walmer starter home #8',
  'Affordable starter home in Walmer — under offer.',
  '["freehold","bondable","garden"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb,
  false,
  -33.9862318,
  25.5864326
);

-- PR-2129 · Walmer
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000129',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Walmer vacant stand #9',
  'Erf 2009',
  'Port Elizabeth',
  'Eastern Cape',
  'Walmer',
  'A',
  NULL,
  false,
  -33.9849606,
  25.5855575,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000129',
  'a3000001-0001-4000-8000-000000000129',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  800.00, 0, 0.0, 0,
  'SALE', 683000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Walmer vacant stand #9',
  'Development-ready stand in Walmer, Port Elizabeth.',
  '["corner stand","services nearby"]'::jsonb,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb,
  false,
  -33.9849606,
  25.5855575
);

-- PR-2130 · Walmer
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000130',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Walmer penthouse-style 3-bed #10',
  'Penthouse 10',
  'Port Elizabeth',
  'Eastern Cape',
  'Walmer',
  'A',
  NULL,
  false,
  -33.9845674,
  25.5860987,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000130',
  'a3000001-0001-4000-8000-000000000130',
  'a1000001-0001-4000-8000-000000000001',
  'U10',
  115.00, 3, 2.0, 2,
  'BOTH', 1853000.00, 14000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Walmer penthouse-style 3-bed #10',
  'Top-floor 3-bed apartment in Walmer with open-plan living.',
  '["views","generator","gym access","fibre"]'::jsonb,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9845674,
  25.5860987
);

-- PR-2131 · Greenacres
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000131',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Greenacres family home #1',
  '13 Main Road',
  'Port Elizabeth',
  'Eastern Cape',
  'Greenacres',
  'A',
  NULL,
  false,
  -33.9397552,
  25.5562020,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000131',
  'a3000001-0001-4000-8000-000000000131',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN',
  185.00, 3, 2.0, 2,
  'SALE', 2048000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Greenacres family home #1',
  'Spacious 3-bed home in Greenacres, Port Elizabeth — ready for family living.',
  '["garden","fibre","security","bondable"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9397552,
  25.5562020
);

-- PR-2132 · Greenacres
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000132',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Greenacres 2-bed apartment #2',
  'Unit 2A',
  'Port Elizabeth',
  'Eastern Cape',
  'Greenacres',
  'A',
  NULL,
  false,
  -33.9394431,
  25.5539798,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000132',
  'a3000001-0001-4000-8000-000000000132',
  'a1000001-0001-4000-8000-000000000003',
  'U02',
  78.00, 2, 1.0, 1,
  'BOTH', 1404000.00, 11000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000022',
  'Greenacres 2-bed apartment #2',
  'Bright 2-bed apartment in Greenacres with covered parking.',
  '["balcony","fibre","secure parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb,
  false,
  -33.9394431,
  25.5539798
);

-- PR-2133 · Greenacres
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000133',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Greenacres townhouse complex #3',
  '3 Cluster Close',
  'Port Elizabeth',
  'Eastern Cape',
  'Greenacres',
  'A',
  NULL,
  false,
  -33.9359555,
  25.5536855,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000133',
  'a3000001-0001-4000-8000-000000000133',
  'a1000001-0001-4000-8000-000000000001',
  'U03',
  142.00, 3, 2.5, 2,
  'SALE', 1716000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Greenacres townhouse complex #3',
  'Secure townhouse in Greenacres with private courtyard.',
  '["complex security","garden","pet friendly"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb,
  false,
  -33.9359555,
  25.5536855
);

-- PR-2134 · Greenacres
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000134',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Greenacres bachelor flat #4',
  'Flat 4',
  'Port Elizabeth',
  'Eastern Cape',
  'Greenacres',
  'A',
  NULL,
  false,
  -33.9396001,
  25.5561289,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000134',
  'a3000001-0001-4000-8000-000000000134',
  'a1000001-0001-4000-8000-000000000002',
  'U04',
  48.00, 1, 1.0, 1,
  'RENT', NULL, 8000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Greenacres bachelor flat #4',
  'Compact rental flat in Greenacres — ideal for singles or students.',
  '["fibre","prepaid electricity"]'::jsonb,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9396001,
  25.5561289
);

-- PR-2135 · Greenacres
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000135',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Greenacres executive residence #5',
  '30 Ridge Avenue',
  'Port Elizabeth',
  'Eastern Cape',
  'Greenacres',
  'A',
  NULL,
  false,
  -33.9395234,
  25.5511322,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000135',
  'a3000001-0001-4000-8000-000000000135',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  240.00, 4, 3.0, 3,
  'BOTH', 2633000.00, 18000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Greenacres executive residence #5',
  'Executive 4-bed residence in Greenacres with pool and study.',
  '["pool","garden","study","fibre","alarm"]'::jsonb,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9395234,
  25.5511322
);

-- PR-2136 · Greenacres
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000136',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Greenacres duplex rental #6',
  '6B Meadow Lane',
  'Port Elizabeth',
  'Eastern Cape',
  'Greenacres',
  'A',
  NULL,
  false,
  -33.9388046,
  25.5536785,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000136',
  'a3000001-0001-4000-8000-000000000136',
  'a1000001-0001-4000-8000-000000000001',
  'U06',
  95.00, 2, 2.0, 1,
  'RENT', NULL, 12000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Greenacres duplex rental #6',
  'Well-kept duplex to let in Greenacres.',
  '["duplex","fibre","carport"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9388046,
  25.5536785
);

-- PR-2137 · Greenacres
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000137',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Greenacres office suite #7',
  'Suite 107',
  'Port Elizabeth',
  'Eastern Cape',
  'Greenacres',
  'A',
  NULL,
  false,
  -33.9351418,
  25.5554028,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000137',
  'a3000001-0001-4000-8000-000000000137',
  'a1000001-0001-4000-8000-000000000002',
  'U07',
  110.00, 0, 1.0, 4,
  'RENT', NULL, 23000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Greenacres office suite #7',
  'Fitted office suite in Greenacres with on-site parking.',
  '["fibre","boardroom","parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb,
  false,
  -33.9351418,
  25.5554028
);

-- PR-2138 · Greenacres
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000138',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Greenacres starter home #8',
  '13 Willow Street',
  'Port Elizabeth',
  'Eastern Cape',
  'Greenacres',
  'A',
  NULL,
  false,
  -33.9379484,
  25.5563252,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000138',
  'a3000001-0001-4000-8000-000000000138',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  110.00, 2, 1.0, 1,
  'SALE', 1209000.00, NULL, 'UNDER_OFFER',
  'a2000001-0001-4000-8000-000000000022',
  'Greenacres starter home #8',
  'Affordable starter home in Greenacres — under offer.',
  '["freehold","bondable","garden"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb,
  false,
  -33.9379484,
  25.5563252
);

-- PR-2139 · Greenacres
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000139',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Greenacres vacant stand #9',
  'Erf 2009',
  'Port Elizabeth',
  'Eastern Cape',
  'Greenacres',
  'A',
  NULL,
  false,
  -33.9381040,
  25.5506541,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000139',
  'a3000001-0001-4000-8000-000000000139',
  'a1000001-0001-4000-8000-000000000001',
  'MAIN',
  800.00, 0, 0.0, 0,
  'SALE', 683000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Greenacres vacant stand #9',
  'Development-ready stand in Greenacres, Port Elizabeth.',
  '["corner stand","services nearby"]'::jsonb,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb,
  false,
  -33.9381040,
  25.5506541
);

-- PR-2140 · Greenacres
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000140',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Greenacres penthouse-style 3-bed #10',
  'Penthouse 10',
  'Port Elizabeth',
  'Eastern Cape',
  'Greenacres',
  'A',
  NULL,
  false,
  -33.9359869,
  25.5501549,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000140',
  'a3000001-0001-4000-8000-000000000140',
  'a1000001-0001-4000-8000-000000000002',
  'U10',
  115.00, 3, 2.0, 2,
  'BOTH', 1853000.00, 14000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Greenacres penthouse-style 3-bed #10',
  'Top-floor 3-bed apartment in Greenacres with open-plan living.',
  '["views","generator","gym access","fibre"]'::jsonb,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9359869,
  25.5501549
);

-- PR-2141 · Newton Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000141',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Newton Park family home #1',
  '13 Main Road',
  'Port Elizabeth',
  'Eastern Cape',
  'Newton Park',
  'A',
  NULL,
  false,
  -33.9412728,
  25.5621444,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000141',
  'a3000001-0001-4000-8000-000000000141',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  185.00, 3, 2.0, 2,
  'SALE', 1733000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Newton Park family home #1',
  'Spacious 3-bed home in Newton Park, Port Elizabeth — ready for family living.',
  '["garden","fibre","security","bondable"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9412728,
  25.5621444
);

-- PR-2142 · Newton Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000142',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Newton Park 2-bed apartment #2',
  'Unit 2A',
  'Port Elizabeth',
  'Eastern Cape',
  'Newton Park',
  'A',
  NULL,
  false,
  -33.9402188,
  25.5574595,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000142',
  'a3000001-0001-4000-8000-000000000142',
  'a1000001-0001-4000-8000-000000000001',
  'U02',
  78.00, 2, 1.0, 1,
  'BOTH', 1188000.00, 9000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Newton Park 2-bed apartment #2',
  'Bright 2-bed apartment in Newton Park with covered parking.',
  '["balcony","fibre","secure parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb,
  false,
  -33.9402188,
  25.5574595
);

-- PR-2143 · Newton Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000143',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Newton Park townhouse complex #3',
  '3 Cluster Close',
  'Port Elizabeth',
  'Eastern Cape',
  'Newton Park',
  'A',
  NULL,
  false,
  -33.9456237,
  25.5579799,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000143',
  'a3000001-0001-4000-8000-000000000143',
  'a1000001-0001-4000-8000-000000000002',
  'U03',
  142.00, 3, 2.5, 2,
  'SALE', 1452000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Newton Park townhouse complex #3',
  'Secure townhouse in Newton Park with private courtyard.',
  '["complex security","garden","pet friendly"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb,
  false,
  -33.9456237,
  25.5579799
);

-- PR-2144 · Newton Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000144',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Newton Park bachelor flat #4',
  'Flat 4',
  'Port Elizabeth',
  'Eastern Cape',
  'Newton Park',
  'A',
  NULL,
  false,
  -33.9437015,
  25.5619716,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000144',
  'a3000001-0001-4000-8000-000000000144',
  'a1000001-0001-4000-8000-000000000003',
  'U04',
  48.00, 1, 1.0, 1,
  'RENT', NULL, 7000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000022',
  'Newton Park bachelor flat #4',
  'Compact rental flat in Newton Park — ideal for singles or students.',
  '["fibre","prepaid electricity"]'::jsonb,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9437015,
  25.5619716
);

-- PR-2145 · Newton Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000145',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Newton Park executive residence #5',
  '30 Ridge Avenue',
  'Port Elizabeth',
  'Eastern Cape',
  'Newton Park',
  'A',
  NULL,
  false,
  -33.9394718,
  25.5611081,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000145',
  'a3000001-0001-4000-8000-000000000145',
  'a1000001-0001-4000-8000-000000000001',
  'MAIN',
  240.00, 4, 3.0, 3,
  'BOTH', 2228000.00, 15000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Newton Park executive residence #5',
  'Executive 4-bed residence in Newton Park with pool and study.',
  '["pool","garden","study","fibre","alarm"]'::jsonb,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9394718,
  25.5611081
);

-- PR-2146 · Newton Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000146',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Newton Park duplex rental #6',
  '6B Meadow Lane',
  'Port Elizabeth',
  'Eastern Cape',
  'Newton Park',
  'A',
  NULL,
  false,
  -33.9461133,
  25.5558710,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000146',
  'a3000001-0001-4000-8000-000000000146',
  'a1000001-0001-4000-8000-000000000002',
  'U06',
  95.00, 2, 2.0, 1,
  'RENT', NULL, 10000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Newton Park duplex rental #6',
  'Well-kept duplex to let in Newton Park.',
  '["duplex","fibre","carport"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9461133,
  25.5558710
);

-- PR-2147 · Newton Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000147',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Newton Park office suite #7',
  'Suite 107',
  'Port Elizabeth',
  'Eastern Cape',
  'Newton Park',
  'A',
  NULL,
  false,
  -33.9422957,
  25.5573962,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000147',
  'a3000001-0001-4000-8000-000000000147',
  'a1000001-0001-4000-8000-000000000003',
  'U07',
  110.00, 0, 1.0, 4,
  'RENT', NULL, 20000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Newton Park office suite #7',
  'Fitted office suite in Newton Park with on-site parking.',
  '["fibre","boardroom","parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb,
  false,
  -33.9422957,
  25.5573962
);

-- PR-2148 · Newton Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000148',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Newton Park starter home #8',
  '13 Willow Street',
  'Port Elizabeth',
  'Eastern Cape',
  'Newton Park',
  'A',
  NULL,
  false,
  -33.9394672,
  25.5602212,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000148',
  'a3000001-0001-4000-8000-000000000148',
  'a1000001-0001-4000-8000-000000000001',
  'MAIN',
  110.00, 2, 1.0, 1,
  'SALE', 1023000.00, NULL, 'UNDER_OFFER',
  'a2000001-0001-4000-8000-000000000004',
  'Newton Park starter home #8',
  'Affordable starter home in Newton Park — under offer.',
  '["freehold","bondable","garden"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb,
  false,
  -33.9394672,
  25.5602212
);

-- PR-2149 · Newton Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000149',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Newton Park vacant stand #9',
  'Erf 2009',
  'Port Elizabeth',
  'Eastern Cape',
  'Newton Park',
  'A',
  NULL,
  false,
  -33.9457812,
  25.5608203,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000149',
  'a3000001-0001-4000-8000-000000000149',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN',
  800.00, 0, 0.0, 0,
  'SALE', 578000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Newton Park vacant stand #9',
  'Development-ready stand in Newton Park, Port Elizabeth.',
  '["corner stand","services nearby"]'::jsonb,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb,
  false,
  -33.9457812,
  25.5608203
);

-- PR-2150 · Newton Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000150',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Newton Park penthouse-style 3-bed #10',
  'Penthouse 10',
  'Port Elizabeth',
  'Eastern Cape',
  'Newton Park',
  'A',
  NULL,
  false,
  -33.9454005,
  25.5607491,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000150',
  'a3000001-0001-4000-8000-000000000150',
  'a1000001-0001-4000-8000-000000000003',
  'U10',
  115.00, 3, 2.0, 2,
  'BOTH', 1568000.00, 12000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000022',
  'Newton Park penthouse-style 3-bed #10',
  'Top-floor 3-bed apartment in Newton Park with open-plan living.',
  '["views","generator","gym access","fibre"]'::jsonb,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9454005,
  25.5607491
);

-- PR-2151 · Lorraine
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000151',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Lorraine family home #1',
  '13 Main Road',
  'Port Elizabeth',
  'Eastern Cape',
  'Lorraine',
  'A',
  NULL,
  false,
  -33.9332445,
  25.5033700,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000151',
  'a3000001-0001-4000-8000-000000000151',
  'a1000001-0001-4000-8000-000000000001',
  'MAIN',
  185.00, 3, 2.0, 2,
  'SALE', 1733000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Lorraine family home #1',
  'Spacious 3-bed home in Lorraine, Port Elizabeth — ready for family living.',
  '["garden","fibre","security","bondable"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9332445,
  25.5033700
);

-- PR-2152 · Lorraine
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000152',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Lorraine 2-bed apartment #2',
  'Unit 2A',
  'Port Elizabeth',
  'Eastern Cape',
  'Lorraine',
  'A',
  NULL,
  false,
  -33.9358317,
  25.5043751,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000152',
  'a3000001-0001-4000-8000-000000000152',
  'a1000001-0001-4000-8000-000000000002',
  'U02',
  78.00, 2, 1.0, 1,
  'BOTH', 1188000.00, 9000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Lorraine 2-bed apartment #2',
  'Bright 2-bed apartment in Lorraine with covered parking.',
  '["balcony","fibre","secure parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb,
  false,
  -33.9358317,
  25.5043751
);

-- PR-2153 · Lorraine
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000153',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Lorraine townhouse complex #3',
  '3 Cluster Close',
  'Port Elizabeth',
  'Eastern Cape',
  'Lorraine',
  'A',
  NULL,
  false,
  -33.9351744,
  25.5002727,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000153',
  'a3000001-0001-4000-8000-000000000153',
  'a1000001-0001-4000-8000-000000000003',
  'U03',
  142.00, 3, 2.5, 2,
  'SALE', 1452000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Lorraine townhouse complex #3',
  'Secure townhouse in Lorraine with private courtyard.',
  '["complex security","garden","pet friendly"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb,
  false,
  -33.9351744,
  25.5002727
);

-- PR-2154 · Lorraine
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000154',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Lorraine bachelor flat #4',
  'Flat 4',
  'Port Elizabeth',
  'Eastern Cape',
  'Lorraine',
  'A',
  NULL,
  false,
  -33.9337993,
  25.5069558,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000154',
  'a3000001-0001-4000-8000-000000000154',
  'a1000001-0001-4000-8000-000000000001',
  'U04',
  48.00, 1, 1.0, 1,
  'RENT', NULL, 7000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Lorraine bachelor flat #4',
  'Compact rental flat in Lorraine — ideal for singles or students.',
  '["fibre","prepaid electricity"]'::jsonb,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9337993,
  25.5069558
);

-- PR-2155 · Lorraine
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000155',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Lorraine executive residence #5',
  '30 Ridge Avenue',
  'Port Elizabeth',
  'Eastern Cape',
  'Lorraine',
  'A',
  NULL,
  false,
  -33.9342376,
  25.5042617,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000155',
  'a3000001-0001-4000-8000-000000000155',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN',
  240.00, 4, 3.0, 3,
  'BOTH', 2228000.00, 15000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Lorraine executive residence #5',
  'Executive 4-bed residence in Lorraine with pool and study.',
  '["pool","garden","study","fibre","alarm"]'::jsonb,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9342376,
  25.5042617
);

-- PR-2156 · Lorraine
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000156',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Lorraine duplex rental #6',
  '6B Meadow Lane',
  'Port Elizabeth',
  'Eastern Cape',
  'Lorraine',
  'A',
  NULL,
  false,
  -33.9367662,
  25.5004461,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000156',
  'a3000001-0001-4000-8000-000000000156',
  'a1000001-0001-4000-8000-000000000003',
  'U06',
  95.00, 2, 2.0, 1,
  'RENT', NULL, 10000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000022',
  'Lorraine duplex rental #6',
  'Well-kept duplex to let in Lorraine.',
  '["duplex","fibre","carport"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9367662,
  25.5004461
);

-- PR-2157 · Lorraine
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000157',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Lorraine office suite #7',
  'Suite 107',
  'Port Elizabeth',
  'Eastern Cape',
  'Lorraine',
  'A',
  NULL,
  false,
  -33.9353283,
  25.5018632,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000157',
  'a3000001-0001-4000-8000-000000000157',
  'a1000001-0001-4000-8000-000000000001',
  'U07',
  110.00, 0, 1.0, 4,
  'RENT', NULL, 20000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Lorraine office suite #7',
  'Fitted office suite in Lorraine with on-site parking.',
  '["fibre","boardroom","parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb,
  false,
  -33.9353283,
  25.5018632
);

-- PR-2158 · Lorraine
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000158',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Lorraine starter home #8',
  '13 Willow Street',
  'Port Elizabeth',
  'Eastern Cape',
  'Lorraine',
  'A',
  NULL,
  false,
  -33.9356983,
  25.5009899,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000158',
  'a3000001-0001-4000-8000-000000000158',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN',
  110.00, 2, 1.0, 1,
  'SALE', 1023000.00, NULL, 'UNDER_OFFER',
  'a2000001-0001-4000-8000-000000000017',
  'Lorraine starter home #8',
  'Affordable starter home in Lorraine — under offer.',
  '["freehold","bondable","garden"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb,
  false,
  -33.9356983,
  25.5009899
);

-- PR-2159 · Lorraine
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000159',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Lorraine vacant stand #9',
  'Erf 2009',
  'Port Elizabeth',
  'Eastern Cape',
  'Lorraine',
  'A',
  NULL,
  false,
  -33.9368119,
  25.5016809,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000159',
  'a3000001-0001-4000-8000-000000000159',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  800.00, 0, 0.0, 0,
  'SALE', 578000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Lorraine vacant stand #9',
  'Development-ready stand in Lorraine, Port Elizabeth.',
  '["corner stand","services nearby"]'::jsonb,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb,
  false,
  -33.9368119,
  25.5016809
);

-- PR-2160 · Lorraine
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000160',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Lorraine penthouse-style 3-bed #10',
  'Penthouse 10',
  'Port Elizabeth',
  'Eastern Cape',
  'Lorraine',
  'A',
  NULL,
  false,
  -33.9350469,
  25.5058468,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000160',
  'a3000001-0001-4000-8000-000000000160',
  'a1000001-0001-4000-8000-000000000001',
  'U10',
  115.00, 3, 2.0, 2,
  'BOTH', 1568000.00, 12000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Lorraine penthouse-style 3-bed #10',
  'Top-floor 3-bed apartment in Lorraine with open-plan living.',
  '["views","generator","gym access","fibre"]'::jsonb,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9350469,
  25.5058468
);

-- PR-2161 · Fairview
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000161',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Fairview family home #1',
  '13 Main Road',
  'Port Elizabeth',
  'Eastern Cape',
  'Fairview',
  'A',
  NULL,
  false,
  -33.9188130,
  25.4897229,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000161',
  'a3000001-0001-4000-8000-000000000161',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN',
  185.00, 3, 2.0, 2,
  'SALE', 1523000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Fairview family home #1',
  'Spacious 3-bed home in Fairview, Port Elizabeth — ready for family living.',
  '["garden","fibre","security","bondable"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9188130,
  25.4897229
);

-- PR-2162 · Fairview
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000162',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Fairview 2-bed apartment #2',
  'Unit 2A',
  'Port Elizabeth',
  'Eastern Cape',
  'Fairview',
  'A',
  NULL,
  false,
  -33.9132711,
  25.4870827,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000162',
  'a3000001-0001-4000-8000-000000000162',
  'a1000001-0001-4000-8000-000000000003',
  'U02',
  78.00, 2, 1.0, 1,
  'BOTH', 1044000.00, 8000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000022',
  'Fairview 2-bed apartment #2',
  'Bright 2-bed apartment in Fairview with covered parking.',
  '["balcony","fibre","secure parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb,
  false,
  -33.9132711,
  25.4870827
);

-- PR-2163 · Fairview
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000163',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Fairview townhouse complex #3',
  '3 Cluster Close',
  'Port Elizabeth',
  'Eastern Cape',
  'Fairview',
  'A',
  NULL,
  false,
  -33.9153612,
  25.4881004,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000163',
  'a3000001-0001-4000-8000-000000000163',
  'a1000001-0001-4000-8000-000000000001',
  'U03',
  142.00, 3, 2.5, 2,
  'SALE', 1276000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Fairview townhouse complex #3',
  'Secure townhouse in Fairview with private courtyard.',
  '["complex security","garden","pet friendly"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb,
  false,
  -33.9153612,
  25.4881004
);

-- PR-2164 · Fairview
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000164',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Fairview bachelor flat #4',
  'Flat 4',
  'Port Elizabeth',
  'Eastern Cape',
  'Fairview',
  'A',
  NULL,
  false,
  -33.9141313,
  25.4915345,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000164',
  'a3000001-0001-4000-8000-000000000164',
  'a1000001-0001-4000-8000-000000000002',
  'U04',
  48.00, 1, 1.0, 1,
  'RENT', NULL, 6000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Fairview bachelor flat #4',
  'Compact rental flat in Fairview — ideal for singles or students.',
  '["fibre","prepaid electricity"]'::jsonb,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9141313,
  25.4915345
);

-- PR-2165 · Fairview
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000165',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Fairview executive residence #5',
  '30 Ridge Avenue',
  'Port Elizabeth',
  'Eastern Cape',
  'Fairview',
  'A',
  NULL,
  false,
  -33.9127702,
  25.4892447,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000165',
  'a3000001-0001-4000-8000-000000000165',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  240.00, 4, 3.0, 3,
  'BOTH', 1958000.00, 13000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Fairview executive residence #5',
  'Executive 4-bed residence in Fairview with pool and study.',
  '["pool","garden","study","fibre","alarm"]'::jsonb,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9127702,
  25.4892447
);

-- PR-2166 · Fairview
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000166',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Fairview duplex rental #6',
  '6B Meadow Lane',
  'Port Elizabeth',
  'Eastern Cape',
  'Fairview',
  'A',
  NULL,
  false,
  -33.9180222,
  25.4895682,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000166',
  'a3000001-0001-4000-8000-000000000166',
  'a1000001-0001-4000-8000-000000000001',
  'U06',
  95.00, 2, 2.0, 1,
  'RENT', NULL, 9000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Fairview duplex rental #6',
  'Well-kept duplex to let in Fairview.',
  '["duplex","fibre","carport"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9180222,
  25.4895682
);

-- PR-2167 · Fairview
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000167',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Fairview office suite #7',
  'Suite 107',
  'Port Elizabeth',
  'Eastern Cape',
  'Fairview',
  'A',
  NULL,
  false,
  -33.9157005,
  25.4880016,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000167',
  'a3000001-0001-4000-8000-000000000167',
  'a1000001-0001-4000-8000-000000000002',
  'U07',
  110.00, 0, 1.0, 4,
  'RENT', NULL, 17000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Fairview office suite #7',
  'Fitted office suite in Fairview with on-site parking.',
  '["fibre","boardroom","parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb,
  false,
  -33.9157005,
  25.4880016
);

-- PR-2168 · Fairview
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000168',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Fairview starter home #8',
  '13 Willow Street',
  'Port Elizabeth',
  'Eastern Cape',
  'Fairview',
  'A',
  NULL,
  false,
  -33.9192706,
  25.4895468,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000168',
  'a3000001-0001-4000-8000-000000000168',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  110.00, 2, 1.0, 1,
  'SALE', 899000.00, NULL, 'UNDER_OFFER',
  'a2000001-0001-4000-8000-000000000022',
  'Fairview starter home #8',
  'Affordable starter home in Fairview — under offer.',
  '["freehold","bondable","garden"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb,
  false,
  -33.9192706,
  25.4895468
);

-- PR-2169 · Fairview
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000169',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Fairview vacant stand #9',
  'Erf 2009',
  'Port Elizabeth',
  'Eastern Cape',
  'Fairview',
  'A',
  NULL,
  false,
  -33.9174621,
  25.4871563,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000169',
  'a3000001-0001-4000-8000-000000000169',
  'a1000001-0001-4000-8000-000000000001',
  'MAIN',
  800.00, 0, 0.0, 0,
  'SALE', 507000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Fairview vacant stand #9',
  'Development-ready stand in Fairview, Port Elizabeth.',
  '["corner stand","services nearby"]'::jsonb,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb,
  false,
  -33.9174621,
  25.4871563
);

-- PR-2170 · Fairview
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000170',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Fairview penthouse-style 3-bed #10',
  'Penthouse 10',
  'Port Elizabeth',
  'Eastern Cape',
  'Fairview',
  'A',
  NULL,
  false,
  -33.9162328,
  25.4916794,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000170',
  'a3000001-0001-4000-8000-000000000170',
  'a1000001-0001-4000-8000-000000000002',
  'U10',
  115.00, 3, 2.0, 2,
  'BOTH', 1378000.00, 10000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Fairview penthouse-style 3-bed #10',
  'Top-floor 3-bed apartment in Fairview with open-plan living.',
  '["views","generator","gym access","fibre"]'::jsonb,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9162328,
  25.4916794
);

-- PR-2171 · Sherwood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000171',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Sherwood family home #1',
  '13 Main Road',
  'Port Elizabeth',
  'Eastern Cape',
  'Sherwood',
  'A',
  NULL,
  false,
  -33.9237093,
  25.5363468,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000171',
  'a3000001-0001-4000-8000-000000000171',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  185.00, 3, 2.0, 2,
  'SALE', 1523000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Sherwood family home #1',
  'Spacious 3-bed home in Sherwood, Port Elizabeth — ready for family living.',
  '["garden","fibre","security","bondable"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9237093,
  25.5363468
);

-- PR-2172 · Sherwood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000172',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Sherwood 2-bed apartment #2',
  'Unit 2A',
  'Port Elizabeth',
  'Eastern Cape',
  'Sherwood',
  'A',
  NULL,
  false,
  -33.9198314,
  25.5322453,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000172',
  'a3000001-0001-4000-8000-000000000172',
  'a1000001-0001-4000-8000-000000000001',
  'U02',
  78.00, 2, 1.0, 1,
  'BOTH', 1044000.00, 8000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Sherwood 2-bed apartment #2',
  'Bright 2-bed apartment in Sherwood with covered parking.',
  '["balcony","fibre","secure parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb,
  false,
  -33.9198314,
  25.5322453
);

-- PR-2173 · Sherwood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000173',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Sherwood townhouse complex #3',
  '3 Cluster Close',
  'Port Elizabeth',
  'Eastern Cape',
  'Sherwood',
  'A',
  NULL,
  false,
  -33.9232825,
  25.5348996,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000173',
  'a3000001-0001-4000-8000-000000000173',
  'a1000001-0001-4000-8000-000000000002',
  'U03',
  142.00, 3, 2.5, 2,
  'SALE', 1276000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Sherwood townhouse complex #3',
  'Secure townhouse in Sherwood with private courtyard.',
  '["complex security","garden","pet friendly"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb,
  false,
  -33.9232825,
  25.5348996
);

-- PR-2174 · Sherwood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000174',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Sherwood bachelor flat #4',
  'Flat 4',
  'Port Elizabeth',
  'Eastern Cape',
  'Sherwood',
  'A',
  NULL,
  false,
  -33.9239270,
  25.5343054,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000174',
  'a3000001-0001-4000-8000-000000000174',
  'a1000001-0001-4000-8000-000000000003',
  'U04',
  48.00, 1, 1.0, 1,
  'RENT', NULL, 6000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000022',
  'Sherwood bachelor flat #4',
  'Compact rental flat in Sherwood — ideal for singles or students.',
  '["fibre","prepaid electricity"]'::jsonb,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9239270,
  25.5343054
);

-- PR-2175 · Sherwood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000175',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Sherwood executive residence #5',
  '30 Ridge Avenue',
  'Port Elizabeth',
  'Eastern Cape',
  'Sherwood',
  'A',
  NULL,
  false,
  -33.9226397,
  25.5363011,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000175',
  'a3000001-0001-4000-8000-000000000175',
  'a1000001-0001-4000-8000-000000000001',
  'MAIN',
  240.00, 4, 3.0, 3,
  'BOTH', 1958000.00, 13000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Sherwood executive residence #5',
  'Executive 4-bed residence in Sherwood with pool and study.',
  '["pool","garden","study","fibre","alarm"]'::jsonb,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9226397,
  25.5363011
);

-- PR-2176 · Sherwood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000176',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Sherwood duplex rental #6',
  '6B Meadow Lane',
  'Port Elizabeth',
  'Eastern Cape',
  'Sherwood',
  'A',
  NULL,
  false,
  -33.9236703,
  25.5368389,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000176',
  'a3000001-0001-4000-8000-000000000176',
  'a1000001-0001-4000-8000-000000000002',
  'U06',
  95.00, 2, 2.0, 1,
  'RENT', NULL, 9000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Sherwood duplex rental #6',
  'Well-kept duplex to let in Sherwood.',
  '["duplex","fibre","carport"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9236703,
  25.5368389
);

-- PR-2177 · Sherwood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000177',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Sherwood office suite #7',
  'Suite 107',
  'Port Elizabeth',
  'Eastern Cape',
  'Sherwood',
  'A',
  NULL,
  false,
  -33.9237943,
  25.5331431,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000177',
  'a3000001-0001-4000-8000-000000000177',
  'a1000001-0001-4000-8000-000000000003',
  'U07',
  110.00, 0, 1.0, 4,
  'RENT', NULL, 17000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Sherwood office suite #7',
  'Fitted office suite in Sherwood with on-site parking.',
  '["fibre","boardroom","parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb,
  false,
  -33.9237943,
  25.5331431
);

-- PR-2178 · Sherwood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000178',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Sherwood starter home #8',
  '13 Willow Street',
  'Port Elizabeth',
  'Eastern Cape',
  'Sherwood',
  'A',
  NULL,
  false,
  -33.9202864,
  25.5316265,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000178',
  'a3000001-0001-4000-8000-000000000178',
  'a1000001-0001-4000-8000-000000000001',
  'MAIN',
  110.00, 2, 1.0, 1,
  'SALE', 899000.00, NULL, 'UNDER_OFFER',
  'a2000001-0001-4000-8000-000000000004',
  'Sherwood starter home #8',
  'Affordable starter home in Sherwood — under offer.',
  '["freehold","bondable","garden"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb,
  false,
  -33.9202864,
  25.5316265
);

-- PR-2179 · Sherwood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000179',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Sherwood vacant stand #9',
  'Erf 2009',
  'Port Elizabeth',
  'Eastern Cape',
  'Sherwood',
  'A',
  NULL,
  false,
  -33.9227638,
  25.5321162,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000179',
  'a3000001-0001-4000-8000-000000000179',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN',
  800.00, 0, 0.0, 0,
  'SALE', 507000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Sherwood vacant stand #9',
  'Development-ready stand in Sherwood, Port Elizabeth.',
  '["corner stand","services nearby"]'::jsonb,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb,
  false,
  -33.9227638,
  25.5321162
);

-- PR-2180 · Sherwood
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000180',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Sherwood penthouse-style 3-bed #10',
  'Penthouse 10',
  'Port Elizabeth',
  'Eastern Cape',
  'Sherwood',
  'A',
  NULL,
  false,
  -33.9251862,
  25.5365473,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000180',
  'a3000001-0001-4000-8000-000000000180',
  'a1000001-0001-4000-8000-000000000003',
  'U10',
  115.00, 3, 2.0, 2,
  'BOTH', 1378000.00, 10000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000022',
  'Sherwood penthouse-style 3-bed #10',
  'Top-floor 3-bed apartment in Sherwood with open-plan living.',
  '["views","generator","gym access","fibre"]'::jsonb,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9251862,
  25.5365473
);

-- PR-2181 · Algoa Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000181',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Algoa Park family home #1',
  '13 Main Road',
  'Port Elizabeth',
  'Eastern Cape',
  'Algoa Park',
  'A',
  NULL,
  false,
  -33.9148076,
  25.5685270,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000181',
  'a3000001-0001-4000-8000-000000000181',
  'a1000001-0001-4000-8000-000000000001',
  'MAIN',
  185.00, 3, 2.0, 2,
  'SALE', 1103000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Algoa Park family home #1',
  'Spacious 3-bed home in Algoa Park, Port Elizabeth — ready for family living.',
  '["garden","fibre","security","bondable"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9148076,
  25.5685270
);

-- PR-2182 · Algoa Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000182',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Algoa Park 2-bed apartment #2',
  'Unit 2A',
  'Port Elizabeth',
  'Eastern Cape',
  'Algoa Park',
  'A',
  NULL,
  false,
  -33.9157919,
  25.5691381,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000182',
  'a3000001-0001-4000-8000-000000000182',
  'a1000001-0001-4000-8000-000000000002',
  'U02',
  78.00, 2, 1.0, 1,
  'BOTH', 756000.00, 6000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Algoa Park 2-bed apartment #2',
  'Bright 2-bed apartment in Algoa Park with covered parking.',
  '["balcony","fibre","secure parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb,
  false,
  -33.9157919,
  25.5691381
);

-- PR-2183 · Algoa Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000183',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Algoa Park townhouse complex #3',
  '3 Cluster Close',
  'Port Elizabeth',
  'Eastern Cape',
  'Algoa Park',
  'A',
  NULL,
  false,
  -33.9172809,
  25.5634744,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000183',
  'a3000001-0001-4000-8000-000000000183',
  'a1000001-0001-4000-8000-000000000003',
  'U03',
  142.00, 3, 2.5, 2,
  'SALE', 924000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Algoa Park townhouse complex #3',
  'Secure townhouse in Algoa Park with private courtyard.',
  '["complex security","garden","pet friendly"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb,
  false,
  -33.9172809,
  25.5634744
);

-- PR-2184 · Algoa Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000184',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Algoa Park bachelor flat #4',
  'Flat 4',
  'Port Elizabeth',
  'Eastern Cape',
  'Algoa Park',
  'A',
  NULL,
  false,
  -33.9163499,
  25.5687929,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000184',
  'a3000001-0001-4000-8000-000000000184',
  'a1000001-0001-4000-8000-000000000001',
  'U04',
  48.00, 1, 1.0, 1,
  'RENT', NULL, 5000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Algoa Park bachelor flat #4',
  'Compact rental flat in Algoa Park — ideal for singles or students.',
  '["fibre","prepaid electricity"]'::jsonb,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9163499,
  25.5687929
);

-- PR-2185 · Algoa Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000185',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Algoa Park executive residence #5',
  '30 Ridge Avenue',
  'Port Elizabeth',
  'Eastern Cape',
  'Algoa Park',
  'A',
  NULL,
  false,
  -33.9194581,
  25.5666335,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000185',
  'a3000001-0001-4000-8000-000000000185',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN',
  240.00, 4, 3.0, 3,
  'BOTH', 1418000.00, 11000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Algoa Park executive residence #5',
  'Executive 4-bed residence in Algoa Park with pool and study.',
  '["pool","garden","study","fibre","alarm"]'::jsonb,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9194581,
  25.5666335
);

-- PR-2186 · Algoa Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000186',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Algoa Park duplex rental #6',
  '6B Meadow Lane',
  'Port Elizabeth',
  'Eastern Cape',
  'Algoa Park',
  'A',
  NULL,
  false,
  -33.9146118,
  25.5649700,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000186',
  'a3000001-0001-4000-8000-000000000186',
  'a1000001-0001-4000-8000-000000000003',
  'U06',
  95.00, 2, 2.0, 1,
  'RENT', NULL, 7000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000022',
  'Algoa Park duplex rental #6',
  'Well-kept duplex to let in Algoa Park.',
  '["duplex","fibre","carport"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.9146118,
  25.5649700
);

-- PR-2187 · Algoa Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000187',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Algoa Park office suite #7',
  'Suite 107',
  'Port Elizabeth',
  'Eastern Cape',
  'Algoa Park',
  'A',
  NULL,
  false,
  -33.9208798,
  25.5659835,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000187',
  'a3000001-0001-4000-8000-000000000187',
  'a1000001-0001-4000-8000-000000000001',
  'U07',
  110.00, 0, 1.0, 4,
  'RENT', NULL, 14000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Algoa Park office suite #7',
  'Fitted office suite in Algoa Park with on-site parking.',
  '["fibre","boardroom","parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb,
  false,
  -33.9208798,
  25.5659835
);

-- PR-2188 · Algoa Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000188',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Algoa Park starter home #8',
  '13 Willow Street',
  'Port Elizabeth',
  'Eastern Cape',
  'Algoa Park',
  'A',
  NULL,
  false,
  -33.9163866,
  25.5679815,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000188',
  'a3000001-0001-4000-8000-000000000188',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN',
  110.00, 2, 1.0, 1,
  'SALE', 651000.00, NULL, 'UNDER_OFFER',
  'a2000001-0001-4000-8000-000000000017',
  'Algoa Park starter home #8',
  'Affordable starter home in Algoa Park — under offer.',
  '["freehold","bondable","garden"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb,
  false,
  -33.9163866,
  25.5679815
);

-- PR-2189 · Algoa Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000189',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Algoa Park vacant stand #9',
  'Erf 2009',
  'Port Elizabeth',
  'Eastern Cape',
  'Algoa Park',
  'A',
  NULL,
  false,
  -33.9151111,
  25.5646953,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000189',
  'a3000001-0001-4000-8000-000000000189',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  800.00, 0, 0.0, 0,
  'SALE', 368000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Algoa Park vacant stand #9',
  'Development-ready stand in Algoa Park, Port Elizabeth.',
  '["corner stand","services nearby"]'::jsonb,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb,
  false,
  -33.9151111,
  25.5646953
);

-- PR-2190 · Algoa Park
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000190',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Algoa Park penthouse-style 3-bed #10',
  'Penthouse 10',
  'Port Elizabeth',
  'Eastern Cape',
  'Algoa Park',
  'A',
  NULL,
  false,
  -33.9210825,
  25.5666796,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000190',
  'a3000001-0001-4000-8000-000000000190',
  'a1000001-0001-4000-8000-000000000001',
  'U10',
  115.00, 3, 2.0, 2,
  'BOTH', 998000.00, 8000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Algoa Park penthouse-style 3-bed #10',
  'Top-floor 3-bed apartment in Algoa Park with open-plan living.',
  '["views","generator","gym access","fibre"]'::jsonb,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.9210825,
  25.5666796
);

-- PR-2191 · Bethelsdorp
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000191',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Bethelsdorp family home #1',
  '13 Main Road',
  'Port Elizabeth',
  'Eastern Cape',
  'Bethelsdorp',
  'A',
  NULL,
  false,
  -33.8656545,
  25.4967644,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000191',
  'a3000001-0001-4000-8000-000000000191',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN',
  185.00, 3, 2.0, 2,
  'SALE', 1103000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Bethelsdorp family home #1',
  'Spacious 3-bed home in Bethelsdorp, Port Elizabeth — ready for family living.',
  '["garden","fibre","security","bondable"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.8656545,
  25.4967644
);

-- PR-2192 · Bethelsdorp
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000192',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Bethelsdorp 2-bed apartment #2',
  'Unit 2A',
  'Port Elizabeth',
  'Eastern Cape',
  'Bethelsdorp',
  'A',
  NULL,
  false,
  -33.8655428,
  25.5019631,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000192',
  'a3000001-0001-4000-8000-000000000192',
  'a1000001-0001-4000-8000-000000000003',
  'U02',
  78.00, 2, 1.0, 1,
  'BOTH', 756000.00, 6000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000022',
  'Bethelsdorp 2-bed apartment #2',
  'Bright 2-bed apartment in Bethelsdorp with covered parking.',
  '["balcony","fibre","secure parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80"]'::jsonb,
  false,
  -33.8655428,
  25.5019631
);

-- PR-2193 · Bethelsdorp
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000193',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Bethelsdorp townhouse complex #3',
  '3 Cluster Close',
  'Port Elizabeth',
  'Eastern Cape',
  'Bethelsdorp',
  'A',
  NULL,
  false,
  -33.8659976,
  25.4957840,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000193',
  'a3000001-0001-4000-8000-000000000193',
  'a1000001-0001-4000-8000-000000000001',
  'U03',
  142.00, 3, 2.5, 2,
  'SALE', 924000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Bethelsdorp townhouse complex #3',
  'Secure townhouse in Bethelsdorp with private courtyard.',
  '["complex security","garden","pet friendly"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80"]'::jsonb,
  false,
  -33.8659976,
  25.4957840
);

-- PR-2194 · Bethelsdorp
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000194',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Bethelsdorp bachelor flat #4',
  'Flat 4',
  'Port Elizabeth',
  'Eastern Cape',
  'Bethelsdorp',
  'A',
  NULL,
  false,
  -33.8607718,
  25.4995838,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000194',
  'a3000001-0001-4000-8000-000000000194',
  'a1000001-0001-4000-8000-000000000002',
  'U04',
  48.00, 1, 1.0, 1,
  'RENT', NULL, 5000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Bethelsdorp bachelor flat #4',
  'Compact rental flat in Bethelsdorp — ideal for singles or students.',
  '["fibre","prepaid electricity"]'::jsonb,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.8607718,
  25.4995838
);

-- PR-2195 · Bethelsdorp
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000195',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Bethelsdorp executive residence #5',
  '30 Ridge Avenue',
  'Port Elizabeth',
  'Eastern Cape',
  'Bethelsdorp',
  'A',
  NULL,
  false,
  -33.8646248,
  25.4961507,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000195',
  'a3000001-0001-4000-8000-000000000195',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  240.00, 4, 3.0, 3,
  'BOTH', 1418000.00, 11000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000021',
  'Bethelsdorp executive residence #5',
  'Executive 4-bed residence in Bethelsdorp with pool and study.',
  '["pool","garden","study","fibre","alarm"]'::jsonb,
  '["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.8646248,
  25.4961507
);

-- PR-2196 · Bethelsdorp
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000196',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Bethelsdorp duplex rental #6',
  '6B Meadow Lane',
  'Port Elizabeth',
  'Eastern Cape',
  'Bethelsdorp',
  'A',
  NULL,
  false,
  -33.8612893,
  25.5018137,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000196',
  'a3000001-0001-4000-8000-000000000196',
  'a1000001-0001-4000-8000-000000000001',
  'U06',
  95.00, 2, 2.0, 1,
  'RENT', NULL, 7000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Bethelsdorp duplex rental #6',
  'Well-kept duplex to let in Bethelsdorp.',
  '["duplex","fibre","carport"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80"]'::jsonb,
  false,
  -33.8612893,
  25.5018137
);

-- PR-2197 · Bethelsdorp
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000197',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Bethelsdorp office suite #7',
  'Suite 107',
  'Port Elizabeth',
  'Eastern Cape',
  'Bethelsdorp',
  'A',
  NULL,
  false,
  -33.8648219,
  25.5009911,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000197',
  'a3000001-0001-4000-8000-000000000197',
  'a1000001-0001-4000-8000-000000000002',
  'U07',
  110.00, 0, 1.0, 4,
  'RENT', NULL, 14000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Bethelsdorp office suite #7',
  'Fitted office suite in Bethelsdorp with on-site parking.',
  '["fibre","boardroom","parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80"]'::jsonb,
  false,
  -33.8648219,
  25.5009911
);

-- PR-2198 · Bethelsdorp
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000198',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Bethelsdorp starter home #8',
  '13 Willow Street',
  'Port Elizabeth',
  'Eastern Cape',
  'Bethelsdorp',
  'A',
  NULL,
  false,
  -33.8603318,
  25.4954058,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000198',
  'a3000001-0001-4000-8000-000000000198',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN',
  110.00, 2, 1.0, 1,
  'SALE', 651000.00, NULL, 'UNDER_OFFER',
  'a2000001-0001-4000-8000-000000000022',
  'Bethelsdorp starter home #8',
  'Affordable starter home in Bethelsdorp — under offer.',
  '["freehold","bondable","garden"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80"]'::jsonb,
  false,
  -33.8603318,
  25.4954058
);

-- PR-2199 · Bethelsdorp
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000199',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Bethelsdorp vacant stand #9',
  'Erf 2009',
  'Port Elizabeth',
  'Eastern Cape',
  'Bethelsdorp',
  'A',
  NULL,
  false,
  -33.8634817,
  25.5013385,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000199',
  'a3000001-0001-4000-8000-000000000199',
  'a1000001-0001-4000-8000-000000000001',
  'MAIN',
  800.00, 0, 0.0, 0,
  'SALE', 368000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Bethelsdorp vacant stand #9',
  'Development-ready stand in Bethelsdorp, Port Elizabeth.',
  '["corner stand","services nearby"]'::jsonb,
  '["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80"]'::jsonb,
  false,
  -33.8634817,
  25.5013385
);

-- PR-2200 · Bethelsdorp
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000200',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Bethelsdorp penthouse-style 3-bed #10',
  'Penthouse 10',
  'Port Elizabeth',
  'Eastern Cape',
  'Bethelsdorp',
  'A',
  NULL,
  false,
  -33.8637765,
  25.4961144,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000200',
  'a3000001-0001-4000-8000-000000000200',
  'a1000001-0001-4000-8000-000000000002',
  'U10',
  115.00, 3, 2.0, 2,
  'BOTH', 998000.00, 8000.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000017',
  'Bethelsdorp penthouse-style 3-bed #10',
  'Top-floor 3-bed apartment in Bethelsdorp with open-plan living.',
  '["views","generator","gym access","fibre"]'::jsonb,
  '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80","https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80"]'::jsonb,
  true,
  -33.8637765,
  25.4961144
);

COMMIT;
