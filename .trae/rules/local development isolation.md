Local development must use separate local-only configuration files so production settings remain untouched.

### Required local files
- `.env.local`
- `docker-compose.local.yml`

### Rules
- Local files must not conflict with production files.
- Local builds must use the local versions only.
- Local files must remain untracked by git.
- Local helper files must never be committed.
- Production config and secrets must never be placed in local files.

## Git Hygiene Rule
- Add all local-only files to `.gitignore`.
- Never commit secrets, machine-specific config, or temporary overrides.
- Keep the repository clean and predictable.