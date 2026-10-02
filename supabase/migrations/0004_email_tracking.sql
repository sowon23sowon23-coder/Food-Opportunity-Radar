-- Phase 1: track which insights have already been emailed
-- Run this in the Supabase SQL Editor after 0003_content_insights.sql

alter table content_insights add column emailed_at timestamptz;
