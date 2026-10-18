process.chdir(__dirname);
process.argv = ['node', 'capacitor', 'add', 'android'];

const { run } = require('./node_modules/@capacitor/cli/dist/index.js');
run().then(() => {
  console.log('Capacitor add android concluido!');
}).catch(e => {
  console.error('ERRO:', e.message || e);
  process.exit(1);
});
