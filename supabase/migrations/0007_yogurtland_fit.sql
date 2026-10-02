-- Phase 1: Yogurtland applicability assessment, generated alongside extraction

alter table content_insights add column yogurtland_fit text
  check (yogurtland_fit in ('explore', 'validate', 'test', 'hold', 'reject'));
alter table content_insights add column yogurtland_idea text;
alter table content_insights add column yogurtland_reasoning text;
