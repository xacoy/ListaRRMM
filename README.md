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

## Novedades de uso
- **Resumen** con cuenta atrás hasta los Reyes (6 de enero) y lo pendiente / en camino de cada persona.
- **Ficha de la persona** (edad, tallas, gustos, qué evitar): lápiz junto a su nombre.
- **Aviso de duplicados** al añadir un regalo que ya está en otra lista (o en la misma).
- **Icono del tipo** en cada regalo (según su categoría; se puede cambiar en Menú → Categorías) y el estado a la derecha.
- **Instalable y sin conexión**: Menú → «Instalar como app». Los cambios hechos sin internet se sincronizan al volver la conexión.

Publicación: GitHub Pages (Settings → Pages → Deploy from branch → `main` / root).
