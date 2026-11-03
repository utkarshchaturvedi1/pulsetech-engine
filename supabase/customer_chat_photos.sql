-- Private storage for optional customer chat photos.
-- Signed upload/read URLs are issued by the server with the service-role key;
-- the bucket itself is never public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-chat-photos',
  'customer-chat-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
