process.chdir(__dirname);
process.argv = ['node', 'capacitor', 'open', 'android'];

const { run } = require('@capacitor/cli/dist/index.js');
run().then(() => {
  console.log('Abrindo Android Studio...');
}).catch(e => {
  console.error('ERRO:', e.message || e);
  process.exit(1);
});
