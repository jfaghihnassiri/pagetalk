const state = {
  currentUrl: '', currentTitle: '', threadId: '', userId: '',
  displayName: 'Anonymous', comments: [], sortMode: 'hot', userVotes: {},
};
let api = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const stored = await chrome.storage.local.get(['userId', 'displayName', 'userVotes']);
  state.userId = stored.userId || generateUserId();
  if (!stored.userId) await chrome.storage.local.set({ userId: state.userId });
  state.displayName = stored.displayName || 'Anonymous';
  state.userVotes   = stored.userVotes   || {};

  if (!CONFIG.supabaseUrl || CONFIG.supabaseUrl === 'YOUR_SUPABASE_URL') {
    showError('PageTalk is not configured yet.\n\nOpen config.js and add your Supabase URL and anon key.');
    return;
  }
  api = new PageTalkAPI(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);

  let tab;
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); }
  catch { showError('Could not read the current tab.'); return; }
  if (!tab || !tab.url) { showError('Could not read the current tab URL.'); return; }

  const blocked = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'file://'];
  if (blocked.some(p => tab.url.startsWith(p))) { showError('PageTalk is not available on browser internal pages.'); return; }

  state.currentUrl   = tab.url;
  state.currentTitle = tab.title || tab.url;
  state.threadId     = await hashUrl(tab.url);

  const urlEl = document.getElementById('urlDisplay');
  urlEl.textContent = urlEl.title = normalizeUrl(tab.url);

  bindStaticEvents();
  await loadThread();
}

async function loadThread() {
  showLoading();
  try {
    await api.getOrCreateThread(state.threadId, state.currentUrl, state.currentTitle);
    await loadComments();
  } catch (err) {
    console.error('[PageTalk] loadThread:', err);
    showError('Failed to load discussion.\n\nCheck your network connection and Supabase credentials.');
  }
}

async function loadComments() {
  try {
    state.comments = (await api.getComments(state.threadId)) || [];
    showMain();
    renderAll();
  } catch (err) {
    console.error('[PageTalk] loadComments:', err);
    showError('Failed to fetch comments.');
  }
}

function renderAll() {
  const n = state.comments.length;
  document.getElementById('commentCount').textContent = `${n} ${n === 1 ? 'comment' : 'comments'}`;
  const container  = document.getElementById('commentsContainer');
  const emptyState = document.getElementById('emptyState');
  container.innerHTML = '';
  const roots = buildTree(sortedTopLevel());
  if (roots.length === 0) { emptyState.classList.remove('hidden'); }
  else { emptyState.classList.add('hidden'); roots.forEach(n => renderNode(n, container)); }
}

function buildTree(sorted) {
  const byId = {};
  state.comments.forEach(c => { byId[c.id] = { ...c, children: [] }; });
  const roots = sorted.map(c => byId[c.id]);
  state.comments.filter(c => c.parent_id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .forEach(c => { if (byId[c.parent_id]) byId[c.parent_id].children.push(byId[c.id]); });
  return roots;
}

function sortedTopLevel() {
  const top = state.comments.filter(c => !c.parent_id);
  if (state.sortMode === 'new') return [...top].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (state.sortMode === 'top') return [...top].sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
  return [...top].sort((a, b) => hotScore(b.upvotes, b.downvotes, b.created_at) - hotScore(a.upvotes, a.downvotes, a.created_at));
}

function renderNode(node, container) {
  const el = createCommentEl(node);
  container.appendChild(el);
  if (node.children && node.children.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'comment-children';
    node.children.forEach(child => renderNode(child, wrap));
    el.appendChild(wrap);
  }
}

function createCommentEl(c) {
  const score = c.upvotes - c.downvotes;
  const uv = state.userVotes[c.id] || null;
  const el = document.createElement('div');
  el.className = 'comment'; el.dataset.id = c.id;
  el.innerHTML = `
    <div class="comment-inner">
      <div class="comment-meta">
        <span class="author${c.author_id === state.userId ? ' is-self' : ''}">${escapeHtml(c.author_name)}</span>
        <span class="time">${timeAgo(c.created_at)}</span>
      </div>
      <div class="comment-content">${escapeHtml(c.content)}</div>
      <div class="comment-actions">
        <button class="vote-btn upvote${uv === 'up' ? ' active' : ''}" data-id="${c.id}" data-type="up" title="Upvote"><span class="vote-arrow">&#9650;</span></button>
        <span class="score${score > 0 ? ' positive' : score < 0 ? ' negative' : ''}">${score}</span>
        <button class="vote-btn downvote${uv === 'down' ? ' active' : ''}" data-id="${c.id}" data-type="down" title="Downvote"><span class="vote-arrow">&#9660;</span></button>
        ${c.depth < 6 ? `<button class="reply-btn" data-id="${c.id}">Reply</button>` : ''}
      </div>
      <div class="reply-composer hidden" id="reply-${c.id}">
        <textarea class="reply-input" placeholder="Write a reply&#8230;" rows="2" maxlength="5000"></textarea>
        <div class="reply-actions">
          <button class="cancel-reply-btn" data-id="${c.id}">Cancel</button>
          <button class="submit-reply-btn btn-primary" data-id="${c.id}" data-depth="${c.depth + 1}">Reply</button>
        </div>
      </div>
    </div>`;
  return el;
}

function bindStaticEvents() {
  document.getElementById('settingsBtn').addEventListener('click', () => {
    const p = document.getElementById('settingsPanel');
    const opening = p.classList.contains('hidden');
    p.classList.toggle('hidden');
    if (opening) { document.getElementById('displayNameInput').value = state.displayName; document.getElementById('displayNameInput').focus(); }
  });
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('displayNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') saveSettings(); });

  document.querySelectorAll('.sort-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); state.sortMode = btn.dataset.sort; renderAll();
  }));

  const ci = document.getElementById('commentInput');
  ci.addEventListener('input', () => { document.getElementById('charCount').textContent = `${ci.value.length} / 5000`; });
  ci.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitComment(ci.value.trim(), null, 0); });
  document.getElementById('submitComment').addEventListener('click', () => submitComment(ci.value.trim(), null, 0));
  document.getElementById('retryBtn').addEventListener('click', () => { showLoading(); loadThread(); });
  document.getElementById('commentsContainer').addEventListener('click', handleCommentClick);
}

