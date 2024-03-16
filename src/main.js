import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import * as action from '@actions/core'
import { create as glob } from '@actions/glob'
import { getExecOutput as exec } from '@actions/exec'

const cwd = process.env.GITHUB_WORKSPACE ?? process.cwd();

/**
 * @param {string} patterns
 */
async function getFiles(patterns) {
  if (patterns.trim() == '') return [];
  const globber = await glob(patterns, { matchDirectories: false });
  const absolutePaths = await globber.glob();
  return absolutePaths.map(path => relative(cwd, path))
}

const ts = action.getInput('tree-sitter', { required: true });

const filePatterns = action.getMultilineInput('files', { required: true });
const invalidFiles = await getFiles(action.getInput('invalid-files'));
const invalidPatternsFile = action.getInput('invalid-files-list');

if (invalidPatternsFile) {
  const invalidPatterns = await readFile(invalidPatternsFile, { encoding: 'utf8' });
  const invalidFilesListFiles = await getFiles(invalidPatterns);
  invalidFiles.push(...invalidFilesListFiles);
}

const invalidFilesSet = new Set(invalidFiles);

action.startGroup('Parsing files');

const res = await exec(ts, ['parse', '-q', '-t', ...filePatterns], {
  cwd, ignoreReturnCode: true
});

action.endGroup();

let totalSuccess = 0;
let totalInvalid = 0;
const failures = [];

action.startGroup('Summarizing results');

for (const outputLine of res.stdout.trim().split('\n')) {
  const result = outputLine.trim();
  if (result.endsWith(')')) {
    const [file] = result.split(' ', 1);
    const matches = result.match(/\[(\d+), \d+\] - \[(\d+), \d+\]\)$/);
    const startLine = parseInt(matches[1]) + 1;
    const endLine = parseInt(matches[2]) + 1;

    if (invalidFilesSet.has(file)) {
      action.warning(result, { title: 'Invalid syntax', file, startLine, endLine });
      totalInvalid += 1;
    } else {
      action.error(result, { title: 'Parsing error', file, startLine, endLine });
      failures.push(file);
    }
  } else {
    totalSuccess += 1;
  }
}

action.endGroup();

const totalFiles = totalSuccess + totalInvalid + failures.length;

action.summary
  .addHeading('Parsing results', 2)
  .addTable([
    [
      { data: 'Total files', header: true },
      { data: 'Successful', header: true },
      { data: 'Invalid syntax', header: true },
      { data: 'Parsing errors', header: true },
    ],
    [
      { data: totalFiles.toString() },
      { data: totalSuccess.toString() },
      { data: totalInvalid.toString() },
      { data: failures.length.toString() },
    ]
  ]);

action.setOutput('failures', failures.join('\n'));

if (failures.length > 0) {
  action.summary.addHeading('Failures', 3);
  action.summary.addList(failures);
  action.setFailed(`Failed to parse ${failures.length}/${totalFiles - totalInvalid} files`);
}

await action.summary.write();
