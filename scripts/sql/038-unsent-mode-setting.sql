-- Add unsent_mode setting for "always queue photos unsent" feature
INSERT INTO public.app_settings (key, value)
VALUES ('unsent_mode', '{"enabled":false,"max_limit":50}')
ON CONFLICT (key) DO NOTHING;
