/*
 * Copyright 2023 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs-extra';
import * as pulumi from '@pulumi/pulumi';
import inquirer from 'inquirer';

import { OptionValues } from 'commander';
import { AWSProgram } from './programs/aws';
import { findPaths } from '@backstage/cli-common';
import { Task } from './lib/tasks';
import { basename, resolve } from 'path';
import { buildApp } from './lib/build';

// eslint-disable-next-line no-restricted-syntax
const paths = findPaths(__dirname);

const createFile = async (fileName: string) => {
  const BASE_PATH_OF_DEV_FILES = 'templates/pulumi';
  await Task.forItem('creating', fileName, async () => {
    const content = await fs.readFile(
      paths.resolveOwn(`${BASE_PATH_OF_DEV_FILES}/${fileName}`),
      { encoding: 'utf8' },
    );
    const destination = `${paths.targetRoot}/${basename(fileName)}`;
    await fs.writeFile(destination, content).catch(error => {
      throw new Error(`Failed to create file: ${error.message}`);
    });
  });
};

export default async (opts: OptionValues) => {
  if (!fs.existsSync(resolve('./Pulumi.yaml'))) {
    const pulumiFileName = 'Pulumi.yaml';
    Task.section(`Preparing ${pulumiFileName}`);
    await createFile(pulumiFileName);
  }

  if (opts.createDockerfile) {
    if (fs.existsSync(opts.dockerfile)) {
      throw new Error(
        `There already is a Dockerfile in the specfied path: ${opts.dockerfile}`,
      );
    }
    Task.section('Preparing docker files');
    const dockerFiles = ['Dockerfile', '.dockerignore'];
    for (const file of dockerFiles) {
      await createFile(file);
    }
  }

  const shouldBuildApp = !opts.skipBuild && !opts.destroy;
  if (shouldBuildApp) {
    // run yarn tsc & yarn build for Dockerfile
    Task.section(`Building app`);
    await buildApp();
  }

  const args = {
    stackName: opts.stack,
    projectName: opts.stack,
    program: AWSProgram(opts),
    workDir: paths.targetRoot,
  };

  const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
    args,
  );

  Task.log('Starting Pulumi');
  Task.log('successfully initialized stack');
  Task.log('installing aws plugin...');
  await stack.workspace.installPlugin('aws', 'v4.0.0');
  Task.log('plugins installed');
  Task.log('setting up config');
  await stack.setConfig('aws:region', { value: opts.region });
  Task.log('refreshing stack...');
  await stack.refresh({ onOutput: Task.log });
  Task.log('refresh complete');

  if (opts.destroy) {
    const answer = await inquirer.prompt({
      type: 'confirm',
      name: 'result',
      message: `You are about to delete all the resources from ${opts.stack}, are you sure you want to continue`,
    });
    if (answer.result) {
      Task.log(`Destroying ${opts.stack} stack`);
      await stack.destroy({ onOutput: Task.log });
      Task.log('Destroy process complete');
    } else {
      Task.log('Destroy process cancelled');
    }
    return;
  }

  Task.log(`updating stack...`);

  const upRes = await stack.up({ onOutput: Task.log });
  Task.log(
    `update summary: \n${JSON.stringify(
      upRes.summary.resourceChanges,
      null,
      4,
    )}`,
  );
};
