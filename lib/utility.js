import fs from 'fs';
import path from 'path';
import { settings } from './settings.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatTime = function (timeMs) {
  const seconds = Math.ceil(timeMs / 1000);
  const sec = seconds % 60;
  const min = Math.floor(seconds / 60);
  let res = '';

  if (min) res += `${min}m `;
  res += `${sec}s`;
  return res;
};

function generateWeightsFile(specWeights, totalDuration, totalWeight) {
  Object.keys(specWeights).forEach((spec) => {
    specWeights[spec].weight = Math.floor(
      (specWeights[spec].time / totalDuration) * totalWeight
    );
  });
  const weightsJson = JSON.stringify(specWeights);
  try {
    fs.writeFileSync(`${settings.weightsJSON}`, weightsJson, 'utf8');
    console.log('Weights file generated.')
  } catch(e) {
    console.error(e)
  }
}

async function collectResults() {
  const resultsPath = settings.runnerResults;
  const results = new Map();

  try {
    // Create the directory if it doesn't exist
    try {
      await fs.promises.access(resultsPath);
    } catch {
      console.log(`Results directory doesn't exist, no results to collect.`);
      return results;
    }
    
    // Check for thread completion markers
    const allFiles = await fs.promises.readdir(resultsPath);
    const resultFiles = allFiles.filter(f => f.startsWith('thread-') && f.endsWith('-results.jsonl'));
    const completionMarkers = allFiles.filter(f => f.startsWith('thread-') && f.endsWith('-complete'));
    
    // Verify all threads completed - this is a safety check
    const expectedThreads = new Set(resultFiles.map(f => f.match(/thread-(\d+)-results/)[1]));
    const completedThreads = new Set(completionMarkers.map(f => f.match(/thread-(\d+)-complete/)[1]));
    
    if (expectedThreads.size > completedThreads.size) {
      const missingThreads = [...expectedThreads].filter(t => !completedThreads.has(t));
      console.warn(`Some threads didn't complete properly: ${missingThreads.join(', ')}`);
      // Continue anyway - we'll use what we have
    }
    
    // Process each result file
    for (const resultFile of resultFiles) {
      try {
        const filePath = path.join(resultsPath, resultFile);
        const content = await fs.promises.readFile(filePath, 'utf8');
        
        // Each line is a valid JSON object representing one spec result
        const lines = content.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const result = JSON.parse(line);
            if (result && result.file) {
        results.set(result.file, result);
            }
          } catch (parseErr) {
            console.error(`Error parsing result line: ${line.substring(0, 50)}...`, parseErr);
          }
        }
      } catch (fileErr) {
        console.error(`Error processing result file ${resultFile}:`, fileErr);
      }
    }
    
    // Only delete after we've successfully read everything
    if (results.size > 0) {
      console.log(`Successfully collected results for ${results.size} spec files.`);
      
      // Cleanup all files in the results directory
      for (const file of allFiles) {
        try {
          await fs.promises.unlink(path.join(resultsPath, file));
        } catch (err) {
          console.error(`Failed to delete ${file}:`, err);
        }
      }
      
      // Remove the directory itself
    try {
        await fs.promises.rmdir(resultsPath);
      } catch (err) {
        console.error(`Failed to remove results directory:`, err);
      }
    }
  } catch (err) {
    console.error(`Error collecting results:`, err);
    }

  return results;
  }

export { collectResults, formatTime, generateWeightsFile, sleep };

