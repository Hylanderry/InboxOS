-- Production reconciliation: both indexes were UNIQUE on (instance_name).
-- Keep whatsapp_instances_evolution_name_unique, the canonical index created
-- by the latest identity migrations, and remove only the older duplicate.
drop index if exists public.idx_whatsapp_instances_global_name;
