import { relative } from 'node:path';
import * as action from '@actions/core'
import { create as glob } from '@actions/glob'
import { getExecOutput as exec } from '@actions/exec'

const cwd = process.env.GITHUB_WORKSPACE ?? process.cwd();

/**
 * @param {string} input
 * @param {boolean} required
 */
async function getFiles(input, required) {
  const patterns = action.getInput(input, { required });
  if (patterns.trim() == '') return [];
  const matcher = glob(patterns, { matchDirectories: false });
  return (await matcher.then(g => g.glob())).map(f => relative(cwd, f));
}

const ts = action.getInput('tree-sitter', { required: true });

const allFiles = await getFiles('files', true);
const badFiles = await getFiles('invalid-files', false);

const successful = [], invalid = [], failures = [];

action.startGroup('Parsing files');

for (const file of allFiles) {
  const res = await exec(ts, ['parse', '-q', '-t', file], {
    cwd, silent: true, ignoreReturnCode: true
  });
  const summary = res.stdout.trimEnd();

  if (res.exitCode == 0) {
    successful.push(file);
    if (badFiles.includes(file)) {
      action.warning(summary + ' [INVALID]', { file, title: 'Invalid syntax' });
    } else {
      action.info(summary);
    }
  } else if (badFiles.includes(file)) {
    invalid.push(file);
    action.info(summary + ' [KNOWN]');
  } else {
    failures.push(file);
    action.error(summary, { file, title: 'Parsing error' });
  }
}

action.endGroup();

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
      { data: allFiles.length.toString() },
      { data: successful.length.toString() },
      { data: invalid.length.toString() },
      { data: failures.length.toString() },
    ]
  ]);

if (failures.length == 0) {
  action.setOutput('failures', '');
} else {
  action.summary.addHeading('Failures', 3);
  action.summary.addList(failures);
  action.setOutput('failures', failures.join('\n'));
  action.setFailed(`Failed to parse ${failures.length}/${allFiles.length} files`);
}

await action.summary.write();
