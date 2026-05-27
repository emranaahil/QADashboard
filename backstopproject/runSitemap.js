const { execSync } = require('child_process');

try {
  const testUrl = process.argv[2];
  execSync(`node generateSitemapConfig.js "${testUrl}" `, { stdio: 'inherit' });
  execSync('npx backstop reference', { stdio: 'inherit' });

  try {
    execSync('npx backstop test', { stdio: 'inherit' });
  } catch (e) {
    console.log('⚠️ Backstop test failed (expected), continuing...');
  }

  execSync('node generateReport.js', { stdio: 'inherit' });

} catch (e) {
  console.error('❌ Sitemap Pipeline failed:', e.message);
}
