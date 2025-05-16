const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

const { settings } = require('./settings');

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
  return fileList;
}

function getMaxPathLenghtFrom(testSuitePaths) {
  return Math.max(...testSuitePaths.map((p) => p.length), 10) + 3;
}

function distributeTestsByWeight(testSuitePaths) {
  let specWeights = {};
  try {
    specWeights = JSON.parse(fs.readFileSync(settings.weightsJSON, 'utf8'));
  } catch {
    console.warn(`Weight file not found: ${settings.weightsJSON}`);
  }

  const sortedTests = testSuitePaths
    .map((file) => ({
      file,
      weight: specWeights[file]?.weight || settings.defaultWeight,
    }))
    .sort((a, b) => b.weight - a.weight);

  const threads = Array.from({ length: settings.threadCount }, () => ({
    weight: 0,
    list: [],
  }));

  sortedTests.forEach(({ file, weight }) => {
    const thread = threads.reduce((min, curr) =>
      curr.weight < min.weight ? curr : min
    );
    thread.list.push(file);
    thread.weight += weight;
  });

  return threads.sort((a, b) => b.weight - a.weight);
}

module.exports = {
  getTestSuitePaths,
  distributeTestsByWeight,
  getMaxPathLenghtFrom,
};
