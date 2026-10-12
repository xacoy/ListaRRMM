# Lista de Reyes 👑

Lista de regalos por niño, cada uno con su ficha y su color (nombres editables, se pueden añadir más).
HTML/CSS/JS puro, sin dependencias.

## Compartir entre dos personas
Pulsa **🔗 Compartir**: se crea una lista en Firebase Realtime Database y se copia un enlace
del tipo `…/ListaRRMM/#lista=XXXX`. Quien abra ese enlace ve y edita la misma lista; los cambios se
fusionan cada pocos segundos (cada regalo/ficha/categoría tiene fecha de modificación, gana el más reciente).

- Quien tenga el enlace puede editar: no lo publiques.
- Los datos compartidos viven en Firebase (plan gratuito); haz copias con **Exportar** de vez en cuando.
- Sin compartir, los datos solo se guardan en tu navegador (localStorage).

Publicación: GitHub Pages (Settings → Pages → Deploy from branch → `main` / root).
