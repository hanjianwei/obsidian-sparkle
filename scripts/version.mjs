import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const root = new URL('../', import.meta.url);
const readJson = (name) =>
	JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const writeJson = (name, value) =>
	writeFileSync(new URL(name, root), `${JSON.stringify(value, null, '\t')}\n`);

function requireVersion(value, name) {
	if (
		typeof value !== 'string' ||
		!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(value)
	) {
		throw new Error(
			`${name} must be a version like 0.1.0, without a v prefix or prerelease suffix.`,
		);
	}
}

try {
	const [command, tag, ...extra] = process.argv.slice(2);
	if (
		!['sync', 'check'].includes(command) ||
		extra.length ||
		(command === 'sync' && tag !== undefined)
	) {
		throw new Error('Usage: node scripts/version.mjs sync | check [tag]');
	}
	const pkg = readJson('package.json');
	const lock = readJson('package-lock.json');
	const manifest = readJson('manifest.json');
	const versions = readJson('versions.json');
	requireVersion(pkg.version, 'package.json version');
	requireVersion(manifest.minAppVersion, 'manifest.json minAppVersion');
	if (
		lock.version !== pkg.version ||
		lock.packages?.['']?.version !== pkg.version
	) {
		throw new Error(
			'package-lock.json version must match package.json. Set versions with npm version.',
		);
	}
	if (command === 'sync') {
		manifest.version = pkg.version;
		versions[pkg.version] = manifest.minAppVersion;
		writeJson('manifest.json', manifest);
		writeJson('versions.json', versions);
	} else {
		if (manifest.version !== pkg.version) {
			throw new Error('manifest.json version must match package.json.');
		}
		if (versions[pkg.version] !== manifest.minAppVersion) {
			throw new Error(
				'versions.json must map the current version to manifest.json minAppVersion.',
			);
		}
		if (tag && tag !== pkg.version) {
			throw new Error(
				`Release tag ${tag} must match version ${pkg.version}, without a v prefix.`,
			);
		}
	}
	console.log(
		`Version metadata ${command === 'sync' ? 'updated' : 'verified'}: ${pkg.version}`,
	);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
