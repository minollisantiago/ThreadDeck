# Discover and add projects

Open the session finder (**Ctrl+K**) or new-session picker (**Ctrl+N**), then
choose **Discover / add project…**. Browse local folders, open a repository,
and choose **Add project & start session**. A new conversation draft opens;
the first prompt creates the linked OpenCode session and Discord thread.

- Folders belong to the machine running Kimaki (WSL paths for WSL installations).
  This is not a file picker for the device displaying the dashboard.
- Starts in `~/projects`, falling back to home. Shortcuts include home and
  parent folders of registered projects. An absolute path can be entered directly.
- Git repositories are labeled and sorted first. Other folders can also be projects.
  Discovery reads one level at a time, excludes hidden folders and `node_modules`,
  and shows at most 500 folders per directory; it never recursively scans the disk.
- Adding explicitly runs `kimaki project add`, creating a Discord channel.
  Already-registered folders are reused, including symlink aliases.
  When registered projects span multiple servers, choose a server ID first.
  With no registered projects, Kimaki uses its default server selection.
- Registration is not automatically retried. If it fails or times out, use
  **Refresh folders** to check whether registration completed before trying again.
- Discovery and registration require same-origin, loopback requests. They do not
  require the chat fork, but sending the first prompt still requires its bridge.
