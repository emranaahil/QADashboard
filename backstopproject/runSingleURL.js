const { execSync } = require('child_process');
const { getSystemErrorMessage } = require('util');


try {
  const testUrl = process.argv[2];
  execSync(`node generateSingleURL.js "${testUrl}" `, { stdio: 'inherit' });
  execSync('npx backstop reference', { stdio: 'inherit' });

  try {
    execSync('npx backstop test', { stdio: 'inherit' });
  } catch (e) {
    console.log('⚠️ Backstop test failed (expected), continuing...');
  }

  execSync('node generateReport.js', { stdio: 'inherit' });

} catch (e) {
  console.error('❌ Pipeline failed:', e.message);
  getSystemErrorMessage
}