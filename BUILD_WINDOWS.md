# AS Game Hub - Windows EXE build

This package includes `.github/workflows/build-windows.yml`.

## GitHub setup

Your repository should have this structure:

```text
AS-Game-Hub/
├── app/
├── assets/
├── index.html
├── style.css
└── .github/
    └── workflows/
        └── build-windows.yml
```

The workflow builds a portable Windows EXE using the `app/package.json` build script.

### Build a release

1. Commit/push the workflow to `main`.
2. Create a tag such as `v1.0.1` and publish a GitHub Release for that tag.
3. The workflow runs on the tag and uploads the generated `.exe` to that Release.
4. You can also run the workflow manually from **Actions**, but a manual run only creates a downloadable workflow artifact; it does not publish a Release asset.

For an existing `v1.0.0` Release, the simplest test is to create a new tag/release such as `v1.0.1`.
