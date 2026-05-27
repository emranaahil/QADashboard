const { execSync } = require('child_process');
const { getSystemErrorMessage } = require('util');

try {
  execSync('node generate1urlConfig.js', { stdio: 'inherit' });
  execSync('npx backstop reference', { stdio: 'inherit' });

  try {
    execSync('npx backstop test', { stdio: 'inherit' });
  } catch (e) {
    console.log('⚠️ Backstop test failed (expected), continuing...');
  }

  execSync('node generateReportRef.js', { stdio: 'inherit' });

} catch (e) {
  console.error('❌ Pipeline failed:', e.message);
  getSystemErrorMessage
}
  