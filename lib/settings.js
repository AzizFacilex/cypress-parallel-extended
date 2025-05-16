import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Debug raw arguments
console.log('Raw process.argv:', process.argv);
console.log('After hideBin:', hideBin(process.argv));

// Try parsing arguments without hideBin first to see if it works better
let argv;
try {
  // Traditional approach with hideBin
  argv = yargs(hideBin(process.argv))
    .parserConfiguration({ 'duplicate-arguments-array': false })
    .option('script', {
      alias: 's',
      type: 'string',
      description: 'Your npm Cypress command',
    })
    .option('threads', {
      alias: 't',
      type: 'number',
      description: 'Number of threads',
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Execute with verbose logging',
    })
    .option('bail', {
      alias: 'b',
      type: 'boolean',
      description: 'Exit on first suite finishing with errors',
    })
    .option('specsDir', {
      alias: 'd',
      type: 'string',
      description: 'Cypress specs directory',
    })
    .option('spec', {
      type: 'array',
      description: 'List of Cypress spec paths',
    })
    .option('args', {
      alias: 'a',
      type: 'string',
      description: 'Your npm Cypress command arguments',
    })
    .option('reporter', {
      alias: 'r',
      type: 'string',
      description: 'Reporter to pass to Cypress',
    })
    .option('reporterModulePath', {
      alias: 'n',
      type: 'string',
      description: 'Reporter module path',
    })
    .option('reporterOptions', {
      alias: 'o',
      type: 'string',
      description: 'Reporter options',
    })
    .option('reporterOptionsPath', {
      alias: 'p',
      type: 'string',
      description: 'Reporter options path',
    })
    .option('strictMode', {
      alias: 'm',
      type: 'boolean',
      default: true,
      description: 'Strict mode checks',
    })
    .option('runnerResults', {
      alias: 'x',
      type: 'string',
      description: 'Path where cypress results will be located',
    })
    .option('weightsJson', {
      alias: 'w',
      type: 'string',
      description: 'Parallel weights json file',
    }).argv;

  console.log('Parsed arguments:', argv);
} catch (error) {
  console.error('E F0.15h hideBin:', error);
  // Fallback to parsing without hideBin if there was an error
  try {
    argv = yargs(process.argv.slice(2))
      .parserConfiguration({ 'duplicate-arguments-array': false })
      // Same options as above...
      .option('script', { alias: 's', type: 'string' })
      .option('threads', { alias: 't', type: 'number' })
      .option('verbose', { alias: 'v', type: 'boolean' })
      .option('bail', { alias: 'b', type: 'boolean' })
      .option('specsDir', { alias: 'd', type: 'string' })
      .option('spec', { type: 'array' })
      .option('args', { alias: 'a', type: 'string' })
      .option('reporter', { alias: 'r', type: 'string' })
      .option('reporterModulePath', { alias: 'n', type: 'string' })
      .option('reporterOptions', { alias: 'o', type: 'string' })
      .option('reporterOptionsPath', { alias: 'p', type: 'string' })
      .option('strictMode', { alias: 'm', type: 'boolean', default: true })
      .option('runnerResults', { alias: 'x', type: 'string' })
      .option('weightsJson', { alias: 'w', type: 'string' })
      .argv;

    console.log('Parsed arguments (fallback):', argv);
  } catch (error2) {
    console.error('Error parsing arguments without hideBin:', error2);
    // Provide default values if all parsing fails
    argv = {
      script: 'cypress:run',
      threads: 2,
      specsDir: 'cypress/integration',
      verbose: true
    };
  }
}

if (!argv.script) {
  console.error('No script specified. Expected command, e.g.: cypress-parallel <cypress-script>');
  console.error('Args received:', process.argv);
  throw new Error('Expected command, e.g.: cypress-parallel <cypress-script>');
}

// Debug the specific values we care about
console.log('Parsed values:');
console.log('- Script:', argv.script);
console.log('- Threads:', argv.threads);
console.log('- SpecsDir:', argv.specsDir);
console.log('- RunnerResults:', argv.runnerResults);

const COLORS = [
  '\x1b[32m',
  '\x1b[36m',
  '\x1b[29m',
  '\x1b[33m',
  '\x1b[37m',
  '\x1b[38m',
  '\x1b[39m',
  '\x1b[40m',
];

const settings = {
  threadCount: Math.max(1, argv.threads || 2),
  testSuitesPath: argv.specsDir || 'cypress/integration',
  testSuitesPaths: argv.spec || undefined,
  shouldBail: argv.bail || false,
  isVerbose: argv.verbose || false,
  weightsJSON: argv.weightsJson || 'cypress/parallel-weights.json',
  defaultWeight: 1,
  reporter: argv.reporter,
  reporterModulePath: argv.reporterModulePath || 'cypress-multi-reporters',
  reporterOptions: argv.reporterOptions,
  reporterOptionsPath: argv.reporterOptionsPath,
  script: argv.script,
  strictMode: argv.strictMode,
  scriptArguments: argv.args ? argv.args.split(' ') : [],
  runnerResults: argv.runnerResults || 'runner-results',
};

// Debug the final settings
console.log('Final settings:', JSON.stringify(settings, null, 2));

process.env.CY_PARALLEL_SETTINGS = JSON.stringify(settings);

export { COLORS, settings };

