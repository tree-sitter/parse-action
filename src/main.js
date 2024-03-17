import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
async function expand(patterns) {
  if (patterns.trim() == '') return [];
  const globber = await glob(patterns, { matchDirectories: false });
  return (await globber.glob()).map(path => action.toPosixPath(relative(cwd, path)));
}

/**
 * @param {string} listFile
 * @param {string} patterns
 */
async function getFiles(listFile, patterns) {
  const files = new Set(await expand(patterns));
  if (existsSync(listFile)) {
    const contents = readFileSync(listFile, 'utf8');
    for (const file of await expand(contents)) {
      files.add(file.trimEnd());
    }
  }
  return files;
}

const pathsFile = join(temp, 'parser-files-list');
const ts = action.getInput('tree-sitter', { required: true });
const args = ['parse', '-q', '-t', '--paths', pathsFile];

const patternsFile = action.getInput('files-list');
const patterns = action.getInput('files', { required: !patternsFile });
const files = await getFiles(patternsFile, patterns);
writeFileSync(pathsFile, Array.from(files).join('\n'));

const invalidFiles = await getFiles(
  action.getInput('invalid-files-list'),
  action.getInput('invalid-files')
);

action.startGroup('Parsing files');

const { stdout: output } = await exec(ts, args, {
  cwd, ignoreReturnCode: true, silent: true
});

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
    const startLine = parseInt(row1 ?? 0) + 1;
    const startColumn = parseInt(col1 ?? 0) + 1;
    const endLine = parseInt(row2 ?? 0) + 1;
    const endColumn = parseInt(col2 ?? 0) + 1;
    failures.add(file);
    action.error(result, {
      file, title, startLine, endLine,
      startColumn: startLine == endLine ? startColumn : undefined,
      endColumn: startLine == endLine ? endColumn : undefined,
    });
  } else {
    action.info(result);
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

if (failures.size > 0) {
  const failuresList = Array.from(failures);
  action.setOutput('failures', failuresList.join('\n'));
  action.summary.addHeading('Failures', 3).addList(failuresList);
  action.setFailed(`Failed to parse ${failures.size}/${totalFiles - totalInvalid} files`);
}

await action.summary.write();
