# Expo migration

There is no Expo migration path for Geslaagd Momentum yet. The current artifact
is intentionally web-only and has no native equivalents for its DOM components,
Tailwind theme, or web font setup.

Keep an Expo app's existing native UI system in place. If mobile becomes part of
the product scope, first build a versioned native token adapter, font-loading
strategy, and native component inventory; only then document a migration.