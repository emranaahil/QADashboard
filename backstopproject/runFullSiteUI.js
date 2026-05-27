const { execSync } = require('child_process');
const { getSystemErrorMessage } = require('util');


try {
  const testUrl = process.argv[2];
  const referenceUrl = process.argv[3] || null;
if (referenceUrl == null || "undefined") {
  execSync(`node generateConfigFULLSITEUI.js "${testUrl}" `, { stdio: 'inherit' });
}
  else {
    execSync(`node generateConfigFULLSITEUI.js "${testUrl}" "${referenceUrl}" `, { stdio: 'inherit' });
  }
 
  execSync('npx backstop reference', { stdio: 'inherit' });

  try {
    execSync('npx backstop test', { stdio: 'inherit' });
    console.log("📄 Testing multiple pages...")
  } catch (e) {
    console.log('⚠️ Backstop test failed (expected), continuing...');
  }

  execSync('node generateReport.js', { stdio: 'inherit' });
  console.log("📊 Generating full site report...")
  console.log("✅ Full Site Test Completed")
} catch (e) {
  console.error('❌ Pipeline failed:', e.message);
  getSystemErrorMessage
}
process.exit(0)