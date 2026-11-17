update public.messages
set media_url = '/api/media/' || split_part(media_url, '/storage/v1/object/public/chat-media/', 2)
where media_url like '%/storage/v1/object/public/chat-media/%';

update public.messages
set media_url = '/api/media/' || split_part(media_url, '/storage/v1/object/sign/chat-media/', 2)
where media_url like '%/storage/v1/object/sign/chat-media/%';
