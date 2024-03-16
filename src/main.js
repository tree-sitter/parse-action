import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import * as action from '@actions/core'
import { create as glob } from '@actions/glob'
import { getExecOutput as exec } from '@actions/exec'

const cwd = process.env.GITHUB_WORKSPACE ?? process.cwd();
const temp = process.env.RUNNER_TEMP ?? tmpdir();

/**
 * @param {string} patterns
 */
async function getFiles(patterns) {
  if (patterns.trim() == '') return [];
  const globber = await glob(patterns, { matchDirectories: false });
  return (await globber.glob()).map(path => action.toPosixPath(relative(cwd, path)));
}

const patternsFile = action.getInput('files-list') ?? join(temp, 'parser-files-list');
const invalidPatternsFile = action.getInput('invalid-files-list');

const ts = action.getInput('tree-sitter', { required: true });
const args = ['parse', '-q', '-t', '--paths', patternsFile];

const invalidFiles = new Set(await getFiles(action.getInput('invalid-files')));
if (existsSync(invalidPatternsFile)) {
  for (const file of await getFiles(readFileSync(invalidPatternsFile, 'utf8'))) {
    invalidFiles.add(file.trimEnd());
  }
}

appendFileSync(patternsFile, action.getMultilineInput('files', { required: true }).join('\n'));

action.startGroup('Parsing files');

const { stdout: output } = await exec(ts, args, { cwd, ignoreReturnCode: true });

let totalSuccess = 0, totalInvalid = 0;
const failures = new Set();

const matcher = /\((.+) \[(\d+), (\d+)\] - \[(\d+), (\d+)\]\)$/;

for (const line of output.trimEnd().split('\n')) {
  const result = line.trimEnd();
  const file = action.toPosixPath(result.split(' ', 1)[0]);
  if (invalidFiles.has(file)) {
    if (result.endsWith(')')) {
      action.info(result + ' [EXPECTED]');
      totalInvalid += 1;
    } else {
      action.warning(result, { file, title: 'INVALID' });
      totalSuccess += 1;
    }
  } else if (result.endsWith(')')) {
    const matches = result.match(matcher);
    const [_, title, row1, col1, row2, col2] = matches;
    failures.add(file);
    action.error(result, {
      file, title,
      startLine: parseInt(row1 ?? 0) + 1,
      startColumn: parseInt(col1 ?? 0) + 1,
      endLine: parseInt(row2 ?? 0) + 1,
      endColumn: parseInt(col2 ?? 0) + 1,
    });
  } else {
    totalSuccess += 1;
  }
}

action.endGroup();

const totalFiles = totalSuccess + totalInvalid + failures.size;

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
      { data: failures.size.toString() },
    ]
  ]);

action.setOutput('failures', failures.join('\n'));

if (failures.length > 0) {
  action.summary.addHeading('Failures', 3).addList(failures);
  action.setFailed(`Failed to parse ${failures.size}/${totalFiles - totalInvalid} files`);
}

await action.summary.write();
