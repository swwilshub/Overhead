# Security

Overhead is a single-page browser game. It has no server, accounts or network features. It keeps saves and settings
in your browser's local storage, and it loads web fonts from Google Fonts.

## Reporting a problem

If you find a security issue, report it privately: on the repository's **Security** tab, choose **Report a
vulnerability**. Please don't open a public issue for it.

Things worth reporting include:

- A crafted save file that, when imported, runs script or breaks out of the game.
- Anything that makes the built page load code from somewhere unexpected.
- A dependency problem that affects the built game rather than only the build or test tools.

We aim to reply within a week. Fixes go into the next release.

## Supported versions

Only the latest release, and the `main` branch, get security fixes.
