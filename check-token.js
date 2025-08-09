// check-token.js
require('dotenv').config({ path: '.env', override: true });

const t = process.env.TOKEN?.trim();
console.log('DEBUG len:', t?.length || 0, 'parts:', t ? t.split('.').length : 0);

if (!t) {
  console.error('❌ No TOKEN in .env');
  process.exit(1);
}

(async () => {
  try {
    const r = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: 'Bot ' + t }
    });
    console.log('HTTP status:', r.status);
    const text = await r.text();
    console.log(text);
  } catch (e) {
    console.error('❌ Request failed:', e);
  }
})();
