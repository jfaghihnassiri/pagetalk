class PageTalkAPI {
  constructor(supabaseUrl, anonKey) {
    this.base = `${supabaseUrl}/rest/v1`;
    this.rpc  = `${supabaseUrl}/rpc`;
    this.headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };
  }

  async _fetch(method, url, body, extra = {}) {
    const opts = { method, headers: { ...this.headers, ...extra } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === 204) return null;
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(data && data.message) || text}`);
    return data;
  }

  _get(path, q = '')  { return this._fetch('GET',  `${this.base}${path}${q}`); }
  _post(path, body, extra = {}) {
    return this._fetch('POST', `${this.base}${path}`, body, { Prefer: 'return=representation', ...extra });
  }
  _rpc(fn, params) { return this._fetch('POST', `${this.rpc}/${fn}`, params); }

  async getOrCreateThread(id, url, title) {
    const r = await this._post('/threads', { id, url, title: title || url }, { Prefer: 'resolution=ignore-duplicates,return=representation' });
    if (Array.isArray(r) && r.length === 0) return (await this._get('/threads', `?id=eq.${id}`))[0];
    return Array.isArray(r) ? r[0] : r;
  }

  getComments(threadId) {
    return this._get('/comments', `?thread_id=eq.${encodeURIComponent(threadId)}&order=created_at.asc`);
  }

  async createComment({ threadId, content, parentId, depth, authorId, authorName }) {
    const r = await this._post('/comments', { thread_id: threadId, content, parent_id: parentId || null, depth: depth || 0, author_id: authorId, author_name: authorName || 'Anonymous' });
    return Array.isArray(r) ? r[0] : r;
  }

  updateAuthorName(authorId, newName) {
    return this._fetch('PATCH', `${this.base}/comments?author_id=eq.${encodeURIComponent(authorId)}`, { author_name: newName }, { Prefer: 'return=minimal' });
  }

  vote(commentId, userId, voteType) {
    return this._rpc('vote_on_comment', { p_comment_id: commentId, p_user_id: userId, p_vote_type: voteType });
  }
}
