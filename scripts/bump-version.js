const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

function bumpPatch(version) {
  const parts = String(version).trim().split('.');
  if (parts.length < 3) {
    throw new Error(`Invalid semver: ${version}`);
  }
  const patch = Number.parseInt(parts[2], 10);
  if (Number.isNaN(patch)) {
    throw new Error(`Invalid patch segment: ${parts[2]}`);
  }
  parts[2] = String(patch + 1);
  return parts.join('.');
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const nextVersion = bumpPatch(pkg.version);
pkg.version = nextVersion;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = nextVersion;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = nextVersion;
  }
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

console.log(`Version bumped to ${nextVersion}`);
