// PageTalk Service Worker
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.log('[PageTalk] Extension installed. Open config.js to add your Supabase credentials.');
  }
});
