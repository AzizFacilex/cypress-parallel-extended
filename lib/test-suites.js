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

    let fileList = [];
    if (settings.testSuitesPaths) {
      fileList = settings.testSuitesPaths;
    } else if (isPattern) {
      console.log(`Using pattern ${settings.testSuitesPath} to find test suites`);
      fileList = await glob(settings.testSuitesPath, { ignore: 'node_modules/**' });
    } else {
      console.log(`Looking for test files in directory: ${settings.testSuitesPath}`);
      // Check if directory exists
      try {
        await fs.access(settings.testSuitesPath);
        fileList = await getFilePathsByPath(settings.testSuitesPath);
      } catch (err) {
        console.error(`Directory not found: ${settings.testSuitesPath}`);
        console.error(`Error details: ${err.message}`);
        fileList = [];
      }
    }

    // Ensure fileList is always an array
    fileList = Array.isArray(fileList) ? fileList : [];
    
    console.log(`${fileList.length} test suite(s) found.`);
    if (settings.isVerbose) {
      console.log('Paths to found suites:', fileList);
      console.log('Test directory/pattern used:', settings.testSuitesPath);
    }

    if (fileList.length === 0) {
      console.error(`WARNING: No test files found in ${settings.testSuitesPath}`);
      console.error('Please check that the directory exists and contains test files.');
    }

    // Ensure threadCount is always at least 1
    settings.threadCount = Math.max(1, Math.min(settings.threadCount, Math.max(1, fileList.length)));
    console.log(`Thread count set to: ${settings.threadCount}`);
    
    return fileList;
  } catch (error) {
    console.error('Error while retrieving test suite paths:', error);
    console.error('Stack trace:', error.stack);
    return [];
  }
}

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
  // Handle empty testSuitePaths
  if (!testSuitePaths || testSuitePaths.length === 0) {
    console.log('No test suites to distribute.');
    return [{
      weight: 0,
      list: []
    }];
  }

  let specWeights = {};
  
  try {
    const weightFile = await fs.readFile(settings.weightsJSON, 'utf8');
    specWeights = JSON.parse(weightFile);
    console.log(`Loaded weights from ${settings.weightsJSON}`);
  } catch (error) {
    console.warn(`Weight file not found: ${settings.weightsJSON}. Using line count as weight.`);
    if (settings.isVerbose) {
      console.error(`Weight file error details: ${error.message}`);
    }
  }

  const sortedTests = await Promise.all(
    testSuitePaths.map(async (file) => {
      const weight = specWeights[file]?.weight || await getFileLineCount(file);
      return {
        file,
        weight: isNaN(weight) ? 1 : weight // Handle NaN weights
      };
    })
  );

  sortedTests.sort((a, b) => b.weight - a.weight);

  // Ensure threadCount is at least 1 and is a number
  const threadCount = Math.max(1, settings.threadCount || 1);
  console.log(`Creating ${threadCount} thread(s) for test execution`);
  
  const threads = Array.from({ length: threadCount }, () => ({
    weight: 0,
    list: []
  }));

  // Double-check threads array is populated
  if (!threads.length) {
    console.error('Failed to create threads array. Using fallback of 1 thread.');
    threads.push({
      weight: 0,
      list: []
    });
  }

  sortedTests.forEach(({ file, weight }) => {
    const thread = threads[0];
    thread.list.push(file);
    thread.weight += weight;
    threads.sort((a, b) => a.weight - b.weight);
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
