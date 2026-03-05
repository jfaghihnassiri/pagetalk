# PageTalk Setup Guide

## 1. Create a free Supabase project

Go to [supabase.com](https://supabase.com), create an account, and start a new project.

## 2. Run the SQL schema

In the Supabase dashboard open **SQL Editor** and run:

```sql
CREATE TABLE threads (
  id         TEXT        PRIMARY KEY,
  url        TEXT        NOT NULL,
  title      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   TEXT        NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  parent_id   UUID        REFERENCES comments(id) ON DELETE CASCADE,
  author_id   TEXT        NOT NULL,
  author_name TEXT        NOT NULL DEFAULT 'Anonymous',
  content     TEXT        NOT NULL,
  upvotes     INTEGER     NOT NULL DEFAULT 0,
  downvotes   INTEGER     NOT NULL DEFAULT 0,
  depth       INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE votes (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  vote_type  TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX idx_comments_thread_id ON comments(thread_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);

CREATE OR REPLACE FUNCTION vote_on_comment(
  p_comment_id UUID,
  p_user_id    TEXT,
  p_vote_type  TEXT
) RETURNS JSON AS $$
DECLARE
  existing_vote TEXT;
  result_action TEXT;
BEGIN
  SELECT vote_type INTO existing_vote FROM votes
  WHERE comment_id = p_comment_id AND user_id = p_user_id;

  IF existing_vote IS NULL THEN
    INSERT INTO votes (comment_id, user_id, vote_type) VALUES (p_comment_id, p_user_id, p_vote_type);
    IF p_vote_type = 'up' THEN UPDATE comments SET upvotes = upvotes + 1 WHERE id = p_comment_id;
    ELSE UPDATE comments SET downvotes = downvotes + 1 WHERE id = p_comment_id; END IF;
    result_action := 'added';
  ELSIF existing_vote = p_vote_type THEN
    DELETE FROM votes WHERE comment_id = p_comment_id AND user_id = p_user_id;
    IF p_vote_type = 'up' THEN UPDATE comments SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = p_comment_id;
    ELSE UPDATE comments SET downvotes = GREATEST(downvotes - 1, 0) WHERE id = p_comment_id; END IF;
    result_action := 'removed';
  ELSE
    UPDATE votes SET vote_type = p_vote_type WHERE comment_id = p_comment_id AND user_id = p_user_id;
    IF p_vote_type = 'up' THEN
      UPDATE comments SET upvotes = upvotes + 1, downvotes = GREATEST(downvotes - 1, 0) WHERE id = p_comment_id;
    ELSE
      UPDATE comments SET downvotes = downvotes + 1, upvotes = GREATEST(upvotes - 1, 0) WHERE id = p_comment_id;
    END IF;
    result_action := 'changed';
  END IF;
  RETURN json_build_object('action', result_action);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION vote_on_comment TO anon;

ALTER TABLE threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "threads_select"  ON threads  FOR SELECT USING (true);
CREATE POLICY "threads_insert"  ON threads  FOR INSERT WITH CHECK (true);
CREATE POLICY "comments_select" ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (true);
CREATE POLICY "comments_update_own" ON comments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "votes_select"    ON votes    FOR SELECT USING (true);
```

## 3. Configure the extension

Open `config.js` and fill in your credentials from **Project Settings → API**:

```js
const CONFIG = {
  supabaseUrl:     'https://your-project.supabase.co',
  supabaseAnonKey: 'eyJ...',
};
```

## 4. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder
