import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';

const source = new URL('../', import.meta.url);
const readJson = (directory, file) =>
	JSON.parse(readFileSync(join(directory, file), 'utf8'));
const writeJson = (directory, file, value) =>
	writeFileSync(
		join(directory, file),
		`${JSON.stringify(value, null, '\t')}\n`,
	);

function fixture(t) {
	const directory = mkdtempSync(join(tmpdir(), 'sparkle-release-'));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	mkdirSync(join(directory, 'scripts'));
	for (const file of [
		'package.json',
		'package-lock.json',
		'manifest.json',
		'versions.json',
		'.npmrc',
		'scripts/version.mjs',
	]) {
		copyFileSync(new URL(file, source), join(directory, file));
	}
	const pkg = readJson(directory, 'package.json');
	const lock = readJson(directory, 'package-lock.json');
	const manifest = readJson(directory, 'manifest.json');
	pkg.version =
		lock.version =
		lock.packages[''].version =
		manifest.version =
			'1.2.3';
	writeJson(directory, 'package.json', pkg);
	writeJson(directory, 'package-lock.json', lock);
	writeJson(directory, 'manifest.json', manifest);
	writeJson(directory, 'versions.json', {
		'1.2.2': '1.12.0',
		'1.2.3': manifest.minAppVersion,
	});
	return directory;
}

function run(directory, command, args) {
	const result = spawnSync(command, args, {
		cwd: directory,
		encoding: 'utf8',
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: '/dev/null',
			GIT_CONFIG_NOSYSTEM: '1',
			npm_config_cache: join(directory, '.npm-cache'),
			npm_config_update_notifier: 'false',
		},
	});
	if (result.error) throw result.error;
	return result;
}

function success(result) {
	assert.equal(result.status, 0, result.stderr || result.stdout);
}

function check(directory, tag = '') {
	return run(directory, process.execPath, [
		'scripts/version.mjs',
		'check',
		tag,
	]);
}

test('matching metadata and an exact version tag are accepted', (t) => {
	const directory = fixture(t);
	success(check(directory));
	success(check(directory, '1.2.3'));
});

test('a mismatched tag or v prefix blocks a release', (t) => {
	const directory = fixture(t);
	for (const tag of ['1.2.4', 'v1.2.3']) {
		const result = check(directory, tag);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Release tag/);
	}
});

for (const [name, file, mutate] of [
	[
		'manifest version',
		'manifest.json',
		(value) => {
			value.version = '9.9.9';
		},
	],
	[
		'minimum app version',
		'versions.json',
		(value) => {
			value['1.2.3'] = '9.9.9';
		},
	],
	[
		'lockfile version',
		'package-lock.json',
		(value) => {
			value.version = '9.9.9';
		},
	],
	[
		'lockfile root package version',
		'package-lock.json',
		(value) => {
			value.packages[''].version = '9.9.9';
		},
	],
]) {
	test(`${name} drift blocks a release`, (t) => {
		const directory = fixture(t);
		const value = readJson(directory, file);
		mutate(value);
		writeJson(directory, file, value);
		assert.notEqual(check(directory, '1.2.3').status, 0);
	});
}

test('invalid or prerelease versions are rejected before synchronization', (t) => {
	const directory = fixture(t);
	const manifestBefore = readFileSync(join(directory, 'manifest.json'), 'utf8');
	for (const version of ['v1.2.3', '01.2.3', '1.2', '1.2.3-beta.1']) {
		const pkg = readJson(directory, 'package.json');
		pkg.version = version;
		writeJson(directory, 'package.json', pkg);
		const result = run(directory, process.execPath, [
			'scripts/version.mjs',
			'sync',
		]);
		assert.notEqual(result.status, 0);
		assert.equal(
			readFileSync(join(directory, 'manifest.json'), 'utf8'),
			manifestBefore,
		);
	}
});

test('npm version synchronizes metadata, preserves release history, and creates a bare version tag', (t) => {
	const directory = fixture(t);
	const manifest = readJson(directory, 'manifest.json');
	const initialMinimum = manifest.minAppVersion;
	manifest.minAppVersion = '2.0.0';
	writeJson(directory, 'manifest.json', manifest);
	writeFileSync(join(directory, '.gitignore'), '.npm-cache/\n');
	for (const args of [
		['init', '--quiet', '--initial-branch=main'],
		['config', 'user.name', 'Release Test'],
		['config', 'user.email', 'release-test@example.invalid'],
		['add', '.'],
		['commit', '--quiet', '--no-gpg-sign', '-m', 'Initial fixture'],
	])
		success(run(directory, 'git', args));
	success(
		run(directory, 'npm', [
			'version',
			'patch',
			'--commit-hooks=false',
			'--sign-git-tag=false',
		]),
	);
	for (const file of ['package.json', 'package-lock.json', 'manifest.json']) {
		assert.equal(readJson(directory, file).version, '1.2.4');
	}
	assert.equal(
		readJson(directory, 'package-lock.json').packages[''].version,
		'1.2.4',
	);
	assert.deepEqual(readJson(directory, 'versions.json'), {
		'1.2.2': '1.12.0',
		'1.2.3': initialMinimum,
		'1.2.4': '2.0.0',
	});
	assert.equal(run(directory, 'git', ['tag', '--list']).stdout.trim(), '1.2.4');
	assert.equal(run(directory, 'git', ['status', '--porcelain']).stdout, '');
	success(check(directory, '1.2.4'));
});
