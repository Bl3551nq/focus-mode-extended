// Run with: node generate-keys.js [count]
// Generates valid Focus Mode Extended license keys

function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I
  let key = '';
  
  // Keep generating until checksum passes (sum of charCodes % 17 === 0)
  while (true) {
    let attempt = '';
    for (let i = 0; i < 16; i++) {
      attempt += chars[Math.floor(Math.random() * chars.length)];
    }
    const sum = attempt.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    if (sum % 17 === 0) {
      // Format as XXXX-XXXX-XXXX-XXXX
      key = attempt.match(/.{4}/g).join('-');
      break;
    }
  }
  return key;
}

const count = parseInt(process.argv[2]) || 10;
console.log(`\nFocus Mode Extended — License Keys (${count} generated)\n`);
console.log('=' .repeat(50));
for (let i = 0; i < count; i++) {
  console.log(`  ${String(i+1).padStart(2,'0')}.  ${generateKey()}`);
}
console.log('=' .repeat(50));
console.log('\nSend one key per buyer via Gumroad receipt email.\n');
