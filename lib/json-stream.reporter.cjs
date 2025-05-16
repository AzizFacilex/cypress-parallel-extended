'use strict';
const Base = require('mocha/lib/reporters/base');
const constants = require('mocha/lib/runner').constants;
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const { EVENT_TEST_PASS, EVENT_TEST_FAIL, EVENT_TEST_PENDING, EVENT_RUN_END } = constants;

/**
 * Thread-safe, robust JSON reporter for Cypress parallel runs
 * Uses one result file per thread with atomic append operations
 */
function JSONStreamCustom(runner, options) {
  Base.call(this, runner, options);

  const self = this;
  const resultsPath = options.reporterOptions?.reportDir || 'runner-results';
  
  // Use thread ID for isolation
  const threadId = process.env.CYPRESS_THREAD || '0';
  const resultsFileName = `thread-${threadId}-results.jsonl`;
  const resultsFilePath = path.join(resultsPath, resultsFileName);
  const completionMarker = path.join(resultsPath, `thread-${threadId}-complete`);
  
  // Track test results for this specific file
  const currentFile = runner.suite?.file || '';
  let passCount = 0;
  let failCount = 0;
  let pendingCount = 0;
  let specStartTime = Date.now();
  
  // Simple operation to write a single line to a file atomically
  // This ensures we never get partial writes
  async function appendLineToResultFile(line) {
    // We use append mode which is atomic for single writes
    try {
      await fsp.mkdir(resultsPath, { recursive: true });
      await fsp.appendFile(resultsFilePath, line + '\n', { encoding: 'utf8' });
    } catch (err) {
      console.error(`[JSONStreamReporter] Error appending to result file:`, err);
    }
  }

  // Events to track test outcomes
  runner.on(EVENT_TEST_PASS, () => {
    passCount++;
  });
  
  runner.on(EVENT_TEST_FAIL, () => {
    failCount++;
  });
  
  runner.on(EVENT_TEST_PENDING, () => {
    pendingCount++;
  });
  
  // Write results at the end of each spec
  runner.on(EVENT_RUN_END, async () => {
    try {
      if (!currentFile) {
        console.warn("[JSONStreamReporter] No file associated with this run");
        return;
      }

      // Normalize the path to handle tmp directories
      const normalizedFile = currentFile.replace(/cypress\/e2e\/tmp\.[^/]+\//, 'cypress/e2e/');
      
      // Create a result record for this spec file
      const specResult = {
        file: normalizedFile,
        passes: passCount,
        failures: failCount,
        pending: pendingCount,
        duration: Date.now() - specStartTime,
        timestamp: new Date().toISOString()
      };

      // Write as a single line (atomic operation)
      await appendLineToResultFile(JSON.stringify(specResult));
      
      // After all tests are complete, write a completion marker
      // This is used to indicate this thread is fully done
      await fsp.writeFile(completionMarker, '', { encoding: 'utf8' });
      
      console.log(`[JSONStreamReporter] Results written for: ${normalizedFile}`);
    } catch (err) {
      console.error('[JSONStreamReporter] Failed to write results:', err);
    }
  });
}

// Add description for the reporter
JSONStreamCustom.description = 'Thread-safe JSON reporter using atomic operations';

module.exports = JSONStreamCustom;