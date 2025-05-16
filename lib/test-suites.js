import { promises as fs } from 'fs';
import { glob } from 'glob';
import path from 'path';

import { settings } from './settings.js';

const getFilePathsByPath = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? getFilePathsByPath(fullPath) : fullPath;
    })
  );
  return files.flat();
};

async function getTestSuitePaths() {
  try {
    const isPattern = settings.testSuitesPath.includes('*');

    let fileList;
    if (settings.testSuitesPaths) {
      fileList = settings.testSuitesPaths;
    } else if (isPattern) {
      console.log(`Using pattern ${settings.testSuitesPath} to find test suites`);
      fileList = await glob(settings.testSuitesPath, { ignore: 'node_modules/**' });
    } else {
      console.log(
        'DEPRECATED: using path is deprecated and will be removed, switch to glob pattern'
      );
      fileList = getFilePathsByPath(settings.testSuitesPath);
    }

    console.log(`${fileList.length} test suite(s) found.`);
    if (settings.isVerbose) console.log('Paths to found suites:', fileList);

    settings.threadCount = Math.min(settings.threadCount, fileList.length);
    if (settings.threadCount < fileList.length) {
      console.warn(
        `Limiting thread count to ${settings.threadCount} due to fewer test suites.`
      );
    }
    return fileList;
  } catch (error) {
    console.error('Error while retrieving test suite paths:', error);
    throw error;
  }
};

function getMaxPathLenghtFrom(testSuitePaths) {
  return Math.max(...testSuitePaths.map((p) => p.length), 10) + 3;
}


async function getFileLineCount(filePath) {
  // Estimating weight by line count
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.split('\n').length;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return 0; 
  }
}

async function distributeTestsByWeight(testSuitePaths) {
  let specWeights = {};
  
  try {
    const weightFile = await fs.readFile(settings.weightsJSON, 'utf8');
    specWeights = JSON.parse(weightFile);
  } catch {
    console.warn(`Weight file not found: ${settings.weightsJSON}. Using line count as weight.`);
  }

  const sortedTests = await Promise.all(
    testSuitePaths.map(async (file) => {
      const weight = specWeights[file]?.weight || await getFileLineCount(file);
      return {
        file,
        weight
      };
    })
  );

  sortedTests.sort((a, b) => b.weight - a.weight);

  // Ensure threadCount is at least 1
  const threadCount = Math.max(1, settings.threadCount);
  console.log(`Creating ${threadCount} thread(s) for test execution`);
  
  const threads = Array.from({ length: threadCount }, () => ({
    weight: 0,
    list: []
  }));

  sortedTests.forEach(({ file, weight }) => {
    // Make sure threads array is not empty before accessing first element
    if (threads.length > 0) {
      const thread = threads[0];
      thread.list.push(file);
      thread.weight += weight;
      threads.sort((a, b) => a.weight - b.weight);
    } else {
      console.error('No threads available to distribute tests.');
    }
  });

  // Log each thread and its assigned files
  if (settings.isVerbose) {
    threads.forEach((thread, index) => {
      console.log(`Thread ${index + 1} assigned ${thread.list.length} files, weight: ${thread.weight}`);
    });
  }

  return threads.sort((a, b) => b.weight - a.weight);
}


export { distributeTestsByWeight, getMaxPathLenghtFrom, getTestSuitePaths };
