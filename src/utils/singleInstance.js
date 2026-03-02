import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';

const lockPath = join(process.cwd(), '.aura-rooms.lock');
let lockFd = null;

function isPidRunning(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function writePid(fd) {
    writeSync(fd, String(process.pid));
}

function tryAcquireFreshLock() {
    const fd = openSync(lockPath, 'wx');
    writePid(fd);
    lockFd = fd;
    return true;
}

export function acquireSingleInstance() {
    if (lockFd !== null) return true;

    try {
        return tryAcquireFreshLock();
    } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') {
            return false;
        }
    }

    try {
        const raw = readFileSync(lockPath, 'utf8').trim();
        const stalePid = Number(raw);
        if (!isPidRunning(stalePid)) {
            unlinkSync(lockPath);
            return tryAcquireFreshLock();
        }
    } catch {
        return false;
    }

    return false;
}

export function releaseSingleInstance() {
    if (lockFd !== null) {
        try {
            closeSync(lockFd);
        } catch {
            void 0;
        }
        lockFd = null;
    }

    try {
        unlinkSync(lockPath);
    } catch {
        void 0;
    }
}
