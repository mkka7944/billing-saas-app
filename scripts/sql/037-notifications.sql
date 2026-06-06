-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'admin_alert', 'staff_message', 'item_update')),
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, read, created_at DESC);

-- Enable RLS but allow service_role and authenticated access
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "users_read_own" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own notifications (mark read)
CREATE POLICY "users_update_own" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role can insert (admin endpoints use admin client)
CREATE POLICY "service_role_all" ON notifications
  FOR ALL USING (auth.role() = 'service_role');
