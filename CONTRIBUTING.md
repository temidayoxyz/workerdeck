# Contributing

WorkerDeck is early-stage infrastructure software. Changes should be small, typed, tested, and easy to
audit.

1. Use a supported Node.js release and run `npm install`.
2. Create a focused branch.
3. Run `npm run check` before opening a pull request.
4. Explain security, migration, and rollback implications in the pull request.

Never commit `.dev.vars`, API tokens, account identifiers, private repository metadata, or production
database exports.
