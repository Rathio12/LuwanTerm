# SFTP

Open the **Files** panel from the buttons top-right while a session is focused.
It runs over the same SSH connection as the terminal — no second login.

## Getting around

- **Double-click** a folder to enter it, a file to download it.
- The path bar is editable; type a path and press Enter.
- The arrow goes up a level, the house goes to your home directory.
- Symlinks are resolved, so the app knows whether one points at a folder.

## Transferring files

| Action | How |
| --- | --- |
| Upload | The upload button in the footer, pick one or more files |
| Download a file | Select it and hit download, or double-click it |
| Download a folder | Select it and hit download — pick where to put it |

Folder downloads walk the whole tree, recreate the directory structure locally,
and report overall progress with a file count. Symlinks are skipped rather than
followed, so a loop can't trap it, and you're told how many were skipped.

## Progress and cancelling

Every transfer gets a row under the terminal with a progress bar and an **X**.
Hit the X to cancel: the transfer stops, and a partially written download is
deleted rather than left as a broken file.

Each transfer runs on its own SFTP channel, so cancelling one never disturbs the
file listing or another transfer running alongside it.

## Managing files

- **New folder** — the folder-plus button
- **Rename** — select and hit the pencil
- **Delete** — select and hit the bin

Deleting a folder removes everything inside it. You're asked to confirm and
shown the full remote path first, because there is no undo on a remote machine.

## Where it opens

By default, your home directory. Set **Default SFTP path** on a host profile to
land somewhere specific — `/var/www` or wherever you actually work.

## Known limit

The file list builds one row per entry with no virtualisation. Normal
directories are fine; one with several thousand files will feel sluggish.
