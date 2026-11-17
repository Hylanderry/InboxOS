-- Preserve abandoned queue work for audit instead of leaving it indefinitely
-- in a misleading active state. A live Queue delivery retries the same event ID.

update public.evolution_events
set status = 'dead_letter',
    next_attempt_at = null,
    last_error = coalesce(last_error, 'Processamento interrompido antes da confirmação da fila')
where status = 'processing'
  and processing_at < now() - interval '15 minutes';
