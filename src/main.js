import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import * as action from '@actions/core';
import { create as glob } from '@actions/glob';
import { getExecOutput as exec } from '@actions/exec';

const cwd = process.env.GITHUB_WORKSPACE ?? process.cwd();
const temp = process.env.RUNNER_TEMP ?? tmpdir();
const os = process.env.RUNNER_OS ?? ({
  'linux': 'Linux',
  'darwin': 'macOS',
  'win32': 'Windows',
})[process.platform];

/**
 * @param {string} listFile
 * @param {string[]} patterns
 */
async function getFiles(listFile, patterns) {
  if (existsSync(listFile)) {
    const contents = readFileSync(listFile, 'utf8');
    for (const line of contents.split('\n')) {
      patterns.push(line.trimEnd());
    }
  }
  if (patterns.length == 0) return [];
  const globber = await glob(patterns.join('\n'), { matchDirectories: false });
  return (await globber.glob()).map(path => action.toPosixPath(relative(cwd, path)));
}

const pathsFile = join(temp, 'parser-files-list');
const args = ['parse', '-q', '-t', '--paths', pathsFile];

const patternsFile = action.getInput('files-list');
const patterns = action.getMultilineInput('files', { required: !patternsFile });
writeFileSync(pathsFile, (await getFiles(patternsFile, patterns)).join('\n'));

const invalidFiles = await getFiles(
  action.getInput('invalid-files-list'),
  action.getMultilineInput('invalid-files')
);

action.startGroup('Parsing files');

const { stdout: output } = await exec('tree-sitter', args, {
  cwd, ignoreReturnCode: true, silent: true
});

let totalSuccess = 0, totalInvalid = 0;
const failures = [];

const matcher = /\((.+) \[(\d+), (\d+)\] - \[(\d+), (\d+)\]\)$/;

for (const line of output.trimEnd().split('\n')) {
  const result = line.trimEnd();
  const file = action.toPosixPath(result.split(' ', 1)[0]);
  if (invalidFiles.includes(file)) {
    if (result.endsWith(')')) {
      action.info(result + ' [EXPECTED]');
      totalInvalid += 1;
    } else {
      action.warning(result, { file, title: `INVALID (${os})` });
      totalSuccess += 1;
    }
  } else if (result.endsWith(')')) {
    const matches = result.match(matcher);
    const [_, error, row1, col1, row2, col2] = matches;
    const title = `${error} (${os})`;
    const startLine = parseInt(row1) + 1;
    const startColumn = parseInt(col1) + 1;
    const endLine = parseInt(row2) + 1;
    const endColumn = parseInt(col2) + 1;
    failures.push(file);
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

if (failures.length > 0) {
  action.setOutput('failures', failures.join('\n'));
  action.summary.addHeading('Failures', 3).addList(failures);
  action.setFailed(`Failed to parse ${failures.length}/${totalFiles - totalInvalid} files`);
}

await action.summary.write();
