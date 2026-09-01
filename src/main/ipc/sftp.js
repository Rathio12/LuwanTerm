'use strict';

const fs = require('fs');
const path = require('path');
const posix = path.posix;
const crypto = require('crypto');
const { BrowserWindow, dialog, shell } = require('electron');
const { handle } = require('./helpers');
const { TransferCancelled } = require('../ssh/sftp');
const { diffLines } = require('../diff');
const policy = require('../policy');
const audit = require('../audit');

const mainWindow = () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
const newTransferId = () => crypto.randomBytes(4).toString('hex');

function register(manager) {
  const sftpOf = (sessionId) => {
    if (!policy.allows('allowSftp')) throw new Error('File transfer is disabled by policy.');
    const session = manager.get(sessionId);
    if (!session.sftp) throw new Error('SFTP is not available on this session.');
    return session;
  };

  const reporter = (sessionId, transferId, name, direction) => (progress) => {
    manager.send('sftp:progress', { sessionId, transferId, name, direction, ...progress });
  };

  const settle = (sessionId, transferId, name, direction, extra = {}) => {
    manager.send('sftp:progress', { sessionId, transferId, name, direction, done: true, ...extra });
  };

  async function runTransfer(sessionId, transferId, name, direction, work) {
    const host = (manager.get(sessionId).profile || {}).host || '';
    try {
      const result = await work();
      settle(sessionId, transferId, name, direction);
      audit.record(`sftp.${direction}`, { sessionId, host, name });
      return result;
    } catch (err) {
      const cancelled = err instanceof TransferCancelled;
      settle(sessionId, transferId, name, direction, { cancelled });
      audit.record(`sftp.${direction}.${cancelled ? 'cancelled' : 'failed'}`, {
        sessionId, host, name, reason: cancelled ? 'cancelled' : err.message,
      });
      if (cancelled) return { cancelled: true };
      throw err;
    }
  }

  handle('sftp:home', async (sessionId) => sftpOf(sessionId).sftp.home());
  handle('sftp:list', async (sessionId, dir) => sftpOf(sessionId).sftp.list(dir));
  handle('sftp:mkdir', async (sessionId, dir) => sftpOf(sessionId).sftp.mkdir(dir));
  handle('sftp:remove', async (sessionId, target) => sftpOf(sessionId).sftp.remove(target));
  handle('sftp:chmod', async (sessionId, target, mode) => sftpOf(sessionId).sftp.chmod(target, mode));
  handle('sftp:cancel', async (sessionId, transferId) => sftpOf(sessionId).sftp.cancel(transferId));

  handle('sftp:rename', async (sessionId, from, to) => {
    const name = posix.basename(to);
    if (!name || name === '.' || name === '..' || name.includes('/')) {
      throw new Error('That name is not valid.');
    }
    return sftpOf(sessionId).sftp.rename(from, to);
  });

  handle('sftp:download', async (sessionId, remotePath, isDirectory) => {
    const session = sftpOf(sessionId);
    const name = posix.basename(remotePath);
    const transferId = newTransferId();

    if (isDirectory) {
      const picked = await dialog.showOpenDialog(mainWindow(), {
        title: `Download "${name}" into folder`,
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Download here',
      });
      if (picked.canceled) return null;

      const target = path.join(picked.filePaths[0], name);
      return runTransfer(sessionId, transferId, name, 'download', () =>
        session.sftp.downloadDirectory(
          transferId,
          remotePath,
          target,
          reporter(sessionId, transferId, name, 'download')
        )
      );
    }

    const saved = await dialog.showSaveDialog(mainWindow(), {
      title: 'Save file as',
      defaultPath: name,
    });
    if (saved.canceled) return null;

    return runTransfer(sessionId, transferId, name, 'download', () =>
      session.sftp.download(
        transferId,
        remotePath,
        saved.filePath,
        reporter(sessionId, transferId, name, 'download')
      )
    );
  });

  handle('sftp:upload', async (sessionId, remoteDir) => {
    const session = sftpOf(sessionId);
    const picked = await dialog.showOpenDialog(mainWindow(), {
      title: 'Upload to remote',
      properties: ['openFile', 'multiSelections'],
    });
    if (picked.canceled || !picked.filePaths.length) return null;

    const uploaded = [];
    for (const localPath of picked.filePaths) {
      const name = path.basename(localPath);
      const transferId = newTransferId();
      const result = await runTransfer(sessionId, transferId, name, 'upload', () =>
        session.sftp.upload(
          transferId,
          localPath,
          posix.join(remoteDir, name),
          reporter(sessionId, transferId, name, 'upload')
        )
      );
      if (result && result.cancelled) break;
      uploaded.push(name);
    }
    return uploaded;
  });

  handle('sftp:read-text', async (sessionId, target) => sftpOf(sessionId).sftp.readText(target));

  handle('sftp:compare-local', async (sessionId, remotePath) => {
    const session = sftpOf(sessionId);
    const name = posix.basename(remotePath);

    const picked = await dialog.showOpenDialog(mainWindow(), {
      title: `Compare "${name}" with a local file`,
      properties: ['openFile'],
      buttonLabel: 'Compare',
    });
    if (picked.canceled) return null;

    const localPath = picked.filePaths[0];
    const [remote, local] = await Promise.all([
      session.sftp.readText(remotePath),
      fs.promises.readFile(localPath, 'utf8'),
    ]);

    return {
      leftLabel: `${session.profile.name}:${remotePath}`,
      rightLabel: localPath,
      ...diffLines(remote, local),
    };
  });

  handle('sftp:compare-remote', async (sessionId, remotePath, otherSessionId, otherPath) => {
    const left = sftpOf(sessionId);
    const right = sftpOf(otherSessionId);
    const target = otherPath || remotePath;

    const [a, b] = await Promise.all([
      left.sftp.readText(remotePath),
      right.sftp.readText(target),
    ]);

    return {
      leftLabel: `${left.profile.name}:${remotePath}`,
      rightLabel: `${right.profile.name}:${target}`,
      ...diffLines(a, b),
    };
  });

  handle('sftp:reveal', async (localPath) => {
    if (!fs.existsSync(localPath)) throw new Error('That file is no longer on disk.');
    shell.showItemInFolder(localPath);
    return true;
  });
}

module.exports = { register };
