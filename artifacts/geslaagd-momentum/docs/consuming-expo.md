# Expo support

Geslaagd Momentum currently ships a **web-only** component and theme package.
It provides React DOM primitives, Tailwind CSS, and web font guidance for
geslaagd.app; it does not export React Native components, an Expo font hook, or
a native theme adapter.

Do not import `styles.css` or `components/ui/*` into an Expo application. If an
Expo product is introduced, create and validate a dedicated native token adapter
and component layer before treating this package as a shared mobile UI library.