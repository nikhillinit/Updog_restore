@echo off
echo Fixing dependency conflicts...

:: Remove conflicting packages
npm uninstall typescript-eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser

:: Reinstall with compatible versions
npm install --save-dev @typescript-eslint/eslint-plugin@^5.62.0 @typescript-eslint/parser@^5.62.0 --legacy-peer-deps

:: Regenerate lock file
npm install --package-lock-only --legacy-peer-deps

echo Dependencies fixed. Commit and push the changes.