// Stub for the `server-only` marker package.
//
// The real package is a build-time tripwire: its `default` export condition is
// an index.js that THROWS on import ("cannot be imported from a Client
// Component"), and only the `react-server` condition maps to an empty module.
// Next's server bundles run under that condition; Node's test runner does not,
// so without this stub every test that reaches src/lib/chatPanel/client.js —
// directly, or through a page that imports it — would die on load with the
// client-component error, about a module that is only ever imported by server
// code. The stub is the empty module the react-server condition would have
// served. It exports nothing, exactly as the real one does.
//
// This does NOT weaken the guard the package provides in the build: the build
// resolves the real package. And test/fs/chatPanelBundleGuard re-states the
// same rule at the source level so the suite reddens first.
export {};