async function handleCommentClick(e) {
  const voteBtn = e.target.closest('.vote-btn');
  if (voteBtn) { await handleVote(voteBtn.dataset.id, voteBtn.dataset.type); return; }
  const replyBtn = e.target.closest('.reply-btn');
  if (replyBtn) {
    const comp = document.getElementById(`reply-${replyBtn.dataset.id}`);
    comp.classList.toggle('hidden');
    if (!comp.classList.contains('hidden')) comp.querySelector('.reply-input').focus();
    return;
  }
  const cancelBtn = e.target.closest('.cancel-reply-btn');
  if (cancelBtn) { document.getElementById(`reply-${cancelBtn.dataset.id}`).classList.add('hidden'); return; }
  const submitBtn = e.target.closest('.submit-reply-btn');
  if (submitBtn) {
    const pid = submitBtn.dataset.id;
    const ta = document.getElementById(`reply-${pid}`).querySelector('.reply-input');
    await submitComment(ta.value.trim(), pid, parseInt(submitBtn.dataset.depth, 10));
    document.getElementById(`reply-${pid}`).classList.add('hidden');
  }
}

async function submitComment(content, parentId, depth) {
  if (!content) return;
  const btn = parentId ? document.querySelector(`.submit-reply-btn[data-id="${parentId}"]`) : document.getElementById('submitComment');
  if (btn) btn.disabled = true;
  try {
    await api.createComment({ threadId: state.threadId, content, parentId, depth, authorId: state.userId, authorName: state.displayName });
    if (parentId) { const ta = document.getElementById(`reply-${parentId}`)?.querySelector('.reply-input'); if (ta) ta.value = ''; }
    else { document.getElementById('commentInput').value = ''; document.getElementById('charCount').textContent = '0 / 5000'; }
    await loadComments();
  } catch (err) { console.error('[PageTalk] submitComment:', err); alert('Failed to post comment. Please try again.'); }
  finally { if (btn) btn.disabled = false; }
}

async function handleVote(commentId, voteType) {
  const prev = state.userVotes[commentId];
  if (prev === voteType) delete state.userVotes[commentId]; else state.userVotes[commentId] = voteType;
  await chrome.storage.local.set({ userVotes: state.userVotes });
  try { await api.vote(commentId, state.userId, voteType); await loadComments(); }
  catch (err) {
    console.error('[PageTalk] vote:', err);
    if (prev) state.userVotes[commentId] = prev; else delete state.userVotes[commentId];
    await chrome.storage.local.set({ userVotes: state.userVotes });
  }
}

async function saveSettings() {
  const newName = document.getElementById('displayNameInput').value.trim() || 'Anonymous';
  state.displayName = newName;
  await chrome.storage.local.set({ displayName: newName });
  document.getElementById('settingsPanel').classList.add('hidden');
  if (api) {
    try { await api.updateAuthorName(state.userId, newName); if (state.comments.length > 0) await loadComments(); }
    catch (err) { console.warn('[PageTalk] backfill name:', err); }
  }
}

function showLoading() { document.getElementById('loading').classList.remove('hidden'); document.getElementById('errorState').classList.add('hidden'); document.getElementById('mainContent').classList.add('hidden'); document.getElementById('threadInfo').classList.add('hidden'); }
function showError(msg) { document.getElementById('loading').classList.add('hidden'); document.getElementById('mainContent').classList.add('hidden'); document.getElementById('threadInfo').classList.add('hidden'); document.getElementById('errorMessage').textContent = msg; document.getElementById('errorState').classList.remove('hidden'); }
function showMain() { document.getElementById('loading').classList.add('hidden'); document.getElementById('errorState').classList.add('hidden'); document.getElementById('threadInfo').classList.remove('hidden'); document.getElementById('mainContent').classList.remove('hidden'); }
