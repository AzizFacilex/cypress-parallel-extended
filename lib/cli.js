#!/usr/bin/env node

import colors from '@colors/colors/safe.js';
import Table from 'cli-table3';
import fs from 'fs-extra';
import path from 'path';
import { settings } from './settings.js';
import { resultsPath } from './shared-config.js';
import {
  distributeTestsByWeight,
  getMaxPathLenghtFrom,
  getTestSuitePaths
} from './test-suites.js';
import { executeThread } from './thread.js';
import { collectResults, formatTime, generateWeightsFile } from './utility.js';

async function cleanResultsPath() {
  try {
    const exists = await fs.pathExists(resultsPath);
    if (!exists) {
      await fs.mkdir(resultsPath, { recursive: true });
      return;
    }

    const files = await fs.readdir(resultsPath);
    await Promise.all(
      files.map((file) => fs.unlink(path.join(resultsPath, file)))
    );
  } catch (err) {
    console.error('Error cleaning results path:', err);
  }
}

function calculateStatistics(resultMaps) {
  const timeMap = new Map();
  resultMaps.forEach((m) => {
    for (const [name, test] of m) {
      timeMap.set(name, test);
    }
  });
  return timeMap;
}

function displayStatisticsTable(timeMap, testSuitePaths) {
  const table = new Table({
    head: ['Spec', 'Time', 'Tests', 'Passing', 'Failing', 'Pending'],
    style: { head: ['blue'] },
    colWidths: [getMaxPathLenghtFrom(testSuitePaths), 10, 10, 10, 10, 10]
  });

  let totals = {
    tests: 0,
    passes: 0,
    failures: 0,
    duration: 0,
    pending: 0
  };

  const specWeights = {};

  for (const [name, suite] of timeMap) {
    const nbTests = suite.passes + suite.pending + suite.failures;
    totals.duration += suite.duration;
    totals.tests += nbTests;
    totals.passes += suite.passes;
    totals.pending += suite.pending;
    totals.failures += suite.failures;

    specWeights[name] = { time: suite.duration, weight: 0 };

    table.push([
      name,
      `${formatTime(suite.duration)}`,
      nbTests,
      suite.passes > 0 ? colors.green(suite.passes) : suite.passes,
      suite.failures > 0 ? colors.red(suite.failures) : suite.failures,
      suite.pending
    ]);
  }

  table.push([
    'Results',
    `${formatTime(totals.duration)}`,
    totals.tests,
    totals.passes > 0 ? colors.green(totals.passes) : totals.passes,
    totals.failures > 0 ? colors.red(totals.failures) : totals.failures,
    totals.pending
  ]);

  console.log(table.toString());

  return { totals, specWeights };
}

function validateResults(timeMap, testSuitePaths) {
  if (settings.strictMode && timeMap.size !== testSuitePaths.length) {
    console.error(
      `Test suites found (${testSuitePaths.length}) do not match results (${timeMap.size}).`
    );
    const missingTestResults = testSuitePaths.filter(
      (path) => !timeMap.get(path)
    );
    console.log(
      `Missing results for the following test suites: ${missingTestResults}`
    );
    process.exit(1);
  }
}

function calculateTimeSaved(totalDuration, timeTaken) {
  const timeSaved = totalDuration - timeTaken;
  console.log(
    `Total run time: ${totalDuration / 1000}s, executed in: ${
      timeTaken / 1000
    }, saved ${timeSaved / 1000} (~${Math.round(
      (timeSaved / totalDuration) * 100
    )}%)`
  );
  return timeSaved;
}

function handleFailures(totalFailures) {
  if (totalFailures > 0) {
    process.stderr.write(`\x1b[31m${totalFailures} test failure(s)\n`);
    process.exit(1);
  }
}

async function start() {
  try {
    console.log('Cypress Parallel Extended starting...');
    console.log('Environment info:', {
      workingDirectory: process.cwd(),
      specsDir: settings.testSuitesPath,
      threadCount: settings.threadCount,
      scriptToRun: settings.script
    });
    
    await cleanResultsPath();

    const testSuitePaths = await getTestSuitePaths();
    
    if (!testSuitePaths || testSuitePaths.length === 0) {
      console.error('ERROR: No test suites found. Please check your configuration:');
      console.error(`- Directory/Pattern: ${settings.testSuitesPath}`);
      console.error('- The directory might not exist or might not contain test files');
      console.error('- Consider using a glob pattern instead (e.g. "$TMP_DIR/**/*.cy.js")');
      process.exit(1);
    }
    
    const threads = await distributeTestsByWeight(testSuitePaths);
    console.log(`Starting execution with ${threads.length} thread(s)`);
    
    const threadInfo = threads.map((thread, index) => ({
      threadNumber: index + 1,
      specCount: thread.list.length,
      specs: settings.isVerbose ? thread.list : undefined
    }));
    console.log('Thread distribution:', JSON.stringify(threadInfo, null, 2));

    if (threads.every(thread => thread.list.length === 0)) {
      console.error('WARNING: All threads have 0 test files. Nothing to run.');
      process.exit(0);
    }

    const start = new Date();
    await Promise.all(threads.map((thread, index) => {
      console.log(`Executing thread ${index + 1} with ${thread.list.length} spec(s)`);
      return executeThread(thread, index);
    }));
    const end = new Date();

    const timeTaken = end.getTime() - start.getTime();
    const resultMaps = await collectResults();
    const timeMap = calculateStatistics([resultMaps]);

    const { totals, specWeights } = displayStatisticsTable(
      timeMap,
      testSuitePaths
    );
    validateResults(timeMap, testSuitePaths);

    calculateTimeSaved(totals.duration, timeTaken);

    generateWeightsFile(specWeights, totals.duration, totals.tests * 10);
    handleFailures(totals.failures);
  } catch (error) {
    console.error('Fatal error occurred during execution:');
    console.error(error);
    console.error(error.stack);
    process.exit(1);
  }
}

start();
