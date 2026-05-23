-- SQL Table Reset and Creation for 'verified_houses' Location Tracking
DROP TABLE IF EXISTS verified_houses;

CREATE TABLE verified_houses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    survey_id VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    surveyor_name VARCHAR(255),
    route_name VARCHAR(255),
    default_lat DECIMAL(10, 8),
    default_lng DECIMAL(11, 8),
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: Ensure uuid-ossp extension is enabled or change id to SERIAL
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Creating an index on survey_id for faster lookups
CREATE INDEX idx_verified_houses_survey_id ON verified_houses(survey_id);
