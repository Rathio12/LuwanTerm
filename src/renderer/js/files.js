(function (App) {
  'use strict';

  const { h, icon, iconButton, formatBytes, formatDate, joinPath, parentPath, baseName } = App.dom;

  function create(sessionId, startPath) {
    let cwd = startPath || '.';
    let selected = null;
    let entries = [];

    const pathInput = h('input', { class: 'fb__path', spellcheck: 'false', value: cwd });
    const list = h('div', { class: 'fb__list' });
    const count = h('span', { class: 'fb__count' });

    const actions = {
      download: iconButton('download', { title: 'Download', onClick: () => download() }),
      rename: iconButton('edit', { title: 'Rename', onClick: () => rename() }),
      remove: iconButton('trash', { title: 'Delete', className: 'iconbtn iconbtn--danger', onClick: () => remove() }),
    };

    const element = h('div', { class: 'fb' }, [
      h('div', { class: 'fb__bar' }, [
        iconButton('up', { title: 'Parent folder', onClick: () => navigate(parentPath(cwd)) }),
        iconButton('home', { title: 'Home', onClick: () => navigate('.') }),
        pathInput,
        iconButton('refresh', { title: 'Refresh', onClick: () => refresh() }),
      ]),
      list,
      h('div', { class: 'fb__foot' }, [
        count,
        iconButton('folder-plus', { title: 'New folder', onClick: () => makeFolder() }),
        iconButton('upload', { title: 'Upload files', onClick: () => upload() }),
        actions.download,
        actions.rename,
        actions.remove,
      ]),
    ]);

    pathInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') navigate(pathInput.value.trim() || '.');
    });

    function setSelection(entry, row) {
      selected = entry;
      for (const node of list.children) node.classList.toggle('is-selected', node === row);
      actions.download.disabled = !entry;
      actions.rename.disabled = !entry;
      actions.remove.disabled = !entry;
    }

    function render() {
      list.replaceChildren();
      setSelection(null, null);

      if (!entries.length) {
        list.append(h('div', { class: 'hint', text: 'This folder is empty.' }));
      }

      for (const entry of entries) {
        const isDir = entry.type === 'dir' || entry.linkType === 'dir';
        const row = h(
          'div',
          {
            class: `fb__row${isDir ? ' is-dir' : ''}`,
            title: `${entry.rights}  ${entry.path}`,
          },
          [
            icon(isDir ? 'folder' : 'file'),
            h('span', { class: 'fb__name', text: entry.name }),
            h('span', { class: 'fb__meta', text: isDir ? '-' : formatBytes(entry.size) }),
            h('span', { class: 'fb__meta', text: formatDate(entry.mtime) }),
          ]
        );

        row.addEventListener('click', () => setSelection(entry, row));
        row.addEventListener('dblclick', () => {
          if (isDir) navigate(entry.path);
          else download(entry);
        });
        list.append(row);
      }

      const dirs = entries.filter((entry) => entry.type === 'dir').length;
      count.textContent = `${entries.length} items - ${dirs} folders`;
    }

    async function navigate(target) {
      try {
        const result = await window.term.sftp.list(sessionId, target);
        cwd = result.path;
        entries = result.entries;
        pathInput.value = cwd;
        const session = App.state.session(sessionId);
        if (session) session.cwd = cwd;
        render();
      } catch (err) {
        App.toast.error(err.message);
        pathInput.value = cwd;
      }
    }

    const refresh = () => navigate(cwd);

    async function makeFolder() {
      const name = await App.modal.prompt({
        title: 'New folder',
        label: `Create inside ${cwd}`,
        placeholder: 'folder name',
        okLabel: 'Create',
      });
      if (!name) return;
      try {
        await window.term.sftp.mkdir(sessionId, joinPath(cwd, name));
        App.toast.ok(`Created ${name}`);
        refresh();
      } catch (err) {
        App.toast.error(err.message);
      }
    }

    async function rename() {
      if (!selected) return;
      const name = await App.modal.prompt({
        title: 'Rename',
        label: 'New name',
        value: selected.name,
        okLabel: 'Rename',
      });
      if (!name || name === selected.name) return;
      try {
        await window.term.sftp.rename(sessionId, selected.path, joinPath(cwd, name));
        refresh();
      } catch (err) {
        App.toast.error(err.message);
      }
    }

    async function remove() {
      if (!selected) return;
      const isDir = selected.type === 'dir';
      const confirmed = await App.modal.confirm({
        title: isDir ? 'Delete folder' : 'Delete file',
        message: isDir
          ? 'This deletes the folder and everything inside it on the remote host. It cannot be undone.'
          : 'This permanently deletes the file on the remote host.',
        detail: selected.path,
        confirmLabel: 'Delete',
      });
      if (!confirmed) return;

      try {
        await window.term.sftp.remove(sessionId, selected.path);
        App.toast.ok(`Deleted ${selected.name}`);
        refresh();
      } catch (err) {
        App.toast.error(err.message);
      }
    }

    async function download(entry = selected) {
      if (!entry) return;
      const isDir = entry.type === 'dir' || entry.linkType === 'dir';
      try {
        const result = await window.term.sftp.download(sessionId, entry.path, isDir);
        if (!result || result.cancelled) return;
        if (isDir) {
          const skipped = result.skipped ? `, ${result.skipped} skipped` : '';
          App.toast.ok(`Downloaded ${result.files} files from ${entry.name}${skipped}`);
        } else {
          App.toast.ok(`Saved ${baseName(result.path)}`);
        }
      } catch (err) {
        App.toast.error(err.message);
      }
    }

    async function upload() {
      try {
        const names = await window.term.sftp.upload(sessionId, cwd);
        if (names && names.length) {
          App.toast.ok(`Uploaded ${names.length} file${names.length > 1 ? 's' : ''}`);
          refresh();
        }
      } catch (err) {
        App.toast.error(err.message);
      }
    }

    setSelection(null, null);
    navigate(cwd);

    return { element, refresh, path: () => cwd };
  }

  App.files = { create };
})(window.App);
